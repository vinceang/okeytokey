import { create } from "zustand";

import { createTokenDocument, type TokenDocument } from "@okeytokey/core";
import type { Theme } from "@okeytokey/core";

import type { Command } from "./commands.js";

/**
 * The document store: the immutable TokenDocument, the undo/redo history
 * (command pattern, 100 steps), and the app-level theme list. Themes are
 * outside undo history — they're configuration, not content.
 */

export const HISTORY_LIMIT = 100;

interface HistoryEntry {
  readonly label: string;
  /** Command that undoes the change (captured inverse). */
  readonly undo: Command;
  /** Command that re-applies the change. */
  readonly redo: Command;
}

export interface DocumentState {
  document: TokenDocument;
  themes: Theme[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Monotonic counter — persistence subscribes to this to debounce saves. */
  revision: number;
  hydrated: boolean;

  execute: (command: Command) => void;
  undo: () => string | undefined;
  redo: () => string | undefined;
  setThemes: (themes: Theme[]) => void;
  /** Replace everything (initial load / import-all). Clears history. */
  hydrate: (document: TokenDocument, themes: Theme[]) => void;
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  document: createTokenDocument([]),
  themes: [],
  past: [],
  future: [],
  revision: 0,
  hydrated: false,

  execute(command) {
    const { document, past, revision } = get();
    const { document: next, inverse } = command.run(document);
    const entry: HistoryEntry = { label: command.label, undo: inverse, redo: command };
    set({
      document: next,
      past: [...past.slice(-(HISTORY_LIMIT - 1)), entry],
      future: [],
      revision: revision + 1,
    });
  },

  undo() {
    const { document, past, future, revision } = get();
    const entry = past[past.length - 1];
    if (!entry) return undefined;
    const { document: next, inverse } = entry.undo.run(document);
    set({
      document: next,
      past: past.slice(0, -1),
      // The captured inverse re-applies the change with current context.
      future: [{ ...entry, redo: inverse }, ...future],
      revision: revision + 1,
    });
    return entry.label;
  },

  redo() {
    const { document, past, future, revision } = get();
    const entry = future[0];
    if (!entry) return undefined;
    const { document: next, inverse } = entry.redo.run(document);
    set({
      document: next,
      past: [...past, { ...entry, undo: inverse }],
      future: future.slice(1),
      revision: revision + 1,
    });
    return entry.label;
  },

  setThemes(themes) {
    set({ themes, revision: get().revision + 1 });
  },

  hydrate(document, themes) {
    set({ document, themes, past: [], future: [], hydrated: true, revision: get().revision + 1 });
  },
}));
