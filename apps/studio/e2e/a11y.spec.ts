import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * WCAG 2.1 AA checks (axe-core) on key screens. Serious/critical violations
 * fail CI.
 */
async function expectNoSeriousViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious,
    `${screen}: ${serious
      .map((violation) => `${violation.id} (${String(violation.nodes.length)} nodes)`)
      .join(", ")}`,
  ).toEqual([]);
}

test("main editor screen has no serious a11y violations", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("token-colors.blue.500").click();
  await expectNoSeriousViolations(page, "editor + inspector");
});

test("dialogs have no serious a11y violations", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-token").click();
  // With suggestions and the native picker showing, not just the empty form.
  await page.getByTestId("new-token-path").fill("colors.gray.400");
  await page.getByTestId("value-suggestions").waitFor();
  await expectNoSeriousViolations(page, "new-token dialog");
  await page.keyboard.press("Escape");

  await page.getByTestId("open-export").click();
  await expectNoSeriousViolations(page, "export dialog");
  await page.keyboard.press("Escape");

  await page.getByTestId("open-ai-settings").click();
  await page
    .getByRole("group", { name: "AI provider" })
    .getByRole("button", { name: "Local / OpenAI-compatible" })
    .click();
  await expectNoSeriousViolations(page, "AI provider dialog");
});

test("onboarding has no serious a11y violations", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("okeytokey.onboarded");
    indexedDB.deleteDatabase("okeytokey-studio");
  });
  await page.reload();
  await expectNoSeriousViolations(page, "onboarding");
});
