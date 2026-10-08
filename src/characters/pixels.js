/* ================= character sprites: the pixel engine =================
   Figures in the manner of the squad tacticians (Final Fantasy Tactics, Tactics Ogre): big-headed, 32×48,
   drawn as hand-authored grids of material letters and finished here. No DOM, so Node and the browser share it.

   A grid is an array of strings. Each character is a material letter ('.' or ' ' is clear). Uppercase is the
   material as lit; lowercase is the same material in a crease (a fold, a seam, the line between two plates).
   Parts are stamped back to front, each on its own layer. Finishing a frame:
   - every colour is first washed toward the tiles' paper (a little paler, a good deal less saturated), so the
     figures sit in the tile set's chalky palette rather than glowing on it;
   - every material is a five-step ramp made from one colour, gently hue-shifted: highlights warm toward gold,
     shadows a touch cooler, in soft steps like the tiles' own faces;
   - each pixel's step comes from light at the upper left: the figure turns like a cylinder across its width,
     tops facing the sky catch light, undersides and anything tucked under another part fall into shade, and a
     part sitting behind another gets a dark contour where they meet;
   - the line work is solid ink: the tiles' umber outline all round (a touch warmer where the light falls),
     left off diagonal corners so curves stay round; a dark contour where one part stands in front of another;
     an inked edge wherever two materials meet within one piece (hair against the brow, a brim against the face,
     a vest against the shirt); and creases inked as lines rather than shaded. */
const W = 32, H = 48;
/* The parts are laid out on that 32×48 grid, but a frame is finished at UP times its size (FW×FH): the grid's
   materials are doubled, the hand-drawn parts that have a fine version (hi) are stamped over them at full
   resolution, and the light, contours and outline are worked out on the fine pixels, so the line work is half as
   thick as the layout's pixels. */
const UP = 2, FW = W * UP, FH = H * UP;
/* the tiles' ink and paper (render/palette.js INK and VEL) */
const OUTLINE = '#2b2116', PAPER = '#f0e6cb';
/* how far each kind of line is pushed from its material's deepest tone to the outline ink */
const INK = { outline: 0.9, outlineLit: 0.78, contour: 0.6, edge: 0.48, crease: 0.3 };

/* ---------- colour ---------- */
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/* OKLCH: lightness, chroma, hue in a space where equal steps look equal, so a ramp darkens evenly at any colour */
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const gam = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function rgbLch(c) {
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
function lchRgb([L, C, h]) {
  const A = C * Math.cos(h * Math.PI / 180), B = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(gam);
}
/* turn hue h toward target by at most deg degrees, the short way round */
const toward = (h, target, deg) => { const d = ((target - h + 540) % 360) - 180; return (h + Math.sign(d) * Math.min(Math.abs(d), deg) + 360) % 360; };
/* five steps, brightest first: highlight, light, base, shade, deep. The steps are gentle, like the tiles' lit
   and shaded faces. Highlights warm toward gold and lose a little colour; shadows turn only slightly cool, so
   they stay in the tiles' warm family; a near-grey keeps its hue */
const STEPS = [[0.085, 0.8, 90, 8], [0.045, 0.92, 90, 4], [0, 1, 0, 0], [-0.07, 0.94, 290, 4], [-0.14, 0.86, 290, 8]];
function ramp(hex) {
  const [L, C, h] = rgbLch(hexRgb(hex));
  return STEPS.map(([dl, kc, to, deg], i) => (i === 2 ? hex.toLowerCase() : rgbHex(lchRgb([Math.max(0, Math.min(1, L + dl)), C * kc, C < 0.02 ? h : toward(h, to, deg)]))));
}
const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); };
/* The tiles are pale, chalky colours on paper. A colour joins them by losing over a quarter of its chroma and
   moving an eighth of the way toward the paper's lightness and warmth (the map's townsfolk are washed the same
   way). */
const PAPER_LCH = rgbLch(hexRgb(PAPER));
function wash(hex) {
  const [L, C, h] = rgbLch(hexRgb(hex)), t = 0.12, k = 0.72;
  const A = C * Math.cos(h * Math.PI / 180) * k, B = C * Math.sin(h * Math.PI / 180) * k;
  const pa = PAPER_LCH[1] * Math.cos(PAPER_LCH[2] * Math.PI / 180), pb = PAPER_LCH[1] * Math.sin(PAPER_LCH[2] * Math.PI / 180);
  const a = A + (pa - A) * t, b = B + (pb - B) * t;
  return rgbHex(lchRgb([L + (PAPER_LCH[0] - L) * t, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]));
}

/* ---------- composing ---------- */
/* A material map w×h, each pixel up× the layout's. clipped counts pixels that fell outside the frame, so a test
   can catch a part drawn off the edge. line marks the pixels of a crease drawn as a line (see upsample). */
