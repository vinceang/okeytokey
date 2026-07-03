import { useEffect, useState } from "react";

import { formatColor, gamutWarning, isColor, parseColor } from "@okeytokey/core";
import { ColorSwatch, TextInput } from "@okeytokey/ui";

/**
 * OKLCH-capable color editor: free text (any CSS color syntax) + L/C/H(/A)
 * sliders operating in OKLCH. Slider edits emit oklch() strings; the text
 * field keeps whatever syntax the user wrote.
 */
export interface ColorEditorProps {
  value: string;
  onCommit: (value: string) => void;
}

interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

function toOklch(value: string): Oklch | undefined {
  if (!isColor(value)) return undefined;
  const css = formatColor(parseColor(value), "oklch");
  const match = /oklch\(([\d.]+)%?\s+([\d.]+)\s+([\d.]+)?/.exec(css);
  if (!match?.[1] || !match[2]) return undefined;
  const parsed = parseColor(value).color;
  return {
    l: Number(match[1]),
    c: Number(match[2]),
    h: Number(match[3] ?? 0),
    alpha: parsed.alpha ?? 1,
  };
}

function oklchCss({ l, c, h, alpha }: Oklch): string {
  const base = `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)}`;
  return alpha < 1 ? `${base} / ${alpha.toFixed(2)})` : `${base})`;
}

const SLIDERS = [
  { key: "l", label: "L", min: 0, max: 1, step: 0.001 },
  { key: "c", label: "C", min: 0, max: 0.4, step: 0.001 },
  { key: "h", label: "H", min: 0, max: 360, step: 0.5 },
  { key: "alpha", label: "A", min: 0, max: 1, step: 0.01 },
] as const;

export function ColorEditor({ value, onCommit }: ColorEditorProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const valid = isColor(draft);
  const warning = valid ? gamutWarning(parseColor(draft)) : undefined;
  const oklch = valid ? toOklch(draft) : undefined;

  const commitText = () => {
    if (draft !== value && valid) onCommit(draft);
    if (!valid) setDraft(value);
  };

  return (
    <>
      <div className="editor-row">
        <ColorSwatch color={valid ? draft : "transparent"} gamutWarning={warning !== undefined} />
        <TextInput
          mono
          value={draft}
          aria-invalid={!valid}
          aria-label="Color value"
          data-testid="color-input"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitText();
          }}
        />
      </div>
      {oklch && (
        <div className="oklch-sliders">
          {SLIDERS.map(({ key, label, min, max, step }) => (
            <label key={key}>
              {label}
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={oklch[key]}
                onChange={(event) => {
                  const next = oklchCss({ ...oklch, [key]: Number(event.target.value) });
                  setDraft(next);
                  onCommit(next);
                }}
              />
              <span>{oklch[key].toFixed(key === "h" ? 1 : 3)}</span>
            </label>
          ))}
        </div>
      )}
      {warning && <p className="gamut-note">{warning.message}</p>}
    </>
  );
}
