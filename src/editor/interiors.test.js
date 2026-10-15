import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hits, shapesOf } from '../town/collide.js';
import { TILE } from '../town/ground.js';
import { addInterior, arrival, buildingAt, canHaveInterior, doorAcross, doorways, interiorSize, makeInterior } from './interiors.js';
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
  assert.equal(M.S, 5, 'a cottage is three tiles across inside its walls'); assert.equal(M.name, 'Thatched cottage');
  assert.equal(TERRAIN[M.terr[2 * 5 + 2]].id, 'floorboards');
  /* every edge tile holds a room piece, and nothing stands inside */
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const edge = !x || !y || x === 4 || y === 4, k = objAt(M, x, y); assert.equal(k >= 0, edge, `${x},${y}`); }
  assert.deepEqual(doorways(M), [[2, 4, 0]]);
  assert.ok(M.objs.some(p => p.id === 'hearth' && p.y === 0), 'a home gets a fireplace in its back wall');
  assert.ok(M.objs.some(p => p.id === 'iwindow'), 'and windows');
  assert.deepEqual(arrival(M), [2, 3, 2], 'one comes in just inside the door, facing into the room');
  /* the room can be crossed from the door to the back */
  placeChar(M, { sprite: 'villager', x: 2, y: 4, face: 2 });
  assert.ok(findPath(M, 0, 3, 1), 'from the doorway to the far corner');
  assert.equal(makeInterior({ id: 'chapel', x: 0, y: 0, face: 0 }).terr[5 * 7 + 3], makeInterior({ id: 'chapel', x: 0, y: 0, face: 0 }).terr[0], 'all one floor');
  assert.equal(TERRAIN[makeInterior({ id: 'chapel', x: 0, y: 0, face: 0 }).terr[0]].id, 'stonefloor');
  assert.equal(interiorSize({ id: 'tavern', face: 0 }), 7); assert.equal(interiorSize({ id: 'mansion', face: 0 }), 7); assert.equal(interiorSize({ id: 'cathedral', face: 0 }), 12);
  assert.equal(makeInterior(o, 'cold', 14).S, 14, 'a size can be asked for');
});

test('arrival steps onto the doorway itself when something stands just inside it', () => {
  const M = makeInterior({ id: 'cottage', x: 0, y: 0, face: 0 });
  assert.ok(placePiece(M, { id: 'chest', x: 2, y: 3 }).ok);
  assert.deepEqual(arrival(M), [2, 4, 2]);
  /* with no doorway at all, the free tile nearest the middle of the south wall */
  M.objs = M.objs.filter(p => p.id !== 'idoor');
  assert.deepEqual(doorways(M), []);
  assert.deepEqual(arrival(M), [2, 4, 2], 'the gap the doorway left');
});

