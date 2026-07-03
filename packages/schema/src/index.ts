/**
 * @okeytokey/schema — W3C DTCG type definitions and Zod schemas.
 *
 * Depends on nothing internal. Layers:
 *  - token-types: the `$type` universe + the okeytokey extension namespace key
 *  - reference:   `{token.path}` alias syntax helpers
 *  - values:      Zod schemas for every `$type`'s `$value`
 *  - extensions:  `$extensions["com.okeytokey"]` decision-context metadata
 *  - file:        whole-file validation with `$type` group inheritance
 */

export {
  DTCG_TOKEN_TYPES,
  OKEYTOKEY_EXTENSION_NAMESPACE,
  isDtcgTokenType,
  type DtcgTokenType,
} from "./token-types.js";

export {
  EMBEDDED_REFERENCE_PATTERN,
  REFERENCE_PATTERN,
  TOKEN_PATH_SEPARATOR,
  findReferences,
  isReference,
  isValidTokenName,
  joinTokenPath,
  makeReference,
  referencePath,
  referenceSchema,
  splitTokenPath,
  type TokenReference,
} from "./reference.js";

export {
  MATH_CAPABLE_TYPES,
  borderValueSchema,
  colorValueSchema,
  cubicBezierValueSchema,
  dimensionUnitSchema,
  dimensionValueSchema,
  durationValueSchema,
  fontFamilyValueSchema,
  fontWeightValueSchema,
  gradientStopSchema,
  gradientValueSchema,
  mathExpressionSchema,
  numberValueSchema,
  shadowValueSchema,
  strokeStyleValueSchema,
  transitionValueSchema,
  typographyValueSchema,
  valueSchemaFor,
  type BorderValue,
  type ColorValue,
  type CubicBezierValue,
  type DimensionValue,
  type DtcgValueSchemas,
  type DurationValue,
  type FontFamilyValue,
  type FontWeightValue,
  type GradientValue,
  type NumberValue,
  type ShadowValue,
  type StrokeStyleValue,
  type TransitionValue,
  type TypographyValue,
} from "./values.js";

export {
  decisionSchema,
  lifecycleSchema,
  lineageSchema,
  okeytokeyExtensionSchema,
  type Decision,
  type Lifecycle,
  type Lineage,
  type OkeytokeyExtension,
} from "./extensions.js";

export {
  TokenFileParseError,
  parseTokenFile,
  safeParseTokenFile,
  type DtcgFile,
  type DtcgGroup,
  type DtcgToken,
  type SafeParseResult,
  type SchemaIssue,
} from "./file.js";
