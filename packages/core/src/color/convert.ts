import { TokenParseError } from "../errors.js";
import { setTokenValue, withSet } from "../mutate/mutate.js";
import type { TokenDocument } from "../parser/document.js";
import { formatColor, isColor, parseColor, type ColorSpace } from "./color.js";

/**
 * Batch color-format conversion: rewrite every concrete color literal in a
 * group to one syntax (hex, rgb, oklch, …). Deterministic — the values are
 * unchanged, only their notation. References, math, and color functions are
 * left alone: their notation belongs to their source.
 */

export interface FormatConversionEntry {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

export interface FormatConversionPlan {
  readonly setName: string;
  readonly groupPath: string;
  readonly format: ColorSpace;
  /** Tokens whose notation will change (already-matching ones are omitted). */
  readonly entries: readonly FormatConversionEntry[];
  readonly apply: () => TokenDocument;
}

class FormatError extends TokenParseError {
  override readonly name = "FormatError";
}

/**
 * Plan converting the direct and nested color literals under `groupPath`
 * (or the whole set when `groupPath` is "") to `format`.
 */
export function planColorFormatConversion(
  document: TokenDocument,
  setName: string,
  groupPath: string,
  format: ColorSpace,
): FormatConversionPlan {
  const set = document.sets.get(setName);
  if (!set) {
    throw new FormatError(setName, [{ path: "", message: "Set does not exist" }]);
  }

  const prefix = groupPath === "" ? "" : `${groupPath}.`;
  const entries: FormatConversionEntry[] = [];
  for (const token of set.tokens.values()) {
    if (prefix !== "" && !token.pathString.startsWith(prefix)) continue;
    if (token.type !== "color") continue;
    const raw = token.value;
    // Concrete literals only — skip references/expressions/color functions.
    if (typeof raw !== "string" || !isColor(raw)) continue;
    const after = formatColor(parseColor(raw), format);
    if (after !== raw) {
      entries.push({ path: token.pathString, before: raw, after });
    }
  }

  const apply = (): TokenDocument => {
    let nextSet = set;
    for (const entry of entries) {
      nextSet = setTokenValue(nextSet, entry.path, entry.after);
    }
    return withSet(document, nextSet);
  };

  return { setName, groupPath, format, entries, apply };
}
