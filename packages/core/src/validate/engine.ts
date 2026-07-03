import type { TokenDocument, TokenNode } from "../parser/document.js";
import { createResolver, type ResolverOptions } from "../resolver/resolver.js";
import { BUILTIN_RULES } from "./rules.js";
import type {
  Diagnostic,
  LintConfig,
  LintRule,
  RuleContext,
  RuleSetting,
  Severity,
} from "./types.js";

/**
 * The lint engine. Builds shared context (resolver, graph, visible tokens)
 * once, then runs every enabled rule. Severity and options come from the
 * ESLint-style config; unknown rule ids in the config surface as an error
 * diagnostic rather than being silently ignored.
 */

function settingFor(
  rule: LintRule<never>,
  config: LintConfig,
): { severity: Severity | "off"; options: unknown } {
  const setting: RuleSetting | undefined = config.rules?.[rule.id];
  if (setting === undefined) {
    return { severity: rule.defaultSeverity, options: {} };
  }
  if (typeof setting === "string") {
    return { severity: setting, options: {} };
  }
  const [severity, options] = setting;
  return { severity, options: options ?? {} };
}

export interface LintOptions extends ResolverOptions {
  /** Additional rules to run alongside the built-ins. */
  readonly extraRules?: readonly LintRule<never>[];
}

export function lintDocument(
  document: TokenDocument,
  config: LintConfig = {},
  options: LintOptions = {},
): Diagnostic[] {
  const resolver = createResolver(document, options);
  const tokens = new Map<string, TokenNode>();
  const tokenSets = new Map<string, string>();
  for (const path of resolver.visiblePaths()) {
    const token = resolver.lookup(path);
    if (!token) continue;
    tokens.set(path, token);
    for (const [setName, set] of document.sets) {
      if (set.tokens.get(path) === token) {
        tokenSets.set(path, setName);
      }
    }
  }
  const context: RuleContext = { document, resolver, graph: resolver.graph(), tokens, tokenSets };

  const rules = [...BUILTIN_RULES, ...(options.extraRules ?? [])];
  const knownIds = new Set(rules.map((rule) => rule.id));
  const diagnostics: Diagnostic[] = [];

  for (const configuredId of Object.keys(config.rules ?? {})) {
    if (!knownIds.has(configuredId)) {
      diagnostics.push({
        ruleId: "lint-config",
        severity: "error",
        tokenPath: "",
        setName: undefined,
        message: `Unknown lint rule ${JSON.stringify(configuredId)} in configuration`,
      });
    }
  }

  for (const rule of rules) {
    const { severity, options: ruleOptions } = settingFor(rule, config);
    if (severity === "off") continue;
    diagnostics.push(...rule.check(context, ruleOptions as never, severity));
  }

  return diagnostics.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return a.tokenPath.localeCompare(b.tokenPath);
  });
}
