import { useEffect, useMemo, useRef, useState } from "react";

import type { Resolver } from "@okeytokey/core";
import { TextInput, TokenTypeIcon } from "@okeytokey/ui";

import { safeResolve } from "../../hooks/use-resolver.js";

export interface AliasPickerProps {
  resolver: Resolver;
  /** Exclude this path (a token cannot alias itself). */
  excludePath?: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

/**
 * Searchable token picker. Matches by path AND by resolved value, so typing
 * "#3b82f6" finds the primitive that holds it — the alias you actually want.
 */
export function AliasPicker({ resolver, excludePath, onPick, onClose }: AliasPickerProps) {
  const [query, setQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Dismiss on any click outside the popover (Escape already closes). The
  // listener attaches after the opening click's event cycle, so opening
  // doesn't immediately close it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  const options = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const all = resolver
      .visiblePaths()
      .filter((path) => path !== excludePath)
      .map((path) => {
        const { resolved } = safeResolve(resolver, path);
        const value =
          resolved && (typeof resolved.value === "string" || typeof resolved.value === "number")
            ? String(resolved.value)
            : "";
        return { path, value, type: resolver.lookup(path)?.type };
      });
    if (lower === "") return all.slice(0, 50);
    return all
      .filter(
        (option) =>
          option.path.toLowerCase().includes(lower) || option.value.toLowerCase().includes(lower),
      )
      .slice(0, 50);
  }, [resolver, query, excludePath]);

  return (
    <div className="alias-popover" data-testid="alias-popover" ref={popoverRef}>
      <TextInput
        autoFocus
        placeholder="Search by name or resolved value…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter" && options[0]) {
            onPick(options[0].path);
          }
        }}
      />
      <div className="alias-options" role="listbox">
        {options.map((option) => (
          <button
            key={option.path}
            type="button"
            role="option"
            aria-selected="false"
            className="alias-option"
            data-testid={`alias-option-${option.path}`}
            onClick={() => {
              onPick(option.path);
            }}
          >
            {option.type && <TokenTypeIcon type={option.type} />}
            {option.path}
            {option.value !== "" && <span className="resolved">{option.value}</span>}
          </button>
        ))}
        {options.length === 0 && <p className="empty-state">No tokens match.</p>}
      </div>
    </div>
  );
}
