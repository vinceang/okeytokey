# @okeytokey/figma-plugin

The okeytokey Figma plugin. Two isolated runtimes with separate tsconfigs:

- `src/main/` — main thread (`figma` API, no DOM), bundled to `dist/code.js`
- `src/ui/` — React UI iframe (reuses `@okeytokey/ui`), bundled with its CSS inlined
  into `dist/ui.html`

All mapping logic lives in `@okeytokey/figma-bridge` (pure, tested); the main thread
only executes plans and owns persistence.

## v1 capabilities

- **Load a token document** — DTCG JSON files from disk, persisted in the Figma file's
  pluginData so it survives reopening.
- **Apply tokens to selection** — fills, strokes, corner radius, auto-layout
  padding/gap, and typography (font loading handled, with graceful fallback).
- **Export themes to Figma Variables** — collections = theme groups, modes = themes;
  existing collections/modes/variables are updated in place.
- **Import Figma Variables** — first local collection → DTCG sets (one per mode) with
  a mapping report; the imported document becomes the active one.
- **Theme persistence** — the active theme is stored in pluginData; a
  `documentchange` listener re-pins the theme's variable mode on newly created
  component instances, so new instances don't fall back to the collection default.
- Continuous two-way variable sync is stubbed behind the existing read/write paths
  (see the TODO in `src/main/code.ts`).

To run: `pnpm build`, then in Figma desktop _Plugins → Development → Import plugin
from manifest…_ and pick `manifest.json`.
