/**
 * @okeytokey/transforms — Style Dictionary v4 export pipeline.
 *
 * Phase 0 scaffold: output targets, theme-aware builds, and the standalone
 * `okeytokey build` CLI land in Phase 4.
 */

/** First-party output targets shipped in v1. */
export const BUILTIN_OUTPUT_TARGETS = ["css", "scss", "ts", "tailwind"] as const;

export type OutputTarget = (typeof BUILTIN_OUTPUT_TARGETS)[number];
