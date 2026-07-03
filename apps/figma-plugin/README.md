# @okeytokey/figma-plugin

The okeytokey Figma plugin. Two isolated runtimes with separate tsconfigs:

- `src/main/` — main thread (`figma` API, no DOM), bundled to `dist/code.js`
- `src/ui/` — React UI iframe, bundled and inlined into `dist/ui.html`

Built with esbuild via `build.mjs`. The two sides will communicate through the typed,
Zod-validated postMessage protocol in `@okeytokey/figma-bridge`.

Phase 0 scaffold — Phase 5 brings: apply tokens to selection, export themes to Figma
Variables (collections = theme groups, modes = themes), variable import with a mapping
report, and active-theme reapplication when new component instances enter the document.

To run in Figma: `pnpm build`, then in the Figma desktop app use
_Plugins → Development → Import plugin from manifest…_ and pick `manifest.json`.
(The `id` in the manifest is a placeholder until the plugin is published.)
