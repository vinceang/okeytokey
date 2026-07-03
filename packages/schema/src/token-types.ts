/** Every token `$type` defined by the W3C DTCG spec that okeytokey supports. */
export const DTCG_TOKEN_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "typography",
  "border",
  "shadow",
  "gradient",
  "transition",
  "strokeStyle",
] as const;

export type DtcgTokenType = (typeof DTCG_TOKEN_TYPES)[number];

export function isDtcgTokenType(value: unknown): value is DtcgTokenType {
  return typeof value === "string" && (DTCG_TOKEN_TYPES as readonly string[]).includes(value);
}

/**
 * The `$extensions` key under which all okeytokey metadata lives. A token file
 * stripped of this namespace must remain a valid DTCG file.
 */
export const OKEYTOKEY_EXTENSION_NAMESPACE = "com.okeytokey";
