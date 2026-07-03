import { expect, test } from "@playwright/test";

test("studio shell renders with workspace packages wired", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "okeytokey" })).toBeVisible();
  await expect(page.getByTestId("token-type-count")).toHaveText("13 token types supported");
});

test("core resolver runs in the browser: aliases and math resolve", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("resolved-colors.primary")).toHaveText("#3b82f6");
  await expect(page.getByTestId("resolved-spacing.double")).toHaveText("8px");
});
