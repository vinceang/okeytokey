import { EMBEDDED_REFERENCE_PATTERN, findReferences } from "@okeytokey/schema";

import { TokenParseError } from "../errors.js";
import {
  createToken,
  deleteToken,
  setTokenMeta,
  setTokenValue,
  withSet,
} from "../mutate/mutate.js";
import type { TokenDocument, TokenSet } from "../parser/document.js";

/**
 * Refactoring operations. Each returns a change set for preview; `apply`
 * executes it atomically (token + every reference to it, across all sets).
 * Rename-with-refactor is table stakes and free — see the project spec.
 */

export interface ReferenceEdit {
  readonly setName: string;
  readonly tokenPath: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface RenamePlan {
  readonly kind: "rename";
  readonly fromPath: string;
  readonly toPath: string;
  /** Sets that contain a token at fromPath (each gets moved). */
  readonly movedIn: readonly string[];
  /** Every value edit needed to retarget references. */
  readonly referenceEdits: readonly ReferenceEdit[];
  readonly apply: () => TokenDocument;
}

class RefactorError extends TokenParseError {
  override readonly name = "RefactorError";
}

function retargetValue(value: unknown, fromPath: string, toPath: string): unknown {
  const fromPrefix = `${fromPath}.`;
  const rewritePath = (path: string) =>
    path === fromPath
      ? toPath
      : path.startsWith(fromPrefix)
        ? toPath + path.slice(fromPath.length)
        : path;

  const rewriteString = (text: string) =>
    text.replaceAll(EMBEDDED_REFERENCE_PATTERN, (whole: string, path: string) => {
      const next = rewritePath(path);
      return next === path ? whole : `{${next}}`;
    });

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return rewriteString(node);
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === "object" && node !== null) {
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    }
    return node;
  };
  return walk(value);
}

/** True if any reference in `value` points at `path` or inside its subtree. */
function referencesPath(value: unknown, path: string): boolean {
  const prefix = `${path}.`;
  const check = (node: unknown): boolean => {
    if (typeof node === "string") {
      return findReferences(node).some(
        (reference) => reference === path || reference.startsWith(prefix),
      );
    }
    if (Array.isArray(node)) return node.some(check);
    if (typeof node === "object" && node !== null) return Object.values(node).some(check);
    return false;
  };
  return check(value);
}

/**
 * Plan a rename of the token (or group subtree) at `fromPath` to `toPath`,
 * updating every reference across all sets. Nothing is mutated until
 * `apply()` is called.
 */
export function planRename(document: TokenDocument, fromPath: string, toPath: string): RenamePlan {
  if (fromPath === toPath) {
    throw new RefactorError("", [{ path: fromPath, message: "New path is identical" }]);
  }

  const fromPrefix = `${fromPath}.`;
  const movedIn: string[] = [];
  for (const [name, set] of document.sets) {
    const collides = [...set.tokens.keys()].some(
      (path) => path === toPath || path.startsWith(`${toPath}.`),
    );
    if (collides) {
      throw new RefactorError(name, [
        { path: toPath, message: `A token or group already exists at "${toPath}"` },
      ]);
    }
    const hasToken = [...set.tokens.keys()].some(
      (path) => path === fromPath || path.startsWith(fromPrefix),
    );
    if (hasToken) movedIn.push(name);
  }
  if (movedIn.length === 0) {
    throw new RefactorError("", [
      { path: fromPath, message: `No token or group at "${fromPath}" in any set` },
    ]);
  }

  const referenceEdits: ReferenceEdit[] = [];
  for (const [name, set] of document.sets) {
    for (const token of set.tokens.values()) {
      if (!referencesPath(token.value, fromPath)) continue;
      referenceEdits.push({
        setName: name,
        tokenPath: token.pathString,
        before: token.value,
        after: retargetValue(token.value, fromPath, toPath),
      });
    }
  }

  const apply = (): TokenDocument => {
    let next = document;
    // Move tokens set by set: recreate at the new path, delete the old.
    for (const name of movedIn) {
      let set = next.sets.get(name);
      if (!set) continue;
      const moving = [...set.tokens.values()].filter(
        (token) => token.pathString === fromPath || token.pathString.startsWith(fromPrefix),
      );
      for (const token of moving) {
        const suffix = token.pathString.slice(fromPath.length);
        const target = toPath + suffix;
        set = createToken(set, target, { type: token.type, value: token.value });
        if (token.description !== undefined) {
          set = setTokenMeta(set, target, { description: token.description });
        }
        if (token.deprecated !== undefined) {
          set = setTokenMeta(set, target, { deprecated: token.deprecated });
        }
        if (token.okeytokey !== undefined) {
          set = setTokenMeta(set, target, { okeytokey: token.okeytokey });
        }
        set = deleteToken(set, token.pathString);
      }
      next = withSet(next, set);
    }
    // Retarget references (skip tokens that moved — their values were copied,
    // then rewritten below under the new path).
    for (const edit of referenceEdits) {
      const set = next.sets.get(edit.setName);
      if (!set) continue;
      const moved =
        edit.tokenPath === fromPath || edit.tokenPath.startsWith(fromPrefix)
          ? toPath + edit.tokenPath.slice(fromPath.length)
          : edit.tokenPath;
      if (!set.tokens.has(moved)) continue;
      next = withSet(next, setTokenValue(set, moved, edit.after));
    }
    return next;
  };

  return { kind: "rename", fromPath, toPath, movedIn, referenceEdits, apply };
}

