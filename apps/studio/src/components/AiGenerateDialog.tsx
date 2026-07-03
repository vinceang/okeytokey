import { useMemo, useRef, useState } from "react";

import {
  AiProviderError,
  applyProposal,
  assembleContext,
  parseProposal,
  type TokenChangeProposal,
  type TokenOperation,
} from "@okeytokey/ai";
import { Button, Field, TextArea, TextInput } from "@okeytokey/ui";

import { cmdApplyFix } from "../state/commands.js";
import { createConfiguredProvider, loadAiSettings } from "../state/ai-settings.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";
import { Dialog } from "./dialogs.js";

/**
 * The Phase 7.3 vertical slice (ADR 0006): AI proposes → schema parses →
 * core validates → diff previews → the human approves per operation →
 * cmdApplyFix applies as one undo step. The provider never touches the
 * document; everything it returns is treated as untrusted text.
 */

const DEFAULT_INSTRUCTION =
  "Create semantic tokens (background, surface, text, action, border…) that alias these primitives.";

function describeOperation(operation: TokenOperation): string {
  switch (operation.op) {
    case "create":
      return `create ${operation.set} · ${operation.path} = ${JSON.stringify(operation.value)}`;
    case "update":
      return `update ${operation.set} · ${operation.path} → ${JSON.stringify(operation.value)}`;
    case "delete":
      return `delete ${operation.set} · ${operation.path}`;
    case "rename":
      return `rename ${operation.fromPath} → ${operation.toPath}`;
  }
}

