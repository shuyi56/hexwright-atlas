import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import hexwrightBridge from './tools/vite-hexwright.js';

export default defineConfig({
  base: './',
  build: { target: 'es2022', rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), units: resolve(import.meta.dirname, 'units.html') } } },
  plugins: [hexwrightBridge()],
});
