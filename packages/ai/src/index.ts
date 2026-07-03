/**
 * @okeytokey/ai — provider-agnostic AI assistance layer (Phase 7, ADR 0006).
 *
 * The invariant: AI proposes; okeytokey proves. Providers return untrusted
 * text; `parseProposal` validates the structure; `applyProposal` runs every
 * operation through core's revalidating mutations and returns per-operation
 * results plus the semantic diff for review. Nothing here mutates documents
 * outside core's primitives, and nothing here persists credentials.
 */

export {
  AiProviderError,
  type AiCapabilities,
  type AiProvider,
  type AiRawResult,
  type AiRequestOptions,
  type AiTaskId,
  type AiTaskRequest,
  type ConnectionResult,
} from "./provider.js";

export {
  createOperationSchema,
  deleteOperationSchema,
  parseProposal,
  proposalSchema,
  renameOperationSchema,
  tokenOperationSchema,
  updateOperationSchema,
  type ProposalParseFailure,
  type ProposalParseResult,
  type TokenChangeProposal,
  type TokenOperation,
} from "./proposal.js";

export { applyProposal, type OperationResult, type ProposalApplication } from "./apply.js";

export { assembleContext, type TaskContext } from "./context.js";

export { MockProvider, type MockProviderOptions } from "./mock.js";

export { OpenAiCompatibleProvider, type OpenAiCompatibleOptions } from "./openai-compatible.js";

export {
  ANTHROPIC_DEFAULT_MODEL,
  AnthropicProvider,
  type AnthropicProviderOptions,
} from "./anthropic.js";

export { OPENAI_COMPATIBLE_PRESETS, type ProviderPreset } from "./presets.js";

export { buildSystemPrompt, buildUserPrompt } from "./prompt.js";

export { runProviderContract, type ContractCheck } from "./contract.js";
