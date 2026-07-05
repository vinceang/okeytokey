import { useEffect, useState } from "react";

import { Button, TextInput } from "@okeytokey/ui";

interface GradientStop {
  color: string;
  position: number;
}

const DEFAULT_STOPS: GradientStop[] = [
  { color: "#3b82f6", position: 0 },
  { color: "#8b5cf6", position: 1 },
];

function parseStops(value: unknown): GradientStop[] {
  if (!Array.isArray(value) || value.length < 2) return DEFAULT_STOPS;
  return value.map((stop) => {
    const s = typeof stop === "object" && stop !== null ? (stop as Record<string, unknown>) : {};
    return {
      color: typeof s.color === "string" ? s.color : "#000000",
      position: typeof s.position === "number" ? Math.max(0, Math.min(1, s.position)) : 0,
    };
  });
}

function fromStops(stops: GradientStop[]): unknown {
  return stops.map((s) => ({ color: s.color, position: s.position }));
}

function toPickerHex(color: string): string {
  const short3m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short3m) {
    const [, r, g, b] = short3m;
    return `#${r ?? "0"}${r ?? "0"}${g ?? "0"}${g ?? "0"}${b ?? "0"}${b ?? "0"}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7).toLowerCase();
  return "#808080";
}

function gradientCSS(stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const colorStops = sorted.map((s) => `${s.color} ${Math.round(s.position * 100)}%`).join(", ");
  return `linear-gradient(to right, ${colorStops})`;
}

export function GradientEditor({
  value,
  onCommit,
}: {
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const [stops, setStops] = useState(() => parseStops(value));
  useEffect(() => {
    setStops(parseStops(value));
  }, [value]);

  const commit = (next: GradientStop[]) => {
    onCommit(fromStops(next));
  };

  const update = (index: number, patch: Partial<GradientStop>, immediate: boolean) => {
    const next = stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    setStops(next);
    if (immediate) commit(next);
  };

  const removeStop = (index: number) => {
    const next = stops.filter((_, i) => i !== index);
    setStops(next);
    commit(next);
  };

  const addStop = () => {
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    const last = sorted[sorted.length - 1]!;
    const secondLast = sorted[sorted.length - 2]!;
    const mid = (last.position + secondLast.position) / 2;
    const next = [...stops, { color: "#808080", position: mid }];
    setStops(next);
    commit(next);
  };

  return (
    <>
      <div
        className="gradient-preview"
        style={{ background: gradientCSS(stops) }}
        aria-hidden="true"
      />
      {stops.map((stop, index) => (
        <div className="gradient-stop" key={index}>
          <div className="gradient-stop-color-row">
            <input
              type="color"
              className="gradient-stop-swatch"
              value={toPickerHex(stop.color)}
              aria-label={`Stop ${String(index + 1)} color picker`}
              onChange={(e) => {
                update(index, { color: e.target.value }, false);
              }}
              onBlur={() => {
                commit(stops);
              }}
            />
            <TextInput
              mono
              value={stop.color}
              aria-label={`Stop ${String(index + 1)} color value`}
              onChange={(e) => {
                update(index, { color: e.target.value }, false);
              }}
              onBlur={() => {
                commit(stops);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(stops);
              }}
            />
          </div>
          <div className="gradient-stop-position-row">
            <input
              type="range"
              className="gradient-stop-slider"
              min={0}
              max={100}
              step={1}
              value={Math.round(stop.position * 100)}
              aria-label={`Stop ${String(index + 1)} position`}
              onChange={(e) => {
                update(index, { position: parseInt(e.target.value, 10) / 100 }, true);
              }}
            />
            <span className="gradient-stop-pct">{Math.round(stop.position * 100)}%</span>
            {stops.length > 2 && (
              <Button
                variant="danger"
                onClick={() => {
                  removeStop(index);
                }}
              >
                ✕
              </Button>
            )}
          </div>
        </div>
      ))}
      <Button variant="ghost" onClick={addStop}>
        + Add stop
      </Button>
    </>
  );
}
