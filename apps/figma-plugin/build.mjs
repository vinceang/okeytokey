/**
 * Bundles the plugin's two entry points:
 *   - src/main/code.ts -> dist/code.js   (Figma main thread, no DOM)
 *   - src/ui/main.tsx  -> inlined into dist/ui.html (UI iframe; Figma requires
 *     a single self-contained HTML file)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { build } from "esbuild";

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/main/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  format: "iife",
  target: "es2017",
});

const ui = await build({
  entryPoints: ["src/ui/main.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

const [bundle] = ui.outputFiles;
if (!bundle) {
  throw new Error("esbuild produced no UI bundle output");
}
// Guard against the bundle terminating the inline <script> tag early.
const js = bundle.text.replaceAll("</script>", "<\\/script>");
const template = await readFile("src/ui/ui.html", "utf8");
await writeFile("dist/ui.html", template.replace("<!--APP_SCRIPT-->", `<script>${js}</script>`));

console.log("figma-plugin: dist/code.js + dist/ui.html written");
