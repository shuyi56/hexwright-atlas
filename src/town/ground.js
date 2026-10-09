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
   Height is a continuous surface, LIFT art pixels up per height level, seen obliquely from the south. Between
   tiles one level apart (a step a walker can take) the ground rises in a smooth slope, lit where it faces the
   light (the upper left) and shaded where it turns away; only where it jumps two levels or more (where no one can
   walk) does it break into a cliff, its edge wandering like any other border. The surface is drawn column by
   column from the south, as a height-field is: each point of ground stands at its height, and where it rises above
   what is in front of it the gap below hangs as a cliff face (earth or rock with a grass lip, coursed stone under
   paving, beams under floors, falling water). Every screen pixel remembers which row of ground it shows, so
   figures and pieces standing behind a rise are hidden by it exactly. Upper floors that are shown join the
   surface STOREY levels above the ground under them. No DOM. */
const TILE = 64, LIFT = 14, FRAMES = 4, WOBBLE = 18, ROAD_WOBBLE = 6, CLIFF_WOBBLE = 16, CHUNK = 128;

/* ---------- noise ---------- */
const h2 = (x, y, s = 0) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s + 0x9e37, 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/* a slower noise for borders: broad, gentle curves with no small-scale fray */
const soft = (x, y, s) => 0.78 * vnoise(x / 26, y / 26, s) + 0.22 * vnoise(x / 13, y / 13, s + 7);
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
    id: t.id, R: rampRgb(t.top), S: rampRgb(t.side[0]), fam, crisp, road: t.id === 'road', rank: RANK[fam] ?? 3, water: !!t.water, anim: !!t.water || !!t.glow,
    face: t.water ? 'water' : t.glow ? 'lava' : fam === 'snow' ? 'snow' : t.group === 'Floors' || t.id === 'planks' ? 'wood' : crisp && t.group !== 'Farm' ? 'stone' : fam === 'rock' || fam === 'sand' ? 'rock' : 'earth',
    lip: fam === 'green' || fam === 'wet' || t.group === 'Farm' ? rampRgb(t.top) : fam === 'snow' ? rampRgb('#eceeea') : null
  };
});
const INK = rgb(OUTLINE), WET = INFO.map(I => I.water);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k * 1.04];
const FLOWERS = ['#f4ecd8', '#e2bf4e', '#c4503e', '#9a7fc0'].map(rampRgb);
const C = hex => rampRgb(hex);
const LEAF = C('#6f8a40'), GRAIN = C('#e8d18a'), STALK = C('#b89443'), VINE = C('#5c773f'), GRAPE = C('#6a3d5c'), BUSH = C('#8f9a5a'), POOL = C('#8eb0ab'), LILY = C('#9ab06a');
const TERRA = C('#c98a72'), PEBBLE = C('#bdb39d'), SNOWY = C('#eef0ec'), SHOAL = C('#c8bea0'), SWAMPW = C('#6c8278');
const GOLDC = C('#e8ce8c'), CARPET_MARK = { carpet: C('#5a281e'), carpetblue: C('#283446') }, GLOW = C('#f4c25a'), CRUST = C('#5a4a42'), FOAM = rgb('#eef2ea'), STRAW = C('#b8a266');

/* ---------- the surface ---------- */
/* the surface of map M seen with the storeys up to `top` shown: each tile's ground (or the highest floor laid over
   it up to top), the storey that is and its height in levels */
