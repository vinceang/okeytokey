# @okeytokey/core

The headless token engine. Pure TypeScript — no DOM, no Figma. Depends only on
`@okeytokey/schema`. ≥90% line coverage enforced (`vitest run --coverage`).

## Modules

### `ordered-json/`

JS objects reorder integer-like keys (`"100"`, `"900"` — every color scale), so
`JSON.parse` cannot round-trip token files. This module is a Map-based JSON layer:

- `parseOrderedJson(text)` / `serializeOrderedJson(value, indent?)` — position-aware
  `JsonParseError`s, duplicate-key rejection, insertion-order preservation
- `toPlainJson` / `fromPlainJson` / `jsonEquals` / `cloneJson`

### `parser/`

- `parseTokenSet(name, jsonText | JsonMap)` → `TokenSet` — validates via schema
  (throws `TokenParseError` with every issue), then indexes tokens into a
  read-optimized map. `TokenNode` carries the effective `$type` (group inheritance
  applied), plain `$value`, `$description`, `$deprecated`, and parsed
  `com.okeytokey` metadata.
- `serializeTokenSet(set)` — reads from the raw ordered-JSON tree, so unknown fields,
  foreign `$extensions`, and key order round-trip losslessly by construction.
- `createTokenDocument(sets)` / `getToken(document, path, setOrder?)`

### `resolver/`

See `docs/adr/0001-resolution-semantics.md` for the exact rules.

- `createResolver(document, { setOrder? })` → `Resolver`:
  - `resolve(path)` — aliases flattened (composites included), math evaluated, color
    functions applied; memoized; cycles reported with the exact path in
    `TokenResolutionError.cyclePath`
  - `resolveAll()` — resolves everything visible, collecting errors per token
  - `graph()` — direct + reverse reference graph (powers "What uses this?")
  - `lookup(path)` / `visiblePaths()`
- `expression.ts` — recursive-descent math parser/evaluator (`+ - * /`, parens, unary
  minus, px/rem/ms/s/% units with dimensional analysis; **no `eval`**), plus
  `parseQuantity` / `formatQuantity`
- Property-based tests (fast-check): random reference graphs never crash; cycles are
  detected exactly when present.

### `color/`

culori-backed. `parseColor` / `formatColor` (hex, rgb, hsl, oklch, oklab, display-p3),
`lighten` / `darken` / `alpha` / `mix` (OKLCH/OKLAB, perceptually uniform),
`gamutWarning` for out-of-sRGB colors, and `evaluateColorFunction` for
resolver-level `lighten(…)` / `darken(…)` / `alpha(…)` / `mix(…)` expressions
(nesting supported).

### `validate/`

The lint engine: `lintDocument(document, config?, options?)` builds shared context
(resolver, reference graph, visible tokens) once and runs every enabled rule,
returning structured diagnostics `{ ruleId, severity, tokenPath, setName, message,
fix? }` (fixes are `document -> document` functions). Rules configure ESLint-style
(`off/warn/error`, or `[level, options]`); unknown rule ids surface as diagnostics.
First-party rules:

- `no-broken-references` (error), `no-reference-cycles` (error, deduped per cycle)
- `naming-convention` (off by default; base + per-type segment patterns)
- `contrast` (warn) — WCAG 2.1 ratios and APCA Lc for declared fg/bg pairs
  (`color/contrast.ts` exports `wcagContrast`, `wcagLevel`, `apcaContrast`)
- `no-orphan-tokens` (warn), `deprecated-usage` (warn, with a one-click retarget fix)

### `diff/`

`diffDocuments(before, after)` — semantic diff per set (added / removed / renamed via
identical-signature heuristic / value-changed / type-changed) plus **transitive impact
analysis**: `impactedPaths` is every token whose _resolved_ value changes,
`downstreamPaths` excludes directly edited tokens ("this change affects 47 tokens").

### `refactor/`

- `planRename(document, from, to)` → `RenamePlan` with `movedIn` sets and every
  `referenceEdit` for preview; `apply()` executes atomically across all sets,
  rewriting references inside aliases, math expressions, and composite sub-values.
  Group renames move the whole subtree. `renameToken` is plan+apply in one call.
- `planMoveToSet(document, path, fromSet, toSet)` — cross-set move with metadata.
- `deprecate(document, path, replacement?)` — sets `$deprecated` plus
  `lifecycle: "deprecated"` / `replacedBy` in the extension namespace.

### `mutate/`

Persistent (immutable) mutations — every function returns a new `TokenSet` /
`TokenDocument` with structural sharing, and re-runs validation so a mutation can
never produce an invalid set: `createToken`, `setTokenValue`, `setTokenMeta`
(description/deprecated/okeytokey extension), `setGroupMeta`, `deleteToken` (prunes
emptied groups), `withSet`, `addSet`, `removeSet`, `renameSet`, `emptySet`. Failures
throw `TokenMutationError`.

### `themes/`

Theme = ordered `(set, status)` list; `source` resolves but doesn't emit, `enabled`
does both, `disabled` is omitted. `createThemeResolver`, `emittedPaths`, and
`expandThemeMatrix(groups)` — cartesian expansion of theme dimensions
("brand" × "mode") with status merging.

## Errors

All typed, all subclasses of `OkeytokeyError`: `TokenParseError`,
`TokenResolutionError` (with `cyclePath`), `ExpressionError`, `ColorError`,
`JsonParseError`. Nothing is swallowed.
