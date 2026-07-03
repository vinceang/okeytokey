import { describe, expect, it } from "vitest";

import { createTokenDocument, getToken, parseTokenSet } from "./index.js";

describe("public API integration", () => {
  it("parses a set and resolves lookups through a document", () => {
    const set = parseTokenSet(
      "global",
      '{ "colors": { "$type": "color", "bg": { "$value": "#fff" } } }',
    );
    const document = createTokenDocument([set]);
    expect(getToken(document, "colors.bg")?.type).toBe("color");
  });
});