function fieldOf(M, top = 0) {
  const S = M.S, NN = S * S, terr = new Int16Array(NN), hgt = new Float32Array(NN), lev = new Uint8Array(NN); let maxH = 0;
  for (let u = 0; u < NN; u++) {
    let L = 0, t = M.terr[u];
    for (let l = 1; l <= top; l++) { const v = M.floors && M.floors[l - 1] ? M.floors[l - 1][u] : 0; if (v) { L = l; t = v - 1; } }
    terr[u] = t; lev[u] = L; hgt[u] = M.elev[u] + STOREY * L; if (hgt[u] > maxH) maxH = hgt[u];
  }
  /* tiles with a slope round them (a neighbour one level off), where the ground is shaded by how it faces */
  const slope = new Uint8Array(NN);
  for (let u = 0; u < NN; u++) { const x = u % S, y = (u / S) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < S && Y < S && Math.abs(hgt[Y * S + X] - hgt[u]) === 1) slope[u] = 1; } }
  return { S, top, terr, hgt, lev, maxH, slope, cells: new Map() };
}
const at = (G, x, y) => (x < 0 || y < 0 || x >= G.S || y >= G.S ? -1 : y * G.S + x);
const terrAt = (G, x, y) => { const u = at(G, x, y); return u < 0 ? -1 : G.terr[u]; };
const cliff = (F, u, w) => Math.abs(F.hgt[u] - F.hgt[w]) >= 2;
/* the tile whose height map pixel (gx, gy) takes: its own, or across a cliff a neighbour reached through a small
   wobble, so cliff edges wander instead of running along the grid */
function ownTile(F, gx, gy) {
  const tx = Math.floor(gx / TILE), ty = Math.floor(gy / TILE), u = at(F, tx, ty); if (u < 0) return -1;
  const w = at(F, Math.floor((gx + (soft(gx, gy, 13) - 0.5) * 2 * CLIFF_WOBBLE) / TILE), Math.floor((gy + (soft(gx, gy, 14) - 0.5) * 2 * CLIFF_WOBBLE) / TILE));
  if (w < 0 || w === u || !cliff(F, u, w) || F.lev[u] || F.lev[w]) return u;
  /* built ground and floors keep their straight edges */
  const a = F.terr[u], b = F.terr[w]; return a < 0 || b < 0 || INFO[a].crisp || INFO[b].crisp ? u : w;
}
/* the ground showing at map pixel (gx, gy) of tile u: u's own, or for soft grounds, a neighbour's reached through
   a smooth wobble, so the borders between them meander. Grounds across a cliff, built grounds and the void never
   wander in. */
function classify(F, gx, gy, u = ownTile(F, gx, gy)) {
  if (u < 0) return -1;
  const own = F.terr[u]; if (own < 0 || INFO[own].crisp) return own;
  const b = wander(F, gx, gy, u, own), w = waterShape(F, gx, gy, u);
  /* the water's shape decides wet or dry; the wander still picks which water or which ground */
  if (w < 0) return b;
  return INFO[b].water === INFO[w].water ? b : w;
}
function wander(F, gx, gy, u, own) {
  let s = at(F, Math.floor((gx + (soft(gx, gy, 1) - 0.5) * 2 * WOBBLE) / TILE), Math.floor((gy + (soft(gx, gy, 2) - 0.5) * 2 * WOBBLE) / TILE));
  /* a road keeps a straighter edge: a smaller, slower wander */
  if (INFO[own].road || (s >= 0 && F.terr[s] >= 0 && INFO[F.terr[s]].road)) s = at(F, Math.floor((gx + (vnoise(gx / 40, gy / 40, 15) - 0.5) * 2 * ROAD_WOBBLE) / TILE), Math.floor((gy + (vnoise(gx / 40, gy / 40, 16) - 0.5) * 2 * ROAD_WOBBLE) / TILE));
  if (s < 0 || s === u) return own;
  const t = F.terr[s]; return t < 0 || INFO[t].crisp || cliff(F, u, s) ? own : t;
}
/* Water takes its shape from the tiles round it rather than their squares: each pixel weighs the water tiles of
   the 3 × 3 round it (on its own level) by how near their centres are, and lies in the water where they outweigh
   the land. A stream stepping diagonally from tile to tile so flows as one smooth ribbon instead of a staircase,
   and a pond's corners round off. The point weighed wanders a little, as other borders do. Returns the ground for
   pixels near water, or -1 to leave the pixel to the other rules. */
