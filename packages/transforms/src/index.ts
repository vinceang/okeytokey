/**
 * @okeytokey/transforms — export pipeline.
 *
 * `formats.js` is pure and browser-safe (the studio uses it directly);
 * `build.js` wraps Style Dictionary v4 and is Node-only (CLI/CI).
 */

export {
  BUILTIN_OUTPUT_TARGETS,
  formatCssLightDark,
  formatCssVariables,
  formatScssMap,
  formatTailwindTheme,
  formatTokens,
  formatTsConsts,
  resolveForExport,
  type FormatId,
  type FormatOptions,
  type ResolvedEntry,
} from "./formats.js";
