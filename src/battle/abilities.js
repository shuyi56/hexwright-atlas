/* ================= battle: what a blow does, and the abilities that spend MP =================
   Every unit strikes with its Attack; one with an ability (its unit data's stats.ability) can spend MP on it instead.
   An ability reaches the same tiles as the unit's attack (its range and pattern).

   The numbers, for a blow of power P (Attack × the ability's power) against a foe:
     damage      P × 20 / (20 + Defense), rounded, at least 1: every 20 points of Defense halve what gets through
                 (Defense 5 takes a fifth off, Defense 10 a third); an ability that pierces counts that share of
                 the Defense as not there
     hit chance  Accuracy − Evasion, in percent, kept between 5 and 100 (a sure ability always hits)
     critical    a blow that lands is critical one time in a hundred for each point of the attacker's Crit, and
                 deals its Crit Damage percent of the damage (150: half as much again), rounded
   A heal never misses and restores its base plus its share of the healer's Attack (the stock Heal: 8 + 2 × Attack)
   hit points to an ally, up to its full HP, and is never critical. Every unit gets MP_REGEN MP back as its side's
   phase begins, up to its full MP.

   Pure (no DOM), so the battle state, the computer's play, the tests and the view share it. */
import { NO_SKILL, getSkill, listSkills } from '../data/skills.js';

const DEF_SCALE = 20, MIN_HIT = 5, MAX_HIT = 100, MP_REGEN = 2;
/* what a unit's data names for no ability */
const NO_ABILITY = NO_SKILL;
/* the plain attack every unit has, and the abilities, which are the skills in data/skills/ (data/skills.js) taken
   as the battle plays them: id, label, MP cost, power (× Attack), pierce (the share of Defense ignored), sure (never
   misses), heal (an ally's hit points instead of a foe's) with what it restores (healBase + healScale × Attack), the
   particles it plays (fx) and a few words on it */
const ATTACK = Object.freeze({ id: 'attack', label: 'Attack', cost: 0, power: 1, pierce: 0, sure: false, heal: false, healBase: 8, healScale: 2, fx: Object.freeze({ preset: 'none', tint: '', scale: 100, density: 100 }), note: '' });
/* a few words on what a skill does, made from its numbers: "2× damage, half Defense" */
function describe(s) {
  if (s.kind === 'heal') return 'restores HP to an ally';
  const parts = [];
  if (s.power !== 100) parts.push(`${+(s.power / 100).toFixed(2)}× damage`);
  if (s.pierce >= 100) parts.push('ignores Defense'); else if (s.pierce === 50) parts.push('half Defense'); else if (s.pierce > 0) parts.push(`ignores ${s.pierce}% of Defense`);
  if (s.sure) parts.push('never misses');
  return parts.join(', ') || 'a plain blow';
}
/* a skill's numbers as the battle uses them; made once for each version of the skill */
const made = new WeakMap();
function abilityFrom(s) {
  let a = made.get(s);
  if (!a) {
    const heal = s.kind === 'heal';
    a = Object.freeze({ id: s.id, label: s.label, cost: s.cost, power: heal ? 0 : s.power / 100, pierce: heal ? 0 : s.pierce / 100, sure: !heal && s.sure, heal, healBase: s.healBase, healScale: s.healScale / 100, fx: s.fx, note: describe(s) });
    made.set(s, a);
  }
  return a;
}
/* every ability there is, in the skill list's order */
const listAbilities = () => listSkills().map(abilityFrom);
/* the ability with this id, null for none or one not known */
const abilityOf = id => { const s = id && id !== NO_ABILITY ? getSkill(id) : null; return s ? abilityFrom(s) : null; };
const hitChance = (accuracy, evasion) => Math.max(MIN_HIT, Math.min(MAX_HIT, Math.round(accuracy - evasion)));
const damageOf = (power, defense) => Math.max(1, Math.round(power * DEF_SCALE / (DEF_SCALE + Math.max(0, defense))));
const healOf = (attack, act = ATTACK) => act.healBase + Math.round(act.healScale * Math.max(0, attack));
const critOf = (amount, critDamage) => Math.max(amount, Math.round(amount * critDamage / 100));
/* what action `act` (ATTACK or an ability) by a unit with stats `a` does to one with stats `d` (each { attack,
   defense, accuracy, evasion, crit, critDamage }): { amount, chance, crit, critAmount }, amount the hit points it
   takes (or restores, for a heal) if it lands, chance the percent it does, crit the percent of hits that are
   critical and critAmount what a critical hit takes */
function blowOf(act, a, d) {
  if (act.heal) { const amount = healOf(a.attack, act); return { amount, chance: 100, crit: 0, critAmount: amount }; }
  const amount = damageOf(a.attack * act.power, d.defense * (1 - act.pierce));
  return { amount, chance: act.sure ? 100 : hitChance(a.accuracy, d.evasion), crit: Math.max(0, Math.min(100, a.crit || 0)), critAmount: critOf(amount, a.critDamage || 100) };
}

export { ATTACK, DEF_SCALE, MP_REGEN, NO_ABILITY, abilityOf, blowOf, critOf, damageOf, describe, healOf, hitChance, listAbilities };
