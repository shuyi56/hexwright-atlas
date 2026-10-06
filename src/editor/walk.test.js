import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankModel, cloneModel, fits, fromJSON, toJSON } from './model.js';
import { findPath, isFree, placeChar, reachable, walkChar } from './walk.js';
import { placePiece } from './ops.js';
import { TERRAIN } from '../tiles/index.js';

const water = TERRAIN.findIndex(t => t.water);
function map() { const M = blankModel(8, 'grass'); placeChar(M, { sprite: 'starter-villager', x: 0, y: 0 }); return M; }

test('characters stand only on free tiles', () => {
  const M = map(); M.terr[1 * 8 + 1] = water;
  assert.equal(placeChar(M, { sprite: 'a', x: 0, y: 0 }).ok, false, 'taken by another character');
  assert.equal(placeChar(M, { sprite: 'a', x: 1, y: 1 }).ok, false, 'water');
  assert.equal(placeChar(M, { sprite: 'a', x: 8, y: 0 }).ok, false, 'off the map');
  assert.equal(placePiece(M, { id: 'cottage', x: 4, y: 4, face: 0, v: 0.5 }).ok, true);
  assert.equal(isFree(M, 4, 4), false, 'under a piece');
  assert.equal(fits(M, { id: 'cottage', x: 0, y: 0, face: 0, v: 0 }), false, 'pieces cannot be put on a character');
});
test('paths go around obstacles and respect height steps', () => {
  const M = map(); for (let y = 0; y < 7; y++) M.terr[y * 8 + 3] = water;
  const p = findPath(M, 0, 6, 0); assert.ok(p && p[p.length - 1].join() === '6,0,0');
  assert.ok(p.length > 6, 'detours over the gap at the bottom');
  for (let y = 0; y < 8; y++) M.terr[y * 8 + 3] = water;
  assert.equal(findPath(M, 0, 6, 0), null, 'cut off');
  const H = map(); H.elev[1] = 2; assert.equal(findPath(H, 0, 2, 0).length, 4, 'a two-level cliff is walked around'); assert.equal(findPath(H, 0, 1, 0), null, 'and cannot be climbed');
});
test('walking moves the character and turns it to face the last step', () => {
  const M = map(), path = findPath(M, 0, 2, 0); assert.deepEqual(walkChar(M, 0, path), { ok: true, steps: 2 });
  assert.deepEqual([M.chars[0].x, M.chars[0].y, M.chars[0].face], [2, 0, 1]);
  assert.equal(walkChar(M, 0, [[5, 5]]).ok, false);
  assert.equal(reachable(M, 0).filter(Boolean).length, 64);
});
test('characters are saved and restored with their sprites', () => {
  const M = map(); M.chars[0].face = 2;
  const J = JSON.parse(JSON.stringify(toJSON(M))); assert.equal(J.characters.length, 1); assert.equal(J.sprites[0].id, 'starter-villager');
  const back = fromJSON(J); assert.deepEqual(back.chars, M.chars);
  assert.deepEqual(cloneModel(M).chars, M.chars); assert.notEqual(cloneModel(M).chars[0], M.chars[0]);
});
