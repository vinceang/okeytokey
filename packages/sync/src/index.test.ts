import { describe, expect, it } from "vitest";

import { SYNC_PROVIDER_KINDS } from "./index.js";

describe("SYNC_PROVIDER_KINDS", () => {
  it("ships GitHub first", () => {
    expect(SYNC_PROVIDER_KINDS[0]).toBe("github");
  });
});
