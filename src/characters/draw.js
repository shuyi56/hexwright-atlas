import { INK, hexRgb } from '../render/palette.js';
import { TERRAIN_BY_ID } from '../tiles/index.js';
import { SIZE } from './sprite.js';

/* ================= character sprites: pixel art =================
   Characters are crisp pixel art made to sit in the tile set's palette. The tiles are pale, chalky
   colours on paper, so every sprite colour is washed a little toward the paper tone and faintly grained
   like the map image. The one-pixel outline is the tiles' ink, heavier on the shadow side, and the light
   from the upper left models each figure in stepped tones (see labels). On the map every zoom draws from one master per frame (see drawSprite), so the character
   looks the same zoomed out or in: no zoom-dependent versions, and no blurring of pixel art. */
const PAD = 1, UP = 1, N = SIZE + PAD * 2;
const INK_RGB = hexRgb(INK), PAPER = [240, 230, 203];
const lum = rgb => rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11, dark = rgb => lum(rgb) < 60;
const noise = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
/* toward the paper: 14% of the paper tone and a tenth of the saturation gone */
const wash = c => { const l = lum(c); return c.map((ch, i) => (ch * 0.9 + l * 0.1) * 0.86 + PAPER[i] * 0.14); };
const out = (c, k, gr = 1) => c.map(ch => Math.max(0, Math.min(255, Math.round(ch * k * gr))));

/* Experimental looks, each off by default so the figures draw as before:
   - cool: shadow steps lean toward a cool violet while highlights stay warm;
   - round: a soft height field from the silhouette turns each mass top to bottom as well as side to side;
   - pop: the map-scale mip levels come from a master with a wider light-to-shadow spread;
   - bounce: the ground's colour is reflected onto the lower, shaded surfaces (ground is its hex colour);
   - silhouette: the ground shadow is the figure's own outline, laid flat toward the lower right. */
const LOOK = { cool: false, round: false, pop: false, bounce: false, silhouette: false, ground: '#b5be83' };
function setLook(o) { Object.assign(LOOK, o); cache.clear(); mips.clear(); }
/* try them in the app with ?look=cool,round,bounce,silhouette (or ?look=all) */
const asked = typeof location !== 'undefined' && new URLSearchParams(location.search).get('look');
if (asked) for (const k of asked === 'all' ? ['cool', 'round', 'pop', 'bounce', 'silhouette'] : asked.split(',')) if (k in LOOK && k !== 'ground') LOOK[k] = true;
const COOL = [72, 66, 118];

/* Each pixel of the finished frame as a label: 0 clear, 1 + BANDS * (index - 1) + band for a filled pixel, and
   OUTLINE + index (+ HEAVY on the shadow side) for an outline pixel bordering that colour. The band is one of
   eight light steps (TONE), worked out per pixel so the figure reads as a solid lit from the upper left:
   - the whole body turns like a cylinder: a highlight a quarter of the way in from the left, the core shadow
     near the right, and a little light bounced back onto the very right edge;
   - each part rounds itself: its left edge catches light, its right and lower edges turn away;
   - a part's top facing open sky is brighter, while one tucked under another part (under the hair, a brim,
     the belt) sits in that part's shadow;
   - the figure darkens toward the feet, where the ground shades it. */
