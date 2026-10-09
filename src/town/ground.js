import { OUTLINE, hexRgb, mixHex, ramp } from '../characters/pixels.js';
import { STOREY } from '../editor/model.js';
import { TERRAIN } from '../tiles/terrain.js';

/* ================= town view: the painted ground =================
   The map seen from above as in the old town-walking RPGs: square tiles TILE art pixels across, the ground
   painted as one continuous surface rather than tile by tile. Every mark is laid out in map pixels, not tile
   pixels, so grass, cobbles and ripples run across tile edges without a seam, and where two soft grounds meet
   (grass and a dirt road, sand and the sea) the border wanders with a smooth noise instead of following the grid.
   Built grounds (paving, floors, fields) keep straight edges. Where one ground meets a lower-ranked one, the
   higher one is inked along its edge and casts a short shadow on the lower: grass overhangs a path, a path rims the
   sea, and the shore shows a strip of bank and a line of foam.
   Height is shown the oblique way: a tile LIFT art pixels higher per height level, with a south-facing cliff
   hanging below it down to the ground in front (an earth bank for one level, coursed rock for more), a rim
   inked on its sides and a shadow on the ground to its east and at its foot. Upper floors are painted the same
   way on their own layer, STOREY height levels above the ground under them. No DOM. */
const TILE = 32, LIFT = 16, FRAMES = 4, WOBBLE = 12;

/* ---------- noise ---------- */
const h2 = (x, y, s = 0) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s + 0x9e37, 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, s) => 0.62 * vnoise(x / 15, y / 15, s) + 0.38 * vnoise(x / 6, y / 6, s + 7);
/* rock broken into boulders: the nearest and second-nearest of points jittered on a w × h grid */
function worley(x, y, w, h, s) {
  const cx = Math.floor(x / w), cy = Math.floor(y / h); let d1 = 1e9, d2 = 1e9, id = 0, dx1 = 0, dy1 = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const a = cx + i, b = cy + j, px = (a + 0.15 + 0.7 * h2(a, b, s)) * w, py = (b + 0.15 + 0.7 * h2(a, b, s + 1)) * h, dx = (x - px) / w, dy = (y - py) / h, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; id = h2(a, b, s + 2); dx1 = dx; dy1 = dy; } else if (d < d2) d2 = d;
  }
  return { edge: Math.sqrt(d2) - Math.sqrt(d1), id, dx: dx1, dy: dy1 };
}

/* ---------- the grounds: colour ramps, rank and family ---------- */
const rgb = hex => hexRgb(hex);
const rampRgb = hex => ramp(hex).map(rgb);
const FAMILY = {
  grass: 'green', meadow: 'green', tallgrass: 'green', pasture: 'green', heath: 'green', moor: 'green', garden: 'green',
  dirt: 'earth', road: 'earth', mud: 'earth', scrub: 'earth', sand: 'sand', dunes: 'sand', shingle: 'sand', rock: 'rock', scree: 'rock',
  snow: 'snow', tundra: 'snow', ice: 'snow', ash: 'ash', lava: 'lava', shallows: 'water', water: 'water', deep: 'water', marsh: 'wet', swamp: 'wet'
};
/* which ground overhangs which where they meet: green over everything, built ground over bare, bare over water */
const RANK = { green: 4, earth: 2, sand: 2, rock: 2, snow: 2, ash: 2, wet: 1, water: 0, lava: 0 };
const INFO = TERRAIN.map(t => {
  const crisp = (t.group === 'Paved' && t.id !== 'road') || t.group === 'Floors' || t.group === 'Farm';
  const fam = FAMILY[t.id] || t.id;
  return {
    id: t.id, R: rampRgb(t.top), S: rampRgb(t.side[0]), fam, crisp, rank: RANK[fam] ?? 3, water: !!t.water, anim: !!t.water || !!t.glow,
    face: t.water ? 'water' : t.glow ? 'lava' : fam === 'snow' ? 'snow' : t.group === 'Floors' || t.id === 'planks' ? 'wood' : crisp ? 'stone' : fam === 'rock' || fam === 'sand' ? 'rock' : 'earth',
    lip: fam === 'green' || fam === 'wet' || t.group === 'Farm' ? rampRgb(t.top) : fam === 'snow' ? rampRgb('#eceeea') : null
  };
});
const INK = rgb(OUTLINE);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k * 1.04];
const FLOWERS = ['#f4ecd8', '#e2bf4e', '#c4503e', '#9a7fc0'].map(rampRgb);
const C = hex => rampRgb(hex);
const LEAF = C('#6f8a40'), GRAIN = C('#e8d18a'), STALK = C('#b89443'), VINE = C('#5c773f'), GRAPE = C('#6a3d5c'), BUSH = C('#8f9a5a'), POOL = C('#8eb0ab'), LILY = C('#9ab06a');
const GOLDC = C('#e8ce8c'), CARPET_MARK = { carpet: C('#5a281e'), carpetblue: C('#283446') }, GLOW = C('#f4c25a'), CRUST = C('#5a4a42'), FOAM = rgb('#eef2ea'), STRAW = C('#b8a266');

