import {
  createToken,
  deleteToken,
  emptySet,
  setTokenMeta,
  setTokenValue,
  withSet,
  addSet,
  type TokenDocument,
  type TokenNode,
  type TokenSet,
} from "@okeytokey/core";

/**
 * Three-way semantic merge at token level (not line level). For every token
 * path in every set: if ours and theirs agree, take it; if only one side
 * changed from base, take that side; if both changed differently, it's a
 * conflict for the user to pick. See ADR 0004.
 */

export interface MergeConflict {
  readonly setName: string;
  readonly path: string;
  readonly base: unknown;
  readonly ours: unknown;
  readonly theirs: unknown;
}

export interface MergeResult {
  readonly document: TokenDocument;
  readonly conflicts: readonly MergeConflict[];
}

/** Token identity for comparison: value + the metadata that matters. */
function snapshot(token: TokenNode | undefined): string | undefined {
  if (!token) return undefined;
  return JSON.stringify({
    type: token.type,
    value: token.value,
    description: token.description,
    deprecated: token.deprecated,
    okeytokey: token.okeytokey,
  });
}

function applyToken(set: TokenSet, path: string, token: TokenNode): TokenSet {
  let next = set.tokens.has(path)
    ? setTokenValue(set, path, token.value)
    : createToken(set, path, { type: token.type, value: token.value });
  next = setTokenMeta(next, path, {
    description: token.description ?? null,
    deprecated: token.deprecated ?? null,
    okeytokey: token.okeytokey ?? null,
  });
  return next;
}

function mergeSet(
  setName: string,
  base: TokenSet | undefined,
  ours: TokenSet | undefined,
  theirs: TokenSet | undefined,
): { set: TokenSet; conflicts: MergeConflict[] } {
  const conflicts: MergeConflict[] = [];
  // Start from ours (keeps our group structure/order); fall back sensibly.
  let merged = ours ?? theirs ?? base ?? emptySet(setName);

  const paths = new Set<string>([
    ...(base?.tokens.keys() ?? []),
    ...(ours?.tokens.keys() ?? []),
    ...(theirs?.tokens.keys() ?? []),
  ]);

  for (const path of paths) {
    const baseToken = base?.tokens.get(path);
    const ourToken = ours?.tokens.get(path);
    const theirToken = theirs?.tokens.get(path);
    const baseSnap = snapshot(baseToken);
    const ourSnap = snapshot(ourToken);
    const theirSnap = snapshot(theirToken);

    if (ourSnap === theirSnap) continue; // agree (both changed same / both deleted)
    if (theirSnap === baseSnap) continue; // only we changed — keep ours
    if (ourSnap === baseSnap) {
      // Only they changed — take theirs (edit or delete).
      if (theirToken) {
        merged = applyToken(merged, path, theirToken);
      } else if (merged.tokens.has(path)) {
        merged = deleteToken(merged, path);
      }
      continue;
    }
    // Both changed, differently: conflict. Keep ours in the merged doc; the
    // UI resolves per token.
    conflicts.push({
      setName,
      path,
      base: baseToken?.value,
      ours: ourToken?.value,
      theirs: theirToken?.value,
    });
  }

  return { set: merged, conflicts };
}

export function mergeDocuments(
  base: TokenDocument,
  ours: TokenDocument,
  theirs: TokenDocument,
): MergeResult {
  const conflicts: MergeConflict[] = [];
  const setNames = new Set<string>([
    ...base.sets.keys(),
    ...ours.sets.keys(),
    ...theirs.sets.keys(),
  ]);

  let document: TokenDocument = { sets: new Map() };
  for (const name of setNames) {
    const baseSet = base.sets.get(name);
    const ourSet = ours.sets.get(name);
    const theirSet = theirs.sets.get(name);

    // Set-level deletions: deleted on one side and untouched on the other.
    if (!ourSet && baseSet && theirSet && setUnchanged(baseSet, theirSet)) continue;
    if (!theirSet && baseSet && ourSet && setUnchanged(baseSet, ourSet)) continue;

    const { set, conflicts: setConflicts } = mergeSet(name, baseSet, ourSet, theirSet);
    document = addSet(document, set);
    conflicts.push(...setConflicts);
  }

  return { document, conflicts };
}

function setUnchanged(a: TokenSet, b: TokenSet): boolean {
  if (a.tokens.size !== b.tokens.size) return false;
  for (const [path, token] of a.tokens) {
    if (snapshot(token) !== snapshot(b.tokens.get(path))) return false;
  }
  return true;
}

/** Resolve one conflict in a merged document by picking a side's value. */
export function resolveConflict(
  document: TokenDocument,
  conflict: MergeConflict,
  pick: "ours" | "theirs",
): TokenDocument {
  const set = document.sets.get(conflict.setName);
  if (!set) return document;
  const value = pick === "ours" ? conflict.ours : conflict.theirs;
  if (value === undefined) {
    return set.tokens.has(conflict.path)
      ? withSet(document, deleteToken(set, conflict.path))
      : document;
  }
  return withSet(document, setTokenValue(set, conflict.path, value));
}
