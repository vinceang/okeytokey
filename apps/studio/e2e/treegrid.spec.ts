import { expect, test } from "@playwright/test";

test("themes render as value columns; overrides full-strength, inherited dimmed", async ({
  page,
}) => {
  await page.goto("/");

  // Header: Name + one column per theme (starter has light + dark).
  const header = page.getByTestId("token-grid-header");
  await expect(header).toContainText("Name");
  await expect(page.getByTestId("col-light")).toBeVisible();
  await expect(page.getByTestId("col-dark")).toBeVisible();

  // A primitive defined once in global: both cells show it; the dark cell is
  // inherited (dimmed) because no dark-set override exists.
  const blueLight = page.getByTestId("cell-colors.blue.500-light");
  const blueDark = page.getByTestId("cell-colors.blue.500-dark");
  await expect(blueLight).toContainText("#3b82f6");
  await expect(blueDark).toContainText("#3b82f6");
  await expect(blueDark).toHaveClass(/token-cell--inherited/);
  await expect(blueLight).not.toHaveClass(/token-cell--inherited/);
});

test("a dark-set override renders per column with different values", async ({ page }) => {
  await page.goto("/");
  // semantic.background: light = gray.50, dark set overrides to gray.900.
  await page.getByTestId("set-semantic").click();
  const light = page.getByTestId("cell-semantic.background-light");
  const dark = page.getByTestId("cell-semantic.background-dark");
  await expect(light).toContainText("colors.gray.50");
  await expect(dark).toContainText("colors.gray.900");
  await expect(dark).not.toHaveClass(/token-cell--inherited/); // real override
  await expect(dark).toHaveAttribute("title", /Overridden in dark/);
  await expect(light).toHaveAttribute("title", /resolves to #f8fafc/);
});

test("collapsing a group folds its rows; cells follow the filter's flat view", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cell-colors.blue.500-light")).toBeVisible();
  await page.getByTestId("group-colors").click();
  await expect(page.getByTestId("cell-colors.blue.500-light")).toHaveCount(0);
  await page.getByTestId("group-colors").click();

  // Filtered (flattened) rows still carry theme cells.
  await page.getByTestId("filter-input").fill("#3b82f6");
  await expect(page.getByTestId("token-colors.blue.500")).toBeVisible();
  await expect(page.getByTestId("cell-colors.blue.500-dark")).toBeVisible();
});
