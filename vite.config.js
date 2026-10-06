import { defineConfig } from 'vite';
import hexwrightBridge from './tools/vite-hexwright.js';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [hexwrightBridge()],
});
