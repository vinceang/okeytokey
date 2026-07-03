import { describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import { suggestColors, suggestQuantitySteps } from "./suggest.js";

const doc = () =>
  createTokenDocument([
    parseTokenSet(
      "global",
      `{
  "colors": {
    "$type": "color",
    "blue": { "500": { "$value": "#3b82f6" }, "900": { "$value": "#1e3a8a" } },
    "red": { "$value": "#ef4444" },
    "gray": { "$value": "#64748b" }
  },
  "spacing": {
    "$type": "dimension",
    "xs": { "$value": "4px" },
    "sm": { "$value": "8px" },
    "md": { "$value": "16px" },
    "lg": { "$value": "32px" }
  },
  "motion": {
    "$type": "duration",
    "fast": { "$value": "100ms" },
    "slow": { "$value": "400ms" }
  }
}`,
    ),
  ]);

describe("suggestColors", () => {
  it("suggests the scale-generator value for a numeric step between anchors", () => {
    const suggestions = suggestColors(doc(), "global", "colors.blue.700");
    const scaleFit = suggestions.find((entry) => entry.reason.includes("scale"));
    expect(scaleFit).toBeDefined();
    expect(scaleFit?.value).toMatch(/^#[0-9a-f]{6}$/);
    // Between the 500 and 900 anchors, darker than 500.
    expect(scaleFit?.value).not.toBe("#3b82f6");
  });

  it("offers no arbitrary hue for a fresh group — only computable scale fits", () => {
    // A new brand color is a design decision, not a computation.
    expect(suggestColors(doc(), "global", "colors.brand")).toEqual([]);
    expect(suggestColors(doc(), "global", "colors.brand.500")).toEqual([]);
  });

  it("returns nothing for unknown sets and non-numeric paths", () => {
    expect(suggestColors(doc(), "nope", "colors.x")).toEqual([]);
    expect(suggestColors(doc(), "global", "colors.brand")).toEqual([]);
  });
});

describe("suggestQuantitySteps", () => {
  it("continues a geometric progression and reports it as a ×-scale", () => {
    const set = doc().sets.get("global");
    if (!set) throw new Error("missing set");
    const suggestions = suggestQuantitySteps(set, "spacing");
    expect(suggestions[0]?.value).toBe("64px");
    expect(suggestions[0]?.reason).toContain("×-scale");
  });

  it("continues arithmetically with two values and needs at least two", () => {
    const set = doc().sets.get("global");
    if (!set) throw new Error("missing set");
    const motion = suggestQuantitySteps(set, "motion");
    expect(motion[0]?.value).toBe("700ms");
    expect(suggestQuantitySteps(set, "colors")).toEqual([]);
  });
});
