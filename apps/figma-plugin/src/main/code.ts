import {
  createResolver,
  createTokenDocument,
  parseTokenSet,
  type TokenDocument,
} from "@okeytokey/core";
import {
  BRIDGE_PROTOCOL_VERSION,
  importVariables,
  parseUiToMain,
  planApply,
  planVariableExport,
  type ApplyAction,
  type MainToUi,
  type VariableDump,
} from "@okeytokey/figma-bridge";

/**
 * Figma plugin main thread. No DOM — only the `figma` API. All mapping logic
 * lives in @okeytokey/figma-bridge; this file executes plans against nodes
 * and Variables, and owns persistence (document + active theme in
 * pluginData).
 *
 * TODO(phase-6+): full continuous two-way variable sync. The read path
 * (importVariables) and write path (planVariableExport) are implemented;
 * continuous sync needs change detection on both sides and belongs behind a
 * SyncProvider-like interface once the plugin can talk to the studio.
 */

const DOCUMENT_KEY = "okeytokey.document";
const ACTIVE_THEME_KEY = "okeytokey.activeTheme";

figma.showUI(__html__, { width: 380, height: 520 });

let tokenDocument: TokenDocument = createTokenDocument([]);

function post(message: MainToUi): void {
  figma.ui.postMessage(message);
}

function loadPersistedDocument(): void {
  const raw = figma.root.getPluginData(DOCUMENT_KEY);
  if (raw === "") return;
  try {
    const files = JSON.parse(raw) as { name: string; json: string }[];
    tokenDocument = createTokenDocument(files.map((file) => parseTokenSet(file.name, file.json)));
  } catch {
    // Corrupt plugin data — start empty rather than crash.
    tokenDocument = createTokenDocument([]);
  }
}

function tokenCount(): number {
  let count = 0;
  for (const set of tokenDocument.sets.values()) count += set.tokens.size;
  return count;
}

function activeTheme(): string | null {
  const value = figma.root.getPluginData(ACTIVE_THEME_KEY);
  return value === "" ? null : value;
}

// --- Node application ---------------------------------------------------------

async function executeAction(node: SceneNode, action: ApplyAction): Promise<boolean> {
  switch (action.kind) {
    case "solid-paint": {
      if (!(action.property in node)) return false;
      const paint: SolidPaint = {
        type: "SOLID",
        color: { r: action.color.r, g: action.color.g, b: action.color.b },
        opacity: action.color.a,
      };
      (node as unknown as Record<string, unknown>)[action.property] = [paint];
      return true;
    }
    case "corner-radius":
      if (!("cornerRadius" in node)) return false;
      (node as unknown as { cornerRadius: number }).cornerRadius = action.radius;
      return true;
    case "padding": {
      if (!("paddingLeft" in node)) return false;
      const frame = node as FrameNode;
      frame.paddingLeft = action.padding;
      frame.paddingRight = action.padding;
      frame.paddingTop = action.padding;
      frame.paddingBottom = action.padding;
      return true;
    }
    case "gap":
      if (!("itemSpacing" in node)) return false;
      (node as FrameNode).itemSpacing = action.gap;
      return true;
    case "typography": {
      if (node.type !== "TEXT") return false;
      const text = node;
      const currentFont =
        text.fontName === figma.mixed ? { family: "Inter", style: "Regular" } : text.fontName;
      const font: FontName = {
        family: action.fontFamily ?? currentFont.family,
        style: action.fontStyle ?? currentFont.style,
      };
      try {
        await figma.loadFontAsync(font);
        text.fontName = font;
      } catch {
        // Font/style not available — apply what we can.
        await figma.loadFontAsync(currentFont);
      }
      if (action.fontSize !== undefined) text.fontSize = action.fontSize;
      if (action.lineHeightPercent !== undefined) {
        text.lineHeight = { unit: "PERCENT", value: action.lineHeightPercent };
      }
      if (action.letterSpacingPx !== undefined) {
        text.letterSpacing = { unit: "PIXELS", value: action.letterSpacingPx };
      }
      return true;
    }
  }
}

async function applyToken(path: string, target: Parameters<typeof planApply>[2]): Promise<void> {
  const resolver = createResolver(tokenDocument);
  const resolved = resolver.resolve(path);
  const action = planApply(resolved.token.type, resolved.value, target);
  let applied = 0;
  for (const node of figma.currentPage.selection) {
    if (await executeAction(node, action)) applied++;
  }
  post({ type: "applied", path, nodeCount: applied });
}

// --- Variables -----------------------------------------------------------------

