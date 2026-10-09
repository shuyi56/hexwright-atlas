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
/* the tiles' ink and paper (render/palette.js INK and VEL) */
const OUTLINE = '#2b2116', PAPER = '#f0e6cb';
/* how far each kind of line is pushed from its material's deepest tone to the outline ink */
const INK = { outline: 0.9, outlineLit: 0.78, outlineSkin: 0.72, contour: 0.6, edge: 0.48, crease: 0.3 };

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
/* clipped counts pixels that fell outside the frame, so a test can catch a part drawn off the edge */
const frameBuf = () => ({ mat: new Array(W * H).fill(null), crease: new Uint8Array(W * H), layer: new Int16Array(W * H).fill(-1), group: new Int16Array(W * H).fill(-1), clipped: 0 });
/* stamp a grid with its top-left at (x, y). Parts of one group (a head, its hair and its hat) meet without a
   contour between them. flip mirrors the grid itself. */
function stamp(buf, rows, x, y, layer, group = layer, flip = false) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[flip ? row.length - 1 - i : i]; if (ch === '.' || ch === ' ') continue;
      const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= W || Y >= H) { buf.clipped++; continue; }
      const u = Y * W + X, up = ch.toUpperCase(); buf.mat[u] = up; buf.crease[u] = ch !== up ? 1 : 0; buf.layer[u] = layer; buf.group[u] = group;
    }
  });
}

/* ---------- finishing: the light, the contours and the outline ---------- */
/* pal maps each material letter to a colour; to { flat: colour } for a mark that takes no light (an eye); or to
   { ramp: colour, clean, cel } where clean means never inked at its edges (skin, so a face stays clean and the hair
   or brim against it carries the line) and cel means shaded as solid shapes: uppercase one flat lit tone, lowercase
   one shadow tone, plus a shadow band wherever another part of the same piece hangs over it (a fringe, a brim) */
