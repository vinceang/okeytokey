import { useMemo, useState } from "react";

import {
  createResolver,
  gamutWarning,
  isColor,
  parseColor,
  resolutionOrder,
  type Resolver,
  type Theme,
  type TokenDocument,
} from "@okeytokey/core";
import { Button, ColorSwatch, Field, TextInput, TokenTypeIcon } from "@okeytokey/ui";

import { safeResolve } from "../hooks/use-resolver.js";
import {
  cmdCreateTokenInSet,
  cmdDeleteToken,
  cmdDeprecate,
  cmdRenameToken,
  cmdSetTokenMeta,
  cmdSetTokenValue,
} from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore, type TokenSelection } from "../state/ui-store.js";
import { DecisionContextEditor } from "./DecisionContextEditor.js";
import { UsagePanel } from "./UsagePanel.js";
import { ValueEditor } from "./editors/ValueEditor.js";

interface ThemeColumn {
  readonly key: string;
  readonly label: string;
  readonly theme: Theme | undefined;
  readonly resolver: Resolver;
}

function definingSet(document: TokenDocument, theme: Theme, path: string): string | undefined {
  const order = resolutionOrder(theme);
  for (let i = order.length - 1; i >= 0; i--) {
    const name = order[i];
    if (name !== undefined && document.sets.get(name)?.tokens.has(path)) return name;
  }
  return undefined;
}

function overrideSet(theme: Theme, baseTheme: Theme | undefined): string | undefined {
  const order = resolutionOrder(theme);
  const baseOrder = new Set(baseTheme ? resolutionOrder(baseTheme) : []);
  for (let i = order.length - 1; i >= 0; i--) {
    const name = order[i];
    if (name !== undefined && !baseOrder.has(name)) return name;
  }
  return undefined;
}

function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  return <span className={`lifecycle-badge lifecycle-badge--${lifecycle}`}>{lifecycle}</span>;
}

