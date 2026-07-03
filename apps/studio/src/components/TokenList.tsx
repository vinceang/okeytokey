import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  gamutWarning,
  isColor,
  parseColor,
  type JsonMap,
  type Resolver,
  type TokenNode,
  type TokenSet,
} from "@okeytokey/core";
import { isReference, referencePath } from "@okeytokey/schema";
import { ColorSwatch, ReferencePill, TokenRow } from "@okeytokey/ui";

import { safeResolve } from "../hooks/use-resolver.js";
import { useUiStore } from "../state/ui-store.js";

const ROW_HEIGHT = 32;

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
    for (const [key, child] of node) {
      if (key.startsWith("$") || !(child instanceof Map)) continue;
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

function TokenPreview({ token, resolver }: { token: TokenNode; resolver: Resolver }) {
  const { resolved } = safeResolve(resolver, token.pathString);
  const raw = token.value;

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

  if (typeof raw === "string" && isReference(raw)) {
    return (
      <>
        {swatch}
        <ReferencePill path={referencePath(raw)} broken={resolved === undefined} />
      </>
    );
  }
  const text =
    typeof raw === "string" || typeof raw === "number" ? String(raw) : `${token.type} {…}`;
  return (
    <>
      {swatch}
      <span>{text}</span>
    </>
  );
}

export interface TokenListProps {
  set: TokenSet;
  resolver: Resolver;
}

export function TokenList({ set, resolver }: TokenListProps) {
  const filter = useUiStore((state) => state.filter);
  const collapsed = useUiStore((state) => state.collapsed);
  const selection = useUiStore((state) => state.selection);
  const select = useUiStore((state) => state.select);
  const toggleCollapsed = useUiStore((state) => state.toggleCollapsed);

  const rows = useMemo(() => buildRows(set, collapsed, filter), [set, collapsed, filter]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
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
    >
      <div className="token-list-inner" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const style = {
            height: virtualRow.size,
            transform: `translateY(${String(virtualRow.start)}px)`,
          };
          if (row.kind === "group") {
            return (
              <div key={virtualRow.key} className="token-list-row" style={style}>
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
              className="token-list-row"
              style={style}
              data-testid={`token-${token.pathString}`}
            >
              <TokenRow
                name={row.name}
                type={token.type}
                deprecated={token.deprecated !== undefined && token.deprecated !== false}
                selected={selection?.set === set.name && selection.path === token.pathString}
                indent={row.depth}
                preview={<TokenPreview token={token} resolver={resolver} />}
                onSelect={() => {
                  select({ set: set.name, path: token.pathString });
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
