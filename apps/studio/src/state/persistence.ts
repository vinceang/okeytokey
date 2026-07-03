import Dexie, { type EntityTable } from "dexie";

import {
  createTokenDocument,
  parseTokenSet,
  serializeTokenSet,
  type TokenDocument,
  type Theme,
} from "@okeytokey/core";

import { useDocumentStore } from "./document-store.js";
import { starterDocument } from "./starter.js";

/**
 * Local-first persistence: the working copy lives in IndexedDB and survives
 * reloads. Sets are stored as serialized DTCG JSON text (the lossless
 * representation); themes as plain JSON.
 */

interface SetRow {
  name: string;
  order: number;
  json: string;
}

interface ThemeRow {
  name: string;
  order: number;
  json: string;
}

class StudioDb extends Dexie {
  declare tokenSets: EntityTable<SetRow, "name">;
  declare themes: EntityTable<ThemeRow, "name">;

  constructor(name = "okeytokey-studio") {
    super(name);
    this.version(1).stores({ tokenSets: "name, order", themes: "name, order" });
  }
}

export interface PersistedState {
  document: TokenDocument;
  themes: Theme[];
}

export interface StudioStorage {
  load(): Promise<PersistedState>;
  save(state: PersistedState): Promise<void>;
  clear(): Promise<void>;
}

export function createStorage(dbName?: string): StudioStorage {
  const db = new StudioDb(dbName);

  return {
    async load(): Promise<PersistedState> {
      const [setRows, themeRows] = await Promise.all([
        db.tokenSets.orderBy("order").toArray(),
        db.themes.orderBy("order").toArray(),
      ]);
      const sets = setRows.map((row) => parseTokenSet(row.name, row.json));
      const themes = themeRows.map((row) => JSON.parse(row.json) as Theme);
      return { document: createTokenDocument(sets), themes };
    },

    async save(state: PersistedState): Promise<void> {
      const setRows: SetRow[] = [...state.document.sets.values()].map((set, order) => ({
        name: set.name,
        order,
        json: serializeTokenSet(set),
      }));
      const themeRows: ThemeRow[] = state.themes.map((theme, order) => ({
        name: theme.name,
        order,
        json: JSON.stringify(theme),
      }));
      await db.transaction("rw", db.tokenSets, db.themes, async () => {
        await db.tokenSets.clear();
        await db.tokenSets.bulkPut(setRows);
        await db.themes.clear();
        await db.themes.bulkPut(themeRows);
      });
    },

    async clear(): Promise<void> {
      await db.transaction("rw", db.tokenSets, db.themes, async () => {
        await db.tokenSets.clear();
        await db.themes.clear();
      });
    },
  };
}

/**
 * Wire a storage to the document store: hydrate once, then autosave
 * (debounced) on every revision. Returns an unsubscribe function.
 */
export async function initPersistence(
  storage: StudioStorage,
  debounceMs = 400,
): Promise<() => void> {
  const store = useDocumentStore;

  let persisted: PersistedState;
  try {
    persisted = await storage.load();
  } catch {
    persisted = { document: createTokenDocument([]), themes: [] };
  }
  if (
    persisted.document.sets.size === 0 &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("okeytokey.onboarded") !== null
  ) {
    // Returning user with an empty database (cleared, or finished onboarding
    // without content) — seed the starter so the app is never a dead end.
    persisted = starterDocument();
  }
  store.getState().hydrate(persisted.document, persisted.themes);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved = store.getState().revision;
  const unsubscribe = store.subscribe((state) => {
    if (!state.hydrated || state.revision === lastSaved) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      lastSaved = state.revision;
      void storage.save({ document: state.document, themes: state.themes });
    }, debounceMs);
  });

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
