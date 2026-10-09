import { BASE } from '../characters/body.js';
import { lookOf } from '../characters/draw.js';
import { H, W, hexRgb } from '../characters/pixels.js';
import { render, renderScaled } from '../characters/roster.js';
import { INK } from '../render/palette.js';
import { ASSET_BY_ID, drawAsset, footprint } from '../tiles/index.js';
import { pieceImage, pieceKey } from './pieces.js';
import { FIGURE_H, FIGURE_SCALE, P, figBox, figureOrder, withFigures } from './scene.js';
import { FRAMES, PAD, SHADOW, SHADOW_A, arrow, cursor, elevationTint, foam, marker, occlusion, shadowTop, sideFace, topTile, unitShadow } from './tiles.js';

/* ================= tactical view: drawing =================
   Draws a scene (tactical/scene.js) for the tactical camera: every sprite at whole art pixels, scaled by a whole
   number of device pixels with no smoothing, so the pixel art stays crisp at any zoom. Tiles come from the tile
   sheet (tactical/tiles.js), made into canvases once each. Figures are the roster's 32×48 frames shrunk to three quarters (scene.js FIGURE_SCALE), drawn 1:1.
   Buildings, trees and plants are drawn from their tactical designs (tactical/pieces.js). The other pieces
   (props, furniture) are the tile set's own drawings (tiles/assets.js), drawn once at one unit to the pixel,
   stood up by the scene's lift, and finished as pixel art: hard edges, their colours gathered into a small
   palette, an inked rim where their edge is light, and a dithered shadow on the ground they stand on. */
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
function toCanvas(im) { const c = canvasOf(im.w, im.h), g = c.getContext('2d'), d = g.createImageData(im.w, im.h); d.data.set(im.px); g.putImageData(d, 0, 0); return c; }
const sprites = new Map();
function sprite(s, frame) {
  const key = s.k === 'top' ? `t|${s.id}|${s.v}|${s.anim ? frame : 0}` : s.k === 'face' ? `f|${s.id}|${s.side}|${s.h}|${((s.z % 8) + 8) % 8}` : `o|${s.e}|${frame}`;
  let c = sprites.get(key);
  if (!c) { c = toCanvas(s.k === 'top' ? topTile(s.id, s.v, frame) : s.k === 'face' ? sideFace(s.id, s.side, s.h, s.z) : foam(s.e, frame)); sprites.set(key, c); }
  return c;
}
const MARKS = {
  move: () => marker('#5d8fd0', '#cfe2ff', 0.42), route: () => marker('#e4c684', '#fff4d0', 0.55), target: () => marker('#ff3b2b', '#ffc2b8', 0.55),
  cursor0: () => cursor(0), cursor1: () => cursor(1), arrow: () => arrow(), shadow: () => unitShadow(17, 5)
};
const marks = new Map();
/* the ground's depth overlays, made once each */
const depthSprites = new Map();
function depthSprite(kind, a, b) { const key = kind + a + '|' + b; let c = depthSprites.get(key); if (!c) { c = toCanvas(kind === 's' ? shadowTop(a, b || null) : kind === 'o' ? occlusion(a, b) : elevationTint(a)); depthSprites.set(key, c); } return c; }
const mark = name => { let c = marks.get(name); if (!c) { c = toCanvas(MARKS[name]()); marks.set(name, c); } return c; };

