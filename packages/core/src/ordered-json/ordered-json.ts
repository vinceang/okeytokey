/**
 * Order-preserving JSON. JavaScript objects reorder integer-like keys ("100",
 * "500" — ubiquitous in token scales), so `JSON.parse` cannot round-trip a
 * token file losslessly. Objects are represented as `Map`s instead, which
 * preserve insertion order for every key.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonMap;
export type JsonMap = Map<string, JsonValue>;

export class JsonParseError extends Error {
  override readonly name = "JsonParseError";
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} at line ${String(line)}, column ${String(column)}`);
  }
}

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

class Parser {
  private pos = 0;

  constructor(private readonly text: string) {}

  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      this.fail("Unexpected trailing content");
    }
    return value;
  }

  private fail(message: string): never {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < this.pos && i < this.text.length; i++) {
      if (this.text[i] === "\n") {
        line++;
        lineStart = i + 1;
      }
    }
    throw new JsonParseError(message, line, this.pos - lineStart + 1);
  }

  private peek(): string | undefined {
    return this.text[this.pos];
  }

  private skipWhitespace(): void {
    for (let char = this.text[this.pos]; char !== undefined && WHITESPACE.has(char);) {
      this.pos++;
      char = this.text[this.pos];
    }
  }

  private expect(char: string): void {
    if (this.text[this.pos] !== char) {
      this.fail(`Expected ${JSON.stringify(char)}`);
    }
    this.pos++;
  }

  private parseValue(): JsonValue {
    const char = this.peek();
    switch (char) {
      case undefined:
        this.fail("Unexpected end of input");
        break;
      case "{":
        return this.parseObject();
      case "[":
        return this.parseArray();
      case '"':
        return this.parseString();
      case "t":
        return this.parseLiteral("true", true);
      case "f":
        return this.parseLiteral("false", false);
      case "n":
        return this.parseLiteral("null", null);
      default:
        return this.parseNumber();
    }
  }

  private parseLiteral<T extends JsonPrimitive>(literal: string, value: T): T {
    if (this.text.startsWith(literal, this.pos)) {
      this.pos += literal.length;
      return value;
    }
    this.fail(`Invalid literal (expected "${literal}")`);
  }

  private parseObject(): JsonMap {
    this.expect("{");
    const map: JsonMap = new Map();
    this.skipWhitespace();
    if (this.peek() === "}") {
      this.pos++;
      return map;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.peek() !== '"') {
        this.fail("Expected string key");
      }
      const key = this.parseString();
      if (map.has(key)) {
        this.fail(`Duplicate key ${JSON.stringify(key)}`);
      }
      this.skipWhitespace();
      this.expect(":");
      this.skipWhitespace();
      map.set(key, this.parseValue());
      this.skipWhitespace();
      const next = this.peek();
      if (next === ",") {
        this.pos++;
        continue;
      }
      if (next === "}") {
        this.pos++;
        return map;
      }
      this.fail('Expected "," or "}" in object');
    }
  }

  private parseArray(): JsonValue[] {
    this.expect("[");
    const items: JsonValue[] = [];
    this.skipWhitespace();
    if (this.peek() === "]") {
      this.pos++;
      return items;
    }
    for (;;) {
      this.skipWhitespace();
      items.push(this.parseValue());
      this.skipWhitespace();
      const next = this.peek();
      if (next === ",") {
        this.pos++;
        continue;
      }
      if (next === "]") {
        this.pos++;
        return items;
      }
      this.fail('Expected "," or "]" in array');
    }
  }

  private parseString(): string {
    this.expect('"');
    let result = "";
    for (;;) {
      const char = this.text[this.pos];
      if (char === undefined) {
        this.fail("Unterminated string");
      }
      if (char === '"') {
        this.pos++;
        return result;
      }
      if (char === "\\") {
        this.pos++;
        const escape = this.text[this.pos];
        if (escape === undefined) {
          this.fail("Unterminated escape sequence");
        }
        if (escape === "u") {
          const hex = this.text.slice(this.pos + 1, this.pos + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            this.fail("Invalid unicode escape");
          }
          result += String.fromCharCode(parseInt(hex, 16));
          this.pos += 5;
          continue;
        }
        const replacement = ESCAPES[escape];
        if (replacement === undefined) {
          this.fail(`Invalid escape sequence "\\${escape}"`);
        }
        result += replacement;
        this.pos++;
        continue;
      }
      if (char < " ") {
        this.fail("Unescaped control character in string");
      }
      result += char;
      this.pos++;
    }
  }

  private parseNumber(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.pos));
    if (!match) {
      this.fail("Invalid JSON value");
    }
    this.pos += match[0].length;
    // Normalize -0: JSON text cannot round-trip the sign (String(-0) === "0").
    const value = Number(match[0]);
    return value === 0 ? 0 : value;
  }
}

export function parseOrderedJson(text: string): JsonValue {
  return new Parser(text).parse();
}

function serializeString(value: string): string {
  return JSON.stringify(value);
}

function serialize(value: JsonValue, indent: string, depth: number): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Cannot serialize non-finite number to JSON");
    }
    return String(value);
  }
  if (typeof value === "string") {
    return serializeString(value);
  }

  const inner = indent.repeat(depth + 1);
  const outer = indent.repeat(depth);
  const compact = indent.length === 0;

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => serialize(item, indent, depth + 1));
    return compact
      ? `[${items.join(",")}]`
      : `[\n${items.map((item) => inner + item).join(",\n")}\n${outer}]`;
  }

  if (value.size === 0) return "{}";
  const entries = [...value.entries()].map(
    ([key, child]) =>
      `${serializeString(key)}${compact ? ":" : ": "}${serialize(child, indent, depth + 1)}`,
  );
  return compact
    ? `{${entries.join(",")}}`
    : `{\n${entries.map((entry) => inner + entry).join(",\n")}\n${outer}}`;
}

/** Serialize with 2-space indentation by default; pass 0 for compact output. */
export function serializeOrderedJson(value: JsonValue, indentWidth = 2): string {
  return serialize(value, " ".repeat(indentWidth), 0);
}

