import { mulberry32 } from '../core/random.js';
import { ASSETS, ASSET_BY_ID, ASSET_GROUPS } from './assets.js';
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
/* wall pieces join up with the wall pieces beside them: sets links = [+x, +y, -x, -y] on each wall and tower
   (call on the instances as drawn, after any turning). A gatehouse joins only at the ends of its long side. */
const WALLISH = new Set(['wall', 'walltower', 'gatehouse']);
function linkWalls(objs) {
  const at = new Map();
  for (const o of objs) if (WALLISH.has(o.id)) { const [w, d] = footprint(o); for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) at.set(x + ',' + y, o); }
  for (const o of objs) {
    if (o.id !== 'wall' && o.id !== 'walltower') continue;
    const q = (dx, dy) => { const n = at.get((o.x + dx) + ',' + (o.y + dy)); if (!n || n === o) return 0; if (n.id !== 'gatehouse') return 1; const [w, d] = footprint(n); return (dx !== 0) === (w > d) ? 1 : 0; };
    o.links = [q(1, 0), q(0, 1), q(-1, 0), q(0, -1)];
  }
  return objs;
}
/* decoration marks on a terrain tile top */
function decorateTerrain(g, id, at, h, seed) {
  const t = TERRAIN_BY_ID[id]; if (!t || !t.deco) return;
  g.save(); t.deco(g, at, h, mulberry32(seed)); g.restore();
}

export { ASSETS, ASSET_BY_ID, ASSET_GROUPS, TERRAIN, TERRAIN_BY_ID, decorateTerrain, drawAsset, footprint, linkWalls, turnAsset };
