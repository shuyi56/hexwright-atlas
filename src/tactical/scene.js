import { MAX_LEVEL, STOREY, levelOf } from '../editor/model.js';
import { ASSET_BY_ID, TERRAIN, footprint, linkWalls, turnAsset } from '../tiles/index.js';
import { designTop, hasDesign } from './pieces.js';
import { ANIMATED, DIRECTIONAL, PAD, STEP, TH, inDiamond, tileUV } from './tiles.js';

/* ================= tactical view: the scene =================
   A tile map (editor/model.js) as the tactical camera draws it: every tile, upper floor and piece as an item in
   one back-to-front list, each item a few sprites from the tile sheet at art-pixel positions. The projection is
   the editor's own (render.js), one unit to one art pixel, with view tile (0, 0)'s top point at the origin:
   P(X, Y, z) = [(X - Y) * 16, (X + Y) * 8 - z]. No DOM; the browser draws the list (tactical/render.js) and Node
   can draw it into a sheet (tactical/sheet.js).

   Depth: an item's key is the sum of its centre's view coordinates, so one tile, the piece on it and the figure
   standing there share a key and go down in that order (pri 0, 1, 2), the storeys above after the ones below
   (lv). A figure stepping between two tiles takes the nearer one's key. Pieces stand taller here than on the
   editor's map (LIFT), so a cottage is about as tall as the figures beside it rather than a third of them; a flight
   of stairs keeps its height, tall buildings are lifted less (liftOf), since it has to meet the floor above, and anything under a floor that is shown stops
   just short of it. */
const SZ = STOREY * STEP, SLAB = 3, EDGE = -24, LIFT = 3;
/* the figures are drawn at three quarters of their 32×48 frames (characters/roster.js renderScaled), so a unit
   stands about 30 pixels tall: a little under a tile's width, the size of the tactics games' units against
   their ground */
const FIGURE_SCALE = 0.75, FIGURE_H = Math.round(40 * FIGURE_SCALE);
/* small things stand LIFT times taller; anything that would pass TALL pixels is lifted less (never under 1.6),
   so houses stay a head or two above the figures and towers do not wall off the field */
const TALL = 60, liftOf = h => Math.max(1.6, Math.min(LIFT, TALL / h));
const P = (X, Y, z = 0) => [(X - Y) * 16, (X + Y) * 8 - z];
const hashInt = n => { let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d); h ^= h >>> 15; h = Math.imul(h, 0x165667b1); return (h ^ (h >>> 13)) >>> 0; };
/* model tile t to view tile, with the map turned rot quarter turns (as editor/render.js) */
function viewOf(S, rot) {
  return t => { const x = t % S, y = (t / S) | 0; const X = rot === 0 ? x : rot === 1 ? S - 1 - y : rot === 2 ? S - 1 - x : y, Y = rot === 0 ? y : rot === 1 ? x : rot === 2 ? S - 1 - y : S - 1 - x; return Y * S + X; };
}
/* a model position (tile centre x + 0.5 and so on) in view coordinates */
const viewPoint = (S, rot, x, y) => (rot === 0 ? [x, y] : rot === 1 ? [S - y, x] : rot === 2 ? [S - x, S - y] : [y, S - x]);

