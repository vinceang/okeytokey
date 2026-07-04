# @okeytokey/schema

W3C DTCG design token type definitions and Zod schemas. Depends on nothing internal.

## Public API

### Token types

- `DTCG_TOKEN_TYPES` / `DtcgTokenType` — the 13 supported `$type`s (7 primitive:
  color, dimension, fontFamily, fontWeight, duration, cubicBezier, number; 6 composite:
  typography, border, shadow, gradient, transition, strokeStyle)
- `isDtcgTokenType(value)` — type guard
- `OKEYTOKEY_EXTENSION_NAMESPACE` — `"com.okeytokey"`, the `$extensions` key for our
  metadata (see `docs/adr/0002-extension-namespace.md`)

### References (`reference.ts`)

- `isReference` / `referencePath` / `makeReference` — `"{a.b.c}"` ↔ `"a.b.c"`
- `findReferences(text)` — every embedded reference in a string, in order
- `joinTokenPath` / `splitTokenPath` / `isValidTokenName`
- `TokenReference` — template-literal type for pure reference strings

### Values (`values.ts`)

One Zod schema per `$type` (`colorValueSchema`, `dimensionValueSchema`, …), plus:

- `valueSchemaFor(type)` — the `$value` schema where the whole value may also be a
  reference, or (for `MATH_CAPABLE_TYPES`: dimension, number, duration) a math
  expression string like `"{spacing.base} * 2"`
- Composite schemas accept references/expressions in sub-value positions
- Inferred TS types for every value shape (`ShadowValue`, `TypographyValue`, …)

### Extensions (`extensions.ts`)

- `okeytokeyExtensionSchema` — decision-context metadata: `guidelines`, `context`,
  `decision { author, date, rationale, links }`, `lifecycle`
  (`draft | active | deprecated | archived`), `replacedBy`, `lineage`,
  `layer` (`primitive | semantic | component`), `owners` (user/team ids; `layer`
  and `owners` are inheritable from ancestor groups — core computes the
  effective values at parse time)

### Whole files (`file.ts`)

- `parseTokenFile` / `safeParseTokenFile` — validate a parsed JSON object as a DTCG
  file: walks groups, applies `$type` inheritance, checks every `$value` against its
  effective type, validates `$description` / `$deprecated` / our extension namespace.
  Returns the input object unchanged (no cloning) so key order and unknown fields
  survive. Collects **all** issues (`SchemaIssue { path, message }`) in one pass.
- `TokenFileParseError` — thrown variant carrying `issues`

**Invariant:** a file stripped of `$extensions["com.okeytokey"]` remains valid DTCG.
