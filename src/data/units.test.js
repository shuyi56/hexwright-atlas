import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ROSTER } from '../characters/roster.js';
import { blankModel } from '../editor/model.ts';
import { placeChar, walkChar } from '../editor/walk.js';
import { attackReach } from '../tactical/attack.js';
import { moveRange, placeId } from '../tactical/move.js';
import { ROOT, deleteUnit, readUnits, writeUnit } from '../../tools/units-store.mjs';
import { deleteClass, readClasses, writeClass } from '../../tools/classes-store.mjs';
import { DEFAULT_CLASS, UnitClass, classText, getClass, normalizeClass, setClasses, validateClass } from './classes.ts';
import { Character, DEFAULT_UNIT, Enemy, Unit, getUnit, listUnits, normalizeUnit, onUnitsChange, setUnits, unitFor, unitText, validateUnit } from './units.ts';

test('every roster sprite has a unit file in its group, and every file plays as a roster sprite', () => {
  const files = readUnits(), byId = new Map(files.map(f => [f.unit.id, f]));
  assert.equal(files.length, byId.size, 'no id is in both groups');
  for (const c of ROSTER) {
    const f = byId.get(c.id); assert.ok(f, `${c.id} has a unit file`);
    assert.equal(f.group, c.enemy ? 'enemies' : 'characters', `${c.id} is filed with the ${c.enemy ? 'enemies' : 'characters'}`);
  }
  for (const f of files) assert.ok(ROSTER.some(c => c.id === f.unit.id), `${f.file} names a roster sprite`);
});

test('the unit files are valid, in canonical form, and each names a class that has a file', () => {
  const classes = new Set(readClasses().map(c => c.cls.id));
  for (const f of readUnits()) {
    assert.deepEqual(validateUnit(f.raw, f.group), [], f.file);
    assert.equal(f.file, `data/units/${f.group}/${f.unit.id}.json`, 'named by its id');
    assert.equal(readFileSync(join(ROOT, f.file), 'utf8'), unitText(f.raw), `${f.file} is as a save would write it`);
    assert.ok(['id,name,class', 'id,name,class,overrides'].includes(Object.keys(f.raw).join()), `${f.file} holds who it is and its class, not stats`);
    assert.ok(classes.has(f.unit.class), `${f.file} plays as the ${f.unit.class} class, which has a file`);
  }
});

test('the class files are valid, in canonical form, and every class looks like a roster sprite', () => {
  const files = readClasses(); assert.ok(files.length);
  for (const f of files) {
    assert.deepEqual(validateClass(f.raw), [], f.file);
    assert.equal(f.file, `data/classes/${f.cls.id}.json`, 'named by its id');
    assert.equal(readFileSync(join(ROOT, f.file), 'utf8'), classText(f.raw), `${f.file} is as a save would write it`);
    assert.deepEqual(Object.keys(f.raw), ['id', 'name', 'sprite', 'stats', 'movement']);
    assert.ok(ROSTER.some(c => c.id === f.cls.sprite), `${f.file} looks like a roster sprite`);
  }
});

test('a class is clamped and filled out, and its faults are named', () => {
  const u = normalizeClass({ id: 'Imp', level: 400, stats: { hp: -3, attack: 7.6, mp: 9 }, movement: { jump: 9 }, extra: 1 });
  assert.equal(u.id, 'imp'); assert.equal(u.name, 'Imp'); assert.equal(u.sprite, 'imp', 'it looks like the sprite of its id unless told');
  assert.equal(u.stats.hp, 1); assert.equal(u.stats.attack, 8); assert.deepEqual(Object.keys(u.stats), ['hp', 'mp', 'attack', 'defense', 'accuracy', 'evasion', 'crit', 'critDamage', 'range', 'pattern', 'abilities']); assert.equal(u.stats.mp, 9); assert.deepEqual(u.stats.abilities, []); assert.equal(u.stats.range, 1); assert.equal(u.stats.pattern, 'melee');
  assert.equal(normalizeClass({ id: 'imp', stats: { pattern: 'Line' } }).stats.pattern, 'line');
  assert.equal(normalizeClass({ id: 'imp', sprite: '' }).sprite, '');
  assert.equal(u.movement.jump, 6); assert.equal(u.movement.move, DEFAULT_CLASS.movement.move);
  assert.equal(u.level, undefined); assert.equal(u.extra, undefined);
  assert.deepEqual(validateClass({ id: 'imp', stats: { hp: 30 } }), []);
  const errs = validateClass({ id: '../x', stats: { hp: 2.5, attack: 120 }, movement: { move: 40 } });
  assert.equal(errs.length, 4, errs.join(' | '));
  assert.deepEqual(validateClass({ id: 'a', stats: { pattern: 'diagonal' } }), ['Pattern must be one of melee, line, ranged']);
  assert.deepEqual(normalizeClass({ id: 'imp', stats: { ability: 'Heal' } }).stats.abilities, ['heal'], 'a file with one ability reads as a list of one');
  assert.deepEqual(normalizeClass({ id: 'imp', stats: { ability: 'none' } }).stats.abilities, []);
  assert.deepEqual(normalizeClass({ id: 'imp', stats: { abilities: ['Power', 'meteor', 'power', 'not an id!', 'none'] } }).stats.abilities, ['power', 'meteor'], 'any skill id, known or not, each once');
  assert.equal(normalizeClass({ id: 'imp', stats: { abilities: Array.from({ length: 12 }, (_, i) => `s${i}`) } }).stats.abilities.length, 8, 'up to eight');
  assert.equal(validateClass({ id: 'a', stats: { abilities: 'power' } }).length, 1, 'abilities are a list');
  assert.deepEqual(validateClass({ id: 'a', stats: { ability: 'not an id!', accuracy: 300 } }).length, 2);
});

