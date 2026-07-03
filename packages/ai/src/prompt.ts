import type { AiTaskRequest } from "./provider.js";

/**
 * Shared prompt assembly for every adapter. The system prompt pins the
 * proposal contract (see proposal.ts); the user prompt carries the
 * instruction plus the minimized context package.
 */

const TASK_BRIEFS: Record<AiTaskRequest["task"], string> = {
  "generate-semantic-tokens":
    "Propose semantic tokens derived from the primitives in context. Prefer aliases ({path}) to existing tokens over duplicated raw values. Preserve the naming style already in use.",
  "generate-dark-theme":
    "Propose dark-theme counterpart values for the tokens in context, preserving visual hierarchy.",
  "suggest-accessible-replacement":
    "Propose the smallest token changes that would satisfy the stated contrast requirement.",
  "suggest-renames":
    "Propose rename operations that make token names consistent with the conventions already used in context.",
  "suggest-aliases":
    "Propose update operations replacing repeated raw values with aliases to existing tokens.",
  "explain-tokens":
    "Explain the tokens in context. If no changes are warranted, still return one no-op-free proposal only when a concrete improvement exists.",
  "suggest-missing-roles":
    "Propose new semantic tokens for roles that appear to be missing (hover, active, focus, disabled, …), aliasing existing primitives.",
};

export function buildSystemPrompt(): string {
  return `You are a design-token assistant inside okeytokey, a W3C DTCG token editor.
You respond with EXACTLY ONE JSON object and nothing else — no prose, no markdown fences.

The JSON must match this shape:
{
  "summary": "one sentence describing the change",
  "assumptions": ["optional strings"],
  "operations": [
    { "op": "create", "set": "<set name from context>", "path": "a.b.c", "type": "<dtcg type>", "value": <value>, "description": "optional" },
    { "op": "update", "set": "<set name>", "path": "a.b.c", "value": <value> },
    { "op": "delete", "set": "<set name>", "path": "a.b.c" },
    { "op": "rename", "fromPath": "a.b.c", "toPath": "x.y.z" }
  ],
  "warnings": ["optional strings"]
}

Rules:
- "set" must be one of the set names listed in the context.
- Alias values are strings like "{colors.blue.500}" referencing tokens that exist in context or that earlier operations in THIS proposal create.
- Color values are CSS color strings (hex preferred). Dimensions are like "16px".
- Never delete or rename tokens that were not shown to you in context.
- Keep proposals minimal: no unrequested extras.`;
}

export function buildUserPrompt(request: AiTaskRequest): string {
  return `Task: ${TASK_BRIEFS[request.task]}

Instruction from the user:
${request.instruction}

Context (selected tokens, their referenced dependencies, and the available set names):
${request.context.rendered}`;
}
