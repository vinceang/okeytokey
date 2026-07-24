# @okeytokey/studio

The okeytokey web token editor (Vite + React 19 + Zustand).

## Phase 2 feature set

- **Token CRUD** over the immutable core document; every mutation is a reversible
  command with 100-step undo/redo (⌘Z / ⇧⌘Z) — see `docs/adr/0003-undo-model.md`
- **Virtualized token tree** (TanStack Virtual): collapsible groups, smooth at
  10,000+ tokens (perf-tested in `e2e/perf.spec.ts`)
- **Type-specific editors**: color editor with native OS picker, OKLCH sliders, and gamut warnings,
  typography composer, shadow stack editor, quantity/text editors, JSON fallback
- **Alias picker** searching by name _and_ resolved value; detach/change aliases
- **Themes**: per-set enabled/source/disabled statuses, live resolution switching
- **DTCG import/export** (lossless via core's ordered-JSON round-trip)
- **Local-first persistence**: IndexedDB (Dexie), debounced autosave, starter
  document on first run
- Filter matches token names and values; decision-context metadata
  (guidelines, lifecycle, decisions) surfaces in the inspector

## Phase 6 additions

- **Onboarding wizard** on first run: starter architecture (primitive → semantic with
  light/dark themes), import existing DTCG/Tokens Studio JSON, or connect GitHub
  (opens the sync dialog with the connection doctor).
- **Command palette** (⌘K, cmdk): actions, theme switching, and fuzzy token
  navigation across all sets.
- **Keyboard-first list**: arrow keys move the token selection (Home/End jump);
  every control is reachable without a mouse.
- **Accessibility**: WCAG 2.1 AA — axe checks run in CI on the editor, dialogs, and
  onboarding; serious/critical violations fail the build. Dialogs follow the ARIA
  pattern (aria-modal, Escape closes).
- The 10k-token virtualization benchmark (`e2e/perf.spec.ts`) runs in CI.

## Appearance

- **Light and dark application themes** are available from the bottom of the sidebar.
  The preference follows the operating-system theme until the user chooses one, then
  persists in `localStorage` across projects and reloads.
- Appearance changes only Studio chrome. It never alters the active token theme,
  resolved token values, previews, exports, or synced files.

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