/* ---------- pieces as pixel art ---------- */
/* the canvas context with every line at least one pixel wide, so the tile set's hairlines survive at 1:1 */
const thick = g => new Proxy(g, {
  get: (t, k) => (typeof t[k] === 'function' ? t[k].bind(t) : t[k]),
  set: (t, k, v) => { t[k] = k === 'lineWidth' ? Math.max(1, v) : v; return true; }
});
const ink = hexRgb(INK);
function pixelize(c) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), p = d.data, n = c.width * c.height;
  /* hard edges, then the colours gathered into the 40 most used (by 5-bit bins), each pixel to the nearest */
  const bins = new Map();
  for (let i = 0; i < n; i++) {
    const u = i * 4; if (p[u + 3] < 110) { p[u + 3] = 0; continue; } p[u + 3] = 255;
    const key = (p[u] >> 3) << 10 | (p[u + 1] >> 3) << 5 | (p[u + 2] >> 3), b = bins.get(key);
    if (b) { b[0] += p[u]; b[1] += p[u + 1]; b[2] += p[u + 2]; b[3]++; } else bins.set(key, [p[u], p[u + 1], p[u + 2], 1]);
  }
  const pal = [...bins.values()].sort((a, b) => b[3] - a[3]).slice(0, 40).map(b => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]), near = new Map();
  for (let i = 0; i < n; i++) {
    const u = i * 4; if (!p[u + 3]) continue;
    const key = (p[u] >> 3) << 10 | (p[u + 1] >> 3) << 5 | (p[u + 2] >> 3); let q = near.get(key);
    if (!q) { let best = 1e9; for (const c2 of pal) { const e = (c2[0] - p[u]) ** 2 + (c2[1] - p[u + 1]) ** 2 + (c2[2] - p[u + 2]) ** 2; if (e < best) { best = e; q = c2; } } near.set(key, q); }
    p[u] = q[0]; p[u + 1] = q[1]; p[u + 2] = q[2];
  }
  /* an inked rim outside any edge pixel that is not already dark */
  const W2 = c.width, solid = i => p[i * 4 + 3] === 255, rim = [];
  for (let i = 0; i < n; i++) {
    if (solid(i)) continue; const x = i % W2, y = (i / W2) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x + 1 < W2 ? i + 1 : -1, y > 0 ? i - W2 : -1, y + 1 < c.height ? i + W2 : -1]) {
      if (j < 0 || !solid(j)) continue; const u = j * 4; if (p[u] * 0.3 + p[u + 1] * 0.59 + p[u + 2] * 0.11 > 72) { rim.push(i); break; }
    }
  }
  for (const i of rim) { const u = i * 4; p[u] = ink[0]; p[u + 1] = ink[1]; p[u + 2] = ink[2]; p[u + 3] = 255; }
  return d;
}
const pieces = new Map();
/* a piece drawn as pixel art: { can, x, y } with (x, y) the offset of its footprint's top point in the canvas */
function pieceSprite(o, lift, clim, designed = false) {
  if (designed) return designedSprite(o, clim);
  const key = `${o.id}|${o.face}|${Math.round((o.v ?? 0.5) * 40)}|${o.links ? o.links.join('') : ''}|${clim}|${lift.toFixed(2)}`;
  let s = pieces.get(key); if (s) return s;
  if (pieces.size > 600) pieces.clear();
  const a = ASSET_BY_ID[o.id], [w, d] = footprint(o), ox = d * 16 + 40, oy = Math.ceil(a.h * lift) + 60;
  const can = canvasOf((w + d) * 16 + 80, oy + (w + d) * 8 + 24), g = can.getContext('2d');
  const Pp = (x, y, z) => [ox + (x - y) * 16, oy + (x + y) * 8 - z * lift];
  drawAsset(thick(g), Pp, Object.assign({}, o, { x: 0, y: 0 }), 0, clim);
  const img = pixelize(can), p = img.data;
  /* contact shadow: dithered over the footprint wherever the piece leaves the ground showing */
  for (let y = 0; y < (w + d) * 8; y++) for (let x = -d * 16; x < w * 16; x++) {
    const fx = (x / 16 + y / 8) / 2, fy = (y / 8 - x / 16) / 2; if (fx < 0.08 || fy < 0.08 || fx > w - 0.08 || fy > d - 0.08 || (x + y) % 2) continue;
    const u = ((oy + y) * can.width + ox + x) * 4; if (p[u + 3]) continue; p[u] = 43; p[u + 1] = 30; p[u + 2] = 16; p[u + 3] = 70;
  }
  g.putImageData(img, 0, 0);
  s = { can, x: ox, y: oy }; pieces.set(key, s);
  return s;
}

