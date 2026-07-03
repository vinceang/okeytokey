import { useState } from "react";

import { OPENAI_COMPATIBLE_PRESETS, type ConnectionResult } from "@okeytokey/ai";
import { Button, Field, SegmentedControl, TextInput } from "@okeytokey/ui";

import {
  createConfiguredProvider,
  loadAiSettings,
  saveAiSettings,
  type AiProviderKind,
  type AiSettings,
} from "../state/ai-settings.js";
import { Dialog } from "./dialogs.js";

/**
 * AI provider settings (ADR 0006): local-first, BYOK, "None" by default.
 * The privacy copy is deliberately explicit about where requests go and
 * who pays — okeytokey never funds inference.
 */

const PROVIDER_OPTIONS: readonly { value: AiProviderKind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "openai-compatible", label: "Local / OpenAI-compatible" },
  { value: "anthropic", label: "Anthropic" },
];

function privacyNote(settings: AiSettings): string {
  switch (settings.provider) {
    case "none":
      return "AI features are off. Nothing is ever sent anywhere.";
    case "openai-compatible": {
      let host: string;
      let local = false;
      try {
        const url = new URL(settings.baseUrl);
        host = url.host;
        local = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(url.hostname);
      } catch {
        host = settings.baseUrl;
      }
      return local
        ? `Requests go to ${host} on this machine — token data never leaves it, and nothing is billed.`
        : `Selected token names and values are sent to ${host} and billed to your own account there. okeytokey never provides or pays for inference.`;
    }
    case "anthropic":
      return "Selected token names and values are sent to api.anthropic.com and billed to your own Anthropic API key. okeytokey never provides or pays for inference.";
  }
}

/** The exact launch command for this app's origin, one click to copy. */
function SetupCommand({ template }: { template: string }) {
  const command = template.replace("{origin}", window.location.origin);
  const [copied, setCopied] = useState(false);
  return (
    <div className="ai-setup-command">
      <code data-testid="ai-setup-command">{command}</code>
      <Button
        variant="ghost"
        data-testid="ai-copy-command"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => {
              setCopied(false);
            }, 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function AiProviderDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState(loadAiSettings);
  const [result, setResult] = useState<ConnectionResult>();
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<AiSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
    setResult(undefined);
  };

  const applyPreset = (presetId: string) => {
    const preset = OPENAI_COMPATIBLE_PRESETS.find((entry) => entry.id === presetId);
    if (preset) update({ baseUrl: preset.baseUrl, model: preset.defaultModel });
  };

  const activePreset = OPENAI_COMPATIBLE_PRESETS.find(
    (entry) => entry.baseUrl === settings.baseUrl,
  );

  const testConnection = async () => {
    const provider = createConfiguredProvider(settings);
    if (!provider) return;
    setBusy(true);
    setResult(undefined);
    try {
      setResult(await provider.testConnection());
    } catch (error) {
      setResult({
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="AI provider" onClose={onClose}>
      <SegmentedControl
        aria-label="AI provider"
        options={PROVIDER_OPTIONS}
        value={settings.provider}
        onChange={(provider) => {
          update({ provider });
        }}
      />

      <p className="ai-privacy" data-testid="ai-privacy">
        {privacyNote(settings)}
      </p>

      {settings.provider === "openai-compatible" && (
        <>
          <div className="editor-row">
            {OPENAI_COMPATIBLE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant={activePreset?.id === preset.id ? "primary" : "secondary"}
                data-testid={`ai-preset-${preset.id}`}
                onClick={() => {
                  applyPreset(preset.id);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {activePreset && <p className="ai-preset-note">{activePreset.note}</p>}
          {activePreset?.setupCommandTemplate !== undefined && (
            <SetupCommand template={activePreset.setupCommandTemplate} />
          )}
          <div className="editor-grid-2">
            <div className="span-2">
              <Field label="Base URL">
                {(id) => (
                  <TextInput
                    id={id}
                    mono
                    value={settings.baseUrl}
                    data-testid="ai-base-url"
                    onChange={(event) => {
                      update({ baseUrl: event.target.value });
                    }}
                  />
                )}
              </Field>
            </div>
            <Field label="Model">
              {(id) => (
                <TextInput
                  id={id}
                  mono
                  value={settings.model}
                  data-testid="ai-model"
                  onChange={(event) => {
                    update({ model: event.target.value });
                  }}
                />
              )}
            </Field>
            <Field label="API key (optional)">
              {(id) => (
                <TextInput
                  id={id}
                  mono
                  type="password"
                  value={settings.apiKey}
                  data-testid="ai-api-key"
                  onChange={(event) => {
                    update({ apiKey: event.target.value });
                  }}
                />
              )}
            </Field>
          </div>
        </>
      )}

      {settings.provider === "anthropic" && (
        <div className="editor-grid-2">
          <Field label="Anthropic API key">
            {(id) => (
              <TextInput
                id={id}
                mono
                type="password"
                placeholder="sk-ant-…"
                value={settings.anthropicApiKey}
                data-testid="ai-anthropic-key"
                onChange={(event) => {
                  update({ anthropicApiKey: event.target.value });
                }}
              />
            )}
          </Field>
          <Field label="Model">
            {(id) => (
              <TextInput
                id={id}
                mono
                value={settings.anthropicModel}
                data-testid="ai-anthropic-model"
                onChange={(event) => {
                  update({ anthropicModel: event.target.value });
                }}
              />
            )}
          </Field>
        </div>
      )}

      {settings.provider !== "none" && (
        <>
          <div className="editor-row">
            <Button
              variant="secondary"
              disabled={busy}
              data-testid="ai-test-connection"
              onClick={() => void testConnection()}
            >
              Test connection
            </Button>
          </div>
          {result && (
            <div className="doctor-report" data-testid="ai-connection-result">
              <p className={result.ok ? "doctor-step" : "doctor-step doctor-step--failed"}>
                {result.ok ? "✓" : "✗"} <strong>connection</strong> — {result.detail}
              </p>
            </div>
          )}
          <p className="ai-key-note">
            Settings (including keys) are stored in this browser's localStorage — the same tradeoff
            as the GitHub access token. They are never written into token files or Git sync, and
            okeytokey never switches providers behind your back.
          </p>
        </>
      )}

      <footer>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </footer>
    </Dialog>
  );
}
