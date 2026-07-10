# OkeyToKey Product & Implementation Plan

**Repository:** `vinceang/okeytokey`  
**Planning horizon:** Post-v1 through credible public launch and enterprise-ready foundation  
**Status baseline:** v1 phases 0–6 complete; Phase 7 AI foundation and first vertical slice substantially implemented

---

## 1. Executive Direction

OkeyToKey should not compete as “another token editor” or “Tokens Studio with AI.”

Its strongest product position is:

> **The Git-native control plane for design tokens—where AI proposes, deterministic systems validate, and teams retain context, governance, and control from design to code.**

The next implementation cycle should optimize for **trust, migration, interoperability, and adoption**, not raw feature count.

### Strategic sequence

1. **Make the existing product undeniably reliable**
2. **Make switching from Tokens Studio easy**
3. **Complete the Git-native governance loop**
4. **Make Figma interoperability production-grade**
5. **Expand AI only through evaluated, task-specific workflows**
6. **Package, document, publish, and launch**
7. **Add collaboration and enterprise capabilities only after real usage validates them**

---

## 2. Current Product Baseline

OkeyToKey already has a strong technical foundation:

- W3C DTCG-native schema and document model
- Headless TypeScript core
- Parsing, resolution, validation, diffing, and refactoring
- Theme groups and matrix combinations
- Figma-Variables-style treegrid
- Token CRUD, drag/reorganization, persistence, undo/redo
- Multi-project Studio
- GitHub sync abstraction
- Protected-path PR routing
- Style Dictionary exports
- CLI build, lint, and semantic diff
- Figma bridge and plugin architecture
- Decision Context metadata
- Ownership and layer metadata
- Layer- and ownership-aware linting
- AI provider abstraction
- Local/OpenAI-compatible and Anthropic providers
- Semantic-token generation workflow
- Selective AI proposal acceptance through the normal mutation path
- Automated unit, integration, accessibility, performance, and E2E testing

This means the project is beyond MVP. The challenge is now turning a technically broad implementation into a coherent product that people can trust and adopt.

---

## 3. Product Principles

Every new feature should satisfy at least one of these:

### 3.1 Trust

The user can see what will change, why, what depends on it, and whether the result is valid.

### 3.2 Comprehension

Tokens carry names, values, relationships, rationale, ownership, lifecycle, and usage guidance.

### 3.3 Control

Users can review, selectively apply, undo, version, approve, release, and roll back changes.

### 3.4 Interoperability

DTCG remains canonical. Figma, Git, Style Dictionary, Tailwind, SCSS, TypeScript, and migration sources are peers around the core.

### 3.5 Local-first ownership

A user can work without creating an OkeyToKey account or sending proprietary design-system data to an OkeyToKey server.

### 3.6 Deterministic authority

AI, Figma, and importers may propose or map data. The schema and core remain authoritative.

---

## 4. Target Users and Jobs

### Design-system lead

- Establish a token architecture
- Govern naming, layers, ownership, and lifecycle
- Understand impact before approving changes
- Create themes and brands without duplication
- Publish documentation and releases

### Product designer

- Work in a familiar grid and theme model
- Use tokens in Figma reliably
- Understand what a token means and where it should be used
- Generate or adjust themes safely
- Avoid breaking code consumers

### Front-end engineer

- Consume deterministic outputs
- Validate tokens in CI
- Review semantic token diffs in pull requests
- Trace changes and downstream impact
- Integrate CSS, SCSS, TS, Tailwind, and Storybook

### DesignOps / platform owner

- Define ownership and protected areas
- Enforce review at the Git boundary
- Publish releases and changelogs
- Audit who changed a token and why
- Migrate teams from legacy token workflows

### Solo product builder

- Start locally
- Import or generate a token architecture
- Use AI with local models or BYOK
- Export production-ready code
- Avoid SaaS lock-in

---

## 5. North-Star Product Loop

```text
Import / Create
      ↓
Understand architecture and context
      ↓
Edit manually or request an AI proposal
      ↓
Validate references, layers, types, contrast, and ownership
      ↓
Preview semantic and raw diffs
      ↓
Understand downstream impact
      ↓
Apply selectively and undo safely
      ↓
Sync directly or route protected changes to a PR
      ↓
Review and approve in Git
      ↓
Release a version
      ↓
Generate code and documentation
      ↓
Trace history or roll back when needed
```

