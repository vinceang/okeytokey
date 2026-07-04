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

test("editing a base cell edits in place; the inherited column follows", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cell-colors.blue.500-light").click();
  await page.getByTestId("cell-input-colors.blue.500-light").fill("#ff0000");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("cell-colors.blue.500-light")).toContainText("#ff0000");
  // Dark inherits the base edit — still dimmed, same value.
  const dark = page.getByTestId("cell-colors.blue.500-dark");
  await expect(dark).toContainText("#ff0000");
  await expect(dark).toHaveClass(/token-cell--inherited/);

  await page.getByTestId("undo").click();
  await expect(page.getByTestId("cell-colors.blue.500-light")).toContainText("#3b82f6");
});

test("editing an inherited dark cell creates a sparse override — only dark changes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("set-dark")).toContainText("2"); // sparse: 2 overrides

  await page.getByTestId("cell-colors.blue.500-dark").click();
  await page.getByTestId("cell-input-colors.blue.500-dark").fill("#112233");
  await page.keyboard.press("Enter");

  const dark = page.getByTestId("cell-colors.blue.500-dark");
  await expect(dark).toContainText("#112233");
  await expect(dark).not.toHaveClass(/token-cell--inherited/);
  await expect(dark).toHaveAttribute("title", /Overridden in dark/);
  // Light is untouched; the override landed in the dark set (2 → 3 tokens).
  await expect(page.getByTestId("cell-colors.blue.500-light")).toContainText("#3b82f6");
  await expect(page.getByTestId("set-dark")).toContainText("3");

  // One undo removes the override; dark inherits again.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("cell-colors.blue.500-dark")).toContainText("#3b82f6");
  await expect(page.getByTestId("cell-colors.blue.500-dark")).toHaveClass(/token-cell--inherited/);
  await expect(page.getByTestId("set-dark")).toContainText("2");
});

test("reset-to-inherited removes an override, undoably; Escape cancels an edit", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("set-semantic").click();

  const dark = page.getByTestId("cell-semantic.background-dark");
  await expect(dark).toContainText("colors.gray.900");
  await dark.hover();
  await page.getByTestId("cell-reset-semantic.background-dark").click();

  // The override is gone: dark inherits light's value.
  await expect(dark).toContainText("colors.gray.50");
  await expect(dark).toHaveClass(/token-cell--inherited/);
  await page.getByTestId("undo").click();
  await expect(dark).toContainText("colors.gray.900");

  // Escape cancels without committing.
  await page.getByTestId("cell-semantic.action-light").click();
  await page.getByTestId("cell-input-semantic.action-light").fill("#000000");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cell-semantic.action-light")).toContainText("colors.blue.500");
});

test("＋ mode adds a set and a theme column; its cells take sparse overrides", async ({ page }) => {
  await page.goto("/");
  page.once("dialog", (dialog) => {
    void dialog.accept("high-contrast");
  });
  await page.getByTestId("add-mode").click();

  // New column, new set, theme joins the mode group.
  await expect(page.getByTestId("col-high-contrast")).toBeVisible();
  await expect(page.getByTestId("set-high-contrast")).toBeVisible();
  await expect(page.getByTestId("col-high-contrast")).toContainText("mode");

  // Editing a cell in the new column writes into the new set.
  await page.getByTestId("cell-colors.gray.50-high-contrast").click();
  await page.getByTestId("cell-input-colors.gray.50-high-contrast").fill("#ffffff");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cell-colors.gray.50-high-contrast")).toHaveAttribute(
    "title",
    /Overridden in high-contrast/,
  );
  await expect(page.getByTestId("set-high-contrast")).toContainText("1");
  // The other columns are untouched.
  await expect(page.getByTestId("cell-colors.gray.50-light")).toContainText("#f8fafc");
});

test("double-click renames inline; references follow via the refactor", async ({ page }) => {
  await page.goto("/");
  // semantic.action references colors.blue.500 — rename its leaf 500 → 550.
  await page.getByTestId("token-colors.blue.500").locator(".okey-token-row").dblclick();
  await page.getByTestId("rename-input-colors.blue.500").fill("550");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("token-colors.blue.550")).toBeVisible();
  await page.getByTestId("set-semantic").click();
  await expect(page.getByTestId("cell-semantic.action-light")).toContainText("colors.blue.550");

  // One undo reverses the rename, references included.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("cell-semantic.action-light")).toContainText("colors.blue.500");
});

test("the footer ＋ New token opens the creation dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("grid-new-token").click();
  await expect(page.getByTestId("new-token-path")).toBeVisible();
});

test("keyboard: arrows move rows and columns, Enter edits the focused cell", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("token-colors.blue.500").click();
  await page.getByTestId("token-list").focus();

  // → moves the column focus onto the light cell; Enter opens its editor.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("cell-colors.blue.500-light")).toHaveClass(/token-cell--focused/);
  await page.keyboard.press("Enter");
  await page.getByTestId("cell-input-colors.blue.500-light").fill("#00ff00");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cell-colors.blue.500-light")).toContainText("#00ff00");

  // ↓ still moves the row selection; the treegrid role is exposed.
  await page.getByTestId("token-list").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("token-colors.blue.600")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("treegrid", { name: "Tokens" })).toBeVisible();
});

test("a theme whose set was deleted still exports (with a warning) and refuses shared-set overrides", async ({
  page,
}) => {
  await page.goto("/");
  // Delete the dark set: the dark THEME survives (undo can restore the set).
  await page.getByTestId("set-menu-dark").click();
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByTestId("set-delete-dark").click();
  await expect(page.getByTestId("set-dark")).toHaveCount(0);

  // Export under the stale dark theme: valid CSS plus an honest warning —
  // not the raw "Unknown token set" refusal.
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-theme").selectOption("dark");
  const preview = page.getByTestId("export-preview");
  await expect(preview).toContainText("references missing set(s): dark");
  await expect(preview).toContainText(":root {");
  await expect(preview).toContainText("--colors-blue-500: #3b82f6;");
  await page.keyboard.press("Escape");

  // Editing a dark cell can't silently write into a set shared with light —
  // it errors instead of changing both themes at once.
  await page.getByTestId("cell-colors.blue.500-dark").click();
  await page.getByTestId("cell-input-colors.blue.500-dark").fill("#112233");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cell-colors.blue.500-dark")).toHaveClass(/token-cell--error/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cell-colors.blue.500-light")).toContainText("#3b82f6");

  // Undoing the delete restores the set; the theme snaps back to life.
  await page.getByTestId("undo").click();
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-theme").selectOption("dark");
  await expect(preview).not.toContainText("missing set");
  await expect(preview).toContainText("--semantic-background: #0f172a;");
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
