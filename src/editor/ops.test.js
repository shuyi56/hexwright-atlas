import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankModel, fromJSON, objAt, toJSON } from './model.js';
import { brushTiles, eraseAt, floodFill, paintTiles, placePiece, rectTiles, setElev, shiftElev, whyNot } from './ops.js';

/* the pure map operations behind both the mouse tools and the automation API; no browser needed */
const fresh = (S = 8) => blankModel(S, 'grass');

test('brush is clipped to the map', () => {
  const M = fresh(); assert.equal(brushTiles(M, 0, 0, 3).length, 4); assert.equal(brushTiles(M, 4, 4, 3).length, 9); assert.equal(rectTiles(M, 6, 6, 5, 5).length, 4);
});
test('paint counts only tiles that change', () => {
  const M = fresh(); assert.equal(paintTiles(M, rectTiles(M, 0, 0, 2, 2), 'sand'), 4); assert.equal(paintTiles(M, rectTiles(M, 0, 0, 2, 2), 'sand'), 0);
});
test('flood fill stays inside the connected region', () => {
  const M = fresh(); paintTiles(M, rectTiles(M, 3, 0, 1, 8), 'sand');
  assert.equal(floodFill(M, 0, 0, 'dirt'), 24); assert.equal(floodFill(M, 3, 3, 'dirt'), 8); assert.equal(floodFill(M, 0, 0, 'dirt'), 0);
});
test('elevation clamps to 0..6', () => {
  const M = fresh(); assert.equal(shiftElev(M, [[1, 1]], 9), 1); assert.equal(M.elev[9], 6); assert.equal(shiftElev(M, [[1, 1]], 1), 0); assert.equal(setElev(M, [[1, 1]], -3), 1); assert.equal(M.elev[9], 0);
});
test('placement checks bounds, overlap and ground', () => {
  const M = fresh(); assert.ok(placePiece(M, { id: 'cottage', x: 2, y: 2, face: 0, v: 0.5 }).ok);
  const dup = placePiece(M, { id: 'cottage', x: 2, y: 2 }); assert.equal(dup.ok, false); assert.match(dup.reason, /already taken/);
  assert.match(placePiece(M, { id: 'keep', x: 7, y: 7 }).reason, /leaves the 8×8 map/);
  assert.match(placePiece(M, { id: 'rowboat', x: 0, y: 0 }).reason, /water/);
  assert.match(placePiece(M, { id: 'nope', x: 0, y: 0 }).reason, /unknown asset/);
  paintTiles(M, [[5, 5]], 'water'); assert.ok(placePiece(M, { id: 'rowboat', x: 5, y: 5 }).ok); paintTiles(M, [[6, 5]], 'water'); assert.match(whyNot(M, { id: 'cottage', x: 6, y: 5, face: 0 }), /dry ground/);
});
test('erase removes the piece covering a tile', () => {
  const M = fresh(); placePiece(M, { id: 'keep', x: 1, y: 1, v: 0.1 }); const n = M.objs.length;
  assert.equal(eraseAt(M, 0, 0), 0); assert.ok(objAt(M, 1, 1) >= 0); assert.equal(eraseAt(M, 1, 1), 1); assert.equal(M.objs.length, n - 1);
});
test('JSON round trip keeps terrain, height and pieces', () => {
  const M = fresh(); paintTiles(M, [[0, 0]], 'snow'); setElev(M, [[1, 0]], 3); placePiece(M, { id: 'cottage', x: 4, y: 4, face: 2, v: 0.25 });
  const R = fromJSON(JSON.parse(JSON.stringify(toJSON(M)))); assert.deepEqual(toJSON(R), toJSON(M));
});
