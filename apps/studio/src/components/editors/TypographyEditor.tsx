import { useEffect, useState } from "react";

import { Field, TextInput } from "@okeytokey/ui";

/**
 * Typography composer: one field per sub-property. Fields hold raw strings
 * (values, references, or expressions); empty fields are omitted from the
 * committed composite.
 */
const FIELDS = [
  { key: "fontFamily", label: "Font family" },
  { key: "fontSize", label: "Size" },
  { key: "fontWeight", label: "Weight" },
  { key: "lineHeight", label: "Line height" },
  { key: "letterSpacing", label: "Letter spacing" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

function toDrafts(value: unknown): Record<FieldKey, string> {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const drafts = {} as Record<FieldKey, string>;
  for (const { key } of FIELDS) {
    const sub = record[key];
    drafts[key] =
      sub === undefined
        ? ""
        : typeof sub === "string" || typeof sub === "number"
          ? String(sub)
          : JSON.stringify(sub);
  }
  return drafts;
}

export function TypographyEditor({
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

  const commit = (next: Record<FieldKey, string>) => {
    const composite: Record<string, unknown> = {};
    for (const { key } of FIELDS) {
      const text = next[key].trim();
      if (text === "") continue;
      const numeric = Number(text);
      composite[key] =
        (key === "lineHeight" || key === "fontWeight") && Number.isFinite(numeric) && text !== ""
          ? numeric
          : text;
    }
    onCommit(composite);
  };

  return (
    <div className="editor-grid-2">
      {FIELDS.map(({ key, label }) => (
        <Field key={key} label={label}>
          {(id) => (
            <TextInput
              id={id}
              mono
              value={drafts[key]}
              onChange={(event) => {
                setDrafts({ ...drafts, [key]: event.target.value });
              }}
              onBlur={() => {
                commit(drafts);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit(drafts);
              }}
            />
          )}
        </Field>
      ))}
    </div>
  );
}
