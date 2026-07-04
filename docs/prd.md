# PRD: okeytokey — an Enterprise-Grade Design Token Platform

> Revised PRD (2026-07). This is the product source of truth, superseding the
> original build prompt. It is kept verbatim below apart from this note; the
> delta between this document and the implementation is tracked in
> [../ROADMAP.md](../ROADMAP.md) ("Gap analysis"), and the governance approach
> it specifies is recorded in [adr/0007-git-native-governance.md](adr/0007-git-native-governance.md).

---

## Mission

Build **okeytokey**, an enterprise-grade design token management platform in the spirit of Tokens Studio, but architected from a clean slate. It must be W3C DTCG-spec-native, local-first, rigorously component-architected, and fix the known weaknesses of Tokens Studio: unreliable/opaque Git sync, dense configuration UX, missing rename-refactoring, no validation layer, no impact analysis, weak color-space support, tokens that carry values but no decision context, and no governance (ownership, approvals, audit, releases).

**Positioning: okeytokey is the system of record for design tokens — a control plane between design tools, code, and docs — not a Figma plugin with extras.** Figma is one peer among several. The promise is "tokens that stay correct, understandable, and governable from design to code." Non-goals: do not compete on breadth of token types or novelty features; every feature must serve trust, comprehension, or control.

Work in phases (defined at the bottom). At the end of each phase, all tests must pass and the app must run. Do not move to the next phase with a broken build. Ask me before making irreversible architectural decisions not covered here.

## Product Scope (v1)

1. **Web-based token editor** — the primary app. Manage token sets, tokens, themes; resolve aliases; import/export DTCG JSON; visual editing per token type.
2. **Headless core engine** — a pure TypeScript library with zero DOM/Figma dependencies that does parsing, resolution, validation, diffing, and transformation. Everything else is a shell around this.
3. **Git sync layer** — GitHub first, behind a provider interface designed for GitLab/Azure DevOps/Bitbucket later.
4. **Export pipeline** — Style Dictionary v4 integration producing CSS variables, SCSS, JS/TS, and Tailwind config.
5. **Figma plugin** — scaffolded with correct build setup and shared core, implementing token application to nodes and variable export. Full two-way variable sync can be stubbed with clear TODOs, but the architecture must accommodate it.

## Monorepo Architecture

Use **pnpm workspaces + Turborepo**, TypeScript strict mode everywhere, ESM only.

```
okeytokey/
├── packages/
│   ├── core/            # @okeytokey/core — headless engine (no DOM, no Figma)
│   ├── schema/          # @okeytokey/schema — DTCG types + Zod schemas
│   ├── sync/            # @okeytokey/sync — provider abstraction + GitHub impl
│   ├── transforms/      # @okeytokey/transforms — Style Dictionary pipeline
│   ├── ui/              # @okeytokey/ui — shared React component library
│   └── figma-bridge/    # @okeytokey/figma-bridge — Figma node/variable mapping
├── apps/
│   ├── studio/          # Web editor (Vite + React)
│   └── figma-plugin/    # Figma plugin (manifest + main thread + UI iframe)
├── tooling/             # shared eslint, tsconfig, vitest configs
└── turbo.json
```

**Dependency rule (enforce with eslint-plugin-boundaries or dependency-cruiser):** `schema` depends on nothing internal. `core` depends only on `schema`. `sync`, `transforms`, `figma-bridge` depend on `core` + `schema`. `ui` depends on `core` + `schema`. Apps depend on anything. Nothing depends on apps. Circular dependencies are a CI failure.

## Package Specifications

### @okeytokey/schema

