import {
  REM_BASE_PX,
  createResolver,
  createThemeResolver,
  extractReferences,
  type ResolvedToken,
  type Theme,
  type TokenDocument,
} from "@okeytokey/core";
import { isReference, referencePath } from "@okeytokey/schema";

/**
 * Pure output formatters: (resolved tokens) -> file text. Browser-safe — the
 * studio's export dialog uses these directly; the CLI wires them into Style
 * Dictionary as custom formats.
 */

export type FormatId = "css" | "scss" | "ts" | "tailwind";
export const BUILTIN_OUTPUT_TARGETS: readonly FormatId[] = ["css", "scss", "ts", "tailwind"];

export interface FormatOptions {
  /** CSS selector for the css format. Default ":root". */
  readonly selector?: string;
  /**
   * css only: emit var() chains for pure-alias tokens instead of flattened
   * values, preserving the reference graph in the output.
   */
  readonly outputReferences?: boolean;
}

export interface ResolvedEntry {
  readonly path: string;
  readonly token: ResolvedToken;
}

export interface ExportTransformOptions {
  /** Rewrite px lengths in resolved values to rem. Default false. */
  readonly pxToRem?: boolean;
  /** Pixels per rem for the conversion. Default {@link REM_BASE_PX} (16). */
  readonly remBasePx?: number;
}

// Every px length in a string, including inside shadow/typography values.
const PX_LENGTH = /(-?\d*\.?\d+)px\b/g;

function pxToRemString(text: string, base: number): string {
  return text.replace(PX_LENGTH, (_match, number: string) => {
    const rem = Number(number) / base;
    if (rem === 0) return "0";
    // Trim floating-point noise (16→1, 4→0.25) without trailing zeros.
    return `${String(Number(rem.toFixed(5)))}rem`;
  });
}

/** Deep-convert px→rem in any resolved value (strings, arrays, objects). */
function convertPxDeep(value: unknown, base: number): unknown {
  if (typeof value === "string") return pxToRemString(value, base);
  if (Array.isArray(value)) return value.map((item) => convertPxDeep(item, base));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, convertPxDeep(item, base)]),
    );
  }
  return value;
}

/**
 * Apply export-time transforms to resolved entries, format-agnostic (every
 * output — CSS, SCSS, TS, Tailwind — sees the transformed values). Currently
 * a px→rem rewrite mirroring the editor's unit switcher: deterministic, at
 * the CSS convention of 1rem = 16px (configurable). Aliases emitted as
 * var() chains are untouched — only concrete values convert.
 */
export function transformEntries(
  entries: readonly ResolvedEntry[],
  options: ExportTransformOptions = {},
): ResolvedEntry[] {
  if (options.pxToRem !== true) return [...entries];
  const base = options.remBasePx ?? REM_BASE_PX;
  return entries.map((entry) => ({
    ...entry,
    token: { ...entry.token, value: convertPxDeep(entry.token.value, base) },
  }));
}

/** Resolve every visible token (theme-aware when a theme is given). */
export function resolveForExport(document: TokenDocument, theme?: Theme): ResolvedEntry[] {
  const resolver = theme ? createThemeResolver(document, theme) : createResolver(document);
  const { resolved } = resolver.resolveAll();
  return [...resolved.entries()]
    .map(([path, token]) => ({ path, token }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

const nameFor = (path: string, separator: string) => path.replaceAll(".", separator);

function cssValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    // Shadow stacks and similar layered values.
    return value.map(cssValue).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if ("offsetX" in record) {
      // A shadow layer.
      const inset = record.inset === true ? "inset " : "";
      return `${inset}${String(record.offsetX)} ${String(record.offsetY)} ${String(record.blur)} ${String(record.spread)} ${String(record.color)}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/** CSS custom properties. */
export function formatCssVariables(
  entries: readonly ResolvedEntry[],
  options: FormatOptions = {},
): string {
  const selector = options.selector ?? ":root";
  const known = new Set(entries.map((entry) => entry.path));
  const lines = entries.map((entry) => {
    const raw = entry.token.token.value;
    if (
      options.outputReferences === true &&
      typeof raw === "string" &&
      isReference(raw) &&
      known.has(referencePath(raw))
    ) {
      return `  --${nameFor(entry.path, "-")}: var(--${nameFor(referencePath(raw), "-")});`;
    }
    return `  --${nameFor(entry.path, "-")}: ${cssValue(entry.token.value)};`;
  });
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}

/**
 * CSS with a light/dark strategy: base theme under :root, dark theme under
 * @media (prefers-color-scheme: dark), emitting only the variables that
 * differ.
 */
export function formatCssLightDark(
  light: readonly ResolvedEntry[],
  dark: readonly ResolvedEntry[],
  options: FormatOptions = {},
): string {
  const base = formatCssVariables(light, options);
  const lightValues = new Map(light.map((entry) => [entry.path, cssValue(entry.token.value)]));
  const overrides = dark.filter(
    (entry) => lightValues.get(entry.path) !== cssValue(entry.token.value),
  );
  if (overrides.length === 0) return base;
  const indented = formatCssVariables(overrides, options)
    .trimEnd()
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `${base}\n@media (prefers-color-scheme: dark) {\n${indented}\n}\n`;
}

/** SCSS map (nested by dots -> flat keys with quotes). */
export function formatScssMap(entries: readonly ResolvedEntry[]): string {
  const lines = entries.map((entry) => `  "${entry.path}": ${scssValue(entry.token.value)},`);
  return `$okey-tokens: (\n${lines.join("\n")}\n);\n`;
}

function scssValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    // Bare CSS values pass through; anything with a comma gets wrapped.
    return /[(),]/.test(value) && !value.startsWith("#") ? `(${value})` : value;
  }
  return `"${cssValue(value).replaceAll('"', '\\"')}"`;
}

/** TS const object with literal types. */
export function formatTsConsts(entries: readonly ResolvedEntry[]): string {
  const lines = entries.map((entry) => {
    const key = JSON.stringify(entry.path);
    const value = JSON.stringify(entry.token.value);
    return `  ${key}: ${value},`;
  });
  return `/* Generated by okeytokey. Do not edit. */\nexport const tokens = {\n${lines.join(
    "\n",
  )}\n} as const;\n\nexport type TokenPath = keyof typeof tokens;\n`;
}

/** Tailwind v4 @theme block. */
export function formatTailwindTheme(entries: readonly ResolvedEntry[]): string {
  const prefixFor = (type: string): string => {
    switch (type) {
      case "color":
        return "color";
      case "dimension":
        return "spacing";
      case "fontFamily":
        return "font";
      case "shadow":
        return "shadow";
      case "duration":
        return "duration";
      default:
        return "token";
    }
  };
  const lines = entries.map((entry) => {
    const prefix = prefixFor(entry.token.token.type);
    return `  --${prefix}-${nameFor(entry.path, "-")}: ${cssValue(entry.token.value)};`;
  });
  return `@theme {\n${lines.join("\n")}\n}\n`;
}

/** Format dispatcher used by the studio export dialog and the SD wrapper. */
export function formatTokens(
  format: FormatId,
  entries: readonly ResolvedEntry[],
  options: FormatOptions = {},
): string {
  switch (format) {
    case "css":
      return formatCssVariables(entries, options);
    case "scss":
      return formatScssMap(entries);
    case "ts":
      return formatTsConsts(entries);
    case "tailwind":
      return formatTailwindTheme(entries);
  }
}

/** Re-exported so callers can reason about reference output. */
export { extractReferences };
