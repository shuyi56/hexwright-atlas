import { mulberry32 } from '../core/random.js';
import { OUTLINE, hexRgb, mixHex, ramp } from '../characters/pixels.js';
import { TERRAIN, TERRAIN_BY_ID } from '../tiles/terrain.js';

/* ================= tactical view: the pixel tile sheet =================
   Every ground in the tile set (tiles/terrain.js) redrawn as pixel art at the characters' own scale, for the
   zoomed-in tactical camera. One art pixel is one unit of the map's projection, so a tile is the classic 2:1
   diamond 32 wide and 16 tall, a height level is 8 pixels of cliff, and a 32×48 figure stands on it at the
   proportions of Final Fantasy Tactics and Tactics Ogre.

   The diamond's rows are 2, 6, ... 30, 30, ... 6, 2 pixels wide, so neighbouring tiles meet without a gap or an
   overlap. Each ground keeps its tile's colours: its top becomes a five-step ramp (characters/pixels.js), its
   marks (tufts, cobbles, furrows, ripples) are redrawn as pixels in tile space, and each comes in four variants so
   a field of one ground does not repeat. Cliff faces hang below the diamond's lower edges in the tile's two side
   colours, lit on the left, with strata at every height level. Water and lava come in four frames.
   No DOM: an image is { w, h, px } RGBA, so Node draws the sheet (tools/tactical-sheet.mjs) and the browser makes
   canvases from the same pixels (tactical/render.js). */
const TW = 32, TH = 16, STEP = 8, PAD = 6, VARIANTS = 4, FRAMES = 4;
/* rows y = 0..15 of the diamond: dy rows from the nearer point, x in [15 - 2dy, 17 + 2dy) */
const inDiamond = (x, y) => { if (y < 0 || y >= TH) return false; const dy = y < 8 ? y : 15 - y; return x >= 15 - 2 * dy && x < 17 + 2 * dy; };
/* the last diamond row in column x (0..31); the faces start one row below it. Columns 0 and 31 lie outside the
   diamond but belong to the faces, which meet the next block's faces there */
const bottomOf = x => (x <= 0 || x >= 31 ? 7 : 8 + Math.floor(((x < 16 ? x : 31 - x) - 1) / 2));
/* a pixel's place in tile space, in sixteenths: u along the tile's x edge, v along its y edge, both 0..16 */
const tileUV = (x, y) => [(y + 0.5) + (x + 0.5 - 16) / 2, (y + 0.5) - (x + 0.5 - 16) / 2];
/* the pixel at tile-space (u, v) sixteenths */
const atUV = (u, v) => [Math.floor(16 + (u - v)), Math.floor((u + v) / 2)];

/* ---------- images ---------- */
const image = (w, h) => ({ w, h, px: new Uint8ClampedArray(w * h * 4) });
function put(im, x, y, hex, a = 1) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= im.w || y >= im.h) return;
  const u = (y * im.w + x) * 4, c = hexRgb(hex), p = im.px, A = p[u + 3] / 255, out = a + A * (1 - a);
  if (out <= 0) return;
  for (let i = 0; i < 3; i++) p[u + i] = Math.round((c[i] * a + p[u + i] * A * (1 - a)) / out);
  p[u + 3] = Math.round(out * 255);
}
const filled = (im, x, y) => x >= 0 && y >= 0 && x < im.w && y < im.h && im.px[(y * im.w + x) * 4 + 3] > 0;
const ramps = new Map();
const rampOf = hex => { let r = ramps.get(hex); if (!r) { r = ramp(hex); ramps.set(hex, r); } return r; };
const hash = (a, b, c = 0) => { let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35) ^ Math.imul(c + 0x1656, 0x27d4eb2f); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const ink = (hex, k) => mixHex(hex, OUTLINE, k);

