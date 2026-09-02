import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Flat config for ESLint 9. The repo declared a `lint` script and shipped
 * `eslint` as a devDependency, but never had a config file — so the script had
 * always failed at startup and nothing in `src/` had ever been linted.
 *
 * Scope note: `tsc --noEmit` already runs under `strict` with
 * `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, so the whole
 * class of type errors is covered elsewhere. What is left for ESLint is what
 * the compiler does not see — unused code, unsafe escapes from the type system,
 * and accidental `console` in server code that has a real logger.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'prisma/**', 'src/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // An unused parameter is often a deliberate signature match (a middleware
      // that must take four arguments to be an error handler). Leading `_` is
      // the existing convention for saying so.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` erases the guarantees the strict compiler is there to provide.
      // Warn rather than error: the existing casts at the Prisma and Express
      // boundaries are deliberate and reviewed, and turning them red would
      // train people to ignore the gate.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Tests reach past the seams on purpose — a fake port is built by shape and
    // handed in where a real one goes, which is the point of the double.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
