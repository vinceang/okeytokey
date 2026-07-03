import { describe, expect, it } from "vitest";

import {
  Button,
  ColorSwatch,
  Field,
  ReferencePill,
  SegmentedControl,
  Select,
  TextInput,
  TokenRow,
  TokenTypeIcon,
} from "./index.js";

describe("component exports", () => {
  it("every component is a function component", () => {
    for (const component of [
      Button,
      ColorSwatch,
      Field,
      ReferencePill,
      SegmentedControl,
      Select,
      TextInput,
      TokenRow,
      TokenTypeIcon,
    ]) {
      expect(typeof component).toBe("function");
    }
  });
});
