# ADR 0006: AI proposal contract and the deterministic boundary

**Status:** Accepted (Phase 7.0–7.1)

## Context

Phase 7 (docs/phase-7-spec.md) adds AI-assisted workflows. The risks are letting a
probabilistic system mutate the document, coupling the product to one vendor, and
using AI for things that should be computed. This ADR fixes the contracts.

## Decision

### The invariant

> **AI proposes. okeytokey proves.**

Providers return raw text only. `@okeytokey/ai` parses it against a strict Zod
proposal schema (`parseProposal` — tolerant of fences/prose _around_ the JSON,
strict about the object); `applyProposal` executes operations exclusively through
core's revalidating mutation/refactor primitives, collecting per-operation results
for selective acceptance, and returns the semantic diff (with transitive impact)
for review. No parallel AI-only mutation vocabulary exists: the operation set is
`create | update | delete | rename`, mirroring core 1:1.

### Acceptance path

The studio wraps an accepted proposal in an ordinary command whose inverse is a
structural snapshot (ADR 0003) — undo-after-accept is the normal undo path, and AI
never touches persistence or sync directly.

### The deterministic boundary

Before any workflow becomes an AI feature: _can this be computed?_ If two users
would expect identical results from identical inputs, it is a native engine, not a
prompt. Phase 7.0's Scale Generator (`planColorScale`, core `generate/`) embodies
this: OKLCH interpolation between numeric anchors, reproducible, stamped with
`lineage` metadata (`scale:oklch`, anchor inputs, step params). AI may later
_propose anchors or constraints_ for such generators — it does not replace them.
Contrast pass/fail likewise always comes from `wcagContrast`/`apcaContrast`.

### Provider abstraction

`AiProvider` (id, capabilities, testConnection, generateProposal) is defined
around okeytokey's needs; adapters normalize vendor responses and errors
(`AiProviderError` with a kind: connection/auth/timeout/cancelled/response).
`runProviderContract` is the shared conformance suite every adapter must pass;
the deterministic `MockProvider` passes it and powers all tests — no live
inference in CI. `packages/ai` depends only on core + schema (boundary-enforced).

### Privacy and cost posture

Local-first and BYOK: okeytokey never funds inference. Context assembly
(`assembleContext`) sends the selected subtree plus one level of referenced
tokens — never the whole document by default. Credentials live outside token
documents and sync; in the browser studio that concretely means localStorage,
the same tradeoff as the GitHub PAT — stated plainly in the UI, not oversold.
Known constraint for 7.2/7.5: browser CORS dictates provider order (Anthropic and
OpenRouter allow browser calls; Ollama needs `OLLAMA_ORIGINS`; OpenAI requires a
proxy). No silent fallback from a local provider to a cloud one, ever.

## Consequences

- A malformed model response is a typed parse failure with a reason, never a
  half-applied document; a hostile one is bounded by the operation vocabulary.
- Every provider is testable offline; evaluation fixtures assert structural
  outcomes, never model wording.
- The studio review UI can be built once against `ProposalApplication`
  (results + diff) and work identically for every provider.
