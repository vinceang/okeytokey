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
  await page.getByTestId("token-colors.blue.700").locator(".okey-token-row").click();
  await expect(page.getByTestId("resolved-preview")).toContainText("#");

  // One undo removes the whole generation.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("token-colors.blue.700")).not.toBeVisible();
});

test("a single anchor synthesizes a full ramp with derived endpoints", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("brand.seed.500");
  await page.getByTestId("new-token-value").fill("#2563eb");
  await page.getByTestId("create-token").click();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-scale").click();
  await page.getByTestId("scale-group-input").fill("brand.seed");

  // Derived endpoints are disclosed; the full default ramp is generatable.
  await expect(page.getByTestId("scale-synthesized")).toContainText("derived from the anchor");
  await expect(page.getByTestId("scale-preview")).toContainText("brand.seed.50");
  await expect(page.getByTestId("scale-preview")).toContainText("brand.seed.950");
  await expect(page.getByTestId("scale-apply")).toContainText("Generate 10 token(s)");

  // An explicit darkest end overrides the derived one.
  await page.getByTestId("scale-dark-end").fill("#000000");
  await expect(page.getByTestId("scale-synthesized")).toContainText("dark #000000");

  await page.getByTestId("scale-apply").click();
  await expect(page.getByTestId("token-brand.seed.50")).toBeVisible();
  await expect(page.getByTestId("token-brand.seed.950")).toBeVisible();
});

test("a flat color token becomes a scale seed: rename + ramp, references follow, one undo", async ({
  page,
}) => {
  await page.goto("/");
  // The user's real workflow: create a single red, then ask for a scale.
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("colors.red");
  await page.getByTestId("new-token-value").fill("#ff0000");
  await page.getByTestId("create-token").click();

  // With red selected, the dialog prefills red itself and explains the plan.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-scale").click();
  await expect(page.getByTestId("scale-group-input")).toHaveValue("colors.red");
  await expect(page.getByTestId("scale-seed-note")).toContainText("single color");
  await expect(page.getByTestId("scale-seed-note")).toContainText("colors.red.500");
  await expect(page.getByTestId("scale-preview")).toContainText("seed");
  await page.getByTestId("scale-apply").click();

  // The flat token became a full ramp with the seed preserved at 500.
  await page.getByTestId("token-colors.red.500").locator(".okey-token-row").click();
  await expect(page.getByTestId("color-input")).toHaveValue("#ff0000");
  await expect(page.getByTestId("token-colors.red.900")).toBeVisible();

  // One undo restores the flat token and removes the ramp.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("token-colors.red")).toBeVisible();
  await expect(page.getByTestId("token-colors.red.500")).toHaveCount(0);
});

test("numeric scale steps render in ascending order even when added out of sequence", async ({
  page,
}) => {
  await page.goto("/");
  // Starter blue has 500, 600. Add 900 then 100 — appended out of numeric
  // sequence, exactly like a scale step generated after the fact.
  const additions: [string, string][] = [
    ["colors.blue.900", "#1e3a8a"],
    ["colors.blue.100", "#dbeafe"],
  ];
  for (const [path, value] of additions) {
    await page.getByTestId("new-token").click();
    await page.getByTestId("new-token-path").fill(path);
    await page.getByTestId("new-token-value").fill(value);
    await page.getByTestId("create-token").click();
  }

  // The tree lists them 100, 500, 600, 900 — numeric order, not insertion order.
  const ids = await page
    .locator('[data-testid^="token-colors.blue."]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")));
  expect(ids).toEqual([
    "token-colors.blue.100",
    "token-colors.blue.500",
    "token-colors.blue.600",
    "token-colors.blue.900",
  ]);
});

test("pointing at a group without numeric anchors explains the two valid shapes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-scale").click();
  await page.getByTestId("scale-group-input").fill("colors");
  await expect(page.getByTestId("scale-hint")).toContainText("numbered steps");
  await expect(page.getByTestId("scale-hint")).toContainText("single color token");
});