The implementation plan should close this loop before adding unrelated breadth.

---

# 6. Implementation Program

## Program A — Reliability and Product Hardening

**Goal:** Establish a release-quality baseline before positioning OkeyToKey as a replacement for an existing workflow.

### A1. Deterministic build enforcement

- Add build-twice snapshot tests for every first-party output target
- Remove timestamps, unstable object traversal, and environment-sensitive ordering
- Add fixtures with multiple sets, themes, aliases, composite values, and deprecated tokens
- Run determinism tests in CI
- Produce actionable diffs when determinism fails

**Acceptance criteria**

- Two clean builds from identical input are byte-identical
- Tests run across CSS, SCSS, TypeScript, Tailwind, and documentation outputs
- CI blocks nondeterministic output

### A2. Error and recovery audit

Review import failures, invalid-document recovery, sync and credential errors, IndexedDB problems, AI-provider failures, partial exports, Figma mapping failures, and undo after complex operations.

**Acceptance criteria**

- No user-facing raw exception messages
- Every failure identifies the failed step and suggested recovery
- Destructive recovery actions require confirmation
- The current working document is not lost during failures

### A3. Large-system performance certification

Extend the existing 10,000-token benchmark into workflow-level budgets:

- Project open: target under 2 seconds on a representative modern laptop
- Search/filter: target under 100 ms after debounce
- Common semantic diff: target under 1 second
- Full validation: target under 2 seconds, preferably worker-backed
- Theme switching: visually immediate
- Review of 100-operation AI proposals: smooth and selectively interactive

### A4. Accessibility upgrade

Move the product standard from WCAG 2.1 AA to **WCAG 2.2 AA**, covering focus appearance, focus not obscured, target size, dragging alternatives, consistent help, treegrid screen-reader behavior, reduced motion, and high-contrast modes.

---

## Program B — Tokens Studio Migration and Competitive Onboarding

**Goal:** Make OkeyToKey an actionable replacement, not merely a conceptual alternative.

### B1. Compatibility matrix

Document support for plain DTCG JSON, Tokens Studio sets, `$themes`, `$metadata`, proprietary extensions, math expressions, set ordering, theme groups, inherited types, composite tokens, naming conventions, and ambiguous constructs.

### B2. Dedicated migration engine

```text
@okeytokey/migrate
  tokens-studio/
  legacy-dtcg/
  report/
```

```ts
interface MigrationResult {
  document: TokenDocument;
  report: MigrationReport;
  warnings: MigrationWarning[];
  unresolved: MigrationIssue[];
}
```

### B3. Migration wizard

1. Choose source
2. Upload files or folder
3. Detect format and related files
4. Preview sets and themes
5. Show mappings and warnings
6. Resolve ambiguous cases
7. Validate converted document
8. Compare source and converted resolved values
9. Create an OkeyToKey project
10. Offer Git connection and first export

### B4. Fidelity report

For every issue show the source path, source construct, converted representation, resolved-value impact, severity, and recommended manual action.

### B5. Fixture suite

Include single-theme, multi-brand, multi-mode, alias-heavy, composite-heavy, broken, large, and proprietary-feature projects.

**Exit gate:** A representative Tokens Studio project can migrate with supported resolved values preserved and every degradation made explicit.

---

## Program C — Production-Grade Figma Integration

**Goal:** Turn the existing bridge architecture into a dependable daily workflow.

### C1. Manual smoke-test program

Verify in Figma desktop:

- Collections and modes export
- Color fills and strokes
- Spacing and corner radius
- Typography
- Active-theme reapplication to inserted instances
- Unsupported-token reporting
- Plugin reopen and state recovery
- Large-document behavior
- Team-library and local-variable constraints

Record expected behavior, actual behavior, Figma limitations, OkeyToKey behavior, and fidelity-report results.

### C2. Mapping registry

```ts
interface FigmaMappingRule {
  tokenType: DtcgTokenType;
  target: "variable" | "style" | "unsupported";
  convert(...): MappingResult;
  roundTrip(...): RoundTripResult;
}
```

Centralize import/export mapping so the two directions cannot drift.

### C3. Fidelity report UI

Classify each mapping as exact, flattened, style-mapped, partially supported, skipped, or requiring a user decision. Never silently flatten or omit.

### C4. Stable identity mapping