/* highlights lift toward a warm white so pale cloth and hair still show a lit side */
const LIT = [255, 246, 222];
const BANDS = 8, TONE = [0.6, 0.69, 0.78, 0.89, 1, 1.09, 1.18, 1.27], OUTLINE = 1 << 12, HEAVY = 64;
function labels(fr) {
  const L = new Int32Array(N * N), at = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : fr[y * SIZE + x]);
  const lo = new Int32Array(SIZE).fill(SIZE), hi = new Int32Array(SIZE).fill(-1); let y0 = SIZE, y1 = -1;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (fr[y * SIZE + x]) { if (x < lo[y]) lo[y] = x; hi[y] = x; y0 = Math.min(y0, y); y1 = y; }
  /* The face's small marks (a colour on four pixels or fewer in the head: mouth, nose) and the skin around them
     keep the plain/lit/shaded steps the characters had before, so the mouth keeps its old smile. */
  const used = new Int32Array(256); for (const v of fr) used[v]++;
  const small = (x, y) => { const w = at(x, y); return w && used[w] <= 4; };
  const face = (x, y) => { if (y > 13) return false; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (small(x + i, y + j)) return true; return false; };
  const OLD = [4, 5, 3];
  /* round: the silhouette blurred into a height field; its slope, lit from the upper left, rounds each mass */
  let H = null;
  if (LOOK.round) {
    const m = new Float32Array(SIZE * SIZE); for (let u = 0; u < m.length; u++) m[u] = fr[u] ? 1 : 0;
    H = m; for (let pass = 0; pass < 3; pass++) {
      const t = new Float32Array(H.length), hb = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : H[y * SIZE + x]);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) t[y * SIZE + x] = (hb(x - 1, y) + hb(x + 1, y) + hb(x, y - 1) + hb(x, y + 1) + 2 * hb(x, y)) / 6;
      H = t;
    }
  }
  const slope = (x, y) => { const h = (i, j) => (i < 0 || j < 0 || i >= SIZE || j >= SIZE ? 0 : H[j * SIZE + i]); return [(h(x + 1, y) - h(x - 1, y)) / 2, (h(x, y + 1) - h(x, y - 1)) / 2]; };
  for (let y = -PAD; y < SIZE + PAD; y++) for (let x = -PAD; x < SIZE + PAD; x++) {
    const v = at(x, y), u = (y + PAD) * N + x + PAD;
    if (!v) { const lt = at(x - 1, y), up = at(x, y - 1), n = lt || at(x + 1, y) || up || at(x, y + 1); if (n) L[u] = OUTLINE + n + (lt || up ? HEAVY : 0); continue; }
    const t = hi[y] > lo[y] ? (x - lo[y]) / (hi[y] - lo[y]) : 0.4, l = at(x - 1, y), r = at(x + 1, y), a = at(x, y - 1), b = at(x, y + 1);
    let f = t < 0.12 ? 1.1 : t < 0.38 ? 1.17 : t < 0.58 ? 1.02 : t < 0.8 ? 0.84 : x === hi[y] && t > 0.9 ? 0.8 : 0.7;
    if (l !== v) f += t < 0.6 ? 0.1 : 0.04;
    if (r !== v && t > 0.3) f -= 0.08;
    if (!a) f += 0.1; else if (a !== v) f -= 0.14;
    if (b !== v) f -= 0.06;
    /* facing the light (up and left) is a falling height toward the upper left, so a positive slope */
    if (H) { const [gx, gy] = slope(x, y); f += Math.max(-0.3, Math.min(0.3, (gx * 0.45 + gy * 0.9) * 1.6)); }
    f *= 1.05 - 0.16 * (y - y0) / Math.max(1, y1 - y0);
    let band = 0, best = 9; TONE.forEach((k, i) => { if (Math.abs(k - f) < best) { best = Math.abs(k - f); band = i; } });
    if (face(x, y)) {
      const s = (x - lo[y]) / Math.max(1, hi[y] - lo[y]), eL = l !== v, eR = r !== v;
      band = OLD[s > 0.72 || (eR && s > 0.5) ? 2 : (eL && s < 0.5) || !a ? 1 : 0];
    }
    L[u] = 1 + BANDS * (v - 1) + band;
  }
  return L;
}
/* paint labels to a canvas of side n */
function paintLabels(pal, L, n, spread = 1) {
  const rgb = pal.map(h => wash(hexRgb(h))), c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), im = g.createImageData(n, n), d = im.data;
  let y0 = n, y1 = 0; if (LOOK.bounce) for (let u = 0; u < L.length; u++) if (L[u] && L[u] < OUTLINE) { const y = (u / n) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const ground = wash(hexRgb(LOOK.ground));
  for (let u = 0; u < L.length; u++) {
    const l = L[u]; if (!l) continue;
    const x = u % n, y = (u / n) | 0, gr = 1 + (noise(x + 7, y + 3) - 0.5) * 0.06; let col;
    /* the outline is full ink on the shadow side and lets the colour through on the lit side */
    if (l >= OUTLINE) { const heavy = (l - OUTLINE) & HEAVY, nc = rgb[((l - OUTLINE) & (HEAVY - 1)) - 1] || INK_RGB, m = heavy ? 0.1 : 0.3; col = INK_RGB.map((ch, i) => ch * (1 - m) * (heavy ? 0.92 : 1) + nc[i] * m * 0.6); }
    else {
      const base = rgb[((l - 1) / BANDS) | 0] || INK_RGB, k = 1 + (TONE[(l - 1) % BANDS] - 1) * spread;
      col = dark(base) ? base : k > 1 ? out(base.map((ch, i) => ch + (LIT[i] - ch) * (k - 1) * 1.4), 1, gr) : out(base, k, gr);
      if (!dark(base)) {
        const shade = Math.max(0, Math.min(1, (1 - k) / 0.4));
        /* cool: the shade takes on a violet cast, a little more saturated than plain darkening */
        if (LOOK.cool && shade > 0) col = col.map((ch, i) => Math.round(ch + (COOL[i] * k - ch) * 0.3 * shade));
        /* bounce: the ground's colour on the lower part of the figure, most where it is shaded */
        if (LOOK.bounce) { const low = Math.max(0, Math.min(1, ((y - y0) / Math.max(1, y1 - y0) - 0.45) / 0.55)); const w = low * (0.35 + 0.65 * shade) * 0.45; col = col.map((ch, i) => Math.round(ch + (ground[i] * Math.max(k, 0.75) - ch) * w)); }
      }
    }
    d.set([col[0], col[1], col[2], 255], u * 4);
  }
  g.putImageData(im, 0, 0); return c;
}
/* the finished pixel-art frame, one canvas pixel per sprite pixel (the character editor's Shaded view) */
function pixelFrame(pal, fr) { return paintLabels(pal, labels(fr), N); }