const WATER_SIGMA2 = 2 * 0.62 * 0.62, CHANNEL2 = 0.4 * 0.4;
function waterShape(F, gx, gy, u) {
  const S = F.S, tx = u % S, ty = (u / S) | 0;
  let any = INFO[F.terr[u]].water, dry = !any;
  for (let dy = -1; dy <= 1 && !(any && dry); dy++) for (let dx = -1; dx <= 1; dx++) { const n = at(F, tx + dx, ty + dy); if (n < 0 || F.terr[n] < 0 || cliff(F, u, n)) continue; if (INFO[F.terr[n]].water) any = true; else dry = true; }
  if (!any || !dry) return -1;
  const px = (gx + (soft(gx, gy, 3) - 0.5) * WOBBLE) / TILE, py = (gy + (soft(gx, gy, 4) - 0.5) * WOBBLE) / TILE;
  let wet = 0, all = 0, bestWet = -1, bestDry = -1, dWet = 9, dDry = 9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const n = at(F, tx + dx, ty + dy); if (n < 0 || F.terr[n] < 0 || cliff(F, u, n)) continue;
    const t = F.terr[n], cx = tx + dx + 0.5 - px, cy = ty + dy + 0.5 - py, d2 = cx * cx + cy * cy, k = Math.exp(-d2 / WATER_SIGMA2);
    all += k;
    if (INFO[t].water) { wet += k; if (d2 < dWet) { dWet = d2; bestWet = t; } }
    else if (!INFO[t].crisp && d2 < dDry) { dDry = d2; bestDry = t; }
  }
  if (wet > all * 0.5) return bestWet;
  /* channels: within reach of the line joining two neighbouring water tiles (diagonals too), so a chain of them
     always flows as one river */
  for (let a = 0; a < 9; a++) {
    const ax = tx + (a % 3) - 1, ay = ty + ((a / 3) | 0) - 1, na = at(F, ax, ay); if (na < 0 || F.terr[na] < 0 || !INFO[F.terr[na]].water || cliff(F, u, na)) continue;
    for (let b = a + 1; b < 9; b++) {
      const bx = tx + (b % 3) - 1, by = ty + ((b / 3) | 0) - 1; if (Math.abs(bx - ax) > 1 || Math.abs(by - ay) > 1) continue;
      const nb = at(F, bx, by); if (nb < 0 || F.terr[nb] < 0 || !INFO[F.terr[nb]].water || cliff(F, u, nb)) continue;
      const vx = bx - ax, vy = by - ay, wx = px - ax - 0.5, wy = py - ay - 0.5, t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy))), ex = wx - vx * t, ey = wy - vy * t;
      if (ex * ex + ey * ey < CHANNEL2) return F.terr[t < 0.5 ? na : nb];
    }
  }
  return bestDry >= 0 ? bestDry : INFO[F.terr[u]].water ? -1 : F.terr[u];
}
/* the ground and height tile of every pixel, worked out a tile at a time and kept */
function cellsOf(F, tx, ty) {
  const key = ty * F.S + tx; let c = F.cells.get(key);
  if (!c) {
    if (F.cells.size > 1600) F.cells.delete(F.cells.keys().next().value);
    const k = new Int16Array(TILE * TILE), own = new Int32Array(TILE * TILE);
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { const gx = tx * TILE + i, gy = ty * TILE + j, u = ownTile(F, gx, gy); own[j * TILE + i] = u; k[j * TILE + i] = classify(F, gx, gy, u); }
    c = { k, own }; F.cells.set(key, c);
  }
  return c;
}
/* the ground index at map pixel (gx, gy), or -1 off the map; its height tile is left in cellU */
let cellU = -1;
function cellAt(F, gx, gy) {
  const tx = Math.floor(gx / TILE), ty = Math.floor(gy / TILE); if (tx < 0 || ty < 0 || tx >= F.S || ty >= F.S) { cellU = -1; return -1; }
  const c = cellsOf(F, tx, ty), i = (gy - ty * TILE) * TILE + gx - tx * TILE; cellU = c.own[i]; return c.k[i];
}
const cellPair = (F, gx, gy) => { const k = cellAt(F, gx, gy); return [k, cellU]; };
function corner(F, x, y, own, S) {
  x = x < 0 ? 0 : x >= S ? S - 1 : x; y = y < 0 ? 0 : y >= S ? S - 1 : y;
  const w = y * S + x, v = F.hgt[w], tw = F.terr[w]; return v - own >= 2 || own - v >= 2 || (tw >= 0 && WET[tw]) ? own : v;
}
/* the height in levels of map pixel (gx, gy), whose height tile is u: smoothed between the centres of the tiles
   round it, except across a cliff (where it keeps its own level) and on water (which lies flat) */
