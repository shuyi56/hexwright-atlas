/* ================= unit data: what a character or enemy can do =================
   The roster (characters/) says how everyone looks; this says how they play: how much damage they take and deal,
   how much of it their Defense turns aside, how surely they hit (Accuracy) and dodge (Evasion), how often their blows
   are critical (Crit, in percent) and for how much (Crit Damage, a percent of the damage), the MP their abilities
   spend, how many tiles away they can strike, how far they move and how high they jump. Each unit is one JSON file
   under data/units/, in characters/ or enemies/, named by its id, which is the id of the sprite it plays as:

     data/units/enemies/goblin.json
     { "id": "goblin", "name": "Goblin",
       "stats": { "hp": 22, "mp": 0, "attack": 7, "defense": 2, "accuracy": 85, "evasion": 15, "crit": 8, "critDamage": 150, "range": 1, "pattern": "melee", "abilities": [] },
       "movement": { "move": 5, "jump": 2 } }

   How the numbers play in a fight is in src/battle/actions.ts; what each ability does is in data/skills/
   (src/data/skills.ts).

   The attack pattern says which tiles an attack reaches (src/tactical/attack.js): melee, the four tiles beside the
   unit and not the diagonals, whatever its range; line, straight out along the grid in the four directions up to
   its range; ranged, every tile within its range in steps along the grid.

   A file is read as UnitData (normalizeUnit puts it in canonical form). Characters and enemies have the same fields,
   so both are a Unit; the registry holds each as a Character or an Enemy by its group, which also says the side it
   fights on.

   Pure (no DOM, no Vite), so Node tools, tests and the browser share it. In the browser data/unit-files.js loads
   the files into the registry below; on the dev server the unit data page (units.html) writes them back through
   the Hexwright bridge (tools/units-store.mjs). A sprite with no file (a custom character, say) plays with
   DEFAULT_UNIT. */
import { NO_SKILL } from './skills.ts';

type UnitGroup = 'characters' | 'enemies';
type Side = 'player' | 'enemy';
type AttackPattern = 'melee' | 'line' | 'ranged';
/* the numbers a unit fights with, as a blow (battle/actions.ts) reads them */
interface CombatStats { attack: number; defense: number; accuracy: number; evasion: number; crit: number; critDamage: number }
interface UnitStats extends CombatStats { hp: number; mp: number; range: number; pattern: AttackPattern; abilities: string[] }
interface UnitMovement { move: number; jump: number }
/* a unit as its file holds it, in canonical form */
interface UnitData { id: string; name: string; stats: UnitStats; movement: UnitMovement }
type Section = keyof Pick<UnitData, 'stats' | 'movement'>;
type Field<K> = readonly [key: K, label: string, min: number, max: number, def: number];

const GROUPS: readonly UnitGroup[] = ['characters', 'enemies'];
const GROUP_LABEL: Readonly<Record<UnitGroup, string>> = { characters: 'Characters', enemies: 'Enemies' };
/* every number a unit has, by section: [key, label, min, max, default] */
const FIELDS: { readonly stats: readonly Field<Exclude<keyof UnitStats, 'pattern' | 'abilities'>>[]; readonly movement: readonly Field<keyof UnitMovement>[] } = {
  stats: [
    ['hp', 'HP', 1, 999, 30],
    ['mp', 'MP', 0, 999, 0],
    ['attack', 'Attack', 0, 99, 8],
    ['defense', 'Defense', 0, 99, 2],
    ['accuracy', 'Accuracy', 0, 200, 90],
    ['evasion', 'Evasion', 0, 99, 5],
    ['crit', 'Crit %', 0, 100, 5],
    ['critDamage', 'Crit Damage %', 100, 400, 150],
    ['range', 'Range', 1, 8, 1]],
  movement: [
    ['move', 'Move', 1, 12, 5],
    ['jump', 'Jump', 0, 6, 1]] };
