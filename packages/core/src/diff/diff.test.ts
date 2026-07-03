import { describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet } from "../parser/document.js";
import { diffDocuments } from "./diff.js";

const doc = (...sets: [string, string][]) =>
  createTokenDocument(sets.map(([name, json]) => parseTokenSet(name, json)));

const BASE = `{
  "colors": {
    "$type": "color",
    "blue": { "$value": "#3b82f6" },
    "red": { "$value": "#ef4444" }
  },
  "semantic": {
    "$type": "color",
    "action": { "$value": "{colors.blue}" },
    "hover": { "$value": "darken({colors.blue}, 0.1)" }
  }
}`;

describe("diffDocuments", () => {
  it("classifies added / removed / value-changed / type-changed", () => {
    const before = doc(["global", BASE]);
    const after = doc([
      "global",
      `{
        "colors": {
          "$type": "color",
          "blue": { "$value": "#2563eb" },
          "green": { "$value": "#22c55e" }
        },
        "semantic": {
          "$type": "color",
          "action": { "$value": "{colors.blue}" },
          "hover": { "$value": "darken({colors.blue}, 0.1)" }
        },
        "misc": { "count": { "$type": "number", "$value": 3 } }
      }`,
    ]);
    const diff = diffDocuments(before, after);
    const changes = diff.sets[0]?.changes ?? [];
    const kinds = Object.fromEntries(changes.map((change) => [change.path, change.kind]));
    expect(kinds["colors.blue"]).toBe("value-changed");
    expect(kinds["colors.green"]).toBe("added");
    expect(kinds["colors.red"]).toBe("removed");
    expect(kinds["misc.count"]).toBe("added");
  });

  it("detects renames via the identical-signature heuristic", () => {
    const before = doc(["global", '{ "a": { "$type": "color", "$value": "#123456" } }']);
    const after = doc(["global", '{ "b": { "$type": "color", "$value": "#123456" } }']);
    const changes = diffDocuments(before, after).sets[0]?.changes ?? [];
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "renamed", path: "a", toPath: "b" });
  });

  it("does not guess renames when the signature is ambiguous", () => {
    const before = doc([
      "global",
      '{ "a": { "$type": "color", "$value": "#123456" }, "b": { "$type": "color", "$value": "#123456" } }',
    ]);
    const after = doc(["global", '{ "c": { "$type": "color", "$value": "#123456" } }']);
    const kinds = (diffDocuments(before, after).sets[0]?.changes ?? []).map(
      (change) => change.kind,
    );
    expect(kinds.sort()).toEqual(["added", "removed", "removed"]);
  });

  it("computes transitive impact through aliases and color functions", () => {
    const before = doc(["global", BASE]);
    const after = doc(["global", BASE.replace("#3b82f6", "#1d4ed8")]);
    const diff = diffDocuments(before, after);
    // Direct: colors.blue. Downstream: semantic.action (alias) and
    // semantic.hover (color function over the alias).
    expect(diff.impactedPaths).toEqual(["colors.blue", "semantic.action", "semantic.hover"]);
    expect(diff.downstreamPaths).toEqual(["semantic.action", "semantic.hover"]);
  });

  it("reports added and removed sets", () => {
    const before = doc(["global", BASE]);
    const after = doc(["brand", '{ "x": { "$type": "number", "$value": 1 } }']);
    const diff = diffDocuments(before, after);
    expect(diff.addedSets).toEqual(["brand"]);
    expect(diff.removedSets).toEqual(["global"]);
    expect(
      diff.sets.find((set) => set.setName === "global")?.changes.every((c) => c.kind === "removed"),
    ).toBe(true);
  });

  it("returns empty impact for identical documents", () => {
    const before = doc(["global", BASE]);
    const after = doc(["global", BASE]);
    const diff = diffDocuments(before, after);
    expect(diff.sets).toHaveLength(0);
    expect(diff.impactedPaths).toHaveLength(0);
  });
});
