import { ADVANCE, GLYPH_H, glyph, textWidth } from './font.js';
import { FH, FW, H, OUTLINE, W, hexRgb, mixHex } from './pixels.js';
import { BASE, BODY_TYPES } from './body.js';
import { BODIES, ROSTER, WALK, render } from './roster.js';
import { TOWNSFOLK } from './townsfolk.js';
import { TERRAIN_BY_ID } from '../tiles/terrain.js';

/* ================= character sprites: the sprite sheet =================
   Every character in one image laid out like a tactics game's unit menu, in the tile editor's own colours (its dark
   table, brass rims and vellum labels): a window per character with its name, then the four facings (south-west,
   south-east, north-east, north-west), each standing and in both strides. Every figure stands on the editor's
   grass tile, drawn as a pixel tile in the tile set's colours, so the sheet shows the figures against the ground
   they will walk on. South-east and north-west are the drawn views mirrored, as the games do. Below, everyone
   in every build, so anyone can be read on any body. A second image (buildWalk) is the roster walking, as the
   frames of an animation. Pure RGBA, so Node can write it (tools/character-sheet.mjs) and a test can check it. */
const FACINGS = [['SW', 'front', false], ['SE', 'front', true], ['NE', 'back', false], ['NW', 'back', true]];
const C = { page: '#121819', win: ['#1d2829', '#141c1d'], rim: '#c9a45a', rimD: '#0b1011', text: '#ece2c8', dim: '#a39b86', shadow: '#4a341a' };
/* the ground tile reaches this many sprite rows below the frame */
const TILE_DROP = 12;

function canvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, rgb, a = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return; const u = (y * w + x) * 4;
    for (let i = 0; i < 3; i++) px[u + i] = Math.round(px[u + i] * (1 - a) + rgb[i] * a); px[u + 3] = 255;
  };
  const rect = (x, y, rw, rh, hex, a = 1) => { const rgb = hexRgb(hex); for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, rgb, a); };
  const text = (s, x, y, k, hex) => { const rgb = hexRgb(hex); [...s].forEach((ch, n) => { for (const [gx, gy] of glyph(ch)) for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) set(x + (n * ADVANCE + gx) * k + i, y + gy * k + j, rgb); }); };
  /* a sprite frame (FW×FH) filling W×H layout pixels at k×, with its pixels' alpha respected, optionally mirrored */
  const blit = (rgba, x, y, k, flip) => {
    const ow = W * k, oh = H * k;
    for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) {
      const si = Math.floor(i * FW / ow), sj = Math.floor(j * FH / oh), u = (sj * FW + (flip ? FW - 1 - si : si)) * 4; if (!rgba[u + 3]) continue;
      set(x + i, y + j, [rgba[u], rgba[u + 1], rgba[u + 2]]);
    }
  };
  /* a window: a vertical gradient, a brass rim inside a dark one, corners cut */
  const win = (x, y, ww, wh) => {
    const [t, b] = C.win.map(hexRgb);
    for (let j = 0; j < wh; j++) { const f = j / Math.max(1, wh - 1), rgb = t.map((v, i) => v + (b[i] - v) * f); for (let i = 0; i < ww; i++) set(x + i, y + j, rgb); }
    rect(x, y, ww, 2, C.rimD); rect(x, y + wh - 2, ww, 2, C.rimD); rect(x, y, 2, wh, C.rimD); rect(x + ww - 2, y, 2, wh, C.rimD);
    rect(x + 2, y + 2, ww - 4, 2, C.rim); rect(x + 2, y + wh - 4, ww - 4, 2, C.rim); rect(x + 2, y + 2, 2, wh - 4, C.rim); rect(x + ww - 4, y + 2, 2, wh - 4, C.rim);
    for (const [cx, cy] of [[x, y], [x + ww - 2, y], [x, y + wh - 2], [x + ww - 2, y + wh - 2]]) rect(cx, cy, 2, 2, C.page);
  };
  return { w, h, px, rect, text, blit, win, set };
}

/* The editor's grass tile as pixel art, in the frame's sprite pixels: a 2:1 diamond 32 wide and 16 tall centred
   under the feet, with the tile set's two soil cliff faces below it (lit on the left, shaded on the right) and a
   line of the tiles' ink where the top meets them. A soft warm shadow lies under the figure. */
const GRASS = TERRAIN_BY_ID.grass, TILE = (() => {
  const top = BASE - 7, rows = [], bottom = new Array(W).fill(-1);
  for (let j = 0; j < 16; j++) { const hw = 2 + 2 * Math.min(j, 15 - j); rows.push([16 - hw, 16 + hw - 1]); for (let x = 16 - hw; x < 16 + hw; x++) bottom[x] = top + j; }
  return { top, rows, bottom };
})();
function groundTile(cv, x, y, k) {
  const [lit, shaded] = GRASS.side, edge = mixHex(GRASS.top, OUTLINE, 0.35);
  TILE.rows.forEach(([l, r], j) => { for (let i = l; i <= r; i++) cv.rect(x + i * k, y + (TILE.top + j) * k, k, k, TILE.bottom[i] === TILE.top + j ? edge : GRASS.top); });
  for (let i = 0; i < W; i++) for (let d = 1; d <= 4; d++) cv.rect(x + i * k, y + (TILE.bottom[i] + d) * k, k, k, i < 16 ? lit : shaded);
  for (let j = -2; j <= 2; j++) for (let i = -9; i <= 9; i++) {
    const d = (i / 9.5) ** 2 + (j / 2.4) ** 2; if (d > 1) continue;
    cv.rect(x + (16 + i) * k, y + (BASE + j) * k, k, k, C.shadow, d < 0.45 ? 0.32 : 0.18);
  }
}

