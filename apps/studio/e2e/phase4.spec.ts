import { expect, test, type Page } from "@playwright/test";

test("export dialog previews and switches formats/themes", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-export").click();

  await expect(page.getByTestId("export-preview")).toContainText("--spacing-md: 16px;");

  await page.getByTestId("export-format").selectOption("ts");
  await expect(page.getByTestId("export-preview")).toContainText("as const");

  await page.getByTestId("export-format").selectOption("tailwind");
  await expect(page.getByTestId("export-preview")).toContainText("@theme {");

  // Theme-aware: the dark theme flips semantic.background.
  await page.getByTestId("export-format").selectOption("css");
  await page.getByTestId("export-theme").selectOption("dark");
  await expect(page.getByTestId("export-preview")).toContainText("--semantic-background: #0f172a;");
});

async function fillSyncSettings(page: Page) {
  await page.getByTestId("open-sync").click();
  await page.getByTestId("sync-owner").fill("acme");
  await page.getByTestId("sync-repo").fill("tokens");
  await page.getByTestId("sync-branch").fill("main");
  await page.getByTestId("sync-path").fill("tokens");
  await page.getByTestId("sync-token").fill("ghp_e2e");
}

test("connection doctor pinpoints a missing branch", async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    if (path === "/user") {
      return route.fulfill({ json: { login: "vince" } });
    }
    if (path === "/repos/acme/tokens") {
      return route.fulfill({ json: { default_branch: "main" } });
    }
    if (path === "/repos/acme/tokens/branches/main") {
      return route.fulfill({ status: 404, json: { message: "Branch not found" } });
    }
    return route.fulfill({ status: 404, json: { message: `unmocked ${path}` } });
  });

  await page.goto("/");
  await fillSyncSettings(page);
  await page.getByTestId("sync-doctor").click();

  const report = page.getByTestId("doctor-report");
  await expect(report).toContainText("✓ auth");
  await expect(report).toContainText('signed in as "vince"');
  await expect(report).toContainText("✓ repo");
  await expect(report).toContainText("✗ branch");
  await expect(report).toContainText("Check the branch name");
});

test("dry-run push shows the semantic diff before writing", async ({ page }) => {
  const remoteGlobal = JSON.stringify({
    colors: {
      $type: "color",
      blue: {
        "500": { $value: "#OLD000".replace("OLD000", "111111") },
        "600": { $value: "#2563eb" },
      },
      gray: { "50": { $value: "#f8fafc" }, "900": { $value: "#0f172a" } },
    },
    spacing: {
      $type: "dimension",
      base: { $value: "4px" },
      sm: { $value: "{spacing.base} * 2" },
      md: { $value: "{spacing.base} * 4" },
      lg: { $value: "{spacing.base} * 8" },
    },
  });
  const encode = (text: string) => Buffer.from(text, "utf8").toString("base64");

  await page.route("https://api.github.com/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/repos/acme/tokens/branches/main") {
      return route.fulfill({ json: { commit: { sha: "remotesha" } } });
    }
    if (path === "/repos/acme/tokens/contents/tokens") {
      return route.fulfill({ json: [{ type: "file", path: "tokens/global.json" }] });
    }
    if (path === "/repos/acme/tokens/contents/tokens/global.json") {
      return route.fulfill({
        json: { path: "tokens/global.json", content: encode(remoteGlobal) },
      });
    }
    return route.fulfill({ status: 404, json: { message: `unmocked ${path}` } });
  });

  await page.goto("/");
  await fillSyncSettings(page);
  await page.getByTestId("sync-dry-run").click();

  const result = page.getByTestId("dry-run-result");
  // Remote blue.500 is #111111, local starter has #3b82f6 -> value-changed;
  // remote lacks the semantic/dark sets entirely.
  await expect(result).toContainText("[value-changed] global · colors.blue.500");
  await expect(result).toContainText("token(s) affected after resolution");
  await expect(page.getByTestId("sync-push")).toBeVisible();
});
