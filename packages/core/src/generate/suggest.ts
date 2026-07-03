import type { TokenDocument, TokenSet } from "../parser/document.js";
import { parseQuantity, formatQuantity } from "../resolver/expression.js";
import { planColorScale } from "./scale.js";

/**
 * Deterministic value suggestions for token creation ("if it can be
 * computed, compute it" — ADR 0006). Everything here derives from what is
 * already in the document: scale positions come from the group's anchors,
 * quantity steps from the group's progression. Same document, same
 * suggestions.
 */

export interface ValueSuggestion {
  readonly value: string;
  /** Why this value, in user-facing words. */
  readonly reason: string;
}

/**
 * Suggest a color for a numeric scale position: exactly what the Scale
 * Generator would put at that step, given the group's existing anchors.
 */
function scaleFitSuggestion(
  document: TokenDocument,
  setName: string,
  path: string,
): ValueSuggestion | undefined {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return undefined;
  const step = Number(path.slice(lastDot + 1));
  if (!Number.isInteger(step) || step <= 0) return undefined;
  try {
    const plan = planColorScale(document, setName, path.slice(0, lastDot), { steps: [step] });
    const entry = plan.generated.find((candidate) => candidate.step === step);
    if (!entry) return undefined;
    return {
      value: entry.value,
      reason: `fits the ${path.slice(0, lastDot)} scale at ${String(step)}`,
    };
  } catch {
    return undefined; // no usable anchors — not a scale position
  }
}

/**
 * Deterministic color suggestions for creating `path` in `setName`. Only
 * scale-fit values are offered — a color that completes an existing ramp is
 * computable; inventing an arbitrary new brand hue is a design decision, not
 * a computation, so we don't suggest one.
 */
export function suggestColors(
  document: TokenDocument,
  setName: string,
  path: string,
): ValueSuggestion[] {
  if (!document.sets.has(setName)) return [];
  const scaleFit = scaleFitSuggestion(document, setName, path);
  return scaleFit ? [scaleFit] : [];
}

/**
 * Suggest next values for a quantity group (dimension/duration): continue
 * the progression (geometric when the ratios agree, arithmetic otherwise)
 * and fill the largest interior gap.
 */
export function suggestQuantitySteps(set: TokenSet, groupPath: string): ValueSuggestion[] {
  const prefix = groupPath === "" ? "" : `${groupPath}.`;
  const unitCounts = new Map<string, number>();
  const values: number[] = [];
  const quantities: { value: number; unit: string }[] = [];
  for (const token of set.tokens.values()) {
    if (prefix !== "" && !token.pathString.startsWith(prefix)) continue;
    if (token.type !== "dimension" && token.type !== "duration") continue;
    if (typeof token.value !== "string") continue;
    const quantity = parseQuantity(token.value);
    if (!quantity || quantity.unit === "") continue;
    quantities.push(quantity);
    unitCounts.set(quantity.unit, (unitCounts.get(quantity.unit) ?? 0) + 1);
  }
  if (quantities.length < 2) return [];

  // Work in the group's dominant unit only.
  const [unit] = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [""];
  for (const quantity of quantities) {
    if (quantity.unit === unit) values.push(quantity.value);
  }
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length < 2) return [];

  const round = (value: number) => Math.round(value * 1000) / 1000;
  const suggestions: ValueSuggestion[] = [];

  const last = sorted[sorted.length - 1] ?? 0;
  const secondLast = sorted[sorted.length - 2] ?? 0;
  const ratios = sorted.slice(1).map((value, index) => value / (sorted[index] ?? 1));
  const geometric =
    sorted.length >= 3 &&
    ratios.every((ratio) => Math.abs(ratio - (ratios[0] ?? 1)) < 0.01) &&
    (ratios[0] ?? 1) > 1;
  const next = geometric ? last * (ratios[0] ?? 2) : last + (last - secondLast);
  if (next > last) {
    suggestions.push({
      value: formatQuantity({ value: round(next), unit }),
      reason: geometric ? "continues the ×-scale" : "continues the progression",
    });
  }

  // Largest interior gap, if it's wider than the group's typical step.
  let gapAt = -1;
  let gapSize = 0;
  sorted.slice(1).forEach((value, index) => {
    const size = value - (sorted[index] ?? 0);
    if (size > gapSize) {
      gapSize = size;
      gapAt = index;
    }
  });
  const typicalStep = (last - (sorted[0] ?? 0)) / (sorted.length - 1);
  if (gapAt >= 0 && gapSize > typicalStep * 1.5) {
    const midpoint = round((sorted[gapAt] ?? 0) + gapSize / 2);
    if (!sorted.includes(midpoint)) {
      suggestions.push({
        value: formatQuantity({ value: midpoint, unit }),
        reason: "fills the largest gap",
      });
    }
  }

  return suggestions;
}
