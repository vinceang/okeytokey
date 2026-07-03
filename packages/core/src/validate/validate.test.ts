import { describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import { apcaContrast, wcagContrast, wcagLevel } from "../color/contrast.js";
import { lintDocument } from "./engine.js";
import type { Diagnostic } from "./types.js";

const doc = (json: string) => createTokenDocument([parseTokenSet("global", json)]);

const byRule = (diagnostics: readonly Diagnostic[], ruleId: string) =>
  diagnostics.filter((diagnostic) => diagnostic.ruleId === ruleId);

describe("contrast math", () => {
  it("computes canonical WCAG ratios", () => {
    expect(wcagContrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(wcagContrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // Symmetric.
    expect(wcagContrast("#3b82f6", "#ffffff")).toBeCloseTo(wcagContrast("#ffffff", "#3b82f6"), 8);
  });

  it("maps ratios to levels", () => {
    expect(wcagLevel(21)).toBe("AAA");
    expect(wcagLevel(5)).toBe("AA");
    expect(wcagLevel(3.2)).toBe("AA-large");
    expect(wcagLevel(2)).toBe("fail");
  });

  it("APCA: polarity and magnitude behave", () => {
    const dark = apcaContrast("#000000", "#ffffff");
    const light = apcaContrast("#ffffff", "#000000");
    expect(dark).toBeGreaterThan(100); // ~106
    expect(light).toBeLessThan(-100); // ~-108
    expect(Math.abs(apcaContrast("#888888", "#999999"))).toBeLessThan(10);
  });
});

describe("no-broken-references / no-reference-cycles", () => {
  it("reports broken references with the owner path", () => {
    const diagnostics = lintDocument(
      doc('{ "a": { "$type": "color", "$value": "{missing.token}" } }'),
    );
    const broken = byRule(diagnostics, "no-broken-references");
    expect(broken).toHaveLength(1);
    expect(broken[0]?.tokenPath).toBe("a");
    expect(broken[0]?.severity).toBe("error");
    expect(broken[0]?.message).toContain("{missing.token}");
  });

  it("reports each cycle once with its path", () => {
    const diagnostics = lintDocument(
      doc(`{
        "a": { "$type": "number", "$value": "{b}" },
        "b": { "$type": "number", "$value": "{a}" }
      }`),
    );
    const cycles = byRule(diagnostics, "no-reference-cycles");
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.message).toMatch(/a → b|b → a/);
  });
});

describe("naming-convention", () => {
  const fixture = doc(`{
    "colors": { "$type": "color", "Primary": { "$value": "#fff" }, "safe": { "$value": "#000" } },
    "spacing": { "$type": "dimension", "MD": { "$value": "8px" } }
  }`);

  it("is off by default", () => {
    expect(byRule(lintDocument(fixture), "naming-convention")).toHaveLength(0);
  });

  it("applies a base pattern to every segment", () => {
    const diagnostics = lintDocument(fixture, {
      rules: { "naming-convention": ["warn", { pattern: "^[a-z][a-z0-9-]*$" }] },
    });
    const naming = byRule(diagnostics, "naming-convention");
    expect(naming.map((diagnostic) => diagnostic.tokenPath).sort()).toEqual([
      "colors.Primary",
      "spacing.MD",
    ]);
  });

  it("per-type patterns override the base", () => {
    const diagnostics = lintDocument(fixture, {
      rules: {
        "naming-convention": ["error", { pattern: ".*", types: { dimension: "^[a-z]+$" } }],
      },
    });
    const naming = byRule(diagnostics, "naming-convention");
    expect(naming).toHaveLength(1);
    expect(naming[0]?.tokenPath).toBe("spacing.MD");
  });
});

describe("contrast rule", () => {
  const fixture = doc(`{
    "text": { "$type": "color", "$value": "#767676" },
    "bg": { "$type": "color", "$value": "#ffffff" },
    "faint": { "$type": "color", "$value": "#cccccc" }
  }`);

  it("passes AA pairs and fails faint ones", () => {
    const diagnostics = lintDocument(fixture, {
      rules: {
        contrast: [
          "error",
          {
            pairs: [
              { foreground: "text", background: "bg" },
              { foreground: "faint", background: "bg" },
            ],
          },
        ],
        "no-orphan-tokens": "off",
      },
    });
    const results = byRule(diagnostics, "contrast");
    // #767676 on white is 4.54:1 (passes AA) but Lc ~58.9 (just under APCA 60).
    const failing = results.map((diagnostic) => diagnostic.message);
    expect(failing.some((message) => message.includes('"faint"') && message.includes("WCAG"))).toBe(
      true,
    );
    expect(failing.some((message) => message.includes('"text"') && message.includes("WCAG"))).toBe(
      false,
    );
  });

  it("reports unresolvable pairs", () => {
    const diagnostics = lintDocument(fixture, {
      rules: { contrast: ["warn", { pairs: [{ foreground: "nope", background: "bg" }] }] },
    });
    expect(byRule(diagnostics, "contrast")[0]?.message).toContain("does not resolve");
  });
});

describe("no-orphan-tokens", () => {
  it("flags tokens nothing references", () => {
    const diagnostics = lintDocument(
      doc(`{
        "base": { "$type": "color", "$value": "#fff" },
        "alias": { "$type": "color", "$value": "{base}" }
      }`),
    );
    const orphans = byRule(diagnostics, "no-orphan-tokens");
    expect(orphans.map((diagnostic) => diagnostic.tokenPath)).toEqual(["alias"]);
    expect(orphans[0]?.severity).toBe("warn");
  });
});

describe("deprecated-usage", () => {
  const fixture = doc(`{
    "old": {
      "$type": "color", "$value": "#fff", "$deprecated": "superseded",
      "$extensions": { "com.okeytokey": { "lifecycle": "deprecated", "replacedBy": "new" } }
    },
    "new": { "$type": "color", "$value": "#fefefe" },
    "user": { "$type": "color", "$value": "{old}" }
  }`);

  it("flags aliases to deprecated tokens and offers a fix", () => {
    const diagnostics = lintDocument(fixture, { rules: { "no-orphan-tokens": "off" } });
    const usage = byRule(diagnostics, "deprecated-usage");
    expect(usage).toHaveLength(1);
    expect(usage[0]?.tokenPath).toBe("user");
    expect(usage[0]?.message).toContain('use "new"');
    expect(usage[0]?.fix?.label).toBe("Point at new instead");
  });

  it("the fix rewrites the alias", () => {
    const diagnostics = lintDocument(fixture, { rules: { "no-orphan-tokens": "off" } });
    const fix = byRule(diagnostics, "deprecated-usage")[0]?.fix;
    if (!fix) throw new Error("expected a fix");
    const fixed = fix.apply(fixture);
    expect(fixed.sets.get("global")?.tokens.get("user")?.value).toBe("{new}");
    // Re-linting the fixed document reports nothing.
    expect(
      byRule(lintDocument(fixed, { rules: { "no-orphan-tokens": "off" } }), "deprecated-usage"),
    ).toHaveLength(0);
  });
});

describe("engine configuration", () => {
  it("severity overrides and off work", () => {
    const fixture = doc('{ "a": { "$type": "color", "$value": "{gone}" } }');
    expect(lintDocument(fixture, { rules: { "no-broken-references": "warn" } })[0]?.severity).toBe(
      "warn",
    );
    expect(
      byRule(
        lintDocument(fixture, { rules: { "no-broken-references": "off" } }),
        "no-broken-references",
      ),
    ).toHaveLength(0);
  });

  it("unknown rule ids surface as diagnostics", () => {
    const diagnostics = lintDocument(doc("{}"), { rules: { "no-such-rule": "error" } });
    expect(diagnostics[0]?.ruleId).toBe("lint-config");
    expect(diagnostics[0]?.message).toContain("no-such-rule");
  });

  it("errors sort before warnings", () => {
    const diagnostics = lintDocument(
      doc(`{
        "orphan": { "$type": "color", "$value": "#fff" },
        "broken": { "$type": "color", "$value": "{gone}" }
      }`),
    );
    expect(diagnostics[0]?.severity).toBe("error");
  });
});