test('a unit is who it is and its class, with only the numbers it changes', () => {
  const u = normalizeUnit({ id: 'Captain', class: 'Knight', stats: { hp: 3 }, overrides: { stats: { hp: 900, jump: 2, pattern: 'Line', foo: 1 }, movement: { jump: 9 }, extra: {} } });
  assert.deepEqual(u, { id: 'captain', name: 'Captain', class: 'knight', overrides: { stats: { hp: 900, pattern: 'line' }, movement: { jump: 6 } } }, 'clamped, and only known numbers in their own sections');
  assert.deepEqual(normalizeUnit({ id: 'a', class: 'b', overrides: { stats: {} } }), { id: 'a', name: 'a', class: 'b' }, 'empty overrides are dropped');
  assert.deepEqual(normalizeUnit({ id: 'a', class: 'b', overrides: { stats: { abilities: [] } } }).overrides, { stats: { abilities: [] } }, 'no abilities of its own is an override too');
  assert.deepEqual(normalizeUnit({ id: 'wolf', name: 'Wolf', stats: { hp: 32 }, movement: { move: 7 } }), { id: 'wolf', name: 'Wolf', class: 'wolf' }, 'a file from before classes plays as the class of its id');
  assert.deepEqual(validateUnit({ id: 'a', class: 'knight' }), []);
  assert.equal(validateUnit({ id: 'a' }).length, 1, 'a unit names its class');
  assert.equal(validateUnit({ id: 'a', class: 'knight' }, 'bosses').length, 1, 'an unknown group');
  assert.deepEqual(validateUnit({ id: 'a', class: 'knight', overrides: { stats: { hp: 0, pattern: 'x' }, movement: { move: 1.5 } } }), ['HP must be between 1 and 999', 'Pattern must be one of melee, line, ranged', 'Move must be a whole number']);
});

