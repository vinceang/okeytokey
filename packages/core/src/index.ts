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
