# ADR 0007: Git-native governance

**Status:** Accepted — implementation pending (see [ROADMAP](../../ROADMAP.md), "Gap analysis")

## Context

The revised PRD ([docs/prd.md](../prd.md)) positions governance — ownership,
approvals, audit, releases — as a core differentiator: "tokens that stay
correct, understandable, and governable from design to code." A 2026-07 gap
analysis found this pillar largely unbuilt: the schema has no `owners` or
`layer` fields, three of the PRD's nine lint rules are missing
(`ownership-required`, `layer-skip`, `no-raw-value-in-upper-layers`), the sync
layer never routes protected changes through pull requests despite
`createBranch`/`openPullRequest` existing on the provider, and there is no
audit history, release tagging, changelog, or rollback.

The design question: build approvals/audit infrastructure of our own, or ride
on Git?

## Decision

Governance rides on Git rather than reinventing review infrastructure. No
separate approvals backend, no audit database.

- **Ownership** is data, not access control: CODEOWNERS-style glob patterns in
  `okeytokey.config.json` map token paths to owners; `owners` (and `layer`)
  join the `$extensions["com.okeytokey"]` namespace (per ADR 0002, inheritable
  from group/set level). The `ownership-required` lint rule warns on unowned
  groups; the UI shows owners everywhere the token appears and warns — but
  does not block — when editing a token you don't own.
- **Layering** (`primitive | semantic | component`) powers the `layer-skip`
  and `no-raw-value-in-upper-layers` rules, keeping the alias architecture
  honest without hard enforcement.
- **Protected changes**: config marks paths/sets `requireReview`; the sync
  layer refuses direct pushes touching them and routes to branch + pull
  request. Approval happens in the Git host's native PR review — we never
  duplicate reviewer/approval state.
- **Audit trail** is derived, not stored: per-token history = Git history run
  through the semantic differ (who, what, when, commit message, PR link).
- **Releases** are Git tags over a token snapshot, with an auto-generated
  changelog from the semantic differ + impact analysis. **Rollback** restores
  the document to any release/commit, always previewed as a dry-run semantic
  diff first.

## Consequences

- No new backend or auth model; the Git host's permissions and review flow are
  the enforcement layer. okeytokey's job is to make the right path the easy
  path (PR routing, dry-run diffs) and to make state visible (owners, badges,
  history).
- Ownership warnings without enforcement keep local-first editing frictionless;
  hard enforcement arrives naturally at the PR boundary via CODEOWNERS on the
  Git host, if teams want it.
- Derived audit history is only as good as commit granularity — the studio's
  descriptive commit messages and dry-run-per-push flow (ADR 0004) matter more
  once history is a user-facing feature.
- Schema additions (`owners`, `layer`) must preserve the ADR 0002
  strip-invariant: a file stripped of `$extensions` stays valid DTCG.
- Sequencing follows from the dependencies: schema fields + lint rules first,
  then PR routing, then history/releases UI (see ROADMAP priorities).
