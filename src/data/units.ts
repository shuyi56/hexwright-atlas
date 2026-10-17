/* ================= unit data: the characters and enemies =================
   The roster (characters/) says how everyone looks; the classes (data/classes.ts) say how each kind of fighter
   plays. A unit is one person on a map: its own name, the class it plays as, and any numbers of its own that it
   has in place of its class's (a tougher captain of the guard, say). Each unit is one JSON file under data/units/,
   in characters/ or enemies/, named by its id, which is the id of the sprite it plays as:

     data/units/enemies/goblin.json
     { "id": "goblin", "name": "Goblin", "class": "goblin" }

     data/units/characters/captain.json
     { "id": "captain", "name": "Captain Hale", "class": "knight",
       "overrides": { "stats": { "hp": 70, "range": 2, "pattern": "line" }, "movement": { "move": 4 } } }

   Overrides hold only the numbers that differ, in the class's own sections and ranges; the pattern and the
   abilities (a whole list) can be overridden too. Everything else follows the class, so a change in the class
   editor reaches every unit of that class.

   A file is read as UnitData (normalizeUnit puts it in canonical form). Characters and enemies have the same fields,
   so both are a Unit; the registry holds each as a Character or an Enemy by its group, which also says the side it
   fights on. A Unit carries its class's numbers with its overrides laid over them, so the battle reads stats and
   movement from it without knowing about classes.

   Pure (no DOM, no Vite), so Node tools, tests and the browser share it. In the browser data/unit-files.js loads
   the files into the registry below; on the dev server the unit page (units.html) writes them back through the
   Hexwright bridge (tools/units-store.mjs). A sprite with no file (a custom character, say) plays with
   DEFAULT_UNIT, and so does a unit whose class has no file. */
import { DEFAULT_MOVEMENT, DEFAULT_STATS, FIELDS, ID_RE, SECTIONS, abilitiesOf, clampInt, getClass, objectOf, onClassesChange, patternOf, sectionErrors } from './classes.ts';
import type { AttackPattern, CombatStats, Section, UnitMovement, UnitStats } from './classes.ts';
import type { UnitClass } from './classes.ts';

type UnitGroup = 'characters' | 'enemies';
type Side = 'player' | 'enemy';
/* the numbers a unit has in place of its class's: any of them, none required */
interface UnitOverrides { stats?: Partial<UnitStats>; movement?: Partial<UnitMovement> }
/* a unit as its file holds it, in canonical form; overrides is left out when it has none */
interface UnitData { id: string; name: string; class: string; overrides?: UnitOverrides }

const GROUPS: readonly UnitGroup[] = ['characters', 'enemies'];
const GROUP_LABEL: Readonly<Record<UnitGroup, string>> = { characters: 'Characters', enemies: 'Enemies' };
const DEFAULT_UNIT: Readonly<{ stats: UnitStats; movement: UnitMovement }> = Object.freeze({ stats: DEFAULT_STATS, movement: DEFAULT_MOVEMENT });

/* overrides in canonical form: known numbers clamped into range, in the class's order, then the pattern and the
   abilities; a section with nothing in it is dropped, and so are overrides with nothing in them */
function normalizeOverrides(raw: unknown): UnitOverrides | undefined {
  const J = objectOf(raw), out: UnitOverrides = {};
  for (const sec of SECTIONS) {
    const src = objectOf(J[sec]), o: Record<string, unknown> = {};
    for (const [k, , lo, hi, d] of FIELDS[sec] as readonly (readonly [string, string, number, number, number])[]) if (src[k] != null) o[k] = clampInt(src[k], lo, hi, d);
    if (sec === 'stats') {
      const p = patternOf(src.pattern); if (p) o.pattern = p;
      if (Array.isArray(src.abilities)) o.abilities = abilitiesOf(src);
    }
    if (Object.keys(o).length) (out as Record<string, unknown>)[sec] = o;
  }
  return Object.keys(out).length ? out : undefined;
}
/* a unit in canonical form: id, name, class and any overrides. A file from before classes (stats and movement of
   its own, no class) names the class of its own id, which the conversion to classes gave the same numbers. */
