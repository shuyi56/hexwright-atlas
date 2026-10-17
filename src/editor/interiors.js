import { mulberry32 } from '../core/random.js';
import { ASSET_BY_ID, footprint } from '../tiles/index.js';
import { blankModel, cloneModel, levelOf, objAt } from './model.ts';
import { FACE_DELTA, blockedBy } from './walk.js';

/* ================= tile editor: building interiors =================
   A building can be given an interior: a map of its own (the same model as any other, see editor/model.ts) kept on
   the piece as `interior`. The editor opens it in place of the map to furnish it, and the town view walks the hero
   into it through the building's front door and out again through a doorway in the room's outer wall.
   A new interior is one room filling a square map sized to the building, walled all round with interior walls,
   windows in the side and back walls and a doorway in the middle of the front (south) wall; homes get a fireplace
   in the back wall. Any doorway (asset 'idoor') on the edge of an interior leads back out. No DOM. */

/* buildings that are open to the air, or only a wall, have no inside to furnish */
const OPEN_BUILDINGS = new Set(['wall', 'elvenarch', 'elvenpavilion']);
const canHaveInterior = id => { const a = ASSET_BY_ID[id]; return !!a && a.group === 'Buildings' && !OPEN_BUILDINGS.has(id); };
const hasInterior = o => !!(o && o.interior);

/* the floor a new interior is laid with, after what the building is made of */
const FLOORS = {
  stonefloor: ['smithy', 'blacksmith', 'chapel', 'stonetower', 'keep', 'lighthouse', 'temple', 'markethall', 'church', 'cathedral', 'shrine', 'gatehouse', 'walltower', 'stonehouse', 'ruin', 'mine'],
  checker: ['mansion'],
  oakfloor: ['alchemist'],
  rushes: ['barn', 'longhouse', 'yurt', 'granary', 'watchtower', 'windmill', 'dovecote'],
  elvenfloor: ['elvenhall', 'elvenmanor', 'elvenrotunda', 'elvenspire', 'flet']
};
const FLOOR_OF = Object.fromEntries(Object.entries(FLOORS).flatMap(([t, ids]) => ids.map(id => [id, t])));
/* the homes and halls that get a fireplace */
const HEARTH = new Set(['cottage', 'townhouse', 'longhouse', 'tavern', 'slatehouse', 'stonehouse', 'mansion', 'smithy', 'keep', 'elvenhall', 'elvenmanor']);

/* the side of a square interior, at the figures' scale: 5 tiles for a one-tile cottage (a room three tiles across
   inside its walls), 2 more for each tile more of footprint, up to 12 */
function interiorSize(o) {
  const [w, d] = footprint(o), m = Math.max(w, d);
  return Math.min(12, 3 + 2 * m);
}
/* A fresh interior for building o: a walled room with its doorway in the middle of the south wall. size picks the
   side (4-96); clim the climate (the room's ground is all floor, so it only matters to whatever is placed later). */
function makeInterior(o, clim = 'temperate', size = interiorSize(o)) {
  const S = Math.max(4, Math.min(96, size | 0)), a = ASSET_BY_ID[o.id], M = blankModel(S, FLOOR_OF[o.id] || 'floorboards', a ? a.label : 'Interior');
  M.clim = clim;
  const r = mulberry32(Math.floor((o.v ?? 0.5) * 1e6) + 91), door = (S - 1) >> 1, last = S - 1;
  const windows = new Set(), mark = (x, y) => windows.add(x + ',' + y);
  /* windows spaced along the back and side walls, never at a corner or beside the door */
  for (let k = 2; k < last - 1; k += 3) { mark(k, 0); if (k !== door && k !== door + 1 && k !== door - 1) mark(k, last); mark(0, k); mark(last, k); }
  const hearth = HEARTH.has(o.id) ? door : -1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (x && y && x < last && y < last) continue;
    const id = y === last && x === door ? 'idoor' : y === 0 && x === hearth ? 'hearth' : windows.has(x + ',' + y) ? 'iwindow' : 'iwall';
    M.objs.push({ id, x, y, face: 0, v: Math.round(r() * 1000) / 1000 });
  }
  return M;
}

/* the doorways in the outer wall of interior M, on the ground: [x, y, side], side being the way out (the facing
   0..3 = +y, +x, -y, -x) */
function doorways(M) {
  const out = [], last = M.S - 1;
  for (const o of M.objs) {
    if (o.id !== 'idoor' || levelOf(o)) continue;
    const side = o.y === last ? 0 : o.x === last ? 1 : o.y === 0 ? 2 : o.x === 0 ? 3 : -1;
    if (side >= 0) out.push([o.x, o.y, side]);
  }
  /* the front door first */
  return out.sort((a, b) => (a[2] === 0 ? 0 : 1) - (b[2] === 0 ? 0 : 1));
}
/* where someone coming in stands: [x, y, face] just inside the first doorway, facing into the room; on the doorway
   itself when something stands in front of it; with no doorway, the free tile nearest the middle of the south wall.
   except: the index of a character already on the map to leave out of the reckoning. */
function arrival(M, except = -1) {
  const [door] = doorways(M);
  if (door) {
    const [x, y, side] = door, [dx, dy] = FACE_DELTA[side], face = (side + 2) % 4;
    if (!blockedBy(M, x - dx, y - dy, except)) return [x - dx, y - dy, face];
    return [x, y, face];
  }
  let best = null, bd = Infinity;
  for (let y = 0; y < M.S; y++) for (let x = 0; x < M.S; x++) { if (blockedBy(M, x, y, except)) continue; const d = Math.hypot(x - (M.S - 1) / 2, (M.S - 1 - y) * 1.5); if (d < bd) { bd = d; best = [x, y, 2]; } }
  return best;
}
/* how far across its front (0..1) building o's door stands, as the town view draws it (a building can say, as the shops
   do, with door in its asset) */
const DOOR_AT = { chapel: 0.62, church: 0.62 };
const doorAcross = o => DOOR_AT[o.id] ?? (ASSET_BY_ID[o.id] && ASSET_BY_ID[o.id].door) ?? 0.5;

/* the piece covering tile (x, y) of the ground that can have an interior, with its index; null if none */
function buildingAt(M, x, y) {
  const k = objAt(M, x, y, 0); if (k < 0) return null;
  const o = M.objs[k]; return canHaveInterior(o.id) ? { k, o } : null;
}
/* give building o an interior (a copy of `from`, else a fresh one); returns it */
function addInterior(M, o, from = null) { o.interior = from ? cloneModel(from) : makeInterior(o, M.clim); return o.interior; }

export { OPEN_BUILDINGS, addInterior, arrival, buildingAt, canHaveInterior, doorAcross, doorways, hasInterior, interiorSize, makeInterior };
