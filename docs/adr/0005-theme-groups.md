# ADR 0005: Theme groups and matrix expansion

**Status:** Accepted (post-v1)

## Context

Real design systems theme along multiple independent dimensions — brand × mode ×
density. Core has modeled this since Phase 1 (`ThemeGroup`, `expandThemeMatrix`),
but the studio only exposed flat themes. The question was how generated
combinations should behave in the editor.

## Decision

- **A theme's `group` names its dimension** ("mode", "brand"). It is optional and
  editable in the theme dialog; ungrouped themes never participate in expansion.
- **Expansion is user-triggered and additive.** When themes span two or more
  groups, the sidebar offers "Generate combinations" (⊞): the cartesian product is
  computed by core's `expandThemeMatrix` and materialized as ordinary themes named
  `"<option> / <option>"` in group order.
- **Generated themes are plain themes — no live linkage.** They carry no `group`
  of their own, can be edited or deleted independently, and do not regenerate when
  a source theme changes. Regeneration is explicit: pressing ⊞ again adds only the
  combinations whose names don't already exist (name-keyed dedupe), so manual
  edits to previously generated themes are never overwritten.
- **Set-status merging follows core's rules** (documented with
  `expandThemeMatrix`): within a combination, later groups' set lists override
  earlier ones positionally; a set appearing in multiple options keeps its
  strongest status (enabled > source > disabled).

## Consequences

- The common case (brand × mode) is two clicks; the mental model stays "a theme is
  an ordered set list" because generated combinations _are_ just themes.
- No hidden magic: stale combinations after editing a source theme are the user's
  to regenerate — visible, predictable, undo-free (theme config is outside undo
  history per ADR 0003).
- Name-keyed dedupe means renaming a generated theme detaches it permanently —
  acceptable, since the name is the identity everywhere else (variables modes,
  export targets).