const frameBuf = (w = W, h = H, up = 1) => ({ w, h, up, mat: new Array(w * h).fill(null), crease: new Uint8Array(w * h), line: null, layer: new Int16Array(w * h).fill(-1), group: new Int16Array(w * h).fill(-1), clipped: 0 });
/* stamp a grid with its top-left at (x, y). Parts of one group (a head, its hair and its hat) meet without a
   contour between them. flip mirrors the grid itself. under: only over pixels of earlier layers, so a part
   stamped after the rest still goes behind what was meant to stand in front of it. */
function stamp(buf, rows, x, y, layer, group = layer, flip = false, under = false) {
  const { w, h } = buf;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[flip ? row.length - 1 - i : i]; if (ch === '.' || ch === ' ') continue;
      const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= w || Y >= h) { buf.clipped++; continue; }
      const u = Y * w + X, up = ch.toUpperCase(); if (under && buf.layer[u] > layer) continue;
      buf.mat[u] = up; buf.crease[u] = ch !== up ? 1 : 0; buf.layer[u] = layer; buf.group[u] = group;
      if (buf.line) buf.line[u] = buf.crease[u];
    }
  });
}
/* The layout's map at UP× its size, each pixel a block. A crease is a line, not a band, so it is redrawn one fine
   pixel wide: from each crease pixel to each creased neighbour of the same material (right, below and the two
   diagonals below) through the fine pixel between them, and a lone crease pixel keeps its whole block. line marks
   those fine pixels; a cel-shaded material's lowercase is a shadow shape rather than a line, and finish keeps it
   whole. */
function upsample(buf) {
  const k = UP, out = frameBuf(buf.w * k, buf.h * k, buf.up * k), { w, h } = buf, W2 = out.w;
  out.line = new Uint8Array(out.w * out.h); out.clipped = buf.clipped;
  const creased = (x, y, v) => x >= 0 && y >= 0 && x < w && y < h && buf.crease[y * w + x] && buf.mat[y * w + x] === v;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = y * w + x; if (buf.mat[u] === null) continue;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const o = (y * k + j) * W2 + x * k + i; out.mat[o] = buf.mat[u]; out.crease[o] = buf.crease[u]; out.layer[o] = buf.layer[u]; out.group[o] = buf.group[u];
    }
    if (!buf.crease[u]) continue;
    const v = buf.mat[u], at = (i, j) => { out.line[(y * k + j) * W2 + x * k + i] = 1; }, links = [[1, 0], [0, 1], [1, 1], [-1, 1]].filter(([dx, dy]) => creased(x + dx, y + dy, v));
    const linked = links.length || [[-1, 0], [0, -1], [-1, -1], [1, -1]].some(([dx, dy]) => creased(x + dx, y + dy, v));
    if (!linked) { for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) at(i, j); continue; }
    at(0, 0);
    for (const [dx, dy] of links) { if (dx < 0) out.line[(y * k + 1) * W2 + x * k - 1] = 1; else at(dx, dy); }
  }
  return out;
}

/* ---------- finishing: the light, the contours and the outline ---------- */
/* pal maps each material letter to a colour; to { flat: colour } for a mark that takes no light (an eye); or to
   { ramp: colour, clean, cel } where clean means never inked at its edges (skin, so a face stays clean and the hair
   or brim against it carries the line) and cel means shaded as solid shapes: uppercase one flat lit tone, lowercase
   one shadow tone, plus a shadow band wherever another part of the same piece hangs over it (a fringe, a brim) */
