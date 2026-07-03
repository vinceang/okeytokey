import { describe, expect, it } from "vitest";

import { TokenParseError } from "../errors.js";
import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import { wcagContrast } from "../color/contrast.js";
import { DEFAULT_SCALE_STEPS, planColorScale } from "./scale.js";

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

  it("requires two numeric color anchors and a real set", () => {
    expect(() =>
      planColorScale(
        doc('{ "colors": { "$type": "color", "blue": { "500": { "$value": "#3b82f6" } } } }'),
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
    expect(() => planColorScale(broken, "global", "colors.blue")).toThrow(
      /found only 600.*Excluded: 500 \(resolves to "32px".*raw value is "\{spacing\.lg\}"/,
    );
  });

  it("exports sensible default steps", () => {
    expect(DEFAULT_SCALE_STEPS).toContain(50);
    expect(DEFAULT_SCALE_STEPS).toContain(950);
  });
});
