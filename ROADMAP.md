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
- **7.2 Local provider** — OpenAI-compatible endpoint adapter + connection UI
  (note: browser CORS — Ollama needs `OLLAMA_ORIGINS`)
- **7.3 First vertical slice** — Generate Semantic Tokens from Primitives, with the
  proposal review UI (diff, per-op acceptance, undo)
- **7.4 Additional workflows** — dark theme, accessibility, renames, aliases, explain
- **7.5 BYOK cloud providers** — Anthropic/OpenRouter first (browser-CORS friendly)
- **7.6 Evaluation + polish**

## Later

- **Lint configuration UI** — `okeytokey.config.json` lint levels and contrast pairs
  are engine-ready; the studio should let you edit them (today: defaults only).
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
- **ReferencePill truncation** — long paths truncate without a visible ellipsis.
