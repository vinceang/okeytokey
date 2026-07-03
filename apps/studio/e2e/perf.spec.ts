import { expect, test } from "@playwright/test";

/** 10,000-token set: 100 groups x 100 tokens. */
function bigSet(): Buffer {
  const root: Record<string, unknown> = {};
  for (let group = 0; group < 100; group++) {
    const tokens: Record<string, unknown> = { $type: "color" };
    for (let index = 0; index < 100; index++) {
      const channel = ((group * 100 + index) % 255).toString(16).padStart(2, "0");
      tokens[String(index)] = { $value: `#${channel}${channel}${channel}` };
    }
    root[`group${String(group)}`] = tokens;
  }
  return Buffer.from(JSON.stringify(root));
}

test("stays responsive with 10,000 tokens (virtualized)", async ({ page }) => {
  await page.goto("/");

  const started = Date.now();
  await page.getByTestId("import-input").setInputFiles({
    name: "huge.json",
    mimeType: "application/json",
    buffer: bigSet(),
  });
  await expect(page.getByTestId("set-huge")).toBeVisible();
  await expect(page.getByTestId("token-group0.0")).toBeVisible();
  const importMs = Date.now() - started;
  expect(importMs).toBeLessThan(10_000);

  // Virtualization: only a screenful of rows in the DOM, not 10k.
  const rendered = await page.getByTestId("token-list").locator(".token-list-row").count();
  expect(rendered).toBeLessThan(120);

  // Jump to the bottom; the last group renders promptly.
  const scrollStarted = Date.now();
  await page.getByTestId("token-list").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByTestId("token-group99.99")).toBeVisible();
  expect(Date.now() - scrollStarted).toBeLessThan(2_000);

  // Filtering 10k tokens stays interactive.
  await page.getByTestId("filter-input").fill("group42.7");
  await expect(page.getByTestId("token-group42.7")).toBeVisible();
});
