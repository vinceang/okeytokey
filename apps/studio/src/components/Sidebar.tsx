import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  expandThemeMatrix,
  parseTokenSet,
  serializeTokenSet,
  themeFromCombination,
  type Theme,
  type ThemeGroup,
} from "@okeytokey/core";
import { Button } from "@okeytokey/ui";

import { cmdAddSet, cmdImportSet, cmdRemoveSet, cmdRenameSet } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";
import { ThemeDialog } from "./dialogs.js";

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * A kebab (⋮) menu for a sidebar row. Destructive and out-of-the-way actions
 * live here rather than as bare inline buttons, so a single misclick can't
 * wipe a token set. Children receive `close` to dismiss the menu after acting.
 */
function RowMenu({
  label,
  testId,
  children,
}: {
  label: string;
  testId?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="row-menu">
      <Button
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        data-testid={testId}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        ⋮
      </Button>
      {open && (
        <>
          <div className="row-menu-backdrop" onClick={close} />
          <div className="row-menu-popover" role="menu">
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
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
  const openDialog = useUiStore((state) => state.openDialog);

  const [editingTheme, setEditingTheme] = useState<Theme>();
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

  // Cartesian expansion (see ADR 0005): themes sharing a `group` form a
  // dimension; two or more dimensions can generate their combinations.
  const groupedThemes = new Map<string, Theme[]>();
  for (const theme of themes) {
    if (theme.group === undefined) continue;
    groupedThemes.set(theme.group, [...(groupedThemes.get(theme.group) ?? []), theme]);
  }
  const canExpandMatrix = groupedThemes.size >= 2;

  const expandMatrix = () => {
    const dimensions: ThemeGroup[] = [...groupedThemes.entries()].map(([name, options]) => ({
      name,
      options,
    }));
    const combinations = expandThemeMatrix(dimensions).map(themeFromCombination);
    const existing = new Set(themes.map((theme) => theme.name));
    const fresh = combinations.filter((combination) => !existing.has(combination.name));
    if (fresh.length === 0) {
      window.alert("All combinations already exist.");
      return;
    }
    setThemes([...themes, ...fresh]);
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
        ))}
      </div>

      <div className="sidebar-section" data-testid="themes-section">
        <header>
          <h2>Themes</h2>
          <span>
            {canExpandMatrix && (
              <Button
                variant="ghost"
                onClick={expandMatrix}
                title="Generate every combination across theme groups (brand × mode)"
                data-testid="expand-matrix"
              >
                ⊞
              </Button>
            )}
            <Button variant="ghost" onClick={addTheme} title="New theme" data-testid="add-theme">
              +
            </Button>
          </span>
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
          <div className="sidebar-row" key={theme.name}>
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
              {theme.group !== undefined && <span className="count">{theme.group}</span>}
            </button>
            <RowMenu label={`Actions for theme ${theme.name}`} testId={`theme-menu-${theme.name}`}>
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="row-menu-item"
                    data-testid={`edit-theme-${theme.name}`}
                    onClick={() => {
                      close();
                      setEditingTheme(theme);
                    }}
                  >
                    Edit sets…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="row-menu-item row-menu-item--danger"
                    data-testid={`delete-theme-${theme.name}`}
                    onClick={() => {
                      close();
                      if (
                        window.confirm(`Delete theme "${theme.name}"? Your tokens are untouched.`)
                      ) {
                        setThemes(themes.filter((candidate) => candidate.name !== theme.name));
                        if (activeTheme === theme.name) setActiveTheme(undefined);
                      }
                    }}
                  >
                    Delete theme…
                  </button>
                </>
              )}
            </RowMenu>
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

      {editingTheme && (
        <ThemeDialog
          theme={editingTheme}
          onClose={() => {
            setEditingTheme(undefined);
          }}
        />
      )}
    </nav>
  );
}
