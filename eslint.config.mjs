import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Type-aware linting + import hygiene for our own TS source.
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "unused-imports": unusedImports,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      // Type-only imports must say `type` (inline): catches value-importing a type.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      // Grouped, alphabetized import order (defaults keep side-effect imports
      // like `import "server-only"` pinned, not reordered across others).
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      // unused-imports owns unused detection so it can auto-fix dropped imports.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The Anthropic key is server-only and read in exactly one place.
      // Cover dot access, bracket/string-literal access, and destructuring.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='ANTHROPIC_API_KEY']",
          message:
            "process.env.ANTHROPIC_API_KEY may only be referenced in lib/llm/**.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.value='ANTHROPIC_API_KEY']",
          message:
            "process.env['ANTHROPIC_API_KEY'] may only be referenced in lib/llm/**.",
        },
        {
          selector:
            "VariableDeclarator[init.object.name='process'][init.property.name='env'] Property[key.name='ANTHROPIC_API_KEY']",
          message:
            "Destructuring ANTHROPIC_API_KEY from process.env is only allowed in lib/llm/**.",
        },
      ],
    },
  },

  // The one module allowed to read the Anthropic key.
  {
    files: ["lib/llm/**"],
    rules: { "no-restricted-syntax": "off" },
  },

  // Prettier last: turn off stylistic rules that would fight the formatter.
  prettier,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "app/generated/**",
  ]),
]);

export default eslintConfig;
