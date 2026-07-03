import { describe, expect, it } from "vitest";

import { BRIDGE_PROTOCOL_VERSION } from "./index.js";

describe("BRIDGE_PROTOCOL_VERSION", () => {
  it("starts at 1", () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe(1);
  });
});
