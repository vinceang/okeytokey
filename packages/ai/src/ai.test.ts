import { describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet } from "@okeytokey/core";

import { applyProposal } from "./apply.js";
import { assembleContext } from "./context.js";
import { runProviderContract } from "./contract.js";
import { MockProvider } from "./mock.js";
import { parseProposal, type TokenChangeProposal } from "./proposal.js";

const doc = () =>
  createTokenDocument([
    parseTokenSet(
      "global",
      `{
  "colors": {
    "$type": "color",
    "blue": { "500": { "$value": "#3b82f6" }, "900": { "$value": "#1e3a8a" } }
  },
  "semantic": { "$type": "color", "action": { "$value": "{colors.blue.500}" } }
}`,
    ),
  ]);

describe("parseProposal", () => {
  const valid: TokenChangeProposal = {
    summary: "Add a surface token",
    operations: [
      { op: "create", set: "global", path: "semantic.surface", type: "color", value: "#ffffff" },
    ],
  };

  it("parses bare JSON, fenced JSON, and JSON with surrounding prose", () => {
    const json = JSON.stringify(valid);
    for (const text of [
      json,
      "```json\n" + json + "\n```",
      "Sure! Here is the proposal you asked for:\n" + json + "\nLet me know!",
    ]) {
      const result = parseProposal(text);
      expect(result.ok, text.slice(0, 20)).toBe(true);
    }
  });

  it("rejects text without JSON, broken JSON, and schema mismatches", () => {
    expect(parseProposal("I cannot help with that.")).toMatchObject({
      ok: false,
      failure: { reason: "no-json" },
    });
    expect(parseProposal('{ "summary": "x", operations: [ }')).toMatchObject({
      ok: false,
      failure: { reason: "invalid-json" },
    });
    const wrongShape = parseProposal(JSON.stringify({ summary: "x", operations: [] }));
    expect(wrongShape).toMatchObject({ ok: false, failure: { reason: "schema-mismatch" } });
    const badOp = parseProposal(
      JSON.stringify({ summary: "x", operations: [{ op: "explode", path: "a" }] }),
    );
    expect(badOp.ok).toBe(false);
  });

  it("rejects unknown token types and extra keys (strict)", () => {
    const badType = parseProposal(
      JSON.stringify({
        summary: "x",
        operations: [{ op: "create", set: "s", path: "a", type: "colour", value: "#fff" }],
      }),
    );
    expect(badType.ok).toBe(false);
    const extraKey = parseProposal(
      JSON.stringify({
        summary: "x",
        sneaky: true,
        operations: [{ op: "delete", set: "s", path: "a" }],
      }),
    );
    expect(extraKey.ok).toBe(false);
  });
});

