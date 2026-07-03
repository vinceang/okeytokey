# Architecture Decision Records

ADRs for okeytokey's core design decisions. Format: one markdown file per decision,
numbered, with Status / Context / Decision / Consequences sections.

- [0001 — Resolution semantics](0001-resolution-semantics.md): alias resolution, set
  ordering, math evaluation, color functions, cycle reporting (Phase 1)
- [0002 — Extension namespace](0002-extension-namespace.md):
  `$extensions["com.okeytokey"]` decision-context metadata and the strip-invariant
  (Phase 1)
- [0003 — Undo model](0003-undo-model.md): command pattern with
  structural-snapshot inverses over the immutable document (Phase 2)
- [0004 — Sync and merge strategy](0004-sync-merge-strategy.md): traced operations,
  connection doctor, atomic Git Data API writes, token-level three-way merge (Phase 4)
- [0005 — Theme groups and matrix expansion](0005-theme-groups.md): dimensions via
  `group`, user-triggered additive expansion, generated combinations are plain
  themes with name-keyed dedupe (post-v1)
