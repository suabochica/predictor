import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Every fantasy table read/write must go through the competition-scoped
      // client, or it silently spans competitions: wrong rows, no error, in files
      // nobody reads end to end. A lint rule beats a naming convention here.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='supabase'][property.name='from']",
          message:
            "Use db.from() from useCompetition() instead of supabase.from() — it scopes the query to the active competition. For a read that must deliberately span competitions, use unscopedFrom() from src/lib/db.js.",
        },
      ],
    },
  },
  {
    // src/lib/db.js IS the scoped wrapper — the one place allowed to call
    // supabase.from() directly.
    files: ['src/lib/db.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])
