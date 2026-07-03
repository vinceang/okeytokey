import {
  createThemeResolver,
  emittedPaths,
  serializeOrderedJson,
  fromPlainJson,
  type Theme,
  type TokenDocument,
} from "@okeytokey/core";

import { cssToFigmaColor, dimensionToPx, type FigmaRGBA } from "./apply.js";
import type { MappingReport } from "./protocol.js";

/**
 * Figma Variables mapping, both directions. Pure planning — the main thread
 * executes plans against the Variables API.
 *
 * Export: collections = theme groups, modes = themes. Token paths map to
 * variable names with "/" separators (Figma's grouping convention).
 */

export type VariableValue =
  | { readonly kind: "color"; readonly color: FigmaRGBA }
  | { readonly kind: "float"; readonly value: number }
  | { readonly kind: "string"; readonly value: string };

export interface VariablePlanEntry {
  /** Figma variable name, e.g. "colors/blue/500". */
  readonly name: string;
  readonly resolvedType: "COLOR" | "FLOAT" | "STRING";
  /** Value per mode (theme name). Missing = alias unresolvable in that mode. */
  readonly valuesByMode: Readonly<Record<string, VariableValue>>;
}

export interface VariableExportPlan {
  readonly collection: string;
  /** Mode names in order (theme names). */
  readonly modes: readonly string[];
  readonly variables: readonly VariablePlanEntry[];
  readonly report: MappingReport;
}

function toVariableValue(tokenType: string, value: unknown): VariableValue | undefined {
  if (tokenType === "color" && typeof value === "string") {
    const color = cssToFigmaColor(value);
    return color ? { kind: "color", color } : undefined;
  }
  if (tokenType === "number" && typeof value === "number") {
    return { kind: "float", value };
  }
  if (tokenType === "dimension") {
    const px = dimensionToPx(value);
    return px === undefined ? undefined : { kind: "float", value: px };
  }
  if (tokenType === "fontFamily") {
    const family: unknown = Array.isArray(value) ? value[0] : value;
    return typeof family === "string" ? { kind: "string", value: family } : undefined;
  }
  return undefined;
}

const RESOLVED_TYPE: Record<VariableValue["kind"], VariablePlanEntry["resolvedType"]> = {
  color: "COLOR",
  float: "FLOAT",
  string: "STRING",
};

/**
 * Plan a variables export for a group of themes (all sharing one collection).
 * Composite types (typography, shadow…) have no Figma Variable equivalent
 * and land in the skip report.
 */
