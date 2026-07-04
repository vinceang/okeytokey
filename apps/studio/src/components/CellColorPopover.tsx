import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { isColor, type Resolver } from "@okeytokey/core";
import { isReference, makeReference, referencePath } from "@okeytokey/schema";
import { Button, ReferencePill } from "@okeytokey/ui";

import { AliasPicker } from "./editors/AliasPicker.js";
import { ColorEditor } from "./editors/ColorEditor.js";
import { ColorFormatBar } from "./editors/ColorFormatBar.js";

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
  set,
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
  /** The set this cell's value lives in (where a group conversion applies). */
  set: string;
  resolver: Resolver;
  onApply: (value: string) => void;
  onClose: () => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number }>();
  const [linking, setLinking] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position adjacent to the anchor (the swatch): below it by default, above
  // when there's no room below, and — only when neither fits — clamped to stay
  // on-screen without flinging the popover across the viewport. Measured from
  // the popover's real height so a short (no-reference) popover hugs the cell.
  // Re-runs when `linking` toggles because the alias picker changes the height.
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!anchor.current || !el) return;
    const rect = anchor.current.getBoundingClientRect();
    const height = Math.min(el.offsetHeight, POPOVER_MAX_HEIGHT);
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - margin));
    const below = rect.bottom + 4;
    const above = rect.top - height - 4;
    const top =
      below + height + margin <= window.innerHeight
        ? below
        : above >= margin
          ? above
          : Math.max(margin, window.innerHeight - height - margin);
    setPosition({ top, left });
  }, [anchor, linking]);

  // Keyboard: move focus into the popover on open (the color text field), and
  // restore it to the swatch trigger on close, so Tab/arrow keys land on the
  // controls instead of skipping to the next cell. Focus must wait until the
  // popover is positioned — it renders visibility:hidden for the measuring
  // pass, and a hidden element can't take focus. Tab is trapped to the dialog
  // (below) so keyboard users don't fall out into the page behind it.
  const focusedRef = useRef(false);
  useLayoutEffect(() => {
    if (!position || focusedRef.current) return;
    focusedRef.current = true;
    const input = popoverRef.current?.querySelector<HTMLInputElement>(
      '[data-testid="color-input"]',
    );
    (input ?? popoverRef.current)?.focus();
    input?.select();
  }, [position]);

  useEffect(() => {
    const trigger = anchor.current;
    return () => {
      trigger?.focus();
    };
  }, [anchor]);

  const focusables = () =>
    Array.from(
      popoverRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

  const onDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = window.document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

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

  return createPortal(
    <>
      <div
        ref={popoverRef}
        className="cell-popover"
        style={{
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          width: POPOVER_WIDTH,
          // Hidden for the first layout pass so the height can be measured
          // before the popover paints at its final, adjacent position.
          visibility: position ? "visible" : "hidden",
        }}
        role="dialog"
        aria-label={`Edit ${path}`}
        data-testid="cell-popover"
        onClick={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={onDialogKeyDown}
      >
        {isReference(raw) && (
          <div className="cell-popover-reference">
            <ReferencePill path={referencePath(raw)} />
            <span className="cell-popover-hint">picking a color detaches this reference</span>
          </div>
        )}
        <ColorEditor value={isColor(raw) ? raw : seed} onCommit={onApply} />
        {isColor(raw) && <ColorFormatBar path={path} value={raw} set={set} onCommit={onApply} />}
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
