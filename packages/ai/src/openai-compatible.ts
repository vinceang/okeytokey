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
 * Generic adapter for anything speaking the OpenAI-compatible
 * /v1/chat/completions protocol: Ollama, LM Studio, vLLM (local) and
 * OpenRouter, Azure OpenAI, and most others (BYOK cloud). The only
 * differences are the base URL and whether an API key is present.
 *
 * Browser reality (ADR 0006): Ollama needs OLLAMA_ORIGINS set to accept
 * cross-origin calls; LM Studio has a CORS toggle; OpenRouter allows browser
 * calls. OpenAI's own API serves no CORS headers — it cannot work from the
 * browser without a proxy, which is why it is not a preset.
 */

export interface OpenAiCompatibleOptions {
  /** e.g. "http://localhost:11434/v1" (Ollama) or "https://openrouter.ai/api/v1". */
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  /** Display label; defaults to the host. */
  readonly label?: string;
  /** Injectable for tests. */
  readonly fetch?: typeof globalThis.fetch;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function isLocalUrl(baseUrl: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = "openai-compatible";
  readonly name: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly base: string;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.base = options.baseUrl.replace(/\/+$/, "");
    this.name = options.label ?? `OpenAI-compatible (${safeHost(options.baseUrl)})`;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  capabilities(): AiCapabilities {
    return {
      structuredOutput: false,
      streaming: false,
      toolCalling: false,
      local: isLocalUrl(this.options.baseUrl),
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.apiKey !== undefined && this.options.apiKey !== "") {
      headers.authorization = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }

  private connectionHint(): string {
    return isLocalUrl(this.options.baseUrl)
      ? 'Is the server running? Browser calls also need CORS: for Ollama set OLLAMA_ORIGINS to this app\'s origin (or "*"); LM Studio has a CORS toggle in its server settings.'
      : "Check the base URL, and that the service allows browser (CORS) requests — OpenAI's own API does not.";
  }

  async testConnection(): Promise<ConnectionResult> {
    const url = `${this.base}/models`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: this.headers() });
    } catch (error) {
      return {
        ok: false,
        detail: `Looked up ${url} → ${error instanceof Error ? error.message : "network error"}. ${this.connectionHint()}`,
      };
    }
    if (!response.ok) {
      const auth = response.status === 401 || response.status === 403;
      return {
        ok: false,
        detail: `Looked up ${url} → HTTP ${String(response.status)}. ${
          auth ? "The API key was rejected — check it." : this.connectionHint()
        }`,
      };
    }
    let count: number | undefined;
    try {
      const body = (await response.json()) as { data?: unknown[] };
      count = Array.isArray(body.data) ? body.data.length : undefined;
    } catch {
      /* some servers return non-standard bodies; reachability is enough */
    }
    return {
      ok: true,
      detail: `Looked up ${url} → ok${count !== undefined ? ` (${String(count)} model(s))` : ""}. Using model "${this.options.model}".`,
      model: this.options.model,
    };
  }

  async generateProposal(
    request: AiTaskRequest,
    options: AiRequestOptions = {},
  ): Promise<AiRawResult> {
    const url = `${this.base}/chat/completions`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: this.headers(),
        signal: options.signal,
        body: JSON.stringify({
          model: this.options.model,
          temperature: options.temperature,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: buildUserPrompt(request) },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AiProviderError("Request cancelled", this.id, "cancelled");
      }
      throw new AiProviderError(
        `${url}: ${error instanceof Error ? error.message : "network error"}. ${this.connectionHint()}`,
        this.id,
        "connection",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new AiProviderError(
        `The provider rejected the API key (HTTP ${String(response.status)})`,
        this.id,
        "auth",
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AiProviderError(
        `HTTP ${String(response.status)} from ${url}: ${body.slice(0, 300)}`,
        this.id,
        "response",
      );
    }
    const body = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text === "") {
      throw new AiProviderError("The response contained no message content", this.id, "response");
    }
    return { text, model: body.model ?? this.options.model };
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
