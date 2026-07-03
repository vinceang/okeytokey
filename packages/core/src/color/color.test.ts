import { describe, expect, it } from "vitest";

import { ColorError } from "../errors.js";
import {
  alpha,
  darken,
  evaluateColorFunction,
  formatColor,
  gamutWarning,
  isColor,
  isColorFunction,
  isInSrgbGamut,
  lighten,
  mix,
  parseColor,
} from "./color.js";

describe("parseColor / isColor", () => {
  it("parses every required syntax", () => {
    for (const input of [
      "#3b82f6",
      "#3b82f680",
      "rgb(59 130 246)",
      "rgb(59, 130, 246)",
      "hsl(217 91% 60%)",
      "oklch(0.62 0.19 259)",
      "oklab(0.62 -0.02 -0.18)",
      "color(display-p3 0.2 0.5 0.9)",
      "rebeccapurple",
    ]) {
      expect(isColor(input), input).toBe(true);
    }
  });

  it("rejects non-colors with a typed error", () => {
    expect(isColor("not-a-color")).toBe(false);
    expect(() => parseColor("16px")).toThrow(ColorError);
  });
});

describe("formatColor", () => {
  it("converts between spaces", () => {
    const blue = parseColor("#3b82f6");
    expect(formatColor(blue, "hex")).toBe("#3b82f6");
    expect(formatColor(blue, "rgb")).toBe("rgb(59, 130, 246)");
    expect(formatColor(blue, "oklch")).toMatch(/^oklch\(/);
    expect(formatColor(blue, "oklab")).toMatch(/^oklab\(/);
    expect(formatColor(blue, "hsl")).toMatch(/^hsl\(/);
    expect(formatColor(blue, "display-p3")).toMatch(/^color\(display-p3/);
  });

  it("keeps alpha in hex8 only when < 1", () => {
    expect(formatColor(parseColor("#3b82f680"), "hex")).toBe("#3b82f680");
    expect(formatColor(parseColor("#3b82f6ff"), "hex")).toBe("#3b82f6");
  });
});

describe("gamut", () => {
  it("flags out-of-sRGB colors with a fallback", () => {
    const neon = parseColor("oklch(0.8 0.35 150)");
    expect(isInSrgbGamut(neon)).toBe(false);
    const warning = gamutWarning(neon);
    expect(warning?.message).toMatch(/outside the sRGB gamut/);
    expect(warning?.srgbFallback).toMatch(/^oklch\(/);
  });

  it("passes in-gamut colors silently", () => {
    expect(gamutWarning(parseColor("#3b82f6"))).toBeUndefined();
  });
});

describe("modification functions", () => {
  it("lighten/darken move OKLCH lightness and clamp", () => {
    const gray = parseColor("oklch(0.5 0 0)");
    expect(formatColor(lighten(gray, 0.2), "oklch")).toContain("0.7");
    expect(formatColor(darken(gray, 0.2), "oklch")).toContain("0.3");
    expect(formatColor(lighten(gray, 2), "oklch")).toContain("oklch(1");
  });

  it("alpha sets and clamps", () => {
    const blue = parseColor("#3b82f6");
    expect(formatColor(alpha(blue, 0.5), "hex")).toBe("#3b82f680");
    expect(formatColor(alpha(blue, 8), "hex")).toBe("#3b82f6");
  });

  it("mix interpolates between colors", () => {
    const mixed = mix(parseColor("#000000"), parseColor("#ffffff"), 0.5);
    // OKLAB midpoint of black/white is a gray (equal channels), mid-range.
    const hex = formatColor(mixed, "hex");
    expect(hex).toMatch(/^#(..)\1\1$/);
    const channel = parseInt(hex.slice(1, 3), 16);
    expect(channel).toBeGreaterThan(0x40);
    expect(channel).toBeLessThan(0xa0);
  });
});

describe("color function expressions", () => {
  it("detects and evaluates functions", () => {
    expect(isColorFunction("lighten(#000, 0.5)")).toBe(true);
    expect(isColorFunction("#3b82f6")).toBe(false);
    expect(evaluateColorFunction("alpha(#3b82f6, 0.5)")).toBe("#3b82f680");
    expect(evaluateColorFunction("mix(#000000, #ffffff, 0)")).toBe("#000000");
  });

  it("evaluates nested functions", () => {
    const result = evaluateColorFunction("alpha(darken(#3b82f6, 0.1), 0.5)");
    expect(result).toMatch(/^#[0-9a-f]{8}$/);
  });

  it("throws typed errors on malformed calls", () => {
    expect(() => evaluateColorFunction("lighten(#000)")).toThrow(ColorError);
    expect(() => evaluateColorFunction("lighten(#000, x)")).toThrow(ColorError);
    expect(() => evaluateColorFunction("mix(#000, #fff)")).toThrow(ColorError);
    expect(() => evaluateColorFunction("lighten(#000, 0.5")).toThrow(ColorError);
    expect(() => evaluateColorFunction("lighten(nope, 0.5)")).toThrow(ColorError);
  });
});
