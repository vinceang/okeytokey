import {
  addSet,
  createToken,
  deleteToken,
  deprecate,
  emptySet,
  planRename,
  removeSet,
  renameSet,
  setGroupMeta,
  setTokenMeta,
  setTokenValue,
  sortTokenSet,
  withSet,
  type TokenDocument,
  type TokenInit,
  type TokenMetaPatch,
  type TokenSet,
} from "@okeytokey/core";
import type { DtcgTokenType } from "@okeytokey/schema";

/**
 * Command pattern over the immutable document. `run` returns the next
 * document plus the exact inverse command. Inverses restore captured
 * structural snapshots (cheap — ordered-JSON shares untouched subtrees),
 * which also restores key order exactly: undoing a delete puts the token
 * back in its original position, not at the end. See ADR 0003.
 */
export interface Command {
  readonly label: string;
  run(document: TokenDocument): { document: TokenDocument; inverse: Command };
}

function getSet(document: TokenDocument, name: string): TokenSet {
  const set = document.sets.get(name);
  if (!set) {
    throw new RangeError(`Token set ${JSON.stringify(name)} does not exist`);
  }
  return set;
}

/** Inverse workhorse: put a captured set back (by name), capturing the current one. */
function restoreSet(label: string, snapshot: TokenSet): Command {
  return {
    label,
    run(document) {
      const current = getSet(document, snapshot.name);
      return { document: withSet(document, snapshot), inverse: restoreSet(label, current) };
    },
  };
}

/** Build a command from a set-level core mutation. */
function setCommand(label: string, setName: string, mutate: (set: TokenSet) => TokenSet): Command {
  return {
    label,
    run(document) {
      const before = getSet(document, setName);
      const after = mutate(before);
      return { document: withSet(document, after), inverse: restoreSet(label, before) };
    },
  };
}

export function cmdCreateToken(setName: string, path: string, init: TokenInit): Command {
  return setCommand(`Create ${path}`, setName, (set) => createToken(set, path, init));
}

export function cmdSetTokenValue(setName: string, path: string, value: unknown): Command {
  return setCommand(`Edit ${path}`, setName, (set) => setTokenValue(set, path, value));
}

export function cmdSetTokenMeta(setName: string, path: string, patch: TokenMetaPatch): Command {
  return setCommand(`Edit ${path} metadata`, setName, (set) => setTokenMeta(set, path, patch));
}

export function cmdSetGroupMeta(
  setName: string,
  path: string,
  patch: { type?: DtcgTokenType | null; description?: string | null },
): Command {
  return setCommand(`Edit group ${path}`, setName, (set) => setGroupMeta(set, path, patch));
}

export function cmdDeleteToken(setName: string, path: string): Command {
  return setCommand(`Delete ${path}`, setName, (set) => deleteToken(set, path));
}

export function cmdSortSet(setName: string): Command {
  return setCommand(`Sort ${setName} A→Z`, setName, sortTokenSet);
}

export function cmdAddSet(name: string): Command {
  return {
    label: `Create set ${name}`,
    run(document) {
      return { document: addSet(document, emptySet(name)), inverse: cmdRemoveSet(name) };
    },
  };
}

/** Restore a full document snapshot (inverse for multi-set operations). */
function restoreDocument(label: string, snapshot: TokenDocument): Command {
  return {
    label,
    run(document) {
      return { document: snapshot, inverse: restoreDocument(label, document) };
    },
  };
}

export function cmdRemoveSet(name: string): Command {
  return {
    label: `Delete set ${name}`,
    run(document) {
      // Removing a set can't be inverted set-locally: order matters.
      return {
        document: removeSet(document, name),
        inverse: restoreDocument(`Delete set ${name}`, document),
      };
    },
  };
}

export function cmdRenameSet(from: string, to: string): Command {
  return {
    label: `Rename set ${from} → ${to}`,
    run(document) {
      return { document: renameSet(document, from, to), inverse: cmdRenameSet(to, from) };
    },
  };
}

/** Apply a lint fix (document -> document) through the undo stack. */
export function cmdApplyFix(fix: {
  label: string;
  apply: (document: TokenDocument) => TokenDocument;
}): Command {
  return {
    label: fix.label,
    run(document) {
      return { document: fix.apply(document), inverse: restoreDocument(fix.label, document) };
    },
  };
}

/** Rename a token/group everywhere (rename-with-refactor). */
export function cmdRenameToken(fromPath: string, toPath: string): Command {
  return {
    label: `Rename ${fromPath} → ${toPath}`,
    run(document) {
      const next = planRename(document, fromPath, toPath).apply();
      return {
        document: next,
        inverse: restoreDocument(`Rename ${fromPath} → ${toPath}`, document),
      };
    },
  };
}

/** Deprecate a token, optionally pointing at its replacement. */
export function cmdDeprecate(path: string, replacementPath?: string): Command {
  return {
    label: `Deprecate ${path}`,
    run(document) {
      return {
        document: deprecate(document, path, replacementPath),
        inverse: restoreDocument(`Deprecate ${path}`, document),
      };
    },
  };
}

/** Import/replace a whole set from parsed DTCG JSON. */
export function cmdImportSet(set: TokenSet): Command {
  return {
    label: `Import set ${set.name}`,
    run(document) {
      if (document.sets.has(set.name)) {
        const before = getSet(document, set.name);
        return {
          document: withSet(document, set),
          inverse: restoreSet(`Import set ${set.name}`, before),
        };
      }
      return { document: addSet(document, set), inverse: cmdRemoveSet(set.name) };
    },
  };
}