function buildScene(M, { rot = 0, top = MAX_LEVEL } = {}) {
  const S = M.S, NN = S * S, rti = viewOf(S, rot), back = new Int32Array(NN), RT = new Uint8Array(NN), RE = new Uint8Array(NN);
  for (let t = 0; t < NN; t++) { const u = rti(t); back[u] = t; RT[u] = M.terr[t]; RE[u] = M.elev[t]; }
  const zOf = u => RE[u] * STEP - (TERRAIN[RT[u]].sink || 0), zAt = (u, L) => (L ? RE[u] * STEP + L * SZ : zOf(u));
  const FL = [null];
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const f = M.floors && M.floors[L - 1]; if (!f || L > top) { FL.push(null); continue; }
    const v = new Uint8Array(NN); for (let t = 0; t < NN; t++) v[rti(t)] = f[t]; FL.push(v);
  }
  /* which of the four drawings of a ground a tile shows: fixed to the model tile, so turning the view keeps it,
     with the marks that run along an edge swapped to the other edge on a quarter turn */
  const variant = (u, id, L = 0) => (hashInt(back[u] * 4 + L) & 3) ^ (DIRECTIONAL.has(id) && rot % 2 ? 1 : 0);
  const items = [], wet = v => TERRAIN[RT[v]].water;

  for (let u = 0; u < NN; u++) {
    const X = u % S, Y = (u / S) | 0, T = TERRAIN[RT[u]], z = zOf(u), [px, py] = P(X, Y, z);
    const zr = X + 1 < S ? zOf(u + 1) : EDGE, zl = Y + 1 < S ? zOf(u + S) : EDGE, dr = Math.max(0, z - zr), dl = Math.max(0, z - zl);
    const draws = [{ s: { k: 'top', id: T.id, v: variant(u, T.id), anim: ANIMATED.has(T.id) }, x: px - 16, y: py - PAD }];
    if (dl) draws.push({ s: { k: 'face', id: T.id, side: 0, h: dl, z }, x: px - 16, y: py + 8 });
    if (dr) draws.push({ s: { k: 'face', id: T.id, side: 1, h: dr, z }, x: px, y: py + 8 });
    if (T.water) {
      /* foam on each edge that meets land: x = 0, y = 0, y = S, x = S in the tile */
      [[X > 0, u - 1], [Y > 0, u - S], [Y + 1 < S, u + S], [X + 1 < S, u + 1]].forEach(([inside, v], e) => { if (inside && !wet(v)) draws.push({ s: { k: 'foam', e, anim: true }, x: px - 16, y: py - PAD }); });
    }
    items.push({ kind: 'tile', key: X + Y + 1, lv: 0, pri: 0, u, z, draws, box: [px - 16, py - PAD, px + 16, py + TH + Math.max(dl, dr)] });
  }
  for (let L = 1; L < FL.length; L++) {
    const f = FL[L]; if (!f) continue;
    for (let u = 0; u < NN; u++) {
      if (!f[u]) continue;
      const X = u % S, Y = (u / S) | 0, T = TERRAIN[f[u] - 1], z = zAt(u, L), [px, py] = P(X, Y, z);
      /* the slab's edge shows where the floor stops, or where the floor next to it is lower */
      const drop = v => (v < 0 || !f[v] ? SLAB : Math.max(0, z - zAt(v, L))), dr = drop(X + 1 < S ? u + 1 : -1), dl = drop(Y + 1 < S ? u + S : -1);
      const draws = [{ s: { k: 'top', id: T.id, v: variant(u, T.id, L), anim: false }, x: px - 16, y: py - PAD }];
      if (dl) draws.push({ s: { k: 'face', id: T.id, side: 0, h: dl, z }, x: px - 16, y: py + 8 });
      if (dr) draws.push({ s: { k: 'face', id: T.id, side: 1, h: dr, z }, x: px, y: py + 8 });
      items.push({ kind: 'slab', key: X + Y + 1, lv: L, pri: 0, u, z, draws, box: [px - 16, py - PAD, px + 16, py + TH + Math.max(dl, dr)] });
    }
  }
  /* pieces, turned with the view, joined up (walls), at the height they stand on */
  const objs = M.objs.map((o, k) => Object.assign({}, turnAsset(o, rot, S), { k })).filter(o => levelOf(o) <= top);
  linkWalls(objs);
  for (const o of objs) {
    const a = ASSET_BY_ID[o.id], [w, d] = footprint(o), L = levelOf(o); let z = 0, zmin = Infinity, roofed = false;
    for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) {
      const u = y * S + x, zz = zAt(u, L); z = Math.max(z, zz); zmin = Math.min(zmin, zz);
      if (FL[L + 1] && FL[L + 1][u]) roofed = true;
    }
    const lift = a.walk && a.top ? 1 : roofed ? Math.min(liftOf(a.h), (SZ - 1) / a.h) : liftOf(a.h);
    o.z = a.water ? zmin : z;
    const [lx] = P(o.x, o.y + d, o.z), [rx] = P(o.x + w, o.y, o.z), ty = P(o.x, o.y, o.z)[1], by = P(o.x + w, o.y + d, o.z)[1];
    /* a piece with a tactical design (tactical/pieces.js) is drawn from it, unless a floor overhead squeezes it */
    const designed = hasDesign(o.id) && !roofed;
    items.push({ kind: 'piece', key: o.x + w / 2 + o.y + d / 2, lv: L, pri: 1, o, lift, designed, box: [lx - 24, ty - (designed ? designTop(o.id) : a.h * lift + 40), rx + 24, by + 12] });
  }
  /* The ground under a piece goes down before the piece. A tile sorts by its own centre, so under anything more
     than a tile across, the tiles of the footprint's nearer half would otherwise sort after the piece and paint
     their tops (and any shadow on them) over its lower walls. */
  const under = new Map(); for (const it of items) if (it.kind === 'tile' || it.kind === 'slab') under.set(it.u + ',' + it.lv, it);
  for (const it of items) if (it.kind === 'piece') {
    const [w, d] = footprint(it.o);
    for (let y = it.o.y; y < it.o.y + d; y++) for (let x = it.o.x; x < it.o.x + w; x++) { const t = under.get(y * S + x + ',' + it.lv); if (t && t.key >= it.key) t.key = it.key - 0.01; }
  }
  light(items, S, zOf, FL, top);
  items.sort(order);
  return { S, rot, top, rti, back, RT, RE, FL, zOf, zAt, items, model: M };
}
/* ---------- depth on the ground ----------
   Three cues, worked out per ground tile and drawn over its top (tactical/render.js):
   - cast shadow: light comes from the left of the screen (the -x, +y side of the map), at a height where a cliff
     or wall throws a shadow about 1/SUN tiles long for every pixel it stands; each tile is sampled at nine points,
     so a shadow's edge follows the ground at a third of a tile;
   - occlusion: where the ground meets a higher cliff behind it (its -x or -y side), a dark band along that edge,
     deeper the higher the cliff;
   - elevation: low ground a shade darker and high ground a shade lighter, so heights read across a flat field. */
