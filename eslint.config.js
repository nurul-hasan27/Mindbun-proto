import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typeScriptFiles = ['**/*.{ts,tsx,mts,cts}'];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.woff2'],
  },

  js.configs.recommended,

  /* ------------------------------------------------- plain JavaScript (config) */
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },

  /* ------------------------------------------------------------- TypeScript
     Strict and type-aware: Phase 1 has no escape hatches, and the compiler
     settings in tsconfig.base.json are the source of truth. The type-aware
     presets are scoped to TypeScript files so plain JavaScript config files
     are linted without type information. */
  ...tseslint.configs.strictTypeChecked.map((config) => ({ ...config, files: typeScriptFiles })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({ ...config, files: typeScriptFiles })),
  {
    files: typeScriptFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      /* Type-aware rules that fight ordinary React or Fastify patterns. */
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },

  /* ------------------------------------------------------------- web app */
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    plugins: {
      ...reactHooks.configs.flat.recommended.plugins,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
    },
  },

  /* ------------------------------------------------------------- api app */
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
);
