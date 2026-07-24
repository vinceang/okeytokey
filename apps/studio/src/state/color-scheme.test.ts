import { describe, expect, it, vi } from "vitest";

import {
  COLOR_SCHEME_KEY,
  applyColorScheme,
  readColorScheme,
  saveColorScheme,
} from "./color-scheme.js";

describe("color scheme", () => {
  it("reads a stored preference", () => {
    const storage = { getItem: vi.fn(() => "dark"), setItem: vi.fn() };
    expect(readColorScheme(storage)).toBe("dark");
    expect(storage.getItem).toHaveBeenCalledWith(COLOR_SCHEME_KEY);
  });

  it("ignores an invalid stored preference", () => {
    const storage = { getItem: vi.fn(() => "sepia"), setItem: vi.fn() };
    expect(readColorScheme(storage)).toBe("light");
  });

  it("applies the scheme to the document root", () => {
    const root = {
      dataset: {} as DOMStringMap,
      style: {} as CSSStyleDeclaration,
    };
    applyColorScheme("dark", root);
    expect(root.dataset.colorScheme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("persists the preference", () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    saveColorScheme("dark", storage);
    expect(storage.setItem).toHaveBeenCalledWith(COLOR_SCHEME_KEY, "dark");
  });
});
