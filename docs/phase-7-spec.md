# OkeyToKey — Phase 7: AI-Assisted Token Workflows

## Purpose

Implement Phase 7 of OkeyToKey as a provider-agnostic, local-first AI assistance layer for design-token creation, transformation, refactoring, accessibility, naming, and theming workflows.

The goal is **not** to add a generic chatbot to OkeyToKey.

The goal is to create focused, trustworthy AI-assisted workflows in which:

> **AI proposes → schema parses → core validates and resolves → diff previews → human approves → core applies**

OkeyToKey must remain the authority over token validity, references, resolution, validation, diffs, and mutations. AI is an untrusted suggestion engine that proposes structured changes for review.

---

## Product Principles

### 1. Local-first and free-tier friendly

OkeyToKey will initially be distributed for free. The application owner should not incur inference costs for user activity.

Phase 7 should therefore prioritize:

1. Local AI providers
2. OpenAI-compatible local endpoints
3. Bring-your-own-key (BYOK) cloud providers
4. Hosted OkeyToKey-managed inference only as a possible future paid feature

Users should be able to use AI without OkeyToKey paying per-token inference costs.

### 2. Provider agnostic

Do not tightly couple AI workflows to a single vendor or model.

The architecture should allow OkeyToKey to support providers such as:

- Local OpenAI-compatible endpoints
- Ollama
- LM Studio or similar local inference servers
- OpenAI via user-provided API key
- Anthropic via user-provided API key
- OpenRouter via user-provided API key
- Azure OpenAI via user-provided configuration
- Future providers without rewriting product workflows

The Studio UI should expose this concept as **AI Provider** or **AI Connection**, rather than hard-coding the product around “Connect to Codex” or “Connect to Claude.”

Possible settings concept:

```text
AI Provider

○ None

Local
○ OpenAI-compatible endpoint
○ Ollama

Cloud — Bring Your Own Key
○ OpenAI
○ Anthropic
○ OpenRouter
○ Azure OpenAI
```

Provider-specific credentials and connection settings must never be committed to token documents or Git sync.

### 3. Human-in-the-loop by default

AI must not directly mutate the active token document.

Every mutation workflow should:

1. Gather only the relevant context.
2. Ask the AI provider for a structured proposal.
3. Parse the proposal against a strict schema.
4. Validate the proposed token changes through OkeyToKey's existing schema and core packages.
5. Resolve aliases/references as needed.
6. Generate a reviewable diff.
7. Show validation and accessibility issues.
8. Allow the user to accept all, accept selected changes, revise the request, or reject the proposal.
9. Apply accepted changes through the normal core mutation path.

### 4. Focused workflows, not open-ended chat

The initial AI experience should be task-oriented.

Examples:

- Generate semantic tokens
- Generate a color scale
- Create a dark theme
- Suggest accessible color replacements
- Rename tokens to match a convention
- Convert hard-coded values to aliases
- Explain a token or token group
- Suggest missing semantic roles

A conversational interface may support these workflows, but the architecture should center on typed commands and structured proposals rather than unconstrained text generation.

---

# Recommended Phase 7 Scope

## Phase 7 — AI-Assisted Token Workflows

### Primary Objective

Allow a user to select token context, describe an intent, receive a structured and validated token-change proposal, inspect the resulting diff, and selectively apply approved changes.

### Recommended First Vertical Slice

Build one complete, excellent workflow before expanding the AI surface area:

> **Generate Semantic Tokens from Primitives**

Example user request:

> Create semantic surface, text, border, focus, and interactive tokens from the selected primitive palette. Preserve the existing naming style, use aliases rather than duplicated raw values where appropriate, maintain WCAG AA contrast for applicable foreground/background pairs, and create compatible light and dark theme mappings.

The result should:

- be DTCG-compatible;
- reference existing primitive tokens where appropriate;
- preserve valid existing tokens;
- avoid unnecessary duplication;
- identify assumptions;
- pass OkeyToKey validation;
- display a reviewable diff;
- allow selective acceptance.

---

# Proposed Architecture

## New package

Consider introducing:

```text
packages/ai
@okeytokey/ai
```

This package should remain independent from the Studio UI.

Suggested responsibilities:

