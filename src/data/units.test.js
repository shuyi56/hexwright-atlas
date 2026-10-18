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

test('the NPC files are valid, in canonical form, and hold numbers of their own', () => {
  for (const f of readUnits()) {
    assert.deepEqual(validateUnit(f.raw, f.group), [], f.file);
    assert.equal(f.file, `data/npcs/${f.group}/${f.unit.id}.json`, 'named by its id');
    assert.equal(readFileSync(join(ROOT, f.file), 'utf8'), unitText(f.raw), `${f.file} is as a save would write it`);
    assert.deepEqual(Object.keys(f.raw), ['id', 'name', 'stats', 'movement'], `${f.file} holds who it is and its numbers, no class`);
  }
});

test('the classes are the seven jobs, each with an outfit, in valid and canonical files', () => {
  const files = readClasses();
  assert.deepEqual(files.map(f => f.cls.id), ['archer', 'blackmage', 'dragoon', 'knight', 'summoner', 'valkyrie', 'whitemage']);
  for (const f of files) {
    assert.deepEqual(validateClass(f.raw), [], f.file);
    assert.equal(f.file, `data/classes/${f.cls.id}.json`, 'named by its id');
    assert.equal(readFileSync(join(ROOT, f.file), 'utf8'), classText(f.raw), `${f.file} is as a save would write it`);
    assert.deepEqual(Object.keys(f.raw), ['id', 'name', 'outfit', 'stats', 'movement']);
    assert.ok(f.raw.outfit && typeof f.raw.outfit === 'object', `${f.file} has an outfit`);
  }
  const outfit = id => files.find(f => f.cls.id === id).cls.outfit;
  assert.equal(outfit('knight').clothes, 'plate'); assert.equal(outfit('archer').held, 'bow');
});

test('a class is clamped and filled out, its outfit cleaned, and its faults are named', () => {
  const u = normalizeClass({ id: 'Imp', level: 400, sprite: 'goblin', stats: { hp: -3, attack: 7.6, mp: 9 }, movement: { jump: 9 }, extra: 1 });
  assert.equal(u.id, 'imp'); assert.equal(u.name, 'Imp'); assert.deepEqual(u.outfit, DEFAULT_CLASS.outfit, 'the default outfit unless it has one'); assert.equal(u.sprite, undefined);
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

test('an NPC is who it is and its own numbers, clamped and filled out like a class', () => {
  const n = normalizeUnit({ id: 'Captain', class: 'Knight', stats: { hp: -3, attack: 7.6, pattern: 'Line' }, movement: { jump: 9 } });
  assert.deepEqual(Object.keys(n), ['id', 'name', 'stats', 'movement']); assert.equal(n.id, 'captain'); assert.equal(n.name, 'Captain');
  assert.equal(n.stats.hp, 1); assert.equal(n.stats.attack, 8); assert.equal(n.stats.pattern, 'line'); assert.equal(n.movement.jump, 6);
  assert.deepEqual(normalizeUnit({ id: 'a' }).stats, DEFAULT_UNIT.stats, 'anything missing from the defaults');
  assert.deepEqual(validateUnit({ id: 'a', stats: { hp: 30 } }), []);
  assert.equal(validateUnit({ id: 'a', stats: { hp: 2.5 }, movement: { move: 40 } }).length, 2, 'its numbers are checked like a class\'s');
  assert.equal(validateUnit({ id: 'a' }, 'bosses').length, 1, 'an unknown group');
});

test('NPCs fight with their own numbers, playable characters with their class\'s; the rest with the defaults', () => {
  let heard = 0; const off = onUnitsChange(() => heard++);
  setClasses([{ id: 'beast', name: 'Beast', stats: { hp: 30, attack: 9, abilities: ['power'] }, movement: { move: 7, jump: 2 } }]);
  setUnits([{ group: 'enemies', unit: { id: 'wolf', name: 'Wolf', stats: { hp: 32, abilities: ['power'] }, movement: { move: 6 } } }, { group: 'allies', unit: { id: 'beast', name: 'Beast NPC', stats: { hp: 5 } } }]);
  const mine = [{ id: 'custom-a', name: 'Ada', class: 'beast' }, { id: 'custom-b', name: 'Bo', class: '' }, { id: 'custom-c', name: 'Cy', class: 'nobody' }];
  usePlayables({ get: id => mine.find(p => p.id === id) || null, list: () => mine });
  assert.equal(getUnit('wolf').group, 'enemies'); assert.equal(unitFor('wolf').movement.move, 6); assert.equal(unitFor('wolf').stats.hp, 32); assert.deepEqual(unitFor('wolf').stats.abilities, ['power']);
  assert.equal(unitFor('wolf').class, '', 'an NPC takes no class'); assert.equal(unitFor('beast').stats.hp, 5, 'an NPC sharing a class\'s id keeps its own numbers');
  const ada = unitFor('custom-a'); assert.ok(ada.playable && ada instanceof Character && !ada.fallback); assert.equal(ada.stats.attack, 9); assert.equal(ada.name, 'Ada'); assert.equal(ada.class, 'beast');
  const bo = unitFor('custom-b'); assert.ok(bo.playable && bo.fallback); assert.deepEqual(bo.stats, DEFAULT_UNIT.stats);
  const cy = unitFor('custom-c'); assert.ok(cy.classMissing && !cy.fallback); assert.deepEqual(cy.stats, DEFAULT_UNIT.stats);
  assert.ok(getClass('beast') instanceof UnitClass);
  setClasses([{ id: 'beast', name: 'Beast', stats: { hp: 40 }, movement: { move: 4 } }]);
  assert.equal(unitFor('custom-a').stats.hp, 40, 'a change to the class reaches its playable characters'); assert.equal(unitFor('wolf').stats.hp, 32, 'and no NPC');
  assert.ok(heard >= 4, 'a class change is a unit change');
  const f = unitFor('nobody-at-all'); assert.ok(f.fallback && !f.playable); assert.deepEqual(f.movement, DEFAULT_UNIT.movement);
  assert.ok(getUnit('wolf') instanceof Enemy && getUnit('wolf') instanceof Unit); assert.equal(getUnit('wolf').side, 'enemy');
  assert.equal(f.side, 'player'); assert.equal(f.group, 'allies');
  assert.equal(unitText(getUnit('wolf')), unitText({ id: 'wolf', name: 'Wolf', stats: { hp: 32, abilities: ['power'] }, movement: { move: 6 } }), 'a Unit writes as its file');
  assert.deepEqual(listUnits().map(u => u.id), ['custom-a', 'beast', 'custom-c', 'wolf'], 'the NPCs, and the playable characters that have a class');
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
  assert.equal(bare.outfit.torso, fromSpec({ ...body, clothes: 'vest', colours: {} }).outfit.torso, 'a class whose file has no outfit dresses in the default one');
  setClasses([]);
});

test('the stores write canonical files, move an NPC between sides and delete them', () => {
  const root = mkdtempSync(join(tmpdir(), 'hexwright-units-'));
  try {
    const { file } = writeUnit('allies', { id: 'imp', name: 'Imp', stats: { hp: 9 } }, root);
    assert.equal(file, 'data/npcs/allies/imp.json');
    writeUnit('enemies', { id: 'imp', name: 'Imp', stats: { hp: 12 } }, root);
    const all = readUnits(root); assert.equal(all.length, 1); assert.equal(all[0].group, 'enemies'); assert.equal(all[0].unit.stats.hp, 12);
    assert.throws(() => writeUnit('enemies', { id: '../../evil' }, root), /id must be/);
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
