import { characterById, get as getCustom, merge as mergeCustom } from '../characters/library.js';
import { ASSET_BY_ID, HOLDS_FURNITURE, TERRAIN, TERRAIN_BY_ID, canStandOnWall, footprint } from '../tiles/index.js';
import { MAX_ELEV, MAX_LEVEL, STOREY } from './storeys.js';

/* ================= tile editor: the map model =================
   terr holds an index into TERRAIN per tile, elev a height level 0..MAX_ELEV,
   objs the placed assets as { id, x, y, face, v } with (x, y) the top-left of the footprint.
   chars are the characters standing on the map as { sprite, x, y, face }, one tile each, sprite being the id of a
   character in the roster (characters/roster.js) or one made in the character maker (characters/library.js).
   Storeys: the ground is level 0. floors[L - 1] holds upper floor L as one byte per tile, 0 where there is no
   floor and 1 + a TERRAIN index where there is; it stands STOREY height levels above the ground under it.
   Pieces and characters carry level (absent means 0) and only meet things on their own level.
   Both are Placed things: a tile, a facing and a level; a piece adds the asset it is, a character its sprite. */
type Climate = 'temperate' | 'arid' | 'cold';
/* 0..3, a quarter turn each */
type Facing = number;
interface Placed { x: number; y: number; face: Facing; level?: number }
/* a placed asset, (x, y) the top-left of its footprint; v its variant */
interface Piece extends Placed { id: string; v: number; interior?: MapModel }
/* a character standing on the map */
interface MapChar extends Placed { sprite: string }
interface MapModel { name: string; S: number; clim: Climate; terr: Uint8Array; elev: Uint8Array; objs: Piece[]; chars: MapChar[]; floors: (Uint8Array | undefined)[] }

/* ---------- the JSON form ---------- */
interface PieceJSON extends Placed { id: string; v: number; interior?: MapJSON }
interface FloorJSON { level: number; palette: string[]; cells: number[] }
interface MapJSON {
  format: 'hexwright-tiles'; version: 1; name: string; size: number; clim: Climate;
  palette: string[]; terrain: number[]; elevation: number[]; objects: PieceJSON[];
  floors?: FloorJSON[]; characters?: MapChar[]; customCharacters?: unknown[];
}

const levelOf = (o: { level?: number }): number => o.level || 0;
const TI: Record<string, number> = Object.fromEntries(TERRAIN.map((t, k) => [t.id, k]));

function blankModel(S = 24, ground = 'grass', name = 'Untitled survey'): MapModel {
  return { name, S, clim: 'temperate', terr: new Uint8Array(S * S).fill(TI[ground] ?? 0), elev: new Uint8Array(S * S), objs: [], chars: [], floors: [] };
}
/* a building's interior (editor/interiors.js) is a model of its own, kept on the piece and copied with it */
const clonePiece = (o: Piece): Piece => (o.interior ? Object.assign({}, o, { interior: cloneModel(o.interior) }) : Object.assign({}, o));
const cloneModel = (M: MapModel): MapModel => ({ name: M.name, S: M.S, clim: M.clim, terr: M.terr.slice(), elev: M.elev.slice(), objs: M.objs.map(clonePiece), chars: (M.chars || []).map(c => Object.assign({}, c)), floors: (M.floors || []).map(f => f && f.slice()) });

/* JSON form keeps terrain as ids so it survives the catalogue growing */
function toJSON(M: MapModel): MapJSON {
  const pal: string[] = [], at: Record<string, number> = {}, cells: number[] = [];
  for (let u = 0; u < M.terr.length; u++) { const id = TERRAIN[M.terr[u]].id; if (at[id] == null) { at[id] = pal.length; pal.push(id); } cells.push(at[id]); }
  return { format: 'hexwright-tiles', version: 1, name: M.name, size: M.S, clim: M.clim, palette: pal, terrain: cells, elevation: Array.from(M.elev), objects: M.objs.map(pieceJSON), ...floorsJSON(M), ...charsJSON(M) };
}
/* a piece, with its interior (a whole map of its own, in this same form) when it has one */
function pieceJSON({ id, x, y, face, v, level, interior }: Piece): PieceJSON {
  const o: PieceJSON = level ? { id, x, y, face, v, level } : { id, x, y, face, v };
  if (interior) o.interior = toJSON(interior);
  return o;
}
/* upper floors as their own palette and cells, 0 meaning no floor */
function floorsJSON(M: MapModel): { floors?: FloorJSON[] } {
  const out: FloorJSON[] = [];
  (M.floors || []).forEach((f, i) => {
    if (!f || !f.some(Boolean)) return;
    const pal: string[] = [], at: Record<string, number> = {}, cells = Array.from(f, v => { if (!v) return 0; const id = TERRAIN[v - 1].id; if (at[id] == null) { at[id] = pal.length; pal.push(id); } return at[id] + 1; });
    out.push({ level: i + 1, palette: pal, cells });
  });
  return out.length ? { floors: out } : {};
}
/* characters are written by their id. Every copy of the app can draw the roster; the specs of any made in the
   character maker go with the map (customCharacters), so it opens anywhere with them */
function charsJSON(M: MapModel): Pick<MapJSON, 'characters' | 'customCharacters'> {
  const chars = M.chars || []; if (!chars.length) return {};
  const custom = [...new Set(chars.map(c => c.sprite))].map(getCustom).filter(Boolean).map(c => c.spec);
  return { characters: chars.map(({ sprite, x, y, face, level }) => (level ? { sprite, x, y, face, level } : { sprite, x, y, face })), ...(custom.length ? { customCharacters: custom } : {}) };
}
/* Maps saved with the first character style name their people 'starter-villager' and so on, and carry the pixels
   of every sprite they used. The starters come back as the same people in the current style; anyone else it cannot
   find (a character painted in the old sprite editor, or a made one whose spec is missing) comes back as a
   villager, standing where they stood. */