/* ---------- a map layer ---------- */
/* the ground (L 0) or upper floor L of map M as a grid of ground indices (-1 where there is none) and heights */
function layerOf(M, L = 0) {
  const S = M.S, NN = S * S, terr = new Int16Array(NN), elev = new Int16Array(NN), fl = L ? M.floors && M.floors[L - 1] : null;
  for (let u = 0; u < NN; u++) {
    if (L) { const v = fl ? fl[u] : 0; terr[u] = v ? v - 1 : -1; } else terr[u] = M.terr[u];
    elev[u] = M.elev[u] + STOREY * L;
  }
  return { S, L, terr, elev, ground: M.elev, any: terr.some(t => t >= 0) };
}
const at = (G, x, y) => (x < 0 || y < 0 || x >= G.S || y >= G.S ? -1 : y * G.S + x);
const terrAt = (G, x, y) => { const u = at(G, x, y); return u < 0 ? -1 : G.terr[u]; };
/* the ground showing at map pixel (gx, gy): its own tile's, or for soft grounds, a neighbour's reached through a
   smooth wobble, so the borders between them meander. Neighbours at another height, built grounds and the void
   never wander in. */
function classify(G, gx, gy) {
  const tx = Math.floor(gx / TILE), ty = Math.floor(gy / TILE), u = at(G, tx, ty); if (u < 0) return -1;
  const own = G.terr[u]; if (own < 0 || INFO[own].crisp) return own;
  const sx = Math.floor((gx + (fbm(gx, gy, 1) - 0.5) * 2 * WOBBLE) / TILE), sy = Math.floor((gy + (fbm(gx, gy, 2) - 0.5) * 2 * WOBBLE) / TILE);
  if (sx === tx && sy === ty) return own;
  const s = at(G, sx, sy); if (s < 0) return own;
  const t = G.terr[s]; return t < 0 || INFO[t].crisp || G.elev[s] !== G.elev[u] ? own : t;
}

