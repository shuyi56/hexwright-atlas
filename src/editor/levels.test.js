import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wallLinks } from '../tiles/index.js';
import { blankModel, cloneModel, fits, fromJSON, objAt, toJSON } from './model.js';
import { eraseAt, floodFill, paintTiles, placePiece, rectTiles, removeFloor } from './ops.js';
import { findPath, placeChar, walkChar, walkGoal } from './walk.js';

/* a 6×6 house: ground floor everywhere, floor 1 over the back half (y 0-2), stairs at (1, 3) rising north to (1, 2) */
function house() {
  const M = blankModel(6, 'floorboards');
  paintTiles(M, rectTiles(M, 0, 0, 6, 3), 'oakfloor', 1);
  assert.ok(placePiece(M, { id: 'stairs', x: 1, y: 3, face: 0, v: 0 }).ok);
  return M;
}

test('upper floors are laid, filled and taken up per level', () => {
  const M = house();
  assert.equal(M.floors[0].filter(Boolean).length, 18);
  assert.equal(floodFill(M, 0, 5, 'checker', 1), 18, 'the open space in front fills on level 1');
  assert.equal(removeFloor(M, rectTiles(M, 0, 3, 6, 3), 1), 18);
  assert.equal(M.terr.every(t => t === M.terr[0]), true, 'the ground is untouched');
});
test('pieces need floor on their level and only collide with their own level', () => {
  const M = house();
  assert.equal(fits(M, { id: 'table', x: 4, y: 4, level: 1 }), false, 'no floor there on level 1');
  assert.ok(placePiece(M, { id: 'table', x: 4, y: 1, level: 1, v: 0 }).ok);
  assert.ok(placePiece(M, { id: 'table', x: 4, y: 1, v: 0 }).ok, 'the same tile on the ground is free');
  assert.equal(objAt(M, 4, 1, 1) >= 0 && objAt(M, 4, 1, 0) >= 0, true);
  assert.equal(eraseAt(M, 4, 1, 1), 1); assert.equal(objAt(M, 4, 1, 0) >= 0, true, 'erasing upstairs leaves the ground');
  const r = placePiece(M, { id: 'rowboat', x: 0, y: 0, level: 1, v: 0 }); assert.equal(r.ok, false, 'boats need water'); assert.match(r.reason, /upper floor/);
});
test('walls join only on their own level', () => {
  const objs = [{ id: 'iwall', x: 1, y: 1, face: 0 }, { id: 'iwall', x: 2, y: 1, face: 0, level: 1 }, { id: 'iwall', x: 3, y: 1, face: 0, level: 1 }];
  const L = wallLinks(objs); assert.deepEqual(L.get(objs[0]), [0, 0, 0, 0]); assert.deepEqual(L.get(objs[1]), [1, 0, 0, 0]);
});
test('characters climb stairs to the floor above and come back down', () => {
  const M = house();
  placeChar(M, { sprite: 's', x: 4, y: 5 });
  const up = findPath(M, 0, 4, 0, 1);
  assert.ok(up, 'a route up exists');
  assert.ok(up.some(([x, y, L]) => x === 1 && y === 3 && L === 0) && up.some(([x, y, L]) => x === 1 && y === 2 && L === 1), 'via the stairs');
  assert.deepEqual(walkChar(M, 0, up), { ok: true, steps: up.length });
  assert.deepEqual([M.chars[0].x, M.chars[0].y, M.chars[0].level], [4, 0, 1]);
  assert.equal(findPath(M, 0, 4, 4, 1), null, 'no floor there upstairs');
  const down = findPath(M, 0, 5, 5, 0); assert.ok(down && down[down.length - 1].join() === '5,5,0');
  walkChar(M, 0, down); assert.equal(M.chars[0].level, undefined);
  assert.equal(walkChar(M, 0, [[5, 4, 1]]).ok, false, 'no jumping up a level without stairs');
});
test('a character upstairs and one below can share a tile column', () => {
  const M = house();
  assert.ok(placeChar(M, { sprite: 's', x: 3, y: 1 }).ok);
  assert.ok(placeChar(M, { sprite: 's', x: 3, y: 1, level: 1 }).ok);
  assert.equal(placeChar(M, { sprite: 's', x: 3, y: 1, level: 1 }).ok, false);
  assert.equal(placeChar(M, { sprite: 's', x: 3, y: 4, level: 1 }).ok, false, 'no floor');
});
test('storeys survive saving, loading and undo copies', () => {
  const M = house(); placePiece(M, { id: 'bed', x: 3, y: 0, level: 1, face: 1, v: 0.2 }); placeChar(M, { sprite: 's', x: 0, y: 1, level: 1 });
  const J = JSON.parse(JSON.stringify(toJSON(M))), back = fromJSON(J);
  assert.deepEqual(Array.from(back.floors[0]), Array.from(M.floors[0]));
  assert.equal(back.objs.find(o => o.id === 'bed').level, 1); assert.equal(back.objs.find(o => o.id === 'stairs').level, undefined);
  assert.equal(back.chars[0].level, 1);
  const c = cloneModel(M); c.floors[0][0] = 0; assert.notEqual(M.floors[0][0], 0, 'copies do not share floors');
  assert.equal(toJSON(blankModel(4)).floors, undefined, 'single-storey maps save as before');
});

