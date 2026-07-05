import { useEffect } from "react";

import { Button, TextInput } from "@okeytokey/ui";

import { AiGenerateDialog } from "./components/AiGenerateDialog.js";
import { AiProviderDialog } from "./components/AiProviderDialog.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel.js";
import { ExportDialog } from "./components/ExportDialog.js";
import { Inspector } from "./components/Inspector.js";
import { Onboarding, ONBOARDED_KEY } from "./components/Onboarding.js";
import { DimensionScaleDialog } from "./components/DimensionScaleDialog.js";
import { ScaleDialog } from "./components/ScaleDialog.js";
import { Sidebar } from "./components/Sidebar.js";
import { SyncDialog } from "./components/SyncDialog.js";
import { TokenList } from "./components/TokenList.js";
import { NewTokenDialog } from "./components/dialogs.js";
import { useResolver } from "./hooks/use-resolver.js";
import { useDocumentStore } from "./state/document-store.js";
import { createStorage, initPersistence } from "./state/persistence.js";
import { useUiStore } from "./state/ui-store.js";

export function App() {
  const hydrated = useDocumentStore((state) => state.hydrated);
  const document = useDocumentStore((state) => state.document);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const canUndo = useDocumentStore((state) => state.past.length > 0);
  const canRedo = useDocumentStore((state) => state.future.length > 0);

  const activeSet = useUiStore((state) => state.activeSet);
  const setActiveSet = useUiStore((state) => state.setActiveSet);
  const selection = useUiStore((state) => state.selection);
  const filter = useUiStore((state) => state.filter);
  const setFilter = useUiStore((state) => state.setFilter);
  const dialog = useUiStore((state) => state.dialog);
  const openDialog = useUiStore((state) => state.openDialog);
  const newTokenContext = useUiStore((state) => state.newTokenContext);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const closeInspector = useUiStore((state) => state.closeInspector);

  const resolver = useResolver();

  useEffect(() => {
    let stop: (() => void) | undefined;
    void initPersistence(createStorage()).then((cleanup) => {
      stop = cleanup;
    });
    return () => stop?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [undo, redo]);

  // Default the active set to the first one once hydrated (or after deletes).
  const firstSet = document.sets.keys().next().value;
  useEffect(() => {
    if (hydrated && (activeSet === undefined || !document.sets.has(activeSet))) {
      setActiveSet(firstSet);
    }
  }, [hydrated, activeSet, document, firstSet, setActiveSet]);

  if (!hydrated) {
    return (
      <div className="okey-app studio">
        <p className="empty-state">Loading…</p>
      </div>
    );
  }

  const needsOnboarding = document.sets.size === 0 && localStorage.getItem(ONBOARDED_KEY) === null;
  if (needsOnboarding) {
    return (
      <div className="okey-app">
        <Onboarding
          onConnectGitHub={() => {
            openDialog("sync");
          }}
        />
      </div>
    );
  }

  const currentSet = activeSet ? document.sets.get(activeSet) : undefined;

  return (
    <div className="okey-app studio">
      <Sidebar />
      <main className="studio-main">
        <div className="studio-toolbar">
          <TextInput
            type="search"
            placeholder="Filter tokens (name or value)…"
            aria-label="Filter tokens"
            data-testid="filter-input"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
          <span className="spacer" />
          <Button
            variant="ghost"
            disabled={!canUndo}
            onClick={() => undo()}
            title="Undo (⌘Z)"
            data-testid="undo"
          >
            ↩ Undo
          </Button>
          <Button
            variant="ghost"
            disabled={!canRedo}
            onClick={() => redo()}
            title="Redo (⇧⌘Z)"
            data-testid="redo"
          >
            ↪ Redo
          </Button>
        </div>
        <div className="studio-body">
          <div className="studio-content">
            {currentSet ? (
              <TokenList set={currentSet} resolver={resolver} />
            ) : (
              <div className="empty-state">
                <h3>No set selected</h3>
                <p>Create a token set in the sidebar to get started.</p>
              </div>
            )}
            <DiagnosticsPanel />
          </div>
          {inspectorOpen && selection && (
            <Inspector selection={selection} resolver={resolver} onClose={closeInspector} />
          )}
        </div>
      </main>
      {dialog === "new-token" && currentSet && (
        <NewTokenDialog
          setName={currentSet.name}
          resolver={resolver}
          parentPath={newTokenContext?.parentPath}
          intent={newTokenContext?.intent}
          onClose={() => {
            openDialog(undefined);
          }}
        />
      )}
      {dialog === "export" && (
        <ExportDialog
          onClose={() => {
            openDialog(undefined);
          }}
        />
      )}
      {dialog === "sync" && (
        <SyncDialog
          onClose={() => {
            openDialog(undefined);
          }}
        />
      )}
      {dialog === "scale" && (
        <ScaleDialog
          onClose={() => {
            openDialog(undefined);
          }}
        />
      )}
      {dialog === "dimension-scale" && (
        <DimensionScaleDialog
          onClose={() => {
            openDialog(undefined);
          }}
        />
      )}
      {dialog === "ai" && (
        <AiProviderDialog
          onClose={() => {
            openDialog(undefined);
          }}
        />
      )}
      {dialog === "ai-generate" && (
        <AiGenerateDialog
          onClose={() => {
            openDialog(undefined);
          }}
        />
      )}
      <CommandPalette
        resolver={resolver}
        actions={{
          newToken: () => {
            openDialog("new-token");
          },
          openExport: () => {
            openDialog("export");
          },
          openSync: () => {
            openDialog("sync");
          },
          openScale: () => {
            openDialog("scale");
          },
          openDimensionScale: () => {
            openDialog("dimension-scale");
          },
          openAiSettings: () => {
            openDialog("ai");
          },
          openAiGenerate: () => {
            openDialog("ai-generate");
          },
        }}
      />
    </div>
  );
}
