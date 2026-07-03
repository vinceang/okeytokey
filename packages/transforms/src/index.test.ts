import { describe, expect, it } from "vitest";

import { BUILTIN_OUTPUT_TARGETS } from "./index.js";

describe("BUILTIN_OUTPUT_TARGETS", () => {
  it("covers the v1 targets", () => {
    expect(BUILTIN_OUTPUT_TARGETS).toEqual(["css", "scss", "ts", "tailwind"]);
  });
});