const SECTIONS = Object.keys(FIELDS) as Section[];
/* the attack pattern, kept in stats after range: [id, label] */
const PATTERNS: readonly (readonly [AttackPattern, string])[] = [['melee', 'Melee'], ['line', 'Line'], ['ranged', 'Ranged']];
const PATTERN_IDS: readonly string[] = PATTERNS.map(([id]) => id), DEFAULT_PATTERN: AttackPattern = 'melee';
/* the abilities that spend MP, kept in stats after the pattern: the ids of skills in data/skills/ (data/skills.ts),
   up to MAX_ABILITIES, in the order its menus list them. One that names no skill there is left out of its menus; the
   unit data page says so. A file from before units had several holds one as "ability" (or "none"). */
const MAX_ABILITIES = 8;
const abilitiesOf = (stats: Record<string, unknown>): string[] => {
  const raw = Array.isArray(stats.abilities) ? stats.abilities : stats.ability != null ? [stats.ability] : [];
  return [...new Set(raw.map(a => String(a ?? '').trim().toLowerCase()).filter(a => ID_RE.test(a) && a !== NO_SKILL))].slice(0, MAX_ABILITIES);
};
const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

const clampInt = (v: unknown, lo: number, hi: number, def: number): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const numbers = (sec: Section, src: Record<string, unknown>) => Object.fromEntries((FIELDS[sec] as readonly Field<string>[]).map(([k, , lo, hi, d]) => [k, clampInt(src[k], lo, hi, d)]));
const DEFAULT_UNIT: Readonly<UnitData> = Object.freeze({ id: '', name: '', stats: Object.freeze({ ...numbers('stats', {}), pattern: DEFAULT_PATTERN, abilities: Object.freeze([]) as unknown as string[] } as UnitStats), movement: Object.freeze(numbers('movement', {}) as unknown as UnitMovement) });

/* ---------- the units, by group ---------- */
abstract class Unit implements UnitData {
  id: string;
  name: string;
  stats: UnitStats;
  movement: UnitMovement;
  /* a sprite with no unit file, playing with the defaults */
  readonly fallback: boolean;
  abstract readonly group: UnitGroup;
  /* the side it fights on in a battle (battle/state.ts) */
  abstract readonly side: Side;
  constructor({ id, name, stats, movement }: UnitData, fallback = false) {
    this.id = id; this.name = name; this.stats = stats; this.movement = movement; this.fallback = fallback;
  }
  toJSON(): UnitData { return { id: this.id, name: this.name, stats: { ...this.stats, abilities: [...this.stats.abilities] }, movement: { ...this.movement } }; }
}
/* one of the player's people, from data/units/characters/ */
class Character extends Unit {
  readonly group = 'characters' as const;
  readonly side = 'player' as const;
}
/* a foe, from data/units/enemies/ */
class Enemy extends Unit {
  readonly group = 'enemies' as const;
  readonly side = 'enemy' as const;
}
const UNIT_CLASS: Record<UnitGroup, new (data: UnitData, fallback?: boolean) => Unit> = { characters: Character, enemies: Enemy };

/* a unit in canonical form: known fields only, in a fixed order, every number a whole number within its range
   and anything missing filled from the defaults. Characters and enemies have the same fields. */
function normalizeUnit(raw: unknown): UnitData {
  const J = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const section = (sec: Section) => (J[sec] && typeof J[sec] === 'object' ? J[sec] : {}) as Record<string, unknown>;
  const stats = section('stats');
  const pat = String(stats.pattern ?? '').trim().toLowerCase();
  return {
    id: String(J.id ?? '').trim().toLowerCase(), name: String(J.name ?? '').trim().slice(0, 40) || String(J.id ?? ''),
    stats: { ...numbers('stats', stats), pattern: (PATTERN_IDS.includes(pat) ? pat : DEFAULT_PATTERN) as AttackPattern, abilities: abilitiesOf(stats) } as UnitStats,
    movement: numbers('movement', section('movement')) as unknown as UnitMovement };
}
/* a raw unit of this group, normalized, as a Character or an Enemy */
const unitFrom = (group: UnitGroup, raw: unknown): Unit => new UNIT_CLASS[group](normalizeUnit(raw));
/* what is wrong with a raw unit, as sentences; empty when it is fine. Values out of range are reported here,
   though normalizeUnit would clamp them, so an editor can say why a number changed. */
