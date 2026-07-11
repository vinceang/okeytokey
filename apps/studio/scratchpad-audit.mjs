import { chromium } from "@playwright/test";

const OUT =
  "/private/tmp/claude-501/-Users-vincentang-Documents-okeytokey/29cf91db-e4eb-4a84-9fe3-8fa1ea804fe7/scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto("http://localhost:5173/");
await page.waitForTimeout(500);

const projectLink = page.getByText(/^My Design System$/).first();
if (await projectLink.count()) {
  await projectLink.click();
  await page.waitForTimeout(1000);
}

// expand a group and select a color token to see the inspector panel
const colorRow = page.getByText("500", { exact: true }).first();
if (await colorRow.count()) {
  await colorRow.click();
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/30-inspector-open.png` });

// open the export dialog
await page.getByText("Export CSS/SCSS/TS…").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/31-export-dialog.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// open sync dialog
await page.getByText("Sync with GitHub…").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/32-sync-dialog.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// command palette
await page.keyboard.press("Meta+k");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/33-command-palette.png` });
await page.keyboard.press("Escape");

// diagnostics panel (bottom bar) — click "7 warnings" to expand
await page.getByText("7 warnings").click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/34-diagnostics.png` });

await browser.close();
