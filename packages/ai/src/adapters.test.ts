import { describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet } from "@okeytokey/core";

import { AnthropicProvider } from "./anthropic.js";
import { runProviderContract } from "./contract.js";
import { assembleContext } from "./context.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import { OPENAI_COMPATIBLE_PRESETS } from "./presets.js";
import { AiProviderError } from "./provider.js";

const doc = () =>
  createTokenDocument([
    parseTokenSet(
      "global",
      `{ "colors": { "$type": "color", "blue": { "500": { "$value": "#3b82f6" } } } }`,
    ),
  ]);

const request = () => ({
  task: "generate-semantic-tokens" as const,
  instruction: "test",
  context: assembleContext(doc(), ["colors"]),
});

const PROPOSAL = JSON.stringify({
  summary: "Add an action token",
  operations: [
    {
      op: "create",
      set: "global",
      path: "semantic.action",
      type: "color",
      value: "{colors.blue.500}",
    },
  ],
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Scripted fetch: routes by URL suffix, records every request. */
function scriptedFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const route = Object.entries(routes).find(([suffix]) => new URL(url).pathname.endsWith(suffix));
    if (!route) return Promise.resolve(new Response("not found", { status: 404 }));
    return Promise.resolve(route[1](init));
  };
  return { impl, calls };
}

describe("OpenAiCompatibleProvider", () => {
  const chatBody = (content: string) => ({
    model: "test-model",
    choices: [{ message: { role: "assistant", content } }],
  });

  it("passes the provider contract against a scripted local server", async () => {
    const { impl, calls } = scriptedFetch({
      "/v1/models": () => jsonResponse({ data: [{ id: "test-model" }] }),
      "/v1/chat/completions": () => jsonResponse(chatBody(PROPOSAL)),
    });
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "http://localhost:11434/v1",
      model: "test-model",
      fetch: impl,
    });
    expect(provider.capabilities().local).toBe(true);
    const checks = await runProviderContract(provider, doc());
    expect(
      checks.every((check) => check.ok),
      JSON.stringify(checks, null, 2),
    ).toBe(true);
    // No key configured → no Authorization header leaves the app.
    expect(calls.every((call) => !new Headers(call.init?.headers).has("authorization"))).toBe(true);
  });

  it("sends the bearer key for BYOK endpoints and flags cloud as non-local", async () => {
    const { impl, calls } = scriptedFetch({
      "/api/v1/chat/completions": () => jsonResponse(chatBody(PROPOSAL)),
    });
    const preset = OPENAI_COMPATIBLE_PRESETS.find((entry) => entry.id === "openrouter");
    if (!preset) throw new Error("openrouter preset missing");
    const provider = new OpenAiCompatibleProvider({
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
      apiKey: "sk-or-test",
      fetch: impl,
    });
    expect(provider.capabilities().local).toBe(false);
    await provider.generateProposal(request());
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer sk-or-test");
  });

  it("maps auth, response, connection, and cancel failures to typed errors", async () => {
    const make = (fetchImpl: typeof fetch) =>
      new OpenAiCompatibleProvider({
        baseUrl: "http://localhost:1/v1",
        model: "m",
        fetch: fetchImpl,
      });

    await expect(
      make(
        scriptedFetch({ "/v1/chat/completions": () => jsonResponse({}, 401) }).impl,
      ).generateProposal(request()),
    ).rejects.toMatchObject({ name: "AiProviderError", kind: "auth" });

    await expect(
      make(
        scriptedFetch({ "/v1/chat/completions": () => jsonResponse({ choices: [] }) }).impl,
      ).generateProposal(request()),
    ).rejects.toMatchObject({ kind: "response" });

    const failing: typeof fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    const connectionError = await make(failing)
      .generateProposal(request())
      .catch((error: unknown) => error);
    expect(connectionError).toBeInstanceOf(AiProviderError);
    expect((connectionError as AiProviderError).kind).toBe("connection");
    // Local endpoints get the CORS/server hint (ADR 0006 honesty requirement).
    expect((connectionError as AiProviderError).message).toContain("OLLAMA_ORIGINS");

    const aborting: typeof fetch = () =>
      Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
    await expect(make(aborting).generateProposal(request())).rejects.toMatchObject({
      kind: "cancelled",
    });
  });

  it("testConnection reports reachability without throwing", async () => {
    const offline = new OpenAiCompatibleProvider({
      baseUrl: "http://localhost:11434/v1",
      model: "m",
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const result = await offline.testConnection();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Is the server running?");
  });
});

describe("AnthropicProvider", () => {
  const message = (text: string) => ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  });

  it("passes the provider contract against a scripted API", async () => {
    const { impl } = scriptedFetch({
      "/v1/models/claude-opus-4-8": () =>
        jsonResponse({
          id: "claude-opus-4-8",
          type: "model",
          display_name: "Claude Opus 4.8",
          created_at: "2026-01-01T00:00:00Z",
        }),
      "/v1/messages": () => jsonResponse(message(PROPOSAL)),
    });
    const provider = new AnthropicProvider({ apiKey: "sk-ant-test", fetch: impl });
    expect(provider.capabilities().local).toBe(false);
    const checks = await runProviderContract(provider, doc());
    expect(
      checks.every((check) => check.ok),
      JSON.stringify(checks, null, 2),
    ).toBe(true);
  });

  it("reports invalid keys and unknown models from testConnection", async () => {
    const unauthorized = scriptedFetch({
      "/v1/models/claude-opus-4-8": () =>
        jsonResponse(
          { type: "error", error: { type: "authentication_error", message: "bad key" } },
          401,
        ),
    });
    const badKey = await new AnthropicProvider({
      apiKey: "nope",
      fetch: unauthorized.impl,
    }).testConnection();
    expect(badKey.ok).toBe(false);
    expect(badKey.detail).toContain("rejected");

    const missingModel = scriptedFetch({
      "/v1/models/claude-nope": () =>
        jsonResponse({ type: "error", error: { type: "not_found_error", message: "nope" } }, 404),
    });
    const badModel = await new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-nope",
      fetch: missingModel.impl,
    }).testConnection();
    expect(badModel.ok).toBe(false);
    expect(badModel.detail).toContain("model");
  });

  it("maps auth failures on generation to typed errors", async () => {
    const { impl } = scriptedFetch({
      "/v1/messages": () =>
        jsonResponse(
          { type: "error", error: { type: "authentication_error", message: "bad" } },
          401,
        ),
    });
    await expect(
      new AnthropicProvider({ apiKey: "nope", fetch: impl }).generateProposal(request()),
    ).rejects.toMatchObject({ name: "AiProviderError", kind: "auth" });
  });

  it("joins multiple text blocks and rejects empty content", async () => {
    const twoBlocks = scriptedFetch({
      "/v1/messages": () =>
        jsonResponse({
          ...message(""),
          content: [
            { type: "text", text: "part one" },
            { type: "text", text: "part two" },
          ],
        }),
    });
    const raw = await new AnthropicProvider({
      apiKey: "k",
      fetch: twoBlocks.impl,
    }).generateProposal(request());
    expect(raw.text).toBe("part one\npart two");

    const empty = scriptedFetch({
      "/v1/messages": () => jsonResponse({ ...message(""), content: [] }),
    });
    await expect(
      new AnthropicProvider({ apiKey: "k", fetch: empty.impl }).generateProposal(request()),
    ).rejects.toMatchObject({ kind: "response" });
  });
});
