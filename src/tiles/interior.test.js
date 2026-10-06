import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankModel } from '../editor/model.js';
import { eraseAt, placePiece } from '../editor/ops.js';
import { findPath, placeChar } from '../editor/walk.js';
import { ASSETS, ASSET_BY_ID, ASSET_GROUPS, drawAsset, wallLinks } from './index.js';

/* a canvas context that accepts every call, so drawing code runs without a browser */
function stubContext() {
  const grad = { addColorStop() {} };
  return new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => grad : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}

test('every piece draws at every facing', () => {
  const P = (x, y, z) => [(x - y) * 16, (x + y) * 8 - z];
  for (const a of ASSETS) for (let face = 0; face < 4; face++) assert.doesNotThrow(() => drawAsset(stubContext(), P, { id: a.id, x: 0, y: 0, face, v: 0.6 }, 0), `${a.id} face ${face}`);
});
test('the Interior tab holds room pieces and furniture', () => {
  const ids = ASSET_GROUPS.find(g => g[0] === 'Interior')[1].map(a => a.id);
  for (const id of ['iwall', 'iwindow', 'idoor', 'hearth', 'bed', 'table', 'chair', 'bookshelf', 'wardrobe']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ASSETS.map(a => a.id)).size, ASSETS.length, 'asset ids are unique');
});
test('interior walls join each other but not city walls', () => {
  const objs = [{ id: 'iwall', x: 1, y: 1, face: 0 }, { id: 'iwall', x: 2, y: 1, face: 0 }, { id: 'idoor', x: 1, y: 2, face: 1 }, { id: 'wall', x: 0, y: 1, face: 0 }];
  const L = wallLinks(objs);
  assert.deepEqual(L.get(objs[0]), [1, 1, 0, 0]);
  assert.deepEqual(L.get(objs[3]), [0, 0, 0, 0]);
});
test('characters walk through doorways but not through walls', () => {
  const M = blankModel(6, 'floorboards');
  for (let y = 0; y < 6; y++) assert.ok(placePiece(M, { id: 'iwall', x: 3, y, face: 1, v: 0 }).ok);
  assert.ok(ASSET_BY_ID.idoor.walk);
  placeChar(M, { sprite: 's', x: 0, y: 3 });
  assert.equal(findPath(M, 0, 5, 3), null, 'sealed room');
  eraseAt(M, 3, 3); assert.ok(placePiece(M, { id: 'idoor', x: 3, y: 3, face: 1, v: 0 }).ok);
  const p = findPath(M, 0, 5, 3); assert.ok(p && p.some(([x, y]) => x === 3 && y === 3), 'through the doorway');
});
