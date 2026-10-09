import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAtlas, buildSheet } from '../src/tactical/sheet.js';
import { encodePNG } from './png.mjs';

/* Writes the tactical tile sheet, and with --atlas the packed tile atlas and its cell map for use in a game:
     npm run tactical-sheet -- [--scale=3] [--atlas] [out.png]
   The sheet goes to docs/images/tactical-tile-sheet.png unless a file is named. The atlas goes to
   docs/images/tactical-tiles.png with docs/images/tactical-tiles.json beside it. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), images = join(root, 'docs', 'images');
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const named = process.argv.slice(2).find(a => !a.startsWith('--'));
const file = resolve(named || join(images, 'tactical-tile-sheet.png'));
const sheet = buildSheet(+(arg('scale') || 3));
mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, encodePNG(sheet.width, sheet.height, sheet.rgba));
console.log(`wrote ${file} (${sheet.width}×${sheet.height})`);

if (process.argv.includes('--atlas')) {
  const atlas = buildAtlas(), png = join(images, 'tactical-tiles.png');
  mkdirSync(images, { recursive: true }); writeFileSync(png, encodePNG(atlas.width, atlas.height, atlas.rgba));
  writeFileSync(join(images, 'tactical-tiles.json'), JSON.stringify({ image: 'tactical-tiles.png', cell: atlas.cell, pad: atlas.pad, step: 8, tiles: atlas.rects }, null, 1) + '\n');
  console.log(`wrote ${png} (${atlas.width}×${atlas.height}) and its cell map`);
}
