import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  formatColor,
  isColor,
  parseColor,
  suggestColors,
  suggestQuantitySteps,
  type Resolver,
  type SetStatus,
  type Theme,
  type TokenSet,
  type ValueSuggestion,
} from "@okeytokey/core";
import { DTCG_TOKEN_TYPES, makeReference, type DtcgTokenType } from "@okeytokey/schema";
import { Button, ColorSwatch, Field, SegmentedControl, Select, TextInput } from "@okeytokey/ui";

import { GOOGLE_FONTS, FONT_WEIGHTS, SYSTEM_FONT_STACKS } from "../data/fonts.js";
import { cmdCreateToken } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";
import { AliasPicker } from "./editors/AliasPicker.js";

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

/**
 * Infer the type a new token at `path` would naturally take: the effective
 * type of existing tokens under the nearest ancestor group, when they agree.
 * Covers both group `$type` inheritance and de facto conventions; ambiguous
 * or empty ancestors return undefined (keep whatever is selected).
 */
function inferTypeForPath(set: TokenSet, path: string): DtcgTokenType | undefined {
  const segments = path.split(".").slice(0, -1);
  while (segments.length > 0) {
    const prefix = `${segments.join(".")}.`;
    const types = new Set<DtcgTokenType>();
    for (const token of set.tokens.values()) {
      if (token.pathString.startsWith(prefix)) types.add(token.type);
    }
    if (types.size === 1) return [...types][0];
    if (types.size > 1) return undefined; // mixed group — don't guess
    segments.pop(); // empty group — look one level up
  }
  return undefined;
}

/** Computed value suggestions as clickable chips (swatch for colors). */
function SuggestionChips({
  suggestions,
  onPick,
}: {
  suggestions: readonly ValueSuggestion[];
  onPick: (value: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="suggestion-chips" data-testid="value-suggestions">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.value}
          type="button"
          className="suggestion-chip"
          title={suggestion.reason}
          onClick={() => {
            onPick(suggestion.value);
          }}
        >
          {isColor(suggestion.value) && <ColorSwatch color={suggestion.value} />}
          <code>{suggestion.value}</code>
          <span className="suggestion-reason">{suggestion.reason}</span>
        </button>
      ))}
    </div>
  );
}

