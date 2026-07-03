# Roadmap

v1 (phases 0–6) is complete — see the status table in [README.md](README.md) and the
decisions in [docs/adr/](docs/adr/). This file records what's deliberately deferred,
so it doesn't live only in commit messages.

## Near-term

- ~~Theme groups UI + matrix expansion~~ — shipped post-v1 (ADR 0005)
- ~~Drag-to-reorganize the token tree~~ — shipped post-v1
- ~~Docs site with a real user guide~~ — shipped post-v1 (`docs/site/`)
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
- **Export-time unit transform (px → rem)** — the editor's px/rem switcher rewrites
  source files; the global "I want rem in my shipped CSS regardless of authoring
  unit" belongs in the export pipeline as a Style-Dictionary-style transform with a
  configurable root size.
- **Google Fonts live previews + full catalog** — the New Token dialog bundles a
  curated static family list (offline, no key). Live previews mean loading
  stylesheets from fonts.googleapis.com; the full searchable catalog needs the
  Google Fonts metadata API and a key. Both deferred pending a decision on the
  key and the network posture.
- **Type/spacing scale generators** — extend Phase 7.0's color Scale Generator to
  modular type scales and spacing ramps.
- **Additional sync providers** — GitLab / Azure DevOps / Bitbucket behind the
  existing `SyncProvider` interface.
- **Continuous two-way Figma variable sync** — read and write paths exist; live sync
  needs change detection on both sides (TODO in `apps/figma-plugin/src/main/code.ts`).
- **Tokens Studio migration niceties** — plain DTCG files import today; Tokens
  Studio's proprietary fields (`$themes`, math in strings already works) could get a
  dedicated mapping pass with a report.
- **PR-based sync flow** — `createBranch` + `openPullRequest` exist on the provider;
  the studio always pushes to the configured branch. A "propose changes as PR"
  toggle would suit protected branches.
