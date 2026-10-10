import { characterById, get as getCustom, merge as mergeCustom } from '../characters/library.js';
import { ASSET_BY_ID, TERRAIN, TERRAIN_BY_ID, footprint } from '../tiles/index.js';
import { MAX_ELEV, MAX_LEVEL, STOREY } from './storeys.js';

/* ================= tile editor: the map model =================
   terr holds an index into TERRAIN per tile, elev a height level 0..MAX_ELEV,
   objs the placed assets as { id, x, y, face, v } with (x, y) the top-left of the footprint.
   chars are the characters standing on the map as { sprite, x, y, face }, one tile each, sprite being the id of a
   character in the roster (characters/roster.js) or one made in the character maker (characters/library.js).
   Storeys: the ground is level 0. floors[L - 1] holds upper floor L as one byte per tile, 0 where there is no
   floor and 1 + a TERRAIN index where there is; it stands STOREY height levels above the ground under it.
   Pieces and characters carry level (absent means 0) and only meet things on their own level. */
const levelOf = o => o.level || 0;
const TI = Object.fromEntries(TERRAIN.map((t, k) => [t.id, k]));

function blankModel(S = 24, ground = 'grass', name = 'Untitled survey') {
  return { name, S, clim: 'temperate', terr: new Uint8Array(S * S).fill(TI[ground] ?? 0), elev: new Uint8Array(S * S), objs: [], chars: [], floors: [] };
}
const cloneModel = M => ({ name: M.name, S: M.S, clim: M.clim, terr: M.terr.slice(), elev: M.elev.slice(), objs: M.objs.map(o => Object.assign({}, o)), chars: (M.chars || []).map(c => Object.assign({}, c)), floors: (M.floors || []).map(f => f && f.slice()) });

/* JSON form keeps terrain as ids so it survives the catalogue growing */
function toJSON(M) {
  const pal = [], at = {}, cells = [];
  for (let u = 0; u < M.terr.length; u++) { const id = TERRAIN[M.terr[u]].id; if (at[id] == null) { at[id] = pal.length; pal.push(id); } cells.push(at[id]); }
  return { format: 'hexwright-tiles', version: 1, name: M.name, size: M.S, clim: M.clim, palette: pal, terrain: cells, elevation: Array.from(M.elev), objects: M.objs.map(({ id, x, y, face, v, level }) => (level ? { id, x, y, face, v, level } : { id, x, y, face, v })), ...floorsJSON(M), ...charsJSON(M) };
}
/* upper floors as their own palette and cells, 0 meaning no floor */
function floorsJSON(M) {
  const out = [];
  (M.floors || []).forEach((f, i) => {
    if (!f || !f.some(Boolean)) return;
    const pal = [], at = {}, cells = Array.from(f, v => { if (!v) return 0; const id = TERRAIN[v - 1].id; if (at[id] == null) { at[id] = pal.length; pal.push(id); } return at[id] + 1; });
    out.push({ level: i + 1, palette: pal, cells });
  });
  return out.length ? { floors: out } : {};
}
/* characters are written by their id. Every copy of the app can draw the roster; the specs of any made in the
   character maker go with the map (customCharacters), so it opens anywhere with them */
function charsJSON(M) {
  const chars = M.chars || []; if (!chars.length) return {};
  const custom = [...new Set(chars.map(c => c.sprite))].map(getCustom).filter(Boolean).map(c => c.spec);
  return { characters: chars.map(({ sprite, x, y, face, level }) => (level ? { sprite, x, y, face, level } : { sprite, x, y, face })), ...(custom.length ? { customCharacters: custom } : {}) };
}
/* Maps saved with the first character style name their people 'starter-villager' and so on, and carry the pixels
   of every sprite they used. The starters come back as the same people in the current style; anyone else it cannot
   find (a character painted in the old sprite editor, or a made one whose spec is missing) comes back as a
   villager, standing where they stood. */
