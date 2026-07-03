/**
 * @okeytokey/ui — shared presentational components.
 *
 * Phase 0 scaffold: TokenRow, TokenTypeIcon, ColorSwatch, ReferencePill,
 * DiffViewer, DiagnosticsPanel, ContrastBadge and friends land in Phase 2+.
 */

import type { DtcgTokenType } from "@okeytokey/schema";

export interface TokenTypeLabelProps {
  type: DtcgTokenType;
}

/** Placeholder component proving the JSX build + schema dependency wiring. */
export function TokenTypeLabel({ type }: TokenTypeLabelProps) {
  return <span data-token-type={type}>{type}</span>;
}