/* Scale2x on labels: doubles the image, rounding corners and staircases where two sides agree */
function scale2x(src, n) {
  const m = n * 2, out = new Int32Array(m * m), at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : src[y * n + x]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const P = src[y * n + x], A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1), o = 2 * y * m + 2 * x;
    out[o] = C === A && C !== D && A !== B ? A : P; out[o + 1] = A === B && A !== C && B !== D ? B : P;
    out[o + m] = D === C && D !== B && C !== A ? C : P; out[o + m + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return out;
}
/* keep only the part of the outline within r fine pixels of the figure */
function thinOutline(L, n, r) {
  const R = Math.ceil(r), drop = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = y * n + x; if (L[u] < OUTLINE) continue;
    let near = false;
    for (let j = -R; j <= R && !near; j++) for (let i = -R; i <= R; i++) {
      const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= n || yy >= n || i * i + j * j > r * r) continue;
      const l = L[yy * n + xx]; if (l && l < OUTLINE) { near = true; break; }
    }
    if (!near) drop.push(u);
  }
  for (const u of drop) L[u] = 0;
}
/* The master: 8x, its staircases rounded by three Scale2x passes, the outline trimmed to a bit over half a
   sprite pixel (the weight a one-pixel outline has once filtered at map scale). Then a mip chain, each level
   half the last, so drawing never shrinks an image by more than half and nothing aliases or blurs. */
const MASTER = 8;
function mipChain(pal, fr, lashes, iris) {
  let L = labels(fr), n = N; for (let k = 1; k < MASTER; k *= 2) { L = scale2x(L, n); n *= 2; }
  thinOutline(L, n, 4.6);
  const master = paintLabels(pal, L, n); roundEyes(master.getContext('2d'), pal, fr, lashes, iris);
  /* pop: the levels below the master (every zoom but the closest) shrink from a second master with the light and
     shadow pushed apart, since shrinking averages the eight steps toward the middle */
  let wide = null; if (LOOK.pop) { wide = paintLabels(pal, L, n, 1.3); roundEyes(wide.getContext('2d'), pal, fr, lashes, iris); }
  const levels = [{ up: MASTER, can: master }], half = (src, up) => {
    const c = document.createElement('canvas'); c.width = c.height = Math.max(1, Math.round(N * up));
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height); return c;
  };
  for (let up = MASTER / 2; up >= 0.25; up /= 2) levels.push({ up, can: half(wide && up === MASTER / 2 ? wide : levels[levels.length - 1].can, up) });
  return levels;
}

/* Eyes are one pixel wide and two tall, which Scale2x cannot round. On the master each such run of a near-black
   colour is redrawn as an oval in its own colour over the skin beside it, with a brow, an upper lid and a small glint toward the light. */
/* the iris colour, chestnut unless the character sets its own; its darker rim and lighter lower half are mixed
   from it toward black and white */