export function Inspector({
  selection,
  resolver,
  onClose,
}: {
  selection: TokenSelection;
  resolver: Resolver;
  onClose: () => void;
}) {
  const document = useDocumentStore((state) => state.document);
  const themes = useDocumentStore((state) => state.themes);
  const execute = useDocumentStore((state) => state.execute);
  const select = useUiStore((state) => state.select);
  const [error, setError] = useState<string>();
  const [renaming, setRenaming] = useState(false);

  const columns = useMemo<ThemeColumn[]>(() => {
    const usable = themes
      .map((theme) => ({
        theme,
        order: resolutionOrder(theme).filter((name) => document.sets.has(name)),
      }))
      .filter((entry) => entry.order.length > 0);
    if (usable.length === 0) return [];
    return usable.map(({ theme, order }) => ({
      key: theme.name,
      label: theme.name,
      theme,
      resolver: createResolver(document, { setOrder: order }),
    }));
  }, [themes, document]);

  const baseTheme = columns[0]?.theme;

  const token = document.sets.get(selection.set)?.tokens.get(selection.path);
  if (!token) {
    return (
      <aside className="inspector-panel" data-testid="inspector">
        <div className="inspector-panel-header">
          <button
            type="button"
            className="inspector-close-btn"
            aria-label="Close inspector"
            onClick={onClose}
          >
            ×
          </button>
        </div>
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

  const commitRename = (input: string) => {
    setRenaming(false);
    const next = input.trim();
    if (next === "") return;
    const parent = token.pathString.slice(0, Math.max(0, token.pathString.lastIndexOf(".")));
    const nextPath = parent === "" ? next : `${parent}.${next}`;
    if (nextPath === token.pathString) return;
    try {
      execute(cmdRenameToken(token.pathString, nextPath));
      select({ set: selection.set, path: nextPath });
    } catch (renameError) {
      window.alert(renameError instanceof Error ? renameError.message : String(renameError));
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
    <aside className="inspector-panel" data-testid="inspector">
      <header className="inspector-header">
        <div className="inspector-panel-header">
          <div className="token-path">{`${selection.set} · ${token.pathString}`}</div>
          <button
            type="button"
            className="inspector-close-btn"
            aria-label="Close inspector"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="editor-row">
          {renaming ? (
            <input
              className="inspector-rename-input"
              defaultValue={token.name}
              autoFocus
              aria-label={`Rename ${token.pathString}`}
              data-testid="rename-token"
              onFocus={(event) => {
                event.target.select();
              }}
              onBlur={(event) => {
                commitRename(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename(event.currentTarget.value);
                if (event.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="inspector-token-name"
              title="Click to rename"
              data-testid="inspector-token-name"
              onClick={() => {
                setRenaming(true);
              }}
            >
              <span>{token.name}</span>
              <span className="inspector-rename-icon" aria-hidden="true">
                ✏
              </span>
            </button>
          )}
        </div>
        <div className="editor-row" style={{ marginTop: "var(--space-2)" }}>
          <TokenTypeIcon type={token.type} />
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {token.type}
            {token.ownType ? "" : " (inherited)"}
          </span>
          {meta?.lifecycle && <LifecycleBadge lifecycle={meta.lifecycle} />}
          {token.layer && (
            <span className="meta-badge" data-testid="layer-badge">
              {token.layer}
            </span>
          )}
          {token.owners && token.owners.length > 0 && (
            <span
              className="meta-badge"
              data-testid="owners-badge"
              title={`Owned by ${token.owners.join(", ")}`}
            >
              {token.owners.join(", ")}
            </span>
          )}
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

      {columns.length > 0 && (
        <section className="inspector-section">
          <p className="inspector-values-label">Values</p>
          {columns.map((col) => {
            const definer = col.theme
              ? definingSet(document, col.theme, token.pathString)
              : selection.set;
            const definerToken = definer
              ? document.sets.get(definer)?.tokens.get(token.pathString)
              : undefined;
            const rawValue = definerToken?.value;
            const rawScalar =
              typeof rawValue === "string" || typeof rawValue === "number"
                ? String(rawValue)
                : undefined;
            const { resolved: colResolved } = safeResolve(col.resolver, token.pathString);
            const colResolvedColor =
              definerToken?.type === "color" &&
              colResolved &&
              typeof colResolved.value === "string" &&
              isColor(colResolved.value)
                ? colResolved.value
                : undefined;

            const commitThemeValue = (next: string) => {
              const trimmed = next.trim();
              if (!trimmed || trimmed === rawScalar) return;
              try {
                const isBase = col.theme === undefined || col.theme === baseTheme;
                const baseDefiner = baseTheme
                  ? definingSet(document, baseTheme, token.pathString)
                  : undefined;
                const inherited = !isBase && definer === baseDefiner;
                if (isBase || !inherited) {
                  execute(cmdSetTokenValue(definer ?? selection.set, token.pathString, trimmed));
                } else {
                  // col.theme is always defined here: !isBase means col.theme !== undefined
                  const target = overrideSet(col.theme, baseTheme);
                  if (target) {
                    execute(
                      cmdCreateTokenInSet(target, token.pathString, {
                        type: definerToken?.type ?? "color",
                        value: trimmed,
                      }),
                    );
                  }
                }
              } catch (commitError) {
                setError(commitError instanceof Error ? commitError.message : String(commitError));
              }
            };

            return (
              <div key={col.key} className="inspector-theme-row">
                <span className="inspector-theme-label">{col.label}</span>
                {colResolvedColor !== undefined && (
                  <ColorSwatch
                    color={colResolvedColor}
                    gamutWarning={gamutWarning(parseColor(colResolvedColor)) !== undefined}
                  />
                )}
                <input
                  key={`${col.key}-${token.pathString}-${rawScalar ?? ""}`}
                  className="token-cell-input inspector-theme-input"
                  defaultValue={rawScalar ?? ""}
                  aria-label={`${token.pathString} value in ${col.label}`}
                  onBlur={(e) => {
                    commitThemeValue(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitThemeValue(e.currentTarget.value);
                    if (e.key === "Escape") e.currentTarget.blur();
                  }}
                />
              </div>
            );
          })}
        </section>
      )}

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

      <DecisionContextEditor
        setName={selection.set}
        path={token.pathString}
        meta={meta}
        inheritedLayer={token.layer}
        inheritedOwners={token.owners}
      />

      <UsagePanel path={token.pathString} resolver={resolver} />

      <section className="inspector-section">
        <div className="editor-row">
          <Button
            variant="secondary"
            data-testid="deprecate-token"
            disabled={token.okeytokey?.lifecycle === "deprecated"}
            onClick={() => {
              run(cmdDeprecate(token.pathString, meta?.replacedBy));
            }}
          >
            Deprecate
          </Button>
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
        </div>
      </section>
    </aside>
  );
}
