import { expect, test } from "@playwright/test";

// The token grid's per-row ⋮ menu: contextual create/rename/duplicate scoped to
// the node, plus the read-only parent prefix in the New Token dialog.

test("a group's ⋮ menu creates a token under a read-only parent prefix", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();

  await page.getByTestId("node-menu-colors.blue").click();
  await page.getByTestId("group-new-token-colors.blue").click();

  // The parent path is fixed and shown read-only — only the leaf is editable.
  await expect(page.getByTestId("new-token-path-prefix")).toHaveText("colors.blue.");
  await page.getByTestId("new-token-path").fill("700");
  await page.getByTestId("new-token-value").fill("#1d4ed8");
  await page.getByTestId("create-token").click();

  await expect(page.getByTestId("token-colors.blue.700")).toBeVisible();
});

test("a group's ⋮ New subgroup nests a group.leaf under the parent", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();

  await page.getByTestId("node-menu-colors").click();
  await page.getByTestId("group-new-subgroup-colors").click();

  await expect(page.getByTestId("new-token-path-prefix")).toHaveText("colors.");
  await expect(page.getByTestId("new-token-subgroup-hint")).toBeVisible();
  await page.getByTestId("new-token-path").fill("red.500");
  await page.getByTestId("new-token-value").fill("#ef4444");
  await page.getByTestId("create-token").click();

  await expect(page.getByTestId("group-colors.red")).toBeVisible();
  await expect(page.getByTestId("token-colors.red.500")).toBeVisible();
});

test("a token's ⋮ menu duplicates it to a -copy sibling, undoable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();

  await page.getByTestId("node-menu-colors.blue.500").click();
  await page.getByTestId("token-duplicate-colors.blue.500").click();

  await expect(page.getByTestId("token-colors.blue.500-copy")).toBeVisible();
  // The copy carries the source value.
  await page.getByTestId("token-colors.blue.500-copy").locator(".okey-token-row").click();
  await expect(page.getByTestId("color-input")).toHaveValue("#3b82f6");

  await page.getByTestId("undo").click();
  await expect(page.getByTestId("token-colors.blue.500-copy")).toHaveCount(0);
});

test("renaming a group cascades to children and retargets references", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();

  // semantic.action references {colors.blue.500}; rename the group in global.
  await page.getByTestId("node-menu-colors.blue").click();
  await page.getByTestId("group-rename-colors.blue").click();
  await page.getByTestId("rename-input-colors.blue").fill("azure");
  await page.getByTestId("rename-input-colors.blue").press("Enter");

  // Children move with the group.
  await expect(page.getByTestId("group-colors.azure")).toBeVisible();
  await expect(page.getByTestId("token-colors.azure.500")).toBeVisible();
  await expect(page.getByTestId("token-colors.blue.500")).toHaveCount(0);

  // The cross-set reference followed the rename.
  await page.getByTestId("set-semantic").click();
  await expect(page.getByTestId("token-semantic.action")).toContainText("{colors.azure.500}");

  // One undo reverses the whole refactor.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("token-semantic.action")).toContainText("{colors.blue.500}");
});

test("a group's ⋮ Sort A→Z orders just that group, undoable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();

  const spacingOrder = () =>
    page
      .locator('[data-testid^="token-spacing."]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")));

  // Starter document order is base, sm, md, lg — not alphabetical.
  expect(await spacingOrder()).toEqual([
    "token-spacing.base",
    "token-spacing.sm",
    "token-spacing.md",
    "token-spacing.lg",
  ]);

  await page.getByTestId("node-menu-spacing").click();
  await page.getByTestId("group-sort-spacing").click();

  // Only spacing is reordered (base, lg, md, sm); colors is untouched.
  expect(await spacingOrder()).toEqual([
    "token-spacing.base",
    "token-spacing.lg",
    "token-spacing.md",
    "token-spacing.sm",
  ]);
  await expect(page.getByTestId("group-colors")).toBeVisible();

  await page.getByTestId("undo").click();
  expect(await spacingOrder()).toEqual([
    "token-spacing.base",
    "token-spacing.sm",
    "token-spacing.md",
    "token-spacing.lg",
  ]);
});

test("a token's ⋮ menu renames inline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();

  await page.getByTestId("node-menu-colors.blue.600").click();
  await page.getByTestId("token-rename-colors.blue.600").click();
  await page.getByTestId("rename-input-colors.blue.600").fill("650");
  await page.getByTestId("rename-input-colors.blue.600").press("Enter");

  await expect(page.getByTestId("token-colors.blue.650")).toBeVisible();
  await expect(page.getByTestId("token-colors.blue.600")).toHaveCount(0);
});
