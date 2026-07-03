import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:4173",
    // Mark onboarding complete so suites land in the seeded editor;
    // onboarding.spec.ts overrides this with an empty state.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:4173",
          localStorage: [{ name: "okeytokey.onboarded", value: "1" }],
        },
      ],
    },
  },
  webServer: {
    command: "pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
