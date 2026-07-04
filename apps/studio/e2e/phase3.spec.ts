import { expect, test } from "@playwright/test";

test("diagnostics panel reports a broken reference and navigates to it", async ({ page }) => {
  await page.goto("/");

  // Create a token that references a missing path.
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("bad.alias");
  await page.getByTestId("new-token-value").fill("{ghost.token}");
  await page.getByTestId("create-token").click();

  await page.getByTestId("diagnostics-toggle").click();
  const row = page.getByTestId("diagnostic-no-broken-references-bad.alias");
  await expect(row).toBeVisible();
  await expect(row).toContainText("{ghost.token}");

  // Clicking navigates to the offending token.
  await row.getByRole("button").first().click();
  await expect(page.getByTestId("inspector")).toContainText("bad.alias");
});

test("rename-with-refactor updates references, with preview", async ({ page }) => {
  await page.goto("/");

  // semantic.action references colors.blue.500 in the starter document.
  await page.getByTestId("token-colors.blue.500").click();
  await page.getByTestId("rename-token").click();
  await page.getByTestId("rename-input").fill("colors.brand.500");

  // Preview lists the reference edit before anything is applied.
  await expect(page.getByTestId("rename-preview")).toContainText("semantic");
  await expect(page.getByTestId("rename-preview")).toContainText("action");

  await page.getByTestId("confirm-rename").click();
  await expect(page.getByTestId("token-colors.brand.500")).toBeVisible();

  // The alias in the semantic set now points at the new path and resolves.
  await page.getByTestId("set-semantic").click();
  await page.getByTestId("token-semantic.action").click();
  await expect(page.getByTestId("inspector")).toContainText("colors.brand.500");
  await expect(page.getByTestId("resolved-preview")).toContainText("#3b82f6");

  // One undo reverses the whole refactor.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("inspector")).toContainText("colors.blue.500");
});

test("what-uses-this lists dependents and navigates", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("token-colors.blue.500").click();
  const usage = page.getByTestId("usage-panel");
  await expect(usage).toContainText("semantic.action");
  await usage.getByRole("button", { name: "{semantic.action}" }).click();
  await expect(page.getByTestId("inspector")).toContainText("semantic.action");
});

test("deprecate flow: badge, diagnostics, one-click fix", async ({ page }) => {
  await page.goto("/");

  // Point colors.blue.500's replacement at 600, then deprecate it.
  await page.getByTestId("token-colors.blue.500").click();
  await page.getByTestId("replaced-by-input").fill("colors.blue.600");
  await page.getByTestId("replaced-by-input").blur();
  await page.getByTestId("deprecate-token").click();
  await expect(page.getByTestId("inspector")).toContainText("deprecated");

  // semantic.action still aliases the deprecated token -> diagnostic with fix.
  await page.getByTestId("diagnostics-toggle").click();
  const row = page.getByTestId("diagnostic-deprecated-usage-semantic.action");
  await expect(row).toContainText("colors.blue.600");
  await page.getByTestId("fix-semantic.action").click();

  // Fix applied: the alias now points at the replacement.
  await page.getByTestId("set-semantic").click();
  await page.getByTestId("token-semantic.action").click();
  await expect(page.getByTestId("inspector")).toContainText("colors.blue.600");
});

test("decision context edits persist through the undo stack", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("token-colors.blue.500").click();
  await page.getByTestId("guidelines-input").fill("Hero backgrounds only.");
  await page.getByTestId("guidelines-input").blur();
  await page.getByTestId("lifecycle-select").selectOption("active");
  await expect(page.locator(".lifecycle-badge--active")).toBeVisible();

  await page.getByTestId("undo").click(); // lifecycle
  await page.getByTestId("undo").click(); // guidelines
  await expect(page.getByTestId("guidelines-input")).toHaveValue("");
});

test("layer and owners are editable; badges show in the inspector header", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("token-colors.blue.500").click();

  await page.getByTestId("layer-select").selectOption("primitive");
  await expect(page.getByTestId("layer-badge")).toContainText("primitive");

  await page.getByTestId("owners-input").fill("@design-systems, @vince");
  await page.getByTestId("owners-input").blur();
  await expect(page.getByTestId("owners-badge")).toContainText("@design-systems, @vince");

  // Undo removes each edit in turn.
  await page.getByTestId("undo").click(); // owners
  await expect(page.getByTestId("owners-badge")).toHaveCount(0);
  await page.getByTestId("undo").click(); // layer
  await expect(page.getByTestId("layer-badge")).toHaveCount(0);
});
