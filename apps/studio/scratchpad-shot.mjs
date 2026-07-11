import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// seed onboarding + a starter project so we land straight in the editor
await page.goto("http://localhost:5173/");
await page.evaluate(() => {
  localStorage.setItem("okeytokey.onboarded", "true");
});
await page.reload();
await page.waitForTimeout(1200);
await page.screenshot({
  path: "/private/tmp/claude-501/-Users-vincentang-Documents-okeytokey/29cf91db-e4eb-4a84-9fe3-8fa1ea804fe7/scratchpad/01-dashboard.png",
});

// click into first project
await page.getByText("My Design System").click();
await page.waitForTimeout(1800);
await page.screenshot({
  path: "/private/tmp/claude-501/-Users-vincentang-Documents-okeytokey/29cf91db-e4eb-4a84-9fe3-8fa1ea804fe7/scratchpad/02-editor.png",
  fullPage: false,
});

// onboarding: pick the starter architecture
const starter = page.getByText("Start from a starter architecture");
if (await starter.count()) {
  await starter.click();
  await page.waitForTimeout(1200);
}
await page.screenshot({
  path: "/private/tmp/claude-501/-Users-vincentang-Documents-okeytokey/29cf91db-e4eb-4a84-9fe3-8fa1ea804fe7/scratchpad/03-treegrid.png",
  fullPage: false,
});

// select a token to see the inspector panel
const firstRow = page.locator('[role="row"]').nth(1);
if (await firstRow.count()) {
  await firstRow.click();
  await page.waitForTimeout(500);
}
await page.screenshot({
  path: "/private/tmp/claude-501/-Users-vincentang-Documents-okeytokey/29cf91db-e4eb-4a84-9fe3-8fa1ea804fe7/scratchpad/04-inspector.png",
  fullPage: false,
});

await browser.close();
