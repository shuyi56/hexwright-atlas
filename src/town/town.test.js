import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankModel, TI } from '../editor/model.js';
import { ASSETS } from '../tiles/index.js';
import { CHUNK, LIFT, TILE, classify, fieldOf, heightAt, renderChunk, texel } from './ground.js';
import { DESIGNED, pieceSprite } from './pieces.js';
import { lineFor, sightFor } from './talk.js';

const rgbAt = (c, x, y) => Array.from(c.px.subarray((y * CHUNK + x) * 4, (y * CHUNK + x) * 4 + 3));

test('one ground is painted as a single surface: no seam at tile edges', () => {
  const M = blankModel(4, 'grass'), F = fieldOf(M), c = renderChunk(F, 0, 0);
  for (const [x, y] of [[47, 5], [48, 5], [12, 47], [12, 48], [95, 100]]) {
    assert.deepEqual(rgbAt(c, x, y), texel(TI.grass, x, y, 0, F).map(Math.round), `pixel ${x},${y}`);
    assert.equal(c.depth[y * CHUNK + x], y + 1, 'flat ground shows its own row');
  }
});

test('soft grounds meet along a wandering border, built ones along the tile edge', () => {
  const M = blankModel(6, 'grass');
  for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) M.terr[y * 6 + x] = TI.dirt;
  const F = fieldOf(M); let into = 0, back = 0;
  for (let gy = 2 * TILE; gy < 4 * TILE; gy++) for (let gx = 2 * TILE; gx < 4 * TILE; gx++) {
    const c = classify(F, gx, gy);
    if (gx < 3 * TILE && c === TI.dirt) into++;
    if (gx >= 3 * TILE && c === TI.grass) back++;
  }
  assert.ok(into > 20 && back > 20, `border wanders both ways (${into}, ${back})`);
  for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) M.terr[y * 6 + x] = TI.cobble;
  const F2 = fieldOf(M);
  for (let gy = 2 * TILE; gy < 4 * TILE; gy++) for (let gx = 2 * TILE; gx < 4 * TILE; gx++) assert.equal(classify(F2, gx, gy), gx < 3 * TILE ? TI.grass : TI.cobble);
});

test('a step of one level is a smooth slope; two or more is a cliff', () => {
  const M = blankModel(6, 'grass'); for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) M.elev[y * 6 + x] = 1;
  const F = fieldOf(M), gy = 2 * TILE + 20;
  let worst = 0; for (let gx = 2 * TILE; gx < 4 * TILE; gx++) worst = Math.max(worst, Math.abs(heightAt(F, gx + 1, gy) - heightAt(F, gx, gy)));
  assert.ok(worst < 0.1, `no jump on a slope (${worst})`);
  assert.equal(heightAt(F, 3.5 * TILE, gy), 1); assert.equal(heightAt(F, 1.5 * TILE, gy), 0);
  for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) M.elev[y * 6 + x] = 3;
  const F2 = fieldOf(M); let jump = 0;
  for (let gx = 2 * TILE; gx < 4 * TILE; gx++) jump = Math.max(jump, Math.abs(heightAt(F2, gx + 1, gy) - heightAt(F2, gx, gy)));
  assert.equal(jump, 3, 'a cliff jumps the whole way');
});

test('ground rising in front hides the rows behind it: the depth buffer says so', () => {
  const M = blankModel(6, 'grass'); for (let x = 0; x < 6; x++) M.elev[3 * 6 + x] = 4;
  const c = renderChunk(fieldOf(M), 0, 64), X = 70;
  /* row 3 stands 4 levels up, so its top shows at screen rows from 3 × TILE − 4 × LIFT down */
  const Y = 3 * TILE - 4 * LIFT + 6;
  assert.ok(c.depth[(Y - 64) * CHUNK + X] - 1 >= 3 * TILE, 'the high row is what shows there');
  const behind = 2 * TILE + 30;   /* the feet of someone standing on row 2 */
  assert.ok(c.depth[(Y - 64) * CHUNK + X] - 1 > behind, 'so a figure standing on row 2 is cut away there');
  /* below the brink hangs the cliff face, belonging to the high row too */
  const face = 3 * TILE - 4 * LIFT + 30; assert.ok(c.depth[(face - 64) * CHUNK + X] - 1 >= 3 * TILE);
});

