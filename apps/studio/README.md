# @okeytokey/studio

The okeytokey web token editor (Vite + React 19 + Zustand).

## Phase 2 feature set

- **Token CRUD** over the immutable core document; every mutation is a reversible
  command with 100-step undo/redo (⌘Z / ⇧⌘Z) — see `docs/adr/0003-undo-model.md`
- **Virtualized token tree** (TanStack Virtual): collapsible groups, smooth at
  10,000+ tokens (perf-tested in `e2e/perf.spec.ts`)
- **Type-specific editors**: OKLCH-capable color editor with gamut warnings,
  typography composer, shadow stack editor, quantity/text editors, JSON fallback
- **Alias picker** searching by name _and_ resolved value; detach/change aliases
- **Themes**: per-set enabled/source/disabled statuses, live resolution switching
- **DTCG import/export** (lossless via core's ordered-JSON round-trip)
- **Local-first persistence**: IndexedDB (Dexie), debounced autosave, starter
  document on first run
- Filter matches token names and values; decision-context metadata
  (guidelines, lifecycle, decisions) surfaces in the inspector

## Layout

- `src/state/` — commands, document store (undo history), UI store, Dexie persistence
- `src/components/` — containers; presentational components live in `@okeytokey/ui`
- `src/components/editors/` — per-type value editors + alias picker
- `e2e/` — Playwright suites: smoke, editor flows, 10k-token performance

```sh
pnpm dev        # dev server
pnpm test       # state-layer unit tests (vitest + fake-indexeddb)
pnpm test:e2e   # Playwright (builds first via turbo)
```
