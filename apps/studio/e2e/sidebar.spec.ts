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

test("sorting a set A→Z reorders the tree and is undoable", async ({ page }) => {
  await page.goto("/");
  // Add tokens out of order so sorting has something to do.
  for (const [path, value] of [
    ["colors.zebra", "#000000"],
    ["colors.apple", "#ff0000"],
  ] as [string, string][]) {
    await page.getByTestId("new-token").click();
    await page.getByTestId("new-token-path").fill(path);
    await page.getByTestId("new-token-value").fill(value);
    await page.getByTestId("create-token").click();
  }

  const order = () =>
    page
      .locator('[data-testid^="token-colors."]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")));

  // zebra/apple were appended last, so they trail before sorting.
  const before = await order();
  expect(before.at(-1)).toBe("token-colors.apple");

  await page.getByTestId("set-menu-global").click();
  await page.getByTestId("set-sort-global").click();

  // apple now leads the colors group; the appended tokens are interleaved.
  const after = await order();
  expect(after.indexOf("token-colors.apple")).toBeLessThan(after.indexOf("token-colors.blue.500"));
  expect(after.indexOf("token-colors.blue.500")).toBeLessThan(after.indexOf("token-colors.zebra"));

  // One undo restores the original order.
  await page.getByTestId("undo").click();
  expect(await order()).toEqual(before);
});

test("the kebab menu closes on Escape without acting", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("set-menu-global").click();
  await expect(page.getByTestId("set-delete-global")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("set-delete-global")).toHaveCount(0);
  await expect(page.getByTestId("set-global")).toBeVisible();
});
