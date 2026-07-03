import { describe, expect, it } from "vitest";

import { TokenParseError } from "../errors.js";
import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import { planColorFormatConversion } from "./convert.js";

const doc = () =>
  createTokenDocument([
    parseTokenSet(
      "global",
      `{
  "colors": {
    "$type": "color",
    "blue": {
      "500": { "$value": "#3b82f6" },
      "600": { "$value": "rgb(37, 99, 235)" },
      "alias": { "$value": "{colors.blue.500}" },
      "hover": { "$value": "darken({colors.blue.500}, 0.1)" }
    },
    "red": { "$value": "#ef4444" }
  },
  "spacing": { "$type": "dimension", "md": { "$value": "16px" } }
}`,
    ),
  ]);

describe("planColorFormatConversion", () => {
  it("converts concrete literals in the group, skipping refs/functions/other types", () => {
    const plan = planColorFormatConversion(doc(), "global", "colors.blue", "oklch");
    expect(plan.entries.map((entry) => entry.path)).toEqual(["colors.blue.500", "colors.blue.600"]);
    for (const entry of plan.entries) {
      expect(entry.after).toMatch(/^oklch\(/);
    }
    // Outside the group (colors.red) untouched; alias/function skipped.
    const next = plan.apply();
    const tokens = next.sets.get("global")?.tokens;
    expect(tokens?.get("colors.blue.500")?.value).toMatch(/^oklch\(/);
    expect(tokens?.get("colors.blue.alias")?.value).toBe("{colors.blue.500}");
    expect(tokens?.get("colors.blue.hover")?.value).toContain("darken(");
    expect(tokens?.get("colors.red")?.value).toBe("#ef4444");
  });

  it("omits tokens already in the target format and round-trips values", () => {
    const toHex = planColorFormatConversion(doc(), "global", "colors.blue", "hex");
    // 500 is already hex; only the rgb one converts.
    expect(toHex.entries.map((entry) => entry.path)).toEqual(["colors.blue.600"]);
    expect(toHex.entries[0]?.after).toBe("#2563eb");
    // Converting there and back preserves the color.
    const viaOklch = planColorFormatConversion(doc(), "global", "colors.blue", "oklch").apply();
    const back = planColorFormatConversion(viaOklch, "global", "colors.blue", "hex").apply();
    expect(back.sets.get("global")?.tokens.get("colors.blue.500")?.value).toBe("#3b82f6");
  });

  it('groupPath "" covers the whole set; unknown sets fail', () => {
    const plan = planColorFormatConversion(doc(), "global", "", "oklch");
    expect(plan.entries.map((entry) => entry.path)).toContain("colors.red");
    expect(() => planColorFormatConversion(doc(), "nope", "", "hex")).toThrow(TokenParseError);
  });
});
