import { expect, test } from "@playwright/test";

test("create set → add token → alias → edit → undo/redo", async ({ page }) => {
  await page.goto("/");

  // Create a new set (name comes from a window.prompt).
  page.once("dialog", (dialog) => void dialog.accept("brand"));
  await page.getByTestId("add-set").click();
  await expect(page.getByTestId("set-brand")).toBeVisible();

  // Add a color token.
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("brand.primary");
  await page.getByTestId("new-token-value").fill("#ff6600");
  await page.getByTestId("create-token").click();
  await expect(page.getByTestId("token-brand.primary")).toBeVisible();
  await expect(page.getByTestId("resolved-preview")).toContainText("#ff6600");

  // Edit the value through the color editor.
  await page.getByTestId("color-input").fill("#00aa88");
  await page.getByTestId("color-input").press("Enter");
  await expect(page.getByTestId("resolved-preview")).toContainText("#00aa88");

  // Undo restores the old value; redo re-applies.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#ff6600");
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#00aa88");

  // Alias: second token referencing the first, picked via resolved-value search.
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("brand.cta");
  await page.getByTestId("create-token").click();
  await page.getByTestId("make-alias").click();
  await page.getByPlaceholder("Search by name or resolved value…").fill("#00aa88");
  await page.getByTestId("alias-option-brand.primary").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#00aa88");
});

test("native color picker commits and alias popover closes on outside click", async ({ page }) => {
  await page.goto("/");

  // The swatch hosts a native color input; setting it commits the value.
  await page.getByTestId("token-colors.blue.500").locator(".okey-token-row").click();
  await page.getByTestId("color-picker").fill("#a1b2c3");
  await expect(page.getByTestId("resolved-preview")).toContainText("#a1b2c3");
  await expect(page.getByTestId("color-input")).toHaveValue("#a1b2c3");

  // Alias popover: opens from the picker button, closes on an outside click.
  await page.getByTestId("make-alias").click();
  await expect(page.getByTestId("alias-popover")).toBeVisible();
  await page.getByTestId("inspector").getByRole("heading", { name: "500" }).click();
  await expect(page.getByTestId("alias-popover")).not.toBeVisible();
});

test("theme switching changes resolution", async ({ page }) => {
  await page.goto("/");

  // With no theme, plain document order applies and the dark set (last) wins.
  // The light theme disables the dark set, restoring gray.50.
  await page.getByTestId("set-semantic").click();
  await page.getByTestId("token-semantic.background").locator(".okey-token-row").click();
  await page.getByTestId("theme-light").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#f8fafc");

  // Dark theme overrides it to gray.900.
  await page.getByTestId("theme-dark").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#0f172a");

  // Back to light.
  await page.getByTestId("theme-light").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#f8fafc");
});

test("edits persist across reload (IndexedDB)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("persistence.check");
  await page.getByTestId("new-token-value").fill("#123456");
  await page.getByTestId("create-token").click();
  await expect(page.getByTestId("token-persistence.check")).toBeVisible();

  // Give the debounced autosave time to flush, then reload.
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId("token-persistence.check")).toBeVisible();
});

test("export downloads the active set as DTCG JSON", async ({ page }) => {
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-set").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("global.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  expect(parsed).toHaveProperty("colors");
  expect(parsed).toHaveProperty("spacing");
});

test("import loads a DTCG file as a new set", async ({ page }) => {
  await page.goto("/");
  const file = {
    name: "imported.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        icons: { $type: "dimension", size: { $value: "24px" } },
      }),
    ),
  };
  await page.getByTestId("import-input").setInputFiles(file);
  await expect(page.getByTestId("set-imported")).toBeVisible();
  await expect(page.getByTestId("token-icons.size")).toBeVisible();
});

test("filter matches names and values", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("filter-input").fill("#3b82f6");
  await expect(page.getByTestId("token-colors.blue.500")).toBeVisible();
  await expect(page.getByTestId("token-list")).not.toContainText("spacing.base");
});
