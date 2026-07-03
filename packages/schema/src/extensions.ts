import { z } from "zod";

/**
 * The `$extensions["com.okeytokey"]` decision-context metadata. Everything is
 * optional; a token file stripped of this namespace must remain valid DTCG.
 */

export const lifecycleSchema = z.enum(["draft", "active", "deprecated", "archived"]);
export type Lifecycle = z.infer<typeof lifecycleSchema>;

export const decisionSchema = z
  .object({
    author: z.string().min(1),
    /** ISO 8601 date or datetime. */
    date: z.string().min(1),
    rationale: z.string().min(1),
    links: z.array(z.url()).optional(),
  })
  .strict();
export type Decision = z.infer<typeof decisionSchema>;

export const lineageSchema = z
  .object({
    /** Generator identifier, e.g. "scale:modular" or "palette:oklch-ramp". */
    generator: z.string().min(1),
    /** Token paths the generator derived this token from. */
    inputs: z.array(z.string()).optional(),
    /** Generator parameters, kept opaque for round-tripping. */
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type Lineage = z.infer<typeof lineageSchema>;

export const okeytokeyExtensionSchema = z
  .object({
    /** Markdown usage guidance ("use for primary CTAs only"). */
    guidelines: z.string().optional(),
    /** Intended application surface(s). */
    context: z.array(z.string()).optional(),
    /** Why this value exists. */
    decision: decisionSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
    /** Path of the token that supersedes this one (with lifecycle: deprecated). */
    replacedBy: z.string().optional(),
    /** Generated-from metadata when produced by a scale generator. */
    lineage: lineageSchema.optional(),
  })
  .strict();
export type OkeytokeyExtension = z.infer<typeof okeytokeyExtensionSchema>;