const IRIS = '#7a4a24';
const mixHex = (h, t, k) => `rgb(${hexRgb(h).map(v => Math.round(v + (t - v) * k)).join(',')})`;
function roundEyes(g, pal, fr, lashes, iris = IRIS) {
  const rim = mixHex(iris, 0, 0.55), light = mixHex(iris, 255, 0.35);
  const feat = pal.map(h => lum(hexRgb(h)) < 60), isF = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && fr[y * SIZE + x] > 0 && feat[fr[y * SIZE + x] - 1];
  const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
  const eyes = [];
  for (let y = 0; y < SIZE - 1; y++) for (let x = 0; x < SIZE; x++) {
    if (!isF(x, y) || !isF(x, y + 1) || isF(x, y - 1) || isF(x, y + 2) || isF(x - 1, y) || isF(x + 1, y) || isF(x - 1, y + 1) || isF(x + 1, y + 1)) continue;
    const X = (x + PAD) * MASTER, Y = (y + PAD) * MASTER;
    /* the skin is whatever most of the eye's neighbours are, so a nasal or a beard beside it is not taken for it */
    const nb = [[x - 1, y], [x + 1, y], [x - 1, y + 1], [x + 1, y + 1], [x, y + 2]].filter(([i, j]) => fr[j * SIZE + i]), count = {};
    for (const [i, j] of nb) count[fr[j * SIZE + i]] = (count[fr[j * SIZE + i]] || 0) + 1;
    const [sx, sy] = nb.reduce((m, q) => (count[fr[q[1] * SIZE + q[0]]] > count[fr[m[1] * SIZE + m[0]]] ? q : m), nb[0] || [x - 1, y]);
    /* a brow is the hair-coloured pixel just above the eye */
    const above = y > 0 ? fr[(y - 1) * SIZE + x] : 0, brow = above && above !== fr[sy * SIZE + sx] && !feat[above - 1] ? px(X + MASTER / 2, Y - MASTER / 2) : null;
    eyes.push({ X, Y, brow, eye: px(X + MASTER / 2, Y + MASTER), skin: px((sx + PAD) * MASTER + MASTER / 2, (sy + PAD) * MASTER + MASTER / 2) });
  }
  const mid = eyes.reduce((a, e) => a + e.X, 0) / Math.max(1, eyes.length);
  for (const { X, Y, brow, eye, skin } of eyes) {
    const cx = X + MASTER / 2, cy = Y + MASTER, rx = MASTER * 0.62, ry = MASTER * 1.1, out = eyes.length > 1 ? Math.sign(X - mid) || -1 : -1;
    g.fillStyle = skin; g.fillRect(X, Y - (brow ? MASTER : 0), MASTER, MASTER * (brow ? 3 : 2));
    /* the brow: a low, nearly flat stroke a little wider than the eye, rising slightly toward the outer side */
    if (brow) {
      const by = Y - MASTER * 0.32, i = cx - out * rx * 1.05, o = cx + out * rx * 1.35;
      g.strokeStyle = brow; g.lineCap = 'round'; g.lineWidth = MASTER * 0.42;
      g.beginPath(); g.moveTo(i, by + MASTER * 0.12); g.quadraticCurveTo(cx + out * rx * 0.45, by - MASTER * 0.12, o, by + MASTER * 0.1); g.stroke();
    }
    /* the eye proper: a dark rim, a thin filament of white, and an iris filling nearly all of it, shaded darker
       under the lid and lighter below, with a ring at its edge and a pupil */
    g.fillStyle = eye; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e6dcc6'; g.beginPath(); g.ellipse(cx, cy, rx * 0.94, ry * 0.96, 0, 0, Math.PI * 2); g.fill();
    const irx = rx * 0.78, iry = ry * 0.84, iy = cy + MASTER * 0.04;
    const shade = g.createLinearGradient(0, iy - iry, 0, iy + iry);
    shade.addColorStop(0, rim); shade.addColorStop(0.35, iris); shade.addColorStop(1, light);
    g.fillStyle = shade; g.beginPath(); g.ellipse(cx, iy, irx, iry, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = rim; g.lineWidth = MASTER * 0.14; g.beginPath(); g.ellipse(cx, iy, irx - MASTER * 0.07, iry - MASTER * 0.07, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#0d0b0a'; g.beginPath(); g.ellipse(cx, iy - MASTER * 0.06, irx * 0.36, iry * 0.3, 0, 0, Math.PI * 2); g.fill();
    /* the upper lid: a thin dark arc over the eye, thickening toward the outer corner and ending in a small flick */
    /* characters marked with lashes (the women) keep a fuller lid and a longer flick */
    const L = lashes ? { a: 1, w: 0.09, o: 0.16, f: 0.1, fx: 0.32, fy: 0.22 } : { a: 0.8, w: 0.06, o: 0.1, f: 0.06, fx: 0.16, fy: 0.1 };
    g.strokeStyle = eye; g.lineCap = 'round'; g.globalAlpha = L.a;
    g.lineWidth = MASTER * L.w; g.beginPath(); g.ellipse(cx, cy, rx + MASTER * 0.14, ry + MASTER * 0.1, 0, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    const a0 = out < 0 ? Math.PI * 1.12 : Math.PI * 1.62, a1 = out < 0 ? Math.PI * 1.38 : Math.PI * 1.88;
    g.lineWidth = MASTER * L.o; g.beginPath(); g.ellipse(cx, cy, rx + MASTER * 0.14, ry + MASTER * 0.1, 0, a0, a1); g.stroke();
    const ex = cx + out * (rx + MASTER * 0.05), ey = cy - ry * 0.45;
    g.lineWidth = MASTER * L.f; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + out * MASTER * L.fx, ey - MASTER * L.fy); g.stroke(); g.globalAlpha = 1;
    g.fillStyle = 'rgba(255, 250, 238, 0.9)'; g.beginPath(); g.ellipse(X + MASTER * 0.38, Y + MASTER * 0.72, MASTER * 0.1, MASTER * 0.13, 0, 0, Math.PI * 2); g.fill();   /* a glint toward the light */
  }
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
const mips = new Map();
function mipFor(s, face, k) {
  const key = s.pal.join() + (s.lashes ? '|l' : '') + (s.iris ? '|' + s.iris : '') + '|' + String.fromCharCode(...s.frames[face][k]); let m = mips.get(key);
  if (!m) { if (mips.size > 200) mips.clear(); m = mipChain(s.pal, s.frames[face][k], s.lashes, s.iris); mips.set(key, m); }
  return m;
}
/* Draw a frame with the figure's feet at (x, y); px is the size of one sprite pixel in drawing units. The level
   used is the smallest one with at least as many pixels as the screen will show, drawn smoothed, so every zoom
   shows the same picture at the sharpness the screen allows. */
function drawSprite(g, s, face, k, x, y, px) {
  const m = g.getTransform(), screen = Math.hypot(m.a, m.b) * px, levels = mipFor(s, face, k);
  let lv = levels[0]; for (const l of levels) if (l.up >= screen) lv = l;
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(lv.can, x - N / 2 * px, y - (PAD + SIZE) * px, N * px, N * px); g.restore();
}
/* ground shadow under a figure: a long soft shadow cast to the right (the way the pieces' shadows fall), a
   pool under the feet, and a dark contact patch where the boots meet the ground. Given the sprite (and the
   silhouette look is on), the long shadow is the figure's own outline laid flat toward the lower right. */
function footShadow(g, x, y, px, s, face = 'se', k = 0) {
  const H = SIZE * px, ell = (cx, cy, rx, ry, a) => { g.fillStyle = `rgba(43,30,16,${a})`; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  g.save();
  if (LOOK.silhouette && s) {
    const m = g.getTransform(), screen = Math.hypot(m.a, m.b) * px, levels = mipFor(s, face, k);
    let lv = levels[0]; for (const l of levels) if (l.up >= screen) lv = l;
    if (!lv.sil) {
      const c = document.createElement('canvas'); c.width = lv.can.width; c.height = lv.can.height;
      const sg = c.getContext('2d'); sg.drawImage(lv.can, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgb(43,30,16)'; sg.fillRect(0, 0, c.width, c.height); lv.sil = c;
    }
    g.save(); g.translate(x, y); g.transform(1, 0, -0.7, -0.22, 0, 0);
    g.filter = `blur(${Math.max(0.5, screen * 0.9).toFixed(2)}px)`; g.globalAlpha = 0.26; g.imageSmoothingEnabled = true;
    g.drawImage(lv.sil, -N / 2 * px, -(PAD + SIZE) * px, N * px, N * px); g.restore();
    ell(x + H * 0.05, y, H * 0.19, H * 0.08, 0.15);
  } else {
    ell(x + H * 0.22, y - H * 0.02, H * 0.3, H * 0.07, 0.13);
    ell(x + H * 0.05, y, H * 0.2, H * 0.085, 0.18);
  }
  ell(x + H * 0.01, y - H * 0.005, H * 0.12, H * 0.045, 0.3);
  g.restore();
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
  tileBlock(g, x, y, w); const px = w * 1.55 / SIZE; footShadow(g, x, y + w * 0.06, px, s, face, k); drawSprite(g, s, face, k, x, y + w * 0.08, px);
}
function spriteThumb(s, size = 60, face = 'se', k = 0) {
  const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = size * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); standOn(g, s, face, k, size / 2, size * 0.66, size * 0.4); return c;
}

export { N as INK_SIZE, PAD as INK_PAD, UP as INK_UP, drawSprite, footShadow, frameCanvas, renderFrame, setLook, spriteThumb, standOn };
