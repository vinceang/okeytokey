# @okeytokey/sync

Git sync layer: a `SyncProvider` interface (authenticate, listBranches, readTokens,
writeTokens, createBranch, openPullRequest, healthCheck) with a GitHub implementation
first. Designed for reliability and debuggability: structured operation traces, a
connection doctor that pinpoints the failing step, and dry-run pushes showing semantic
diffs before anything is written.

Phase 0 scaffold — implementation lands in Phase 4. Depends on `@okeytokey/core` and
`@okeytokey/schema`.
