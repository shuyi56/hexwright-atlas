import { INK, hexRgb } from '../render/palette.js';
import { TERRAIN_BY_ID } from '../tiles/index.js';
import { SIZE } from './sprite.js';

/* ================= character sprites: pixel art =================
   Characters are drawn as crisp pixel art in the tile set's colours: a one-pixel outline in the tiles'
   ink round the figure, and light from the left in hard pixel steps (a highlight band on the lit side,
   a shadow band on the far side) the way the kit lights its pieces. Nothing is smoothed: the pixels
   stay square at every zoom where they are big enough to see. */
const PAD = 1, UP = 1, N = SIZE + PAD * 2;
const INK_RGB = hexRgb(INK);
const lum = rgb => rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11, dark = rgb => lum(rgb) < 60;

/* the shaded, outlined frame as an N×N canvas (one pixel of margin for the outline); feet on row PAD + SIZE */
function pixelFrame(pal, fr) {
  const rgb = pal.map(hexRgb), c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), im = g.createImageData(N, N), d = im.data, at = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : fr[y * SIZE + x]);
  /* each row's extent, so the light bands follow the figure's own width (arms, head, legs alike) */
  const lo = new Int32Array(SIZE).fill(SIZE), hi = new Int32Array(SIZE).fill(-1);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (fr[y * SIZE + x]) { if (x < lo[y]) lo[y] = x; hi[y] = x; }
  const put = (x, y, col, a = 255) => { const o = ((y + PAD) * N + x + PAD) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a; };
  for (let y = -PAD; y < SIZE + PAD; y++) for (let x = -PAD; x < SIZE + PAD; x++) {
    const v = at(x, y);
    if (!v) { if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) put(x, y, INK_RGB); continue; }
    const col = rgb[v - 1] || INK_RGB; if (dark(col)) { put(x, y, col); continue; }
    /* a lit run of pixels on the left of each part, shade on the right; the top edge of a part catches light too */
    const span = hi[y] - lo[y] + 1, t = (x - lo[y]) / Math.max(1, span - 1);
    const edgeL = !at(x - 1, y) || at(x - 1, y) !== v, edgeR = !at(x + 1, y) || at(x + 1, y) !== v, top = !at(x, y - 1);
    let k = 1;
    if (t > 0.72 || (edgeR && t > 0.5)) k = 0.8; else if ((edgeL && t < 0.5) || top) k = 1.12;
    put(x, y, col.map(ch => Math.min(255, Math.round(ch * k))));
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
/* finished frames are cached by their content, so the sprite editor's unsaved edits and the library share it */
const cache = new Map();
function frameCanvas(s, face, k) {
  const fr = s.frames[face][k], key = s.pal.join() + '|' + String.fromCharCode(...fr);
  let c = cache.get(key); if (!c) { if (cache.size > 300) cache.clear(); c = pixelFrame(s.pal, fr); cache.set(key, c); }
  return c;
}
/* draw a frame with the figure's feet at (x, y); px is the size of one sprite pixel in drawing units.
   Pixels stay hard-edged while each covers at least about one and a half screen pixels; any smaller and
   nearest-neighbour sampling would drop detail, so the frame is filtered down instead. */
function drawFrame(g, can, x, y, px) {
  const m = g.getTransform(), screen = Math.hypot(m.a, m.b) * px;
  g.save(); g.imageSmoothingEnabled = screen < 1.5; g.imageSmoothingQuality = 'high';
  g.drawImage(can, x - N / 2 * px, y - (PAD + SIZE) * px, N * px, N * px); g.restore();
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
  tileBlock(g, x, y, w); const px = w * 1.55 / SIZE; footShadow(g, x, y + w * 0.06, px); drawFrame(g, frameCanvas(s, face, k), x, y + w * 0.08, px);
}
function spriteThumb(s, size = 60, face = 'se', k = 0) {
  const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = size * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); standOn(g, s, face, k, size / 2, size * 0.66, size * 0.4); return c;
}

export { N as INK_SIZE, PAD as INK_PAD, UP as INK_UP, drawFrame, footShadow, frameCanvas, renderFrame, spriteThumb, standOn };
