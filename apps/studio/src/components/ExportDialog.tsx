import { useMemo, useState } from "react";

import {
  BUILTIN_OUTPUT_TARGETS,
  formatTokens,
  resolveForExport,
  transformEntries,
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
  const [pxToRem, setPxToRem] = useState(false);

  const output = useMemo(() => {
    try {
      const selected = themes.find((candidate) => candidate.name === themeName);
      // A theme can reference sets the document no longer holds (the set was
      // deleted or renamed; themes deliberately survive so undo can restore
      // the set). Export what still resolves — same guard as the grid and
      // useResolver — and say so, instead of refusing outright.
      const missing =
        selected?.sets
          .filter((entry) => !tokenDocument.sets.has(entry.set))
          .map((entry) => entry.set) ?? [];
      const theme =
        selected && missing.length > 0
          ? {
              ...selected,
              sets: selected.sets.filter((entry) => tokenDocument.sets.has(entry.set)),
            }
          : selected;
      const entries = transformEntries(resolveForExport(tokenDocument, theme), { pxToRem });
      const body = formatTokens(format, entries, { outputReferences });
      return missing.length > 0
        ? `/* Theme "${themeName}" references missing set(s): ${missing.join(
            ", ",
          )} — skipped. Restore or remove them in the theme's ⋮ menu. */\n${body}`
        : body;
    } catch (error) {
      return `/* ${error instanceof Error ? error.message : String(error)} */`;
    }
  }, [tokenDocument, themes, format, themeName, outputReferences, pxToRem]);

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
      <label style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
        <input
          type="checkbox"
          checked={pxToRem}
          data-testid="export-px-to-rem"
          onChange={(event) => {
            setPxToRem(event.target.checked);
          }}
        />{" "}
        Convert px to rem (1rem = 16px)
      </label>
      <textarea
        className="okey-input okey-input--mono"
        rows={12}
        readOnly
        value={output}
        aria-label="Export preview"
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
