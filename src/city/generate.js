import { NB, TAU } from '../core/geometry.js';
import { makeNoise, mulberry32 } from '../core/random.js';
import { buildCathedral, buildMonastery, cathedralDims, makeBuilder, monasteryDims } from './architecture.js';
import { ADJ2, makeNamer } from '../core/names.js';
import { BIOME } from '../world/data.js';
import { ROOFS, climate, hexRgb, lerp } from '../render/palette.js';
import { footprint } from '../tiles/index.js';

/* ================= city districts: generation ================= */
const CT = { GRASS: 0, SEA: 1, RIVER: 2, SAND: 3, FIELD: 4, FOREST: 5, STREET: 6, PLAZA: 7, DOCK: 8, GARDEN: 9, YARD: 10, GRAVE: 11, BRIDGE: 12, ROAD: 13, MEADOW: 14, MARSH: 15, SCREE: 16, SNOW: 17, HEATH: 18 };
const TWH = 16, THH = 8, FH = 9, EL = 8, YARDS_PER_TILE = 25;
const SLATE = ['#6d7a86', '#4d5862'], COPPER = ['#6f9a8c', '#4f7a6c'], TERRA = ['#b8643f', '#8a4529'], BROWN = ['#8a6a4a', '#664c33'], WEATHER = ['#7d7468', '#5c544a'];
const DTYPE = {
  citadel:   { label: 'Citadel', walls: ['#ece4d2', '#e2d8c2'], roofs: [SLATE], floors: [2, 3], sizes: [[2, 2], [2, 3], [3, 2]], lane: [6, 7], timber: 0, dense: 0.45, gardens: true },
  market:    { label: 'Market quarter', walls: ['#f0e4c6', '#e9d6ae', '#f3ead6'], roofs: [ROOFS[0], TERRA], floors: [2, 4], sizes: [[1, 1], [1, 2], [2, 1], [2, 2]], lane: [4, 5], timber: 0.45, dense: 0.95 },
  cathedral: { label: 'Cathedral close', walls: ['#ebe2cc', '#e2d6b8'], roofs: [SLATE, ROOFS[0]], floors: [2, 3], sizes: [[1, 2], [2, 1], [2, 2]], lane: [4, 6], timber: 0.2, dense: 0.8, gardens: true },
  noble:     { label: 'Noble quarter', walls: ['#f4eee0', '#ece2cc'], roofs: [SLATE, COPPER], floors: [2, 3], sizes: [[2, 2], [2, 3], [3, 2]], lane: [5, 7], timber: 0, dense: 0.55, gardens: true },
  merchants: { label: 'Merchants\' ward', walls: ['#efe0c0', '#f2e6cc', '#e6cfa6'], roofs: [ROOFS[0], TERRA], floors: [3, 4], sizes: [[1, 2], [2, 1], [2, 2], [1, 1]], lane: [4, 5], timber: 0.35, dense: 0.95 },
  artisans:  { label: 'Artisans\' ward', walls: ['#e9d9b6', '#e2cda4'], roofs: [ROOFS[2], ROOFS[0], BROWN], floors: [2, 3], sizes: [[1, 1], [1, 2], [2, 1], [2, 2]], lane: [3, 5], timber: 0.6, dense: 0.9 },
  oldtown:   { label: 'Old town', walls: ['#e8d6b0', '#efdfc0', '#dfc9a0'], roofs: [ROOFS[0], BROWN, ROOFS[2]], floors: [2, 4], sizes: [[1, 1], [1, 1], [1, 2], [2, 1]], lane: [3, 4], timber: 0.7, dense: 1 },
  harbour:   { label: 'Harbour', walls: ['#d9c8a6', '#cdbb96'], roofs: [WEATHER, ROOFS[0]], floors: [1, 2], sizes: [[1, 3], [3, 1], [2, 3], [3, 2], [1, 2]], lane: [4, 6], timber: 0.3, dense: 0.85 },
  slums:     { label: 'The warrens', walls: ['#d8c6a0', '#cdb890'], roofs: [ROOFS[2], ['#9a8460', '#76633f']], floors: [1, 1], sizes: [[1, 1]], lane: [3, 4], timber: 0.2, dense: 0.8 },
  temple:    { label: 'Temple precinct', walls: ['#f2ead8', '#e8dcc0'], roofs: [SLATE, ROOFS[0]], floors: [1, 2], sizes: [[1, 2], [2, 2]], lane: [5, 6], timber: 0, dense: 0.55, gardens: true },
  garrison:  { label: 'Garrison', walls: ['#d8d2c4', '#cbc4b2'], roofs: [SLATE], floors: [2, 2], sizes: [[1, 3], [3, 1], [1, 2]], lane: [5, 6], timber: 0, dense: 0.55 },
  scholars:  { label: 'Scholars\' quarter', walls: ['#efe8d6', '#e6dcc4'], roofs: [SLATE, COPPER], floors: [2, 3], sizes: [[2, 2], [1, 2], [2, 1]], lane: [4, 6], timber: 0.1, dense: 0.8, gardens: true },
  precinct:  { label: 'Abbey precinct', walls: ['#e8dec7'], roofs: [ROOFS[0]], floors: [1, 2], sizes: [[1, 1]], lane: [0, 0], timber: 0, dense: 0, gardens: true },
  grange:    { label: 'Grange', walls: ['#e6d4ae', '#dcc8a0', '#e9dcc0'], roofs: [ROOFS[2], ROOFS[0]], floors: [1, 2], sizes: [[1, 1], [1, 2], [2, 1], [2, 2]], lane: [0, 0], timber: 0.4, dense: 0 },
  outer:     { label: 'Outskirts', walls: ['#e6d4ae', '#dcc8a0'], roofs: [ROOFS[2], ROOFS[0]], floors: [1, 2], sizes: [[1, 1], [1, 2], [2, 1]], lane: [0, 0], timber: 0.4, dense: 0 }
};
const TAVERNS = ['The Crooked Lantern', 'The Drowned Rat', 'The Gilded Goose', 'The Three Crowns', 'The Salt and Anchor', 'The Sleeping Giant', 'The Wyvern\'s Rest', 'The Bent Nail', 'The Pilgrim\'s Purse', 'The Black Kettle', 'The Merry Gallows', 'The Last Candle', 'The Hanged Harper', 'The Mermaid\'s Comb'];
const DDESC = {
  citadel: c => c.cap ? `${c.lm} crowns a walled mound above the rooftops. Its gate opens only at the sound of the horn.` : `${c.lm} squats on its mound above the city, more barracks than palace.`,
  market: c => `Awnings crowd the great square around ${c.lm}. Every road in ${c.city} ends here eventually.`,
  cathedral: c => `The spire of ${c.lm} can be seen from a day's ride away. Canons and clerks keep quiet houses in its shadow.`,
  noble: c => `Walled gardens, slate roofs and liveried servants. ${c.lm} hosts the season's balls.`,
  merchants: c => 'Tall counting-houses with hoists on their top floors. Coin changes hands here faster than gossip.',
  artisans: c => `Forge smoke and dye-vats. ${c.lm} sets the price of every nail and every bolt of cloth.`,
  oldtown: c => `The oldest lanes in ${c.city}, crooked and overhung. Half the houses lean on their neighbours.`,
  harbour: c => c.hasLm ? `Warehouses, ropewalks and the smell of tar. ${c.lm} guides ships in past the breakwater.` : 'Warehouses, ropewalks and the smell of tar along the quays.',
  slums: c => 'Thatched hovels packed against the wall. The watch comes here in pairs or not at all.',
  temple: c => `A quiet precinct of gardens around ${c.lm}. Pilgrims sleep under its colonnade.`,
  garrison: c => `Barracks and a dusty drill yard. ${c.lm} houses the city watch and the levy.`,
  scholars: c => `Cloisters, libraries and an observatory tower. ${c.lm} admits those who can pay or argue.`,
  outer: c => 'Inns, smithies and farmsteads strung along the roads outside the gates.',
  precinct: c => `${c.lm} and its cloister, ranges and gardens lie within a low precinct wall. The community keeps the hours from matins to compline.`,
  grange: c => 'Barns, cottages and strip fields worked by lay brothers for the abbey.'
};