function heightAt(F, gx, gy, u = ownTile(F, gx, gy)) {
  if (u < 0) return 0;
  const own = F.hgt[u], t = F.terr[u]; if (t >= 0 && WET[t]) return own;
  const fx = gx / TILE - 0.5, fy = gy / TILE - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = smooth(fx - x0), ay = smooth(fy - y0), S = F.S;
  /* paving and roads climb only along the north-south line of their own tiles, so their courses and edges stay
     straight on a slope */
  if (t >= 0 && (INFO[t].crisp || INFO[t].road)) { const ux = u % S, a1 = corner(F, ux, y0, own, S), d1 = corner(F, ux, y0 + 1, own, S); return a1 + (d1 - a1) * ay; }
  const a = corner(F, x0, y0, own, S), b = corner(F, x0 + 1, y0, own, S), d = corner(F, x0, y0 + 1, own, S), e = corner(F, x0 + 1, y0 + 1, own, S);
  return a + (b - a) * ax + (d - a) * ay + (a - b - d + e) * ax * ay;
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
  moor: (R, x, y) => tuft(R, x, y, 7, 0.45, 151) || pebble(PEBBLE, x, y, 16, 0.2, 152) || base(R, x, y, 0.2),
  garden: (R, x, y) => flower(x, y, 7, 0.2, 161) || tuft(R, x, y, 9, 0.3, 162) || base(R, x, y),
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
  tundra: (R, x, y) => { if (fbm(x, y, 261) > 0.64) return SNOWY[fbm(x, y - 1, 261) > 0.64 ? 1 : 2]; return tuft(R, x, y, 9, 0.3, 262) || base(R, x, y, 0.18); },
  ice: (R, x, y) => { const d = ((x - y) % 23 + 23) % 23; if (d === 0 && fbm(x, y, 271) > 0.5) return [255, 255, 255]; if (Math.abs(fbm(x, y, 272) - 0.5) < 0.01) return R[4]; return base(R, x, y, 0.04); },
  ash: (R, x, y) => { const h = h2(x, y, 281); if (h < 0.004) return GLOW[1]; return pebble(R, x, y, 8, 0.2, 282) || base(R, x, y, 0.28); },
  lava: (R, x, y, f) => { const n = fbm(x + f * 1.5, y, 291); if (n < 0.36) return CRUST[n < 0.3 ? 3 : 2]; if (n < 0.4) return R[4]; const g = (Math.floor(x / 3 + y / 5) + f) % 6; return g === 0 ? GLOW[0] : g < 2 ? GLOW[1] : R[n > 0.6 ? 1 : 2]; },
  shallows: (R, x, y, f) => pebble(SHOAL, x, y, 13, 0.25, 301) || waterTone(R, x, y, f, FOAM, 5),
  water: (R, x, y, f) => waterTone(R, x, y, f, mix(R[0], FOAM, 0.6)),
  deep: (R, x, y, f) => waterTone(R, x, y, f, R[0]),
  marsh: (R, x, y) => { if (fbm(x, y, 311) > 0.63) return POOL[fbm(x, y - 1, 311) > 0.63 ? 2 : 4]; return tuft(LEAF, x, y, 6, 0.5, 312, true) || base(R, x, y, 0.18); },
  swamp: (R, x, y) => { if (fbm(x, y, 321) > 0.55) { const q = spot(x, y, 9, 0.35, 322); if (q && q[0] * q[0] + q[1] * q[1] <= 2) return LILY[q[1] < 0 ? 1 : 2]; return SWAMPW[fbm(x, y - 1, 321) > 0.55 ? 2 : 4]; } return tuft(LEAF, x, y, 6, 0.4, 323, true) || base(R, x, y, 0.2); },
  field: (R, x, y) => { const m = ((y % 4) + 4) % 4; return m === 0 ? R[4] : m === 1 ? R[1] : base(R, x, y, 0.1); },
  wheat: (R, x, y) => { const c = ((x % 3) + 3) % 3, k = h2(Math.floor(x / 3), 7, 331), m = ((Math.floor(y + k * 6) % 6) + 6) % 6; if (c === 1) return m === 0 ? GRAIN[0] : m === 1 ? GRAIN[1] : m < 4 ? STALK[2] : STALK[3]; return m === 5 ? R[4] : R[c ? 2 : 3]; },
  crops: (R, x, y) => { const cx = ((x % 8) + 8) % 8, cy = ((y % 8) + 8) % 8, dx = cx - 3.5, dy = cy - 3.5, d = dx * dx + dy * dy * 1.4; if (d < 9) return LEAF[d < 3 ? (dy < 0 ? 0 : 1) : dy > 0 ? 4 : 2]; return cy === 7 ? R[4] : base(R, x, y, 0.1); },
  vineyard: (R, x, y) => { const cx = ((x % 8) + 8) % 8; if (cx >= 2 && cx <= 5) { const g = h2(Math.floor(x / 8), Math.floor(y / 5), 341); if (g < 0.3 && cx > 2 && cx < 5 && y % 5 > 1) return GRAPE[y % 5 === 2 ? 1 : 3]; return VINE[cx === 2 ? 1 : cx === 5 ? 4 : (y % 3 ? 2 : 3)]; } return cx === 6 ? R[4] : base(R, x, y, 0.1); },
  cobble: (R, x, y) => R[blocks(x, y, 8, 6, true)],
  flagstone: (R, x, y) => R[blocks(x, y, 16, 16, true, 1)],
  plaza: (R, x, y, f, G, k) => { const t = blocks(x, y, 16, 16, false, 2), cx = ((x % 32) + 32) % 32 - 15.5, cy = ((y % 32) + 32) % 32 - 15.5; if (t !== 4 && Math.abs(cx) + Math.abs(cy) < 7) return TERRA[Math.abs(cx) + Math.abs(cy) < 4 ? 2 : 1]; return R[t]; },
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

/* ---------- drawing the surface ---------- */
const D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]], SHORE = [[-1, 0], [1, 0], [0, 1], [-2, 0], [2, 0], [0, 2]];
/* the colour of the ground's top at map pixel (gx, gy) of ground k and height tile u, standing h levels up */
function topColour(F, gx, gy, k, u, h, f) {
  const I = INFO[k]; let c = texel(k, gx, gy, f, F);
  const near = (x, y) => { const n = cellAt(F, x, y); return n >= 0 && !cliff(F, u, cellU) ? n : -1; };
  /* where two grounds meet: the higher-ranked one is inked along its edge and shades the lower one below it; the
     sea gets a bank and foam */
  let edge = false;
  for (const [dx, dy] of D4) { const n = near(gx + dx, gy + dy); if (n >= 0 && n !== k && INFO[n].fam !== I.fam && INFO[n].rank < I.rank) { edge = true; break; } }
  if (edge) c = mix(I.R[4], INK, 0.35);
  else {
    let shade = 0, over = -1;
    for (let s = 1; s <= 3; s++) { const n = near(gx, gy - s); if (n >= 0 && n !== k && INFO[n].fam !== I.fam && INFO[n].rank > I.rank) { shade = s; over = n; break; } }
    if (shade && I.water) c = shade < 3 ? INFO[over].S[shade === 1 ? 2 : 3] : mix(FOAM, c, 0.25);
    else if (shade) c = dim(c, shade === 1 ? 0.74 : shade === 2 ? 0.84 : 0.93);
    else if (I.water) for (const [dx, dy] of SHORE) { const n = near(gx + dx, gy + dy); if (n >= 0 && !INFO[n].water) { c = mix(FOAM, c, Math.abs(dx) + Math.abs(dy) === 1 ? 0.3 : 0.7); break; } }
  }
  if (!I.water && F.slope[u]) {
    /* slopes: lit facing the upper left, shaded facing away */
    const dx = heightAt(F, gx + 2, gy, u) - heightAt(F, gx - 2, gy, u), dy = heightAt(F, gx, gy + 2, u) - heightAt(F, gx, gy - 2, u);
    if (dx || dy) { const l = 1 + 1.8 * (dx * 0.7 + dy * 0.45); c = l > 1 ? mix(c, [255, 250, 232], Math.min(0.35, (l - 1) * 0.9)) : dim(c, Math.max(0.6, l)); }
  }
  /* a cliff to the west throws its shadow east across this ground; one just north darkens its foot */
  const S = F.S, tx = Math.floor(gx / TILE), ty = Math.floor(gy / TILE), hw = tx > 0 ? F.hgt[ty * S + tx - 1] : 0, hn = ty > 0 ? F.hgt[(ty - 1) * S + tx] : 0;
  const hu = F.hgt[u];
  if (hw - hu >= 2 || (tx > 0 && ty > 0 && F.hgt[(ty - 1) * S + tx - 1] - hu >= 2) || (tx > 0 && ty + 1 < S && F.hgt[(ty + 1) * S + tx - 1] - hu >= 2)) {
    for (let s = 3; s <= 40; s += 3) { const w = ownTile(F, gx - s, gy); if (w < 0) break; if ((heightAt(F, gx - s, gy, w) - h) * LIFT > s * 0.8 + 1) { c = dim(c, 0.72); break; } }
  }
  if (hn - hu >= 2 || (ty > 0 && cliff(F, u, (ty - 1) * S + tx))) { const w = ownTile(F, gx, gy - 4); if (w >= 0 && heightAt(F, gx, gy - 4, w) - h >= 1.5) c = dim(c, 0.76); }
  return c;
}
/* the colour of a cliff face r pixels below the brink of map pixel (gx, gy), in a face run pixels deep */
function faceColour(F, gx, gy, k, u, h, r, run, f) {
  const I = INFO[k], S2 = I.S, wy = Math.round(h * LIFT) - r; let c;
  if (I.face === 'water' || I.face === 'lava') {
    const R = I.R, s = ((r - f * 4 + Math.floor(h2(gx, 5) * 9)) % 9 + 9) % 9;
    return I.face === 'lava' ? (s < 2 ? GLOW[1] : R[s < 5 ? 2 : 3]) : r < 2 ? FOAM : s < 2 ? mix(R[0], FOAM, 0.6) : R[s < 5 ? 1 : 2];
  }
  if (I.face === 'wood') { c = S2[Math.min(4, boardsTone(gx, wy, 5, 7) + 1)]; }
  else if (I.face === 'stone') { const t = blocks(gx + Math.floor(h2(Math.floor(wy / 7), 3) * 6), wy, 10 + Math.floor(h2(Math.floor(wy / 7), 4) * 5), 7, false, 5); c = t === 4 ? mix(S2[4], INK, 0.3) : S2[t === 0 ? 1 : t]; }
  else if (I.face === 'rock' || run > 2 * LIFT + 4) { const w = worley(gx, wy, 11, 8, 5), lit = w.dx + w.dy; c = w.edge < 0.09 ? mix(S2[4], INK, 0.35) : w.edge < 0.18 && lit > 0 ? S2[3] : lit < -0.35 ? S2[1] : w.id < 0.3 ? S2[3] : S2[2]; }
  else { const n = vnoise(gx / 11, wy / 3, 61); c = S2[n < 0.3 ? 3 : n > 0.72 ? 1 : 2]; if (h2(gx, wy, 62) < 0.05) c = S2[4]; }
  c = dim(c, 1 - 0.22 * r / run);
  /* grass, crops and snow hang a ragged lip over the brink; anything else is inked along it */
  if (I.lip) { const lip = 2 + Math.floor(h2(gx, 0, 63) * 3) + (h2(Math.floor(gx / 3), 1, 64) < 0.25 ? 2 : 0); if (r <= lip) c = I.lip[r === lip ? 4 : r === 1 ? 2 : 3]; }
  else if (r === 1) c = mix(I.R[4], INK, 0.4);
  if (r === run - 1) c = mix(c, INK, 0.45);
  return c;
}
/* Draw the surface into a CHUNK × CHUNK piece of the screen whose top left is art pixel (X0, Y0): RGBA, and for each
   pixel 1 + the row of ground it shows (0 for none). A screen pixel (X, Y) shows ground (X, gy) standing at
   Y = gy - height × LIFT; each column is walked from the south, and wherever a point stands above everything in
   front of it, the rows down to the next point are its cliff face. */