test('floors that are shown join the surface a storey up; water lies flat', () => {
  const M = blankModel(5, 'grass'); M.floors = [new Uint8Array(25)]; M.floors[0][2 * 5 + 2] = TI.floorboards + 1;
  const F0 = fieldOf(M, 0), F1 = fieldOf(M, 1);
  assert.equal(F0.terr[12], TI.grass); assert.equal(F1.terr[12], TI.floorboards); assert.equal(F1.hgt[12], 2); assert.equal(F1.lev[12], 1);
  M.terr[2 * 5 + 1] = TI.water; M.elev[1 * 5 + 1] = 1;
  const F = fieldOf(M);
  for (let gx = TILE; gx < 2 * TILE; gx += 7) assert.equal(heightAt(F, gx, 2 * TILE + 24), 0);
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

test('buildings fill their footprint across, wider than they are tall at the walls', () => {
  const s = pieceSprite({ id: 'cottage', face: 0, v: 0.2 });
  let x0 = 1e9, x1 = -1;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.px[(y * s.w + x) * 4 + 3] === 255) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  assert.ok(x1 - x0 + 1 >= TILE, `a cottage is at least a tile wide (${x1 - x0 + 1})`);
});

test('people have something to say, and things something to show', () => {
  assert.match(lineFor('villager', 'characters', 'Ember', 1), /Ember/);
  assert.notEqual(lineFor('farmer', 'characters', 'X', 1), lineFor('farmer', 'characters', 'X', 2));
  assert.ok(lineFor('someone-made', 'enemies', 'X', 1));
  assert.equal(sightFor({ id: 'signpost', label: 'Signpost', group: 'Props' }, null, 'Ember'), 'The sign reads: Ember.');
  assert.equal(sightFor(null, { water: true }, 'X'), 'The water is cool and clear.');
  assert.equal(sightFor(null, { id: 'grass' }, 'X'), null);
});

test('a chain of water tiles stepping diagonally flows as one river, with no staircase', () => {
  const M = blankModel(6, 'grass'); for (const [x, y] of [[1, 1], [2, 2], [3, 3], [4, 4]]) M.terr[y * 6 + x] = TI.water;
  const F = fieldOf(M);
  /* the corner two diagonal tiles share is water, so the river does not break there */
  for (const k of [2, 3, 4]) assert.equal(classify(F, k * TILE, k * TILE), TI.water, `corner ${k}`);
  /* and the square corners of the steps are land again */
  assert.equal(classify(F, 2 * TILE + 4, 3 * TILE - 4), TI.grass);
  assert.equal(classify(F, 3 * TILE - 4, 2 * TILE + 4), TI.grass);
});

test('collision shapes match the drawings: a trunk for a tree, the walls for a house, nothing for flowers', async () => {
  const { hits, shapesOf } = await import('./collide.js');
  const objs = [{ id: 'oak', x: 1, y: 1, face: 0, v: 0.5 }, { id: 'cottage', x: 3, y: 1, face: 0, v: 0.5 }, { id: 'flowers', x: 5, y: 1, face: 0, v: 0.5 }];
  const sh = shapesOf(objs).get(0);
  /* the oak blocks only round its trunk: most of its tile is open */
  let open = 0, total = 0;
  for (let y = TILE; y < 2 * TILE; y += 4) for (let x = TILE; x < 2 * TILE; x += 4) { total++; if (!hits(sh, x, y, 5)) open++; }
  assert.ok(open / total > 0.9, `an oak's tile is mostly open (${open}/${total})`);
  assert.ok(sh.some(s => 'r' in s && s.r <= 6 && s.x > TILE && s.x < 2 * TILE), 'a small trunk circle');
  /* the cottage blocks its walls, but the step before its door is open */
  assert.ok(hits(sh, 3.5 * TILE, 1.5 * TILE, 5));
  assert.ok(!hits(sh, 3.5 * TILE, 2 * TILE - 1, 2), 'the doorstep is open');
  /* flowers block nothing */
  assert.ok(!hits(sh, 5.5 * TILE, 1.5 * TILE, 5));
});
