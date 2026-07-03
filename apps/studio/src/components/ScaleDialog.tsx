import { useMemo, useState } from "react";

import { DEFAULT_SCALE_STEPS, TokenParseError, planColorScale } from "@okeytokey/core";
import { Button, ColorSwatch, Field, TextInput } from "@okeytokey/ui";

import { cmdApplyFix } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";
import { Dialog } from "./dialogs.js";

/**
 * The deterministic Scale Generator (ADR 0006): pick a group with numeric
 * color anchors, preview the OKLCH-interpolated steps, apply through the
 * undo stack. No AI involved — same inputs, same outputs, every time.
 */
export function ScaleDialog({ onClose }: { onClose: () => void }) {
  const document = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const activeSet = useUiStore((state) => state.activeSet);
  const selection = useUiStore((state) => state.selection);

  // Prefill from the selected token's parent group.
  const initialGroup = selection ? selection.path.slice(0, selection.path.lastIndexOf(".")) : "";
  const [groupPath, setGroupPath] = useState(initialGroup);
  const [stepsText, setStepsText] = useState(DEFAULT_SCALE_STEPS.join(", "));
  const [lightEnd, setLightEnd] = useState("");
  const [darkEnd, setDarkEnd] = useState("");

  const setName = selection?.set ?? activeSet;

  const preview = useMemo(() => {
    if (setName === undefined || groupPath.trim() === "") {
      return { plan: undefined, error: "Pick a group with at least one numeric color anchor." };
    }
    const steps = stepsText
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((step) => Number.isInteger(step) && step > 0);
    try {
      return {
        plan: planColorScale(document, setName, groupPath.trim(), {
          steps,
          lightEnd: lightEnd.trim() === "" ? undefined : lightEnd.trim(),
          darkEnd: darkEnd.trim() === "" ? undefined : darkEnd.trim(),
        }),
        error: undefined,
      };
    } catch (planError) {
      // TokenParseError wraps issues in a "Token set X is invalid" header
      // meant for parse failures; here the issue text alone reads better.
      const message =
        planError instanceof TokenParseError
          ? planError.issues.map((issue) => issue.message).join(" ")
          : planError instanceof Error
            ? planError.message
            : String(planError);
      return { plan: undefined, error: message };
    }
  }, [document, setName, groupPath, stepsText, lightEnd, darkEnd]);

  const apply = () => {
    const plan = preview.plan;
    if (!plan || plan.generated.length === 0) return;
    execute(
      cmdApplyFix({
        label: `Generate ${String(plan.generated.length)} scale steps in ${plan.groupPath}`,
        apply: () => plan.apply(),
      }),
    );
    onClose();
  };

  return (
    <Dialog title="Generate scale steps" onClose={onClose}>
      <Field label="Group (with numeric color anchors)">
        {(id) => (
          <TextInput
            id={id}
            mono
            autoFocus
            placeholder="colors.blue"
            value={groupPath}
            data-testid="scale-group-input"
            onChange={(event) => {
              setGroupPath(event.target.value);
            }}
          />
        )}
      </Field>
      <Field label="Steps">
        {(id) => (
          <TextInput
            id={id}
            mono
            value={stepsText}
            data-testid="scale-steps-input"
            onChange={(event) => {
              setStepsText(event.target.value);
            }}
          />
        )}
      </Field>

      <div className="editor-grid-2">
        <Field label="Lightest end (optional)">
          {(id) => (
            <TextInput
              id={id}
              mono
              placeholder="auto with one anchor"
              value={lightEnd}
              data-testid="scale-light-end"
              onChange={(event) => {
                setLightEnd(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Darkest end (optional)">
          {(id) => (
            <TextInput
              id={id}
              mono
              placeholder="auto with one anchor"
              value={darkEnd}
              data-testid="scale-dark-end"
              onChange={(event) => {
                setDarkEnd(event.target.value);
              }}
            />
          )}
        </Field>
      </div>

      {preview.error !== undefined && <p className="editor-error">{preview.error}</p>}
      {preview.plan?.synthesized && (
        <p className="usage-empty" data-testid="scale-synthesized">
          Range endpoints{" "}
          {preview.plan.synthesized.lightEnd !== undefined &&
            `light ${preview.plan.synthesized.lightEnd}`}
          {preview.plan.synthesized.lightEnd !== undefined &&
          preview.plan.synthesized.darkEnd !== undefined
            ? " · "
            : ""}
          {preview.plan.synthesized.darkEnd !== undefined &&
            `dark ${preview.plan.synthesized.darkEnd}`}{" "}
          — derived from the anchor's hue; override above.
        </p>
      )}
      {preview.plan && (
        <div className="scale-preview" data-testid="scale-preview">
          {[...preview.plan.anchors, ...preview.plan.generated]
            .sort((a, b) => a.step - b.step)
            .map((entry) => (
              <div className="scale-preview-row" key={entry.path}>
                <ColorSwatch color={entry.value} />
                <code>{entry.path}</code>
                <span className="scale-value">{entry.value}</span>
                <span className={entry.anchor ? "scale-tag scale-tag--anchor" : "scale-tag"}>
                  {entry.anchor ? "anchor" : "new"}
                </span>
              </div>
            ))}
          {preview.plan.skipped.length > 0 && (
            <p className="usage-empty">
              Skipped {preview.plan.skipped.map((entry) => entry.step).join(", ")} — outside the
              anchor range. Set a lightest/darkest end above to include them.
            </p>
          )}
          {preview.plan.excludedAnchors.length > 0 && (
            <p className="editor-error">
              Not used as anchors: {preview.plan.excludedAnchors.join("; ")}
            </p>
          )}
        </div>
      )}

      <footer>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!preview.plan || preview.plan.generated.length === 0}
          onClick={apply}
          data-testid="scale-apply"
        >
          Generate {String(preview.plan?.generated.length ?? 0)} token(s)
        </Button>
      </footer>
    </Dialog>
  );
}
