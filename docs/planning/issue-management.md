# Issue Management Guidance

Use GitHub issues to turn the product plan into reviewable, sequenced outcomes without creating a ticket for every checklist item.

## Hierarchy

### Milestone = release

Use milestones for release-level outcomes such as:

- `0.8 — Trustworthy Preview`
- `0.9 — Migration and Interoperability`
- `0.10 — Governance Complete`
- `0.11 — Trusted AI Workflows`
- `1.0 — Public Stable`

### Issue = meaningful deliverable

Create an implementation issue for a feature, platform capability, or independently reviewable engineering outcome. Examples:

- Enforce deterministic transform outputs
- Define stable token identity
- Build Tokens Studio migration engine
- Implement per-token Git history
- Generate static token documentation

An issue should describe a user or platform outcome, not merely a file edit.

### Checklist or sub-issue = implementation task

Keep small tasks within the parent issue unless they require separate sequencing, ownership, review, or release tracking.

Examples:

- Add a fixture
- Update one piece of copy
- Add a test case
- Rename an internal helper

## Issue types

- **Implementation:** the problem and intended outcome are understood well enough to build.
- **Discovery:** material uncertainty must be resolved before implementation or an ADR is required.
- **Bug:** observed behavior differs from expected behavior and can be reproduced or evidenced.

Use Discussions for early ideas and questions that are not ready to become committed work, when repository Discussions are enabled.

## Planning depth

Keep the current release detailed. For later releases, create high-level epics and discovery tickets rather than prematurely specifying implementation details that may become stale.

A useful planning horizon is:

- Current release: scoped implementation issues with acceptance criteria
- Next release: architectural discovery plus major epics
- Later releases: placeholder epics tied to outcomes

## Required quality

Implementation issues should define:

- Problem
- Desired outcome
- In scope
- Out of scope
- Architecture and affected areas
- Acceptance criteria
- Accessibility
- Performance
- Compatibility and fidelity
- AI impact where applicable
- Security and privacy
- Test plan
- Dependencies
- Target release
- Documentation requirements

Do not invent irrelevant requirements merely to fill a form. Select the appropriate “none” option and explain briefly when a category does not apply.

## Agent execution

Agents implementing an issue must follow [`AGENTS.md`](../../AGENTS.md). The issue is the agreed product contract, but agents must verify it against the current repository, document deviations, and create follow-up issues rather than silently expanding scope.

## Pull requests

Every implementation PR should link its issue and use `.github/pull_request_template.md` to report:

- Delivered outcome
- Scope and deviations
- Architecture affected
- Test evidence
- Accessibility and performance impact
- DTCG and fidelity impact
- AI and privacy impact
- Documentation and release changes
- Known limitations and follow-ups

## Source of truth

The product direction and release sequence live in [`product-implementation-plan.md`](./product-implementation-plan.md). Issues operationalize that plan; they do not replace it.
