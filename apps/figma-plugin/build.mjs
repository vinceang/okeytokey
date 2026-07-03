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
  outdir: "dist",
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

const jsBundle = ui.outputFiles.find((file) => file.path.endsWith(".js"));
const cssBundle = ui.outputFiles.find((file) => file.path.endsWith(".css"));
if (!jsBundle) {
  throw new Error("esbuild produced no UI bundle output");
}
// Guard against the bundle terminating the inline <script> tag early.
const js = jsBundle.text.replaceAll("</script>", "<\\/script>");
const css = cssBundle ? `<style>${cssBundle.text}</style>` : "";
const template = await readFile("src/ui/ui.html", "utf8");
await writeFile(
  "dist/ui.html",
  template.replace("<!--APP_SCRIPT-->", `${css}<script>${js}</script>`),
);

console.log("figma-plugin: dist/code.js + dist/ui.html written");
