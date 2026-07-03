# ADR 0002: The `com.okeytokey` extension namespace

**Status:** Accepted (Phase 1)

## Context

Tokens carry values but rarely the _decision_ behind them. DTCG provides
`$extensions` for vendor metadata. We need a home for okeytokey's decision context that
never compromises spec compliance.

## Decision

- All okeytokey metadata lives under `$extensions["com.okeytokey"]` — never in new
  `$`-prefixed or spec-level fields.
- **Invariant (tested):** stripping `$extensions["com.okeytokey"]` from any okeytokey
  file yields a valid DTCG file with identical resolved values.
- The namespace schema (`okeytokeyExtensionSchema`, strict — unknown keys rejected so
  typos surface):
  - `guidelines` — markdown usage guidance
  - `context` — intended application surfaces (string list)
  - `decision` — `{ author, date, rationale, links[] }`
  - `lifecycle` — `draft | active | deprecated | archived`
  - `replacedBy` — successor token path (pairs with `deprecated`)
  - `lineage` — `{ generator, inputs[], params }` for generated tokens
- Other vendors' namespaces are preserved byte-for-byte and never validated.
- Whole-file validation checks our namespace when present; a malformed
  `com.okeytokey` payload is a validation issue, not a parse crash. The indexed
  `TokenNode.okeytokey` view is `undefined` when the payload is absent or invalid.

## Consequences

- Files interchange cleanly with any DTCG tool; our metadata degrades gracefully.
- Strictness inside the namespace means adding fields is a schema change here first.
- `lifecycle`/`replacedBy` power the deprecation UX (strike-through + one-click
  replacement) and the `deprecated-usage` lint rule in Phase 3.
