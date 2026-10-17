/* ================= skill data: the abilities that spend MP =================
   What each ability does in a fight and how it looks doing it. A unit names one in its data (stats.ability, see
   data/units.ts); battle/abilities.ts turns the numbers here into blows. Each skill is one JSON file under
   data/skills/, named by its id:

     data/skills/power.json
     { "id": "power", "label": "Power Strike", "menu": "actions", "kind": "damage", "cost": 6, "cooldown": 1, "power": 150, "pierce": 0,
       "sure": false, "healBase": 8, "healScale": 200,
       "fx": { "preset": "power", "tint": "", "scale": 100, "density": 100 } }

   menu        the battle menu it is listed in: actions (a technique) or spells (magic)
   kind        damage (strikes a foe) or heal (restores an ally's hit points, and never misses); each kind is a
               subclass of Skill, DamageSkill or HealSkill, which says what the skill does and makes its action
   cost        the MP it spends
   cooldown    the turns its user must wait after using it before it can again (0: none; 1: every other turn)
   power       a damage skill's blow, in percent of the user's Attack (150: half as hard again)
   pierce      the percent of the target's Defense a damage skill counts as not there (100: all of it)
   sure        a damage skill that never misses
   healBase    a heal's hit points before the user's Attack is counted
   healScale   what a heal adds for each point of Attack, in percent (200: two hit points a point)
   effects     its special effects by id (battle/effects.ts): what it does beyond its numbers, worked out from the
               state of the battle, such as hitting harder on a wounded foe or draining hit points back
   fx          its particles (tactical/particles.js): which effect plays, its colour (empty for the effect's own,
               or the caster's for an arcane burst), its size and how many particles, each in percent

   A file is read as SkillData (normalizeSkill puts it in canonical form), and the registry holds each one as a Skill
   of its kind. A damage skill's file still holds the heal numbers and a heal's the damage ones, so a skill switched
   between kinds in the editor keeps them; toJSON gives back the whole record.

   Pure (no DOM, no Vite), so Node tools, tests and the browser share it. The registry starts with DEFAULT_SKILLS, so
   anything that never loads the files (a test, a Node tool) plays with the stock five; in the browser
   data/skill-files.js swaps in the files, and on the dev server the skill editor (skills.html) writes them back
   through the Hexwright bridge (tools/skills-store.mjs). */

import { HealAction, StrikeAction } from '../battle/actions.ts';
import type { Action } from '../battle/actions.ts';
import { EFFECTS, effectOf } from '../battle/effects.ts';
import type { SpecialEffect } from '../battle/effects.ts';

type SkillKind = 'damage' | 'heal';
type SkillMenu = 'actions' | 'spells';
type FxPreset = 'power' | 'true' | 'pierce' | 'spell' | 'heal' | 'none';
interface SkillFx { preset: FxPreset; tint: string; scale: number; density: number }
/* a skill as its file holds it, in canonical form */
interface SkillData {
  id: string; label: string; menu: SkillMenu; kind: SkillKind; cost: number; cooldown: number; power: number; pierce: number; sure: boolean;
  healBase: number; healScale: number; effects: string[]; fx: SkillFx;
}
type SkillNumber = 'cost' | 'cooldown' | 'power' | 'pierce' | 'healBase' | 'healScale';
type FxNumber = 'scale' | 'density';

const NO_SKILL = 'none';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const KINDS: readonly (readonly [SkillKind, string])[] = [['damage', 'Damage'], ['heal', 'Heal']];
const KIND_IDS: readonly string[] = KINDS.map(([id]) => id);
/* the battle menus a skill can be listed in */
const MENUS: readonly (readonly [SkillMenu, string])[] = [['actions', 'Actions'], ['spells', 'Spells']];
const MENU_IDS: readonly string[] = MENUS.map(([id]) => id);
/* every number a skill has: [key, label, min, max, default, the kind it matters for (null for both)] */
const FIELDS: readonly (readonly [SkillNumber, string, number, number, number, SkillKind | null])[] = [
  ['cost', 'MP cost', 0, 99, 6, null],
  ['cooldown', 'Cooldown', 0, 9, 0, null],
  ['power', 'Power %', 10, 500, 100, 'damage'],
  ['pierce', 'Ignores Def %', 0, 100, 0, 'damage'],
  ['healBase', 'Heal base', 0, 999, 8, 'heal'],
  ['healScale', 'Heal / Atk %', 0, 1000, 200, 'heal']];
