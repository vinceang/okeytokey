# ADR 0003: Undo model

**Status:** Accepted (Phase 2)

## Context

The spec requires a command-pattern undo/redo stack: every mutation a reversible
command, 100-step history. The document model is immutable with structural sharing
(ordered-JSON Maps), which shapes what "reversible" should mean.

## Decision

- **Command interface:** `{ label, run(document) -> { document, inverse } }`. Executing
  a command yields the next document _and_ the exact inverse command, captured at
  execution time. History stores `{ label, undo, redo }` entries; undo/redo re-run the
  stored command against the current document and swap in the fresh inverse it returns.
- **Inverses are structural snapshots, not replayed inverse operations.** A set-level
  command's inverse is `restoreSet(<the previous TokenSet>)`; multi-set operations
  (delete set, where order matters) capture the whole previous document. Snapshots are
  cheap — untouched subtrees are shared — and byte-faithful: undoing a delete restores
  the token _in its original key position_, which a re-`createToken` could not
  (it would append). This is tested.
- **Every mutation revalidates**: commands delegate to core's `mutate/` functions,
  which re-run `parseTokenSet` — a command can never produce an invalid document.
- **History cap:** 100 entries, oldest dropped. New edits clear the redo stack.
- **Out of history:** theme configuration and UI state (selection, filter, collapse)
  are not undoable; they're configuration, not content. Hydration (initial load,
  import-all) resets history.

## Consequences

- Undo is exact by construction — no drift between "inverse operation" semantics and
  actual prior state, no special cases per command type.
- Memory cost is bounded: 100 entries × structurally-shared snapshots of only the
  touched sets.
- Commands are pure over the document, so they are trivially unit-testable
  (see `apps/studio/src/state/state.test.ts`).
