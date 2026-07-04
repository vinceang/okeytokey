import { expect, test } from "@playwright/test";

test("modular scale generates dimension steps from base × ratio, undoable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-dimension-scale").click();

  await page.getByTestId("dim-scale-group").fill("space");
  await page.getByTestId("dim-scale-base").fill("16px");
  await page.getByTestId("dim-scale-ratio").fill("2");
  await page.getByTestId("dim-scale-steps").fill("300, 400, 500, 600, 700");

  // Preview shows the geometric ramp around the base step (500 = 16px).
  const preview = page.getByTestId("dim-scale-preview");
  await expect(preview).toContainText("space.500");
  await expect(preview).toContainText("16px");
  await expect(preview).toContainText("32px"); // 600 = ×2
  await expect(preview).toContainText("8px"); // 400 = ÷2

  await page.getByTestId("dim-scale-apply").click();

  await page.getByTestId("token-space.700").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("64px");
  await expect(page.getByTestId("token-space.300")).toBeVisible();

  // One undo removes the whole generation.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("token-space.700")).toHaveCount(0);
});

test("a ratio preset fills the ratio field", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-dimension-scale").click();
  await page.getByTestId("dim-scale-preset").selectOption("2");
  await expect(page.getByTestId("dim-scale-ratio")).toHaveValue("2");
});
