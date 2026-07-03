# @okeytokey/ai

Provider-agnostic AI assistance layer (Phase 7 — see `docs/phase-7-spec.md` and
ADR 0006). The invariant: **AI proposes, okeytokey proves.**

- `AiProvider` — id, `capabilities()`, `testConnection()`, `generateProposal()`
  returning raw text. Errors normalize to `AiProviderError`
  (connection/auth/timeout/cancelled/response).
- `parseProposal(text)` — extracts JSON from fences/prose, validates against the
  strict proposal schema (`summary`, `assumptions?`, `operations[]`, `warnings?`;
  operations: `create | update | delete | rename`, mirroring core's primitives).
  Failures are typed (`no-json` / `invalid-json` / `schema-mismatch`).
- `applyProposal(document, proposal, selected?)` — runs operations through core's
  revalidating mutations (later operations see earlier effects), collects
  per-operation results for selective acceptance, returns the semantic diff with
  transitive impact for the review UI.
- `assembleContext(document, pathPrefixes)` — minimal context: the selected
  subtree + one level of referenced tokens, never the whole document by default.
- `MockProvider` — deterministic, offline; powers development and CI.
- `OpenAiCompatibleProvider` — one adapter for everything speaking
  `/v1/chat/completions`: Ollama and LM Studio locally, OpenRouter (and most
  BYOK clouds) with the user's own key. `OPENAI_COMPATIBLE_PRESETS` prefill the
  settings UI; browser CORS notes ride along (Ollama needs `OLLAMA_ORIGINS`).
  OpenAI's own API serves no CORS headers, so it is deliberately not a preset.
- `AnthropicProvider` — BYOK adapter on the official `@anthropic-ai/sdk`, which
  supports direct browser calls. `testConnection()` verifies the key and model
  in one `models.retrieve` call.
- `runProviderContract(provider, document)` — the conformance checks every
  adapter must pass. Both adapters pass it in CI against scripted `fetch`
  implementations: zero live inference in tests.

Depends only on `@okeytokey/core` + `@okeytokey/schema` (plus the Anthropic
SDK). No credentials are ever stored here, in token documents, or in Git sync;
inference is always local or billed to the user's own key — okeytokey never
funds it, and never falls back from one provider to another silently.
