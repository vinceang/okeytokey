import type { OkeytokeyExtension } from "@okeytokey/schema";
import { Field, Select, TextInput } from "@okeytokey/ui";

import { cmdSetTokenMeta } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";

/**
 * Edits the com.okeytokey decision-context payload: guidelines, lifecycle,
 * replacedBy, layer, owners. (Decision records — author/date/rationale — are
 * written on deprecation flows and by future generators; freeform editing
 * starts here.) Layer and owners inherit from ancestor groups; inherited
 * values show as hints and only explicit edits write to the token.
 */
export function DecisionContextEditor({
  setName,
  path,
  meta,
  inheritedLayer,
  inheritedOwners,
}: {
  setName: string;
  path: string;
  meta: OkeytokeyExtension | undefined;
  /** Effective layer when the token declares none of its own. */
  inheritedLayer?: OkeytokeyExtension["layer"];
  /** Effective owners when the token declares none of its own. */
  inheritedOwners?: readonly string[];
}) {
  const execute = useDocumentStore((state) => state.execute);

  const patch = (partial: Partial<OkeytokeyExtension>) => {
    // Explicit `undefined` in `partial` clears a field; Object.entries' type
    // hides that, so widen before filtering.
    const entries = Object.entries({ ...meta, ...partial }) as [string, unknown][];
    const merged = Object.fromEntries(entries.filter(([, value]) => value !== undefined));
    execute(
      cmdSetTokenMeta(setName, path, {
        okeytokey: Object.keys(merged).length > 0 ? merged : null,
      }),
    );
  };

  return (
    <section className="inspector-section" data-testid="decision-context-editor">
      <h3 className="section-label">Decision context</h3>
      <Field label="Guidelines">
        {(id) => (
          <textarea
            id={id}
            key={`${path}-guidelines-${meta?.guidelines ?? ""}`}
            className="okey-input"
            rows={3}
            defaultValue={meta?.guidelines ?? ""}
            placeholder="Usage guidance, e.g. “Primary CTAs only, never on dark surfaces.”"
            data-testid="guidelines-input"
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next !== (meta?.guidelines ?? "")) {
                patch({ guidelines: next === "" ? undefined : next });
              }
            }}
          />
        )}
      </Field>
      <div className="editor-grid-2">
        <Field label="Layer">
          {(id) => (
            <Select
              id={id}
              value={meta?.layer ?? ""}
              data-testid="layer-select"
              onChange={(event) => {
                const value = event.target.value;
                patch({
                  layer: value === "" ? undefined : (value as OkeytokeyExtension["layer"]),
                });
              }}
            >
              <option value="">
                {meta?.layer === undefined && inheritedLayer !== undefined
                  ? `— (inherits ${inheritedLayer})`
                  : "—"}
              </option>
              <option value="primitive">primitive</option>
              <option value="semantic">semantic</option>
              <option value="component">component</option>
            </Select>
          )}
        </Field>
        <Field label="Owners">
          {(id) => (
            <TextInput
              id={id}
              key={`${path}-owners-${(meta?.owners ?? []).join(",")}`}
              defaultValue={(meta?.owners ?? []).join(", ")}
              placeholder={
                meta?.owners === undefined && inheritedOwners !== undefined
                  ? `${inheritedOwners.join(", ")} (inherited)`
                  : "@design-systems, @vince"
              }
              data-testid="owners-input"
              onBlur={(event) => {
                const next = event.target.value
                  .split(",")
                  .map((owner) => owner.trim())
                  .filter((owner) => owner !== "");
                if (next.join(",") !== (meta?.owners ?? []).join(",")) {
                  patch({ owners: next.length > 0 ? next : undefined });
                }
              }}
            />
          )}
        </Field>
      </div>
      <div className="editor-grid-2">
        <Field label="Lifecycle">
          {(id) => (
            <Select
              id={id}
              value={meta?.lifecycle ?? ""}
              data-testid="lifecycle-select"
              onChange={(event) => {
                const value = event.target.value;
                patch({
                  lifecycle: value === "" ? undefined : (value as OkeytokeyExtension["lifecycle"]),
                });
              }}
            >
              <option value="">—</option>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="deprecated">deprecated</option>
              <option value="archived">archived</option>
            </Select>
          )}
        </Field>
        <Field label="Replaced by">
          {(id) => (
            <TextInput
              id={id}
              key={`${path}-replacedBy-${meta?.replacedBy ?? ""}`}
              mono
              defaultValue={meta?.replacedBy ?? ""}
              placeholder="colors.action.primary"
              data-testid="replaced-by-input"
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next !== (meta?.replacedBy ?? "")) {
                  patch({ replacedBy: next === "" ? undefined : next });
                }
              }}
            />
          )}
        </Field>
      </div>
    </section>
  );
}