/** Convenience: plan + apply in one step. */
export function renameToken(
  document: TokenDocument,
  fromPath: string,
  toPath: string,
): TokenDocument {
  return planRename(document, fromPath, toPath).apply();
}

export interface MovePlan {
  readonly kind: "move";
  readonly path: string;
  readonly fromSet: string;
  readonly toSet: string;
  readonly apply: () => TokenDocument;
}

/** Move a token between sets (same path). References are unaffected. */
export function planMoveToSet(
  document: TokenDocument,
  path: string,
  fromSetName: string,
  toSetName: string,
): MovePlan {
  const fromSet = document.sets.get(fromSetName);
  const toSet = document.sets.get(toSetName);
  const token = fromSet?.tokens.get(path);
  if (!fromSet || !token) {
    throw new RefactorError(fromSetName, [{ path, message: "Token does not exist" }]);
  }
  if (!toSet) {
    throw new RefactorError(toSetName, [{ path: "", message: "Target set does not exist" }]);
  }
  if (toSet.tokens.has(path)) {
    throw new RefactorError(toSetName, [
      { path, message: `Target set already has a token at "${path}"` },
    ]);
  }

  const apply = (): TokenDocument => {
    let target: TokenSet = createToken(toSet, path, { type: token.type, value: token.value });
    if (token.description !== undefined) {
      target = setTokenMeta(target, path, { description: token.description });
    }
    if (token.deprecated !== undefined) {
      target = setTokenMeta(target, path, { deprecated: token.deprecated });
    }
    if (token.okeytokey !== undefined) {
      target = setTokenMeta(target, path, { okeytokey: token.okeytokey });
    }
    return withSet(withSet(document, deleteToken(fromSet, path)), target);
  };

  return { kind: "move", path, fromSet: fromSetName, toSet: toSetName, apply };
}

/**
 * Mark a token deprecated (optionally naming its replacement) in the set
 * that owns it under document order.
 */
export function deprecate(
  document: TokenDocument,
  path: string,
  replacementPath?: string,
): TokenDocument {
  for (const [, set] of [...document.sets].reverse()) {
    const token = set.tokens.get(path);
    if (!token) continue;
    if (replacementPath !== undefined && !documentHasPath(document, replacementPath)) {
      throw new RefactorError(set.name, [
        { path: replacementPath, message: "Replacement token does not exist" },
      ]);
    }
    const okeytokey = {
      ...token.okeytokey,
      lifecycle: "deprecated" as const,
      ...(replacementPath !== undefined ? { replacedBy: replacementPath } : {}),
    };
    const updated = setTokenMeta(set, path, {
      deprecated: replacementPath !== undefined ? `use ${replacementPath}` : true,
      okeytokey,
    });
    return withSet(document, updated);
  }
  throw new RefactorError("", [{ path, message: "Token does not exist in any set" }]);
}

function documentHasPath(document: TokenDocument, path: string): boolean {
  for (const set of document.sets.values()) {
    if (set.tokens.has(path)) return true;
  }
  return false;
}
