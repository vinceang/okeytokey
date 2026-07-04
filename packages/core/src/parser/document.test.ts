import { describe, expect, it } from "vitest";

import { TokenParseError } from "../errors.js";
import { jsonEquals, type JsonMap } from "../ordered-json/ordered-json.js";
import { createTokenDocument, getToken, parseTokenSet, serializeTokenSet } from "./document.js";

const FIXTURE = `{
  "colors": {
    "$type": "color",
    "$description": "Brand palette",
    "900": { "$value": "#0c1a3a" },
    "500": {
      "$value": "#3b82f6",
      "$extensions": {
        "com.okeytokey": { "lifecycle": "active", "guidelines": "Primary CTAs only." },
        "org.vendor": { "custom": [1, 2, 3] }
      }
    },
    "100": { "$value": "#dbeafe" },
    "action": { "$value": "{colors.500}", "$deprecated": "use colors.500 directly" }
  },
  "spacing": {
    "$type": "dimension",
    "base": { "$value": "4px" },
    "double": { "$value": "{spacing.base} * 2" }
  },
  "misc": {
    "ratio": { "$type": "number", "$value": 1.25 }
  }
}`;

describe("parseTokenSet", () => {
  it("indexes every token with effective types", () => {
    const set = parseTokenSet("global", FIXTURE);
    expect([...set.tokens.keys()]).toEqual([
      "colors.900",
      "colors.500",
      "colors.100",
      "colors.action",
      "spacing.base",
      "spacing.double",
      "misc.ratio",
    ]);
    expect(set.tokens.get("colors.500")?.type).toBe("color");
    expect(set.tokens.get("colors.500")?.ownType).toBe(false);
    expect(set.tokens.get("misc.ratio")?.ownType).toBe(true);
    expect(set.tokens.get("spacing.double")?.value).toBe("{spacing.base} * 2");
  });

  it("exposes description, deprecation, and okeytokey metadata", () => {
    const set = parseTokenSet("global", FIXTURE);
    expect(set.tokens.get("colors.action")?.deprecated).toBe("use colors.500 directly");
    const extension = set.tokens.get("colors.500")?.okeytokey;
    expect(extension?.lifecycle).toBe("active");
    expect(extension?.guidelines).toBe("Primary CTAs only.");
    expect(set.tokens.get("colors.900")?.okeytokey).toBeUndefined();
  });

  it("inherits layer and owners from the nearest ancestor group; own values win", () => {
    const set = parseTokenSet(
      "global",
      `{
        "colors": {
          "$type": "color",
          "$extensions": { "com.okeytokey": { "layer": "primitive", "owners": ["@design"] } },
          "500": { "$value": "#3b82f6" },
          "special": {
            "$extensions": { "com.okeytokey": { "owners": ["@brand"] } },
            "hot": { "$value": "#ff0055" }
          }
        },
        "semantic": {
          "$type": "color",
          "action": {
            "$value": "{colors.500}",
            "$extensions": { "com.okeytokey": { "layer": "semantic" } }
          }
        }
      }`,
    );
    // Effective values inherit from the group; own extension stays own-only.
    const inherited = set.tokens.get("colors.500");
    expect(inherited?.layer).toBe("primitive");
    expect(inherited?.owners).toEqual(["@design"]);
    expect(inherited?.okeytokey).toBeUndefined();
    // The nearest group's owners win; layer still flows from the grandparent.
    const nested = set.tokens.get("colors.special.hot");
    expect(nested?.layer).toBe("primitive");
    expect(nested?.owners).toEqual(["@brand"]);
    // Own fields always win; nothing inherited without an ancestor declaring it.
    const own = set.tokens.get("semantic.action");
    expect(own?.layer).toBe("semantic");
    expect(own?.owners).toBeUndefined();
    expect(own?.okeytokey).toEqual({ layer: "semantic" });
    // Inheritance is computed, never written: serialization keeps exactly the
    // three authored extension blocks.
    const serialized = serializeTokenSet(set);
    expect(serialized.match(/com\.okeytokey/g)).toHaveLength(3);
  });

  it("throws TokenParseError with issues for invalid files", () => {
    try {
      parseTokenSet("bad", '{ "x": { "$value": "#fff" } }');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TokenParseError);
      const parseError = error as TokenParseError;
      expect(parseError.setName).toBe("bad");
      expect(parseError.issues[0]?.path).toBe("x");
    }
  });

  it("rejects non-object roots", () => {
    expect(() => parseTokenSet("bad", "[1,2]")).toThrow(TokenParseError);
  });
});

describe("serializeTokenSet (lossless round-trip)", () => {
  it("round-trips structure and key order (formatting is normalized)", () => {
    const set = parseTokenSet("global", FIXTURE);
    const reparsed = parseTokenSet("global", serializeTokenSet(set));
    expect(jsonEquals(set.root, reparsed.root)).toBe(true);
    expect([...(reparsed.root.get("colors") as JsonMap).keys()]).toEqual([
      "$type",
      "$description",
      "900",
      "500",
      "100",
      "action",
    ]);
  });

  it("is a fixed point: serialize(parse(serialize(x))) === serialize(x)", () => {
    const set = parseTokenSet("global", FIXTURE);
    const once = serializeTokenSet(set);
    const twice = serializeTokenSet(parseTokenSet("global", once));
    expect(twice).toBe(once);
  });

  it("preserves integer-like key order (100/500/900 stay as written)", () => {
    const set = parseTokenSet("global", FIXTURE);
    const output = serializeTokenSet(set);
    const indexOf = (needle: string) => output.indexOf(needle);
    expect(indexOf('"900"')).toBeLessThan(indexOf('"500"'));
    expect(indexOf('"500"')).toBeLessThan(indexOf('"100"'));
  });

  it("preserves unknown $extensions namespaces and unknown fields", () => {
    const input = `{
  "x": {
    "$type": "number",
    "$value": 1,
    "$extensions": {
      "org.vendor": {
        "keep": true
      }
    },
    "futureField": "preserved"
  }
}`;
    const set = parseTokenSet("s", input);
    expect(serializeTokenSet(set)).toBe(input);
  });
});

describe("createTokenDocument / getToken", () => {
  const global = parseTokenSet(
    "global",
    '{ "colors": { "$type": "color", "bg": { "$value": "#ffffff" } } }',
  );
  const dark = parseTokenSet(
    "dark",
    '{ "colors": { "$type": "color", "bg": { "$value": "#111111" } } }',
  );

  it("keeps set order and rejects duplicates", () => {
    const document = createTokenDocument([global, dark]);
    expect([...document.sets.keys()]).toEqual(["global", "dark"]);
    expect(() => createTokenDocument([global, global])).toThrow(TokenParseError);
  });

  it("later sets win lookups", () => {
    const document = createTokenDocument([global, dark]);
    expect(getToken(document, "colors.bg")?.value).toBe("#111111");
    expect(getToken(document, "colors.bg", ["global"])?.value).toBe("#ffffff");
    expect(getToken(document, "colors.bg", ["dark", "global"])?.value).toBe("#ffffff");
    expect(getToken(document, "colors.missing")).toBeUndefined();
  });
});