function generateCity(map, s) {
  const rng = mulberry32((map.seedHash ^ Math.imul(s.i + 7, 2246822519)) >>> 0);
  const pick = a => a[Math.floor(rng() * a.length)];
  const shuffle = a => { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const nm = makeNamer(rng), P = nm.P, raw = nm.rawName;
  const cap = s.kind === 'capital', abbey = s.kind === 'temple', S = abbey ? 40 : cap ? 60 : 50, NN = S * S;
  const id = (x, y) => y * S + x, inb = (x, y) => x >= 0 && y >= 0 && x < S && y < S;
  const T = new Uint8Array(NN), elev = new Uint8Array(NN), dist = new Int16Array(NN).fill(-1), occ = new Uint8Array(NN);
  const tint = new Float32Array(NN), ftint = new Uint8Array(NN), inside = new Uint8Array(NN), mainSt = new Uint8Array(NN);
  const nz = makeNoise(rng), nz2 = makeNoise(rng);
  const hi = s.i, clim = climate(map, hi);
  const vec = d => { const a = (30 + 60 * d) * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };
  const waterDirs = [], roadDirs = [], forestDirs = [], hillDirs = [], landDirs = [];
  for (let d = 0; d < 6; d++) {
    const n = NB[hi][d];
    if (n < 0 || BIOME[map.B[n]].water) { waterDirs.push(d); continue; }
    landDirs.push(d);
    const b = map.B[n];
    if (map.onRoad[n] && map.onRoad[hi]) roadDirs.push(d);
    if (b === 'forest' || b === 'deepwood' || b === 'taiga') forestDirs.push(d);
    if (b === 'hills' || b === 'mountain' || b === 'peak') hillDirs.push(d);
  }
  // the hexes this place has spilled into: the suburbs run out that way
  const sIdx = map.settle.indexOf(s), sprawlDirs = [];
  if (map.sprawl) for (let d = 0; d < 6; d++) { const n = NB[hi][d]; if (n >= 0 && map.sprawl[n] === sIdx) sprawlDirs.push(d); }
  let waterName = null, isLake = false;
  for (const d of waterDirs) {
    const n = NB[hi][d]; if (n < 0) continue;
    if (map.lakeOf[n] >= 0) { isLake = true; waterName = map.lakes[map.lakeOf[n]].name || null; }
    else if (map.seaOf[n] >= 0) { isLake = false; waterName = map.seas[map.seaOf[n]].name; break; }
  }
  const isWater = t => T[t] === CT.SEA || T[t] === CT.RIVER;

  /* coast */
  const c0 = S / 2, thr = 0.19 + 0.035 * Math.max(0, waterDirs.length - 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = id(x, y), px = (x + 0.5 - c0) / S, py = (y + 0.5 - c0) / S;
    tint[t] = nz(x / 7, y / 7);
    let sea = false, beach = false;
    for (const d of waterDirs) { const [vx, vy] = vec(d), pr = px * vx + py * vy, th = thr + 0.045 * nz(x / 9 + d * 11, y / 9); if (pr > th) sea = true; else if (pr > th - 0.03) beach = true; }
    T[t] = sea ? CT.SEA : beach ? CT.SAND : CT.GRASS;
  }
  let wx = 0, wy = 0; for (const d of waterDirs) { const [vx, vy] = vec(d); wx += vx; wy += vy; }
  const cx = c0 - wx * S * 0.045, cy = c0 - wy * S * 0.045;

  /* river */
  let river = null, rCurve = null; const chan = new Uint8Array(NN);
  const ri = map.riverOf[hi];
  if (ri >= 0) {
    const path = map.rivers[ri].path, k = path.indexOf(hi);
    const dirTo = (a, b) => NB[a].indexOf(b);
    let din = k > 0 ? dirTo(hi, path[k - 1]) : -1, dout = k >= 0 && k < path.length - 1 ? dirTo(hi, path[k + 1]) : -1;
    if (dout < 0 && waterDirs.length) dout = waterDirs[0];
    if (dout >= 0) {
      if (din < 0 || din === dout) din = (dout + 3) % 6;
      const [ax, ay] = vec(din), [bx, by] = vec(dout);
      const p0 = [c0 + ax * S * 0.75, c0 + ay * S * 0.75], p2 = [c0 + bx * S * 0.75, c0 + by * S * 0.75];
      const dx = p2[0] - p0[0], dy = p2[1] - p0[1], L = Math.hypot(dx, dy) || 1, off = S * 0.09 * (rng() < 0.5 ? 1 : -1);
      const ctrl = [cx + (-dy / L) * off, cy + (dx / L) * off], w = abbey ? 1.1 : cap ? 1.5 : 1.25, wm = w + 0.5;
      for (let t = 0; t <= 1; t += 0.002) {
        const qx = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * ctrl[0] + t * t * p2[0], qy = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * ctrl[1] + t * t * p2[1];
        for (let yy = Math.floor(qy - wm - 1); yy <= qy + wm + 1; yy++) for (let xx = Math.floor(qx - wm - 1); xx <= qx + wm + 1; xx++)
          if (inb(xx, yy) && Math.hypot(xx + 0.5 - qx, yy + 0.5 - qy) <= wm && T[id(xx, yy)] !== CT.SEA) { T[id(xx, yy)] = CT.RIVER; chan[id(xx, yy)] = 1; }
      }
      rCurve = { p0, ctrl, p2, w };
      river = map.rivers[ri].name;
    }
  }

  /* walls */
  let rW = S * (cap ? 0.3 : 0.27); const wall = [];
  let AB = null;
  if (abbey) {
    const dm = monasteryDims('abbey'); let o = Math.floor(rng() * 4), found = false, X0 = 0, Y0 = 0, tw = 0, td = 0;
    const okRect = (x0, y0, w, d) => { for (let y = y0 - 2; y < y0 + d + 2; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) if (!inb(x, y) || isWater(id(x, y))) return false; return true; };
    for (const oo of [o, (o + 1) % 4, (o + 2) % 4, (o + 3) % 4]) {
      tw = Math.ceil(oo % 2 ? dm.D : dm.W); td = Math.ceil(oo % 2 ? dm.W : dm.D);
      for (let r = 0; r < 12 && !found; r++) { const n = Math.max(1, r * 8); for (let k = 0; k < n && !found; k++) { const a = k / n * TAU, x0 = Math.round(cx + Math.cos(a) * r - tw / 2), y0 = Math.round(cy + Math.sin(a) * r - td / 2); if (okRect(x0, y0, tw, td)) { X0 = x0; Y0 = y0; found = true; } } }
      if (found) { o = oo; break; }
    }
    if (!found) { tw = Math.ceil(o % 2 ? dm.D : dm.W); td = Math.ceil(o % 2 ? dm.W : dm.D); X0 = Math.round(S / 2 - tw / 2); Y0 = Math.round(S / 2 - td / 2); for (let y = Y0 - 2; y < Y0 + td + 2; y++) for (let x = X0 - 2; x < X0 + tw + 2; x++) if (inb(x, y) && isWater(id(x, y))) T[id(x, y)] = CT.GRASS; }
    const m = 1.4; wall.push([X0 - m, Y0 - m], [X0 + tw + m, Y0 - m], [X0 + tw + m, Y0 + td + m], [X0 - m, Y0 + td + m]);
    AB = { X0, Y0, tw, td, o, dm, gx: X0 + tw / 2, gy: Y0 + td / 2 };
    rW = Math.max(tw, td) / 2 + m;
  } else {
    const nv = cap ? 15 : 12, a0 = rng() * TAU;
    for (let k = 0; k < nv; k++) { const a = a0 + k / nv * TAU + (rng() - 0.5) * 0.2, r = rW * (0.9 + rng() * 0.2); wall.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  }
  const pip = (x, y, poly) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xa, ya] = poly[a], [xb, yb] = poly[b]; if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) c = !c; } return c; };
  const segD = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1; let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); };
  const band = (poly, w) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { for (let k = 0; k < poly.length; k++) if (segD(x + 0.5, y + 0.5, poly[k], poly[(k + 1) % poly.length]) < w) { occ[id(x, y)] = 2; break; } } };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const t = id(x, y); if (pip(x + 0.5, y + 0.5, wall) && !isWater(t)) { inside[t] = 1; if (T[t] === CT.SAND) T[t] = CT.GRASS; } }
  band(wall, abbey ? 0.6 : 0.8);
  if (abbey) for (let y = AB.Y0; y < AB.Y0 + AB.td; y++) for (let x = AB.X0; x < AB.X0 + AB.tw; x++) { const t = id(x, y); occ[t] = 1; T[t] = CT.YARD; }

  /* citadel */
  let ax = -wx, ay = -wy;
  for (const d of hillDirs) { const [vx, vy] = vec(d); ax += vx * 1.4; ay += vy * 1.4; }
  if (Math.hypot(ax, ay) < 0.2) { const a = rng() * TAU; ax = Math.cos(a); ay = Math.sin(a); }
  { const l = Math.hypot(ax, ay); ax /= l; ay /= l; }
  const rc = cap ? 5.3 : 3.7;
  const fits = (px, py) => { for (let y = Math.floor(py - rc - 1); y <= py + rc + 1; y++) for (let x = Math.floor(px - rc - 1); x <= px + rc + 1; x++) { if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > rc + 0.7) continue; if (!inb(x, y)) return false; const t = id(x, y); if (!inside[t] || occ[t]) return false; } return true; };
  let ccx = cx, ccy = cy;
  if (!abbey) { const baseA = Math.atan2(ay, ax); let found = false;
    for (const f of [0.5, 0.42, 0.34, 0.25, 0.15, 0]) { for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, 2.6, -2.6, Math.PI]) { const a = baseA + off, px = cx + Math.cos(a) * rW * f, py = cy + Math.sin(a) * rW * f; if (fits(px, py)) { ccx = px; ccy = py; found = true; break; } } if (found) break; } }
  const citTiles = [];
  const citRing = [];
  if (!abbey) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const t = id(x, y), dd = Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy); if (dd <= rc && inside[t]) { elev[t] = cap && dd <= rc * 0.62 ? 2 : 1; citTiles.push(t); } }
    for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + 0.2; citRing.push([ccx + Math.cos(a) * (rc + 0.25), ccy + Math.sin(a) * (rc + 0.25)]); }
    band(citRing, 0.7);
  }

  /* market square */
  const pw = cap ? 6 : 5, ph = cap ? 5 : 4;
  const plazaOk = (x0, y0) => { for (let y = y0; y < y0 + ph; y++) for (let x = x0; x < x0 + pw; x++) { if (!inb(x, y)) return false; const t = id(x, y); if (!inside[t] || occ[t] || elev[t] || T[t] !== CT.GRASS) return false; } return true; };
  let plaza = null; const pxc = cx - ax * rW * 0.14, pyc = cy - ay * rW * 0.14;
  if (abbey) plaza = [Math.floor(AB.gx), Math.floor(AB.gy)];
  for (let r = 0; r < 14 && !plaza; r++) { const n = Math.max(1, r * 8); for (let k = 0; k < n && !plaza; k++) { const a = k / n * TAU, x0 = Math.round(pxc + Math.cos(a) * r - pw / 2), y0 = Math.round(pyc + Math.sin(a) * r - ph / 2); if (plazaOk(x0, y0)) plaza = [x0, y0]; } }
  if (!plaza) plaza = [Math.round(cx - pw / 2), Math.round(cy - ph / 2)];
  if (!abbey) for (let y = plaza[1]; y < plaza[1] + ph; y++) for (let x = plaza[0]; x < plaza[0] + pw; x++) if (inb(x, y) && !isWater(id(x, y))) T[id(x, y)] = CT.PLAZA;
  const plazaC = [plaza[0] + pw / 2, plaza[1] + ph / 2];

  /* gates */
  let gateDirs = [...new Set([...roadDirs, ...sprawlDirs])]; const extra = shuffle(landDirs.filter(d => !gateDirs.includes(d))), minG = abbey ? 1 : cap ? 4 : 3;
  while (gateDirs.length < minG && extra.length) gateDirs.push(extra.pop());
  if (abbey) gateDirs = gateDirs.slice(0, 1);
  const gcx = abbey ? AB.gx : cx, gcy = abbey ? AB.gy : cy;
  const gates = [];
  for (const d of gateDirs) {
    const [vx, vy] = vec(d); let px = null, py = null;
    for (let t = 0; t < S; t += 0.25) { const qx = gcx + vx * t, qy = gcy + vy * t; if (!pip(qx, qy, wall)) { px = qx; py = qy; break; } }
    if (px === null) continue;
    const ino = abbey ? 0.95 : 1.6, outo = abbey ? 1.3 : 1.6, inx = Math.floor(px - vx * ino), iny = Math.floor(py - vy * ino), oux = Math.floor(px + vx * outo), ouy = Math.floor(py + vy * outo);
    if (!inb(oux, ouy) || !inb(inx, iny) || isWater(id(oux, ouy)) || isWater(id(inx, iny)) || !inside[id(inx, iny)] || (abbey && occ[id(inx, iny)] === 1)) continue;
    gates.push({ d, x: px, y: py, inx, iny, oux, ouy, name: abbey ? 'The Abbey Gate' : nm.uniq([() => `${P()}gate`]) });
  }

  /* streets */
  const D4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function gridPath(sx, sy, tx, ty, cost) {
    const NS = NN * 4, g = new Float32Array(NS).fill(Infinity), from = new Int32Array(NS).fill(-1), closed = new Uint8Array(NS), heap = [];
    const push = it => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    for (let d = 0; d < 4; d++) { const st = id(sx, sy) * 4 + d; g[st] = 0; push([0, st]); }
    while (heap.length) {
      const [, st] = pop(); if (closed[st]) continue; closed[st] = 1;
      const t = st >> 2, d = st & 3, x = t % S, y = (t / S) | 0;
      if (x === tx && y === ty) { const out = []; let k = st; while (k >= 0) { out.push(k >> 2); k = from[k]; } return out.reverse(); }
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        const nx = x + D4[nd][0], ny = y + D4[nd][1]; if (!inb(nx, ny)) continue;
        const c = cost(id(nx, ny)); if (!isFinite(c)) continue;
        const ns = id(nx, ny) * 4 + nd, ngv = g[st] + c + (nd !== d ? 2.2 : 0);
        if (ngv < g[ns]) { g[ns] = ngv; from[ns] = st; push([ngv + Math.abs(nx - tx) + Math.abs(ny - ty), ns]); }
      }
    }
    return null;
  }
  const nearGate = t => { const x = t % S + 0.5, y = ((t / S) | 0) + 0.5; return gates.some(g => Math.hypot(g.x - x, g.y - y) < 1.9); };
  const streetish = t => T[t] === CT.STREET || T[t] === CT.PLAZA || T[t] === CT.BRIDGE || T[t] === CT.ROAD;
  const n01 = t => (nz2((t % S) / 5, ((t / S) | 0) / 5) + 1) / 2;
  const innerCost = t => { if (T[t] === CT.SEA) return Infinity; const ng = nearGate(t); if (!inside[t] && !ng && T[t] !== CT.RIVER) return Infinity; if (occ[t] === 2 && !ng) return Infinity; if (elev[t]) return Infinity; if (T[t] === CT.RIVER) return 6; if (streetish(t)) return 0.45; return 1 + 0.8 * n01(t); };
  const outerCost = t => { if (T[t] === CT.SEA || inside[t] || (occ[t] === 2 && !nearGate(t))) return Infinity; if (T[t] === CT.RIVER) return 5; if (T[t] === CT.ROAD) return 0.5; return 1 + 0.8 * n01(t); };
  const mark = path => { for (const t of path) { mainSt[t] = 1; if (T[t] === CT.RIVER) T[t] = CT.BRIDGE; else if (T[t] === CT.GRASS || T[t] === CT.SAND) T[t] = inside[t] || occ[t] === 2 ? CT.STREET : CT.ROAD; } };
  for (const g of gates) {
    const p = abbey ? gridPath(g.oux, g.ouy, g.inx, g.iny, innerCost) : gridPath(g.oux, g.ouy, Math.floor(plazaC[0]), Math.floor(plazaC[1]), innerCost); if (p) mark(p);
    const [vx, vy] = vec(g.d);
    let ex = Math.round(c0 + vx * S), ey = Math.round(c0 + vy * S); const k = Math.max(Math.abs(ex - c0), Math.abs(ey - c0)) / (S / 2 - 0.5);
    ex = Math.max(0, Math.min(S - 1, Math.round(c0 + (ex - c0) / k))); ey = Math.max(0, Math.min(S - 1, Math.round(c0 + (ey - c0) / k)));
    if (!isWater(id(ex, ey))) { const p2 = gridPath(g.oux, g.ouy, ex, ey, outerCost); if (p2) mark(p2); }
  }
  // road up to the citadel
  const citCost = t => { if (T[t] === CT.SEA) return Infinity; if (!inside[t]) return Infinity; if (T[t] === CT.RIVER) return 6; if (streetish(t)) return 0.45; return elev[t] ? 1.1 : 1 + 0.6 * n01(t); };
  if (!abbey) { const p = gridPath(Math.floor(plazaC[0]), Math.floor(plazaC[1]), Math.floor(ccx), Math.floor(ccy), citCost); if (p) mark(p); }
  // waterfront quay
  const quay = [];
  if (!abbey) for (let t = 0; t < NN; t++) { if (!inside[t] || T[t] !== CT.GRASS || elev[t]) continue; const x = t % S, y = (t / S) | 0; if (D4.some(([dx, dy]) => inb(x + dx, y + dy) && T[id(x + dx, y + dy)] === CT.SEA)) quay.push(t); }
  const coastal = quay.length >= 4;
  if (coastal) { quay.forEach(t => { T[t] = CT.STREET; mainSt[t] = 1; }); const q = quay[Math.floor(quay.length / 2)]; const p = gridPath(Math.floor(plazaC[0]), Math.floor(plazaC[1]), q % S, (q / S) | 0, innerCost); if (p) mark(p); }

  /* districts */
  const seeds = abbey ? [{ type: 'precinct', x: AB.gx, y: AB.gy }] : [{ type: 'market', x: plazaC[0], y: plazaC[1] }, { type: 'citadel', x: ccx, y: ccy }];
  if (coastal) { let sx = 0, sy = 0; quay.forEach(t => { sx += t % S + 0.5; sy += ((t / S) | 0) + 0.5; }); sx /= quay.length; sy /= quay.length; const l = Math.hypot(wx, wy) || 1; seeds.push({ type: 'harbour', x: sx - wx / l * 2.5, y: sy - wy / l * 2.5 }); }
  const insideT = []; for (let t = 0; t < NN; t++) if (inside[t] && !occ[t] && !elev[t]) insideT.push(t);
  const want = abbey ? 1 : cap ? 9 : 7; let guard = 0;
  while (seeds.length < want && guard++ < 900) { const t = insideT[Math.floor(rng() * insideT.length)], x = t % S + 0.5, y = ((t / S) | 0) + 0.5; if (seeds.every(q => Math.hypot(q.x - x, q.y - y) > rW * 0.44)) seeds.push({ type: null, x, y }); }
  const free = seeds.filter(q => !q.type).sort((a, b) => Math.hypot(a.x - ccx, a.y - ccy) - Math.hypot(b.x - ccx, b.y - ccy));
  let pool = shuffle(cap ? ['merchants', 'artisans', 'oldtown', 'temple', 'garrison', 'scholars'] : ['artisans', 'oldtown', 'temple', 'garrison']);
  pool.unshift('cathedral');
  if (free.length) free[0].type = cap ? 'noble' : 'merchants';
  if (free.length > 2) free[free.length - 1].type = 'slums';
  for (const q of free) if (!q.type) q.type = pool.shift() || 'oldtown';
  const districts = seeds.map((q, k) => ({ id: k, type: q.type, sx: q.x, sy: q.y, tiles: 0, bcount: 0, name: '' }));
  for (let t = 0; t < NN; t++) {
    if (!inside[t]) continue;
    if (elev[t]) { dist[t] = 1; continue; }
    const x = t % S + 0.5, y = ((t / S) | 0) + 0.5; let best = 0, bd = 1e9;
    seeds.forEach((q, k) => { let dd = Math.hypot(q.x - x, q.y - y) * (1 + 0.28 * nz2(x / 8 + k * 19.3, y / 8 - k * 7.1)); if (q.type === 'citadel') dd *= 1.4; if (dd < bd) { bd = dd; best = k; } });
    dist[t] = best;
  }
  const outerId = districts.length; districts.push({ id: outerId, type: abbey ? 'grange' : 'outer', sx: cx, sy: cy, tiles: 0, bcount: 0, name: '' });
  // how far the outskirts reach in each direction: further toward the hexes the town has sprawled into
  const reach = (px, py) => { const dx = px - gcx, dy = py - gcy, L = Math.hypot(dx, dy) || 1; let r = rW + 7; for (const d of sprawlDirs) { const [vx, vy] = vec(d), c = (dx * vx + dy * vy) / L; if (c > 0.78) r = Math.max(r, rW + 7 + (S * 0.62 - rW - 7) * Math.min(1, (c - 0.78) / 0.15) + 2.5 * nz(px / 4 + 9, py / 4 - 3)); } return r; };   // a narrow tongue toward each suburb, with a ragged edge
  for (let t = 0; t < NN; t++) { if (inside[t] || isWater(t) || occ[t] === 2 || pip(t % S + 0.5, ((t / S) | 0) + 0.5, wall)) continue; if (Math.hypot(t % S + 0.5 - gcx, ((t / S) | 0) + 0.5 - gcy) < reach(t % S + 0.5, ((t / S) | 0) + 0.5)) dist[t] = outerId; }
  // suburban lanes: side streets off the roads running out through the sprawl, and lanes off those, a loose grid
  if (sprawlDirs.length && !abbey) {
    const inBand = t => { const x = t % S + 0.5, y = ((t / S) | 0) + 0.5, r = Math.hypot(x - gcx, y - gcy); return dist[t] === outerId && r > rW + 2 && r < reach(x, y) - 1.5; };
    const open = u => inBand(u) && !occ[u] && !inside[u] && (T[u] === CT.GRASS || T[u] === CT.SAND || T[u] === CT.ROAD);
    // a high street running out into each suburb, from the nearest road or gate to the far end of the built-up band
    for (const d of sprawlDirs) {
      const [vx, vy] = vec(d); let tgt = -1, ts = -1e9;
      for (let t = 0; t < NN; t++) { if (!open(t)) continue; const x = t % S + 0.5 - gcx, y = ((t / S) | 0) + 0.5 - gcy, L = Math.hypot(x, y) || 1, c = (x * vx + y * vy) / L; if (c < 0.45) continue; const sc = L * c + rng() * 2; if (sc > ts) { ts = sc; tgt = t; } }
      if (tgt < 0) continue;
      let src = -1, sd = 1e9;
      for (let t = 0; t < NN; t++) { if (inside[t] || isWater(t) || !(T[t] === CT.ROAD || T[t] === CT.STREET || T[t] === CT.BRIDGE)) continue; const dd = Math.hypot(t % S - tgt % S, ((t / S) | 0) - ((tgt / S) | 0)); if (dd < sd) { sd = dd; src = t; } }
      if (src < 0 || sd < 4) continue;
      const path = gridPath(src % S, (src / S) | 0, tgt % S, (tgt / S) | 0, u => u === src || u === tgt ? 1 : T[u] === CT.ROAD ? 0.5 : open(u) ? 1 + 0.4 * n01(u) : Infinity);
      if (path) for (const u of path) if (open(u)) T[u] = CT.ROAD;
    }
    let seeds = []; for (let t = 0; t < NN; t++) if (T[t] === CT.ROAD && inBand(t)) seeds.push(t);
    for (let gen = 0; gen < 2; gen++) {
      const made = [], used = [];
      for (const t of shuffle(seeds)) {
        if (used.some(u => Math.abs(u % S - t % S) + Math.abs(((u / S) | 0) - ((t / S) | 0)) < (gen ? 5 : 3))) continue;
        const x = t % S, y = (t / S) | 0, horiz = (x > 0 && T[id(x - 1, y)] === CT.ROAD) || (x < S - 1 && T[id(x + 1, y)] === CT.ROAD);
        for (const sd of [-1, 1]) {
          if (gen && rng() < 0.5) continue;
          const len = 3 + Math.floor(rng() * (gen ? 3 : 6));
          for (let k = 1; k <= len; k++) { const xx = horiz ? x : x + sd * k, yy = horiz ? y + sd * k : y; if (!inb(xx, yy)) break; const u = id(xx, yy); if (!open(u)) break; if (T[u] !== CT.ROAD) { T[u] = CT.ROAD; made.push(u); } }
        }
        used.push(t);
      }
      seeds = made;
    }
  }
  const DN = {
    citadel: () => cap ? [() => `${raw()} Citadel`, () => 'Castle Hill', () => `The ${P()} Keep`] : [() => `${P()}hold`, () => 'Castle Hill', () => `The ${P()} Ward`],
    market: () => [() => `${P()}market`, () => `The ${P()} Market`, () => 'The Great Square'],
    cathedral: () => [() => 'Cathedral Close', () => `${P()}minster`, () => 'Chapter Close'],
    noble: () => [() => `${P()} Hill`, () => `The ${raw()} Terraces`, () => `${P()}crest`],
    merchants: () => [() => `${P()} Row`, () => `The ${P()} Exchange`, () => 'Gildergate'],
    artisans: () => [() => `${pick(['Smiths', 'Weavers', 'Dyers', 'Coopers', 'Tanners'])}' Ward`, () => `${P()}forge`, () => `The ${P()} Lanes`],
    oldtown: () => [() => `Old ${s.name}`, () => `The ${P()} Lanes`, () => 'The Old Town'],
    harbour: () => [() => `${P()}quay`, () => `The ${P()} Docks`, () => `${P()}haven`],
    slums: () => [() => 'The Warrens', () => `${P()} Rookery`, () => 'Mudside', () => 'The Shambles'],
    temple: () => [() => `The ${pick(ADJ2)} Precinct`, () => `${P()} Sanctum`],
    garrison: () => [() => `${P()}guard`, () => 'The Muster Yards'],
    scholars: () => [() => `The ${P()} Colleges`, () => 'Scriveners\' Hill'],
    outer: () => [() => `The ${P()} Liberties`, () => 'Beyond the Walls', () => `${P()} Outskirts`],
    precinct: () => [() => 'The Precinct', () => 'The Abbey Close'],
    grange: () => [() => `${P()} Grange`, () => `The ${P()} Grange`]
  };
  districts.forEach(D => D.name = nm.uniq(DN[D.type]()));

  /* lanes */
  districts.forEach(D => { const pr = DTYPE[D.type]; D.lx = pr.lane[0] + Math.floor(rng() * (pr.lane[1] - pr.lane[0] + 1)) || 5; D.ly = pr.lane[0] + Math.floor(rng() * (pr.lane[1] - pr.lane[0] + 1)) || 5; D.ox = Math.floor(rng() * 7); D.oy = Math.floor(rng() * 7); });
  if (!abbey) for (let t = 0; t < NN; t++) {
    if (!inside[t] || T[t] !== CT.GRASS || occ[t] || elev[t] || dist[t] < 0) continue;
    const D = districts[dist[t]], x = t % S, y = (t / S) | 0;
    if (((x + D.ox) % D.lx === 0 || (y + D.oy) % D.ly === 0) && nz2(x * 0.27 + 50, y * 0.27 + 50) < 0.32) T[t] = CT.STREET;
  }

  /* building helpers */
  /* complexes: footprint and turn of each great church, for the tile conversion */
  const objs = [], landmarks = [], complexes = [];
  const zAt = (x, y) => { const t = id(Math.min(S - 1, Math.max(0, Math.floor(x))), Math.min(S - 1, Math.max(0, Math.floor(y)))); return isWater(t) ? -5 : T[t] === CT.DOCK ? -1 : elev[t] * EL; };
  const freeRect = (x0, y0, w, d, k, opt = {}) => {
    let lvl = -1;
    for (let y = y0; y < y0 + d; y++) for (let x = x0; x < x0 + w; x++) {
      if (!inb(x, y)) return false; const t = id(x, y);
      if (occ[t] && !(opt.band && occ[t] === 2)) return false;
      if (opt.inside && !inside[t]) return false;
      const ty = T[t]; if (!(ty === CT.GRASS || ty === CT.SAND || (opt.field && ty === CT.FIELD) || (opt.street && ty === CT.STREET && !mainSt[t]))) return false;
      if (k != null && dist[t] !== k) return false;
      if (lvl < 0) lvl = elev[t]; else if (elev[t] !== lvl) return false;
    }
    return true;
  };
  const take = (x0, y0, w, d, ground) => { for (let y = y0; y < y0 + d; y++) for (let x = x0; x < x0 + w; x++) { const t = id(x, y); occ[t] = 1; if (ground != null) T[t] = ground; } };
  const nearSpot = (px, py, w, d, k, opt, maxR = 9) => { for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x0 = Math.round(px - w / 2) + dx, y0 = Math.round(py - d / 2) + dy; if (freeRect(x0, y0, w, d, k, opt)) return [x0, y0]; } return null; };
  const bld = (x, y, w, d, o) => { const b = Object.assign({ type: 'bldg', x, y, w, d, z0: zAt(x + 0.01, y + 0.01), h: 2 * FH, roof: 'gable', axis: w > d ? 'x' : w < d ? 'y' : (rng() < 0.5 ? 'x' : 'y'), wall: '#efe3c4', roofC: ROOFS[0], timber: false, windows: true }, o); objs.push(b); return b; };
  const round = (x, y, o) => { const r = Object.assign({ type: 'round', x, y, z0: zAt(x, y), r: 0.6, h: 30, roof: 'crenel', roofC: SLATE, wall: '#e2d8c0' }, o); objs.push(r); return r; };
  const tree = (x, y, s2, sp) => objs.push({ type: 'tree', x, y, z0: zAt(x, y), s: s2, sp });
  const nearWater = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy; if (inb(xx, yy) && (T[id(xx, yy)] === CT.RIVER || T[id(xx, yy)] === CT.SEA)) return true; } return false; };
  const wpick = opts => { let tot = 0; for (const [, w] of opts) tot += w; let r = rng() * tot; for (const [v, w] of opts) { r -= w; if (r <= 0) return v; } return opts[0][0]; };
  const treeSp = (ctx, x, y) => {
    if (clim === 'cold') return wpick([['pine', 4], ['spruce', 3], ['birch', 2]]);
    if (clim === 'arid') return wpick([['cypress', 4], ['olive', 4], ['poplar', 1.5], ['fruit', ctx === 'garden' ? 2 : 0.3]]);
    if (nearWater(x, y) && rng() < 0.4) return 'willow';
    if (ctx === 'forest') return wpick([['oak', 3.5], ['beech', 2.5], ['pine', 1.4], ['birch', 1], ['spruce', 0.5], ['autumn', 0.5]]);
    if (ctx === 'garden') return wpick([['fruit', 3], ['poplar', 1.5], ['oak', 2], ['beech', 1.2], ['birch', 1], ['autumn', 0.4], ['cypress', 0.4]]);
    return wpick([['oak', 4], ['beech', 1.5], ['poplar', 1.6], ['birch', 1], ['fruit', 0.8], ['autumn', 0.4]]);
  };
  const placeComplex = (x0, y0, tw, td, dm, o, build, k) => {
    for (let y = y0; y < y0 + td; y++) for (let x = x0; x < x0 + tw; x++) { const t = id(x, y); occ[t] = 1; if (!isWater(t)) T[t] = CT.YARD; if (k != null) dist[t] = k; }
    const pw2 = o % 2 ? dm.D : dm.W, pd2 = o % 2 ? dm.W : dm.D, z0 = elev[id(x0, y0)] * EL;
    const Bd = makeBuilder(x0 + (tw - pw2) / 2, y0 + (td - pd2) / 2, dm.W, dm.D, o, z0);
    build(Bd);
    for (const [lx0, ly0, lx1, ly1, ty] of Bd.ground) { const [ax, ay] = Bd.M(lx0, ly0), [bx, by] = Bd.M(lx1, ly1), mx0 = Math.min(ax, bx), mx1 = Math.max(ax, bx), my0 = Math.min(ay, by), my1 = Math.max(ay, by); for (let y = Math.floor(my0); y <= my1; y++) for (let x = Math.floor(mx0); x <= mx1; x++) if (inb(x, y) && x + 0.5 > mx0 && x + 0.5 < mx1 && y + 0.5 > my0 && y + 0.5 < my1) { T[id(x, y)] = ty; occ[id(x, y)] = 1; } }
    for (const ob of Bd.out) objs.push(ob);
    for (const mk of Bd.marks) landmark(mk.name, mk.x, mk.y, mk.kind, k, { z: mk.z });
    const ch = Bd.marks.find(mk => mk.kind === 'cathedral' || mk.kind === 'church');
    if (ch) complexes.push({ kind: ch.kind === 'cathedral' ? 'cathedral' : 'abbey', x: x0, y: y0, w: tw, d: td, axis: o % 2 ? 'y' : 'x', cx: ch.x, cy: ch.y });
  };
  const landmark = (name, x, y, kind, k, extra) => { const l = Object.assign({ name, x, y, kind, d: k }, extra); landmarks.push(l); return l; };

  /* citadel buildings */
  if (!abbey) {
    const lvl = cap ? 2 : 1, X0 = Math.round(ccx - 3), Y0 = Math.round(ccy - 2.5);
    for (let y = Y0; y < Y0 + 5; y++) for (let x = X0; x < X0 + 6; x++) if (inb(x, y) && inside[id(x, y)]) { const t = id(x, y); elev[t] = Math.max(elev[t], lvl); occ[t] = 1; T[t] = CT.YARD; dist[t] = 1; }
    const z0 = lvl * EL;
    const name = cap ? nm.uniq([() => `The ${P()} Palace`, () => `Palace of the ${raw()} Kings`, () => `The ${P()} Throne`]) : nm.uniq([() => `Castle ${raw()}`, () => `${P()}hold Keep`]);
    if (cap) {
      bld(X0 + 0.4, Y0 + 0.6, 4, 2.2, { z0, h: 3 * FH, roof: 'hip', axis: 'x', wall: '#f2ece0', roofC: SLATE, rh: 14 });
      bld(X0 + 0.4, Y0 + 2.8, 2.2, 1.8, { z0, h: 2 * FH, roof: 'gable', axis: 'y', wall: '#efe7d6', roofC: SLATE });
      bld(X0 + 4.2, Y0 + 0.5, 1.6, 1.6, { z0, h: 6 * FH, roof: 'flat', crenel: true, wall: '#ece4d2', roofC: ['#cfc4ad', '#b2a78f'], flag: '#a83a2c' });
      bld(X0 + 2.9, Y0 + 3.1, 2.8, 1.5, { z0, h: 2 * FH, roof: 'gable', axis: 'x', wall: '#efe7d6', roofC: COPPER });
      round(X0 + 0.35, Y0 + 0.4, { z0, r: 0.5, h: 5 * FH, roof: 'cone', roofC: SLATE, flag: '#c9a24f', rh: 22 });
      round(X0 + 5.7, Y0 + 4.6, { z0, r: 0.5, h: 4 * FH, roof: 'cone', roofC: SLATE, rh: 20 });
      round(X0 + 0.35, Y0 + 4.6, { z0, r: 0.45, h: 4 * FH, roof: 'cone', roofC: SLATE, rh: 18 });
    } else {
      bld(X0 + 1.5, Y0 + 1, 2.6, 2.6, { z0, h: 4 * FH, roof: 'flat', crenel: true, wall: '#e6ddc8', roofC: ['#cfc4ad', '#b2a78f'], flag: '#a83a2c' });
      bld(X0 + 0.4, Y0 + 3.4, 3.6, 1.3, { z0, h: 2 * FH, roof: 'gable', axis: 'x', wall: '#ece4d2', roofC: SLATE });
      round(X0 + 4.9, Y0 + 1, { z0, r: 0.5, h: 3 * FH, roof: 'cone', roofC: SLATE, rh: 18, flag: '#c9a24f' });
      round(X0 + 0.6, Y0 + 0.8, { z0, r: 0.45, h: 3 * FH, roof: 'crenel' });
    }
    landmark(name, ccx, ccy, cap ? 'palace' : 'castle', 1, { z: z0 });
    districts[1].lm = name;
  }

  /* wall pieces, towers and gatehouses */
  function buildWall(poly, h, gateH, towerR, towerH, towerRoof) {
    let towers = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 0.9));
      let run = null;
      const flush = () => { if (!run) return; const [p, q, kind] = run; if (kind === 'gate') { objs.push({ type: 'wall', x1: p[0], y1: p[1], x2: q[0], y2: q[1], z0: 0, h: gateH, t: 0.8, gate: true }); round(p[0], p[1], { z0: 0, r: towerR * 0.85, h: gateH + 8, roof: 'crenel', wt: 1 }); round(q[0], q[1], { z0: 0, r: towerR * 0.85, h: gateH + 8, roof: 'crenel', wt: 1 }); } else { for (const e of [p, q]) { const ex = Math.floor(e[0]), ey = Math.floor(e[1]); if (inb(ex, ey) && !isWater(id(ex, ey)) && T[id(ex, ey)] !== CT.DOCK) { round(e[0], e[1], { z0: 0, r: towerR * 0.8, h: towerH * 0.8, roof: 'crenel', wt: 1 }); break; } } } run = null; };
      for (let j = 0; j < n; j++) {
        const p = [lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n)], q = [lerp(a[0], b[0], (j + 1) / n), lerp(a[1], b[1], (j + 1) / n)];
        const mx = Math.floor((p[0] + q[0]) / 2), my = Math.floor((p[1] + q[1]) / 2);
        if (!inb(mx, my)) continue;
        const t = id(mx, my), ty = T[t];
        const water = ty === CT.SEA || ty === CT.RIVER, road = (ty === CT.STREET || ty === CT.ROAD || ty === CT.BRIDGE) && occ[t] === 2;
        if (water || road) { const kind = road ? 'gate' : 'water'; if (run && run[2] === kind) run[1] = q; else { flush(); run = [p, q, kind]; } continue; }
        flush();
        objs.push({ type: 'wall', x1: p[0], y1: p[1], x2: q[0], y2: q[1], z0: 0, h, t: abbey ? 0.38 : 0.62 });
      }
      flush();
      const vx = Math.floor(a[0]), vy = Math.floor(a[1]);
      if (inb(vx, vy) && !isWater(id(vx, vy)) && !(T[id(vx, vy)] === CT.STREET && occ[id(vx, vy)] === 2)) { round(a[0], a[1], { z0: 0, r: towerR, h: towerH, roof: towerRoof, wt: 1 }); towers++; }
    }
    return towers;
  }
  const towerCount = abbey ? buildWall(wall, 1.3 * FH, 2.3 * FH, 0.34, 1.9 * FH, 'cone') : buildWall(wall, 2.4 * FH, 3 * FH, 0.72, 3.6 * FH, cap ? 'cone' : 'crenel');
  if (!abbey) buildWall(citRing, (cap ? 2 : 1) * EL + 2.2 * FH, (cap ? 2 : 1) * EL + 3 * FH, 0.6, (cap ? 2 : 1) * EL + 3.4 * FH, 'crenel');
  gates.forEach(g => landmark(g.name, g.x, g.y, 'gate', null, { z: 0 }));

  /* market */
  if (!abbey) {
    const M0 = 0, stallCols = [['#b8483a', '#f0e6cb'], ['#4f6f8f', '#f0e6cb'], ['#c9a24f', '#f6efdc'], ['#5f7b3d', '#f0e6cb']];
    for (let y = plaza[1]; y < plaza[1] + ph; y++) for (let x = plaza[0]; x < plaza[0] + pw; x++) {
      if (!inb(x, y) || T[id(x, y)] !== CT.PLAZA) continue;
      if (Math.abs(x + 0.5 - plazaC[0]) < 1 && Math.abs(y + 0.5 - plazaC[1]) < 1) continue;
      if (rng() < 0.55) objs.push({ type: 'stall', x: x + 0.5 + (rng() - 0.5) * 0.2, y: y + 0.5 + (rng() - 0.5) * 0.2, z0: 0, c: pick(stallCols) });
    }
    objs.push({ type: 'fountain', x: plazaC[0], y: plazaC[1], z0: 0 });
    const hallName = pick(['The Corn Exchange', 'The Cloth Hall', 'The Wool Exchange', `${P()} Hall`]);
    const sp = nearSpot(plazaC[0] + pw / 2 + 1.5, plazaC[1], 3, 2, M0, {}, 7) || nearSpot(plazaC[0], plazaC[1], 3, 2, null, {}, 8);
    if (sp) { bld(sp[0], sp[1], 3, 2, { h: 2 * FH, roof: 'hip', wall: '#efe6d0', roofC: ROOFS[0], arcade: true }); take(sp[0], sp[1], 3, 2, CT.YARD); landmark(hallName, sp[0] + 1.5, sp[1] + 1, 'hall', dist[id(sp[0], sp[1])]); }
    districts[0].lm = sp ? hallName : 'the market cross';
  }

  /* district landmarks */
  for (const D of districts) {
    const k = D.id;
    const ring = (x0, y0, w, d, ground, trees) => { for (let y = y0 - 1; y <= y0 + d; y++) for (let x = x0 - 1; x <= x0 + w; x++) { if (!inb(x, y)) continue; const t = id(x, y); if (occ[t] || !(T[t] === CT.GRASS || (T[t] === CT.STREET && !mainSt[t] && inside[t])) || (dist[t] !== k && !inside[t])) continue; T[t] = ground; occ[t] = 1; if (trees && rng() < trees) tree(x + 0.5, y + 0.5, 11 + rng() * 3, treeSp('garden', x, y)); } };
    if (D.type === 'cathedral') {
      const name = nm.uniq([() => `Cathedral of Saint ${raw()}`, () => `The ${P()}minster`]);
      const tries = cap ? [[true, true], [true, false], [false, true], [false, false]] : [[false, true], [false, false]];
      let done = false;
      for (const [big, clo] of tries) {
        const dm = cathedralDims(big, clo);
        for (const o of shuffle([0, 1, 2, 3])) {
          const tw = Math.ceil(o % 2 ? dm.D : dm.W), td = Math.ceil(o % 2 ? dm.W : dm.D);
          const sp = nearSpot(D.sx, D.sy, tw, td, null, { street: true, inside: true }, 10);
          if (!sp) continue;
          placeComplex(sp[0], sp[1], tw, td, dm, o, Bd => buildCathedral(Bd, big, clo, { church: name }), k);
          ring(sp[0], sp[1], tw, td, CT.PLAZA, 0);
          for (let t = 0; t < NN; t++) {
            if (dist[t] !== k) continue;
            const x = t % S + 0.5, y = ((t / S) | 0) + 0.5; if (x > sp[0] - 1 && x < sp[0] + tw + 1 && y > sp[1] - 1 && y < sp[1] + td + 1) continue;
            let best = -1, bd = 1e9;
            seeds.forEach((q, j) => { if (j === k) return; let dd = Math.hypot(q.x - x, q.y - y) * (1 + 0.28 * nz2(x / 8 + j * 19.3, y / 8 - j * 7.1)); if (q.type === 'citadel') dd *= 1.4; if (dd < bd) { bd = dd; best = j; } });
            if (best >= 0) dist[t] = best;
          }
          for (let y = sp[1] - 1; y <= sp[1] + td; y++) for (let x = sp[0] - 1; x <= sp[0] + tw; x++) if (inb(x, y) && T[id(x, y)] === CT.PLAZA && occ[id(x, y)]) dist[id(x, y)] = k;
          D.sx = sp[0] + tw / 2; D.sy = sp[1] + td / 2;
          done = true; break;
        }
        if (done) break;
      }
      if (done) D.lm = name;
      else {
        let sp = nearSpot(D.sx, D.sy, 6, 3, k, {}), ax2 = 'x';
        if (!sp) { sp = nearSpot(D.sx, D.sy, 3, 6, k, {}); ax2 = 'y'; }
        if (sp) {
          const [x0, y0] = sp, stone = '#ebe3cf';
          if (ax2 === 'x') { bld(x0, y0, 4.2, 3, { h: 3 * FH, roof: 'gable', axis: 'x', wall: stone, roofC: SLATE, rh: 18, rose: true }); bld(x0 + 4.2, y0 + 0.5, 1.8, 2, { h: 6 * FH, roof: 'spire', wall: stone, roofC: SLATE, rh: 44 }); take(x0, y0, 6, 3, CT.YARD); ring(x0, y0, 6, 3, CT.PLAZA, 0); }
          else { bld(x0, y0, 3, 4.2, { h: 3 * FH, roof: 'gable', axis: 'y', wall: stone, roofC: SLATE, rh: 18, rose: true }); bld(x0 + 0.5, y0 + 4.2, 2, 1.8, { h: 6 * FH, roof: 'spire', wall: stone, roofC: SLATE, rh: 44 }); take(x0, y0, 3, 6, CT.YARD); ring(x0, y0, 3, 6, CT.PLAZA, 0); }
          landmark(name, x0 + (ax2 === 'x' ? 3 : 1.5), y0 + (ax2 === 'x' ? 1.5 : 3), 'cathedral', k); D.lm = name; complexes.push({ kind: 'church', x: x0, y: y0, w: ax2 === 'x' ? 6 : 3, d: ax2 === 'x' ? 3 : 6, axis: ax2, tower: 'end' });
        }
      }
    } else if (D.type === 'temple') {
      const name = nm.uniq([() => `Temple of the ${pick(ADJ2)} Moon`, () => `The ${P()} Sanctum`]);
      const sp = nearSpot(D.sx, D.sy, 3, 3, k, {});
      if (sp) { bld(sp[0], sp[1], 3, 3, { h: 2 * FH, roof: 'dome', domeC: '#d4ad52', wall: '#f4eee0', roofC: ['#e2d8c0', '#cbbf9f'], arcade: true, rh: 22 }); take(sp[0], sp[1], 3, 3, CT.YARD); ring(sp[0], sp[1], 3, 3, CT.GARDEN, 0.35); landmark(name, sp[0] + 1.5, sp[1] + 1.5, 'temple', k); D.lm = name; }
    } else if (D.type === 'artisans') {
      const name = `The ${pick(['Smiths', 'Weavers', 'Masons', 'Dyers', 'Coopers'])}' Guildhall`;
      const sp = nearSpot(D.sx, D.sy, 4, 2, k, {});
      if (sp) { bld(sp[0], sp[1], 3, 2, { h: 3 * FH, roof: 'hip', wall: '#efe0bf', roofC: ROOFS[0], timber: true }); bld(sp[0] + 3.1, sp[1] + 0.5, 0.9, 1, { h: 6 * FH, roof: 'spire', wall: '#e6d6b2', roofC: SLATE, rh: 24, clock: true }); take(sp[0], sp[1], 4, 2, CT.YARD); landmark(name, sp[0] + 2, sp[1] + 1, 'guild', k); D.lm = name; }
    } else if (D.type === 'garrison') {
      const name = nm.uniq([() => `The ${P()} Barracks`, () => `${P()} Armoury`]);
      const sp = nearSpot(D.sx, D.sy, 5, 4, k, {});
      if (sp) { const [x0, y0] = sp; bld(x0, y0, 5, 1, { h: 2 * FH, roof: 'gable', axis: 'x', wall: '#dcd5c4', roofC: SLATE }); bld(x0, y0 + 3, 5, 1, { h: 2 * FH, roof: 'gable', axis: 'x', wall: '#dcd5c4', roofC: SLATE }); take(x0, y0, 5, 4); for (let y = y0 + 1; y < y0 + 3; y++) for (let x = x0; x < x0 + 5; x++) T[id(x, y)] = CT.YARD; round(x0 + 4.6, y0 + 2, { r: 0.42, h: 4 * FH, roof: 'crenel', flag: '#a83a2c' }); landmark(name, x0 + 2.5, y0 + 2, 'barracks', k); D.lm = name; }
    } else if (D.type === 'scholars') {
      const name = nm.uniq([() => `The ${P()} Athenaeum`, () => `College of ${raw()}`]);
      const sp = nearSpot(D.sx, D.sy, 4, 3, k, {});
      if (sp) { bld(sp[0], sp[1], 3, 3, { h: 3 * FH, roof: 'hip', wall: '#efe8d6', roofC: SLATE }); round(sp[0] + 3.5, sp[1] + 1.5, { r: 0.5, h: 7 * FH, roof: 'dome', domeC: '#6f8fae', wall: '#ebe3cf' }); take(sp[0], sp[1], 4, 3, CT.YARD); ring(sp[0], sp[1], 4, 3, CT.GARDEN, 0.3); landmark(name, sp[0] + 2, sp[1] + 1.5, 'academy', k); D.lm = name; }
    } else if (D.type === 'noble') {
      for (let m = 0; m < 2; m++) {
        const name = nm.uniq([() => `${raw()} House`, () => `The ${P()} Manor`]);
        const sp = nearSpot(D.sx + (m ? 3 : -3), D.sy + (m ? 2 : -2), 3, 2, k, {});
        if (sp) { bld(sp[0], sp[1], 3, 2, { h: 3 * FH, roof: 'hip', wall: '#f5efe2', roofC: m ? COPPER : SLATE }); take(sp[0], sp[1], 3, 2, CT.YARD); ring(sp[0], sp[1], 3, 2, CT.GARDEN, 0.45); landmark(name, sp[0] + 1.5, sp[1] + 1, 'manor', k); if (!m) D.lm = name; }
      }
    } else if (D.type === 'oldtown') {
      const cands = []; for (let t = 0; t < NN; t++) if (dist[t] === k && T[t] === CT.STREET) { const x = t % S, y = (t / S) | 0; const c = D4.filter(([dx, dy]) => inb(x + dx, y + dy) && T[id(x + dx, y + dy)] === CT.STREET).length; if (c >= 3) cands.push(t); }
      if (cands.length) { const t = pick(cands); objs.push({ type: 'well', x: t % S + 0.5, y: ((t / S) | 0) + 0.5, z0: 0 }); landmark('The Old Well', t % S + 0.5, ((t / S) | 0) + 0.5, 'well', k); }
    }
    if (!D.lm) D.lm = `the ${DTYPE[D.type].label.toLowerCase()}`;
  }

  /* harbour: piers, ships and a lighthouse */
  let lighthouseName = null;
  if (coastal) {
    const hk = districts.findIndex(d => d.type === 'harbour');
    let hq = quay.filter(t => dist[t] === hk); if (hq.length < 4) hq = quay.slice();
    const l = Math.hypot(wx, wy) || 1, px = -wy / l, py = wx / l;
    hq.sort((a, b) => ((a % S) * px + ((a / S) | 0) * py) - ((b % S) * px + ((b / S) | 0) * py));
    const piers = [];
    for (let j = 1; j < hq.length && piers.length < (cap ? 5 : 3); j += 4) {
      const t = hq[j], x = t % S, y = (t / S) | 0;
      const dir = D4.find(([dx, dy]) => inb(x + dx, y + dy) && T[id(x + dx, y + dy)] === CT.SEA); if (!dir) continue;
      const tiles = []; for (let s2 = 1; s2 <= 6; s2++) { const nx = x + dir[0] * s2, ny = y + dir[1] * s2; if (!inb(nx, ny) || T[id(nx, ny)] !== CT.SEA) break; tiles.push(id(nx, ny)); }
      if (tiles.length < 2) continue;
      tiles.forEach(u => T[u] = CT.DOCK);
      piers.push({ tiles, dir });
    }
    for (const pr of piers) {
      const mid = pr.tiles[Math.min(2, pr.tiles.length - 1)], x = mid % S, y = (mid / S) | 0, sx2 = -pr.dir[1], sy2 = pr.dir[0];
      for (const sg of [1, -1]) { const nx = x + sx2 * sg * 2, ny = y + sy2 * sg * 2; if (inb(nx, ny) && T[id(nx, ny)] === CT.SEA && rng() < 0.6) { objs.push({ type: 'ship', x: nx + 0.5, y: ny + 0.5, flip: rng() < 0.5 }); break; } }
    }
    const far = []; for (let t = 0; t < NN; t++) if (T[t] === CT.SEA) { const x = t % S, y = (t / S) | 0; let ok = true; for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3 && ok; dx++) if (inb(x + dx, y + dy) && T[id(x + dx, y + dy)] !== CT.SEA) ok = false; if (ok) far.push(t); }
    for (let j = 0; j < 2 && far.length; j++) { const t = far[Math.floor(rng() * far.length)]; objs.push({ type: 'ship', x: t % S + 0.5, y: ((t / S) | 0) + 0.5, flip: rng() < 0.5 }); }
    if (!isLake && piers.length) {
      const longest = piers.slice().sort((a, b) => b.tiles.length - a.tiles.length)[0], tip = longest.tiles[longest.tiles.length - 1];
      lighthouseName = nm.uniq([() => `The ${P()} Light`, () => `${P()}beacon`]);
      round(tip % S + 0.5, ((tip / S) | 0) + 0.5, { z0: -1, r: 0.45, h: 7 * FH, roof: 'lantern', wall: '#efe7d6', bands: true });
      landmark(lighthouseName, tip % S + 0.5, ((tip / S) | 0) + 0.5, 'lighthouse', hk, { z: -1 });
    }
    if (hk >= 0 && lighthouseName) { districts[hk].lm = lighthouseName; districts[hk].hasLm = true; }
  }

  /* outskirts terrain */
  for (let t = 0; t < NN; t++) {
    if (inside[t] || isWater(t) || occ[t] === 2 || !(T[t] === CT.GRASS || T[t] === CT.SAND)) continue;
    const x = t % S, y = (t / S) | 0, px = (x + 0.5 - c0) / S, py = (y + 0.5 - c0) / S, dc = Math.hypot(x + 0.5 - gcx, y + 0.5 - gcy);
    if (T[t] === CT.SAND) continue;
    if (!abbey && sprawlDirs.length && dist[t] === outerId && dc > rW + 3 && reach(x + 0.5, y + 0.5) > rW + 9 && dc < reach(x + 0.5, y + 0.5) - 1.5) continue;   // suburbs: cleared ground, no fields or woods
    for (const d of hillDirs) { const [vx, vy] = vec(d), pr = px * vx + py * vy; if (dc > rW + 3 && pr > 0.16) elev[t] = Math.max(elev[t], pr > 0.3 ? 2 : 1); }
    let forest = false;
    for (const d of forestDirs) { const [vx, vy] = vec(d), pr = px * vx + py * vy; if (dc > rW + 3 && pr > 0.12 + 0.05 * nz(x / 6, y / 6)) forest = true; }
    if (forest) { T[t] = CT.FOREST; continue; }
    if (dc > rW + 3.5 && !elev[t] && clim !== 'cold' && nz(x / 6 + 30, y / 6) > (clim === 'arid' ? 0.15 : -0.35)) T[t] = CT.FIELD;
  }
  for (let t = 0; t < NN; t++) {
    if (T[t] !== CT.FIELD) continue;
    const x = t % S, y = (t / S) | 0, fx = Math.floor((x + 2 * nz(x / 10, y / 10)) / 4), fy = Math.floor((y + 2 * nz(y / 10 + 9, x / 10)) / 3);
    const h = ((fx * 73856093) ^ (fy * 19349663)) >>> 0; ftint[t] = (h & 3) | (((h >> 3) & 1) << 2);
  }

  /* monasteries */
  if (abbey) {
    placeComplex(AB.X0, AB.Y0, AB.tw, AB.td, AB.dm, AB.o, Bd => buildMonastery(Bd, 'abbey', { church: 'The Abbey Church' }), 0);
    districts[0].lm = 'The Abbey Church';
  } else {
    const dm = monasteryDims('priory'), pname = nm.uniq([() => `Priory of Saint ${raw()}`, () => `The ${P()} Priory`]);
    const a0 = Math.hypot(wx, wy) < 0.1 ? rng() * TAU : Math.atan2(-wy, -wx);
    const rectOK = (x0, y0, tw, td) => { const lv = inb(x0, y0) ? elev[id(x0, y0)] : 0; for (let y = y0 - 1; y <= y0 + td; y++) for (let x = x0 - 1; x <= x0 + tw; x++) { if (!inb(x, y)) return false; const t = id(x, y); if (isWater(t) || inside[t] || occ[t] === 2) return false; if (y >= y0 && y < y0 + td && x >= x0 && x < x0 + tw && (occ[t] || !(T[t] === CT.GRASS || T[t] === CT.FIELD || T[t] === CT.FOREST || T[t] === CT.SAND) || elev[t] !== lv)) return false; } return true; };
    let done = false;
    for (const da of [0.6, -0.6, 1.3, -1.3, 0, 2.0, -2.0, 2.7, -2.7, Math.PI]) {
      for (const o of [0, 1, 2, 3]) {
        const tw = Math.ceil(o % 2 ? dm.D : dm.W), td = Math.ceil(o % 2 ? dm.W : dm.D), rr = rW + 3 + Math.max(tw, td) / 2;
        for (const ext of [0, 1.5, 3]) { const x0 = Math.round(cx + Math.cos(a0 + da) * (rr + ext) - tw / 2), y0 = Math.round(cy + Math.sin(a0 + da) * (rr + ext) - td / 2); if (rectOK(x0, y0, tw, td)) { placeComplex(x0, y0, tw, td, dm, o, Bd => buildMonastery(Bd, 'priory', { church: pname }), outerId); done = true; break; } }
        if (done) break;
      }
      if (done) break;
    }
  }
  /* graveyard and windmills */
  if (gates.length && !abbey) {
    const g = gates[Math.floor(rng() * gates.length)], [vx, vy] = vec(g.d), side = rng() < 0.5 ? 1 : -1;
    const sp = nearSpot(g.x + vx * 4 - vy * 3 * side, g.y + vy * 4 + vx * 3 * side, 4, 4, outerId, { field: true }, 6);
    if (sp) { take(sp[0], sp[1], 4, 4, CT.GRAVE); bld(sp[0] + 0.2, sp[1] + 0.2, 1, 1.6, { h: FH * 1.2, roof: 'gable', axis: 'y', wall: '#e6dfcd', roofC: SLATE, windows: false }); const name = nm.uniq([() => `${P()} Cemetery`, () => `The ${P()} Barrows`]); landmark(name, sp[0] + 2, sp[1] + 2, 'grave', outerId); }
  }
  { let mills = 0; const fl = []; for (let t = 0; t < NN; t++) if (T[t] === CT.FIELD && !occ[t]) fl.push(t);
    for (let j = 0; j < 40 && mills < 2 && fl.length; j++) { const t = fl[Math.floor(rng() * fl.length)]; if (occ[t]) continue; objs.push({ type: 'mill', x: t % S + 0.5, y: ((t / S) | 0) + 0.5, z0: zAt(t % S, (t / S) | 0) }); occ[t] = 1; mills++; if (mills === 1) landmark(nm.uniq([() => `${raw()}'s Mill`, () => `${P()}mill`]), t % S + 0.5, ((t / S) | 0) + 0.5, 'mill', null); } }

  /* houses */
  const order = shuffle(Array.from({ length: NN }, (_, k) => k));
  const touches = (x0, y0, w, d) => { for (let x = x0; x < x0 + w; x++) { if (inb(x, y0 - 1) && streetish(id(x, y0 - 1))) return true; if (inb(x, y0 + d) && streetish(id(x, y0 + d))) return true; } for (let y = y0; y < y0 + d; y++) { if (inb(x0 - 1, y) && streetish(id(x0 - 1, y))) return true; if (inb(x0 + w, y) && streetish(id(x0 + w, y))) return true; } return false; };
  const PASTEL = ['#ecd2a2', '#e9c4b2', '#d3dcdc', '#dcdcb8', '#efe0c0', '#e6cfa6'], SHUTC = ['#5f7b5a', '#4f6f8f', '#9a4a3a', '#6a5a8a', '#7a6a3a'];
  const AWN = [['#b8483a', '#f0e6cb'], ['#4f6f8f', '#f0e6cb'], ['#5f7b3d', '#f0e6cb'], ['#c9a24f', '#f6efdc']];
  const STONEY = { citadel: 0.8, noble: 0.6, cathedral: 0.6, temple: 0.5, garrison: 0.8, scholars: 0.6, precinct: 1 };
  const scaleHex = (hex, k) => '#' + hexRgb(hex).map(v => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('');
  const house = (x0, y0, w, d, D) => {
    const pr = DTYPE[D.type], tp = D.type, fl = pr.floors[0] + Math.floor(rng() * (pr.floors[1] - pr.floors[0] + 1)), sq = w === d;
    const roof = sq && w > 1 ? (rng() < 0.6 ? 'hip' : 'gable') : (rng() < 0.1 ? 'hip' : 'gable');
    const timber = rng() < pr.timber;
    const mat = timber ? 'timber' : rng() < (STONEY[tp] || 0.12) ? 'stone' : (tp === 'merchants' || tp === 'harbour') && rng() < 0.25 ? 'brick' : 'plaster';
    let wallC = pick(pr.walls);
    if (mat === 'plaster' && (tp === 'merchants' || tp === 'market' || tp === 'oldtown') && rng() < 0.35) wallC = pick(PASTEL);
    if (mat === 'brick') wallC = pick(['#b8735a', '#a8644c', '#c08468']);
    if (mat === 'stone') wallC = pick(['#ddd3bd', '#e4dcc8', '#d4c9b0']);
    const rc = pick(pr.roofs), rk = 0.93 + rng() * 0.14;
    const o = { h: fl * FH, roof, wall: scaleHex(wallC, 0.95 + rng() * 0.1), roofC: [scaleHex(rc[0], rk), scaleHex(rc[1], rk)], timber, mat, district: D.id };
    o.jetty = timber && fl >= 2 && rng() < 0.6;
    o.shut = rng() < (tp === 'noble' || tp === 'merchants' ? 0.45 : 0.25) ? pick(SHUTC) : null;
    o.flowers = fl >= 2 && rng() < 0.18;
    o.chimney = rng() < 0.5; o.smoke = o.chimney && rng() < 0.4; o.chimFront = rng() < 0.3;
    o.dormers = roof === 'gable' && fl >= 2 && Math.max(w, d) >= 2 && rng() < 0.4 ? 1 + (rng() < 0.4 ? 1 : 0) : 0;
    o.stepped = (tp === 'merchants' || tp === 'harbour' || tp === 'market') && roof === 'gable' && rng() < 0.3;
    o.moss = (tp === 'oldtown' || tp === 'slums' || tp === 'outer' || tp === 'grange') && rng() < 0.4;
    o.ware = tp === 'harbour' && Math.max(w, d) >= 3;
    if (o.ware) o.dormers = 0;
    if ((tp === 'market' || tp === 'merchants' || tp === 'artisans') && fl >= 2 && rng() < 0.4) o.shop = pick(AWN);
    if ((tp === 'noble' || tp === 'oldtown') && sq && w === 1 && rng() < 0.08) { o.h += 2 * FH; o.roof = 'hip'; o.rh = 13; o.mat = 'stone'; o.timber = false; o.jetty = false; }
    o.door = pick(['#4a3524', '#5a3a2a', '#3d4a3a', '#4a3a52']);
    if (w * d === 2 && !o.ware && rng() < 0.25) {
      const along = w === 2, left = rng() < 0.5, mainL = 1.35, an = 2 - mainL;
      const mx = along ? (left ? x0 + an : x0) : x0, my = along ? y0 : (left ? y0 + an : y0);
      const ax = along ? (left ? x0 : x0 + mainL) : x0, ay = along ? y0 : (left ? y0 : y0 + mainL);
      bld(mx, my, along ? mainL : 1, along ? 1 : mainL, Object.assign({}, o, { axis: along ? 'x' : 'y', roof: 'gable' }));
      bld(ax, ay, along ? an : 1, along ? 1 : an, Object.assign({}, o, { h: FH, roof: 'lean', high: along ? (left ? 'x1' : 'x0') : (left ? 'y1' : 'y0'), rh: 6, dormers: 0, stepped: false, shop: null, chimney: false, flowers: false, jetty: false, timber: false }));
    } else bld(x0, y0, w, d, o);
    take(x0, y0, w, d); D.bcount++;
  };
  for (const t of order) {
    const x = t % S, y = (t / S) | 0, k = dist[t]; if (k < 0 || occ[t] || !(T[t] === CT.GRASS || T[t] === CT.SAND)) continue;
    const D = districts[k];
    if (D.type === 'outer' || D.type === 'grange') { const rr = Math.hypot(x + 0.5 - (abbey ? AB.gx : cx), y + 0.5 - (abbey ? AB.gy : cy)), lim = abbey ? rW + 6 : reach(x + 0.5, y + 0.5) - 1, sub = !abbey && lim > rW + 7; if (!touches(x, y, 1, 1) || rng() > (abbey ? 0.4 : sub ? 0.9 - 0.45 * Math.max(0, (rr - rW) / (lim - rW)) : 0.5) || rr > lim) continue; }
    for (const [w, d] of shuffle(DTYPE[D.type].sizes.slice())) {
      let done = false;
      for (const [ox2, oy2] of [[0, 0], [1 - w, 1 - d], [1 - w, 0], [0, 1 - d]]) { const x0 = x + ox2, y0 = y + oy2; if (freeRect(x0, y0, w, d, k) && touches(x0, y0, w, d)) { house(x0, y0, w, d, D); done = true; break; } }
      if (done) break;
    }
  }
  for (const t of order) {
    const x = t % S, y = (t / S) | 0, k = dist[t]; if (k < 0 || occ[t] || T[t] !== CT.GRASS || !inside[t]) continue;
    const D = districts[k], pr = DTYPE[D.type];
    if (rng() < pr.dense) { const opts = rng() < 0.5 ? [[1, 2], [2, 1], [1, 1]] : [[2, 1], [1, 2], [1, 1]]; for (const [w, d] of opts) if (freeRect(x, y, w, d, k)) { house(x, y, w, d, D); break; } }
    else { T[t] = pr.gardens ? CT.GARDEN : CT.YARD; occ[t] = 1; if (pr.gardens ? rng() < 0.5 : rng() < 0.25) tree(x + 0.5, y + 0.5, 10 + rng() * 3, treeSp('garden', x, y)); else if (rng() < 0.15) tree(x + 0.3 + rng() * 0.4, y + 0.3 + rng() * 0.4, 7, 'bush'); }
  }
  /* taverns */
  const taverns = [], tnames = shuffle(TAVERNS.slice());
  const tb = objs.filter(o => o.type === 'bldg' && o.district != null && ['market', 'oldtown', 'harbour', 'artisans', 'merchants', 'slums'].includes(districts[o.district].type) && o.h >= 2 * FH);
  for (let j = 0; j < Math.min(cap ? 5 : 4, tb.length); j++) { const b = tb[Math.floor(rng() * tb.length)]; if (b.tavern) continue; b.tavern = tnames.pop(); b.sign = true; taverns.push(b); landmark(b.tavern, b.x + b.w / 2, b.y + b.d / 2, 'tavern', b.district, { z: b.z0 }); }

  /* wilder ground outside the walls: wet meadows by the water, flowers in the vale, heath and scree on the hills, snow in the north */
  for (let t = 0; t < NN; t++) {
    if (T[t] !== CT.GRASS || inside[t] || occ[t]) continue;
    const x = t % S, y = (t / S) | 0, n1 = nz(x / 4.5 + 51, y / 4.5 - 17), n2 = nz2(x / 5 - 23, y / 5 + 61);
    let wetNear = false; for (let dy = -2; dy <= 2 && !wetNear; dy++) for (let dx = -2; dx <= 2; dx++) if (inb(x + dx, y + dy) && isWater(id(x + dx, y + dy)) && (T[id(x + dx, y + dy)] !== CT.SEA || isLake)) { wetNear = true; break; }
    if (clim === 'cold' && (elev[t] >= 1 || n1 > 0.2)) T[t] = CT.SNOW;
    else if (elev[t] >= 2 && n1 > -0.1) T[t] = CT.SCREE;
    else if (elev[t] >= 1 && clim !== 'arid' && n2 > 0.15) T[t] = CT.HEATH;
    else if (!elev[t] && clim !== 'arid' && (wetNear || (river && n1 > 0.55)) && n2 > -0.25) T[t] = CT.MARSH;
    else if (!elev[t] && clim === 'temperate' && n2 > 0.32) T[t] = CT.MEADOW;
  }
  /* trees outside */
  for (let t = 0; t < NN; t++) {
    const x = t % S, y = (t / S) | 0;
    if (T[t] === CT.FOREST && !occ[t]) { const n = 2 + (rng() < 0.55 ? 1 : 0); for (let j = 0; j < n; j++) tree(x + 0.12 + ((j + rng() * 0.8) / n) * 0.76, y + 0.12 + rng() * 0.76, 11 + rng() * 6, treeSp('forest', x, y)); if (rng() < 0.2) tree(x + rng(), y + rng(), 6 + rng() * 2, 'bush'); }
    else if (T[t] === CT.GRASS && !inside[t] && !occ[t]) {
      // open country is not sprinkled evenly: trees gather in copses and spinneys, thicken toward the woods' edge,
      // and stand alone only now and then
      let fr = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (!inb(x + dx, y + dy)) continue; if (T[id(x + dx, y + dy)] === CT.FOREST) fr = Math.max(fr, Math.abs(dx) + Math.abs(dy) <= 1 ? 2 : 1); }
      const c = 0.7 * nz(x / 7 + 71, y / 7 - 13) + 0.3 * nz2(x / 3 + 5, y / 3 + 40), p = fr === 2 ? 0.62 : fr === 1 ? 0.08 : c > 0.4 ? 0.75 : c > 0.33 ? 0.14 : 0.004;
      if (rng() < p) {
        const clump = fr || c > 0.3, n = clump && rng() < 0.55 ? 2 : 1, sp = clump ? treeSp('forest', x, y) : treeSp('open', x, y);
        for (let j = 0; j < n; j++) tree(x + 0.2 + rng() * 0.6, y + 0.2 + rng() * 0.6, (clump ? 9 : 11) + rng() * 5, j && rng() < 0.4 ? 'bush' : sp);
      }
    }
    else if (T[t] === CT.FIELD && !occ[t]) {
      // hedgerow trees along the boundaries between strips
      const pid = ftint[t] & 3, edgeR = x + 1 < S && (T[id(x + 1, y)] !== CT.FIELD || (ftint[id(x + 1, y)] & 3) !== pid), edgeD = y + 1 < S && (T[id(x, y + 1)] !== CT.FIELD || (ftint[id(x, y + 1)] & 3) !== pid);
      if (edgeR && rng() < 0.16) tree(x + 0.95, y + 0.2 + rng() * 0.6, 9 + rng() * 3, rng() < 0.35 ? 'bush' : treeSp('open', x, y));
      else if (edgeD && rng() < 0.16) tree(x + 0.2 + rng() * 0.6, y + 0.95, 9 + rng() * 3, rng() < 0.35 ? 'bush' : treeSp('open', x, y));
    }
  }
  /* catalogue pieces from the shared tile set: farm clutter, roadside carts, quay cargo, hilltop stones */
  {
    const treeT = new Set(); for (const o of objs) if (o.type === 'tree') treeT.add(id(Math.floor(o.x), Math.floor(o.y)));
    const okT = new Set([CT.GRASS, CT.MEADOW, CT.HEATH, CT.SCREE, CT.SNOW, CT.SAND, CT.FIELD, CT.MARSH]);
    const piece = (pid, x, y, face = Math.floor(rng() * 4), opt = {}) => {
      const o = { type: 'asset', id: pid, x, y, face, v: rng() }, [w, d] = footprint(o);
      if (!inb(x, y) || !inb(x + w - 1, y + d - 1)) return null;
      const e = elev[id(x, y)];
      for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) { const t = id(xx, yy); if (occ[t] || treeT.has(t) || isWater(t) || elev[t] !== e || !(opt.on ? opt.on.has(T[t]) : okT.has(T[t]))) return null; }
      for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) occ[id(xx, yy)] = 1;
      o.z0 = T[id(x, y)] === CT.DOCK ? -1 : e * EL; objs.push(o); return o;
    };
    const nextTo = (x, y, ty) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inb(x + dx, y + dy) && T[id(x + dx, y + dy)] === ty);
    const roadFace = (x, y) => inb(x, y + 1) && streetish(id(x, y + 1)) ? 0 : inb(x + 1, y) && streetish(id(x + 1, y)) ? 1 : inb(x, y - 1) && streetish(id(x, y - 1)) ? 2 : 3;
    let barns = 0, roadside = 0, hill = 0;
    for (const t of order) {
      const x = t % S, y = (t / S) | 0, ty = T[t]; if (occ[t] || treeT.has(t)) continue;
      if (ty === CT.FIELD) { const r = rng(); if (r < 0.018) piece(clim === 'arid' ? 'haybales' : 'haystack', x, y); else if (r < 0.024) piece('scarecrow', x, y); continue; }
      if (ty === CT.MARSH) { if (rng() < 0.3) piece('reeds', x, y, 0, { on: new Set([CT.MARSH]) }); continue; }
      if (inside[t]) continue;
      const byRoad = nextTo(x, y, CT.ROAD), byField = nextTo(x, y, CT.FIELD);
      if (byField && byRoad && barns < (cap ? 4 : 3) && rng() < 0.3) { const f = roadFace(x, y), pid = rng() < 0.6 ? 'barn' : 'granary'; if (piece(pid, x, y, f) || piece(pid, x - 1, y, f) || piece(pid, x, y - 1, f)) { barns++; continue; } }
      if (byRoad && roadside < (cap ? 14 : 10) && rng() < 0.06) { if (piece(clim === 'arid' ? pick(['cart', 'barrels', 'signpost', 'haybales']) : pick(['cart', 'logpile', 'signpost', 'barrels', 'haybales', 'lamppost']), x, y, roadFace(x, y))) roadside++; continue; }
      if (elev[t] >= 1 && hill < 8 && rng() < 0.05) { if (piece(pick(['boulders', 'boulders', 'stump', clim === 'cold' ? 'boulders' : 'logpile']), x, y)) hill++; continue; }
      if (clim === 'arid' && (ty === CT.SAND || ty === CT.GRASS) && rng() < 0.012) piece(nextTo(x, y, CT.SEA) || nextTo(x, y, CT.RIVER) ? 'palm' : 'cactus', x, y);
      else if (ty === CT.MEADOW && rng() < 0.05) piece(rng() < 0.6 ? 'flowers' : 'beehives', x, y);
    }
    /* cargo on the quays and clutter in back yards */
    for (let t = 0; t < NN; t++) {
      const x = t % S, y = (t / S) | 0;
      if (T[t] === CT.DOCK && !occ[t] && rng() < 0.08 && !nextTo(x, y, CT.STREET)) piece(pick(['crates', 'barrels', 'crates']), x, y, 0, { on: new Set([CT.DOCK]) });
      else if (T[t] === CT.YARD && !treeT.has(t) && rng() < 0.22) { occ[t] = 0; piece(pick(['barrels', 'crates', 'logpile', 'cart', 'well']), x, y, 0, { on: new Set([CT.YARD]) }) || (occ[t] = 1); }
      else if (T[t] === CT.GARDEN && !treeT.has(t) && rng() < 0.12) { occ[t] = 0; piece(pick(['beehives', 'statue', 'flowers']), x, y, 0, { on: new Set([CT.GARDEN]) }) || (occ[t] = 1); }
    }
    /* one ring of standing stones and a lonely watchtower out in the country */
    const wild = (pid, minR, name, kind) => {
      for (let j = 0; j < 400; j++) {
        const t = Math.floor(rng() * NN), x = t % S, y = (t / S) | 0;
        if (Math.hypot(x - gcx, y - gcy) < minR || x < 2 || y < 2 || x > S - 4 || y > S - 4) continue;
        const o = piece(pid, x, y); if (o) { const [w, d] = footprint(o); if (name) landmark(name, x + w / 2, y + d / 2, kind, null, { z: o.z0 }); return o; }
      }
      return null;
    };
    if (!abbey) {
      if (rng() < 0.75) wild('stones', rW + 6, nm.uniq([() => `The ${pick(ADJ2)} Stones`, () => `${raw()}'s Ring`]), 'stones');
      if (hillDirs.length || rng() < 0.4) wild('watchtower', rW + 7, nm.uniq([() => `${P()} Watch`, () => `The ${pick(ADJ2)} Lookout`]), 'watch');
    } else if (rng() < 0.6) wild('stones', rW + 5, nm.uniq([() => `The ${pick(ADJ2)} Stones`]), 'stones');
  }
  /* tallies and text */
  let insideCount = 0;
  for (let t = 0; t < NN; t++) if (dist[t] >= 0) { districts[dist[t]].tiles++; if (inside[t]) insideCount++; }
  for (const D of districts) {
    let sx = 0, sy = 0, se = 0, n = 0;
    for (let t = 0; t < NN; t++) if (dist[t] === D.id && T[t] !== CT.ROAD) { sx += t % S + 0.5; sy += ((t / S) | 0) + 0.5; se += elev[t]; n++; }
    if (n) { D.cx = sx / n; D.cy = sy / n; D.ce = se / n; }
    if (D.type === 'outer' || D.type === 'grange') { let best = null, bd = 1e9; for (let t = 0; t < NN; t++) if (dist[t] === D.id && T[t] === CT.ROAD) { const dd = Math.abs(Math.hypot(t % S + 0.5 - gcx, ((t / S) | 0) + 0.5 - gcy) - (rW + 4)); if (dd < bd) { bd = dd; best = t; } } { const ring2 = []; for (let t = 0; t < NN; t++) if (dist[t] === D.id && T[t] !== CT.FOREST) { const x = t % S + 0.5, y = ((t / S) | 0) + 0.5; if (Math.abs(Math.hypot(x - gcx, y - gcy) - (rW + 3.5)) < 0.8) ring2.push([x, y]); } D.cands = ring2.filter((_, j) => j % Math.max(1, Math.floor(ring2.length / 24)) === 0); }
    if (best == null) { let bs = -1e9; for (let t = 0; t < NN; t++) if (dist[t] === D.id) { const x = t % S + 0.5, y = ((t / S) | 0) + 0.5, dd = Math.abs(Math.hypot(x - gcx, y - gcy) - (rW + 3)); if (dd < 1.5 && x + y > bs) { bs = x + y; best = t; } } } if (best != null) { D.cx = best % S + 0.5; D.cy = ((best / S) | 0) + 0.5; D.ce = elev[best]; } }
    D.desc = DDESC[D.type]({ cap, city: s.name, lm: D.lm, hasLm: !!D.hasLm });
  }
  const nums = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
  const wn = waterName ? waterName.replace(/^The /, 'the ') : null;
  const orderName = abbey ? nm.uniq([() => `Order of Saint ${raw()}`, () => `Brothers of the ${pick(ADJ2)} Moon`, () => `Sisters of ${raw()}`]) : null;
  const intro = abbey ? `A walled abbey of the ${orderName}${river ? `, on the banks of ${river}` : ''}${waterName ? `, looking out over ${wn}` : ''}. Church, cloister, fishponds and orchards lie within a single precinct wall.` : `${cap ? 'Seat of the crown' : 'A walled trading city'}${coastal ? (isLake ? ` on the shore of ${wn || 'a cold lake'}` : ` on ${wn || 'the open sea'}`) : ''}${river ? `${coastal ? ',' : ''} astride ${river}` : ''}. ${nums[gates.length] || gates.length} gates pierce its walls${hillDirs.length ? ', and the citadel looks toward the hills' : ''}.`;
  /* road surfaces: setts by the gates and in town, earth on the open road, dirt in the woods */
  const rmat = new Uint8Array(NN), FLAGD = { noble: 1, citadel: 1, cathedral: 1, temple: 1, precinct: 1, scholars: 1 };
  for (let t = 0; t < NN; t++) {
    const ty = T[t]; if (ty !== CT.ROAD && ty !== CT.STREET) continue;
    const x = t % S, y = (t / S) | 0;
    if (ty === CT.STREET) { const tp = dist[t] >= 0 ? districts[dist[t]].type : ''; rmat[t] = tp === 'slums' ? 7 : FLAGD[tp] ? 6 : 1; continue; }
    let dw = 1e9; for (let k = 0; k < wall.length; k++) dw = Math.min(dw, segD(x + 0.5, y + 0.5, wall[k], wall[(k + 1) % wall.length]));
    let m = 2, forest = 0, sand = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!inb(x + dx, y + dy)) continue; const n = T[id(x + dx, y + dy)]; if (n === CT.FOREST) forest++; if (n === CT.SAND) sand++; }
    if (forest >= 2) m = 3; else if (elev[t] > 0 || clim === 'cold') m = 5; else if (clim === 'arid' || sand >= 3) m = 4;
    if (dw < (abbey ? 2.5 : 4.5)) m = 1;
    rmat[t] = m;
  }
  /* bridges: one span per street crossing, laid square across the current */
  if (rCurve) {
    const bez = t => [(1 - t) ** 2 * rCurve.p0[0] + 2 * (1 - t) * t * rCurve.ctrl[0] + t * t * rCurve.p2[0], (1 - t) ** 2 * rCurve.p0[1] + 2 * (1 - t) * t * rCurve.ctrl[1] + t * t * rCurve.p2[1]];
    const seenB = new Uint8Array(NN);
    for (let t0 = 0; t0 < NN; t0++) {
      if (T[t0] !== CT.BRIDGE || seenB[t0] || !chan[t0]) continue;
      const comp = [t0]; seenB[t0] = 1;
      for (let k = 0; k < comp.length; k++) { const t = comp[k], x = t % S, y = (t / S) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (!inb(xx, yy)) continue; const n = id(xx, yy); if (!seenB[n] && T[n] === CT.BRIDGE) { seenB[n] = 1; comp.push(n); } } }
      let mx = 0, my = 0; for (const t of comp) { mx += t % S + 0.5; my += ((t / S) | 0) + 0.5; } mx /= comp.length; my /= comp.length;
      let bt = 0, bd = 1e9; for (let t = 0; t <= 1; t += 0.005) { const q = bez(t), d = (q[0] - mx) ** 2 + (q[1] - my) ** 2; if (d < bd) { bd = d; bt = t; } }
      const qa = bez(Math.max(0, bt - 0.01)), qb = bez(Math.min(1, bt + 0.01)), axis = Math.abs(qb[0] - qa[0]) > Math.abs(qb[1] - qa[1]) ? 'y' : 'x';
      const perp = new Set(comp.map(t => axis === 'x' ? (t / S) | 0 : t % S)), wd = comp.length >= 2 * Math.max(1, perp.size) + 3 && perp.size >= 2 ? 2 : 1;
      const pc = Math.round((axis === 'x' ? my : mx) - wd / 2), ac = Math.floor(axis === 'x' ? mx : my);
      const isC = a => { for (let k = 0; k < wd; k++) { const x = axis === 'x' ? a : pc + k, y = axis === 'x' ? pc + k : a; if (!inb(x, y) || !chan[id(x, y)]) return false; } return true; };
      let a0 = ac, a1 = ac; if (!isC(ac)) continue;
      while (isC(a0 - 1)) a0--; while (isC(a1 + 1)) a1++;
      if (a0 <= 0 || a1 >= S - 1) continue;
      const t = id(Math.floor(mx), Math.floor(my)), stone = abbey || cap || inside[t] || rng() < 0.45, ov = 0.3;
      const nb = axis === 'x' ? { type: 'bridge', x: a0 - ov, y: pc, w: a1 + 1 - a0 + 2 * ov, d: wd, axis, stone, z0: 0 } : { type: 'bridge', x: pc, y: a0 - ov, w: wd, d: a1 + 1 - a0 + 2 * ov, axis, stone, z0: 0 };
      // two streets crossing side by side share one broad bridge
      const twin = objs.find(o => o.type === 'bridge' && o.axis === axis && (axis === 'x' ? Math.abs((o.y + o.d / 2) - (nb.y + nb.d / 2)) <= (o.d + nb.d) / 2 + 1.01 && o.x < nb.x + nb.w && nb.x < o.x + o.w : Math.abs((o.x + o.w / 2) - (nb.x + nb.w / 2)) <= (o.w + nb.w) / 2 + 1.01 && o.y < nb.y + nb.d && nb.y < o.y + o.d));
      if (twin) {
        const x0 = Math.min(twin.x, nb.x), y0 = Math.min(twin.y, nb.y), x1 = Math.max(twin.x + twin.w, nb.x + nb.w), y1 = Math.max(twin.y + twin.d, nb.y + nb.d);
        if ((axis === 'x' ? y1 - y0 : x1 - x0) <= 2) { Object.assign(twin, { x: x0, y: y0, w: x1 - x0, d: y1 - y0, stone: twin.stone || stone }); continue; }
      }
      objs.push(nb);
    }
  }
  return { chan, riverCurve: rCurve, rmat, kind: abbey ? "abbey" : "city", order: orderName, community: abbey ? 18 + Math.floor(rng() * 60) : 0, founded: abbey ? map.realm.year - 120 - Math.floor(rng() * 500) : 0, cx: abbey ? AB.gx : cx, cy: abbey ? AB.gy : cy, S, T, elev, dist, tint, ftint, inside, objs, districts, landmarks, complexes, gates, taverns, river, waterName, coastal, isLake, cap, clim, name: s.name, intro, towers: towerCount, insideCount, spanYards: Math.round(2 * rW * YARDS_PER_TILE / 10) * 10 };
}

export { CT, DTYPE, EL, FH, SLATE, THH, TWH, generateCity };