/* ---------- the tops ----------
   A painter gets a pen for one tile top: tone(x, y, step) and set(x, y, colour) in diamond pixels (y may go up to
   PAD rows above the diamond, for anything standing on the ground), each(fn) visiting every diamond pixel with its
   tile-space (u, v), the ground's ramp R, a seeded random stream r, the variant v, the frame f and axis (which
   tile edge directional marks run along: 0 the x edge, 1 the y edge). */
function pen(im, T, variant, frame) {
  const R = rampOf(T.top), r = mulberry32(hashStr(T.id) * 7 + variant * 131 + 1);
  const set = (x, y, hex, a = 1) => put(im, x, y + PAD, hex, a);
  const P = {
    im, T, R, r, v: variant, f: frame, axis: variant & 1, set,
    tone: (x, y, s) => set(x, y, R[s]),
    each(fn) { for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (inDiamond(x, y)) { const [u, v] = tileUV(x, y); fn(x, y, u, v); } },
    /* a random pixel of the diamond, kept a margin m (pixels) inside its edges */
    spot(m = 2) { for (;;) { const x = 2 + Math.floor(r() * 28), y = 1 + Math.floor(r() * 14); if ([[x - m, y], [x + m, y], [x, y - (m >> 1)], [x, y + (m >> 1)]].every(([i, j]) => inDiamond(i, j))) return [x, y]; } },
    /* along the axis: a is the coordinate across the marks, b the one along them */
    ab: (u, v) => (variant & 1 ? [u, v] : [v, u]),
    tuft(x, y, col, h = 2) { const D = rampOf(col); set(x - 1, y, D[3]); set(x + 1, y, D[3]); for (let k = 0; k < h; k++) set(x, y - k, k === h - 1 ? D[1] : D[2]); set(x - 1, y - 1, D[2]); if (h > 2) set(x + 1, y - 2, D[1]); },
    pebble(x, y, col, w = 2) { const D = rampOf(col); for (let i = 0; i < w; i++) { set(x + i, y, D[i ? 2 : 1]); set(x + i, y + 1, ink(D[3], 0.35)); } if (w > 2) set(x + 1, y - 1, D[0]); },
    blob(x, y, rx, ry, col, out = true) {
      const D = rampOf(col);
      for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
        const d = (i / (rx + 0.5)) ** 2 + (j / (ry + 0.5)) ** 2; if (d > 1) continue;
        const edge = out && ((i / (rx + 0.5)) ** 2 + ((j + 1) / (ry + 0.5)) ** 2 > 1 || ((i + 1) / (rx + 0.5)) ** 2 + (j / (ry + 0.5)) ** 2 > 1);
        set(x + i, y + j, edge ? ink(D[4], 0.45) : D[i + j < -1 ? 1 : i + j > 1 ? 3 : 2]);
      }
    }
  };
  return P;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/* base: the ground's tone with a scatter of its lighter and darker steps; the upper edges catch the light and
   the lower ones fall a step into shade, so a run of tiles reads as a grid of blocks, as in the tactics games */
