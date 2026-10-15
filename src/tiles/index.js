import { mulberry32 } from '../core/random.js';
import { ASSETS, ASSET_BY_ID, ASSET_CATEGORIES, ASSET_GROUPS } from './assets.js';
import { makeKit } from './kit.js';
import { TERRAIN, TERRAIN_BY_ID } from './terrain.js';

/* ================= shared isometric tile set =================
   Used by the tile editor and by the city renderer. An asset instance is
   { id, x, y, face, v } where (x, y) is the top-left tile of its footprint. */
function footprint(inst) {
  const a = ASSET_BY_ID[inst.id]; if (!a) return [1, 1];
  return (inst.face || 0) % 2 ? [a.d, a.w] : [a.w, a.d];
}
/* draws one asset with its footprint at x0..x0+w, y0..y0+d and base height z */
function drawAsset(g, P, inst, z, clim = 'temperate') {
  const a = ASSET_BY_ID[inst.id]; if (!a) return;
  const [w, d] = footprint(inst), face = inst.face || 0, v = inst.v ?? 0.5;
  const o = { x0: inst.x, y0: inst.y, x1: inst.x + w, y1: inst.y + d, z, face, v, clim, axis: w > d ? 'x' : w < d ? 'y' : (face % 2 ? 'y' : 'x'), r: mulberry32(Math.floor(v * 1e6) + 17), links: inst.links || null };
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; a.draw(makeKit(g, P), o); g.restore();
}
/* an instance as seen after turning the map by rot quarter turns (rot=1 maps (x, y) to (S - y, x)) */
function turnAsset(o, rot, S) {
  if (!rot) return o;
  const [w, d] = footprint(o), rp = (x, y) => rot === 1 ? [S - y, x] : rot === 2 ? [S - x, S - y] : [y, S - x];
  const [ax, ay] = rp(o.x, o.y), [bx, by] = rp(o.x + w, o.y + d);
  return Object.assign({}, o, { x: Math.min(ax, bx), y: Math.min(ay, by), face: ((o.face || 0) + 3 * rot) % 4 });
}
/* wall pieces join up with the wall pieces beside them: sets links = [+x, +y, -x, -y] on each joining piece
   (call on the instances as drawn, after any turning). City walls and towers join each other and gatehouses (a
   gatehouse only at the ends of its long side); interior walls, windows, doorways, fireplaces and posts join
   each other. Pieces only join pieces of their own kind on their own storey (level). */
const JOIN = { wall: 'city', walltower: 'city', gatehouse: 'city' };
for (const a of ASSETS) if (a.joins) JOIN[a.id] = a.joins;
const DRAWS_LINKS = new Set(['wall', 'walltower', ...ASSETS.filter(a => a.joins).map(a => a.id)]);
function wallLinks(objs) {
  const at = new Map(), out = new Map();
  for (const o of objs) { const kind = JOIN[o.id]; if (!kind) continue; const [w, d] = footprint(o); for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) at.set(kind + ',' + (o.level || 0) + ',' + x + ',' + y, o); }
  for (const o of objs) {
    if (!DRAWS_LINKS.has(o.id)) continue;
    const kind = JOIN[o.id];
    const q = (dx, dy) => { const n = at.get(kind + ',' + (o.level || 0) + ',' + (o.x + dx) + ',' + (o.y + dy)); if (!n || n === o) return 0; if (n.id !== 'gatehouse') return 1; const [w, d] = footprint(n); return (dx !== 0) === (w > d) ? 1 : 0; };
    out.set(o, [q(1, 0), q(0, 1), q(-1, 0), q(0, -1)]);
  }
  return out;
}
function linkWalls(objs) { for (const [o, links] of wallLinks(objs)) o.links = links; return objs; }
/* Furniture against a wall. A room's walls stand in the middle of their tiles, so half of a wall's tile is floor on the
   room's side. A one-tile piece marked wallside (shelves, racks, chests, a trough, a grindstone...) may share the tile
   of a plain or hung room wall (not a doorway, fireplace, post or back bar), standing in front of the wall on the side
   it faces: into the room, so facing anything but north (facing north it would stand behind the wall from the
   viewer). */
const HOLDS_FURNITURE = a => !!a && a.joins === 'room' && !a.walk && !['hearth', 'post', 'wallbar'].includes(a.id);
const canStandOnWall = inst => { const a = ASSET_BY_ID[inst.id]; return !!a && !!a.wallside && a.w === 1 && a.d === 1 && ((inst.face || 0) & 3) !== 2; };
/* the pieces of objs that stand on a wall's tile so */
function standsOnWall(objs) {
  const walls = new Set(), out = new Set();
  for (const o of objs) if (HOLDS_FURNITURE(ASSET_BY_ID[o.id])) walls.add(`${o.level || 0},${o.x},${o.y}`);
  for (const o of objs) if (canStandOnWall(o) && walls.has(`${o.level || 0},${o.x},${o.y}`)) out.add(o);
  return out;
}
/* how far (in tiles) a piece standing on a wall's tile is drawn off the wall's line, toward the way it faces */
const FACE_STEP = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const offWall = o => FACE_STEP[(o.face || 0) & 3].map(v => v * 0.4);
/* decoration marks on a terrain tile top */
function decorateTerrain(g, id, at, h, seed) {
  const t = TERRAIN_BY_ID[id]; if (!t || !t.deco) return;
  g.save(); t.deco(g, at, h, mulberry32(seed)); g.restore();
}

export { ASSETS, ASSET_BY_ID, ASSET_CATEGORIES, ASSET_GROUPS, HOLDS_FURNITURE, TERRAIN, TERRAIN_BY_ID, canStandOnWall, decorateTerrain, drawAsset, footprint, linkWalls, offWall, standsOnWall, turnAsset, wallLinks };
