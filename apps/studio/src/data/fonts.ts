/**
 * Font choices for the New Token dialog. The Google list is a curated
 * static snapshot of widely used families — bundled so the picker works
 * offline with no API key and no network. Live previews / the full
 * searchable catalog need the Google Fonts API and are deliberately
 * deferred (see ROADMAP).
 */

export const SYSTEM_FONT_STACKS: readonly { label: string; value: string }[] = [
  { label: "System sans", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "System serif", value: "ui-serif, Georgia, serif" },
  { label: "System mono", value: "ui-monospace, 'SF Mono', Menlo, monospace" },
];

export const GOOGLE_FONTS: readonly string[] = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Source Sans 3",
  "Noto Sans",
  "Nunito",
  "Raleway",
  "Work Sans",
  "Rubik",
  "IBM Plex Sans",
  "DM Sans",
  "Manrope",
  "Figtree",
  "Outfit",
  "Plus Jakarta Sans",
  "Space Grotesk",
  "Sora",
  "Merriweather",
  "Playfair Display",
  "Lora",
  "PT Serif",
  "Libre Baskerville",
  "Crimson Pro",
  "EB Garamond",
  "Fraunces",
  "Source Serif 4",
  "IBM Plex Serif",
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "IBM Plex Mono",
  "Space Mono",
  "Roboto Mono",
];

export const FONT_WEIGHTS: readonly { label: string; value: number }[] = [
  { label: "100 Thin", value: 100 },
  { label: "200 Extra Light", value: 200 },
  { label: "300 Light", value: 300 },
  { label: "400 Regular", value: 400 },
  { label: "500 Medium", value: 500 },
  { label: "600 Semi Bold", value: 600 },
  { label: "700 Bold", value: 700 },
  { label: "800 Extra Bold", value: 800 },
  { label: "900 Black", value: 900 },
];
