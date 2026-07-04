import { isReference, referencePath } from "@okeytokey/schema";

import { apcaContrast, wcagContrast } from "../color/contrast.js";
import { isColor } from "../color/color.js";
import { setTokenValue, withSet } from "../mutate/mutate.js";
import type { TokenDocument } from "../parser/document.js";
import type {
  ContrastOptions,
  Diagnostic,
  LintRule,
  NamingConventionOptions,
  OwnershipOptions,
  RuleContext,
} from "./types.js";

/**
 * First-party lint rules. Each returns structured diagnostics; the engine
 * handles severity configuration and rule toggling.
 */

export const noBrokenReferences: LintRule = {
  id: "no-broken-references",
  defaultSeverity: "error",
  check(context, _options, severity) {
    const diagnostics: Diagnostic[] = [];
    for (const [path, references] of context.graph.dependencies) {
      for (const referenced of references) {
        if (!context.tokens.has(referenced)) {
          diagnostics.push({
            ruleId: this.id,
            severity,
            tokenPath: path,
            setName: context.tokenSets.get(path),
            message: `"${path}" references "{${referenced}}", which does not exist in the active sets`,
          });
        }
      }
    }
    return diagnostics;
  },
};

export const noReferenceCycles: LintRule = {
  id: "no-reference-cycles",
  defaultSeverity: "error",
  check(context, _options, severity) {
    const diagnostics: Diagnostic[] = [];
    const reported = new Set<string>();
    const { errors } = context.resolver.resolveAll();
    for (const error of errors) {
      if (!error.cyclePath) continue;
      // The same cycle is reported from every entry point; key on the unique
      // node set so it appears once.
      const key = [...new Set(error.cyclePath)].sort().join("→");
      if (reported.has(key)) continue;
      reported.add(key);
      const entry = error.cyclePath[0] ?? error.tokenPath;
      diagnostics.push({
        ruleId: this.id,
        severity,
        tokenPath: entry,
        setName: context.tokenSets.get(entry),
        message: `Reference cycle: ${error.cyclePath.join(" → ")}`,
      });
    }
    return diagnostics;
  },
};

export const namingConvention: LintRule<NamingConventionOptions> = {
  id: "naming-convention",
  defaultSeverity: "off",
  check(context, options, severity) {
    const diagnostics: Diagnostic[] = [];
    const basePattern = options.pattern;
    for (const [path, token] of context.tokens) {
      const source = options.types?.[token.type] ?? basePattern;
      if (source === undefined) continue;
      const pattern = new RegExp(source);
      for (const segment of token.path) {
        if (!pattern.test(segment)) {
          diagnostics.push({
            ruleId: this.id,
            severity,
            tokenPath: path,
            setName: context.tokenSets.get(path),
            message: `Segment "${segment}" does not match the ${
              options.types?.[token.type] ? `${token.type} ` : ""
            }naming pattern /${source}/`,
          });
          break;
        }
      }
    }
    return diagnostics;
  },
};

