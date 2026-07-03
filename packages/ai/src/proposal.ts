import { z } from "zod";

import { DTCG_TOKEN_TYPES } from "@okeytokey/schema";

/**
 * The structured proposal contract. AI output is untrusted input: models
 * return text; `parseProposal` extracts and validates it against this schema.
 * Operations mirror core's mutation/refactor primitives 1:1 — no parallel
 * AI-only mutation vocabulary.
 */

const tokenTypeSchema = z.enum(DTCG_TOKEN_TYPES);

export const createOperationSchema = z
  .object({
    op: z.literal("create"),
    set: z.string().min(1),
    path: z.string().min(1),
    type: tokenTypeSchema,
    value: z.unknown(),
    description: z.string().optional(),
  })
  .strict();

export const updateOperationSchema = z
  .object({
    op: z.literal("update"),
    set: z.string().min(1),
    path: z.string().min(1),
    value: z.unknown(),
  })
  .strict();

export const deleteOperationSchema = z
  .object({
    op: z.literal("delete"),
    set: z.string().min(1),
    path: z.string().min(1),
  })
  .strict();

export const renameOperationSchema = z
  .object({
    op: z.literal("rename"),
    fromPath: z.string().min(1),
    toPath: z.string().min(1),
  })
  .strict();

export const tokenOperationSchema = z.discriminatedUnion("op", [
  createOperationSchema,
  updateOperationSchema,
  deleteOperationSchema,
  renameOperationSchema,
]);

export const proposalSchema = z
  .object({
    summary: z.string().min(1),
    assumptions: z.array(z.string()).optional(),
    operations: z.array(tokenOperationSchema).min(1),
    warnings: z.array(z.string()).optional(),
  })
  .strict();

export type TokenOperation = z.infer<typeof tokenOperationSchema>;
export type TokenChangeProposal = z.infer<typeof proposalSchema>;

export interface ProposalParseFailure {
  readonly reason: "no-json" | "invalid-json" | "schema-mismatch";
  readonly detail: string;
}

export type ProposalParseResult =
  | { readonly ok: true; readonly proposal: TokenChangeProposal }
  | { readonly ok: false; readonly failure: ProposalParseFailure };

/** Strip markdown fences and grab the outermost JSON object. */
function extractJson(text: string): string | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  return candidate.slice(start, end + 1);
}

/**
 * Parse raw model text into a proposal. Local models fail strict JSON
 * regularly, so this is deliberately forgiving about wrapping (fences,
 * prose around the object) and strict about the object itself.
 */
export function parseProposal(text: string): ProposalParseResult {
  const json = extractJson(text);
  if (json === undefined) {
    return {
      ok: false,
      failure: { reason: "no-json", detail: "The response contains no JSON object." },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      failure: {
        reason: "invalid-json",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
  const result = proposalSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      failure: {
        reason: "schema-mismatch",
        detail: result.error.issues
          .map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`)
          .join("; "),
      },
    };
  }
  return { ok: true, proposal: result.data };
}
