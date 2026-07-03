import { expect, test } from "@playwright/test";

test("studio boots with starter content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "okeytokey" })).toBeVisible();
  // Starter document: three sets seeded on an empty database.
  await expect(page.getByTestId("set-global")).toBeVisible();
  await expect(page.getByTestId("set-semantic")).toBeVisible();
  await expect(page.getByTestId("set-dark")).toBeVisible();
  // Token list shows the global set's groups.
  await expect(page.getByTestId("group-colors")).toBeVisible();
  await expect(page.getByTestId("token-spacing.md")).toBeVisible();
});

test("selecting a token shows resolved value in the inspector", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("token-spacing.md").click();
  // {spacing.base} * 4 with base 4px resolves to 16px.
  await expect(page.getByTestId("resolved-preview")).toContainText("16px");
});
