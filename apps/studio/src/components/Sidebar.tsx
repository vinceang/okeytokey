import { useRef, useState } from "react";

import { parseTokenSet, serializeTokenSet, type TokenSet } from "@okeytokey/core";
import type { Layer } from "@okeytokey/schema";
import { Button } from "@okeytokey/ui";

import { cmdImportSet, cmdRemoveSet, cmdRenameSet, cmdSortSet } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { readColorScheme, saveColorScheme, type ColorScheme } from "../state/color-scheme.js";
import { useUiStore } from "../state/ui-store.js";
import { RowMenu } from "./RowMenu.js";
import { Wordmark } from "./Wordmark.js";

const LAYER_ABBR: Record<Layer, string> = {
  primitive: "prim",
  semantic: "sem",
  component: "comp",
};

function getSetLayer(set: TokenSet): Layer | undefined {
  if (set.tokens.size === 0) return undefined;
  const layers = new Set([...set.tokens.values()].map((t) => t.layer));
  if (layers.size === 1) return [...layers][0];
  return undefined;
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Sidebar() {
  const tokenDocument = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const activeSet = useUiStore((state) => state.activeSet);
  const setActiveSet = useUiStore((state) => state.setActiveSet);
  const openDialog = useUiStore((state) => state.openDialog);
  const openNewSetDialog = useUiStore((state) => state.openNewSetDialog);
  const selection = useUiStore((state) => state.selection);

  const [importError, setImportError] = useState<string>();
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => readColorScheme());
  const fileInput = useRef<HTMLInputElement>(null);

  const addSet = () => {
    openNewSetDialog();
  };

  const importFile = (file: File) => {
    void file.text().then((text) => {
      try {
        const name = file.name.replace(/\.json$/i, "");
        execute(cmdImportSet(parseTokenSet(name, text)));
        setActiveSet(name);
        setImportError(undefined);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : String(error));
      }
    });
  };

  return (
    <nav className="studio-sidebar">
      <h1 className="sidebar-logo" aria-label="okeytokey">
        <Wordmark />
      </h1>

      <div className="sidebar-section" data-testid="sets-section">
        <header>
          <h2>Token sets</h2>
          <Button variant="ghost" onClick={addSet} title="New set" data-testid="add-set">
            +
          </Button>
        </header>
        {[...tokenDocument.sets.values()].map((set) => {
          const setLayer = getSetLayer(set);
          return (
            <div className="sidebar-row" key={set.name}>
              <button
                type="button"
                className="sidebar-item"
                aria-current={activeSet === set.name}
                data-testid={`set-${set.name}`}
                onClick={() => {
                  setActiveSet(set.name);
                }}
              >
                {set.name}
                {setLayer !== undefined && (
                  <span className={`layer-badge layer-badge--${setLayer}`} title={setLayer}>
                    {LAYER_ABBR[setLayer]}
                  </span>
                )}
                <span className="count">{set.tokens.size}</span>
              </button>
              <RowMenu label={`Actions for set ${set.name}`} testId={`set-menu-${set.name}`}>
                {(close) => (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="row-menu-item"
                      data-testid={`set-rename-${set.name}`}
                      onClick={() => {
                        close();
                        const next = window.prompt(`Rename set "${set.name}"`, set.name)?.trim();
                        if (!next || next === set.name) return;
                        try {
                          execute(cmdRenameSet(set.name, next));
                          if (activeSet === set.name) setActiveSet(next);
                        } catch (error) {
                          window.alert(error instanceof Error ? error.message : String(error));
                        }
                      }}
                    >
                      Rename…
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="row-menu-item"
                      data-testid={`set-sort-${set.name}`}
                      onClick={() => {
                        close();
                        execute(cmdSortSet(set.name));
                      }}
                    >
                      Sort A→Z
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="row-menu-item"
                      data-testid={`set-export-${set.name}`}
                      onClick={() => {
                        close();
                        download(`${set.name}.json`, serializeTokenSet(set));
                      }}
                    >
                      Export JSON
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="row-menu-item row-menu-item--danger"
                      data-testid={`set-delete-${set.name}`}
                      onClick={() => {
                        close();
                        if (
                          window.confirm(
                            `Delete set "${set.name}" and its ${String(set.tokens.size)} token(s)? You can undo this.`,
                          )
                        ) {
                          execute(cmdRemoveSet(set.name));
                          if (activeSet === set.name) setActiveSet(undefined);
                        }
                      }}
                    >
                      Delete set…
                    </button>
                  </>
                )}
              </RowMenu>
            </div>
          );
        })}
      </div>

      <div className="sidebar-section">
        <header>
          <h2>File</h2>
        </header>
        <Button
          variant="secondary"
          data-testid="export-set"
          disabled={activeSet === undefined}
          onClick={() => {
            const set = activeSet ? tokenDocument.sets.get(activeSet) : undefined;
            if (set) download(`${set.name}.json`, serializeTokenSet(set));
          }}
        >
          Export active set
        </Button>
        <Button
          variant="secondary"
          data-testid="import-set"
          onClick={() => fileInput.current?.click()}
        >
          Import DTCG JSON…
        </Button>
        <Button
          variant="secondary"
          data-testid="open-export"
          onClick={() => {
            openDialog("export");
          }}
        >
          Export CSS/SCSS/TS…
        </Button>
        <Button
          variant="secondary"
          data-testid="open-sync"
          onClick={() => {
            openDialog("sync");
          }}
        >
          Sync with GitHub…
        </Button>
        <Button
          variant="secondary"
          data-testid="open-ai-settings"
          onClick={() => {
            openDialog("ai");
          }}
        >
          AI provider…
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importFile(file);
            event.target.value = "";
          }}
        />
        {importError !== undefined && <p className="editor-error">{importError}</p>}
      </div>

      <div className="sidebar-section">
        <header>
          <h2>Help</h2>
        </header>
        <a
          className="sidebar-item"
          href="/guide.html"
          target="_blank"
          rel="noreferrer"
          data-testid="open-guide"
        >
          User guide ↗
        </a>
      </div>

      <div className="sidebar-footer">
        {selection === undefined && (
          <p className="sidebar-hint">
            <strong>Note:</strong> Select a token to inspect and edit it. Press ⌘K for the command
            palette.
          </p>
        )}

        <div className="sidebar-appearance">
          <span className="sidebar-appearance-icon" aria-hidden="true">
            {colorScheme === "dark" ? "☾" : "☼"}
          </span>
          <span>Dark mode</span>
          <button
            type="button"
            role="switch"
            className="theme-switch"
            aria-checked={colorScheme === "dark"}
            aria-label="Dark mode"
            data-testid="dark-mode-toggle"
            onClick={() => {
              const next = colorScheme === "dark" ? "light" : "dark";
              setColorScheme(next);
              saveColorScheme(next);
            }}
          >
            <span className="theme-switch-thumb" />
          </button>
        </div>
      </div>
    </nav>
  );
}
