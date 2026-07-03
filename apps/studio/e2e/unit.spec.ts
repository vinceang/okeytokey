import { expect, test } from "@playwright/test";

test("dimension unit switching converts at 16px/rem, offers group apply, keeps math intact", async ({
  page,
}) => {
  await page.goto("/");

  // Starter spacing has one literal (base: 4px) + math siblings; add a second
  // literal so the group offer has something to convert.
  await page.getByTestId("new-token").click();
  await page.getByTestId("new-token-path").fill("spacing.xl");
  await page.getByTestId("new-token-type").selectOption("dimension");
  await page.getByTestId("new-token-value").fill("40px");
  await page.getByTestId("create-token").click();

  await page.getByTestId("token-spacing.base").click();
  await expect(page.getByText("1rem = 16px")).toBeVisible();
  await page
    .getByRole("group", { name: "Dimension unit" })
    .getByRole("button", { name: "rem" })
    .click();

  // This token converted in place — same length, rem notation.
  await expect(page.getByTestId("value-input")).toHaveValue("0.25rem");

  // The offer covers the other literal only (math siblings are left alone).
  const offer = page.getByTestId("unit-apply-group");
  await expect(offer).toContainText("Apply rem to 1 more in spacing");
  await offer.click();
  await page.getByTestId("token-spacing.xl").click();
  await expect(page.getByTestId("value-input")).toHaveValue("2.5rem");

  // Math over the converted base still resolves, now in rem.
  await page.getByTestId("token-spacing.md").click();
  await expect(page.getByTestId("inspector")).toContainText("1rem");

  // Undo the group apply, then the single conversion.
  await page.getByTestId("undo").click();
  await page.getByTestId("undo").click();
  await page.getByTestId("token-spacing.base").click();
  await expect(page.getByTestId("value-input")).toHaveValue("4px");
});
