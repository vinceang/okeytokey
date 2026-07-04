import { create } from "zustand";

/** Ephemeral editor UI state. Never persisted, never in undo history. */

export interface TokenSelection {
  readonly set: string;
  readonly path: string;
}

export type StudioDialog =
  "export" | "sync" | "new-token" | "scale" | "dimension-scale" | "ai" | "ai-generate";

export interface UiState {
  activeSet: string | undefined;
  /** Active theme name, or undefined = plain document order. */
  activeTheme: string | undefined;
  selection: TokenSelection | undefined;
  filter: string;
  /** Collapsed group paths within the active set. */
  collapsed: ReadonlySet<string>;
  dialog: StudioDialog | undefined;

  setActiveSet: (name: string | undefined) => void;
  setActiveTheme: (name: string | undefined) => void;
  select: (selection: TokenSelection | undefined) => void;
  setFilter: (filter: string) => void;
  toggleCollapsed: (groupPath: string) => void;
  openDialog: (dialog: StudioDialog | undefined) => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  activeSet: undefined,
  activeTheme: undefined,
  selection: undefined,
  filter: "",
  collapsed: new Set<string>(),
  dialog: undefined,

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
    set({ dialog });
  },
}));
