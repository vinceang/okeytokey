/**
 * Package boundary rules for the okeytokey monorepo.
 *
 * The dependency contract:
 *   schema        -> (nothing internal)
 *   core          -> schema
 *   sync          -> core, schema
 *   transforms    -> core, schema
 *   figma-bridge  -> core, schema
 *   ui            -> core, schema
 *   apps          -> anything
 *   (nothing)     -> apps
 *
 * Cross-package imports resolve through pnpm's node_modules symlinks to the
 * real `packages/<name>/dist` paths, so rules match on those real paths.
 * Run after `pnpm build` so dist entry points exist.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies are a CI failure.",
      from: {},
      to: { circular: true },
    },
    {
      name: "schema-depends-on-nothing-internal",
      severity: "error",
      from: { path: "^packages/schema" },
      to: { path: "^(packages/(core|sync|transforms|ui|figma-bridge)|apps)" },
    },
    {
      name: "core-only-schema",
      severity: "error",
      from: { path: "^packages/core" },
      to: { path: "^(packages/(sync|transforms|ui|figma-bridge)|apps)" },
    },
    {
      name: "sync-only-core-schema",
      severity: "error",
      from: { path: "^packages/sync" },
      to: { path: "^(packages/(transforms|ui|figma-bridge)|apps)" },
    },
    {
      name: "transforms-only-core-schema",
      severity: "error",
      from: { path: "^packages/transforms" },
      to: { path: "^(packages/(sync|ui|figma-bridge)|apps)" },
    },
    {
      name: "figma-bridge-only-core-schema",
      severity: "error",
      from: { path: "^packages/figma-bridge" },
      to: { path: "^(packages/(sync|transforms|ui)|apps)" },
    },
    {
      name: "ui-only-core-schema",
      severity: "error",
      from: { path: "^packages/ui" },
      to: { path: "^(packages/(sync|transforms|figma-bridge)|apps)" },
    },
    {
      name: "nothing-depends-on-apps",
      severity: "error",
      from: { path: "^(packages|tooling)" },
      to: { path: "^apps" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
