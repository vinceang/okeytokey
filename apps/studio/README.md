# @okeytokey/studio

The okeytokey web token editor (Vite + React 19).

Phase 0: hello-world shell proving the schema → core → ui wiring, with a Playwright
smoke test. Phase 2 brings the editor: token CRUD, tree, type-specific editors, alias
picker, themes, undo/redo, virtualized lists, DTCG import/export, IndexedDB persistence.

```sh
pnpm dev        # dev server
pnpm build      # production build
pnpm test:e2e   # Playwright (builds first via turbo)
```
