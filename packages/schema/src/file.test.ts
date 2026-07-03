import { describe, expect, it } from "vitest";

import { TokenFileParseError, parseTokenFile, safeParseTokenFile } from "./file.js";

const validFile = {
  colors: {
    $type: "color",
    primary: {
      "500": { $value: "#3b82f6", $description: "Brand primary" },
      "600": { $value: "#2563eb" },
    },
    action: { $value: "{colors.primary.500}" },
  },
  spacing: {
    $type: "dimension",
    base: { $value: "4px" },
    double: { $value: "{spacing.base} * 2" },
  },
  typography: {
    heading: {
      $type: "typography",
      $value: {
        fontFamily: ["Inter", "sans-serif"],
        fontSize: "32px",
        fontWeight: "bold",
        lineHeight: 1.2,
      },
    },
  },
};

describe("safeParseTokenFile", () => {
  it("accepts a valid file", () => {
    const result = safeParseTokenFile(validFile);
    expect(result.success).toBe(true);
  });

  it("returns the same object (no cloning)", () => {
    const result = safeParseTokenFile(validFile);
    if (!result.success) throw new Error("expected success");
    expect(result.data).toBe(validFile);
  });

  it("rejects non-objects", () => {
    expect(safeParseTokenFile(null).success).toBe(false);
    expect(safeParseTokenFile([]).success).toBe(false);
    expect(safeParseTokenFile("{}").success).toBe(false);
  });

  it("inherits $type from ancestor groups", () => {
    const result = safeParseTokenFile({
      colors: { $type: "color", deep: { deeper: { token: { $value: "#fff" } } } },
    });
    expect(result.success).toBe(true);
  });

  it("lets a token override the inherited $type", () => {
    const result = safeParseTokenFile({
      colors: {
        $type: "color",
        scale: { $type: "number", factor: { $value: 1.25 } },
      },
    });
    expect(result.success).toBe(true);
  });

  it("flags tokens with no effective $type", () => {
    const result = safeParseTokenFile({ orphan: { $value: "#fff" } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.issues[0]?.path).toBe("orphan");
    expect(result.issues[0]?.message).toMatch(/no \$type/);
  });

  it("flags unknown $type", () => {
    const result = safeParseTokenFile({ x: { $type: "colour", $value: "#fff" } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.issues.some((issue) => issue.message.includes("Unknown $type"))).toBe(true);
  });

  it("flags values that do not match the effective type", () => {
    const result = safeParseTokenFile({
      spacing: { $type: "dimension", bad: { $value: "16em" } },
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.issues[0]?.path).toBe("spacing.bad");
    expect(result.issues[0]?.message).toMatch(/Invalid dimension/);
  });

  it("accepts whole-value references regardless of type", () => {
    const result = safeParseTokenFile({
      easing: { $type: "cubicBezier", standard: { $value: "{easing.base}" } },
    });
    expect(result.success).toBe(true);
  });

  it("flags invalid names and non-object members", () => {
    const bad = safeParseTokenFile({ "a.b": { $type: "number", $value: 1 } });
    expect(bad.success).toBe(false);
    const nonObject = safeParseTokenFile({ group: { child: 42 } });
    expect(nonObject.success).toBe(false);
  });

  it("validates $description and $deprecated shapes", () => {
    expect(
      safeParseTokenFile({ x: { $type: "number", $value: 1, $description: 42 } }).success,
    ).toBe(false);
    expect(
      safeParseTokenFile({ x: { $type: "number", $value: 1, $deprecated: "use y instead" } })
        .success,
    ).toBe(true);
    expect(safeParseTokenFile({ x: { $type: "number", $value: 1, $deprecated: 1 } }).success).toBe(
      false,
    );
  });

  it("validates the com.okeytokey extension but ignores other namespaces", () => {
    const foreign = safeParseTokenFile({
      x: { $type: "number", $value: 1, $extensions: { "org.other": { anything: true } } },
    });
    expect(foreign.success).toBe(true);

    const ours = safeParseTokenFile({
      x: {
        $type: "number",
        $value: 1,
        $extensions: { "com.okeytokey": { lifecycle: "retired" } },
      },
    });
    expect(ours.success).toBe(false);
  });

  it("collects multiple issues in one pass", () => {
    const result = safeParseTokenFile({
      a: { $value: "#fff" },
      b: { $type: "dimension", $value: "16em" },
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("remains valid when com.okeytokey extensions are stripped (spec invariant)", () => {
    const withExtensions = {
      colors: {
        $type: "color",
        primary: {
          $value: "#3b82f6",
          $extensions: {
            "com.okeytokey": { lifecycle: "active", guidelines: "Primary CTAs." },
          },
        },
      },
    };
    expect(safeParseTokenFile(withExtensions).success).toBe(true);
    const stripped = structuredClone(withExtensions) as Record<string, unknown>;
    delete ((stripped.colors as Record<string, unknown>).primary as Record<string, unknown>)
      .$extensions;
    expect(safeParseTokenFile(stripped).success).toBe(true);
  });
});

describe("parseTokenFile", () => {
  it("returns the file on success", () => {
    expect(parseTokenFile(validFile)).toBe(validFile);
  });

  it("throws TokenFileParseError listing every issue", () => {
    let caught: unknown;
    try {
      parseTokenFile({ a: { $value: "#fff" }, b: { $type: "bogus", $value: 1 } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TokenFileParseError);
    const error = caught as TokenFileParseError;
    expect(error.issues.length).toBeGreaterThanOrEqual(2);
    expect(error.message).toContain("a:");
  });
});
