import { CT, FH } from '../city/generate.js';
import { ASSET_BY_ID, TERRAIN, footprint } from '../tiles/index.js';
import { MAX_ELEV, TI, blankModel } from './model.js';

/* ================= tile editor: open a generated city for editing =================
   Ground, height, trees and catalogue assets come across as they are. Houses become the nearest
   catalogue house (slate and copper roofs as the stone houses and mansions), the town wall is traced
   tile by tile with its towers and gatehouses, and the great churches and the castle stand where the
   city put them. Bridges stay behind. */
/* roof colours are tinted per house, so go by hue: 'slate' (blue-grey), 'copper' (green) or 'tile' */
const roofKind = c => { if (!c || c[0] !== '#') return 'tile'; const n = parseInt(c.slice(1, 7), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return b <= r ? 'tile' : g > b ? 'copper' : 'slate'; };
const STREET = { 1: 'cobble', 6: 'flagstone', 7: 'mud', 2: 'road', 3: 'dirt', 4: 'dirt', 5: 'scree' };
const TREES = { pine: 'pine', spruce: 'snowpine', birch: 'birch', poplar: 'poplar', cypress: 'poplar', bush: 'bush', autumn: 'beech', beech: 'beech' };

function cityToModel(C) {
  const S = C.S, M = blankModel(S, 'grass', C.name); M.clim = C.clim;
  const map = {}; map[CT.GRASS] = C.clim === 'arid' ? 'scrub' : C.clim === 'cold' ? 'tundra' : 'grass'; map[CT.SEA] = 'water'; map[CT.RIVER] = 'water'; map[CT.SAND] = 'sand';
  map[CT.FOREST] = 'tallgrass'; map[CT.PLAZA] = 'plaza'; map[CT.DOCK] = 'planks'; map[CT.GARDEN] = 'garden'; map[CT.YARD] = 'dirt'; map[CT.GRAVE] = 'grass'; map[CT.BRIDGE] = 'planks';
  if (CT.MEADOW != null) { map[CT.MEADOW] = 'meadow'; map[CT.MARSH] = 'marsh'; map[CT.SCREE] = 'scree'; map[CT.SNOW] = 'snow'; map[CT.HEATH] = 'heath'; }
  const crops = ['wheat', 'crops', 'field', 'wheat'];
  for (let u = 0; u < S * S; u++) {
    const ty = C.T[u];
    let id = map[ty] || 'grass';
    if (ty === CT.FIELD) id = crops[C.ftint[u] & 3];
    else if (ty === CT.STREET || ty === CT.ROAD) id = (C.rmat && STREET[C.rmat[u]]) || 'road';
    else if (ty === CT.SEA) { let land = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = u % S + dx, y = ((u / S) | 0) + dy; if (x >= 0 && y >= 0 && x < S && y < S && C.T[y * S + x] !== CT.SEA) land = true; } id = land ? 'shallows' : 'deep'; }
    M.terr[u] = TI[id] ?? TI.grass;
    M.elev[u] = Math.min(MAX_ELEV, C.elev[u]);
  }
  const taken = new Uint8Array(S * S);
  const put = o => { const [w, d] = footprint(o), wet = !!ASSET_BY_ID[o.id].water; if (o.x < 0 || o.y < 0 || o.x + w > S || o.y + d > S) return false; for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) if (taken[y * S + x] || !!TERRAIN[M.terr[y * S + x]].water !== wet) return false; for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) taken[y * S + x] = 1; M.objs.push(o); return true; };
  let v = 0; const nv = () => (v = (v * 9301 + 49297 + 0.137) % 1);
  /* the great churches, the castle, then the wall: gatehouses, towers and the curtain between them */
  for (const c of C.complexes || []) {
    const ax = c.axis === 'x', face = ax ? 0 : 3;
    for (const id of c.kind === 'church' ? ['church'] : ['cathedral', 'church']) {
      const a = ASSET_BY_ID[id], w = ax ? a.w : a.d, d = ax ? a.d : a.w, cx = c.cx ?? c.x + c.w / 2, cy = c.cy ?? c.y + c.d / 2;
      const x = Math.max(c.x, Math.min(c.x + c.w - w, Math.round(cx - w / 2))), y = Math.max(c.y, Math.min(c.y + c.d - d, Math.round(cy - d / 2)));
      if (put({ id, x, y, face, v: nv() })) break;
    }
  }
  for (const l of C.landmarks) if (l.kind === 'palace' || l.kind === 'castle') put({ id: 'keep', x: Math.round(l.x) - 1, y: Math.round(l.y) - 1, face: 0, v: nv() });
  for (const o of C.objs) if (o.type === 'wall' && o.gate) {
    const ax = Math.abs(o.x2 - o.x1) >= Math.abs(o.y2 - o.y1), mx = Math.floor((o.x1 + o.x2) / 2), my = Math.floor((o.y1 + o.y2) / 2);
    put({ id: 'gatehouse', x: ax ? mx - 1 : mx, y: ax ? my : my - 1, face: ax ? 0 : 1, v: nv() });
  }
  for (const o of C.objs) if (o.type === 'round' && o.wt) put({ id: 'walltower', x: Math.floor(o.x), y: Math.floor(o.y), face: 0, v: o.roof === 'cone' ? 0.3 : 0.7 });
  for (const o of C.objs) if (o.type === 'wall' && !o.gate) for (const [x, y] of trace(o.x1, o.y1, o.x2, o.y2)) put({ id: 'wall', x, y, face: Math.abs(o.x2 - o.x1) >= Math.abs(o.y2 - o.y1) ? 0 : 1, v: 0.5 });
  for (const o of C.objs) {
    if (o.type === 'asset' && ASSET_BY_ID[o.id]) put({ id: o.id, x: Math.floor(o.x), y: Math.floor(o.y), face: o.face || 0, v: o.v ?? nv() });
    else if (o.type === 'bldg' && o.district != null) {
      const w = Math.round(o.w), d = Math.round(o.d), x = Math.round(o.x), y = Math.round(o.y), face = w > d ? 0 : w < d ? 1 : 0;
      const rk = roofKind(o.roofC && o.roofC[0]);
      if (w >= 2 && d >= 2) put({ id: 'mansion', x, y, face: 0, v: rk === 'slate' ? 0.2 : rk === 'copper' ? 0.55 : 0.85 });
      else if (rk !== 'tile') put({ id: w * d === 1 ? 'slatehouse' : 'stonehouse', x, y, face, v: nv() });
      else if (w * d === 1) put({ id: o.h > FH * 1.5 ? 'townhouse' : 'cottage', x, y, face, v: nv() });
      else if (w * d === 2) put({ id: o.tavern ? 'tavern' : o.h > FH * 1.5 ? 'markethall' : 'longhouse', x, y, face, v: nv() });
      else put({ id: 'barn', x, y, face, v: nv() });
    }
    else if (o.type === 'tree') put({ id: TREES[o.sp] || 'oak', x: Math.floor(o.x), y: Math.floor(o.y), face: 0, v: nv() });
    else if (o.type === 'mill') put({ id: 'windmill', x: Math.floor(o.x), y: Math.floor(o.y), face: 0, v: nv() });
    else if (o.type === 'well' || o.type === 'fountain') put({ id: o.type === 'well' ? 'well' : 'statue', x: Math.floor(o.x), y: Math.floor(o.y), face: 0, v: nv() });
    else if (o.type === 'stall') put({ id: 'stall', x: Math.floor(o.x), y: Math.floor(o.y), face: 0, v: nv() });
    else if (o.type === 'ship') put({ id: 'rowboat', x: Math.floor(o.x), y: Math.floor(o.y), face: o.flip ? 1 : 0, v: nv() });
  }
  for (let u = 0; u < S * S; u++) if (C.T[u] === CT.GRAVE && !taken[u]) put({ id: 'graves', x: u % S, y: (u / S) | 0, face: 0, v: nv() });
  return M;
}

