import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankModel, TI } from '../editor/model.js';
import { ASSETS } from '../tiles/index.js';
import { LIFT, TILE, animated, classify, faceHeight, layerOf, texel, tileFace, tileTop } from './ground.js';
import { DESIGNED, pieceSprite } from './pieces.js';
import { lineFor, sightFor } from './talk.js';

const px = (im, x, y) => Array.from(im.subarray((y * TILE + x) * 4, (y * TILE + x) * 4 + 4));

test('one ground is painted as a single surface: no seam at tile edges', () => {
  const M = blankModel(4, 'grass'), G = layerOf(M);
  for (const [tx, ty] of [[1, 1], [2, 1], [1, 2]]) {
    const im = tileTop(G, tx, ty);
    for (const [lx, ly] of [[0, 5], [31, 17], [12, 0], [20, 31]]) {
      const want = texel(TI.grass, tx * TILE + lx, ty * TILE + ly, 0, G).map(Math.round);
      assert.deepEqual(px(im, lx, ly).slice(0, 3), want, `tile ${tx},${ty} pixel ${lx},${ly}`);
      assert.equal(px(im, lx, ly)[3], 255);
    }
  }
});

test('soft grounds meet along a wandering border, built ones along the tile edge', () => {
  const M = blankModel(6, 'grass');
  for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) M.terr[y * 6 + x] = TI.dirt;
  const G = layerOf(M);
  let into = 0, back = 0;
  for (let gy = 2 * TILE; gy < 4 * TILE; gy++) for (let gx = 2 * TILE; gx < 4 * TILE; gx++) {
    const c = classify(G, gx, gy);
    if (gx < 3 * TILE && c === TI.dirt) into++;
    if (gx >= 3 * TILE && c === TI.grass) back++;
  }
  assert.ok(into > 20 && back > 20, `border wanders both ways (${into}, ${back})`);
  for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) M.terr[y * 6 + x] = TI.cobble;
  const G2 = layerOf(M);
  for (let gy = 2 * TILE; gy < 4 * TILE; gy++) for (let gx = 2 * TILE; gx < 4 * TILE; gx++) assert.equal(classify(G2, gx, gy), gx < 3 * TILE ? TI.grass : TI.cobble);
});

test('a raised tile hangs a cliff down to the tile in front; floors drop to the ground', () => {
  const M = blankModel(5, 'grass'); M.elev[1 * 5 + 2] = 3; M.elev[2 * 5 + 2] = 1;
  const G = layerOf(M);
  assert.equal(faceHeight(G, 2, 1), 2 * LIFT);
  assert.equal(faceHeight(G, 2, 2), 1 * LIFT);
  assert.equal(faceHeight(G, 0, 0), 0);
  const f = tileFace(G, 2, 1); assert.equal(f.h, 2 * LIFT); assert.equal(f.px.length, TILE * 2 * LIFT * 4);
  M.floors = [new Uint8Array(25)]; M.floors[0][2 * 5 + 1] = TI.floorboards + 1;
  const F = layerOf(M, 1);
  assert.equal(F.terr[2 * 5 + 1], TI.floorboards); assert.equal(F.terr[0], -1);
  assert.equal(faceHeight(F, 1, 2), 2 * LIFT, 'a floor with nothing in front drops a storey to the ground');
  assert.equal(px(tileTop(F, 0, 0), 5, 5)[3], 0, 'no floor, nothing painted');
});

test('water and lava animate, and so do tiles they wander into', () => {
  const M = blankModel(5, 'grass'); M.terr[2 * 5 + 2] = TI.water;
  const G = layerOf(M);
  assert.ok(animated(G, 2, 2)); assert.ok(animated(G, 1, 2)); assert.ok(!animated(G, 0, 0));
  assert.notDeepEqual(Array.from(tileTop(G, 2, 2, 0)), Array.from(tileTop(G, 2, 2, 1)));
});

test('every piece in the tile set has a town drawing', () => {
  for (const a of ASSETS) {
    assert.ok(DESIGNED.has(a.id), `${a.id} has a design`);
    for (const face of [0, 1]) {
      const s = pieceSprite({ id: a.id, face, v: 0.3 });
      assert.equal(s.px.length, s.w * s.h * 4);
      let solid = 0; for (let i = 3; i < s.px.length; i += 4) if (s.px[i] === 255) solid++;
      assert.ok(solid > 8, `${a.id} draws something`);
      const [fw, fd] = face % 2 ? [a.d, a.w] : [a.w, a.d];
      assert.ok(-s.ox < fw * TILE && s.w - s.ox > 0 && -s.oy < fd * TILE && s.h - s.oy > 0, `${a.id} is drawn over its footprint`);
    }
  }
});

test('people have something to say, and things something to show', () => {
  assert.match(lineFor('villager', 'characters', 'Ember', 1), /Ember/);
  assert.notEqual(lineFor('farmer', 'characters', 'X', 1), lineFor('farmer', 'characters', 'X', 2));
  assert.ok(lineFor('someone-made', 'enemies', 'X', 1));
  assert.equal(sightFor({ id: 'signpost', label: 'Signpost', group: 'Props' }, null, 'Ember'), 'The sign reads: Ember.');
  assert.equal(sightFor(null, { water: true }, 'X'), 'The water is cool and clear.');
  assert.equal(sightFor(null, { id: 'grass' }, 'X'), null);
});
