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

## Phase 3 additions

- **Diagnostics panel** (bottom drawer): live lint over the whole document —
  broken references, cycles, orphans, deprecated usage (with one-click fixes
  through the undo stack), contrast and naming when configured. Click to navigate.
- **Rename-with-refactor**: renames a token or group everywhere, with a preview of
  every reference edit before applying; one undo reverses the whole refactor.
- **"Used by" panel**: reverse reference graph on every token, click-to-navigate
  (lands in the dependent's owning set).
- **Decision-context editing**: guidelines, lifecycle, and replaced-by are editable;
  the Deprecate button stamps `$deprecated` + lifecycle in one command.

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
