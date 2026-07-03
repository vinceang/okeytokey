import { expect, test } from "@playwright/test";

test("deleting a set lives behind a kebab menu, is confirmed, and is undoable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("set-dark")).toBeVisible();

  // No bare × on the row — the destructive action hides inside the kebab.
  await expect(page.getByTestId("set-delete-dark")).toHaveCount(0);

  await page.getByTestId("set-menu-dark").click();
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByTestId("set-delete-dark").click();
  await expect(page.getByTestId("set-dark")).toHaveCount(0);

  // One undo restores the whole set — deletion isn't a point of no return.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("set-dark")).toBeVisible();
});

test("dismissing the delete confirmation keeps the set", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("set-menu-semantic").click();
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
  await page.getByTestId("set-delete-semantic").click();
  await expect(page.getByTestId("set-semantic")).toBeVisible();
});

test("renaming a set through the kebab menu retargets the row", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("set-menu-semantic").click();
  page.once("dialog", (dialog) => {
    void dialog.accept("meaning");
  });
  await page.getByTestId("set-rename-semantic").click();
  await expect(page.getByTestId("set-meaning")).toBeVisible();
  await expect(page.getByTestId("set-semantic")).toHaveCount(0);
});

test("the kebab menu closes on Escape without acting", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("set-menu-global").click();
  await expect(page.getByTestId("set-delete-global")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("set-delete-global")).toHaveCount(0);
  await expect(page.getByTestId("set-global")).toBeVisible();
});