/* ---------- the marks of each ground, in map pixels ---------- */
function base(R, gx, gy, grain = 0.14) {
  const n = 0.7 * vnoise(gx / 10, gy / 10, 3) + 0.3 * vnoise(gx / 4, gy / 4, 5); let t = n < 0.33 ? 3 : n > 0.69 ? 1 : 2;
  const h = h2(gx, gy, 11); if (h < grain / 2) t = Math.min(3, t + 1); else if (h < grain) t = Math.max(1, t - 1);
  return R[t];
}
/* a spot in each cell of a grid `n` pixels square, with chance p: its offset from (gx, gy), or null */
function spot(gx, gy, n, p, s, m = 2) {
  const cx = Math.floor(gx / n), cy = Math.floor(gy / n); if (h2(cx, cy, s) >= p) return null;
  const span = Math.max(1, n - 2 * m);
  return [gx - (cx * n + m + Math.floor(h2(cx, cy, s + 1) * span)), gy - (cy * n + m + Math.floor(h2(cx, cy, s + 2) * span)), h2(cx, cy, s + 3)];
}
/* a little tuft of blades: \|/ over a dark root */
const TUFT = { '-2,0': 4, '-1,-1': 3, '0,0': 4, '0,-1': 3, '0,-2': 1, '1,-1': 3, '2,0': 4 };
function tuft(R, gx, gy, n, p, s, tall = false) {
  const q = spot(gx, gy, n, p, s, 3); if (!q) return null;
  const t = TUFT[q[0] + ',' + (tall && q[1] < 0 ? Math.min(0, q[1] + 1) : q[1])]; return t == null ? null : R[t];
}
function flower(gx, gy, n, p, s) {
  const q = spot(gx, gy, n, p, s); if (!q) return null;
  const F = FLOWERS[Math.floor(q[2] * FLOWERS.length)], [dx, dy] = q;
  if (dx === 0 && dy === 0) return F[0];
  if (Math.abs(dx) + Math.abs(dy) === 1 && dy <= 0) return F[2];
  if (dx === 0 && dy === 1) return LEAF[3];
  return null;
}
/* a pebble size + 1 pixels wide: lit on top, dark underneath */
function pebble(R, gx, gy, n, p, s, size = 2) {
  const q = spot(gx, gy, n, p, s, 2); if (!q) return null;
  const [dx, dy] = q; if (dx < 0 || dx > size || dy < (size > 1 ? -1 : 0) || dy > 1) return null;
  if (dy === -1) return dx === 0 || dx === size ? null : R[0];
  return dy ? (dx === 0 || dx === size ? null : R[4]) : dx === 0 ? R[1] : R[size > 1 && dx === size ? 3 : 2];
}
/* a grid of blocks `w`×`h`, rows offset by half a block when bond; returns the tone */
function blocks(gx, gy, w, h, bond, k = 0) {
  const row = Math.floor(gy / h), x = gx + (bond && row % 2 ? w / 2 : 0), col = Math.floor(x / w), cx = ((x % w) + w) % w, cy = ((gy % h) + h) % h;
  if (cx === 0 || cy === 0) return 4;
  const v = h2(col, row, 31 + k);
  if (cx === 1 || cy === 1) return v < 0.3 ? 1 : 0;
  if (cx === w - 1 || cy === h - 1) return 3;
  return v < 0.25 ? 1 : v > 0.8 ? 3 : 2;
}
/* boards along x, h pixels wide, with butt joints */
function boardsTone(gx, gy, h, k = 0) {
  const row = Math.floor(gy / h), cy = ((gy % h) + h) % h, len = 40 + Math.floor(h2(row, 1, k) * 30), off = Math.floor(h2(row, 2, k) * len), cx = ((gx + off) % len + len) % len;
  if (cy === 0 || cx === 0) return 4;
  if (cy === 1) return 1;
  const v = h2(row, Math.floor((gx + off) / len), k + 3); return h2(gx, gy, 9) < 0.05 ? 3 : v < 0.3 ? 1 : v > 0.75 ? 3 : 2;
}
/* how far (gx, gy) is from the edge of its run of this ground, counting only edges where the ground changes */
function edgeDist(G, gx, gy, k) {
  const tx = Math.floor(gx / TILE), ty = Math.floor(gy / TILE), lx = gx - tx * TILE, ly = gy - ty * TILE; let d = 99;
  if (terrAt(G, tx - 1, ty) !== k) d = Math.min(d, lx); if (terrAt(G, tx + 1, ty) !== k) d = Math.min(d, TILE - 1 - lx);
  if (terrAt(G, tx, ty - 1) !== k) d = Math.min(d, ly); if (terrAt(G, tx, ty + 1) !== k) d = Math.min(d, TILE - 1 - ly);
  return d;
}
function waterTone(R, gx, gy, f, light, n) {
  const row = Math.floor(gy / 5), shift = Math.floor(h2(row, 3) * 40), len = 26 + Math.floor(h2(row, 4) * 18);
  const x = ((gx + shift + f * 2 * (row % 2 ? 1 : -1)) % len + len) % len;
  if (gy % 5 === 2 && x < [3, 4, 3, 2][(f + row) % 4] && fbm(gx, gy, 41) > 0.5) return light;
  const m = vnoise(gx / 22, gy / 12, 43); return m > 0.8 ? mix(R[1], R[2], 0.5) : m < 0.2 ? mix(R[2], R[3], 0.5) : R[2];
}

