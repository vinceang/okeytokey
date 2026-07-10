# OkeyToKey Agent Instructions

This file is the canonical guidance for AI coding agents and automated contributors working in this repository.

## Before starting work

1. Read the assigned GitHub issue completely.
2. Read the linked product plan, relevant ADRs, and package-level documentation.
3. Inspect the current implementation before proposing changes. Do not assume an issue description perfectly reflects the latest code.
4. Identify affected packages, dependency boundaries, data contracts, tests, and user-facing workflows.
5. Confirm that the issue has a clear problem, outcome, scope, exclusions, and acceptance criteria. Record material ambiguities or necessary deviations in the pull request.

Primary planning source:

- `docs/planning/product-implementation-plan.md`

Architecture decisions:

- `docs/adr/`

## Product principles

Changes should strengthen at least one of OkeyToKey's core qualities:

- **Trust:** users can see what changes, why, and what is affected.
- **Comprehension:** tokens carry understandable relationships and decision context.
- **Control:** changes remain reviewable, reversible, governable, and deterministic.
- **Interoperability:** DTCG remains canonical; integrations are peers around the core.
- **Local-first ownership:** core workflows must not require an OkeyToKey-hosted backend.
- **Deterministic authority:** importers, Figma, and AI may propose or map data, but schema/core remain authoritative.

## Architecture rules

Respect the dependency boundaries documented in the repository:

- `@okeytokey/schema` depends on no internal package.
- `@okeytokey/core` depends only on schema.
- `sync`, `transforms`, `figma-bridge`, and `ui` may depend on core and schema.
- Applications may depend on packages.
- Packages must never depend on applications.
- Circular dependencies are not acceptable.

Keep domain behavior in headless packages. Do not move parsing, resolution, validation, diffing, refactoring, or mutation authority into Studio or provider-specific code.

## Token and DTCG requirements

- Preserve valid W3C DTCG output.
- OkeyToKey-specific metadata belongs under `$extensions["com.okeytokey"]`.
- Preserve the strip invariant: removing OkeyToKey extensions must leave a valid DTCG document.
- Preserve unknown fields and stable round-tripping where supported.
- Do not silently flatten, skip, rename, or reinterpret token data.
- Integrations and migrations must report fidelity loss explicitly.
- Reference changes must use existing refactor and mutation paths rather than ad hoc string replacement.
- New stable identity metadata, if introduced, must survive renames while remaining extension-scoped.

## AI requirements

AI is an untrusted proposal source.

All mutating AI workflows must follow:

> AI proposes → schema parses → core validates and resolves → diff previews → human approves → core applies

- AI must not directly mutate the active document.
- Provider-specific response structures must not leak into Studio features.
- Reuse canonical core operations instead of adding AI-only mutation logic.
- Deterministic code must calculate validity, cycles, type compatibility, contrast, and impact.
- Users must be able to review and selectively accept operations.
- Cloud transmission must be explicit; credentials must never enter token documents or Git sync.
- Add evaluation fixtures and measurable quality criteria for new AI workflows.

## Git, governance, and releases

- Git is the governance and audit boundary; do not build a parallel approval database without an accepted ADR.
- Protected changes must continue to route through branch and PR flows.
- History, releases, changelogs, and rollback should derive from Git plus semantic diffing.
- Rollback must be previewed as a semantic diff and should not silently reset a repository.
- Preserve useful commit granularity and descriptive commit messages.

## UI and accessibility

- Keep presentational components reusable and domain logic outside view components.
- Follow the repository's established treegrid, command, and state patterns.
- Every interactive feature must be keyboard usable.
- Target WCAG 2.2 AA for new and modified UI.
- Provide non-drag alternatives for drag interactions.
- Preserve visible focus and avoid obscuring focused elements.
- Test dialogs, menus, grids, validation messages, and asynchronous states with assistive technology semantics.
- Never use color alone to communicate state.

For visible UI work, include screenshots or recordings in the PR where practical.

## Performance and determinism

- Preserve usability at 10,000+ tokens.
- Avoid unnecessary full-document recomputation in render paths.
- Prefer memoized selectors, background workers, lazy loading, and cancellation where appropriate.
- Identical transform inputs must produce byte-identical outputs.
- Do not add timestamps, environment-dependent ordering, or unstable serialization to generated file bodies.
- Add performance or determinism regression tests when the issue affects those areas.

## Security and privacy

- Never commit credentials, tokens, provider keys, or private project data.
- Keep provider credentials outside token documents and sync payloads.
- Explain storage behavior for browser-held credentials.
- Sanitize diagnostic exports.
- Avoid adding hosted data collection or telemetry without explicit opt-in and documented privacy behavior.

## Working from an issue

Treat the issue as the agreed product contract, but validate it against current code.

During implementation:

1. Stay within scope unless a required dependency makes a change unavoidable.
2. Document material scope changes in the PR.
3. Add follow-up issues rather than quietly expanding the current ticket.
4. Preserve backward compatibility unless the issue explicitly authorizes a breaking change.
5. Add an ADR for cross-package or long-lived architectural decisions.
6. Update roadmap or planning status when the issue completes a tracked item.

## Definition of done

A change is complete only when applicable items are satisfied:

- [ ] Acceptance criteria are demonstrably met.
- [ ] Invalid input and failure states are handled.
- [ ] Undo, rollback, or recovery behavior is defined.
- [ ] Unit/integration/E2E tests are added or updated.
- [ ] Accessibility is tested.
- [ ] Performance remains within established budgets.
- [ ] Deterministic output is preserved.
- [ ] DTCG portability and extension invariants are preserved.
- [ ] Import/export and Figma fidelity effects are understood and reported.
- [ ] AI behavior is evaluated when applicable.
- [ ] Documentation and ADRs are updated.
- [ ] Required checks pass.

Run the appropriate repository commands before submitting:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm check:boundaries
```

Use narrower commands while iterating, but do not claim full verification unless the full relevant suite was run.

## Pull request expectations

Every PR should:

- Link the issue it implements.
- Explain the delivered outcome, not only the files changed.
- Identify affected packages and architecture.
- State deviations from the issue.
- Include test evidence.
- Describe accessibility, performance, compatibility, migration, security/privacy, and AI impact where applicable.
- Include screenshots for meaningful UI changes.
- List known limitations and follow-up issues.
- Avoid claiming checks passed when they were not run.

When uncertain, prefer a smaller, reviewable change that preserves trust and deterministic behavior.
