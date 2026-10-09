import { C, canvas } from '../characters/sheet.js';
import { GLYPH_H, textWidth } from '../characters/font.js';
import { BASE } from '../characters/body.js';
import { H, W } from '../characters/pixels.js';
import { byId, renderScaled } from '../characters/roster.js';
import { TERRAIN } from '../tiles/terrain.js';
import { TI, blankModel } from '../editor/model.js';
import { ASSET_BY_ID } from '../tiles/index.js';
import { DESIGNS as BUILT } from './buildings.js';
import { DESIGNS as GROWN } from './foliage.js';
import { pieceImage } from './pieces.js';
import { FIGURE_SCALE, P, buildScene, withFigures } from './scene.js';
import { ANIMATED, FRAMES, PAD, VARIANTS, arrow, cursor, foam, marker, sideFace, topTile, unitShadow } from './tiles.js';

/* ================= tactical view: the tile sheet =================
   Two images from the same pixels the tactical camera draws, both pure RGBA so Node writes them
   (tools/tactical-sheet.mjs) and a test can check them:
   - buildSheet: the showcase. Every ground as a plinth of four tiles (its four variants) standing three levels
     tall, grouped as the editor's palette groups them; water and lava in their four frames; the markers (move
     range, route, target, cursor, pointer, foam, a unit's shadow); a small field with figures standing on it
     to show the proportions; and every building, tree and plant with a tactical design, on grass. In the character sheet's dark windows and brass rims.
   - buildAtlas: a packed sheet for a game. One row per ground, 32 × 22 cells: the four variants, then frames 1-3
     of variant 0 for the animated grounds, then a left and a right face 16 pixels (two levels) deep. Returns the
     cell rectangles as well, by ground and kind. */

const cache = new Map();
function sprite(s, frame = 0) {
  const key = s.k === 'top' ? `t${s.id}${s.v}${s.anim ? frame : ''}` : s.k === 'face' ? `f${s.id}${s.side}${s.h}${s.z % 8}` : `o${s.e}${frame}`;
  let im = cache.get(key);
  if (!im) { im = s.k === 'top' ? topTile(s.id, s.v, frame) : s.k === 'face' ? sideFace(s.id, s.side, s.h, s.z) : foam(s.e, frame); cache.set(key, im); }
  return im;
}
/* paste an image's opaque and translucent pixels at (x, y), k× */
function paste(cv, im, x, y, k = 1, flip = false) {
  for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) {
    const u = (j * im.w + (flip ? im.w - 1 - i : i)) * 4, a = im.px[u + 3]; if (!a) continue;
    const rgb = [im.px[u], im.px[u + 1], im.px[u + 2]];
    for (let b = 0; b < k; b++) for (let c = 0; c < k; c++) cv.set(x + i * k + c, y + j * k + b, rgb, a / 255);
  }
}
const frameImage = rgba => ({ w: W, h: H, px: rgba });
/* draw a scene's items (and any figures) with view tile (0, 0)'s top point at (ox, oy) */
function drawScene(cv, sc, ox, oy, k, frame = 0, figs = []) {
  for (const it of withFigures(sc.items, figs)) {
    if (it.draws) for (const d of it.draws) paste(cv, sprite(d.s, frame), ox + d.x * k, oy + d.y * k, k);
    else if (it.fig) {
      const [px, py] = P(it.X, it.Y, it.z);
      paste(cv, unitShadow(17, 5), ox + (px - 8) * k, oy + (py - 2) * k, k);
      paste(cv, frameImage(it.fig), ox + (px - W / 2) * k, oy + (py - BASE - 1) * k, k, it.flip);
    }
  }
}
/* a small model: rows of terrain ids and heights */
function mini(rows, elev) {
  const S = rows.length, M = blankModel(S);
  rows.forEach((r, y) => r.forEach((id, x) => { M.terr[y * S + x] = TI[id]; M.elev[y * S + x] = elev ? elev[y][x] : 0; }));
  return M;
}
const GROUPS = [...new Set(TERRAIN.map(t => t.group))];

