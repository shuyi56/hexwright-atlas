import { INK } from '../render/palette.js';
import { TERRAIN_BY_ID } from '../tiles/terrain.js';
import { BASE } from './body.js';
import { FH, FW, H, W } from './pixels.js';
import { render } from './roster.js';

/* ================= character sprites: drawing them on the map =================
   The finished frames (roster.js render) are 64×96 pixel art on a 32×48 layout; sizes here are in the layout's
   pixels. On the map the four facings are the two drawn views, the south-east and north-west ones mirrored, and
   a walk plays the poses in WALK order. Every zoom draws from one master per frame: the frame blown up to 8× the
   layout with each pixel a crisp square, then shrunk in halving steps. Each zoom uses the smallest step that still has at least as many pixels as the screen will show, drawn
   smoothed, so a figure keeps its pixel art up close and never shimmers or aliases zoomed out. This module needs
   a canvas; the rest of characters/ does not. */
const FACES = ['sw', 'se', 'ne', 'nw'], FACING = { sw: ['front', false], se: ['front', true], ne: ['back', false], nw: ['back', true] };
const MASTER = 8;

/* every finished frame of a character, rendered once for each look (a custom character keeps its id as it is
   changed in the maker, so the cache goes by its look) */
const frames = new Map(), lookOf = c => c.look || c.id;
function framesOf(c) { let f = frames.get(lookOf(c)); if (!f) { if (frames.size > 64) frames.clear(); f = render(c); frames.set(lookOf(c), f); } return f; }
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/* the master and its halvings for one view and pose */
const mips = new Map();
function mipFor(c, view, pose) {
  const key = `${lookOf(c)}|${view}|${pose}`; let levels = mips.get(key);
  if (levels) return levels;
  if (mips.size > 160) mips.clear();
  const rgba = framesOf(c)[view][pose], one = canvasOf(FW, FH), og = one.getContext('2d'), im = og.createImageData(FW, FH);
  im.data.set(rgba); og.putImageData(im, 0, 0);
  const master = canvasOf(W * MASTER, H * MASTER), mg = master.getContext('2d');
  mg.imageSmoothingEnabled = false; mg.drawImage(one, 0, 0, master.width, master.height);
  levels = [{ up: MASTER, can: master }];
  for (let up = MASTER / 2; up >= 0.25; up /= 2) {
    const prev = levels[levels.length - 1].can, next = canvasOf(Math.max(1, Math.round(W * up)), Math.max(1, Math.round(H * up))), g = next.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(prev, 0, 0, next.width, next.height);
    levels.push({ up, can: next });
  }
  mips.set(key, levels);
  return levels;
}
/* Draw a character facing face ('sw' ... 'nw') in pose (0 standing, 1 and 2 the strides) with the soles of its
   feet at (x, y); px is one sprite pixel in drawing units. */
function drawFigure(g, c, face, pose, x, y, px) {
  const [view, flip] = FACING[face] || FACING.sw, levels = mipFor(c, view, pose), m = g.getTransform(), screen = Math.hypot(m.a, m.b) * px;
  let lv = levels[0]; for (const l of levels) if (l.up >= screen) lv = l;
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.translate(x, y); if (flip) g.scale(-1, 1);
  g.drawImage(lv.can, -W / 2 * px, -(BASE + 1) * px, W * px, H * px);
  g.restore();
}
/* the box a figure's frame fills around its feet at (x, y), in drawing units: [left, top, right, bottom] */
const figureBox = (x, y, px) => [x - W / 2 * px, y - (BASE + 1) * px, x + W / 2 * px, y + (H - BASE - 1) * px];
/* the height of a standing figure from its soles to the top of its head, in sprite pixels (a standard build in
   hair or a hat), for hit boxes and shadows */
const FIGURE = 40;
/* ground shadow under a figure: a long soft shadow cast to the right (the way the pieces' shadows fall), a pool
   under the feet, and a dark contact patch where the soles meet the ground */
function footShadow(g, x, y, px) {
  const h = FIGURE * px, ell = (cx, cy, rx, ry, a) => { g.fillStyle = `rgba(43,30,16,${a})`; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  g.save();
  ell(x + h * 0.22, y - h * 0.02, h * 0.3, h * 0.07, 0.13);
  ell(x + h * 0.05, y, h * 0.2, h * 0.085, 0.18);
  ell(x + h * 0.01, y - h * 0.005, h * 0.12, h * 0.045, 0.3);
  g.restore();
}
/* a grass tile block like the ones in the tile palette, its top centre at (x, y), half-width w */
function tileBlock(g, x, y, w) {
  const T = TERRAIN_BY_ID.grass, h = w / 2, dz = w * 0.3, line = Math.max(0.6, w / 22);
  const poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = line; g.stroke(); };
  poly([[x + w, y], [x, y + h], [x, y + h + dz], [x + w, y + dz]], T.side[1]);
  poly([[x - w, y], [x, y + h], [x, y + h + dz], [x - w, y + dz]], T.side[0]);
  poly([[x, y - h], [x + w, y], [x, y + h], [x - w, y]], T.top);
}
/* a character standing on a grass block, as the Characters tab shows it */
function figureThumb(c, size = 60, face = 'sw', pose = 0) {
  const can = canvasOf(1, 1), dpr = Math.min(2, window.devicePixelRatio || 1); can.width = can.height = Math.round(size * dpr);
  const g = can.getContext('2d'), x = size / 2, y = size * 0.7, w = size * 0.4, px = w * 1.4 / FIGURE;
  g.scale(dpr, dpr); tileBlock(g, x, y, w); footShadow(g, x, y + w * 0.06, px); drawFigure(g, c, face, pose, x, y + w * 0.08, px);
  return can;
}

export { FACES, FIGURE, drawFigure, figureBox, figureThumb, footShadow, lookOf, tileBlock };
