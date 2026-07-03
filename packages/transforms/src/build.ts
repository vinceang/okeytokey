import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import StyleDictionary from "style-dictionary";

import {
  createTokenDocument,
  parseTokenSet,
  toPlainJson,
  type Theme,
  type TokenDocument,
} from "@okeytokey/core";

import {
  formatCssLightDark,
  formatTokens,
  resolveForExport,
  type FormatId,
  type FormatOptions,
} from "./formats.js";

/**
 * The build pipeline: okeytokey.config.json -> output files. Node-only.
 *
 * Wraps Style Dictionary v4: okeytokey resolves tokens (cross-set themes,
 * math, color functions — semantics SD doesn't know), then our formatters
 * are registered as SD custom formats and SD handles the platform/file
 * mechanics. Theme-aware: a target may name a theme, or use the light-dark
 * strategy with two themes.
 */

export interface BuildTarget {
  readonly format: FormatId;
  readonly file: string;
  readonly theme?: string;
  /** css only: emit a prefers-color-scheme block from this second theme. */
  readonly darkTheme?: string;
  readonly options?: FormatOptions;
}

export interface OkeytokeyConfig {
  /** Paths to DTCG set files; set name = file basename without .json. */
  readonly sets: readonly string[];
  readonly themes?: readonly Theme[];
  readonly build?: {
    readonly outDir?: string;
    readonly targets: readonly BuildTarget[];
  };
  readonly lint?: Record<string, unknown>;
}

export async function loadConfig(configPath: string): Promise<OkeytokeyConfig> {
  const text = await readFile(configPath, "utf8");
  return JSON.parse(text) as OkeytokeyConfig;
}

export async function loadDocument(
  config: OkeytokeyConfig,
  baseDir: string,
): Promise<TokenDocument> {
  const sets = await Promise.all(
    config.sets.map(async (setPath) => {
      const text = await readFile(resolve(baseDir, setPath), "utf8");
      return parseTokenSet(basename(setPath, ".json"), text);
    }),
  );
  return createTokenDocument(sets);
}

function themeByName(config: OkeytokeyConfig, name: string | undefined): Theme | undefined {
  if (name === undefined) return undefined;
  const theme = config.themes?.find((candidate) => candidate.name === name);
  if (!theme) {
    throw new Error(
      `Unknown theme ${JSON.stringify(name)} (known: ${(config.themes ?? [])
        .map((candidate) => candidate.name)
        .join(", ")})`,
    );
  }
  return theme;
}

/** Render one target to text (shared by the SD pipeline and tests). */
export function renderTarget(
  document: TokenDocument,
  config: OkeytokeyConfig,
  target: BuildTarget,
): string {
  const entries = resolveForExport(document, themeByName(config, target.theme));
  if (target.format === "css" && target.darkTheme !== undefined) {
    const dark = resolveForExport(document, themeByName(config, target.darkTheme));
    return formatCssLightDark(entries, dark, target.options);
  }
  return formatTokens(target.format, entries, target.options);
}

export interface BuildResult {
  readonly files: readonly { path: string; bytes: number }[];
}

/**
 * Build every target through Style Dictionary. Each target becomes an SD
 * platform with a registered custom format that delegates to our renderers.
 */
export async function build(configPath: string): Promise<BuildResult> {
  const baseDir = dirname(resolve(configPath));
  const config = await loadConfig(configPath);
  const document = await loadDocument(config, baseDir);
  const targets = config.build?.targets ?? [];
  const outDir = resolve(baseDir, config.build?.outDir ?? "dist/tokens");

  // SD's token input: the raw merged tree (for its metadata plumbing); the
  // actual rendering uses okeytokey resolution via renderTarget.
  const mergedTokens: Record<string, unknown> = {};
  for (const set of document.sets.values()) {
    Object.assign(mergedTokens, toPlainJson(set.root));
  }

  const platforms: Record<string, unknown> = {};
  targets.forEach((target, index) => {
    const formatName = `okeytokey/${target.format}/${String(index)}`;
    StyleDictionary.registerFormat({
      name: formatName,
      format: () => renderTarget(document, config, target),
    });
    platforms[`target-${String(index)}`] = {
      buildPath: `${outDir}/`,
      files: [{ destination: target.file, format: formatName }],
    };
  });

  const dictionary = new StyleDictionary({
    tokens: mergedTokens as never,
    usesDtcg: true,
    log: { verbosity: "silent" },
    platforms: platforms as never,
  });
  await mkdir(outDir, { recursive: true });
  await dictionary.buildAllPlatforms();

  const files = await Promise.all(
    targets.map(async (target) => {
      const path = join(outDir, target.file);
      const content = await readFile(path, "utf8");
      return { path, bytes: content.length };
    }),
  );
  return { files };
}

/** Direct write path used as a fallback and by tests that bypass SD. */
export async function renderAll(configPath: string): Promise<{ path: string; content: string }[]> {
  const baseDir = dirname(resolve(configPath));
  const config = await loadConfig(configPath);
  const document = await loadDocument(config, baseDir);
  const outDir = resolve(baseDir, config.build?.outDir ?? "dist/tokens");
  const outputs = (config.build?.targets ?? []).map((target) => ({
    path: join(outDir, target.file),
    content: renderTarget(document, config, target),
  }));
  await mkdir(outDir, { recursive: true });
  await Promise.all(outputs.map((output) => writeFile(output.path, output.content)));
  return outputs;
}
