import type { CSSProperties, ReactNode } from "react";

import type { DtcgTokenType } from "@okeytokey/schema";

/**
 * Per-type glyph + tint. One hue family per category (color / dimension-ish /
 * type-ish / motion-ish / composite) keeps the list scannable without turning
 * it into a rainbow.
 */
const TYPE_ICONS: Record<DtcgTokenType, { glyph: string; hue: number }> = {
  color: { glyph: "●", hue: 265 },
  dimension: { glyph: "px", hue: 217 },
  number: { glyph: "#", hue: 217 },
  string: { glyph: '"a"', hue: 190 },
  boolean: { glyph: "⊙", hue: 0 },
  fontFamily: { glyph: "Aa", hue: 152 },
  fontWeight: { glyph: "B", hue: 152 },
  typography: { glyph: "T", hue: 152 },
  duration: { glyph: "ms", hue: 38 },
  cubicBezier: { glyph: "∿", hue: 38 },
  transition: { glyph: "→", hue: 38 },
  shadow: { glyph: "◱", hue: 210 },
  border: { glyph: "▢", hue: 210 },
  gradient: { glyph: "◧", hue: 265 },
  strokeStyle: { glyph: "┄", hue: 210 },
};

export interface TokenTypeIconProps {
  type: DtcgTokenType;
}

export function TokenTypeIcon({ type }: TokenTypeIconProps) {
  const icon = TYPE_ICONS[type];
  return (
    <span
      className="okey-type-icon"
      title={type}
      aria-label={type}
      style={{
        color: `hsl(${String(icon.hue)} 60% 40%)`,
        background: `hsl(${String(icon.hue)} 70% 95%)`,
      }}
    >
      {icon.glyph}
    </span>
  );
}

export interface ColorSwatchProps {
  /** Any CSS color string. Invalid strings render as the checkerboard. */
  color: string;
  /** Show the out-of-sRGB warning dot. */
  gamutWarning?: boolean;
  title?: string;
}

export function ColorSwatch({ color, gamutWarning = false, title }: ColorSwatchProps) {
  return (
    <span
      className={`okey-swatch${gamutWarning ? " okey-swatch--gamut-warning" : ""}`}
      style={{ "--okey-swatch-color": color } as CSSProperties}
      title={title ?? (gamutWarning ? `${color} — outside sRGB gamut` : color)}
      role="img"
      aria-label={gamutWarning ? `${color} (outside sRGB gamut)` : color}
    />
  );
}

export interface ReferencePillProps {
  /** The referenced token path (without braces). */
  path: string;
  /** Reference does not resolve. */
  broken?: boolean;
  onClick?: (path: string) => void;
}

export function ReferencePill({ path, broken = false, onClick }: ReferencePillProps) {
  return (
    <button
      type="button"
      className={`okey-ref-pill${broken ? " okey-ref-pill--broken" : ""}`}
      title={broken ? `{${path}} — broken reference` : `Go to ${path}`}
      onClick={() => onClick?.(path)}
    >
      {/* text-overflow needs a block-ish child — it's inert on the flex button itself */}
      <span className="okey-ref-pill-label">{`{${path}}`}</span>
    </button>
  );
}

export interface TokenRowProps {
  name: string;
  type: DtcgTokenType;
  deprecated?: boolean;
  selected?: boolean;
  /** Right-aligned value preview (swatch, pill, text — caller's choice). */
  preview?: ReactNode;
  indent?: number;
  onSelect?: () => void;
  /** E.g. begin an inline rename. */
  onDoubleClick?: () => void;
}

/** One row in the token list. Pure presentation; virtualization is the caller's. */
export function TokenRow({
  name,
  type,
  deprecated = false,
  selected = false,
  preview,
  indent = 0,
  onSelect,
  onDoubleClick,
}: TokenRowProps) {
  return (
    <button
      type="button"
      className="okey-token-row"
      aria-pressed={selected}
      style={
        indent > 0
          ? { paddingLeft: `calc(var(--space-3) + ${String(indent)} * var(--space-4))` }
          : undefined
      }
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      <TokenTypeIcon type={type} />
      <span
        className={`okey-token-row__name${deprecated ? " okey-token-row__name--deprecated" : ""}`}
      >
        {name}
      </span>
      {preview !== undefined && <span className="okey-token-row__value">{preview}</span>}
    </button>
  );
}
