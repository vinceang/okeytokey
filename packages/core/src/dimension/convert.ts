import { TokenParseError } from "../errors.js";
import { setTokenValue, withSet } from "../mutate/mutate.js";
import type { TokenDocument } from "../parser/document.js";
import { formatQuantity, parseQuantity } from "../resolver/expression.js";

/**
 * Batch dimension-unit conversion (px ↔ rem). Unlike color notation this is
 * not pure syntax: it needs a conversion base — the CSS root font size,
 * 16px by convention. References and math expressions are left alone: a
 * group converted together stays consistent under the unit algebra
 * (px + rem never mix in expressions).
 */

export type DimensionUnit = "px" | "rem";

export const REM_BASE_PX = 16;

export interface UnitConversionEntry {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

export interface UnitConversionPlan {
  readonly setName: string;
  readonly groupPath: string;
  readonly unit: DimensionUnit;
  readonly basePx: number;
  /** Tokens whose unit will change (already-matching ones are omitted). */
  readonly entries: readonly UnitConversionEntry[];
  readonly apply: () => TokenDocument;
}

class UnitError extends TokenParseError {
  override readonly name = "UnitError";
}

/** Round away float noise (10/16 = 0.625 stays exact; thirds get 6 digits). */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Convert one concrete dimension literal, or return undefined to skip it. */
export function convertDimensionLiteral(
  raw: string,
  unit: DimensionUnit,
  basePx: number = REM_BASE_PX,
): string | undefined {
  const quantity = parseQuantity(raw);
  if (!quantity || (quantity.unit !== "px" && quantity.unit !== "rem")) return undefined;
  if (quantity.unit === unit) return raw;
  const value = unit === "rem" ? round(quantity.value / basePx) : round(quantity.value * basePx);
  return formatQuantity({ value, unit });
}

/**
 * Plan converting the concrete dimension literals under `groupPath` (or the
 * whole set when `groupPath` is "") to `unit`, at `basePx` per rem.
 */
export function planDimensionUnitConversion(
  document: TokenDocument,
  setName: string,
  groupPath: string,
  unit: DimensionUnit,
  basePx: number = REM_BASE_PX,
): UnitConversionPlan {
  const set = document.sets.get(setName);
  if (!set) {
    throw new UnitError(setName, [{ path: "", message: "Set does not exist" }]);
  }

  const prefix = groupPath === "" ? "" : `${groupPath}.`;
  const entries: UnitConversionEntry[] = [];
  for (const token of set.tokens.values()) {
    if (prefix !== "" && !token.pathString.startsWith(prefix)) continue;
    if (token.type !== "dimension") continue;
    const raw = token.value;
    // Concrete literals only — skip references/expressions/object form.
    if (typeof raw !== "string") continue;
    const after = convertDimensionLiteral(raw, unit, basePx);
    if (after !== undefined && after !== raw) {
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

  return { setName, groupPath, unit, basePx, entries, apply };
}
