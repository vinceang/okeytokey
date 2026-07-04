import { useMemo, useState } from "react";

import {
  DEFAULT_SCALE_STEPS,
  RATIO_PRESETS,
  TokenParseError,
  planDimensionScale,
  type DimensionScalePlan,
} from "@okeytokey/core";
import { Button, Field, Select, TextInput } from "@okeytokey/ui";

import { cmdApplyFix } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";
import { Dialog } from "./dialogs.js";

/**
 * Deterministic modular scale for dimensions/durations: value(step) =
 * base × ratio^offset (ADR 0006, "if it can be computed, compute it"). A
 * base and a ratio fully determine a spacing or type ramp — no AI. Existing
 * steps are kept; only the missing ones are generated. Preview, then apply
 * through the undo stack.
 */

function isNumericLeaf(path: string): boolean {
  return /^\d+$/.test(path.slice(path.lastIndexOf(".") + 1));
}

export function DimensionScaleDialog({ onClose }: { onClose: () => void }) {
  const document = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const activeSet = useUiStore((state) => state.activeSet);
  const selection = useUiStore((state) => state.selection);
  const select = useUiStore((state) => state.select);

  const setName = selection?.set ?? activeSet;
  const selectedToken =
    setName !== undefined && selection
      ? document.sets.get(setName)?.tokens.get(selection.path)
      : undefined;

  // Prefill the group from the selection (a numeric step → its parent group).
  const [groupPath, setGroupPath] = useState(() => {
    if (!selection) return "";
    return isNumericLeaf(selection.path)
      ? selection.path.slice(0, selection.path.lastIndexOf("."))
      : selection.path;
  });
  // Prefill the base from the selected token's value if it's a plain literal.
  const [base, setBase] = useState(() =>
    typeof selectedToken?.value === "string" && /\d/.test(selectedToken.value)
      ? selectedToken.value
      : "16px",
  );
  const [ratioText, setRatioText] = useState("1.5");
  const [baseStepText, setBaseStepText] = useState("500");
  const [stepsText, setStepsText] = useState(DEFAULT_SCALE_STEPS.join(", "));

  const tokenType = selectedToken?.type === "duration" ? "duration" : "dimension";

  const preview = useMemo<{ plan?: DimensionScalePlan; error?: string }>(() => {
    const target = groupPath.trim();
    if (setName === undefined || target === "") {
      return { error: "Pick a group to fill with numbered steps." };
    }
    const steps = stepsText
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((step) => Number.isInteger(step) && step > 0);
    const ratio = Number(ratioText.trim());
    const baseStep = Number(baseStepText.trim());
    try {
      return {
        plan: planDimensionScale(document, setName, target, {
          base: base.trim(),
          ratio,
          steps,
          baseStep,
          tokenType,
        }),
      };
    } catch (planError) {
      const message =
        planError instanceof TokenParseError
          ? planError.issues.map((issue) => issue.message).join(" ")
          : planError instanceof Error
            ? planError.message
            : String(planError);
      return { error: message };
    }
  }, [document, setName, groupPath, base, ratioText, baseStepText, stepsText, tokenType]);

  const plan = preview.plan;

  const apply = () => {
    if (!plan || plan.generated.length === 0 || setName === undefined) return;
    execute(
      cmdApplyFix({
        label: `Generate ${String(plan.generated.length)} ${plan.unit} steps in ${plan.groupPath}`,
        apply: () => plan.apply(),
      }),
    );
    select({ set: setName, path: `${plan.groupPath}.${String(plan.baseStep)}` });
    onClose();
  };

  return (
    <Dialog title="Generate spacing / size scale" onClose={onClose}>
      <Field label="Group of numbered steps">
        {(id) => (
          <TextInput
            id={id}
            mono
            autoFocus
            placeholder="spacing or type.size"
            value={groupPath}
            data-testid="dim-scale-group"
            onChange={(event) => {
              setGroupPath(event.target.value);
            }}
          />
        )}
      </Field>
      <Field label="Base value (its unit is the scale's unit)">
        {(id) => (
          <TextInput
            id={id}
            mono
            placeholder="16px"
            value={base}
            data-testid="dim-scale-base"
            onChange={(event) => {
              setBase(event.target.value);
            }}
          />
        )}
      </Field>

      <div className="editor-grid-2">
        <Field label="Ratio">
          {(id) => (
            <TextInput
              id={id}
              mono
              value={ratioText}
              data-testid="dim-scale-ratio"
              onChange={(event) => {
                setRatioText(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Base sits at step">
          {(id) => (
            <TextInput
              id={id}
              mono
              value={baseStepText}
              data-testid="dim-scale-base-step"
              onChange={(event) => {
                setBaseStepText(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
      <Field label="Ratio preset">
        {(id) => (
          <Select
            id={id}
            data-testid="dim-scale-preset"
            value={ratioText}
            onChange={(event) => {
              setRatioText(event.target.value);
            }}
          >
            <option value="">Custom…</option>
            {RATIO_PRESETS.map((preset) => (
              <option key={preset.name} value={String(preset.ratio)}>
                {preset.name} (×{preset.ratio})
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Steps">
        {(id) => (
          <TextInput
            id={id}
            mono
            value={stepsText}
            data-testid="dim-scale-steps"
            onChange={(event) => {
              setStepsText(event.target.value);
            }}
          />
        )}
      </Field>

      {preview.error !== undefined && <p className="editor-error">{preview.error}</p>}
      {plan && (
        <div className="scale-preview" data-testid="dim-scale-preview">
          {[...plan.anchors, ...plan.generated]
            .sort((a, b) => a.step - b.step)
            .map((entry) => (
              <div className="scale-preview-row" key={entry.path}>
                <code>{entry.path}</code>
                <span className="scale-value">{entry.value}</span>
                <span className={entry.anchor ? "scale-tag scale-tag--anchor" : "scale-tag"}>
                  {entry.anchor ? "kept" : "new"}
                </span>
              </div>
            ))}
        </div>
      )}

      <footer>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!plan || plan.generated.length === 0}
          onClick={apply}
          data-testid="dim-scale-apply"
        >
          Generate {String(plan?.generated.length ?? 0)} token(s)
        </Button>
      </footer>
    </Dialog>
  );
}
