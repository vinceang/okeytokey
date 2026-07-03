import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  JsonParseError,
  cloneJson,
  fromPlainJson,
  jsonEquals,
  parseOrderedJson,
  serializeOrderedJson,
  toPlainJson,
  type JsonMap,
  type JsonValue,
} from "./ordered-json.js";

describe("parseOrderedJson", () => {
  it("parses primitives", () => {
    expect(parseOrderedJson("42")).toBe(42);
    expect(parseOrderedJson("-1.5e3")).toBe(-1500);
    expect(parseOrderedJson('"hi"')).toBe("hi");
    expect(parseOrderedJson("true")).toBe(true);
    expect(parseOrderedJson("false")).toBe(false);
    expect(parseOrderedJson("null")).toBe(null);
  });

  it("parses objects into Maps preserving written key order", () => {
    const result = parseOrderedJson('{"900": 1, "100": 2, "a": 3}') as JsonMap;
    expect(result).toBeInstanceOf(Map);
    expect([...result.keys()]).toEqual(["900", "100", "a"]);
  });

  it("contrasts with JSON.parse, which reorders integer-like keys", () => {
    expect(Object.keys(JSON.parse('{"900": 1, "100": 2}') as object)).toEqual(["100", "900"]);
  });

  it("parses nested structures", () => {
    const result = parseOrderedJson('{"a": [1, {"b": null}], "c": {}}') as JsonMap;
    expect(result.get("c")).toEqual(new Map());
    const array = result.get("a") as JsonValue[];
    expect(array[0]).toBe(1);
    expect((array[1] as JsonMap).get("b")).toBe(null);
  });

  it("handles string escapes", () => {
    expect(parseOrderedJson('"a\\n\\t\\"\\\\\\u00e9"')).toBe('a\n\t"\\é');
  });

  it("reports position on errors", () => {
    try {
      parseOrderedJson('{\n  "a": 1,\n  "b" 2\n}');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(JsonParseError);
      expect((error as JsonParseError).line).toBe(3);
    }
  });

  it("rejects malformed input", () => {
    expect(() => parseOrderedJson("")).toThrow(JsonParseError);
    expect(() => parseOrderedJson("{")).toThrow(JsonParseError);
    expect(() => parseOrderedJson("[1,]")).toThrow(JsonParseError);
    expect(() => parseOrderedJson("{a: 1}")).toThrow(JsonParseError);
    expect(() => parseOrderedJson("01")).toThrow(JsonParseError);
    expect(() => parseOrderedJson("1 2")).toThrow(JsonParseError);
    expect(() => parseOrderedJson('"\\x"')).toThrow(JsonParseError);
    expect(() => parseOrderedJson('"unterminated')).toThrow(JsonParseError);
  });

  it("rejects duplicate keys", () => {
    expect(() => parseOrderedJson('{"a": 1, "a": 2}')).toThrow(/Duplicate key/);
  });
});

describe("serializeOrderedJson", () => {
  it("pretty-prints with 2-space indent by default", () => {
    const value = new Map<string, JsonValue>([
      ["a", 1],
      ["b", [true, null]],
    ]);
    expect(serializeOrderedJson(value)).toBe('{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}');
  });

  it("emits compact output with indent 0", () => {
    const value = new Map<string, JsonValue>([["a", [1, 2]]]);
    expect(serializeOrderedJson(value, 0)).toBe('{"a":[1,2]}');
  });

  it("preserves insertion order for integer-like keys", () => {
    const value = new Map<string, JsonValue>([
      ["900", 1],
      ["100", 2],
    ]);
    expect(serializeOrderedJson(value, 0)).toBe('{"900":1,"100":2}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => serializeOrderedJson(Infinity)).toThrow(TypeError);
  });
});

describe("toPlainJson / fromPlainJson", () => {
  it("converts both directions", () => {
    const plain = { a: [1, { b: "x" }], c: null };
    const ordered = fromPlainJson(plain);
    expect(toPlainJson(ordered)).toEqual(plain);
  });

  it("fromPlainJson rejects non-JSON values", () => {
    expect(() => fromPlainJson(undefined)).toThrow(TypeError);
    expect(() => fromPlainJson(NaN)).toThrow(TypeError);
  });
});

describe("jsonEquals / cloneJson", () => {
  it("compares structurally, ignoring key order", () => {
    const a = parseOrderedJson('{"x": 1, "y": [2]}');
    const b = parseOrderedJson('{"y": [2], "x": 1}');
    expect(jsonEquals(a, b)).toBe(true);
    expect(jsonEquals(a, parseOrderedJson('{"x": 1, "y": [3]}'))).toBe(false);
    expect(jsonEquals(a, parseOrderedJson('{"x": 1}'))).toBe(false);
  });

  it("clones deeply", () => {
    const original = parseOrderedJson('{"a": {"b": [1]}}') as JsonMap;
    const copy = cloneJson(original) as JsonMap;
    expect(jsonEquals(original, copy)).toBe(true);
    (copy.get("a") as JsonMap).set("b", 2);
    expect(jsonEquals(original, copy)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

const jsonValueArb: fc.Arbitrary<unknown> = fc.jsonValue({ maxDepth: 5 });

describe("round-trip properties", () => {
  it("parse(serialize(x)) is structurally identical to x, for any JSON", () => {
    fc.assert(
      fc.property(jsonValueArb, (plain) => {
        const ordered = fromPlainJson(plain);
        const reparsed = parseOrderedJson(serializeOrderedJson(ordered));
        expect(jsonEquals(ordered, reparsed)).toBe(true);
      }),
    );
  });

  it("round-trips compact output too", () => {
    fc.assert(
      fc.property(jsonValueArb, (plain) => {
        const ordered = fromPlainJson(plain);
        const reparsed = parseOrderedJson(serializeOrderedJson(ordered, 0));
        expect(jsonEquals(ordered, reparsed)).toBe(true);
      }),
    );
  });

  it("agrees with JSON.parse on arbitrary serialized values", () => {
    fc.assert(
      fc.property(jsonValueArb, (plain) => {
        const text = JSON.stringify(plain);
        const ordered = parseOrderedJson(text);
        expect(toPlainJson(ordered)).toEqual(JSON.parse(text));
      }),
    );
  });

  it("preserves arbitrary key orders through serialize/parse", () => {
    const keysArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), {
      minLength: 1,
      maxLength: 12,
    });
    fc.assert(
      fc.property(keysArb, (keys) => {
        const map: JsonMap = new Map(keys.map((key, i) => [key, i]));
        const reparsed = parseOrderedJson(serializeOrderedJson(map)) as JsonMap;
        expect([...reparsed.keys()]).toEqual(keys);
      }),
    );
  });
});
