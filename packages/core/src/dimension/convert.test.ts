import { describe, expect, it } from "vitest";

import { TokenParseError } from "../errors.js";
import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import { createResolver } from "../resolver/resolver.js";
import { convertDimensionLiteral, planDimensionUnitConversion } from "./convert.js";

const doc = () =>
  createTokenDocument([
    parseTokenSet(
      "global",
      `{
  "spacing": {
    "$type": "dimension",
    "sm": { "$value": "4px" },
    "md": { "$value": "16px" },
    "lg": { "$value": "2rem" },
    "alias": { "$value": "{spacing.md}" },
    "double": { "$value": "{spacing.md} * 2" }
  },
  "radius": { "$type": "dimension", "pill": { "$value": "999px" } },
  "colors": { "$type": "color", "blue": { "$value": "#3b82f6" } }
}`,
    ),
  ]);

describe("convertDimensionLiteral", () => {
  it("converts px ↔ rem at the 16px base and round-trips exactly", () => {
    expect(convertDimensionLiteral("16px", "rem")).toBe("1rem");
    expect(convertDimensionLiteral("4px", "rem")).toBe("0.25rem");
    expect(convertDimensionLiteral("18px", "rem")).toBe("1.125rem");
    expect(convertDimensionLiteral("1.5rem", "px")).toBe("24px");
    expect(convertDimensionLiteral("0.625rem", "px")).toBe("10px");
    const roundTrip = convertDimensionLiteral("10px", "rem") ?? "";
    expect(convertDimensionLiteral(roundTrip, "px")).toBe("10px");
  });

  it("keeps already-matching values, honors a custom base, skips non-literals", () => {
    expect(convertDimensionLiteral("2rem", "rem")).toBe("2rem");
    expect(convertDimensionLiteral("20px", "rem", 10)).toBe("2rem");
    expect(convertDimensionLiteral("{spacing.md}", "rem")).toBeUndefined();
    expect(convertDimensionLiteral("{spacing.md} * 2", "rem")).toBeUndefined();
    expect(convertDimensionLiteral("200ms", "rem")).toBeUndefined();
  });
});

describe("planDimensionUnitConversion", () => {
  it("converts concrete literals in the group, skipping refs/math/other types", () => {
    const plan = planDimensionUnitConversion(doc(), "global", "spacing", "rem");
    expect(plan.entries.map((entry) => entry.path)).toEqual(["spacing.sm", "spacing.md"]);
    expect(plan.entries.map((entry) => entry.after)).toEqual(["0.25rem", "1rem"]);

    const next = plan.apply();
    const tokens = next.sets.get("global")?.tokens;
    expect(tokens?.get("spacing.lg")?.value).toBe("2rem"); // already rem
    expect(tokens?.get("spacing.alias")?.value).toBe("{spacing.md}");
    expect(tokens?.get("spacing.double")?.value).toBe("{spacing.md} * 2");
    expect(tokens?.get("radius.pill")?.value).toBe("999px"); // outside the group
    expect(tokens?.get("colors.blue")?.value).toBe("#3b82f6");

    // Math over the converted group still resolves — units stay consistent.
    const resolved = createResolver(next).resolve("spacing.double");
    expect(resolved.value).toBe("2rem");
  });

  it('groupPath "" covers the whole set; unknown sets fail; rem → px works', () => {
    const wholeSet = planDimensionUnitConversion(doc(), "global", "", "px");
    expect(wholeSet.entries.map((entry) => entry.path)).toEqual(["spacing.lg"]);
    expect(wholeSet.entries[0]?.after).toBe("32px");
    expect(() => planDimensionUnitConversion(doc(), "nope", "", "px")).toThrow(TokenParseError);
  });
});