/* a floor laid over a slope follows the ground, so walking on it obeys the same one-level step as the ground */
test('upper floors over uneven ground keep the one-level step', () => {
  const M = blankModel(6, 'grass');
  M.elev.set([0, 1, 3, 3, 3, 3], 0);  /* row y = 0: heights 0, 1, 3, 3 ... */
  paintTiles(M, rectTiles(M, 0, 0, 6, 1), 'floorboards', 1);
  placeChar(M, { sprite: 's', x: 0, y: 0, level: 1 });
  assert.ok(findPath(M, 0, 1, 0, 1), 'one level up along the floor');
  assert.equal(findPath(M, 0, 3, 0, 1), null, 'a two-level jump on the floor is refused');
  M.elev[2] = 2;
  assert.ok(findPath(M, 0, 3, 0, 1), 'with a one-level step between, the floor can be walked');
});
test('stairs only join a floor whose height matches the top of the flight', () => {
  const M = house(); placeChar(M, { sprite: 's', x: 1, y: 5 });
  assert.ok(findPath(M, 0, 1, 2, 1), 'level ground: the flight lands on the floor');
  M.elev[2 * 6 + 1] = 2;  /* the ground under the landing two levels higher: the floor there floats above the flight's top */
  assert.equal(findPath(M, 0, 1, 2, 1), null);
  M.elev[2 * 6 + 1] = 1;
  assert.ok(findPath(M, 0, 1, 2, 1), 'one level off is a normal step');
});

test('a click on a flight of stairs means up it, a click on the stairwell above means down it', () => {
  const M = house(); placeChar(M, { sprite: 's', x: 4, y: 5 });
  assert.deepEqual(walkGoal(M, 0, 1, 3, 0), [1, 2, 1], 'the stairs on the ground lead to the landing on floor 1');
  assert.deepEqual(walkGoal(M, 0, 4, 4, 0), [4, 4, 0], 'any other tile is itself');
  M.floors[0][3 * 6 + 1] = 0;  /* a stairwell over the flight */
  assert.deepEqual(walkGoal(M, 0, 1, 3, 1), [1, 3, 0], 'the open stairwell on floor 1 leads down onto the flight');
  const up = findPath(M, 0, ...walkGoal(M, 0, 1, 3, 0)); assert.ok(up); walkChar(M, 0, up);
  assert.deepEqual([M.chars[0].x, M.chars[0].y, M.chars[0].level], [1, 2, 1]);
  placeChar(M, { sprite: 's', x: 4, y: 5 });
  assert.deepEqual(walkGoal(M, 1, 1, 3, 0), [1, 3, 0], 'with someone on the landing, the stairs are just a tile');
});
