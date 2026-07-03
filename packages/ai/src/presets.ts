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
  /**
   * What choosing this actually requires, stated up front — installs,
   * downloads, accounts. Shown verbatim in the settings UI.
   */
  readonly note: string;
  /** Copyable launch command; `{origin}` is replaced with the app's origin. */
  readonly setupCommandTemplate?: string;
}

/** Ordered by setup ease: key-only first, app installs after. */
export const OPENAI_COMPATIBLE_PRESETS: readonly ProviderPreset[] = [
  {
    id: "openrouter",
    label: "OpenRouter (your key)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4.6",
    requiresApiKey: true,
    local: false,
    note: "Needs an openrouter.ai account and API key. No installs — the lowest-friction option if cloud is acceptable.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    requiresApiKey: false,
    local: true,
    note: "Needs the free LM Studio app (lmstudio.ai) with a model downloaded. In its Developer tab: start the server and enable CORS.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    requiresApiKey: false,
    local: true,
    note: "Needs the free Ollama app (ollama.com) and a downloaded model — 'ollama pull llama3.1' fetches ~5 GB once. Then start it so the browser may call it:",
    setupCommandTemplate: 'OLLAMA_ORIGINS="{origin}" ollama serve',
  },
];
