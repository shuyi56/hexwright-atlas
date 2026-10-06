import { INK, hexRgb } from '../render/palette.js';
import { TERRAIN_BY_ID } from '../tiles/index.js';
import { SIZE } from './sprite.js';

/* ================= character sprites: drawing in the tile set's style =================
   A sprite is drawn the way the tile pieces are: smooth shapes, an ink outline round the figure and
   between areas of colour, lit from the left and in shade on the right like the kit's cylinders, and
   the same faint paper grain. The 16×16 pixels are first rounded off by three Scale2x passes (8×),
   which keeps the drawing the user made but takes the stair-steps out of its curves and diagonals. */
const UP = 8, PAD = 6, N = SIZE * UP + PAD * 2;
const INK_RGB = hexRgb(INK);

/* Scale2x on palette indices: doubles the frame, rounding corners where two sides agree */
function scale2x(src, n) {
  const out = new Uint8Array(n * n * 4), m = n * 2, at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : src[y * n + x]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const P = src[y * n + x], A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A;
    if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C;
    if (B === D && B !== A && D !== C) e3 = D;
    const o = 2 * y * m + 2 * x; out[o] = e0; out[o + 1] = e1; out[o + m] = e2; out[o + m + 1] = e3;
  }
  return out;
}
const dark = rgb => rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11 < 60;
const noise = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };

/* the inked picture of one frame as an N×N canvas; its feet sit on row PAD + SIZE * UP */
function inkFrame(pal, fr) {
  let big = fr, n = SIZE; for (let k = 1; k < UP; k *= 2) { big = scale2x(big, n); n *= 2; }
  const idx = new Uint8Array(N * N); for (let y = 0; y < n; y++) idx.set(big.subarray(y * n, y * n + n), (y + PAD) * N + PAD);
  const rgb = pal.map(hexRgb), c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), im = g.createImageData(N, N), d = im.data;
  /* the extent of the figure on each row, for the left-lit, right-shaded rounding */
  const lo = new Int32Array(N).fill(N), hi = new Int32Array(N).fill(-1);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (idx[y * N + x]) { if (x < lo[y]) lo[y] = x; hi[y] = x; }
  const R = 4.6, RI = Math.ceil(R), LINE = 2.6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = y * N + x, v = idx[u], o = u * 4;
    if (!v) {
      /* ink outline: distance to the nearest filled pixel, softened over its last pixel */
      let best = 99;
      for (let j = -RI; j <= RI; j++) { const yy = y + j; if (yy < 0 || yy >= N) continue; for (let i = -RI; i <= RI; i++) { const xx = x + i; if (xx < 0 || xx >= N || !idx[yy * N + xx]) continue; const dd = Math.hypot(i, j); if (dd < best) best = dd; } }
      if (best <= R) { d[o] = INK_RGB[0]; d[o + 1] = INK_RGB[1]; d[o + 2] = INK_RGB[2]; d[o + 3] = 255 * Math.min(1, R + 0.5 - best); }
      continue;
    }
    const col = rgb[v - 1] || INK_RGB;
    const span = Math.max(1, hi[y] - lo[y]), t = (x - lo[y]) / span, k = t < 0.45 ? 1.07 - 0.07 * (t / 0.45) : 1 - 0.3 * ((t - 0.45) / 0.55);
    /* ink line where two areas of colour meet (not round eyes and other dark details, which are ink already) */
    let line = 0;
    if (!dark(col)) for (let j = -2; j <= 2 && !line; j++) for (let i = -2; i <= 2; i++) { const w = idx[(y + j) * N + (x + i)]; if (w && w !== v && !dark(rgb[w - 1] || INK_RGB) && Math.hypot(i, j) <= LINE / 2 + 0.3 && (i > 0 || (i === 0 && j > 0))) { line = 1; break; } }
    const gr = 1 - noise(x, y) * 0.06;
    for (let ch = 0; ch < 3; ch++) d[o + ch] = line ? INK_RGB[ch] * 0.9 + col[ch] * 0.1 : Math.min(255, col[ch] * k * gr);
    d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}

/* the flat pixels of one frame as a SIZE×SIZE canvas, for the pixel grid */
function renderFrame(s, face, k) {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d'), im = g.createImageData(SIZE, SIZE), fr = s.frames[face][k];
  for (let u = 0; u < fr.length; u++) { const v = fr[u]; if (!v || !s.pal[v - 1]) continue; const [r, gg, b] = hexRgb(s.pal[v - 1]); im.data.set([r, gg, b, 255], u * 4); }
  g.putImageData(im, 0, 0); return c;
}
/* inked frames are cached by their content, so the sprite editor's unsaved edits and the library share it */
const cache = new Map();
function frameCanvas(s, face, k) {
  const fr = s.frames[face][k], key = s.pal.join() + '|' + String.fromCharCode(...fr);
  let c = cache.get(key); if (!c) { if (cache.size > 300) cache.clear(); c = inkFrame(s.pal, fr); cache.set(key, c); }
  return c;
}
/* draw an inked frame with the figure's feet at (x, y); px is the size of one sprite pixel in drawing units */
function drawFrame(g, can, x, y, px) {
  const k = px / UP; g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(can, x - N / 2 * k, y - (PAD + SIZE * UP) * k, N * k, N * k); g.restore();
}
/* soft ground shadow under a figure, leaning the way the pieces' shadows lean */
function footShadow(g, x, y, px) {
  g.save(); g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x + px * 1.2, y - px * 0.3, px * 4.6, px * 2.1, 0, 0, Math.PI * 2); g.fill(); g.restore();
}
/* a grass tile block like the ones in the tile palette, its top centre at (x, y), half-width w */
function tileBlock(g, x, y, w) {
  const T = TERRAIN_BY_ID.grass, h = w / 2, dz = w * 0.3, line = Math.max(0.6, w / 22);
  const poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = line; g.stroke(); };
  poly([[x + w, y], [x, y + h], [x, y + h + dz], [x + w, y + dz]], T.side[1]);
  poly([[x - w, y], [x, y + h], [x, y + h + dz], [x - w, y + dz]], T.side[0]);
  poly([[x, y - h], [x + w, y], [x, y + h], [x - w, y]], T.top);
}
/* a character standing on a grass block, for palettes and previews */
function standOn(g, s, face, k, x, y, w) {
  tileBlock(g, x, y, w); const px = w / 9; footShadow(g, x, y + w * 0.06, px); drawFrame(g, frameCanvas(s, face, k), x, y + w * 0.08, px);
}
function spriteThumb(s, size = 60, face = 'se', k = 0) {
  const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = size * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); standOn(g, s, face, k, size / 2, size * 0.66, size * 0.4); return c;
}

export { N as INK_SIZE, PAD as INK_PAD, UP as INK_UP, drawFrame, footShadow, frameCanvas, renderFrame, spriteThumb, standOn };
