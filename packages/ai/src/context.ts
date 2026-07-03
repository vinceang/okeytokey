import {
  createResolver,
  extractReferences,
  serializeOrderedJson,
  fromPlainJson,
  type TokenDocument,
} from "@okeytokey/core";

/**
 * Context assembly foundation: never send the whole document by default.
 * A context package carries the selected subtree plus the primitives its
 * aliases depend on — enough for the model to reason, small enough for
 * local models.
 */

export interface TaskContext {
  /** Selected tokens: path -> { set, type, value } (raw values, refs intact). */
  readonly tokens: readonly { path: string; set: string; type: string; value: unknown }[];
  /** Referenced tokens pulled in so aliases are understandable. */
  readonly referenced: readonly { path: string; set: string; type: string; value: unknown }[];
  /** Set names in document order (for the model to target operations). */
  readonly sets: readonly string[];
  /** Compact JSON rendering, ready to embed in a prompt. */
  readonly rendered: string;
}

/**
 * Assemble context for the tokens under `pathPrefixes` (a whole group via
 * "colors.blue", or single tokens). Direct references are followed one level
 * — enough to explain aliases without dragging the document along.
 */
export function assembleContext(
  document: TokenDocument,
  pathPrefixes: readonly string[],
): TaskContext {
  const resolver = createResolver(document);

  const ownerOf = (path: string): string | undefined => {
    let owner: string | undefined;
    for (const [name, set] of document.sets) {
      if (set.tokens.has(path)) owner = name;
    }
    return owner;
  };

  const matches = (path: string) =>
    pathPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));

  const tokens: TaskContext["tokens"][number][] = [];
  const referencedPaths = new Set<string>();
  for (const path of resolver.visiblePaths()) {
    if (!matches(path)) continue;
    const token = resolver.lookup(path);
    const set = ownerOf(path);
    if (!token || set === undefined) continue;
    tokens.push({ path, set, type: token.type, value: token.value });
    for (const reference of extractReferences(token.value)) {
      if (!matches(reference)) referencedPaths.add(reference);
    }
  }

  const referenced: TaskContext["referenced"][number][] = [];
  for (const path of referencedPaths) {
    const token = resolver.lookup(path);
    const set = ownerOf(path);
    if (!token || set === undefined) continue;
    referenced.push({ path, set, type: token.type, value: token.value });
  }

  const rendered = serializeOrderedJson(
    fromPlainJson({
      selection: Object.fromEntries(
        tokens.map((token) => [
          token.path,
          { set: token.set, type: token.type, value: token.value },
        ]),
      ),
      referenced: Object.fromEntries(
        referenced.map((token) => [
          token.path,
          { set: token.set, type: token.type, value: token.value },
        ]),
      ),
      sets: [...document.sets.keys()],
    }),
    0,
  );

  return { tokens, referenced, sets: [...document.sets.keys()], rendered };
}