function finish(buf, pal) {
  const ramps = {}, flat = {}, clean = {}, cel = {};
  for (const [k, v] of Object.entries(pal)) {
    if (typeof v === 'string') ramps[k] = ramp(wash(v)); else if (v.flat) flat[k] = wash(v.flat); else { ramps[k] = ramp(wash(v.ramp)); clean[k] = !!v.clean; cel[k] = !!v.cel; }
  }
  const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && buf.mat[y * W + x] !== null;
  const m = (x, y) => (ok(x, y) ? buf.mat[y * W + x] : null), lay = (x, y) => (ok(x, y) ? buf.layer[y * W + x] : -1), grp = (x, y) => (ok(x, y) ? buf.group[y * W + x] : -1);
  /* each layer's row span, for the turn of the whole figure */
  const span = new Map(); const key = (l, y) => l * H + y;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ok(x, y)) { const k = key(lay(x, y), y), s = span.get(k); if (!s) span.set(k, [x, x]); else s[1] = x; }
  const rgba = new Uint8ClampedArray(W * H * 4), put = (u, hex) => { const c = hexRgb(hex); rgba.set([c[0], c[1], c[2], 255], u * 4); };
  const turn = t => (t < 0.22 ? 0.85 : t < 0.48 ? 0.35 : t < 0.72 ? -0.25 : -0.8);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = y * W + x, v = buf.mat[u]; if (v === null) continue;
    if (flat[v]) { put(u, flat[v]); continue; }
    const R = ramps[v]; if (!R) throw new Error(`no colour for material "${v}"`);
    const L = buf.layer[u], same = (i, j) => m(i, j) === v && lay(i, j) === L;
    let a = x, b = x; while (same(a - 1, y)) a--; while (same(b + 1, y)) b++;
    const [s0, s1] = span.get(key(L, y)), run = b - a + 1, body = s1 - s0 + 1;
    let light = (run >= 3 ? 0.45 * turn((x - a) / (run - 1)) : 0) + (body >= 3 ? 0.6 * turn((x - s0) / (body - 1)) : 0);
    if (!ok(x, y - 1)) light += 0.7; else if (m(x, y - 1) !== v && lay(x, y - 1) <= L) light -= 0.55;
    if (!ok(x, y + 1) || m(x, y + 1) !== v) light -= 0.3;
    if (!ok(x - 1, y)) light += 0.3;
    if (!ok(x + 1, y)) light -= 0.45;
    let tone = Math.max(0, Math.min(4, Math.round(2 - light)));
    /* a part behind another: a dark contour where the front part stands beside or below it, and only its shadow
       where the front part hangs over it from above (hair over a brow, a tunic over the legs) */
    const G = buf.group[u]; if ([[x - 1, y], [x + 1, y], [x, y + 1]].some(([i, j]) => lay(i, j) > L && grp(i, j) !== G)) { put(u, mixHex(R[4], OUTLINE, INK.contour)); continue; }
    if (cel[v]) { put(u, R[buf.crease[u] || lay(x, y - 1) > L || lay(x - 1, y - 1) > L ? 3 : 1]); continue; }
    if (buf.crease[u]) { put(u, mixHex(R[4], OUTLINE, INK.crease)); continue; }
    /* within one piece, where this material ends against another below it or to its right (the shadow sides),
       its last pixel is inked; a run only one pixel deep (a belt, a trim) is left alone so it keeps its colour */
    const piece = (i, j) => ok(i, j) && (lay(i, j) === L || grp(i, j) === G), other = (i, j) => piece(i, j) && m(i, j) !== v && !flat[m(i, j)];
    if (!clean[v] && ((other(x, y + 1) && m(x, y - 1) === v) || (other(x + 1, y) && m(x - 1, y) === v))) { put(u, mixHex(R[4], OUTLINE, INK.edge)); continue; }
    if (lay(x, y - 1) > L || lay(x - 1, y - 1) > L) tone = Math.max(tone, 3);
    put(u, R[tone]);
  }
  /* the selective outline */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ok(x, y)) continue;
    const nb = [[x + 1, y, 1], [x, y + 1, 1], [x - 1, y, 0], [x, y - 1, 0]].filter(([i, j]) => ok(i, j)); if (!nb.length) continue;
    /* the part in front decides the colour; an outline above or left of the figure faces the light */
    const [i, j] = nb.reduce((p, q) => (lay(q[0], q[1]) > lay(p[0], p[1]) ? q : p)), lit = nb.every(n => n[2] === 1);
    const v = m(i, j), base = flat[v] ? mixHex(flat[v], OUTLINE, 0.5) : ramps[v][4];
    /* round bare skin (a clean material: a face, a hand) the ink is softer and warmer, a deep shade of the skin
       rather than the full umber, so pale skin does not ring the figure in a hard dark line */
    put(y * W + x, mixHex(base, OUTLINE, clean[v] ? INK.outlineSkin : lit ? INK.outlineLit : INK.outline));
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

/* A frame's figure drawn smaller, about the point between its feet (cx, the row under its soles), before it is
   finished: each new pixel takes the material (with its crease, layer and group) that covers most of the area it
   samples, so the outline, the light and the contours are worked out afresh at the new size rather than blurred.
   The eyes are not averaged: a 2×2 eye would smear into the brow over it and the two would come out unequal.
   They shrink as the skin under them, and each is then copied whole, pupil and glint as drawn, to where its
   corner lands on the smaller face, a clear gap of skin kept between the two and either side of each. The
   mouth lands as a single pixel. */
