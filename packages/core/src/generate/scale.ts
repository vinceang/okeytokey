import { clampChroma, converter, interpolate, type Color as CuloriColor } from "culori";

const toOklch = converter("oklch");

import { formatColor, isColor, isInSrgbGamut, parseColor } from "../color/color.js";
import { TokenParseError } from "../errors.js";
import { createToken, setTokenMeta, withSet } from "../mutate/mutate.js";
import {
  parseTokenSet,
  type TokenDocument,
  type TokenNode,
  type TokenSet,
} from "../parser/document.js";
import type { JsonMap, JsonValue } from "../ordered-json/ordered-json.js";
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
  /** Virtual range endpoints in use (single-anchor mode or explicit ends). */
  readonly synthesized?: { readonly lightEnd?: string; readonly darkEnd?: string };
  /** Numeric children that could not serve as anchors, with reasons. */
  readonly excludedAnchors: readonly string[];
  /** Apply the plan, returning the new document. */
  readonly apply: () => TokenDocument;
}

export interface ScaleOptions {
  /** Steps to ensure. Default {@link DEFAULT_SCALE_STEPS}. */
  readonly steps?: readonly number[];
  /**
   * Explicit lightest end of the ramp (any CSS color). Placed at virtual
   * position 0, enabling steps below the lowest anchor.
   */
  readonly lightEnd?: string;
  /** Explicit darkest end, placed at virtual position 1000. */
  readonly darkEnd?: string;
}

class ScaleError extends TokenParseError {
  override readonly name = "ScaleError";
}

/**
 * Reorder a group's children so numeric names sort ascending (generation
 * appends, which would leave 600, 50, 100…). `$` keys keep their position at
 * the front; non-numeric children keep their relative order after the steps.
 */
function sortGroupNumerically(set: TokenSet, groupPath: string): TokenSet {
  const segments = groupPath.split(".");

  const rebuild = (node: JsonMap, depth: number): JsonMap => {
    if (depth < segments.length) {
      const key = segments[depth];
      const child = key === undefined ? undefined : node.get(key);
      if (key === undefined || !(child instanceof Map)) return node;
      const next = new Map(node);
      next.set(key, rebuild(child, depth + 1));
      return next;
    }
    const dollar: [string, JsonValue][] = [];
    const numeric: [string, JsonValue][] = [];
    const rest: [string, JsonValue][] = [];
    for (const entry of node) {
      if (entry[0].startsWith("$")) dollar.push(entry);
      else if (/^\d+$/.test(entry[0])) numeric.push(entry);
      else rest.push(entry);
    }
    numeric.sort((a, b) => Number(a[0]) - Number(b[0]));
    return new Map([...dollar, ...numeric, ...rest]);
  };

  return parseTokenSet(set.name, rebuild(set.root, 0));
}

function fail(setName: string, path: string, message: string): never {
  throw new ScaleError(setName, [{ path, message }]);
}