const TEX = {
  grass: (R, x, y) => tuft(R, x, y, 9, 0.4, 101) || flower(x, y, 15, 0.05, 102) || base(R, x, y),
  meadow: (R, x, y) => flower(x, y, 7, 0.2, 111) || tuft(R, x, y, 10, 0.35, 112) || base(R, x, y),
  tallgrass: (R, x, y) => tuft(R, x, y, 5, 0.7, 121, true) || tuft(R, x + 2, y + 3, 6, 0.5, 122) || base(R, x, y, 0.2),
  pasture: (R, x, y) => tuft(R, x, y, 12, 0.25, 131) || base(R, x, y, 0.1),
  heath: (R, x, y) => { const q = spot(x, y, 5, 0.45, 141); if (q && Math.abs(q[0]) + Math.abs(q[1]) <= (q[2] < 0.5 ? 0 : 1)) return FLOWERS[3][q[0] || q[1] ? 2 : 1]; return tuft(R, x, y, 9, 0.3, 142) || base(R, x, y, 0.18); },
  moor: (R, x, y) => tuft(R, x, y, 7, 0.45, 151) || pebble(C('#bdb39d'), x, y, 16, 0.2, 152) || base(R, x, y, 0.2),
  garden: (R, x, y) => flower(x, y, 5, 0.42, 161) || tuft(R, x, y, 9, 0.3, 162) || base(R, x, y),
  scrub: (R, x, y) => { const q = spot(x, y, 14, 0.5, 171, 4); if (q) { const d = (q[0] * q[0]) / 9 + (q[1] * q[1]) / 4; if (d < 1) return BUSH[d > 0.6 ? (q[1] > 0 ? 4 : 3) : q[1] < 0 && q[0] < 0 ? 1 : 2]; } return pebble(R, x, y, 9, 0.2, 172) || base(R, x, y, 0.18); },
  dirt: (R, x, y) => pebble(R, x, y, 8, 0.22, 181) || base(R, x, y, 0.22),
  road: (R, x, y) => pebble(R, x, y, 7, 0.28, 191, 1) || base(R, x, y, 0.18),
  mud: (R, x, y) => { if (fbm(x, y, 201) > 0.66) return POOL[fbm(x, y - 1, 201) > 0.66 ? 2 : 3]; return pebble(R, x, y, 9, 0.15, 202) || base(R, x, y, 0.2); },
  sand: (R, x, y) => { const h = h2(x, y, 211); if (h < 0.025) return R[4]; if (h < 0.05) return R[0]; return base(R, x, y, 0.16); },
  dunes: (R, x, y) => { const c = ((Math.floor(y + 3 * Math.sin(x / 9) + 2 * Math.sin(x / 23)) % 11) + 11) % 11; return c === 0 ? R[0] : c === 1 ? R[3] : base(R, x, y, 0.08); },
  shingle: (R, x, y) => pebble(R, x, y, 6, 0.75, 221, 3) || pebble(R, x + 3, y + 2, 5, 0.5, 222, 2) || base(R, x, y, 0.2),
  rock: (R, x, y) => { const c = fbm(x, y, 231); if (Math.abs(c - 0.5) < 0.012) return R[4]; if (Math.abs(c - 0.5) < 0.03) return R[1]; return base(R, x, y, 0.12); },
  scree: (R, x, y) => pebble(R, x, y, 5, 0.65, 241, 3) || base(R, x, y, 0.2),
  snow: (R, x, y) => { const h = h2(x, y, 251); if (h < 0.012) return R[0]; const c = ((Math.floor(y + 2 * Math.sin(x / 7)) % 13) + 13) % 13; return c === 0 && fbm(x, y, 252) > 0.5 ? R[3] : base(R, x, y, 0.06); },
  tundra: (R, x, y) => { if (fbm(x, y, 261) > 0.64) return C('#eef0ec')[fbm(x, y - 1, 261) > 0.64 ? 1 : 2]; return tuft(R, x, y, 9, 0.3, 262) || base(R, x, y, 0.18); },
  ice: (R, x, y) => { const d = ((x - y) % 23 + 23) % 23; if (d === 0 && fbm(x, y, 271) > 0.5) return [255, 255, 255]; if (Math.abs(fbm(x, y, 272) - 0.5) < 0.01) return R[4]; return base(R, x, y, 0.04); },
  ash: (R, x, y) => { const h = h2(x, y, 281); if (h < 0.004) return GLOW[1]; return pebble(R, x, y, 8, 0.2, 282) || base(R, x, y, 0.28); },
  lava: (R, x, y, f) => { const n = fbm(x + f * 1.5, y, 291); if (n < 0.36) return CRUST[n < 0.3 ? 3 : 2]; if (n < 0.4) return R[4]; const g = (Math.floor(x / 3 + y / 5) + f) % 6; return g === 0 ? GLOW[0] : g < 2 ? GLOW[1] : R[n > 0.6 ? 1 : 2]; },
  shallows: (R, x, y, f) => pebble(C('#c8bea0'), x, y, 13, 0.25, 301) || waterTone(R, x, y, f, FOAM, 5),
  water: (R, x, y, f) => waterTone(R, x, y, f, mix(R[0], FOAM, 0.6)),
  deep: (R, x, y, f) => waterTone(R, x, y, f, R[0]),
  marsh: (R, x, y) => { if (fbm(x, y, 311) > 0.63) return POOL[fbm(x, y - 1, 311) > 0.63 ? 2 : 4]; return tuft(LEAF, x, y, 6, 0.5, 312, true) || base(R, x, y, 0.18); },
  swamp: (R, x, y) => { if (fbm(x, y, 321) > 0.55) { const q = spot(x, y, 9, 0.35, 322); if (q && q[0] * q[0] + q[1] * q[1] <= 2) return LILY[q[1] < 0 ? 1 : 2]; return C('#6c8278')[fbm(x, y - 1, 321) > 0.55 ? 2 : 4]; } return tuft(LEAF, x, y, 6, 0.4, 323, true) || base(R, x, y, 0.2); },
  field: (R, x, y) => { const m = ((y % 4) + 4) % 4; return m === 0 ? R[4] : m === 1 ? R[1] : base(R, x, y, 0.1); },
  wheat: (R, x, y) => { const c = ((x % 3) + 3) % 3, k = h2(Math.floor(x / 3), 7, 331), m = ((Math.floor(y + k * 6) % 6) + 6) % 6; if (c === 1) return m === 0 ? GRAIN[0] : m === 1 ? GRAIN[1] : m < 4 ? STALK[2] : STALK[3]; return m === 5 ? R[4] : R[c ? 2 : 3]; },
  crops: (R, x, y) => { const cx = ((x % 8) + 8) % 8, cy = ((y % 8) + 8) % 8, dx = cx - 3.5, dy = cy - 3.5, d = dx * dx + dy * dy * 1.4; if (d < 9) return LEAF[d < 3 ? (dy < 0 ? 0 : 1) : dy > 0 ? 4 : 2]; return cy === 7 ? R[4] : base(R, x, y, 0.1); },
  vineyard: (R, x, y) => { const cx = ((x % 8) + 8) % 8; if (cx >= 2 && cx <= 5) { const g = h2(Math.floor(x / 8), Math.floor(y / 5), 341); if (g < 0.3 && cx > 2 && cx < 5 && y % 5 > 1) return GRAPE[y % 5 === 2 ? 1 : 3]; return VINE[cx === 2 ? 1 : cx === 5 ? 4 : (y % 3 ? 2 : 3)]; } return cx === 6 ? R[4] : base(R, x, y, 0.1); },
  cobble: (R, x, y) => R[blocks(x, y, 8, 6, true)],
  flagstone: (R, x, y) => R[blocks(x, y, 16, 16, true, 1)],
  plaza: (R, x, y, f, G, k) => { const t = blocks(x, y, 16, 16, false, 2), cx = ((x % 32) + 32) % 32 - 15.5, cy = ((y % 32) + 32) % 32 - 15.5; if (t !== 4 && Math.abs(cx) + Math.abs(cy) < 7) return C('#c98a72')[Math.abs(cx) + Math.abs(cy) < 4 ? 2 : 1]; return R[t]; },
  planks: (R, x, y) => R[boardsTone(x, y, 6, 1)],
  floorboards: (R, x, y) => R[boardsTone(x, y, 8, 2)],
  oakfloor: (R, x, y) => R[boardsTone(x, y, 6, 3)],
  stonefloor: (R, x, y) => R[blocks(x, y, 16, 16, false, 3)],
  checker: (R, x, y) => { const t = blocks(x, y, 16, 16, false, 4), dark = (Math.floor(x / 16) + Math.floor(y / 16)) % 2; return dark && t !== 4 ? dim(R[t], 0.62) : R[t]; },
  carpet: (R, x, y, f, G, k) => carpetTone(R, x, y, G, k, CARPET_MARK.carpet),
  carpetblue: (R, x, y, f, G, k) => carpetTone(R, x, y, G, k, CARPET_MARK.carpetblue),
  rushes: (R, x, y) => { const q = spot(x, y, 4, 0.8, 351, 1); if (q && q[1] === 0 && Math.abs(q[0]) <= 1) return STRAW[q[0] ? 3 : 1]; return base(R, x, y, 0.14); }
};
function carpetTone(R, x, y, G, k, M) {
  const d = edgeDist(G, x, y, k);
  if (d === 0) return R[4]; if (d >= 2 && d < 4) return GOLDC[d === 2 ? 1 : 2]; if (d === 5) return M[2];
  const cx = ((x % 16) + 16) % 16 - 7.5, cy = ((y % 16) + 16) % 16 - 7.5, m = Math.abs(cx) + Math.abs(cy);
  if (d > 6 && m < 2) return GOLDC[1]; if (d > 6 && m < 3.5) return M[2];
  return base(R, x, y, 0.05);
}
const TEXI = INFO.map(I => TEX[I.id] || ((R, x, y) => base(R, x, y)));
const texel = (k, x, y, f, G) => TEXI[k](INFO[k].R, x, y, f, G, k);

