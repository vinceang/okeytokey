import { useEffect, useState } from "react";

import {
  REM_BASE_PX,
  convertDimensionLiteral,
  parseQuantity,
  planDimensionUnitConversion,
  type DimensionUnit,
} from "@okeytokey/core";
import { Button, SegmentedControl } from "@okeytokey/ui";

import { cmdApplyFix } from "../../state/commands.js";
import { useDocumentStore } from "../../state/document-store.js";
import { useUiStore } from "../../state/ui-store.js";

/**
 * Dimension unit switcher (px / rem), the ColorFormatBar pattern applied to
 * units. Unlike color notation this changes the number, not just syntax —
 * converted at the CSS convention of 16px per rem, which the bar states.
 * Converting a group together keeps math expressions consistent (px and
 * rem never mix under the unit algebra).
 */

const UNITS = [
  { value: "px" as DimensionUnit, label: "px" },
  { value: "rem" as DimensionUnit, label: "rem" },
];

function detectUnit(value: string): DimensionUnit | undefined {
  const quantity = parseQuantity(value);
  return quantity?.unit === "px" || quantity?.unit === "rem" ? quantity.unit : undefined;
}

export function DimensionUnitBar({
  path,
  value,
  onCommit,
}: {
  path: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const selection = useUiStore((state) => state.selection);
  const execute = useDocumentStore((state) => state.execute);
  const [offer, setOffer] = useState<{ unit: DimensionUnit; count: number }>();

  useEffect(() => {
    setOffer(undefined);
  }, [path]);

  const current = detectUnit(value);
  if (current === undefined) return null;

  const groupPath = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : undefined;
  const groupName = groupPath?.slice(groupPath.lastIndexOf(".") + 1);

  const switchUnit = (unit: DimensionUnit) => {
    const converted = convertDimensionLiteral(value, unit);
    if (converted !== undefined && converted !== value) onCommit(converted);
    if (groupPath === undefined || !selection) {
      setOffer(undefined);
      return;
    }
    // Count siblings that would change (this token converts via onCommit, so
    // exclude it here; the store is pre-commit inside this handler).
    const plan = planDimensionUnitConversion(
      useDocumentStore.getState().document,
      selection.set,
      groupPath,
      unit,
    );
    const count = plan.entries.filter((entry) => entry.path !== path).length;
    setOffer(count > 0 ? { unit, count } : undefined);
  };

  const applyToGroup = () => {
    if (!offer || !selection || groupPath === undefined) return;
    // Recompute against the latest document (this token already converted).
    const plan = planDimensionUnitConversion(
      useDocumentStore.getState().document,
      selection.set,
      groupPath,
      offer.unit,
    );
    if (plan.entries.length > 0) {
      execute(
        cmdApplyFix({
          label: `Convert ${String(plan.entries.length)} dimension(s) in ${groupPath} to ${offer.unit}`,
          apply: () => plan.apply(),
        }),
      );
    }
    setOffer(undefined);
  };

  return (
    <div className="format-bar">
      <SegmentedControl
        aria-label="Dimension unit"
        options={UNITS}
        value={current}
        onChange={switchUnit}
      />
      <span className="unit-base-note">1rem = {String(REM_BASE_PX)}px</span>
      {offer && (
        <Button variant="secondary" onClick={applyToGroup} data-testid="unit-apply-group">
          Apply {offer.unit} to {String(offer.count)} more in {groupName ?? "group"}
        </Button>
      )}
    </div>
  );
}
