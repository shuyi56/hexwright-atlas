import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateScene } from '../editor/generate.js';
import { blankModel, fits, toJSON } from '../editor/model.js';
import { placePiece } from '../editor/ops.js';
import { findPath, placeChar } from '../editor/walk.js';
import { ASSET_BY_ID, ASSET_GROUPS, TERRAIN_BY_ID } from './index.js';

test('the East Asia tab is laid out by section', () => {
  const list = ASSET_GROUPS.find(g => g[0] === 'East Asia')[1];
  assert.deepEqual([...new Set(list.map(a => a.section))], ['Buildings', 'Props', 'Plants', 'Interior']);
  for (const id of ['pagoda', 'hall', 'castle', 'torii', 'stonelantern', 'moonbridge', 'sakura', 'bamboo', 'shoji', 'futon']) assert.equal(ASSET_BY_ID[id]?.group, 'East Asia', id);
  for (const id of ['paddy', 'riperice', 'tea', 'gravel', 'moss', 'tatami', 'koipond']) assert.equal(TERRAIN_BY_ID[id]?.group, 'East Asia', id);
  assert.ok(ASSET_BY_ID.shoji.joins === 'room', 'paper screens join interior walls');
});
test('characters walk through shrine gates and archways', () => {
  const M = blankModel(6, 'moss');
  for (let x = 0; x < 6; x++) if (x !== 2) assert.ok(placePiece(M, { id: 'bamboofence', x, y: 3, face: 0, v: 0 }).ok);
  assert.ok(placePiece(M, { id: 'torii', x: 2, y: 3, face: 0, v: 0 }).ok);
  placeChar(M, { sprite: 's', x: 2, y: 0 });
  const p = findPath(M, 0, 2, 5); assert.ok(p && p.some(([x, y]) => x === 2 && y === 3), 'through the gate');
  assert.ok(ASSET_BY_ID.paifang.walk);
});
test('water pieces go on water, the rest on land', () => {
  const M = blankModel(4, 'koipond');
  for (const id of ['lotus', 'moonbridge', 'sampan']) assert.ok(fits(M, { id, x: 1, y: 1, face: 0 }), id);
  assert.ok(!fits(M, { id: 'pagoda', x: 1, y: 1, face: 0 }));
});
test('the terraced valley is built from the East Asian set, the same for the same seed', () => {
  const M = generateScene('kyo', 32, 'terraces'), J = toJSON(M);
  assert.deepEqual(J, toJSON(generateScene('kyo', 32, 'terraces')));
  assert.ok(J.palette.includes('paddy'), 'paddies');
  const east = M.objs.filter(o => ASSET_BY_ID[o.id].group === 'East Asia').length;
  assert.ok(east / M.objs.length > 0.8, `mostly East Asian pieces (${east} of ${M.objs.length})`);
  assert.ok(M.objs.some(o => ASSET_BY_ID[o.id].section === 'Buildings'));
});
