import { converter } from "culori";

import { parseColor } from "./color.js";

/**
 * Contrast metrics for the `contrast` lint rule.
 *
 * WCAG 2.1: relative-luminance ratio, 1..21. Thresholds: AA 4.5 (3.0 large
 * text), AAA 7.0 (4.5 large).
 *
 * APCA (Accessible Perceptual Contrast Algorithm, WCAG 3 draft): lightness
 * contrast Lc, roughly -108..106; sign encodes polarity (positive = dark text
 * on light background). Constants are the published 0.0.98G-4g set. |Lc| 60
 * is the commonly cited body-text floor, 75 preferred, 45 for large text.
 */

const toRgb = converter("rgb");

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 relative luminance of any CSS color string. */
export function relativeLuminance(color: string): number {
  const { r, g, b } = toRgb(parseColor(color).color);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 2.1 contrast ratio (1..21) between two CSS color strings. */
export function wcagContrast(foreground: string, background: string): number {
  const lumA = relativeLuminance(foreground);
  const lumB = relativeLuminance(background);
  const [lighter, darker] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = "AA" | "AA-large" | "AAA" | "AAA-large" | "fail";

/** Highest WCAG 2.1 level a ratio satisfies for normal/large text. */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}

// --- APCA 0.0.98G-4g ---------------------------------------------------------

const APCA = {
  exponent: 2.4,
  blkThrs: 0.022,
  blkClmp: 1.414,
  sBoW: { normText: 0.57, normBg: 0.56, scale: 1.14, offset: 0.027 },
  wBoS: { revText: 0.62, revBg: 0.65, scale: 1.14, offset: 0.027 },
  loClip: 0.1,
};

function apcaLuminance(color: string): number {
  const { r, g, b } = toRgb(parseColor(color).color);
  const y =
    0.2126729 * Math.pow(r, APCA.exponent) +
    0.7151522 * Math.pow(g, APCA.exponent) +
    0.072175 * Math.pow(b, APCA.exponent);
  // Soft clamp for very dark colors.
  return y < APCA.blkThrs ? y + Math.pow(APCA.blkThrs - y, APCA.blkClmp) : y;
}

/**
 * APCA lightness contrast Lc between text and background colors.
 * Positive = dark text on light background; negative = light-on-dark.
 */
export function apcaContrast(text: string, background: string): number {
  const yText = apcaLuminance(text);
  const yBg = apcaLuminance(background);

  let sapc: number;
  if (yBg > yText) {
    // Dark text on light background.
    sapc =
      (Math.pow(yBg, APCA.sBoW.normBg) - Math.pow(yText, APCA.sBoW.normText)) * APCA.sBoW.scale;
    return sapc < APCA.loClip ? 0 : (sapc - APCA.sBoW.offset) * 100;
  }
  // Light text on dark background.
  sapc = (Math.pow(yBg, APCA.wBoS.revBg) - Math.pow(yText, APCA.wBoS.revText)) * APCA.wBoS.scale;
  return sapc > -APCA.loClip ? 0 : (sapc + APCA.wBoS.offset) * 100;
}
