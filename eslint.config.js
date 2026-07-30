import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import prettier from "eslint-config-prettier";

export default tseslint.config([
  globalIgnores(["dist", "android", "ios", "src/test_scripts", "dev-dist"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      eslintPluginPrettierRecommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Phase 3 (nostr layer consolidation): the local-relay worker client and
    // raw nip44 crypto belong to the protocol layer (src/nostr/**) and the
    // Zustand stores (src/stores/**, reused as-is per the redesign plan) —
    // components/hooks should go through nostr/* domain functions instead.
    // Type-only imports (e.g. `ObserveHandle`) are exempt.
    files: ["src/**/*.{ts,tsx}"],
    // src/dataLayer/** implements the local-relay worker client itself, and
    // App.tsx owns app-lifecycle (pause/resume on visibility change) wiring
    // pre-dating this rule — neither is protocol/domain code the rule targets.
    ignores: ["src/nostr/**", "src/stores/**", "src/dataLayer/**", "src/App.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@formstr/local-relay",
              message:
                "dataLayer is restricted to src/nostr/** and src/stores/** — use a src/nostr/* domain function instead.",
              allowTypeImports: true,
            },
            {
              name: "nostr-tools/nip44",
              message:
                "Raw nip44 crypto is restricted to src/nostr/** and src/stores/** — use a src/nostr/crypto.ts helper instead.",
            },
            {
              name: "nostr-tools",
              importNames: ["nip44"],
              message:
                "Raw nip44 crypto is restricted to src/nostr/** and src/stores/** — use a src/nostr/crypto.ts helper instead.",
            },
          ],
        },
      ],
    },
  },
]);
