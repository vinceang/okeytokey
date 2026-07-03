import { useEffect, useState, type ReactNode } from "react";

import type { Theme, SetStatus } from "@okeytokey/core";
import { DTCG_TOKEN_TYPES, type DtcgTokenType } from "@okeytokey/schema";
import { Button, Field, SegmentedControl, Select, TextInput } from "@okeytokey/ui";

import { cmdCreateToken } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // ARIA dialog pattern: Escape closes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const DEFAULT_VALUES: Partial<Record<DtcgTokenType, string>> = {
  color: "#808080",
  dimension: "16px",
  number: "1",
  duration: "200ms",
  fontWeight: "400",
  fontFamily: "sans-serif",
};

/** Parse the free-text initial value appropriately for the chosen type. */
function parseInitialValue(type: DtcgTokenType, text: string): unknown {
  const trimmed = text.trim();
  if (type === "number" || type === "fontWeight") {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && trimmed !== "") return numeric;
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.includes(":")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through to string */
    }
  }
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through to string */
    }
  }
  return trimmed;
}

export function NewTokenDialog({ setName, onClose }: { setName: string; onClose: () => void }) {
  const execute = useDocumentStore((state) => state.execute);
  const select = useUiStore((state) => state.select);
  const [path, setPath] = useState("");
  const [type, setType] = useState<DtcgTokenType>("color");
  const [value, setValue] = useState(DEFAULT_VALUES.color ?? "");
  const [error, setError] = useState<string>();

  const create = () => {
    try {
      execute(
        cmdCreateToken(setName, path.trim(), { type, value: parseInitialValue(type, value) }),
      );
      select({ set: setName, path: path.trim() });
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    }
  };

  return (
    <Dialog title={`New token in ${setName}`} onClose={onClose}>
      <Field label="Path">
        {(id) => (
          <TextInput
            id={id}
            mono
            autoFocus
            placeholder="colors.brand.500"
            value={path}
            data-testid="new-token-path"
            onChange={(event) => {
              setPath(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && path.trim() !== "") create();
            }}
          />
        )}
      </Field>
      <Field label="Type">
        {(id) => (
          <Select
            id={id}
            value={type}
            data-testid="new-token-type"
            onChange={(event) => {
              const nextType = event.target.value as DtcgTokenType;
              setType(nextType);
              setValue(DEFAULT_VALUES[nextType] ?? "");
            }}
          >
            {DTCG_TOKEN_TYPES.map((tokenType) => (
              <option key={tokenType} value={tokenType}>
                {tokenType}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Initial value" error={error}>
        {(id) => (
          <TextInput
            id={id}
            mono
            value={value}
            data-testid="new-token-value"
            placeholder='#3b82f6, 16px, or {"fontSize": "16px"}'
            onChange={(event) => {
              setValue(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && path.trim() !== "") create();
            }}
          />
        )}
      </Field>
      <footer>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={path.trim() === ""}
          onClick={create}
          data-testid="create-token"
        >
          Create
        </Button>
      </footer>
    </Dialog>
  );
}

const STATUS_OPTIONS = [
  { value: "enabled" as SetStatus, label: "Enabled" },
  { value: "source" as SetStatus, label: "Source" },
  { value: "disabled" as SetStatus, label: "Off" },
];

export function ThemeDialog({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const document = useDocumentStore((state) => state.document);
  const themes = useDocumentStore((state) => state.themes);
  const setThemes = useDocumentStore((state) => state.setThemes);

  const statusOf = (setName: string): SetStatus =>
    theme.sets.find((entry) => entry.set === setName)?.status ?? "disabled";

  const updateStatus = (setName: string, status: SetStatus) => {
    const allSets = [...document.sets.keys()];
    const nextSets = allSets
      .map((name) => ({ set: name, status: name === setName ? status : statusOf(name) }))
      .filter(
        (entry) =>
          entry.status !== "disabled" ||
          theme.sets.some((existing) => existing.set === entry.set) ||
          entry.set === setName,
      );
    setThemes(
      themes.map((candidate) =>
        candidate.name === theme.name ? { ...candidate, sets: nextSets } : candidate,
      ),
    );
  };

  const remove = () => {
    setThemes(themes.filter((candidate) => candidate.name !== theme.name));
    onClose();
  };

  const setGroup = (group: string) => {
    setThemes(
      themes.map((candidate) =>
        candidate.name === theme.name
          ? { ...candidate, group: group.trim() === "" ? undefined : group.trim() }
          : candidate,
      ),
    );
  };

  const current = themes.find((candidate) => candidate.name === theme.name) ?? theme;

  return (
    <Dialog title={`Theme: ${theme.name}`} onClose={onClose}>
      <Field label="Group (dimension, e.g. mode or brand)">
        {(id) => (
          <TextInput
            id={id}
            key={`${theme.name}-group-${current.group ?? ""}`}
            defaultValue={current.group ?? ""}
            placeholder="mode"
            data-testid="theme-group-input"
            onBlur={(event) => {
              if (event.target.value.trim() !== (current.group ?? "")) {
                setGroup(event.target.value);
              }
            }}
          />
        )}
      </Field>
      {[...document.sets.keys()].map((setName) => (
        <div className="editor-row" key={setName} style={{ justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
            {setName}
          </span>
          <SegmentedControl
            aria-label={`Status of ${setName}`}
            options={STATUS_OPTIONS}
            value={current.sets.find((entry) => entry.set === setName)?.status ?? "disabled"}
            onChange={(status) => {
              updateStatus(setName, status);
            }}
          />
        </div>
      ))}
      <footer>
        <Button variant="danger" onClick={remove}>
          Delete theme
        </Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </footer>
    </Dialog>
  );
}