const characterId = id => (characterById(id) ? id : characterById(id.replace(/^starter-/, '')) ? id.replace(/^starter-/, '') : 'villager');
function fromJSON(J) {
  if (!J || J.format !== 'hexwright-tiles' || !(J.size >= 4 && J.size <= 96)) throw new Error('Not a Hexwright tile map');
  const S = J.size | 0, M = blankModel(S, 'grass', String(J.name || 'Imported survey').slice(0, 60));
  M.clim = ['temperate', 'arid', 'cold'].includes(J.clim) ? J.clim : 'temperate';
  for (let u = 0; u < S * S; u++) { const id = J.palette[J.terrain[u]]; M.terr[u] = TI[id] ?? TI.grass; M.elev[u] = Math.max(0, Math.min(MAX_ELEV, J.elevation[u] | 0)); }
  const lv = v => Math.max(0, Math.min(MAX_LEVEL, v | 0));
  for (const F of J.floors || []) {
    const L = lv(F.level); if (!L || !Array.isArray(F.cells) || !Array.isArray(F.palette)) continue;
    const f = M.floors[L - 1] = new Uint8Array(S * S);
    for (let u = 0; u < S * S; u++) { const c = F.cells[u] | 0, id = c ? F.palette[c - 1] : null; f[u] = id && TI[id] != null ? TI[id] + 1 : 0; }
  }
  M.objs = (J.objects || []).filter(o => ASSET_BY_ID[o.id]).map(o => { const r = { id: o.id, x: o.x | 0, y: o.y | 0, face: (o.face | 0) & 3, v: +o.v || 0 }; if (lv(o.level)) r.level = lv(o.level); return r; });
  mergeCustom(Array.isArray(J.customCharacters) ? J.customCharacters : []);
  M.chars = (J.characters || []).filter(c => c && typeof c.sprite === 'string' && Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < S && c.y < S).map(c => { const r = { sprite: characterId(c.sprite), x: c.x, y: c.y, face: (c.face | 0) & 3 }; if (lv(c.level)) r.level = lv(c.level); return r; });
  return M;
}

/* footprint helpers */
const covers = (o, x, y) => { const [w, d] = footprint(o); return x >= o.x && y >= o.y && x < o.x + w && y < o.y + d; };
const objAt = (M, x, y, L = 0) => { for (let k = M.objs.length - 1; k >= 0; k--) if (levelOf(M.objs[k]) === L && covers(M.objs[k], x, y)) return k; return -1; };
/* the floor of level L at tile u: 1 + TERRAIN index, 0 for none; the ground is always there */
const floorAt = (M, L, u) => (L ? (M.floors && M.floors[L - 1] ? M.floors[L - 1][u] : 0) : M.terr[u] + 1);
function fits(M, inst) {
  const [w, d] = footprint(inst), a = ASSET_BY_ID[inst.id], L = levelOf(inst);
  if (inst.x < 0 || inst.y < 0 || inst.x + w > M.S || inst.y + d > M.S || L > MAX_LEVEL) return false;
  for (let y = inst.y; y < inst.y + d; y++) for (let x = inst.x; x < inst.x + w; x++) {
    if (objAt(M, x, y, L) >= 0 || (M.chars || []).some(c => c.x === x && c.y === y && levelOf(c) === L)) return false;
    const u = y * M.S + x;
    if (L) { if (!floorAt(M, L, u) || a.water) return false; continue; }
    const wet = !!TERRAIN[M.terr[u]].water;
    if (wet !== !!a.water) return false;
  }
  return true;
}
const isWater = (M, u) => !!TERRAIN[M.terr[u]].water;
const terrainOf = (M, u) => TERRAIN[M.terr[u]];

export { MAX_ELEV, MAX_LEVEL, STOREY, TI, TERRAIN_BY_ID, blankModel, floorAt, levelOf, cloneModel, covers, fits, fromJSON, isWater, objAt, terrainOf, toJSON };
