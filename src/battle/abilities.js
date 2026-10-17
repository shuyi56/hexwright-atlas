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
   A heal never misses and restores 8 + 2 × Attack hit points to an ally, up to its full HP. Every unit gets
   MP_REGEN MP back as its side's phase begins, up to its full MP. A heal is never critical.

   Pure (no DOM), so the battle state, the computer's play, the tests and the view share it. */
const DEF_SCALE = 20, MIN_HIT = 5, MAX_HIT = 100, MP_REGEN = 2;
/* the plain attack every unit has, and the abilities: id, label, MP cost, power (× Attack), pierce (the share of
   Defense ignored), sure (never misses), heal (an ally's hit points instead of a foe's), and a few words on it */
const ATTACK = Object.freeze({ id: 'attack', label: 'Attack', cost: 0, power: 1, pierce: 0, sure: false, heal: false, note: '' });
const ABILITIES = [
  { id: 'power', label: 'Power Strike', cost: 6, power: 1.5, note: '1.5× damage' },
  { id: 'true', label: 'True Strike', cost: 4, power: 1, sure: true, note: 'never misses' },
  { id: 'pierce', label: 'Pierce', cost: 5, power: 1, pierce: 1, note: 'ignores Defense' },
  { id: 'spell', label: 'Spell', cost: 8, power: 2, pierce: 0.5, note: '2× damage, half Defense' },
  { id: 'heal', label: 'Heal', cost: 6, heal: true, note: 'restores HP to an ally' }
].map(a => Object.freeze({ ...ATTACK, ...a }));
/* the ability ids a unit's data may name, 'none' for none */
const NO_ABILITY = 'none', ABILITY_IDS = [NO_ABILITY, ...ABILITIES.map(a => a.id)];
const ABILITY_BY_ID = new Map(ABILITIES.map(a => [a.id, a]));
/* the ability with this id, null for none or one not known */
const abilityOf = id => ABILITY_BY_ID.get(id) || null;

const hitChance = (accuracy, evasion) => Math.max(MIN_HIT, Math.min(MAX_HIT, Math.round(accuracy - evasion)));
const damageOf = (power, defense) => Math.max(1, Math.round(power * DEF_SCALE / (DEF_SCALE + Math.max(0, defense))));
const healOf = attack => 8 + 2 * Math.max(0, attack);
const critOf = (amount, critDamage) => Math.max(amount, Math.round(amount * critDamage / 100));
/* what action `act` (ATTACK or an ability) by a unit with stats `a` does to one with stats `d` (each { attack,
   defense, accuracy, evasion, crit, critDamage }): { amount, chance, crit, critAmount }, amount the hit points it
   takes (or restores, for a heal) if it lands, chance the percent it does, crit the percent of hits that are
   critical and critAmount what a critical hit takes */
function blowOf(act, a, d) {
  if (act.heal) { const amount = healOf(a.attack); return { amount, chance: 100, crit: 0, critAmount: amount }; }
  const amount = damageOf(a.attack * act.power, d.defense * (1 - act.pierce));
  return { amount, chance: act.sure ? 100 : hitChance(a.accuracy, d.evasion), crit: Math.max(0, Math.min(100, a.crit || 0)), critAmount: critOf(amount, a.critDamage || 100) };
}

export { ABILITIES, ABILITY_IDS, ATTACK, DEF_SCALE, MP_REGEN, NO_ABILITY, abilityOf, blowOf, critOf, damageOf, healOf, hitChance };
