import { BANDANA, BEARD, CAPELET, CIRCLET, COWL, COWL_POINT, FEATHER_CAP, KETTLE_HELM, STRAW_HAT, WIZARD_HAT } from './hats.js';
import { BOW, BUCKLER, DAGGER, HAIR_BRAID, HAIR_BUN, HAIR_LONG, HAIR_PONYTAIL, HAIR_SHORT, HAIR_TOUSLED, KITE, SKIN, SWORD, recolor, staff } from './parts.js';

/* ================= character sprites: characters made from choices =================
   A spec is a character described by a handful of choices (a build, clothes, sleeves, hair, a hat, a beard, a
   cape, a satchel, what is held, a shield) and a colour for each material. fromSpec turns it into a character
   drawn exactly like the jobs in roster.js: the clothes become an outfit cut by body.js, the hats and gear are the
   hand-drawn parts in hats.js and parts.js, the colours its palette. The townsfolk are specs (townsfolk.js), and
   the character maker builds new ones. Specs are plain JSON, so a map can carry the ones it uses. */

/* each choice: its options as [value, label], the first being the default */
const CHOICES = {
  build: [['standard', 'Standard'], ['slim', 'Slim'], ['stocky', 'Stocky'], ['tall', 'Tall']],
  clothes: [['vest', 'Shirt and vest'], ['tunic', 'Tunic'], ['overalls', 'Overalls'], ['plate', 'Breastplate'], ['robe', 'Long coat and sash'], ['gown', 'Gown to the floor']],
  sleeves: [['cloth', 'Same cloth'], ['second', 'Second colour']],
  cut: [['plain', 'Plain'], ['bell', 'Bell']],
  neckline: [['high', 'High'], ['square', 'Square']],
  rope: [['none', 'None'], ['rope', 'Rope belt']],
  hair: [['short', 'Short'], ['tousled', 'Tousled'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['bun', 'Low bun'], ['braid', 'Braid']],
  hat: [['none', 'None'], ['straw', 'Straw hat'], ['kettle', 'Kettle helm'], ['circlet', 'Circlet'], ['cowl', 'Cowl'], ['cap', 'Feathered cap'], ['bandana', 'Bandana'], ['wizard', 'Wizard hat']],
  beard: [['none', 'None'], ['full', 'Full beard']],
  cape: [['none', 'None'], ['cape', 'Cape'], ['dagged', 'Dagged cape']],
  satchel: [['none', 'None'], ['satchel', 'Satchel'], ['cross', 'Satchel with a cross']],
  held: [['none', 'Nothing'], ['sword', 'Sword'], ['dagger', 'Dagger'], ['daggers', 'Two daggers'], ['spear', 'Spear'], ['staff', 'Staff'], ['bow', 'Bow']],
  shield: [['none', 'None'], ['kite', 'Kite shield'], ['buckler', 'Buckler']] };
/* the choices that only mean something with some clothes or gear: the neckline and the rope belt on a gown, a
   shield in the hand a second dagger would take */
const APPLIES = {
  neckline: s => s.clothes === 'gown',
  rope: s => s.clothes === 'gown',
  shield: s => s.held !== 'daggers' };
/* every colour a spec sets: [key, the material letter it paints, label] */
const COLOURS = [
  ['skin', 'K', 'Skin'], ['hair', 'H', 'Hair'], ['cloth', 'A', 'Cloth'], ['shirt', 'B', 'Shirt'], ['second', 'D', 'Second cloth'],
  ['trim', 'C', 'Trim and cuffs'], ['belt', 'L', 'Belt, straps and rope'], ['gold', 'G', 'Buckles and gold'], ['legs', 'P', 'Legs'],
  ['boots', 'O', 'Boots and shoes'], ['hat', 'X', 'Hat or hood'], ['accent', 'R', 'Band, feather and cross'], ['steel', 'S', 'Steel'],
  ['bag', 'U', 'Bag'], ['shield', 'N', 'Shield'], ['wood', 'T', 'Wood'], ['string', 'F', 'Bowstring'], ['jewel', 'J', 'Jewel'], ['cape', 'V', 'Cape']];
const DEFAULT_COLOURS = {
  skin: SKIN, hair: '#8a6a48', cloth: '#e6d8b6', shirt: '#efe3c4', second: '#8fa462', trim: '#d3c199', belt: '#7a5a3a', gold: '#c9a24f',
  legs: '#a68a62', boots: '#7a5a3a', hat: '#dfc070', accent: '#b8664a', steel: '#c4c8c6', bag: '#b89a70', shield: '#6f8faa',
  wood: '#8a6238', string: '#efe6d2', jewel: '#b8443a', cape: '#a6533b' };
/* colours the character maker offers as swatches: the tile set's own (render/palette.js, tiles/terrain.js) and the
   roster's skins and hair */
const SWATCHES = [
  '#ecc39a', '#d9a77c', '#eccaa6', '#b98a66', '#8a6a48', '#4f3c2e', '#e0d6bc', '#dfc070', '#b4502c',
  '#efe3c4', '#e6d8b6', '#f0e6cb', '#d3c199', '#c9a24f', '#b89a70', '#9a7650', '#7a5a3a', '#5c4231',
  '#a6533b', '#b8483a', '#a84a3c', '#c27458', '#b0614a', '#8fa462', '#6c8549', '#356a52', '#a6b878',
  '#7f9cb4', '#6f8faa', '#8297b0', '#56688f', '#66727e', '#a898b8', '#8a7a9a', '#c4c8c6', '#3f3a3d'];

const HAIRS = { short: HAIR_SHORT, tousled: HAIR_TOUSLED, long: HAIR_LONG, ponytail: HAIR_PONYTAIL, bun: HAIR_BUN, braid: HAIR_BRAID };
/* a hat for each view; the cowl brings its capelet, and from behind its point */
const HATS = {
  straw: { front: { hat: STRAW_HAT }, back: { hat: STRAW_HAT } },
  kettle: { front: { hat: KETTLE_HELM }, back: { hat: KETTLE_HELM } },
  circlet: { front: { hat: CIRCLET.front }, back: { hat: CIRCLET.back } },
  cowl: { front: { hat: COWL.front, mantle: CAPELET.front }, back: { hat: COWL.back, mantle: [CAPELET.back, COWL_POINT] } },
  cap: { front: { hat: FEATHER_CAP.front }, back: { hat: FEATHER_CAP.back } },
  bandana: { front: { hat: BANDANA.front }, back: { hat: BANDANA.back } },
  wizard: { front: { hat: WIZARD_HAT.front }, back: { hat: WIZARD_HAT.back } } };
/* what can be held: a staff or spear is carried steady in its hand */
const SPEAR = staff(['..S..', '.SSS.', '.SSS.', '..S..', '.GGG.'], 26, { lean: 5, behind: true });
const STAFF = staff(['T...T', 'TT.TT', '.TTT.', '..T..', '..T..'], 19);
const HELD = { sword: SWORD, dagger: DAGGER, daggers: DAGGER, spear: SPEAR, staff: STAFF, bow: BOW };
/* shields take their own colour (N), apart from a satchel's bag (U) */
const SHIELDS = { kite: recolor2(KITE, { U: 'N' }), buckler: recolor2(BUCKLER, { U: 'N' }) };
function recolor2(pair, map) { return { front: recolor(pair.front, map), back: recolor(pair.back, map) }; }

const HEX = /^#[0-9a-f]{6}$/i, ID = /^[a-z0-9-]{1,40}$/;
const newId = () => 'custom-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
/* a spec from anything (a saved library, a map, the API): every choice one of its options, every colour #rrggbb,
   anything missing or wrong taken from the defaults */
function cleanSpec(J) {
  const src = J && typeof J === 'object' ? J : {}, s = { id: typeof src.id === 'string' && ID.test(src.id) ? src.id : newId(), name: String(src.name || 'New character').trim().slice(0, 40) || 'New character' };
  for (const [k, opts] of Object.entries(CHOICES)) s[k] = opts.some(([v]) => v === src[k]) ? src[k] : opts[0][0];
  s.colours = {};
  for (const [key] of COLOURS) { const c = src.colours && src.colours[key]; s.colours[key] = typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : DEFAULT_COLOURS[key]; }
  return s;
}
const label = (k, v) => (CHOICES[k].find(o => o[0] === v) || [v, v])[1];
/* a line about a spec, from its choices */
function describe(s) {
  const bits = [`${label('build', s.build).toLowerCase()} build`, label('clothes', s.clothes).toLowerCase(), `${label('hair', s.hair).toLowerCase()} hair`];
  for (const k of ['hat', 'beard', 'cape', 'satchel', 'held']) if (s[k] !== 'none' && (!APPLIES[k] || APPLIES[k](s))) bits.push(label(k, s[k]).toLowerCase());
  if (s.shield !== 'none' && APPLIES.shield(s)) bits.push(label('shield', s.shield).toLowerCase());
  const t = bits.join(', ');
  return t.charAt(0).toUpperCase() + t.slice(1) + '.';
}

/* the character a spec describes */
function fromSpec(spec, extra = {}) {
  const s = cleanSpec(spec), o = {}, front = {}, back = {}, pal = {};
  if (s.clothes === 'vest') o.garment = 'vest';
  else if (s.clothes === 'tunic') o.torso = 'tunic';
  else if (s.clothes === 'overalls') o.garment = 'overalls';
  else if (s.clothes === 'plate') Object.assign(o, { torso: 'plate', skirt: 2 });
  else if (s.clothes === 'robe') o.garment = 'coat';
  else Object.assign(o, { torso: s.clothes, legs: s.clothes });
  if (APPLIES.rope(s) && s.rope === 'rope') { o.cord = 5; if (s.clothes === 'gown') o.girdle = true; }
  if (APPLIES.neckline(s) && s.neckline === 'square') o.neckline = true;
  const sl = {};
  if (s.sleeves === 'second') Object.assign(sl, { A: 'D', C: s.cut === 'bell' ? 'C' : 'D' });
  if (s.cut === 'bell') sl.bell = true;
  /* the garments' sleeves (garments.js): a vest's shirt gathered at the cuff, overalls' shirt rolled, all creased */
  if (o.garment) sl.folds = true;
  if (o.garment === 'vest') sl.puff = !sl.bell;
  if (o.garment === 'overalls') sl.roll = true;
  if (Object.keys(sl).length) o.sleeves = sl;
  if (s.cape !== 'none') o.cloak = s.cape === 'dagged' ? 'dagged' : true;
  if (s.satchel !== 'none') Object.assign(o, { strap: 1, satchel: s.satchel === 'cross' ? 'cross' : true });
  const weapon = HELD[s.held] || null, shield = s.held === 'daggers' ? DAGGER : (APPLIES.shield(s) && SHIELDS[s.shield]) || null;
  if (s.held === 'spear' || s.held === 'staff') o.steady = true;
  const hat = HATS[s.hat];
  if (hat) { Object.assign(front, hat.front); Object.assign(back, hat.back); }
  if (s.beard === 'full') front.hair = BEARD;
  for (const [key, letter] of COLOURS) pal[letter] = s.colours[key];
  if (s.clothes === 'overalls') pal.P = s.colours.second;                       /* the overalls run down the legs */
  return { id: s.id, name: s.name, blurb: describe(s), body: s.build, outfit: o, hair: HAIRS[s.hair], weapon, shield, pal, parts: { front, back }, spec: s, look: JSON.stringify(s), ...extra };
}

export { APPLIES, CHOICES, COLOURS, DEFAULT_COLOURS, SWATCHES, cleanSpec, describe, fromSpec, newId };
