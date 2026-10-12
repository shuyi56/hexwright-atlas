import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hits, shapesOf } from '../town/collide.js';
import { TILE } from '../town/ground.js';
import { addInterior, arrival, buildingAt, canHaveInterior, doorways, interiorSize, makeInterior } from './interiors.js';
import { TERRAIN } from '../tiles/index.js';
import { blankModel, cloneModel, fromJSON, objAt, toJSON } from './model.js';
import { placePiece } from './ops.js';
import { findPath, placeChar } from './walk.js';

test('only buildings with an inside can have an interior', () => {
  for (const id of ['cottage', 'tavern', 'mansion', 'chapel', 'elvenhall', 'stonetower']) assert.ok(canHaveInterior(id), id);
  for (const id of ['wall', 'elvenarch', 'elvenpavilion', 'oak', 'well', 'bed', 'nonsense']) assert.ok(!canHaveInterior(id), id);
});

test('a new interior is a walled room sized to its building, its doorway in the south wall', () => {
  const o = { id: 'cottage', x: 3, y: 3, face: 0, v: 0.4 }, M = makeInterior(o);
  assert.equal(M.S, 8); assert.equal(M.name, 'Thatched cottage');
  assert.equal(TERRAIN[M.terr[3 * 8 + 3]].id, 'floorboards');
  /* every edge tile holds a room piece, and nothing stands inside */
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const edge = !x || !y || x === 7 || y === 7, k = objAt(M, x, y); assert.equal(k >= 0, edge, `${x},${y}`); }
  assert.deepEqual(doorways(M), [[3, 7, 0]]);
  assert.ok(M.objs.some(p => p.id === 'hearth' && p.y === 0), 'a home gets a fireplace in its back wall');
  assert.ok(M.objs.some(p => p.id === 'iwindow'), 'and windows');
  assert.deepEqual(arrival(M), [3, 6, 2], 'one comes in just inside the door, facing into the room');
  /* the room can be crossed from the door to the back */
  placeChar(M, { sprite: 'villager', x: 3, y: 7, face: 2 });
  assert.ok(findPath(M, 0, 5, 1), 'from the doorway to the far corner');
  assert.equal(makeInterior({ id: 'chapel', x: 0, y: 0, face: 0 }).terr[9 * 12 + 5], makeInterior({ id: 'chapel', x: 0, y: 0, face: 0 }).terr[0], 'all one floor');
  assert.equal(TERRAIN[makeInterior({ id: 'chapel', x: 0, y: 0, face: 0 }).terr[0]].id, 'stonefloor');
  assert.equal(interiorSize({ id: 'mansion', face: 0 }), 12); assert.equal(interiorSize({ id: 'cathedral', face: 0 }), 24);
  assert.equal(makeInterior(o, 'cold', 14).S, 14, 'a size can be asked for');
});

test('arrival steps onto the doorway itself when something stands just inside it', () => {
  const M = makeInterior({ id: 'cottage', x: 0, y: 0, face: 0 });
  assert.ok(placePiece(M, { id: 'chest', x: 3, y: 6 }).ok);
  assert.deepEqual(arrival(M), [3, 7, 2]);
  /* with no doorway at all, the free tile nearest the middle of the south wall */
  M.objs = M.objs.filter(p => p.id !== 'idoor');
  assert.deepEqual(doorways(M), []);
  assert.deepEqual(arrival(M), [3, 7, 2], 'the gap the doorway left');
});

test('an interior is saved inside its building, copied with the map and carried by a moved piece', () => {
  const M = blankModel(10, 'grass');
  assert.ok(placePiece(M, { id: 'tavern', x: 2, y: 2 }).ok); assert.ok(placePiece(M, { id: 'cottage', x: 6, y: 6 }).ok);
  const b = buildingAt(M, 3, 2); assert.equal(b.o.id, 'tavern');
  const I = addInterior(M, b.o); I.name = 'The Drunken Goat';
  assert.ok(placePiece(I, { id: 'longtable', x: 4, y: 4 }).ok); placeChar(I, { sprite: 'merchant', x: 2, y: 2, face: 0 });
  const J = JSON.parse(JSON.stringify(toJSON(M))), back = fromJSON(J);
  const t = back.objs.find(o => o.id === 'tavern'), c = back.objs.find(o => o.id === 'cottage');
  assert.equal(t.interior.name, 'The Drunken Goat'); assert.equal(t.interior.S, 12);
  assert.ok(t.interior.objs.some(o => o.id === 'longtable')); assert.equal(t.interior.chars[0].sprite, 'merchant');
  assert.ok(!c.interior, 'a building without one stays without');
  assert.ok(!('interior' in J.objects[1]), 'and saves as before');
  /* a copy owns its interior */
  const copy = cloneModel(back); copy.objs[0].interior.objs.length = 0;
  assert.ok(back.objs[0].interior.objs.length > 0);
  /* a bad interior is left off rather than losing the map */
  J.objects[0].interior = { format: 'nope' }; assert.ok(!fromJSON(J).objs[0].interior);
  /* moving a building (taking it up and putting it down again) keeps what is inside */
  const moved = placePiece(blankModel(10), { ...t, x: 5 }); assert.equal(moved.piece.interior, t.interior);
});

test('the doorstep of a house stays open, so the hero can walk up to the door and through it', () => {
  const o = { id: 'cottage', x: 2, y: 2, face: 0, v: 0.5 }, sh = shapesOf([o]).get(0), T = TILE, front = 3 * T, x = 2.5 * T;
  assert.ok(!hits(sh, x, front + 6, 5), 'the doorstep');
  assert.ok(hits(sh, x, front - 4, 5), 'the wall behind it');
});
