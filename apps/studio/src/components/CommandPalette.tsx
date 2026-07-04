import { useEffect, useState } from "react";
import { Command } from "cmdk";

import type { Resolver } from "@okeytokey/core";

import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";

export interface PaletteActions {
  newToken: () => void;
  openExport: () => void;
  openSync: () => void;
  openScale: () => void;
  openDimensionScale: () => void;
  openAiSettings: () => void;
  openAiGenerate: () => void;
}

/**
 * ⌘K command palette (cmdk): actions plus fuzzy token navigation. Tokens are
 * matched by path; picking one activates its set and selects it.
 */
export function CommandPalette({
  resolver,
  actions,
}: {
  resolver: Resolver;
  actions: PaletteActions;
}) {
  const [open, setOpen] = useState(false);
  const document = useDocumentStore((state) => state.document);
  const themes = useDocumentStore((state) => state.themes);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const select = useUiStore((state) => state.select);
  const setActiveSet = useUiStore((state) => state.setActiveSet);
  const setActiveTheme = useUiStore((state) => state.setActiveTheme);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!open) return null;

  const close = () => {
    setOpen(false);
  };
  const run = (action: () => void) => {
    close();
    action();
  };

  const setOf = (path: string): string | undefined => {
    let owner: string | undefined;
    for (const [name, set] of document.sets) {
      if (set.tokens.has(path)) owner = name;
    }
    return owner;
  };

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <Command label="Command palette" className="palette" data-testid="command-palette">
        <Command.Input
          autoFocus
          placeholder="Type a command or token path…"
          data-testid="palette-input"
        />
        <Command.List>
          <Command.Empty>Nothing matches.</Command.Empty>
          <Command.Group heading="Actions">
            <Command.Item
              onSelect={() => {
                run(actions.newToken);
              }}
            >
              New token
            </Command.Item>
            <Command.Item
              onSelect={() => {
                run(() => void undo());
              }}
            >
              Undo
            </Command.Item>
            <Command.Item
              onSelect={() => {
                run(() => void redo());
              }}
            >
              Redo
            </Command.Item>
            <Command.Item
              onSelect={() => {
                run(actions.openExport);
              }}
            >
              Export tokens…
            </Command.Item>
            <Command.Item
              onSelect={() => {
                run(actions.openSync);
              }}
            >
              Sync with GitHub…
            </Command.Item>
            <Command.Item
              data-testid="palette-scale"
              onSelect={() => {
                run(actions.openScale);
              }}
            >
              Generate scale steps…
            </Command.Item>
            <Command.Item
              data-testid="palette-dimension-scale"
              onSelect={() => {
                run(actions.openDimensionScale);
              }}
            >
              Generate spacing / size scale…
            </Command.Item>
            <Command.Item
              data-testid="palette-ai"
              onSelect={() => {
                run(actions.openAiSettings);
              }}
            >
              AI provider settings…
            </Command.Item>
            <Command.Item
              data-testid="palette-ai-generate"
              onSelect={() => {
                run(actions.openAiGenerate);
              }}
            >
              Generate semantic tokens (AI)…
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Themes">
            <Command.Item
              onSelect={() => {
                run(() => {
                  setActiveTheme(undefined);
                });
              }}
            >
              Theme: none (document order)
            </Command.Item>
            {themes.map((theme) => (
              <Command.Item
                key={theme.name}
                value={`theme ${theme.name}`}
                onSelect={() => {
                  run(() => {
                    setActiveTheme(theme.name);
                  });
                }}
              >
                Theme: {theme.name}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Tokens">
            {resolver
              .visiblePaths()
              .slice(0, 2000)
              .map((path) => (
                <Command.Item
                  key={path}
                  value={path}
                  data-testid={`palette-token-${path}`}
                  onSelect={() => {
                    run(() => {
                      const owner = setOf(path);
                      if (owner !== undefined) {
                        setActiveSet(owner);
                        select({ set: owner, path });
                      }
                    });
                  }}
                >
                  {path}
                </Command.Item>
              ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