test('an interior is saved inside its building, copied with the map and carried by a moved piece', () => {
  const M = blankModel(10, 'grass');
  assert.ok(placePiece(M, { id: 'tavern', x: 2, y: 2 }).ok); assert.ok(placePiece(M, { id: 'cottage', x: 6, y: 6 }).ok);
  const b = buildingAt(M, 3, 2); assert.equal(b.o.id, 'tavern');
  const I = addInterior(M, b.o); I.name = 'The Drunken Goat';
  assert.ok(placePiece(I, { id: 'longtable', x: 4, y: 4 }).ok); placeChar(I, { sprite: 'merchant', x: 2, y: 2, face: 0 });
  const J = JSON.parse(JSON.stringify(toJSON(M))), back = fromJSON(J);
  const t = back.objs.find(o => o.id === 'tavern'), c = back.objs.find(o => o.id === 'cottage');
  assert.equal(t.interior.name, 'The Drunken Goat'); assert.equal(t.interior.S, 7);
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

test('the Wayfarer\'s Rest scene: a furnished inn on two floors, every room reachable from its door', async () => {
  const { readFileSync } = await import('node:fs');
  const J = JSON.parse(readFileSync(new URL('../../scenes/town/wayfarers-rest.json', import.meta.url), 'utf8')), meta = JSON.parse(readFileSync(new URL('../../scenes/town/wayfarers-rest.scene.json', import.meta.url), 'utf8'));
  const M = fromJSON(J), { x, y } = meta.town.inside, b = buildingAt(M, x, y), I = b && b.o.interior;
  assert.ok(I, 'the scene starts inside a building with an interior');
  assert.ok(I.objs.filter(o => !['iwall', 'iwindow', 'idoor', 'hearth'].includes(o.id)).length >= 15, 'furnished');
  assert.ok(I.objs.some(o => o.level === 1) && I.objs.some(o => o.id === 'stairs'), 'with an upstairs reached by stairs');
  assert.ok(I.objs.filter(o => o.id === 'bar').length >= 3 && I.objs.filter(o => o.id === 'tableset').length >= 4, 'a bar counter and tables with chairs');
  const [ax, ay] = arrival(I), solo = { ...I, chars: [{ sprite: 'villager', x: ax, y: ay, face: 2 }] };
  /* the innkeeper's lane behind the bar is closed in by its side counter */
  assert.ok(!findPath(solo, 0, 6, 1, 0), 'the lane behind the bar is closed off');
  for (const [tx, ty, L] of [[3, 1, 0], [5, 3, 0], [7, 6, 0], [2, 5, 0], [2, 3, 1], [6, 3, 1], [3, 6, 1], [6, 6, 1]]) assert.ok(findPath(solo, 0, tx, ty, L), `${tx},${ty} on floor ${L}`);
});
test('the Wayfarer\'s Rest scene: a smithy and an alchemist\'s shop on the lane, furnished and walkable inside', async () => {
  const { readFileSync } = await import('node:fs');
  const M = fromJSON(JSON.parse(readFileSync(new URL('../../scenes/town/wayfarers-rest.json', import.meta.url), 'utf8')));
  const shop = id => { const o = M.objs.find(p => p.id === id); assert.ok(o && o.interior, `the ${id} has an interior`); return o.interior; };
  const solo = I => { const [ax, ay] = arrival(I); return { ...I, chars: [{ sprite: 'villager', x: ax, y: ay, face: 2 }] }; };
  const has = (I, ids) => { for (const id of ids) assert.ok(I.objs.some(o => o.id === id), id); };
  const H = shop('blacksmith'), A = shop('alchemist');
  has(H, ['forge', 'anvil', 'quench', 'grindstone', 'weaponrack', 'armorstand', 'ironstock', 'walltools']);
  assert.equal(H.S, 4, 'the smithy is a small workshop');
  has(A, ['alchemybench', 'brewcauldron', 'potionshelf', 'apothecary', 'herbrack', 'wallherbs', 'wallchart', 'stairs']);
  assert.ok(H.chars.some(c => c.sprite === 'smith') && A.chars.some(c => c.sprite === 'alchemist'), 'each shop is kept');
  /* the shopkeeper can be walked up to, and every corner of the floor that is not furnished can be reached */
  for (const [I, spots] of [[H, [[2, 2, 0]]], [A, [[2, 3, 0], [2, 3, 1], [2, 2, 1], [3, 3, 0]]]]) for (const [x, y, L] of spots) assert.ok(findPath(solo(I), 0, x, y, L), `${I.name}: ${x},${y} on floor ${L}`);
  /* in the town view too, nothing blocks the way in from the door to the shopkeeper */
  for (const [I, way] of [[H, [[2, 2]]], [A, [[2, 3]]]]) {
    const shapes = shapesOf(I.objs).get(0), T = TILE;
    for (const [x, y] of way) assert.ok(!hits(shapes, x * T + T / 2, y * T + T / 2, 8), `${I.name}: ${x},${y} is open`);
  }
});

test('furniture against a wall stands on the wall\'s own tile, facing into the room', () => {
  const M = blankModel(6, 'stonefloor');
  for (let x = 0; x < 6; x++) assert.ok(placePiece(M, { id: 'iwall', x, y: 0 }).ok);
  assert.ok(placePiece(M, { id: 'chest', x: 2, y: 0, face: 0 }).ok, 'a chest against the back wall');
  assert.ok(!placePiece(M, { id: 'chest', x: 2, y: 0, face: 0 }).ok, 'one piece against a wall a tile');
  const r = placePiece(M, { id: 'chest', x: 3, y: 0, face: 2 }); assert.ok(!r.ok); assert.match(r.reason, /facing into the room/);
  assert.ok(!placePiece(M, { id: 'table', x: 4, y: 0 }).ok, 'a table does not stand against a wall');
  assert.equal(M.objs[objAt(M, 2, 0)].id, 'chest', 'the chest is the piece found there');
  assert.ok(placePiece(M, { id: 'iwindow', x: 0, y: 3 }).ok && placePiece(M, { id: 'armorstand', x: 0, y: 3, face: 1 }).ok, 'an armour stand against a window wall');
  /* in the town view it stands just in front of the wall's face and blocks only where it stands */
  const sh = shapesOf(M.objs).get(0), T = TILE;
  assert.ok(hits(sh, 2.5 * T, 0.5 * T + 14, 4), 'the chest before the wall');
  assert.ok(!hits(sh, 2.5 * T, 1.5 * T, 6), 'the tile in front stays open');
});

test('the shops\' doors are where the town view draws them, so walking up to one goes in', () => {
  assert.equal(doorAcross({ id: 'blacksmith', face: 0 }), 0.2);
  assert.equal(doorAcross({ id: 'alchemist', face: 0 }), 0.24);
  assert.equal(doorAcross({ id: 'cottage', face: 0 }), 0.5);
});
