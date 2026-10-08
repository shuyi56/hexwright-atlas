import assert from 'node:assert/strict';
import { test } from 'node:test';
import { save as saveCustom } from '../characters/library.js';
import { blankModel, cloneModel, fits, fromJSON, toJSON } from './model.js';
import { findPath, isFree, placeChar, reachable, walkChar } from './walk.js';
import { placePiece } from './ops.js';
import { TERRAIN } from '../tiles/index.js';

const water = TERRAIN.findIndex(t => t.water);
function map() { const M = blankModel(8, 'grass'); placeChar(M, { sprite: 'villager', x: 0, y: 0 }); return M; }

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
test('characters are saved by their roster id and restored', () => {
  const M = map(); M.chars[0].face = 2;
  const J = JSON.parse(JSON.stringify(toJSON(M))); assert.deepEqual(J.characters, [{ sprite: 'villager', x: 0, y: 0, face: 2 }]); assert.equal(J.sprites, undefined, 'no pixels: every copy can draw the roster');
  const back = fromJSON(J); assert.deepEqual(back.chars, M.chars);
  assert.deepEqual(cloneModel(M).chars, M.chars); assert.notEqual(cloneModel(M).chars[0], M.chars[0]);
});
test('maps saved with the first character style bring their people into the current one', () => {
  const J = toJSON(blankModel(8, 'grass'));
  J.characters = [{ sprite: 'starter-farmer', x: 1, y: 1, face: 1 }, { sprite: 'starter-noble', x: 2, y: 1, face: 0, level: 0 }, { sprite: 'c1x2y3', x: 3, y: 1, face: 3 }];
  J.sprites = [{ id: 'c1x2y3', name: 'Hand-drawn', size: 32, palette: ['#2b2116'], frames: {} }];
  const back = fromJSON(J);
  assert.deepEqual(back.chars.map(c => c.sprite), ['farmer', 'noble', 'villager'], 'starters keep their people, anyone else comes back as a villager');
  assert.deepEqual(back.chars.map(c => [c.x, c.y, c.face]), [[1, 1, 1], [2, 1, 0], [3, 1, 3]], 'standing where they stood');
  assert.equal(toJSON(back).sprites, undefined);
});
test('characters made in the maker go with the map and come back with it', () => {
  const c = saveCustom({ name: 'Ferryman', clothes: 'robe', hat: 'straw', colours: { cloth: '#356a52' } });
  const M = blankModel(8, 'grass'); placeChar(M, { sprite: c.id, x: 2, y: 2 }); placeChar(M, { sprite: 'villager', x: 3, y: 2 });
  const J = JSON.parse(JSON.stringify(toJSON(M)));
  assert.deepEqual(J.customCharacters, [c.spec], 'only the made characters, by their spec');
  /* elsewhere, without the library: the spec comes in with the map */
  const away = { ...J, customCharacters: [{ ...c.spec, id: 'custom-elsewhere1', name: 'Ferryman' }], characters: [{ ...J.characters[0], sprite: 'custom-elsewhere1' }, { sprite: 'custom-gone', x: 4, y: 2, face: 0 }] };
  const back = fromJSON(away);
  assert.deepEqual(back.chars.map(x => x.sprite), ['custom-elsewhere1', 'villager'], 'a made character with no spec comes back as a villager');
  assert.equal(toJSON(back).customCharacters[0].name, 'Ferryman');
});
