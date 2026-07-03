import { formatColor, isColor, parseColor, parseQuantity } from "@okeytokey/core";

import type { ApplyTarget } from "./protocol.js";

/**
 * Token -> node application planning. Pure: given a resolved token value and
 * a target, produce an ApplyAction the main thread executes with the Figma
 * API. No `figma` globals here, so all of this is unit-testable.
 */

export interface FigmaRGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** Any CSS color string -> Figma's 0-1 RGBA channels. */
export function cssToFigmaColor(value: string): FigmaRGBA | undefined {
  if (!isColor(value)) return undefined;
  const hex = formatColor(parseColor(value), "hex");
  const digits = hex.slice(1);
  const channel = (offset: number) => parseInt(digits.slice(offset, offset + 2), 16) / 255;
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: digits.length === 8 ? channel(6) : 1,
  };
}

/** Dimension value ("16px", "1.5rem", {value,unit}, number) -> pixels. */
export function dimensionToPx(value: unknown, remBase = 16): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const quantity = parseQuantity(value);
    if (!quantity) return undefined;
    if (quantity.unit === "rem") return quantity.value * remBase;
    if (quantity.unit === "px" || quantity.unit === "") return quantity.value;
    return undefined;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "unit" in value &&
    typeof (value as { value: unknown }).value === "number"
  ) {
    const dimension = value as { value: number; unit: string };
    return dimension.unit === "rem" ? dimension.value * remBase : dimension.value;
  }
  return undefined;
}

const FONT_WEIGHT_STYLES: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

export function fontWeightToStyle(weight: unknown): string {
  if (typeof weight === "string") {
    // Keyword weights ("bold", "semi-bold") -> Title Case style names.
    return weight
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
      .replace("Regular", "Regular");
  }
  if (typeof weight === "number") {
    const rounded = Math.round(weight / 100) * 100;
    return FONT_WEIGHT_STYLES[Math.min(900, Math.max(100, rounded))] ?? "Regular";
  }
  return "Regular";
}

export type ApplyAction =
  | {
      readonly kind: "solid-paint";
      readonly property: "fills" | "strokes";
      readonly color: FigmaRGBA;
    }
  | { readonly kind: "corner-radius"; readonly radius: number }
  | { readonly kind: "padding"; readonly padding: number }
  | { readonly kind: "gap"; readonly gap: number }
  | {
      readonly kind: "typography";
      readonly fontSize?: number;
      readonly fontFamily?: string;
      readonly fontStyle?: string;
      readonly lineHeightPercent?: number;
      readonly letterSpacingPx?: number;
    };

export class ApplyError extends Error {
  override readonly name = "ApplyError";
}

/**
 * Plan the application of a resolved token value to a target. Throws
 * ApplyError with an actionable message when the value doesn't fit.
 */
export function planApply(tokenType: string, value: unknown, target: ApplyTarget): ApplyAction {
  switch (target) {
    case "fill":
    case "stroke": {
      if (typeof value !== "string") {
        throw new ApplyError(`A ${target} needs a color token (got ${tokenType})`);
      }
      const color = cssToFigmaColor(value);
      if (!color) {
        throw new ApplyError(`Not a usable color: ${JSON.stringify(value)}`);
      }
      return { kind: "solid-paint", property: target === "fill" ? "fills" : "strokes", color };
    }
    case "cornerRadius":
    case "padding":
    case "gap": {
      const px = dimensionToPx(value);
      if (px === undefined) {
        throw new ApplyError(
          `${target} needs a dimension or number token (got ${JSON.stringify(value)})`,
        );
      }
      if (target === "cornerRadius") return { kind: "corner-radius", radius: px };
      if (target === "padding") return { kind: "padding", padding: px };
      return { kind: "gap", gap: px };
    }
    case "typography": {
      if (typeof value !== "object" || value === null) {
        throw new ApplyError(`typography needs a composite typography token (got ${tokenType})`);
      }
      const composite = value as Record<string, unknown>;
      const fontSize =
        composite.fontSize !== undefined ? dimensionToPx(composite.fontSize) : undefined;
      const family = composite.fontFamily;
      const lineHeight = composite.lineHeight;
      const letterSpacing =
        composite.letterSpacing !== undefined ? dimensionToPx(composite.letterSpacing) : undefined;
      return {
        kind: "typography",
        fontSize,
        fontFamily: Array.isArray(family)
          ? (family[0] as string | undefined)
          : typeof family === "string"
            ? family
            : undefined,
        fontStyle:
          composite.fontWeight !== undefined ? fontWeightToStyle(composite.fontWeight) : undefined,
        lineHeightPercent: typeof lineHeight === "number" ? lineHeight * 100 : undefined,
        letterSpacingPx: letterSpacing,
      };
    }
  }
}
