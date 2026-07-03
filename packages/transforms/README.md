# @okeytokey/transforms

Export pipeline. Two layers:

- **`.` (browser-safe)** — pure formatters over okeytokey-resolved tokens
  (`resolveForExport` is theme-aware): `formatCssVariables` (optional
  `outputReferences` var() chains), `formatCssLightDark`
  (prefers-color-scheme block with only the differing variables), `formatScssMap`,
  `formatTsConsts` (literal types + `TokenPath`), `formatTailwindTheme` (v4 `@theme`).
  The studio's export dialog uses these directly.
- **`./build` (Node)** — wraps Style Dictionary (v5, same hooks API as v4): okeytokey
  does resolution (cross-set themes, math, color functions — semantics SD doesn't
  know), the formatters are registered as SD custom formats, SD handles platform/file
  mechanics. Driven by `okeytokey.config.json`:

```json
{
  "sets": ["tokens/global.json", "tokens/dark.json"],
  "themes": [{ "name": "light", "sets": [{ "set": "global", "status": "enabled" }] }],
  "build": {
    "outDir": "dist/tokens",
    "targets": [
      { "format": "css", "file": "tokens.css", "theme": "light", "darkTheme": "dark" },
      { "format": "ts", "file": "tokens.ts", "theme": "light" }
    ]
  }
}
```

CLI (CI-friendly, no app needed):

```sh
pnpm okeytokey build [okeytokey.config.json]
```
