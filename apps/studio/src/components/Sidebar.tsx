import { useRef, useState } from "react";

import { parseTokenSet, serializeTokenSet, type Theme } from "@okeytokey/core";
import { Button } from "@okeytokey/ui";

import { cmdAddSet, cmdImportSet, cmdRemoveSet } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";
import { ExportDialog } from "./ExportDialog.js";
import { SyncDialog } from "./SyncDialog.js";
import { ThemeDialog } from "./dialogs.js";

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
  const themes = useDocumentStore((state) => state.themes);
  const setThemes = useDocumentStore((state) => state.setThemes);
  const execute = useDocumentStore((state) => state.execute);
  const activeSet = useUiStore((state) => state.activeSet);
  const activeTheme = useUiStore((state) => state.activeTheme);
  const setActiveSet = useUiStore((state) => state.setActiveSet);
  const setActiveTheme = useUiStore((state) => state.setActiveTheme);

  const [editingTheme, setEditingTheme] = useState<Theme>();
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importError, setImportError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const addSet = () => {
    const name = window.prompt("Set name");
    if (!name) return;
    try {
      execute(cmdAddSet(name.trim()));
      setActiveSet(name.trim());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const addTheme = () => {
    const name = window.prompt("Theme name");
    if (!name) return;
    const theme: Theme = {
      name: name.trim(),
      sets: [...tokenDocument.sets.keys()].map((set) => ({ set, status: "enabled" as const })),
    };
    setThemes([...themes, theme]);
    setEditingTheme(theme);
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
      <h1>okeytokey</h1>

      <div className="sidebar-section" data-testid="sets-section">
        <header>
          <h2>Token sets</h2>
          <Button variant="ghost" onClick={addSet} title="New set" data-testid="add-set">
            +
          </Button>
        </header>
        {[...tokenDocument.sets.values()].map((set) => (
          <div className="editor-row" key={set.name}>
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
              <span className="count">{set.tokens.size}</span>
            </button>
            <Button
              variant="ghost"
              title={`Delete set ${set.name}`}
              onClick={() => {
                if (window.confirm(`Delete set "${set.name}"?`)) {
                  execute(cmdRemoveSet(set.name));
                  if (activeSet === set.name) setActiveSet(undefined);
                }
              }}
            >
              ×
            </Button>
          </div>
        ))}
      </div>

      <div className="sidebar-section" data-testid="themes-section">
        <header>
          <h2>Themes</h2>
          <Button variant="ghost" onClick={addTheme} title="New theme" data-testid="add-theme">
            +
          </Button>
        </header>
        <button
          type="button"
          className="sidebar-item"
          aria-current={activeTheme === undefined}
          onClick={() => {
            setActiveTheme(undefined);
          }}
        >
          No theme
        </button>
        {themes.map((theme) => (
          <div className="editor-row" key={theme.name}>
            <button
              type="button"
              className="sidebar-item"
              aria-current={activeTheme === theme.name}
              data-testid={`theme-${theme.name}`}
              onClick={() => {
                setActiveTheme(theme.name);
              }}
            >
              {theme.name}
            </button>
            <Button
              variant="ghost"
              title={`Edit theme ${theme.name}`}
              data-testid={`edit-theme-${theme.name}`}
              onClick={() => {
                setEditingTheme(theme);
              }}
            >
              ⚙
            </Button>
          </div>
        ))}
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
            setExporting(true);
          }}
        >
          Export CSS/SCSS/TS…
        </Button>
        <Button
          variant="secondary"
          data-testid="open-sync"
          onClick={() => {
            setSyncing(true);
          }}
        >
          Sync with GitHub…
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

      {editingTheme && (
        <ThemeDialog
          theme={editingTheme}
          onClose={() => {
            setEditingTheme(undefined);
          }}
        />
      )}
      {exporting && (
        <ExportDialog
          onClose={() => {
            setExporting(false);
          }}
        />
      )}
      {syncing && (
        <SyncDialog
          onClose={() => {
            setSyncing(false);
          }}
        />
      )}
    </nav>
  );
}
