import {
  ANTHROPIC_DEFAULT_MODEL,
  AnthropicProvider,
  OPENAI_COMPATIBLE_PRESETS,
  OpenAiCompatibleProvider,
  type AiProvider,
} from "@okeytokey/ai";

/**
 * AI provider settings (ADR 0006). Stored in localStorage — the same
 * tradeoff we already accept for the GitHub token, stated in the dialog.
 * Keys never enter token documents, Git sync, or logs. "none" is the
 * default: nothing is ever sent anywhere unless the user configures it,
 * and inference is always local or billed to the user's own key —
 * okeytokey never funds it. There is no fallback from one provider to
 * another; the configured one is the only one used.
 */

export type AiProviderKind = "none" | "openai-compatible" | "anthropic";

export interface AiSettings {
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
  anthropicApiKey: string;
  anthropicModel: string;
}

export const AI_SETTINGS_KEY = "okeytokey.ai.provider";

export function defaultAiSettings(): AiSettings {
  // Prefill mirrors the first (lowest-friction) preset so the form opens
  // coherent; nothing is contacted until the user acts.
  const [first] = OPENAI_COMPATIBLE_PRESETS;
  return {
    provider: "none",
    baseUrl: first?.baseUrl ?? "",
    model: first?.defaultModel ?? "",
    apiKey: "",
    anthropicApiKey: "",
    anthropicModel: ANTHROPIC_DEFAULT_MODEL,
  };
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (raw !== null)
      return { ...defaultAiSettings(), ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch {
    /* fall through */
  }
  return defaultAiSettings();
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * The single place a provider instance is built from settings. A constructor
 * rejecting its config (e.g. a hand-edited localStorage entry) means "not
 * configured", never a crashed dialog.
 */
export function createConfiguredProvider(settings: AiSettings): AiProvider | undefined {
  try {
    switch (settings.provider) {
      case "none":
        return undefined;
      case "openai-compatible":
        return new OpenAiCompatibleProvider({
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: settings.apiKey === "" ? undefined : settings.apiKey,
        });
      case "anthropic":
        return new AnthropicProvider({
          apiKey: settings.anthropicApiKey,
          model: settings.anthropicModel,
        });
    }
  } catch {
    return undefined;
  }
}
