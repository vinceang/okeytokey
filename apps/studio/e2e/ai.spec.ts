import { expect, test, type Route } from "@playwright/test";

/** CORS-complete fulfillment — these are real cross-origin browser calls. */
const fulfillJson = (route: Route, body: unknown, status = 200) => {
  if (route.request().method() === "OPTIONS") {
    return route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      },
    });
  }
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
};

test("AI provider settings: off by default, presets, connection doctor, persistence", async ({
  page,
}) => {
  await page.route("http://localhost:11434/v1/models", (route) =>
    fulfillJson(route, { data: [{ id: "llama3.1" }, { id: "qwen3" }] }),
  );
  await page.route("https://api.anthropic.com/v1/models/*", (route) =>
    fulfillJson(route, {
      id: "claude-opus-4-8",
      type: "model",
      display_name: "Claude Opus 4.8",
      created_at: "2026-01-01T00:00:00Z",
    }),
  );

  await page.goto("/");
  await page.getByTestId("open-ai-settings").click();

  // Default: off, and says so.
  await expect(page.getByTestId("ai-privacy")).toContainText("AI features are off");

  // Local preset: honest about locality, doctor reaches the mocked server.
  await page
    .getByRole("group", { name: "AI provider" })
    .getByRole("button", { name: "Local / OpenAI-compatible" })
    .click();
  await page.getByTestId("ai-preset-ollama").click();
  await expect(page.getByTestId("ai-base-url")).toHaveValue("http://localhost:11434/v1");
  await expect(page.getByTestId("ai-privacy")).toContainText("never leaves");
  // The prerequisites are stated, with a copyable command for this origin.
  await expect(page.getByText("ollama.com")).toBeVisible();
  await expect(page.getByTestId("ai-setup-command")).toContainText(
    'OLLAMA_ORIGINS="http://localhost:',
  );
  await expect(page.getByTestId("ai-setup-command")).toContainText("ollama serve");
  await page.getByTestId("ai-test-connection").click();
  await expect(page.getByTestId("ai-connection-result")).toContainText("✓");
  await expect(page.getByTestId("ai-connection-result")).toContainText("2 model(s)");

  // Anthropic BYOK: honest about where data goes and who pays.
  await page
    .getByRole("group", { name: "AI provider" })
    .getByRole("button", { name: "Anthropic" })
    .click();
  await expect(page.getByTestId("ai-privacy")).toContainText(
    "billed to your own Anthropic API key",
  );
  await page.getByTestId("ai-anthropic-key").fill("sk-ant-e2e-test");
  await page.getByTestId("ai-test-connection").click();
  await expect(page.getByTestId("ai-connection-result")).toContainText("Claude Opus 4.8");

  // Settings persist across reloads; keys stay out of token documents.
  await page.reload();
  await page.getByTestId("open-ai-settings").click();
  await expect(page.getByTestId("ai-anthropic-key")).toHaveValue("sk-ant-e2e-test");
  const documentDump = await page.evaluate(() =>
    JSON.stringify(Object.entries(localStorage).filter(([key]) => !key.startsWith("okeytokey.ai"))),
  );
  expect(documentDump).not.toContain("sk-ant-e2e-test");
});

test("connection doctor reports failures with actionable hints", async ({ page }) => {
  await page.route("http://localhost:11434/v1/models", (route) => route.abort("connectionrefused"));

  await page.goto("/");
  await page.getByTestId("open-ai-settings").click();
  await page
    .getByRole("group", { name: "AI provider" })
    .getByRole("button", { name: "Local / OpenAI-compatible" })
    .click();
  await page.getByTestId("ai-preset-ollama").click();
  await page.getByTestId("ai-test-connection").click();
  await expect(page.getByTestId("ai-connection-result")).toContainText("✗");
  await expect(page.getByTestId("ai-connection-result")).toContainText("Is the server running?");

  // The palette entry opens the same dialog.
  await page.keyboard.press("Escape");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.getByTestId("palette-ai").click();
  await expect(page.getByTestId("ai-privacy")).toBeVisible();
});
