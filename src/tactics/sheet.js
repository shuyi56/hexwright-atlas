import { ADVANCE, GLYPH_H, glyph, textWidth } from './font.js';
import { H, W, hexRgb } from './pixels.js';
import { BASE, BODY_TYPES } from './body.js';
import { BODIES, ROSTER, render } from './roster.js';

/* ================= tactics sprites: the sprite sheet =================
   Every job in one image laid out like a tactics game's unit menu: a blue window per job with its name, then
   the four facings (south-west, south-east, north-east, north-west), each standing and in both strides, over
   a soft ground shadow. South-east and north-west are the drawn views mirrored, as the games do. Below, every
   job in every build, so any job can be read on any body. Pure RGBA, so Node can write it
   (tools/tactics-sheet.mjs) and a test can check it. */
const FACINGS = [['SW', 'front', false], ['SE', 'front', true], ['NE', 'back', false], ['NW', 'back', true]];
const C = { page: '#121829', win: ['#36498a', '#1c2650'], rim: '#dfe4f5', rimD: '#0b0f1c', text: '#f4ead2', dim: '#9aa6cc', shadow: '#000000' };

function canvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, rgb, a = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return; const u = (y * w + x) * 4;
    for (let i = 0; i < 3; i++) px[u + i] = Math.round(px[u + i] * (1 - a) + rgb[i] * a); px[u + 3] = 255;
  };
  const rect = (x, y, rw, rh, hex, a = 1) => { const rgb = hexRgb(hex); for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, rgb, a); };
  const text = (s, x, y, k, hex) => { const rgb = hexRgb(hex); [...s].forEach((ch, n) => { for (const [gx, gy] of glyph(ch)) for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) set(x + (n * ADVANCE + gx) * k + i, y + gy * k + j, rgb); }); };
  /* a sprite frame at k× with its pixels' alpha respected, optionally mirrored */
  const blit = (rgba, x, y, k, flip) => {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (j * W + (flip ? W - 1 - i : i)) * 4; if (!rgba[u + 3]) continue;
      for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) set(x + i * k + a, y + j * k + b, [rgba[u], rgba[u + 1], rgba[u + 2]]);
    }
  };
  /* a window: a vertical gradient, a light rim inside a dark one, corners cut */
  const win = (x, y, ww, wh) => {
    const [t, b] = C.win.map(hexRgb);
    for (let j = 0; j < wh; j++) { const f = j / Math.max(1, wh - 1), rgb = t.map((v, i) => v + (b[i] - v) * f); for (let i = 0; i < ww; i++) set(x + i, y + j, rgb); }
    rect(x, y, ww, 2, C.rimD); rect(x, y + wh - 2, ww, 2, C.rimD); rect(x, y, 2, wh, C.rimD); rect(x + ww - 2, y, 2, wh, C.rimD);
    rect(x + 2, y + 2, ww - 4, 2, C.rim); rect(x + 2, y + wh - 4, ww - 4, 2, C.rim); rect(x + 2, y + 2, 2, wh - 4, C.rim); rect(x + ww - 4, y + 2, 2, wh - 4, C.rim);
    for (const [cx, cy] of [[x, y], [x + ww - 2, y], [x, y + wh - 2], [x + ww - 2, y + wh - 2]]) rect(cx, cy, 2, 2, C.page);
  };
  return { w, h, px, rect, text, blit, win, set };
}

/* a soft oval of shadow under the feet, in sprite pixels, stepped like the art */
function groundShadow(cv, x, y, k) {
  for (let j = -2; j <= 2; j++) for (let i = -9; i <= 9; i++) {
    const d = (i / 9.5) ** 2 + (j / 2.4) ** 2; if (d > 1) continue;
    cv.rect(x + (16 + i) * k, y + (BASE + j) * k, k, k, C.shadow, d < 0.45 ? 0.38 : 0.22);
  }
}

function buildSheet(roster = ROSTER, k = 4) {
  const label = 230, cell = W * k, gap = 18, margin = 28, rowH = H * k + 16, head = 186;
  const w = margin * 2 + label + FACINGS.length * (3 * cell + gap) - gap, builds = head + roster.length * (rowH + 10) + 40;
  const h = builds + 110 + BODIES.length * (rowH + 10) + margin;
  const cv = canvas(w, h); cv.rect(0, 0, w, h, C.page);
  cv.text('TACTICS ROSTER', margin, margin, 5, C.text);
  cv.text(`${roster.length} JOBS · ${BODIES.length} BUILDS · 4 FACINGS · STAND AND STRIDE`, margin, margin + GLYPH_H * 5 + 14, 2, C.dim);
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
      groundShadow(cv, x, top, k); cv.blit(rgba, x, top, k, flip);
    }));
  });
  /* the builds: each job standing, facing south-west, in each body type */
  cv.text('BODY TYPES', margin, builds, 4, C.text);
  cv.text('ANY JOB ON ANY BUILD', margin, builds + GLYPH_H * 4 + 12, 2, C.dim);
  const step = Math.min(cell + 24, Math.floor((w - margin * 2 - label) / roster.length));
  roster.forEach((job, c) => { const n = job.name.toUpperCase(), x = margin + label + c * step; cv.text(n, x + (cell - textWidth(n) * 2) / 2, builds + 82, 2, C.dim); });
  BODIES.forEach((b, r) => {
    const y = builds + 110 + r * (rowH + 10);
    cv.win(margin - 10, y - 6, w - margin * 2 + 20, rowH);
    cv.text(BODY_TYPES[b].name.toUpperCase(), margin + 8, y + rowH / 2 - 16, 3, C.text);
    roster.forEach((job, c) => { const x = margin + label + c * step, top = y + 2; groundShadow(cv, x, top, k); cv.blit(render(job, b).front[0], x, top, k, false); });
  });
  return { width: w, height: h, rgba: cv.px };
}

export { FACINGS, buildSheet };
