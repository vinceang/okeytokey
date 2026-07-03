import { findReferences, isReference, referencePath } from "@okeytokey/schema";

import { evaluateColorFunction, isColorFunction } from "../color/color.js";
import { TokenResolutionError } from "../errors.js";
import type { TokenDocument, TokenNode } from "../parser/document.js";
import {
  evaluateExpression,
  formatQuantity,
  parseExpression,
  parseQuantity,
  type Quantity,
} from "./expression.js";

/**
 * Alias resolution. A resolver is created over a document plus a lookup
 * order (theme semantics: later sets override earlier ones; disabled sets are
 * simply omitted from the order). Resolution is memoized; cycles are detected
 * with the exact path reported in the error.
 */

export interface ResolvedToken {
  readonly token: TokenNode;
  /** Fully resolved value: aliases flattened, math evaluated. */
  readonly value: unknown;
  /** Every token path this token references, directly (not transitively). */
  readonly references: readonly string[];
}

export interface ResolverOptions {
  /** Set names in precedence order (later wins). Defaults to document order. */
  readonly setOrder?: readonly string[];
}

export interface ResolveAllResult {
  readonly resolved: ReadonlyMap<string, ResolvedToken>;
  readonly errors: readonly TokenResolutionError[];
}

export interface ReferenceGraph {
  /** path -> paths it references directly. */
  readonly dependencies: ReadonlyMap<string, ReadonlySet<string>>;
  /** path -> paths that reference it directly (reverse edges). */
  readonly dependents: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Every reference path embedded anywhere in a (plain JSON) token value. */
export function extractReferences(value: unknown): string[] {
  const paths: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      paths.push(...findReferences(node));
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (typeof node === "object" && node !== null) {
      Object.values(node).forEach(walk);
    }
  };
  walk(value);
  return paths;
}

export interface Resolver {
  /** Resolve one token fully. Throws {@link TokenResolutionError}. */
  resolve(path: string): ResolvedToken;
  /** Resolve every token reachable in the lookup order, collecting errors. */
  resolveAll(): ResolveAllResult;
  /** The token that wins lookup for a path, before resolution. */
  lookup(path: string): TokenNode | undefined;
  /** Direct + reverse reference graph over winning tokens. */
  graph(): ReferenceGraph;
  /** Paths of every token visible in the lookup order. */
  visiblePaths(): readonly string[];
}

function toQuantity(value: unknown, path: string): Quantity {
  if (typeof value === "number") {
    return { value, unit: "" };
  }
  if (typeof value === "string") {
    const quantity = parseQuantity(value);
    if (quantity) return quantity;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "unit" in value &&
    typeof (value as { value: unknown }).value === "number" &&
    typeof (value as { unit: unknown }).unit === "string"
  ) {
    return { value: (value as { value: number }).value, unit: (value as { unit: string }).unit };
  }
  throw new TokenResolutionError(
    `Token "${path}" used in a math expression does not resolve to a number or dimension (got ${JSON.stringify(
      value,
    )})`,
    path,
  );
}

