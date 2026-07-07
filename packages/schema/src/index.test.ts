import { describe, expect, it } from "vitest";

import { DTCG_TOKEN_TYPES, OKEYTOKEY_EXTENSION_NAMESPACE } from "./index.js";

describe("DTCG_TOKEN_TYPES", () => {
  it("includes the primitive and composite DTCG types", () => {
    expect(DTCG_TOKEN_TYPES).toContain("color");
    expect(DTCG_TOKEN_TYPES).toContain("typography");
    expect(DTCG_TOKEN_TYPES).toHaveLength(16);
  });

  it("has no duplicates", () => {
    expect(new Set(DTCG_TOKEN_TYPES).size).toBe(DTCG_TOKEN_TYPES.length);
  });
});

describe("OKEYTOKEY_EXTENSION_NAMESPACE", () => {
  it("is the reverse-domain okeytokey namespace", () => {
    expect(OKEYTOKEY_EXTENSION_NAMESPACE).toBe("com.okeytokey");
  });
});
