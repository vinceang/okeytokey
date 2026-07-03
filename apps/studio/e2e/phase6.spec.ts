import { expect, test } from "@playwright/test";

test.describe("onboarding", () => {
  // Fresh profile: no onboarded flag, empty database -> wizard.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("first run shows the wizard; starter choice scaffolds the architecture", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("onboarding")).toBeVisible();
    await expect(page.getByTestId("onboard-github")).toContainText("connection doctor");

    await page.getByTestId("onboard-starter").click();
    await expect(page.getByTestId("set-global")).toBeVisible();
    await expect(page.getByTestId("token-spacing.md")).toBeVisible();

    // Onboarding never reappears after reload.
    await page.reload();
    await expect(page.getByTestId("set-global")).toBeVisible();
  });

  test("import choice loads a DTCG file directly", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("onboard-import-input").setInputFiles({
      name: "brand.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ x: { $type: "number", $value: 7 } })),
    });
    await expect(page.getByTestId("set-brand")).toBeVisible();
    await expect(page.getByTestId("token-x")).toBeVisible();
  });
});

test("command palette: actions and token navigation", async ({ page }) => {
  await page.goto("/");
  // Wait for hydration — the palette's shortcut listener mounts with the app.
  await expect(page.getByTestId("set-global")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();

  // Fuzzy token navigation: Enter picks cmdk's highlighted (best) match.
  await page.getByTestId("palette-input").fill("colors.gray.900");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("inspector")).toContainText("colors.gray.900");

  // Action: open the export dialog.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-input").fill("export tokens");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("export-preview")).toBeVisible();
});

test("token list is navigable by keyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("token-list").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("inspector")).toContainText("colors.blue.500");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("inspector")).toContainText("colors.blue.600");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("inspector")).toContainText("colors.blue.500");
  await page.keyboard.press("End");
  await expect(page.getByTestId("inspector")).toContainText("spacing.lg");
});
