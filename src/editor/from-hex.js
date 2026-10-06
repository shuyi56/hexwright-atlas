import { CX, CY, NB, hexNo } from '../core/geometry.js';
import { fbm, makeNoise, mulberry32 } from '../core/random.js';
import { climate } from '../render/palette.js';
import { BIOME } from '../world/data.js';
import { TERRAIN, footprint } from '../tiles/index.js';
import { MAX_ELEV, TI, blankModel, fits } from './model.js';

/* ================= tile editor: walk into one hex of the realm map =================
   Builds a tile map of a single hex from what the atlas knows about it: its biome and those of its
   neighbours (blended in at the edges), coast or lake shore on the sides that touch water, rivers and
   roads entering through the sides the realm's paths actually cross, farmland, and whatever stands in
   the hex. Cities and abbeys are not drawn here: their own city plan is converted instead.
   Same map and hex, same tiles. */
const HEX_TILES = 32;
const LAND = {
  grass:    { ground: ['grass', 'meadow', 'grass', 'pasture', 'tallgrass'], trees: ['oak', 'oak', 'beech', 'birch', 'poplar'], tp: 0.05, wood: 0.12, base: 1, relief: 1.5, props: ['flowers', 'bush', 'rocks', 'stump'] },
  forest:   { ground: ['grass', 'tallgrass', 'grass', 'meadow'], trees: ['oak', 'beech', 'birch', 'oak', 'pine'], tp: 0.4, wood: 0.7, base: 1, relief: 2, props: ['mushrooms', 'stump', 'logpile', 'bush'] },
  deepwood: { ground: ['tallgrass', 'grass', 'moor', 'tallgrass'], trees: ['oak', 'beech', 'pine', 'oak', 'deadtree'], tp: 0.62, wood: 0.85, base: 1, relief: 2, props: ['mushrooms', 'mushrooms', 'stump', 'rocks'] },
  taiga:    { ground: ['tundra', 'grass', 'snow', 'tundra'], trees: ['snowpine', 'pine', 'snowpine', 'birch'], tp: 0.42, wood: 0.7, base: 1, relief: 2, props: ['rocks', 'stump', 'logpile'] },
  hills:    { ground: ['heath', 'grass', 'moor', 'pasture'], high: ['rock', 'scree'], trees: ['oak', 'pine', 'birch'], tp: 0.04, wood: 0.15, base: 2, relief: 3.2, props: ['boulders', 'rocks', 'rocks', 'bush'] },
  mountain: { ground: ['scree', 'rock', 'heath', 'rock'], high: ['rock', 'snow'], trees: ['pine', 'pine', 'deadtree'], tp: 0.03, wood: 0.12, base: 3, relief: 4.5, props: ['boulders', 'rocks', 'rocks'] },
  peak:     { ground: ['snow', 'rock', 'snow', 'scree'], high: ['snow', 'ice'], trees: ['snowpine'], tp: 0.01, wood: 0.04, base: 4, relief: 4.5, props: ['rocks', 'boulders'] },
  desert:   { ground: ['sand', 'dunes', 'scrub', 'dunes'], trees: ['cactus', 'palm', 'cactus', 'deadtree'], tp: 0.02, wood: 0.04, base: 1, relief: 1.8, props: ['rocks', 'cactus', 'boulders'] },
  swamp:    { ground: ['marsh', 'mud', 'grass', 'marsh', 'tallgrass'], trees: ['deadtree', 'birch', 'bush', 'oak'], tp: 0.14, wood: 0.3, base: 0, relief: 1, props: ['reeds', 'reeds', 'mushrooms', 'stump'] },
  tundra:   { ground: ['tundra', 'snow', 'tundra', 'heath'], trees: ['snowpine', 'deadtree'], tp: 0.02, wood: 0.05, base: 1, relief: 1.5, props: ['rocks', 'boulders', 'stones'] }
};
const SHORE = { cold: 'shingle', arid: 'sand', temperate: 'sand' };
const TOWNS = {
  temperate: ['cottage', 'cottage', 'townhouse', 'longhouse', 'cottage', 'smithy', 'dovecote'],
  arid: ['cottage', 'townhouse', 'yurt', 'granary', 'shrine'],
  cold: ['longhouse', 'longhouse', 'cottage', 'granary', 'yurt']
};

