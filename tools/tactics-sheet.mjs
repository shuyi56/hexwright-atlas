import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSheet } from '../src/tactics/sheet.js';
import { ROSTER, render } from '../src/tactics/roster.js';
import { H, W } from '../src/tactics/pixels.js';
import { encodePNG } from './png.mjs';

/* Writes the tactics sprite sheet, and with --strips one plain 1× strip per job for use in a game:
     npm run sheet -- [--scale=4] [--strips] [out.png]
   The sheet goes to docs/images/tactics-sprite-sheet.png unless a file is named. A strip holds the six drawn
   frames left to right (front stand, step, step, back stand, step, step), 32×48 each, on a clear background. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const k = +(arg('scale') || 4), file = resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || join(root, 'docs', 'images', 'tactics-sprite-sheet.png'));
const sheet = buildSheet(ROSTER, k);
mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, encodePNG(sheet.width, sheet.height, sheet.rgba));
console.log(`wrote ${file} (${sheet.width}×${sheet.height})`);

if (process.argv.includes('--strips')) {
  const dir = join(root, 'docs', 'images', 'tactics');
  mkdirSync(dir, { recursive: true });
  for (const job of ROSTER) {
    const f = render(job), frames = [...f.front, ...f.back], out = new Uint8ClampedArray(W * frames.length * H * 4);
    frames.forEach((rgba, n) => { for (let y = 0; y < H; y++) out.set(rgba.subarray(y * W * 4, (y + 1) * W * 4), (y * W * frames.length + n * W) * 4); });
    writeFileSync(join(dir, `${job.id}.png`), encodePNG(W * frames.length, H, out));
  }
  console.log(`wrote ${ROSTER.length} strips to ${dir}`);
}
