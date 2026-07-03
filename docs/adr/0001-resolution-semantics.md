# ADR 0001: Resolution semantics

**Status:** Accepted (Phase 1)

## Context

Aliases (`{colors.primary.500}`), math expressions (`{spacing.base} * 2`), color
functions (`darken({colors.primary}, 0.1)`), and multi-set themes all interact. Tokens
Studio's behavior here is under-specified and a recurring source of user confusion; we
need exact, documented rules.

## Decision

### Lookup and set precedence

- A resolver is created over a `TokenDocument` plus a **set order** (from a theme:
  non-disabled sets in declared order). **Later sets win** path lookups.
- References resolve against the _winning_ token, so an override set that redefines
  `ramp.white` retints every alias of `ramp.white`, which is the point of themes.
- `source` vs `enabled` only affects _emission_ (what exports/UI list), never lookup.
  Disabled sets are omitted from the order entirely.

### Value resolution

- A `$value` that is exactly one reference resolves to the referenced token's fully
  resolved value (composites included), recursively.
- Strings with embedded references are **math expressions** if they parse under the
  expression grammar (`+ - * /`, parentheses, unary minus, number-with-unit literals,
  references). Once a string parses as an operation, evaluation errors (unit mismatch,
  division by zero, non-numeric reference) **propagate** — they never silently degrade
  to text. Strings that don't parse as math are **interpolations**: each `{ref}` is
  replaced by its resolved primitive value.
- Unit algebra: add/subtract require matching units (unitless zero adopts the other
  side's unit); multiply allows at most one united operand; divide by unitless keeps the
  unit, same-unit division cancels. **No implicit unit conversion** (no ms↔s, px↔rem).
- Color functions (`lighten`, `darken`, `alpha`, `mix`) are recognized on resolved
  strings; references are substituted first, then the function is evaluated in
  OKLCH/OKLAB. Output is hex when in sRGB gamut, `oklch()` CSS otherwise.
- Composite values resolve deeply; sub-values may be references or expressions.

### Cycles and errors

- Resolution is memoized per resolver; a visiting stack detects cycles and reports the
  **exact cycle path** (`a -> b -> c -> a`) in `TokenResolutionError.cyclePath`.
- Missing references name both the referrer and the missing path.
- `resolveAll` collects per-token errors instead of aborting on the first.

## Consequences

- Deterministic, order-sensitive resolution: reordering theme sets is a semantic change
  (by design, matching Tokens Studio's mental model but specified).
- The expression grammar is a stable contract — new operators need an ADR update.
- Property-based tests (fast-check) assert: random reference graphs never crash and
  never fail with anything but `TokenResolutionError`; cycles are detected exactly when
  the graph has one on the resolution path.