function hexToModel(map, i, S = HEX_TILES) {
  const rng = mulberry32((map.seedHash ^ Math.imul(i + 1, 2654435761)) >>> 0), nz = makeNoise(rng), nz2 = makeNoise(rng), nz3 = makeNoise(rng);
  const pick = a => a[Math.floor(rng() * a.length)];
  const b = map.B[i], clim = climate(map, i), here = BIOME[b];
  const s = map.sAt[i] >= 0 ? map.settle[map.sAt[i]] : null;
  const sub = !s && map.sprawl && map.sprawl[i] >= 0 ? map.settle[map.sprawl[i]] : null;
  const M = blankModel(S, 'grass', hexName(map, i, s, sub)); M.clim = clim;
  const NN = S * S, c = (S - 1) / 2, id = (x, y) => y * S + x, inb = (x, y) => x >= 0 && y >= 0 && x < S && y < S;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /* the six sides: unit direction to each neighbour (x east, y south, as on the realm map) */
  const sides = NB[i].map(n => { const dx = n >= 0 ? CX[n] - CX[i] : 0, dy = n >= 0 ? CY[n] - CY[i] : 0, l = Math.hypot(dx, dy) || 1; return { n, dx: dx / l, dy: dy / l }; });
  const P = new Float32Array(NN * 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { P[id(x, y) * 2] = (x - c) / c; P[id(x, y) * 2 + 1] = (y - c) / c; }
  /* the side a tile leans toward, and how far out toward it (0 at the centre, about 1 at the edge) */
  const lean = u => { let best = -1, bd = -9; for (let k = 0; k < 6; k++) { if (sides[k].n < 0) continue; const d = P[u * 2] * sides[k].dx + P[u * 2 + 1] * sides[k].dy; if (d > bd) { bd = d; best = k; } } return [best, bd]; };
  const edgePt = k => { const { dx, dy } = sides[k], m = Math.max(Math.abs(dx), Math.abs(dy)); return [c + dx / m * c * 1.02, c + dy / m * c * 1.02]; };

  const wet = new Uint8Array(NN), road = new Uint8Array(NN), river = new Uint8Array(NN), keep = new Uint8Array(NN);
  const H = new Float32Array(NN);
  for (let u = 0; u < NN; u++) H[u] = fbm(nz, P[u * 2] * 1.6 + 7, P[u * 2 + 1] * 1.6 - 3, 3);

  /* ---------- ground: water, shore and land, blended toward the neighbours ---------- */
  const isWaterB = k => !!BIOME[k] && !!BIOME[k].water;
  const waterTile = (bk, depth) => bk === 'lake' ? (depth > 0.35 ? 'deep' : depth > 0.12 ? 'water' : 'shallows') : bk === 'shallow' ? (depth > 0.3 ? 'water' : 'shallows') : bk === 'sea' ? (depth > 0.3 ? 'deep' : depth > 0.1 ? 'water' : 'shallows') : depth > 0.15 ? 'deep' : depth > 0.05 ? 'water' : 'shallows';
  for (let u = 0; u < NN; u++) {
    const [k, t] = lean(u), wob = nz2(P[u * 2] * 2.4, P[u * 2 + 1] * 2.4) * 0.14;
    const nbB = k >= 0 ? map.B[sides[k].n] : b, edge = t + wob;
    if (here.water) {
      /* a water hex: land creeps in from the sides that touch land */
      const landSide = k >= 0 && !isWaterB(nbB);
      if (landSide && edge > 0.74) { M.terr[u] = TI[edge > 0.86 ? (LAND[nbB] ? LAND[nbB].ground[0] : 'grass') : SHORE[clim]]; continue; }
      wet[u] = 1; M.terr[u] = TI[waterTile(b, landSide ? 0.74 - edge : 0.5 + H[u] * 0.2)]; continue;
    }
    if (k >= 0 && isWaterB(nbB) && edge > 0.66) { wet[u] = 1; M.terr[u] = TI[waterTile(nbB, edge - 0.66)]; continue; }
    if (k >= 0 && isWaterB(nbB) && edge > 0.56) { M.terr[u] = TI[nbB === 'lake' && clim === 'temperate' ? 'shingle' : SHORE[clim]]; continue; }
    const pb = k >= 0 && LAND[nbB] && edge > 0.62 + nz3(P[u * 2] * 3, P[u * 2 + 1] * 3) * 0.12 ? nbB : b, pr = LAND[pb] || LAND.grass;
    M.terr[u] = TI[groundOf(pr, fbm(nz2, P[u * 2] * 1.2 + 20, P[u * 2 + 1] * 1.2, 2))];
  }

  /* ---------- rivers and roads enter through the sides their paths cross ---------- */
  const through = paths => { const out = new Set(); for (const p of paths) { const k = p.indexOf(i); if (k < 0) continue; if (k > 0) out.add(p[k - 1]); if (k < p.length - 1) out.add(p[k + 1]); } return [...out].map(n => sides.findIndex(sd => sd.n === n)).filter(k => k >= 0); };
  const riverSides = here.water ? [] : through(map.rivers.map(r => r.path));
  const roadSides = here.water ? [] : through(map.roads);
  const hub = [c + (rng() - 0.5) * S * 0.12, c + (rng() - 0.5) * S * 0.12];
  /* sampled curve from a side to the hub, bowed a little so it does not run ruler-straight */
  const course = (k, bow) => { const [ex, ey] = edgePt(k), mx = (ex + hub[0]) / 2 - (ey - hub[1]) * bow, my = (ey + hub[1]) / 2 + (ex - hub[0]) * bow, pts = []; for (let j = 0; j <= 48; j++) { const t = j / 48, a = (1 - t) * (1 - t), m = 2 * t * (1 - t), z = t * t; pts.push([a * ex + m * mx + z * hub[0], a * ey + m * my + z * hub[1]]); } return pts; };
  const near = (pts, x, y) => { let d = 1e9; for (const [px, py] of pts) d = Math.min(d, Math.hypot(px - x, py - y)); return d; };
  const rivD = new Float32Array(NN).fill(99);
  if (riverSides.length) {
    const curves = riverSides.map(k => course(k, (rng() - 0.5) * 0.5));
    if (riverSides.length === 1) curves.push(course(riverSides[0], 0).slice(-6)); /* a spring: ends in a pool at the hub */
    for (let u = 0; u < NN; u++) { const x = u % S, y = (u / S) | 0; for (const cv of curves) rivD[u] = Math.min(rivD[u], near(cv, x, y)); }
    const wid = 0.8 + Math.min(0.9, riverSides.length * 0.25);
    for (let u = 0; u < NN; u++) if (rivD[u] < wid || (riverSides.length === 1 && Math.hypot(u % S - hub[0], ((u / S) | 0) - hub[1]) < 2.2)) { wet[u] = 1; river[u] = 1; M.terr[u] = TI[clim === 'cold' && b === 'peak' ? 'ice' : 'water']; }
  }
  const roadPts = roadSides.map(k => course(k, (rng() - 0.5) * 0.3));

  /* ---------- height: noise over the biome's base, falling to every shore ---------- */
  const pr0 = LAND[b] || LAND.grass;
  const dist = new Uint8Array(NN).fill(255), q = [];
  for (let u = 0; u < NN; u++) if (wet[u]) { dist[u] = 0; q.push(u); }
  for (let h = 0; h < q.length; h++) { const u = q[h], x = u % S, y = (u / S) | 0; for (const [dx, dy] of N4) { const v = id(x + dx, y + dy); if (inb(x + dx, y + dy) && dist[v] > dist[u] + 1) { dist[v] = dist[u] + 1; q.push(v); } } }
  for (let u = 0; u < NN; u++) {
    if (wet[u]) { M.elev[u] = 0; continue; }
    const [k, t] = lean(u), nbB = k >= 0 ? map.B[sides[k].n] : b, nb = LAND[nbB] || pr0, mix = Math.max(0, Math.min(1, (t - 0.45) / 0.55)) * 0.5;
    const base = pr0.base * (1 - mix) + nb.base * mix, relief = pr0.relief * (1 - mix) + nb.relief * mix;
    const e = Math.round(base + (H[u] + 0.15) * relief + (b === 'peak' || b === 'mountain' ? (1 - Math.hypot(P[u * 2], P[u * 2 + 1])) * 2 : 0));
    M.elev[u] = Math.max(0, Math.min(MAX_ELEV, e, here.water ? 1 : riverSides.length ? Math.max(0, dist[u] - 1) : dist[u] === 255 ? 9 : dist[u]));
    if (pr0.high && M.elev[u] >= pr0.base + 2) M.terr[u] = TI[pick(pr0.high)];
  }
  smooth(M, wet, S, 2);

  /* ---------- roads: one tile wide, bridged over water, eased to steps of one ---------- */
  for (const pts of roadPts) {
    let last = -1;
    for (const [px, py] of pts) {
      const x = Math.round(px), y = Math.round(py); if (!inb(x, y)) continue;
      for (const v of last >= 0 && last !== id(x, y) && last % S !== x && ((last / S) | 0) !== y ? [id(x, (last / S) | 0), id(x, y)] : [id(x, y)]) {
        if (road[v]) continue; road[v] = 1;
        if (wet[v]) { M.terr[v] = TI.planks; wet[v] = 0; M.elev[v] = 0; continue; }
        M.terr[v] = TI[clim === 'arid' ? 'dirt' : s && ['town', 'capital', 'city'].includes(s.kind) ? 'cobble' : 'road'];
      }
      last = id(x, y);
    }
  }
  for (let pass = 0; pass < 3; pass++) for (let u = 0; u < NN; u++) { if (!road[u]) continue; const x = u % S, y = (u / S) | 0; for (const [dx, dy] of N4) { const v = id(x + dx, y + dy); if (inb(x + dx, y + dy) && road[v] && M.elev[v] > M.elev[u] + 1) M.elev[v] = M.elev[u] + 1; } }

  /* ---------- placing pieces ---------- */
  const flat = (x, y, w, d) => { if (!inb(x, y)) return false; const e = M.elev[id(x, y)]; for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) { if (!inb(xx, yy) || M.elev[id(xx, yy)] !== e || road[id(xx, yy)] || keep[id(xx, yy)]) return false; } return true; };
  const place = (idn, x, y, face = Math.floor(rng() * 4), dry = true) => { const o = { id: idn, x, y, face, v: rng() }; const [w, d] = footprint(o); if (dry && !flat(x, y, w, d)) return null; if (!fits(M, o)) return null; M.objs.push(o); return o; };
  const level = (x0, y0, r, e) => { for (let y = Math.floor(y0 - r); y <= y0 + r; y++) for (let x = Math.floor(x0 - r); x <= x0 + r; x++) { if (!inb(x, y) || Math.hypot(x - x0, y - y0) > r) continue; const u = id(x, y); if (wet[u] && !road[u]) continue; M.elev[u] = e; } };
  const dryNear = (x0, y0) => { let best = -1, bd = 1e9; for (let u = 0; u < NN; u++) { if (wet[u] || road[u]) continue; const d = Math.hypot(u % S - x0, ((u / S) | 0) - y0); if (d < bd) { bd = d; best = u; } } return best < 0 ? null : [best % S, (best / S) | 0]; };
  const nearRoad = (x, y) => N4.find(([dx, dy]) => inb(x + dx, y + dy) && road[id(x + dx, y + dy)]);
  const faceTo = (dx, dy) => dy > 0 ? 0 : dx > 0 ? 1 : dy < 0 ? 2 : 3;
  /* houses along the roads (or round a green when no road comes in), doors to the street */
  const village = (n, pool, r) => {
    let made = 0;
    if (!roadSides.length) { const [hx, hy] = [Math.round(hub[0]), Math.round(hub[1])]; for (let k = -3; k <= 3; k++) for (const [x, y] of [[hx + k, hy], [hx, hy + k]]) if (inb(x, y) && !wet[id(x, y)]) { road[id(x, y)] = 1; M.terr[id(x, y)] = TI[clim === 'arid' ? 'dirt' : 'road']; } }
    for (let ring = 1; ring <= r && made < n; ring++) for (let k = -ring; k <= ring && made < n; k++) for (const [x, y] of [[hub[0] + k, hub[1] - ring], [hub[0] + k, hub[1] + ring], [hub[0] - ring, hub[1] + k], [hub[0] + ring, hub[1] + k]].map(([a, bb]) => [Math.round(a), Math.round(bb)])) {
      if (made >= n || !inb(x, y) || road[id(x, y)] || wet[id(x, y)] || rng() < 0.3) continue;
      const nr = nearRoad(x, y); if (!nr) continue;
      if (place(pick(pool), x, y, faceTo(nr[0], nr[1])) || place(pool[0], x, y, faceTo(nr[0], nr[1]))) made++;
    }
    return made;
  };
  const square = (r, ter) => { const [hx, hy] = [Math.round(hub[0]), Math.round(hub[1])], e = M.elev[id(hx, hy)]; level(hx, hy, r + 2.5, e); for (let y = hy - r; y <= hy + r; y++) for (let x = hx - r; x <= hx + r; x++) if (inb(x, y)) { const u = id(x, y); M.terr[u] = TI[ter]; road[u] = 1; wet[u] = 0; } return [hx, hy]; };
  const clear = (x0, y0, r) => { for (let u = 0; u < NN; u++) if (Math.hypot(u % S - x0, ((u / S) | 0) - y0) < r) keep[u] = 1; };
  const scatter = (ids, n, x0, y0, r) => { for (let j = 0, m = 0; j < n * 12 && m < n; j++) { const a = rng() * Math.PI * 2, d = rng() * r, x = Math.round(x0 + Math.cos(a) * d), y = Math.round(y0 + Math.sin(a) * d); if (inb(x, y) && !keep[id(x, y)] && place(pick(ids), x, y)) m++; } };

  /* ---------- farmland: a patchwork of plots with hedges, a barn and a haystack ---------- */
  if (map.farm[i] && !here.water) {
    const crops = clim === 'arid' ? ['vineyard', 'field', 'crops', 'garden'] : ['wheat', 'field', 'crops', 'wheat', 'pasture'];
    const pw = 4 + Math.floor(rng() * 2), ph = 3 + Math.floor(rng() * 2), ox = Math.floor(rng() * pw), oy = Math.floor(rng() * ph), seedC = Math.floor(rng() * 1e6);
    for (let u = 0; u < NN; u++) {
      if (wet[u] || road[u] || M.elev[u] > 3) continue;
      const x = u % S, y = (u / S) | 0, cx = Math.floor((x + ox) / pw), cy = Math.floor((y + oy) / ph), h = mulberry32(seedC + cx * 73 + cy * 911)();
      if (h < 0.15) continue;
      M.terr[u] = TI[crops[Math.floor(h * 97) % crops.length]];
      if ((y + oy) % ph === ph - 1 && rng() < 0.55) place('fence', x, y, 0); else if ((x + ox) % pw === pw - 1 && rng() < 0.08) place(pick(['oak', 'bush', 'poplar']), x, y);
      else if (h > 0.5 && rng() < 0.012) place(pick(['haystack', 'haybales', 'scarecrow']), x, y);
    }
    const spot = dryNear(hub[0] + 3, hub[1] - 2); if (spot && !s) { place(pick(['barn', 'granary', 'cottage']), spot[0], spot[1]); place('well', spot[0] + 2, spot[1] + 1); }
  }

  /* ---------- what stands in the hex ---------- */
  const kind = s ? s.kind : sub ? 'outskirts' : null, pool = TOWNS[clim];
  if (kind === 'village') { const [hx, hy] = square(1, clim === 'arid' ? 'dirt' : 'grass'); place('well', hx, hy, 0, false); village(7 + Math.floor(rng() * 4), pool.concat(['tavern']), 7); clear(hx, hy, 3); }
  else if (kind === 'town') {
    const [hx, hy] = square(2, clim === 'arid' ? 'flagstone' : 'cobble'); level(hx, hy, 9.5, M.elev[id(hx, hy)]); place(pick(['well', 'statue']), hx, hy, 0, false);
    for (const [dx, dy] of [[-2, -2], [2, 2], [-2, 2]]) place('stall', hx + dx, hy + dy, 0, false);
    for (const r of [5, 8]) for (let k = -r; k <= r; k++) for (const [x, y] of [[hx + k, hy - r], [hx + k, hy + r], [hx - r, hy + k], [hx + r, hy + k]]) if (inb(x, y) && !wet[id(x, y)] && Math.abs(M.elev[id(x, y)] - M.elev[id(hx, hy)]) <= 1) { road[id(x, y)] = 1; M.terr[id(x, y)] = TI[clim === 'arid' ? 'dirt' : 'cobble']; M.elev[id(x, y)] = M.elev[id(hx, hy)]; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 3; k <= 8; k++) { const x = hx + dx * k, y = hy + dy * k; if (inb(x, y) && !wet[id(x, y)]) { road[id(x, y)] = 1; M.terr[id(x, y)] = TI[clim === 'arid' ? 'dirt' : 'cobble']; M.elev[id(x, y)] = M.elev[id(hx, hy)]; } }
    village(26 + Math.floor(rng() * 6), pool.concat(['townhouse', 'townhouse', 'tavern', 'markethall', 'chapel', 'smithy', 'townhouse']), 10); clear(hx, hy, 4);
  }
  else if (kind === 'outskirts') { village(6 + Math.floor(rng() * 4), pool.concat(['smithy', 'barn']), 9); for (let u = 0; u < NN; u++) if (!road[u] && !wet[u] && nearRoad(u % S, (u / S) | 0) && rng() < 0.25) M.terr[u] = TI.garden; }
  else if (kind) feature(kind);

  function feature(k) {
    const at = dryNear(hub[0], hub[1]); if (!at) return;
    const [hx, hy] = at, e = M.elev[id(hx, hy)];
    const ring = (idn, r, n) => { for (let j = 0; j < n; j++) { const a = j / n * Math.PI * 2, x = Math.round(hx + Math.cos(a) * r), y = Math.round(hy + Math.sin(a) * r); place(idn, x, y, faceTo(hx - x, hy - y)); } };
    if (k === 'keep' || k === 'hillfort') {
      level(hx + 0.5, hy + 0.5, 4.5, Math.min(MAX_ELEV, e + (k === 'hillfort' ? 2 : 1))); place('keep', hx, hy, 0);
      place(k === 'hillfort' ? 'longhouse' : 'barn', hx - 3, hy + 1); place('watchtower', hx + 3, hy - 2); ring('fence', 5, 18); place('campfire', hx + 2, hy + 2);
    }
    else if (k === 'tower') { level(hx, hy, 2.5, e); place('stonetower', hx, hy, 0); scatter(['rocks', 'boulders', 'graves'], 3, hx, hy, 4); }
    else if (k === 'ruin') { level(hx, hy, 3, e); for (const [dx, dy] of [[0, 0], [2, 1], [-2, 1], [1, -2], [-1, 3]]) place('ruin', hx + dx, hy + dy); scatter(['rocks', 'graves', 'deadtree', 'stones'], 4, hx, hy, 6); }
    else if (k === 'cave' || k === 'mine') { level(hx, hy, 2.5, e); place('mine', hx, hy, 2); place('cart', hx + 1, hy + 1); place('crates', hx - 1, hy + 1); place('logpile', hx + 2, hy); scatter(['boulders', 'rocks'], 6, hx, hy, 5); if (k === 'cave') place('campfire', hx, hy + 2); }
    else if (k === 'windmill') { level(hx, hy, 2.5, e); place('windmill', hx, hy, 0); place('granary', hx + 2, hy); place('haystack', hx - 2, hy + 1); place('cart', hx, hy + 2); }
    else if (k === 'stones') { level(hx + 0.5, hy + 0.5, 3, e); place('stones', hx, hy, 0); place('obelisk', hx + 3, hy); clear(hx, hy, 4); }
    else if (k === 'lighthouse') { let lh = null; for (let u = 0; u < NN && !lh; u++) if (!wet[u] && !road[u] && dist[u] === 1 && rng() < 0.08) lh = place('lighthouse', u % S, (u / S) | 0, 0); if (!lh) place('lighthouse', hx, hy, 0); place('longhouse', hx + 2, hy); }
    else if (k === 'lair') { for (let u = 0; u < NN; u++) if (!wet[u] && Math.hypot(u % S - hx, ((u / S) | 0) - hy) < 5 + nz3(u % S / 3, ((u / S) | 0) / 3) * 1.5) M.terr[u] = TI.ash; scatter(['boulders', 'deadtree', 'graves', 'rocks'], 10, hx, hy, 6); clear(hx, hy, 6); }
    else if (k === 'volcano') {
      for (let u = 0; u < NN; u++) { if (wet[u]) continue; const d = Math.hypot(u % S - hx, ((u / S) | 0) - hy); if (d < 9) { M.elev[u] = Math.max(M.elev[u], Math.min(MAX_ELEV, Math.round(MAX_ELEV - d * 0.55))); M.terr[u] = TI[d < 1.8 ? 'lava' : d < 6 ? 'ash' : 'rock']; } }
      clear(hx, hy, 9); scatter(['deadtree', 'rocks', 'boulders'], 6, hx, hy, 12);
    }
    else if (k === 'wreck') { scatter(['crates', 'barrels', 'rocks'], 6, hx, hy, 4); for (let u = 0; u < NN; u++) if (wet[u] && dist[u] === 0 && M.terr[u] === TI.shallows && rng() < 0.05 && place('rowboat', u % S, (u / S) | 0, Math.floor(rng() * 4), false)) break; }
    else if (k === 'outpost') { level(hx, hy, 4, e); place('watchtower', hx, hy, 0); place('longhouse', hx + 2, hy); place('campfire', hx - 1, hy + 2); place('logpile', hx - 2, hy); ring('fence', 4, 14); clear(hx, hy, 5); }
    else if (k === 'waterfall') { for (let u = 0; u < NN; u++) { const t = P[u * 2] * (sides[riverSides[0] ?? 0].dx) + P[u * 2 + 1] * (sides[riverSides[0] ?? 0].dy); if (t > 0.1) M.elev[u] = Math.min(MAX_ELEV, M.elev[u] + 3); } scatter(['rocks', 'boulders', 'reeds'], 8, hx, hy, 6); }
    else if (k === 'temple' || k === 'capital' || k === 'city') { level(hx, hy, 3, e); place('temple', hx, hy, 0); }
  }

  /* ---------- boats on open water, reeds at the edges ---------- */
  const o = map.ornAt.get(i);
  for (let u = 0, boats = here.water ? (o && o.type === 'ship' ? 4 : 1 + Math.floor(rng() * 2)) : 0; u < NN && boats > 0; u++) { const v = Math.floor(rng() * NN); if (wet[v] && dist[v] === 0 && M.terr[v] !== TI.deep && place('rowboat', v % S, (v / S) | 0, Math.floor(rng() * 4), false)) boats--; }
  for (let u = 0; u < NN; u++) if (wet[u] && (M.terr[u] === TI.shallows || river[u]) && clim !== 'cold' && rng() < (b === 'swamp' ? 0.3 : 0.08) && N4.some(([dx, dy]) => inb(u % S + dx, ((u / S) | 0) + dy) && !wet[id(u % S + dx, ((u / S) | 0) + dy)])) place('reeds', u % S, (u / S) | 0, 0, false);

  /* ---------- nature, by the ground each tile ended up with ---------- */
  for (let u = 0; u < NN; u++) {
    if (wet[u] || road[u] || keep[u]) continue;
    const x = u % S, y = (u / S) | 0, [k, t] = lean(u), nbB = k >= 0 && t > 0.62 ? map.B[sides[k].n] : b, pr = LAND[nbB] || pr0, T = TERRAIN[M.terr[u]].id;
    if (['wheat', 'field', 'crops', 'vineyard', 'garden', 'pasture', 'plaza', 'cobble', 'planks', 'lava', 'sand'].includes(T) && !(T === 'sand' && clim === 'arid')) continue;
    if (s && Math.hypot(x - hub[0], y - hub[1]) < (s.kind === 'town' ? 9 : 6) && rng() < 0.85) continue;
    const wood = nz3(x / 6 + 11, y / 6 - 4) * 0.5 + 0.5, p = pr.tp * (0.4 + wood * 1.6) * (map.farm[i] ? 0.3 : 1);
    if (rng() < Math.min(pr.wood, p)) { place(pick(pr.trees), x, y); continue; }
    if (rng() < 0.02) place(pick(pr.props), x, y);
  }
  return M;
}