/* the roster in blocks for rows of figures: the townsfolk and the jobs apart, each split evenly into rows of at
   most nine so a row stays readable. Each block is { name, list }. */
function blocks(roster) {
  const out = [];
  for (const [name, list] of [['TOWNSFOLK', roster.filter(c => TOWNSFOLK.includes(c))], ['JOBS', roster.filter(c => !TOWNSFOLK.includes(c))]]) {
    const n = Math.ceil(list.length / 9), size = Math.ceil(list.length / n);
    for (let b = 0; b < n; b++) out.push({ name, list: list.slice(b * size, (b + 1) * size) });
  }
  return out;
}

function buildSheet(roster = ROSTER, k = 4) {
  const label = 230, cell = W * k, gap = 18, margin = 28, rowH = (H + TILE_DROP) * k + 12, head = 186, groups = blocks(roster);
  const blockH = 110 + BODIES.length * (rowH + 10) + 20;
  const w = margin * 2 + label + FACINGS.length * (3 * cell + gap) - gap, builds = head + roster.length * (rowH + 10) + 40;
  const h = builds + 70 + groups.length * blockH + margin;
  const cv = canvas(w, h); cv.rect(0, 0, w, h, C.page);
  cv.text('CHARACTER ROSTER', margin, margin, 5, C.text);
  cv.text(`${roster.length} CHARACTERS · ${BODIES.length} BUILDS · 4 FACINGS · STAND AND STRIDE`, margin, margin + GLYPH_H * 5 + 14, 2, C.dim);
  FACINGS.forEach(([name], f) => {
    const gx = margin + label + f * (3 * cell + gap), y = head - 62;
    cv.text(name, gx + (3 * cell - textWidth(name) * 3) / 2, y, 3, C.text);
    ['STAND', 'STEP', 'STEP'].forEach((s, p) => cv.text(s, gx + p * cell + (cell - textWidth(s) * 2) / 2, y + 36, 2, C.dim));
  });
  roster.forEach((job, r) => {
    const y = head + 14 + r * (rowH + 10), frames = render(job);
    cv.win(margin - 10, y - 6, w - margin * 2 + 20, rowH);
    cv.text(job.name.toUpperCase(), margin + 8, y + rowH / 2 - 16, 3, C.text);
    FACINGS.forEach(([, view, flip], f) => frames[view].forEach((rgba, p) => {
      const x = margin + label + f * (3 * cell + gap) + p * cell, top = y + 2;
      groundTile(cv, x, top, k); cv.blit(rgba, x, top, k, flip);
    }));
  });
  /* the builds: each character standing, facing south-west, in each body type, a block of them at a time */
  cv.text('BODY TYPES', margin, builds, 4, C.text);
  cv.text('ANYONE ON ANY BUILD', margin, builds + GLYPH_H * 4 + 12, 2, C.dim);
  groups.forEach(({ name, list: group }, g) => {
    const by = builds + 70 + g * blockH, step = Math.min(cell + 24, Math.floor((w - margin * 2 - label) / group.length));
    cv.text(name, margin, by + 12, 2, C.text);
    group.forEach((job, c) => { const n = job.name.toUpperCase(), x = margin + label + c * step; cv.text(n, x + (cell - textWidth(n) * 2) / 2, by + 12, 2, C.dim); });
    BODIES.forEach((b, r) => {
      const y = by + 40 + r * (rowH + 10);
      cv.win(margin - 10, y - 6, w - margin * 2 + 20, rowH);
      cv.text(BODY_TYPES[b].name.toUpperCase(), margin + 8, y + rowH / 2 - 16, 3, C.text);
      group.forEach((job, c) => { const x = margin + label + c * step, top = y + 2; groundTile(cv, x, top, k); cv.blit(render(job, b).front[0], x, top, k, false); });
    });
  });
  return { width: w, height: h, rgba: cv.px };
}

/* The roster walking in place, a block of characters at a time: a window per facing with everyone in the block on
   their tiles, as the frames of an animation that steps through WALK. Returns { width, height, frames: [rgba, ...] }. */
function buildWalk(roster = ROSTER, k = 3) {
  const cell = W * k, step = Math.max(cell + 20, ...roster.map(j => textWidth(j.name.toUpperCase()) * 2 + 28)), groups = blocks(roster);
  const margin = 24, label = 70, head = 40, rowH = (H + TILE_DROP) * k + 12, blockH = head + FACINGS.length * (rowH + 10) + 14;
  const w = margin * 2 + label + Math.max(...groups.map(g => g.list.length)) * step, h = groups.length * blockH + margin;
  const all = new Map(roster.map(job => [job, render(job)]));
  const frames = WALK.map(pose => {
    const cv = canvas(w, h); cv.rect(0, 0, w, h, C.page);
    groups.forEach(({ list: group }, g) => {
      const top0 = g * blockH;
      group.forEach((job, c) => { const n = job.name.toUpperCase(); cv.text(n, margin + label + c * step + (step - textWidth(n) * 2) / 2, top0 + margin - 6, 2, C.dim); });
      FACINGS.forEach(([name, view, flip], r) => {
        const y = top0 + head + r * (rowH + 10);
        cv.win(margin - 10, y - 6, w - margin * 2 + 20, rowH);
        cv.text(name, margin + 6, y + rowH / 2 - 12, 3, C.text);
        group.forEach((job, c) => { const x = margin + label + c * step + (step - cell) / 2, top = y + 2; groundTile(cv, x, top, k); cv.blit(all.get(job)[view][pose], x, top, k, flip); });
      });
    });
    return cv.px;
  });
  return { width: w, height: h, frames };
}

export { FACINGS, buildSheet, buildWalk };
