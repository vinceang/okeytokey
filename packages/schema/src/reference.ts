import { z } from "zod";

/**
 * DTCG alias references: `"{colors.primary.500}"`. Paths are dot-separated
 * token names; names may not contain `{`, `}`, or `.` and may not start
 * with `$`.
 */

export const TOKEN_PATH_SEPARATOR = ".";

/** Matches a string that is exactly one reference. */
export const REFERENCE_PATTERN = /^\{([^{}]+)\}$/;

/** Matches every embedded reference in a longer string (math, interpolation). */
export const EMBEDDED_REFERENCE_PATTERN = /\{([^{}]+)\}/g;

export const referenceSchema = z
  .string()
  .regex(REFERENCE_PATTERN, "must be a token reference like {colors.primary.500}");

/** A string that is exactly one `{token.path}` reference. */
export type TokenReference = `{${string}}`;

export function isReference(value: unknown): value is TokenReference {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

/** `"{a.b.c}"` -> `"a.b.c"`. Throws if the input is not a pure reference. */
export function referencePath(reference: string): string {
  const match = REFERENCE_PATTERN.exec(reference);
  if (!match?.[1]) {
    throw new Error(`Not a token reference: ${JSON.stringify(reference)}`);
  }
  return match[1];
}

export function makeReference(path: string): string {
  return `{${path}}`;
}

/** Every reference path embedded anywhere in a string, in order of appearance. */
export function findReferences(text: string): string[] {
  const paths: string[] = [];
  for (const match of text.matchAll(EMBEDDED_REFERENCE_PATTERN)) {
    const path = match[1];
    if (path !== undefined) {
      paths.push(path);
    }
  }
  return paths;
}

export function joinTokenPath(segments: readonly string[]): string {
  return segments.join(TOKEN_PATH_SEPARATOR);
}

export function splitTokenPath(path: string): string[] {
  return path.split(TOKEN_PATH_SEPARATOR);
}

/** Valid token/group names: nonempty, no `{` `}` `.`, and no leading `$`. */
export function isValidTokenName(name: string): boolean {
  return name.length > 0 && !name.startsWith("$") && !/[{}.]/.test(name);
}
