import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared flat config. Call with the package directory so the typed-linting
 * project service resolves the right tsconfig:
 *
 *   // eslint.config.js
 *   import { defineConfig } from "@okeytokey/eslint-config";
 *   export default defineConfig(import.meta.dirname);
 *
 * @param {string} tsconfigRootDir
 * @param {import("typescript-eslint").ConfigArray} extra package-specific overrides
 * @returns {import("typescript-eslint").ConfigArray}
 */
export function defineConfig(tsconfigRootDir, ...extra) {
  return tseslint.config(
    {
      ignores: ["dist/**", "coverage/**", "playwright-report/**", "test-results/**"],
    },
    eslint.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: {
            allowDefaultProject: [
              "eslint.config.js",
              "vite.config.ts",
              "vitest.config.ts",
              "playwright.config.ts",
              "build.mjs",
            ],
          },
          tsconfigRootDir,
        },
      },
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
      },
    },
    {
      // Config files live outside the package's tsconfig (tsc does not check
      // them either), so lint them without type information.
      files: ["**/*.{js,mjs,cjs}", "**/*.config.ts"],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: {
        globals: globals.node,
      },
    },
    prettier,
    ...extra,
  );
}
