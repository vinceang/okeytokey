import { describe, expect, it } from "vitest";

import {
  findReferences,
  isReference,
  isValidTokenName,
  joinTokenPath,
  makeReference,
  referencePath,
  splitTokenPath,
} from "./reference.js";

describe("isReference", () => {
  it("accepts pure references", () => {
    expect(isReference("{colors.primary.500}")).toBe(true);
    expect(isReference("{a}")).toBe(true);
  });

  it("rejects non-references", () => {
    expect(isReference("colors.primary.500")).toBe(false);
    expect(isReference("{a} * 2")).toBe(false);
    expect(isReference("{}")).toBe(false);
    expect(isReference("{a{b}}")).toBe(false);
    expect(isReference(42)).toBe(false);
    expect(isReference(null)).toBe(false);
  });
});

describe("referencePath / makeReference", () => {
  it("round-trips", () => {
    expect(referencePath("{colors.primary.500}")).toBe("colors.primary.500");
    expect(makeReference("colors.primary.500")).toBe("{colors.primary.500}");
    expect(referencePath(makeReference("a.b"))).toBe("a.b");
  });

  it("throws on non-references", () => {
    expect(() => referencePath("not a ref")).toThrow(/Not a token reference/);
  });
});

describe("findReferences", () => {
  it("finds embedded references in order", () => {
    expect(findReferences("{spacing.base} * 2 + {spacing.gutter}")).toEqual([
      "spacing.base",
      "spacing.gutter",
    ]);
  });

  it("returns empty for plain strings", () => {
    expect(findReferences("16px")).toEqual([]);
  });
});

describe("token paths", () => {
  it("joins and splits", () => {
    expect(joinTokenPath(["a", "b", "c"])).toBe("a.b.c");
    expect(splitTokenPath("a.b.c")).toEqual(["a", "b", "c"]);
  });
});

describe("isValidTokenName", () => {
  it("accepts ordinary names", () => {
    expect(isValidTokenName("primary")).toBe(true);
    expect(isValidTokenName("500")).toBe(true);
    expect(isValidTokenName("brand color")).toBe(true);
  });

  it("rejects names that break references", () => {
    expect(isValidTokenName("")).toBe(false);
    expect(isValidTokenName("$value")).toBe(false);
    expect(isValidTokenName("a.b")).toBe(false);
    expect(isValidTokenName("a{b")).toBe(false);
    expect(isValidTokenName("a}b")).toBe(false);
  });
});
