import { describe, expect, it } from "vitest";

import { TokenParseError } from "../errors.js";
import { createTokenDocument, parseTokenSet, serializeTokenSet } from "../parser/document.js";
import { createResolver } from "../resolver/resolver.js";
import { deprecate, planMoveToSet, planRename, renameToken } from "./refactor.js";

const doc = () =>
  createTokenDocument([
    parseTokenSet(
      "global",
      `{
  "colors": {
    "$type": "color",
    "blue": {
      "500": { "$value": "#3b82f6", "$description": "Brand blue" },
      "600": { "$value": "#2563eb" }
    }
  },
  "spacing": { "$type": "dimension", "base": { "$value": "4px" }, "double": { "$value": "{spacing.base} * 2" } }
}`,
    ),
    parseTokenSet(
      "semantic",
      `{
  "action": { "$type": "color", "$value": "{colors.blue.500}" },
  "shadowed": {
    "$type": "shadow",
    "$value": { "color": "{colors.blue.500}", "offsetX": "0px", "offsetY": "1px", "blur": "2px", "spread": "0px" }
  }
}`,
    ),
  ]);

describe("planRename / renameToken", () => {
  it("previews every reference edit before applying", () => {
    const plan = planRename(doc(), "colors.blue.500", "colors.primary.500");
    expect(plan.movedIn).toEqual(["global"]);
    expect(plan.referenceEdits.map((edit) => `${edit.setName}:${edit.tokenPath}`).sort()).toEqual([
      "semantic:action",
      "semantic:shadowed",
    ]);
    expect(plan.referenceEdits.find((edit) => edit.tokenPath === "action")?.after).toBe(
      "{colors.primary.500}",
    );
  });

  it("applies atomically: token moved, all references retargeted, resolution intact", () => {
    const renamed = renameToken(doc(), "colors.blue.500", "colors.primary.500");
    const global = renamed.sets.get("global");
    expect(global?.tokens.has("colors.blue.500")).toBe(false);
    expect(global?.tokens.get("colors.primary.500")?.value).toBe("#3b82f6");
    expect(global?.tokens.get("colors.primary.500")?.description).toBe("Brand blue");

    const resolver = createResolver(renamed);
    expect(resolver.resolve("action").value).toBe("#3b82f6");
    const shadow = resolver.resolve("shadowed").value as { color: string };
    expect(shadow.color).toBe("#3b82f6");
    // No dangling references to the old path anywhere.
    expect(serializeTokenSet(renamed.sets.get("semantic") as never)).not.toContain(
      "colors.blue.500",
    );
  });

  it("renames whole groups, rewriting subtree references", () => {
    const renamed = renameToken(doc(), "colors.blue", "colors.brand");
    const global = renamed.sets.get("global");
    expect(global?.tokens.has("colors.brand.500")).toBe(true);
    expect(global?.tokens.has("colors.brand.600")).toBe(true);
    expect(createResolver(renamed).resolve("action").value).toBe("#3b82f6");
  });

  it("updates references inside math expressions", () => {
    const renamed = renameToken(doc(), "spacing.base", "spacing.unit");
    expect(renamed.sets.get("global")?.tokens.get("spacing.double")?.value).toBe(
      "{spacing.unit} * 2",
    );
    expect(createResolver(renamed).resolve("spacing.double").value).toBe("8px");
  });

  it("rejects collisions, no-ops, and missing sources", () => {
    expect(() => planRename(doc(), "colors.blue.500", "colors.blue.600")).toThrow(TokenParseError);
    expect(() => planRename(doc(), "colors.blue.500", "colors.blue.500")).toThrow(/identical/);
    expect(() => planRename(doc(), "nope", "other")).toThrow(/No token or group/);
  });
});

describe("planMoveToSet", () => {
  it("moves a token with its metadata", () => {
    const moved = planMoveToSet(doc(), "action", "semantic", "global").apply();
    expect(moved.sets.get("semantic")?.tokens.has("action")).toBe(false);
    expect(moved.sets.get("global")?.tokens.get("action")?.value).toBe("{colors.blue.500}");
    expect(createResolver(moved).resolve("action").value).toBe("#3b82f6");
  });

  it("rejects collisions and missing endpoints", () => {
    expect(() => planMoveToSet(doc(), "action", "semantic", "nope")).toThrow(/Target set/);
    expect(() => planMoveToSet(doc(), "nope", "semantic", "global")).toThrow(/does not exist/);
    const collision = createTokenDocument([
      parseTokenSet("a", '{ "x": { "$type": "number", "$value": 1 } }'),
      parseTokenSet("b", '{ "x": { "$type": "number", "$value": 2 } }'),
    ]);
    expect(() => planMoveToSet(collision, "x", "a", "b")).toThrow(/already has a token/);
  });
});

describe("deprecate", () => {
  it("marks lifecycle + replacedBy and sets $deprecated", () => {
    const deprecated = deprecate(doc(), "colors.blue.500", "colors.blue.600");
    const token = deprecated.sets.get("global")?.tokens.get("colors.blue.500");
    expect(token?.deprecated).toBe("use colors.blue.600");
    expect(token?.okeytokey?.lifecycle).toBe("deprecated");
    expect(token?.okeytokey?.replacedBy).toBe("colors.blue.600");
  });

  it("works without a replacement and validates one when given", () => {
    const deprecated = deprecate(doc(), "colors.blue.500");
    expect(deprecated.sets.get("global")?.tokens.get("colors.blue.500")?.deprecated).toBe(true);
    expect(() => deprecate(doc(), "colors.blue.500", "ghost.token")).toThrow(
      /Replacement token does not exist/,
    );
    expect(() => deprecate(doc(), "ghost")).toThrow(/does not exist in any set/);
  });
});