function normalizeUnit(raw: unknown): UnitData {
  const J = objectOf(raw), id = String(J.id ?? '').trim().toLowerCase();
  const cls = String(J.class ?? '').trim().toLowerCase() || id;
  const out: UnitData = { id, name: String(J.name ?? '').trim().slice(0, 40) || String(J.id ?? ''), class: cls };
  const overrides = J.class == null ? undefined : normalizeOverrides(J.overrides);
  if (overrides) out.overrides = overrides;
  return out;
}
/* what is wrong with a raw unit, as sentences; empty when it is fine */
function validateUnit(raw: unknown, group: string = 'characters'): string[] {
  if (!raw || typeof raw !== 'object') return ['a unit must be an object'];
  const J = raw as Record<string, unknown>, errs: string[] = [];
  if (!(GROUPS as readonly string[]).includes(group)) errs.push(`group must be one of ${GROUPS.join(', ')}`);
  if (typeof J.id !== 'string' || !ID_RE.test(J.id)) errs.push('id must be lower-case letters, digits and dashes (up to 48), starting with a letter or digit');
  if (J.name != null && typeof J.name !== 'string') errs.push('name must be text');
  if (typeof J.class !== 'string' || !ID_RE.test(J.class)) errs.push('class must be a class id');
  if (J.overrides != null) {
    if (typeof J.overrides !== 'object' || Array.isArray(J.overrides)) errs.push('overrides must be an object');
    else for (const s of SECTIONS) errs.push(...sectionErrors(s, objectOf((J.overrides as Record<string, unknown>)[s])));
  }
  return errs;
}
/* the file a unit lives in, relative to the project root, and its text: two-space JSON with a final newline */
const unitPath = (group: string, id: string): string => `data/units/${group}/${id}.json`;
const unitText = (unit: unknown): string => JSON.stringify(normalizeUnit(unit), null, 2) + '\n';
/* whether one number (or the pattern, or the abilities) of a unit is its own rather than its class's */
const overrides = (u: UnitData, sec: Section, k: string): boolean => (u.overrides?.[sec] as Record<string, unknown> | undefined)?.[k] !== undefined;
/* the stats and movement a unit plays with: its class's, or the defaults when there is none, with its overrides on top */
function resolve(u: UnitData, cls: UnitClass | null): { stats: UnitStats; movement: UnitMovement } {
  const base = cls || DEFAULT_UNIT, o = u.overrides || {};
  return { stats: { ...base.stats, ...o.stats, abilities: [...(o.stats?.abilities ?? base.stats.abilities)] }, movement: { ...base.movement, ...o.movement } };
}

/* ---------- the units, by group ---------- */
abstract class Unit implements UnitData {
  id: string;
  name: string;
  /* the id of the class it plays as */
  class: string;
  overrides?: UnitOverrides;
  /* its class's numbers with its overrides laid over them */
  stats: UnitStats;
  movement: UnitMovement;
  /* a sprite with no unit file, playing with the defaults */
  readonly fallback: boolean;
  /* the class it names has no file, so it plays with the defaults under its overrides */
  readonly classMissing: boolean;
  abstract readonly group: UnitGroup;
  /* the side it fights on in a battle (battle/state.ts) */
  abstract readonly side: Side;
  constructor(data: UnitData, fallback = false) {
    const cls = getClass(data.class), { stats, movement } = resolve(data, cls);
    this.id = data.id; this.name = data.name; this.class = data.class; if (data.overrides) this.overrides = data.overrides;
    this.stats = stats; this.movement = movement; this.fallback = fallback; this.classMissing = !fallback && !cls;
  }
  toJSON(): UnitData { return normalizeUnit({ id: this.id, name: this.name, class: this.class, overrides: this.overrides && structuredClone(this.overrides) }); }
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

/* a raw unit of this group, normalized, as a Character or an Enemy playing its class as it stands now */
const unitFrom = (group: UnitGroup, raw: unknown): Unit => new UNIT_CLASS[group](normalizeUnit(raw));

/* ---------- the registry: the units the game plays with ---------- */
/* id -> its file, by group; each lookup builds the Unit afresh so it plays the class as it is now */
const UNITS = new Map<string, { group: UnitGroup; data: UnitData }>(), listeners = new Set<() => void>();
const notify = () => { for (const f of listeners) f(); };
/* replace every unit with these: [{ group, unit }] */
function setUnits(entries: Iterable<{ group: UnitGroup; unit: unknown }>): void {
  UNITS.clear();
  for (const { group, unit } of entries) { const data = normalizeUnit(unit); if (data.id && UNIT_CLASS[group]) UNITS.set(data.id, { group, data }); }
  notify();
}
/* a change to a unit file or to any class: either can change how a unit plays */
const onUnitsChange = (f: () => void): (() => boolean) => { listeners.add(f); return () => listeners.delete(f); };
onClassesChange(notify);
const build = (e: { group: UnitGroup; data: UnitData }): Unit => new UNIT_CLASS[e.group](e.data);
/* every unit, characters first, each group in name order */
const listUnits = (): Unit[] => [...UNITS.values()].map(build).sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
const getUnit = (id: string): Unit | null => { const e = UNITS.get(id); return e ? build(e) : null; };
/* how the figure with this sprite plays: its own unit, or the defaults under its sprite id */
const unitFor = (sprite: string): Unit => getUnit(sprite) || new Character({ id: sprite, name: sprite, class: '' }, true);

export { PATTERNS, FIELDS, SECTIONS, MAX_ABILITIES, DEFAULT_PATTERN, ID_RE } from './classes.ts';
export { Character, DEFAULT_UNIT, Enemy, GROUPS, GROUP_LABEL, Unit, getUnit, listUnits, normalizeOverrides, normalizeUnit, onUnitsChange, overrides, resolve, setUnits, unitFor, unitFrom, unitPath, unitText, validateUnit };
export type { AttackPattern, CombatStats, Side, UnitData, UnitGroup, UnitMovement, UnitOverrides, UnitStats };
