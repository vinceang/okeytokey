import type { TaskContext } from "./context.js";

/**
 * The provider abstraction (docs/phase-7-spec.md). Defined around okeytokey's
 * needs, not any vendor SDK; adapters normalize everything into these shapes.
 * AI output is untrusted — providers return raw text; the proposal module
 * parses and core proves validity.
 */

export type AiTaskId =
  | "generate-semantic-tokens"
  | "generate-dark-theme"
  | "suggest-accessible-replacement"
  | "suggest-renames"
  | "suggest-aliases"
  | "explain-tokens"
  | "suggest-missing-roles";

export interface AiTaskRequest {
  readonly task: AiTaskId;
  /** The user's instruction, verbatim. */
  readonly instruction: string;
  /** Assembled, minimized context (never the whole document by default). */
  readonly context: TaskContext;
}

export interface AiRequestOptions {
  readonly signal?: AbortSignal;
  readonly temperature?: number;
}

export interface AiCapabilities {
  readonly structuredOutput: boolean;
  readonly streaming: boolean;
  readonly toolCalling: boolean;
  /** True when inference genuinely never leaves the machine. */
  readonly local: boolean;
  readonly maxContextTokens?: number;
}

export interface ConnectionResult {
  readonly ok: boolean;
  /** What was checked and what came back — connection-doctor style. */
  readonly detail: string;
  readonly model?: string;
}

export interface AiRawResult {
  /** The model's raw text output (expected to contain a JSON proposal). */
  readonly text: string;
  readonly model?: string;
}

export interface AiProvider {
  readonly id: string;
  readonly name: string;
  capabilities(): AiCapabilities;
  testConnection(): Promise<ConnectionResult>;
  generateProposal(request: AiTaskRequest, options?: AiRequestOptions): Promise<AiRawResult>;
}

/** Every provider failure is normalized to this. */
export class AiProviderError extends Error {
  override readonly name = "AiProviderError";
  constructor(
    message: string,
    readonly providerId: string,
    readonly kind: "connection" | "auth" | "timeout" | "cancelled" | "response",
  ) {
    super(message);
  }
}
