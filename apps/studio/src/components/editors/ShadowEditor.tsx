import { useEffect, useState } from "react";

import { Button, Field, TextInput } from "@okeytokey/ui";

/**
 * Shadow stack editor. The DTCG value is one layer object or an array of
 * layers; this editor always works on the array form and commits back a
 * single object when there's exactly one layer.
 */
interface LayerDraft {
  color: string;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  inset: boolean;
}

const EMPTY_LAYER: LayerDraft = {
  color: "#00000040",
  offsetX: "0px",
  offsetY: "2px",
  blur: "4px",
  spread: "0px",
  inset: false,
};

const DIMENSION_KEYS = ["offsetX", "offsetY", "blur", "spread"] as const;

function toDrafts(value: unknown): LayerDraft[] {
  const layers = Array.isArray(value) ? value : [value];
  return layers.map((layer) => {
    const record =
      typeof layer === "object" && layer !== null ? (layer as Record<string, unknown>) : {};
    const text = (key: string) => {
      const sub = record[key];
      return typeof sub === "string" || typeof sub === "number" ? String(sub) : "";
    };
    return {
      color: text("color"),
      offsetX: text("offsetX"),
      offsetY: text("offsetY"),
      blur: text("blur"),
      spread: text("spread"),
      inset: record.inset === true,
    };
  });
}

function fromDrafts(drafts: LayerDraft[]): unknown {
  const layers = drafts.map((draft) => {
    const layer: Record<string, unknown> = {
      color: draft.color,
      offsetX: draft.offsetX,
      offsetY: draft.offsetY,
      blur: draft.blur,
      spread: draft.spread,
    };
    if (draft.inset) layer.inset = true;
    return layer;
  });
  return layers.length === 1 ? layers[0] : layers;
}

export function ShadowEditor({
  value,
  onCommit,
}: {
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const [drafts, setDrafts] = useState(() => toDrafts(value));
  useEffect(() => {
    setDrafts(toDrafts(value));
  }, [value]);

  const update = (index: number, patch: Partial<LayerDraft>, commit: boolean) => {
    const next = drafts.map((layer, i) => (i === index ? { ...layer, ...patch } : layer));
    setDrafts(next);
    if (commit) onCommit(fromDrafts(next));
  };

  return (
    <>
      {drafts.map((layer, index) => (
        // Layers have no stable identity; index keys are intentional here.
        <div className="shadow-layer" key={index}>
          <Field label="Color">
            {(id) => (
              <TextInput
                id={id}
                mono
                value={layer.color}
                onChange={(event) => {
                  update(index, { color: event.target.value }, false);
                }}
                onBlur={() => {
                  onCommit(fromDrafts(drafts));
                }}
              />
            )}
          </Field>
          <div className="editor-grid-2">
            {DIMENSION_KEYS.map((key) => (
              <Field key={key} label={key}>
                {(id) => (
                  <TextInput
                    id={id}
                    mono
                    value={layer[key]}
                    onChange={(event) => {
                      update(index, { [key]: event.target.value }, false);
                    }}
                    onBlur={() => {
                      onCommit(fromDrafts(drafts));
                    }}
                  />
                )}
              </Field>
            ))}
          </div>
          <div className="editor-row">
            <label style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={layer.inset}
                onChange={(event) => {
                  update(index, { inset: event.target.checked }, true);
                }}
              />{" "}
              Inset
            </label>
            {drafts.length > 1 && (
              <Button
                variant="danger"
                onClick={() => {
                  const next = drafts.filter((_, i) => i !== index);
                  setDrafts(next);
                  onCommit(fromDrafts(next));
                }}
              >
                Remove layer
              </Button>
            )}
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        onClick={() => {
          const next = [...drafts, EMPTY_LAYER];
          setDrafts(next);
          onCommit(fromDrafts(next));
        }}
      >
        + Add layer
      </Button>
    </>
  );
}
