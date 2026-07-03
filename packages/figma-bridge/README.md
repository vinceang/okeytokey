# @okeytokey/figma-bridge

Pure Figma integration logic shared by the plugin's main thread and UI iframe.
No `figma` globals, no DOM — everything here is unit-testable.

- **Protocol** (`protocol.ts`): the typed postMessage contract as Zod discriminated
  unions, validated on both sides (`parseUiToMain` / `parseMainToUi` return
  `undefined` for foreign/malformed messages). `BRIDGE_PROTOCOL_VERSION` is bumped
  on breaking changes.
- **Application planning** (`apply.ts`): `planApply(tokenType, resolvedValue, target)`
  → `ApplyAction` for fills, strokes, corner radius, auto-layout padding/gap, and
  typography. Converters: `cssToFigmaColor` (any CSS syntax → 0-1 RGBA),
  `dimensionToPx` (px/rem/object forms), `fontWeightToStyle` (400 → "Regular").
  Mismatches throw `ApplyError` with actionable copy.
- **Variables** (`variables.ts`):
  - `planVariableExport(document, themes)` — collections = theme groups, modes =
    themes, token paths → "a/b/c" variable names; color/number/dimension/fontFamily
    map, composites land in the mapping report.
  - `importVariables(dump)` — Figma variable dump → one valid DTCG file per mode
    plus a `MappingReport` for unsupported types.

Depends on `@okeytokey/core` + `@okeytokey/schema`.
