# @okeytokey/ui

Shared React 19 component library used by the studio and the Figma plugin UI iframe.
Small presentational components only (no app state, no data fetching); container/feature
components live in the apps. No component over ~200 lines — logic goes into hooks.

Phase 0 scaffold — the component set (TokenRow, TokenTypeIcon, ColorSwatch with gamut
warning, ReferencePill, DiffViewer, DiagnosticsPanel, ContrastBadge, …) lands in
Phase 2+. Depends on `@okeytokey/core` and `@okeytokey/schema`; React is a peer
dependency.
