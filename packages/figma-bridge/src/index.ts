/**
 * @okeytokey/figma-bridge — Figma node/variable mapping and the typed
 * postMessage protocol between the plugin main thread and its UI iframe.
 *
 * Phase 0 scaffold: the discriminated-union message schema (Zod-validated on
 * both sides), node application, and variable import/export land in Phase 5.
 */

/** Bumped on breaking changes to the main-thread <-> UI message protocol. */
export const BRIDGE_PROTOCOL_VERSION = 1;
