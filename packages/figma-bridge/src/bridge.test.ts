import { describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet, type Theme } from "@okeytokey/core";

import {
  ApplyError,
  cssToFigmaColor,
  dimensionToPx,
  fontWeightToStyle,
  planApply,
} from "./apply.js";
import { parseMainToUi, parseUiToMain } from "./protocol.js";
import { importVariables, planVariableExport, type VariableDump } from "./variables.js";

describe("protocol", () => {
  it("accepts valid messages in both directions", () => {
    expect(
      parseUiToMain({ type: "apply-token", path: "colors.blue", target: "fill" }),
    ).toBeDefined();
    expect(parseUiToMain({ type: "set-active-theme", theme: null })).toBeDefined();
    expect(parseMainToUi({ type: "applied", path: "colors.blue", nodeCount: 3 })).toBeDefined();
    expect(
      parseMainToUi({ type: "init", protocolVersion: 1, activeTheme: null, tokenCount: 0 }),
    ).toBeDefined();
  });

  it("rejects malformed and foreign messages", () => {
    expect(parseUiToMain({ type: "apply-token", path: 42, target: "fill" })).toBeUndefined();
    expect(parseUiToMain({ type: "unknown-op" })).toBeUndefined();
    expect(parseUiToMain("not an object")).toBeUndefined();
    expect(parseMainToUi({ type: "applied" })).toBeUndefined();
  });
});

