# @okeytokey/tsconfig

Shared TypeScript presets. All enable `strict` + `noUncheckedIndexedAccess`, ESM only.

- `base.json` — node-flavoured baseline (NodeNext resolution)
- `library.json` — base + declarations/sourcemaps, for published packages
- `react-library.json` — library + DOM lib + `react-jsx`
- `bundler-app.json` — Vite/esbuild apps: Bundler resolution, DOM, `noEmit`