function renderChunk(F, X0, Y0, f = 0) {
  const W = CHUNK, px = new Uint8ClampedArray(W * W * 4), depth = new Uint16Array(W * W), S = F.S, end = S * TILE, maxL = F.maxH * LIFT, Y1 = Y0 + W;
  for (let i = 0; i < W; i++) {
    const gx = X0 + i; if (gx < 0 || gx >= end) continue;
    const g0 = Math.min(end - 1, Math.floor(Y1 + maxL + 1)), g1 = Math.max(0, Y0);
    /* the map's south edge stands on a face down to height 0 */
    let ymin = g0 === end - 1 ? end : Infinity;
    for (let gy = g0; gy >= g1; gy--) {
      const k = cellAt(F, gx, gy), u = cellU; if (k < 0) continue;
      const h = heightAt(F, gx, gy, u), sy = Math.round(gy - h * LIFT);
      if (sy >= ymin) continue;
      const run = ymin === Infinity ? 1 : ymin - sy, a = Math.max(sy, Y0), b = Math.min(ymin, Y1);
      if (a < b) {
        const top = topColour(F, gx, gy, k, u, h, f), steep = run > 3;
        for (let y = a; y < b; y++) {
          const r = y - sy; let c = r === 0 || !steep ? top : faceColour(F, gx, gy, k, u, h, r, run, f);
          if (r === 0 && steep) c = mix(c, [255, 250, 235], 0.3);
          const o = (y - Y0) * W + i; px[o * 4] = c[0]; px[o * 4 + 1] = c[1]; px[o * 4 + 2] = c[2]; px[o * 4 + 3] = 255; depth[o] = gy + 1;
        }
      }
      ymin = sy;
    }
  }
  return { px, depth };
}
/* the screen row of map pixel (gx, gy)'s top */
const screenY = (F, gx, gy) => Math.round(gy - heightAt(F, gx, gy) * LIFT);
const isWater = (F, u) => u >= 0 && F.terr[u] >= 0 && INFO[F.terr[u]].water;

export { CHUNK, FRAMES, INFO, LIFT, TILE, cellAt, cellPair, classify, fbm, fieldOf, h2, heightAt, isWater, mixHex, ownTile, renderChunk, screenY, texel };
