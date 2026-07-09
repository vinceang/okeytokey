import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet } from "@okeytokey/core";

import {
  cmdAddSet,
  cmdCreateToken,
  cmdDeleteToken,
  cmdImportSet,
  cmdRemoveSet,
  cmdRenameSet,
  cmdSetTokenValue,
} from "./commands.js";
import { HISTORY_LIMIT, useDocumentStore } from "./document-store.js";
import { createStorage, initPersistence } from "./persistence.js";

const baseDocument = () =>
  createTokenDocument([
    parseTokenSet(
      "global",
      `{
  "colors": {
    "$type": "color",
    "a": { "$value": "#aaaaaa" },
    "b": { "$value": "#bbbbbb" },
    "c": { "$value": "#cccccc" }
  }
}`,
    ),
  ]);

function freshStore() {
  useDocumentStore.getState().hydrate(baseDocument(), []);
  return useDocumentStore;
}

beforeEach(() => {
  freshStore();
});

const tokenValue = (path: string, setName = "global") =>
  useDocumentStore.getState().document.sets.get(setName)?.tokens.get(path)?.value;

describe("commands + undo/redo", () => {
  it("executes, undoes, and redoes a value edit", () => {
    const store = useDocumentStore.getState();
    store.execute(cmdSetTokenValue("global", "colors.a", "#111111"));
    expect(tokenValue("colors.a")).toBe("#111111");

    expect(useDocumentStore.getState().undo()).toBe("Edit colors.a");
    expect(tokenValue("colors.a")).toBe("#aaaaaa");

    expect(useDocumentStore.getState().redo()).toBe("Edit colors.a");
    expect(tokenValue("colors.a")).toBe("#111111");
  });

  it("undoing a delete restores the token in its original key position", () => {
    useDocumentStore.getState().execute(cmdDeleteToken("global", "colors.b"));
    expect(tokenValue("colors.b")).toBeUndefined();
    useDocumentStore.getState().undo();
    const paths = [
      ...(useDocumentStore.getState().document.sets.get("global")?.tokens.keys() ?? []),
    ];
    expect(paths).toEqual(["colors.a", "colors.b", "colors.c"]);
  });

  it("new edits clear the redo stack", () => {
    const store = useDocumentStore.getState();
    store.execute(cmdSetTokenValue("global", "colors.a", "#111111"));
    useDocumentStore.getState().undo();
    useDocumentStore.getState().execute(cmdSetTokenValue("global", "colors.a", "#222222"));
    expect(useDocumentStore.getState().future).toHaveLength(0);
    expect(useDocumentStore.getState().redo()).toBeUndefined();
  });

  it("caps history at HISTORY_LIMIT", () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      useDocumentStore
        .getState()
        .execute(cmdSetTokenValue("global", "colors.a", `#${String(i).padStart(6, "0")}`));
    }
    expect(useDocumentStore.getState().past).toHaveLength(HISTORY_LIMIT);
    let undone = 0;
    while (useDocumentStore.getState().undo() !== undefined) undone++;
    expect(undone).toBe(HISTORY_LIMIT);
  });

  it("set lifecycle commands round-trip through undo", () => {
    useDocumentStore.getState().execute(cmdAddSet("dark"));
    useDocumentStore.getState().execute(cmdRenameSet("dark", "midnight"));
    useDocumentStore
      .getState()
      .execute(cmdCreateToken("midnight", "x", { type: "number", value: 1 }));
    useDocumentStore.getState().execute(cmdRemoveSet("midnight"));
    expect(useDocumentStore.getState().document.sets.has("midnight")).toBe(false);

    useDocumentStore.getState().undo(); // un-remove
    expect(tokenValue("x", "midnight")).toBe(1);
    useDocumentStore.getState().undo(); // un-create token
    useDocumentStore.getState().undo(); // un-rename
    expect(useDocumentStore.getState().document.sets.has("dark")).toBe(true);
    useDocumentStore.getState().undo(); // un-add
    expect([...useDocumentStore.getState().document.sets.keys()]).toEqual(["global"]);
  });

  it("import replaces an existing set and undo restores it", () => {
    const replacement = parseTokenSet(
      "global",
      '{ "colors": { "$type": "color", "z": { "$value": "#zzz000" } } }'.replace("zzz", "eee"),
    );
    useDocumentStore.getState().execute(cmdImportSet(replacement));
    expect(tokenValue("colors.z")).toBe("#eee000");
    useDocumentStore.getState().undo();
    expect(tokenValue("colors.a")).toBe("#aaaaaa");
  });
});

describe("persistence", () => {
  it("saves and reloads document + themes through IndexedDB", async () => {
    const storage = createStorage(`test-${String(Date.now())}`);
    const themes = [{ name: "dark", sets: [{ set: "global", status: "enabled" as const }] }];
    await storage.save({ document: baseDocument(), themes });
    const loaded = await storage.load();
    expect([...loaded.document.sets.keys()]).toEqual(["global"]);
    expect(loaded.document.sets.get("global")?.tokens.get("colors.a")?.value).toBe("#aaaaaa");
    expect(loaded.themes).toEqual(themes);
  });

  it("initPersistence hydrates the starter on an empty database and autosaves edits", async () => {
    const dbName = `test-init-${String(Date.now())}`;
    const storage = createStorage(dbName);
    useDocumentStore.setState({ hydrated: false });
    // Starter seeding only happens for onboarded users (first run shows the
    // wizard instead); simulate a returning user.
    const store = new Map<string, string>([["okeytokey.onboarded", "1"]]);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    };

    // Real timers: fake timers stall IndexedDB's internal promises.
    const stop = await initPersistence(storage, "okeytokey.onboarded", 10);
    const state = useDocumentStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.document.sets.size).toBeGreaterThan(0); // starter content

    useDocumentStore.getState().execute(cmdAddSet("scratch"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    stop();

    const reloaded = await storage.load();
    expect(reloaded.document.sets.has("scratch")).toBe(true);
  });
});