describe("converters", () => {
  it("cssToFigmaColor handles hex, alpha, oklch, and rejects junk", () => {
    expect(cssToFigmaColor("#ff0000")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(cssToFigmaColor("#00000080")?.a).toBeCloseTo(0.5, 1);
    const oklch = cssToFigmaColor("oklch(0.62 0.19 259)");
    expect(oklch).toBeDefined();
    expect(oklch?.b).toBeGreaterThan(oklch?.r ?? 1);
    expect(cssToFigmaColor("16px")).toBeUndefined();
  });

  it("dimensionToPx handles every dimension form", () => {
    expect(dimensionToPx("16px")).toBe(16);
    expect(dimensionToPx("1.5rem")).toBe(24);
    expect(dimensionToPx({ value: 2, unit: "rem" })).toBe(32);
    expect(dimensionToPx(8)).toBe(8);
    expect(dimensionToPx("#fff")).toBeUndefined();
  });

  it("fontWeightToStyle maps numbers and keywords", () => {
    expect(fontWeightToStyle(400)).toBe("Regular");
    expect(fontWeightToStyle(600)).toBe("Semi Bold");
    expect(fontWeightToStyle(650)).toBe("Bold");
    expect(fontWeightToStyle("semi-bold")).toBe("Semi Bold");
  });
});

describe("planApply", () => {
  it("plans paints, radii, spacing, and typography", () => {
    expect(planApply("color", "#3b82f6", "fill")).toMatchObject({
      kind: "solid-paint",
      property: "fills",
    });
    expect(planApply("color", "#3b82f6", "stroke")).toMatchObject({ property: "strokes" });
    expect(planApply("dimension", "8px", "cornerRadius")).toEqual({
      kind: "corner-radius",
      radius: 8,
    });
    expect(planApply("dimension", "1rem", "padding")).toEqual({ kind: "padding", padding: 16 });
    expect(planApply("dimension", "4px", "gap")).toEqual({ kind: "gap", gap: 4 });
    expect(
      planApply(
        "typography",
        { fontSize: "32px", fontFamily: ["Inter", "sans-serif"], fontWeight: 700, lineHeight: 1.2 },
        "typography",
      ),
    ).toEqual({
      kind: "typography",
      fontSize: 32,
      fontFamily: "Inter",
      fontStyle: "Bold",
      lineHeightPercent: 120,
      letterSpacingPx: undefined,
    });
  });

  it("throws actionable ApplyErrors on mismatches", () => {
    expect(() => planApply("dimension", "16px", "fill")).toThrow(ApplyError);
    expect(() => planApply("color", "#fff", "cornerRadius")).toThrow(/dimension or number/);
    expect(() => planApply("color", "#fff", "typography")).toThrow(/composite/);
  });
});

describe("planVariableExport", () => {
  const document = createTokenDocument([
    parseTokenSet(
      "global",
      `{
  "colors": { "$type": "color", "bg": { "$value": "#ffffff" }, "fg": { "$value": "#111111" } },
  "spacing": { "$type": "dimension", "md": { "$value": "16px" } },
  "type": {
    "heading": { "$type": "typography", "$value": { "fontSize": "32px" } }
  }
}`,
    ),
    parseTokenSet("dark", '{ "colors": { "$type": "color", "bg": { "$value": "#111111" } } }'),
  ]);
  const themes: Theme[] = [
    {
      name: "light",
      group: "mode",
      sets: [
        { set: "global", status: "enabled" },
        { set: "dark", status: "disabled" },
      ],
    },
    {
      name: "dark",
      group: "mode",
      sets: [
        { set: "global", status: "enabled" },
        { set: "dark", status: "enabled" },
      ],
    },
  ];

  it("collections = theme group, modes = themes, per-mode values", () => {
    const plan = planVariableExport(document, themes);
    expect(plan.collection).toBe("mode");
    expect(plan.modes).toEqual(["light", "dark"]);

    const bg = plan.variables.find((variable) => variable.name === "colors/bg");
    expect(bg?.resolvedType).toBe("COLOR");
    expect(bg?.valuesByMode.light).toMatchObject({ kind: "color", color: { r: 1, g: 1, b: 1 } });
    expect(bg?.valuesByMode.dark).toMatchObject({
      color: { r: expect.closeTo(0.066, 2) as number },
    });

    const spacing = plan.variables.find((variable) => variable.name === "spacing/md");
    expect(spacing?.resolvedType).toBe("FLOAT");
    expect(spacing?.valuesByMode.light).toEqual({ kind: "float", value: 16 });
  });

  it("reports composite types as skipped", () => {
    const plan = planVariableExport(document, themes);
    expect(plan.report.mapped).toBe(3);
    expect(plan.report.skipped).toEqual([
      { name: "type.heading", reason: 'type "typography" has no Figma Variable equivalent' },
    ]);
  });
});

describe("importVariables", () => {
  const dump: VariableDump = {
    collection: "mode",
    modes: ["light", "dark"],
    variables: [
      {
        name: "colors/bg",
        resolvedType: "COLOR",
        valuesByMode: {
          light: { r: 1, g: 1, b: 1, a: 1 },
          dark: { r: 0, g: 0, b: 0, a: 1 },
        },
      },
      { name: "spacing/md", resolvedType: "FLOAT", valuesByMode: { light: 16, dark: 16 } },
      { name: "flag", resolvedType: "BOOLEAN", valuesByMode: { light: true, dark: false } },
    ],
  };

  it("produces one valid DTCG file per mode, nested by variable groups", () => {
    const result = importVariables(dump);
    expect(result.files.map((file) => file.name)).toEqual(["mode.light", "mode.dark"]);

    // Round-trips through the real parser (validity check).
    const light = parseTokenSet("mode.light", result.files[0]?.json ?? "{}");
    expect(light.tokens.get("colors.bg")?.value).toBe("#ffffff");
    expect(light.tokens.get("spacing.md")?.value).toBe(16);
    const dark = parseTokenSet("mode.dark", result.files[1]?.json ?? "{}");
    expect(dark.tokens.get("colors.bg")?.value).toBe("#000000");
  });

  it("reports unsupported types", () => {
    const result = importVariables(dump);
    expect(result.report.mapped).toBe(2);
    expect(result.report.skipped[0]?.name).toBe("flag");
    expect(result.report.skipped[0]?.reason).toContain("BOOLEAN");
  });
});
