# Architecture Decision Records

ADRs for okeytokey's core design decisions. Format: one markdown file per decision,
numbered, with Status / Context / Decision / Consequences sections.

Planned (written alongside the phase that implements them):

- `0001-resolution-semantics.md` — alias resolution, set ordering, math evaluation (Phase 1)
- `0002-extension-namespace.md` — `$extensions["com.okeytokey"]` decision-context metadata (Phase 1)
- `0003-undo-model.md` — command-pattern undo/redo over an immutable document (Phase 2)
- `0004-sync-merge-strategy.md` — local-first storage + three-way semantic merge (Phase 4)