const WEIGHT = { N: 3, J: 1.5 };
const EYE = new Set(['E', 'W']);
function shrink(buf, s, cx, foot) {
  const out = frameBuf(), mat = buf.mat.slice();
  /* the eyes, their whites, the brow right over them and the mouth vote as skin */
  const brow = u => buf.mat[u] === 'Q' && (buf.mat[u + W] === 'E' || buf.mat[u + W] === 'W');
  for (let u = 0; u < W * H; u++) if (EYE.has(buf.mat[u]) || buf.mat[u] === 'M' || brow(u)) mat[u] = 'K';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X0 = cx + (x - cx) / s, X1 = cx + (x + 1 - cx) / s, Y0 = foot + (y - foot) / s, Y1 = foot + (y + 1 - foot) / s, area = (X1 - X0) * (Y1 - Y0);
    const votes = new Map(); let solid = 0;
    for (let j = Math.floor(Y0); j < Math.ceil(Y1); j++) for (let i = Math.floor(X0); i < Math.ceil(X1); i++) {
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const u = j * W + i, m = mat[u]; if (m === null) continue;
      const a = (Math.min(X1, i + 1) - Math.max(X0, i)) * (Math.min(Y1, j + 1) - Math.max(Y0, j)); if (a <= 0) continue;
      solid += a;
      const key = m + buf.crease[u] + '|' + buf.layer[u], w = a * (WEIGHT[m] || 1) * (1 + buf.layer[u] * 0.015) * (buf.crease[u] ? 1.15 : 1), v = votes.get(key);
      if (v) v.w += w; else votes.set(key, { w, u, m });
    }
    if (solid < area * 0.42) continue;
    let best = null; for (const v of votes.values()) if (!best || v.w > best.w) best = v;
    const o = y * W + x; out.mat[o] = best.m; out.crease[o] = buf.crease[best.u]; out.layer[o] = buf.layer[best.u]; out.group[o] = buf.group[best.u];
  }
  /* each eye: its pixels (pupil and white) found as one piece and copied whole to its scaled corner */
  const seen = new Uint8Array(W * H), scale = (v, c) => Math.round(c + (v - c) * s), eyes = [];
  for (let u = 0; u < W * H; u++) {
    if (!EYE.has(buf.mat[u]) || seen[u]) continue;
    const cells = [], stack = [u]; seen[u] = 1;
    while (stack.length) { const v = stack.pop(); cells.push(v); for (const d of [-1, 1, -W, W]) { const q = v + d; if (q >= 0 && q < W * H && !seen[q] && EYE.has(buf.mat[q]) && Math.abs((q % W) - (v % W)) <= 1) { seen[q] = 1; stack.push(q); } } }
    const x0 = Math.min(...cells.map(v => v % W)), y0 = Math.min(...cells.map(v => (v / W) | 0));
    eyes.push({ cells, x0, y0, x: scale(x0, cx), y: scale(y0, foot), w: Math.max(...cells.map(v => v % W)) - x0 + 1 });
  }
  eyes.sort((a, b) => a.x - b.x);
  /* keep a column of skin between the eyes */
  for (let k = 1; k < eyes.length; k++) { const p = eyes[k - 1], e = eyes[k]; if (e.x < p.x + p.w + 1) e.x = p.x + p.w + 1; }
  for (const e of eyes) {
    /* an eye that lands against the edge of the face moves a pixel inward */
    const skin = (i, j) => out.mat[j * W + i] === 'K';
    if (!skin(e.x - 1, e.y + 1) && skin(e.x + e.w, e.y + 1) && skin(e.x + e.w + 1, e.y + 1)) e.x++;
    for (const v of e.cells) {
      const o = (e.y + ((v / W) | 0) - e.y0) * W + e.x + (v % W) - e.x0;
      if (o >= 0 && o < W * H && out.mat[o]) { out.mat[o] = buf.mat[v]; out.crease[o] = 0; out.layer[o] = buf.layer[v]; out.group[o] = buf.group[v]; }
    }
  }
  /* the mouth as one pixel where its middle lands */
  const mouth = []; for (let u = 0; u < W * H; u++) if (buf.mat[u] === 'M') mouth.push(u);
  if (mouth.length) {
    const mx = mouth.reduce((a, v) => a + (v % W), 0) / mouth.length, my = mouth.reduce((a, v) => a + ((v / W) | 0), 0) / mouth.length;
    const o = scale(Math.round(my), foot) * W + scale(Math.round(mx), cx), u = mouth[0];
    if (out.mat[o]) { out.mat[o] = 'M'; out.crease[o] = 0; out.layer[o] = buf.layer[u]; out.group[o] = buf.group[u]; }
  }
  return out;
}

export { H, OUTLINE, PAPER, W, cellsToPart, finish, frameBuf, hexRgb, mixHex, ramp, rgbHex, rgbLch, shrink, stamp, wash };
