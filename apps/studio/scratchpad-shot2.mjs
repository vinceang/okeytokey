import { chromium } from "@playwright/test";

const OUT =
  "/private/tmp/claude-501/-Users-vincentang-Documents-okeytokey/29cf91db-e4eb-4a84-9fe3-8fa1ea804fe7/scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto("http://localhost:5173/");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/10-dashboard.png` });

await page.getByRole("button", { name: /new project/i }).click();
await page.waitForTimeout(300);
const nameInput = page.locator("input").first();
await nameInput.fill("Redesign Preview " + Date.now());
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);

await page.screenshot({ path: `${OUT}/11-onboarding.png` });

await browser.close();
