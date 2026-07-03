import {
  clampChroma,
  converter,
  formatCss,
  formatHex,
  formatHex8,
  formatRgb,
  inGamut,
  interpolate,
  parse as parseCulori,
  type Color as CuloriColor,
} from "culori";

import { ColorError } from "../errors.js";

/**
 * The color engine, backed by culori. Parses hex/rgb/hsl/oklch/oklab/
 * display-p3 (any CSS color string culori understands), converts between
 * spaces, applies modification functions, and warns when a color exceeds the
 * sRGB gamut.
 */

export type ColorSpace = "hex" | "rgb" | "hsl" | "oklch" | "oklab" | "display-p3";

export interface ParsedColor {
  /** The culori color object (mode + channels). */
  readonly color: CuloriColor;
  /** The original input string. */
  readonly input: string;
}

/** Parse any supported CSS color string. Throws {@link ColorError}. */
export function parseColor(input: string): ParsedColor {
  const color = parseCulori(input.trim());
  if (!color) {
    throw new ColorError("Unrecognized color", input);
  }
  return { color, input };
}

/** True if the string parses as a color. */
export function isColor(input: string): boolean {
  return parseCulori(input.trim()) !== undefined;
}

/**
 * True if the color fits in the sRGB gamut. Colors authored in oklch or
 * display-p3 can exceed it; exporters targeting sRGB will clip them.
 */
export function isInSrgbGamut(parsed: ParsedColor): boolean {
  return inGamut("rgb")(parsed.color);
}

export interface GamutWarning {
  readonly input: string;
  readonly message: string;
  /** The color gamut-mapped into sRGB (CSS oklch string), for previews. */
  readonly srgbFallback: string;
}

/** A warning when the color exceeds sRGB, or undefined when it fits. */
export function gamutWarning(parsed: ParsedColor): GamutWarning | undefined {
  if (isInSrgbGamut(parsed)) return undefined;
  return {
    input: parsed.input,
    message: `Color ${JSON.stringify(parsed.input)} is outside the sRGB gamut and will be clipped on sRGB displays`,
    srgbFallback: formatCss(clampChroma(parsed.color, "oklch")),
  };
}

const toRgb = converter("rgb");
const toHsl = converter("hsl");
const toOklch = converter("oklch");
const toOklab = converter("oklab");
const toP3 = converter("p3");

/** Serialize to a target space. Hex drops alpha only when alpha is 1. */
export function formatColor(parsed: ParsedColor, space: ColorSpace): string {
  const { color } = parsed;
  switch (space) {
    case "hex":
      return (color.alpha ?? 1) < 1 ? formatHex8(color) : formatHex(color);
    case "rgb":
      return formatRgb(toRgb(color));
    case "hsl":
      return formatCss(toHsl(color));
    case "oklch":
      return formatCss(toOklch(color));
    case "oklab":
      return formatCss(toOklab(color));
    case "display-p3":
      return formatCss(toP3(color));
  }
}

// ---------------------------------------------------------------------------
// Modification functions (resolver-level operations)
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Lighten by `amount` (0-1) in OKLCH — perceptually uniform. */
export function lighten(parsed: ParsedColor, amount: number): ParsedColor {
  const oklch = toOklch(parsed.color);
  return { color: { ...oklch, l: clamp01(oklch.l + amount) }, input: parsed.input };
}

/** Darken by `amount` (0-1) in OKLCH. */
export function darken(parsed: ParsedColor, amount: number): ParsedColor {
  return lighten(parsed, -amount);
}

/** Set the alpha channel (0-1). */
export function alpha(parsed: ParsedColor, value: number): ParsedColor {
  return { color: { ...parsed.color, alpha: clamp01(value) }, input: parsed.input };
}

/** Mix two colors in OKLAB (perceptually uniform), `ratio` toward `other`. */
export function mix(parsed: ParsedColor, other: ParsedColor, ratio: number): ParsedColor {
  const mixed = interpolate([parsed.color, other.color], "oklab")(clamp01(ratio));
  return { color: mixed, input: parsed.input };
}

// ---------------------------------------------------------------------------
// Color function expressions (resolver-level)
// ---------------------------------------------------------------------------

const COLOR_FUNCTION_PATTERN = /^(lighten|darken|alpha|mix)\(/;

/** True if the string is a color function call like "lighten(#3b82f6, 0.1)". */
export function isColorFunction(text: string): boolean {
  return COLOR_FUNCTION_PATTERN.test(text.trim());
}

/** Split top-level comma-separated arguments (nested parens stay intact). */
function splitArgs(text: string, whole: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth < 0) throw new ColorError("Unbalanced parentheses", whole);
    } else if (char === "," && depth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (depth !== 0) throw new ColorError("Unbalanced parentheses", whole);
  args.push(text.slice(start).trim());
  return args;
}

function evaluateColorArg(text: string, whole: string): ParsedColor {
  return isColorFunction(text) ? evaluateColorFunctionInner(text, whole) : parseColor(text);
}

function parseAmount(text: string, whole: string): number {
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new ColorError(`Expected a number, got ${JSON.stringify(text)}`, whole);
  }
  return value;
}

function evaluateColorFunctionInner(text: string, whole: string): ParsedColor {
  const trimmed = text.trim();
  const match = COLOR_FUNCTION_PATTERN.exec(trimmed);
  if (!match?.[1] || !trimmed.endsWith(")")) {
    throw new ColorError("Malformed color function", whole);
  }
  const name = match[1];
  const args = splitArgs(trimmed.slice(match[0].length, -1), whole);

  switch (name) {
    case "lighten":
    case "darken":
    case "alpha": {
      if (args.length !== 2 || args[0] === undefined || args[1] === undefined) {
        throw new ColorError(`${name}() takes (color, amount)`, whole);
      }
      const color = evaluateColorArg(args[0], whole);
      const amount = parseAmount(args[1], whole);
      if (name === "lighten") return lighten(color, amount);
      if (name === "darken") return darken(color, amount);
      return alpha(color, amount);
    }
    case "mix": {
      const [first, second, ratio] = args;
      if (args.length !== 3 || first === undefined || second === undefined || ratio === undefined) {
        throw new ColorError("mix() takes (color, color, ratio)", whole);
      }
      return mix(
        evaluateColorArg(first, whole),
        evaluateColorArg(second, whole),
        parseAmount(ratio, whole),
      );
    }
    default:
      throw new ColorError(`Unknown color function ${JSON.stringify(name)}`, whole);
  }
}

/**
 * Evaluate a color function expression (references already substituted by the
 * resolver). Output: hex when the result fits sRGB, oklch CSS otherwise.
 */
export function evaluateColorFunction(text: string): string {
  const result = evaluateColorFunctionInner(text, text);
  return isInSrgbGamut(result) ? formatColor(result, "hex") : formatColor(result, "oklch");
}
