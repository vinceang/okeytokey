import { useEffect, useState } from "react";

import {
  formatColor,
  isColor,
  parseColor,
  planColorFormatConversion,
  type ColorSpace,
} from "@okeytokey/core";
import { Button, SegmentedControl } from "@okeytokey/ui";

import { cmdApplyFix } from "../../state/commands.js";
import { useDocumentStore } from "../../state/document-store.js";
import { useUiStore } from "../../state/ui-store.js";

/**
 * Color notation switcher (hex / rgb / oklch). Switching converts this
 * token's literal — same color, different syntax — and then offers to
 * convert the rest of its group in one undoable command.
 */

const FORMATS = [
  { value: "hex" as ColorSpace, label: "hex" },
  { value: "rgb" as ColorSpace, label: "rgb" },
  { value: "oklch" as ColorSpace, label: "oklch" },
];

function detectFormat(value: string): ColorSpace | "" {
  if (value.startsWith("#")) return "hex";
  if (/^rgba?\(/.test(value)) return "rgb";
  if (value.startsWith("oklch(")) return "oklch";
  return "";
}

export function ColorFormatBar({
  path,
  value,
  onCommit,
  set,
}: {
  path: string;
  value: string;
  onCommit: (value: string) => void;
  /** Set the group conversion targets. Defaults to the active selection's set. */
  set?: string;
}) {
  const selection = useUiStore((state) => state.selection);
  const execute = useDocumentStore((state) => state.execute);
  const [offer, setOffer] = useState<{ format: ColorSpace; count: number }>();

  useEffect(() => {
    setOffer(undefined);
  }, [path]);

  if (!isColor(value)) return null;

  const targetSet = set ?? selection?.set;
  const groupPath = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : undefined;
  const groupName = groupPath?.slice(groupPath.lastIndexOf(".") + 1);

  const switchFormat = (format: ColorSpace) => {
    const converted = formatColor(parseColor(value), format);
    if (converted !== value) onCommit(converted);
    if (groupPath === undefined || targetSet === undefined) {
      setOffer(undefined);
      return;
    }
    // Count siblings that would change (this token converts via onCommit, so
    // exclude it here; the store is pre-commit inside this handler).
    const plan = planColorFormatConversion(
      useDocumentStore.getState().document,
      targetSet,
      groupPath,
      format,
    );
    const count = plan.entries.filter((entry) => entry.path !== path).length;
    setOffer(count > 0 ? { format, count } : undefined);
  };

  const applyToGroup = () => {
    if (!offer || targetSet === undefined || groupPath === undefined) return;
    // Recompute against the latest document (this token already converted).
    const plan = planColorFormatConversion(
      useDocumentStore.getState().document,
      targetSet,
      groupPath,
      offer.format,
    );
    if (plan.entries.length > 0) {
      execute(
        cmdApplyFix({
          label: `Convert ${String(plan.entries.length)} color(s) in ${groupPath} to ${offer.format}`,
          apply: () => plan.apply(),
        }),
      );
    }
    setOffer(undefined);
  };

  return (
    <div className="format-bar">
      <SegmentedControl
        aria-label="Color notation"
        options={FORMATS}
        value={detectFormat(value) as ColorSpace}
        onChange={switchFormat}
      />
      {offer && (
        <Button variant="secondary" onClick={applyToGroup} data-testid="format-apply-group">
          Apply {offer.format} to {String(offer.count)} more in {groupName ?? "group"}
        </Button>
      )}
    </div>
  );
}
