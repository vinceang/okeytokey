import Anthropic from "@anthropic-ai/sdk";

import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import {
  AiProviderError,
  type AiCapabilities,
  type AiProvider,
  type AiRawResult,
  type AiRequestOptions,
  type AiTaskRequest,
  type ConnectionResult,
} from "./provider.js";

/**
 * BYOK adapter for the Anthropic Messages API. Anthropic explicitly supports
 * direct browser calls (the SDK sends the dangerous-direct-browser-access
 * header when dangerouslyAllowBrowser is set), which makes it the one major
 * cloud API usable from okeytokey without a proxy. The key is the user's own;
 * okeytokey never funds inference (ADR 0006).
 */

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-4-8";

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  /** Defaults to ANTHROPIC_DEFAULT_MODEL. */
  readonly model?: string;
  /** Injectable for tests. */
  readonly fetch?: typeof globalThis.fetch;
  readonly baseUrl?: string;
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic (Claude)";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model ?? ANTHROPIC_DEFAULT_MODEL;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      dangerouslyAllowBrowser: true,
      fetch: options.fetch,
      baseURL: options.baseUrl,
      maxRetries: 1,
    });
  }

  capabilities(): AiCapabilities {
    return { structuredOutput: false, streaming: true, toolCalling: true, local: false };
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const model = await this.client.models.retrieve(this.model);
      return {
        ok: true,
        detail: `Looked up model "${this.model}" → ok (${model.display_name}). The API key is valid.`,
        model: model.id,
      };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        return { ok: false, detail: "The API key was rejected (HTTP 401) — check it." };
      }
      if (error instanceof Anthropic.NotFoundError) {
        return {
          ok: false,
          detail: `The API key works, but model "${this.model}" was not found — check the model ID.`,
        };
      }
      if (error instanceof Anthropic.APIError) {
        return {
          ok: false,
          detail: `Anthropic returned HTTP ${String(error.status)}: ${error.message}`,
        };
      }
      return {
        ok: false,
        detail: `Could not reach api.anthropic.com: ${error instanceof Error ? error.message : "network error"}`,
      };
    }
  }

  async generateProposal(
    request: AiTaskRequest,
    options: AiRequestOptions = {},
  ): Promise<AiRawResult> {
    // options.temperature is intentionally not forwarded: current Claude
    // models (Opus 4.7+) reject sampling parameters.
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 8192,
          system: buildSystemPrompt(),
          messages: [{ role: "user", content: buildUserPrompt(request) }],
        },
        { signal: options.signal },
      );
    } catch (error) {
      throw this.toProviderError(error);
    }
    if (response.stop_reason === "refusal") {
      throw new AiProviderError("Anthropic declined this request", this.id, "response");
    }
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (text === "") {
      throw new AiProviderError("The response contained no text content", this.id, "response");
    }
    return { text, model: response.model };
  }

  private toProviderError(error: unknown): AiProviderError {
    if (error instanceof Anthropic.APIUserAbortError) {
      return new AiProviderError("Request cancelled", this.id, "cancelled");
    }
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      return new AiProviderError(
        `The API key was rejected (HTTP ${String(error.status)})`,
        this.id,
        "auth",
      );
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return new AiProviderError("The request timed out", this.id, "timeout");
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new AiProviderError(
        `Could not reach api.anthropic.com: ${error.message}`,
        this.id,
        "connection",
      );
    }
    if (error instanceof Anthropic.APIError) {
      return new AiProviderError(
        `Anthropic returned HTTP ${String(error.status)}: ${error.message}`,
        this.id,
        "response",
      );
    }
    return new AiProviderError(
      error instanceof Error ? error.message : String(error),
      this.id,
      "connection",
    );
  }
}
