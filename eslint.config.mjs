import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

// ESLint 9 flat config. `next lint` is deprecated and removed in Next 16, so the
// legacy eslintrc-style configs that eslint-config-next still ships
// (next/core-web-vitals, next/typescript) are bridged into flat config via
// FlatCompat. Authored directly rather than via the interactive
// `@next/codemod next-lint-to-eslint-cli` (which prompts and cannot run headless);
// the output is the same config create-next-app generates for Next 15.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      '.open-next/**',
      '.wrangler/**',
      'playwright-report-c1-a-*/**',
      'test-results-c1-a-*/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Honor the repo's `_`-prefix convention for deliberately-unused bindings
      // (mock params like `_key`/`_req`, ignored catch errors). Genuine unused
      // names (no underscore) still warn.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
];

export default eslintConfig;
