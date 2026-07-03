import { describe, expect, it } from "vitest";

import {
  borderValueSchema,
  cubicBezierValueSchema,
  dimensionValueSchema,
  durationValueSchema,
  fontFamilyValueSchema,
  fontWeightValueSchema,
  gradientValueSchema,
  shadowValueSchema,
  strokeStyleValueSchema,
  transitionValueSchema,
  typographyValueSchema,
  valueSchemaFor,
} from "./values.js";

describe("dimension", () => {
  it("accepts string and object forms", () => {
    expect(dimensionValueSchema.safeParse("16px").success).toBe(true);
    expect(dimensionValueSchema.safeParse("-0.5rem").success).toBe(true);
    expect(dimensionValueSchema.safeParse({ value: 16, unit: "px" }).success).toBe(true);
  });

  it("rejects unitless and unknown units", () => {
    expect(dimensionValueSchema.safeParse("16").success).toBe(false);
    expect(dimensionValueSchema.safeParse("16em").success).toBe(false);
    expect(dimensionValueSchema.safeParse({ value: 16, unit: "em" }).success).toBe(false);
  });
});

describe("duration", () => {
  it("accepts ms and s", () => {
    expect(durationValueSchema.safeParse("200ms").success).toBe(true);
    expect(durationValueSchema.safeParse("0.2s").success).toBe(true);
    expect(durationValueSchema.safeParse({ value: 200, unit: "ms" }).success).toBe(true);
  });

  it("rejects bare numbers", () => {
    expect(durationValueSchema.safeParse(200).success).toBe(false);
  });
});

describe("fontFamily / fontWeight", () => {
  it("accepts single family and stacks", () => {
    expect(fontFamilyValueSchema.safeParse("Inter").success).toBe(true);
    expect(fontFamilyValueSchema.safeParse(["Inter", "sans-serif"]).success).toBe(true);
    expect(fontFamilyValueSchema.safeParse([]).success).toBe(false);
  });

  it("accepts numeric and keyword weights", () => {
    expect(fontWeightValueSchema.safeParse(450).success).toBe(true);
    expect(fontWeightValueSchema.safeParse("semi-bold").success).toBe(true);
    expect(fontWeightValueSchema.safeParse(0).success).toBe(false);
    expect(fontWeightValueSchema.safeParse(1001).success).toBe(false);
    expect(fontWeightValueSchema.safeParse("chunky").success).toBe(false);
  });
});

describe("cubicBezier", () => {
  it("clamps x coordinates to [0,1]", () => {
    expect(cubicBezierValueSchema.safeParse([0.4, 0, 0.2, 1]).success).toBe(true);
    expect(cubicBezierValueSchema.safeParse([0.4, -2, 0.2, 3]).success).toBe(true);
    expect(cubicBezierValueSchema.safeParse([1.4, 0, 0.2, 1]).success).toBe(false);
    expect(cubicBezierValueSchema.safeParse([0.4, 0, 0.2]).success).toBe(false);
  });
});

describe("typography", () => {
  it("accepts partial composites with references", () => {
    const result = typographyValueSchema.safeParse({
      fontFamily: "{font.family.body}",
      fontSize: "16px",
      fontWeight: 400,
      lineHeight: 1.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(typographyValueSchema.safeParse({ fontSize: "16px", kerning: 1 }).success).toBe(false);
  });
});

describe("border / strokeStyle", () => {
  it("accepts a full border with reference color", () => {
    const result = borderValueSchema.safeParse({
      color: "{colors.border}",
      width: "1px",
      style: "solid",
    });
    expect(result.success).toBe(true);
  });

  it("accepts the dash-array object stroke style", () => {
    const result = strokeStyleValueSchema.safeParse({
      dashArray: ["4px", "{spacing.dash}"],
      lineCap: "round",
    });
    expect(result.success).toBe(true);
  });
});

describe("shadow", () => {
  const layer = {
    color: "#00000040",
    offsetX: "0px",
    offsetY: "2px",
    blur: "4px",
    spread: "0px",
  };

  it("accepts single layers and stacks", () => {
    expect(shadowValueSchema.safeParse(layer).success).toBe(true);
    expect(shadowValueSchema.safeParse([layer, { ...layer, inset: true }]).success).toBe(true);
    expect(shadowValueSchema.safeParse([]).success).toBe(false);
  });
});

describe("gradient", () => {
  it("requires at least two stops with positions in [0,1]", () => {
    const stops = [
      { color: "#000", position: 0 },
      { color: "#fff", position: 1 },
    ];
    expect(gradientValueSchema.safeParse(stops).success).toBe(true);
    expect(gradientValueSchema.safeParse(stops.slice(0, 1)).success).toBe(false);
    expect(
      gradientValueSchema.safeParse([
        { color: "#000", position: -0.1 },
        { color: "#fff", position: 1 },
      ]).success,
    ).toBe(false);
  });
});

describe("transition", () => {
  it("accepts a full transition", () => {
    const result = transitionValueSchema.safeParse({
      duration: "200ms",
      delay: "0ms",
      timingFunction: [0.4, 0, 0.2, 1],
    });
    expect(result.success).toBe(true);
  });
});

describe("valueSchemaFor", () => {
  it("lets any value be a reference", () => {
    expect(valueSchemaFor("dimension").safeParse("{spacing.base}").success).toBe(true);
    expect(valueSchemaFor("cubicBezier").safeParse("{easing.standard}").success).toBe(true);
  });

  it("still validates concrete values", () => {
    expect(valueSchemaFor("number").safeParse(1.5).success).toBe(true);
    expect(valueSchemaFor("number").safeParse("1.5").success).toBe(false);
  });

  it("accepts math expressions only for math-capable types", () => {
    expect(valueSchemaFor("dimension").safeParse("{spacing.base} * 2").success).toBe(true);
    expect(valueSchemaFor("number").safeParse("{scale.ratio} + 1").success).toBe(true);
    expect(valueSchemaFor("duration").safeParse("{motion.base} / 2").success).toBe(true);
    expect(valueSchemaFor("fontWeight").safeParse("{weight.base} * 2").success).toBe(false);
    expect(valueSchemaFor("dimension").safeParse("16 * 2").success).toBe(false);
  });

  it("accepts expressions in composite math positions", () => {
    expect(
      typographyValueSchema.safeParse({ fontSize: "{type.base} * 1.25", lineHeight: 1.4 }).success,
    ).toBe(true);
    expect(
      borderValueSchema.safeParse({
        color: "#000",
        width: "{border.hairline} * 2",
        style: "solid",
      }).success,
    ).toBe(true);
  });
});
