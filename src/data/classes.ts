/* ================= class data: a job a playable character takes =================
   A class is a job a character made in the character maker can take: Knight, Archer, Dragoon, Black Mage, White
   Mage, Summoner or Valkyrie. It is the outfit the character wears over its own body (the clothes, hat and gear,
   and their colours, out of the character maker's choices in characters/choices.js) and the numbers it fights
   with: how much damage it takes and deals, how much of it its Defense turns aside, how surely it hits (Accuracy)
   and dodges (Evasion), how often its blows are critical (Crit, in percent) and for how much (Crit Damage, a
   percent of the damage), the MP its abilities spend, how many tiles away it can strike and in what pattern, the
   abilities it has, how far it moves and how high it jumps. The NPCs of the roster (data/units.ts) carry the same
   stats and movement sections of their own and take no class. Each class is one JSON file under data/classes/,
   named by its id:

     data/classes/knight.json
     { "id": "knight", "name": "Knight", "outfit": { "top": "plate", …, "colours": { … } },
       "stats": { "hp": 38, "mp": 6, "attack": 9, "defense": 6, "accuracy": 90, "evasion": 5, "crit": 5, "critDamage": 150, "range": 1, "pattern": "melee", "abilities": ["power"] },
       "movement": { "move": 3, "jump": 1 } }

   How the numbers play in a fight is in src/battle/actions.ts; what each ability does is in data/skills/
   (src/data/skills.ts).

   The attack pattern says which tiles an attack reaches (src/tactical/attack.js): melee, the four tiles beside the
   unit and not the diagonals, whatever its range; line, straight out along the grid in the four directions up to
   its range; ranged, every tile within its range in steps along the grid.

   Pure (no DOM, no Vite), so Node tools, tests and the browser share it. In the browser data/class-files.js loads
   the files into the registry below; on the dev server the class editor (classes.html) writes them back through
   the Hexwright bridge (tools/classes-store.mjs). */
import { NO_SKILL } from './skills.ts';
import { OUTFIT_KEYS, cleanOutfit } from '../characters/choices.js';

type AttackPattern = 'melee' | 'line' | 'ranged';
/* the numbers a unit fights with, as a blow (battle/actions.ts) reads them */
interface CombatStats { attack: number; defense: number; accuracy: number; evasion: number; crit: number; critDamage: number }
interface UnitStats extends CombatStats { hp: number; mp: number; range: number; pattern: AttackPattern; abilities: string[] }
interface UnitMovement { move: number; jump: number }
/* what a class wears: a choice for each outfit key of the character maker, and a colour for each outfit material */
type Outfit = Record<string, string> & { colours: Record<string, string> };
/* a class as its file holds it, in canonical form */
interface ClassData { id: string; name: string; outfit: Outfit; stats: UnitStats; movement: UnitMovement }
type Section = 'stats' | 'movement';
type NumberKey = Exclude<keyof UnitStats, 'pattern' | 'abilities'> | keyof UnitMovement;
type Field<K> = readonly [key: K, label: string, min: number, max: number, def: number];

/* every number a class has, by section: [key, label, min, max, default] */
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
const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
/* the abilities that spend MP, kept in stats after the pattern: the ids of skills in data/skills/ (data/skills.ts),
   up to MAX_ABILITIES, in the order its menus list them. One that names no skill there is left out of its menus; the
   class editor says so. A file from before units had several holds one as "ability" (or "none"). */
const MAX_ABILITIES = 8;
const abilitiesOf = (stats: Record<string, unknown>): string[] => {
  const raw = Array.isArray(stats.abilities) ? stats.abilities : stats.ability != null ? [stats.ability] : [];
  return [...new Set(raw.map(a => String(a ?? '').trim().toLowerCase()).filter(a => ID_RE.test(a) && a !== NO_SKILL))].slice(0, MAX_ABILITIES);
};
const patternOf = (v: unknown): AttackPattern | null => { const p = String(v ?? '').trim().toLowerCase(); return PATTERN_IDS.includes(p) ? p as AttackPattern : null; };

const clampInt = (v: unknown, lo: number, hi: number, def: number): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const numbers = (sec: Section, src: Record<string, unknown>) => Object.fromEntries((FIELDS[sec] as readonly Field<string>[]).map(([k, , lo, hi, d]) => [k, clampInt(src[k], lo, hi, d)]));
/* the field of a number by its key, in whichever section it is */
const fieldOf = (sec: Section, k: string): Field<string> | undefined => (FIELDS[sec] as readonly Field<string>[]).find(f => f[0] === k);
const objectOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
const DEFAULT_STATS: Readonly<UnitStats> = Object.freeze({ ...numbers('stats', {}), pattern: DEFAULT_PATTERN, abilities: Object.freeze([]) as unknown as string[] } as UnitStats);
const DEFAULT_MOVEMENT: Readonly<UnitMovement> = Object.freeze(numbers('movement', {}) as unknown as UnitMovement);
/* the outfit a new one starts from, and one whose file has none wears: the character maker's defaults */
const DEFAULT_OUTFIT = (): Outfit => cleanOutfit({}) as Outfit;
const DEFAULT_CLASS: Readonly<ClassData> = Object.freeze({ id: '', name: '', outfit: Object.freeze(DEFAULT_OUTFIT()), stats: DEFAULT_STATS, movement: DEFAULT_MOVEMENT });

/* a class's stats and movement in canonical form, from raw sections: shared with the per-character changes
   (data/units.ts), which are checked number by number the same way */