/* ---------- a tile's top ---------- */
const PAD = 3, PW = TILE + 2 * PAD;
const elevAt = (G, x, y) => { const u = at(G, x, y); return u < 0 || G.terr[u] < 0 ? null : G.elev[u]; };
/* the top of tile (tx, ty) as TILE × TILE RGBA, frame f of the animated grounds */
function tileTop(G, tx, ty, f = 0) {
  const out = new Uint8ClampedArray(TILE * TILE * 4), u = at(G, tx, ty); if (u < 0 || G.terr[u] < 0) return out;
  const e = G.elev[u], gx0 = tx * TILE - PAD, gy0 = ty * TILE - PAD, cls = new Int16Array(PW * PW), lvl = new Int16Array(PW * PW);
  for (let j = 0; j < PW; j++) for (let i = 0; i < PW; i++) { const gx = gx0 + i, gy = gy0 + j, c = classify(G, gx, gy); cls[j * PW + i] = c; const ee = c < 0 ? null : elevAt(G, Math.floor(gx / TILE), Math.floor(gy / TILE)); lvl[j * PW + i] = ee == null ? -999 : ee; }
  const eN = elevAt(G, tx, ty - 1), eS = elevAt(G, tx, ty + 1), eW = elevAt(G, tx - 1, ty), eE = elevAt(G, tx + 1, ty);
  for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
    const i = (ly + PAD) * PW + lx + PAD, k = cls[i], gx = tx * TILE + lx, gy = ty * TILE + ly, I = INFO[k];
    let c = texel(k, gx, gy, f, G);
    /* where two grounds meet on one level: the higher-ranked one is inked along its edge, and shades the lower one
       below its edge; the sea gets a bank and foam */
    let edge = false, shade = 0;
    for (const d of [-1, 1, -PW, PW]) { const n = cls[i + d]; if (n >= 0 && n !== k && lvl[i + d] === e && INFO[n].fam !== I.fam && INFO[n].rank < I.rank) edge = true; }
    if (edge) c = mix(I.R[4], INK, 0.35);
    else {
      for (let s = 1; s <= 3; s++) { const n = cls[i - s * PW]; if (n >= 0 && n !== k && lvl[i - s * PW] === e && INFO[n].fam !== I.fam && INFO[n].rank > I.rank) { shade = s; break; } }
      if (shade && I.water) {
        const n = cls[i - shade * PW]; c = shade < 3 ? INFO[n].S[shade === 1 ? 2 : 3] : f % 2 ? FOAM : mix(FOAM, c, 0.4);
      } else if (shade) c = dim(c, shade === 1 ? 0.74 : shade === 2 ? 0.84 : 0.93);
      else if (I.water) {
        for (const d of [-1, 1, PW, -2, 2, 2 * PW]) { const n = cls[i + d]; if (n >= 0 && !INFO[n].water && lvl[i + d] === e) { const near = d === -1 || d === 1 || d === PW; if (h2(gx, gy, f + 70) < (near ? 0.75 : 0.35)) c = mix(FOAM, c, near ? 0.2 : 0.55); break; } }
      }
    }
    /* heights: a lit lip on the edges that fall away, an inked rim at the sides, shadows below what rises */
    if (eW === null || eW < e) { if (lx === 0) c = mix(I.R[4], INK, 0.5); }
    else if (eW > e) { const w = Math.min(TILE, (eW - e) * 6); if (lx < w) c = dim(c, 0.74 + 0.16 * lx / w); }
    if (eE === null || eE < e) { if (lx === TILE - 1) c = mix(I.R[4], INK, 0.5); }
    if (eN === null || eN < e) { if (ly === 0) c = mix(c, [255, 250, 235], 0.35); }
    else if (eN > e && ly < 4) c = dim(c, 0.66 + 0.08 * ly);
    if ((eS === null || eS < e) && ly === TILE - 1) c = mix(c, [255, 250, 235], 0.3);
    const o = (ly * TILE + lx) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
  return out;
}
/* does tile (tx, ty) change from frame to frame (water or lava on it or wandering into it)? */
function animated(G, tx, ty) {
  const u = at(G, tx, ty); if (u < 0 || G.terr[u] < 0) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = terrAt(G, tx + dx, ty + dy); if (t >= 0 && INFO[t].anim && (!dx && !dy || G.elev[at(G, tx + dx, ty + dy)] === G.elev[u])) return true; }
  return false;
}

