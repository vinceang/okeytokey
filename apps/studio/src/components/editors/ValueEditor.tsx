import { useEffect, useState } from "react";

import type { Resolver, TokenNode } from "@okeytokey/core";
import { isReference, makeReference, referencePath } from "@okeytokey/schema";
import { Button, ReferencePill, SegmentedControl, TextInput } from "@okeytokey/ui";

import { safeResolve } from "../../hooks/use-resolver.js";
import { AliasPicker } from "./AliasPicker.js";
import { ColorEditor } from "./ColorEditor.js";
import { ColorFormatBar } from "./ColorFormatBar.js";
import { DimensionUnitBar } from "./DimensionUnitBar.js";
import { ShadowEditor } from "./ShadowEditor.js";
import { TypographyEditor } from "./TypographyEditor.js";

/**
 * Dispatches to the right editor for a token's type, and owns alias mode:
 * any token's whole value can be a reference; editors only see concrete
 * values.
 */
export interface ValueEditorProps {
  token: TokenNode;
  resolver: Resolver;
  onCommit: (value: unknown) => void;
}

/** Free-text editor for string/number-ish primitives (dimension, duration…). */
function TextValueEditor({
  value,
  numeric,
  onCommit,
}: {
  value: unknown;
  numeric: boolean;
  onCommit: (value: unknown) => void;
}) {
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    setDraft(text);
  }, [text]);

  const commit = () => {
    if (draft === text) return;
    const asNumber = Number(draft);
    onCommit(numeric && draft.trim() !== "" && Number.isFinite(asNumber) ? asNumber : draft);
  };

  return (
    <TextInput
      mono
      value={draft}
      aria-label="Token value"
      data-testid="value-input"
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

/** JSON textarea fallback for composite types without a dedicated editor. */
function JsonValueEditor({
  value,
  onCommit,
}: {
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const text = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(text);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(text);
    setInvalid(false);
  }, [text]);

  return (
    <>
      <textarea
        className="okey-input okey-input--mono"
        rows={8}
        value={draft}
        aria-invalid={invalid}
        aria-label="Token value (JSON)"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          if (draft === text) return;
          try {
            onCommit(JSON.parse(draft));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid && <p className="editor-error">Not valid JSON — fix or reselect to reset.</p>}
    </>
  );
}

export function ValueEditor({ token, resolver, onCommit }: ValueEditorProps) {
  const [picking, setPicking] = useState(false);
  const value = token.value;
  const aliased = typeof value === "string" && isReference(value);

  if (aliased) {
    const target = referencePath(value);
    const { resolved } = safeResolve(resolver, token.pathString);
    return (
      <div className="alias-picker">
        <div className="editor-row">
          <ReferencePill path={target} broken={resolved === undefined} />
          <Button
            variant="ghost"
            data-testid="detach-alias"
            title="Replace the alias with its resolved value"
            onClick={() => {
              if (resolved) onCommit(resolved.value);
            }}
          >
            Detach
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPicking(true);
            }}
            data-testid="change-alias"
          >
            Change…
          </Button>
        </div>
        {picking && (
          <AliasPicker
            resolver={resolver}
            excludePath={token.pathString}
            onPick={(path) => {
              onCommit(makeReference(path));
              setPicking(false);
            }}
            onClose={() => {
              setPicking(false);
            }}
          />
        )}
      </div>
    );
  }

  const BOOL_OPTIONS = [
    { value: "true", label: "true" },
    { value: "false", label: "false" },
  ] as const;

  let editor;
  switch (token.type) {
    case "color":
      editor = (
        <>
          <ColorEditor value={typeof value === "string" ? value : ""} onCommit={onCommit} />
          {typeof value === "string" && (
            <ColorFormatBar path={token.pathString} value={value} onCommit={onCommit} />
          )}
        </>
      );
      break;
    case "number":
      editor = <TextValueEditor value={value} numeric onCommit={onCommit} />;
      break;
    case "dimension":
      editor = (
        <>
          <TextValueEditor value={value} numeric={false} onCommit={onCommit} />
          {typeof value === "string" && (
            <DimensionUnitBar path={token.pathString} value={value} onCommit={onCommit} />
          )}
        </>
      );
      break;
    case "string":
      editor = <TextValueEditor value={value} numeric={false} onCommit={onCommit} />;
      break;
    case "boolean":
      editor = (
        <SegmentedControl
          aria-label="Boolean value"
          options={BOOL_OPTIONS}
          value={value === true ? "true" : "false"}
          onChange={(v) => {
            onCommit(v === "true");
          }}
        />
      );
      break;
    case "duration":
    case "fontWeight":
    case "fontFamily":
      editor = (
        <TextValueEditor value={value} numeric={token.type === "fontWeight"} onCommit={onCommit} />
      );
      break;
    case "typography":
      editor = <TypographyEditor value={value} onCommit={onCommit} />;
      break;
    case "shadow":
      editor = <ShadowEditor value={value} onCommit={onCommit} />;
      break;
    default:
      editor = <JsonValueEditor value={value} onCommit={onCommit} />;
  }

  return (
    <div className="alias-picker">
      {editor}
      <div className="editor-row">
        <Button
          variant="ghost"
          onClick={() => {
            setPicking(true);
          }}
          data-testid="make-alias"
        >
          ⤳ Reference another token…
        </Button>
      </div>
      {picking && (
        <AliasPicker
          resolver={resolver}
          excludePath={token.pathString}
          onPick={(path) => {
            onCommit(makeReference(path));
            setPicking(false);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