const statsOf = (stats: Record<string, unknown>): UnitStats => ({ ...numbers('stats', stats), pattern: patternOf(stats.pattern) || DEFAULT_PATTERN, abilities: abilitiesOf(stats) } as UnitStats);
const movementOf = (mv: Record<string, unknown>): UnitMovement => numbers('movement', mv) as unknown as UnitMovement;

/* ---------- a class ---------- */
class UnitClass implements ClassData {
  id: string;
  name: string;
  outfit: Outfit;
  stats: UnitStats;
  movement: UnitMovement;
  constructor({ id, name, outfit, stats, movement }: ClassData) { this.id = id; this.name = name; this.outfit = outfit; this.stats = stats; this.movement = movement; }
  toJSON(): ClassData { return { id: this.id, name: this.name, outfit: structuredClone(this.outfit), stats: { ...this.stats, abilities: [...this.stats.abilities] }, movement: { ...this.movement } }; }
}

/* a class in canonical form: known fields only, in a fixed order, every number a whole number within its range and
   anything missing filled from the defaults, the outfit too; an outfit is cleaned the way the character maker cleans a spec. */
function normalizeClass(raw: unknown): ClassData {
  const J = objectOf(raw), id = String(J.id ?? '').trim().toLowerCase();
  return { id, name: String(J.name ?? '').trim().slice(0, 40) || String(J.id ?? ''), outfit: cleanOutfit(J.outfit && typeof J.outfit === 'object' ? J.outfit : {}) as Outfit,
    stats: statsOf(objectOf(J.stats)), movement: movementOf(objectOf(J.movement)) };
}
/* what is wrong with one number, or with the pattern or abilities, of a stats or movement section, as sentences */
function sectionErrors(sec: Section, src: Record<string, unknown>): string[] {
  const errs: string[] = [];
  for (const [k, v] of Object.entries(src)) {
    const f = fieldOf(sec, k); if (!f || v == null) continue;
    const [, label, lo, hi] = f;
    if (typeof v !== 'number' || !Number.isInteger(v)) errs.push(`${label} must be a whole number`); else if (v < lo || v > hi) errs.push(`${label} must be between ${lo} and ${hi}`);
  }
  if (sec !== 'stats') return errs;
  if (src.pattern != null && !patternOf(src.pattern)) errs.push(`Pattern must be one of ${PATTERN_IDS.join(', ')}`);
  if (src.ability != null && (typeof src.ability !== 'string' || !ID_RE.test(src.ability))) errs.push('Ability must be "none" or a skill id');
  const abs = src.abilities;
  if (abs != null) {
    if (!Array.isArray(abs)) errs.push('Abilities must be a list of skill ids');
    else { if (abs.some(a => typeof a !== 'string' || !ID_RE.test(a) || a === NO_SKILL)) errs.push('Abilities must be skill ids'); if (abs.length > MAX_ABILITIES) errs.push(`A unit has up to ${MAX_ABILITIES} abilities`); }
  }
  return errs;
}
/* what is wrong with a raw class, as sentences; empty when it is fine. Values out of range are reported here,
   though normalizeClass would clamp them, so an editor can say why a number changed. */
function validateClass(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return ['a class must be an object'];
  const J = raw as Record<string, unknown>, errs: string[] = [];
  if (typeof J.id !== 'string' || !ID_RE.test(J.id)) errs.push('id must be lower-case letters, digits and dashes (up to 48), starting with a letter or digit');
  if (J.name != null && typeof J.name !== 'string') errs.push('name must be text');
  if (J.outfit != null && (typeof J.outfit !== 'object' || Array.isArray(J.outfit))) errs.push('outfit must be an object');
  else if (J.outfit) for (const k of Object.keys(J.outfit)) if (k !== 'colours' && !OUTFIT_KEYS.includes(k)) errs.push(`the outfit has no choice called “${k}”`);
  for (const s of SECTIONS) errs.push(...sectionErrors(s, objectOf(J[s])));
  return errs;
}
/* the file a class lives in, relative to the project root, and its text: two-space JSON with a final newline */
const classPath = (id: string): string => `data/classes/${id}.json`;
const classText = (cls: unknown): string => JSON.stringify(normalizeClass(cls), null, 2) + '\n';

/* ---------- the registry: the classes the game plays with ---------- */
const CLASSES = new Map<string, UnitClass>(), listeners = new Set<() => void>();
/* replace every class with these raw classes */
function setClasses(list: Iterable<unknown>): void {
  CLASSES.clear();
  for (const raw of list) { const c = new UnitClass(normalizeClass(raw)); if (c.id) CLASSES.set(c.id, c); }
  for (const f of listeners) f();
}
const onClassesChange = (f: () => void): (() => boolean) => { listeners.add(f); return () => listeners.delete(f); };
/* every class, in name order */
const listClasses = (): UnitClass[] => [...CLASSES.values()].sort((a, b) => a.name.localeCompare(b.name));
const getClass = (id: string): UnitClass | null => CLASSES.get(id) || null;

export { DEFAULT_OUTFIT, DEFAULT_CLASS, DEFAULT_MOVEMENT, DEFAULT_PATTERN, DEFAULT_STATS, FIELDS, ID_RE, MAX_ABILITIES, PATTERNS, SECTIONS, UnitClass, classPath, classText, clampInt, fieldOf, getClass, listClasses, movementOf, normalizeClass, objectOf, onClassesChange, patternOf, abilitiesOf, sectionErrors, setClasses, statsOf, validateClass };
export type { Outfit, AttackPattern, ClassData, CombatStats, NumberKey, Section, UnitMovement, UnitStats };
