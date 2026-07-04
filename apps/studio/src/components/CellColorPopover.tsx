import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { isColor, type Resolver } from "@okeytokey/core";
import { isReference, makeReference, referencePath } from "@okeytokey/schema";
import { Button, ReferencePill } from "@okeytokey/ui";

import { AliasPicker } from "./editors/AliasPicker.js";
import { ColorEditor } from "./editors/ColorEditor.js";

/**
 * Figma-style color cell popover: click a color cell and pick — swatch +
 * native picker + free text + OKLCH sliders (the existing ColorEditor), plus
 * "reference another token" as the Libraries-tab equivalent. Commits apply
 * live while the popover stays open; Escape or clicking outside closes it.
 * Rendered in a portal because the grid's scroll container clips (contain:
 * strict) — the popover is positioned fixed against the cell's rect.
 */

const POPOVER_WIDTH = 300;
const POPOVER_MAX_HEIGHT = 380;

export function CellColorPopover({
  anchor,
  raw,
  seed,
  path,
  resolver,
  onApply,
  onClose,
}: {
  /** Ref to the cell element the popover attaches to. */
  anchor: React.RefObject<HTMLElement | null>;
  /** The raw stored value (alias, function, or literal). */
  raw: string;
  /** A concrete color to seed the editor with (resolved when raw isn't one). */
  seed: string;
  path: string;
  resolver: Resolver;
  onApply: (value: string) => void;
  onClose: () => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number }>();
  const [linking, setLinking] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    const below = rect.bottom + 4;
    const top =
      below + POPOVER_MAX_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - POPOVER_MAX_HEIGHT - 4)
        : below;
    setPosition({ top, left });
  }, [anchor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    // No blocking backdrop: clicking outside closes the popover AND the
    // click lands where it was aimed (Figma behavior). The listener attaches
    // after the opening click's cycle, so opening doesn't self-close.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchor.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose, anchor]);

  if (!position) return null;

  return createPortal(
    <>
      <div
        ref={popoverRef}
        className="cell-popover"
        style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
        role="dialog"
        aria-label={`Edit ${path}`}
        data-testid="cell-popover"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {isReference(raw) && (
          <div className="cell-popover-reference">
            <ReferencePill path={referencePath(raw)} />
            <span className="cell-popover-hint">picking a color detaches this reference</span>
          </div>
        )}
        <ColorEditor value={isColor(raw) ? raw : seed} onCommit={onApply} />
        {linking ? (
          <div className="alias-picker--inline">
            <AliasPicker
              resolver={resolver}
              excludePath={path}
              onPick={(target) => {
                setLinking(false);
                onApply(makeReference(target));
              }}
              onClose={() => {
                setLinking(false);
              }}
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            data-testid="cell-popover-reference"
            onClick={() => {
              setLinking(true);
            }}
          >
            ⤳ Reference another token…
          </Button>
        )}
      </div>
    </>,
    window.document.body,
  );
}
