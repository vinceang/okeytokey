import { describe, expect, it } from "vitest";

import { TokenResolutionError } from "../errors.js";
import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import { createResolver, extractReferences } from "./resolver.js";

const doc = (...sets: [name: string, json: string][]) =>
  createTokenDocument(sets.map(([name, json]) => parseTokenSet(name, json)));

describe("extractReferences", () => {
  it("finds references in strings, arrays, and objects", () => {
    expect(extractReferences("{a.b}")).toEqual(["a.b"]);
    expect(extractReferences("{a} + {b}")).toEqual(["a", "b"]);
    expect(extractReferences({ color: "{c}", width: ["{d}", "1px"] })).toEqual(["c", "d"]);
    expect(extractReferences(42)).toEqual([]);
  });
});

describe("createResolver", () => {
  it("resolves alias chains", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "colors": {
            "$type": "color",
            "blue": { "$value": "#3b82f6" },
            "primary": { "$value": "{colors.blue}" },
            "cta": { "$value": "{colors.primary}" }
          }
        }`,
      ]),
    );
    expect(resolver.resolve("colors.cta").value).toBe("#3b82f6");
    expect(resolver.resolve("colors.cta").references).toEqual(["colors.primary"]);
  });

  it("evaluates math over references", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "spacing": {
            "$type": "dimension",
            "base": { "$value": "4px" },
            "double": { "$value": "{spacing.base} * 2" },
            "quad": { "$value": "{spacing.double} * 2" }
          },
          "scale": {
            "$type": "number",
            "ratio": { "$value": 1.5 },
            "squared": { "$value": "{scale.ratio} * {scale.ratio}" }
          }
        }`,
      ]),
    );
    expect(resolver.resolve("spacing.quad").value).toBe("16px");
    expect(resolver.resolve("scale.squared").value).toBe(2.25);
  });

  it("resolves references inside composite values", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "colors": { "$type": "color", "shadow": { "$value": "#00000040" } },
          "spacing": { "$type": "dimension", "unit": { "$value": "2px" } },
          "effects": {
            "elevation": {
              "$type": "shadow",
              "$value": {
                "color": "{colors.shadow}",
                "offsetX": "0px",
                "offsetY": "{spacing.unit}",
                "blur": "{spacing.unit} * 2",
                "spread": "0px"
              }
            }
          }
        }`,
      ]),
    );
    expect(resolver.resolve("effects.elevation").value).toEqual({
      color: "#00000040",
      offsetX: "0px",
      offsetY: "2px",
      blur: "4px",
      spread: "0px",
    });
  });

  it("resolves whole-value references to composites", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "type": {
            "heading": {
              "$type": "typography",
              "$value": { "fontSize": "32px", "lineHeight": 1.2 }
            },
            "hero": { "$type": "typography", "$value": "{type.heading}" }
          }
        }`,
      ]),
    );
    expect(resolver.resolve("type.hero").value).toEqual({ fontSize: "32px", lineHeight: 1.2 });
  });

  it("interpolates strings that are not math", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "brand": { "name": { "$type": "fontFamily", "$value": "Okey" } },
          "font": { "display": { "$type": "fontFamily", "$value": "{brand.name} Sans" } }
        }`,
      ]),
    );
    expect(resolver.resolve("font.display").value).toBe("Okey Sans");
  });

  it("detects cycles with the exact path", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "a": { "$type": "number", "$value": "{b}" },
          "b": { "$type": "number", "$value": "{c}" },
          "c": { "$type": "number", "$value": "{a}" }
        }`,
      ]),
    );
    try {
      resolver.resolve("a");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TokenResolutionError);
      expect((error as TokenResolutionError).cyclePath).toEqual(["a", "b", "c", "a"]);
    }
  });

  it("detects self-references", () => {
    const resolver = createResolver(
      doc(["global", '{ "a": { "$type": "number", "$value": "{a} + 1" } }']),
    );
    expect(() => resolver.resolve("a")).toThrow(/Reference cycle: a -> a/);
  });

  it("reports missing references with the referrer", () => {
    const resolver = createResolver(
      doc(["global", '{ "a": { "$type": "color", "$value": "{missing.token}" } }']),
    );
    expect(() => resolver.resolve("a")).toThrow(/"a" references "missing.token"/);
    expect(() => resolver.resolve("nope")).toThrow(/"nope" does not exist/);
  });

  it("errors when math references non-numeric tokens", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "c": { "$type": "color", "$value": "#fff" },
          "x": { "$type": "dimension", "$value": "{c} * 2" }
        }`,
      ]),
    );
    expect(() => resolver.resolve("x")).toThrow(/does not resolve to a number/);
  });

  it("honors set order: later sets override, disabled sets are omitted", () => {
    const document = doc(
      ["global", '{ "bg": { "$type": "color", "$value": "#ffffff" } }'],
      ["dark", '{ "bg": { "$type": "color", "$value": "#111111" } }'],
      ["brand-b", '{ "bg": { "$type": "color", "$value": "#0000ff" } }'],
    );
    expect(createResolver(document).resolve("bg").value).toBe("#0000ff");
    expect(createResolver(document, { setOrder: ["global", "dark"] }).resolve("bg").value).toBe(
      "#111111",
    );
    expect(createResolver(document, { setOrder: ["global"] }).resolve("bg").value).toBe("#ffffff");
  });

  it("resolves cross-set references through the winning token", () => {
    const document = doc(
      [
        "global",
        `{
          "base": { "$type": "color", "$value": "#ffffff" },
          "surface": { "$type": "color", "$value": "{base}" }
        }`,
      ],
      ["dark", '{ "base": { "$type": "color", "$value": "#111111" } }'],
    );
    const resolver = createResolver(document, { setOrder: ["global", "dark"] });
    expect(resolver.resolve("surface").value).toBe("#111111");
  });

  it("rejects unknown set names in the order", () => {
    const document = doc(["global", "{}"]);
    expect(() => createResolver(document, { setOrder: ["typo"] })).toThrow(/Unknown token set/);
  });

  it("resolveAll collects errors without aborting", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "good": { "$type": "number", "$value": 1 },
          "bad": { "$type": "color", "$value": "{missing}" },
          "cyclic": { "$type": "number", "$value": "{cyclic}" }
        }`,
      ]),
    );
    const { resolved, errors } = resolver.resolveAll();
    expect(resolved.get("good")?.value).toBe(1);
    expect(resolved.has("bad")).toBe(false);
    expect(errors).toHaveLength(2);
  });

  it("evaluates color functions over references", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "colors": {
            "$type": "color",
            "primary": { "$value": "#3b82f6" },
            "primary-faded": { "$value": "alpha({colors.primary}, 0.5)" },
            "primary-hover": { "$value": "darken({colors.primary}, 0.1)" }
          }
        }`,
      ]),
    );
    expect(resolver.resolve("colors.primary-faded").value).toBe("#3b82f680");
    expect(resolver.resolve("colors.primary-hover").value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("builds the reference graph in both directions", () => {
    const resolver = createResolver(
      doc([
        "global",
        `{
          "a": { "$type": "number", "$value": 1 },
          "b": { "$type": "number", "$value": "{a} + 1" },
          "c": { "$type": "number", "$value": "{a} + {b}" }
        }`,
      ]),
    );
    const graph = resolver.graph();
    expect(graph.dependencies.get("c")).toEqual(new Set(["a", "b"]));
    expect(graph.dependents.get("a")).toEqual(new Set(["b", "c"]));
    expect(graph.dependents.get("c")).toBeUndefined();
  });
});
