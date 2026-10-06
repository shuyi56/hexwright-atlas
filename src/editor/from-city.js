import { CT, FH } from '../city/generate.js';
import { ASSET_BY_ID, footprint } from '../tiles/index.js';
import { MAX_ELEV, TI, blankModel } from './model.js';

/* ================= tile editor: open a generated city district for editing =================
   Ground, height, trees, catalogue assets and ordinary houses come across; walls, bridges and the
   great churches stay behind because they are not single tiles. */
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
  const put = o => { const [w, d] = footprint(o); if (o.x < 0 || o.y < 0 || o.x + w > S || o.y + d > S) return; for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) if (taken[y * S + x]) return; for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) taken[y * S + x] = 1; M.objs.push(o); };
  let v = 0; const nv = () => (v = (v * 9301 + 49297 + 0.137) % 1);
  for (const o of C.objs) {
    if (o.type === 'asset' && ASSET_BY_ID[o.id]) put({ id: o.id, x: Math.floor(o.x), y: Math.floor(o.y), face: o.face || 0, v: o.v ?? nv() });
    else if (o.type === 'bldg' && o.district != null) {
      const w = Math.round(o.w), d = Math.round(o.d), x = Math.round(o.x), y = Math.round(o.y), face = w > d ? 0 : w < d ? 1 : 0;
      if (w * d === 1) put({ id: o.h > FH * 1.5 ? 'townhouse' : 'cottage', x, y, face, v: nv() });
      else if (w * d === 2) put({ id: o.tavern ? 'tavern' : o.h > FH * 1.5 ? 'markethall' : 'longhouse', x, y, face, v: nv() });
      else if (w >= 2 && d >= 2) put({ id: 'keep', x, y, face: 0, v: nv() });
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

export { cityToModel };
