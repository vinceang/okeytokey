import { expect, test } from "@playwright/test";

test("color suggestions: scale-fit chip fills the value, creates the token", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-token").click();
  // gray has 50 and 900 anchors in the starter — 400 sits between them.
  await page.getByTestId("new-token-path").fill("colors.gray.400");
  const chips = page.getByTestId("value-suggestions");
  await expect(chips).toContainText("fits the colors.gray scale");
  await chips.getByRole("button").first().click();
  const filled = await page.getByTestId("new-token-value").inputValue();
  expect(filled).toMatch(/^#[0-9a-f]{6}$/);
  await page.getByTestId("create-token").click();
  await expect(page.getByTestId("token-colors.gray.400")).toBeVisible();
});

test("duplicate color values are nudged toward an alias", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("colors.dupe");
  await page.getByTestId("new-token-value").fill("#3b82f6"); // = colors.blue.500
  const nudge = page.getByTestId("duplicate-alias-nudge");
  await expect(nudge).toContainText("already exists as colors.blue.500");
  await nudge.click();
  await expect(page.getByTestId("new-token-value")).toHaveValue("{colors.blue.500}");
  await page.getByTestId("create-token").click();
  await page.getByTestId("token-colors.dupe").click();
  await expect(page.getByTestId("inspector")).toContainText("colors.blue.500");
});

test("alias-first creation picks a target and adopts its type", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("aliases.gap");
  await page.getByTestId("new-token-reference").click();
  await page.getByPlaceholder(/Search/).fill("spacing.md");
  await page.getByTestId("alias-option-spacing.md").click();
  await expect(page.getByTestId("new-token-value")).toHaveValue("{spacing.md}");
  await expect(page.getByTestId("new-token-type")).toHaveValue("dimension");
  await page.getByTestId("create-token").click();
  await expect(page.getByTestId("token-aliases.gap")).toBeVisible();
});

test("font pickers fill the value field", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("type.family.body");
  await page.getByTestId("new-token-type").selectOption("fontFamily");
  await page.getByTestId("font-family-picker").selectOption("Inter");
  await expect(page.getByTestId("new-token-value")).toHaveValue("Inter");

  await page.getByTestId("new-token-type").selectOption("fontWeight");
  await page.getByTestId("font-weight-picker").selectOption("600");
  await expect(page.getByTestId("new-token-value")).toHaveValue("600");
});

test("dimension groups suggest the next step in the progression", async ({ page }) => {
  await page.goto("/");
  // Starter spacing is mostly math over base — build a concrete ramp first.
  for (const [name, value] of [
    ["ramp.a", "4px"],
    ["ramp.b", "8px"],
    ["ramp.c", "16px"],
  ]) {
    await page.getByTestId("new-token").click();
    await page.getByTestId("new-token-path").fill(name ?? "");
    await page.getByTestId("new-token-type").selectOption("dimension");
    await page.getByTestId("new-token-value").fill(value ?? "");
    await page.getByTestId("create-token").click();
  }
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("ramp.d");
  await expect(page.getByTestId("new-token-type")).toHaveValue("dimension");
  const chips = page.getByTestId("value-suggestions");
  await expect(chips).toContainText("32px");
  await expect(chips).toContainText("continues the ×-scale");
});
