import { useMemo, useState } from "react";

import { lintDocument, type Diagnostic } from "@okeytokey/core";
import { Button } from "@okeytokey/ui";

import { cmdApplyFix } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";

/**
 * Bottom diagnostics drawer: live lint results over the whole document.
 * Click a row to jump to the token; fixes apply through the undo stack.
 */
export function DiagnosticsPanel() {
  const document = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const select = useUiStore((state) => state.select);
  const setActiveSet = useUiStore((state) => state.setActiveSet);
  const [open, setOpen] = useState(false);

  const diagnostics = useMemo(() => {
    try {
      return lintDocument(document);
    } catch {
      return [];
    }
  }, [document]);

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.length - errors;

  const jumpTo = (diagnostic: Diagnostic) => {
    if (diagnostic.setName === undefined || diagnostic.tokenPath === "") return;
    setActiveSet(diagnostic.setName);
    select({ set: diagnostic.setName, path: diagnostic.tokenPath });
  };

  return (
    <div
      className={`diagnostics${open ? " diagnostics--open" : ""}`}
      data-testid="diagnostics-panel"
    >
      <button
        type="button"
        className="diagnostics-summary"
        data-testid="diagnostics-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className={errors > 0 ? "count-badge count-badge--error" : "count-badge"}>
          {errors} {errors === 1 ? "error" : "errors"}
        </span>
        <span className={warnings > 0 ? "count-badge count-badge--warning" : "count-badge"}>
          {warnings} {warnings === 1 ? "warning" : "warnings"}
        </span>
        <span className="chevron">{open ? "▾" : "▴"}</span>
      </button>
      {open && (
        <div className="diagnostics-list" role="list">
          {diagnostics.length === 0 && (
            <p className="empty-state">No problems — the document is clean.</p>
          )}
          {diagnostics.map((diagnostic, index) => (
            <div
              className="diagnostic-row"
              role="listitem"
              key={`${diagnostic.ruleId}-${diagnostic.tokenPath}-${String(index)}`}
              data-testid={`diagnostic-${diagnostic.ruleId}-${diagnostic.tokenPath}`}
            >
              <span
                className={`severity-dot severity-dot--${diagnostic.severity}`}
                title={diagnostic.severity}
              />
              <button
                type="button"
                className="diagnostic-message"
                onClick={() => {
                  jumpTo(diagnostic);
                }}
              >
                <code>{diagnostic.tokenPath || "config"}</code> {diagnostic.message}
                <span className="rule-id">{diagnostic.ruleId}</span>
              </button>
              {diagnostic.fix && (
                <Button
                  variant="secondary"
                  data-testid={`fix-${diagnostic.tokenPath}`}
                  onClick={() => {
                    if (diagnostic.fix) execute(cmdApplyFix(diagnostic.fix));
                  }}
                >
                  {diagnostic.fix.label}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