- Full W3C DTCG type definitions: `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, plus composite types `typography`, `border`, `shadow`, `gradient`, `transition`, `strokeStyle`.
- Zod schemas mirroring every type; `parse` and `safeParse` entry points for whole token files.
- `$extensions["com.okeytokey"]` namespace for our metadata (see Decision Context below). Never pollute the spec-level fields — an okeytokey file stripped of `$extensions` must remain a valid DTCG file.
- Support `$description`, `$type` inheritance from groups, and `$deprecated`.

### @okeytokey/core

Pure functions + a small immutable document model. Modules:

- **parser/** — load DTCG JSON into an internal `TokenDocument` (token sets, groups, tokens). Preserve key order and unknown fields for lossless round-tripping.
- **resolver/** — alias resolution (`{colors.primary.500}`) with: full reference-graph construction, cycle detection with the exact cycle path in the error, cross-set resolution respecting theme set order (source/enabled/disabled semantics), and math expression evaluation for dimensions (`{spacing.base} * 2`) using a real expression parser — no `eval`.
- **color/** — use `culori`. Native support for hex, rgb, hsl, **oklch, oklab, display-p3**. Color modification functions (lighten/darken/alpha/mix) as resolver-level operations. Gamut-mapping warnings when a color exceeds sRGB.
- **validate/** — a lint engine with pluggable rules, each returning structured diagnostics `{ ruleId, severity, tokenPath, message, fix? }`:
  - `no-broken-references` (error)
  - `no-reference-cycles` (error)
  - `naming-convention` (configurable pattern per token type)
  - `contrast` — WCAG 2.1 AA/AAA and APCA checks for declared foreground/background token pairs
  - `no-orphan-tokens` (warning — token defined but never referenced or exported)
  - `deprecated-usage` (warning — alias points at a `$deprecated` token)
  - `layer-skip` (warning — a `component`-layer token references a `primitive` directly, bypassing the semantic layer)
  - `no-raw-value-in-upper-layers` (warning — `semantic`/`component` tokens should alias, not hardcode values)
  - `ownership-required` (warning — token group has no resolvable owner; see Governance)
  - Rules configurable via `okeytokey.config.json`; support `off/warn/error` levels like ESLint.
- **diff/** — semantic diffing between two `TokenDocument`s: added/removed/renamed/value-changed/type-changed, **plus transitive impact analysis**: for every changed token, compute the full set of downstream tokens whose resolved values change. This powers the "this change affects 47 tokens" UX.
- **refactor/** — `renameToken(path, newPath)` that atomically updates the token and every reference to it across all sets, returning the change set for preview before applying. Also `moveToSet`, `deprecate(path, replacementPath?)`. This is table stakes and free — it is a paid feature in Tokens Studio and users hate that.
- **themes/** — theme = ordered list of (token set, status: enabled/source/disabled). Resolution honors ordering. Theme groups (e.g., "brand" × "mode") with matrix expansion.

Everything here gets heavy unit testing. Target ≥90% line coverage on core with Vitest, including property-based tests (fast-check) for the resolver: random reference graphs must never crash, cycles must always be detected.

### Decision Context (differentiator — build into schema + core + UI)

Every token can carry, under `$extensions["com.okeytokey"]`:

- `guidelines`: markdown usage guidance ("use for primary CTAs only, never on dark surfaces")
- `context`: intended application surface(s)
- `decision`: { author, date, rationale, links[] } — why this value exists
- `lifecycle`: `draft | active | deprecated | archived`, with `replacedBy` path
- `lineage`: generated-from metadata when a token is produced by a scale generator
- `layer`: `primitive | semantic | component` — powers layer-aware linting and docs organization
- `owners`: user/team identifiers for the token or group (inheritable from group/set level)

The UI must surface this everywhere the token appears (list rows, pickers, inspector), not bury it in a details panel. Deprecated tokens render struck-through with their replacement one click away.

### Governance (differentiator — Git-native, not a separate approvals backend)

v1 governance rides on Git rather than reinventing review infrastructure:

- **Ownership rules** in `okeytokey.config.json` (CODEOWNERS-style glob patterns mapping token paths to owners). The lint rule `ownership-required` warns on unowned token groups; the UI shows owners on every token and warns when you edit a token you don't own.
- **Protected changes**: config can mark paths/sets as `requireReview` — the sync layer then refuses direct pushes for changes touching them and routes to branch + pull request instead. Approval happens in the Git host's native PR review.
- **Audit trail**: a history view per token, derived from Git history run through the semantic differ — who changed what, when, with the commit message and PR link. No separate audit database; Git is the audit log.
- **Releases**: tag a token snapshot as a release (`v1.4.0`) with an auto-generated changelog produced by the semantic differ + impact analysis (added/changed/deprecated/removed, with downstream counts). **Rollback**: restore the document to any release or commit, shown first as a dry-run semantic diff like any other change.
- Deprecation workflow ties together: `deprecate(path, replacedBy)` refactor + `deprecated-usage` lint + changelog surfacing + docs badges.

### @okeytokey/sync

Design for reliability and debuggability first — this is Tokens Studio's biggest failure mode.

- `SyncProvider` interface: `authenticate`, `listBranches`, `readTokens`, `writeTokens(changeset, message)`, `createBranch`, `openPullRequest`, `healthCheck`.
- **GitHub implementation** via REST (octokit), fine-grained PAT and GitHub App auth paths.
- **Diagnostics mode**: every sync operation logs a structured trace (request, response status, rate-limit state, resolved refs). A "Connection doctor" runs healthCheck and reports exactly which step failed: auth? repo access? branch resolution? file path? Never surface a bare "There is no branch" — always include what was looked up, what came back, and the most likely fix.
- **Dry-run**: every push shows the semantic diff (from core/diff) + raw file diff before anything is written.
- Local-first: the working copy lives in the browser (IndexedDB via Dexie) and syncs when connected. Conflicts are resolved with a three-way semantic merge UI (base/theirs/ours at token level, not line level), falling back to manual pick per token.

### @okeytokey/transforms

- Wrap Style Dictionary v4. Ship first-party output targets: CSS custom properties (with light-dark() and @media (prefers-color-scheme) strategies), SCSS maps, TS const objects with literal types, Tailwind v4 @theme config.
- **Determinism is a hard requirement**: identical input must produce byte-identical output (stable ordering, no timestamps in file bodies). Enforce with snapshot tests that run the build twice and diff. Noisy diffs destroy trust in the pipeline.
- **Docs generator**: a `docs` output target that renders the token graph — including Decision Context (guidelines, rationale, owners, lifecycle badges), resolved values per theme, contrast results, and reference graphs — into a static documentation site. This turns token metadata into living docs for people who never open the editor. Deprecated tokens show their replacement prominently.
- A `build` command in the studio UI and a standalone CLI (`pnpm okeytokey build`) reading `okeytokey.config.json`, so CI can produce artifacts without the app. The CLI also exposes `okeytokey lint` and `okeytokey diff <ref>` so validation and impact analysis run in CI and PR checks.
- Theme-aware builds: one output per theme, or CSS-variable multiplexing per configuration.

### @okeytokey/ui + apps/studio

- **Design guidance:** a Refactoring UI skill is installed in this project (`.claude/skills/refactoring-ui/`). Consult it before and while building any component or screen in `@okeytokey/ui` or `apps/studio` — apply its principles (visual hierarchy, spacing systems, restrained color, typography scale) as components are written, not as an afterthought. During Phase 6, run a dedicated design audit of every screen against the skill.
- React 19 + Vite. State: **Zustand** stores wrapping core's immutable document + a command-pattern **undo/redo stack** (every mutation is a reversible command; 100-step history).
- Virtualized token list (TanStack Virtual) — must stay smooth at 10,000+ tokens.
- Component architecture: small presentational components in `@okeytokey/ui` (TokenRow, TokenTypeIcon, ColorSwatch with gamut warning, ReferencePill, DiffViewer, DiagnosticsPanel, ContrastBadge), container/feature components in the app. No component over ~200 lines; extract hooks for logic.
- **Editor surfaces**: token tree with drag-to-reorganize; type-specific editors (OKLCH-capable color picker, typography composer, shadow stack editor); an alias picker that searches by resolved value as well as name; inline validation diagnostics with quick-fixes; theme matrix editor; a "What uses this?" panel on every token (reverse reference graph).
- **Guided onboarding**: first-run wizard — import existing DTCG/Tokens Studio JSON, connect Git (with the connection doctor), or start from a starter architecture (primitive → semantic → component tiers scaffolded with examples). Directly attacks Tokens Studio's configuration learning curve.
- Keyboard-first: command palette (cmdk), full shortcuts, list navigable without mouse.
- Accessibility: WCAG 2.1 AA for the app itself; axe checks in CI on key screens.

### apps/figma-plugin + @okeytokey/figma-bridge

- Correct Figma plugin structure: `manifest.json`, main-thread code (`code.ts`, no DOM), UI iframe (React, reusing @okeytokey/ui where feasible), esbuild-based bundling, typed postMessage protocol (define a discriminated-union message schema in figma-bridge; both sides validate with Zod).
- v1 capabilities: load token document (local file or from sync), apply tokens to selected nodes (fills, strokes, corner radius, spacing via auto-layout, typography), export themes to Figma Variables (collections = theme groups, modes = themes), and **remember + reapply the active theme when new component instances enter the document** (listen to document changes) — fixing the theme-persistence complaint.
- **Fidelity contract**: the okeytokey document is always the source of truth; Figma export never mutates it to fit Figma's limits. Every export produces a **fidelity report** listing tokens that cannot round-trip to Figma Variables (unsupported types, composite tokens, opacity/alpha handling, font values, math-derived dimensions) with the reason and the degradation chosen (flattened value, skipped, or mapped to a style instead of a variable). Degradations are visible and per-token, never silent. On import, the mapping report flags anything Figma-side that has no clean token representation instead of guessing.
- Two-way variable import: implement read (Figma Variables → token document) with a mapping report; full continuous sync may be stubbed behind an interface with TODOs.

## Engineering Standards

- TypeScript strict, `noUncheckedIndexedAccess` on. No `any` outside test fixtures.
- Vitest for unit/integration; Playwright for studio E2E (create set → add tokens → alias → theme → export CSS; rename with refactor; sync dry-run against a mocked provider).
- ESLint (typescript-eslint strict) + Prettier + boundaries plugin. Husky pre-commit: lint-staged + typecheck.
- GitHub Actions CI: install → build (turbo cached) → typecheck → lint → test → E2E on the studio.
- Conventional commits + changesets for versioning packages.
- Every package has a README documenting its public API; core has ADRs (architecture decision records) in `docs/adr/` for: resolution semantics, undo model, sync/merge strategy, extension namespace.
- Error handling: no swallowed errors. Core throws typed errors (`TokenResolutionError`, `SyncAuthError`, ...); UI maps every one to actionable copy.

## Phased Delivery

- **Phase 0 — Scaffold.** Monorepo, tooling, CI, empty packages with boundary rules enforced, hello-world studio app running.
- **Phase 1 — Core + Schema.** Parser, resolver (aliases, math, cross-set), color engine, DTCG round-trip. Exhaustive tests incl. property-based.
- **Phase 2 — Studio editor.** Token CRUD, tree, type editors, alias picker, themes, undo/redo, virtualization, DTCG import/export, IndexedDB persistence.
- **Phase 3 — Validation, diff, refactor.** Lint engine + all rules (incl. layer + ownership rules), diagnostics panel, semantic diff + impact analysis UI, rename-with-refactor, decision-context editing.
- **Phase 4 — Sync, governance + transforms.** GitHub provider, connection doctor, dry-run push, three-way merge UI, protected-path PR routing, per-token audit history, releases + changelog + rollback, deterministic Style Dictionary outputs + CLI (`build`, `lint`, `diff`).
- **Phase 5 — Figma plugin.** Bridge protocol, apply-to-selection, variable export with fidelity report, theme persistence on new instances, variable import with mapping report.
- **Phase 6 — Polish + docs.** Onboarding wizard, command palette, a11y pass, performance pass (10k-token benchmark in CI), docs generator output target.

Begin with Phase 0. Show me the proposed `package.json` workspace layout and `turbo.json` before writing application code.
