import { expect, test } from "@playwright/test";

test("theme groups expand into combination themes that resolve correctly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("set-global")).toBeVisible();

  // Starter light/dark themes already share the "mode" group; one group is
  // not enough for a matrix, so the button is hidden.
  await expect(page.getByTestId("expand-matrix")).not.toBeVisible();

  // Add a second dimension: a "brand-b" theme in the "brand" group that
  // enables only the global set (no dark overrides of its own).
  page.once("dialog", (dialog) => void dialog.accept("brand-b"));
  await page.getByTestId("add-theme").click();
  await page.getByTestId("theme-group-input").fill("brand");
  await page.getByTestId("theme-group-input").blur();
  // Disable the dark set within brand-b so the mode dimension controls it.
  await page
    .getByRole("group", { name: "Status of dark" })
    .getByRole("button", { name: "Off" })
    .click();
  await page.getByRole("button", { name: "Done" }).click();

  // Two groups now exist -> the matrix button appears; expand.
  await page.getByTestId("expand-matrix").click();
  await expect(page.getByTestId("theme-light / brand-b")).toBeVisible();
  await expect(page.getByTestId("theme-dark / brand-b")).toBeVisible();

  // Combinations behave as real themes: the dark combination flips resolution.
  await page.getByTestId("set-semantic").click();
  await page.getByTestId("token-semantic.background").click();
  await page.getByTestId("theme-light / brand-b").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#f8fafc");
  await page.getByTestId("theme-dark / brand-b").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#0f172a");

  // Re-expanding is a no-op (name-keyed dedupe) — alert, no duplicates.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("expand-matrix").click();
  await expect(page.getByTestId("themes-section").getByTestId("theme-dark / brand-b")).toHaveCount(
    1,
  );
});
