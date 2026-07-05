import { z } from "zod";

import { EMBEDDED_REFERENCE_PATTERN, REFERENCE_PATTERN, referenceSchema } from "./reference.js";

/**
 * Zod schemas for DTCG token `$value`s, one per `$type`.
 *
 * Every position where the spec allows an alias accepts a reference string;
 * `orRef` wraps a value schema accordingly. Composite sub-values may be
 * references too, matching the spec's "any value may be an alias" stance.
 * Math-capable types (dimension, number, duration) additionally accept
 * expression strings like "{spacing.base} * 2"; core's resolver parses and
 * evaluates them.
 */

function orRef<T extends z.ZodType>(schema: T) {
  return z.union([schema, referenceSchema]);
}

/**
 * A math expression string: contains at least one embedded reference but is
 * not itself a pure reference (that case is handled by `referenceSchema`).
 * Full syntactic validation happens in core's expression parser.
 */
export const mathExpressionSchema = z
  .string()
  .refine(
    (value) =>
      !REFERENCE_PATTERN.test(value) && [...value.matchAll(EMBEDDED_REFERENCE_PATTERN)].length > 0,
    "must be a math expression containing at least one {token.reference}",
  );

function orRefOrExpression<T extends z.ZodType>(schema: T) {
  return z.union([schema, referenceSchema, mathExpressionSchema]);
}

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

/**
 * Colors. The current DTCG draft specifies an object form
 * ({ colorSpace, components, alpha?, hex? }); the widely deployed legacy form
 * is a hex/CSS string. okeytokey accepts CSS color strings (validated
 * downstream by core's culori-backed color engine) — the object form can be
 * added alongside without breaking this schema.
 */
export const colorValueSchema = z.string().min(1);

/** Dimensions: number+unit string ("16px", "1.5rem") or { value, unit }. */
export const dimensionUnitSchema = z.enum(["px", "rem"]);
export const dimensionValueSchema = z.union([
  z.string().regex(/^-?\d+(\.\d+)?(px|rem)$/, 'must be a number with a px/rem unit, e.g. "16px"'),
  z.object({ value: z.number(), unit: dimensionUnitSchema }).strict(),
]);

export const fontFamilyValueSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

export const fontWeightValueSchema = z.union([
  z.number().min(1).max(1000),
  z.enum([
    "thin",
    "hairline",
    "extra-light",
    "ultra-light",
    "light",
    "normal",
    "regular",
    "book",
    "medium",
    "semi-bold",
    "demi-bold",
    "bold",
    "extra-bold",
    "ultra-bold",
    "black",
    "heavy",
    "extra-black",
    "ultra-black",
  ]),
]);

/** Durations: "200ms" / "0.2s" or { value, unit }. */
export const durationValueSchema = z.union([
  z.string().regex(/^-?\d+(\.\d+)?(ms|s)$/, 'must be a number with an ms/s unit, e.g. "200ms"'),
  z.object({ value: z.number(), unit: z.enum(["ms", "s"]) }).strict(),
]);

export const cubicBezierValueSchema = z.tuple([
  z.number().min(0).max(1),
  z.number(),
  z.number().min(0).max(1),
  z.number(),
]);

export const numberValueSchema = z.number();

export const stringValueSchema = z.string();

export const booleanValueSchema = z.boolean();

// ---------------------------------------------------------------------------
// Composite types
// ---------------------------------------------------------------------------

export const typographyValueSchema = z
  .object({
    fontFamily: orRef(fontFamilyValueSchema),
    fontSize: orRefOrExpression(dimensionValueSchema),
    fontWeight: orRef(fontWeightValueSchema),
    letterSpacing: orRefOrExpression(dimensionValueSchema),
    lineHeight: orRefOrExpression(numberValueSchema),
  })
  .partial()
  .strict();

export const strokeStyleValueSchema = z.union([
  z.enum(["solid", "dashed", "dotted", "double", "groove", "ridge", "outset", "inset"]),
  z
    .object({
      dashArray: z.array(orRefOrExpression(dimensionValueSchema)),
      lineCap: z.enum(["round", "butt", "square"]),
    })
    .strict(),
]);

export const borderValueSchema = z
  .object({
    color: orRef(colorValueSchema),
    width: orRefOrExpression(dimensionValueSchema),
    style: orRef(strokeStyleValueSchema),
  })
  .strict();

const singleShadowSchema = z
  .object({
    color: orRef(colorValueSchema),
    offsetX: orRefOrExpression(dimensionValueSchema),
    offsetY: orRefOrExpression(dimensionValueSchema),
    blur: orRefOrExpression(dimensionValueSchema),
    spread: orRefOrExpression(dimensionValueSchema),
    inset: z.boolean().optional(),
  })
  .strict();

/** Shadows: a single layer or a stack (nearest-to-element first). */
export const shadowValueSchema = z.union([singleShadowSchema, z.array(singleShadowSchema).min(1)]);

export const gradientStopSchema = z
  .object({
    color: orRef(colorValueSchema),
    position: orRef(z.number().min(0).max(1)),
  })
  .strict();

export const gradientValueSchema = z.array(gradientStopSchema).min(2);

export const transitionValueSchema = z
  .object({
    duration: orRefOrExpression(durationValueSchema),
    delay: orRefOrExpression(durationValueSchema),
    timingFunction: orRef(cubicBezierValueSchema),
  })
  .strict();

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const bareValueSchemas = {
  color: colorValueSchema,
  dimension: dimensionValueSchema,
  fontFamily: fontFamilyValueSchema,
  fontWeight: fontWeightValueSchema,
  duration: durationValueSchema,
  cubicBezier: cubicBezierValueSchema,
  number: numberValueSchema,
  string: stringValueSchema,
  boolean: booleanValueSchema,
  typography: typographyValueSchema,
  border: borderValueSchema,
  shadow: shadowValueSchema,
  gradient: gradientValueSchema,
  transition: transitionValueSchema,
  strokeStyle: strokeStyleValueSchema,
} as const;

export type DtcgValueSchemas = typeof bareValueSchemas;

/** Types whose values may be math expression strings. */
export const MATH_CAPABLE_TYPES = ["dimension", "number", "duration"] as const;

/**
 * `$value` schema for a given `$type`: the concrete value, a pure reference,
 * or (for math-capable types) a math expression string.
 */
export function valueSchemaFor(type: keyof DtcgValueSchemas) {
  return (MATH_CAPABLE_TYPES as readonly string[]).includes(type)
    ? orRefOrExpression(bareValueSchemas[type])
    : orRef(bareValueSchemas[type]);
}

export type ColorValue = z.infer<typeof colorValueSchema>;
export type DimensionValue = z.infer<typeof dimensionValueSchema>;
export type FontFamilyValue = z.infer<typeof fontFamilyValueSchema>;
export type FontWeightValue = z.infer<typeof fontWeightValueSchema>;
export type DurationValue = z.infer<typeof durationValueSchema>;
export type CubicBezierValue = z.infer<typeof cubicBezierValueSchema>;
export type NumberValue = z.infer<typeof numberValueSchema>;
export type StringValue = z.infer<typeof stringValueSchema>;
export type BooleanValue = z.infer<typeof booleanValueSchema>;
export type TypographyValue = z.infer<typeof typographyValueSchema>;
export type BorderValue = z.infer<typeof borderValueSchema>;
export type ShadowValue = z.infer<typeof shadowValueSchema>;
export type GradientValue = z.infer<typeof gradientValueSchema>;
export type TransitionValue = z.infer<typeof transitionValueSchema>;
export type StrokeStyleValue = z.infer<typeof strokeStyleValueSchema>;
