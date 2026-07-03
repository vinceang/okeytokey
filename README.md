# okeytokey

An enterprise-grade design token management platform. W3C DTCG-spec-native, local-first,
built as a headless core engine with a web studio, Git sync, an export pipeline, and a
Figma plugin around it.

## Workspace layout

| Path                    | Package                   | Purpose                                                   |
| ----------------------- | ------------------------- | --------------------------------------------------------- |
| `packages/schema`       | `@okeytokey/schema`       | DTCG types + Zod schemas                                  |
| `packages/core`         | `@okeytokey/core`         | Headless engine: parse, resolve, validate, diff, refactor |
| `packages/sync`         | `@okeytokey/sync`         | Sync provider abstraction + GitHub                        |
| `packages/transforms`   | `@okeytokey/transforms`   | Style Dictionary export pipeline + CLI                    |
| `packages/ui`           | `@okeytokey/ui`           | Shared React component library                            |
| `packages/figma-bridge` | `@okeytokey/figma-bridge` | Figma node/variable mapping + message protocol            |
| `apps/studio`           | `@okeytokey/studio`       | Web token editor (Vite + React)                           |
| `apps/figma-plugin`     | `@okeytokey/figma-plugin` | Figma plugin                                              |
| `tooling/*`             | `@okeytokey/tsconfig` etc | Shared tsconfig / eslint / vitest presets                 |

Dependency boundaries are enforced with dependency-cruiser (`pnpm check:boundaries`);
violations and circular dependencies fail CI.

## Development

```sh
pnpm install
pnpm build        # turbo-cached build of all packages
pnpm dev          # studio dev server (+ any other dev tasks)
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e     # Playwright against the built studio
```

Requires Node >= 22 and pnpm 11 (`corepack enable`).

## Conventions

- TypeScript strict + `noUncheckedIndexedAccess`, ESM only.
- Conventional commits; package versioning via changesets.
- Architecture decision records live in `docs/adr/`.
