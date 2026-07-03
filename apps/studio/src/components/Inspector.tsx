import { useState } from "react";

import { gamutWarning, isColor, parseColor, type Resolver } from "@okeytokey/core";
import { Button, ColorSwatch, Field, TextInput, TokenTypeIcon } from "@okeytokey/ui";

import { safeResolve } from "../hooks/use-resolver.js";
import { cmdDeleteToken, cmdSetTokenMeta, cmdSetTokenValue } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore, type TokenSelection } from "../state/ui-store.js";
import { ValueEditor } from "./editors/ValueEditor.js";

function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  return <span className={`lifecycle-badge lifecycle-badge--${lifecycle}`}>{lifecycle}</span>;
}

export function Inspector({
  selection,
  resolver,
}: {
  selection: TokenSelection;
  resolver: Resolver;
}) {
  const document = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const select = useUiStore((state) => state.select);
  const [error, setError] = useState<string>();

  const token = document.sets.get(selection.set)?.tokens.get(selection.path);
  if (!token) {
    return (
      <aside className="studio-inspector">
        <p className="empty-state">Token no longer exists.</p>
      </aside>
    );
  }

  const run = (command: Parameters<typeof execute>[0]) => {
    try {
      execute(command);
      setError(undefined);
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : String(commandError));
    }
  };

  const { resolved, error: resolutionError } = safeResolve(resolver, token.pathString);
  const resolvedText =
    resolved === undefined
      ? undefined
      : typeof resolved.value === "string" || typeof resolved.value === "number"
        ? String(resolved.value)
        : JSON.stringify(resolved.value);
  const resolvedIsColor =
    token.type === "color" && typeof resolved?.value === "string" && isColor(resolved.value);

  const meta = token.okeytokey;

  return (
    <aside className="studio-inspector" data-testid="inspector">
      <header className="inspector-header">
        <div className="token-path">{`${selection.set} · ${token.pathString}`}</div>
        <h2>{token.name}</h2>
        <div className="editor-row" style={{ marginTop: "var(--space-2)" }}>
          <TokenTypeIcon type={token.type} />
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {token.type}
            {token.ownType ? "" : " (inherited)"}
          </span>
          {meta?.lifecycle && <LifecycleBadge lifecycle={meta.lifecycle} />}
        </div>
      </header>

      <section className="inspector-section">
        <ValueEditor
          token={token}
          resolver={resolver}
          onCommit={(value) => {
            run(cmdSetTokenValue(selection.set, token.pathString, value));
          }}
        />
        {error !== undefined && (
          <p className="editor-error" data-testid="editor-error">
            {error}
          </p>
        )}
        <div className="resolved-preview" data-testid="resolved-preview">
          {resolvedIsColor && (
            <ColorSwatch
              color={resolved.value}
              gamutWarning={gamutWarning(parseColor(resolved.value)) !== undefined}
            />
          )}
          {resolutionError !== undefined ? (
            <span className="editor-error">{resolutionError}</span>
          ) : (
            <>→ {resolvedText}</>
          )}
        </div>
      </section>

      <section className="inspector-section">
        <Field label="Description">
          {(id) => (
            <TextInput
              id={id}
              key={token.pathString}
              defaultValue={token.description ?? ""}
              placeholder="What is this token for?"
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next !== (token.description ?? "")) {
                  run(
                    cmdSetTokenMeta(selection.set, token.pathString, {
                      description: next === "" ? null : next,
                    }),
                  );
                }
              }}
            />
          )}
        </Field>
        {(meta?.guidelines !== undefined ||
          meta?.decision !== undefined ||
          token.deprecated !== undefined) && (
          <div className="decision-context">
            {token.deprecated !== undefined && token.deprecated !== false && (
              <p>
                <strong>Deprecated</strong>
                {typeof token.deprecated === "string" ? ` — ${token.deprecated}` : ""}
                {meta?.replacedBy && (
                  <>
                    {" · "}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        select({ set: selection.set, path: meta.replacedBy ?? "" });
                      }}
                    >
                      Go to {meta.replacedBy}
                    </Button>
                  </>
                )}
              </p>
            )}
            {meta?.guidelines !== undefined && <p>{meta.guidelines}</p>}
            {meta?.decision && (
              <p>
                Decided by {meta.decision.author} on {meta.decision.date}: {meta.decision.rationale}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="inspector-section">
        <Button
          variant="danger"
          data-testid="delete-token"
          onClick={() => {
            run(cmdDeleteToken(selection.set, token.pathString));
            select(undefined);
          }}
        >
          Delete token
        </Button>
      </section>
    </aside>
  );
}
