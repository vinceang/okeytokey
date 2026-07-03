# ADR 0004: Sync and merge strategy

**Status:** Accepted (Phase 4)

## Context

Unreliable, opaque Git sync is Tokens Studio's biggest failure mode. Requirements:
never surface a bare error, never write without showing what will change, and merge
at token level — not line level.

## Decision

### Provider layer

- `SyncProvider` interface (authenticate, listBranches, readTokens, writeTokens,
  createBranch, openPullRequest, healthCheck) — GitHub first, others behind the same
  interface.
- **Every operation appends a structured trace entry** (operation, method+URL, status,
  rate-limit state, failure detail). The provider instance exposes `trace()`.
- **Connection doctor**: `healthCheck()` runs auth → repo → branch → path in order and
  stops at the first failure, reporting _what was looked up, what came back, and the
  most likely fix_ per step. No bare "There is no branch".
- Writes go through the **Git Data API** (tree → commit → ref): any number of files is
  one atomic commit; partial pushes cannot happen.
- Reads pin all files to one commit sha, so a pull is a consistent snapshot.

### Local-first + three-way merge

- The working copy lives in IndexedDB (studio). The **last-synced snapshot** is kept as
  the merge base; pushing or cleanly pulling updates it.
- Pull runs a token-level three-way merge (`mergeDocuments(base, ours, theirs)`):
  - both sides agree → take it; only one side changed from base → take that side
    (edits _and_ deletions); both changed differently → **conflict**.
  - Token identity for comparison includes value, `$description`, `$deprecated`, and
    the okeytokey extension — metadata edits merge like value edits.
  - Conflicts are resolved per token (`resolveConflict(document, conflict, side)`),
    never per line. The merged document keeps "ours" until each conflict is picked.
- **Dry-run before every push**: the semantic diff (core `diffDocuments`, including
  transitive impact counts) is shown before anything is written.

## Consequences

- A failed sync is always attributable to a specific step with a suggested fix, and
  the full trace is available for support.
- Token-level merging means two people editing different tokens in the same file never
  conflict — the common Git-on-JSON failure disappears.
- The base snapshot lives client-side; clearing browser storage degrades pull to
  "adopt remote" (safe, explicit in the UI copy).
