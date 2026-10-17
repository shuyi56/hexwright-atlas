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
import { ROOT, deleteUnit, readUnits, writeUnit } from '../../tools/npcs-store.mjs';
import { deleteClass, readClasses, writeClass } from '../../tools/classes-store.mjs';
import { DEFAULT_CLASS, UnitClass, classText, getClass, normalizeClass, setClasses, validateClass } from './classes.ts';
import { Character, DEFAULT_UNIT, Enemy, Unit, getUnit, listUnits, normalizeUnit, onUnitsChange, setUnits, unitFor, unitText, usePlayables, validateUnit } from './units.ts';
import { OUTFIT_KEYS } from '../characters/choices.js';
import { fromSpec } from '../characters/custom.js';

test('every roster sprite is an NPC with a file on its side, and every NPC file is a roster sprite', () => {
  const files = readUnits(), byId = new Map(files.map(f => [f.unit.id, f]));
  assert.equal(files.length, byId.size, 'no id is on both sides');
  for (const c of ROSTER) {
    const f = byId.get(c.id); assert.ok(f, `${c.id} has an NPC file`);
    assert.equal(f.group, c.enemy ? 'enemies' : 'allies', `${c.id} is filed with the ${c.enemy ? 'enemies' : 'allies'}`);
  }
  for (const f of files) assert.ok(ROSTER.some(c => c.id === f.unit.id), `${f.file} names a roster sprite`);
});

test('the NPC files are valid, in canonical form, and each names a class that has a file', () => {
  const classes = new Set(readClasses().map(c => c.cls.id));
  for (const f of readUnits()) {
    assert.deepEqual(validateUnit(f.raw, f.group), [], f.file);
    assert.equal(f.file, `data/npcs/${f.group}/${f.unit.id}.json`, 'named by its id');
    assert.equal(readFileSync(join(ROOT, f.file), 'utf8'), unitText(f.raw), `${f.file} is as a save would write it`);
    assert.deepEqual(Object.keys(f.raw), ['id', 'name', 'class'], `${f.file} holds who it is and its class, not stats`);
    assert.ok(classes.has(f.unit.class), `${f.file} plays as the ${f.unit.class} class, which has a file`);
  }
});

test('the class files are valid and canonical; the jobs and townsfolk have outfits, the beasts and foes none', () => {
  const files = readClasses(); assert.ok(files.length);
  for (const f of files) {
    assert.deepEqual(validateClass(f.raw), [], f.file);
    assert.equal(f.file, `data/classes/${f.cls.id}.json`, 'named by its id');
    assert.equal(readFileSync(join(ROOT, f.file), 'utf8'), classText(f.raw), `${f.file} is as a save would write it`);
    assert.deepEqual(Object.keys(f.raw), ['id', 'name', 'outfit', 'stats', 'movement']);
  }
  const outfit = id => files.find(f => f.cls.id === id).cls.outfit;
  assert.equal(outfit('knight').clothes, 'plate'); assert.equal(outfit('archer').held, 'bow'); assert.equal(outfit('farmer').clothes, 'overalls');
  for (const id of ['goblin', 'wolf', 'slime', 'skeleton', 'orc', 'bandit', 'darkelf']) assert.equal(outfit(id), null, `${id} is a class only NPCs play`);
});

