import { z } from "zod";

/**
 * The typed postMessage protocol between the plugin main thread and its UI
 * iframe. Discriminated unions, validated with Zod on BOTH sides — a
 * malformed message is a bug surfaced immediately, not a silent no-op.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

// --- Shared shapes -----------------------------------------------------------

export const applyTargetSchema = z.enum([
  "fill",
  "stroke",
  "cornerRadius",
  "padding",
  "gap",
  "typography",
]);
export type ApplyTarget = z.infer<typeof applyTargetSchema>;

export const themeSchema = z.object({
  name: z.string(),
  group: z.string().optional(),
  sets: z.array(
    z.object({
      set: z.string(),
      status: z.enum(["enabled", "source", "disabled"]),
    }),
  ),
});

const setFileSchema = z.object({ name: z.string(), json: z.string() });

// --- UI -> main --------------------------------------------------------------

export const uiToMainSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ui-ready") }),
  z.object({ type: z.literal("load-document"), files: z.array(setFileSchema) }),
  z.object({ type: z.literal("apply-token"), path: z.string(), target: applyTargetSchema }),
  z.object({ type: z.literal("export-variables"), themes: z.array(themeSchema) }),
  z.object({ type: z.literal("import-variables") }),
  z.object({ type: z.literal("set-active-theme"), theme: z.string().nullable() }),
]);
export type UiToMain = z.infer<typeof uiToMainSchema>;

// --- main -> UI --------------------------------------------------------------

export const mappingReportSchema = z.object({
  mapped: z.number(),
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
});
export type MappingReport = z.infer<typeof mappingReportSchema>;

export const mainToUiSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("init"),
    protocolVersion: z.number(),
    activeTheme: z.string().nullable(),
    tokenCount: z.number(),
  }),
  z.object({
    type: z.literal("selection-changed"),
    nodes: z.array(z.object({ id: z.string(), name: z.string(), nodeType: z.string() })),
  }),
  z.object({ type: z.literal("document-loaded"), tokenCount: z.number() }),
  z.object({ type: z.literal("applied"), path: z.string(), nodeCount: z.number() }),
  z.object({
    type: z.literal("variables-exported"),
    collection: z.string(),
    modeCount: z.number(),
    variableCount: z.number(),
  }),
  z.object({
    type: z.literal("variables-imported"),
    files: z.array(setFileSchema),
    report: mappingReportSchema,
  }),
  z.object({ type: z.literal("active-theme"), theme: z.string().nullable() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type MainToUi = z.infer<typeof mainToUiSchema>;

/** Parse an incoming message; returns undefined for foreign/invalid messages. */
export function parseUiToMain(data: unknown): UiToMain | undefined {
  const result = uiToMainSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

export function parseMainToUi(data: unknown): MainToUi | undefined {
  const result = mainToUiSchema.safeParse(data);
  return result.success ? result.data : undefined;
}
