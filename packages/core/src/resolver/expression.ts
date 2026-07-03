import { ExpressionError } from "../errors.js";

/**
 * Math expressions for dimension/number/duration tokens:
 * `{spacing.base} * 2`, `({a} + {b}) / 2`, `{size} + 4px`.
 *
 * A real recursive-descent parser — never `eval`. Grammar:
 *
 *   expression := term (("+" | "-") term)*
 *   term       := factor (("*" | "/") factor)*
 *   factor     := "-" factor | "(" expression ")" | number unit? | reference
 *
 * Unit algebra (dimensional analysis, one linear unit at a time):
 *   add/sub: units must match (or one side unitless zero)
 *   mul:     at most one side may carry a unit
 *   div:     unit/unitless keeps the unit; unit/unit cancels to unitless
 */

export interface Quantity {
  readonly value: number;
  /** "" for unitless numbers; "px", "rem", "ms", "s" otherwise. */
  readonly unit: string;
}

export type ExpressionNode =
  | { readonly kind: "literal"; readonly value: number; readonly unit: string }
  | { readonly kind: "reference"; readonly path: string }
  | { readonly kind: "negate"; readonly operand: ExpressionNode }
  | {
      readonly kind: "binary";
      readonly operator: "+" | "-" | "*" | "/";
      readonly left: ExpressionNode;
      readonly right: ExpressionNode;
    };

const NUMBER_PATTERN = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const UNIT_PATTERN = /^(px|rem|ms|s|%)/;

class ExpressionParser {
  private pos = 0;

  constructor(private readonly text: string) {}

  parse(): ExpressionNode {
    const node = this.parseExpression();
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      this.fail(`Unexpected ${JSON.stringify(this.rest().slice(0, 10))}`);
    }
    return node;
  }

  private fail(message: string): never {
    throw new ExpressionError(message, this.text);
  }

  private rest(): string {
    return this.text.slice(this.pos);
  }

  private skipWhitespace(): void {
    for (
      let char = this.text[this.pos];
      char === " " || char === "\t";
      char = this.text[this.pos]
    ) {
      this.pos++;
    }
  }

  private parseExpression(): ExpressionNode {
    let left = this.parseTerm();
    for (;;) {
      this.skipWhitespace();
      const operator = this.text[this.pos];
      if (operator !== "+" && operator !== "-") return left;
      this.pos++;
      left = { kind: "binary", operator, left, right: this.parseTerm() };
    }
  }

  private parseTerm(): ExpressionNode {
    let left = this.parseFactor();
    for (;;) {
      this.skipWhitespace();
      const operator = this.text[this.pos];
      if (operator !== "*" && operator !== "/") return left;
      this.pos++;
      left = { kind: "binary", operator, left, right: this.parseFactor() };
    }
  }

  private parseFactor(): ExpressionNode {
    this.skipWhitespace();
    const char = this.text[this.pos];
    if (char === undefined) {
      this.fail("Unexpected end of expression");
    }
    if (char === "-") {
      this.pos++;
      return { kind: "negate", operand: this.parseFactor() };
    }
    if (char === "(") {
      this.pos++;
      const inner = this.parseExpression();
      this.skipWhitespace();
      if (this.text[this.pos] !== ")") {
        this.fail('Expected ")"');
      }
      this.pos++;
      return inner;
    }
    if (char === "{") {
      const end = this.text.indexOf("}", this.pos);
      if (end === -1) {
        this.fail("Unterminated reference");
      }
      const path = this.text.slice(this.pos + 1, end);
      if (path.length === 0 || /[{}]/.test(path)) {
        this.fail("Invalid reference");
      }
      this.pos = end + 1;
      return { kind: "reference", path };
    }
    const numberMatch = NUMBER_PATTERN.exec(this.rest());
    if (numberMatch) {
      this.pos += numberMatch[0].length;
      const unitMatch = UNIT_PATTERN.exec(this.rest());
      if (unitMatch) {
        this.pos += unitMatch[0].length;
      }
      return { kind: "literal", value: Number(numberMatch[0]), unit: unitMatch?.[0] ?? "" };
    }
    this.fail(`Unexpected ${JSON.stringify(char)}`);
  }
}

/** Parse an expression string into an AST. Throws {@link ExpressionError}. */
export function parseExpression(text: string): ExpressionNode {
  return new ExpressionParser(text).parse();
}

/** True if the string is a math expression (vs a pure reference or literal). */
export function isExpression(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/[+\-*/()]/.test(value)) return false;
  try {
    const node = parseExpression(value);
    return node.kind === "binary" || node.kind === "negate";
  } catch {
    return false;
  }
}

function combineUnits(
  operator: "+" | "-" | "*" | "/",
  left: Quantity,
  right: Quantity,
  expression: string,
): string {
  if (operator === "+" || operator === "-") {
    if (left.unit === right.unit) return left.unit;
    // A unitless zero adopts the other side's unit ("0" + "4px" is fine).
    if (left.unit === "" && left.value === 0) return right.unit;
    if (right.unit === "" && right.value === 0) return left.unit;
    throw new ExpressionError(
      `Cannot ${operator === "+" ? "add" : "subtract"} ${right.unit || "unitless"} to ${
        left.unit || "unitless"
      }`,
      expression,
    );
  }
  if (operator === "*") {
    if (left.unit !== "" && right.unit !== "") {
      throw new ExpressionError(`Cannot multiply ${left.unit} by ${right.unit}`, expression);
    }
    return left.unit || right.unit;
  }
  // Division.
  if (right.unit === "") return left.unit;
  if (left.unit === right.unit) return "";
  throw new ExpressionError(
    `Cannot divide ${left.unit || "unitless"} by ${right.unit}`,
    expression,
  );
}

/**
 * Evaluate an AST. `resolveReference` supplies the quantity behind each
 * `{path}` — the resolver wires this to (recursively resolved) token values.
 */
export function evaluateExpression(
  node: ExpressionNode,
  resolveReference: (path: string) => Quantity,
  expression = "",
): Quantity {
  switch (node.kind) {
    case "literal":
      return { value: node.value, unit: node.unit };
    case "reference":
      return resolveReference(node.path);
    case "negate": {
      const operand = evaluateExpression(node.operand, resolveReference, expression);
      return { value: -operand.value, unit: operand.unit };
    }
    case "binary": {
      const left = evaluateExpression(node.left, resolveReference, expression);
      const right = evaluateExpression(node.right, resolveReference, expression);
      const unit = combineUnits(node.operator, left, right, expression);
      switch (node.operator) {
        case "+":
          return { value: left.value + right.value, unit };
        case "-":
          return { value: left.value - right.value, unit };
        case "*":
          return { value: left.value * right.value, unit };
        case "/":
          if (right.value === 0) {
            throw new ExpressionError("Division by zero", expression);
          }
          return { value: left.value / right.value, unit };
      }
    }
  }
}

/** Parse a token quantity string like "16px", "1.5rem", "200ms", or "42". */
export function parseQuantity(text: string): Quantity | undefined {
  const match = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(px|rem|ms|s|%)?$/.exec(text.trim());
  if (!match?.[1]) return undefined;
  return { value: Number(match[1]), unit: match[2] ?? "" };
}

/** Format a quantity back to its canonical string ("8px", "1.5", "100ms"). */
export function formatQuantity(quantity: Quantity): string {
  return `${String(quantity.value)}${quantity.unit}`;
}