test('a class is clamped and filled out, its outfit cleaned, and its faults are named', () => {
  const u = normalizeClass({ id: 'Imp', level: 400, sprite: 'goblin', stats: { hp: -3, attack: 7.6, mp: 9 }, movement: { jump: 9 }, extra: 1 });
  assert.equal(u.id, 'imp'); assert.equal(u.name, 'Imp'); assert.equal(u.outfit, null, 'no outfit unless it has one'); assert.equal(u.sprite, undefined);
  assert.equal(u.stats.hp, 1); assert.equal(u.stats.attack, 8); assert.deepEqual(Object.keys(u.stats), ['hp', 'mp', 'attack', 'defense', 'accuracy', 'evasion', 'crit', 'critDamage', 'range', 'pattern', 'abilities']); assert.equal(u.stats.mp, 9); assert.deepEqual(u.stats.abilities, []); assert.equal(u.stats.range, 1); assert.equal(u.stats.pattern, 'melee');
  assert.equal(normalizeClass({ id: 'imp', stats: { pattern: 'Line' } }).stats.pattern, 'line');
  const o = normalizeClass({ id: 'imp', outfit: { clothes: 'plate', held: 'laser', build: 'tall', colours: { cloth: '#ABCDEF', skin: '#000000', steel: 'grey' } } }).outfit;
  assert.deepEqual(Object.keys(o), [...OUTFIT_KEYS, 'colours'], 'only outfit choices, none of the body');
  assert.equal(o.clothes, 'plate'); assert.equal(o.held, 'none'); assert.equal(o.colours.cloth, '#abcdef'); assert.equal(o.colours.skin, undefined); assert.match(o.colours.steel, /^#[0-9a-f]{6}$/);
  assert.equal(u.movement.jump, 6); assert.equal(u.movement.move, DEFAULT_CLASS.movement.move);
  assert.equal(u.level, undefined); assert.equal(u.extra, undefined);
  assert.deepEqual(validateClass({ id: 'imp', stats: { hp: 30 } }), []);
  assert.deepEqual(validateClass({ id: 'imp', outfit: { wings: 'yes' } }), ['the outfit has no choice called “wings”']);
  const errs = validateClass({ id: '../x', stats: { hp: 2.5, attack: 120 }, movement: { move: 40 } });
  assert.equal(errs.length, 4, errs.join(' | '));
  assert.deepEqual(validateClass({ id: 'a', stats: { pattern: 'diagonal' } }), ['Pattern must be one of melee, line, ranged']);
  assert.deepEqual(normalizeClass({ id: 'imp', stats: { ability: 'Heal' } }).stats.abilities, ['heal'], 'a file with one ability reads as a list of one');
  assert.deepEqual(normalizeClass({ id: 'imp', stats: { abilities: ['Power', 'meteor', 'power', 'not an id!', 'none'] } }).stats.abilities, ['power', 'meteor'], 'any skill id, known or not, each once');
  assert.equal(normalizeClass({ id: 'imp', stats: { abilities: Array.from({ length: 12 }, (_, i) => `s${i}`) } }).stats.abilities.length, 8, 'up to eight');
  assert.equal(validateClass({ id: 'a', stats: { abilities: 'power' } }).length, 1, 'abilities are a list');
});

test('an NPC is who it is and its class', () => {
  assert.deepEqual(normalizeUnit({ id: 'Captain', class: 'Knight', stats: { hp: 3 }, overrides: { stats: { hp: 900 } } }), { id: 'captain', name: 'Captain', class: 'knight' });
  assert.deepEqual(normalizeUnit({ id: 'wolf', name: 'Wolf', stats: { hp: 32 }, movement: { move: 7 } }), { id: 'wolf', name: 'Wolf', class: 'wolf' }, 'a file from before classes plays as the class of its id');
  assert.deepEqual(validateUnit({ id: 'a', class: 'knight' }), []);
  assert.equal(validateUnit({ id: 'a' }).length, 1, 'an NPC names its class');
  assert.equal(validateUnit({ id: 'a', class: 'knight' }, 'bosses').length, 1, 'an unknown group');
});

test('NPCs and playable characters fight with their class\'s numbers; the rest with the defaults', () => {
  let heard = 0; const off = onUnitsChange(() => heard++);
  setClasses([{ id: 'beast', name: 'Beast', stats: { hp: 30, attack: 9, abilities: ['power'] }, movement: { move: 7, jump: 2 } }]);
  setUnits([{ group: 'enemies', unit: { id: 'wolf', name: 'Wolf', class: 'beast' } }, { group: 'allies', unit: { id: 'lost', name: 'Lost', class: 'nobody' } }]);
  const mine = [{ id: 'custom-a', name: 'Ada', class: 'beast' }, { id: 'custom-b', name: 'Bo', class: '' }];
  usePlayables({ get: id => mine.find(p => p.id === id) || null, list: () => mine });
  assert.equal(getUnit('wolf').group, 'enemies'); assert.equal(unitFor('wolf').movement.move, 7); assert.equal(unitFor('wolf').stats.hp, 30); assert.deepEqual(unitFor('wolf').stats.abilities, ['power']);
  const ada = unitFor('custom-a'); assert.ok(ada.playable && ada instanceof Character && !ada.fallback); assert.equal(ada.stats.attack, 9); assert.equal(ada.name, 'Ada');
  const bo = unitFor('custom-b'); assert.ok(bo.playable && bo.fallback); assert.deepEqual(bo.stats, DEFAULT_UNIT.stats);
  assert.ok(getClass('beast') instanceof UnitClass);
  setClasses([{ id: 'beast', name: 'Beast', stats: { hp: 40 }, movement: { move: 4 } }]);
  assert.equal(unitFor('wolf').stats.hp, 40, 'a change to the class reaches its NPCs'); assert.equal(unitFor('custom-a').stats.hp, 40, 'and its playable characters');
  assert.ok(heard >= 4, 'a class change is a unit change');
  const lost = unitFor('lost'); assert.ok(lost.classMissing && !lost.fallback); assert.deepEqual(lost.stats, DEFAULT_UNIT.stats);
  const f = unitFor('nobody-at-all'); assert.ok(f.fallback && !f.playable); assert.deepEqual(f.movement, DEFAULT_UNIT.movement);
  assert.ok(getUnit('wolf') instanceof Enemy && getUnit('wolf') instanceof Unit); assert.equal(getUnit('wolf').side, 'enemy');
  assert.equal(f.side, 'player'); assert.equal(f.group, 'allies');
  assert.equal(unitText(getUnit('wolf')), unitText(getUnit('wolf').toJSON()), 'a Unit writes as its file, not its class numbers');
  assert.deepEqual(listUnits().map(u => u.id), ['custom-a', 'lost', 'wolf'], 'the NPCs, and the playable characters that have a class');
  off(); usePlayables({ get: () => null, list: () => [] }); setUnits([]); setClasses([]);
});

test('a playable character wears its class\'s outfit over its own body', () => {
  setClasses([{ id: 'sentry', name: 'Sentry', outfit: { clothes: 'plate', hat: 'kettle', held: 'spear', colours: { cloth: '#112233' } } }, { id: 'brute', name: 'Brute' }]);
  const body = { id: 'custom-x', name: 'Xan', build: 'tall', hair: 'braid', clothes: 'gown', hat: 'none', colours: { skin: '#b98a66', cloth: '#ffffff' } };
  const own = fromSpec(body), worn = fromSpec({ ...body, class: 'sentry' }), bare = fromSpec({ ...body, class: 'brute' });
  assert.equal(worn.body, 'tall', 'its own build'); assert.equal(worn.pal.K, '#b98a66', 'its own skin'); assert.equal(worn.hair, own.hair, 'its own hair');
  assert.equal(worn.outfit.torso, 'plate', 'the class\'s clothes'); assert.equal(worn.pal.A, '#112233', 'in the class\'s colours'); assert.ok(worn.weapon, 'with the class\'s spear');
  assert.equal(worn.spec.clothes, 'gown', 'its own spec is kept, so it can leave the class'); assert.equal(worn.spec.class, 'sentry');
  assert.notEqual(worn.look, own.look, 'a different look to draw');
  assert.equal(bare.look, own.look, 'a class with no outfit leaves its own');
  setClasses([]);
});

test('the stores write canonical files, move an NPC between sides and delete them', () => {
  const root = mkdtempSync(join(tmpdir(), 'hexwright-units-'));
  try {
    const { file } = writeUnit('allies', { id: 'imp', name: 'Imp', class: 'goblin' }, root);
    assert.equal(file, 'data/npcs/allies/imp.json');
    writeUnit('enemies', { id: 'imp', name: 'Imp', class: 'orc' }, root);
    const all = readUnits(root); assert.equal(all.length, 1); assert.equal(all[0].group, 'enemies'); assert.equal(all[0].unit.class, 'orc');
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
