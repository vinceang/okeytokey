/**
 * Known OpenAI-compatible endpoints. Presets only prefill the settings form;
 * the adapter treats them all identically. OpenAI's own API is deliberately
 * absent: it serves no CORS headers, so a browser app cannot call it without
 * a proxy — offering it would ship a broken option.
 */

export interface ProviderPreset {
  readonly id: "ollama" | "lmstudio" | "openrouter";
  readonly label: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly requiresApiKey: boolean;
  readonly local: boolean;
  /** One-line setup note shown in the settings UI. */
  readonly note: string;
}

export const OPENAI_COMPATIBLE_PRESETS: readonly ProviderPreset[] = [
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    requiresApiKey: false,
    local: true,
    note: 'Start Ollama with OLLAMA_ORIGINS set to this app\'s origin (or "*") so the browser may call it.',
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    requiresApiKey: false,
    local: true,
    note: "Enable CORS in LM Studio's server settings, then start the local server.",
  },
  {
    id: "openrouter",
    label: "OpenRouter (your key)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4.6",
    requiresApiKey: true,
    local: false,
    note: "Uses your OpenRouter API key; requests are billed to your OpenRouter account.",
  },
];