/* the particle effects to pick from, [id, label, what it looks like] (tactical/particles.js draws them) */
const FX_PRESETS: readonly (readonly [FxPreset, string, string])[] = [
  ['power', 'Embers', 'embers drawn in, then a shockwave of sparks and grit'],
  ['true', 'Glints', 'gold glints, a thin line along the shot and a star where it lands'],
  ['pierce', 'Shards', 'a cold thread pulled taut, then shards out of the far side'],
  ['spell', 'Arcane', 'motes circling up the caster, then a burst with embers rising'],
  ['heal', 'Spiral', 'motes rising round the healer, then a spiral winding up the ally'],
  ['none', 'None', 'no particles']];
const FX_IDS: readonly string[] = FX_PRESETS.map(([id]) => id);
/* the effect's numbers, in percent: [key, label, min, max, default] */
const FX_FIELDS: readonly (readonly [FxNumber, string, number, number, number])[] = [
  ['scale', 'Size %', 25, 300, 100],
  ['density', 'Particles %', 0, 300, 100]];
const TINT_RE = /^#[0-9a-f]{6}$/;

const clampInt = (v: unknown, lo: number, hi: number, def: number): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const numbers = <K extends string>(fields: readonly (readonly [K, string, number, number, number, ...unknown[]])[], src: Record<string, unknown>) =>
  Object.fromEntries(fields.map(([k, , lo, hi, d]) => [k, clampInt(src[k], lo, hi, d)])) as Record<K, number>;
const DEFAULT_SKILL: Readonly<SkillData> = Object.freeze({
  id: '', label: '', menu: 'actions', kind: 'damage', ...numbers(FIELDS, {}), sure: false, effects: [],
  fx: Object.freeze({ preset: 'none', tint: '', ...numbers(FX_FIELDS, {}) }) });