export function NewTokenDialog({
  setName,
  resolver,
  onClose,
}: {
  setName: string;
  resolver: Resolver;
  onClose: () => void;
}) {
  const document = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const select = useUiStore((state) => state.select);
  const [path, setPath] = useState("");
  const [type, setType] = useState<DtcgTokenType>("color");
  const [typeTouched, setTypeTouched] = useState(false);
  const [value, setValue] = useState(DEFAULT_VALUES.color ?? "");
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState(false);

  // Deterministic suggestions from what's already in the document.
  const suggestions = useMemo<readonly ValueSuggestion[]>(() => {
    if (type === "color") return suggestColors(document, setName, path.trim());
    if (type === "dimension" || type === "duration") {
      const set = document.sets.get(setName);
      const groupPath = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : "";
      return set ? suggestQuantitySteps(set, groupPath) : [];
    }
    return [];
  }, [document, setName, path, type]);

  // Dedup nudge: the typed color already exists as a token — alias it.
  const duplicateOf = useMemo(() => {
    if (type !== "color" || !isColor(value)) return undefined;
    const hex = formatColor(parseColor(value), "hex");
    for (const candidate of resolver.visiblePaths()) {
      const resolved = (() => {
        try {
          return resolver.resolve(candidate);
        } catch {
          return undefined;
        }
      })();
      if (typeof resolved?.value !== "string" || !isColor(resolved.value)) continue;
      if (formatColor(parseColor(resolved.value), "hex") === hex) return candidate;
    }
    return undefined;
  }, [type, value, resolver]);

  /** In-document font families, for the picker's first group. */
  const documentFonts = useMemo(() => {
    if (type !== "fontFamily") return [];
    const fonts = new Set<string>();
    for (const set of document.sets.values()) {
      for (const token of set.tokens.values()) {
        if (token.type === "fontFamily" && typeof token.value === "string") {
          fonts.add(token.value);
        }
      }
    }
    return [...fonts];
  }, [document, type]);

  /** The native picker needs opaque #rrggbb; anything else disables it. */
  const pickerHex = useMemo(() => {
    if (type !== "color" || !isColor(value)) return undefined;
    return formatColor(parseColor(value), "hex").slice(0, 7);
  }, [type, value]);

  const onPathChange = (nextPath: string) => {
    setPath(nextPath);
    if (typeTouched) return;
    const set = document.sets.get(setName);
    const inferred = set ? inferTypeForPath(set, nextPath.trim()) : undefined;
    if (inferred !== undefined && inferred !== type) {
      setType(inferred);
      // Follow with the matching default only while the value is untouched.
      if (value === (DEFAULT_VALUES[type] ?? "")) setValue(DEFAULT_VALUES[inferred] ?? "");
    }
  };

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
              onPathChange(event.target.value);
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
              setTypeTouched(true);
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
      {type === "fontFamily" && (
        <Field label="Pick a family (or type below)">
          {(id) => (
            <Select
              id={id}
              value=""
              data-testid="font-family-picker"
              onChange={(event) => {
                if (event.target.value !== "") setValue(event.target.value);
              }}
            >
              <option value="">Choose…</option>
              {documentFonts.length > 0 && (
                <optgroup label="In your tokens">
                  {documentFonts.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="System stacks">
                {SYSTEM_FONT_STACKS.map((stack) => (
                  <option key={stack.label} value={stack.value}>
                    {stack.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Google Fonts">
                {GOOGLE_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </optgroup>
            </Select>
          )}
        </Field>
      )}
      {type === "fontWeight" && (
        <Field label="Pick a weight (or type below)">
          {(id) => (
            <Select
              id={id}
              value=""
              data-testid="font-weight-picker"
              onChange={(event) => {
                if (event.target.value !== "") setValue(event.target.value);
              }}
            >
              <option value="">Choose…</option>
              {FONT_WEIGHTS.map((weight) => (
                <option key={weight.value} value={String(weight.value)}>
                  {weight.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label="Initial value" error={error}>
        {(id) => (
          <div className="value-with-picker">
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
            {type === "color" && (
              <input
                type="color"
                className="new-token-color-picker"
                aria-label="Pick a color"
                data-testid="new-token-color-picker"
                value={pickerHex ?? "#808080"}
                onChange={(event) => {
                  setValue(event.target.value);
                }}
              />
            )}
          </div>
        )}
      </Field>

      <SuggestionChips suggestions={suggestions} onPick={setValue} />

      {duplicateOf !== undefined && value !== makeReference(duplicateOf) && (
        <button
          type="button"
          className="suggestion-chip"
          data-testid="duplicate-alias-nudge"
          onClick={() => {
            setValue(makeReference(duplicateOf));
          }}
        >
          <code>{value}</code>
          <span className="suggestion-reason">
            already exists as {duplicateOf} — reference it instead
          </span>
        </button>
      )}

      <div className="editor-row">
        <Button
          variant="ghost"
          data-testid="new-token-reference"
          onClick={() => {
            setPicking(true);
          }}
        >
          ⤳ Reference an existing token…
        </Button>
      </div>
      {picking && (
        <div className="alias-picker alias-picker--inline">
          <AliasPicker
            resolver={resolver}
            excludePath={path.trim()}
            onPick={(target) => {
              setValue(makeReference(target));
              if (!typeTouched) {
                const targetType = resolver.lookup(target)?.type;
                if (targetType !== undefined) setType(targetType);
              }
              setPicking(false);
            }}
            onClose={() => {
              setPicking(false);
            }}
          />
        </div>
      )}

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
