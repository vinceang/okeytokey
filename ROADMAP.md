# Roadmap

v1 (phases 0–6) is complete — see the status table in [README.md](README.md) and the
decisions in [docs/adr/](docs/adr/). This file records what's deliberately deferred,
so it doesn't live only in commit messages. The product source of truth is the
revised PRD at [docs/prd.md](docs/prd.md).

## Gap analysis vs the revised PRD (2026-07)

A code-level audit against [docs/prd.md](docs/prd.md). Phases 0–6 are delivered
(and exceeded in places — treegrid, scale generators, Phase 7 AI are beyond the
PRD), but these PRD commitments are missing, in priority order:

1. **Governance epic** — the PRD's differentiator, largely unbuilt. Decision and
   design recorded in [ADR 0007](docs/adr/0007-git-native-governance.md):
   - `owners` + `layer` fields in the `com.okeytokey` extension schema
     (inheritable from group/set), and ownership globs in `okeytokey.config.json`
   - Missing lint rules: `ownership-required`, `layer-skip`,
     `no-raw-value-in-upper-layers` (6 of the PRD's 9 exist today)
   - Protected paths (`requireReview`) → branch + PR routing in sync
     (subsumes the "PR-based sync flow" item under Later)
   - Per-token audit history: Git history × the semantic differ
   - Releases: tag a snapshot, auto-changelog from diff + impact analysis,
     rollback as a dry-run diff
2. **CLI `lint` + `diff <ref>`** — the PRD wants validation and impact analysis
   in CI/PR checks; the CLI only ships `build`. Engines exist; small.
3. **Determinism enforcement** — outputs look deterministic but the PRD's
   "build twice, byte-identical" snapshot test doesn't exist yet. Tiny.
4. **Docs generator output target** — render the token graph (guidelines,
   rationale, owners, lifecycle badges, per-theme resolved values, contrast
   results) as a static site. The feature that makes Decision Context visible
   to people who never open the editor. Do after governance metadata exists.
5. **Lint configuration UI** — already tracked under Later.

## Near-term

- ~~Theme groups UI + matrix expansion~~ — shipped post-v1 (ADR 0005)
- ~~Drag-to-reorganize the token tree~~ — shipped post-v1
- ~~Docs site with a real user guide~~ — shipped post-v1 (`docs/site/`)
- ~~Solidify round~~ — shipped: numeric scale-step tree sort, set/theme kebab menu
  (guarded delete, rename, sort A→Z, per-set export), `sortTokenSet` core mutation
- ~~Treegrid refactor~~ — shipped in 4 phases: the main view is a Figma-Variables-style
  treegrid (hierarchy in the Name column, themes as value columns). Inherited cells
  dim, overrides full-strength; inline cell editing routes base edits in place and
  writes sparse overrides into the theme's own set elsewhere (hover ↺ resets);
  double-click renames through the refactor; header ＋ adds a mode (set + theme),
  footer ＋ adds a token; ARIA treegrid roles + ←/→/Enter cell keyboard nav.
  Possible follow-up: an "all tokens" union view across sets (rows currently come
  from the active set).
- **Publish `@okeytokey/*` to npm** — changesets are configured; needs a decision on
  the npm scope/org (the unscoped `okeytokey` and `create-okeytokey` names are
  already reserved) and a release workflow.
- **Manual Figma smoke test** — the bridge logic is unit-tested and the main thread
  typechecks against the official plugin typings, but nobody has clicked through the
  plugin inside Figma desktop yet.

## Phase 7 — AI-assisted workflows (in progress)

Spec: [docs/phase-7-spec.md](docs/phase-7-spec.md) · Decisions: ADR 0006.

- ~~7.0 Deterministic Scale Generator~~ — shipped (core `generate/` + studio dialog)
- ~~7.1 `@okeytokey/ai` foundation~~ — shipped (provider interface, proposal
  contract, context assembly, mock provider, contract tests)
- ~~7.2 Local provider~~ + ~~7.5 BYOK cloud providers~~ — shipped as one round:
  `OpenAiCompatibleProvider` (Ollama/LM Studio/OpenRouter presets, key optional)
  and `AnthropicProvider` (browser-CORS via the official SDK), both passing the
  provider contract with scripted fetch; AI Provider settings dialog with
  connection doctor and explicit local-vs-cloud privacy copy. OpenAI-direct
  stays deferred — its API serves no CORS headers, so a browser app can't call
  it without a proxy.
- ~~7.3 First vertical slice~~ — shipped: Generate Semantic Tokens from
  Primitives (⌘K), with scope + instruction input, honest context counts,
  per-operation review with core-validation results, selective acceptance,
  and single-undo apply via `cmdApplyFix`
- **7.4 Additional workflows** — dark theme, accessibility, renames, aliases, explain
- **7.6 Evaluation + polish**

## Later

- **Lint configuration UI** — `okeytokey.config.json` lint levels and contrast pairs
  are engine-ready; the studio should let you edit them (today: defaults only).
- ~~Export-time unit transform (px → rem)~~ — shipped: `transformEntries` in
  `@okeytokey/transforms` (format-agnostic, configurable base), surfaced as a
  "Convert px to rem" checkbox in the export dialog. (CLI/build wiring still
  possible via an `okeytokey.config.json` transform flag — not yet exposed.)
- **Google Fonts live previews + full catalog** — the New Token dialog bundles a
  curated static family list (offline, no key). Live previews mean loading
  stylesheets from fonts.googleapis.com; the full searchable catalog needs the
  Google Fonts metadata API and a key. Both deferred pending a decision on the
  key and the network posture.
- ~~Type/spacing scale generators~~ — shipped: `planDimensionScale` (modular
  base × ratio scale) + "Generate spacing / size scale…" dialog with ratio presets.
- **Additional sync providers** — GitLab / Azure DevOps / Bitbucket behind the
  existing `SyncProvider` interface.
- **Continuous two-way Figma variable sync** — read and write paths exist; live sync
  needs change detection on both sides (TODO in `apps/figma-plugin/src/main/code.ts`).
- **Tokens Studio migration niceties** — plain DTCG files import today; Tokens
  Studio's proprietary fields (`$themes`, math in strings already works) could get a
  dedicated mapping pass with a report.
- **PR-based sync flow** — `createBranch` + `openPullRequest` exist on the provider;
  the studio always pushes to the configured branch. A "propose changes as PR"
  toggle would suit protected branches. Superseded by the governance epic's
  protected-path PR routing (gap analysis item 1, ADR 0007).
