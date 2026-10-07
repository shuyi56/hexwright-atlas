import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fromJSON } from './model.js';
import { setElev } from './ops.js';
import { findPath, stairsAt, walkChar } from './walk.js';

/* A hillside scene: lowland at height 0; a terrace two levels up, reached only by a one-level ramp tile at (9, 8);
   on it a three-level tower (ground, floor 1, a fenced roof) joined by two flights of stairs; a lookout summit
   at height 4 ringed by two-level cliffs; a two-storey house on the lowland. */
const scene = () => fromJSON(JSON.parse(readFileSync(new URL('./fixtures/hillside-tower.json', import.meta.url))));
/* every step one tile and at most one height level; storeys change only on or off a flight of stairs */
function audit(M, k, path) {
  const c = M.chars[k], h = (x, y) => M.elev[y * M.S + x]; let prev = [c.x, c.y, c.level || 0]; const changes = [];
  for (const p of path) {
    assert.equal(Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]), 1, `one tile at a time: ${prev} -> ${p}`);
    assert.ok(Math.abs(h(p[0], p[1]) - h(prev[0], prev[1])) <= 1, `at most one height level: ${prev} -> ${p}`);
    if (p[2] !== prev[2]) { const foot = p[2] > prev[2] ? prev : p; assert.ok(stairsAt(M, foot[0], foot[1], foot[2]), `storey change on stairs: ${prev} -> ${p}`); changes.push(`${prev[2]}->${p[2]}`); }
    prev = p;
  }
  return changes;
}
const CH = { villager: 0, farmer: 1, guard: 2, healer: 3 };

test('the villager walks from the lowland up the ramp, into the tower and up both flights to the roof, and back', () => {
  const M = scene(), up = findPath(M, CH.villager, 15, 6, 2);
  assert.ok(up, 'a route to the roof');
  assert.deepEqual(audit(M, CH.villager, up), ['0->1', '1->2']);
  assert.ok(up.some(([x, y]) => x === 9 && y === 8), 'onto the terrace by the ramp');
  assert.deepEqual(walkChar(M, CH.villager, up), { ok: true, steps: up.length });
  const down = findPath(M, CH.villager, 9, 12, 0);
  assert.deepEqual(audit(M, CH.villager, down), ['2->1', '1->0']);
});
test('the farmer at the foot of the terrace cliff goes round by the ramp to the tile right above', () => {
  const M = scene(), p = findPath(M, CH.farmer, 11, 9, 0);
  assert.ok(p && p.length > 1, 'no climbing two levels straight up');
  audit(M, CH.farmer, p);
});
test('the summit is cut off by its cliffs until steps are cut into the hill', () => {
  const M = scene();
  assert.equal(findPath(M, CH.guard, 3, 3), null);
  setElev(M, [[7, 3]], 1); setElev(M, [[6, 3]], 2); setElev(M, [[5, 3]], 3);
  const p = findPath(M, CH.guard, 3, 3); assert.ok(p);
  audit(M, CH.guard, p);
  assert.equal([[M.chars[CH.guard].x, M.chars[CH.guard].y], ...p].map(([x, y]) => M.elev[y * M.S + x]).join(''), '012344');
});
test('the healer goes upstairs in the house, and nobody reaches a floor without stairs', () => {
  const M = scene(), p = findPath(M, CH.healer, 4, 13, 1);
  assert.deepEqual(audit(M, CH.healer, p), ['0->1']);
  assert.equal(findPath(M, CH.farmer, 13, 3, 3), null, 'there is no floor 3');
  assert.equal(findPath(M, CH.farmer, 16, 5, 1), null, 'the stairwell has no floor');
});
