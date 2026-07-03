# @okeytokey/transforms

Export pipeline wrapping Style Dictionary v4. First-party targets: CSS custom properties
(light-dark() and prefers-color-scheme strategies), SCSS maps, TS const objects with
literal types, Tailwind v4 `@theme` config. Theme-aware builds and a standalone CLI
(`okeytokey build`) driven by `okeytokey.config.json` so CI needs no app.

Phase 0 scaffold — implementation lands in Phase 4. Depends on `@okeytokey/core` and
`@okeytokey/schema`.
