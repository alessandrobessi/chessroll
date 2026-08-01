// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

const typeAwareRules = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
  "@typescript-eslint/consistent-type-imports": "error",
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
};

export default tseslint.config(
  {
    ignores: ["dist/**", "renderer/dist/**", "coverage/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "*.config.{js,mjs,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Everything covered by tsconfig.json (Node CLI, tests, tooling scripts)
  // gets full type-aware linting.
  {
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js", "vitest.config.ts", "scripts/*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typeAwareRules,
  },
  // renderer/**/*.ts belongs to the separate tsconfig.renderer.json
  // project (DOM lib, no Node types). typescript-eslint's projectService
  // only auto-discovers files named tsconfig.json, so rather than fight
  // multi-project discovery for this one thin browser-entry file, lint it
  // without type-aware rules — `pnpm typecheck` already runs
  // tsconfig.renderer.json directly and catches real type errors there.
  {
    files: ["renderer/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["src/scene/**/*.ts", "src/board/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message:
                "src/scene and src/board are the shared pure core bundled into the browser renderer — no Node builtins allowed here.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
