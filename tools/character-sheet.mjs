import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSheet, buildWalk } from '../src/characters/sheet.js';
import { ROSTER, render } from '../src/characters/roster.js';
import { FH, FW } from '../src/characters/pixels.js';
import { encodeAPNG, encodePNG } from './png.mjs';

/* Writes the character sprite sheet and the walk animation, and with --strips one plain 1× strip per job for use
   in a game:
     npm run sheet -- [--scale=4] [--strips] [--walk] [out.png]
   The sheet goes to docs/images/character-sprite-sheet.png unless a file is named. The walk (every job walking in
   the four facings, an animated PNG) goes to docs/images/character-walk.png beside it, unless a sheet file is
   named without --walk. A strip holds the six drawn frames left to right (front stand, step, step, back stand,
   step, step), 64×96 each, on a clear background. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), images = join(root, 'docs', 'images');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const named = process.argv.slice(2).find(a => !a.startsWith('--'));
const k = +(arg('scale') || 4), file = resolve(named || join(images, 'character-sprite-sheet.png'));
const sheet = buildSheet(ROSTER, k);
mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, encodePNG(sheet.width, sheet.height, sheet.rgba));
console.log(`wrote ${file} (${sheet.width}×${sheet.height})`);

if (!named || process.argv.includes('--walk')) {
  /* a beat of the walk: a stride or the upright pass between strides */
  const walk = buildWalk(ROSTER), out = join(images, 'character-walk.png');
  mkdirSync(images, { recursive: true }); writeFileSync(out, encodeAPNG(walk.width, walk.height, walk.frames, 170));
  console.log(`wrote ${out} (${walk.width}×${walk.height}, ${walk.frames.length} frames)`);
}

if (process.argv.includes('--strips')) {
  const dir = join(root, 'docs', 'images', 'characters');
  mkdirSync(dir, { recursive: true });
  for (const job of ROSTER) {
    const f = render(job), frames = [...f.front, ...f.back], out = new Uint8ClampedArray(FW * frames.length * FH * 4);
    frames.forEach((rgba, n) => { for (let y = 0; y < FH; y++) out.set(rgba.subarray(y * FW * 4, (y + 1) * FW * 4), (y * FW * frames.length + n * FW) * 4); });
    writeFileSync(join(dir, `${job.id}.png`), encodePNG(FW * frames.length, FH, out));
  }
  console.log(`wrote ${ROSTER.length} strips to ${dir}`);
}
