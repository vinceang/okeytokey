import { describe, expect, it } from "vitest";

import { TokenParseError } from "../errors.js";
import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import { wcagContrast } from "../color/contrast.js";
import {
  DEFAULT_SCALE_STEPS,
  DIMENSION_SCALE_GENERATOR_ID,
  planColorScale,
  planColorScaleFromSeed,
  planDimensionScale,
} from "./scale.js";

const doc = (json: string) => createTokenDocument([parseTokenSet("global", json)]);

const ANCHORS = `{
  "colors": {
    "$type": "color",
    "blue": {
      "100": { "$value": "#dbeafe" },
      "500": { "$value": "#3b82f6" },
      "900": { "$value": "#1e3a8a" }
    }
  }
}`;

describe("planColorScale", () => {
  it("fills missing steps between anchors, skipping outside the range", () => {
    const plan = planColorScale(doc(ANCHORS), "global", "colors.blue");
    expect(plan.anchors.map((anchor) => anchor.step)).toEqual([100, 500, 900]);
    expect(plan.generated.map((entry) => entry.step)).toEqual([200, 300, 400, 600, 700, 800]);
    expect(plan.skipped.map((entry) => entry.step)).toEqual([50, 950]);
    expect(plan.skipped[0]?.reason).toContain("outside the anchor range");
  });

  it("interpolates monotonically in lightness (perceptual sanity)", () => {
    const plan = planColorScale(doc(ANCHORS), "global", "colors.blue");
    // Against white, contrast must strictly increase as steps darken.
    const byStep = new Map(plan.generated.map((entry) => [entry.step, entry.value]));
    const contrastOf = (step: number) => wcagContrast(byStep.get(step) ?? "#fff", "#ffffff");
    expect(contrastOf(200)).toBeLessThan(contrastOf(300));
    expect(contrastOf(300)).toBeLessThan(contrastOf(400));
    expect(contrastOf(600)).toBeLessThan(contrastOf(700));
    expect(contrastOf(700)).toBeLessThan(contrastOf(800));
  });

  it("is deterministic: identical inputs, identical outputs", () => {
    const one = planColorScale(doc(ANCHORS), "global", "colors.blue");
    const two = planColorScale(doc(ANCHORS), "global", "colors.blue");
    expect(one.generated).toEqual(two.generated);
  });

  it("resolves aliased anchors before interpolating", () => {
    const aliased = doc(`{
      "brand": { "$type": "color", "seed": { "$value": "#3b82f6" } },
      "colors": {
        "$type": "color",
        "blue": {
          "100": { "$value": "#dbeafe" },
          "500": { "$value": "{brand.seed}" },
          "900": { "$value": "#1e3a8a" }
        }
      }
    }`);
    const direct = planColorScale(doc(ANCHORS), "global", "colors.blue");
    const viaAlias = planColorScale(aliased, "global", "colors.blue");
    expect(viaAlias.generated).toEqual(direct.generated);
  });

  it("every generated value is sRGB hex (out-of-gamut colors are chroma-clamped)", () => {
    // A saturated blue seed pushes light/dark interpolants out of sRGB;
    // they must come back gamut-mapped as hex, not as raw oklch() strings.
    const single = doc(
      '{ "colors": { "$type": "color", "blue": { "600": { "$value": "#2563eb" } } } }',
    );
    const plan = planColorScale(single, "global", "colors.blue");
    for (const entry of plan.generated) {
      expect(entry.value, `${entry.path} should be hex`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(plan.synthesized?.lightEnd).toMatch(/^#[0-9a-f]{6}$/);
    expect(plan.synthesized?.darkEnd).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("apply() sorts the group's numeric children ascending", () => {
    // Seed written as 600 only; generated steps must not trail after it.
    const single = doc(
      '{ "colors": { "$type": "color", "blue": { "600": { "$value": "#2563eb" } } } }',
    );
    const next = planColorScale(single, "global", "colors.blue").apply();
    const paths = [...(next.sets.get("global")?.tokens.keys() ?? [])].filter((path) =>
      path.startsWith("colors.blue."),
    );
    expect(paths).toEqual([
      "colors.blue.50",
      "colors.blue.100",
      "colors.blue.200",
      "colors.blue.300",
      "colors.blue.400",
      "colors.blue.500",
      "colors.blue.600",
      "colors.blue.700",
      "colors.blue.800",
      "colors.blue.900",
      "colors.blue.950",
    ]);
  });

  it("apply() creates tokens with lineage metadata, anchors untouched", () => {
    const plan = planColorScale(doc(ANCHORS), "global", "colors.blue");
    const next = plan.apply();
    const set = next.sets.get("global");
    const generated = set?.tokens.get("colors.blue.300");
    expect(generated?.type).toBe("color");
    expect(generated?.okeytokey?.lineage?.generator).toBe("scale:oklch");
    expect(generated?.okeytokey?.lineage?.inputs).toEqual([
      "colors.blue.100",
      "colors.blue.500",
      "colors.blue.900",
    ]);
    // Anchors keep their original raw values.
    expect(set?.tokens.get("colors.blue.500")?.value).toBe("#3b82f6");
    // The result revalidates (apply goes through core mutations).
    expect(set?.tokens.size).toBe(9);
  });

  it("honors custom steps", () => {
    const plan = planColorScale(doc(ANCHORS), "global", "colors.blue", { steps: [250, 750] });
    expect(plan.generated.map((entry) => entry.step)).toEqual([250, 750]);
  });

  it("a single anchor synthesizes a full ramp from near-white to near-dark", () => {
    const single = doc(
      '{ "colors": { "$type": "color", "blue": { "600": { "$value": "#2563eb" } } } }',
    );
    const plan = planColorScale(single, "global", "colors.blue");
    // Every default step except the anchor itself is generated.
    expect(plan.generated.map((entry) => entry.step)).toEqual([
      50, 100, 200, 300, 400, 500, 700, 800, 900, 950,
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.anchors).toHaveLength(1);
    expect(plan.synthesized?.lightEnd).toBeDefined();
    expect(plan.synthesized?.darkEnd).toBeDefined();
    // Monotonic against white: 50 is lightest, 950 darkest.
    const byStep = new Map(plan.generated.map((entry) => [entry.step, entry.value]));
    const contrastOf = (step: number) => wcagContrast(byStep.get(step) ?? "#fff", "#ffffff");
    expect(contrastOf(50)).toBeLessThan(contrastOf(300));
    expect(contrastOf(700)).toBeLessThan(contrastOf(950));
    // Deterministic.
    expect(planColorScale(single, "global", "colors.blue").generated).toEqual(plan.generated);
  });

  it("explicit light/dark ends extend the range and are validated", () => {
    const plan = planColorScale(doc(ANCHORS), "global", "colors.blue", {
      lightEnd: "#ffffff",
      darkEnd: "#000000",
    });
    // 50 and 950 are now in range instead of skipped.
    expect(plan.generated.map((entry) => entry.step)).toEqual([
      50, 200, 300, 400, 600, 700, 800, 950,
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.synthesized).toEqual({ lightEnd: "#ffffff", darkEnd: "#000000" });
    expect(() =>
      planColorScale(doc(ANCHORS), "global", "colors.blue", { lightEnd: "16px" }),
    ).toThrow(/lightest end "16px" is not a color/);
  });

  it("requires at least one numeric color anchor and a real set", () => {
    expect(() =>
      planColorScale(
        doc('{ "colors": { "$type": "color", "blue": {} } }'),
        "global",
        "colors.blue",
      ),
    ).toThrow(TokenParseError);
    expect(() => planColorScale(doc(ANCHORS), "nope", "colors.blue")).toThrow(/Set does not exist/);
  });

  it("explains why numeric children were excluded from the anchors", () => {
    // A numeric child aliasing a dimension is not a color anchor — say so.
    const broken = doc(`{
      "spacing": { "$type": "dimension", "lg": { "$value": "32px" } },
      "colors": {
        "$type": "color",
        "blue": {
          "500": { "$value": "{spacing.lg}" },
          "600": { "$value": "#2563eb" }
        }
      }
    }`);
    // With one valid anchor the plan proceeds (single-anchor ramp), but the
    // exclusion is reported so the UI can warn about it.
    const plan = planColorScale(broken, "global", "colors.blue");
    expect(plan.anchors.map((anchor) => anchor.step)).toEqual([600]);
    expect(plan.excludedAnchors[0]).toMatch(
      /500 \(resolves to "32px".*raw value is "\{spacing\.lg\}"/,
    );
    // With zero valid anchors, the exclusions land in the error itself.
    const allBroken = doc(`{
      "spacing": { "$type": "dimension", "lg": { "$value": "32px" } },
      "colors": { "$type": "color", "blue": { "500": { "$value": "{spacing.lg}" } } }
    }`);
    expect(() => planColorScale(allBroken, "global", "colors.blue")).toThrow(
      /No numeric color anchors.*Excluded: 500/,
    );
  });

  it("exports sensible default steps", () => {
    expect(DEFAULT_SCALE_STEPS).toContain(50);
    expect(DEFAULT_SCALE_STEPS).toContain(950);
  });
});

describe("planColorScaleFromSeed", () => {
  const SEED = `{
  "colors": {
    "$type": "color",
    "red": { "$value": "#ff0000" }
  },
  "semantic": {
    "$type": "color",
    "danger": { "$value": "{colors.red}" },
    "dangerHover": { "$value": "darken({colors.red}, 0.1)" }
  }
}`;

  it("renames the seed to its step, fills the ramp, and retargets references", () => {
    const plan = planColorScaleFromSeed(doc(SEED), "global", "colors.red");
    expect(plan.seedStep).toBe(500);
    expect(plan.referenceEdits).toBe(2); // the alias and the color function
    expect(plan.scale.anchors.map((anchor) => anchor.path)).toEqual(["colors.red.500"]);
    expect(plan.scale.generated.length).toBeGreaterThan(5);

    const next = plan.apply();
    const tokens = next.sets.get("global")?.tokens;
    expect(tokens?.has("colors.red")).toBe(false); // flat token became the group
    expect(tokens?.get("colors.red.500")?.value).toBe("#ff0000"); // seed preserved
    expect(tokens?.get("semantic.danger")?.value).toBe("{colors.red.500}");
    expect(String(tokens?.get("semantic.dangerHover")?.value)).toContain("{colors.red.500}");
    // Generated steps land sorted around the seed.
    expect(tokens?.has("colors.red.100")).toBe(true);
    expect(tokens?.has("colors.red.900")).toBe(true);
  });

  it("honors a custom seed step and rejects non-seeds with plain reasons", () => {
    const custom = planColorScaleFromSeed(doc(SEED), "global", "colors.red", { seedStep: 600 });
    expect(custom.apply().sets.get("global")?.tokens.get("colors.red.600")?.value).toBe("#ff0000");

    expect(() => planColorScaleFromSeed(doc(SEED), "global", "colors.nope")).toThrow(
      TokenParseError,
    );
    expect(() => planColorScaleFromSeed(doc(ANCHORS), "global", "colors.blue.500")).toThrow(
      /already looks like a scale step/,
    );
  });
});

describe("planDimensionScale", () => {
  const EMPTY = `{ "spacing": { "$type": "dimension" } }`;

  it("computes value(step) = base × ratio^offset around the base step", () => {
    const plan = planDimensionScale(doc(EMPTY), "global", "spacing", {
      base: "16px",
      ratio: 2,
      steps: [300, 400, 500, 600, 700],
      baseStep: 500,
    });
    expect(plan.unit).toBe("px");
    const byStep = new Map(plan.generated.map((entry) => [entry.step, entry.value]));
    expect(byStep.get(500)).toBe("16px"); // ratio^0
    expect(byStep.get(600)).toBe("32px"); // ×2
    expect(byStep.get(700)).toBe("64px"); // ×4
    expect(byStep.get(400)).toBe("8px"); // ÷2
    expect(byStep.get(300)).toBe("4px"); // ÷4
  });

  it("keeps existing steps as anchors and only generates the missing ones", () => {
    const withOne = `{ "spacing": { "$type": "dimension", "500": { "$value": "1rem" } } }`;
    const plan = planDimensionScale(doc(withOne), "global", "spacing", {
      base: "1rem",
      ratio: 1.5,
      steps: [400, 500, 600],
      baseStep: 500,
    });
    expect(plan.anchors.map((entry) => entry.step)).toEqual([500]);
    expect(plan.generated.map((entry) => entry.step)).toEqual([400, 600]);
    const applied = plan.apply().sets.get("global");
    expect(applied?.tokens.get("spacing.500")?.value).toBe("1rem"); // untouched
    expect(applied?.tokens.get("spacing.600")?.value).toBe("1.5rem");
  });

  it("stamps lineage and sorts generated steps numerically", () => {
    const plan = planDimensionScale(doc(EMPTY), "global", "spacing", {
      base: "16px",
      steps: [100, 500, 900],
      baseStep: 500,
    });
    const applied = plan.apply().sets.get("global");
    expect([...(applied?.tokens.keys() ?? [])]).toEqual([
      "spacing.100",
      "spacing.500",
      "spacing.900",
    ]);
    expect(applied?.tokens.get("spacing.100")?.okeytokey?.lineage?.generator).toBe(
      DIMENSION_SCALE_GENERATOR_ID,
    );
  });

  it("rejects a bad ratio, a non-dimension base, and a base step outside the steps", () => {
    expect(() =>
      planDimensionScale(doc(EMPTY), "global", "spacing", { base: "16px", ratio: 1 }),
    ).toThrow(/Ratio must be/);
    expect(() => planDimensionScale(doc(EMPTY), "global", "spacing", { base: "red" })).toThrow(
      /not a dimension value/,
    );
    expect(() =>
      planDimensionScale(doc(EMPTY), "global", "spacing", {
        base: "16px",
        steps: [100, 200],
        baseStep: 500,
      }),
    ).toThrow(/must be one of the steps/);
  });
});