function base(P, grain = 0.12, rim = true) {
  const { R, v } = P;
  P.each((x, y) => {
    const n = hash(x, y, v * 17 + 3); let s = n < grain / 2 ? 1 : n < grain ? 3 : 2;
    if (rim && !inDiamond(x, y - 1)) s = x < 16 ? 1 : (s === 3 ? 2 : s);
    if (rim && !inDiamond(x, y + 1)) s = 3;
    P.set(x, y, R[s]);
  });
}
/* the marks of each ground, after the editor's own (tiles/terrain.js deco) */
const FLOWERS = ['#f4ecd8', '#d9b44a', '#b8483a', '#9a7fc0'];
const GREEN = '#6f8a40', GRASSY = '#7d9450';
const tufts = (P, n, col, h) => { for (let k = 0; k < n; k++) { const [x, y] = P.spot(2); P.tuft(x, y, col, h); } };
const specks = (P, n, s, m = 1) => { for (let k = 0; k < n; k++) { const [x, y] = P.spot(m); P.tone(x, y, s); } };
const dots = (P, n, col) => { const D = rampOf(col); for (let k = 0; k < n; k++) { const [x, y] = P.spot(2); P.set(x, y, D[1]); P.set(x, y + 1, D[3]); } };
/* lines along the axis every `gap` sixteenths, inked by k toward the outline */
const furrows = (P, gap, k = 0.3, lit = true) => P.each((x, y, u, v) => { const [a] = P.ab(u, v), m = Math.floor(a) % gap; if (m === 0) P.set(x, y, ink(P.R[3], k)); else if (lit && m === 1) P.tone(x, y, 1); });
/* a grid of stones or slabs `n` to a tile, every other row shifted half a stone when `bond` */
function stones(P, n, bond, k = 0.32) {
  const size = 16 / n;
  P.each((x, y, u, v) => {
    const row = Math.floor(v / size), uu = u + (bond && row % 2 ? size / 2 : 0), cu = uu % size, cv = v % size;
    if (cu < 1 || cv < 1) { P.set(x, y, ink(P.R[3], k)); return; }
    const stone = Math.floor(uu / size) * 31 + row * 7, t = hash(stone, 5, P.v) < 0.3 ? 1 : 0;
    P.tone(x, y, cu < 2 || cv < 2 ? 1 : cu > size - 1.2 || cv > size - 1.2 ? 3 : 2 - t + (t ? 0 : hash(stone, 9) < 0.25 ? 1 : 0));
  });
}
/* boards along the axis, `wide` sixteenths each, with butt joints where boards end */
function boards(P, wide, k = 0.42) {
  P.each((x, y, u, v) => {
    const [a, b] = P.ab(u, v), board = Math.floor(a / wide), cut = 3 + Math.floor(hash(board, P.v, 11) * 10);
    if (a % wide < 1 || Math.floor(b) === cut) { P.set(x, y, ink(P.R[3], k)); return; }
    const t = hash(board, P.v) < 0.35 ? 1 : hash(board, P.v, 2) < 0.3 ? 3 : 2;
    P.tone(x, y, a % wide < 2 ? Math.max(0, t - 1) : hash(x, y, P.v) < 0.06 ? 3 : t);
  });
}
function carpet(P, edge, mark) {
  const E = rampOf(edge), Mk = rampOf(mark);
  P.each((x, y, u, v) => {
    const d = Math.min(u, v, 16 - u, 16 - v), m = Math.abs(u - 8) + Math.abs(v - 8);
    if (d >= 1.2 && d < 2.4) P.set(x, y, E[2]); else if (d >= 3 && d < 3.8) P.set(x, y, Mk[2]);
    else if (m < 1.8) P.set(x, y, Mk[2]); else if (m < 3.4) P.set(x, y, E[m < 2.4 ? 1 : 2]);
  });
}
/* water: the base tone, darker in rows, with short lit dashes that swell and fade over the four frames */
function water(P, light, dark, n) {
  const { R, f } = P;
  P.each((x, y) => P.set(x, y, R[(y + (x >> 3)) % 5 === 0 && hash(x, y, P.v) < 0.5 ? 3 : 2]));
  const r = mulberry32(P.v * 97 + n);
  for (let k = 0; k < n; k++) {
    const x = 3 + Math.floor(r() * 26), y = 1 + Math.floor(r() * 14), len = [0, 2, 3, 2][(f + k) % 4], cols = (k % 3 ? light : dark);
    for (let i = 0; i < len; i++) if (inDiamond(x + i, y)) P.set(x + i, y, cols);
  }
}

