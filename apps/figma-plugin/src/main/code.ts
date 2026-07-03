/**
 * Figma plugin main thread. No DOM here — only the `figma` plugin API.
 *
 * Phase 0 scaffold: shows the UI iframe and echoes messages.
 * TODO(phase-5): validate messages with the @okeytokey/figma-bridge Zod
 * protocol, apply tokens to selection, export/import Figma Variables, and
 * reapply the active theme when new component instances enter the document.
 */

figma.showUI(__html__, { width: 340, height: 300 });

figma.ui.onmessage = (message: unknown) => {
  console.log("okeytokey: message from UI", message);
};
