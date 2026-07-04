import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  createResolver,
  gamutWarning,
  isColor,
  parseColor,
  resolutionOrder,
  type JsonMap,
  type Resolver,
  type Theme,
  type TokenDocument,
  type TokenNode,
  type TokenSet,
} from "@okeytokey/core";
import { isReference, referencePath } from "@okeytokey/schema";
import { ColorSwatch, ReferencePill, TokenRow } from "@okeytokey/ui";

import { safeResolve } from "../hooks/use-resolver.js";
import {
  cmdAddSet,
  cmdCreateToken,
  cmdDeleteToken,
  cmdRenameToken,
  cmdSetTokenValue,
} from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";

/**
 * The token treegrid: the group hierarchy stays in the Name column (expand/
 * collapse, drag, keyboard nav), and each theme renders as a value column —
 * Figma Variables' mental model over DTCG's set-based storage. A cell shows
 * the value the theme resolves; cells inherited from the base theme render
 * dimmed, explicit overrides at full strength. Read layer only — editing
 * still flows through the inspector (cell editing arrives in the next phase).
 */

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 30;
const NAME_COL_MIN = 240;
const VALUE_COL_MIN = 160;

type Row =
  | { kind: "group"; path: string; name: string; depth: number; collapsed: boolean }
  | { kind: "token"; token: TokenNode; name: string; depth: number };

/** Flatten the set's tree into visible rows, honoring collapse + filter. */
function buildRows(set: TokenSet, collapsed: ReadonlySet<string>, filter: string): Row[] {
  const query = filter.trim().toLowerCase();
  if (query !== "") {
    // Filtering flattens the tree: full paths, no group rows.
    return [...set.tokens.values()]
      .filter(
        (token) =>
          token.pathString.toLowerCase().includes(query) ||
          JSON.stringify(token.value).toLowerCase().includes(query),
      )
      .map((token) => ({ kind: "token", token, name: token.pathString, depth: 0 }));
  }

  const rows: Row[] = [];
  const walk = (node: JsonMap, prefix: string, depth: number): void => {
    // A scale's steps are numeric siblings (50, 100, … 950). Present them in
    // numeric order even when one was generated or edited out of sequence.
    // Only pure numeric-sibling groups sort; every other group keeps its
    // document order, which is meaningful and preserved on serialization.
    const children = [...node].filter(
      (entry): entry is [string, JsonMap] => !entry[0].startsWith("$") && entry[1] instanceof Map,
    );
    const allNumeric = children.length > 0 && children.every(([key]) => /^\d+$/.test(key));
    const ordered = allNumeric ? [...children].sort(([a], [b]) => Number(a) - Number(b)) : children;
    for (const [key, child] of ordered) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (child.has("$value")) {
        const token = set.tokens.get(path);
        if (token) rows.push({ kind: "token", token, name: key, depth });
        continue;
      }
      const isCollapsed = collapsed.has(path);
      rows.push({ kind: "group", path, name: key, depth, collapsed: isCollapsed });
      if (!isCollapsed) walk(child, path, depth + 1);
    }
  };
  walk(set.root, "", 0);
  return rows;
}

/** A value column: a theme, or the plain document view when no themes exist. */
interface GridColumn {
  readonly key: string;
  readonly label: string;
  readonly theme?: Theme;
  readonly resolver: Resolver;
}

/**
 * The set that defines `path` under `theme`: the highest-precedence set in
 * the theme's resolution order that holds the token. This is where an edit
 * to this cell would land — and comparing it against the base theme's
 * defining set is what distinguishes an override from an inherited value.
 */
function definingSet(document: TokenDocument, theme: Theme, path: string): string | undefined {
  const order = resolutionOrder(theme);
  for (let index = order.length - 1; index >= 0; index--) {
    const name = order[index];
    if (name !== undefined && document.sets.get(name)?.tokens.has(path)) return name;
  }
  return undefined;
}

