import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const rules = { 'no-useless-assignment': 'warn', 'no-dupe-else-if': 'warn', 'no-unused-vars': ['warn', { args: 'none' }] };
export default [
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser }, rules },
  { files: ['src/**/*.test.js', 'tools/**/*.js', 'tools/**/*.mjs', 'mcp/**/*.mjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node }, rules },
  /* the data models (npm run typecheck checks their types) */
  ...tseslint.configs.recommended.map(c => ({ ...c, files: ['src/**/*.ts'] })),
  { files: ['src/**/*.ts'], languageOptions: { globals: globals.browser }, rules: { ...rules, 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }] } },
  /* drives a browser page, so half of it runs there */
  { files: ['tools/perf.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
