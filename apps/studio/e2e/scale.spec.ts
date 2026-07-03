import { expect, test } from "@playwright/test";

test("scale generator fills missing steps deterministically, undoable", async ({ page }) => {
  await page.goto("/");
  // Starter has colors.blue.500/600 — only two anchors 100 apart, so first
  // add a wider anchor for a meaningful range.
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("colors.blue.900");
  await page.getByTestId("new-token-value").fill("#1e3a8a");
  await page.getByTestId("create-token").click();

  // Open the generator from the command palette.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-scale").click();
  await page.getByTestId("scale-group-input").fill("colors.blue");
  await page.getByTestId("scale-steps-input").fill("500, 600, 700, 800, 900");

  // Preview shows anchors + the two new steps.
  const preview = page.getByTestId("scale-preview");
  await expect(preview).toContainText("colors.blue.700");
  await expect(preview).toContainText("colors.blue.800");
  await expect(preview.locator(".scale-tag--anchor")).toHaveCount(3);

  await page.getByTestId("scale-apply").click();
  await expect(page.getByTestId("token-colors.blue.700")).toBeVisible();
  await expect(page.getByTestId("token-colors.blue.800")).toBeVisible();

  // Generated tokens carry lineage; the inspector shows the badge-less token
  // resolving to a real color.
  await page.getByTestId("token-colors.blue.700").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#");

  // One undo removes the whole generation.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("token-colors.blue.700")).not.toBeVisible();
});
