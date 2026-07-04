import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet, type Theme } from "@okeytokey/core";

import { build, renderTarget, type OkeytokeyConfig } from "./build.js";
import {
  formatCssLightDark,
  formatCssVariables,
  formatScssMap,
  formatTailwindTheme,
  formatTsConsts,
  resolveForExport,
  transformEntries,
} from "./formats.js";

const document = () =>
  createTokenDocument([
    parseTokenSet(
      "global",
      `{
  "colors": {
    "$type": "color",
    "blue": { "$value": "#3b82f6" },
    "action": { "$value": "{colors.blue}" }
  },
  "spacing": { "$type": "dimension", "base": { "$value": "4px" }, "md": { "$value": "{spacing.base} * 4" } },
  "shadow": {
    "card": {
      "$type": "shadow",
      "$value": { "color": "#00000022", "offsetX": "0px", "offsetY": "2px", "blur": "8px", "spread": "0px" }
    }
  }
}`,
    ),
    parseTokenSet("dark", '{ "colors": { "$type": "color", "blue": { "$value": "#60a5fa" } } }'),
  ]);

const themes: Theme[] = [
  {
    name: "light",
    sets: [
      { set: "global", status: "enabled" },
      { set: "dark", status: "disabled" },
    ],
  },
  {
    name: "dark",
    sets: [
      { set: "global", status: "enabled" },
      { set: "dark", status: "enabled" },
    ],
  },
];

describe("formatters", () => {
  const light = resolveForExport(document(), themes[0]);

  it("css variables: math resolved, aliases flattened by default", () => {
    const css = formatCssVariables(light);
    expect(css).toContain("--spacing-md: 16px;");
    expect(css).toContain("--colors-action: #3b82f6;");
    expect(css).toContain("--shadow-card: 0px 2px 8px 0px #00000022;");
    expect(css.startsWith(":root {")).toBe(true);
  });

  it("css variables: outputReferences emits var() chains", () => {
    const css = formatCssVariables(light, { outputReferences: true });
    expect(css).toContain("--colors-action: var(--colors-blue);");
  });

  it("light-dark strategy emits only the differing variables", () => {
    const dark = resolveForExport(document(), themes[1]);
    const css = formatCssLightDark(light, dark);
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    const darkBlock = css.slice(css.indexOf("@media"));
    expect(darkBlock).toContain("--colors-blue: #60a5fa;");
    expect(darkBlock).toContain("--colors-action: #60a5fa;");
    expect(darkBlock).not.toContain("--spacing-md");
  });

  it("scss map", () => {
    const scss = formatScssMap(light);
    expect(scss).toContain('"spacing.md": 16px,');
    expect(scss.startsWith("$okey-tokens: (")).toBe(true);
  });

  it("ts consts with literal types", () => {
    const ts = formatTsConsts(light);
    expect(ts).toContain('"colors.action": "#3b82f6",');
    expect(ts).toContain("as const");
    expect(ts).toContain("export type TokenPath = keyof typeof tokens;");
  });

  it("tailwind @theme groups by type prefix", () => {
    const tailwind = formatTailwindTheme(light);
    expect(tailwind).toContain("--color-colors-blue: #3b82f6;");
    expect(tailwind).toContain("--spacing-spacing-md: 16px;");
    expect(tailwind.startsWith("@theme {")).toBe(true);
  });
});

describe("transformEntries px→rem", () => {
  const light = resolveForExport(document(), themes[0]);

  it("is a no-op unless enabled, and passing", () => {
    expect(transformEntries(light)).toEqual(light);
    expect(transformEntries(light, { pxToRem: false })).toEqual(light);
  });

  it("converts px lengths to rem at 1rem = 16px, format-agnostic", () => {
    const rem = transformEntries(light, { pxToRem: true });
    const css = formatCssVariables(rem);
    expect(css).toContain("--spacing-base: 0.25rem;"); // 4px
    expect(css).toContain("--spacing-md: 1rem;"); // 16px
    // Shadow layer: each px length converts, 0px collapses to 0, color kept.
    expect(css).toContain("--shadow-card: 0 0.125rem 0.5rem 0 #00000022;");
    // Non-dimension values are untouched.
    expect(css).toContain("--colors-blue: #3b82f6;");
  });

  it("honors a custom rem base", () => {
    const rem = transformEntries(light, { pxToRem: true, remBasePx: 8 });
    expect(formatCssVariables(rem)).toContain("--spacing-md: 2rem;"); // 16 / 8
  });

  it("does not mutate the input entries", () => {
    const before = formatCssVariables(light);
    transformEntries(light, { pxToRem: true });
    expect(formatCssVariables(light)).toBe(before);
  });
});

describe("build pipeline (Style Dictionary)", () => {
  it("builds every target from okeytokey.config.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "okey-build-"));
    await writeFile(
      join(dir, "global.json"),
      JSON.stringify({
        colors: { $type: "color", blue: { $value: "#3b82f6" } },
        spacing: { $type: "dimension", md: { $value: "16px" } },
      }),
    );
    await writeFile(
      join(dir, "dark.json"),
      JSON.stringify({ colors: { $type: "color", blue: { $value: "#60a5fa" } } }),
    );
    const config: OkeytokeyConfig = {
      sets: ["global.json", "dark.json"],
      themes,
      build: {
        outDir: "out",
        targets: [
          { format: "css", file: "tokens.css", theme: "light", darkTheme: "dark" },
          { format: "scss", file: "tokens.scss", theme: "light" },
          { format: "ts", file: "tokens.ts", theme: "light" },
          { format: "tailwind", file: "theme.css", theme: "dark" },
        ],
      },
    };
    await writeFile(join(dir, "okeytokey.config.json"), JSON.stringify(config));

    const result = await build(join(dir, "okeytokey.config.json"));
    expect(result.files).toHaveLength(4);

    const css = await readFile(join(dir, "out/tokens.css"), "utf8");
    expect(css).toContain("--colors-blue: #3b82f6;");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("--colors-blue: #60a5fa;");

    const tailwind = await readFile(join(dir, "out/theme.css"), "utf8");
    expect(tailwind).toContain("--color-colors-blue: #60a5fa;");
  });

  it("renderTarget rejects unknown themes with the known list", () => {
    const config: OkeytokeyConfig = { sets: [], themes };
    expect(() =>
      renderTarget(document(), config, { format: "css", file: "x.css", theme: "nope" }),
    ).toThrow(/Unknown theme "nope" \(known: light, dark\)/);
  });
});