/* a piece with its own tactical design (buildings, trees and plants: tactical/pieces.js) */
function designedSprite(o, clim) {
  const key = 'd|' + pieceKey(o, clim); let s = pieces.get(key); if (s) return s;
  if (pieces.size > 600) pieces.clear();
  const im = pieceImage(o, clim); s = { can: toCanvas(im), x: im.ox, y: im.oy }; pieces.set(key, s);
  return s;
}

/* A piece with a shadow across its front: its sprite darkened, column by column, from the ground up to the height
   the shadow stands at (scene.js light), in the ground shadow's own colour. A pixel's height is how far it stands
   above the footprint's front edge in its column. */
const shaded = new Map();
function inShadow(s, it) {
  const [w, d] = footprint(it.o), key = s.can.width + '|' + s.x + '|' + s.y + '|' + it.o.id + '|' + it.o.face + '|' + it.o.v + '|' + Array.from(it.shadow).join(',');
  let c = shaded.get(key); if (c) return c;
  if (shaded.size > 400) shaded.clear();
  c = canvasOf(s.can.width, s.can.height); const g2 = c.getContext('2d'); g2.drawImage(s.can, 0, 0);
  const im = g2.getImageData(0, 0, c.width, c.height), p = im.data, [sr, sg, sb] = hexRgb(SHADOW), n = it.shadow.length - 1;
  for (let x = 0; x < c.width; x++) {
    const col = x - s.x, i = Math.max(0, Math.min(n, col + d * 16)), h = it.shadow[i]; if (h < 2) continue;
    /* the front edge under this column: down the left edge to the bottom corner, then up the right one */
    const cc = Math.max(-d * 16, Math.min(w * 16, col)), base = s.y + (cc <= (w - d) * 16 ? d * 8 + (cc + d * 16) / 2 : (w + d) * 8 - (cc - (w - d) * 16) / 2);
    for (let y = Math.max(0, Math.floor(base - h)); y < Math.min(c.height, Math.ceil(base) + 2); y++) {
      const u = (y * c.width + x) * 4; if (p[u + 3] < 200) continue;
      p[u] += (sr - p[u]) * SHADOW_A; p[u + 1] += (sg - p[u + 1]) * SHADOW_A; p[u + 2] += (sb - p[u + 2]) * SHADOW_A;
    }
  }
  g2.putImageData(im, 0, 0); shaded.set(key, c);
  return c;
}

/* ---------- figures ---------- */
const FACING = { sw: ['front', false], se: ['front', true], ne: ['back', false], nw: ['back', true] };
const figFrames = new Map();
function figureCanvas(c, face, pose) {
  const [view, flip] = FACING[face] || FACING.sw, key = `${lookOf(c)}|${view}|${pose}`; let can = figFrames.get(key);
  if (!can) { if (figFrames.size > 400) figFrames.clear(); const f = renderScaled(c, FIGURE_SCALE); can = toCanvas({ w: W, h: H, px: f[view][pose] }); figFrames.set(key, can); }
  return [can, flip];
}

/* Draw one frame. g is set up so one art pixel is k device pixels and (tx, ty) device pixels is art (0, 0);
   view is the art-space rectangle on screen. opts: frame (animation tick), figs (figure items, each { key, lv,
   pri: 2, X, Y, z, ground, c, face, pose, ghost }), marks (Map of 'u,L' -> mark name for tile tops), cursor
   { u, L, z }, tick for its bob, and focus: art points { x, y, key } (the unit in play, the cursor) that pieces in
   front of them fade from. */
