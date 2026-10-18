/* ================= units: who fights, and with what numbers =================
   Everyone who can stand on a map is one of two kinds:

   - A playable character, made in the character maker (characters/library.js). It names a class
     (data/classes.ts): one of the jobs, such as Knight or Black Mage. It wears that class's outfit over its own
     body and fights with the class's numbers. The library hands them to the registry below with usePlayables.
   - An NPC: a figure of the roster (characters/), drawn by hand: the townsfolk, the elves, the jobs and the
     enemies. It keeps its own look and its own numbers, in the same stats and movement sections a class has. Each
     is one JSON file under data/npcs/, in allies/ or enemies/ by the side it fights on, named by its id, which is
     the id of its sprite:

       data/npcs/enemies/goblin.json
       { "id": "goblin", "name": "Goblin",
         "stats": { "hp": 22, "mp": 0, "attack": 7, "defense": 2, "accuracy": 85, "evasion": 15, "crit": 8, "critDamage": 150, "range": 1, "pattern": "melee", "abilities": [] },
         "movement": { "move": 5, "jump": 2 } }

   A class change reaches every playable character of that class. The registry holds each unit as a Character (the
   player's side) or an Enemy, both a Unit carrying its numbers, so the battle reads stats and movement from it
   without knowing about classes.

   Pure (no DOM, no Vite), so Node tools, tests and the browser share it. In the browser data/unit-files.js loads
   the NPC files into the registry; on the dev server the class editor (classes.html) writes them back through the
   Hexwright bridge (tools/npcs-store.mjs). A sprite that is neither (a made character with no class, say) plays
   with DEFAULT_UNIT, and so does a playable character whose class has no file. */
import { DEFAULT_MOVEMENT, DEFAULT_STATS, ID_RE, SECTIONS, getClass, movementOf, objectOf, onClassesChange, sectionErrors, statsOf } from './classes.ts';
import type { AttackPattern, CombatStats, UnitMovement, UnitStats } from './classes.ts';

type UnitGroup = 'allies' | 'enemies';
type Side = 'player' | 'enemy';
/* an NPC as its file holds it, in canonical form */
interface UnitData { id: string; name: string; stats: UnitStats; movement: UnitMovement }

const GROUPS: readonly UnitGroup[] = ['allies', 'enemies'];
const GROUP_LABEL: Readonly<Record<UnitGroup, string>> = { allies: 'Allies', enemies: 'Enemies' };
const DEFAULT_UNIT: Readonly<{ stats: UnitStats; movement: UnitMovement }> = Object.freeze({ stats: DEFAULT_STATS, movement: DEFAULT_MOVEMENT });

/* an NPC in canonical form: id, name, stats and movement, every number a whole number within its range and anything
   missing filled from the defaults, the way a class is */
function normalizeUnit(raw: unknown): UnitData {
  const J = objectOf(raw), id = String(J.id ?? '').trim().toLowerCase();
  return { id, name: String(J.name ?? '').trim().slice(0, 40) || String(J.id ?? ''), stats: statsOf(objectOf(J.stats)), movement: movementOf(objectOf(J.movement)) };
}
/* what is wrong with a raw NPC, as sentences; empty when it is fine */
function validateUnit(raw: unknown, group: string = 'allies'): string[] {
  if (!raw || typeof raw !== 'object') return ['a unit must be an object'];
  const J = raw as Record<string, unknown>, errs: string[] = [];
  if (!(GROUPS as readonly string[]).includes(group)) errs.push(`group must be one of ${GROUPS.join(', ')}`);
  if (typeof J.id !== 'string' || !ID_RE.test(J.id)) errs.push('id must be lower-case letters, digits and dashes (up to 48), starting with a letter or digit');
  if (J.name != null && typeof J.name !== 'string') errs.push('name must be text');
  for (const s of SECTIONS) errs.push(...sectionErrors(s, objectOf(J[s])));
  return errs;
}
/* the file an NPC lives in, relative to the project root, and its text: two-space JSON with a final newline */
const unitPath = (group: string, id: string): string => `data/npcs/${group}/${id}.json`;
const unitText = (unit: unknown): string => JSON.stringify(normalizeUnit(unit), null, 2) + '\n';

