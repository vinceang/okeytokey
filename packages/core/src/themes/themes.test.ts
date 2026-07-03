import { describe, expect, it } from "vitest";

import { TokenResolutionError } from "../errors.js";
import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import {
  createThemeResolver,
  emittedPaths,
  emittedSets,
  expandThemeMatrix,
  resolutionOrder,
  themeFromCombination,
  type Theme,
} from "./themes.js";

const document = createTokenDocument([
  parseTokenSet(
    "core",
    `{
      "ramp": { "$type": "color", "white": { "$value": "#ffffff" }, "black": { "$value": "#111111" } },
      "semantic": { "$type": "color", "bg": { "$value": "{ramp.white}" } }
    }`,
  ),
  parseTokenSet("dark", '{ "semantic": { "$type": "color", "bg": { "$value": "{ramp.black}" } } }'),
  parseTokenSet("brand-b", '{ "ramp": { "$type": "color", "white": { "$value": "#fffdf5" } } }'),
]);

describe("theme basics", () => {
  const darkTheme: Theme = {
    name: "dark",
    sets: [
      { set: "core", status: "source" },
      { set: "dark", status: "enabled" },
      { set: "brand-b", status: "disabled" },
    ],
  };

  it("computes resolution order and emitted sets", () => {
    expect(resolutionOrder(darkTheme)).toEqual(["core", "dark"]);
    expect(emittedSets(darkTheme)).toEqual(["dark"]);
  });

  it("resolves through sources but emits only enabled sets", () => {
    const resolver = createThemeResolver(document, darkTheme);
    expect(resolver.resolve("semantic.bg").value).toBe("#111111");
    expect(emittedPaths(document, darkTheme)).toEqual(["semantic.bg"]);
  });

  it("throws on unknown sets in emittedPaths", () => {
    const broken: Theme = { name: "x", sets: [{ set: "missing", status: "enabled" }] };
    expect(() => emittedPaths(document, broken)).toThrow(TokenResolutionError);
  });
});

describe("expandThemeMatrix", () => {
  const brandGroup = {
    name: "brand",
    options: [
      {
        name: "brand-a",
        sets: [{ set: "core", status: "source" as const }],
      },
      {
        name: "brand-b",
        sets: [
          { set: "core", status: "source" as const },
          { set: "brand-b", status: "enabled" as const },
        ],
      },
    ],
  };
  const modeGroup = {
    name: "mode",
    options: [
      { name: "light", sets: [] },
      { name: "dark", sets: [{ set: "dark", status: "enabled" as const }] },
    ],
  };

  it("produces the full cartesian product", () => {
    const matrix = expandThemeMatrix([brandGroup, modeGroup]);
    expect(matrix.map((combination) => combination.name)).toEqual([
      "brand-a / light",
      "brand-a / dark",
      "brand-b / light",
      "brand-b / dark",
    ]);
  });

  it("combined themes resolve with later groups overriding", () => {
    const matrix = expandThemeMatrix([brandGroup, modeGroup]);
    const brandBDark = matrix.find((combination) => combination.name === "brand-b / dark");
    if (!brandBDark) throw new Error("combination missing");
    const resolver = createThemeResolver(document, themeFromCombination(brandBDark));
    // dark overrides semantic.bg -> ramp.black; brand-b only retints white.
    expect(resolver.resolve("semantic.bg").value).toBe("#111111");
    expect(resolver.resolve("ramp.white").value).toBe("#fffdf5");
  });

  it("deduplicates sets keeping last position and strongest status", () => {
    const matrix = expandThemeMatrix([
      {
        name: "a",
        options: [{ name: "one", sets: [{ set: "core", status: "enabled" }] }],
      },
      {
        name: "b",
        options: [{ name: "two", sets: [{ set: "core", status: "source" }] }],
      },
    ]);
    expect(matrix).toHaveLength(1);
    expect(matrix[0]?.sets).toEqual([{ set: "core", status: "enabled" }]);
  });

  it("returns [] for no groups and rejects empty groups", () => {
    expect(expandThemeMatrix([])).toEqual([]);
    expect(() => expandThemeMatrix([{ name: "empty", options: [] }])).toThrow(TokenResolutionError);
  });
});
