import js from '@eslint/js';
import globals from 'globals';

const rules = { 'no-useless-assignment': 'warn', 'no-dupe-else-if': 'warn', 'no-unused-vars': ['warn', { args: 'none' }] };
export default [
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser }, rules },
  { files: ['src/**/*.test.js', 'tools/**/*.js', 'mcp/**/*.mjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node }, rules },
  /* drives a browser page, so half of it runs there */
  { files: ['tools/perf.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
