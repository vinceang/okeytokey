import { describe, expect, it } from "vitest";

import { TokenParseError } from "../errors.js";
import { createTokenDocument, parseTokenSet, serializeTokenSet } from "../parser/document.js";
import {
  TokenMutationError,
  addSet,
  createToken,
  deleteToken,
  emptySet,
  removeSet,
  renameSet,
  setGroupMeta,
  setTokenMeta,
  setTokenValue,
  withSet,
} from "./mutate.js";

const base = () =>
  parseTokenSet(
    "global",
    `{
  "colors": {
    "$type": "color",
    "blue": { "$value": "#3b82f6" },
    "nested": { "deep": { "$value": "#111111" } }
  },
  "spacing": { "$type": "dimension", "base": { "$value": "4px" } }
}`,
  );

describe("createToken", () => {
  it("creates tokens, groups included, without touching the input", () => {
    const before = base();
    const after = createToken(before, "colors.red.500", { type: "color", value: "#ef4444" });
    expect(after.tokens.get("colors.red.500")?.value).toBe("#ef4444");
    expect(before.tokens.has("colors.red.500")).toBe(false);
    // Untouched subtrees are shared, not cloned.
    expect(after.tokens.get("spacing.base")?.raw).toBe(before.tokens.get("spacing.base")?.raw);
  });

  it("rejects collisions, tokens inside tokens, and bad names", () => {
    expect(() => createToken(base(), "colors.blue", { type: "color", value: "#fff" })).toThrow(
      TokenMutationError,
    );
    expect(() => createToken(base(), "colors.blue.dark", { type: "color", value: "#fff" })).toThrow(
      /inside another token/,
    );
    expect(() => createToken(base(), "colors.a{b", { type: "color", value: "#fff" })).toThrow(
      /Invalid path segment/,
    );
  });

  it("rejects values invalid for the type (revalidation)", () => {
    // Revalidation happens in parseTokenSet, so this surfaces as the parent
    // TokenParseError rather than TokenMutationError.
    expect(() => createToken(base(), "x", { type: "dimension", value: "16em" })).toThrow(
      TokenParseError,
    );
  });
});

describe("setTokenValue", () => {
  it("replaces the value and preserves other fields and key order", () => {
    const withDescription = setTokenMeta(base(), "colors.blue", { description: "Brand blue" });
    const after = setTokenValue(withDescription, "colors.blue", "#2563eb");
    expect(after.tokens.get("colors.blue")?.value).toBe("#2563eb");
    expect(after.tokens.get("colors.blue")?.description).toBe("Brand blue");
  });

  it("throws for unknown tokens", () => {
    expect(() => setTokenValue(base(), "missing", "#fff")).toThrow(TokenMutationError);
  });
});

describe("setTokenMeta", () => {
  it("patches and removes fields", () => {
    let set = setTokenMeta(base(), "colors.blue", {
      description: "Brand blue",
      deprecated: "use colors.primary",
      okeytokey: { lifecycle: "deprecated", replacedBy: "colors.primary" },
    });
    const token = set.tokens.get("colors.blue");
    expect(token?.description).toBe("Brand blue");
    expect(token?.deprecated).toBe("use colors.primary");
    expect(token?.okeytokey?.lifecycle).toBe("deprecated");

    set = setTokenMeta(set, "colors.blue", { description: null, okeytokey: null });
    const cleaned = set.tokens.get("colors.blue");
    expect(cleaned?.description).toBeUndefined();
    expect(cleaned?.okeytokey).toBeUndefined();
    expect(serializeTokenSet(set)).not.toContain("$extensions");
  });
});

describe("deleteToken", () => {
  it("deletes and prunes empty groups", () => {
    const after = deleteToken(base(), "colors.nested.deep");
    expect(after.tokens.has("colors.nested.deep")).toBe(false);
    expect(serializeTokenSet(after)).not.toContain("nested");
    // Sibling group survives.
    expect(after.tokens.has("colors.blue")).toBe(true);
  });

  it("keeps groups that still have members", () => {
    const after = deleteToken(base(), "colors.blue");
    expect(after.tokens.has("colors.nested.deep")).toBe(true);
  });
});

describe("setGroupMeta", () => {
  it("sets and clears group $type/$description", () => {
    const after = setGroupMeta(base(), "colors.nested", {
      type: "color",
      description: "Nested colors",
    });
    expect(serializeTokenSet(after)).toContain("Nested colors");
    const cleared = setGroupMeta(after, "colors.nested", { description: null });
    expect(serializeTokenSet(cleared)).not.toContain("Nested colors");
  });

  it("rejects tokens and missing paths", () => {
    expect(() => setGroupMeta(base(), "colors.blue", {})).toThrow(/Group does not exist/);
    expect(() => setGroupMeta(base(), "nope", {})).toThrow(/Group does not exist/);
  });
});

describe("document operations", () => {
  const document = () => createTokenDocument([base(), emptySet("dark")]);

  it("withSet replaces in place", () => {
    const updated = withSet(document(), setTokenValue(base(), "colors.blue", "#0000ff"));
    expect(updated.sets.get("global")?.tokens.get("colors.blue")?.value).toBe("#0000ff");
    expect([...updated.sets.keys()]).toEqual(["global", "dark"]);
  });

  it("addSet / removeSet / renameSet preserve order and reject conflicts", () => {
    let doc = addSet(document(), emptySet("brand"));
    expect([...doc.sets.keys()]).toEqual(["global", "dark", "brand"]);
    expect(() => addSet(doc, emptySet("brand"))).toThrow(TokenMutationError);

    doc = renameSet(doc, "dark", "midnight");
    expect([...doc.sets.keys()]).toEqual(["global", "midnight", "brand"]);
    expect(doc.sets.get("midnight")?.name).toBe("midnight");
    expect(() => renameSet(doc, "brand", "global")).toThrow(TokenMutationError);

    doc = removeSet(doc, "brand");
    expect([...doc.sets.keys()]).toEqual(["global", "midnight"]);
    expect(() => removeSet(doc, "brand")).toThrow(TokenMutationError);
  });

  it("withSet rejects unknown sets", () => {
    expect(() => withSet(document(), emptySet("stranger"))).toThrow(TokenMutationError);
  });
});
