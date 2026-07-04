import { describe, expect, it } from "vitest";

import { okeytokeyExtensionSchema } from "./extensions.js";

describe("okeytokeyExtensionSchema", () => {
  it("accepts an empty object", () => {
    expect(okeytokeyExtensionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts full decision context", () => {
    const result = okeytokeyExtensionSchema.safeParse({
      guidelines: "Use for primary CTAs only, never on dark surfaces.",
      context: ["marketing-site", "app"],
      decision: {
        author: "vince",
        date: "2026-07-02",
        rationale: "Brand refresh Q3",
        links: ["https://example.com/rfc-42"],
      },
      lifecycle: "deprecated",
      replacedBy: "colors.action.primary",
      lineage: {
        generator: "scale:modular",
        inputs: ["colors.primary.500"],
        params: { ratio: 1.25 },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown lifecycle values and unknown keys", () => {
    expect(okeytokeyExtensionSchema.safeParse({ lifecycle: "retired" }).success).toBe(false);
    expect(okeytokeyExtensionSchema.safeParse({ owner: "vince" }).success).toBe(false);
  });

  it("accepts layer and owners; rejects unknown layers and empty owner ids", () => {
    expect(
      okeytokeyExtensionSchema.safeParse({ layer: "semantic", owners: ["@design-systems"] })
        .success,
    ).toBe(true);
    expect(okeytokeyExtensionSchema.safeParse({ layer: "brand" }).success).toBe(false);
    expect(okeytokeyExtensionSchema.safeParse({ owners: [""] }).success).toBe(false);
  });

  it("rejects incomplete decisions and non-URL links", () => {
    expect(okeytokeyExtensionSchema.safeParse({ decision: { author: "v" } }).success).toBe(false);
    expect(
      okeytokeyExtensionSchema.safeParse({
        decision: { author: "v", date: "2026-01-01", rationale: "r", links: ["not-a-url"] },
      }).success,
    ).toBe(false);
  });
});