const TOPS = {
  grass: P => { base(P, 0.16); tufts(P, 2 + P.v % 2, GRASSY); if (P.v === 3) dots(P, 1, FLOWERS[0]); },
  meadow: P => { base(P, 0.16); tufts(P, 2, GRASSY); for (const c of FLOWERS) dots(P, 2, c); },
  tallgrass: P => { base(P, 0.2); tufts(P, 6, '#6c8a3c', 3); tufts(P, 3, '#8fa056', 4); },
  pasture: P => { base(P, 0.12); specks(P, 4, 3); if (P.v === 2) { /* a sheep */ const s = '#f4efe2', D = rampOf(s); for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) P.set(13 + i, 6 + j, D[j ? (i > 2 ? 2 : 1) : 0]); for (let i = -1; i <= 5; i++) { P.set(13 + i, 5, ink(D[4], 0.6)); P.set(13 + i, 9, ink(D[4], 0.7)); } P.set(12, 6, OUTLINE); P.set(12, 7, OUTLINE); P.set(18, 6, ink(D[4], 0.6)); P.set(18, 7, ink(D[4], 0.6)); P.set(14, 10, OUTLINE); P.set(17, 10, OUTLINE); } else tufts(P, 1, GRASSY); },
  heath: P => { base(P, 0.18); dots(P, 6, '#8e6a8f'); tufts(P, 2, '#6f7444'); },
  moor: P => { base(P, 0.2); tufts(P, 3, '#6e6a40'); if (P.v % 2) P.pebble(...P.spot(3), '#bdb39d', 3); },
  scrub: P => { base(P, 0.18); specks(P, 4, 3); if (P.v !== 1) P.blob(...P.spot(4), 2, 1, '#8f9a5a'); },
  dirt: P => { base(P, 0.22); specks(P, 6, 3); specks(P, 3, 1); },
  mud: P => { base(P, 0.2); specks(P, 4, 4); if (P.v % 2 === 0) P.blob(...P.spot(5), 4, 1, '#7d918c', false); },
  sand: P => { base(P, 0.2); specks(P, 5, 3); specks(P, 3, 0); },
  dunes: P => { base(P, 0.1); P.each((x, y, u, v) => { const [a, b] = P.ab(u, v), c = 5 + P.v + 2 * Math.sin(b * 0.45 + P.v); for (const k of [c, c + 8]) { if (Math.floor(a) === Math.floor(k)) P.tone(x, y, 0); else if (Math.floor(a) === Math.floor(k) + 1) P.tone(x, y, 3); } }); },
  shingle: P => { base(P, 0.18, true); for (let k = 0; k < 9; k++) P.pebble(...P.spot(2), ['#bdb39d', '#a49a86', '#d9d0bb'][k % 3], 2 + (k % 2)); },
  rock: P => { base(P, 0.14); P.each((x, y, u, v) => { const c = 4 + P.v * 2 + Math.round(2 * Math.sin(u * 0.6)); if (Math.floor(v) === c && u > 2 && u < 14) P.set(x, y, ink(P.R[3], 0.45)); else if (Math.floor(v) === c - 1 && u > 2 && u < 14) P.tone(x, y, 1); }); },
  scree: P => { base(P, 0.2); for (let k = 0; k < 6; k++) P.pebble(...P.spot(2), k % 2 ? '#c3baa5' : '#9b917d', 2 + (k % 2)); },
  snow: P => { base(P, 0.08); const D = rampOf('#c9d3dc'); P.each((x, y, u, v) => { const c = 6 + P.v * 2 + Math.round(1.6 * Math.sin(u * 0.5 + P.v)); if (Math.floor(v) === c && u > 1 && u < 15) P.set(x, y, D[2]); }); specks(P, 2, 0); },
  tundra: P => { base(P, 0.18); for (let k = 0; k < 2; k++) P.blob(...P.spot(4), 2, 1, '#eef0ec', false); specks(P, 4, 4); },
  ice: P => { base(P, 0.06); P.each((x, y, u, v) => { if (Math.abs(u - v - 2 + P.v) < 0.7 && u > 4 && u < 12) P.set(x, y, '#ffffff'); else if (Math.floor(u + v * 0.4) === 14 && v > 5 && v < 13) P.set(x, y, ink(P.R[3], 0.3)); }); },
  ash: P => { base(P, 0.28); specks(P, 6, 4); if (P.v === 1) { const [x, y] = P.spot(3); P.set(x, y, '#d0592d'); P.set(x + 1, y, '#f4c25a'); } },
  lava: P => {
    const seeds = Array.from({ length: 5 }, (_, k) => [hash(k, P.v, 1) * 16, hash(k, P.v, 2) * 16]), Y = rampOf('#f4c25a');
    P.each((x, y, u, v) => {
      const d = Math.min(...seeds.map(([a, b]) => Math.hypot(u - a, v - b))), glow = (Math.floor(u + v) + P.f * 2) % 8;
      if (d < 2.4) P.set(x, y, d < 1.6 ? '#5a4a42' : '#7a5a46'); else if (d < 3.1) P.tone(x, y, 3); else P.set(x, y, glow < 2 ? Y[glow ? 1 : 0] : P.R[glow < 4 ? 1 : 2]);
    });
  },
  shallows: P => { water(P, '#e7eee4', '#7f9c96', 5); if (P.v % 2) P.pebble(...P.spot(4), '#c8bea0', 2); },
  water: P => water(P, '#dfeae6', '#6f8e89', 6),
  deep: P => water(P, '#a9c2bd', '#56756f', 4),
  marsh: P => { base(P, 0.18); for (let k = 0; k < 2; k++) P.blob(...P.spot(5), 3, 1, '#8eb0ab', false); tufts(P, 3, '#5b7034', 3); },
  swamp: P => { base(P, 0.2); P.blob(16, 8, 7, 3, '#6c8278', false); for (let k = 0; k < 3; k++) { const [x, y] = P.spot(5); P.set(x, y, '#9ab06a'); P.set(x + 1, y, '#9ab06a'); P.set(x, y + 1, ink('#9ab06a', 0.4)); } tufts(P, 2, '#4f6430', 4); },
  field: P => { base(P, 0.1, true); furrows(P, 3, 0.36); },
  wheat: P => { base(P, 0.1); furrows(P, 4, 0.3, false); P.each((x, y, u, v) => { const [a] = P.ab(u, v); if (Math.floor(a) % 4 === 2 && hash(x, y, 4) < 0.45) { P.set(x, y - 1, '#c9a24f'); P.set(x, y - 2, '#e8d18a'); } }); },
  crops: P => P.each((x, y, u, v) => { if (!y || !inDiamond(x, y - 1)) P.tone(x, y, 1); else P.tone(x, y, 2); const [a, b] = P.ab(u, v); if (Math.floor(a) % 4 === 2 && Math.floor(b) % 3 === 1) { P.set(x, y, '#56702f'); P.set(x, y - 1, GREEN); P.set(x - 1, y - 1, '#86a050'); } }),
  vineyard: P => { base(P, 0.12); P.each((x, y, u, v) => { const [a, b] = P.ab(u, v); if (Math.floor(a) % 5 === 2 && b > 1 && b < 15) { P.set(x, y - 1, '#5c773f'); P.set(x, y - 2, '#71904c'); P.set(x, y, ink('#5c773f', 0.4)); if (Math.floor(b) % 4 === 1) P.set(x, y - 1, '#6a3d5c'); } }); },
  garden: P => { base(P, 0.16); for (const c of ['#b8483a', '#f4ecd8', '#d9b44a']) dots(P, 2, c); tufts(P, 2, GRASSY); },
  road: P => { base(P, 0.16); P.each((x, y, u, v) => { const [a] = P.ab(u, v), m = Math.floor(a); if (m === 4 || m === 11) P.set(x, y, ink(P.R[3], 0.25)); else if (m === 5 || m === 12) P.tone(x, y, 1); }); specks(P, 2, 4); },
  cobble: P => stones(P, 4, true, 0.4),
  flagstone: P => stones(P, 2, true, 0.34),
  plaza: P => { stones(P, 2, false, 0.24); if (P.v % 2) P.each((x, y, u, v) => { const m = Math.abs(u - 8) + Math.abs(v - 8); if (m < 3) P.set(x, y, m < 1.6 ? '#b8584a' : '#c98a72'); }); },
  planks: P => boards(P, 3, 0.5),
  floorboards: P => boards(P, 4, 0.38),
  oakfloor: P => boards(P, 3, 0.45),
  stonefloor: P => stones(P, 2, false, 0.36),
  checker: P => { base(P, 0, true); const dark = mixHex(P.R[2], '#463a2c', 0.42); P.each((x, y, u, v) => { if ((Math.floor(u / 8) + Math.floor(v / 8)) % 2 === 0) P.set(x, y, inDiamond(x, y - 1) ? dark : mixHex(dark, P.R[1], 0.3)); }); },
  carpet: P => { base(P, 0.06, false); carpet(P, '#e8ce8c', '#5a281e'); },
  carpetblue: P => { base(P, 0.06, false); carpet(P, '#e8ce8c', '#283446'); },
  rushes: P => { base(P, 0.14); for (let k = 0; k < 7; k++) { const [x, y] = P.spot(3), d = k % 2 ? 1 : -1; P.set(x, y, '#9c8650'); P.set(x + d, y, '#b8a266'); P.set(x + 2 * d, y + (k % 3 ? 0 : 1), '#9c8650'); } }
};
/* grounds whose marks run along one tile edge: the renderer swaps their axis when the view turns a quarter */
const DIRECTIONAL = new Set(['dunes', 'field', 'wheat', 'crops', 'vineyard', 'road', 'planks', 'floorboards', 'oakfloor']);
const ANIMATED = new Set(['shallows', 'water', 'deep', 'lava']);

