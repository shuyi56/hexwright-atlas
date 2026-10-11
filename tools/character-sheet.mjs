import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAttack, buildSheet, buildWalk } from '../src/characters/sheet.js';
import { ROSTER, render } from '../src/characters/roster.js';
import { H, W } from '../src/characters/pixels.js';
import { encodeAPNG, encodePNG } from './png.mjs';

/* Writes the character sprite sheet and the walk and attack animations, and with --strips one plain 1× strip per job
   for use in a game:
     npm run sheet -- [--scale=4] [--strips] [--walk] [out.png]
   The sheet goes to docs/images/character-sprite-sheet.png unless a file is named. The walk (every job walking in
   the four facings, an animated PNG) goes to docs/images/character-walk.png beside it, and the attack (every job
   winding up and striking) to docs/images/character-attack.png, unless a sheet file is named without --walk. A strip
   holds the ten drawn frames left to right, the front view's then the back view's (stand, step, step, wind-up,
   strike), 32×48 each, on a clear background; in the wind-up and strike the figure stands its attack shift
   (roster.js attackOf) back from the middle of the frame, away from its facing. */
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
  const attack = buildAttack(ROSTER), hit = join(images, 'character-attack.png');
  writeFileSync(hit, encodeAPNG(attack.width, attack.height, attack.frames, 110));
  console.log(`wrote ${hit} (${attack.width}×${attack.height}, ${attack.frames.length} frames)`);
}

if (process.argv.includes('--strips')) {
  const dir = join(root, 'docs', 'images', 'characters');
  mkdirSync(dir, { recursive: true });
  for (const job of ROSTER) {
    const f = render(job), frames = [...f.front, ...f.back], out = new Uint8ClampedArray(W * frames.length * H * 4);
    frames.forEach((rgba, n) => { for (let y = 0; y < H; y++) out.set(rgba.subarray(y * W * 4, (y + 1) * W * 4), (y * W * frames.length + n * W) * 4); });
    writeFileSync(join(dir, `${job.id}.png`), encodePNG(W * frames.length, H, out));
  }
  console.log(`wrote ${ROSTER.length} strips to ${dir}`);
}
