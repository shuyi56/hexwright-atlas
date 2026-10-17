/* ================= skill data: the abilities that spend MP =================
   What each ability does in a fight and how it looks doing it. A unit names one in its data (stats.ability, see
   data/units.js); battle/abilities.js turns the numbers here into blows. Each skill is one JSON file under
   data/skills/, named by its id:

     data/skills/power.json
     { "id": "power", "label": "Power Strike", "kind": "damage", "cost": 6, "power": 150, "pierce": 0,
       "sure": false, "healBase": 8, "healScale": 200,
       "fx": { "preset": "power", "tint": "", "scale": 100, "density": 100 } }

   kind        damage (strikes a foe) or heal (restores an ally's hit points, and never misses)
   cost        the MP it spends
   power       a damage skill's blow, in percent of the user's Attack (150: half as hard again)
   pierce      the percent of the target's Defense a damage skill counts as not there (100: all of it)
   sure        a damage skill that never misses
   healBase    a heal's hit points before the user's Attack is counted
   healScale   what a heal adds for each point of Attack, in percent (200: two hit points a point)
   fx          its particles (tactical/particles.js): which effect plays, its colour (empty for the effect's own,
               or the caster's for an arcane burst), its size and how many particles, each in percent

   Pure (no DOM, no Vite), so Node tools, tests and the browser share it. The registry starts with DEFAULT_SKILLS, so
   anything that never loads the files (a test, a Node tool) plays with the stock five; in the browser
   data/skill-files.js swaps in the files, and on the dev server the skill editor (skills.html) writes them back
   through the Hexwright bridge (tools/skills-store.mjs). */

const NO_SKILL = 'none';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const KINDS = [['damage', 'Damage'], ['heal', 'Heal']];
const KIND_IDS = KINDS.map(([id]) => id);
/* every number a skill has: [key, label, min, max, default, the kind it matters for (null for both)] */
const FIELDS = [
  ['cost', 'MP cost', 0, 99, 6, null],
  ['power', 'Power %', 10, 500, 100, 'damage'],
  ['pierce', 'Ignores Def %', 0, 100, 0, 'damage'],
  ['healBase', 'Heal base', 0, 999, 8, 'heal'],
  ['healScale', 'Heal / Atk %', 0, 1000, 200, 'heal']];
/* the particle effects to pick from, [id, label, what it looks like] (tactical/particles.js draws them) */
const FX_PRESETS = [
  ['power', 'Embers', 'embers drawn in, then a shockwave of sparks and grit'],
  ['true', 'Glints', 'gold glints, a thin line along the shot and a star where it lands'],
  ['pierce', 'Shards', 'a cold thread pulled taut, then shards out of the far side'],
  ['spell', 'Arcane', 'motes circling up the caster, then a burst with embers rising'],
  ['heal', 'Spiral', 'motes rising round the healer, then a spiral winding up the ally'],
  ['none', 'None', 'no particles']];
const FX_IDS = FX_PRESETS.map(([id]) => id);
/* the effect's numbers, in percent: [key, label, min, max, default] */
const FX_FIELDS = [
  ['scale', 'Size %', 25, 300, 100],
  ['density', 'Particles %', 0, 300, 100]];
const TINT_RE = /^#[0-9a-f]{6}$/;

const clampInt = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const DEFAULT_SKILL = Object.freeze({
  id: '', label: '', kind: 'damage', ...Object.fromEntries(FIELDS.map(([k, , , , d]) => [k, d])), sure: false,
  fx: Object.freeze({ preset: 'none', tint: '', ...Object.fromEntries(FX_FIELDS.map(([k, , , , d]) => [k, d])) }) });

/* a skill in canonical form: known fields only, in a fixed order, every number a whole number within its range and
   anything missing filled from the defaults */
function normalizeSkill(raw) {
  const J = raw && typeof raw === 'object' ? raw : {}, f = J.fx && typeof J.fx === 'object' ? J.fx : {};
  const id = String(J.id ?? '').trim().toLowerCase(), kind = KIND_IDS.includes(J.kind) ? J.kind : DEFAULT_SKILL.kind;
  const tint = String(f.tint ?? '').trim().toLowerCase(), preset = String(f.preset ?? '').trim().toLowerCase();
  const n = Object.fromEntries(FIELDS.map(([k, , lo, hi, d]) => [k, clampInt(J[k], lo, hi, d)]));
  return {
    id, label: String(J.label ?? '').trim().slice(0, 32) || id, kind,
    cost: n.cost, power: n.power, pierce: n.pierce, sure: J.sure === true, healBase: n.healBase, healScale: n.healScale,
    fx: { preset: FX_IDS.includes(preset) ? preset : DEFAULT_SKILL.fx.preset, tint: TINT_RE.test(tint) ? tint : '', ...Object.fromEntries(FX_FIELDS.map(([k, , lo, hi, d]) => [k, clampInt(f[k], lo, hi, d)])) } };
}
/* what is wrong with a raw skill, as sentences; empty when it is fine. Values out of range are reported here,
   though normalizeSkill would clamp them, so the editor can say why a number changed. */