/* one ground's top: TW × (TH + PAD) with the diamond's top point at (16, PAD) */
function topTile(id, variant = 0, frame = 0) {
  const T = TERRAIN_BY_ID[id] || TERRAIN[0], im = image(TW, TH + PAD), P = pen(im, T, variant & 3, ANIMATED.has(T.id) ? frame % FRAMES : 0);
  (TOPS[T.id] || (Q => base(Q)))(P);
  return im;
}

/* ---------- the faces ----------
   A face drops h pixels below one of the diamond's lower edges: side 0 the left (+y, lit) one, side 1 the right
   (+x, shaded) one. Its image is 16 × (h + 8), placed at (side * 16, PAD + 8) from the top's corner. zTop is the
   height of the tile's top, so strata line up along a whole cliff. Grounds that grow (grass, crops) hang a lip of
   their top colour over the edge; stone and paving show coursed blocks; floors of wood show beams. */
const STYLE = {};
for (const T of TERRAIN) {
  STYLE[T.id] = T.water ? 'water' : T.glow ? 'lava' : ['snow', 'ice'].includes(T.id) ? 'snow'
    : ['cobble', 'flagstone', 'plaza', 'stonefloor', 'checker', 'rock', 'scree', 'shingle', 'tundra'].includes(T.id) ? 'stone'
    : ['planks', 'floorboards', 'oakfloor', 'carpet', 'carpetblue'].includes(T.id) ? 'wood'
    : ['sand', 'dunes', 'scrub'].includes(T.id) ? 'sand' : 'soil';
}
const LIPPED = new Set(['grass', 'meadow', 'tallgrass', 'pasture', 'heath', 'moor', 'garden', 'crops', 'vineyard', 'wheat', 'marsh', 'swamp', 'tundra', 'snow']);
function sideFace(id, side, h, zTop = 0) {
  const T = TERRAIN_BY_ID[id] || TERRAIN[0], style = STYLE[T.id], R = rampOf(T.side[side]), Top = rampOf(T.top);
  const im = image(16, h + 8), lit = side === 0, earthy = style === 'soil' || style === 'sand', z0 = ((Math.round(zTop) % STEP) + STEP) % STEP;
  for (let i = 0; i < 16; i++) {
    const x = side * 16 + i, b = bottomOf(x), lip = LIPPED.has(T.id) ? 1 + Math.floor(hash(x, 7) * (T.id === 'snow' ? 4 : 3)) : 0, outer = lit ? i === 0 : i === 15, seam = lit ? i === 15 : i === 0;
    for (let d = 0; d < h; d++) {
      const y = b + 1 + d - 8, zz = z0 - d, deep = d >= h - 1;
      let c;
      if (d === 0) c = style === 'water' ? R[0] : ink(Top[3], 0.4);
      else if (d <= lip && d < h - 1) c = Top[d === lip ? 3 : 2];
      else if (style === 'water') c = R[d < 3 ? 1 : d > h * 0.6 ? 3 : 2];
      else if (style === 'lava') c = (hash(x, d, 3) < 0.05) ? '#f4c25a' : R[3];
      else {
        const course = Math.floor((d - z0) / STEP), strata = ((zz % STEP) + STEP) % STEP === 0;
        let s = d > h * 0.7 ? 3 : 2;
        if (style === 'stone' || style === 'wood') {
          const joint = style === 'stone' ? (x + course * 5 + 64) % 8 === 0 : false, brick = ((zz % 4) + 4) % 4 === 0 && style === 'wood';
          if (strata || joint || brick) c = ink(R[3], 0.38); else c = R[((zz % STEP) + STEP) % STEP === STEP - 1 ? 1 : s];
        } else if (style === 'soil' || style === 'sand') {
          /* earth: broken, wandering strata and clods rather than courses, so a bank does not read as a crate */
          const wob = Math.floor(hash(x >> 2, course, 9) * 3) - 1, line = (((zz + wob) % STEP) + STEP) % STEP === 0 && hash(x >> 1, course, 4) < 0.7;
          const n = hash(x, zz, 5);
          if (line) c = ink(R[3], 0.26); else { if (n < 0.08) s = 3; else if (n < 0.13) s = 1; else if (n < 0.15) s = 4; if (style === 'sand' && ((zz + (x >> 2)) % 5 === 0)) s = 1; c = R[s]; }
        } else if (strata) c = ink(R[3], 0.3);
        else { const n = hash(x, zz, 5); if (n < 0.07) s = 3; else if (n < 0.11) s = 1; if (style === 'sand' && ((zz + (x >> 2)) % 5 === 0)) s = 1; c = R[s]; }
      }
      if (deep && d > 0) c = ink(R[4], 0.3);
      else if (outer && d > 0) c = earthy ? (lit ? R[2] : R[3]) : lit ? R[1] : ink(R[4], 0.25);
      else if (seam && d > lip) c = earthy ? (lit ? c : R[3]) : lit ? R[1] : R[3];
      put(im, i, y, c);
    }
  }
  return im;
}

