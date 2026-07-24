import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/#/demo");
  await expect(page.getByTestId("dark-mode-toggle")).toBeVisible();
});

test("dark mode persists across reloads", async ({ page }) => {
  const toggle = page.getByTestId("dark-mode-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
  await expect(page.getByTestId("dark-mode-toggle")).toHaveAttribute("aria-checked", "true");
});

test("dark editor has no serious accessibility violations", async ({ page }) => {
  await page.getByTestId("dark-mode-toggle").click();
  await page.getByTestId("token-colors.blue.500").click();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious,
    serious
      .map((violation) => `${violation.id} (${String(violation.nodes.length)} nodes)`)
      .join(", "),
  ).toEqual([]);
});
