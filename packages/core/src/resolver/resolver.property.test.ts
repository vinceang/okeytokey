import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { TokenResolutionError } from "../errors.js";
import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import type { JsonMap, JsonValue } from "../ordered-json/ordered-json.js";
import { createResolver } from "./resolver.js";

/**
 * Property-based resolver tests over random reference graphs, per the spec:
 * random graphs must never crash (only ever throw TokenResolutionError, and
 * only when justified), and cycles must always be detected.
 */

/** Build a one-set document where token `t<i>` references `t<edges[i][j]>`. */
function documentFromEdges(edges: readonly (readonly number[])[]) {
  const root: JsonMap = new Map<string, JsonValue>();
  edges.forEach((targets, i) => {
    const value =
      targets.length === 0 ? i : targets.map((target) => `{t${String(target)}}`).join(" + ");
    root.set(
      `t${String(i)}`,
      new Map<string, JsonValue>([
        ["$type", "number"],
        ["$value", value],
      ]),
    );
  });
  return createTokenDocument([parseTokenSet("random", root)]);
}

/** Arbitrary adjacency list: n tokens, each referencing 0-3 others. */
const edgesArb = fc.integer({ min: 1, max: 25 }).chain((n) =>
  fc.array(fc.array(fc.integer({ min: 0, max: n - 1 }), { maxLength: 3 }), {
    minLength: n,
    maxLength: n,
  }),
);

/** True if the adjacency list has a directed cycle reachable from `start`. */
function reachesCycle(edges: readonly (readonly number[])[], start: number): boolean {
  const states = new Array<0 | 1 | 2>(edges.length).fill(0);
  const visit = (node: number): boolean => {
    if (states[node] === 1) return true;
    if (states[node] === 2) return false;
    states[node] = 1;
    for (const next of edges[node] ?? []) {
      if (visit(next)) return true;
    }
    states[node] = 2;
    return false;
  };
  return visit(start);
}

describe("resolver properties", () => {
  it("never crashes on random graphs; failures are always TokenResolutionError", () => {
    fc.assert(
      fc.property(edgesArb, (edges) => {
        const resolver = createResolver(documentFromEdges(edges));
        for (let i = 0; i < edges.length; i++) {
          try {
            const { value } = resolver.resolve(`t${String(i)}`);
            expect(typeof value).toBe("number");
            expect(Number.isFinite(value as number)).toBe(true);
          } catch (error) {
            expect(error).toBeInstanceOf(TokenResolutionError);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("detects a cycle exactly when the graph has one on the resolution path", () => {
    fc.assert(
      fc.property(edgesArb, (edges) => {
        const resolver = createResolver(documentFromEdges(edges));
        for (let i = 0; i < edges.length; i++) {
          const expectCycle = reachesCycle(edges, i);
          try {
            resolver.resolve(`t${String(i)}`);
            expect(expectCycle).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(TokenResolutionError);
            expect(expectCycle).toBe(true);
            const cyclePath = (error as TokenResolutionError).cyclePath;
            if (cyclePath) {
              // A reported cycle path must start and end with the same token
              // and every consecutive pair must be a real edge.
              expect(cyclePath[0]).toBe(cyclePath[cyclePath.length - 1]);
              for (let j = 0; j < cyclePath.length - 1; j++) {
                const from = Number((cyclePath[j] ?? "").slice(1));
                const to = Number((cyclePath[j + 1] ?? "").slice(1));
                expect(edges[from]).toContain(to);
              }
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("resolveAll never throws on random graphs", () => {
    fc.assert(
      fc.property(edgesArb, (edges) => {
        const resolver = createResolver(documentFromEdges(edges));
        const { resolved, errors } = resolver.resolveAll();
        expect(resolved.size + errors.length).toBeGreaterThanOrEqual(edges.length);
      }),
      { numRuns: 100 },
    );
  });
});
