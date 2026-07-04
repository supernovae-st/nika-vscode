// eslint.config.mjs — flat config (eslint 9) · typescript-eslint recommended.
//
// The lint gate rides `npm test` (vitest → parity → eslint) and CI inherits
// it through the release workflow's test step.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/**', 'node_modules/**', 'esbuild.mjs', 'scripts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Underscore = intentionally unused (VS Code provider signatures).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The two d3 zoom-transform casts are the only sanctioned `any`s —
      // they carry inline disables; everything else must type.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