test('the registry plays each unit as its class with its own numbers on top, and falls back to the defaults', () => {
  let heard = 0; const off = onUnitsChange(() => heard++);
  setClasses([{ id: 'beast', name: 'Beast', stats: { hp: 30, attack: 9, abilities: ['power'] }, movement: { move: 7, jump: 2 } }]);
  setUnits([{ group: 'enemies', unit: { id: 'wolf', name: 'Wolf', class: 'beast' } }, { group: 'enemies', unit: { id: 'warg', name: 'Warg', class: 'beast', overrides: { stats: { hp: 50, abilities: [] }, movement: { jump: 3 } } } }, { group: 'characters', unit: { id: 'lost', name: 'Lost', class: 'nobody' } }]);
  assert.equal(getUnit('wolf').group, 'enemies'); assert.equal(unitFor('wolf').movement.move, 7); assert.equal(unitFor('wolf').stats.hp, 30); assert.deepEqual(unitFor('wolf').stats.abilities, ['power']);
  const warg = unitFor('warg'); assert.deepEqual([warg.stats.hp, warg.stats.attack, warg.movement.move, warg.movement.jump], [50, 9, 7, 3]); assert.deepEqual(warg.stats.abilities, []);
  assert.ok(getClass('beast') instanceof UnitClass);
  setClasses([{ id: 'beast', name: 'Beast', stats: { hp: 40 }, movement: { move: 4 } }]);
  assert.equal(unitFor('wolf').stats.hp, 40, 'a change to the class reaches its units'); assert.equal(unitFor('warg').stats.hp, 50, 'but not the numbers a unit has of its own');
  assert.ok(heard >= 3, 'a class change is a unit change');
  const lost = unitFor('lost'); assert.ok(lost.classMissing && !lost.fallback); assert.deepEqual(lost.stats, DEFAULT_UNIT.stats);
  const f = unitFor('custom-abc'); assert.ok(f.fallback && !f.classMissing); assert.deepEqual(f.movement, DEFAULT_UNIT.movement);
  assert.ok(getUnit('wolf') instanceof Enemy && getUnit('wolf') instanceof Unit); assert.equal(getUnit('wolf').side, 'enemy');
  assert.ok(f instanceof Character); assert.equal(f.side, 'player'); assert.equal(f.group, 'characters');
  assert.equal(unitText(getUnit('warg')), unitText(getUnit('warg').toJSON()), 'a Unit writes as its record, not its class numbers');
  assert.deepEqual(listUnits().map(u => u.id), ['lost', 'warg', 'wolf']);
  off(); setUnits([]); setClasses([]);
});

test('the stores write canonical files, move a unit between groups and delete them', () => {
  const root = mkdtempSync(join(tmpdir(), 'hexwright-units-'));
  try {
    const { file } = writeUnit('characters', { id: 'imp', name: 'Imp', class: 'goblin' }, root);
    assert.equal(file, 'data/units/characters/imp.json');
    writeUnit('enemies', { id: 'imp', name: 'Imp', class: 'goblin', overrides: { stats: { hp: 14 } } }, root);
    const all = readUnits(root); assert.equal(all.length, 1); assert.equal(all[0].group, 'enemies'); assert.equal(all[0].unit.overrides.stats.hp, 14);
    assert.throws(() => writeUnit('enemies', { id: '../../evil', class: 'goblin' }, root), /id must be/);
    assert.equal(deleteUnit('enemies', 'imp', root), true); assert.equal(deleteUnit('enemies', 'imp', root), false);
    assert.throws(() => deleteUnit('enemies', '../x', root));
    assert.equal(writeClass({ id: 'goblin', name: 'Goblin', stats: { hp: 22 } }, root).file, 'data/classes/goblin.json');
    assert.equal(readClasses(root)[0].cls.stats.hp, 22);
    assert.throws(() => writeClass({ id: '../evil' }, root), /id must be/);
    assert.equal(deleteClass('goblin', root), true); assert.equal(deleteClass('goblin', root), false);
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

test('melee strikes only the four tiles beside a unit; line and ranged reach out to the range', () => {
  const M = blankModel(12, 'grass'), key = cells => cells.map(([x, y]) => `${x},${y}`).sort();
  placeChar(M, { sprite: 'knight', x: 5, y: 5, face: 0 });
  placeChar(M, { sprite: 'goblin', x: 6, y: 6, face: 0 }); /* diagonal */
  placeChar(M, { sprite: 'wolf', x: 5, y: 4, face: 0 }); /* beside */
  placeChar(M, { sprite: 'orc', x: 5, y: 2, face: 0 }); /* three up */
  const melee = attackReach(M, 0, 4, 'melee');
  assert.deepEqual(key(melee.cells), ['4,5', '5,4', '5,6', '6,5'], 'no diagonals, whatever the range');
  assert.deepEqual(melee.targets, [2]);
  const line = attackReach(M, 0, 3, 'line');
  assert.equal(line.cells.length, 12); assert.deepEqual(line.targets.sort(), [2, 3]);
  const ranged = attackReach(M, 0, 2, 'ranged');
  assert.equal(ranged.cells.length, 12, 'a diamond two steps out'); assert.deepEqual(ranged.targets.sort(), [1, 2]);
  assert.deepEqual(attackReach(M, 0, 2, 'ranged', j => j !== 1).targets, [2], 'a unit canHit turns down is not a target');
  assert.equal(attackReach(M, 3, 1, 'melee').cells.length, 4);
  const corner = blankModel(12, 'grass'); placeChar(corner, { sprite: 'knight', x: 0, y: 0, face: 0 });
  assert.deepEqual(key(attackReach(corner, 0, 1, 'melee').cells), ['0,1', '1,0'], 'off the map is out');
});
