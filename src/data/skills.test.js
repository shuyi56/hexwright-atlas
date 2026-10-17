import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ATTACK, abilityOf, blowOf, describe, healOf, listAbilities } from '../battle/abilities.ts';
import { createBattle, strike } from '../battle/state.ts';
import { ROOT, readUnits } from '../../tools/units-store.mjs';
import { deleteSkill, readSkills, writeSkill } from '../../tools/skills-store.mjs';
import { HealAction, StrikeAction } from '../battle/actions.ts';
import { DEFAULT_SKILLS, DamageSkill, HealSkill, Skill, getSkill, listSkills, normalizeSkill, setSkills, skillFrom, skillText, validateSkill } from './skills.ts';

test('the skill files are canonical, are the stock five, and every unit names one of them or none', () => {
  const files = readSkills(ROOT);
  for (const { file, raw } of files) assert.equal(readFileSync(join(ROOT, file), 'utf8'), skillText(raw), `${file} is canonical`);
  assert.deepEqual(files.map(f => f.skill).sort((a, b) => a.id.localeCompare(b.id)), [...DEFAULT_SKILLS].sort((a, b) => a.id.localeCompare(b.id)));
  const ids = new Set(files.map(f => f.skill.id));
  for (const { unit } of readUnits(ROOT)) assert.ok(unit.stats.ability === 'none' || ids.has(unit.stats.ability), `${unit.id}'s ability is a skill`);
});

test('a skill is normalized into one shape and its mistakes are told', () => {
  const s = normalizeSkill({ id: 'Bolt', kind: 'zap', cost: 120, power: 2.5, sure: 'yes', fx: { preset: 'Spell', tint: '#ABCDEF', scale: 1000 } });
  assert.deepEqual(Object.keys(s), ['id', 'label', 'kind', 'cost', 'cooldown', 'power', 'pierce', 'sure', 'healBase', 'healScale', 'fx']);
  assert.deepEqual([s.id, s.label, s.kind, s.cost, s.power, s.sure], ['bolt', 'bolt', 'damage', 99, 10, false]);
  assert.deepEqual(s.fx, { preset: 'spell', tint: '#abcdef', scale: 300, density: 100 });
  assert.equal(normalizeSkill({ id: 'x', fx: { tint: 'red' } }).fx.tint, '', 'a tint must be #rrggbb');
  assert.deepEqual(validateSkill({ id: 'bolt', cost: 6, power: 150 }), []);
  assert.equal(validateSkill({ id: 'none' }).length, 1, '"none" is kept for no ability');
  assert.equal(validateSkill({ id: 'bolt', kind: 'zap', cost: 2.5, sure: 1, fx: { preset: 'lightning', tint: 'red', density: -1 } }).length, 6);
});

test('the battle plays the skills in the registry, so new numbers change the next blow', () => {
  try {
    assert.deepEqual(listAbilities().map(a => a.id), ['power', 'true', 'pierce', 'spell', 'heal']);
    assert.deepEqual([abilityOf('spell').power, abilityOf('spell').pierce, abilityOf('spell').note], [2, 0.5, '2× damage, half Defense']);
    assert.equal(abilityOf('none'), null); assert.equal(abilityOf('meteor'), null, 'a skill not there plays as none');
    const a = { attack: 10, accuracy: 100, crit: 0, critDamage: 150 }, d = { defense: 0, evasion: 0 };
    assert.equal(blowOf(abilityOf('power'), a, d).amount, 15);
    setSkills([...DEFAULT_SKILLS.filter(s => s.id !== 'power'), { ...DEFAULT_SKILLS[0], power: 300, sure: true }, { id: 'mend', label: 'Mend', kind: 'heal', cost: 2, healBase: 1, healScale: 50 }]);
    assert.equal(blowOf(abilityOf('power'), a, { defense: 0, evasion: 99 }).amount, 30, 'the new power');
    assert.equal(blowOf(abilityOf('power'), a, { defense: 0, evasion: 99 }).chance, 100, 'and it never misses now');
    assert.equal(abilityOf('power').note, '3× damage, never misses');
    assert.equal(healOf(10, abilityOf('mend')), 6, '1 + half of Attack 10');
    const B = createBattle([{ side: 'player', hp: 20, mp: 4, attack: 10, ability: 'mend' }, { side: 'player', hp: 20 }]);
    B.units[1].hp = 5; assert.equal(strike(B, 0, 1, 'mend').amount, 6, 'a new skill plays in a battle');
    assert.equal(getSkill('mend').label, 'Mend'); assert.equal(listSkills().at(-1).id, 'mend', 'new skills after the stock ones');
  } finally { setSkills(DEFAULT_SKILLS); }
  assert.equal(healOf(3), 14, 'the plain heal numbers: 8 + 2 × Attack'); assert.equal(ATTACK.fx.preset, 'none');
  assert.equal(describe({ kind: 'damage', power: 100, pierce: 25, sure: false }), 'ignores 25% of Defense');
});

test('each kind of skill is its own class, keeps its whole record, and plays as its own kind of action', () => {
  const power = getSkill('power'), heal = getSkill('heal');
  assert.ok(power instanceof DamageSkill && power instanceof Skill); assert.ok(heal instanceof HealSkill && heal instanceof Skill);
  assert.ok(power.toAction() instanceof StrikeAction); assert.ok(heal.toAction() instanceof HealAction);
  assert.equal(power.toAction(), power.toAction(), 'made once for each version of the skill');
  assert.deepEqual(power.toJSON(), DEFAULT_SKILLS[0]); assert.equal(skillText(heal), skillText(DEFAULT_SKILLS[4]), 'a heal still writes the damage numbers');
  assert.deepEqual(normalizeSkill(heal), DEFAULT_SKILLS[4], 'a Skill normalizes as its record');
  const flipped = skillFrom({ ...DEFAULT_SKILLS[3], kind: 'heal' });
  assert.ok(flipped instanceof HealSkill); assert.equal(skillFrom({ ...flipped.toJSON(), kind: 'damage' }).power, 200, 'switched back, it keeps its power');
  assert.ok(Object.isFrozen(power));
});

test('the store writes canonical skill files and deletes them', () => {
  const root = mkdtempSync(join(tmpdir(), 'hexwright-skills-'));
  try {
    const { file } = writeSkill({ id: 'bolt', label: 'Bolt', cost: 7, power: 180, fx: { preset: 'spell', tint: '#80c0ff' } }, root);
    assert.equal(file, 'data/skills/bolt.json');
    const all = readSkills(root); assert.equal(all.length, 1); assert.equal(all[0].skill.power, 180);
    assert.throws(() => writeSkill({ id: '../../evil' }, root), /id must be/);
    assert.equal(deleteSkill('bolt', root), true); assert.equal(deleteSkill('bolt', root), false);
    assert.throws(() => deleteSkill('../x', root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
