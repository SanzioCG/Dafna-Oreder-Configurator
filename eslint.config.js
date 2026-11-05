import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    // apps/web/api: generated Vercel Function bundles (scripts/build-api.mjs)
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'apps/web/api/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The engine must stay pure TypeScript: no DOM, Three.js or React.
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'Engine must not depend on Three.js.' },
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'Engine must not depend on React.',
            },
            { group: ['@react-three/*'], message: 'Engine must not depend on R3F.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