/* the tiles a straight wall run crosses, stepping so that each touches the last along a side */
function trace(x1, y1, x2, y2) {
  const out = [], n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 4) + 1;
  for (let k = 0; k <= n; k++) {
    const x = Math.floor(x1 + (x2 - x1) * k / n), y = Math.floor(y1 + (y2 - y1) * k / n), last = out[out.length - 1];
    if (last && last[0] === x && last[1] === y) continue;
    if (last && last[0] !== x && last[1] !== y) out.push([x, last[1]]);
    out.push([x, y]);
  }
  return out;
}

/* one district: the city's tiles cropped to a square around it, with a margin of its neighbours for context */
function districtToModel(C, k, M = cityToModel(C)) {
  const D = C.districts[k], S = C.S;
  let x0 = S, y0 = S, x1 = -1, y1 = -1;
  for (let u = 0; u < S * S; u++) if (C.dist[u] === k) { const x = u % S, y = (u / S) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  const n = Math.max(12, Math.min(S, Math.max(x1 - x0, y1 - y0) + 1 + 4));
  const cx = Math.max(0, Math.min(S - n, Math.round((x0 + x1 + 1 - n) / 2))), cy = Math.max(0, Math.min(S - n, Math.round((y0 + y1 + 1 - n) / 2)));
  const out = blankModel(n, 'grass', `${D.name}, ${C.name}`.slice(0, 60)); out.clim = M.clim;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (y + cy) * S + x + cx; out.terr[y * n + x] = M.terr[u]; out.elev[y * n + x] = M.elev[u]; }
  for (const o of M.objs) { const [w, d] = footprint(o); if (o.x >= cx && o.y >= cy && o.x + w <= cx + n && o.y + d <= cy + n) out.objs.push(Object.assign({}, o, { x: o.x - cx, y: o.y - cy })); }
  return out;
}

export { cityToModel, districtToModel };