function finish(buf, pal) {
  const { w: W, h: H } = buf, up = buf.up || 1, ramps = {}, flat = {}, clean = {}, cel = {};
  for (const [k, v] of Object.entries(pal)) {
    if (typeof v === 'string') ramps[k] = ramp(wash(v)); else if (v.flat) flat[k] = wash(v.flat); else { ramps[k] = ramp(wash(v.ramp)); clean[k] = !!v.clean; cel[k] = !!v.cel; }
  }
  const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && buf.mat[y * W + x] !== null;
  const m = (x, y) => (ok(x, y) ? buf.mat[y * W + x] : null), lay = (x, y) => (ok(x, y) ? buf.layer[y * W + x] : -1), grp = (x, y) => (ok(x, y) ? buf.group[y * W + x] : -1);
  /* each layer's row span, for the turn of the whole figure */
  const span = new Map(); const key = (l, y) => l * H + y;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ok(x, y)) { const k = key(lay(x, y), y), s = span.get(k); if (!s) span.set(k, [x, x]); else s[1] = x; }
  /* a frame uses a few dozen colours, so each is parsed and each ink mix worked out once */
  const rgb = new Map(), inks = new Map(), rgba = new Uint8ClampedArray(W * H * 4);
  const put = (u, hex) => { let c = rgb.get(hex); if (!c) rgb.set(hex, c = [...hexRgb(hex), 255]); rgba.set(c, u * 4); };
  const ink = (a, b, t) => { const k = `${a}${b}${t}`; let c = inks.get(k); if (!c) inks.set(k, c = mixHex(a, b, t)); return c; };
  const turn = t => (t < 0.22 ? 0.85 : t < 0.48 ? 0.35 : t < 0.72 ? -0.25 : -0.8);
  /* each pixel's run along its row: the stretch of the same material in the same layer it lies in */
  const runA = new Int16Array(W * H), runB = new Int16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W;) {
    const u = y * W + x, v = buf.mat[u], L = buf.layer[u]; let e = x;
    while (e + 1 < W && buf.mat[u + e + 1 - x] === v && buf.layer[u + e + 1 - x] === L) e++;
    for (let i = x; i <= e; i++) { runA[y * W + i] = x; runB[y * W + i] = e; }
    x = e + 1;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = y * W + x, v = buf.mat[u]; if (v === null) continue;
    if (flat[v]) { put(u, flat[v]); continue; }
    const R = ramps[v]; if (!R) throw new Error(`no colour for material "${v}"`);
    const L = buf.layer[u], a = runA[u], b = runB[u];
    const [s0, s1] = span.get(key(L, y)), run = b - a + 1, body = s1 - s0 + 1;
    let light = (run >= 3 ? 0.45 * turn((x - a) / (run - 1)) : 0) + (body >= 3 ? 0.6 * turn((x - s0) / (body - 1)) : 0);
    /* the edges light and shade as deep as one of the layout's pixels, however fine the frame */
    let open = 0, under = 0, foot = 0, left = 0, right = 0, overhung = false;
    for (let d = 1; d <= up; d++) {
      if (!ok(x, y - d)) open = 1; else if (m(x, y - d) !== v && lay(x, y - d) <= L) under = 1;
      if (lay(x, y - d) > L || lay(x - 1, y - d) > L) overhung = true;
      if (!ok(x, y + d) || m(x, y + d) !== v) foot = 1;
      if (!ok(x - d, y)) left = 1;
      if (!ok(x + d, y)) right = 1;
    }
    light += open ? 0.7 : under ? -0.55 : 0;
    light += -0.3 * foot + 0.3 * left - 0.45 * right;
    let tone = Math.max(0, Math.min(4, Math.round(2 - light)));
    /* a part behind another: a dark contour where the front part stands beside or below it, and only its shadow
       where the front part hangs over it from above (hair over a brow, a tunic over the legs) */
    const G = buf.group[u], before = (i, j) => lay(i, j) > L && grp(i, j) !== G;
    if (before(x - 1, y) || before(x + 1, y) || before(x, y + 1)) { put(u, ink(R[4], OUTLINE, INK.contour)); continue; }
    if (cel[v]) { put(u, R[buf.crease[u] || overhung ? 3 : 1]); continue; }
    if (buf.line ? buf.line[u] : buf.crease[u]) { put(u, ink(R[4], OUTLINE, INK.crease)); continue; }
    /* within one piece, where this material ends against another below it or to its right (the shadow sides),
       its last pixel is inked; a run only one pixel deep (a belt, a trim) is left alone so it keeps its colour */
    const piece = (i, j) => ok(i, j) && (lay(i, j) === L || grp(i, j) === G), other = (i, j) => piece(i, j) && m(i, j) !== v && !flat[m(i, j)];
    if (!clean[v] && ((other(x, y + 1) && m(x, y - up) === v) || (other(x + 1, y) && m(x - up, y) === v))) { put(u, ink(R[4], OUTLINE, INK.edge)); continue; }
    if (overhung) tone = Math.max(tone, 3);
    put(u, R[tone]);
  }
  /* the selective outline */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ok(x, y)) continue;
    /* the part in front decides the colour; an outline above or left of the figure faces the light */
    let i = -1, j = -1, lit = true;
    for (let n = 0; n < 4; n++) {
      const a = x + (n === 0 ? 1 : n === 2 ? -1 : 0), b = y + (n === 1 ? 1 : n === 3 ? -1 : 0);
      if (!ok(a, b)) continue;
      if (n >= 2) lit = false;
      if (i < 0 || lay(a, b) > lay(i, j)) { i = a; j = b; }
    }
    if (i < 0) continue;
    const v = m(i, j), base = flat[v] ? ink(flat[v], OUTLINE, 0.5) : ramps[v][4];
    put(y * W + x, ink(base, OUTLINE, lit ? INK.outlineLit : INK.outline));
  }
  return rgba;
}

/* [x, y, letter] cells to a stampable part (the smallest grid holding them; later cells win) */
function cellsToPart(cells) {
  if (!cells.length) return null;
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]), x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x + 1, h = Math.max(...ys) - y + 1, g = Array.from({ length: h }, () => Array(w).fill('.'));
  for (const [cx, cy, ch] of cells) g[cy - y][cx - x] = ch;
  return { x, y, rows: g.map(r => r.join('')) };
}

export { FH, FW, H, OUTLINE, PAPER, UP, W, cellsToPart, finish, frameBuf, hexRgb, mixHex, ramp, rgbHex, rgbLch, stamp, upsample, wash };
