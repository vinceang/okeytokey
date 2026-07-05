# ADR 0008: Row-anchored token inspector panel

**Status:** Accepted — implemented 2026-07-04

## Context

The studio's right column has always been a permanent 320 px inspector that occupies
space full-time regardless of what the user is doing. As the treegrid grows theme
columns, the wasted fixed real-estate becomes more expensive: every pixel on the right
is a pixel the grid can't use for a mode column.

Figma's variable collection panel solves this well: the grid takes the full width; a
hover-revealed icon on each row opens a slide-in details panel that overlays the grid
rather than displacing it. Clicking the icon opens the panel; an × closes it. While the
panel is open, clicking different rows updates its content in place.

An additional gap in the existing inspector: it shows only the value for the active
(base) theme. Users cannot see or edit how a token differs across themes without
navigating each mode column in the grid. The new panel is an opportunity to surface all
mode values together in a single place — complementing the grid's per-cell inline
editing with a holistic single-token view.

## Decision

Replace the permanent inspector column with a row-anchored slide-in panel.

**Trigger icon.** Each token row gets a hover-revealed icon in the trailing 36 px grid
column (shared with the header's ＋ add-mode button). A sliders icon (two horizontal
rails with adjustable stops — the same shape Figma uses) is chosen over a kebab because
`⋮` is already used for contextual action menus (delete, rename, duplicate). Re-using
it would ambiguate "properties" and "actions." A dedicated sliders icon clearly signals
"open token properties."

**Open/close model.** `inspectorOpen` defaults to `true` in the UI store, so clicking
a token row shows the panel immediately (same as before). Pressing × dismisses it and
it stays closed until the user clicks the trigger icon or selects a new token for the
first time. This preserves all existing interaction patterns while making the panel
dismissable — useful when a user is doing bulk edits in the grid cells and doesn't need
the panel.

**Values section.** A new "Values" section in the inspector panel lists every active
theme with the token's raw value in that theme and a simple text input for inline
editing. The same override-routing rules that ValueCell uses apply: base-theme edits
land in the defining set; non-base inherited edits create sparse overrides in the
theme's own set (recreating a deleted set by name, healing a stale theme). For color
tokens a read-only swatch appears next to the value. The existing full-featured
ValueEditor (color picker, OKLCH sliders, alias picker) is retained above the Values
section for the base value.

**Layout change.** `.studio` grid loses the `320px` right column:
`240px 1fr 320px` → `240px 1fr`. The inspector panel uses `position: fixed` at
`right: 0`, overlaying the grid without pushing it.

## Consequences

- The grid gains up to 320 px of width (meaningful once 2–3 theme columns exist).
- The panel is now dismissable — users who work primarily in the grid can put it away.
- Multi-theme token editing no longer requires switching focus to a grid cell; the panel
  exposes all mode values at once.
- Token rows need an additional DOM node (the trigger cell) in the trailing column.
  Group rows are unaffected — they use `aria-colspan` and don't participate in the grid
  template.
- The `inspectorOpen` default of `true` preserves existing E2E test behaviour (all
  tests that click a token and assert inspector content continue to work without
  modification).
