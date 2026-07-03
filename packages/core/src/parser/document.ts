import {
  OKEYTOKEY_EXTENSION_NAMESPACE,
  isDtcgTokenType,
  joinTokenPath,
  okeytokeyExtensionSchema,
  safeParseTokenFile,
  type DtcgTokenType,
  type OkeytokeyExtension,
} from "@okeytokey/schema";

import { TokenParseError } from "../errors.js";
import {
  parseOrderedJson,
  serializeOrderedJson,
  toPlainJson,
  type JsonMap,
  type JsonValue,
} from "../ordered-json/ordered-json.js";

/**
 * The immutable document model. The ordered-JSON tree (`raw`) is the source
 * of truth — serialization reads from it, so round-tripping is lossless by
 * construction (key order and unknown fields never leave the tree). The
 * indexed `tokens` map is a read-optimized view for the resolver and UI.
 */

export interface TokenNode {
  readonly kind: "token";
  readonly name: string;
  /** Path segments within the set. */
  readonly path: readonly string[];
  /** Dot-joined path — the string used in references. */
  readonly pathString: string;
  /** Effective $type (own or inherited from the nearest ancestor group). */
  readonly type: DtcgTokenType;
  /** Whether $type was declared on the token itself. */
  readonly ownType: boolean;
  /** Plain-JSON $value, exactly as written (references/expressions intact). */
  readonly value: unknown;
  readonly description: string | undefined;
  readonly deprecated: boolean | string | undefined;
  /** Parsed com.okeytokey extension metadata, if present and valid. */
  readonly okeytokey: OkeytokeyExtension | undefined;
  /** The underlying ordered-JSON node. Do not mutate. */
  readonly raw: JsonMap;
}

export interface TokenSet {
  readonly name: string;
  /** The ordered-JSON root — source of truth for serialization. */
  readonly root: JsonMap;
  /** Every token in the set, keyed by dot-joined path, in document order. */
  readonly tokens: ReadonlyMap<string, TokenNode>;
}

export interface TokenDocument {
  /** Sets in document order (insertion order = declared order). */
  readonly sets: ReadonlyMap<string, TokenSet>;
}

function expectMap(value: JsonValue | undefined): JsonMap | undefined {
  return value instanceof Map ? value : undefined;
}

function readOkeytokeyExtension(node: JsonMap): OkeytokeyExtension | undefined {
  const extensions = expectMap(node.get("$extensions"));
  if (!extensions) return undefined;
  const ours = extensions.get(OKEYTOKEY_EXTENSION_NAMESPACE);
  if (ours === undefined) return undefined;
  const result = okeytokeyExtensionSchema.safeParse(toPlainJson(ours));
  return result.success ? result.data : undefined;
}

function indexTokens(root: JsonMap): Map<string, TokenNode> {
  const tokens = new Map<string, TokenNode>();

  const walk = (
    node: JsonMap,
    segments: readonly string[],
    inheritedType: DtcgTokenType | undefined,
  ): void => {
    const rawType = node.get("$type");
    const ownType = typeof rawType === "string" && isDtcgTokenType(rawType) ? rawType : undefined;
    const effectiveType = ownType ?? inheritedType;

    if (node.has("$value")) {
      // Schema validation (done before indexing) guarantees effectiveType.
      if (effectiveType === undefined) return;
      const description = node.get("$description");
      const deprecated = node.get("$deprecated");
      const pathString = joinTokenPath(segments);
      tokens.set(pathString, {
        kind: "token",
        name: segments[segments.length - 1] ?? "",
        path: segments,
        pathString,
        type: effectiveType,
        ownType: ownType !== undefined,
        value: toPlainJson(node.get("$value") ?? null),
        description: typeof description === "string" ? description : undefined,
        deprecated:
          typeof deprecated === "boolean" || typeof deprecated === "string"
            ? deprecated
            : undefined,
        okeytokey: readOkeytokeyExtension(node),
        raw: node,
      });
      return;
    }

    for (const [key, child] of node) {
      if (key.startsWith("$")) continue;
      const childMap = expectMap(child);
      if (childMap) {
        walk(childMap, [...segments, key], effectiveType);
      }
    }
  };

  walk(root, [], undefined);
  return tokens;
}

/**
 * Parse a token set from JSON text (preferred — preserves exact key order) or
 * from an already-parsed ordered-JSON tree. Validates against the DTCG schema
 * and throws {@link TokenParseError} with every issue on failure.
 */
export function parseTokenSet(name: string, source: string | JsonMap): TokenSet {
  let root: JsonMap;
  if (typeof source === "string") {
    const parsed = parseOrderedJson(source);
    if (!(parsed instanceof Map)) {
      throw new TokenParseError(name, [{ path: "", message: "Token file must be a JSON object" }]);
    }
    root = parsed;
  } else {
    root = source;
  }

  const validation = safeParseTokenFile(toPlainJson(root));
  if (!validation.success) {
    throw new TokenParseError(name, validation.issues);
  }

  return { name, root, tokens: indexTokens(root) };
}

/** Serialize a set back to JSON text. Lossless: reads from the raw tree. */
export function serializeTokenSet(set: TokenSet, indentWidth = 2): string {
  return serializeOrderedJson(set.root, indentWidth);
}

/** Build a document from sets; order of the array is document order. */
export function createTokenDocument(sets: readonly TokenSet[]): TokenDocument {
  const map = new Map<string, TokenSet>();
  for (const set of sets) {
    if (map.has(set.name)) {
      throw new TokenParseError(set.name, [
        { path: "", message: `Duplicate token set name ${JSON.stringify(set.name)}` },
      ]);
    }
    map.set(set.name, set);
  }
  return { sets: map };
}

/**
 * Look up a token by path. `setOrder` gives precedence: later sets win
 * (theme semantics — overrides come after sources). Defaults to document
 * order over all sets.
 */
export function getToken(
  document: TokenDocument,
  path: string,
  setOrder?: readonly string[],
): TokenNode | undefined {
  const names = setOrder ?? [...document.sets.keys()];
  for (let i = names.length - 1; i >= 0; i--) {
    const name = names[i];
    if (name === undefined) continue;
    const token = document.sets.get(name)?.tokens.get(path);
    if (token) return token;
  }
  return undefined;
}