/**
 * Where a new override for this theme lands: the highest-precedence set in
 * the theme's resolution order that the base theme does NOT resolve — for a
 * dark theme layered over light, that's the `dark` set. Falls back to the
 * theme's topmost set when the stacks fully overlap.
 */
function overrideSet(
  document: TokenDocument,
  theme: Theme,
  baseTheme: Theme | undefined,
): string | undefined {
  const order = resolutionOrder(theme).filter((name) => document.sets.has(name));
  const baseOrder = new Set(baseTheme ? resolutionOrder(baseTheme) : []);
  for (let index = order.length - 1; index >= 0; index--) {
    const name = order[index];
    if (name !== undefined && !baseOrder.has(name)) return name;
  }
  return order.at(-1);
}

function ValueCell({
  document,
  fallbackSet,
  path,
  column,
  baseTheme,
  editing,
  onStartEdit,
  onStopEdit,
}: {
  document: TokenDocument;
  fallbackSet: TokenSet;
  path: string;
  column: GridColumn;
  baseTheme: Theme | undefined;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const [error, setError] = useState<string>();

  const definer = column.theme ? definingSet(document, column.theme, path) : fallbackSet.name;
  const token = definer !== undefined ? document.sets.get(definer)?.tokens.get(path) : undefined;
  if (definer === undefined || !token) {
    return (
      <div className="token-cell token-cell--missing" data-testid={`cell-${path}-${column.key}`}>
        —
      </div>
    );
  }

  const { resolved } = safeResolve(column.resolver, path);
  const isBase = column.theme === undefined || column.theme === baseTheme;
  const baseDefiner = baseTheme ? definingSet(document, baseTheme, path) : undefined;
  const inherited = !isBase && baseTheme !== undefined && definer === baseDefiner;
  const overridden = !isBase && !inherited;
  // Reset only makes sense when something remains to inherit from.
  const resettable = overridden && baseDefiner !== undefined;

  const raw = token.value;
  // Inline editing covers string/number raw values; composites (typography,
  // shadow objects) keep their editors in the inspector.
  const editable = typeof raw === "string" || typeof raw === "number";

  const commit = (next: string) => {
    setError(undefined);
    const trimmed = next.trim();
    if (trimmed === "" || trimmed === String(raw)) {
      onStopEdit();
      return;
    }
    try {
      if (isBase || overridden) {
        // Edit where the value already lives.
        execute(cmdSetTokenValue(definer, path, trimmed));
      } else {
        // Inherited cell in a non-base theme (so column.theme is set):
        // create a sparse override in the theme's own set — only this
        // theme changes.
        const target = overrideSet(document, column.theme, baseTheme);
        if (target === undefined) throw new Error("No set to hold this theme's override");
        execute(cmdCreateToken(target, path, { type: token.type, value: trimmed }));
      }
      onStopEdit();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : String(commitError));
    }
  };

  const reset = () => {
    // Remove the override; the cell falls back to the inherited value.
    execute(cmdDeleteToken(definer, path));
  };

  if (editing && editable) {
    return (
      <div
        className={`token-cell token-cell--editing${error !== undefined ? " token-cell--error" : ""}`}
        data-testid={`cell-${path}-${column.key}`}
        title={error}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <input
          className="token-cell-input"
          defaultValue={String(raw)}
          autoFocus
          aria-label={`${path} value in ${column.label}`}
          data-testid={`cell-input-${path}-${column.key}`}
          onFocus={(event) => {
            event.target.select();
          }}
          onBlur={(event) => {
            commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(event.currentTarget.value);
            if (event.key === "Escape") {
              setError(undefined);
              onStopEdit();
            }
          }}
        />
      </div>
    );
  }

  const swatch =
    token.type === "color" &&
    resolved &&
    typeof resolved.value === "string" &&
    isColor(resolved.value) ? (
      <ColorSwatch
        color={resolved.value}
        gamutWarning={gamutWarning(parseColor(resolved.value)) !== undefined}
      />
    ) : undefined;

  const title = isBase
    ? `Defined in ${definer}`
    : inherited
      ? `Inherited from ${definer} — edit to override just this theme`
      : `Overridden in ${definer}`;

  return (
    <div
      className={`token-cell${inherited ? " token-cell--inherited" : ""}${editable ? " token-cell--editable" : ""}`}
      data-testid={`cell-${path}-${column.key}`}
      title={resolved ? `${title} — resolves to ${String(resolved.value)}` : title}
      onClick={(event) => {
        if (!editable) return;
        event.stopPropagation();
        onStartEdit();
      }}
    >
      {swatch}
      {typeof raw === "string" && isReference(raw) ? (
        <ReferencePill path={referencePath(raw)} broken={resolved === undefined} />
      ) : (
        <span className="token-cell-text">
          {typeof raw === "string" || typeof raw === "number" ? String(raw) : `${token.type} {…}`}
        </span>
      )}
      {resettable && (
        <button
          type="button"
          className="token-cell-reset"
          title={`Reset — remove the override in ${definer} and inherit again`}
          data-testid={`cell-reset-${path}-${column.key}`}
          onClick={(event) => {
            event.stopPropagation();
            reset();
          }}
        >
          ↺
        </button>
      )}
    </div>
  );
}

