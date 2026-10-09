/* ================= unit data: what a character or enemy can do =================
   The roster (characters/) says how everyone looks; this says how they play: how much damage they take and deal,
   how many tiles away they can strike, how far they move and how high they jump. Each unit is one JSON file under data/units/,
   in characters/ or enemies/, named by its id, which is the id of the sprite it plays as:

     data/units/enemies/goblin.json
     { "id": "goblin", "name": "Goblin", "stats": { "hp": 22, "attack": 7, "range": 1, "pattern": "melee" }, "movement": { "move": 5, "jump": 2 } }

   The attack pattern says which tiles an attack reaches (src/tactical/attack.js): melee, the four tiles beside the
   unit and not the diagonals, whatever its range; line, straight out along the grid in the four directions up to
   its range; ranged, every tile within its range in steps along the grid.

   Pure (no DOM, no Vite), so Node tools, tests and the browser share it. In the browser data/unit-files.js loads
   the files into the registry below; on the dev server the unit data page (units.html) writes them back through
   the Hexwright bridge (tools/units-store.mjs). A sprite with no file (a custom character, say) plays with
   DEFAULT_UNIT. */
const GROUPS = ['characters', 'enemies'];
const GROUP_LABEL = { characters: 'Characters', enemies: 'Enemies' };
/* every number a unit has, by section: [key, label, min, max, default] */
const FIELDS = {
  stats: [
    ['hp', 'HP', 1, 999, 30],
    ['attack', 'Attack', 0, 99, 8],
    ['range', 'Range', 1, 8, 1]],
  movement: [
    ['move', 'Move', 1, 12, 5],
    ['jump', 'Jump', 0, 6, 1]] };
const SECTIONS = Object.keys(FIELDS);
/* the attack pattern, kept in stats after range: [id, label] */
const PATTERNS = [['melee', 'Melee'], ['line', 'Line'], ['ranged', 'Ranged']];
const PATTERN_IDS = PATTERNS.map(([id]) => id), DEFAULT_PATTERN = 'melee';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

const clampInt = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const defaults = sec => Object.fromEntries(FIELDS[sec].map(([k, , , , d]) => [k, d]));
const DEFAULT_UNIT = Object.freeze({ id: '', name: '', stats: Object.freeze({ ...defaults('stats'), pattern: DEFAULT_PATTERN }), movement: Object.freeze(defaults('movement')) });

/* a unit in canonical form: known fields only, in a fixed order, every number a whole number within its range
   and anything missing filled from the defaults. Characters and enemies have the same fields. */
function normalizeUnit(raw) {
  const J = raw && typeof raw === 'object' ? raw : {};
  const out = { id: String(J.id ?? '').trim().toLowerCase(), name: String(J.name ?? '').trim().slice(0, 40) || String(J.id ?? '') };
  for (const sec of SECTIONS) {
    const src = J[sec] && typeof J[sec] === 'object' ? J[sec] : {};
    out[sec] = Object.fromEntries(FIELDS[sec].map(([k, , lo, hi, d]) => [k, clampInt(src[k], lo, hi, d)]));
  }
  const pat = String(J.stats?.pattern ?? '').trim().toLowerCase();
  out.stats.pattern = PATTERN_IDS.includes(pat) ? pat : DEFAULT_PATTERN;
  return out;
}
/* what is wrong with a raw unit, as sentences; empty when it is fine. Values out of range are reported here,
   though normalizeUnit would clamp them, so an editor can say why a number changed. */
function validateUnit(raw, group = 'characters') {
  const errs = [];
  if (!raw || typeof raw !== 'object') return ['a unit must be an object'];
  if (!GROUPS.includes(group)) errs.push(`group must be one of ${GROUPS.join(', ')}`);
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) errs.push('id must be lower-case letters, digits and dashes (up to 48), starting with a letter or digit');
  if (raw.name != null && typeof raw.name !== 'string') errs.push('name must be text');
  const check = (v, label, lo, hi) => { if (v == null) return; if (typeof v !== 'number' || !Number.isInteger(v)) errs.push(`${label} must be a whole number`); else if (v < lo || v > hi) errs.push(`${label} must be between ${lo} and ${hi}`); };
  for (const sec of SECTIONS) for (const [k, label, lo, hi] of FIELDS[sec]) check(raw[sec]?.[k], label, lo, hi);
  const pat = raw.stats?.pattern; if (pat != null && !PATTERN_IDS.includes(pat)) errs.push(`Pattern must be one of ${PATTERN_IDS.join(', ')}`);
  return errs;
}
/* the file a unit lives in, relative to the project root, and its text: two-space JSON with a final newline */
const unitPath = (group, id) => `data/units/${group}/${id}.json`;
const unitText = unit => JSON.stringify(normalizeUnit(unit), null, 2) + '\n';

/* ---------- the registry: the units the game plays with ---------- */
const UNITS = new Map(), listeners = new Set();
/* replace every unit with these: [{ group, unit }] */
function setUnits(entries) {
  UNITS.clear();
  for (const { group, unit } of entries) { const u = normalizeUnit(unit); if (u.id) UNITS.set(u.id, { ...u, group }); }
  for (const f of listeners) f();
}
const onUnitsChange = f => { listeners.add(f); return () => listeners.delete(f); };
/* every unit, characters first, each group in name order */
const listUnits = () => [...UNITS.values()].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
const getUnit = id => UNITS.get(id) || null;
/* how the figure with this sprite plays: its own unit, or the defaults under its sprite id */
const unitFor = sprite => UNITS.get(sprite) || { ...DEFAULT_UNIT, id: sprite, name: sprite, group: 'characters', fallback: true };

export { DEFAULT_PATTERN, DEFAULT_UNIT, FIELDS, PATTERNS, GROUPS, GROUP_LABEL, ID_RE, SECTIONS, getUnit, listUnits, normalizeUnit, onUnitsChange, setUnits, unitFor, unitPath, unitText, validateUnit };