- provider contracts;
- provider adapters;
- capability detection;
- connection testing;
- prompt/context assembly;
- task definitions;
- structured output schemas;
- proposal normalization;
- error normalization;
- model metadata;
- optional streaming abstractions.

It should **not** own:

- token parsing authority;
- token resolution;
- canonical validation;
- diff generation;
- document mutation;
- persistence;
- Git sync.

Those responsibilities should remain with the existing OkeyToKey schema/core/sync architecture.

## Conceptual flow

```text
apps/studio
    |
    v
AI Assist UI
    |
    v
@okeytokey/ai
    |
    +--> Task definition
    |
    +--> Context assembler
    |
    +--> Provider adapter
              |
              +--> Local endpoint
              +--> Ollama
              +--> OpenAI BYOK
              +--> Anthropic BYOK
              +--> Other future provider
    |
    v
Structured AI Proposal
    |
    v
@okeytokey/schema parses proposal
    |
    v
@okeytokey/core validates / resolves / diffs
    |
    v
Studio Proposal Review UI
    |
    +--> Accept all
    +--> Accept selected
    +--> Reject
    +--> Revise request
    |
    v
Approved changes applied through normal core mutation path
```

---

# Provider Abstraction

Define a provider interface around OkeyToKey's needs, not around any single vendor SDK.

Conceptually:

```ts
interface AiProvider {
  id: string;
  name: string;

  capabilities(): AiCapabilities;

  testConnection(): Promise<ConnectionResult>;

  generateProposal(request: AiTaskRequest, options?: AiRequestOptions): Promise<AiProposalResult>;
}
```

Potential capabilities:

```ts
interface AiCapabilities {
  structuredOutput: boolean;
  streaming: boolean;
  toolCalling: boolean;
  local: boolean;
  maxContextTokens?: number;
}
```

Avoid leaking provider-specific response structures into Studio components.

Normalize provider output into OkeyToKey-owned proposal types.

---

# Structured Proposal Contract

AI output must be treated as untrusted input.

Do not ask a model to return arbitrary source files or directly rewritten token documents unless a specific workflow truly requires full-document replacement.

Prefer a constrained proposal shape such as:

```ts
interface TokenChangeProposal {
  summary: string;
  assumptions?: string[];
  operations: TokenOperation[];
  warnings?: ProposalWarning[];
}
```

Possible operations:

```ts
type TokenOperation =
  | CreateTokenOperation
  | UpdateTokenOperation
  | DeleteTokenOperation
  | RenameTokenOperation
  | MoveTokenOperation
  | CreateGroupOperation;
```

Each operation should be validated before it is eligible for preview or application.

Where possible, reuse existing OkeyToKey refactor/diff primitives instead of creating parallel AI-only mutation logic.

---

# Context Assembly

Do not send the entire token document by default.

Build task-specific context packages.

A context package may contain:

- selected token subtree;
- referenced primitives required to understand aliases;
- nearby semantic tokens;
- current naming conventions inferred from the document;
- theme structure;
- token types involved;
- validation rules;
- accessibility requirements;
- user instruction;
- concise project metadata;
- task-specific output schema.

The context assembler should minimize unnecessary token transmission and make local models more viable by reducing context size.

---

# Initial AI Use Cases

## Use Case 1 — Generate Primitive Scales

### User Story

As a design-system author, I want to provide a seed value or small set of brand values and generate a coherent primitive scale so that I can establish a usable token foundation quickly.

### Example requests

- Generate a neutral color scale from near-black to near-white.
- Build a 50–950 brand scale around this seed color.
- Generate a spacing scale based on a 4px foundation.
- Suggest a fluid typography scale for the current product.

### Expected behavior

The AI proposes new primitive tokens, explains assumptions, and OkeyToKey validates token types and naming before showing the diff.

---

## Use Case 2 — Generate Semantic Tokens from Primitives

### User Story

As a design-system author, I want AI to analyze my primitive tokens and propose semantic aliases so that I can move from raw values to a scalable semantic architecture.

### Example request

> Create semantic surface, text, border, focus, and interactive tokens from this primitive palette.

### Expected behavior

The AI should prefer aliases to existing primitives, preserve naming conventions, avoid duplicate semantic roles, and provide a diff for review.

This is the recommended first Phase 7 vertical slice.

---

## Use Case 3 — Generate Dark Theme Mappings

### User Story