function drawScene(g, sc, k, tx, ty, view, opts = {}) {
  const frame = (opts.frame || 0) % FRAMES, [vx0, vy0, vx1, vy1] = view, S = sc.S;
  g.setTransform(k, 0, 0, k, tx, ty); g.imageSmoothingEnabled = false;
  const items = withFigures(sc.items, opts.figs || []), mk = opts.marks, { hiders } = figureOrder(items), faded = new Set();
  const seen = b => !(b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1);
  /* one item onto ctx (the screen, or a figure's layer); decor adds the ground's overlays and markers */
  const drawItem = (ctx, it, decor) => {
    if (it.draws) {
      for (const d of it.draws) ctx.drawImage(sprite(d.s, frame), d.x, d.y);
      if (!decor) return;
      if (it.light && opts.depth !== false) {
        const top = it.draws[0], l = it.light;
        if (l.elev !== 2) ctx.drawImage(depthSprite('e', l.elev, 0), top.x, top.y);
        l.occ.forEach((lv, e) => lv && ctx.drawImage(depthSprite('o', e, lv), top.x, top.y));
        if (l.mask) ctx.drawImage(depthSprite('s', l.mask, l.px ? l.px() : 0), top.x, top.y);
      }
      const m = mk && mk.get(it.u + ',' + it.lv);
      if (m) { const [px, py] = P(it.u % S, (it.u / S) | 0, it.z); ctx.drawImage(mark(m), px - 16, py - PAD); }
      if (opts.cursor && opts.cursor.u === it.u && opts.cursor.L === it.lv) { const [px, py] = P(it.u % S, (it.u / S) | 0, it.z); ctx.drawImage(mark(opts.tick % 2 ? 'cursor1' : 'cursor0'), px - 16, py - PAD); }
    } else if (it.kind === 'piece') {
      const b = it.box, s = pieceSprite(it.o, it.lift, sc.model.clim, it.designed), [px, py] = P(it.o.x, it.o.y, it.o.z), a0 = ctx.globalAlpha;
      /* a piece standing in front of the unit or tile in play fades, so they are never lost behind it */
      if (decor && opts.focus && opts.focus.some(f => it.key > f.key && f.x > b[0] && f.x < b[2] && f.y > b[1] && f.y < b[3] && hides(s, px, py, f))) faded.add(it);
      if (faded.has(it)) ctx.globalAlpha = a0 * 0.42;
      const can = it.shadow ? inShadow(s, it) : s.can;
      ctx.drawImage(can, Math.round(px - s.x), Math.round(py - s.y));
      ctx.globalAlpha = a0;
    }
  };
  /* the ground, the floors and the pieces, back to front */
  items.forEach(it => { if (!it.c && seen(it.box)) drawItem(g, it, true); });
  /* Then the figures, back to front, each with what stands in front of it cut out: a figure is never painted over
     a piece it stands behind, nor a piece over a figure in front of it, and a nearer figure always covers a farther
     one, silhouette and all. */
  items.forEach((f, i) => {
    if (!f.c || !seen(figBox(f))) return;
    const [px, py] = P(f.X, f.Y, f.z).map(Math.round), gy = Math.round(P(f.X, f.Y, f.ground)[1]), x0 = px - W / 2, y0 = py - BASE - 1, hid = hiders.get(i);
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, W, LH);
    lg.setTransform(1, 0, 0, 1, -x0, -y0);
    lg.drawImage(mark('shadow'), px - 8, gy - 2);
    drawFigure(lg, f);
    if (hid) { lg.globalCompositeOperation = 'destination-out'; for (const j of hid) drawItem(lg, items[j], false); }
    if (f.ghost) g.globalAlpha = 0.55;
    g.drawImage(layer, x0, y0); g.globalAlpha = 1;
    /* the part that is hidden, drawn through what hides it in the figure's outline */
    if (!hid || opts.xray === false) return;
    xg.setTransform(1, 0, 0, 1, 0, 0); xg.globalCompositeOperation = 'source-over'; xg.clearRect(0, 0, W, H);
    xg.setTransform(1, 0, 0, 1, -x0, -y0);
    for (const j of hid) drawItem(xg, items[j], false);
    xg.globalCompositeOperation = 'source-in'; xg.setTransform(1, 0, 0, 1, 0, 0);
    const [can, flip] = figureCanvas(f.c, f.face, f.pose), sil = silhouette(can);
    if (flip) { xg.save(); xg.translate(W, 0); xg.scale(-1, 1); xg.drawImage(sil, 0, 0); xg.restore(); } else xg.drawImage(sil, 0, 0);
    g.globalAlpha = 0.7; g.drawImage(xray, x0, y0); g.globalAlpha = 1;
  });
  /* the pointer bobs over the cursor, or over the unit standing there */
  if (opts.cursor) {
    const c = opts.cursor, [px, py] = P(c.u % S, (c.u / S) | 0, c.z), lift = c.unit ? FIGURE_H + 12 : 14;
    g.drawImage(mark('arrow'), px - 4, py - lift - (opts.tick % 2 ? 2 : 0) - 7);
  }
}
/* a figure's frame (no shadow) onto ctx, flipped for the faces that look the other way */
function drawFigure(ctx, it) {
  const [px, py] = P(it.X, it.Y, it.z).map(Math.round), [can, flip] = figureCanvas(it.c, it.face, it.pose);
  if (flip) { ctx.save(); ctx.translate(px, 0); ctx.scale(-1, 1); ctx.drawImage(can, -W / 2, py - BASE - 1); ctx.restore(); } else ctx.drawImage(can, px - W / 2, py - BASE - 1);
}
/* how many art pixels a figure stands above its feet, from the top of its sprite (a slime is short, a knight with a
   plume tall), for what goes over its head */