export function AiGenerateDialog({ onClose }: { onClose: () => void }) {
  const document = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const selection = useUiStore((state) => state.selection);
  const openDialog = useUiStore((state) => state.openDialog);

  // Settings are read once per mount: the dialog is recreated on open, and
  // provider config can't change while it's up (one dialog at a time).
  const [provider] = useState(() => createConfiguredProvider(loadAiSettings()));

  const initialScope = selection
    ? selection.path.includes(".")
      ? selection.path.slice(0, selection.path.lastIndexOf("."))
      : selection.path
    : "colors";
  const [scope, setScope] = useState(initialScope);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; raw?: string }>();
  const [proposal, setProposal] = useState<TokenChangeProposal>();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const abortRef = useRef<AbortController | undefined>(undefined);

  const context = useMemo(() => {
    const prefixes = scope
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    if (prefixes.length === 0) return undefined;
    return assembleContext(document, prefixes);
  }, [document, scope]);

  // Dry-run of the currently selected operations against the live document —
  // this is exactly what Apply will do, shown before it happens.
  const dryRun = useMemo(() => {
    if (!proposal) return undefined;
    return applyProposal(document, proposal, selected);
  }, [document, proposal, selected]);

  const resultFor = (operation: TokenOperation) =>
    dryRun?.results.find((entry) => entry.operation === operation);

  const generate = async () => {
    if (!provider || !context) return;
    setBusy(true);
    setFailure(undefined);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const raw = await provider.generateProposal(
        { task: "generate-semantic-tokens", instruction, context },
        { signal: controller.signal },
      );
      const parsed = parseProposal(raw.text);
      if (!parsed.ok) {
        setFailure({
          message: `The model's answer was rejected (${parsed.failure.reason}): ${parsed.failure.detail}. Nothing was applied.`,
          raw: raw.text,
        });
        return;
      }
      setProposal(parsed.proposal);
      setSelected(new Set(parsed.proposal.operations.map((_, index) => index)));
    } catch (error) {
      if (error instanceof AiProviderError && error.kind === "cancelled") return;
      setFailure({ message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
      abortRef.current = undefined;
    }
  };

  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  };

  const applicable = dryRun?.results.filter((entry) => entry.ok).length ?? 0;
  const totalChanges = dryRun?.diff.sets.reduce((sum, set) => sum + set.changes.length, 0) ?? 0;

  const apply = () => {
    if (!proposal || applicable === 0) return;
    const accepted = proposal;
    const chosen = new Set(selected);
    execute(
      cmdApplyFix({
        label: `AI: ${accepted.summary}`,
        apply: (currentDocument) => applyProposal(currentDocument, accepted, chosen).document,
      }),
    );
    onClose();
  };

  if (!provider) {
    return (
      <Dialog title="Generate semantic tokens (AI)" onClose={onClose}>
        <p className="ai-privacy" data-testid="ai-generate-no-provider">
          No AI provider is configured — AI features are off by default, and okeytokey never funds
          inference. Configure a local server or your own key first.
        </p>
        <footer>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-testid="ai-generate-open-settings"
            onClick={() => {
              openDialog("ai");
            }}
          >
            Open AI provider settings
          </Button>
        </footer>
      </Dialog>
    );
  }

  if (proposal) {
    return (
      <Dialog title="Review proposal" onClose={onClose}>
        <p className="ai-summary" data-testid="ai-proposal-summary">
          {proposal.summary}
        </p>
        {proposal.assumptions !== undefined && proposal.assumptions.length > 0 && (
          <p className="ai-preset-note">Assumptions: {proposal.assumptions.join(" · ")}</p>
        )}
        {proposal.warnings !== undefined && proposal.warnings.length > 0 && (
          <p className="editor-error">Model warnings: {proposal.warnings.join(" · ")}</p>
        )}

        <div className="ai-operations" data-testid="ai-operations">
          {proposal.operations.map((operation, index) => {
            const result = resultFor(operation);
            const checked = selected.has(index);
            return (
              <label
                key={index}
                className={
                  result && !result.ok ? "ai-operation ai-operation--failed" : "ai-operation"
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  data-testid={`ai-op-${String(index)}`}
                  onChange={() => {
                    toggle(index);
                  }}
                />
                <code>{describeOperation(operation)}</code>
                {checked && result && !result.ok && (
                  <span className="ai-operation-error">✗ {result.error}</span>
                )}
              </label>
            );
          })}
        </div>

        <p className="ai-dry-run" data-testid="ai-dry-run">
          {applicable === 0
            ? "Nothing valid selected — every selected operation fails core validation."
            : `${String(applicable)} of ${String(selected.size)} selected operation(s) pass core validation · ${String(totalChanges)} change(s), ${String(dryRun?.diff.impactedPaths.length ?? 0)} token(s) affected after resolution.`}
        </p>

        <footer>
          <Button
            variant="ghost"
            data-testid="ai-back"
            onClick={() => {
              setProposal(undefined);
              setFailure(undefined);
            }}
          >
            ← Edit instruction
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Discard
          </Button>
          <Button
            variant="primary"
            disabled={applicable === 0}
            data-testid="ai-apply"
            onClick={apply}
          >
            Apply {String(applicable)} operation(s)
          </Button>
        </footer>
      </Dialog>
    );
  }

  return (
    <Dialog title="Generate semantic tokens (AI)" onClose={onClose}>
      <Field label="From primitives under (comma-separate for several groups)">
        {(id) => (
          <TextInput
            id={id}
            mono
            autoFocus
            placeholder="colors"
            value={scope}
            data-testid="ai-scope"
            onChange={(event) => {
              setScope(event.target.value);
            }}
          />
        )}
      </Field>
      <Field label="Instruction">
        {(id) => (
          <TextArea
            id={id}
            rows={3}
            value={instruction}
            data-testid="ai-instruction"
            onChange={(event) => {
              setInstruction(event.target.value);
            }}
          />
        )}
      </Field>

      <p className="ai-privacy" data-testid="ai-context-note">
        {context === undefined || context.tokens.length === 0
          ? "No tokens under that path — nothing would be sent."
          : `${String(context.tokens.length)} token(s) + ${String(context.referenced.length)} referenced will be sent to ${provider.name}. Never the whole document.`}
      </p>

      {failure && (
        <div className="doctor-report" data-testid="ai-generate-error">
          <p className="doctor-step doctor-step--failed">✗ {failure.message}</p>
          {failure.raw !== undefined && (
            <details>
              <summary>Raw model output</summary>
              <pre className="ai-raw-output">{failure.raw}</pre>
            </details>
          )}
        </div>
      )}

      <footer>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {busy && (
          <Button
            variant="secondary"
            onClick={() => {
              abortRef.current?.abort();
            }}
          >
            Cancel request
          </Button>
        )}
        <Button
          variant="primary"
          disabled={busy || context === undefined || context.tokens.length === 0}
          data-testid="ai-generate"
          onClick={() => void generate()}
        >
          {busy ? "Generating…" : "Generate proposal"}
        </Button>
      </footer>
    </Dialog>
  );
}
