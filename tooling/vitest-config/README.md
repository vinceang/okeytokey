# @okeytokey/vitest-config

Shared Vitest defaults (node environment, v8 coverage, `src/**/*.test.ts(x)` discovery).

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { baseTestConfig } from "@okeytokey/vitest-config";

export default defineConfig({ test: baseTestConfig });
```