const tops = new WeakMap();
function figureHeight(it) {
  const [can] = figureCanvas(it.c, it.face, it.pose); let top = tops.get(can);
  if (top == null) { const d = can.getContext('2d').getImageData(0, 0, W, H).data; top = 0; while (top < H && !d.slice(top * W * 4, (top + 1) * W * 4).some((v, i) => i % 4 === 3 && v)) top++; tops.set(can, top); }
  return BASE + 1 - top;
}
/* the silhouette a hidden figure shows through what stands in front of it: a pale fill inside a dark rim */
const xray = canvasOf(W, H), xg = xray.getContext('2d'), sils = new WeakMap();
/* a figure and its shadow, before what stands in front of it is cut out (taller than the frame: the shadow stays on
   the ground while the figure hops) */
const LH = H + 24, layer = canvasOf(W, LH), lg = layer.getContext('2d');
function silhouette(can) {
  let s = sils.get(can); if (s) return s;
  const src = can.getContext('2d').getImageData(0, 0, W, H).data; s = canvasOf(W, H);
  const sg = s.getContext('2d'), d = sg.createImageData(W, H), on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    const rim = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
    d.data.set(rim ? [40, 62, 98, 255] : [196, 216, 244, 150], (y * W + x) * 4);
  }
  sg.putImageData(d, 0, 0); sils.set(can, s);
  return s;
}
/* does the piece's sprite cover the art point (x, y) or the pixels just above it (a figure's body)? */
function hides(s, px, py, f) {
  const x = Math.round(f.x - (px - s.x)), y0 = Math.round(f.y - (py - s.y)), d = solidity(s);
  for (let y = y0 - 30; y <= y0; y += 3) if (x >= 0 && y >= 0 && x < s.can.width && y < s.can.height && d[(y * s.can.width + x) * 4 + 3]) return true;
  return false;
}
const solidity = s => s.alpha || (s.alpha = s.can.getContext('2d').getImageData(0, 0, s.can.width, s.can.height).data);
/* is the art point inside the drawn figure (its opaque pixels)? for clicking on units */
function figureHit(it, wx, wy) {
  const [px, py] = P(it.X, it.Y, it.z).map(Math.round), [can, flip] = figureCanvas(it.c, it.face, it.pose);
  let i = Math.floor(wx - (px - W / 2)); const j = Math.floor(wy - (py - BASE - 1)); if (i < 0 || j < 0 || i >= W || j >= H) return false;
  if (flip) i = W - 1 - i;
  return can.getContext('2d').getImageData(i, j, 1, 1).data[3] > 0;
}
/* a unit's face for the status window: the head of its south-west frame, at full size */
function portrait(c, size = 24) {
  const can = toCanvas({ w: W, h: H, px: render(c).front[0] }), out = canvasOf(size, size);
  out.getContext('2d').drawImage(can, (W - size) / 2, 4, size, size, 0, 0, size, size); return out;
}

export { drawScene, figureHeight, figureHit, pieceSprite, portrait };
