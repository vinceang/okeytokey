import { useMemo, useState } from "react";

import {
  BUILTIN_OUTPUT_TARGETS,
  formatTokens,
  resolveForExport,
  type FormatId,
} from "@okeytokey/transforms";
import { Button, Field, Select } from "@okeytokey/ui";

import { useDocumentStore } from "../state/document-store.js";
import { Dialog } from "./dialogs.js";

const FILE_NAMES: Record<FormatId, string> = {
  css: "tokens.css",
  scss: "_tokens.scss",
  ts: "tokens.ts",
  tailwind: "theme.css",
};

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const tokenDocument = useDocumentStore((state) => state.document);
  const themes = useDocumentStore((state) => state.themes);
  const [format, setFormat] = useState<FormatId>("css");
  const [themeName, setThemeName] = useState<string>("");
  const [outputReferences, setOutputReferences] = useState(false);

  const output = useMemo(() => {
    try {
      const theme = themes.find((candidate) => candidate.name === themeName);
      const entries = resolveForExport(tokenDocument, theme);
      return formatTokens(format, entries, { outputReferences });
    } catch (error) {
      return `/* ${error instanceof Error ? error.message : String(error)} */`;
    }
  }, [tokenDocument, themes, format, themeName, outputReferences]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([output], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = FILE_NAMES[format];
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog title="Export tokens" onClose={onClose}>
      <div className="editor-grid-2">
        <Field label="Format">
          {(id) => (
            <Select
              id={id}
              value={format}
              data-testid="export-format"
              onChange={(event) => {
                setFormat(event.target.value as FormatId);
              }}
            >
              {BUILTIN_OUTPUT_TARGETS.map((target) => (
                <option key={target} value={target}>
                  {target}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Theme">
          {(id) => (
            <Select
              id={id}
              value={themeName}
              data-testid="export-theme"
              onChange={(event) => {
                setThemeName(event.target.value);
              }}
            >
              <option value="">document order</option>
              {themes.map((theme) => (
                <option key={theme.name} value={theme.name}>
                  {theme.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {format === "css" && (
        <label style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={outputReferences}
            onChange={(event) => {
              setOutputReferences(event.target.checked);
            }}
          />{" "}
          Preserve references as var() chains
        </label>
      )}
      <textarea
        className="okey-input okey-input--mono"
        rows={12}
        readOnly
        value={output}
        data-testid="export-preview"
      />
      <footer>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="primary" onClick={download} data-testid="export-download">
          Download {FILE_NAMES[format]}
        </Button>
      </footer>
    </Dialog>
  );
}