/* ---------- overlays ---------- */
/* a flat diamond (the tile top) in one colour, alpha a, with a brighter rim: the move range, a route, the cursor */
function marker(fill, rim, a = 0.45, ra = 0.95) {
  const im = image(TW, TH + PAD);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (!inDiamond(x, y)) continue;
    const edge = !inDiamond(x - 1, y) || !inDiamond(x + 1, y) || !inDiamond(x, y - 1) || !inDiamond(x, y + 1);
    put(im, x, y + PAD, edge ? rim : fill, edge ? ra : a);
  }
  return im;
}
/* the cursor's corner brackets, in two frames (out and in), like a tactics game's tile cursor */
function cursor(frame = 0, col = '#fff4d0') {
  const im = image(TW, TH + PAD), k = frame % 2 ? 1 : 0;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (!inDiamond(x, y)) continue;
    const edge = !inDiamond(x - 1, y) || !inDiamond(x + 1, y) || !inDiamond(x, y - 1) || !inDiamond(x, y + 1);
    const [u, v] = tileUV(x, y), corner = (u < 5 + k * 2 || u > 11 - k * 2) && (v < 5 + k * 2 || v > 11 - k * 2) || Math.abs(u - v) > 10 - k * 2;
    if (edge && corner) { put(im, x, y + PAD, col); put(im, x, y + PAD + 1, OUTLINE, 0.55); }
  }
  return im;
}
/* the pointer over the cursor tile or a unit: a pixel arrow pointing down, 9 × 8 */
function arrow(col = '#e4c684') {
  const rows = ['#########', '#ooooooo#', '.#ooooo#.', '..#ooo#..', '...#o#...', '....#....'], im = image(9, 7), D = rampOf(col);
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') put(im, i, j, OUTLINE); else if (ch === 'o') put(im, i, j, D[j < 2 ? 0 : j < 3 ? 1 : 2]); }));
  for (let i = 1; i < 8; i++) put(im, i, 6, OUTLINE, 0.25);
  return im;
}
/* foam where water meets land, one edge at a time (0 the top's x = 0 edge, 1 the y = 0 edge, 2 y = 16, 3 x = 16) */
function foam(edge, frame = 0) {
  const im = image(TW, TH + PAD);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (!inDiamond(x, y)) continue;
    const [u, v] = tileUV(x, y), d = [u, v, 16 - v, 16 - u][edge];
    if (d < 1.2 || (d < 2.4 && (hash(x, y, frame + edge * 4) < 0.35))) put(im, x, y + PAD, '#f2f4ec', d < 1.2 ? 0.9 : 0.6);
  }
  return im;
}
/* ---------- depth on the ground (see scene.js light) ---------- */
/* a cast shadow over the ninths of the top whose bits are set in mask (bit k: the third k % 3 along x, the third
   k / 3 along y), or pixel by pixel from bits (one character per diamond pixel, row by row), in a cool
   translucent dark */
