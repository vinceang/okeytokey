# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

okeytokey is a W3C DTCG-native design token management platform: a headless core engine with a web studio (Vite + React), GitHub sync, a Style Dictionary export pipeline, and a Figma plugin. Local-first — studio edits persist in IndexedDB. pnpm 11 + Turborepo monorepo, Node >= 22, ESM only, TypeScript strict with `noUncheckedIndexedAccess`.

## Commands

```sh
pnpm install
pnpm build              # turbo-cached build of all packages — run before typecheck/lint/test
pnpm dev                # studio dev server at http://localhost:5173
pnpm typecheck
pnpm lint
pnpm test               # vitest across all packages (core has a ≥90% coverage gate)
pnpm test:e2e           # Playwright against the built studio (vite preview on :4173)
pnpm check:boundaries   # dependency-cruiser; requires a prior pnpm build
pnpm format             # prettier --write (husky + lint-staged also format on commit)
```

Scope to one package with `--filter`:

```sh
pnpm --filter @okeytokey/core test
pnpm --filter @okeytokey/core exec vitest run src/resolver          # single test file/dir
pnpm --filter @okeytokey/studio exec playwright test e2e/editor.spec.ts
```

**Build-before-test gotcha:** cross-package imports resolve through pnpm symlinks to each package's `dist/`, not its `src/`. Turbo tasks run from the root handle this (`dependsOn: ^build`), but if you edit package A and run vitest directly inside package B, rebuild A first or B tests against stale code. When in doubt, `pnpm build` — it's cached and cheap.

E2E specs assume the seeded editor state (Playwright config pre-sets `okeytokey.onboarded` in localStorage); `test:e2e` depends on `build`, so run it from the root or build studio first.

## Architecture

The dependency contract, enforced by dependency-cruiser (violations and cycles fail CI):

```
schema        -> (nothing internal)      DTCG types + Zod schemas
core          -> schema                  headless engine: parse, resolve, validate, diff, refactor, mutate, themes, generate
sync          -> core, schema            sync provider abstraction + GitHub (Git Data API, token-level 3-way merge)
transforms    -> core, schema            Style Dictionary export pipeline + CLI (packages/transforms/src/cli.ts)
figma-bridge  -> core, schema            Figma node/variable mapping + plugin message protocol
ui            -> core, schema            shared React components
ai            -> core, schema            AI provider abstraction + proposal contract
apps          -> anything; nothing depends on apps
```

Put logic at the lowest layer it fits: token semantics belong in `core` (pure, no React, no IO), not in studio components. If a change seems to need a new cross-package edge, that usually means it's in the wrong layer — widening `.dependency-cruiser.cjs` is a deliberate architectural decision, not a fix for an import error.

**Studio state** (`apps/studio/src/state/`): zustand stores. `document-store.ts` holds the immutable token document; edits go through `commands.ts` — a command pattern with structural-snapshot inverses that powers undo (ADR 0003). Don't mutate the document outside a command, or undo breaks. `persistence.ts` handles Dexie/IndexedDB. The token table is a virtualized treegrid (`@tanstack/react-virtual`); a 10,000-token perf benchmark in e2e guards it.

**AI boundary** (ADR 0006): AI providers only _propose_ operations mirroring core's operation vocabulary; core deterministically validates and applies them. Never let AI output write to the document directly.

## Decisions and status

- `docs/adr/` — one ADR per core design decision (resolution semantics, undo model, sync merge, theme groups, AI contract, governance…). **Before changing behavior in any of these areas, read the matching ADR**; if a change contradicts one, that's an ADR update, not just a code change.
- `docs/prd.md` is the product source of truth; `ROADMAP.md` records what's deliberately deferred and the current gap analysis (governance epic is the main unbuilt PRD item, per ADR 0007).

## Conventions

- Conventional commits with package scope: `feat(studio): …`, `fix(schema): …`.
- Version-relevant changes to published packages need a changeset (`pnpm changeset`).
- CI runs the full gauntlet on every push: build, typecheck, lint, format check, boundaries, unit tests (core coverage ≥90%), Playwright including axe WCAG 2.1 AA checks and the perf benchmark. Match that bar locally before pushing; new studio surfaces should stay axe-clean.
- Tests live next to sources (`*.test.ts`, vitest, shared preset from `@okeytokey/vitest-config`); core also uses fast-check for property tests where invariants fit.