As a designer, I want AI to propose a dark theme based on the current light theme so that I can accelerate theme creation without manually remapping every semantic token.

### Example request

> Create dark-theme mappings for the selected semantic tokens. Preserve hierarchy and ensure applicable foreground/background combinations meet WCAG AA.

### Expected behavior

The AI proposes mappings rather than blindly inverting values. OkeyToKey validates references and applicable contrast rules before presenting the proposal.

---

## Use Case 4 — Accessibility-Aware Suggestions

### User Story

As a design-system maintainer, I want AI assistance when token combinations fail accessibility checks so that I can evaluate compliant alternatives without manually testing many nearby values.

### Example requests

- Suggest the smallest token change that makes this pair pass WCAG AA.
- Find an existing primitive that can replace this foreground color.
- Suggest accessible hover, active, disabled, and focus states.

### Expected behavior

AI suggestions are advisory. Actual contrast calculations and pass/fail decisions must come from deterministic OkeyToKey logic, not from model claims.

---

## Use Case 5 — Token Naming Assistant

### User Story

As a design-system maintainer, I want AI to suggest token renames that match the conventions already used in my system so that naming becomes more consistent without a manual audit.

### Example requests

- Rename this group to match our existing semantic naming convention.
- Identify inconsistent token names.
- Convert component-specific names to a consistent pattern.

### Expected behavior

The AI proposes rename/refactor operations. Existing OkeyToKey refactor logic should handle references safely and produce the authoritative diff.

---

## Use Case 6 — Replace Hard-Coded Values with Aliases

### User Story

As a design-system author, I want AI to identify repeated or semantically related raw values and propose aliases so that the system becomes easier to maintain.

### Example request

> Review this token group and propose where raw values should reference existing primitives or semantic tokens.

### Expected behavior

AI proposes candidate relationships. The core validates that references exist, are type-compatible, and do not create invalid or circular relationships.

---

## Use Case 7 — Explain Tokens and Dependencies

### User Story

As a designer or engineer unfamiliar with a token system, I want AI to explain a token's purpose and relationships so that I can understand the system before editing it.

### Example requests

- What is this token used for conceptually?
- Explain the alias chain for this token.
- Why would changing this primitive have broad impact?
- Summarize the purpose of this token group.

### Expected behavior

This can be a non-mutating workflow. Deterministic dependency data should come from the core; AI can translate it into useful explanations.

---

## Use Case 8 — Suggest Missing Semantic Roles

### User Story

As a design-system architect, I want AI to inspect a semantic token group and identify likely gaps so that I can evaluate whether the system is complete for common UI states.

### Example request

> Review the interactive token group and suggest missing roles for hover, active, focus, selected, disabled, and destructive states.

### Expected behavior

Suggestions should be presented as recommendations, not automatically added. The user chooses which proposals to generate and review.

---

# Studio UX Concepts

## Entry Points

AI actions may be available from:

- command palette;
- token group context menu;
- token inspector;
- validation issue panel;
- theme editor;
- dedicated AI Assist panel.

Avoid forcing all AI activity into one global chatbot.

## Proposal Review Experience

The review UI should support:

- proposal summary;
- assumptions;
- warnings;
- validation status;
- accessibility status where applicable;
- before/after values;
- alias/reference changes;
- created tokens;
- renamed tokens;
- deleted tokens;
- accept all;
- accept selected;
- reject;
- revise prompt.

The user should understand exactly what will change before applying a proposal.

---

# Security and Privacy Requirements

## Local providers

For local inference:

- clearly indicate that requests remain local when the configured provider is genuinely local;
- allow custom endpoint configuration;
- validate endpoint connectivity;
- do not silently fall back to a cloud provider.

## BYOK providers

For cloud providers:

- users supply their own credentials;
- never store API keys inside token documents;
- never include credentials in Git sync;
- never log secrets;
- use appropriate secure storage for the deployment environment;
- clearly communicate which token context will be sent to the configured provider.

## Data minimization

Only send context needed for the selected workflow.

Do not automatically send:

- entire repositories;
- unrelated token branches;
- Git history;
- credentials;
- project files unrelated to the token task.

---

# Testing Strategy

## Deterministic tests

Test without live AI calls wherever possible:

- proposal schema validation;
- malformed output rejection;
- unsupported operation rejection;
- nonexistent reference handling;
- circular reference protection;
- type mismatch handling;
- partial proposal acceptance;
- provider error normalization;
- timeout behavior;
- cancellation;
- diff generation;
- undo after accepted AI proposal.

## Provider contract tests

Create shared contract tests that every provider adapter must pass.

## Evaluation fixtures

Create a small version-controlled evaluation suite with representative token documents and expected qualities.

Example evaluation scenarios:

1. primitives → semantic tokens;
2. light theme → dark theme;
3. inaccessible pair → compliant candidate suggestions;
4. inconsistent names → rename proposal;
5. raw duplicate values → alias proposal;
6. intentionally invalid model output → safe rejection.

Do not make exact model wording part of the test contract.

Evaluate structural and product outcomes instead.

---

# Suggested Delivery Plan

## Phase 7.1 — AI Foundation

- Create `@okeytokey/ai`.
- Define provider interface.
- Define task request types.
- Define proposal schemas.
- Add provider error normalization.
- Add context assembly foundation.
- Add mock provider for deterministic development and tests.

## Phase 7.2 — Local Provider

- Support an OpenAI-compatible local endpoint.
- Add connection configuration.
- Add connection test.
- Add capability detection where practical.
- Add clear local/cloud privacy messaging.

Optionally add a convenience adapter or preset for Ollama after the generic local path is working.

## Phase 7.3 — First Vertical Slice

Implement:

> Generate Semantic Tokens from Primitives

Include:

- token/group selection;
- intent input;
- context assembly;
- structured proposal;
- schema parsing;
- core validation;
- diff review;
- selective acceptance;
- undo support;
- tests.

Do not expand to many AI commands until this complete workflow feels trustworthy.

## Phase 7.4 — Additional Workflows

Add, in roughly this order:

1. Generate dark theme
2. Accessibility suggestions
3. Token naming/refactoring
4. Hard-coded value → alias suggestions
5. Primitive scale generation
6. Explain token/dependency
7. Missing semantic role suggestions

## Phase 7.5 — BYOK Cloud Providers

Add cloud provider adapters using user-provided credentials.

Prioritize based on actual user demand.

Keep all Studio workflows provider-independent.

## Phase 7.6 — Evaluation and Polish

- prompt evaluation fixtures;
- latency UX;
- cancellation;
- streaming status where useful;
- retries;
- better proposal explanations;
- onboarding;
- privacy messaging;
- provider troubleshooting;
- accessibility review of all AI UI.

---

# Out of Scope for Initial Phase 7

Unless implementation evidence strongly justifies expanding scope, do not include these in the initial release:

- OkeyToKey-funded hosted inference;
- autonomous background agents;
- automatic token mutation without approval;
- unrestricted repository editing;
- generic “chat with your design system” as the primary experience;
- training or fine-tuning custom models;
- vector databases unless a demonstrated retrieval need exists;
- MCP server implementation in the first vertical slice.

---

# Future Direction — MCP

After in-app AI workflows are stable, consider exposing OkeyToKey capabilities through an MCP server.

Potential future tools could include:

```text
get_token_document
get_token_subtree
resolve_token
validate_tokens
find_references
find_dependents
diff_token_documents
propose_refactor
apply_token_patch
export_tokens
```

This could allow external AI clients and coding assistants to work with OkeyToKey through explicit, governed tools.

MCP should be considered a later interoperability layer, not a prerequisite for Phase 7.

---

# Definition of Success

Phase 7 is successful if a user can:

1. Configure a local AI provider without OkeyToKey incurring inference costs.
2. Select a primitive token group.
3. Request semantic token generation.
4. Receive a structured proposal.
5. Have that proposal parsed and validated by OkeyToKey.
6. Inspect a clear before/after diff.
7. See validation and accessibility findings.
8. Accept all or selected changes.
9. Undo the applied proposal.
10. Repeat the workflow with a different supported provider without changing the product workflow.

---

# Implementation Guidance for the Coding LLM

You are implementing this feature inside the existing OkeyToKey monorepo.

Before writing code:

1. Inspect the current repository structure.
2. Read the README and relevant ADRs.
3. Inspect `@okeytokey/schema`.
4. Inspect `@okeytokey/core`, especially parse, resolve, validate, diff, and refactor APIs.
5. Inspect Studio state management, persistence, undo/redo, and mutation paths.
6. Inspect existing dependency boundary rules.
7. Reuse existing domain types and operations wherever possible.
8. Do not create parallel token mutation or validation systems for AI.
9. Preserve current TypeScript strictness and package boundary conventions.
10. Propose an implementation plan before making broad architectural changes.

The core architectural invariant is:

> **AI is allowed to propose. OkeyToKey is responsible for proving validity and applying changes.**

Begin by producing:

1. a repository-grounded architecture assessment;
2. a proposed package/API design for `@okeytokey/ai`;
3. the minimum files and changes required for Phase 7.1;
4. risks and unresolved decisions;
5. a phased implementation plan;
6. only then, implementation.

Do not assume that examples in this document exactly match the existing internal APIs. Adapt the design to the actual repository while preserving the product principles and architectural invariants described above.

# Addendum — Deterministic Tools vs. AI Assistance

## Core Product Principle

OkeyToKey should not use AI for operations that can be performed reliably, predictably, and transparently through deterministic logic.

> **If it can be computed, compute it. If it requires judgment, AI can assist.**

AI should augment OkeyToKey's native capabilities rather than replace deterministic design-system tooling.

## Example: Color Scale Generation

If a user has created anchor tokens such as:

- `blue-100`
- `blue-500`
- `blue-900`

and wants to generate:

- `blue-200`
- `blue-300`
- `blue-400`
- `blue-600`
- `blue-700`
- `blue-800`

this should be implemented as a native **Scale Generator**, not an AI workflow.

The Scale Generator should use deterministic color interpolation, preferably supporting perceptually appropriate color spaces such as OKLCH, and should provide a preview before applying changes.

The workflow should conceptually be:

```text
Select anchor tokens
    ↓
Choose Generate Scale Steps
    ↓
Detect scale positions and missing steps
    ↓
Interpolate values deterministically
    ↓
Preview generated tokens
    ↓
Validate through OkeyToKey core
    ↓
Review diff
    ↓
Accept or reject
```

Potential future controls may include:

- interpolation color space;
- number of steps;
- explicit numeric step labels;
- preserve hue;
- preserve chroma;
- lightness curve;
- easing/distribution curve;
- gamut handling.

These controls should remain deterministic and reproducible.

## Where AI Adds Value

AI becomes useful when the user's request requires interpretation, intent, or contextual judgment.

For example:

> Create a blue palette appropriate for a trustworthy financial-services product.

> Make this palette feel warmer and less corporate.

> Create semantic interactive tokens from these primitives.

> Suggest a dark theme that preserves the visual hierarchy of the light theme.

> Review this token architecture and identify missing semantic roles.

In these scenarios, AI may interpret the user's intent and propose:

- anchor colors;
- semantic relationships;
- naming structures;
- theme mappings;
- architectural changes;
- constraints for deterministic generators.

OkeyToKey's native engines should then perform deterministic calculations, validation, resolution, accessibility checks, and diff generation wherever possible.

## Hybrid AI + Native Workflows

AI workflows should be able to orchestrate or recommend native operations rather than reproduce them probabilistically.

Example:

```text
User intent:
"Create an accessible blue scale for interactive controls."

        ↓

AI Assist:
Interprets intent and proposes anchors or constraints.

        ↓

Native Scale Generator:
Produces deterministic intermediate values.

        ↓

Native Accessibility Evaluation:
Measures applicable contrast relationships.

        ↓

AI Assist:
Explains tradeoffs or suggests adjustments if needed.

        ↓

OkeyToKey Core:
Validates, resolves, diffs, and applies approved changes.
```

This separation should guide Phase 7 implementation decisions.

Before implementing any AI-assisted feature, ask:

1. Can this result be calculated deterministically?
2. Does OkeyToKey already have the information required to calculate it?
3. Would two users reasonably expect identical results from identical inputs?
4. Is reproducibility important to the workflow?
5. Does the task require interpretation or design judgment?

If the task is computational and reproducibility matters, implement it as a native OkeyToKey capability.

If the task requires interpretation, contextual reasoning, or subjective design judgment, AI assistance may be appropriate.

The AI layer should therefore be treated as an **intent and proposal layer**, while OkeyToKey's native engines remain the **calculation, validation, and execution layer**.
