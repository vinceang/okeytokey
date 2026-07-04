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
  // Color cells edit their hex/RGB text in place, like strings and numbers.
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

  // Non-color cells keep the plain inline input.
  await page.getByTestId("cell-spacing.base-light").click();
  await page.getByTestId("cell-input-spacing.base-light").fill("6px");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cell-spacing.base-light")).toContainText("6px");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("cell-spacing.base-light")).toContainText("4px");
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

  // Escape cancels a pending inline edit without committing.
  await page.getByTestId("cell-semantic.action-light").click();
  await page.getByTestId("cell-input-semantic.action-light").fill("#000000");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cell-input-semantic.action-light")).toHaveCount(0);
  await expect(page.getByTestId("cell-semantic.action-light")).toContainText("colors.blue.500");
});

test("the color popover links a cell to another token (Figma's Libraries)", async ({ page }) => {
  await page.goto("/");
  // The swatch opens the Figma-style popover; the cell text stays inline-editable.
  await page.getByTestId("cell-swatch-colors.blue.600-dark").click();
  const popover = page.getByTestId("cell-popover");
  await popover.getByTestId("cell-popover-reference").click();
  await popover.getByPlaceholder(/Search/).fill("gray.900");
  await popover.getByTestId("alias-option-colors.gray.900").click();

  // The dark cell now aliases gray.900 as a dark-set override; the pill and
  // a reference note render in the popover on the next open.
  await page.keyboard.press("Escape");
  const dark = page.getByTestId("cell-colors.blue.600-dark");
  await expect(dark).toContainText("colors.gray.900");
  await expect(dark).toHaveAttribute("title", /Overridden in dark/);
  await expect(page.getByTestId("cell-colors.blue.600-light")).toContainText("#2563eb");

  await page.getByTestId("cell-swatch-colors.blue.600-dark").click();
  await expect(popover.locator(".cell-popover-reference")).toContainText("colors.gray.900");
  await page.keyboard.press("Escape");
});

test("the swatch popover is keyboard-operable: focus enters it, Tab is trapped, Escape restores", async ({
  page,
}) => {
  await page.goto("/");
  const swatch = page.getByTestId("cell-swatch-colors.blue.500-light");
  await swatch.focus();
  await expect(swatch).toBeFocused();

  // Enter on the swatch opens the popover AND moves focus into it (the color
  // field), so keyboard users edit the value instead of tabbing to the next cell.
  await page.keyboard.press("Enter");
  const popover = page.getByTestId("cell-popover");
  await expect(popover).toBeVisible();
  await expect(popover.getByTestId("color-input")).toBeFocused();

  // Tab is trapped inside the dialog — it never falls back to the grid.
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-testid="cell-popover"] :focus')).toHaveCount(1);

  // Escape closes and returns focus to the swatch that opened it.
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(swatch).toBeFocused();
});

test("the popover carries the hex/rgb/oklch notation switch", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cell-swatch-colors.blue.500-light").click();
  const popover = page.getByTestId("cell-popover");
  await expect(popover).toBeVisible();

  // Switching notation in the popover converts this cell's literal in place.
  await popover
    .getByRole("group", { name: "Color notation" })
    .getByRole("button", { name: "rgb" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cell-colors.blue.500-light")).toContainText("rgb(59, 130, 246)");

  await page.getByTestId("undo").click();
  await expect(page.getByTestId("cell-colors.blue.500-light")).toContainText("#3b82f6");
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
  // Click the name cell (clicking a value cell would open its editor).
  await page.getByTestId("token-colors.blue.500").locator(".okey-token-row").click();
  await page.getByTestId("token-list").focus();

  // → moves the column focus onto the light cell; Enter opens its inline
  // editor (hex/RGB text, like strings and numbers).
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

test("a theme whose set was deleted still exports (with a warning) and heals on cell edit", async ({
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

  // Editing a dark cell heals the theme: the deleted override set is
  // recreated (by name) with the override in it — one undoable step, and
  // light is untouched.
  await page.getByTestId("cell-colors.blue.500-dark").click();
  await page.getByTestId("cell-input-colors.blue.500-dark").fill("#112233");
  await page.keyboard.press("Enter");

  const dark = page.getByTestId("cell-colors.blue.500-dark");
  await expect(dark).toContainText("#112233");
  await expect(dark).toHaveAttribute("title", /Overridden in dark/);
  await expect(page.getByTestId("set-dark")).toBeVisible();
  await expect(page.getByTestId("set-dark")).toContainText("1");
  await expect(page.getByTestId("cell-colors.blue.500-light")).toContainText("#3b82f6");

  // The export warning is gone — the theme is whole again.
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-theme").selectOption("dark");
  await expect(preview).not.toContainText("missing set");
  await expect(preview).toContainText("--colors-blue-500: #112233;");
  await page.keyboard.press("Escape");

  // One undo removes set and override together (back to the stale state);
  // a second restores the original deletion's snapshot.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("set-dark")).toHaveCount(0);
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("set-dark")).toBeVisible();
  await expect(page.getByTestId("set-dark")).toContainText("2");
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