function validateSkill(raw) {
  const errs = [];
  if (!raw || typeof raw !== 'object') return ['a skill must be an object'];
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id) || raw.id === NO_SKILL || raw.id === 'attack') errs.push('id must be lower-case letters, digits and dashes (up to 48), starting with a letter or digit, and not "none" or "attack"');
  if (raw.label != null && typeof raw.label !== 'string') errs.push('label must be text');
  if (raw.kind != null && !KIND_IDS.includes(raw.kind)) errs.push(`Kind must be one of ${KIND_IDS.join(', ')}`);
  const check = (v, label, lo, hi) => { if (v == null) return; if (typeof v !== 'number' || !Number.isInteger(v)) errs.push(`${label} must be a whole number`); else if (v < lo || v > hi) errs.push(`${label} must be between ${lo} and ${hi}`); };
  for (const [k, label, lo, hi] of FIELDS) check(raw[k], label, lo, hi);
  if (raw.sure != null && typeof raw.sure !== 'boolean') errs.push('Never misses must be true or false');
  const f = raw.fx;
  if (f != null) {
    if (typeof f !== 'object') errs.push('fx must be an object');
    else {
      if (f.preset != null && !FX_IDS.includes(f.preset)) errs.push(`Effect must be one of ${FX_IDS.join(', ')}`);
      if (f.tint != null && f.tint !== '' && !TINT_RE.test(String(f.tint).toLowerCase())) errs.push('Tint must be empty or a colour like #a0c8ff');
      for (const [k, label, lo, hi] of FX_FIELDS) check(f[k], label, lo, hi);
    }
  }
  return errs;
}
/* the file a skill lives in, relative to the project root, and its text: two-space JSON with a final newline */
const skillPath = id => `data/skills/${id}.json`;
const skillText = skill => JSON.stringify(normalizeSkill(skill), null, 2) + '\n';

/* the stock skills, as data/skills/ ships them */
const DEFAULT_SKILLS = [
  { id: 'power', label: 'Power Strike', cost: 6, power: 150, fx: { preset: 'power' } },
  { id: 'true', label: 'True Strike', cost: 4, sure: true, fx: { preset: 'true' } },
  { id: 'pierce', label: 'Pierce', cost: 5, pierce: 100, fx: { preset: 'pierce' } },
  { id: 'spell', label: 'Spell', cost: 8, power: 200, pierce: 50, fx: { preset: 'spell' } },
  { id: 'heal', label: 'Heal', kind: 'heal', cost: 6, fx: { preset: 'heal' } }
].map(s => Object.freeze(normalizeSkill(s)));
const STOCK_ORDER = DEFAULT_SKILLS.map(s => s.id);

/* ---------- the registry: the skills the game plays with ---------- */
const SKILLS = new Map(), listeners = new Set();
/* replace every skill with these */
function setSkills(list) {
  SKILLS.clear();
  for (const raw of list) { const s = normalizeSkill(raw); if (ID_RE.test(s.id) && s.id !== NO_SKILL) SKILLS.set(s.id, Object.freeze(s)); }
  for (const f of listeners) f();
}
const onSkillsChange = f => { listeners.add(f); return () => listeners.delete(f); };
/* every skill, the stock ones first in their usual order, then the rest by name */
const rank = id => { const i = STOCK_ORDER.indexOf(id); return i < 0 ? STOCK_ORDER.length : i; };
const listSkills = () => [...SKILLS.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label));
const getSkill = id => SKILLS.get(id) || null;
setSkills(DEFAULT_SKILLS);

export { DEFAULT_SKILL, DEFAULT_SKILLS, FIELDS, FX_FIELDS, FX_PRESETS, ID_RE, KINDS, NO_SKILL, getSkill, listSkills, normalizeSkill, onSkillsChange, setSkills, skillPath, skillText, validateSkill };
