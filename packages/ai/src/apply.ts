import {
  createToken,
  deleteToken,
  diffDocuments,
  renameToken,
  setTokenValue,
  withSet,
  type DocumentDiff,
  type TokenDocument,
} from "@okeytokey/core";

import type { TokenChangeProposal, TokenOperation } from "./proposal.js";

/**
 * Proposal application: every operation runs through core's mutation and
 * refactor primitives, which revalidate — an invalid operation fails, it is
 * never half-applied. Per-operation results power selective acceptance;
 * the diff (with transitive impact) powers the review UI.
 *
 * The result is a plain TokenDocument. The studio wraps acceptance in a
 * command with a structural-snapshot inverse (ADR 0003), so undo-after-
 * accept is the ordinary undo path.
 */

export interface OperationResult {
  readonly operation: TokenOperation;
  readonly ok: boolean;
  readonly error?: string;
}

export interface ProposalApplication {
  /** The document after every successful operation. */
  readonly document: TokenDocument;
  readonly results: readonly OperationResult[];
  /** Semantic diff from the input document, including impacted paths. */
  readonly diff: DocumentDiff;
}

function applyOperation(document: TokenDocument, operation: TokenOperation): TokenDocument {
  switch (operation.op) {
    case "create": {
      const set = document.sets.get(operation.set);
      if (!set) throw new RangeError(`Set ${JSON.stringify(operation.set)} does not exist`);
      return withSet(
        document,
        createToken(set, operation.path, {
          type: operation.type,
          value: operation.value,
          description: operation.description,
        }),
      );
    }
    case "update": {
      const set = document.sets.get(operation.set);
      if (!set) throw new RangeError(`Set ${JSON.stringify(operation.set)} does not exist`);
      return withSet(document, setTokenValue(set, operation.path, operation.value));
    }
    case "delete": {
      const set = document.sets.get(operation.set);
      if (!set) throw new RangeError(`Set ${JSON.stringify(operation.set)} does not exist`);
      return withSet(document, deleteToken(set, operation.path));
    }
    case "rename":
      return renameToken(document, operation.fromPath, operation.toPath);
  }
}

/**
 * Apply a proposal's operations sequentially (optionally a selected subset),
 * collecting per-operation failures instead of aborting. Later operations
 * see earlier ones' effects, so a create-then-alias pair works.
 */
export function applyProposal(
  document: TokenDocument,
  proposal: TokenChangeProposal,
  selected?: ReadonlySet<number>,
): ProposalApplication {
  let current = document;
  const results: OperationResult[] = [];

  proposal.operations.forEach((operation, index) => {
    if (selected !== undefined && !selected.has(index)) return;
    try {
      current = applyOperation(current, operation);
      results.push({ operation, ok: true });
    } catch (error) {
      results.push({
        operation,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return { document: current, results, diff: diffDocuments(document, current) };
}
