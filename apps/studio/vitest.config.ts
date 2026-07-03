import { defineConfig } from "vitest/config";
import { baseTestConfig } from "@okeytokey/vitest-config";

export default defineConfig({
  test: {
    ...baseTestConfig,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**"],
  },
});
