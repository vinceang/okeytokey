import type { Resolver } from "@okeytokey/core";
import { ReferencePill } from "@okeytokey/ui";

import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";

/**
 * "What uses this?" — the reverse reference graph for one token: every token
 * whose value references it, one click from inspection.
 */
export function UsagePanel({ path, resolver }: { path: string; resolver: Resolver }) {
  const document = useDocumentStore((state) => state.document);
  const select = useUiStore((state) => state.select);
  const setActiveSet = useUiStore((state) => state.setActiveSet);
  const dependents = [...(resolver.graph().dependents.get(path) ?? [])].sort();

  // A dependent may live in a different set than the inspected token; find
  // the last (winning) set that holds it so navigation lands correctly.
  const setOf = (dependentPath: string): string | undefined => {
    let owner: string | undefined;
    for (const [name, set] of document.sets) {
      if (set.tokens.has(dependentPath)) owner = name;
    }
    return owner;
  };

  return (
    <section className="inspector-section" data-testid="usage-panel">
      <h3 className="section-label">
        Used by {dependents.length > 0 ? `(${String(dependents.length)})` : ""}
      </h3>
      {dependents.length === 0 ? (
        <p className="usage-empty">Nothing references this token.</p>
      ) : (
        <div className="usage-list">
          {dependents.map((dependent) => (
            <ReferencePill
              key={dependent}
              path={dependent}
              onClick={() => {
                const owner = setOf(dependent);
                if (owner === undefined) return;
                setActiveSet(owner);
                select({ set: owner, path: dependent });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
