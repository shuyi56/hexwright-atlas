import { INK, hexRgb } from '../render/palette.js';
import { TERRAIN_BY_ID } from '../tiles/index.js';
import { SIZE } from './sprite.js';

/* ================= character sprites: pixel art =================
   Characters are crisp pixel art made to sit in the tile set's palette. The tiles are pale, chalky
   colours on paper, so every sprite colour is washed a little toward the paper tone and faintly grained
   like the map image. The one-pixel outline is the tiles' ink softened by the colour it borders, and the
   light from the left comes in gentle pixel steps (a highlight band on the lit side, a shade band on the
   far side). On the map a character is treated exactly like the tiles: its frame is rendered once at the
   map image's own resolution and that image is scaled with the map, so its colours, line weight and
   softness are the same at every zoom (see drawSprite). */
const PAD = 1, UP = 1, N = SIZE + PAD * 2;
const INK_RGB = hexRgb(INK), PAPER = [240, 230, 203];
const lum = rgb => rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11, dark = rgb => lum(rgb) < 60;
const noise = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
/* toward the paper: 14% of the paper tone and a tenth of the saturation gone */
const wash = c => { const l = lum(c); return c.map((ch, i) => (ch * 0.9 + l * 0.1) * 0.86 + PAPER[i] * 0.14); };
const out = (c, k, gr = 1) => c.map(ch => Math.max(0, Math.min(255, Math.round(ch * k * gr))));

/* Each pixel of the finished frame as a label: 0 clear, 1 + 4 * (index - 1) + band for a filled pixel (band 0
   plain, 1 lit, 2 shaded, 3 dark detail drawn as is), and OUTLINE + index for an outline pixel bordering that
   colour. */
const OUTLINE = 1 << 12;
function labels(fr) {
  const L = new Int32Array(N * N), at = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : fr[y * SIZE + x]);
  const lo = new Int32Array(SIZE).fill(SIZE), hi = new Int32Array(SIZE).fill(-1);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (fr[y * SIZE + x]) { if (x < lo[y]) lo[y] = x; hi[y] = x; }
  for (let y = -PAD; y < SIZE + PAD; y++) for (let x = -PAD; x < SIZE + PAD; x++) {
    const v = at(x, y), u = (y + PAD) * N + x + PAD;
    if (!v) { const n = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1); if (n) L[u] = OUTLINE + n; continue; }
    /* a lit run of pixels on the left of each part, shade on the right; the top edge of a part catches light too */
    const t = (x - lo[y]) / Math.max(1, hi[y] - lo[y]);
    const edgeL = !at(x - 1, y) || at(x - 1, y) !== v, edgeR = !at(x + 1, y) || at(x + 1, y) !== v, top = !at(x, y - 1);
    L[u] = 1 + 4 * (v - 1) + (t > 0.72 || (edgeR && t > 0.5) ? 2 : (edgeL && t < 0.5) || top ? 1 : 0);
  }
  return L;
}
/* paint labels to a canvas of side n */
function paintLabels(pal, L, n) {
  const rgb = pal.map(h => wash(hexRgb(h))), c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), im = g.createImageData(n, n), d = im.data;
  for (let u = 0; u < L.length; u++) {
    const l = L[u]; if (!l) continue;
    const x = u % n, y = (u / n) | 0, gr = 1 + (noise(x + 7, y + 3) - 0.5) * 0.06; let col;
    if (l >= OUTLINE) { const nc = rgb[l - OUTLINE - 1] || INK_RGB; col = INK_RGB.map((ch, i) => ch * 0.62 + nc[i] * 0.45 * 0.38); }
    else { const base = rgb[(l - 1) >> 2] || INK_RGB, band = (l - 1) & 3; col = dark(base) ? base : out(base, band === 2 ? 0.89 : band === 1 ? 1.06 : 1, gr); }
    d.set([col[0], col[1], col[2], 255], u * 4);
  }
  g.putImageData(im, 0, 0); return c;
}
/* the finished pixel-art frame, one canvas pixel per sprite pixel */
function pixelFrame(pal, fr) { return paintLabels(pal, labels(fr), N); }

/* the flat pixels of one frame as a SIZE×SIZE canvas, for the pixel grid */
function renderFrame(s, face, k) {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d'), im = g.createImageData(SIZE, SIZE), fr = s.frames[face][k];
  for (let u = 0; u < fr.length; u++) { const v = fr[u]; if (!v || !s.pal[v - 1]) continue; const [r, gg, b] = hexRgb(s.pal[v - 1]); im.data.set([r, gg, b, 255], u * 4); }
  g.putImageData(im, 0, 0); return c;
}
/* finished frames are cached by their content, so the sprite editor's unsaved edits and the library share it */
const cache = new Map();
function frameCanvas(s, face, k) {
  const fr = s.frames[face][k], key = s.pal.join() + '|' + String.fromCharCode(...fr);
  let c = cache.get(key); if (!c) { if (cache.size > 300) cache.clear(); c = pixelFrame(s.pal, fr); cache.set(key, c); }
  return c;
}
/* The frame as the map image would hold it: res canvas pixels per sprite pixel (the map's SC times the sprite
   pixel size; below one, so the pixel art is filtered down the way the tiles' fine lines are). */
const LOOK_RES = 0.84, looks = new Map();
function lookCanvas(s, face, k, res = LOOK_RES) {
  const base = frameCanvas(s, face, k), key = res + '|' + s.pal.join() + '|' + String.fromCharCode(...s.frames[face][k]);
  let c = looks.get(key);
  if (!c) {
    if (looks.size > 300) looks.clear();
    c = document.createElement('canvas'); c.width = c.height = Math.max(1, Math.round(N * res));
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(base, 0, 0, c.width, c.height);
    looks.set(key, c);
  }
  return c;
}
/* Draw a frame with the figure's feet at (x, y); px is the size of one sprite pixel in drawing units and res
   the map image's pixels per sprite pixel. Always the same image, always smoothed, exactly as the map canvas
   is drawn to the screen: zoomed out or in, the character keeps the tiles' colours, line weight and softness. */
function drawSprite(g, s, face, k, x, y, px, res = LOOK_RES) {
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(lookCanvas(s, face, k, res), x - N / 2 * px, y - (PAD + SIZE) * px, N * px, N * px); g.restore();
}
/* soft ground shadow under a figure, leaning the way the pieces' shadows lean */
function footShadow(g, x, y, px) {
  const rx = SIZE * px * 0.19; g.save(); g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x + rx * 0.3, y - rx * 0.08, rx, rx * 0.46, 0, 0, Math.PI * 2); g.fill(); g.restore();
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
  tileBlock(g, x, y, w); const px = w * 1.55 / SIZE; footShadow(g, x, y + w * 0.06, px); drawSprite(g, s, face, k, x, y + w * 0.08, px);
}
function spriteThumb(s, size = 60, face = 'se', k = 0) {
  const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = size * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); standOn(g, s, face, k, size / 2, size * 0.66, size * 0.4); return c;
}

export { N as INK_SIZE, PAD as INK_PAD, UP as INK_UP, drawSprite, footShadow, frameCanvas, renderFrame, spriteThumb, standOn };
