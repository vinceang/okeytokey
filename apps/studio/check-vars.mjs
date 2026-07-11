import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:5173/");
await page.waitForTimeout(800);
const val = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--accent-600"),
);
const badge = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--font-display"),
);
console.log("accent-600:", val);
console.log("font-display:", badge);
await browser.close();