async function exportVariables(themes: Parameters<typeof planVariableExport>[1]): Promise<void> {
  const plan = planVariableExport(tokenDocument, themes);
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collection = collections.find((candidate) => candidate.name === plan.collection);
  collection ??= figma.variables.createVariableCollection(plan.collection);

  // Ensure a mode per theme (the default mode is renamed to the first theme).
  const modeIds = new Map<string, string>();
  plan.modes.forEach((mode, index) => {
    const existing = collection.modes.find((candidate) => candidate.name === mode);
    if (existing) {
      modeIds.set(mode, existing.modeId);
    } else if (index === 0 && collection.modes.length === 1 && modeIds.size === 0) {
      const defaultMode = collection.modes[0];
      if (defaultMode) {
        collection.renameMode(defaultMode.modeId, mode);
        modeIds.set(mode, defaultMode.modeId);
      }
    } else {
      modeIds.set(mode, collection.addMode(mode));
    }
  });

  const existingVariables = await figma.variables.getLocalVariablesAsync();
  for (const entry of plan.variables) {
    let variable = existingVariables.find(
      (candidate) =>
        candidate.name === entry.name && candidate.variableCollectionId === collection.id,
    );
    variable ??= figma.variables.createVariable(entry.name, collection, entry.resolvedType);
    for (const [mode, value] of Object.entries(entry.valuesByMode)) {
      const modeId = modeIds.get(mode);
      if (modeId === undefined) continue;
      variable.setValueForMode(
        modeId,
        value.kind === "color"
          ? { r: value.color.r, g: value.color.g, b: value.color.b, a: value.color.a }
          : value.value,
      );
    }
  }

  post({
    type: "variables-exported",
    collection: plan.collection,
    modeCount: plan.modes.length,
    variableCount: plan.variables.length,
  });
}

async function importFromVariables(): Promise<void> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = collections[0];
  if (!collection) {
    post({ type: "error", message: "No local variable collections to import." });
    return;
  }
  const allVariables = await figma.variables.getLocalVariablesAsync();
  const modeNames = new Map(collection.modes.map((mode) => [mode.modeId, mode.name]));
  const dump: VariableDump = {
    collection: collection.name,
    modes: collection.modes.map((mode) => mode.name),
    variables: allVariables
      .filter((variable) => variable.variableCollectionId === collection.id)
      .map((variable) => ({
        name: variable.name,
        resolvedType: variable.resolvedType,
        valuesByMode: Object.fromEntries(
          Object.entries(variable.valuesByMode).map(([modeId, value]) => [
            modeNames.get(modeId) ?? modeId,
            value,
          ]),
        ),
      })),
  };
  const result = importVariables(dump);
  post({ type: "variables-imported", files: [...result.files], report: result.report });
}

// --- Theme persistence on new instances ------------------------------------------

/**
 * When new component instances enter the document, re-pin the active theme's
 * variable mode on them so they don't silently fall back to the collection
 * default — the classic theme-persistence complaint.
 */
async function reapplyThemeTo(nodes: readonly SceneNode[]): Promise<void> {
  const theme = activeTheme();
  if (theme === null) return;
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const collection of collections) {
    const mode = collection.modes.find((candidate) => candidate.name === theme);
    if (!mode) continue;
    for (const node of nodes) {
      try {
        node.setExplicitVariableModeForCollection(collection, mode.modeId);
      } catch {
        // Node type doesn't support explicit modes — skip.
      }
    }
  }
}

figma.on("documentchange", (event) => {
  const created = event.documentChanges
    .filter((change) => change.type === "CREATE")
    .map((change) => change.node)
    .filter((node): node is SceneNode => !node.removed && node.type === "INSTANCE");
  if (created.length > 0) {
    void reapplyThemeTo(created);
  }
});

figma.on("selectionchange", () => {
  post({
    type: "selection-changed",
    nodes: figma.currentPage.selection.map((node) => ({
      id: node.id,
      name: node.name,
      nodeType: node.type,
    })),
  });
});

// --- Message loop -------------------------------------------------------------------

figma.ui.onmessage = (raw: unknown) => {
  const message = parseUiToMain(raw);
  if (!message) {
    post({ type: "error", message: "Malformed message from UI (protocol mismatch?)" });
    return;
  }
  void (async () => {
    try {
      switch (message.type) {
        case "ui-ready":
          loadPersistedDocument();
          post({
            type: "init",
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            activeTheme: activeTheme(),
            tokenCount: tokenCount(),
          });
          break;
        case "load-document":
          tokenDocument = createTokenDocument(
            message.files.map((file) => parseTokenSet(file.name, file.json)),
          );
          figma.root.setPluginData(DOCUMENT_KEY, JSON.stringify(message.files));
          post({ type: "document-loaded", tokenCount: tokenCount() });
          break;
        case "apply-token":
          await applyToken(message.path, message.target);
          break;
        case "export-variables":
          await exportVariables(message.themes);
          break;
        case "import-variables":
          await importFromVariables();
          break;
        case "set-active-theme": {
          figma.root.setPluginData(ACTIVE_THEME_KEY, message.theme ?? "");
          // Pin the mode on all top-level frames of the current page.
          if (message.theme !== null) {
            await reapplyThemeTo(figma.currentPage.children);
          }
          post({ type: "active-theme", theme: message.theme });
          break;
        }
      }
    } catch (error) {
      post({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  })();
};