/* ---------- a tile's cliff ---------- */
/* how far the face below tile (tx, ty) drops, in art pixels: down to the tile in front on the same layer, or on an
   upper floor with nothing in front, down to the ground there */
function faceHeight(G, tx, ty) {
  const u = at(G, tx, ty); if (u < 0 || G.terr[u] < 0) return 0;
  const s = at(G, tx, ty + 1), e = G.elev[u];
  const below = s < 0 ? (G.L ? G.ground[u] : 0) : G.terr[s] >= 0 ? G.elev[s] : G.ground[s];
  return Math.max(0, (e - below) * LIFT);
}
/* the face below tile (tx, ty): TILE × faceHeight RGBA */
function tileFace(G, tx, ty, f = 0) {
  const h = faceHeight(G, tx, ty), out = new Uint8ClampedArray(TILE * Math.max(1, h) * 4); if (!h) return { w: TILE, h: 0, px: out };
  const u = at(G, tx, ty), k = G.terr[u], I = INFO[k], e = G.elev[u], top = e * LIFT, steep = h > LIFT, hW = faceHeight(G, tx - 1, ty), hE = faceHeight(G, tx + 1, ty);
  const S = I.S;
  for (let y = 0; y < h; y++) for (let x = 0; x < TILE; x++) {
    const gx = tx * TILE + x, wy = top - y; let c;
    if (I.face === 'water' || I.face === 'lava') {
      const R = I.R, s = ((y - f * 4 + Math.floor(h2(gx, 5) * 9)) % 9 + 9) % 9;
      c = I.face === 'lava' ? (s < 2 ? GLOW[1] : R[s < 5 ? 2 : 3]) : y < 2 ? FOAM : s < 2 ? mix(R[0], FOAM, 0.6) : R[s < 5 ? 1 : 2];
    } else if (I.face === 'wood') {
      const t = boardsTone(gx, y, 5, 7); c = S[Math.min(4, t + 1)];
      if (y === 0) c = mix(S[4], INK, 0.5);
    } else if ((steep && I.face !== 'stone') || I.face === 'rock') {
      /* natural rock: boulders lit on their upper left, cracks between them */
      const w = worley(gx, wy, 11, 8, 5), lit = w.dx + w.dy;
      c = w.edge < 0.09 ? mix(S[4], INK, 0.35) : w.edge < 0.18 && lit > 0 ? S[3] : lit < -0.35 ? S[1] : w.id < 0.3 ? S[3] : S[2];
    } else if (I.face === 'stone') {
      const t = blocks(gx + Math.floor(h2(Math.floor(wy / 7), 3) * 6), wy, 10 + Math.floor(h2(Math.floor(wy / 7), 4) * 5), 7, false, 5);
      c = S[t === 4 ? 4 : t === 0 ? 1 : t === 1 ? 1 : t]; if (t === 4) c = mix(S[4], INK, 0.3);
    } else {
      /* an earth bank: wandering strata */
      const n = vnoise(gx / 11, wy / 3, 61); c = S[n < 0.3 ? 3 : n > 0.72 ? 1 : 2];
      if (h2(gx, wy, 62) < 0.05) c = S[4];
    }
    /* the light falls from the upper left: the face darkens toward its foot */
    if (I.face !== 'water' && I.face !== 'lava') c = dim(c, 1 - 0.18 * y / h);
    /* grass, crops and snow hang a ragged lip over the brink */
    if (I.lip && I.face !== 'water') { const lip = 2 + Math.floor(h2(gx, 0, 63) * 3) + (h2(Math.floor(gx / 3), 1, 64) < 0.25 ? 2 : 0); if (y < lip) c = I.lip[y === lip - 1 ? 4 : y === 0 ? 2 : 3]; }
    else if (y === 0 && I.face !== 'water' && I.face !== 'lava') c = mix(I.R[4], INK, 0.4);
    if (y === h - 1) c = mix(c, INK, 0.45);
    /* the rim where the face ends beside a lower one */
    if ((x === 0 && y >= hW) || (x === TILE - 1 && y >= hE)) c = mix(c, INK, 0.6);
    else if (x === TILE - 1 && I.face !== 'water') c = dim(c, 0.9);
    const o = (y * TILE + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
  return { w: TILE, h, px: out };
}
const faceAnimated = (G, tx, ty) => { const u = at(G, tx, ty); return u >= 0 && G.terr[u] >= 0 && INFO[G.terr[u]].anim && faceHeight(G, tx, ty) > 0; };

export { FRAMES, INFO, LIFT, TILE, animated, classify, faceAnimated, faceHeight, fbm, h2, layerOf, mixHex, texel, tileFace, tileTop };