/* ---------- the skills, by kind ---------- */
abstract class Skill {
  readonly id: string;
  readonly label: string;
  readonly menu: SkillMenu;
  readonly cost: number;
  readonly cooldown: number;
  readonly fx: Readonly<SkillFx>;
  readonly effects: readonly string[];
  abstract readonly kind: SkillKind;
  /* the whole record, the other kind's numbers too */
  readonly #data: Readonly<SkillData>;
  #action: Action | null = null;
  constructor(data: Readonly<SkillData>) {
    this.#data = data;
    this.id = data.id; this.label = data.label; this.menu = data.menu; this.cost = data.cost; this.cooldown = data.cooldown; this.fx = data.fx; this.effects = data.effects;
  }
  /* a few words on what it does, made from its numbers: "2× damage, half Defense" */
  abstract describe(): string;
  protected abstract createAction(): Action;
  /* the skill as the battle plays it; made once for each version of the skill */
  toAction(): Action { return (this.#action ??= Object.freeze(this.createAction())); }
  /* the effects it names that work on its kind */
  protected specialEffects(): SpecialEffect[] { return this.effects.map(effectOf).filter((e): e is SpecialEffect => !!e && e.kinds.includes(this.kind)); }
  /* its effects' names, for describe */
  protected effectLabels(): string[] { return this.specialEffects().map(e => e.label.toLowerCase()); }
  toJSON(): SkillData { return { ...this.#data, effects: [...this.#data.effects], fx: { ...this.#data.fx } }; }
}

/* strikes a foe for power % of the user's Attack, ignoring pierce % of its Defense */
class DamageSkill extends Skill {
  readonly kind = 'damage' as const;
  readonly power: number;
  readonly pierce: number;
  readonly sure: boolean;
  constructor(data: Readonly<SkillData>) {
    super(data);
    this.power = data.power; this.pierce = data.pierce; this.sure = data.sure;
  }
  describe(): string {
    const parts = [];
    if (this.power !== 100) parts.push(`${+(this.power / 100).toFixed(2)}× damage`);
    if (this.pierce >= 100) parts.push('ignores Defense'); else if (this.pierce === 50) parts.push('half Defense'); else if (this.pierce > 0) parts.push(`ignores ${this.pierce}% of Defense`);
    if (this.sure) parts.push('never misses');
    parts.push(...this.effectLabels());
    return parts.join(', ') || 'a plain blow';
  }
  protected createAction(): StrikeAction {
    return new StrikeAction({ id: this.id, label: this.label, menu: this.menu, cost: this.cost, cooldown: this.cooldown, fx: this.fx, note: this.describe(), effects: this.specialEffects(), power: this.power / 100, pierce: this.pierce / 100, sure: this.sure });
  }
}

/* restores an ally's hit points: healBase, and healScale % for each point of the user's Attack */
class HealSkill extends Skill {
  readonly kind = 'heal' as const;
  readonly healBase: number;
  readonly healScale: number;
  constructor(data: Readonly<SkillData>) {
    super(data);
    this.healBase = data.healBase; this.healScale = data.healScale;
  }
  describe(): string { return ['restores HP to an ally', ...this.effectLabels()].join(', '); }
  protected createAction(): HealAction {
    return new HealAction({ id: this.id, label: this.label, menu: this.menu, cost: this.cost, cooldown: this.cooldown, fx: this.fx, note: this.describe(), effects: this.specialEffects(), healBase: this.healBase, healScale: this.healScale / 100 });
  }
}

const SKILL_CLASS: Record<SkillKind, new (data: Readonly<SkillData>) => Skill> = { damage: DamageSkill, heal: HealSkill };

/* a skill in canonical form: known fields only, in a fixed order, every number a whole number within its range and
   anything missing filled from the defaults. A Skill counts as the record it was made from. */
function normalizeSkill(raw: unknown): SkillData {
  const J = (raw instanceof Skill ? raw.toJSON() : raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const f = (J.fx && typeof J.fx === 'object' ? J.fx : {}) as Record<string, unknown>;
  const id = String(J.id ?? '').trim().toLowerCase(), kind = (KIND_IDS.includes(J.kind as string) ? J.kind : DEFAULT_SKILL.kind) as SkillKind;
  const tint = String(f.tint ?? '').trim().toLowerCase(), preset = String(f.preset ?? '').trim().toLowerCase();
  const n = numbers(FIELDS, J), named = Array.isArray(J.effects) ? J.effects.map(e => String(e).trim().toLowerCase()) : [];
  return {
    id, label: String(J.label ?? '').trim().slice(0, 32) || id, menu: (MENU_IDS.includes(J.menu as string) ? J.menu : kind === 'heal' ? 'spells' : 'actions') as SkillMenu, kind,
    cost: n.cost, cooldown: n.cooldown, power: n.power, pierce: n.pierce, sure: J.sure === true, healBase: n.healBase, healScale: n.healScale,
    effects: EFFECTS.map(e => e.id).filter(id => named.includes(id)),
    fx: { preset: (FX_IDS.includes(preset) ? preset : DEFAULT_SKILL.fx.preset) as FxPreset, tint: TINT_RE.test(tint) ? tint : '', ...numbers(FX_FIELDS, f) } };
}
/* a raw skill, normalized, as a Skill of its kind */
function skillFrom(raw: unknown): Skill {
  const data = normalizeSkill(raw);
  Object.freeze(data.fx); Object.freeze(data.effects);
  const skill = new SKILL_CLASS[data.kind](Object.freeze(data));
  Object.freeze(skill); return skill;
}
/* what is wrong with a raw skill, as sentences; empty when it is fine. Values out of range are reported here,
   though normalizeSkill would clamp them, so the editor can say why a number changed. */
function validateSkill(raw: unknown): string[] {
  const errs: string[] = [];
  if (!raw || typeof raw !== 'object') return ['a skill must be an object'];
  const J = raw as Record<string, unknown>;
  if (typeof J.id !== 'string' || !ID_RE.test(J.id) || J.id === NO_SKILL || J.id === 'attack') errs.push('id must be lower-case letters, digits and dashes (up to 48), starting with a letter or digit, and not "none" or "attack"');
  if (J.label != null && typeof J.label !== 'string') errs.push('label must be text');
  if (J.kind != null && !KIND_IDS.includes(J.kind as string)) errs.push(`Kind must be one of ${KIND_IDS.join(', ')}`);
  if (J.menu != null && !MENU_IDS.includes(J.menu as string)) errs.push(`Menu must be one of ${MENU_IDS.join(', ')}`);
  const check = (v: unknown, label: string, lo: number, hi: number) => { if (v == null) return; if (typeof v !== 'number' || !Number.isInteger(v)) errs.push(`${label} must be a whole number`); else if (v < lo || v > hi) errs.push(`${label} must be between ${lo} and ${hi}`); };
  for (const [k, label, lo, hi] of FIELDS) check(J[k], label, lo, hi);
  if (J.sure != null && typeof J.sure !== 'boolean') errs.push('Never misses must be true or false');
  if (J.effects != null) {
    if (!Array.isArray(J.effects)) errs.push('effects must be a list of effect ids');
    else for (const id of J.effects) if (!effectOf(String(id))) errs.push(`there is no effect called "${id}" (${EFFECTS.map(e => e.id).join(', ')})`);
  }
  const f = J.fx as Record<string, unknown> | null | undefined;
  if (f != null) {
    if (typeof f !== 'object') errs.push('fx must be an object');
    else {
      if (f.preset != null && !FX_IDS.includes(f.preset as string)) errs.push(`Effect must be one of ${FX_IDS.join(', ')}`);
      if (f.tint != null && f.tint !== '' && !TINT_RE.test(String(f.tint).toLowerCase())) errs.push('Tint must be empty or a colour like #a0c8ff');
      for (const [k, label, lo, hi] of FX_FIELDS) check(f[k], label, lo, hi);
    }
  }
  return errs;
}
/* the file a skill lives in, relative to the project root, and its text: two-space JSON with a final newline */
const skillPath = (id: string): string => `data/skills/${id}.json`;
const skillText = (skill: unknown): string => JSON.stringify(normalizeSkill(skill), null, 2) + '\n';

/* the stock skills, as data/skills/ ships them */
const DEFAULT_SKILLS: readonly Readonly<SkillData>[] = [
  { id: 'power', label: 'Power Strike', cost: 6, cooldown: 1, power: 150, fx: { preset: 'power' } },
  { id: 'true', label: 'True Strike', cost: 4, sure: true, fx: { preset: 'true' } },
  { id: 'pierce', label: 'Pierce', cost: 5, cooldown: 1, pierce: 100, fx: { preset: 'pierce' } },
  { id: 'spell', label: 'Spell', menu: 'spells', cost: 8, cooldown: 2, power: 200, pierce: 50, fx: { preset: 'spell' } },
  { id: 'heal', label: 'Heal', kind: 'heal', cost: 6, cooldown: 1, fx: { preset: 'heal' } }
].map(s => Object.freeze(normalizeSkill(s)));
const STOCK_ORDER = DEFAULT_SKILLS.map(s => s.id);

/* ---------- the registry: the skills the game plays with ---------- */
const SKILLS = new Map<string, Skill>(), listeners = new Set<() => void>();
/* replace every skill with these */
function setSkills(list: Iterable<unknown>): void {
  SKILLS.clear();
  for (const raw of list) { const s = skillFrom(raw); if (ID_RE.test(s.id) && s.id !== NO_SKILL) SKILLS.set(s.id, s); }
  for (const f of listeners) f();
}
const onSkillsChange = (f: () => void): (() => boolean) => { listeners.add(f); return () => listeners.delete(f); };
/* every skill, the stock ones first in their usual order, then the rest by name */
const rank = (id: string) => { const i = STOCK_ORDER.indexOf(id); return i < 0 ? STOCK_ORDER.length : i; };
const listSkills = (): Skill[] => [...SKILLS.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label));
const getSkill = (id: string): Skill | null => SKILLS.get(id) || null;
setSkills(DEFAULT_SKILLS);

export { DEFAULT_SKILL, DEFAULT_SKILLS, DamageSkill, FIELDS, FX_FIELDS, FX_PRESETS, HealSkill, ID_RE, KINDS, MENUS, NO_SKILL, Skill, getSkill, listSkills, normalizeSkill, onSkillsChange, setSkills, skillFrom, skillPath, skillText, validateSkill };
export type { FxPreset, SkillData, SkillFx, SkillKind, SkillMenu };