Add or confirm stable OkeyToKey IDs under extensions and map them to Figma variable/plugin data. Renames should preserve identity whenever possible.

### C5. Explicit synchronization model

Before continuous sync, ship a staged workflow:

1. Compare
2. Show Figma-only and OkeyToKey-only changes
3. Detect conflicts
4. Select direction per item
5. Preview resulting token diff
6. Apply
7. Persist mapping state

### C6. Continuous sync

Only after staged sync is reliable: detect changes on both sides, track a base snapshot, resolve conflicts semantically, avoid loops, expose stale mappings, and keep the behavior opt-in.

**Exit gate:** Designers can round-trip supported primitives and themes without silent degradation or rename breakage.

---

## Program D — Complete Git-Native Governance

**Goal:** Deliver the defining enterprise differentiation promised by the PRD.

### D1. Per-token audit history

Extend `SyncProvider` for Git history, retrieve historical token files, run semantic diffs, attribute token-level changes, and link commits and PRs.

The token history UI should show author, date, commit, PR, before/after resolved values, path/type/lifecycle changes, downstream impact, and Decision Context changes.

### D2. Release model

```ts
interface TokenRelease {
  version: string;
  tag: string;
  commitSha: string;
  createdAt: string;
  notes?: string;
  summary: ReleaseDiffSummary;
}
```

Release flow:

1. Select baseline
2. Validate current document
3. Calculate semantic diff and impact
4. Recommend semver level
5. Confirm version
6. Generate changelog
7. Tag commit
8. Build artifacts
9. Optionally create a GitHub Release

### D3. Changelog generation

Categorize added, changed, renamed, deprecated, removed, type changes, theme changes, and governance/context changes. Mark potentially breaking changes and include downstream impact.

### D4. Rollback

Choose a release or commit, preview the semantic diff, show impact, create a restoration branch, and open a PR by default for protected projects. Never silently reset the repository.

### D5. Ownership UX

Add owner filters, “My owned tokens,” unowned coverage, owners in proposal reviews, reviewer suggestions, inherited-state explanations, and coverage by set/layer.

**Exit gate:** A team can identify ownership, require review, inspect history, release, generate a changelog, and propose a rollback without an OkeyToKey backend.

---

## Program E — Documentation as a Product Surface

**Goal:** Turn Decision Context and token relationships into useful living documentation.

### E1. Static docs output

Generate a token index, layer/group navigation, search, values per theme, guidelines, rationale, owners, lifecycle, replacements, alias chains, reverse dependencies, contrast results, fidelity notes, and release version.

### E2. Focused reference graphs

Start with upstream dependencies, downstream consumers, alias chains, and changed-token impact rather than a single unreadable global graph.

### E3. Framework-neutral output

Produce static HTML without a server dependency. Later adapters may target Storybook, Docusaurus, zeroheight, Markdown, or MDX.

### E4. Documentation quality gates

Warn for active semantic tokens without guidance, deprecated tokens without replacements, missing owners/layers, or missing rationale on protected paths.

**Exit gate:** A stakeholder who never opens Studio can understand usage, relationships, ownership, lifecycle, and current release state.

---

## Program F — AI Workflow Expansion with Evaluation

**Goal:** Make AI a trusted accelerator, not a novelty layer.

### F1. Evaluation harness

Every mutating workflow needs fixture-based evaluation for schema validity, reference validity, cycles, type compatibility, naming, alias reuse, duplication, contrast, minimality, unrelated-token preservation, latency, and context size.

Test with deterministic mocks, recorded responses, opt-in live providers, local small models, and stronger cloud models.

### F2. Dark-theme generation

Inputs should include the light theme, semantic scope, available primitives, contrast pairs, brand constraints, and optional tone direction. Deterministic logic should calculate contrast and candidate primitives; AI selects and explains mappings; core proves validity.

### F3. Accessibility repair

Support constrained goals such as smallest change, reuse an existing primitive, preserve hue, preserve brand color, repair a state family, or optimize for WCAG/APCA. Core generates and verifies candidates; AI ranks and explains them.

### F4. Naming and refactoring assistant

Infer conventions, identify outliers, group suggestions, propose renames, apply authoritative core refactors, preview impact, and support selective acceptance.

### F5. Alias architecture assistant

Detect raw values in upper layers, repeated and near-duplicate values, layer skips, aliases with matching resolved values, and candidate semantic roles.

