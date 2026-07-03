import { useMemo } from "react";

import {
  createResolver,
  resolutionOrder,
  type ResolvedToken,
  type Resolver,
} from "@okeytokey/core";

import { useDocumentStore } from "../state/document-store.js";
import { useUiStore } from "../state/ui-store.js";

/**
 * The resolver for the current view: honors the active theme's set order and
 * statuses when one is selected, plain document order otherwise. Memoized on
 * the document identity (immutable — identity change = content change).
 */
export function useResolver(): Resolver {
  const document = useDocumentStore((state) => state.document);
  const themes = useDocumentStore((state) => state.themes);
  const activeTheme = useUiStore((state) => state.activeTheme);

  return useMemo(() => {
    const theme = themes.find((candidate) => candidate.name === activeTheme);
    // Guard against themes referencing sets that were deleted since.
    const order = theme
      ? resolutionOrder(theme).filter((name) => document.sets.has(name))
      : undefined;
    return createResolver(document, order ? { setOrder: order } : {});
  }, [document, themes, activeTheme]);
}

/** Resolve one token, returning the error message instead of throwing. */
export function safeResolve(
  resolver: Resolver,
  path: string,
): { resolved?: ResolvedToken; error?: string } {
  try {
    return { resolved: resolver.resolve(path) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