const SHADOW = '#1c2132', SHADOW_A = 0.24;
function shadowTop(mask, bits = null) {
  const im = image(TW, TH + PAD); let n = 0;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (!inDiamond(x, y)) continue;
    const [u, v] = tileUV(x, y), k = Math.min(2, Math.floor(u / 16 * 3)) + 3 * Math.min(2, Math.floor(v / 16 * 3));
    if (bits ? bits[n] === '1' : mask & (1 << k)) put(im, x, y + PAD, SHADOW, SHADOW_A);
    n++;
  }
  return im;
}
/* occlusion along the back edge where a higher cliff stands: edge 0 the x = 0 side, 1 the y = 0 side; level 1..3 */
function occlusion(edge, level) {
  const im = image(TW, TH + PAD), width = 2 + level * 1.6, top = 0.2 + level * 0.07;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (!inDiamond(x, y)) continue;
    const [u, v] = tileUV(x, y), d = edge ? v : u; if (d >= width) continue;
    put(im, x, y + PAD, '#1a1410', top * (d < width / 3 ? 1 : d < (2 * width) / 3 ? 0.62 : 0.3));
  }
  return im;
}
/* elevation: 0 the lowest ground on the map, 4 the highest; low ground darker, high ground lighter */
function elevationTint(level) {
  const im = image(TW, TH + PAD), [col, a] = [['#1a1410', 0.13], ['#1a1410', 0.06], [null, 0], ['#fff4d8', 0.05], ['#fff4d8', 0.1]][level];
  if (col) for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (inDiamond(x, y)) put(im, x, y + PAD, col, a);
  return im;
}

/* a unit's shadow on the ground: a dithered oval under its feet, w × h */
function unitShadow(w = 22, h = 7) {
  const im = image(w, h), cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const d = ((i - cx) / (cx + 0.5)) ** 2 + ((j - cy) / (cy + 0.4)) ** 2; if (d <= 1 && (d < 0.55 || (i + j) % 2 === 0)) put(im, i, j, '#2b1e10', d < 0.55 ? 0.36 : 0.22); }
  return im;
}

export { ANIMATED, DIRECTIONAL, FRAMES, PAD, SHADOW, SHADOW_A, STEP, STYLE, TH, TW, VARIANTS, arrow, atUV, bottomOf, cursor, elevationTint, filled, foam, image, inDiamond, marker, occlusion, put, shadowTop, sideFace, tileUV, topTile, unitShadow };