### F6. Explain mode

Explain token purpose, reference chains, impact, lint diagnostics, theme differences, and release summaries. Ground factual claims in deterministic core data and label interpretations as inferred.

### F7. Transparency

Expose provider/model, local or cloud status, context summary, token count transmitted, included data categories, latency, cancellation, and the raw structured proposal for debugging.

**Exit gate:** Every AI workflow has measurable quality criteria, deterministic validation, selective acceptance, and demonstrated value beyond a scripted wizard.

---

## Program G — Conflict Resolution and Sync Maturity

**Goal:** Make Git sync a reason to choose OkeyToKey.

### G1. Three-way semantic merge

Support base/ours/theirs conflict classes including edit/edit, rename/edit, delete/edit, set move/edit, theme-order conflicts, metadata-only conflicts, and non-token JSON conflicts.

### G2. Merge UI

Show base, ours, theirs, resolved preview, alias validity, impact, ours/theirs selection, manual editing, and bulk resolution of similar conflicts.

### G3. Sync trace viewer

Show operation timeline, repository/branch/path, base SHA, status, rate limits, changed files, PR-routing reason, and a sanitized downloadable diagnostic report.

### G4. GitHub App path

Keep fine-grained PAT support while adding an optional GitHub App for guided installation and clearer permissions. Do not require an OkeyToKey account unless technically necessary.

---

## Program H — Packaging, Distribution, and Launch

**Goal:** Make the project installable, understandable, and credible.

### H1. Package publication

Publish public packages with provenance using Changesets. Decide the npm organization/scope and define support guarantees.

Initial candidates:

- `@okeytokey/schema`
- `@okeytokey/core`
- `@okeytokey/transforms`
- `@okeytokey/sync`
- `@okeytokey/figma-bridge`
- `@okeytokey/ai`
- CLI package
- Migration package

### H2. CLI

```bash
npx okeytokey init
npx okeytokey build
npx okeytokey lint
npx okeytokey diff <ref>
npx okeytokey migrate tokens-studio
npx okeytokey doctor
```

### H3. Hosted Studio

Deploy the static app with no account required, clear storage/privacy explanations, sample projects, import-first onboarding, offline/PWA consideration, and visible application versioning.

### H4. Figma Community release

Require a completed smoke test, privacy statement, explicit fidelity limitations, sample document, guided first run, compatibility policy, and support link.

### H5. Public documentation

Cover quick start, migration, architecture, themes, Figma, Git, governance, CLI/CI, AI/privacy, package APIs, troubleshooting, ADRs, and contribution.

### H6. Reference project

Ship a polished system containing primitive/semantic/component layers, light/dark, multiple brands or densities, context, ownership, deprecation, Figma export, CSS/TS/Tailwind outputs, generated docs, AI proposal walkthrough, and release history.

---

# 7. Release Plan

## Release 0.8 — Trustworthy Preview

**Scope**

- Deterministic build tests
- Error/recovery audit
- WCAG 2.2 AA audit
- Performance budgets
- Manual Figma smoke testing
- AI evaluation foundation
- Documentation cleanup
- Hosted preview and reference project

**Exit criteria**

- CI enforces deterministic outputs
- No known data-loss bugs
- Figma limitations are based on actual testing
- Core workflows pass accessibility audit
- Public demo works without setup

## Release 0.9 — Migration and Interoperability

**Scope**

- Tokens Studio migration engine and wizard
- Migration and fidelity reports
- Stable Figma identity mapping
- Figma mapping registry
- Staged Figma compare/sync
- Migration fixtures and onboarding

**Exit criteria**

- Representative projects migrate successfully
- Supported resolved values remain equivalent
- Unsupported constructs are explicit
- Figma round trips do not silently degrade

## Release 0.10 — Governance Complete

**Scope**

- Per-token Git history
- Release tagging
- Semantic changelogs
- Semver recommendation
- Rollback-as-PR
- Ownership dashboards
- Static documentation output
- Decision Context completeness reporting

**Exit criteria**

- Edit → PR → approval → release → docs → history works end to end
- Protected changes cannot accidentally direct-push
- Rollback is previewable and non-destructive

## Release 0.11 — Trusted AI Workflows

**Scope**

