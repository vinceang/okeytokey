import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  createResolver,
  expandThemeMatrix,
  gamutWarning,
  isColor,
  parseColor,
  resolutionOrder,
  themeFromCombination,
  type JsonMap,
  type Resolver,
  type Theme,
  type ThemeGroup,
  type TokenDocument,
  type TokenNode,
  type TokenSet,
} from "@okeytokey/core";
import { isReference, referencePath } from "@okeytokey/schema";
import { ColorSwatch, ReferencePill, TokenRow } from "@okeytokey/ui";

import { safeResolve } from "../hooks/use-resolver.js";
import { CellColorPopover } from "./CellColorPopover.js";
import { RowMenu } from "./RowMenu.js";
import { ThemeDialog } from "./dialogs.js";
import {
  cmdAddSet,
  cmdCreateTokenInSet,
  cmdDeleteToken,
  cmdDuplicateToken,
  cmdRenameToken,
  cmdSetTokenValue,
  cmdSortGroup,
  nextDuplicatePath,
} from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";

function SlidersIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1="1.5"
        y1="4"
        x2="11.5"
        y2="4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle
        cx="5"
        cy="4"
        r="1.6"
        fill="var(--surface-panel, #fff)"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <line
        x1="1.5"
        y1="9"
        x2="11.5"
        y2="9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle
        cx="8.5"
        cy="9"
        r="1.6"
        fill="var(--surface-panel, #fff)"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

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
 * How a cell edit is happening: `text` is the in-place input (hex/RGB for
 * colors, like strings and numbers); `popover` is the Figma-style color
 * picker, opened by clicking the swatch.
 */
type EditMode = "text" | "popover";

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
 * the theme's declared resolution order that the base theme does NOT
 * resolve — for a dark theme layered over light, that's the `dark` set. The
 * set is matched by NAME, whether or not it currently exists in the
 * document: writing into a deleted override set recreates it (the theme
 * still references the name), which is how a stale theme column heals.
 * Returns undefined only when the stacks fully overlap — then no set could
 * affect just this theme, and writing anywhere would change every theme.
 */
function overrideSet(theme: Theme, baseTheme: Theme | undefined): string | undefined {
  const order = resolutionOrder(theme);
  const baseOrder = new Set(baseTheme ? resolutionOrder(baseTheme) : []);
  for (let index = order.length - 1; index >= 0; index--) {
    const name = order[index];
    if (name !== undefined && !baseOrder.has(name)) return name;
  }
  return undefined;
}

