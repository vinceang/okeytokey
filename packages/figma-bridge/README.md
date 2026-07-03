# @okeytokey/figma-bridge

Figma integration primitives shared by the plugin's main thread and UI iframe: the typed
postMessage protocol (discriminated-union message schema, Zod-validated on both sides),
token → node application mapping, and Figma Variables import/export mapping.

Phase 0 scaffold — implementation lands in Phase 5. Depends on `@okeytokey/core` and
`@okeytokey/schema`. No DOM and no Figma globals here — this package is pure mapping
logic so it stays unit-testable.