const characterId = (id: string): string => (characterById(id) ? id : characterById(id.replace(/^starter-/, '')) ? id.replace(/^starter-/, '') : 'villager');
function fromJSON(J: MapJSON): MapModel {
  if (!J || J.format !== 'hexwright-tiles' || !(J.size >= 4 && J.size <= 96)) throw new Error('Not a Hexwright tile map');
  const S = J.size | 0, M = blankModel(S, 'grass', String(J.name || 'Imported survey').slice(0, 60));
  M.clim = (['temperate', 'arid', 'cold'] as const).includes(J.clim) ? J.clim : 'temperate';
  for (let u = 0; u < S * S; u++) { const id = J.palette[J.terrain[u]]; M.terr[u] = TI[id] ?? TI.grass; M.elev[u] = Math.max(0, Math.min(MAX_ELEV, J.elevation[u] | 0)); }
  const lv = (v: unknown): number => Math.max(0, Math.min(MAX_LEVEL, (v as number) | 0));
  for (const F of J.floors || []) {
    const L = lv(F.level); if (!L || !Array.isArray(F.cells) || !Array.isArray(F.palette)) continue;
    const f = M.floors[L - 1] = new Uint8Array(S * S);
    for (let u = 0; u < S * S; u++) { const c = F.cells[u] | 0, id = c ? F.palette[c - 1] : null; f[u] = id && TI[id] != null ? TI[id] + 1 : 0; }
  }
  M.objs = (J.objects || []).filter(o => ASSET_BY_ID[o.id]).map(o => {
    const r: Piece = { id: o.id, x: o.x | 0, y: o.y | 0, face: (o.face | 0) & 3, v: +o.v || 0 }; if (lv(o.level)) r.level = lv(o.level);
    /* an interior that will not read is left off rather than losing the whole map */
    if (o.interior) { try { r.interior = fromJSON(o.interior); } catch { /* the building opens with no interior */ } }
    return r;
  });
  mergeCustom(Array.isArray(J.customCharacters) ? J.customCharacters : []);
  M.chars = (J.characters || []).filter(c => c && typeof c.sprite === 'string' && Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < S && c.y < S).map(c => { const r: MapChar = { sprite: characterId(c.sprite), x: c.x, y: c.y, face: (c.face | 0) & 3 }; if (lv(c.level)) r.level = lv(c.level); return r; });
  return M;
}

/* footprint helpers */
const covers = (o: Piece, x: number, y: number): boolean => { const [w, d] = footprint(o); return x >= o.x && y >= o.y && x < o.x + w && y < o.y + d; };
const objAt = (M: MapModel, x: number, y: number, L = 0): number => { for (let k = M.objs.length - 1; k >= 0; k--) if (levelOf(M.objs[k]) === L && covers(M.objs[k], x, y)) return k; return -1; };
/* every piece covering tile (x, y) on level L, by index: a wall and the furniture standing against it share a tile, and
   objAt finds the furniture (the later of the two) */
const piecesAt = (M: MapModel, x: number, y: number, L = 0): number[] => M.objs.map((o, k) => k).filter(k => levelOf(M.objs[k]) === L && covers(M.objs[k], x, y));
/* may inst stand on tile (x, y), level L, against the room wall that is all that stands there? */
const againstWall = (M: MapModel, inst: Piece, x: number, y: number, L: number): boolean => { const ks = piecesAt(M, x, y, L); return canStandOnWall(inst) && ks.length === 1 && HOLDS_FURNITURE(ASSET_BY_ID[M.objs[ks[0]].id]); };
/* the floor of level L at tile u: 1 + TERRAIN index, 0 for none; the ground is always there */
const floorAt = (M: MapModel, L: number, u: number): number => (L ? M.floors?.[L - 1]?.[u] ?? 0 : M.terr[u] + 1);
function fits(M: MapModel, inst: Piece): boolean {
  const [w, d] = footprint(inst), a = ASSET_BY_ID[inst.id], L = levelOf(inst);
  if (inst.x < 0 || inst.y < 0 || inst.x + w > M.S || inst.y + d > M.S || L > MAX_LEVEL) return false;
  for (let y = inst.y; y < inst.y + d; y++) for (let x = inst.x; x < inst.x + w; x++) {
    if ((objAt(M, x, y, L) >= 0 && !againstWall(M, inst, x, y, L)) || (M.chars || []).some(c => c.x === x && c.y === y && levelOf(c) === L)) return false;
    const u = y * M.S + x;
    if (L) { if (!floorAt(M, L, u) || a.water) return false; continue; }
    const wet = !!TERRAIN[M.terr[u]].water;
    if (wet !== !!a.water) return false;
  }
  return true;
}
const isWater = (M: MapModel, u: number): boolean => !!TERRAIN[M.terr[u]].water;
const terrainOf = (M: MapModel, u: number) => TERRAIN[M.terr[u]];

export { MAX_ELEV, MAX_LEVEL, STOREY, TI, TERRAIN_BY_ID, blankModel, floorAt, levelOf, cloneModel, covers, fits, fromJSON, isWater, objAt, piecesAt, terrainOf, toJSON };
export type { Climate, Facing, FloorJSON, MapChar, MapJSON, MapModel, Piece, PieceJSON, Placed };
