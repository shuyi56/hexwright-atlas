/* ================= battle: what a blow does =================
   An action is what a unit does to another when it acts: the plain Attack every unit has (battle/abilities.ts), or
   the ability its unit data names, which is a skill in data/skills/ taken as the battle plays it (data/skills.ts).
   Every action has an id, a label, an MP cost, the particles it plays (fx) and a few words on it (note); a strike
   falls on a foe and a heal on an ally, and each works out its own blow.

   The numbers, for a strike of power P (Attack × the strike's power) against a foe:
     damage      P × 20 / (20 + Defense), rounded, at least 1: every 20 points of Defense halve what gets through
                 (Defense 5 takes a fifth off, Defense 10 a third); a strike that pierces counts that share of
                 the Defense as not there
     hit chance  Accuracy − Evasion, in percent, kept between 5 and 100 (a sure strike always hits)
     critical    a blow that lands is critical one time in a hundred for each point of the attacker's Crit, and
                 deals its Crit Damage percent of the damage (150: half as much again), rounded
   A heal never misses and restores its base plus its share of the healer's Attack (the stock Heal: 8 + 2 × Attack)
   hit points to an ally, up to its full HP, and is never critical.

   Pure (no DOM), so the battle state, the editors, the tests and the view share it. */
import type { CombatStats } from '../data/units.ts';
import type { SkillFx } from '../data/skills.ts';

const DEF_SCALE = 20, MIN_HIT = 5, MAX_HIT = 100;

/* what an action does if it lands: amount the hit points it takes (or restores, for a heal), chance the percent it
   lands, crit the percent of hits that are critical and critAmount what a critical hit takes */
interface Blow { amount: number; chance: number; crit: number; critAmount: number }
/* what every action is made from */
interface ActionSpec { id: string; label: string; cost: number; fx: Readonly<SkillFx>; note: string }
/* a strike's power is × Attack and its pierce the share of Defense it ignores, both as fractions */
interface StrikeSpec extends ActionSpec { power: number; pierce: number; sure: boolean }
/* a heal restores healBase + healScale × Attack */
interface HealNumbers { healBase: number; healScale: number }
interface HealSpec extends ActionSpec, HealNumbers {}

const hitChance = (accuracy: number, evasion: number): number => Math.max(MIN_HIT, Math.min(MAX_HIT, Math.round(accuracy - evasion)));
const damageOf = (power: number, defense: number): number => Math.max(1, Math.round(power * DEF_SCALE / (DEF_SCALE + Math.max(0, defense))));
const critOf = (amount: number, critDamage: number): number => Math.max(amount, Math.round(amount * critDamage / 100));
/* the plain heal numbers, for a heal that names none of its own */
const PLAIN_HEAL: Readonly<HealNumbers> = Object.freeze({ healBase: 8, healScale: 2 });
const healOf = (attack: number, act: HealNumbers = PLAIN_HEAL): number => act.healBase + Math.round(act.healScale * Math.max(0, attack));

abstract class Action {
  readonly id: string;
  readonly label: string;
  readonly cost: number;
  readonly fx: Readonly<SkillFx>;
  readonly note: string;
  /* aimed at an ally's hit points instead of a foe's */
  abstract readonly heal: boolean;
  constructor({ id, label, cost, fx, note }: ActionSpec) {
    this.id = id; this.label = label; this.cost = cost; this.fx = fx; this.note = note;
  }
  /* what this action by a unit with stats `a` does to one with stats `d` */
  abstract blow(a: CombatStats, d: CombatStats): Blow;
}

/* a blow at a foe: the plain Attack, or a damage skill */
class StrikeAction extends Action {
  readonly heal = false as const;
  readonly power: number;
  readonly pierce: number;
  /* never misses */
  readonly sure: boolean;
  constructor(spec: StrikeSpec) {
    super(spec);
    this.power = spec.power; this.pierce = spec.pierce; this.sure = spec.sure;
  }
  blow(a: CombatStats, d: CombatStats): Blow {
    const amount = damageOf(a.attack * this.power, d.defense * (1 - this.pierce));
    return { amount, chance: this.sure ? 100 : hitChance(a.accuracy, d.evasion), crit: Math.max(0, Math.min(100, a.crit || 0)), critAmount: critOf(amount, a.critDamage || 100) };
  }
}

/* hit points back for an ally: a heal skill. It never misses and is never critical. */
class HealAction extends Action implements HealNumbers {
  readonly heal = true as const;
  readonly healBase: number;
  readonly healScale: number;
  constructor(spec: HealSpec) {
    super(spec);
    this.healBase = spec.healBase; this.healScale = spec.healScale;
  }
  blow(a: CombatStats): Blow {
    const amount = healOf(a.attack, this);
    return { amount, chance: 100, crit: 0, critAmount: amount };
  }
}

export { Action, DEF_SCALE, HealAction, MAX_HIT, MIN_HIT, PLAIN_HEAL, StrikeAction, critOf, damageOf, healOf, hitChance };
export type { ActionSpec, Blow, HealNumbers, HealSpec, StrikeSpec };
