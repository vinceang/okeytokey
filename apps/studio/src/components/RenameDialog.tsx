import { useMemo, useState } from "react";

import { planRename } from "@okeytokey/core";
import { Button, Field, TextInput } from "@okeytokey/ui";

import { cmdRenameToken } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";
import { Dialog } from "./dialogs.js";

/** Rename-with-refactor: live preview of every reference that will change. */
export function RenameDialog({
  path,
  setName,
  onClose,
}: {
  path: string;
  setName: string;
  onClose: () => void;
}) {
  const document = useDocumentStore((state) => state.document);
  const execute = useDocumentStore((state) => state.execute);
  const select = useUiStore((state) => state.select);
  const [toPath, setToPath] = useState(path);

  const preview = useMemo(() => {
    const target = toPath.trim();
    if (target === "" || target === path) return { plan: undefined, error: undefined };
    try {
      return { plan: planRename(document, path, target), error: undefined };
    } catch (planError) {
      return {
        plan: undefined,
        error: planError instanceof Error ? planError.message : String(planError),
      };
    }
  }, [document, path, toPath]);

  const rename = () => {
    if (!preview.plan) return;
    execute(cmdRenameToken(path, toPath.trim()));
    select({ set: setName, path: toPath.trim() });
    onClose();
  };

  return (
    <Dialog title={`Rename ${path}`} onClose={onClose}>
      <Field label="New path" error={preview.error}>
        {(id) => (
          <TextInput
            id={id}
            mono
            autoFocus
            value={toPath}
            data-testid="rename-input"
            onChange={(event) => {
              setToPath(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") rename();
              if (event.key === "Escape") onClose();
            }}
          />
        )}
      </Field>
      {preview.plan && (
        <div className="rename-preview" data-testid="rename-preview">
          <p className="section-label">
            {preview.plan.referenceEdits.length === 0
              ? "No references to update."
              : `${String(preview.plan.referenceEdits.length)} reference${
                  preview.plan.referenceEdits.length === 1 ? "" : "s"
                } will be updated:`}
          </p>
          {preview.plan.referenceEdits.map((edit) => (
            <div className="rename-edit" key={`${edit.setName}:${edit.tokenPath}`}>
              <code>
                {edit.setName} · {edit.tokenPath}
              </code>
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
          disabled={!preview.plan}
          onClick={rename}
          data-testid="confirm-rename"
        >
          Rename
        </Button>
      </footer>
    </Dialog>
  );
}