export function createResolver(document: TokenDocument, options: ResolverOptions = {}): Resolver {
  const setOrder = options.setOrder ?? [...document.sets.keys()];

  for (const name of setOrder) {
    if (!document.sets.has(name)) {
      throw new TokenResolutionError(
        `Unknown token set ${JSON.stringify(name)} in set order (known: ${[...document.sets.keys()]
          .map((setName) => JSON.stringify(setName))
          .join(", ")})`,
        "",
      );
    }
  }

  const lookup = (path: string): TokenNode | undefined => {
    for (let i = setOrder.length - 1; i >= 0; i--) {
      const name = setOrder[i];
      if (name === undefined) continue;
      const token = document.sets.get(name)?.tokens.get(path);
      if (token) return token;
    }
    return undefined;
  };

  const memo = new Map<string, ResolvedToken>();
  const visiting: string[] = [];
  const visitingSet = new Set<string>();

  const resolveTokenValue = (path: string): ResolvedToken => {
    const cached = memo.get(path);
    if (cached) return cached;

    if (visitingSet.has(path)) {
      const cycleStart = visiting.indexOf(path);
      const cyclePath = [...visiting.slice(cycleStart), path];
      throw new TokenResolutionError(`Reference cycle: ${cyclePath.join(" -> ")}`, path, cyclePath);
    }

    const token = lookup(path);
    if (!token) {
      const referrer = visiting[visiting.length - 1];
      throw new TokenResolutionError(
        referrer === undefined
          ? `Token "${path}" does not exist in the active sets`
          : `Token "${referrer}" references "${path}", which does not exist in the active sets`,
        path,
      );
    }

    visiting.push(path);
    visitingSet.add(path);
    try {
      const value = resolveValue(token.value, path);
      const resolved: ResolvedToken = {
        token,
        value,
        references: extractReferences(token.value),
      };
      memo.set(path, resolved);
      return resolved;
    } finally {
      visiting.pop();
      visitingSet.delete(path);
    }
  };

  const resolveString = (text: string, ownerPath: string): unknown => {
    if (isReference(text)) {
      return resolveTokenValue(referencePath(text)).value;
    }
    const embedded = findReferences(text);
    if (embedded.length === 0) {
      // Color functions may also wrap literals: "darken(#3b82f6, 0.2)".
      return isColorFunction(text) ? evaluateColorFunction(text) : text;
    }
    // Color functions over references: substitute, then evaluate.
    if (isColorFunction(text)) {
      const substituted = text.replaceAll(/\{([^{}]+)\}/g, (_match: string, referenced: string) => {
        const value = resolveTokenValue(referenced).value;
        if (typeof value !== "string" && typeof value !== "number") {
          throw new TokenResolutionError(
            `Token "${ownerPath}" uses "${referenced}" in a color function, but it does not resolve to a color string`,
            referenced,
          );
        }
        return String(value);
      });
      return evaluateColorFunction(substituted);
    }
    // A string with embedded references is either a math expression or a
    // textual interpolation ("{brand.name} Sans"). Only a parse failure means
    // "not math" — once it parses as an operation, evaluation errors (unit
    // mismatch, division by zero, non-numeric reference) must propagate
    // rather than silently degrade into interpolation.
    let ast;
    try {
      ast = parseExpression(text);
    } catch {
      ast = undefined;
    }
    if (ast !== undefined && (ast.kind === "binary" || ast.kind === "negate")) {
      const quantity = evaluateExpression(
        ast,
        (referenced) => toQuantity(resolveTokenValue(referenced).value, referenced),
        text,
      );
      return quantity.unit === "" ? quantity.value : formatQuantity(quantity);
    }
    return text.replaceAll(/\{([^{}]+)\}/g, (_match: string, referenced: string) => {
      const value = resolveTokenValue(referenced).value;
      if (typeof value === "string" || typeof value === "number") {
        return String(value);
      }
      throw new TokenResolutionError(
        `Token "${ownerPath}" interpolates "${referenced}", which does not resolve to a string or number`,
        referenced,
      );
    });
  };

  const resolveValue = (value: unknown, ownerPath: string): unknown => {
    if (typeof value === "string") {
      return resolveString(value, ownerPath);
    }
    if (Array.isArray(value)) {
      return value.map((item) => resolveValue(item, ownerPath));
    }
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, resolveValue(child, ownerPath)]),
      );
    }
    return value;
  };

  const visiblePaths = (): string[] => {
    const paths = new Set<string>();
    for (const name of setOrder) {
      const set = document.sets.get(name);
      if (!set) continue;
      for (const path of set.tokens.keys()) {
        paths.add(path);
      }
    }
    return [...paths];
  };

  return {
    resolve: resolveTokenValue,
    lookup,

    resolveAll(): ResolveAllResult {
      const resolved = new Map<string, ResolvedToken>();
      const errors: TokenResolutionError[] = [];
      for (const path of visiblePaths()) {
        try {
          resolved.set(path, resolveTokenValue(path));
        } catch (error) {
          if (error instanceof TokenResolutionError) {
            errors.push(error);
          } else {
            throw error;
          }
        }
      }
      return { resolved, errors };
    },

    graph(): ReferenceGraph {
      const dependencies = new Map<string, ReadonlySet<string>>();
      const dependents = new Map<string, Set<string>>();
      for (const path of visiblePaths()) {
        const token = lookup(path);
        if (!token) continue;
        const references = new Set(extractReferences(token.value));
        dependencies.set(path, references);
        for (const referenced of references) {
          let set = dependents.get(referenced);
          if (!set) {
            set = new Set();
            dependents.set(referenced, set);
          }
          set.add(path);
        }
      }
      return { dependencies, dependents };
    },

    visiblePaths,
  };
}