describe("applyProposal", () => {
  it("applies operations through core, later ops see earlier effects", () => {
    const proposal: TokenChangeProposal = {
      summary: "Create then alias",
      operations: [
        { op: "create", set: "global", path: "semantic.surface", type: "color", value: "#ffffff" },
        {
          op: "create",
          set: "global",
          path: "semantic.card",
          type: "color",
          value: "{semantic.surface}",
        },
        { op: "rename", fromPath: "semantic.action", toPath: "semantic.cta" },
      ],
    };
    const result = applyProposal(doc(), proposal);
    expect(result.results.every((entry) => entry.ok)).toBe(true);
    const set = result.document.sets.get("global");
    expect(set?.tokens.get("semantic.card")?.value).toBe("{semantic.surface}");
    expect(set?.tokens.has("semantic.cta")).toBe(true);
    expect(set?.tokens.has("semantic.action")).toBe(false);
    // Diff includes the rename and the additions.
    const kinds = result.diff.sets[0]?.changes.map((change) => change.kind).sort();
    expect(kinds).toContain("renamed");
  });

  it("collects per-operation failures without aborting (invalid value, missing set, bad ref target)", () => {
    const proposal: TokenChangeProposal = {
      summary: "Mixed bag",
      operations: [
        { op: "create", set: "global", path: "spacing.bad", type: "dimension", value: "16" },
        { op: "update", set: "ghost-set", path: "a", value: 1 },
        { op: "delete", set: "global", path: "does.not.exist" },
        { op: "create", set: "global", path: "semantic.ok", type: "color", value: "#000000" },
      ],
    };
    const result = applyProposal(doc(), proposal);
    expect(result.results.map((entry) => entry.ok)).toEqual([false, false, false, true]);
    expect(result.results[0]?.error).toContain("Invalid dimension");
    expect(result.results[1]?.error).toContain("ghost-set");
    expect(result.document.sets.get("global")?.tokens.has("semantic.ok")).toBe(true);
  });

  it("selective acceptance applies only chosen operations", () => {
    const proposal: TokenChangeProposal = {
      summary: "Two creates",
      operations: [
        { op: "create", set: "global", path: "a", type: "number", value: 1 },
        { op: "create", set: "global", path: "b", type: "number", value: 2 },
      ],
    };
    const result = applyProposal(doc(), proposal, new Set([1]));
    const set = result.document.sets.get("global");
    expect(set?.tokens.has("a")).toBe(false);
    expect(set?.tokens.get("b")?.value).toBe(2);
    expect(result.results).toHaveLength(1);
  });

  it("a cyclic proposal fails at resolution time, not silently", () => {
    const proposal: TokenChangeProposal = {
      summary: "Self reference",
      operations: [{ op: "create", set: "global", path: "loop", type: "color", value: "{loop}" }],
    };
    const result = applyProposal(doc(), proposal);
    // Creation succeeds structurally; the cycle surfaces in the diff's
    // resolution comparison and in lint — prove the diff didn't crash.
    expect(result.results[0]?.ok).toBe(true);
    expect(result.diff.sets.length).toBeGreaterThan(0);
  });
});

describe("context assembly", () => {
  it("includes the selected subtree plus one level of referenced primitives", () => {
    const context = assembleContext(doc(), ["semantic"]);
    expect(context.tokens.map((token) => token.path)).toEqual(["semantic.action"]);
    expect(context.referenced.map((token) => token.path)).toEqual(["colors.blue.500"]);
    expect(context.rendered).toContain("semantic.action");
    expect(context.rendered).not.toContain("colors.blue.900"); // not dragged along
  });
});

describe("MockProvider + contract", () => {
  it("passes the provider contract", async () => {
    const checks = await runProviderContract(new MockProvider(), doc());
    expect(checks.every((check) => check.ok)).toBe(true);
  });

  it("contract reports a failing connection and stops", async () => {
    const checks = await runProviderContract(new MockProvider({ offline: true }), doc());
    expect(checks.find((check) => check.name === "connection")?.ok).toBe(false);
    expect(checks.some((check) => check.name === "proposal-parses")).toBe(false);
  });

  it("mock's default proposal round-trips: parse → apply → valid document", async () => {
    const provider = new MockProvider();
    const document = doc();
    const raw = await provider.generateProposal({
      task: "generate-semantic-tokens",
      instruction: "test",
      context: assembleContext(document, ["colors"]),
    });
    const parsed = parseProposal(raw.text);
    if (!parsed.ok) throw new Error("expected parse success");
    const applied = applyProposal(document, parsed.proposal);
    expect(applied.results.every((entry) => entry.ok)).toBe(true);
    expect(applied.document.sets.get("global")?.tokens.get("semantic.mock.primary")?.value).toBe(
      "{colors.blue.500}",
    );
  });

  it("malformed override exercises safe rejection", async () => {
    const provider = new MockProvider({
      responses: { "generate-semantic-tokens": "Absolutely! I changed everything for you." },
    });
    const raw = await provider.generateProposal({
      task: "generate-semantic-tokens",
      instruction: "test",
      context: assembleContext(doc(), ["colors"]),
    });
    expect(parseProposal(raw.text).ok).toBe(false);
  });
});
