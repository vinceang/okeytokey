import { interpolate, type Color as CuloriColor } from "culori";

import { formatColor, isColor, isInSrgbGamut, parseColor } from "../color/color.js";
import { TokenParseError } from "../errors.js";
import { createToken, setTokenMeta, withSet } from "../mutate/mutate.js";
import type { TokenDocument, TokenNode } from "../parser/document.js";
import { createResolver } from "../resolver/resolver.js";

/**
 * Deterministic color Scale Generator (Phase 7.0 — see ADR 0006 and
 * docs/phase-7-spec.md's addendum). Given anchor tokens with numeric step
 * names (blue.100, blue.500, blue.900), interpolate the missing steps in
 * OKLCH — perceptually uniform, reproducible, no AI involved. Generated
 * tokens carry `lineage` metadata identifying the generator and its inputs.
 *
 * "If it can be computed, compute it."
 */

export const DEFAULT_SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export const SCALE_GENERATOR_ID = "scale:oklch";

export interface ScaleEntry {
  /** Full token path, e.g. "colors.blue.300". */
  readonly path: string;
  readonly step: number;
  /** Hex when the color fits sRGB, oklch() CSS otherwise. */
  readonly value: string;
  /** True for pre-existing anchors (never overwritten). */
  readonly anchor: boolean;
}

export interface ScalePlan {
  readonly groupPath: string;
  readonly setName: string;
  /** Anchors found, in step order. */
  readonly anchors: readonly ScaleEntry[];
  /** Steps that will be created. */
  readonly generated: readonly ScaleEntry[];
  /** Steps requested but not generatable (outside the anchor range). */
  readonly skipped: readonly { step: number; reason: string }[];
  /** Apply the plan, returning the new document. */
  readonly apply: () => TokenDocument;
}

export interface ScaleOptions {
  /** Steps to ensure. Default {@link DEFAULT_SCALE_STEPS}. */
  readonly steps?: readonly number[];
}

class ScaleError extends TokenParseError {
  override readonly name = "ScaleError";
}

function fail(setName: string, path: string, message: string): never {
  throw new ScaleError(setName, [{ path, message }]);
}

/**
 * Plan filling a color scale. Anchors are the group's direct children whose
 * names are integers and whose resolved values are colors; at least two are
 * required. Missing requested steps strictly between the outermost anchors
 * are interpolated between their nearest anchors in OKLCH.
 */
export function planColorScale(
  document: TokenDocument,
  setName: string,
  groupPath: string,
  options: ScaleOptions = {},
): ScalePlan {
  const set = document.sets.get(setName);
  if (!set) {
    fail(setName, "", "Set does not exist");
  }

  const resolver = createResolver(document);
  const prefix = `${groupPath}.`;
  const anchorNodes: { step: number; token: TokenNode; color: CuloriColor; css: string }[] = [];

  for (const token of set.tokens.values()) {
    if (!token.pathString.startsWith(prefix)) continue;
    const name = token.pathString.slice(prefix.length);
    if (!/^\d+$/.test(name)) continue;
    let resolvedValue: unknown;
    try {
      resolvedValue = resolver.resolve(token.pathString).value;
    } catch {
      continue; // Broken anchors are diagnosed by lint, not here.
    }
    if (typeof resolvedValue !== "string" || !isColor(resolvedValue)) continue;
    anchorNodes.push({
      step: Number(name),
      token,
      color: parseColor(resolvedValue).color,
      css: resolvedValue,
    });
  }

  anchorNodes.sort((a, b) => a.step - b.step);
  if (anchorNodes.length < 2) {
    fail(
      setName,
      groupPath,
      `Need at least two numeric color anchors in "${groupPath}" (found ${String(anchorNodes.length)})`,
    );
  }

  const [first] = anchorNodes;
  const last = anchorNodes.at(-1);
  if (!first || !last) {
    fail(setName, groupPath, "Anchor detection failed unexpectedly");
  }
  const existingSteps = new Set(anchorNodes.map((anchor) => anchor.step));
  const steps = [...new Set(options.steps ?? DEFAULT_SCALE_STEPS)].sort((a, b) => a - b);

  const anchors: ScaleEntry[] = anchorNodes.map((anchor) => ({
    path: anchor.token.pathString,
    step: anchor.step,
    value: anchor.css,
    anchor: true,
  }));
  const generated: ScaleEntry[] = [];
  const skipped: { step: number; reason: string }[] = [];

  for (const step of steps) {
    if (existingSteps.has(step)) continue;
    if (step < first.step || step > last.step) {
      skipped.push({
        step,
        reason: `outside the anchor range ${String(first.step)}–${String(last.step)} (extrapolation is not deterministic enough)`,
      });
      continue;
    }
    // Nearest anchors on each side.
    const below = [...anchorNodes].reverse().find((anchor) => anchor.step < step) ?? first;
    const above = anchorNodes.find((anchor) => anchor.step > step) ?? last;
    const t = (step - below.step) / (above.step - below.step);
    const mixed = interpolate([below.color, above.color], "oklch")(t);
    const parsed = { color: mixed, input: "" };
    const value = isInSrgbGamut(parsed) ? formatColor(parsed, "hex") : formatColor(parsed, "oklch");
    generated.push({ path: `${groupPath}.${String(step)}`, step, value, anchor: false });
  }

  const apply = (): TokenDocument => {
    let nextSet = set;
    for (const entry of generated) {
      nextSet = createToken(nextSet, entry.path, { type: "color", value: entry.value });
      nextSet = setTokenMeta(nextSet, entry.path, {
        okeytokey: {
          lineage: {
            generator: SCALE_GENERATOR_ID,
            inputs: anchors.map((anchor) => anchor.path),
            params: { step: entry.step },
          },
        },
      });
    }
    return withSet(document, nextSet);
  };

  return { groupPath, setName, anchors, generated, skipped, apply };
}
