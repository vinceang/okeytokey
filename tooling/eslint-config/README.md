# @okeytokey/eslint-config

Shared ESLint 9 flat config: `@eslint/js` recommended + `typescript-eslint`
strict-type-checked + stylistic-type-checked + prettier compat.

```js
// eslint.config.js
import { defineConfig } from "@okeytokey/eslint-config";

export default defineConfig(import.meta.dirname);
```

Pass extra flat-config objects as additional arguments for package-specific overrides.