/**
 * Plan filling a color scale. Anchors are the group's direct children whose
 * names are integers and whose resolved values are colors. Two or more:
 * missing steps between the outermost anchors interpolate between their
 * nearest neighbors. Exactly one: virtual near-white/near-dark endpoints
 * (hue from the seed) are synthesized so a full ramp generates around it.
 * Explicit `lightEnd`/`darkEnd` options replace the synthesized endpoints
 * and extend the range in multi-anchor groups.
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
  // Numeric-named children that can't serve as anchors, with the reason —
  // "found 1" without saying why 500 didn't count is a support ticket.
  const excluded: string[] = [];

  for (const token of set.tokens.values()) {
    if (!token.pathString.startsWith(prefix)) continue;
    const name = token.pathString.slice(prefix.length);
    if (!/^\d+$/.test(name)) continue;
    let resolvedValue: unknown;
    try {
      resolvedValue = resolver.resolve(token.pathString).value;
    } catch (error) {
      excluded.push(`${name} (${error instanceof Error ? error.message : "does not resolve"})`);
      continue;
    }
    if (typeof resolvedValue !== "string" || !isColor(resolvedValue)) {
      excluded.push(
        `${name} (resolves to ${JSON.stringify(resolvedValue)}, which is not a color — its raw value is ${JSON.stringify(token.value)})`,
      );
      continue;
    }
    anchorNodes.push({
      step: Number(name),
      token,
      color: parseColor(resolvedValue).color,
      css: resolvedValue,
    });
  }

  anchorNodes.sort((a, b) => a.step - b.step);
  if (anchorNodes.length === 0) {
    fail(
      setName,
      groupPath,
      `No numeric color anchors in "${groupPath}".` +
        (excluded.length > 0 ? ` Excluded: ${excluded.join("; ")}.` : ""),
    );
  }

  // Real anchors feed the preview and lineage before virtual endpoints join.
  const anchors: ScaleEntry[] = anchorNodes.map((anchor) => ({
    path: anchor.token.pathString,
    step: anchor.step,
    value: anchor.css,
    anchor: true,
  }));
  const existingSteps = new Set(anchorNodes.map((anchor) => anchor.step));

  // Range endpoints. With one anchor (or explicit ends), synthesize virtual
  // endpoints at positions 0 and 1000: near-white and near-dark in OKLCH,
  // hue taken from the seed — deterministic, so still generator territory.
  const [seed] = anchorNodes;
  if (!seed) {
    fail(setName, groupPath, "Anchor detection failed unexpectedly");
  }
  const seedOklch = toOklch(seed.color);
  const singleAnchor = anchorNodes.length === 1;
  const synthesized: { lightEnd?: string; darkEnd?: string } = {};

  const parseEnd = (input: string, label: string): CuloriColor => {
    if (!isColor(input)) {
      fail(setName, groupPath, `The ${label} end ${JSON.stringify(input)} is not a color`);
    }
    return parseColor(input).color;
  };
  // Generated ramp values are for direct use: gamut-map into sRGB
  // (chroma-clamped in OKLCH — deterministic) and emit hex.
  const cssOf = (color: CuloriColor): string => {
    const fitted = isInSrgbGamut({ color, input: "" }) ? color : clampChroma(color, "oklch");
    return formatColor({ color: fitted, input: "" }, "hex");
  };

  if (options.lightEnd !== undefined || singleAnchor) {
    const color =
      options.lightEnd !== undefined
        ? parseEnd(options.lightEnd, "lightest")
        : ({
            mode: "oklch",
            l: 0.985,
            c: Math.min(seedOklch.c, 0.02),
            h: seedOklch.h,
          } as CuloriColor);
    synthesized.lightEnd = cssOf(color);
    anchorNodes.unshift({ step: 0, token: seed.token, color, css: synthesized.lightEnd });
  }
  if (options.darkEnd !== undefined || singleAnchor) {
    const color =
      options.darkEnd !== undefined
        ? parseEnd(options.darkEnd, "darkest")
        : ({ mode: "oklch", l: 0.17, c: seedOklch.c * 0.55, h: seedOklch.h } as CuloriColor);
    synthesized.darkEnd = cssOf(color);
    anchorNodes.push({ step: 1000, token: seed.token, color, css: synthesized.darkEnd });
  }

  const [first] = anchorNodes;
  const last = anchorNodes.at(-1);
  if (!first || !last || first === last) {
    fail(
      setName,
      groupPath,
      "Only one anchor and no range: set a lightest/darkest end, or add a second anchor",
    );
  }
  const steps = [...new Set(options.steps ?? DEFAULT_SCALE_STEPS)].sort((a, b) => a - b);
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
    generated.push({
      path: `${groupPath}.${String(step)}`,
      step,
      value: cssOf(mixed),
      anchor: false,
    });
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
    return withSet(document, sortGroupNumerically(nextSet, groupPath));
  };

  return {
    groupPath,
    setName,
    anchors,
    generated,
    skipped,
    synthesized:
      synthesized.lightEnd !== undefined || synthesized.darkEnd !== undefined
        ? synthesized
        : undefined,
    excludedAnchors: excluded,
    apply,
  };
}