function ValueCell({
  document,
  fallbackSet,
  path,
  column,
  baseTheme,
  focused,
  editing,
  onStartEdit,
  onStopEdit,
}: {
  document: TokenDocument;
  fallbackSet: TokenSet;
  path: string;
  column: GridColumn;
  baseTheme: Theme | undefined;
  focused: boolean;
  editing: EditMode | undefined;
  onStartEdit: (mode: EditMode) => void;
  onStopEdit: () => void;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const [error, setError] = useState<string>();
  const cellRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);

  const definer = column.theme ? definingSet(document, column.theme, path) : fallbackSet.name;
  const token = definer !== undefined ? document.sets.get(definer)?.tokens.get(path) : undefined;
  if (definer === undefined || !token) {
    return (
      <div
        role="gridcell"
        className="token-cell token-cell--missing"
        data-testid={`cell-${path}-${column.key}`}
      >
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
  // shadow objects) keep their editors in the inspector. Color cells open a
  // Figma-style popover instead of a bare text input.
  const editable = typeof raw === "string" || typeof raw === "number";
  const isColorCell = editable && token.type === "color";

  /** Route a value to the right set (see the treegrid override rules). */
  const commitValue = (next: string): boolean => {
    setError(undefined);
    const trimmed = next.trim();
    if (trimmed === "" || trimmed === String(raw)) return true;
    try {
      if (isBase || overridden) {
        // Edit where the value already lives.
        execute(cmdSetTokenValue(definer, path, trimmed));
      } else {
        // Inherited cell in a non-base theme (so column.theme is set):
        // create a sparse override in the theme's own set — only this
        // theme changes. If that set was deleted, it's recreated in the
        // same undoable step.
        const target = overrideSet(column.theme, baseTheme);
        if (target === undefined) {
          throw new Error(
            `Theme "${column.label}" has no set of its own to hold an override — ` +
              `every set in its stack is shared with the base theme. ` +
              `Add one in the theme's ⋮ menu.`,
          );
        }
        execute(cmdCreateTokenInSet(target, path, { type: token.type, value: trimmed }));
      }
      return true;
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : String(commitError));
      return false;
    }
  };

  const commit = (next: string) => {
    if (commitValue(next)) onStopEdit();
  };

  const reset = () => {
    // Remove the override; the cell falls back to the inherited value.
    execute(cmdDeleteToken(definer, path));
  };

  if (editing === "text" && editable) {
    return (
      <div
        role="gridcell"
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
      // The swatch is the popover affordance; the cell text stays inline-editable.
      <button
        ref={swatchRef}
        type="button"
        className="token-cell-swatch"
        title="Open the color picker"
        aria-label={`Open the color picker for ${path} in ${column.label}`}
        data-testid={`cell-swatch-${path}-${column.key}`}
        onClick={(event) => {
          event.stopPropagation();
          onStartEdit("popover");
        }}
      >
        <ColorSwatch
          color={resolved.value}
          gamutWarning={gamutWarning(parseColor(resolved.value)) !== undefined}
        />
      </button>
    ) : undefined;

  const title = isBase
    ? `Defined in ${definer}`
    : inherited
      ? `Inherited from ${definer} — edit to override just this theme`
      : `Overridden in ${definer}`;

  return (
    <div
      ref={cellRef}
      role="gridcell"
      className={`token-cell${inherited ? " token-cell--inherited" : ""}${editable ? " token-cell--editable" : ""}${focused ? " token-cell--focused" : ""}${editing === "popover" && isColorCell ? " token-cell--editing" : ""}${error !== undefined ? " token-cell--error" : ""}`}
      data-testid={`cell-${path}-${column.key}`}
      title={resolved ? `${title} — resolves to ${String(resolved.value)}` : title}
      onClick={(event) => {
        if (!editable) return;
        event.stopPropagation();
        onStartEdit("text");
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
      {editing === "popover" && isColorCell && (
        <CellColorPopover
          anchor={swatchRef.current ? swatchRef : cellRef}
          raw={String(raw)}
          seed={
            resolved && typeof resolved.value === "string" && isColor(resolved.value)
              ? resolved.value
              : "#000000"
          }
          path={path}
          set={definer}
          resolver={column.resolver}
          onApply={commitValue}
          onClose={onStopEdit}
        />
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
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const activeTheme = useUiStore((state) => state.activeTheme);
  const setActiveTheme = useUiStore((state) => state.setActiveTheme);
  const select = useUiStore((state) => state.select);
  const openInspector = useUiStore((state) => state.openInspector);
  const toggleCollapsed = useUiStore((state) => state.toggleCollapsed);
  const openDialog = useUiStore((state) => state.openDialog);
  const openNewTokenAt = useUiStore((state) => state.openNewTokenAt);
  const openNewGroupDialog = useUiStore((state) => state.openNewGroupDialog);

  const execute = useDocumentStore((state) => state.execute);
  const [dropTarget, setDropTarget] = useState<string>();
  const [editingTheme, setEditingTheme] = useState<Theme>();
  const [editingCell, setEditingCell] = useState<{
    path: string;
    column: string;
    mode: EditMode;
  }>();
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

  // Theme-only creation (no new set): enables every existing set, then opens
  // the set-stack dialog for fine-tuning. Moved here from the sidebar — the
  // grid header is where themes live now.
  const addTheme = () => {
    const name = window.prompt("Theme name")?.trim();
    if (!name) return;
    if (themes.some((theme) => theme.name === name)) {
      window.alert(`"${name}" already exists.`);
      return;
    }
    const theme: Theme = {
      name,
      sets: [...document.sets.keys()].map((existing) => ({
        set: existing,
        status: "enabled" as const,
      })),
    };
    setThemes([...themes, theme]);
    setEditingTheme(theme);
  };

  // Cartesian expansion (see ADR 0005): themes sharing a `group` form a
  // dimension; two or more dimensions can generate their combinations.
  const groupedThemes = new Map<string, Theme[]>();
  for (const theme of themes) {
    if (theme.group === undefined) continue;
    groupedThemes.set(theme.group, [...(groupedThemes.get(theme.group) ?? []), theme]);
  }
  const canExpandMatrix = groupedThemes.size >= 2;

  const expandMatrix = () => {
    const dimensions: ThemeGroup[] = [...groupedThemes.entries()].map(([name, options]) => ({
      name,
      options,
    }));
    const combinations = expandThemeMatrix(dimensions).map(themeFromCombination);
    const existing = new Set(themes.map((theme) => theme.name));
    const fresh = combinations.filter((combination) => !existing.has(combination.name));
    if (fresh.length === 0) {
      window.alert("All combinations already exist.");
      return;
    }
    setThemes([...themes, ...fresh]);
  };

  // Inline rename (double-click a name): the rename-refactor retargets every
  // reference; one undo reverses it. Under a filter, rows show full paths and
  // the input edits the full path; otherwise just the leaf segment.
  const commitRename = (path: string, input: string, isGroup = false) => {
    setRenaming(undefined);
    const next = input.trim();
    if (next === "") return;
    const parent = filter.trim() === "" ? path.slice(0, Math.max(0, path.lastIndexOf("."))) : "";
    const nextPath = parent === "" ? next : `${parent}.${next}`;
    if (nextPath === path) return;
    try {
      execute(cmdRenameToken(path, nextPath));
      // A group path never selects a token; leave the selection where it was.
      if (!isGroup) select({ set: set.name, path: nextPath });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  // Duplicate a token to a fresh `-copy` sibling and select the copy. The new
  // path is computed the same way the command computes it, so selection lands.
  const duplicate = (path: string) => {
    const target = nextDuplicatePath(set, path);
    try {
      execute(cmdDuplicateToken(set.name, path));
      select({ set: set.name, path: target });
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

  // Keyboard-first: ↑/↓ move the selection across token rows (groups are
  // skipped); Home/End jump; ←/→ move the column focus and Enter opens the
  // focused value cell's editor. Rows are buttons, so Space still selects.
  const [focusedColumn, setFocusedColumn] = useState(0); // 0 = Name
  const onKeyDown = (event: React.KeyboardEvent) => {
    // Never fight an open inline editor's own keys.
    if (editingCell !== undefined || renaming !== undefined) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setFocusedColumn((current) =>
        event.key === "ArrowRight"
          ? Math.min(columns.length, current + 1)
          : Math.max(0, current - 1),
      );
      return;
    }
    if (event.key === "Enter" && focusedColumn > 0 && selection?.set === set.name) {
      const column = columns[focusedColumn - 1];
      if (column) {
        event.preventDefault();
        setEditingCell({ path: selection.path, column: column.key, mode: "text" });
      }
      return;
    }
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
        <div className="token-grid-actions">
          <button
            type="button"
            className="token-grid-action-btn"
            data-testid="new-group"
            onClick={() => {
              openNewGroupDialog();
            }}
          >
            ＋ New group
          </button>
          <button
            type="button"
            className="token-grid-action-btn"
            data-testid="new-token"
            onClick={() => {
              openDialog("new-token");
            }}
          >
            ＋ New token
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="token-scroll"
      ref={scrollRef}
      data-testid="token-list"
      tabIndex={0}
      onKeyDown={onKeyDown}
      {...dropTargetProps(undefined)}
    >
      {/* ARIA treegrid: hierarchy in the rowheader column, themes as columns.
          Structure is treegrid > (header row | rowgroup > rows > cells). */}
      <div role="treegrid" aria-label="Tokens" aria-colcount={columns.length + 2}>
        <div
          className="token-grid-header"
          style={{ gridTemplateColumns: gridTemplate, minWidth: gridMinWidth }}
          data-testid="token-grid-header"
          role="row"
        >
          <div className="token-grid-header-cell" role="columnheader">
            Name
          </div>
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className={`token-grid-header-cell${
                activeTheme === column.key ? " token-grid-header-cell--active" : ""
              }`}
              data-testid={`col-${column.key}`}
            >
              {column.theme ? (
                <>
                  {/* Click activates the theme (inspector resolution follows);
                      clicking the active theme again returns to "no theme". */}
                  <button
                    type="button"
                    className="token-grid-header-label"
                    title={
                      activeTheme === column.key
                        ? `"${column.label}" is the active theme — click to deactivate`
                        : `Make "${column.label}" the active theme`
                    }
                    aria-pressed={activeTheme === column.key}
                    data-testid={`theme-${column.key}`}
                    onClick={() => {
                      setActiveTheme(activeTheme === column.key ? undefined : column.key);
                    }}
                  >
                    {column.label}
                    {column.theme.group !== undefined && (
                      <span className="token-grid-header-group">{column.theme.group}</span>
                    )}
                  </button>
                  <RowMenu
                    label={`Actions for theme ${column.label}`}
                    testId={`theme-menu-${column.key}`}
                  >
                    {(close) => {
                      const theme = column.theme;
                      if (!theme) return null;
                      return (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className="row-menu-item"
                            data-testid={`edit-theme-${column.key}`}
                            onClick={() => {
                              close();
                              setEditingTheme(theme);
                            }}
                          >
                            Edit sets…
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="row-menu-item row-menu-item--danger"
                            data-testid={`delete-theme-${column.key}`}
                            onClick={() => {
                              close();
                              if (
                                window.confirm(
                                  `Delete theme "${column.label}"? Your tokens are untouched.`,
                                )
                              ) {
                                setThemes(
                                  themes.filter((candidate) => candidate.name !== column.key),
                                );
                                if (activeTheme === column.key) setActiveTheme(undefined);
                              }
                            }}
                          >
                            Delete theme…
                          </button>
                        </>
                      );
                    }}
                  </RowMenu>
                </>
              ) : (
                column.label
              )}
            </div>
          ))}
          <div role="columnheader" className="token-grid-add-wrap">
            <RowMenu label="Add a mode or theme" testId="add-column" icon="＋">
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="row-menu-item"
                    data-testid="add-mode"
                    onClick={() => {
                      close();
                      addMode();
                    }}
                  >
                    New mode (set + theme)…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="row-menu-item"
                    data-testid="add-theme"
                    onClick={() => {
                      close();
                      addTheme();
                    }}
                  >
                    New theme only…
                  </button>
                  {canExpandMatrix && (
                    <button
                      type="button"
                      role="menuitem"
                      className="row-menu-item"
                      title="Generate every combination across theme groups (brand × mode)"
                      data-testid="expand-matrix"
                      onClick={() => {
                        close();
                        expandMatrix();
                      }}
                    >
                      ⊞ Generate combinations
                    </button>
                  )}
                </>
              )}
            </RowMenu>
          </div>
        </div>
        <div
          className="token-list-inner"
          role="rowgroup"
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
                  role="row"
                  aria-level={row.depth + 1}
                  aria-expanded={!row.collapsed}
                  {...dragSourceProps(row.path)}
                  {...dropTargetProps(row.path)}
                >
                  <div role="gridcell" aria-colspan={columns.length + 1} className="group-cell">
                    {renaming === row.path ? (
                      <div
                        className="token-cell token-cell--editing"
                        style={{
                          paddingLeft: `calc(var(--space-3) + ${String(row.depth)} * var(--space-4))`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <input
                          className="token-cell-input"
                          defaultValue={row.name}
                          autoFocus
                          aria-label={`Rename group ${row.path}`}
                          data-testid={`rename-input-${row.path}`}
                          onFocus={(event) => {
                            event.target.select();
                          }}
                          onBlur={(event) => {
                            commitRename(row.path, event.target.value, true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              commitRename(row.path, event.currentTarget.value, true);
                            if (event.key === "Escape") setRenaming(undefined);
                          }}
                        />
                      </div>
                    ) : (
                      <>
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
                          <span className={`chevron${row.collapsed ? " chevron--collapsed" : ""}`}>
                            ▼
                          </span>
                          {row.name}
                        </button>
                        <RowMenu
                          label={`Actions for group ${row.path}`}
                          testId={`node-menu-${row.path}`}
                        >
                          {(close) => (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                className="row-menu-item"
                                data-testid={`group-new-subgroup-${row.path}`}
                                onClick={() => {
                                  close();
                                  openNewTokenAt(row.path, "subgroup");
                                }}
                              >
                                New subgroup…
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="row-menu-item"
                                data-testid={`group-new-token-${row.path}`}
                                onClick={() => {
                                  close();
                                  openNewTokenAt(row.path, "token");
                                }}
                              >
                                New token…
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="row-menu-item"
                                data-testid={`group-sort-${row.path}`}
                                onClick={() => {
                                  close();
                                  execute(cmdSortGroup(set.name, row.path));
                                }}
                              >
                                Sort A→Z
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="row-menu-item"
                                data-testid={`group-rename-${row.path}`}
                                onClick={() => {
                                  close();
                                  setRenaming(row.path);
                                }}
                              >
                                Rename group…
                              </button>
                            </>
                          )}
                        </RowMenu>
                      </>
                    )}
                  </div>
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
                role="row"
                aria-level={row.depth + 1}
                aria-selected={selection?.set === set.name && selection.path === token.pathString}
                {...dragSourceProps(token.pathString)}
                // The whole row selects, like the old full-width row button.
                // Editable cells stopPropagation.
                onClick={() => {
                  select({ set: set.name, path: token.pathString });
                }}
              >
                <div role="rowheader" className="token-name-cell">
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
                    <>
                      <TokenRow
                        name={row.name}
                        type={token.type}
                        deprecated={token.deprecated !== undefined && token.deprecated !== false}
                        selected={
                          selection?.set === set.name && selection.path === token.pathString
                        }
                        indent={row.depth}
                        onSelect={() => {
                          select({ set: set.name, path: token.pathString });
                        }}
                        onDoubleClick={() => {
                          setRenaming(token.pathString);
                        }}
                      />
                      <RowMenu
                        label={`Actions for ${token.pathString}`}
                        testId={`node-menu-${token.pathString}`}
                      >
                        {(close) => (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              className="row-menu-item"
                              data-testid={`token-rename-${token.pathString}`}
                              onClick={() => {
                                close();
                                setRenaming(token.pathString);
                              }}
                            >
                              Rename token…
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="row-menu-item"
                              data-testid={`token-duplicate-${token.pathString}`}
                              onClick={() => {
                                close();
                                duplicate(token.pathString);
                              }}
                            >
                              Duplicate token
                            </button>
                          </>
                        )}
                      </RowMenu>
                    </>
                  )}
                </div>
                {columns.map((column, index) => (
                  <ValueCell
                    key={column.key}
                    document={document}
                    fallbackSet={set}
                    path={token.pathString}
                    column={column}
                    baseTheme={baseTheme}
                    focused={
                      focusedColumn === index + 1 &&
                      selection?.set === set.name &&
                      selection.path === token.pathString
                    }
                    editing={
                      editingCell?.path === token.pathString && editingCell.column === column.key
                        ? editingCell.mode
                        : undefined
                    }
                    onStartEdit={(mode) => {
                      setEditingCell({ path: token.pathString, column: column.key, mode });
                      select({ set: set.name, path: token.pathString });
                    }}
                    onStopEdit={() => {
                      setEditingCell(undefined);
                    }}
                  />
                ))}
                <div
                  role="gridcell"
                  className={`inspector-trigger-cell${inspectorOpen && selection?.set === set.name && selection.path === token.pathString ? " inspector-trigger-cell--active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <button
                    type="button"
                    className="inspector-trigger-btn"
                    title="Edit token properties"
                    aria-label={`Edit properties for ${token.pathString}`}
                    data-testid={`inspector-trigger-${token.pathString}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      select({ set: set.name, path: token.pathString });
                      openInspector();
                    }}
                  >
                    <SlidersIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="token-grid-actions">
        <button
          type="button"
          className="token-grid-action-btn"
          data-testid="new-group"
          onClick={() => {
            openNewGroupDialog();
          }}
        >
          ＋ New group
        </button>
        <button
          type="button"
          className="token-grid-action-btn"
          data-testid="new-token"
          onClick={() => {
            openDialog("new-token");
          }}
        >
          ＋ New token
        </button>
      </div>
      {editingTheme && (
        <ThemeDialog
          theme={editingTheme}
          onClose={() => {
            setEditingTheme(undefined);
          }}
        />
      )}
    </div>
  );
}
