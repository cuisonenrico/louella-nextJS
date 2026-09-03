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
    // A leading underscore is this codebase's existing signal for "deliberately
    // unused": destructured props kept for documentation, positional callback
    // params, and the discarded half of an omit-a-field destructure. Honour it
    // rather than reporting each one, which trained the eye to skip the warning
    // list entirely.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // The Nest API under src/server is server-side Node code that happens to
    // live in a Next.js project. Next's React/browser rules do not describe it,
    // and it carries its own conventions from when it was a standalone repo.
    // These match the rules louella-be linted under, so the relocated source
    // stays lint-clean without being rewritten for a deployment change.
    files: ["src/server/**/*.ts"],
    rules: {
      // Nest and Prisma code is heavily generic; the old config allowed this.
      "@typescript-eslint/no-explicit-any": "off",
      // Flags `const module = await Test.createTestingModule(...)`, the
      // standard @nestjs/testing idiom. The rule exists to protect Next's
      // bundler-injected `module`, which server-side Nest code never touches.
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);

export default eslintConfig;
