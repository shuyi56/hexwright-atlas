import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ROSTER } from '../characters/roster.js';
import { blankModel } from '../editor/model.js';
import { placeChar, walkChar } from '../editor/walk.js';
import { moveRange, placeId } from '../tactical/move.js';
import { ROOT, deleteUnit, readUnits, writeUnit } from '../../tools/units-store.mjs';
import { DEFAULT_UNIT, getUnit, normalizeUnit, setUnits, unitFor, unitText, validateUnit } from './units.js';

test('every roster sprite has a unit file in its group, and every file plays as a roster sprite', () => {
  const files = readUnits(), byId = new Map(files.map(f => [f.unit.id, f]));
  assert.equal(files.length, byId.size, 'no id is in both groups');
  for (const c of ROSTER) {
    const f = byId.get(c.id); assert.ok(f, `${c.id} has a unit file`);
    assert.equal(f.group, c.enemy ? 'enemies' : 'characters', `${c.id} is filed with the ${c.enemy ? 'enemies' : 'characters'}`);
  }
  for (const f of files) assert.ok(ROSTER.some(c => c.id === f.unit.id), `${f.file} names a roster sprite`);
});

test('the unit files are valid and in canonical form', () => {
  for (const f of readUnits()) {
    assert.deepEqual(validateUnit(f.raw, f.group), [], f.file);
    assert.equal(f.file, `data/units/${f.group}/${f.unit.id}.json`, 'named by its id');
    assert.equal(readFileSync(join(ROOT, f.file), 'utf8'), unitText(f.raw), `${f.file} is as a save would write it`);
    assert.deepEqual(Object.keys(f.raw), ['id', 'name', 'stats', 'movement']);
  }
});

test('a unit is clamped and filled out, and its faults are named', () => {
  const u = normalizeUnit({ id: 'Imp', level: 400, stats: { hp: -3, attack: 7.6, mp: 9 }, movement: { jump: 9 }, extra: 1 });
  assert.equal(u.id, 'imp'); assert.equal(u.name, 'Imp');
  assert.equal(u.stats.hp, 1); assert.equal(u.stats.attack, 8); assert.deepEqual(Object.keys(u.stats), ['hp', 'attack', 'range']); assert.equal(u.stats.range, 1);
  assert.equal(u.movement.jump, 6); assert.equal(u.movement.move, DEFAULT_UNIT.movement.move);
  assert.equal(u.level, undefined); assert.equal(u.extra, undefined);
  assert.deepEqual(validateUnit({ id: 'imp', stats: { hp: 30 } }), []);
  const errs = validateUnit({ id: '../x', stats: { hp: 2.5, attack: 120 }, movement: { move: 40 } }, 'enemies');
  assert.equal(errs.length, 4, errs.join(' | '));
  assert.ok(validateUnit({ id: 'a' }, 'bosses').length, 'an unknown group');
});

test('the registry looks units up by sprite and falls back to the defaults', () => {
  setUnits([{ group: 'enemies', unit: { id: 'wolf', name: 'Wolf', movement: { move: 7, jump: 2 } } }]);
  assert.equal(getUnit('wolf').group, 'enemies'); assert.equal(unitFor('wolf').movement.move, 7);
  const f = unitFor('custom-abc'); assert.ok(f.fallback); assert.deepEqual(f.movement, DEFAULT_UNIT.movement);
  setUnits([]);
});

test('the store writes canonical files, moves a unit between groups and deletes it', () => {
  const root = mkdtempSync(join(tmpdir(), 'hexwright-units-'));
  try {
    const { file } = writeUnit('characters', { id: 'imp', name: 'Imp', stats: { hp: 12 } }, root);
    assert.equal(file, 'data/units/characters/imp.json');
    writeUnit('enemies', { id: 'imp', name: 'Imp', stats: { hp: 14 } }, root);
    const all = readUnits(root); assert.equal(all.length, 1); assert.equal(all[0].group, 'enemies'); assert.equal(all[0].unit.stats.hp, 14);
    assert.throws(() => writeUnit('enemies', { id: '../../evil' }, root), /id must be/);
    assert.equal(deleteUnit('enemies', 'imp', root), true); assert.equal(deleteUnit('enemies', 'imp', root), false);
    assert.throws(() => deleteUnit('enemies', '../x', root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a unit\'s move and jump decide where it reaches', () => {
  const M = blankModel(12, 'grass');
  for (let x = 0; x < 12; x++) M.elev[3 * 12 + x] = 2; /* a ridge two levels high across the map */
  placeChar(M, { sprite: 'dragoon', x: 6, y: 6, face: 0 });
  const low = moveRange(M, 0, 3, 1), high = moveRange(M, 0, 3, 2), far = moveRange(M, 0, 6, 1);
  assert.ok([...low.values()].every(p => p.d <= 3 && p.at[1] > 3), 'jump 1 stops at the ridge');
  assert.ok(high.has(placeId(M, 6, 3, 0)), 'jump 2 climbs onto it');
  assert.ok(!low.has(placeId(M, 6, 10, 0)) && far.has(placeId(M, 6, 10, 0)), 'move 6 reaches four tiles off, move 3 does not');
  assert.equal(walkChar(M, 0, [[6, 5], [6, 4], [6, 3]]).ok, false, 'a walk checks the jump: one level by default');
  assert.equal(walkChar(M, 0, [[6, 5], [6, 4], [6, 3]], 2).ok, true);
});