function resolveToColor(context: RuleContext, path: string): string | undefined {
  try {
    const value = context.resolver.resolve(path).value;
    return typeof value === "string" && isColor(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export const contrast: LintRule<ContrastOptions> = {
  id: "contrast",
  defaultSeverity: "warn",
  check(context, options, severity) {
    const diagnostics: Diagnostic[] = [];
    for (const pair of options.pairs ?? []) {
      const foreground = resolveToColor(context, pair.foreground);
      const background = resolveToColor(context, pair.background);
      if (foreground === undefined || background === undefined) {
        diagnostics.push({
          ruleId: this.id,
          severity,
          tokenPath: foreground === undefined ? pair.foreground : pair.background,
          setName: undefined,
          message: `Contrast pair (${pair.foreground} on ${pair.background}) does not resolve to two colors`,
        });
        continue;
      }
      const ratio = wcagContrast(foreground, background);
      const required = (pair.level ?? "AA") === "AAA" ? 7 : 4.5;
      if (ratio < required) {
        diagnostics.push({
          ruleId: this.id,
          severity,
          tokenPath: pair.foreground,
          setName: context.tokenSets.get(pair.foreground),
          message: `WCAG contrast of "${pair.foreground}" on "${pair.background}" is ${ratio.toFixed(2)}:1 — below ${pair.level ?? "AA"} (${String(required)}:1)`,
        });
      }
      const apcaMin = pair.apcaMin ?? 60;
      if (apcaMin > 0) {
        const lc = apcaContrast(foreground, background);
        if (Math.abs(lc) < apcaMin) {
          diagnostics.push({
            ruleId: this.id,
            severity,
            tokenPath: pair.foreground,
            setName: context.tokenSets.get(pair.foreground),
            message: `APCA contrast of "${pair.foreground}" on "${pair.background}" is Lc ${lc.toFixed(1)} — below the |Lc| ${String(apcaMin)} target`,
          });
        }
      }
    }
    return diagnostics;
  },
};

export const noOrphanTokens: LintRule = {
  id: "no-orphan-tokens",
  defaultSeverity: "warn",
  check(context, _options, severity) {
    const diagnostics: Diagnostic[] = [];
    for (const [path] of context.tokens) {
      const dependents = context.graph.dependents.get(path);
      if (dependents !== undefined && dependents.size > 0) continue;
      diagnostics.push({
        ruleId: this.id,
        severity,
        tokenPath: path,
        setName: context.tokenSets.get(path),
        message: `"${path}" is never referenced by another token`,
      });
    }
    return diagnostics;
  },
};

function deprecationFix(
  setName: string | undefined,
  ownerPath: string,
  from: string,
  to: string,
): Diagnostic["fix"] {
  if (setName === undefined) return undefined;
  return {
    label: `Point at ${to} instead`,
    apply(document: TokenDocument): TokenDocument {
      const set = document.sets.get(setName);
      const token = set?.tokens.get(ownerPath);
      if (!set || !token) return document;
      // Guard against the document having changed since the diagnostic.
      if (typeof token.value !== "string" || referencePath(token.value) !== from) return document;
      return withSet(document, setTokenValue(set, ownerPath, `{${to}}`));
    },
  };
}

export const deprecatedUsage: LintRule = {
  id: "deprecated-usage",
  defaultSeverity: "warn",
  check(context, _options, severity) {
    const diagnostics: Diagnostic[] = [];
    for (const [path, token] of context.tokens) {
      if (typeof token.value !== "string" || !isReference(token.value)) continue;
      const referenced = context.tokens.get(referencePath(token.value));
      if (!referenced) continue;
      const isDeprecated =
        (referenced.deprecated !== undefined && referenced.deprecated !== false) ||
        referenced.okeytokey?.lifecycle === "deprecated";
      if (!isDeprecated) continue;
      const replacement = referenced.okeytokey?.replacedBy;
      diagnostics.push({
        ruleId: this.id,
        severity,
        tokenPath: path,
        setName: context.tokenSets.get(path),
        message:
          `"${path}" points at deprecated token "${referenced.pathString}"` +
          (typeof referenced.deprecated === "string" ? ` (${referenced.deprecated})` : "") +
          (replacement !== undefined ? ` — use "${replacement}"` : ""),
        fix:
          replacement !== undefined
            ? deprecationFix(context.tokenSets.get(path), path, referenced.pathString, replacement)
            : undefined,
      });
    }
    return diagnostics;
  },
};

/** Dot-path glob → regex: `**` spans segments, `*` matches within one. */
function globToRegex(glob: string): RegExp {
  const source = glob
    .split(/(\*\*|\*)/)
    .map((part) => {
      if (part === "**") return ".*";
      if (part === "*") return "[^.]*";
      return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}$`);
}

export const ownershipRequired: LintRule<OwnershipOptions> = {
  id: "ownership-required",
  // Opt-in like naming-convention: without owners metadata or config globs,
  // every token in every document would warn.
  defaultSeverity: "off",
  check(context, options, severity) {
    const globs = Object.entries(options.owners ?? {})
      .filter(([, owners]) => owners.length > 0)
      .map(([glob]) => globToRegex(glob));
    // One diagnostic per top-level group (PRD: "unowned token groups"), not
    // per token — a document with no ownership yet stays readable.
    const unowned = new Map<string, number>();
    for (const [path, token] of context.tokens) {
      const owned = (token.owners?.length ?? 0) > 0 || globs.some((regex) => regex.test(path));
      if (owned) continue;
      const group = token.path.length > 1 ? (token.path[0] ?? path) : path;
      unowned.set(group, (unowned.get(group) ?? 0) + 1);
    }
    return [...unowned].map(([group, count]) => ({
      ruleId: this.id,
      severity,
      tokenPath: group,
      setName: undefined,
      message:
        `"${group}" has no resolvable owner (${String(count)} token${count === 1 ? "" : "s"}) — ` +
        `add owners in $extensions["com.okeytokey"] or an ownership glob in okeytokey.config.json`,
    }));
  },
};

export const layerSkip: LintRule = {
  id: "layer-skip",
  defaultSeverity: "warn",
  check(context, _options, severity) {
    const diagnostics: Diagnostic[] = [];
    for (const [path, token] of context.tokens) {
      if (token.layer !== "component") continue;
      for (const referenced of context.graph.dependencies.get(path) ?? []) {
        if (context.tokens.get(referenced)?.layer !== "primitive") continue;
        diagnostics.push({
          ruleId: this.id,
          severity,
          tokenPath: path,
          setName: context.tokenSets.get(path),
          message:
            `"${path}" (component) references primitive "${referenced}" directly — ` +
            `route it through a semantic token`,
        });
      }
    }
    return diagnostics;
  },
};

export const noRawValueInUpperLayers: LintRule = {
  id: "no-raw-value-in-upper-layers",
  defaultSeverity: "warn",
  check(context, _options, severity) {
    const diagnostics: Diagnostic[] = [];
    for (const [path, token] of context.tokens) {
      const layer = token.layer;
      if (layer !== "semantic" && layer !== "component") continue;
      // Any reference — alias, math expression, color function — registers a
      // dependency; a token with none hardcodes its value.
      const dependencies = context.graph.dependencies.get(path);
      if (dependencies !== undefined && dependencies.size > 0) continue;
      diagnostics.push({
        ruleId: this.id,
        severity,
        tokenPath: path,
        setName: context.tokenSets.get(path),
        message: `"${path}" (${layer}) hardcodes a raw value — alias a lower-layer token instead`,
      });
    }
    return diagnostics;
  },
};

export const BUILTIN_RULES = [
  noBrokenReferences,
  noReferenceCycles,
  namingConvention,
  contrast,
  noOrphanTokens,
  deprecatedUsage,
  ownershipRequired,
  layerSkip,
  noRawValueInUpperLayers,
] as unknown as readonly LintRule<never>[];
