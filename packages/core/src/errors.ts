import type { SchemaIssue } from "@okeytokey/schema";

/** Base class for all typed core errors. */
export abstract class OkeytokeyError extends Error {}

/** A token set failed schema validation on parse. */
export class TokenParseError extends OkeytokeyError {
  override readonly name: string = "TokenParseError";
  constructor(
    readonly setName: string,
    readonly issues: readonly SchemaIssue[],
  ) {
    super(
      `Token set ${JSON.stringify(setName)} is invalid (${String(issues.length)} issue${
        issues.length === 1 ? "" : "s"
      }):\n` + issues.map((issue) => `  ${issue.path || "<file>"}: ${issue.message}`).join("\n"),
    );
  }
}

/** Alias resolution failed. `cyclePath` is set for reference cycles. */
export class TokenResolutionError extends OkeytokeyError {
  override readonly name = "TokenResolutionError";
  constructor(
    message: string,
    readonly tokenPath: string,
    readonly cyclePath?: readonly string[],
  ) {
    super(message);
  }
}

/** A math expression could not be parsed or evaluated. */
export class ExpressionError extends OkeytokeyError {
  override readonly name = "ExpressionError";
  constructor(
    message: string,
    readonly expression: string,
  ) {
    super(`${message} in expression ${JSON.stringify(expression)}`);
  }
}

/** A color string could not be parsed or converted. */
export class ColorError extends OkeytokeyError {
  override readonly name = "ColorError";
  constructor(
    message: string,
    readonly input: string,
  ) {
    super(`${message}: ${JSON.stringify(input)}`);
  }
}