/* knock down lone spikes and fill lone pits so the land steps in terraces */
/* broad patches with the biome's first ground dominant: noise n in -1..1 */
const groundOf = (pr, n) => { const g = pr.ground, f = Math.max(0, Math.min(0.999, (n + 0.55) / 1.1)); return f < 0.55 ? g[0] : g[1 + Math.floor((f - 0.55) / 0.45 * (g.length - 1))]; };

function smooth(M, wet, S, passes) {
  for (let pass = 0; pass < passes; pass++) {
    const E = M.elev.slice();
    for (let u = 0; u < S * S; u++) {
      if (wet[u]) continue; const x = u % S, y = (u / S) | 0, nb = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < S && yy < S && !wet[yy * S + xx]) nb.push(E[yy * S + xx]); }
      nb.sort((a, b) => a - b); M.elev[u] = nb[nb.length >> 1];
    }
  }
}

function hexName(map, i, s, sub) {
  const b = map.B[i], reg = map.regionOf[i] >= 0 ? map.regions[map.regionOf[i]].name : null;
  const lake = map.lakeOf[i] >= 0 ? map.lakes[map.lakeOf[i]] : null, sea = map.seaOf[i] >= 0 ? map.seas[map.seaOf[i]] : null;
  const what = s ? s.name : sub ? `Outskirts of ${sub.name}` : lake && lake.name ? lake.name : sea && sea.name ? sea.name : reg || (map.farm[i] ? 'Farmland' : BIOME[b].name);
  return `${what}, hex ${hexNo(i)}`.slice(0, 60);
}

export { HEX_TILES, hexToModel };
