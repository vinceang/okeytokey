/**
 * Shared Vitest defaults. Usage:
 *
 *   // vitest.config.ts
 *   import { defineConfig } from "vitest/config";
 *   import { baseTestConfig } from "@okeytokey/vitest-config";
 *   export default defineConfig({ test: baseTestConfig });
 */
export const baseTestConfig = {
  environment: "node",
  include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  coverage: {
    provider: "v8",
    reporter: ["text", "html", "lcov"],
    include: ["src/**"],
    exclude: ["src/**/*.test.*"],
  },
};
