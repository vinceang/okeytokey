import { create } from "zustand";

/** Ephemeral editor UI state. Never persisted, never in undo history. */

export interface TokenSelection {
  readonly set: string;
  readonly path: string;
}

export type StudioDialog =
  "export" | "sync" | "new-token" | "scale" | "dimension-scale" | "ai" | "ai-generate";

/**
 * When the New Token dialog is opened from a group's ⋮ menu, the parent path
 * is fixed and shown read-only — the user only types the new leaf. `intent`
 * just tweaks the copy (a subgroup nudges toward a nested `group.leaf`).
 */
export interface NewTokenContext {
  readonly parentPath: string;
  readonly intent: "token" | "subgroup";
}

export interface UiState {
  activeSet: string | undefined;
  /** Active theme name, or undefined = plain document order. */
  activeTheme: string | undefined;
  selection: TokenSelection | undefined;
  filter: string;
  /** Collapsed group paths within the active set. */
  collapsed: ReadonlySet<string>;
  dialog: StudioDialog | undefined;
  /** Set only while the New Token dialog is opened against a specific group. */
  newTokenContext: NewTokenContext | undefined;

  setActiveSet: (name: string | undefined) => void;
  setActiveTheme: (name: string | undefined) => void;
  select: (selection: TokenSelection | undefined) => void;
  setFilter: (filter: string) => void;
  toggleCollapsed: (groupPath: string) => void;
  openDialog: (dialog: StudioDialog | undefined) => void;
  /** Open the New Token dialog scoped to a group (read-only parent prefix). */
  openNewTokenAt: (parentPath: string, intent: "token" | "subgroup") => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  activeSet: undefined,
  activeTheme: undefined,
  selection: undefined,
  filter: "",
  collapsed: new Set<string>(),
  dialog: undefined,
  newTokenContext: undefined,

  setActiveSet(name) {
    set({ activeSet: name, selection: undefined, collapsed: new Set() });
  },
  setActiveTheme(name) {
    set({ activeTheme: name });
  },
  select(selection) {
    set({ selection });
  },
  setFilter(filter) {
    set({ filter });
  },
  toggleCollapsed(groupPath) {
    const collapsed = new Set(get().collapsed);
    if (collapsed.has(groupPath)) collapsed.delete(groupPath);
    else collapsed.add(groupPath);
    set({ collapsed });
  },
  openDialog(dialog) {
    // Opening any dialog through the generic path clears the group scope, so a
    // global "New token" gets the full free-form path field.
    set({ dialog, newTokenContext: undefined });
  },
  openNewTokenAt(parentPath, intent) {
    set({ dialog: "new-token", newTokenContext: { parentPath, intent } });
  },
}));