/** Convert Map-based JSON to plain objects (for Zod validation and interop). */
export function toPlainJson(value: JsonValue): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, child]) => [key, toPlainJson(child)]),
    );
  }
  if (Array.isArray(value)) {
    return value.map(toPlainJson);
  }
  return value;
}

/**
 * Convert plain parsed JSON (e.g. from `JSON.parse` or in-memory literals) to
 * Map-based JSON. Object key order follows `Object.entries`, so integer-like
 * keys may already have been reordered by the JS engine — parse from text
 * with {@link parseOrderedJson} when byte-level fidelity matters.
 */
export function fromPlainJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite number is not valid JSON");
    // Normalize -0: JSON text cannot round-trip the sign.
    return value === 0 ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map(fromPlainJson);
  }
  if (typeof value === "object") {
    return new Map(Object.entries(value).map(([key, child]) => [key, fromPlainJson(child)]));
  }
  throw new TypeError(`Value is not JSON-representable: ${typeof value}`);
}

/** Structural equality over ordered JSON, ignoring key order. */
export function jsonEquals(a: JsonValue, b: JsonValue): boolean {
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, valueA] of a) {
      const valueB = b.get(key);
      if (valueB === undefined && !b.has(key)) return false;
      if (!jsonEquals(valueA, valueB as JsonValue)) return false;
    }
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEquals(item, b[i] as JsonValue));
  }
  return Object.is(a, b);
}

/** Deep copy of ordered JSON (Maps and arrays are cloned, primitives shared). */
export function cloneJson(value: JsonValue): JsonValue {
  if (value instanceof Map) {
    return new Map([...value.entries()].map(([key, child]) => [key, cloneJson(child)]));
  }
  if (Array.isArray(value)) {
    return value.map(cloneJson);
  }
  return value;
}
