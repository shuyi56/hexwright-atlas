import { get as getSprite, merge as mergeSprites } from '../characters/library.js';
import { spriteFromJSON, spriteToJSON } from '../characters/sprite.js';
import { ASSET_BY_ID, TERRAIN, TERRAIN_BY_ID, footprint } from '../tiles/index.js';

/* ================= tile editor: the map model =================
   terr holds an index into TERRAIN per tile, elev a height level 0..MAX_ELEV,
   objs the placed assets as { id, x, y, face, v } with (x, y) the top-left of the footprint.
   chars are the characters standing on the map as { sprite, x, y, face }, one tile each. */
const MAX_ELEV = 6;
const TI = Object.fromEntries(TERRAIN.map((t, k) => [t.id, k]));

function blankModel(S = 24, ground = 'grass', name = 'Untitled survey') {
  return { name, S, clim: 'temperate', terr: new Uint8Array(S * S).fill(TI[ground] ?? 0), elev: new Uint8Array(S * S), objs: [], chars: [] };
}
const cloneModel = M => ({ name: M.name, S: M.S, clim: M.clim, terr: M.terr.slice(), elev: M.elev.slice(), objs: M.objs.map(o => Object.assign({}, o)), chars: (M.chars || []).map(c => Object.assign({}, c)) });

/* JSON form keeps terrain as ids so it survives the catalogue growing */
function toJSON(M) {
  const pal = [], at = {}, cells = [];
  for (let u = 0; u < M.terr.length; u++) { const id = TERRAIN[M.terr[u]].id; if (at[id] == null) { at[id] = pal.length; pal.push(id); } cells.push(at[id]); }
  return { format: 'hexwright-tiles', version: 1, name: M.name, size: M.S, clim: M.clim, palette: pal, terrain: cells, elevation: Array.from(M.elev), objects: M.objs.map(({ id, x, y, face, v }) => ({ id, x, y, face, v })), ...charsJSON(M) };
}
/* characters are written with the sprites they use, so a saved map does not depend on the library */
function charsJSON(M) {
  const chars = M.chars || []; if (!chars.length) return {};
  const used = [...new Set(chars.map(c => c.sprite))].map(getSprite).filter(Boolean);
  return { characters: chars.map(({ sprite, x, y, face }) => ({ sprite, x, y, face })), sprites: used.map(spriteToJSON) };
}
function fromJSON(J) {
  if (!J || J.format !== 'hexwright-tiles' || !(J.size >= 4 && J.size <= 96)) throw new Error('Not a Hexwright tile map');
  const S = J.size | 0, M = blankModel(S, 'grass', String(J.name || 'Imported survey').slice(0, 60));
  M.clim = ['temperate', 'arid', 'cold'].includes(J.clim) ? J.clim : 'temperate';
  for (let u = 0; u < S * S; u++) { const id = J.palette[J.terrain[u]]; M.terr[u] = TI[id] ?? TI.grass; M.elev[u] = Math.max(0, Math.min(MAX_ELEV, J.elevation[u] | 0)); }
  M.objs = (J.objects || []).filter(o => ASSET_BY_ID[o.id]).map(o => ({ id: o.id, x: o.x | 0, y: o.y | 0, face: (o.face | 0) & 3, v: +o.v || 0 }));
  const sprites = []; for (const sj of J.sprites || []) { try { sprites.push(spriteFromJSON(sj)); } catch { /* skip a damaged sprite */ } }
  mergeSprites(sprites);
  M.chars = (J.characters || []).filter(c => c && typeof c.sprite === 'string' && Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < S && c.y < S).map(c => ({ sprite: c.sprite, x: c.x, y: c.y, face: (c.face | 0) & 3 }));
  return M;
}

/* footprint helpers */
const covers = (o, x, y) => { const [w, d] = footprint(o); return x >= o.x && y >= o.y && x < o.x + w && y < o.y + d; };
const objAt = (M, x, y) => { for (let k = M.objs.length - 1; k >= 0; k--) if (covers(M.objs[k], x, y)) return k; return -1; };
function fits(M, inst) {
  const [w, d] = footprint(inst), a = ASSET_BY_ID[inst.id];
  if (inst.x < 0 || inst.y < 0 || inst.x + w > M.S || inst.y + d > M.S) return false;
  for (let y = inst.y; y < inst.y + d; y++) for (let x = inst.x; x < inst.x + w; x++) {
    if (objAt(M, x, y) >= 0 || (M.chars || []).some(c => c.x === x && c.y === y)) return false;
    const wet = !!TERRAIN[M.terr[y * M.S + x]].water;
    if (wet !== !!a.water) return false;
  }
  return true;
}
const isWater = (M, u) => !!TERRAIN[M.terr[u]].water;
const terrainOf = (M, u) => TERRAIN[M.terr[u]];

export { MAX_ELEV, TI, TERRAIN_BY_ID, blankModel, cloneModel, covers, fits, fromJSON, isWater, objAt, terrainOf, toJSON };
