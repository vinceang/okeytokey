/**
 * @okeytokey/core — headless design token engine. Pure functions, no DOM,
 * no Figma. Depends only on @okeytokey/schema.
 */

export {
  ColorError,
  ExpressionError,
  OkeytokeyError,
  TokenParseError,
  TokenResolutionError,
} from "./errors.js";

export {
  JsonParseError,
  cloneJson,
  fromPlainJson,
  jsonEquals,
  parseOrderedJson,
  serializeOrderedJson,
  toPlainJson,
  type JsonMap,
  type JsonPrimitive,
  type JsonValue,
} from "./ordered-json/ordered-json.js";

export {
  createTokenDocument,
  getToken,
  parseTokenSet,
  serializeTokenSet,
  type TokenDocument,
  type TokenNode,
  type TokenSet,
} from "./parser/document.js";

export {
  TokenMutationError,
  addSet,
  createToken,
  deleteToken,
  emptySet,
  removeSet,
  renameSet,
  setGroupMeta,
  setTokenMeta,
  setTokenValue,
  withSet,
  type TokenInit,
  type TokenMetaPatch,
} from "./mutate/mutate.js";

export {
  evaluateExpression,
  formatQuantity,
  isExpression,
  parseExpression,
  parseQuantity,
  type ExpressionNode,
  type Quantity,
} from "./resolver/expression.js";

export {
  createResolver,
  extractReferences,
  type ReferenceGraph,
  type ResolveAllResult,
  type ResolvedToken,
  type Resolver,
  type ResolverOptions,
} from "./resolver/resolver.js";

export {
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
  type ColorSpace,
  type GamutWarning,
  type ParsedColor,
} from "./color/color.js";

export {
  apcaContrast,
  relativeLuminance,
  wcagContrast,
  wcagLevel,
  type WcagLevel,
} from "./color/contrast.js";

export {
  diffDocuments,
  type DiffOptions,
  type DocumentDiff,
  type SetDiff,
  type TokenChange,
} from "./diff/diff.js";

export {
  planColorFormatConversion,
  type FormatConversionEntry,
  type FormatConversionPlan,
} from "./color/convert.js";

export {
  DEFAULT_SCALE_STEPS,
  SCALE_GENERATOR_ID,
  planColorScale,
  type ScaleEntry,
  type ScaleOptions,
  type ScalePlan,
} from "./generate/scale.js";

export {
  deprecate,
  planMoveToSet,
  planRename,
  renameToken,
  type MovePlan,
  type ReferenceEdit,
  type RenamePlan,
} from "./refactor/refactor.js";

export { lintDocument, type LintOptions } from "./validate/engine.js";
export { BUILTIN_RULES } from "./validate/rules.js";
export type {
  ContrastOptions,
  ContrastPair,
  Diagnostic,
  DiagnosticFix,
  LintConfig,
  LintRule,
  NamingConventionOptions,
  RuleContext,
  RuleSetting,
  Severity,
  SeverityConfig,
} from "./validate/types.js";

export {
  createThemeResolver,
  emittedPaths,
  emittedSets,
  expandThemeMatrix,
  resolutionOrder,
  themeFromCombination,
  type SetStatus,
  type Theme,
  type ThemeCombination,
  type ThemeGroup,
  type ThemeSetEntry,
} from "./themes/themes.js";
