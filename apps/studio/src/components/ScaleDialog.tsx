import { useMemo, useState } from "react";

import {
  DEFAULT_SCALE_STEPS,
  TokenParseError,
  planColorScale,
  planColorScaleFromSeed,
  type ScalePlan,
  type SeedScalePlan,
} from "@okeytokey/core";
import { Button, ColorSwatch, Field, TextInput } from "@okeytokey/ui";

import { cmdApplyFix } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";
import { Dialog } from "./dialogs.js";

/**
 * The deterministic Scale Generator (ADR 0006): point it at a group with
 * numeric color anchors — or at a single flat color token ("red"), which
 * becomes its own scale's seed step with every reference following. Preview
 * first, apply through the undo stack. No AI — same inputs, same outputs.
 */

function isNumericLeaf(path: string): boolean {
  return /^\d+$/.test(path.slice(path.lastIndexOf(".") + 1));
}

export function ScaleDialog({ onClose }: { onClose: () => void }) {
  const document = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const activeSet = useUiStore((state) => state.activeSet);
  const selection = useUiStore((state) => state.selection);
  const select = useUiStore((state) => state.select);

  const setName = selection?.set ?? activeSet;

  // Prefill: a selected flat color token is itself the seed; a numeric step
  // (blue.500) means its parent group; anything else falls back to parent.
  const [groupPath, setGroupPath] = useState(() => {
    if (!selection) return "";
    const token =
      setName !== undefined ? document.sets.get(setName)?.tokens.get(selection.path) : undefined;
    if (token?.type === "color" && !isNumericLeaf(selection.path)) return selection.path;
    return selection.path.includes(".")
      ? selection.path.slice(0, selection.path.lastIndexOf("."))
      : selection.path;
  });
  const [stepsText, setStepsText] = useState(DEFAULT_SCALE_STEPS.join(", "));
  const [seedStepText, setSeedStepText] = useState("500");
  const [lightEnd, setLightEnd] = useState("");
  const [darkEnd, setDarkEnd] = useState("");

  const preview = useMemo<{
    plan?: ScalePlan;
    seed?: SeedScalePlan;
    error?: string;
    hint?: string;
  }>(() => {
    const target = groupPath.trim();
    if (setName === undefined || target === "") {
      return { error: "Pick a group with numeric color anchors, or a single color token." };
    }
    const steps = stepsText
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((step) => Number.isInteger(step) && step > 0);
    const options = {
      steps,
      lightEnd: lightEnd.trim() === "" ? undefined : lightEnd.trim(),
      darkEnd: darkEnd.trim() === "" ? undefined : darkEnd.trim(),
    };
    const describe = (planError: unknown) =>
      planError instanceof TokenParseError
        ? planError.issues.map((issue) => issue.message).join(" ")
        : planError instanceof Error
          ? planError.message
          : String(planError);

    // A flat color token is a seed, not a group.
    const token = document.sets.get(setName)?.tokens.get(target);
    if (token?.type === "color" && !isNumericLeaf(target)) {
      const seedStep = Number(seedStepText.trim());
      if (!Number.isInteger(seedStep) || seedStep <= 0) {
        return { error: "Seed step must be a positive whole number (e.g. 500)." };
      }
      try {
        return {
          seed: planColorScaleFromSeed(document, setName, target, { ...options, seedStep }),
        };
      } catch (planError) {
        return { error: describe(planError) };
      }
    }

    try {
      return { plan: planColorScale(document, setName, target, options) };
    } catch (planError) {
      const message = describe(planError);
      return {
        error: message,
        hint: message.includes("No numeric color anchors")
          ? 'Point at a group whose children are numbered steps (like blue.500) — or at a single color token (like "colors.red") to build a scale around it.'
          : undefined,
      };
    }
  }, [document, setName, groupPath, stepsText, seedStepText, lightEnd, darkEnd]);

  const activePlan = preview.seed?.scale ?? preview.plan;

  const apply = () => {
    if (!activePlan || activePlan.generated.length === 0 || setName === undefined) return;
    const seed = preview.seed;
    if (seed) {
      execute(
        cmdApplyFix({
          label: `Generate scale around ${seed.seedPath}`,
          apply: () => seed.apply(),
        }),
      );
      // The flat token no longer exists — land on its seed step.
      select({ set: setName, path: `${seed.seedPath}.${String(seed.seedStep)}` });
    } else {
      const plan = preview.plan;
      if (!plan) return;
      execute(
        cmdApplyFix({
          label: `Generate ${String(plan.generated.length)} scale steps in ${plan.groupPath}`,
          apply: () => plan.apply(),
        }),
      );
    }
    onClose();
  };

  return (
    <Dialog title="Generate scale steps" onClose={onClose}>
      <Field label="Group of numbered steps — or a single color token">
        {(id) => (
          <TextInput
            id={id}
            mono
            autoFocus
            placeholder="colors.blue or colors.red"
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

      {preview.seed && (
        <>
          <p className="usage-empty" data-testid="scale-seed-note">
            <code>{preview.seed.seedPath}</code> is a single color, not a group of steps. It will
            become <code>{`${preview.seed.seedPath}.${String(preview.seed.seedStep)}`}</code>
            {preview.seed.referenceEdits > 0 &&
              ` (${String(preview.seed.referenceEdits)} reference(s) follow automatically)`}{" "}
            and the scale fills in around it.
          </p>
          <Field label="The seed becomes step">
            {(id) => (
              <TextInput
                id={id}
                mono
                value={seedStepText}
                data-testid="scale-seed-step"
                onChange={(event) => {
                  setSeedStepText(event.target.value);
                }}
              />
            )}
          </Field>
        </>
      )}

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
      {preview.hint !== undefined && (
        <p className="usage-empty" data-testid="scale-hint">
          {preview.hint}
        </p>
      )}
      {activePlan?.synthesized && (
        <p className="usage-empty" data-testid="scale-synthesized">
          Range endpoints{" "}
          {activePlan.synthesized.lightEnd !== undefined &&
            `light ${activePlan.synthesized.lightEnd}`}
          {activePlan.synthesized.lightEnd !== undefined &&
          activePlan.synthesized.darkEnd !== undefined
            ? " · "
            : ""}
          {activePlan.synthesized.darkEnd !== undefined && `dark ${activePlan.synthesized.darkEnd}`}{" "}
          — derived from the anchor's hue; override above.
        </p>
      )}
      {activePlan && (
        <div className="scale-preview" data-testid="scale-preview">
          {[...activePlan.anchors, ...activePlan.generated]
            .sort((a, b) => a.step - b.step)
            .map((entry) => (
              <div className="scale-preview-row" key={entry.path}>
                <ColorSwatch color={entry.value} />
                <code>{entry.path}</code>
                <span className="scale-value">{entry.value}</span>
                <span className={entry.anchor ? "scale-tag scale-tag--anchor" : "scale-tag"}>
                  {entry.anchor ? (preview.seed ? "seed" : "anchor") : "new"}
                </span>
              </div>
            ))}
          {activePlan.skipped.length > 0 && (
            <p className="usage-empty">
              Skipped {activePlan.skipped.map((entry) => entry.step).join(", ")} — outside the
              anchor range. Set a lightest/darkest end above to include them.
            </p>
          )}
          {activePlan.excludedAnchors.length > 0 && (
            <p className="editor-error">
              Not used as anchors: {activePlan.excludedAnchors.join("; ")}
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
          disabled={!activePlan || activePlan.generated.length === 0}
          onClick={apply}
          data-testid="scale-apply"
        >
          Generate {String(activePlan?.generated.length ?? 0)} token(s)
        </Button>
      </footer>
    </Dialog>
  );
}