const SUN = 1 / 26, OCC_MAX = 3, RISE = 0.7071 / SUN, DIR = 0.7071;
function light(items, S, zOf, FL, top) {
  const NN = S * S, tall = new Float32Array(NN);
  for (let u = 0; u < NN; u++) tall[u] = zOf(u);
  for (let L = 1; L < FL.length; L++) if (FL[L]) for (let u = 0; u < NN; u++) if (FL[L][u]) tall[u] = Math.max(tall[u], zOf(u) + L * SZ);
  /* what stands on a tile: buildings throw shadows from about the height of their eaves, trees much less, since a crown lets light through */
  for (const it of items) if (it.kind === 'piece') {
    const a = ASSET_BY_ID[it.o.id], [w, d] = footprint(it.o), h = it.designed ? designTop(it.o.id) * (a.group === 'Nature' ? 0.22 : 0.5) : a.h * it.lift * 0.6;
    if (a.walk || h < 6) continue;
    for (let y = it.o.y; y < it.o.y + d; y++) for (let x = it.o.x; x < it.o.x + w; x++) tall[y * S + x] = Math.max(tall[y * S + x], it.o.z + h);
  }
  /* how high above z the shadow stands at world point (fx, fy): what lies toward the light, less the fall of the
     light over the distance, ignoring the tiles of `own` (a piece's own footprint, or the tile itself) */
  let peak = -Infinity; for (let u = 0; u < NN; u++) if (tall[u] > peak) peak = tall[u];
  const shadowAt = (fx, fy, z, own) => {
    /* past the distance where even the tallest thing on the map falls short, nothing can shade this point */
    let best = 0; const reach = Math.min(7, (peak - z) / RISE);
    for (let t = 0.25; t < reach; t += 0.25) {
      const qx = Math.floor(fx - t * DIR), qy = Math.floor(fy + t * DIR); if (qx < 0 || qy >= S) break;
      if (own(qx, qy)) continue;
      const h = tall[qy * S + qx] - z - t * RISE; if (h > best) best = h;
    }
    return best;
  };
  let zmin = Infinity, zmax = -Infinity; for (let u = 0; u < NN; u++) { const z = zOf(u); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  for (const it of items) {
    if (it.kind === 'piece') {
      /* a piece standing in a shadow takes it on its walls: the shadow's height up each column of its front */
      const [w, d] = footprint(it.o), x0 = it.o.x, y0 = it.o.y, x1 = x0 + w, y1 = y0 + d, own = (qx, qy) => qx >= x0 && qx < x1 && qy >= y0 && qy < y1;
      const cols = new Uint8Array((w + d) * 16 + 1); let any = false;
      for (let i = 0; i < cols.length; i++) {
        const c = i - d * 16, [fx, fy] = c <= (w - d) * 16 ? [x0 + (c + d * 16) / 16, y1] : [x1, y1 - (c - (w - d) * 16) / 16];
        const h = shadowAt(fx - 0.01, fy + 0.01, it.o.z, own); cols[i] = Math.min(255, Math.round(h / 2) * 2); if (cols[i] > 1) any = true;
      }
      if (any) it.shadow = cols;
      continue;
    }
    if (it.kind !== 'tile') continue;
    const u = it.u, X = u % S, Y = (u / S) | 0, z = it.z, self = (qx, qy) => qx === X && qy === Y;
    /* the ninths first; a tile only partly in shadow is then worked out pixel by pixel */
    let mask = 0;
    for (let k = 0; k < 9; k++) if (shadowAt(X + ((k % 3) + 0.5) / 3, Y + (((k / 3) | 0) + 0.5) / 3, z, self) > 0.5) mask |= 1 << k;
    /* worked out the first time the tile is drawn, since most of a large map is off screen */
    let bits = null;
    const px = mask && mask !== 511 ? () => {
      if (bits === null) { bits = ''; for (let y = 0; y < TH; y++) for (let x = 0; x < 32; x++) if (inDiamond(x, y)) { const [uu, vv] = tileUV(x, y); bits += shadowAt(X + uu / 16, Y + vv / 16, z, self) > 0.5 ? '1' : '0'; } }
      return bits;
    } : null;
    const occ = [X > 0 ? zOf(u - 1) - z : 0, Y > 0 ? zOf(u - S) - z : 0].map(dz => (dz > 2 ? Math.min(OCC_MAX, Math.ceil(dz / 8)) : 0));
    const elev = zmax > zmin ? Math.round(((z - zmin) / (zmax - zmin)) * 4) : 2;
    it.light = { mask, px, occ, elev };
  }
}
const order = (a, b) => a.key - b.key || a.lv - b.lv || a.pri - b.pri || (a.o && b.o ? a.o.k - b.o.k : 0);

/* the figures (each { key, lv, ... }, pri 2) slotted into the scene's list, keeping its order */
function withFigures(items, figs) {
  if (!figs.length) return items;
  const f = figs.slice().sort(order), out = []; let j = 0;
  for (const it of items) { while (j < f.length && order(f[j], it) < 0) out.push(f[j++]); out.push(it); }
  while (j < f.length) out.push(f[j++]);
  return out;
}

/* ---------- figures among pieces ----------
   The list is ordered by the centre of each item, which is right for anything a tile across but not for a figure
   beside a long or wide piece: a figure standing past a barn's front edge can sort before the barn's middle, and
   one behind its far end after it. A figure and a piece are compared by the piece's own edges instead: the
   figure stands in front when it is past the piece's +x or +y edge, behind when it is short of its -x or -y edge.
   order() then says, for the merged list, what to draw again so each such pair comes out right (the figure again
   after a piece it stands in front of, the piece again after a figure behind it), and which items hide part of
   each figure, for its silhouette. */
const figBox = f => { const [px, py] = P(f.X, f.Y, f.z); return [px - 12, py - FIGURE_H - 4, px + 12, py + 2]; };
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function relation(f, it) {
  if (it.kind !== 'piece' || it.lv !== f.lv) return null;
  const [w, d] = footprint(it.o), x0 = it.o.x, y0 = it.o.y, x1 = x0 + w, y1 = y0 + d;
  if (f.X >= x1 || f.Y >= y1) return 'front';
  if (f.X <= x0 || f.Y <= y0) return 'behind';
  return null;
}
function figureOrder(list) {
  const after = new Map(), hiders = new Map(), add = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  list.forEach((f, i) => {
    if (!f.c) return;
    const box = figBox(f);
    list.forEach((it, j) => {
      if (j === i || it.c || !overlap(box, it.box)) return;
      const rel = relation(f, it);
      if (rel === 'front') { if (j > i) add(after, j, i); return; }
      if (rel === 'behind') { if (j < i) add(after, i, j); add(hiders, i, j); return; }
      /* anything else drawn later that rises above the figure's feet hides it */
      if (j > i && (it.kind === 'piece' || it.z > f.ground + 3)) add(hiders, i, j);
    });
  });
  return { after, hiders };
}

/* The tile top under an art-space point, front-most first: { u, L } in view space, or null. Only the storeys up to
   top count, and only tops (a tile is picked by its surface, as in the games). */
function pickTile(sc, wx, wy) {
  for (let i = sc.items.length - 1; i >= 0; i--) {
    const it = sc.items[i]; if (it.kind !== 'tile' && it.kind !== 'slab') continue;
    const X = it.u % sc.S, Y = (it.u / sc.S) | 0, [px, py] = P(X, Y, it.z), dx = Math.abs(wx - px), dy = wy - py;
    if (dy >= 0 && dy < TH && dx <= 16 - Math.abs(dy - 8) * 2 + 1) return { u: it.u, L: it.lv };
  }
  return null;
}
/* the art-space bounds of the whole scene, for the camera's limits */
function bounds(sc) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of sc.items) { const b = it.box; if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3]; }
  return [x0, y0, x1, y1];
}

export { EDGE, FIGURE_H, FIGURE_SCALE, LIFT, P, figBox, figureOrder, liftOf, SLAB, SZ, bounds, buildScene, order, pickTile, viewOf, viewPoint, withFigures };
