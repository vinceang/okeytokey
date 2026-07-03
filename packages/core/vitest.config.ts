import { defineConfig } from "vitest/config";
import { baseTestConfig } from "@okeytokey/vitest-config";

export default defineConfig({
  test: {
    ...baseTestConfig,
    coverage: {
      ...baseTestConfig.coverage,
      // Phase 1 gate: core must stay >= 90% line coverage (spec requirement).
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
