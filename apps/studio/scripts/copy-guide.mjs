/**
 * Copies the canonical user guide (docs/site) into the studio's public dir so
 * Vite serves it at /guide.html. Runs before dev and build; the copy is
 * gitignored — docs/site stays the single source of truth.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
await mkdir(publicDir, { recursive: true });
await copyFile(
  join(here, "..", "..", "..", "docs", "site", "guide.html"),
  join(publicDir, "guide.html"),
);