/* ---------- the units, by side ---------- */
abstract class Unit {
  id: string;
  name: string;
  /* the id of the class a playable character plays as; '' for an NPC, which has numbers of its own */
  class: string;
  stats: UnitStats;
  movement: UnitMovement;
  /* made in the character maker, rather than an NPC of the roster */
  readonly playable: boolean;
  /* a sprite with neither an NPC file nor a class, playing with the defaults */
  readonly fallback: boolean;
  /* a playable character whose class has no file, so it plays with the defaults */
  readonly classMissing: boolean;
  abstract readonly group: UnitGroup;
  /* the side it fights on in a battle (battle/state.ts) */
  abstract readonly side: Side;
  constructor({ id, name, class: cls = '', stats, movement }: { id: string; name: string; class?: string; stats?: UnitStats; movement?: UnitMovement },
    { playable = false, fallback = false } = {}) {
    const found = cls ? getClass(cls) : null, base = stats && movement ? { stats, movement } : found || DEFAULT_UNIT;
    this.id = id; this.name = name; this.class = cls;
    this.stats = { ...base.stats, abilities: [...base.stats.abilities] }; this.movement = { ...base.movement };
    this.playable = playable; this.fallback = fallback; this.classMissing = !!cls && !found;
  }
  /* an NPC as its file holds it */
  toJSON(): UnitData { return normalizeUnit({ id: this.id, name: this.name, stats: this.stats, movement: this.movement }); }
}
/* one who fights on the player's side: an allied NPC, or a playable character */
class Character extends Unit {
  readonly group = 'allies' as const;
  readonly side = 'player' as const;
}
/* a foe, from data/npcs/enemies/ */
class Enemy extends Unit {
  readonly group = 'enemies' as const;
  readonly side = 'enemy' as const;
}
const UNIT_CLASS: Record<UnitGroup, typeof Character | typeof Enemy> = { allies: Character, enemies: Enemy };

/* a raw NPC of this group, normalized, as a Character or an Enemy */
const unitFrom = (group: UnitGroup, raw: unknown): Unit => new UNIT_CLASS[group](normalizeUnit(raw));

/* ---------- the registry: the units the game plays with ---------- */
/* NPC id -> its file, by group; each lookup builds the Unit afresh, so a change to one never reaches the file */
const UNITS = new Map<string, { group: UnitGroup; data: UnitData }>(), listeners = new Set<() => void>();
const notify = () => { for (const f of listeners) f(); };
/* replace every NPC with these: [{ group, unit }] */
function setUnits(entries: Iterable<{ group: UnitGroup; unit: unknown }>): void {
  UNITS.clear();
  for (const { group, unit } of entries) { const data = normalizeUnit(unit); if (data.id && UNIT_CLASS[group]) UNITS.set(data.id, { group, data }); }
  notify();
}
/* the playable characters, as the character library hands them over: each one's id, name and class ('' for none) */
type Playable = { id: string; name: string; class: string };
interface PlayableSource { get(id: string): Playable | null; list(): Playable[] }
let playables: PlayableSource = { get: () => null, list: () => [] };
const usePlayables = (src: PlayableSource): void => { playables = src; notify(); };
/* tell the registry the playable characters changed (the library does, on a save or a delete) */
const playablesChanged = notify;
const playableUnit = (p: Playable): Unit => new Character({ id: p.id, name: p.name, class: p.class }, { playable: true, fallback: !p.class });
/* a change to an NPC file, to the playable characters, or to any class: each can change how a unit plays */
const onUnitsChange = (f: () => void): (() => boolean) => { listeners.add(f); return () => listeners.delete(f); };
onClassesChange(notify);
const build = (e: { group: UnitGroup; data: UnitData }): Unit => new UNIT_CLASS[e.group](e.data);
/* every unit that fights with numbers of its own or of a class: the NPCs and the playable characters with a class, allies first, each group in name order */
const listUnits = (): Unit[] => [...[...UNITS.values()].map(build), ...playables.list().filter(p => p.class).map(playableUnit)]
  .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
const getUnit = (id: string): Unit | null => { const e = UNITS.get(id); return e ? build(e) : null; };
/* how the figure with this sprite plays: an NPC's own numbers, a playable character's class, or the defaults */
function unitFor(sprite: string): Unit {
  const npc = getUnit(sprite); if (npc) return npc;
  const p = playables.get(sprite);
  return p ? playableUnit(p) : new Character({ id: sprite, name: sprite }, { fallback: true });
}

export { PATTERNS, FIELDS, SECTIONS, MAX_ABILITIES, DEFAULT_PATTERN, ID_RE } from './classes.ts';
export { Character, DEFAULT_UNIT, Enemy, GROUPS, GROUP_LABEL, Unit, getUnit, listUnits, normalizeUnit, onUnitsChange, playablesChanged, setUnits, unitFor, unitFrom, unitPath, unitText, usePlayables, validateUnit };
export type { AttackPattern, CombatStats, Playable, PlayableSource, Side, UnitData, UnitGroup, UnitMovement, UnitStats };
