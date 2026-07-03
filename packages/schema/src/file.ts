import { z } from "zod";

import {
  OKEYTOKEY_EXTENSION_NAMESPACE,
  isDtcgTokenType,
  type DtcgTokenType,
} from "./token-types.js";
import { okeytokeyExtensionSchema } from "./extensions.js";
import { isValidTokenName, joinTokenPath } from "./reference.js";
import { valueSchemaFor } from "./values.js";

/**
 * Whole-file validation for DTCG token documents.
 *
 * A file is a tree of groups; a node with `$value` is a token. `$type` set on
 * a group is inherited by descendants until overridden. Validation walks the
 * tree, resolves each token's effective type, and checks `$value` against the
 * type's schema. Unknown `$`-prefixed properties and unknown `$extensions`
 * namespaces are preserved, not rejected — losslessness is core's job, but
 * the schema must not reject what it must round-trip.
 */

export interface DtcgToken {
  $value: unknown;
  $type?: DtcgTokenType;
  $description?: string;
  $deprecated?: boolean | string;
  $extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DtcgGroup {
  $type?: DtcgTokenType;
  $description?: string;
  $deprecated?: boolean | string;
  $extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export type DtcgFile = DtcgGroup;

export interface SchemaIssue {
  /** Dot-joined token path, or "" for file-level issues. */
  path: string;
  message: string;
}

export class TokenFileParseError extends Error {
  override readonly name = "TokenFileParseError";
  constructor(readonly issues: readonly SchemaIssue[]) {
    super(
      `Token file is invalid (${String(issues.length)} issue${issues.length === 1 ? "" : "s"}):\n` +
        issues.map((issue) => `  ${issue.path || "<file>"}: ${issue.message}`).join("\n"),
    );
  }
}

export type SafeParseResult =
  { success: true; data: DtcgFile } | { success: false; issues: SchemaIssue[] };

interface WalkEntry {
  node: Record<string, unknown>;
  segments: string[];
  inheritedType: DtcgTokenType | undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenNode(node: Record<string, unknown>): boolean {
  return "$value" in node;
}

function formatZodIssues(error: z.ZodError, basePath: string): SchemaIssue[] {
  return error.issues.map((issue) => ({
    path: basePath,
    message:
      issue.path.length > 0
        ? `${issue.path.map(String).join(".")}: ${issue.message}`
        : issue.message,
  }));
}

function checkDollarProps(
  node: Record<string, unknown>,
  path: string,
  issues: SchemaIssue[],
): void {
  const { $description, $deprecated, $extensions } = node as DtcgGroup;
  if ($description !== undefined && typeof $description !== "string") {
    issues.push({ path, message: "$description must be a string" });
  }
  if (
    $deprecated !== undefined &&
    typeof $deprecated !== "boolean" &&
    typeof $deprecated !== "string"
  ) {
    issues.push({ path, message: "$deprecated must be a boolean or a reason string" });
  }
  if ($extensions !== undefined) {
    if (!isPlainObject($extensions)) {
      issues.push({ path, message: "$extensions must be an object" });
    } else if (OKEYTOKEY_EXTENSION_NAMESPACE in $extensions) {
      const result = okeytokeyExtensionSchema.safeParse($extensions[OKEYTOKEY_EXTENSION_NAMESPACE]);
      if (!result.success) {
        issues.push(
          ...formatZodIssues(result.error, path).map((issue) => ({
            ...issue,
            message: `$extensions["com.okeytokey"]: ${issue.message}`,
          })),
        );
      }
    }
  }
}

/**
 * Validate a parsed JSON object as a DTCG token file. Returns issues instead
 * of throwing; `data` is the input object typed as `DtcgFile` (no cloning —
 * key order and unknown fields are untouched).
 */
export function safeParseTokenFile(input: unknown): SafeParseResult {
  if (!isPlainObject(input)) {
    return { success: false, issues: [{ path: "", message: "Token file must be a JSON object" }] };
  }

  const issues: SchemaIssue[] = [];
  const stack: WalkEntry[] = [{ node: input, segments: [], inheritedType: undefined }];

  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const path = joinTokenPath(entry.segments);

    const rawType = entry.node.$type;
    let ownType: DtcgTokenType | undefined;
    if (rawType !== undefined) {
      if (isDtcgTokenType(rawType)) {
        ownType = rawType;
      } else {
        issues.push({ path, message: `Unknown $type ${JSON.stringify(rawType)}` });
      }
    }
    const effectiveType = ownType ?? entry.inheritedType;

    checkDollarProps(entry.node, path, issues);

    if (isTokenNode(entry.node)) {
      if (effectiveType === undefined) {
        issues.push({
          path,
          message: "Token has no $type and inherits none from an ancestor group",
        });
      } else {
        const result = valueSchemaFor(effectiveType).safeParse(entry.node.$value);
        if (!result.success) {
          issues.push({
            path,
            message: `Invalid ${effectiveType} $value: ${
              formatZodIssues(result.error, path)
                .map((issue) => issue.message)
                .join("; ") || "does not match schema"
            }`,
          });
        }
      }
      // Tokens have no child groups; non-$ keys inside a token are unknown
      // fields we preserve silently.
      continue;
    }

    for (const [key, child] of Object.entries(entry.node)) {
      if (key.startsWith("$")) continue;
      if (!isValidTokenName(key)) {
        issues.push({
          path,
          message: `Invalid group/token name ${JSON.stringify(key)} (must not contain "{", "}", or "." or start with "$")`,
        });
        continue;
      }
      if (!isPlainObject(child)) {
        issues.push({
          path: joinTokenPath([...entry.segments, key]),
          message: "Group members must be objects (groups or tokens)",
        });
        continue;
      }
      stack.push({
        node: child,
        segments: [...entry.segments, key],
        inheritedType: effectiveType,
      });
    }
  }

  return issues.length > 0 ? { success: false, issues } : { success: true, data: input };
}

/** Like {@link safeParseTokenFile} but throws {@link TokenFileParseError}. */
export function parseTokenFile(input: unknown): DtcgFile {
  const result = safeParseTokenFile(input);
  if (!result.success) {
    throw new TokenFileParseError(result.issues);
  }
  return result.data;
}
