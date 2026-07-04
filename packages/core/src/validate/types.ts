import type { DtcgTokenType } from "@okeytokey/schema";

import type { TokenDocument, TokenNode } from "../parser/document.js";
import type { ReferenceGraph, Resolver } from "../resolver/resolver.js";

export type Severity = "warn" | "error";
export type SeverityConfig = Severity | "off";

export interface DiagnosticFix {
  readonly label: string;
  /** Apply the fix, returning the new document. */
  readonly apply: (document: TokenDocument) => TokenDocument;
}

export interface Diagnostic {
  readonly ruleId: string;
  readonly severity: Severity;
  /** Dot-joined token path the diagnostic is attached to. */
  readonly tokenPath: string;
  /** Set the token lives in (the winning set under the active order). */
  readonly setName: string | undefined;
  readonly message: string;
  readonly fix?: DiagnosticFix;
}

/** Shared, precomputed inputs every rule receives. */
export interface RuleContext {
  readonly document: TokenDocument;
  readonly resolver: Resolver;
  readonly graph: ReferenceGraph;
  /** Every visible token (winning under the active set order). */
  readonly tokens: ReadonlyMap<string, TokenNode>;
  /** Set each visible token wins from. */
  readonly tokenSets: ReadonlyMap<string, string>;
}

export interface LintRule<Options = unknown> {
  readonly id: string;
  readonly defaultSeverity: SeverityConfig;
  readonly check: (context: RuleContext, options: Options, severity: Severity) => Diagnostic[];
}

/** Per-rule setting: a level, or [level, options]. Mirrors ESLint. */
export type RuleSetting = SeverityConfig | readonly [SeverityConfig, unknown];

/** The `lint` section of okeytokey.config.json. */
export interface LintConfig {
  readonly rules?: Readonly<Record<string, RuleSetting>>;
}

export interface NamingConventionOptions {
  /** Regex source tested against each path segment. */
  readonly pattern?: string;
  /** Per-type overrides, e.g. { color: "^[a-z][a-z0-9-]*$" }. */
  readonly types?: Readonly<Partial<Record<DtcgTokenType, string>>>;
}

export interface ContrastPair {
  readonly foreground: string;
  readonly background: string;
  /** WCAG threshold to enforce. Default "AA". */
  readonly level?: "AA" | "AAA";
  /** Minimum |Lc| for APCA. Default 60. Set 0 to skip APCA. */
  readonly apcaMin?: number;
}

export interface ContrastOptions {
  readonly pairs?: readonly ContrastPair[];
}

export interface OwnershipOptions {
  /**
   * CODEOWNERS-style ownership map from okeytokey.config.json: dot-path glob
   * → owner identifiers. `*` matches one path segment, `**` any number
   * (e.g. `"colors.**": ["@design-systems"]`). A token is owned when its
   * effective `$extensions` owners (own or inherited from a group) are
   * non-empty, or any glob here matches its path.
   */
  readonly owners?: Readonly<Record<string, readonly string[]>>;
}
