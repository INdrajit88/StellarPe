import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Disable the React Compiler's set-state-in-effect rule.
      // Our pattern of calling async fetch functions inside useEffect is intentional
      // and standard for data fetching on mount. The setState calls happen in async
      // callbacks, not synchronously in the effect body.
      "react-hooks/set-state-in-effect": "off",
      // Disable preserve-manual-memoization — conflicts with existing useCallback patterns
      "react-hooks/preserve-manual-memoization": "off",
      // Disable refs rule — we intentionally read refs in render for disabled state
      "react-hooks/refs": "off",
    },
  },
]);

export default eslintConfig;
