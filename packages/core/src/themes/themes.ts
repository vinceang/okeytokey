import { TokenResolutionError } from "../errors.js";
import type { TokenDocument } from "../parser/document.js";
import { createResolver, type Resolver } from "../resolver/resolver.js";

/**
 * Themes. A theme is an ordered list of (token set, status):
 *  - "source":   participates in resolution but its tokens are not emitted
 *  - "enabled":  participates in resolution and is emitted
 *  - "disabled": ignored entirely
 *
 * Order matters — later sets override earlier ones. Theme groups model
 * dimensions ("brand" x "mode") whose options multiply into concrete themes.
 */

export type SetStatus = "enabled" | "source" | "disabled";

export interface ThemeSetEntry {
  readonly set: string;
  readonly status: SetStatus;
}

export interface Theme {
  readonly name: string;
  /** Ordered — later entries override earlier ones during resolution. */
  readonly sets: readonly ThemeSetEntry[];
  /** Group this theme belongs to (e.g. "mode"), if any. */
  readonly group?: string;
}

/** Set names a theme uses for resolution, in override order. */
export function resolutionOrder(theme: Theme): string[] {
  return theme.sets.filter((entry) => entry.status !== "disabled").map((entry) => entry.set);
}

/** Set names whose tokens the theme emits (enabled only, not sources). */
export function emittedSets(theme: Theme): string[] {
  return theme.sets.filter((entry) => entry.status === "enabled").map((entry) => entry.set);
}

/** A resolver honoring the theme's set order and statuses. */
export function createThemeResolver(document: TokenDocument, theme: Theme): Resolver {
  return createResolver(document, { setOrder: resolutionOrder(theme) });
}

/**
 * Token paths a theme emits: everything visible in an enabled set, resolved
 * against the full resolution order (sources included).
 */
export function emittedPaths(document: TokenDocument, theme: Theme): string[] {
  const paths = new Set<string>();
  for (const name of emittedSets(theme)) {
    const set = document.sets.get(name);
    if (!set) {
      throw new TokenResolutionError(
        `Theme ${JSON.stringify(theme.name)} references unknown token set ${JSON.stringify(name)}`,
        "",
      );
    }
    for (const path of set.tokens.keys()) {
      paths.add(path);
    }
  }
  return [...paths];
}

// ---------------------------------------------------------------------------
// Theme groups and matrix expansion
// ---------------------------------------------------------------------------

export interface ThemeGroup {
  /** Dimension name, e.g. "brand" or "mode". */
  readonly name: string;
  /** The options along this dimension, e.g. light/dark. */
  readonly options: readonly Theme[];
}

export interface ThemeCombination {
  /** "brand-a / dark" — option names joined in group order. */
  readonly name: string;
  /** One option per group, in group order. */
  readonly options: readonly Theme[];
  /** Concatenated set entries: earlier groups first, later groups override. */
  readonly sets: readonly ThemeSetEntry[];
}

/**
 * Expand groups into their full cartesian matrix ("brand" x "mode" -> every
 * brand/mode pairing). Within a combination, set lists concatenate in group
 * order, so later groups override earlier ones on conflicts. A set appearing
 * in multiple options keeps the strongest status (enabled > source >
 * disabled) at its last position.
 */
export function expandThemeMatrix(groups: readonly ThemeGroup[]): ThemeCombination[] {
  if (groups.length === 0) return [];
  for (const group of groups) {
    if (group.options.length === 0) {
      throw new TokenResolutionError(
        `Theme group ${JSON.stringify(group.name)} has no options`,
        "",
      );
    }
  }

  const strength: Record<SetStatus, number> = { disabled: 0, source: 1, enabled: 2 };

  return groups.reduce<ThemeCombination[]>(
    (combinations, group) =>
      combinations.flatMap((combination) =>
        group.options.map((option) => {
          const merged: ThemeSetEntry[] = [];
          const bestStatus = new Map<string, SetStatus>();
          for (const entry of [...combination.sets, ...option.sets]) {
            const current = bestStatus.get(entry.set);
            bestStatus.set(
              entry.set,
              current !== undefined && strength[current] > strength[entry.status]
                ? current
                : entry.status,
            );
            // Keep only the last occurrence position for each set.
            const existing = merged.findIndex((candidate) => candidate.set === entry.set);
            if (existing !== -1) merged.splice(existing, 1);
            merged.push(entry);
          }
          const sets = merged.map((entry) => ({
            set: entry.set,
            status: bestStatus.get(entry.set) ?? entry.status,
          }));
          return {
            name: combination.name === "" ? option.name : `${combination.name} / ${option.name}`,
            options: [...combination.options, option],
            sets,
          };
        }),
      ),
    [{ name: "", options: [], sets: [] }],
  );
}

/** A concrete theme from a matrix combination, resolvable like any theme. */
export function themeFromCombination(combination: ThemeCombination): Theme {
  return { name: combination.name, sets: combination.sets };
}