function validateUnit(raw: unknown, group: string = 'characters'): string[] {
  const errs: string[] = [];
  if (!raw || typeof raw !== 'object') return ['a unit must be an object'];
  const J = raw as Record<string, unknown>, sec = (s: Section) => (J[s] ?? {}) as Record<string, unknown>;
  if (!(GROUPS as readonly string[]).includes(group)) errs.push(`group must be one of ${GROUPS.join(', ')}`);
  if (typeof J.id !== 'string' || !ID_RE.test(J.id)) errs.push('id must be lower-case letters, digits and dashes (up to 48), starting with a letter or digit');
  if (J.name != null && typeof J.name !== 'string') errs.push('name must be text');
  const check = (v: unknown, label: string, lo: number, hi: number) => { if (v == null) return; if (typeof v !== 'number' || !Number.isInteger(v)) errs.push(`${label} must be a whole number`); else if (v < lo || v > hi) errs.push(`${label} must be between ${lo} and ${hi}`); };
  for (const s of SECTIONS) for (const [k, label, lo, hi] of FIELDS[s] as readonly Field<string>[]) check(sec(s)[k], label, lo, hi);
  const pat = sec('stats').pattern; if (pat != null && !PATTERN_IDS.includes(pat as string)) errs.push(`Pattern must be one of ${PATTERN_IDS.join(', ')}`);
  const ab = sec('stats').ability; if (ab != null && (typeof ab !== 'string' || !ID_RE.test(ab))) errs.push('Ability must be "none" or a skill id');
  const abs = sec('stats').abilities;
  if (abs != null) {
    if (!Array.isArray(abs)) errs.push('Abilities must be a list of skill ids');
    else { if (abs.some(a => typeof a !== 'string' || !ID_RE.test(a) || a === NO_SKILL)) errs.push('Abilities must be skill ids'); if (abs.length > MAX_ABILITIES) errs.push(`A unit has up to ${MAX_ABILITIES} abilities`); }
  }
  return errs;
}
/* the file a unit lives in, relative to the project root, and its text: two-space JSON with a final newline */
const unitPath = (group: string, id: string): string => `data/units/${group}/${id}.json`;
const unitText = (unit: unknown): string => JSON.stringify(normalizeUnit(unit), null, 2) + '\n';

/* ---------- the registry: the units the game plays with ---------- */
const UNITS = new Map<string, Unit>(), listeners = new Set<() => void>();
/* replace every unit with these: [{ group, unit }] */
function setUnits(entries: Iterable<{ group: UnitGroup; unit: unknown }>): void {
  UNITS.clear();
  for (const { group, unit } of entries) { const u = unitFrom(group, unit); if (u.id) UNITS.set(u.id, u); }
  for (const f of listeners) f();
}
const onUnitsChange = (f: () => void): (() => boolean) => { listeners.add(f); return () => listeners.delete(f); };
/* every unit, characters first, each group in name order */
const listUnits = (): Unit[] => [...UNITS.values()].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
const getUnit = (id: string): Unit | null => UNITS.get(id) || null;
/* how the figure with this sprite plays: its own unit, or the defaults under its sprite id */
const unitFor = (sprite: string): Unit => UNITS.get(sprite) || new Character({ ...DEFAULT_UNIT, id: sprite, name: sprite }, true);

export { Character, DEFAULT_PATTERN, MAX_ABILITIES, DEFAULT_UNIT, Enemy, FIELDS, PATTERNS, GROUPS, GROUP_LABEL, ID_RE, SECTIONS, Unit, getUnit, listUnits, normalizeUnit, onUnitsChange, setUnits, unitFor, unitFrom, unitPath, unitText, validateUnit };
export type { AttackPattern, CombatStats, Side, UnitData, UnitGroup, UnitMovement, UnitStats };
