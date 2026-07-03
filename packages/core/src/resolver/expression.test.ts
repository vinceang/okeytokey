import { describe, expect, it } from "vitest";

import { ExpressionError } from "../errors.js";
import {
  evaluateExpression,
  formatQuantity,
  isExpression,
  parseExpression,
  parseQuantity,
  type Quantity,
} from "./expression.js";

const constants = (table: Record<string, Quantity>) => (path: string) => {
  const quantity = table[path];
  if (!quantity) throw new Error(`no fixture for ${path}`);
  return quantity;
};

const evaluate = (text: string, table: Record<string, Quantity> = {}) =>
  evaluateExpression(parseExpression(text), constants(table), text);

describe("parseExpression / evaluateExpression", () => {
  it("evaluates arithmetic with precedence", () => {
    expect(evaluate("1 + 2 * 3")).toEqual({ value: 7, unit: "" });
    expect(evaluate("(1 + 2) * 3")).toEqual({ value: 9, unit: "" });
    expect(evaluate("10 / 4")).toEqual({ value: 2.5, unit: "" });
    expect(evaluate("-3 + 1")).toEqual({ value: -2, unit: "" });
    expect(evaluate("--2")).toEqual({ value: 2, unit: "" });
  });

  it("evaluates references", () => {
    const table = { "spacing.base": { value: 4, unit: "px" } };
    expect(evaluate("{spacing.base} * 2", table)).toEqual({ value: 8, unit: "px" });
    expect(evaluate("{spacing.base} + 2px", table)).toEqual({ value: 6, unit: "px" });
    expect(evaluate("-{spacing.base}", table)).toEqual({ value: -4, unit: "px" });
  });

  it("applies unit algebra", () => {
    expect(evaluate("4px * 2")).toEqual({ value: 8, unit: "px" });
    expect(evaluate("2 * 4px")).toEqual({ value: 8, unit: "px" });
    expect(evaluate("8px / 2")).toEqual({ value: 4, unit: "px" });
    expect(evaluate("8px / 2px")).toEqual({ value: 4, unit: "" });
    expect(evaluate("0 + 4px")).toEqual({ value: 4, unit: "px" });
    expect(evaluate("4px - 0")).toEqual({ value: 4, unit: "px" });
  });

  it("rejects unit violations", () => {
    expect(() => evaluate("4px + 2rem")).toThrow(ExpressionError);
    expect(() => evaluate("4px + 2")).toThrow(ExpressionError);
    expect(() => evaluate("4px * 2rem")).toThrow(ExpressionError);
    expect(() => evaluate("4 / 2px")).toThrow(ExpressionError);
    expect(() => evaluate("4px / 2rem")).toThrow(ExpressionError);
  });

  it("rejects division by zero", () => {
    expect(() => evaluate("1 / 0")).toThrow(/Division by zero/);
  });

  it("rejects malformed expressions", () => {
    expect(() => parseExpression("")).toThrow(ExpressionError);
    expect(() => parseExpression("1 +")).toThrow(ExpressionError);
    expect(() => parseExpression("(1 + 2")).toThrow(ExpressionError);
    expect(() => parseExpression("1 2")).toThrow(ExpressionError);
    expect(() => parseExpression("{unclosed * 2")).toThrow(ExpressionError);
    expect(() => parseExpression("{} * 2")).toThrow(ExpressionError);
    expect(() => parseExpression("1 & 2")).toThrow(ExpressionError);
  });
});

describe("isExpression", () => {
  it("distinguishes expressions from references and literals", () => {
    expect(isExpression("{a} * 2")).toBe(true);
    expect(isExpression("-{a}")).toBe(true);
    expect(isExpression("{a}")).toBe(false);
    expect(isExpression("16px")).toBe(false);
    expect(isExpression("hello + world")).toBe(false);
    expect(isExpression(42)).toBe(false);
  });
});

describe("parseQuantity / formatQuantity", () => {
  it("round-trips quantities", () => {
    expect(parseQuantity("16px")).toEqual({ value: 16, unit: "px" });
    expect(parseQuantity("-1.5rem")).toEqual({ value: -1.5, unit: "rem" });
    expect(parseQuantity("200ms")).toEqual({ value: 200, unit: "ms" });
    expect(parseQuantity("42")).toEqual({ value: 42, unit: "" });
    expect(parseQuantity("50%")).toEqual({ value: 50, unit: "%" });
    expect(formatQuantity({ value: 8, unit: "px" })).toBe("8px");
    expect(formatQuantity({ value: 2.5, unit: "" })).toBe("2.5");
  });

  it("returns undefined for non-quantities", () => {
    expect(parseQuantity("#fff")).toBeUndefined();
    expect(parseQuantity("px")).toBeUndefined();
    expect(parseQuantity("16 px")).toBeUndefined();
  });
});

// evaluate("100ms + 0.1s") mixes units; assert the intended error instead.
describe("mixed time units", () => {
  it("does not implicitly convert ms and s", () => {
    expect(() => evaluate("100ms + 1s")).toThrow(ExpressionError);
  });
});