function buildSheet(k = 3) {
  const margin = 28, cols = 7, cellW = Math.round(96 * k / 1.5) + 40, cellH = Math.round(130 * k / 1.5) + 30, head = 120;
  const groups = GROUPS.map(g => TERRAIN.filter(t => t.group === g));
  const rowsOf = n => Math.ceil(n / cols), groupH = n => 40 + rowsOf(n) * (cellH + 10);
  const animY = head + groups.reduce((s, g) => s + groupH(g.length) + 16, 0), markY = animY + 40 + cellH + 26, fieldY = markY + 40 + cellH + 26;
  const fieldH = Math.round(260 * k / 1.5) + 60, w = margin * 2 + cols * (cellW + 10) - 10;
  /* the designed pieces, each on a patch of grass its footprint's size, flowed into rows */
  const piecesY = fieldY + 40 + fieldH + 30, flows = PIECE_GROUPS.map(([name, ids]) => ({ name, ...flow(ids, w - 2 * margin + 20, k) }));
  const h = piecesY + flows.reduce((n, f) => n + 46 + f.height + 20, 0) + margin;
  const cv = canvas(w, h); cv.rect(0, 0, w, h, C.page);
  cv.text('TACTICAL TILE SHEET', margin, margin, 5, C.text);
  cv.text(`${TERRAIN.length} GROUNDS · ${VARIANTS} VARIANTS · 32×16 TILES · 8 PX A LEVEL · FIGURES AT 1:1`, margin, margin + GLYPH_H * 5 + 14, 2, C.dim);
  const cell = (x, y, name) => { cv.win(x, y, cellW, cellH); const n = name.toUpperCase(); cv.text(n, x + (cellW - textWidth(n) * 2) / 2, y + cellH - 22, 2, C.text); };
  /* a plinth of four tiles of one ground, one per variant, three levels tall */
  const plinth = (id, x, y) => {
    const sc = buildScene(mini([[id, id], [id, id]]));
    sc.items.forEach(it => { const d = it.draws[0]; if (d.s.k === 'top') d.s.v = it.u; });
    drawScene(cv, sc, x + cellW / 2, y + 20 + PAD * k, k);
  };
  let y = head;
  groups.forEach((list, g) => {
    cv.text(GROUPS[g].toUpperCase(), margin, y, 3, C.rim);
    list.forEach((T, n) => { const x = margin + (n % cols) * (cellW + 10), cy = y + 36 + Math.floor(n / cols) * (cellH + 10); cell(x, cy, T.label); plinth(T.id, x, cy); });
    y += groupH(list.length) + 16;
  });
  /* animation: each animated ground's four frames, one tile each */
  cv.text('ANIMATION', margin, animY, 3, C.rim);
  const anim = TERRAIN.filter(t => ANIMATED.has(t.id));
  anim.forEach((T, n) => {
    const cw = Math.floor((w - 2 * margin + 10) / anim.length) - 10, x = margin + n * (cw + 10);
    cv.win(x, animY + 36, cw, cellH); const name = T.label.toUpperCase(); cv.text(name, x + (cw - textWidth(name) * 2) / 2, animY + 36 + cellH - 22, 2, C.text);
    const sc = buildScene(mini([[T.id]]));
    for (let f = 0; f < FRAMES; f++) { drawScene(cv, sc, Math.round(x + cw * (f + 0.5) / FRAMES), animY + 36 + 40 + PAD * k, k, f); cv.text(String(f + 1), Math.round(x + cw * (f + 0.5) / FRAMES) - 3, animY + 36 + 12, 2, C.dim); }
  });
  /* markers, each on a grass tile (foam on water) */
  cv.text('MARKERS', margin, markY, 3, C.rim);
  const grass = buildScene(mini([['grass']])), pond = buildScene(mini([['water']]));
  const marks = [
    ['MOVE', marker('#5d8fd0', '#cfe2ff')], ['ROUTE', marker('#e4c684', '#fff4d0', 0.55)], ['TARGET', marker('#c4553f', '#ffd2c4')],
    ['CURSOR', cursor(0)], ['CURSOR', cursor(1)], ['POINTER', null], ['FOAM', 'foam'], ['SHADOW', unitShadow()]
  ];
  const mw = Math.floor((w - 2 * margin + 10) / marks.length) - 10;
  marks.forEach(([name, im], n) => {
    const x = margin + n * (mw + 10), cx = x + Math.round(mw / 2), ty = markY + 36 + 44 + PAD * k;
    cv.win(x, markY + 36, mw, cellH); cv.text(name, x + (mw - textWidth(name) * 2) / 2, markY + 36 + cellH - 22, 2, C.text);
    if (im === 'foam') { drawScene(cv, pond, cx, ty, k); for (let e = 0; e < 4; e++) paste(cv, foam(e, 0), cx - 16 * k, ty - PAD * k, k); return; }
    drawScene(cv, grass, cx, ty, k);
    if (!im) paste(cv, arrow(), cx - Math.round(4.5 * k), ty - 12 * k, k);
    else if (name === 'SHADOW') paste(cv, im, cx - 11 * k, ty + 4 * k, k);
    else paste(cv, im, cx - 16 * k, ty - PAD * k, k);
  });
  /* a field: a raised bank with a road, a stream with shallows, a ploughed strip, and figures on it */
  cv.text('IN THE FIELD', margin, fieldY, 3, C.rim);
  cv.win(margin - 10, fieldY + 36, w - 2 * margin + 20, fieldH);
  const F = mini([
    ['rock', 'scree', 'moor', 'grass', 'grass', 'meadow', 'tallgrass'],
    ['scree', 'grass', 'road', 'road', 'road', 'grass', 'meadow'],
    ['grass', 'grass', 'road', 'cobble', 'cobble', 'grass', 'grass'],
    ['shallows', 'shallows', 'water', 'cobble', 'cobble', 'shallows', 'shallows'],
    ['water', 'water', 'deep', 'water', 'water', 'water', 'water'],
    ['sand', 'shallows', 'water', 'shallows', 'sand', 'sand', 'field'],
    ['grass', 'sand', 'sand', 'sand', 'grass', 'field', 'field']
  ], [
    [4, 3, 3, 2, 2, 2, 2], [3, 2, 2, 2, 2, 2, 2], [2, 2, 2, 2, 2, 1, 1], [0, 0, 0, 2, 2, 0, 0], [0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1]
  ]);
  const sc = buildScene(F), figs = [['knight', 3, 2, 'front', false], ['archer', 1, 1, 'front', true], ['blackmage', 5, 6, 'back', false], ['villager', 4, 2, 'front', true]].map(([id, x, yy, view, flip]) => {
    const u = yy * F.S + x; return { key: x + yy + 1, lv: 0, pri: 2, X: x + 0.5, Y: yy + 0.5, z: sc.zOf(u), fig: renderScaled(byId(id), FIGURE_SCALE)[view][0], flip };
  });
  drawScene(cv, sc, Math.round(w / 2), fieldY + 36 + Math.round(70 * k / 1.5) + 30, k, 1, figs);
  let py = piecesY;
  for (const f of flows) {
    cv.text(f.name, margin, py, 3, C.rim); py += 46;
    for (const it of f.items) {
      const x = margin - 10 + it.x, y = py + it.y;
      cv.win(x, y, it.cw, it.ch); const lbl = it.label.toUpperCase(); cv.text(lbl, x + Math.round((it.cw - textWidth(lbl) * 2) / 2), y + it.ch - 22, 2, C.text);
      const n = Math.max(it.w, it.d), ox = x + Math.round(it.cw / 2), oy = y + it.ch - 40 - n * 16 * k - 24 * k - PAD * k;
      drawScene(cv, buildScene(mini(Array.from({ length: n }, () => Array(n).fill('grass')))), ox, oy + PAD * k, k);
      paste(cv, it.im, ox - it.im.ox * k, oy + PAD * k - it.im.oy * k, k);
    }
    py += f.height + 20;
  }
  return { width: w, height: h, rgba: cv.px };
}
/* the pieces with tactical designs, as the editor's palette groups them */
const PIECE_GROUPS = [['BUILDINGS', Object.keys(BUILT)], ['TREES AND PLANTS', Object.keys(GROWN)]];
function flow(ids, width, k) {
  const items = []; let x = 0, y = 0, rowH = 0;
  for (const id of ids) {
    const a = ASSET_BY_ID[id], im = pieceImage({ id, x: 0, y: 0, face: 0, v: 0.37 }, 'temperate'), n = Math.max(a.w, a.d);
    let x0 = im.w, x1 = 0, y0 = im.h; for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) if (im.px[(j * im.w + i) * 4 + 3]) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); }
    const cw = Math.max((x1 - x0 + 1) * k, n * 2 * 32 * k / 2 + 16 * k, textWidth(a.label.toUpperCase()) * 2 + 16) + 24, ch = (im.oy - y0) * k + n * 16 * k + 24 * k + 60;
    if (x + cw > width) { x = 0; y += rowH + 10; rowH = 0; }
    items.push({ id, label: a.label, im, w: a.w, d: a.d, x, y, cw, ch }); x += cw + 10; rowH = Math.max(rowH, ch);
  }
  /* bottom-align each row */
  const rows = new Map(); for (const it of items) rows.set(it.y, Math.max(rows.get(it.y) || 0, it.ch));
  for (const it of items) { const H = rows.get(it.y); it.y += H - it.ch; }
  return { items, height: y + rowH };
}

