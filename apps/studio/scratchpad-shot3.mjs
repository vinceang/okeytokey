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
} else {
  await page
    .getByRole("link", { name: /design system|preview/i })
    .first()
    .click();
}
await page.waitForTimeout(1200);

const starter = page.getByText("Start from a starter architecture");
if (await starter.count()) {
  await starter.click();
  await page.waitForTimeout(1200);
}
await page.screenshot({ path: `${OUT}/19-after-click.png` });

// select a token row to see selection + inspector
const rows = page.locator('[role="row"]');
console.log("row count", await rows.count());
if (await rows.count()) {
  await rows.nth(Math.min(2, (await rows.count()) - 1)).click();
  await page.waitForTimeout(400);
}
await page.screenshot({ path: `${OUT}/20-selected.png` });

// focus the filter input to see the focus ring
const filterInput = page.getByPlaceholder("Filter tokens (name or value)…");
if (await filterInput.count()) {
  await filterInput.focus();
  await page.waitForTimeout(200);
}
await page.screenshot({ path: `${OUT}/21-focus.png` });

// expand a set with mixed layers if present, to see layer badges in the sidebar
await page.screenshot({
  path: `${OUT}/22-sidebar.png`,
  clip: { x: 0, y: 0, width: 240, height: 300 },
});

await browser.close();