- Dark-theme generation
- Accessibility repair
- Naming/refactoring assistant
- Alias architecture assistant
- Explain mode
- Provider/model evaluation
- Cancellation, retry, latency, and privacy UX

**Exit criteria**

- Every workflow has fixtures and metrics
- No AI path bypasses core validation or mutation
- Selected workflows remain viable on local models
- Cloud transmission is transparent

## Release 1.0 — Public Stable

**Scope**

- npm packages and CLI
- Figma Community plugin
- Hosted local-first Studio
- GitHub App or refined PAT onboarding
- Three-way semantic merge
- Complete documentation
- Reference project and migration guide
- Security/privacy documentation
- Stable extension compatibility policy

### 1.0 promise

- Portable DTCG documents
- No silent Figma degradation
- Deterministic builds
- Safe rename/refactor
- Semantic diff and impact analysis
- Reviewable AI
- Git-native governance
- Backward-compatible extension migration policy

---

# 8. Prioritized Backlog

## P0 — Release blockers

- Deterministic output enforcement
- Manual Figma smoke test
- Data-loss and recovery audit
- Stable IDs for Figma and historical tracking
- Migration-format research
- AI evaluation harness
- Hosted demo and reference project

## P1 — Competitive essentials

- Tokens Studio migration wizard
- Fidelity reports
- Per-token history
- Releases and changelogs
- Docs generator
- Staged Figma synchronization
- Three-way semantic merge
- npm/CLI publication

## P2 — Differentiators

- Dark-theme AI
- Accessibility repair assistant
- Ownership coverage dashboard
- Alias architecture assistant
- Explain mode
- Rollback-as-PR
- Storybook/MDX docs integration
- GitHub App onboarding

## P3 — Expansion

- GitLab, Azure DevOps, and Bitbucket
- Continuous Figma sync
- Organization policies
- Hosted collaboration
- Managed inference
- SSO
- Central project catalog
- Analytics

---

# 9. Explicit Non-Goals Until After 1.0

- Generic AI chat as the primary interface
- A proprietary token format
- Replacing Git-host review systems
- Real-time multi-user editing
- A mandatory cloud backend
- Billing and managed inference
- Large template marketplaces
- Broad asset management
- Full component authoring
- Competing with Figma as a design tool
- Supporting every edge case before migration evidence proves demand

---

# 10. Architecture Workstreams

## Core

- Stable token identity
- Determinism utilities
- Historical semantic diff
- Three-way semantic merge
- Release classification
- Accessibility and alias candidate generation

## Schema

- Version OkeyToKey extensions
- Stable IDs
- Migration provenance
- Compatibility metadata where appropriate
- Preserve the strip-to-valid-DTCG invariant

## Sync

- History APIs
- Tags/releases
- PR links
- Semantic merge
- GitHub App authentication
- Diagnostic export

## Transforms

- Determinism tests
- Documentation output
- Release-aware metadata
- Framework adapters
- Artifact manifests/checksums

## Figma bridge/plugin

- Mapping registry
- Stable IDs
- Fidelity reporting
- Compare/sync
- Conflict resolution
- Continuous sync later

## AI

- Evaluation harness
- Task registry
- Context inspection
- Candidate-assisted workflows
- Capability fallbacks
- Cancellation and retry
- Cost/token estimates where available

## Studio

- Migration wizard
- History and releases
- Documentation preview
- Ownership dashboard
- Sync conflict UI
- Figma reports
- AI workflow entry points
- Privacy-preserving, opt-in telemetry only

---

# 11. Engineering Delivery Model

## Epic template

Each epic should define:

- User problem
- Product outcome
- Architectural owner
- UX flow
- Data contracts
- Failure modes
- Accessibility requirements
- Performance budget
- Security/privacy implications
- Test plan
- Evaluation or telemetry plan
- Documentation requirement
- Release gate

## Definition of done

A feature is done only when:

- Core behavior has tests
- Invalid input is handled
- Undo/rollback behavior is defined
- Accessibility is tested
- Performance is within budget
- Documentation is updated
- Diagnostics exist
- Import/export effects are understood
- DTCG portability is preserved
- AI behavior, if present, is evaluated
- CI passes

## Delivery discipline

- Short-lived branches
- Changesets for package-facing changes
- ADRs for cross-package architectural decisions
- Feature flags for incomplete surfaces
- Release candidates before stable tags
- Reference-project dogfooding on every release