function buildAtlas() {
  const cw = 32, ch = 16 + PAD, cols = VARIANTS + FRAMES - 1 + 1, w = cols * cw, h = TERRAIN.length * Math.max(ch, 24);
  const rowH = Math.max(ch, 24), cv = canvas(w, h), rects = {};
  TERRAIN.forEach((T, r) => {
    const y = r * rowH, at = rects[T.id] = { variants: [], frames: [], faces: [] };
    for (let v = 0; v < VARIANTS; v++) { paste(cv, topTile(T.id, v, 0), v * cw, y); at.variants.push([v * cw, y, cw, ch]); }
    if (ANIMATED.has(T.id)) for (let f = 1; f < FRAMES; f++) { const x = (VARIANTS + f - 1) * cw; paste(cv, topTile(T.id, 0, f), x, y); at.frames.push([x, y, cw, ch]); }
    const fx = (VARIANTS + FRAMES - 1) * cw;
    for (const side of [0, 1]) { paste(cv, sideFace(T.id, side, 16, 0), fx + side * 16, y); at.faces.push([fx + side * 16, y, 16, 24]); }
  });
  return { width: w, height: h, rgba: cv.px, rects, cell: [cw, ch], pad: PAD };
}

export { buildAtlas, buildSheet, drawScene, paste };
