import { clampChroma, converter, formatHex } from "culori";

import { isColor, parseColor } from "../color/color.js";
import type { TokenDocument, TokenSet } from "../parser/document.js";
import { parseQuantity, formatQuantity } from "../resolver/expression.js";
import { planColorScale } from "./scale.js";

/**
 * Deterministic value suggestions for token creation ("if it can be
 * computed, compute it" — ADR 0006). Everything here derives from what is
 * already in the document: scale positions come from the group's anchors,
 * new hues from the gaps in the set's existing palette, quantity steps
 * from the group's progression. Same document, same suggestions.
 */

const toOklch = converter("oklch");

export interface ValueSuggestion {
  readonly value: string;
  /** Why this value, in user-facing words. */
  readonly reason: string;
}

/** Chroma below this reads as neutral — excluded from hue-gap analysis. */
const NEUTRAL_CHROMA = 0.05;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const low = sorted[mid - 1];
  const high = sorted[mid];
  if (sorted.length % 2 === 0 && low !== undefined && high !== undefined) {
    return (low + high) / 2;
  }
  return sorted[mid] ?? 0;
}

/** Every concrete color literal in the set, as OKLCH. */
function paletteOf(set: TokenSet) {
  const colors: { l: number; c: number; h: number; hex: string }[] = [];
  for (const token of set.tokens.values()) {
    if (token.type !== "color") continue;
    const raw = token.value;
    if (typeof raw !== "string" || !isColor(raw)) continue;
    const oklch = toOklch(parseColor(raw).color);
    colors.push({
      l: oklch.l,
      c: oklch.c,
      h: oklch.h ?? 0,
      hex: formatHex(parseColor(raw).color),
    });
  }
  return colors;
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
 * Suggest hues the palette does not have: midpoints of the largest gaps on
 * the hue wheel, rendered at the palette's median lightness and chroma.
 */
function hueGapSuggestions(set: TokenSet, count: number): ValueSuggestion[] {
  const chromatic = paletteOf(set).filter((color) => color.c >= NEUTRAL_CHROMA);
  if (chromatic.length === 0) return [];

  const hues = [...new Set(chromatic.map((color) => Math.round(color.h)))].sort((a, b) => a - b);
  const l = median(chromatic.map((color) => color.l));
  const c = median(chromatic.map((color) => color.c));

  // Circular gaps between neighboring hues (single hue: the whole wheel).
  const gaps = hues.map((hue, index) => {
    const next = hues[(index + 1) % hues.length] ?? hue;
    const size = index === hues.length - 1 ? 360 - hue + next : next - hue;
    return { from: hue, size };
  });
  gaps.sort((a, b) => b.size - a.size);

  const existing = new Set(paletteOf(set).map((color) => color.hex));
  const suggestions: ValueSuggestion[] = [];
  for (const gap of gaps.slice(0, count)) {
    if (gap.size < 60) continue; // palette already covers the wheel densely
    const hue = (gap.from + gap.size / 2) % 360;
    const fitted = clampChroma({ mode: "oklch", l, c, h: hue }, "oklch");
    const hex = formatHex(fitted);
    if (existing.has(hex)) continue;
    suggestions.push({
      value: hex,
      reason: `a hue this set doesn't use yet (~${String(Math.round(hue))}°)`,
    });
  }
  return suggestions;
}

/** Deterministic color suggestions for creating `path` in `setName`. */
export function suggestColors(
  document: TokenDocument,
  setName: string,
  path: string,
): ValueSuggestion[] {
  const set = document.sets.get(setName);
  if (!set) return [];
  const suggestions: ValueSuggestion[] = [];
  const scaleFit = scaleFitSuggestion(document, setName, path);
  if (scaleFit) suggestions.push(scaleFit);
  suggestions.push(...hueGapSuggestions(set, scaleFit ? 2 : 3));
  return suggestions;
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