export interface TokenListProps {
  set: TokenSet;
  resolver: Resolver;
}

export function TokenList({ set, resolver }: TokenListProps) {
  const document = useDocumentStore((state) => state.document);
  const themes = useDocumentStore((state) => state.themes);
  const setThemes = useDocumentStore((state) => state.setThemes);
  const filter = useUiStore((state) => state.filter);
  const collapsed = useUiStore((state) => state.collapsed);
  const selection = useUiStore((state) => state.selection);
  const activeTheme = useUiStore((state) => state.activeTheme);
  const select = useUiStore((state) => state.select);
  const toggleCollapsed = useUiStore((state) => state.toggleCollapsed);
  const openDialog = useUiStore((state) => state.openDialog);

  const execute = useDocumentStore((state) => state.execute);
  const [dropTarget, setDropTarget] = useState<string>();
  const [editingCell, setEditingCell] = useState<{ path: string; column: string }>();
  const [renaming, setRenaming] = useState<string>();

  const rows = useMemo(() => buildRows(set, collapsed, filter), [set, collapsed, filter]);

  // Themes become value columns; with none defined, one plain "Value" column
  // (the passed resolver already honors document order). Sets a theme
  // references but the document no longer holds (deleted, renamed) are
  // filtered out — same guard as useResolver — so the grid never crashes on
  // a stale theme definition.
  const columns = useMemo<GridColumn[]>(() => {
    const usable = themes
      .map((theme) => ({
        theme,
        order: resolutionOrder(theme).filter((name) => document.sets.has(name)),
      }))
      .filter((entry) => entry.order.length > 0);
    if (usable.length === 0) return [{ key: "value", label: "Value", resolver }];
    return usable.map(({ theme, order }) => ({
      key: theme.name,
      label: theme.name,
      theme,
      resolver: createResolver(document, { setOrder: order }),
    }));
  }, [themes, document, resolver]);

  const baseTheme = columns[0]?.theme;
  // Trailing 36px track hosts the ＋ (new mode) header button.
  const gridTemplate = `minmax(${String(NAME_COL_MIN)}px, 1.6fr) repeat(${String(
    columns.length,
  )}, minmax(${String(VALUE_COL_MIN)}px, 1fr)) 36px`;
  const gridMinWidth = NAME_COL_MIN + columns.length * VALUE_COL_MIN + 36;

  const scrollRef = useRef<HTMLDivElement>(null);

  // ＋ mode: a new sparse set plus a theme layering it on the base theme's
  // stack — the DTCG shape behind "add a column". The set creation is
  // undoable; the theme joins the base theme's group (a mode dimension).
  const addMode = () => {
    const name = window.prompt("New mode name (creates a set and a theme)")?.trim();
    if (!name) return;
    if (document.sets.has(name) || themes.some((theme) => theme.name === name)) {
      window.alert(`"${name}" already exists.`);
      return;
    }
    try {
      execute(cmdAddSet(name));
      const sets = baseTheme
        ? [...baseTheme.sets, { set: name, status: "enabled" as const }]
        : [
            ...[...document.sets.keys()].map((existing) => ({
              set: existing,
              status: "enabled" as const,
            })),
            { set: name, status: "enabled" as const },
          ];
      setThemes([...themes, { name, group: baseTheme?.group, sets }]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  // Inline rename (double-click a name): the rename-refactor retargets every
  // reference; one undo reverses it. Under a filter, rows show full paths and
  // the input edits the full path; otherwise just the leaf segment.
  const commitRename = (path: string, input: string) => {
    setRenaming(undefined);
    const next = input.trim();
    if (next === "") return;
    const parent = filter.trim() === "" ? path.slice(0, Math.max(0, path.lastIndexOf("."))) : "";
    const nextPath = parent === "" ? next : `${parent}.${next}`;
    if (nextPath === path) return;
    try {
      execute(cmdRenameToken(path, nextPath));
      select({ set: set.name, path: nextPath });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  // Drag-to-reorganize: token and group rows are drag sources; group rows and
  // the list background (root) are drop targets. A drop is a rename — every
  // reference updates via the refactor engine, and one undo reverses it.
  const lastSegment = (path: string) => path.slice(path.lastIndexOf(".") + 1);

  const performDrop = (sourcePath: string, targetGroup: string | undefined) => {
    setDropTarget(undefined);
    if (sourcePath === "") return;
    // Can't drop a group into itself or its own subtree.
    if (
      targetGroup !== undefined &&
      (targetGroup === sourcePath || targetGroup.startsWith(`${sourcePath}.`))
    ) {
      return;
    }
    const nextPath =
      targetGroup === undefined
        ? lastSegment(sourcePath)
        : `${targetGroup}.${lastSegment(sourcePath)}`;
    if (nextPath === sourcePath) return;
    try {
      execute(cmdRenameToken(sourcePath, nextPath));
      select({ set: set.name, path: nextPath });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const dragSourceProps = (path: string) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData("text/plain", path);
      event.dataTransfer.effectAllowed = "move";
    },
  });

  const dropTargetProps = (groupPath: string | undefined) => ({
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(groupPath ?? "");
    },
    onDragLeave: () => {
      setDropTarget(undefined);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      performDrop(event.dataTransfer.getData("text/plain"), groupPath);
    },
  });
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollPaddingStart: HEADER_HEIGHT,
  });

  // Keyboard-first: arrows move the selection across token rows (groups are
  // skipped); Home/End jump. Rows are buttons, so Enter/Space work natively.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const tokenRows = rows.filter(
      (row): row is Extract<Row, { kind: "token" }> => row.kind === "token",
    );
    if (tokenRows.length === 0) return;
    event.preventDefault();
    const currentIndex = tokenRows.findIndex(
      (row) => selection?.set === set.name && selection.path === row.token.pathString,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tokenRows.length - 1
          : event.key === "ArrowDown"
            ? Math.min(tokenRows.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex === -1 ? 0 : currentIndex - 1);
    const next = tokenRows[nextIndex];
    if (!next) return;
    select({ set: set.name, path: next.token.pathString });
    virtualizer.scrollToIndex(rows.indexOf(next), { align: "auto" });
  };

  if (rows.length === 0) {
    return (
      <div className="token-scroll" data-testid="token-list">
        <div className="empty-state">
          <h3>{filter ? "No matching tokens" : "No tokens yet"}</h3>
          <p>
            {filter
              ? "Try a different search — names and values are both matched."
              : "Add your first token with “New token”, or import a DTCG file."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="token-scroll"
      ref={scrollRef}
      data-testid="token-list"
      role="region"
      aria-label="Tokens"
      tabIndex={0}
      onKeyDown={onKeyDown}
      {...dropTargetProps(undefined)}
    >
      <div
        className="token-grid-header"
        style={{ gridTemplateColumns: gridTemplate, minWidth: gridMinWidth }}
        data-testid="token-grid-header"
      >
        <div className="token-grid-header-cell">Name</div>
        {columns.map((column) => (
          <div
            key={column.key}
            className={`token-grid-header-cell${
              activeTheme === column.key ? " token-grid-header-cell--active" : ""
            }`}
            data-testid={`col-${column.key}`}
          >
            {column.label}
            {column.theme?.group !== undefined && (
              <span className="token-grid-header-group">{column.theme.group}</span>
            )}
          </div>
        ))}
        <button
          type="button"
          className="token-grid-add-col"
          title="New mode — a set for its overrides plus a theme column"
          aria-label="New mode"
          data-testid="add-mode"
          onClick={addMode}
        >
          ＋
        </button>
      </div>
      <div
        className="token-list-inner"
        style={{ height: virtualizer.getTotalSize(), minWidth: gridMinWidth }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const style = {
            height: virtualRow.size,
            transform: `translateY(${String(virtualRow.start)}px)`,
          };
          if (row.kind === "group") {
            return (
              <div
                key={virtualRow.key}
                className={`token-list-row${dropTarget === row.path ? " token-list-row--drop" : ""}`}
                style={style}
                {...dragSourceProps(row.path)}
                {...dropTargetProps(row.path)}
              >
                <button
                  type="button"
                  className="group-row"
                  style={{
                    paddingLeft: `calc(var(--space-3) + ${String(row.depth)} * var(--space-4))`,
                  }}
                  onClick={() => {
                    toggleCollapsed(row.path);
                  }}
                  data-testid={`group-${row.path}`}
                >
                  <span className={`chevron${row.collapsed ? " chevron--collapsed" : ""}`}>▼</span>
                  {row.name}
                </button>
              </div>
            );
          }
          const token = row.token;
          return (
            <div
              key={virtualRow.key}
              className="token-list-row token-list-row--grid"
              style={{ ...style, gridTemplateColumns: gridTemplate }}
              data-testid={`token-${token.pathString}`}
              {...dragSourceProps(token.pathString)}
              // The whole row selects, like the old full-width row button.
              // Editable cells will stopPropagation once they exist.
              onClick={() => {
                select({ set: set.name, path: token.pathString });
              }}
            >
              {renaming === token.pathString ? (
                <div
                  className="token-cell token-cell--editing"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <input
                    className="token-cell-input"
                    defaultValue={row.name}
                    autoFocus
                    aria-label={`Rename ${token.pathString}`}
                    data-testid={`rename-input-${token.pathString}`}
                    onFocus={(event) => {
                      event.target.select();
                    }}
                    onBlur={(event) => {
                      commitRename(token.pathString, event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter")
                        commitRename(token.pathString, event.currentTarget.value);
                      if (event.key === "Escape") setRenaming(undefined);
                    }}
                  />
                </div>
              ) : (
                <TokenRow
                  name={row.name}
                  type={token.type}
                  deprecated={token.deprecated !== undefined && token.deprecated !== false}
                  selected={selection?.set === set.name && selection.path === token.pathString}
                  indent={row.depth}
                  onSelect={() => {
                    select({ set: set.name, path: token.pathString });
                  }}
                  onDoubleClick={() => {
                    setRenaming(token.pathString);
                  }}
                />
              )}
              {columns.map((column) => (
                <ValueCell
                  key={column.key}
                  document={document}
                  fallbackSet={set}
                  path={token.pathString}
                  column={column}
                  baseTheme={baseTheme}
                  editing={
                    editingCell?.path === token.pathString && editingCell.column === column.key
                  }
                  onStartEdit={() => {
                    setEditingCell({ path: token.pathString, column: column.key });
                    select({ set: set.name, path: token.pathString });
                  }}
                  onStopEdit={() => {
                    setEditingCell(undefined);
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="token-grid-footer"
        data-testid="grid-new-token"
        onClick={() => {
          openDialog("new-token");
        }}
      >
        ＋ New token
      </button>
    </div>
  );
}
