# @okeytokey/sync

Git sync layer, diagnostics-first. See `docs/adr/0004-sync-merge-strategy.md`.

- `SyncProvider` — authenticate, listBranches, readTokens, writeTokens, createBranch,
  openPullRequest, healthCheck. Every operation appends a structured trace entry
  (`trace()`: operation, method+URL, status, rate-limit state, failure detail).
- `GitHubProvider` — octokit REST; fine-grained PAT (GitHub App installation tokens
  fit the same constructor). Reads pin all files to one commit sha; **writes are one
  atomic commit** via the Git Data API (tree → commit → ref). Injectable `fetch` for
  tests. 401/403 throw `SyncAuthError`; everything else `SyncError` with the operation.
- **Connection doctor** — `healthCheck()` checks auth → repo → branch → path in order,
  reporting what was looked up, what came back, and the most likely fix per step.
- **Three-way merge** — `mergeDocuments(base, ours, theirs)` merges at token level
  (value + metadata identity); non-overlapping edits and deletions merge cleanly,
  true conflicts come back as `{ setName, path, base, ours, theirs }` and are resolved
  per token with `resolveConflict`.

Depends on `@okeytokey/core` + `@okeytokey/schema`.
