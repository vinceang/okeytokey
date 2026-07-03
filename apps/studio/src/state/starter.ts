import {
  createTokenDocument,
  parseTokenSet,
  type TokenDocument,
  type Theme,
} from "@okeytokey/core";

/** First-run content: a small primitive → semantic starter architecture. */

const GLOBAL_SET = `{
  "colors": {
    "$type": "color",
    "blue": {
      "500": { "$value": "#3b82f6" },
      "600": { "$value": "#2563eb" }
    },
    "gray": {
      "50": { "$value": "#f8fafc" },
      "900": { "$value": "#0f172a" }
    }
  },
  "spacing": {
    "$type": "dimension",
    "base": { "$value": "4px" },
    "sm": { "$value": "{spacing.base} * 2" },
    "md": { "$value": "{spacing.base} * 4" },
    "lg": { "$value": "{spacing.base} * 8" }
  }
}`;

const SEMANTIC_SET = `{
  "semantic": {
    "$type": "color",
    "action": {
      "$value": "{colors.blue.500}",
      "$description": "Primary interactive elements",
      "$extensions": {
        "com.okeytokey": {
          "guidelines": "Use for primary CTAs and links. One per view.",
          "lifecycle": "active"
        }
      }
    },
    "background": { "$value": "{colors.gray.50}" },
    "text": { "$value": "{colors.gray.900}" }
  }
}`;

const DARK_SET = `{
  "semantic": {
    "$type": "color",
    "background": { "$value": "{colors.gray.900}" },
    "text": { "$value": "{colors.gray.50}" }
  }
}`;

export function starterDocument(): { document: TokenDocument; themes: Theme[] } {
  const document = createTokenDocument([
    parseTokenSet("global", GLOBAL_SET),
    parseTokenSet("semantic", SEMANTIC_SET),
    parseTokenSet("dark", DARK_SET),
  ]);
  const themes: Theme[] = [
    {
      name: "light",
      group: "mode",
      sets: [
        { set: "global", status: "source" },
        { set: "semantic", status: "enabled" },
        { set: "dark", status: "disabled" },
      ],
    },
    {
      name: "dark",
      group: "mode",
      sets: [
        { set: "global", status: "source" },
        { set: "semantic", status: "enabled" },
        { set: "dark", status: "enabled" },
      ],
    },
  ];
  return { document, themes };
}
