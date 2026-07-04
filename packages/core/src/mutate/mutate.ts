import { isValidTokenName, splitTokenPath, type DtcgTokenType } from "@okeytokey/schema";

import { TokenParseError } from "../errors.js";
import { parseTokenSet, type TokenDocument, type TokenSet } from "../parser/document.js";
import { fromPlainJson, type JsonMap, type JsonValue } from "../ordered-json/ordered-json.js";

/**
 * Persistent (immutable) mutations. Every function returns a NEW TokenSet /
 * TokenDocument; inputs are never modified. The ordered-JSON tree is the
 * source of truth, so mutations rebuild the map spine along the touched path
 * (structural sharing everywhere else) and re-run parseTokenSet, which
 * revalidates and reindexes — a mutation can therefore never produce an
 * invalid set.
 */

export class TokenMutationError extends TokenParseError {
  override readonly name = "TokenMutationError";
}

function fail(setName: string, path: string, message: string): never {
  throw new TokenMutationError(setName, [{ path, message }]);
}

/** Rebuild the spine of maps along `segments`, sharing untouched subtrees. */
function withChild(root: JsonMap, segments: readonly string[], child: JsonValue | null): JsonMap {
  const [head, ...rest] = segments;
  if (head === undefined) {
    throw new RangeError("Empty path");
  }
  const next = new Map(root);
  if (rest.length === 0) {
    if (child === null) {
      next.delete(head);
    } else {
      next.set(head, child);
    }
    return next;
  }
  const existing = root.get(head);
  const existingMap = existing instanceof Map ? existing : new Map<string, JsonValue>();
  const updated = withChild(existingMap, rest, child);
  // Prune groups emptied by a deletion (no members, no $ metadata worth keeping).
  if (child === null && updated.size === 0) {
    next.delete(head);
  } else {
    next.set(head, updated);
  }
  return next;
}

function getNode(root: JsonMap, segments: readonly string[]): JsonValue | undefined {
  let node: JsonValue | undefined = root;
  for (const segment of segments) {
    if (!(node instanceof Map)) return undefined;
    node = node.get(segment);
  }
  return node;
}

function validatePath(setName: string, path: string): string[] {
  const segments = splitTokenPath(path);
  for (const segment of segments) {
    if (!isValidTokenName(segment)) {
      fail(setName, path, `Invalid path segment ${JSON.stringify(segment)}`);
    }
  }
  return segments;
}

export interface TokenInit {
  readonly type: DtcgTokenType;
  readonly value: unknown;
  readonly description?: string;
}

/** Create a token at `path`. Fails if anything already exists there. */
export function createToken(set: TokenSet, path: string, init: TokenInit): TokenSet {
  const segments = validatePath(set.name, path);
  if (getNode(set.root, segments) !== undefined) {
    fail(set.name, path, "A token or group already exists at this path");
  }
  // A token cannot be created inside another token.
  for (let i = 1; i < segments.length; i++) {
    const ancestor = getNode(set.root, segments.slice(0, i));
    if (ancestor instanceof Map && ancestor.has("$value")) {
      fail(set.name, path, "Cannot create a token inside another token");
    }
    if (ancestor !== undefined && !(ancestor instanceof Map)) {
      fail(set.name, path, "Path passes through a non-group value");
    }
  }
  const node = new Map<string, JsonValue>([
    ["$type", init.type],
    ["$value", fromPlainJson(init.value)],
  ]);
  if (init.description !== undefined) {
    node.set("$description", init.description);
  }
  return parseTokenSet(set.name, withChild(set.root, segments, node));
}

/** Replace a token's `$value` (all other fields untouched). */
export function setTokenValue(set: TokenSet, path: string, value: unknown): TokenSet {
  const token = set.tokens.get(path);
  if (!token) {
    fail(set.name, path, "Token does not exist");
  }
  const node = new Map(token.raw);
  node.set("$value", fromPlainJson(value));
  return parseTokenSet(set.name, withChild(set.root, token.path, node));
}

export interface TokenMetaPatch {
  /** undefined = leave as-is; null = remove the field. */
  readonly type?: DtcgTokenType | null;
  readonly description?: string | null;
  readonly deprecated?: boolean | string | null;
  /** Replaces the whole com.okeytokey extension payload. */
  readonly okeytokey?: Record<string, unknown> | null;
}