export function planVariableExport(
  document: TokenDocument,
  themes: readonly Theme[],
  collectionName?: string,
): VariableExportPlan {
  const collection = collectionName ?? themes[0]?.group ?? "okeytokey";
  const modes = themes.map((theme) => theme.name);
  const skipped: { name: string; reason: string }[] = [];

  // Union of emitted paths across themes, with per-theme resolved values.
  const entries = new Map<string, { type: string; valuesByMode: Record<string, VariableValue> }>();
  for (const theme of themes) {
    const resolver = createThemeResolver(document, theme);
    for (const path of emittedPaths(document, theme)) {
      let resolved;
      try {
        resolved = resolver.resolve(path);
      } catch {
        skipped.push({ name: path, reason: `does not resolve in theme "${theme.name}"` });
        continue;
      }
      const variableValue = toVariableValue(resolved.token.type, resolved.value);
      if (!variableValue) {
        if (!entries.has(path)) {
          skipped.push({
            name: path,
            reason: `type "${resolved.token.type}" has no Figma Variable equivalent`,
          });
        }
        continue;
      }
      const entry = entries.get(path) ?? { type: resolved.token.type, valuesByMode: {} };
      entry.valuesByMode[theme.name] = variableValue;
      entries.set(path, entry);
    }
  }

  const variables: VariablePlanEntry[] = [...entries.entries()]
    .map(([path, entry]) => {
      const first = Object.values(entry.valuesByMode)[0];
      return {
        name: path.replaceAll(".", "/"),
        resolvedType: first ? RESOLVED_TYPE[first.kind] : ("STRING" as const),
        valuesByMode: entry.valuesByMode,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const uniqueSkipped = skipped.filter(
    (entry, index) => skipped.findIndex((candidate) => candidate.name === entry.name) === index,
  );

  return {
    collection,
    modes,
    variables,
    report: { mapped: variables.length, skipped: uniqueSkipped },
  };
}

// ---------------------------------------------------------------------------
// Import: Figma Variables -> DTCG sets
// ---------------------------------------------------------------------------

/** A serializable dump of a Figma variable collection (main thread produces it). */
export interface VariableDump {
  readonly collection: string;
  readonly modes: readonly string[];
  readonly variables: readonly {
    readonly name: string;
    readonly resolvedType: string;
    /** mode name -> raw value ({r,g,b,a} for colors, number, string, boolean). */
    readonly valuesByMode: Readonly<Record<string, unknown>>;
  }[];
}

function figmaColorToHex(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("r" in value)) return undefined;
  const { r, g, b, a } = value as { r: number; g: number; b: number; a?: number };
  const hex = (channel: number) =>
    Math.round(Math.min(1, Math.max(0, channel)) * 255)
      .toString(16)
      .padStart(2, "0");
  const alpha = a ?? 1;
  return `#${hex(r)}${hex(g)}${hex(b)}${alpha < 1 ? hex(alpha) : ""}`;
}

export interface VariableImportResult {
  /** One DTCG file per mode: "<collection>.<mode>". */
  readonly files: readonly { name: string; json: string }[];
  readonly report: MappingReport;
}

/**
 * Map a Figma variable dump into DTCG token set files, one per mode, with a
 * mapping report for anything that couldn't be represented.
 */
export function importVariables(dump: VariableDump): VariableImportResult {
  const skipped: { name: string; reason: string }[] = [];
  const perMode = new Map<string, Record<string, unknown>>();
  for (const mode of dump.modes) {
    perMode.set(mode, {});
  }

  for (const variable of dump.variables) {
    const segments = variable.name.split("/").filter((segment) => segment.length > 0);
    const leaf = segments[segments.length - 1];
    if (leaf === undefined) {
      skipped.push({ name: variable.name, reason: "empty variable name" });
      continue;
    }
    for (const mode of dump.modes) {
      const raw = variable.valuesByMode[mode];
      if (raw === undefined) continue;

      let token: { $type: string; $value: unknown } | undefined;
      if (variable.resolvedType === "COLOR") {
        const hex = figmaColorToHex(raw);
        token = hex === undefined ? undefined : { $type: "color", $value: hex };
      } else if (variable.resolvedType === "FLOAT" && typeof raw === "number") {
        token = { $type: "number", $value: raw };
      } else if (variable.resolvedType === "STRING" && typeof raw === "string") {
        token = { $type: "fontFamily", $value: raw };
      }
      if (!token) {
        skipped.push({
          name: variable.name,
          reason: `unsupported resolvedType "${variable.resolvedType}" in mode "${mode}"`,
        });
        continue;
      }

      const root = perMode.get(mode);
      if (!root) continue;
      let cursor: Record<string, unknown> = root;
      for (const segment of segments.slice(0, -1)) {
        const child = cursor[segment];
        if (typeof child === "object" && child !== null) {
          cursor = child as Record<string, unknown>;
        } else {
          const group: Record<string, unknown> = {};
          cursor[segment] = group;
          cursor = group;
        }
      }
      cursor[leaf] = token;
    }
  }

  const files = [...perMode.entries()].map(([mode, tree]) => ({
    name: `${dump.collection}.${mode}`,
    json: serializeOrderedJson(fromPlainJson(tree)),
  }));

  const uniqueSkipped = skipped.filter(
    (entry, index) => skipped.findIndex((candidate) => candidate.name === entry.name) === index,
  );
  const mapped = dump.variables.length - uniqueSkipped.length;

  return { files, report: { mapped, skipped: uniqueSkipped } };
}
