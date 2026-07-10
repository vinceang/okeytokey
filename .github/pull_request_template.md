## Linked issue

Closes #

## Outcome

Describe the user or platform outcome delivered. Explain why this change exists, not only which files changed.

## Scope

### Included

- 

### Not included

- 

## Implementation

Summarize the approach and important design choices.

### Affected areas

- [ ] `@okeytokey/schema`
- [ ] `@okeytokey/core`
- [ ] `@okeytokey/sync`
- [ ] `@okeytokey/transforms`
- [ ] `@okeytokey/ui`
- [ ] `@okeytokey/figma-bridge`
- [ ] `@okeytokey/ai`
- [ ] Studio
- [ ] Figma plugin
- [ ] CLI
- [ ] Documentation/process only

### Architecture and ADRs

List relevant ADRs. Explain any new dependency, data contract, extension field, persistent-state change, or long-lived architectural decision.

## Issue deviations

Describe any material difference from the linked issue, including reduced or expanded scope. Use follow-up issues for work that does not belong in this PR.

## Validation

Check only commands or tests actually run.

- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e`
- [ ] `pnpm check:boundaries`
- [ ] Package-scoped tests
- [ ] Manual testing
- [ ] Not applicable — documentation/process only

### Test evidence

Describe new or updated unit, property, integration, E2E, migration, determinism, performance, provider, or manual tests. Include commands and relevant results.

## Product quality

### Accessibility

- [ ] No UI impact
- [ ] Keyboard behavior tested
- [ ] Focus behavior tested
- [ ] Screen-reader semantics reviewed
- [ ] Contrast and non-color communication reviewed
- [ ] Drag interaction has a non-drag alternative
- [ ] Axe/Playwright coverage added or updated

Details:

### Performance and determinism

State the impact on large documents, rendering, validation, diffing, sync, builds, or provider latency. Include benchmarks where required.

- [ ] No meaningful performance impact
- [ ] Existing 10,000-token behavior preserved
- [ ] Benchmark or performance test added/updated
- [ ] Generated output remains byte-deterministic

### DTCG compatibility and fidelity

Explain effects on DTCG validity, extension metadata, round-tripping, migrations, exports, Figma mapping, and unknown fields.

- [ ] The strip-to-valid-DTCG invariant is preserved
- [ ] No silent data or fidelity loss
- [ ] Compatibility/migration behavior is tested or documented
- [ ] Not applicable

### AI behavior

- [ ] No AI impact
- [ ] AI remains proposal-only and human-reviewed
- [ ] Schema/core validation remains authoritative
- [ ] Evaluation fixtures or quality checks added/updated
- [ ] Provider/context/privacy behavior documented

Details:

### Security and privacy

Describe credential handling, storage, network transmission, diagnostics, permissions, or telemetry impact.

- [ ] No credentials or private data are committed
- [ ] Secrets remain outside token documents and sync payloads
- [ ] Diagnostics are sanitized
- [ ] No new telemetry, or telemetry is explicit opt-in
- [ ] Not applicable

## UI evidence

Add screenshots or recordings for meaningful Studio or Figma-plugin changes. Include empty, loading, error, disabled, and large-data states where relevant.

## Documentation and release impact

- [ ] User documentation updated
- [ ] API/package documentation updated
- [ ] ADR created or updated
- [ ] `ROADMAP.md` or planning status updated
- [ ] Changeset added for version-relevant package changes
- [ ] Migration/release notes added
- [ ] No documentation or release update required

## Known limitations

- 

## Follow-up issues

- 

## Final checklist

- [ ] Acceptance criteria in the linked issue are met
- [ ] Failure and recovery behavior is defined
- [ ] Undo/rollback behavior is preserved or documented
- [ ] Architectural boundaries remain valid
- [ ] Claims above match the checks actually performed
