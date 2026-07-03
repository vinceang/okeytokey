import { expect, test } from "@playwright/test";

test("color notation switching converts the token and offers group-wide apply", async ({
  page,
}) => {
  await page.goto("/");

  // colors.blue has 500 (#3b82f6) and 600 (#2563eb) in the starter.
  await page.getByTestId("token-colors.blue.500").click();
  await page
    .getByRole("group", { name: "Color notation" })
    .getByRole("button", { name: "rgb" })
    .click();

  // This token converted in place — same color, rgb notation.
  await expect(page.getByTestId("color-input")).toHaveValue("rgb(59, 130, 246)");
  await expect(page.getByTestId("resolved-preview")).toContainText("rgb(59, 130, 246)");

  // The offer covers the sibling; applying converts it too, as one command.
  const offer = page.getByTestId("format-apply-group");
  await expect(offer).toContainText("Apply rgb to 1 more in blue");
  await offer.click();
  await page.getByTestId("token-colors.blue.600").click();
  await expect(page.getByTestId("color-input")).toHaveValue("rgb(37, 99, 235)");

  // Aliases keep their reference form regardless.
  await page.getByTestId("set-semantic").click();
  await page.getByTestId("token-semantic.action").click();
  await expect(page.getByTestId("inspector")).toContainText("colors.blue.500");

  // Undo the group apply, then the single conversion.
  await page.getByTestId("undo").click();
  await page.getByTestId("undo").click();
  await page.getByTestId("set-global").click();
  await page.getByTestId("token-colors.blue.500").click();
  await expect(page.getByTestId("color-input")).toHaveValue("#3b82f6");
});
