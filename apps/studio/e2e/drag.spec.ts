import { expect, test } from "@playwright/test";

test("dragging a token into a group renames it and refactors references", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("token-spacing.base")).toBeVisible();

  // spacing.sm/md/lg all reference {spacing.base} via math expressions.
  await page
    .getByTestId("token-spacing.base")
    .dragTo(page.getByTestId("group-colors").locator(".."));

  // The token moved into the colors group…
  await expect(page.getByTestId("token-colors.base")).toBeVisible();
  await expect(page.getByTestId("token-spacing.base")).not.toBeVisible();

  // …and every math reference was retargeted, so resolution is intact.
  await page.getByTestId("token-spacing.md").click();
  await expect(page.getByTestId("value-input")).toHaveValue("{colors.base} * 4");
  await expect(page.getByTestId("resolved-preview")).toContainText("16px");

  // One undo reverses the whole move.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("token-spacing.base")).toBeVisible();
  await expect(page.getByTestId("resolved-preview")).toContainText("16px");
});

test("dropping on the list background moves a token to the root", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("token-spacing.lg")).toBeVisible();

  const list = page.getByTestId("token-list");
  const box = await list.boundingBox();
  if (!box) throw new Error("no bounding box");
  // Drop into the empty area below the rows.
  await page.getByTestId("token-spacing.lg").dragTo(list, {
    targetPosition: { x: box.width / 2, y: box.height - 20 },
  });

  await expect(page.getByTestId("token-lg")).toBeVisible();
  await expect(page.getByTestId("token-spacing.lg")).not.toBeVisible();
});