/** Patch a token's `$type` / `$description` / `$deprecated` / okeytokey extension. */
export function setTokenMeta(set: TokenSet, path: string, patch: TokenMetaPatch): TokenSet {
  const token = set.tokens.get(path);
  if (!token) {
    fail(set.name, path, "Token does not exist");
  }
  const node = new Map(token.raw);
  const apply = (key: string, next: JsonValue | null | undefined) => {
    if (next === undefined) return;
    if (next === null) node.delete(key);
    else node.set(key, next);
  };
  apply("$type", patch.type);
  apply("$description", patch.description);
  apply("$deprecated", patch.deprecated);
  if (patch.okeytokey !== undefined) {
    const extensions = new Map(
      token.raw.get("$extensions") instanceof Map
        ? (token.raw.get("$extensions") as JsonMap)
        : undefined,
    );
    if (patch.okeytokey === null) {
      extensions.delete("com.okeytokey");
    } else {
      extensions.set("com.okeytokey", fromPlainJson(patch.okeytokey));
    }
    if (extensions.size === 0) node.delete("$extensions");
    else node.set("$extensions", extensions);
  }
  return parseTokenSet(set.name, withChild(set.root, token.path, node));
}

/** Delete a token, pruning any groups left empty. */
export function deleteToken(set: TokenSet, path: string): TokenSet {
  const token = set.tokens.get(path);
  if (!token) {
    fail(set.name, path, "Token does not exist");
  }
  return parseTokenSet(set.name, withChild(set.root, token.path, null));
}

/** Set (or overwrite) a group's `$type` / `$description`. */
export function setGroupMeta(
  set: TokenSet,
  path: string,
  patch: { type?: DtcgTokenType | null; description?: string | null },
): TokenSet {
  const segments = validatePath(set.name, path);
  const node = getNode(set.root, segments);
  if (!(node instanceof Map) || node.has("$value")) {
    fail(set.name, path, "Group does not exist");
  }
  const next = new Map(node);
  if (patch.type !== undefined) {
    if (patch.type === null) next.delete("$type");
    else next.set("$type", patch.type);
  }
  if (patch.description !== undefined) {
    if (patch.description === null) next.delete("$description");
    else next.set("$description", patch.description);
  }
  return parseTokenSet(set.name, withChild(set.root, segments, next));
}

/**
 * Recursively order a group's children by name, keeping `$`-metadata keys
 * ($type, $description…) in front and in their original order. Names sort
 * naturally so scale steps read 50, 100, 500 (not 100, 50, 500) and words
 * sort alphabetically. Token nodes (all-`$` keys) are left exactly as-is.
 */
function sortNode(node: JsonMap): JsonMap {
  const meta: [string, JsonValue][] = [];
  const children: [string, JsonValue][] = [];
  for (const [key, value] of node) {
    if (key.startsWith("$")) {
      meta.push([key, value]);
    } else {
      children.push([key, value instanceof Map ? sortNode(value) : value]);
    }
  }
  children.sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true, sensitivity: "base" }));
  return new Map([...meta, ...children]);
}

/** Sort every group's members by name, recursively. Values are untouched. */
export function sortTokenSet(set: TokenSet): TokenSet {
  return parseTokenSet(set.name, sortNode(set.root));
}

// ---------------------------------------------------------------------------
// Document-level operations
// ---------------------------------------------------------------------------

/** Replace one set within a document (matched by name). */
export function withSet(document: TokenDocument, set: TokenSet): TokenDocument {
  if (!document.sets.has(set.name)) {
    fail(set.name, "", "Set does not exist in the document");
  }
  const sets = new Map(document.sets);
  sets.set(set.name, set);
  return { sets };
}

/** Append a new (empty or parsed) set. */
export function addSet(document: TokenDocument, set: TokenSet): TokenDocument {
  if (document.sets.has(set.name)) {
    fail(set.name, "", "A set with this name already exists");
  }
  const sets = new Map(document.sets);
  sets.set(set.name, set);
  return { sets };
}

export function removeSet(document: TokenDocument, name: string): TokenDocument {
  if (!document.sets.has(name)) {
    fail(name, "", "Set does not exist");
  }
  const sets = new Map(document.sets);
  sets.delete(name);
  return { sets };
}

/** Rename a set, preserving document order. */
export function renameSet(document: TokenDocument, from: string, to: string): TokenDocument {
  const existing = document.sets.get(from);
  if (!existing) {
    fail(from, "", "Set does not exist");
  }
  if (from !== to && document.sets.has(to)) {
    fail(to, "", "A set with this name already exists");
  }
  const sets = new Map<string, TokenSet>();
  for (const [name, set] of document.sets) {
    if (name === from) {
      sets.set(to, { ...existing, name: to });
    } else {
      sets.set(name, set);
    }
  }
  return { sets };
}

/** An empty set, for "create set" flows. */
export function emptySet(name: string): TokenSet {
  return parseTokenSet(name, new Map());
}