---

# 12. Success Metrics

Because the product is local-first, prefer opt-in telemetry, issue templates, and structured usability sessions.

## Activation

- First project created/imported
- Successful validation
- First production export
- Git connection or artifact download
- Figma import/export

## Migration

- Projects with zero unresolved errors
- Fidelity warning classes
- Time to migration
- Resolved-value equivalence

## Trust

- Changes previewed before application
- Undo rate after AI proposals
- Sync recovery rate
- Deterministic build pass rate
- Silent degradation count: zero

## Governance

- Ownership coverage
- Protected PR routing success
- Releases created
- Deprecated tokens with replacements
- Decision Context coverage

## AI quality

- Proposal parse success
- Core validation pass rate
- Selective acceptance and rejection rates
- Revision count
- Contrast-fix success
- Preservation of unrelated tokens
- Local-model completion success

## Product quality

- Crash-free sessions
- Data-loss incidents: zero target
- Figma mapping defects
- Import/export defects
- Accessibility violations
- Performance regressions

---

# 13. Recommended Immediate Sprint Sequence

## Sprint 1 — Baseline and release discipline

- Establish `0.8` target
- Add plan tracking
- Add deterministic transform tests
- Create reference-system fixture
- Audit TODOs and stale roadmap statements
- Run full Figma smoke test
- File resulting defects

## Sprint 2 — Stable identity and fidelity

- Design stable token-ID extension
- Write identity ADR
- Implement mapping registry
- Implement initial fidelity-report model
- Add Figma round-trip fixtures

## Sprint 3 — Migration foundation

- Inventory Tokens Studio formats
- Build migration parser
- Produce CLI report
- Add fixtures
- Compare resolved values before and after conversion

## Sprint 4 — Migration UX

- Wizard
- Warning resolution
- Project creation
- First validation/export
- Migration documentation

## Sprint 5 — History foundation

- Extend sync provider for history
- Map commits to token changes
- Add token-history API
- Build lazy history panel

## Sprint 6 — Releases

- Tagging
- Release diff
- Changelog
- Semver recommendation
- GitHub Release integration
- Rollback preview

## Sprint 7 — Static docs

- Documentation data model
- Static output
- Search/navigation
- Context, ownership, lifecycle, references, and contrast
- Publish reference project

## Sprint 8 — AI evaluation and dark mode

- Evaluation harness
- Dark-theme task
- Candidate generation
- Contrast verification
- Proposal-review refinements

Stable identity should precede history and Figma sync; migration should precede launch; evaluation should precede AI proliferation.

---

# 14. Key ADRs

1. Stable token identity
2. Migration package boundary
3. Figma synchronization semantics
4. Release metadata and tagging
5. Historical token attribution
6. Three-way semantic merge
7. Documentation output architecture
8. AI evaluation and provider-quality policy
9. npm package and CLI naming
10. Hosted Studio privacy and offline behavior

---

# 15. Risks and Mitigations

### Feature breadth obscures the product story

Organize all work around the north-star loop and release themes.

### Figma limitations look like OkeyToKey defects

Use fidelity reports, mapping documentation, and zero silent degradation.

### Migration edge cases consume the roadmap

Use compatibility tiers, explicit unsupported cases, and fixture-driven prioritization.

### Git history is expensive in-browser

Use lazy loading, caching, pagination, provider-assisted history, and optional later CLI precomputation.

### AI quality varies by provider

Use capability detection, fixtures, candidate-assisted tasks, deterministic validation, and model guidance.

### Stable IDs reduce portability

Store them only under `com.okeytokey` extensions and preserve the strip invariant.

### Local credentials create security concerns

Provide clear storage behavior, session-only options, no secret sync, CSP, and dependency audits.

### Solo-maintainer overload

Use release-oriented scope, strong automation, strict non-goals, and avoid a backend before demand exists.

---

# 16. Final Recommendation

The next chapter of OkeyToKey should be framed as **convergence**, not expansion.

The platform already contains most of the hard primitives. The highest-value work is connecting them into one credible promise:

> Import an existing token system, understand it, improve it safely, validate it deterministically, collaborate through Git, synchronize it with Figma without silent loss, publish code and documentation, and use AI without surrendering control.

That is a real product category: not a Figma utility, not merely a token editor, and not an AI generator.

It is a **design-token control plane**.
