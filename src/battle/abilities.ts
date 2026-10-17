/* ================= battle: the plain attack, and the abilities that spend MP =================
   Every unit strikes with its Attack; one with an ability (its unit data's stats.ability) can spend MP on it instead.
   An ability reaches the same tiles as the unit's attack (its range and pattern). What a blow does is in
   battle/actions.ts; the abilities are the skills in data/skills/ (data/skills.ts), each made into the action of its
   kind. Every unit gets MP_REGEN MP back as its side's phase begins, up to its full MP.

   Pure (no DOM), so the battle state, the computer's play, the tests and the view share it. */
import { Action, DEF_SCALE, StrikeAction, critOf, damageOf, healOf, hitChance } from './actions.ts';
import type { Blow } from './actions.ts';
import type { CombatStats } from '../data/units.ts';
import { NO_SKILL, getSkill, listSkills, skillFrom } from '../data/skills.ts';

const MP_REGEN = 2;
/* what a unit's data names for no ability */
const NO_ABILITY = NO_SKILL;
/* the plain attack every unit has */
const ATTACK: StrikeAction = Object.freeze(new StrikeAction({ id: 'attack', label: 'Attack', cost: 0, cooldown: 0, power: 1, pierce: 0, sure: false, fx: Object.freeze({ preset: 'none', tint: '', scale: 100, density: 100 }), note: '' }));
/* a few words on what a skill does, made from its numbers: "2× damage, half Defense" */
const describe = (s: unknown): string => skillFrom(s).describe();
/* every ability there is, in the skill list's order */
const listAbilities = (): Action[] => listSkills().map(s => s.toAction());
/* the ability with this id, null for none or one not known */
const abilityOf = (id: string | null | undefined): Action | null => { const s = id && id !== NO_ABILITY ? getSkill(id) : null; return s ? s.toAction() : null; };
/* what action `act` (ATTACK or an ability) by a unit with stats `a` does to one with stats `d` */
const blowOf = (act: Action, a: CombatStats, d: CombatStats): Blow => act.blow(a, d);

export { ATTACK, DEF_SCALE, MP_REGEN, NO_ABILITY, abilityOf, blowOf, critOf, damageOf, describe, healOf, hitChance, listAbilities };
