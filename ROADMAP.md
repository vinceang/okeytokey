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

## Later

- **Lint configuration UI** — `okeytokey.config.json` lint levels and contrast pairs
  are engine-ready; the studio should let you edit them (today: defaults only).
- **Scale generators** — the `lineage` extension field anticipates generated ramps
  (modular type scales, OKLCH color ramps); no generator exists yet.
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
