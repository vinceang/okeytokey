# @okeytokey/ui

Shared React 19 presentational components for the studio and the Figma plugin UI.
No app state, no data fetching — containers live in the apps. No component over
~200 lines.

## Styles

Plain CSS shipped with the package; import both once per app:

```ts
import "@okeytokey/ui/tokens.css"; // design system variables
import "@okeytokey/ui/components.css"; // component styles
```

`tokens.css` defines the constrained design system (spacing scale 4–48, type scale
11–20 with weights 400/500/600, a cool-gray ramp, one blue accent, elevation and
focus-ring variables). Components draw exclusively from these variables. Add the
`okey-app` class to the app root.

## Components

- `TokenRow` — list row: type icon, name (strike-through when deprecated),
  right-aligned preview slot, selected state, indent
- `TokenTypeIcon` — per-`$type` glyph, hue-grouped by category
- `ColorSwatch` — checkerboard-backed swatch; `gamutWarning` shows the out-of-sRGB dot
- `ReferencePill` — `{token.path}` pill; `broken` variant for dangling references
- Primitives: `Button` (primary/secondary/ghost/danger), `TextInput` (`mono` variant),
  `Select`, `Field` (label + control + error, a11y-wired), `SegmentedControl`

Coming with later phases: `DiffViewer`, `DiagnosticsPanel`, `ContrastBadge` (Phase 3).
