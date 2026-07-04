import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@okeytokey/ui";

/**
 * A kebab (⋮) menu for a row or column header. Destructive and out-of-the-way
 * actions live here rather than as bare inline buttons, so a single misclick
 * can't wipe a token set. Children receive `close` to dismiss the menu after
 * acting. The popover renders in a portal with fixed positioning so clipping
 * scroll containers (the treegrid uses `contain: strict`) can't cut it off.
 */
export function RowMenu({
  label,
  testId,
  icon = "⋮",
  children,
}: {
  label: string;
  testId?: string;
  /** Trigger glyph; defaults to the kebab. */
  icon?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number }>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((value) => !value);
  };

  return (
    <div className="row-menu" ref={wrapRef} data-open={open}>
      <Button
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        data-testid={testId}
        onClick={toggle}
      >
        {icon}
      </Button>
      {open &&
        createPortal(
          <>
            <div className="row-menu-backdrop" onClick={close} />
            <div
              className="row-menu-popover row-menu-popover--portal"
              role="menu"
              style={{ top: position?.top, right: position?.right }}
            >
              {children(close)}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
