import { expect, test, type Route } from "@playwright/test";

const PROPOSAL = {
  summary: "Add surface and border semantic tokens",
  assumptions: ["blue is the brand hue"],
  operations: [
    {
      op: "create",
      set: "semantic",
      path: "semantic.surface",
      type: "color",
      value: "{colors.blue.500}",
    },
    // Invalid on purpose: the target token does not exist, so core rejects it.
    { op: "update", set: "semantic", path: "does.not.exist", value: "#ffffff" },
    {
      op: "create",
      set: "semantic",
      path: "semantic.border",
      type: "color",
      value: "{colors.blue.600}",
    },
  ],
};

const fulfillChat = (route: Route) => {
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
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({
      model: "test-model",
      choices: [
        // Fenced with prose around it — exercises the tolerant extractor.
        {
          message: {
            role: "assistant",
            content: "Here you go!\n```json\n" + JSON.stringify(PROPOSAL) + "\n```",
          },
        },
      ],
    }),
  });
};

const CONFIGURED = {
  provider: "openai-compatible",
  baseUrl: "http://localhost:11434/v1",
  model: "test-model",
  apiKey: "",
  anthropicApiKey: "",
  anthropicModel: "claude-opus-4-8",
};

test("generate → parse → validate → review → selective apply → undo", async ({ page }) => {
  await page.addInitScript((settings) => {
    localStorage.setItem("okeytokey.ai.provider", JSON.stringify(settings));
  }, CONFIGURED);
  await page.route("http://localhost:11434/v1/chat/completions", fulfillChat);

  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-ai-generate").click();

  // Setup: scope + context honesty line.
  await page.getByTestId("ai-scope").fill("colors.blue");
  await expect(page.getByTestId("ai-context-note")).toContainText("will be sent");
  await expect(page.getByTestId("ai-context-note")).toContainText("Never the whole document");
  await page.getByTestId("ai-generate").click();

  // Review: summary, per-op validation, dry-run counts.
  await expect(page.getByTestId("ai-proposal-summary")).toContainText(
    "Add surface and border semantic tokens",
  );
  await expect(page.getByTestId("ai-operations")).toContainText("semantic.surface");
  await expect(page.getByTestId("ai-operations")).toContainText("✗");
  await expect(page.getByTestId("ai-dry-run")).toContainText("2 of 3");

  // Selective acceptance: drop the border token, keep surface.
  await page.getByTestId("ai-op-2").uncheck();
  await expect(page.getByTestId("ai-dry-run")).toContainText("1 of 2");
  await page.getByTestId("ai-apply").click();

  // Applied: surface exists (aliased), border does not.
  await page.getByTestId("set-semantic").click();
  await page.getByTestId("token-semantic.surface").click();
  await expect(page.getByTestId("inspector")).toContainText("colors.blue.500");
  await expect(page.getByTestId("token-semantic.border")).toHaveCount(0);

  // One undo step reverses the whole acceptance.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("token-semantic.surface")).toHaveCount(0);
});

test("malformed model output is rejected with the raw text shown, nothing applied", async ({
  page,
}) => {
  await page.addInitScript((settings) => {
    localStorage.setItem("okeytokey.ai.provider", JSON.stringify(settings));
  }, CONFIGURED);
  await page.route("http://localhost:11434/v1/chat/completions", (route) => {
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
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Sure! I changed everything." } }],
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-ai-generate").click();
  await page.getByTestId("ai-scope").fill("colors.blue");
  await page.getByTestId("ai-generate").click();

  await expect(page.getByTestId("ai-generate-error")).toContainText("no-json");
  await expect(page.getByTestId("ai-generate-error")).toContainText("Nothing was applied");
});

test("without a configured provider, the dialog routes to settings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-input")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-ai-generate").click();
  await expect(page.getByTestId("ai-generate-no-provider")).toContainText("off by default");
  await page.getByTestId("ai-generate-open-settings").click();
  await expect(page.getByTestId("ai-privacy")).toContainText("AI features are off");
});
