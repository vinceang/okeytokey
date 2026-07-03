import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createResolver,
  createTokenDocument,
  parseTokenSet,
  type TokenDocument,
} from "@okeytokey/core";
import {
  applyTargetSchema,
  parseMainToUi,
  type ApplyTarget,
  type MainToUi,
  type UiToMain,
} from "@okeytokey/figma-bridge";

import "@okeytokey/ui/tokens.css";
import "@okeytokey/ui/components.css";
import { Button, Field, Select, TextInput, TokenTypeIcon } from "@okeytokey/ui";

function send(message: UiToMain): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

interface SetFile {
  name: string;
  json: string;
}

function App() {
  const [files, setFiles] = useState<SetFile[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [selectionCount, setSelectionCount] = useState(0);
  const [filter, setFilter] = useState("");
  const [selectedPath, setSelectedPath] = useState<string>();
  const [target, setTarget] = useState<ApplyTarget>("fill");
  const [themeName, setThemeName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const tokenDocument: TokenDocument = useMemo(() => {
    try {
      return createTokenDocument(files.map((file) => parseTokenSet(file.name, file.json)));
    } catch {
      return createTokenDocument([]);
    }
  }, [files]);

  const paths = useMemo(() => {
    const resolver = createResolver(tokenDocument);
    const query = filter.trim().toLowerCase();
    return resolver
      .visiblePaths()
      .filter((path) => query === "" || path.toLowerCase().includes(query))
      .slice(0, 200);
  }, [tokenDocument, filter]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message: MainToUi | undefined = parseMainToUi(
        (event.data as { pluginMessage?: unknown }).pluginMessage,
      );
      if (!message) return;
      switch (message.type) {
        case "init":
          setStatus(`Ready — ${String(message.tokenCount)} token(s) in this file's plugin data`);
          break;
        case "selection-changed":
          setSelectionCount(message.nodes.length);
          break;
        case "document-loaded":
          setStatus(`Loaded ${String(message.tokenCount)} token(s)`);
          break;
        case "applied":
          setStatus(`Applied ${message.path} to ${String(message.nodeCount)} node(s)`);
          break;
        case "variables-exported":
          setStatus(
            `Exported ${String(message.variableCount)} variable(s) to "${message.collection}" (${String(message.modeCount)} modes)`,
          );
          break;
        case "variables-imported":
          setFiles([...message.files]);
          send({ type: "load-document", files: message.files });
          setStatus(
            `Imported ${String(message.report.mapped)} variable(s); skipped ${String(message.report.skipped.length)}`,
          );
          break;
        case "active-theme":
          setStatus(message.theme === null ? "Theme cleared" : `Theme "${message.theme}" pinned`);
          break;
        case "error":
          setStatus(`Error: ${message.message}`);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    send({ type: "ui-ready" });
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const loadFiles = (list: FileList) => {
    void Promise.all(
      [...list].map(async (file) => ({
        name: file.name.replace(/\.json$/i, ""),
        json: await file.text(),
      })),
    ).then((loaded) => {
      setFiles(loaded);
      send({ type: "load-document", files: loaded });
    });
  };

  const selectedType = selectedPath
    ? createResolver(tokenDocument).lookup(selectedPath)?.type
    : undefined;

  return (
    <main
      className="okey-app"
      style={{
        padding: "var(--space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        minHeight: "100vh",
      }}
    >
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
        {status}
      </p>

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          Load DTCG JSON…
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            send({ type: "import-variables" });
          }}
        >
          Import variables
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) loadFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <TextInput
        type="search"
        placeholder="Filter tokens…"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
      />

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {paths.map((path) => {
          const type = createResolver(tokenDocument).lookup(path)?.type;
          return (
            <button
              key={path}
              type="button"
              className="okey-token-row"
              aria-selected={selectedPath === path}
              style={{ height: 28 }}
              onClick={() => {
                setSelectedPath(path);
              }}
            >
              {type && <TokenTypeIcon type={type} />}
              <span className="okey-token-row__name">{path}</span>
            </button>
          );
        })}
        {paths.length === 0 && (
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
            Load a DTCG file or import Figma variables to begin.
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "end" }}>
        <Field label="Apply as">
          {(id) => (
            <Select
              id={id}
              value={target}
              onChange={(event) => {
                setTarget(event.target.value as ApplyTarget);
              }}
            >
              {applyTargetSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button
          variant="primary"
          disabled={selectedPath === undefined || selectionCount === 0}
          title={selectionCount === 0 ? "Select nodes in the canvas first" : undefined}
          onClick={() => {
            if (selectedPath) send({ type: "apply-token", path: selectedPath, target });
          }}
        >
          Apply{selectedType ? ` ${selectedType}` : ""} to {String(selectionCount)} node(s)
        </Button>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "end" }}>
        <Field label="Theme (variables mode)">
          {(id) => (
            <TextInput
              id={id}
              value={themeName}
              placeholder="dark"
              onChange={(event) => {
                setThemeName(event.target.value);
              }}
            />
          )}
        </Field>
        <Button
          variant="secondary"
          onClick={() => {
            send({
              type: "set-active-theme",
              theme: themeName.trim() === "" ? null : themeName.trim(),
            });
          }}
        >
          Pin theme
        </Button>
        <Button
          variant="secondary"
          disabled={files.length === 0}
          title="Creates a collection with one mode per theme name entered (comma-separated in the theme field), or a single default mode"
          onClick={() => {
            const names = themeName
              .split(",")
              .map((name) => name.trim())
              .filter((name) => name !== "");
            const themes = (names.length > 0 ? names : ["default"]).map((name) => ({
              name,
              sets: files.map((file) => ({ set: file.name, status: "enabled" as const })),
            }));
            send({ type: "export-variables", themes });
          }}
        >
          Export variables
        </Button>
      </div>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root is missing from ui.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
