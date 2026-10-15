import { OUTLINE, hexRgb, mixHex, ramp } from '../characters/pixels.js';
import { ASSET_BY_ID, footprint, standsOnWall } from '../tiles/index.js';
import { TREE } from '../render/palette.js';
import { elvenTown } from './elven.js';
import { TILE } from './ground.js';

/* ================= town view: the pieces =================
   Every building, prop, plant and piece of furniture redrawn for the town camera: seen from the south and above,
   front walls square to the screen under roofs that lean back over them, as the houses of the old town-walking
   RPGs are. Each is pixel art in a handful of tones from its tile-set colours, inked round its edge, with a
   shadow on the ground to its east (the light comes from the upper left). A sprite is drawn about its footprint:
   (ox, oy) in the sprite is the footprint's north-west corner on the ground, and everything rises from there.
   Front walls carry the door when the piece faces south, east or west; turned away, the front shows windows.
   No DOM. */
/* The town's tiles are three times as wide as the tile set's 32, about six figures across, so a house stands
   well over the people walking past it: a cottage's door a little taller than a figure, its wall half as tall
   again, its roof above. Towers are drawn three times as wide (RS) and walls a little over twice as tall (HS). A
   house keeps inside its own footprint, front wall below and roof above, so a row of houses never covers the
   fronts of the row behind; only towers, keeps and spires stand up over the tiles north of them. Props, plants
   and furniture keep the figures' scale (drawn at 32, small buildings at 64) and stand in the middle of their
   tiles. */
const HS = 2.1, RS = TILE / 32;
const T = TILE, INK = hexRgb(OUTLINE), SHADOW = [43, 33, 22, 72];
const ramps = new Map();
const R = hex => { let r = ramps.get(hex); if (!r) { r = ramp(hex).map(hexRgb); ramps.set(hex, r); } return r; };
const h2 = (x, y, s = 0) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s + 0x9e37, 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const vnoise_ = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, a = h2(xi, yi, 31), b = h2(xi + 1, yi, 31), c = h2(xi, yi + 1, 31), d = h2(xi + 1, yi + 1, 31); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const inked = (c, k = 0.5) => mix(c, INK, k);

/* ---------- the raster kit ---------- */
/* a sprite for a footprint FW × FD art pixels with room `up` above it and `side` either side; drawing is in
   footprint coordinates, (0, 0) its north-west corner on the ground, y negative upward */
function kit(FW, FD, up, side = 16) {
  const w = FW + 2 * side, h = up + FD + 4, px = new Uint8ClampedArray(w * h * 4), ox = side, oy = up;
  const idx = (x, y) => { x = Math.floor(x) + ox; y = Math.floor(y) + oy; return x < 0 || y < 0 || x >= w || y >= h ? -1 : (y * w + x) * 4; };
  const K = {
    FW, FD, w, h, px, ox, oy,
    set(x, y, c, a = 255) { const i = idx(x, y); if (i < 0 || !c) return; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = a; },
    get(x, y) { const i = idx(x, y); return i < 0 ? 0 : px[i + 3]; },
    /* darken what is already drawn at (x, y) toward the ink by k: a cast shadow on whatever lies there */
    shade(x, y, k) { const i = idx(x, y); if (i < 0 || px[i + 3] !== 255) return; px[i] += (INK[0] - px[i]) * k; px[i + 1] += (INK[1] - px[i + 1]) * k; px[i + 2] += (INK[2] - px[i + 2]) * k; },
    /* fill [x0, x1) × [y0, y1); c is a colour or fn(x, y) giving one (or null to skip) */
    rect(x0, y0, x1, y1, c) { for (let y = Math.ceil(y0); y < y1; y++) for (let x = Math.ceil(x0); x < x1; x++) K.set(x, y, typeof c === 'function' ? c(x, y) : c); },
    poly(pts, c) {
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
        let inside = false; const X = x + 0.5, Y = y + 0.5;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > Y) !== (yj > Y) && X < (xj - xi) * (Y - yi) / (yj - yi) + xi) inside = !inside; }
        if (inside) K.set(x, y, typeof c === 'function' ? c(x, y) : c);
      }
    },
    /* an ellipse; c(x, y, dx, dy) gets the offset from the centre in radii */
    oval(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) K.set(x, y, typeof c === 'function' ? c(x, y, dx, dy) : c);
      }
    },
    line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) K.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); },
    /* a lit sphere-ish mass: ramp tones by where the light (upper left) falls */
    mass(cx, cy, rx, ry, P, s = 0) {
      K.oval(cx, cy, rx, ry, (x, y, dx, dy) => { const l = dx * 0.6 + dy * 0.8 + (h2(x, y, s) - 0.5) * 0.5; return P[l < -0.55 ? 0 : l < -0.1 ? 1 : l < 0.45 ? 2 : 3]; });
    },
    /* an oblique box: footprint [x0, x1) × [y0, y1) on the ground, h high; top and front are colours or fns */
    box(x0, y0, x1, y1, h, top, front) { K.rect(x0, y1 - h, x1, y1, front); K.rect(x0, y0 - h, x1, y1 - h, top); },
    /* a soft edge for foliage: the rim pixels turn a little translucent (a touch darker on the shaded underside and
       east), and a faint halo of their colour lies just outside them, so a crown's edge blends into whatever ground
       it stands over instead of being cut out against it */
    softEdge(rim = 210, glow = 80) {
      const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[(y * w + x) * 4 + 3]), edge = [], halo = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (A(x, y) !== 255) continue;
        const lo = A(x, y + 1) === 0 || A(x + 1, y) === 0, hi = A(x, y - 1) === 0 || A(x - 1, y) === 0; if (!lo && !hi) continue;
        const i = (y * w + x) * 4; edge.push([i, lo ? 0.2 : 0.05]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (A(x + dx, y + dy) === 0) { const j = ((y + dy) * w + x + dx) * 4; if (!halo.has(j)) halo.set(j, [px[i], px[i + 1], px[i + 2], dy > 0 || dx > 0]); }
      }
      for (const [i, k] of edge) { px[i] += (INK[0] - px[i]) * k; px[i + 1] += (INK[1] - px[i + 1]) * k; px[i + 2] += (INK[2] - px[i + 2]) * k; px[i + 3] = rim; }
      for (const [j, [r, g, b, lo]] of halo) { const k = lo ? 0.35 : 0.15; px[j] = r + (INK[0] - r) * k; px[j + 1] = g + (INK[1] - g) * k; px[j + 2] = b + (INK[2] - b) * k; px[j + 3] = glow; }
    },
    /* ink every opaque pixel that touches a clear one */
    /* skip(x, y), in drawing coordinates, spares the pixels it is true for (the ends of a wall where it joins the next) */
    outline(k = 0.75, skip = null) {
      const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] === 255, edge = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) && !(skip && skip(x - ox, y - oy))) edge.push((y * w + x) * 4);
      for (const i of edge) { px[i] += (INK[0] - px[i]) * k; px[i + 1] += (INK[1] - px[i + 1]) * k; px[i + 2] += (INK[2] - px[i + 2]) * k; }
    },
    /* the shadow on the ground: east of the rows [y0, y1), reaching len pixels past x1, under nothing drawn */
    shadow(x0, y0, x1, y1, len) {
      /* only along the front part of the footprint, tapering off toward the back */
      const from = Math.max(y0, y1 - Math.max(14, (y1 - y0) * 0.55));
      for (let y = Math.ceil(from); y < y1; y++) { const reach = x1 + len * Math.min(1, (y - from + 2) / 8); for (let x = Math.ceil(x0); x < reach; x++) { const i = idx(x, y); if (i >= 0 && !px[i + 3]) { px[i] = SHADOW[0]; px[i + 1] = SHADOW[1]; px[i + 2] = SHADOW[2]; px[i + 3] = SHADOW[3]; } } }
    },
    ovalShadow(cx, cy, rx, ry) {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, i = idx(x, y); if (dx * dx + dy * dy > 1 || i < 0 || px[i + 3]) continue;
        px[i] = SHADOW[0]; px[i + 1] = SHADOW[1]; px[i + 2] = SHADOW[2]; px[i + 3] = SHADOW[3];
      }
    }
  };
  return K;
}

/* ---------- surfaces ---------- */
const ROOF = {
  thatch: '#c9a463', tiles: '#a6533b', slate: '#6d7a86', shingle: '#7d6a55', copper: '#6f9c86', felt: '#cbb894', lead: '#8a8f90', indigo: '#5e5c80'
};
function roofTone(tex, P, u, v, plane = 0) {
  /* u runs along the eave, v up the slope from it; courses sized for the town's big houses */
  let t;
  if (tex === 'thatch') { const row = Math.floor(v / 5), m = v % 5; t = m === 4 ? 3 : h2(u, row, 3) < 0.26 ? 3 : h2(u, row, 4) < 0.2 ? 1 : 2; if (m === 0 && h2(u, row, 5) < 0.4) t = 1; }
  else if (tex === 'tiles') {
    /* curved clay tiles: each course casts a shadow on the one below where it overlaps; across a tile, a dark gap,
       then its lit rounded crest, then the body turning away; some tiles fired a shade darker or paler */
    const row = Math.floor(v / 6), m = v % 6, uu = u + (row % 2) * 3, c = ((uu % 6) + 6) % 6, tile = Math.floor(uu / 6), vary = h2(tile, row, 13);
    if (m === 0) t = 4; else if (m === 1) t = c === 0 ? 4 : 3;
    else { t = c === 0 ? 4 : c === 1 ? 1 : c === 2 ? (m === 5 ? 0 : 1) : c === 5 ? 3 : 2; if (vary < 0.18 && t > 0 && t < 4) t++; else if (vary > 0.88 && t > 1) t--; }
  }
  else if (tex === 'slate' || tex === 'lead' || tex === 'indigo') { const row = Math.floor(v / 4), m = v % 4, c = ((u + (row % 2) * 4) % 8 + 8) % 8; t = m === 0 ? 4 : c === 0 ? 3 : h2(Math.floor((u + (row % 2) * 4) / 8), row, 7) < 0.25 ? 1 : 2; }
  else if (tex === 'shingle') { const row = Math.floor(v / 4), m = v % 4, c = ((u + Math.floor(h2(row, 1) * 6)) % 6 + 6) % 6; t = m === 0 ? 4 : c === 0 ? 3 : 2; }
  else if (tex === 'copper') { t = ((u % 8) + 8) % 8 === 0 ? 3 : v % 9 === 0 ? 1 : 2; }
  else { t = v % 6 === 0 ? 3 : 2; }
  return P[Math.max(0, Math.min(4, t + plane))];
}
const WALL = {
  plaster: '#efe3c4', cream: '#e9d6ae', ochre: '#e6cfa6', rose: '#e9c4b2', stone: '#d8cfb9', grey: '#c4bcab', planks: '#9a7650', barn: '#a4553b', logs: '#8e6a44', white: '#f2ece0', felt: '#d9c9a0', adobe: '#d7b48a', lilac: '#e6dde6'
};
const TIMBER = R('#76553a');
function wallTone(tex, P, x, y, wx0, wx1, floorH, top) {
  if (tex === 'stone' || tex === 'grey') { const row = Math.floor(y / 5), m = ((y % 5) + 5) % 5, c = ((x + (row % 2) * 4) % 8 + 8) % 8; return P[m === 4 ? 4 : c === 0 ? 3 : m === 0 ? 1 : h2(Math.floor((x + (row % 2) * 4) / 8), row, 9) < 0.25 ? 3 : 2]; }
  if (tex === 'planks' || tex === 'barn') { const c = ((x % 4) + 4) % 4; return P[c === 0 ? 4 : c === 1 ? 1 : h2(Math.floor(x / 4), Math.floor(y / 14), 3) < 0.3 ? 3 : 2]; }
  if (tex === 'logs') { const m = ((y % 4) + 4) % 4; return P[m === 0 ? 1 : m === 3 ? 4 : 2]; }
  if (tex === 'timber') {
    /* Plaster panels set back in a timber frame: a post at the west end and every 15 pixels, a rail at each floor, a
       brace in the end panels. The beams are three pixels thick and stand proud of the wall: lit along their top and
       west edges, dark along their undersides and east edges, wood grain running along them; each casts a shadow two
       pixels deep on the plaster below and to its east, so the panels read as recessed. The plaster is lime-washed,
       mottled, with the odd fleck. The east end is left to the corner and the shaded east wall. */
    const lx = x - wx0, ly = y - top, fl = ((ly % floorH) + floorH) % floorH, n = Math.max(1, Math.round((wx1 - wx0) / 15)), pw = (wx1 - wx0) / n, px = ((lx % pw) + pw) % pw;
    const endEast = lx >= wx1 - wx0 - 3, B = 3;
    const grain = (a, b) => { const g = h2(Math.floor(a / 4), b, 21); return g < 0.25 ? 3 : g > 0.85 ? 1 : 2; };
    /* the rails */
    if (fl < B) return fl === 0 ? TIMBER[0] : fl === 1 ? TIMBER[grain(x, Math.floor(ly / floorH))] : TIMBER[4];
    /* the posts */
    if (px < B && !endEast) return px < 1 ? TIMBER[1] : px < 2 ? TIMBER[grain(y, Math.floor(lx / pw) + 50)] : TIMBER[4];
    /* The braces, in the end panels: rising from the foot of the end post toward the next one at a clean pitch (one
       up for one across, or two up for one across in a tall panel) so the steps along them repeat evenly. Measured
       in rows above the brace's lower edge (e), it is three rows thick: lit on top, dark below. */
    const panel = Math.floor(lx / pw), slope = floorH - B > 1.6 * (pw - B) ? 2 : 1, inEnd = panel === 0 || (panel === n - 1 && n > 1);
    const run = panel === 0 ? Math.floor(px) - B : Math.floor(pw) - 1 - Math.floor(px), e = inEnd ? (floorH - 1 - fl) - run * slope : 99;
    if (run >= 0 && e >= 0 && e < 3 * slope) return e >= 3 * slope - slope ? TIMBER[1] : e < slope ? TIMBER[4] : TIMBER[2];
    const sd = run >= 0 && e < 0 && e >= -2 * slope ? -e : 0;
    /* shadow cast on the plaster below a rail, east of a post, east of a brace */
    if (fl < B + 2) return fl === B ? P[4] : P[3];
    if (px < B + 2 && !endEast) return px < B + 1 ? P[4] : P[3];
    if (sd) return sd <= slope ? P[4] : P[3];
    /* lime-washed plaster */
    const m = vnoise_(x / 6, y / 6) * 0.7 + vnoise_(x / 2.5, y / 2.5) * 0.3, f = h2(x, y, 5);
    return f < 0.03 ? P[3] : m > 0.66 ? P[1] : m < 0.3 ? mix(P[2], P[3], 0.45) : P[2];
  }
  return P[h2(x, y, 5) < 0.07 ? 3 : h2(x, y, 6) < 0.04 ? 1 : 2];
}
/* a window set into the wall: a lintel over it, a frame, glass shadowed under the lintel with a glint, glazing bars,
   a sill that stands out with its shadow below, and shutters if asked */
/* A window set into the wall, lit from the upper left. A lintel over it; a frame lit along its top and west edges
   and dark along its bottom and east; the glass set back, so the reveal shades it along its top and west edge;
   glazing bars, each casting a hairline shadow on the glass; a reflection of the sky streaking the upper panes (or,
   lit from within, a warm glow); a sill that stands out from the wall with its shadow on the wall below; and
   shutters of boards, each throwing a thin shadow on the wall to its east. */
function windowAt(K, x, y, w = 6, h = 7, opts = {}) {
  const F = R(opts.frame || '#efe6d0'), G = R(opts.glass || '#3b4a5a'), S = opts.shutter ? R(opts.shutter) : null, lit = opts.lit ? R('#f2c25a') : null;
  const mx = x + Math.floor(w / 2), my = y + Math.floor(h / 2), bars = w > 5, cross = h > 7;
  if (S) for (const sx of [x - 4, x + w + 1]) {
    K.rect(sx, y, sx + 3, y + h, (px, py) => (px === sx ? S[1] : px === sx + 2 ? S[3] : (py - y) === Math.floor(h / 2) ? S[3] : S[2]));
    for (let py = y + 1; py <= y + h; py++) K.shade(sx + 3, py, 0.28);
  }
  /* the lintel, standing a little proud, with its shadow on the frame below */
  K.rect(x - 1, y - 2, x + w + 1, y - 1, F[1]);
  if (opts.arch) K.oval(x + w / 2, y - 1, w / 2 + 1, 2.5, (px, py) => (py < y - 1 ? F[1] : null));
  /* the frame */
  K.rect(x, y - 1, x + w, y + h, (px, py) => (py === y - 1 ? F[2] : px === x ? F[1] : px === x + w - 1 ? F[3] : F[2]));
  /* the glass, set back */
  K.rect(x + 1, y, x + w - 1, y + h - 1, (px, py) => {
    const dy = py - y, dx = px - x - 1;
    if (lit) { if (dy < 1 || dx < 1) return lit[3]; return lit[dy < h * 0.45 ? 0 : 1]; }
    if (dy < 2 || dx < 1) return G[4];                                     /* the reveal's shadow */
    if (bars && (px === mx + 1 || (cross && py === my + 1))) return G[4];   /* bar shadows */
    const pane = (px > mx ? 1 : 0) + (cross && py > my ? 2 : 0), d = dx - dy;
    if ((pane === 0 || pane === 1) && (d === 2 || d === 3) && dy < h * 0.6) return d === 2 ? G[0] : G[1];   /* the sky's reflection */
    return G[dy < h * 0.5 ? 2 : 3];
  });
  if (bars) K.rect(mx, y, mx + 1, y + h - 1, F[2]);
  if (cross) K.rect(x + 1, my, x + w - 1, my + 1, F[2]);
  /* the sill, standing out, and its shadow on the wall */
  K.rect(x - 1, y + h - 1, x + w + 1, y + h, F[0]);
  for (let px = x; px <= x + w + 1; px++) K.shade(px, y + h, 0.3);
}
/* a door in its frame: stone or timber surround with a lintel, the door set back into it (shadowed along its top and
   left), boards with a rail across and iron straps, a ring handle, and a step on the ground in front */
function doorAt(K, cx, yb, w = 12, h = 20, opts = {}) {
  const D = R(opts.col || '#7a5a3a'), F = R(opts.frame || (opts.arch ? '#c4b99f' : '#6e5236')), I = R('#3b3a38'), x0 = Math.round(cx - w / 2), x1 = x0 + w, y0 = yb - h;
  /* the surround */
  K.rect(x0 - 2, y0 - 2, x1 + 2, yb, (x, y) => (y < y0 ? F[y === y0 - 2 ? 1 : 2] : x < x0 ? F[x === x0 - 2 ? 1 : 2] : F[3]));
  if (opts.arch) K.oval(cx, y0, w / 2 + 2, 4, (x, y) => (y <= y0 ? F[1] : null));
  if (opts.open) { K.rect(x0, y0, x1, yb, (x, y) => R('#2a2018')[y < y0 + 3 ? 4 : 3]); if (opts.arch) K.oval(cx, y0, w / 2, 3, (x, y) => (y <= y0 ? R('#2a2018')[4] : null)); }
  else {
    K.rect(x0, y0, x1, yb, (x, y) => {
      if (y === y0 || x === x0) return D[4];                 /* set back: in shadow under the lintel and the jamb */
      const bx = (x - x0) % 4; let c = bx === 0 ? D[3] : bx === 1 ? D[1] : D[2];
      if (y === Math.round(y0 + h * 0.3) || y === Math.round(y0 + h * 0.72)) c = I[x === x0 + 1 ? 1 : 2];   /* iron straps */
      return c;
    });
    if (opts.arch) K.oval(cx, y0, w / 2, 3, (x, y) => (y < y0 ? D[3] : null));
    const hx = x1 - 3, hy = Math.round(y0 + h * 0.55); K.set(hx, hy, R('#c9a24f')[0]); K.set(hx, hy + 1, R('#c9a24f')[2]); K.set(hx - 1, hy + 1, R('#c9a24f')[3]);
  }
  /* the step, standing out on the ground */
  const St = R('#c4b99f'); K.rect(x0 - 3, yb, x1 + 3, yb + 3, (x, y) => (y === yb ? St[0] : x === x1 + 2 ? St[3] : St[2]));
}
/* A chimney stack standing h above the roof at (x, y): pale coursed stone like the walls, lit on its west face and
   shaded on its east, under a cap that overhangs by a pixel with the flue a dark slot in it; a faint shadow beside it
   on the roof; and if lit, smoke rising and drifting east, thinning as it goes. */
function chimney(K, x, y, h, smoke, w = 7, puff = '#ece9e2') {
  const C = R('#bfb196'), top = y - h;
  K.rect(x + w, top + 3, x + w + 2, y, (px, py) => (K.get(px, py) ? mix(C[4], INK, 0.35) : null));
  K.rect(x, top, x + w, y, (px, py) => {
    const face = px === x ? 1 : px >= x + w - 2 ? 3 : 2, row = Math.floor((py - top) / 4), m = (py - top) % 4, joint = m === 3 || ((px - x + (row % 2) * 3) % 6 + 6) % 6 === 0;
    return joint && face < 3 ? C[face + 1] : C[face];
  });
  K.rect(x - 1, top - 2, x + w + 1, top, (px, py) => (py === top - 2 ? C[0] : px === x + w ? C[3] : C[1]));
  K.rect(x + 2, top - 2, x + w - 2, top - 1, C[4]);
  if (smoke) {
    /* puff: one colour, or a colour for each puff (the alchemist's coloured fumes) */
    const P = [].concat(puff);
    /* translucent (never inked: the outline only touches opaque pixels), lit on top, thinning as it rises */
    [[0, -6, 3.5, 225], [3, -13, 4.5, 185], [7, -21, 5.5, 140], [12, -30, 6, 95]].forEach(([dx, dy, r, a], i) => {
      const cx = x + w / 2 + dx, cy = top + dy, Sm = R(P[i % P.length]);
      for (let py = Math.floor(cy - r); py <= cy + r; py++) for (let px = Math.floor(cx - r); px <= cx + r; px++) {
        const ex = (px + 0.5 - cx) / r, ey = (py + 0.5 - cy) / (r * 0.8); if (ex * ex + ey * ey > 1 || K.get(px, py) === 255) continue;
        K.set(px, py, Sm[ex + ey < -0.4 ? 0 : ex + ey < 0.5 ? 1 : 2], a);
      }
    });
  }
}

/* ---------- buildings ---------- */
/* A house: a front wall wallH high across the footprint, under a roof. Wider than deep (or square), the ridge runs
   east-west and the roof's south slope covers the top; deeper than wide, the ridge runs north-south and the
   front shows the gable end. */
/* Window positions across a wall from a to b, ww wide: symmetric about the middle, leaving the door's place (cx,
   width dw) clear when there is a door on this floor */
function windowSlots(a, b, ww, door, cx, dw) {
  const gap = 16, out = [];
  if (!door) { const n = Math.max(1, Math.floor((b - a - 8) / (ww + gap))); for (let k = 0; k < n; k++) out.push(Math.round(a + (b - a) * (k + 0.5) / n - ww / 2)); return out; }
  const left = cx - dw / 2 - 3 - a, n = Math.max(left >= ww + 4 ? 1 : 0, Math.floor((left - 4) / (ww + gap)));
  for (let k = 0; k < n; k++) { const off = dw / 2 + 3 + (left - 2) * (k + 0.5) / n; out.push(Math.round(cx - off - ww / 2), Math.round(cx + off - ww / 2)); }
  return out;
}
/* A house, seen from the south and a little east: its front wall across the footprint and its east wall receding
   beside it in shade, on a stone plinth, under a roof with a fascia board along the eave. Wider than deep (or
   square), the ridge runs east-west and the roof's south slope covers the top; deeper than wide, the ridge runs
   north-south and the front shows the gable end. It keeps inside its footprint. */
function house(K, o, p) {
  const { FW, FD } = K, ins = p.inset ?? 4, x0 = ins, x1 = FW - ins, yb = FD - 5 - Math.round((p.lift || 0) * HS);
  /* The roof keeps its own proportion: on a house standing broadside its slope shows about four tenths of the
     footprint's depth (steeper for thatch, lower for a hipped roof), so a cottage and a townhouse carry roofs of one
     pitch; a two-storey house on a single tile takes a lower pitch, as a townhouse does, so both its storeys keep
     their full height. The wall takes what it needs below it, and anything left over at the back of the footprint is
     ground. */
  const tall = (p.floors || 1) > 1 && FD <= T;   /* two storeys on one tile: a lower-pitched roof keeps both storeys full height */
  const roofH = Math.round(FD * (tall ? 0.29 : p.roof === 'thatch' ? 0.44 : p.hip ? 0.36 : 0.4));
  const wallH = Math.round(Math.min((p.wallH ?? 24) * HS, yb - roofH - 2));
  const Wl = R(WALL[p.wall] || p.wall || WALL.plaster), Rf = R(ROOF[p.roof] || p.roof), floors = p.floors || 1, top = yb - wallH, floorH = wallH / floors;
  const ov = p.overhang ?? 6, ridgeX = p.ridge ? p.ridge === 'x' : FW >= FD, door = p.door !== false && o.face !== 2;
  /* the east wall: a strip sw wide beside the front, turned away from the light */
  const sw = Math.max(4, Math.round((x1 - x0) * 0.09)), k = 0, xf = x1 - sw;
  const tex = (x, y) => wallTone(p.wallTex || p.wall, Wl, x, y, x0, xf, floorH, top);
  if (p.lift) for (const sx of [x0 + 2, xf - 6, x1 - 3]) K.rect(sx, yb, sx + 4, yb + Math.round(p.lift * HS) - (sx > xf ? k : 0), R('#c4b99f')[sx < FW / 2 ? 2 : 3]);
  /* walls: the east one in shade, then the front with a lit west corner and a dark east one */
  /* the east wall, turned from the light: plain in its shade (a timber frame shows only as the corner post), so the
     shading reads as depth */
  const sideTex = (p.wallTex || p.wall) === 'timber' ? (x, y) => (x >= x1 - 2 ? TIMBER[3] : Wl[h2(x, y, 5) < 0.06 ? 3 : 2]) : (x, y) => wallTone(p.wallTex || p.wall, Wl, x, y, xf, x1, floorH, top);
  K.poly([[xf, yb], [x1, yb - k], [x1, top], [xf, top]], (x, y) => mix(sideTex(x, y), INK, 0.32));
  K.rect(x0, top, xf, yb, tex);
  K.rect(x0, top, x0 + 1, yb, (x, y) => mix(tex(x, y), [255, 250, 235], 0.35));
  K.rect(xf - 1, top, xf, yb, (x, y) => mix(tex(x, y), INK, 0.3));
  /* the plinth along the foot of both walls */
  const Pl = R('#b5aa94');
  K.rect(x0, yb - 4, xf, yb, (x, y) => (y === yb - 4 ? Pl[1] : ((x + (y % 2) * 3) % 7 === 0 ? Pl[4] : Pl[2])));
  K.poly([[xf, yb], [x1, yb - k], [x1, yb - k - 4], [xf, yb - 4]], Pl[3]);
  const dx = p.doorX ?? (x0 + xf) / 2, doorW = Math.round((p.doorW || 10) * 1.6), doorH = Math.min(wallH - 8, Math.max(Math.round(floorH - 3), 27), Math.round((p.doorH || 16) * 2.1));
  if (p.windows !== false) {
    for (let f = 0; f < floors; f++) {
      const wh = Math.min(18, Math.round(floorH * 0.4)), wy = Math.round(top + floorH * (floors - 1 - f) + (floorH - wh) * (f ? 0.45 : 0.36)), ww = Math.round((p.winW || 6) * 2);
      for (const wx of windowSlots(x0 + 2, xf - 2, ww, door && f === 0, dx, doorW)) windowAt(K, wx, wy, ww, wh, { shutter: p.shutter, lit: p.lit, arch: p.arch, glass: p.glass });
    }
  }
  if (door) doorAt(K, dx, yb, doorW, doorH, { col: p.doorCol, arch: p.arch, open: p.open });
  if (ridgeX) {
    /* The roof over both walls: its south slope from a thick eave up to a capped ridge roofH above the wall, square
       along every edge, overhanging the walls, lighter toward the ridge where it faces the sky and darker toward the
       eave, its east end (over the east wall) in shade. */
    const eave = top + ov, l = x0 - ov, r = x1 + ov;
    let ridge = Math.max(1, eave - roofH - ov);
    /* a hipped roof's ends slope at 45°, so their steps repeat evenly; a short ridge brings the roof down to meet them */
    const hip = p.hip ? Math.min(eave - ridge, Math.floor((r - l) / 2) - 8) : 0; if (p.hip) ridge = eave - hip;
    const span = eave - ridge;
    const pts = p.hip ? [[l, eave], [l + hip, ridge], [r - hip, ridge], [r, eave]] : [[l, eave], [l, ridge], [r, ridge], [r, eave]];
    K.poly(pts, (x, y) => { const v = eave - y, band = v < 4 ? 1 : v > span * 0.66 ? -1 : 0; return roofTone(p.roof, Rf, x, v, band + (x >= xf + ov - 1 ? 1 : 0)) || Rf[1]; });
    /* the ridge cap: a row of capping tiles, lit along its top */
    const c0 = l + (p.hip ? hip : 0), c1 = r - (p.hip ? hip : 0);
    K.rect(c0, ridge, c1, ridge + 4, (x, y) => (y === ridge ? Rf[0] : y === ridge + 3 ? Rf[4] : (x - c0) % 7 === 0 ? Rf[3] : Rf[1]));
    if (!p.hip) { K.rect(l, ridge, l + 2, eave, (x) => Rf[x === l ? 3 : 1]); K.rect(r - 2, ridge, r, eave, (x) => (x === r - 1 ? inked(Rf[4], 0.4) : Rf[3])); }
    else { K.line(l, eave, l + hip, ridge, Rf[1]); K.line(r - 1, eave, r - 1 - hip, ridge, Rf[4]); }
    /* a thick eave: the fascia board lit along its top, its underside in shadow, and that shadow cast on the wall */
    K.rect(l, eave - 1, r, eave + 3, (x, y) => (y === eave - 1 ? Rf[0] : y <= eave ? Rf[2] : inked(Rf[4], 0.45)));
    K.rect(x0, eave + 3, xf, eave + 6, (x, y) => mix(tex(x, y), INK, y === eave + 3 ? 0.45 : 0.22));
    if (p.chimney) chimney(K, Math.round(x0 + (xf - x0) * 0.7), Math.round(ridge + span * 0.38), 12, p.chimney > 1);
    if (p.dormer && span > 24) for (const fx of [0.3, 0.7]) { const cx = Math.round(x0 + (xf - x0) * fx), cy = Math.round(ridge + span * 0.5); K.poly([[cx - 9, cy + 2], [cx, cy - 8], [cx + 9, cy + 2]], Rf[1]); K.rect(cx - 7, cy + 2, cx + 7, cy + 12, Wl[2]); windowAt(K, cx - 4, cy + 3, 8, 7, {}); }
    return { ridge, eave, top, yb, x0, x1: xf };
  }
  /* Ridge north-south: the gable end in front and the two slopes running back from it, drawn as parallelograms so
     the ridge, the eaves and the bargeboards all keep one pitch. The gable rises gh above the wall; at the back the
     ridge meets the top of the footprint and the eaves sit gh below it, as they do at the front. The east slope is
     in shade. */
  const cx = Math.round((x0 + xf) / 2), gh = cx - x0, apex = top - gh, back = 2, l = x0 - ov, r = x1 + ov;   /* a 45° gable: its steps run one across for one up */
  const slope = (x, side) => gh * (side ? r - x : x - l) / (side ? r - cx : cx - l);   /* how far the slope's top edge drops at x */
  K.poly([[l, back + gh], [cx, back], [cx, apex], [l, top + ov]], (x, y) => { const v = x - l, edge = y - back - (gh - slope(x, 0)); return roofTone(p.roof, Rf, y, v, edge < 2 ? -1 : 0) || Rf[1]; });
  K.poly([[cx, back], [r, back + gh], [r, top + ov], [cx, apex]], (x, y) => roofTone(p.roof, Rf, y, r - x, 1) || Rf[3]);
  /* the ridge cap down the middle, lit on its west side; the eaves along both sides */
  K.rect(cx - 2, back, cx, apex, Rf[0]); K.rect(cx, back, cx + 2, apex, Rf[4]);
  K.rect(l, back + gh, l + 1, top + ov, Rf[3]); K.rect(r - 1, back + gh, r, top + ov, inked(Rf[4], 0.4));
  /* the gable end: the wall carried up to the apex, with a window in it, under bargeboards that stand proud */
  K.poly([[x0, top + 1], [cx, apex + 1], [cx + (cx - x0), top + 1]], tex);
  if (gh > 18) windowAt(K, cx - 4, Math.round(apex + gh * 0.45), 8, Math.min(12, Math.round(gh * 0.3)), { arch: p.arch, glass: p.glass });
  for (let i = 0; i < 3; i++) {
    const c = i === 0 ? Rf[1] : i === 1 ? Rf[2] : inked(Rf[4], 0.45);
    K.line(l, top + ov + i, cx, apex + i, c); K.line(cx, apex + i, r - 1, top + ov + i, i === 0 ? Rf[2] : c);
  }
  K.rect(x0, top + 1, xf, top + 3, (x, y) => mix(tex(x, y), INK, 0.3));
  if (p.chimney) chimney(K, cx + 10, Math.round(back + (apex - back) * 0.35), 10, p.chimney > 1);
  return { ridge: back, eave: top + ov, top, yb, x0, x1: xf };
}
/* a round tower: radius r, wallH high, standing on (cx, yb), with a cone, battlements or a flat top */
function tower(K, cx, yb, r, wallH, p) {
  r = Math.round(r * RS); wallH = Math.round(wallH * HS); if (p.rise) p = { ...p, rise: p.rise * HS };
  const Wl = R(WALL[p.wall] || p.wall || WALL.stone), ry = Math.max(2, Math.round(r * 0.45)), topY = yb - ry - wallH;
  const tone = (x, P, y) => { const t = (x + 0.5 - cx) / r; return P[t < -0.55 ? 1 : t < 0.25 ? 2 : t < 0.7 ? 3 : 4]; };
  for (let x = Math.floor(cx - r); x < cx + r; x++) {
    const t = (x + 0.5 - cx) / r, a = Math.sqrt(Math.max(0, 1 - t * t)) * ry;
    for (let y = Math.floor(topY + a); y < yb - ry + a; y++) {
      let c = tone(x, Wl, y);
      if (p.wallTex === 'stone' || !p.wallTex) { const row = Math.floor(y / 5); if (((y % 5) + 5) % 5 === 4 || (((x + (row % 2) * 3) % 7 + 7) % 7 === 0 && Math.abs(t) < 0.8)) c = mix(c, INK, 0.25); }
      if (p.bands && Math.floor((y - topY) / 8) % 2 === 1) c = tone(x, R(p.bands), y);
      K.set(x, y, c);
    }
  }
  if (p.windows !== false) for (let k = 1; k <= Math.floor(wallH / 18); k++) windowAt(K, Math.round(cx - 2), Math.round(yb - ry - k * 18 + 4), 4, 6, { arch: true });
  if (p.door) doorAt(K, cx, yb - 1, Math.min(10, r), Math.min(16, wallH - 4), { arch: true, col: p.doorCol });
  if (p.top === 'crenel') {
    K.oval(cx, topY, r, ry, (x, y) => (Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - topY) / ry) > 0.72 ? Wl[1] : R('#8a8f90')[2]));
    for (let x = Math.floor(cx - r); x < cx + r; x += 4) { const t = (x + 2 - cx) / r, a = Math.sqrt(Math.max(0, 1 - t * t)) * ry; K.rect(x, topY + a - 4, x + 2, topY + a + 1, tone(x, Wl)); }
  } else if (p.top === 'cone') {
    /* a cone's flanks rise a whole number of pixels for each one across, so their steps repeat evenly */
    const Rf = R(ROOF[p.roof] || p.roof), rr = r + 2, rise = Math.max(1, Math.round((p.rise ?? r * 2.2) / rr)) * rr;
    for (let x = Math.floor(cx - rr); x < cx + rr; x++) {
      const t = (x + 0.5 - cx) / rr, a = Math.sqrt(Math.max(0, 1 - t * t)) * (ry + 1), y0 = topY - rise * (1 - Math.abs(t));
      for (let y = Math.floor(y0); y < topY + a + 1; y++) { const v = Math.floor(topY + a - y); K.set(x, y, roofTone(p.roof, Rf, x, v, t > 0.35 ? 1 : t < -0.45 ? -1 : 0) || Rf[1]); }
    }
    K.rect(cx - 1, topY - rise - 4, cx + 1, topY - rise + 1, R('#c9a24f')[2]);
  } else K.oval(cx, topY, r, ry, Wl[1]);
  return topY;
}
/* a block with battlements along its top's front and sides */
function crenels(K, x0, x1, yTop, yBack, P) {
  K.rect(x0, yBack, x1, yTop, R('#8a8f90')[2]); K.rect(x0, yBack, x1, yBack + 2, P[1]);
  for (let x = x0; x < x1; x += 5) K.rect(x, yTop - 4, Math.min(x1, x + 3), yTop + 1, (px, py) => P[py === yTop - 4 ? 1 : 2]);
  K.rect(x0, yBack - 3, x0 + 2, yTop, P[1]); K.rect(x1 - 2, yBack - 3, x1, yTop, P[3]);
}
function keep(K, o, p) {
  const { FW, FD } = K, x0 = 3, x1 = FW - 3, yb = FD - 3, wallH = Math.round(p.wallH * HS), top = yb - wallH, P = R(WALL[p.wall] || WALL.stone);
  K.rect(x0, top, x1, yb, (x, y) => wallTone('stone', P, x, y));
  crenels(K, x0, x1, top, 8 - wallH, P);
  for (let f = 1; f <= Math.floor(wallH / 22); f++) for (let k = 0; k < Math.max(1, Math.floor((x1 - x0) / 16)); k++) windowAt(K, Math.round(x0 + (x1 - x0) * (k + 0.5) / Math.max(1, Math.floor((x1 - x0) / 16)) - 2), yb - f * 22 + 4, 4, 7, { arch: true });
  if (o.face !== 2) doorAt(K, FW / 2, yb, 12, 18, { arch: true });
  return top;
}

/* ---------- the smithy and the alchemist's shop ---------- */
/* ---------- shop fronts ----------
   A shop opens onto the street as medieval shops did, through a stall board: a wide opening in the front wall closed
   at night by two shutters, the upper propped out on iron rods as an awning (or a striped cloth awning over it) and
   the lower let down flat on brackets as a counter, the wares set out along it. */
/* the counter: a board let down at sill height y from x0 to x1, its top lit, its front edge and brackets in shade,
   goods(K, x, y, k) set along it */
function stallBoard(K, x0, x1, y, goods, seed = 0) {
  const W = OAK, d = 7;
  for (const bx of [x0 + 4, x1 - 5]) { rod(K, bx, y + d + 2, bx - 3, y + d + 9, STEEL, 1); K.set(bx - 3, y + d + 9, STEEL[4]); }
  K.rect(x0 - 3, y, x1 + 3, y + d, (px, py) => W[py === y ? 2 : py === y + 1 ? 0 : h2(px >> 3, py, 91) < 0.15 ? 2 : 1]);
  K.rect(x0 - 3, y + d, x1 + 3, y + d + 2, (px, py) => W[py === y + d ? 3 : 4]);
  for (let px = x0 - 3; px < x1 + 3; px++) umbra(K, px, y + d + 2, 0.3);
  for (let x = x0 + 6, i = 0; x < x1 - 4; x += 13, i++) goods(K, x, y + 5, h2(i, seed, 92), mat('brass'));
}
/* the upper shutter propped out on two rods over an opening x0..x1 whose lintel is at y: boards seen from below */
function propFlap(K, x0, x1, y) {
  K.rect(x0 - 3, y - 9, x1 + 3, y - 1, (px, py) => (py === y - 9 ? OAK[0] : py === y - 8 ? OAK[2] : ((px - x0) % 7 === 0 ? OAK[5] : OAK[py > y - 4 ? 4 : 3])));
  for (const [fx, wx] of [[x0 - 2, x0 + 1], [x1 + 2, x1 - 2]]) rod(K, fx, y - 8, wx, y + 6, STEEL, 1);
}
/* a striped cloth awning over an opening x0..x1 at y, flaring toward its scalloped hem */
function stripedAwning(K, x0, x1, y, A, B) {
  const h = 11;
  for (let py = y - h; py < y; py++) {
    const f = (py - (y - h)) / h, l = Math.round(x0 - 2 - f * 5), r = Math.round(x1 + 2 + f * 5);
    for (let px = l; px <= r; px++) { const stripe = Math.floor((px - x0 + 40) / 5) % 2 ? A : B; K.set(px, py, stripe[py === y - h ? 0 : f > 0.7 ? 2 : 1]); }
  }
  for (let px = x0 - 7; px <= x1 + 7; px++) { const k = ((px - x0 + 40) % 5); if (k > 0 && k < 4) K.set(px, y + (k === 2 ? 1 : 0), (Math.floor((px - x0 + 40) / 5) % 2 ? A : B)[3]); }
  for (let px = x0; px < x1; px++) for (const dy of [1, 2, 3]) umbra(K, px, y + dy, 0.28 - dy * 0.06);
}
/* A sign hung from an iron bracket off the west corner of a front wall at (x, y): a framed board with an emblem drawn
   by mark(K, cx, cy) about the board's middle */
function hangingSign(K, x, y, board, mark) {
  const I = R('#3b3a38'), B = R(board), G = R('#c9a24f');
  K.rect(x - 19, y, x + 2, y + 2, (px, py) => I[py === y ? 1 : 3]);
  K.line(x + 1, y + 8, x - 6, y + 2, I[2]);
  for (const cx of [x - 16, x - 5]) K.rect(cx, y + 2, cx + 1, y + 4, I[2]);
  K.rect(x - 19, y + 4, x - 1, y + 19, (px, py) => (px === x - 19 || py === y + 4 ? G[1] : px === x - 2 || py === y + 18 ? G[3] : py === y + 5 || px === x - 18 ? B[1] : B[2]));
  mark(K, x - 10, y + 11);
}
/* a painted board fixed flat to the wall over a door at (cx, y), its emblem drawn by mark */
function wallBoard(K, cx, y, board, mark) {
  const B = R(board), G = R('#c9a24f');
  K.rect(cx - 11, y, cx + 12, y + 11, (px, py) => (px === cx - 11 || py === y ? G[1] : px === cx + 11 || py === y + 10 ? G[3] : B[py === y + 1 ? 1 : 2]));
  for (let px = cx - 10; px < cx + 13; px++) umbra(K, px, y + 11, 0.3);
  mark(K, cx, y + 6);
}
/* An anvil emblem, on the smith's sign and board: a flat face with its horn to the west, a waist and a broad foot */
function anvilAt(K, x, y) {
  const I = R('#5c6066');
  K.rect(x - 5, y - 2, x + 5, y, (px, py) => I[py === y - 2 ? 0 : px === x + 4 ? 3 : 1]);
  K.rect(x - 8, y - 2, x - 5, y - 1, I[1]); K.set(x - 9, y - 2, I[2]);
  K.rect(x - 2, y, x + 2, y + 2, I[3]);
  K.rect(x - 4, y + 2, x + 4, y + 3, (px) => I[px === x - 4 ? 2 : 3]);
}
/* A smithy: a stone workshop under slate. Up its west end runs the forge's chimney breast, built out from the wall and
   rising over the ridge, smoke-stained toward its cap and sending up grey smoke, a small window beside it glowing with
   the fire inside. Then the door, iron-strapped, a horseshoe nailed over it and the anvil painted on a board above;
   then the shop: a stall board opening under a heavy lintel, its upper shutter propped out on iron rods and its lower
   let down on brackets as a counter set with horseshoes, blades, tongs and a helm, and in the dark behind it racks of
   blades lit by the forge. Turned away, the back shows windows and the chimney. */
function smithyShop(K, o) {
  const { FW } = K, front = o.face !== 2, dX = Math.round(FW * ASSET_BY_ID.blacksmith.door);
  const b = house(K, o, { wall: 'stone', roof: 'slate', wallH: 28, rise: 12, doorX: dX, doorCol: '#5a3a28', windows: front ? false : undefined });
  const { top, yb, x0, x1, ridge } = b, Tm = TIMBER, S = R('#c4b9a4'), Soot = R('#4a423a');
  /* the chimney breast */
  const cw = FW > T ? 22 : 16, c0 = x0 + 3, c1 = c0 + cw, ct = ridge - 20;
  K.rect(c0, ct, c1, yb, (x, y) => { let c = wallTone('stone', S, x, y); c = mix(c, Soot[3], Math.max(0, 1 - (y - ct) / 40) * 0.55); return x === c0 ? mix(c, [255, 250, 235], 0.3) : c; });
  K.rect(c1, ct + 2, c1 + 4, yb, (x, y) => mix(wallTone('stone', S, x, y), INK, 0.38));
  K.rect(c0 - 2, ct - 4, c1 + 3, ct, (x, y) => S[y === ct - 4 ? 0 : y === ct - 1 ? 3 : 1]);
  K.rect(c0 + 3, ct - 4, c1 - 2, ct - 3, R('#2a2018')[3]);
  for (const [dx, dy, r, a] of [[0, -8, 5, 230], [4, -17, 6, 190], [9, -27, 7, 150], [15, -38, 8, 105]]) haze(K, (c0 + c1) / 2 + dx, ct + dy, r, r * 0.8, R('#a8a39b'), a);
  if (!front) return b;
  /* the forge window beside it, glowing */
  const gx = c1 + 7, gw = dX - 10 - gx;
  if (gw >= 6) { K.rect(gx - 1, yb - 30, gx + gw + 1, yb - 16, Tm[2]); K.rect(gx, yb - 29, gx + gw, yb - 17, (x, y) => R('#f08a2a')[y < yb - 25 ? 1 : y < yb - 21 ? 0 : 2]); K.rect(gx + Math.floor(gw / 2), yb - 29, gx + Math.floor(gw / 2) + 1, yb - 17, Tm[3]); candlelight(K, gx + gw / 2, yb - 23, 16, 12, 0.35); }
  /* the horseshoe over the door, the anvil board over that */
  const dTop = yb - Math.min(yb - top - 8, 34) - 2;
  for (const [dx, dy] of [[-3, 0], [-3, 1], [-3, 2], [-2, 3], [-1, 4], [0, 4], [1, 4], [2, 3], [3, 2], [3, 1], [3, 0]]) K.set(dX + dx, dTop - 6 + dy, STEEL[dy > 2 ? 3 : 1]);
  if (dTop - 19 > top + 2) wallBoard(K, dX, dTop - 19, '#4a3424', anvilAt);
  /* the shop's stall board */
  const s0 = dX + 16, s1 = x1 - 6, sy0 = top + 12, sy1 = yb - 17;
  if (s1 - s0 >= 20) {
    K.rect(s0, sy0, s1, sy1, (x, y) => mix(R('#2e241c')[y < sy0 + 3 ? 4 : 3], R('#f08a2a')[1], Math.max(0, 0.35 - (x - s0) / (s1 - s0) * 0.35)));
    for (let x = s0 + 5, i = 0; x < s1 - 3; x += 6, i++) { const h = 10 + Math.floor(h2(i, 3, 93) * 6); rod(K, x, sy0 + 4, x, sy0 + 4 + h, STEEL, 1); K.set(x, sy0 + 4, STEEL[0]); K.rect(x - 1, sy0 + 4 + h, x + 2, sy0 + 5 + h, R('#c9a24f')[2]); }
    K.rect(s0 - 2, sy0, s0, sy1, (x) => Tm[x === s0 - 2 ? 1 : 3]); K.rect(s1, sy0, s1 + 2, sy1, (x) => Tm[x === s1 ? 2 : 4]);
    K.rect(s0 - 3, sy0 - 3, s1 + 3, sy0, (x, y) => Tm[y === sy0 - 3 ? 0 : y === sy0 - 1 ? 4 : 2]);
    propFlap(K, s0, s1, sy0 - 3);
    stallBoard(K, s0, s1, sy1, COUNTER_GOODS.smith, 1);
  }
  return b;
}
/* A flask on the alchemist's sign: a round-bellied flask of green elixir with a cork, a glint on the glass */
function flaskAt(K, x, y) {
  const Gl = R('#cfe4e4'), L = R('#6fbf6a');
  K.rect(x - 1, y - 6, x + 1, y - 2, Gl[1]); K.rect(x - 1, y - 7, x + 1, y - 6, R('#8e6a44')[1]);
  K.oval(x, y + 1, 4.5, 4, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.8 ? Gl[2] : dy > -0.1 ? L[dx < -0.3 ? 0 : dx > 0.4 ? 2 : 1] : Gl[0]));
  K.set(x - 2, y - 1, R('#ffffff')[0]);
}
/* An alchemist's shop: a tall timber-framed house of lilac plaster under an indigo slate roof, a round stone turret with a
   verdigris cone and a golden star rising over its east end. On the ground floor a painted door and a broad shop window
   lit from within, three shelves of bottles and flasks in it (green, violet, amber, red, teal); upstairs windows with
   boxes of herbs under them and bunches of herbs drying under the eave; the flask sign hung by the door; and from the
   chimney, fumes in pale greens and violets. Turned away, the back shows plain windows. */
function alchemistShop(K, o) {
  const { FW } = K, front = o.face !== 2, dX = Math.round(FW * ASSET_BY_ID.alchemist.door);
  const b = house(K, o, { wall: 'lilac', wallTex: 'timber', roof: 'indigo', wallH: 38, floors: 2, rise: 14, doorX: dX, doorCol: '#3e5470', windows: front ? false : undefined, inset: 4 });
  const { top, yb, x0, x1, ridge, eave } = b, floorH = (yb - top) / 2, tr = FW > T ? 6 : 5, tcx = x1 - Math.round(tr * RS * 0.55);
  chimney(K, Math.round(x0 + (x1 - x0) * 0.3), Math.round(ridge + (eave - ridge) * 0.4), 12, true, 7, ['#d4ecc8', '#e0d0f0', '#c8e6e4', '#ead8f4']);
  if (front) {
    const sx0 = dX + 18, sx1 = tcx - tr * RS - 6, sy0 = Math.round(top + floorH + 9), sy1 = yb - 18, Fr = R('#3e5470'), yf = Math.round(top + floorH);
    /* the jetty: the upper storey carried out over the street on a carved beam, its shadow on the wall below */
    K.rect(x0 - 3, yf - 2, x1 + 1, yf + 2, (x, y) => TIMBER[y === yf - 2 ? 0 : y === yf + 1 ? 4 : (x - x0) % 12 === 0 ? 3 : 1]);
    for (let x = x0 - 3; x < x1 + 1; x++) for (const dy of [2, 3]) umbra(K, x, yf + dy, dy === 2 ? 0.35 : 0.18);
    /* the shop window: a painted frame, three shelves of bottles glowing on a warm dark ground, a sill */
    if (sx1 - sx0 >= 16) {
      const COL = ['#6fbf6a', '#a46ac8', '#e0a23a', '#c4503e', '#4fb0b0', '#d8d06a'], rows = 3, rh = (sy1 - sy0 - 2) / rows;
      K.rect(sx0 - 2, sy0 - 3, sx1 + 2, sy1 + 1, (x, y) => Fr[y === sy0 - 3 || x === sx0 - 2 ? 1 : x === sx1 + 1 ? 3 : 2]);
      K.rect(sx0, sy0, sx1, sy1, (x, y) => R('#3a2c20')[y < sy0 + 2 || x === sx0 ? 4 : 3]);
      for (let r = 0; r < rows; r++) {
        const sh = Math.round(sy0 + (r + 1) * rh);
        for (let x = sx0 + 2, k = 0; x < sx1 - 3; k++) {
          const C = R(COL[Math.floor(h2(k, r, 71) * COL.length)]), w = h2(k, r, 72) < 0.3 ? 5 : 3, h = Math.min(Math.round(rh) - 2, 4 + Math.floor(h2(k, r, 73) * 4));
          if (w === 5) { K.oval(x + 2, sh - 3, 2.5, 2.5, (px, py, dx, dy) => C[dy < -0.3 ? 0 : dx > 0.3 ? 2 : 1]); K.rect(x + 2, sh - 7, x + 3, sh - 5, R('#cfe4e4')[1]); }
          else { K.rect(x, sh - h, x + w, sh, (px, py) => (py === sh - h ? R('#8e6a44')[1] : C[px === x ? 0 : px === x + w - 1 ? 2 : 1])); }
          x += w + 1 + Math.floor(h2(k, r, 74) * 2);
        }
        K.rect(sx0, sh, sx1, sh + 1, R('#7a5a3a')[1]);
      }
      for (let x = sx0 + 1; x < sx1; x += Math.max(10, Math.round((sx1 - sx0) / 4))) K.rect(x, sy0, x + 1, sy1, Fr[2]);
      candlelight(K, (sx0 + sx1) / 2, (sy0 + sy1) / 2, (sx1 - sx0) * 0.6, (sy1 - sy0) * 0.8, 0.35);
      K.rect(sx0 - 3, sy1 + 1, sx1 + 3, sy1 + 3, (x, y) => Fr[y === sy1 + 1 ? 0 : 3]);
      /* a striped awning over it and the counter let down below it, set with jars, bottles and scales */
      stripedAwning(K, sx0, sx1, sy0 - 4, R('#5f8a5a'), R('#efe6cf'));
      stallBoard(K, sx0, sx1, sy1 + 3, COUNTER_GOODS.alchemist, 2);
    }
    /* a lantern of green glass on a bracket by the door */
    const lx = dX + 13, ly = Math.round(top + floorH + 8);
    K.rect(lx - 3, ly, lx + 1, ly + 1, STEEL[3]); K.rect(lx - 1, ly + 1, lx, ly + 3, STEEL[4]);
    K.rect(lx - 3, ly + 3, lx + 2, ly + 10, (x, y) => (x === lx - 3 || x === lx + 1 || y === ly + 3 || y === ly + 9 ? STEEL[3] : R('#9fe08a')[y < ly + 6 ? 0 : 1]));
    for (let r = 3; r <= 9; r++) for (let a2 = 0; a2 < 20; a2++) { const px = Math.round(lx + Math.cos(a2 / 20 * 6.283) * r), py = Math.round(ly + 6 + Math.sin(a2 / 20 * 6.283) * r); if (K.get(px, py) === 255) continue; K.set(px, py, R('#b8f0a0')[0], Math.round(60 * (1 - (r - 3) / 7))); }
    /* upstairs: a window over the door and over the shop, a box of herbs under each */
    const uy = Math.round(top + floorH * 0.28), wh = Math.min(16, Math.round(floorH * 0.42));
    for (const wx of [dX - 6, Math.round((sx0 + Math.max(sx0, sx1)) / 2) - 6]) {
      windowAt(K, wx, uy, 12, wh, { glass: '#3e5a64', shutter: '#3e5470' });
      const by = uy + wh + 1; K.rect(wx - 1, by, wx + 13, by + 3, (x, y) => R('#8e6a44')[y === by ? 1 : 3]);
      for (let x = wx; x < wx + 12; x += 2) { const Lf = R(h2(x, 3, 75) < 0.5 ? '#6f9a52' : '#87a05a'); K.set(x, by - 1, Lf[1]); K.set(x + 1, by - 2, Lf[2]); if (h2(x, 1, 76) < 0.3) K.set(x, by - 3, R('#b98ad8')[0]); }
    }
    /* bunches of herbs drying under the eave */
    for (let x = x0 + 8; x < tcx - tr * RS - 4; x += 13) {
      if (Math.abs(x - dX) < 9) continue;
      const y = eave + 7, Lf = R(h2(x, 2, 77) < 0.5 ? '#7f9a52' : '#a89a5a');
      K.rect(x, y, x + 1, y + 3, R('#c8b28a')[2]); K.rect(x - 1, y + 3, x + 2, y + 8, (px, py) => Lf[px === x - 1 ? 1 : py > y + 6 ? 3 : 2]);
    }
    hangingSign(K, x0, Math.round(top + floorH + 2), '#3e5470', flaskAt);
  }
  /* the turret at the east end, its cone, and a golden star on the point */
  const ty = tower(K, tcx, yb + 1, tr, 42, { wall: 'stone', top: 'cone', roof: 'copper', rise: 16, windows: true });
  const rr = Math.round(tr * RS) + 2, rise = Math.max(1, Math.round(16 * HS / rr)) * rr, sy = ty - rise - 7, Gd = R('#e2c26a');
  for (const [dx, dy] of [[0, -3], [0, -2], [-1, -1], [0, -1], [1, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [-1, 1], [0, 1], [1, 1], [0, 2], [0, 3]]) K.set(tcx + dx - 1, sy + dy, Gd[Math.abs(dx) + Math.abs(dy) > 2 ? 2 : 0]);
  return b;
}

const BUILD = {
  cottage: (K, o) => house(K, o, { wall: ['plaster', 'cream', 'ochre', 'plaster'][Math.floor(o.v * 4) % 4], roof: 'thatch', wallH: 22, rise: 16, chimney: o.v > 0.5 ? 2 : 1, shutter: o.v > 0.3 ? '#6f8a5a' : null }),
  townhouse: (K, o) => house(K, o, { wall: ['plaster', 'cream', 'rose'][Math.floor(o.v * 3) % 3], wallTex: 'timber', roof: 'tiles', wallH: 38, floors: 2, rise: 14, chimney: 1, inset: 1 }),
  longhouse: (K, o) => house(K, o, { wall: '#c7b28a', wallTex: 'timber', roof: 'thatch', wallH: 20, rise: 20, chimney: 2 }),
  barn: (K, o) => house(K, o, { wall: 'barn', roof: 'shingle', wallH: 26, rise: 18, doorW: 16, doorH: 20, doorCol: '#6e3a28', windows: false }),
  granary: (K, o) => house(K, o, { wall: 'planks', roof: 'thatch', wallH: 14, rise: 12, lift: 6, hip: true, inset: 5, door: false, windows: false }),
  smithy: (K, o) => { house(K, o, { wall: 'stone', roof: 'slate', wallH: 22, rise: 12, chimney: 2, open: true, doorW: 12 }); K.oval(K.FW / 2, K.FD - 8, 5, 3, (x, y) => (y > K.FD - 9 ? R('#f4a03a')[1] : null)); },
  blacksmith: (K, o) => smithyShop(K, o),
  alchemist: (K, o) => alchemistShop(K, o),
  tavern: (K, o) => { const b = house(K, o, { wall: 'plaster', wallTex: 'timber', roof: 'tiles', wallH: 40, floors: 2, rise: 14, hip: true, chimney: 2, lit: true, shutter: '#7a4a2a' }); K.line(b.x0 + 4, b.top + 12, b.x0 - 2, b.top + 12, TIMBER[3]); K.rect(b.x0 - 5, b.top + 13, b.x0 + 1, b.top + 19, (x, y) => (y === b.top + 16 && x === b.x0 - 2 ? R('#c9a24f')[1] : R('#7a4a2a')[2])); },
  chapel: (K, o) => { const b = house(K, o, { wall: 'stone', roof: 'slate', wallH: 24, rise: 16, arch: true, glass: '#4b5a6e', doorX: K.FW * 0.62 }); tower(K, 20, K.FD - 6, 7, 40, { wall: 'stone', top: 'cone', roof: 'slate', rise: 18 }); return b; },
  watchtower: (K, o) => {
    const { FW, FD } = K, P = R('#8e6a44'); for (const x of [6, FW - 9]) K.rect(x, FD - 46, x + 3, FD - 3, (px) => P[px === x ? 1 : 3]);
    K.line(9, FD - 6, FW - 9, FD - 30, P[3]); K.line(9, FD - 30, FW - 9, FD - 6, P[3]);
    K.box(3, FD - 14, FW - 3, FD - 4, 34, (x, y) => P[((x % 4) + 4) % 4 === 0 ? 3 : 2], (x, y) => wallTone('planks', P, x, y));
    K.rect(3, FD - 58, FW - 3, FD - 48, (x, y) => P[((x % 4) + 4) % 4 === 0 ? 3 : 2]);
    const Rf = R(ROOF.thatch); K.poly([[1, FD - 54], [FW / 2, FD - 72], [FW - 1, FD - 54]], (x, y) => roofTone('thatch', Rf, x, FD - 54 - y, x > FW / 2 ? 1 : 0));
  },
  stonetower: (K, o) => tower(K, K.FW / 2, K.FD - 4, 13, 64, { wall: 'stone', top: 'cone', roof: 'slate', door: o.face !== 2 }),
  keep: (K, o) => { keep(K, o, { wallH: 62 }); },
  lighthouse: (K, o) => { const top = tower(K, K.FW / 2, K.FD - 4, 12, 70, { wall: 'white', wallTex: 'plain', bands: '#b8483a', door: o.face !== 2, top: 'none' }); K.rect(K.FW / 2 - 7, top - 12, K.FW / 2 + 7, top, (x, y) => (x % 4 === 0 ? R('#3b3a38')[2] : R('#f6d36a')[y < top - 8 ? 0 : 1])); K.poly([[K.FW / 2 - 9, top - 12], [K.FW / 2, top - 22], [K.FW / 2 + 9, top - 12]], R('#b8483a')[2]); },
  temple: (K, o) => {
    const b = house(K, o, { wall: 'white', wallTex: 'stone', roof: 'tiles', wallH: 30, rise: 12, door: o.face !== 2, doorW: 12, windows: false, plinth: true });
    const P = R('#efe8d8'); for (let x = b.x0 + 2; x < b.x1 - 3; x += 9) K.rect(x, b.top + 4, x + 4, b.yb - 3, (px) => P[px === x ? 0 : px === x + 3 ? 3 : 1]);
  },
  markethall: (K, o) => {
    /* an open arcade of stone arches on the ground floor, the market inside in shadow, under a timbered upper floor */
    const b = house(K, o, { wall: 'cream', wallTex: 'timber', roof: 'tiles', wallH: 40, floors: 2, rise: 16, door: false, windows: false });
    const x0 = b.x0, x1 = b.x1, fh = (b.yb - b.top) / 2, ay = Math.round(b.top + fh), yb = b.yb, S = R('#c9bfa6'), D = R('#2e241b');
    const n = Math.max(2, Math.round((x1 - x0) / 26)), bay = (x1 - x0) / n, colW = 6, ra = (bay - colW) / 2, ys = ay + 3 + ra;
    for (let y = ay; y < yb; y++) for (let x = x0; x < x1; x++) {
      const i = Math.min(n - 1, Math.floor((x - x0) / bay)), mx = x0 + (i + 0.5) * bay, dx = x + 0.5 - mx, colEdge = Math.abs(dx) > bay / 2 - colW / 2;
      const inOpen = !colEdge && (y >= ys || (dx * dx + (y + 0.5 - ys) ** 2 <= ra * ra));
      let c;
      if (inOpen) c = y > yb - 4 ? D[1] : D[y < ay + 8 ? 4 : 3];                       /* the shadowed hall; its floor catches light */
      else {
        const rim = !colEdge && Math.abs(Math.hypot(dx, y + 0.5 - ys) - ra) < 1.5 && y < ys;   /* the arch's voussoirs */
        c = rim ? S[1] : colEdge ? S[Math.abs(dx) > bay / 2 - 1.5 ? (dx < 0 ? 3 : 1) : 2] : wallTone('stone', S, x, y);
      }
      K.set(x, y, c);
    }
    /* capitals at the springing, and a beam carrying the upper floor */
    for (let i = 0; i <= n; i++) { const cxi = Math.round(x0 + i * bay); K.rect(cxi - colW / 2 - 1, ys - 1, cxi + colW / 2 + 1, ys + 2, S[0]); }
    K.rect(x0, ay - 2, x1, ay + 1, (x, y) => TIMBER[y === ay - 2 ? 1 : 3]);
    /* market goods glimpsed inside: crates and a barrel in the shade */
    for (let i = 0; i < n; i += 2) { const mx = Math.round(x0 + (i + 0.5) * bay); K.rect(mx - 5, yb - 9, mx + 3, yb - 3, R('#8e6a44')[3]); K.rect(mx - 5, yb - 9, mx + 3, yb - 8, R('#8e6a44')[2]); }
    /* windows across the upper floor */
    const wh = Math.min(16, Math.round(fh * 0.45)), wy = Math.round(b.top + (fh - wh) * 0.45);
    for (const wx of windowSlots(x0 + 2, x1 - 2, 12, false)) windowAt(K, wx, wy, 12, wh, { shutter: '#7a4a2a' });
  },
  yurt: (K, o) => { const { FW, FD } = K, P = R('#d9c9a0'), cx = FW / 2; K.oval(cx, FD - 10, 14, 6, P[3]); K.rect(cx - 14, FD - 24, cx + 14, FD - 10, (x, y) => { const t = (x + 0.5 - cx) / 14; return P[(y % 6 === 0) ? 3 : t < -0.5 ? 1 : t < 0.4 ? 2 : 3]; }); K.oval(cx, FD - 24, 15, 13, (x, y, dx, dy) => (dy > 0.3 ? null : R('#cbb894')[dx < -0.4 ? 1 : dx > 0.5 ? 3 : 2])); K.oval(cx, FD - 34, 3, 2, R('#5a3f28')[2]); doorAt(K, cx, FD - 9, 8, 12, { col: '#b8483a' }); },
  ruin: (K, o) => {
    const { FW, FD } = K, P = R(WALL.stone);
    const wallH = x => 6 + Math.floor(h2(Math.floor(x / 3), 1, Math.floor(o.v * 99)) * 20);
    for (let x = 3; x < FW - 3; x++) { const h = wallH(x); K.rect(x, 9 - h, x + 1, 9, (px, py) => wallTone('stone', P, px, py)); K.rect(x, FD - 4 - h * 0.7, x + 1, FD - 4, (px, py) => wallTone('stone', P, px, py)); }
    K.rect(3, 6, 6, FD - 4, (x, y) => P[x === 3 ? 1 : 3]); K.rect(FW - 6, 6, FW - 3, FD - 4, P[3]);
    for (let k = 0; k < 4; k++) K.rect(6 + k * 6, FD - 3, 9 + k * 6, FD - 1, P[3]);
  },
  mine: (K, o) => { const { FW, FD } = K, P = R('#a59a85'); K.mass(FW / 2, FD - 14, 16, 14, P, 3); K.rect(FW / 2 - 6, FD - 18, FW / 2 + 6, FD - 3, R('#1c1714')[2]); const W = R('#7a5a3a'); K.rect(FW / 2 - 8, FD - 20, FW / 2 - 5, FD - 3, W[2]); K.rect(FW / 2 + 5, FD - 20, FW / 2 + 8, FD - 3, W[3]); K.rect(FW / 2 - 9, FD - 22, FW / 2 + 9, FD - 19, W[1]); },
  dovecote: (K, o) => { const top = tower(K, K.FW / 2, K.FD - 4, 10, 30, { wall: 'plaster', wallTex: 'plain', top: 'cone', roof: 'tiles', rise: 16, windows: false }); for (let k = 0; k < 3; k++) K.rect(K.FW / 2 - 6 + k * 5, top + 10, K.FW / 2 - 4 + k * 5, top + 12, R('#2a2018')[2]); },
  windmill: (K, o) => {
    const cx = K.FW / 2, top = tower(K, cx, K.FD - 4, 11, 40, { wall: 'plaster', wallTex: 'plain', top: 'cone', roof: 'thatch', rise: 14, door: o.face !== 2 }), hy = top + 6, S = R('#f0e6cb'), F = R('#7a5a3a');
    for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { for (let i = 0; i < 34; i++) { const x = cx + ax * i * 0.75, y = hy + ay * i * 0.75; K.set(x, y, F[3]); if (i > 6) for (let s = 1; s <= 3; s++) K.set(x + ax * s, y - ay * s * 0 + (ax === ay ? -s : s), (i + s) % 3 ? S[1] : F[2]); } }
    K.oval(cx, hy, 2, 2, F[1]);
  },
  shrine: (K, o) => { const { FW } = K, b = house(K, o, { wall: 'white', wallTex: 'stone', roof: 'lead', wallH: 20, rise: 4, inset: 5, overhang: 1, windows: false, arch: true, doorW: 8, doorH: 14 }); K.oval(FW / 2, b.ridge - 2, 10, 10, (x, y, dx, dy) => (dy > 0.25 ? null : R('#6f9c86')[dx < -0.4 ? 1 : dx > 0.4 ? 3 : 2])); K.rect(FW / 2 - 1, b.ridge - 16, FW / 2 + 1, b.ridge - 10, R('#c9a24f')[1]); },
  slatehouse: (K, o) => house(K, o, { wall: 'grey', wallTex: 'stone', roof: 'slate', wallH: 40, floors: 2, rise: 14, chimney: 2, inset: 1 }),
  stonehouse: (K, o) => house(K, o, { wall: 'stone', roof: 'slate', wallH: 44, floors: 2, rise: 16, chimney: 1, dormer: true, arch: true }),
  mansion: (K, o) => house(K, o, { wall: 'cream', wallTex: 'stone', roof: 'slate', wallH: 50, floors: 3, rise: 24, hip: true, chimney: 2, dormer: true, shutter: '#4f6a7a', doorW: 12, doorH: 18, plinth: true }),
  wall: (K, o) => cityWall(K, o, 34),
  walltower: (K, o) => { cityWall(K, o, 34); tower(K, K.FW / 2, K.FD - 4, 14, 52, { wall: 'stone', top: 'crenel', windows: true }); },
  gatehouse: (K, o) => {
    const { FW, FD } = K, P = R(WALL.stone), ax = FW >= FD, x0 = 3, x1 = FW - 3, yb = FD - 3, H = Math.round(48 * HS);
    if (!ax) { keep(K, o, { wallH: H }); return; }
    K.rect(x0, yb - H, x1, yb, (x, y) => wallTone('stone', P, x, y)); crenels(K, x0, x1, yb - H, 8 - H, P);
    K.rect(FW / 2 - 10, yb - 26, FW / 2 + 10, yb, R('#2a2018')[2]); K.oval(FW / 2, yb - 26, 10, 6, (x, y) => (y < yb - 26 ? R('#2a2018')[2] : null));
    K.rect(FW / 2 - 10, yb - 24, FW / 2 + 10, yb - 4, (x, y) => ((x % 3 === 0 || y % 4 === 0) ? R('#4a4a48')[2] : null));
    for (const cx of [27, FW - 27]) tower(K, cx, FD - 3, 12, 60, { wall: 'stone', top: 'crenel' });
  },
  church: (K, o) => { const b = house(K, o, { wall: 'stone', roof: 'slate', wallH: 36, rise: 20, arch: true, glass: '#4b5a6e', doorX: K.FW * 0.62, winW: 5 }); tower(K, 32, K.FD - 5, 13, 70, { wall: 'stone', top: 'cone', roof: 'slate', rise: 40 }); return b; },
  cathedral: (K, o) => {
    const { FW } = K, b = house(K, o, { wall: 'stone', roof: 'copper', wallH: 60, rise: 34, arch: true, glass: '#5a4f78', door: false, winW: 7, floors: 2 });
    for (const cx of [FW * 0.3, FW * 0.7]) tower(K, cx, K.FD - 5, 18, 120, { wall: 'stone', top: 'cone', roof: 'copper', rise: 50 });
    K.oval(FW / 2, b.top + 14, 10, 10, (x, y, dx, dy) => R(['#b8483a', '#4f6a9a', '#d9b44a'][Math.floor((Math.atan2(dy, dx) + 4) * 2) % 3])[Math.hypot(dx, dy) > 0.8 ? 4 : 1]);
    doorAt(K, FW / 2, b.yb, 16, 26, { arch: true });
  }
};
function cityWall(K, o, H) {
  const { FW, FD } = K, P = R(WALL.stone), L = o.links || [0, 0, 0, 0], c0 = 12, c1 = FW - 12; H = Math.round(H * HS);
  /* the core and an arm to each joined side, as one block with battlements */
  const x0 = L[2] ? 0 : c0, x1 = L[0] ? FW : c1, y0 = L[3] ? 0 : c0, y1 = L[1] ? FD : c1;
  const seg = (a0, b0, a1, b1) => { K.rect(a0, b1 - H, a1, b1, (x, y) => wallTone('stone', P, x, y)); K.rect(a0, b0 - H, a1, b1 - H, (x, y) => R('#8a8f90')[((x + y) % 7 === 0) ? 3 : 2]); for (let x = a0; x < a1; x += 5) K.rect(x, b1 - H - 4, Math.min(a1, x + 3), b1 - H, P[1]); };
  seg(c0, y0, c1, y1); seg(x0, c0, x1, c1);
}

/* ---------- nature ---------- */
/* Foliage gets its own ramp with a little more reach than the tile set's: sunlit leaves toward a warm yellow-green
   (never near white, which reads as a shine), shade toward a deep blue-green */
const leafRamps = new Map();
function leafRamp(hex) {
  let L = leafRamps.get(hex);
  if (!L) { const c = hexRgb(hex), sun = [232, 226, 140], sh = [30, 44, 34]; L = [mix(c, sun, 0.3), mix(c, sun, 0.14), c, mix(c, sh, 0.2), mix(c, sh, 0.38), mix(c, sh, 0.55)]; leafRamps.set(hex, L); }
  return L;
}
/* ---------- broadleaf trees ----------
   A crown is drawn the way a pixel artist paints foliage, not as a few polished balls. Its shape is many small leaf
   clusters scattered through an ellipse (a column for a poplar), each with a scalloped edge of rounded bulges of
   leaves. Light comes from the upper left and falls on
   the crown as one mass and on each cluster a little, so the clusters read apart without any ink between them: a
   cluster's lit upper edge stands against the shade of the one behind. The tones come from a ramp shifted warm in
   the light and cool in the shade, dithered where they meet instead of banded, broken up by leaf dabs (a lighter leaf
   in the light, a darker one in the shade). A last pass smooths any lone pixel that stands two tones off all its
   neighbours, so no specks or holes are left in the leaves. */
/* The leaves take the tiles' own palette: the tree colours the map and the editor use (render/palette.js TREE) on the
   tiles' gentle ramp (characters/pixels.js), with one step put in between its base and its shade so a crown can turn
   from light to shade without a jump. Six tones, lightest first; nothing near black. */
const foliageRamps = new Map();
function foliageRamp(hex) {
  let F = foliageRamps.get(hex);
  if (!F) { const r = ramp(hex); F = [r[0], r[1], r[2], mixHex(r[2], r[3], 0.5), r[3], r[4]].map(hexRgb); foliageRamps.set(hex, F); }
  return F;
}
const BAYER = [[0, 0.5, 0.125, 0.625], [0.75, 0.25, 0.875, 0.375], [0.1875, 0.6875, 0.0625, 0.5625], [0.9375, 0.4375, 0.8125, 0.3125]];
/* Leaf texture: the crown's pixels fall into small clumps of leaves (the cells of a jittered grid about cw × ch
   pixels), each lit on its upper left and turning into shade on its lower right, with a crease of shade where one
   clump meets the one below it. For pixel (x, y): { lit (-1..1), crease (true on a lower boundary) }. */
function leafClump(x, y, s, cw = 6, ch = 5) {
  const gx = Math.floor(x / cw), gy = Math.floor(y / ch); let d1 = 1e9, d2 = 1e9, nx = 0, ny = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const a = gx + i, b = gy + j, px = (a + 0.2 + 0.6 * h2(a, b, s)) * cw, py = (b + 0.2 + 0.6 * h2(a, b, s + 1)) * ch, dx = (x + 0.5 - px) / cw, dy = (y + 0.5 - py) / ch, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; nx = dx; ny = dy; } else if (d < d2) d2 = d;
  }
  return { lit: -nx * 0.9 - ny * 1.3, crease: Math.sqrt(d2) - Math.sqrt(d1) < 0.12 && ny > 0.05 };
}
/* the crown round (cx, cy) within rx × ry; col a hex (or a ready ramp of six). opts: column (a poplar's tall
   narrow crown), airy (a birch: its leaf clumps smaller), fruit (a colour). Returns the set of pixels it covers.
   The crown is a handful of big lobes (a column of them for a poplar), each a rounded mass of leaves lit on its upper
   left; the lower lobes stand in front of the upper ones, and where a lobe tucks in behind the one before it, it
   falls into shade, which is what parts them (no ink). */
function crown(K, col, cx, cy, rx, ry, seed, opts = {}) {
  const P = typeof col === 'string' ? foliageRamp(col) : col, s = Math.floor(seed * 97) + 11, rnd = (i, j) => h2(i, j, s);
  const lobes = [];
  if (opts.column) {
    const n = 4, rl = rx * 0.95;
    for (let k = 0; k < n; k++) { const f = k / (n - 1); lobes.push({ x: cx + (rnd(k, 1) - 0.5) * rx * 0.3, y: cy + ry - rl * 0.9 - f * (2 * ry - rl * 1.7), r: rl * (1 - f * 0.25) }); }
  } else {
    const rl = Math.min(rx, ry) * 0.62, n = rx > 36 ? 6 : 5;
    lobes.push({ x: cx - rx * 0.05, y: cy - ry + rl * 0.95, r: rl * 1.05 });
    for (let k = 0; k < n - 1; k++) {
      const a = Math.PI * (0.92 + (k / (n - 2)) * 1.16) + (rnd(k, 2) - 0.5) * 0.3;
      lobes.push({ x: cx + Math.cos(a) * (rx - rl * 0.9), y: cy - Math.sin(a) * (ry - rl * 0.95) * -1 + rl * 0.15, r: rl * (0.88 + rnd(k, 3) * 0.2) });
    }
    lobes.push({ x: cx + rx * 0.05, y: cy + ry * 0.25, r: rl * 1.05 });
  }
  lobes.sort((a, b) => a.y - b.y);
  const own = new Map(), key = (x, y) => (y + 1024) * 8192 + x + 1024;
  lobes.forEach((c, j) => {
    for (let y = Math.floor(c.y - c.r - 2); y <= c.y + c.r + 2; y++) for (let x = Math.floor(c.x - c.r - 2); x <= c.x + c.r + 2; x++) {
      const dx = (x + 0.5 - c.x) / c.r, dy = (y + 0.5 - c.y) / c.r, d = Math.hypot(dx, dy);
      /* a scalloped edge: rounded bulges of leaves round the lobe, not pixel noise */
      const ang = Math.atan2(dy, dx), scallop = 0.07 * Math.sin(ang * (6 + (j % 3)) + j * 1.9 + s) + 0.04 * Math.sin(ang * 13 + j);
      if (d > 1 + scallop) continue;
      own.set(key(x, y), { j, dx, dy, d });
    }
  });
  const tone = new Map();
  for (const [k, o] of own) {
    const x = (k % 8192) - 1024, y = Math.floor(k / 8192) - 1024, gx = (x + 0.5 - cx) / rx, gy = (y + 0.5 - cy) / ry;
    /* light on the crown as one mass, on its lobe as a rounded volume, and on each clump of leaves */
    const mass = -0.4 * gx - 0.75 * gy, z = Math.sqrt(Math.max(0, 1 - o.d * o.d)), lobe = -0.5 * o.dx - 0.85 * o.dy + 0.35 * z - 0.15;
    const lc = leafClump(x, y, s, opts.column || opts.airy ? 5 : 6, opts.column || opts.airy ? 4 : 5);
    /* tucked behind a lobe in front of it: in that lobe's shade */
    let tuck = 0; for (let m = o.j + 1; m < lobes.length; m++) { const c = lobes[m], d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) / c.r; if (d < 1.2) { tuck = d < 1.1 ? 0.32 : 0.16; break; } }
    const ao = Math.max(0, gy + 0.35) * 0.22 + Math.max(0, gx - 0.4) * 0.15;
    const v = 0.4 * mass + 0.55 * lobe + 0.3 * lc.lit - ao - tuck;
    let t = Math.round(2 - v * 2.1 + (o.d > 0.85 ? 0 : (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] - 0.5) * 0.6));
    if (lc.crease) t += 1;
    tone.set(k, Math.max(0, Math.min(4, t)));
  }
  /* smooth away lone pixels: one standing two or more tones off every neighbour takes their middle tone */
  for (const [k, t] of tone) {
    const nb = [k - 1, k + 1, k - 8192, k + 8192].map(n => tone.get(n)).filter(v => v !== undefined);
    const out = nb.length >= 2 && nb.every(v => Math.abs(v - t) >= 2) ? nb.sort((a, b) => a - b)[nb.length >> 1] : t;
    const x = (k % 8192) - 1024, y = Math.floor(k / 8192) - 1024; K.set(x, y, P[out]);
  }
  if (opts.fruit) { const F = R(opts.fruit); for (let k = 0; k < Math.round(rx * ry / 120); k++) { const x = Math.round(cx + (rnd(k, 41) - 0.5) * rx * 1.5), y = Math.round(cy + (rnd(k, 42) - 0.35) * ry * 1.4); if (own.has(key(x, y)) && own.has(key(x + 1, y + 1))) { K.set(x, y, F[1]); K.set(x + 1, y, F[2]); K.set(x, y + 1, F[3]); } } }
  return own;
}
/* A trunk from its roots at (cx, base) up to `top`, `w` wide at the foot, shaded as a cylinder: a lit strip on its west
   third, the body, a deep shade turning east, and a thin rim of light reflected back on the far edge. Its bark is
   broken into plates by wandering furrows (each plate lit along its west lip and dark in its furrow); a birch is
   white with dark lenticels and scars instead. Where it rises into the crown the leaves shade it. At its foot it
   flares into roots that spread over the ground, each a small rounded lobe lit on top. Limbs fork from its top into
   the crown. */
function trunk(K, cx, base, top, col, birch = false, w = 3.4, limbs = 3) {
  const B0 = R(col), B = [B0[0], B0[0], B0[1], B0[2], B0[3], B0[4]], W = R('#eeeae0'), H = base - top;
  const half = y => { const f = (y - top) / H; return w * (0.6 + 0.4 * f) + (y > base - 8 ? (y - base + 8) ** 1.7 * 0.32 : 0); };
  const tone = (u, t) => (t ? [W[0], W[1], W[2], W[3], R('#b9b2a2')[3], R('#8a8274')[3]] : B)[Math.max(0, Math.min(5, u))];
  /* the limbs first, so the trunk's top covers where they spring from */
  for (let k = 0; k < limbs; k++) {
    const d = k % 2 ? 1 : -1, len = H * (0.3 + h2(k, 3, cx) * 0.2) + 10, ang = Math.PI / 2 + d * (0.5 + h2(k, 4, cx) * 0.35), x0 = cx + d * 0.5, y0 = top + 10 + k * 3;
    for (let i = 0; i < len; i++) {
      const t = i / len, x = x0 + Math.cos(ang) * i, y = y0 - Math.sin(ang) * i, lw = Math.max(0.7, w * 0.6 * (1 - t * 0.8));
      for (let o = -Math.ceil(lw); o <= Math.ceil(lw); o++) if (Math.abs(o) <= lw) K.set(Math.round(x + o), Math.round(y), tone(o < -lw / 3 ? 1 : o > lw / 3 ? 4 : 2, birch));
    }
  }
  for (let y = Math.floor(top); y < base; y++) {
    const hw = half(y), shade = Math.max(0, 1 - (y - top) / 14);   /* the crown's shade on the trunk's top */
    for (let x = Math.floor(cx - hw); x < cx + hw; x++) {
      const u = (x + 0.5 - (cx - hw)) / (2 * hw);
      let t = u < 0.1 ? 2 : u < 0.34 ? 1 : u < 0.58 ? 2 : u < 0.8 ? 3 : u < 0.93 ? 4 : 3;
      if (birch) {
        if (h2(Math.floor(y / 2), x >> 1, 3) < 0.11 && u > 0.12 && u < 0.92) { K.set(x, y, R('#3b3530')[u > 0.6 ? 3 : 2]); continue; }
      } else {
        /* bark plates: furrows wander up the trunk; the plate edge west of each furrow catches the light */
        const fx = x + 0.5 - cx + Math.sin(y / 6 + Math.floor((x + 0.5 - cx + 20) / 3) * 2.1) * 0.9, f = ((fx % 3) + 3) % 3;
        if (f < 0.9 && u > 0.1 && u < 0.92) t = Math.min(5, t + 2); else if (f < 1.8 && u < 0.6 && h2(Math.floor(fx / 3), y >> 2, 7) < 0.6) t = Math.max(0, t - 1);
      }
      t = Math.min(5, t + Math.round(shade * 2));
      K.set(x, y, tone(t, birch));
    }
  }
  /* roots: lobes spreading over the ground either side, lit on top, dark beneath */
  const nroots = 3 + Math.round(w / 2);
  for (let k = 0; k < nroots; k++) {
    const side = k % 2 ? 1 : -1, reach = w * (1.2 + h2(k, 11, cx) * 1.1), x0 = cx + side * (w * 0.5 + (k >> 1) * 0.6);
    for (let i = 0; i < reach; i++) { const x = Math.round(x0 + side * i), yy = base - 1 - Math.round((1 - i / reach) * 2.2); K.set(x, yy, tone(birch ? 1 : 2, birch)); K.set(x, yy + 1, tone(4, birch)); if (i < reach * 0.4) K.set(x, yy - 1, tone(1, birch)); }
  }
}
/* a broadleaf tree: trunk and limbs, then the crown over them */
function broadleaf(K, col, cx, base, h, rw, bark = '#6e5236', s = 0, opts = {}) {
  const top = base - h, ry = rw * 0.46, rx = rw * 0.56;
  trunk(K, cx, base, top - ry * 0.2, bark, opts.birch, opts.birch ? 3 : Math.max(3.6, rw / 18));
  crown(K, col, cx, top - ry * 0.35, rx, ry, s, opts);
}
function conifer(K, P, cx, base, h, w, snow = false) {
  const B = R('#6e5236'), tiers = 5;
  K.rect(cx - 2, base - 8, cx + 2, base, (x) => B[x < cx - 1 ? 1 : x < cx + 1 ? 2 : 3]);
  for (let t = 0; t < tiers; t++) {
    const tb = base - 6 - t * (h / tiers) * 0.82, tt = tb - (h / tiers) * 1.45, hw = w * (1 - t / (tiers + 0.4)) / 2;
    K.poly([[cx - hw, tb], [cx, tt], [cx + hw, tb]], (x, y) => {
      const dx = (x + 0.5 - cx) / hw, v = (y - tt) / (tb - tt);
      if (snow && (v < 0.18 || (tb - y < 2 && h2(x, 1, t) < 0.7))) return R('#f4f6f2')[dx < 0 ? 0 : 1];
      /* needles: short strokes slanting down and out from the stem */
      const stroke = ((Math.floor(y + Math.abs(x - cx) * 0.6) % 3) + 3) % 3 === 0;
      let tone = dx < -0.45 ? 1 : dx < 0.2 ? 2 : dx < 0.6 ? 3 : 4; if (stroke) tone = Math.min(5, tone + 1); if (v > 0.85) tone = Math.max(tone, 4);
      return P[tone];
    });
    /* the drooping tips along each tier's foot */
    for (let x = Math.ceil(cx - hw); x < cx + hw; x += 3) { K.set(x, tb, P[4]); K.set(x + 1, tb + 1, P[5]); }
  }
}
const NATURE = {
  oak: (K, o) => broadleaf(K, o.v > 0.86 ? TREE.autumn1[0] : TREE.oak[0], K.FW / 2, K.FD - 8, 50, 80, '#6e5236', o.v * 6),
  beech: (K, o) => broadleaf(K, TREE.autumn2[0], K.FW / 2, K.FD - 8, 50, 80, '#7a6a5a', o.v * 6),
  birch: (K, o) => broadleaf(K, TREE.birch[0], K.FW / 2, K.FD - 8, 56, 62, '#eeeae0', o.v * 6, { birch: true, airy: true }),
  poplar: (K, o) => { const cx = K.FW / 2, b = K.FD - 8; trunk(K, cx, b, b - 40, '#6e5236', false, 2.8, 0); crown(K, TREE.poplar[0], cx, b - 64, 17, 44, o.v * 5, { column: true }); },
  pine: (K, o) => conifer(K, leafRamp('#4f7a3c'), K.FW / 2, K.FD - 6, 100, 66),
  snowpine: (K, o) => conifer(K, leafRamp('#456f42'), K.FW / 2, K.FD - 6, 100, 66, true),
  palm: (K, o) => {
    const cx = K.FW / 2, b = K.FD - 8, B = R('#a38158'), P = R('#7fa04c');
    for (let y = 0; y < 34; y++) { const x = cx + Math.sin(y / 14) * 4; K.rect(x - 2, b - y - 1, x + 2, b - y, B[y % 3 === 0 ? 3 : x < cx + 1 ? 1 : 2]); }
    const tx = cx + Math.sin(34 / 14) * 4, ty = b - 34;
    for (const a of [-2.8, -2.2, -1.5, -0.9, -0.3, 0.3]) for (let i = 0; i < 16; i++) { const x = tx + Math.cos(a) * i, y = ty + Math.sin(a) * i * 0.6 + i * i * 0.04; K.set(x, y, P[i < 4 ? 1 : 2]); K.set(x, y + 1, P[3]); if (i % 2) K.set(x, y - 1, P[1]); }
    K.oval(tx, ty + 1, 2, 2, R('#6e5236')[2]);
  },
  deadtree: (K, o) => { const cx = K.FW / 2, b = K.FD - 8, B = R('#7a6a58'); K.rect(cx - 2, b - 22, cx + 1, b, (x) => B[x < cx - 1 ? 1 : 3]); for (const [dx, dy, l] of [[-1, -1, 9], [1, -1, 10], [-1, -0.4, 7], [1, -0.5, 6]]) { const y0 = b - 14 - l * 0.6; for (let i = 0; i < l; i++) K.set(cx + dx * i, y0 + dy * i * 0.7, B[2]); } },
  bush: (K, o) => { const cx = K.FW / 2, b = K.FD - 6; crown(K, TREE.bush[0], cx, b - 9, 15, 9, o.v * 4 + 1, { fruit: o.v > 0.5 ? '#c4503e' : null }); },
  cactus: (K, o) => { const P = R('#7f9a5a'), cx = K.FW / 2, b = K.FD - 6, arm = (x0, y0, x1, y1) => K.rect(x0, y0, x1, y1, (x) => P[x === x0 ? 1 : x === x1 - 1 ? 3 : 2]); arm(cx - 3, b - 26, cx + 3, b); arm(cx - 10, b - 18, cx - 6, b - 10); arm(cx - 10, b - 12, cx - 3, b - 8); arm(cx + 6, b - 22, cx + 10, b - 14); arm(cx + 3, b - 16, cx + 10, b - 12); },
  reeds: (K, o) => { const P = R('#8a9a50'); for (let k = 0; k < 9; k++) { const x = 6 + h2(k, 1) * (K.FW - 12), h = 8 + h2(k, 2) * 10, b = K.FD - 6 - h2(k, 3) * 8; K.line(x, b, x + (h2(k, 4) - 0.5) * 3, b - h, P[k % 2 ? 2 : 3]); if (k % 3 === 0) K.rect(x, b - h - 3, x + 2, b - h + 1, R('#7a5a3a')[2]); } },
  mushrooms: (K, o) => { for (let k = 0; k < 3; k++) { const x = 8 + k * 7, b = K.FD - 8 - (k % 2) * 4, C = R('#c4503e'); K.rect(x, b - 3, x + 2, b, R('#eeeae0')[2]); K.oval(x + 1, b - 4, 3.5, 2.2, (px, py, dx, dy) => (h2(px, py, 1) < 0.15 ? R('#f4ecd8')[0] : C[dy < 0 ? 1 : 3])); } },
  flowers: (K, o) => { for (let k = 0; k < 10; k++) { const x = 5 + h2(k, 1, o.v * 9) * (K.FW - 10), y = 6 + h2(k, 2, o.v * 9) * (K.FD - 12), C = R(['#f4ecd8', '#d9b44a', '#c4503e', '#9a7fc0'][k % 4]); K.set(x, y + 1, R('#6f8a40')[3]); K.set(x, y, C[1]); K.set(x - 1, y, C[2]); K.set(x + 1, y, C[2]); K.set(x, y - 1, C[2]); } },
  rocks: (K, o) => { const P = R('#a59a85'); K.mass(12, K.FD - 9, 6, 4, P, 1); K.mass(21, K.FD - 7, 4, 3, P, 2); }
};

/* ---------- props ---------- */
const WOOD = '#9a7650';
const PROPS = {
  haystack: (K) => { const P = R('#d8b968'), cx = K.FW / 2; K.oval(cx, K.FD - 14, 13, 13, (x, y, dx, dy) => (dy > 0.75 ? null : P[(h2(x, y) < 0.25 ? 1 : 0) + (dx * 0.6 + dy * 0.8 < -0.3 ? 0 : dx * 0.6 + dy * 0.8 < 0.4 ? 1 : 2)])); K.rect(cx - 12, K.FD - 6, cx + 12, K.FD - 4, P[3]); },
  haybales: (K) => { const P = R('#d8b968'); for (const [x, y] of [[4, K.FD - 6], [16, K.FD - 9]]) K.box(x, y - 8, x + 12, y, 8, (px, py) => P[(px + py) % 3 === 0 ? 2 : 0], (px, py) => P[py % 3 === 0 ? 3 : 2]); },
  barrels: (K) => { const P = R('#9a6a40'); for (const [x, y] of [[9, K.FD - 6], [21, K.FD - 9], [14, K.FD - 14]]) { K.rect(x - 5, y - 10, x + 5, y, (px, py) => ((py - y) % 4 === -1 ? R('#5a5048')[2] : P[px < x - 2 ? 1 : px > x + 2 ? 3 : 2])); K.oval(x, y - 10, 5, 2, P[1]); } },
  crates: (K) => { const P = R('#b08a58'); for (const [x, y, s] of [[4, K.FD - 5, 12], [17, K.FD - 7, 11], [9, K.FD - 15, 10]]) K.box(x, y - s * 0.6, x + s, y, s, (px, py) => P[(px - x) % 4 === 0 ? 2 : 0], (px, py) => (px === x || px === x + s - 1 || py === y - s || py === y - 1 || Math.abs((px - x) - (py - (y - s))) < 1 ? P[3] : P[2])); },
  cart: (K, o) => { const P = R(WOOD), W = R('#6e5236'), ax = o.face % 2 === 0; K.box(4, 8, K.FW - 4, K.FD - 8, 10, (x, y) => R('#d8b968')[h2(x, y) < 0.3 ? 1 : 0], (x, y) => P[x % 4 === 0 ? 3 : 2]); if (ax) for (const x of [7, K.FW - 9]) K.oval(x, K.FD - 7, 3, 5, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.6 ? W[3] : W[1])); else K.oval(K.FW / 2, K.FD - 6, 6, 5, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.65 || Math.abs(dx) < 0.15 || Math.abs(dy) < 0.15 ? W[3] : null)); },
  fence: (K, o) => { const P = R(WOOD), along = (o.face || 0) % 2 === 0; if (along) { for (const x of [2, Math.round(K.FW / 2) - 1, K.FW - 4]) K.rect(x, K.FD - 18, x + 3, K.FD - 6, (px) => P[px === x ? 1 : 3]); K.rect(0, K.FD - 16, K.FW, K.FD - 14, P[1]); K.rect(0, K.FD - 11, K.FW, K.FD - 9, P[2]); } else { const cx = K.FW / 2; for (let y = 2; y < K.FD; y += K.FD / 2 - 1) K.rect(cx - 1, y - 12, cx + 2, y, P[2]); K.rect(cx - 1, -10, cx + 1, K.FD - 12, P[1]); K.rect(cx, -6, cx + 2, K.FD - 7, P[3]); } },
  well: (K) => { const S = R('#c4b99f'), cx = K.FW / 2, yb = K.FD - 6; K.rect(cx - 11, yb - 10, cx + 11, yb, (x, y) => wallTone('stone', S, x, y)); K.oval(cx, yb - 10, 11, 5, S[1]); K.oval(cx, yb - 10, 8, 3, R('#2f3e46')[3]); const W = R('#7a5a3a'); K.rect(cx - 11, yb - 30, cx - 9, yb - 8, W[2]); K.rect(cx + 9, yb - 30, cx + 11, yb - 8, W[3]); K.poly([[cx - 14, yb - 28], [cx, yb - 38], [cx + 14, yb - 28]], (x, y) => R(ROOF.shingle)[x > cx ? 3 : 1]); K.line(cx, yb - 28, cx, yb - 16, R('#bfa47a')[3]); K.rect(cx - 2, yb - 17, cx + 2, yb - 13, W[1]); },
  scarecrow: (K) => { const cx = K.FW / 2, b = K.FD - 6, W = R('#7a5a3a'); K.rect(cx - 1, b - 30, cx + 1, b, W[2]); K.rect(cx - 10, b - 24, cx + 10, b - 22, W[3]); K.rect(cx - 6, b - 26, cx + 6, b - 14, R('#7d6a9a')[2]); K.oval(cx, b - 30, 4, 4, R('#d8b968')[1]); K.rect(cx - 6, b - 35, cx + 6, b - 33, R('#6e5236')[2]); K.rect(cx - 3, b - 38, cx + 3, b - 34, R('#6e5236')[1]); },
  stones: (K) => { const P = R('#a9a08c'); for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, x = K.FW / 2 + Math.cos(a) * K.FW * 0.34, y = K.FD / 2 + Math.sin(a) * K.FD * 0.3; K.rect(x - 3, y - 18, x + 3, y, (px, py) => P[px < x - 1 ? 1 : px > x + 1 ? 3 : 2]); K.rect(x - 3, y - 19, x + 3, y - 17, P[0]); } },
  boulders: (K) => { const P = R('#a59a85'); K.mass(12, K.FD - 11, 9, 7, P, 1); K.mass(22, K.FD - 8, 6, 5, P, 2); },
  stump: (K) => { const P = R('#7a5a3a'), cx = K.FW / 2; K.rect(cx - 6, K.FD - 14, cx + 6, K.FD - 7, (x) => P[x < cx - 3 ? 1 : x > cx + 2 ? 3 : 2]); K.oval(cx, K.FD - 14, 6, 3, (x, y, dx, dy) => R('#d0b48a')[Math.round(Math.hypot(dx, dy) * 3) % 2 ? 1 : 2]); },
  logpile: (K) => { const P = R('#8e6a44'); for (const [x, y] of [[6, K.FD - 7], [14, K.FD - 7], [22, K.FD - 7], [10, K.FD - 13], [18, K.FD - 13]]) { K.oval(x, y, 4.5, 4, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.75 ? P[3] : R('#d0b48a')[Math.hypot(dx, dy) > 0.35 ? 1 : 2])); } },
  lamppost: (K) => { const cx = K.FW / 2, b = K.FD - 6, I = R('#3b3a38'); K.rect(cx - 1, b - 34, cx + 1, b, I[2]); K.rect(cx - 3, b - 2, cx + 3, b, I[3]); K.rect(cx - 4, b - 42, cx + 4, b - 34, (x, y) => (x === cx - 4 || x === cx + 3 ? I[2] : R('#f6d36a')[y < b - 38 ? 0 : 1])); K.rect(cx - 5, b - 44, cx + 5, b - 42, I[2]); },
  signpost: (K) => { const cx = K.FW / 2, b = K.FD - 6, W = R(WOOD); K.rect(cx - 1, b - 28, cx + 1, b, W[2]); K.rect(cx - 10, b - 26, cx + 8, b - 21, (x) => (x === cx - 10 ? W[3] : W[1])); K.rect(cx - 8, b - 18, cx + 10, b - 13, (x) => (x === cx + 9 ? W[3] : W[1])); },
  stall: (K, o) => { const { FW, FD } = K, W = R(WOOD), A = R(['#b8483a', '#4f6a9a', '#d9b44a'][Math.floor(o.v * 3) % 3]); K.box(3, FD - 14, FW - 3, FD - 4, 12, (x, y) => (h2(x, y) < 0.35 ? R(['#c4503e', '#d9b44a', '#7f9a5a'][Math.floor(h2(x, 3) * 3)])[1] : W[1]), (x, y) => W[x % 4 === 0 ? 3 : 2]); for (const x of [3, FW - 5]) K.rect(x, FD - 38, x + 2, FD - 14, W[3]); K.rect(0, FD - 44, FW, FD - 34, (x, y) => (Math.floor(x / 4) % 2 ? R('#f0e6cb')[y > FD - 37 ? 2 : 1] : A[y > FD - 37 ? 2 : 1])); for (let x = 0; x < FW; x += 4) K.oval(x + 2, FD - 34, 2, 1.5, Math.floor(x / 4) % 2 ? R('#f0e6cb')[2] : A[2]); },
  beehives: (K) => { const P = R('#d8b968'); for (const x of [9, 22]) { K.oval(x, K.FD - 12, 6, 7, (px, py, dx, dy) => (dy > 0.85 ? null : P[(py % 3 === 0) ? 3 : dx < -0.3 ? 0 : dx > 0.4 ? 2 : 1])); K.rect(x - 1, K.FD - 9, x + 1, K.FD - 7, R('#2a2018')[2]); } },
  campfire: (K) => { const cx = K.FW / 2, b = K.FD - 9, S = R('#a59a85'); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; K.oval(cx + Math.cos(a) * 8, b + Math.sin(a) * 4, 2.5, 2, S[k % 2 ? 1 : 2]); } K.poly([[cx - 5, b + 1], [cx - 2, b - 9], [cx, b - 4], [cx + 2, b - 11], [cx + 5, b + 1]], (x, y) => R('#f4a03a')[y < b - 6 ? 0 : 1]); K.poly([[cx - 2, b + 1], [cx, b - 5], [cx + 2, b + 1]], R('#f6d36a')[0]); },
  statue: (K) => { const cx = K.FW / 2, b = K.FD - 6, S = R('#c8c4b8'); K.box(cx - 9, b - 8, cx + 9, b, 8, S[1], S[3]); K.rect(cx - 4, b - 30, cx + 4, b - 8, (x) => S[x < cx - 1 ? 1 : x > cx + 1 ? 3 : 2]); K.oval(cx, b - 33, 3.5, 3.5, S[1]); K.rect(cx + 4, b - 30, cx + 6, b - 20, S[3]); K.rect(cx - 7, b - 34, cx - 5, b - 22, S[1]); },
  graves: (K) => { const S = R('#b3aa96'); for (const [x, y] of [[8, K.FD - 14], [22, K.FD - 14], [15, K.FD - 5]]) { K.rect(x - 4, y - 10, x + 4, y, (px) => S[px < x - 2 ? 1 : px > x + 2 ? 3 : 2]); K.oval(x, y - 10, 4, 3, S[1]); K.rect(x - 1, y - 9, x + 1, y - 3, S[4]); K.rect(x - 3, y - 7, x + 3, y - 6, S[4]); } },
  obelisk: (K) => { const cx = K.FW / 2, b = K.FD - 6, S = R('#c8c0aa'); K.box(cx - 8, b - 6, cx + 8, b, 5, S[1], S[3]); K.poly([[cx - 5, b - 5], [cx - 3, b - 50], [cx, b - 56], [cx + 3, b - 50], [cx + 5, b - 5]], (x) => S[x < cx ? 1 : 3]); },
  rowboat: (K, o) => { const W = R('#8e6a44'), ax = (o.face || 0) % 2 === 0, cx = K.FW / 2, cy = K.FD / 2; if (ax) { K.oval(cx, cy, 14, 6, (x, y, dx, dy) => (Math.hypot(dx, dy) > 0.75 ? W[3] : dy < 0 ? W[1] : W[2])); K.rect(cx - 1, cy - 5, cx + 2, cy + 5, W[4]); } else { K.oval(cx, cy, 6, 13, (x, y, dx, dy) => (Math.hypot(dx, dy) > 0.75 ? W[3] : dx < 0 ? W[1] : W[2])); K.rect(cx - 5, cy - 1, cx + 5, cy + 2, W[4]); } }
};

/* ---------- interiors ---------- */
/* ---------- room walls ----------
   Interior walls are a band through the middle of their tile, ROOMW high, 2·RT thick, with an arm out to each side
   it joins (links: [+x, +y, -x, -y], tiles/index.js). A run across the view (east-west) shows its face: a timber
   beam along its top, lime plaster mottled a little, a skirting board at its foot, and its capping beam on top. A run
   up the view (north-south) shows its capping beam and, beside it, its east face in shade, so it reads as a wall and
   not a crack in the floor. A free end shows its end in shade too. Where a wall joins the next there is no ink, so a
   room's walls run on as one (pieceSprite). A doorway is an opening in a wall: the wall on either side, timber
   jambs, a lintel carrying the capping beam over it, and a sill on the floor between. */
const ROOMW = 34, RT = 5, RSIDE = 4, DOOR_HALF = 21;
const HUNG_WALLS = ['wallshelf', 'wallantlers', 'wallshield', 'wallsconce', 'wallbar', 'walltools', 'wallpotions', 'wallherbs', 'wallchart'];
const WALLS_JOINED = new Set(['iwall', 'iwindow', 'idoor', 'hearth', ...HUNG_WALLS]);
function wallKit(K) {
  const { FW } = K, c0 = FW / 2 - RT, c1 = FW / 2 + RT, P = R(WALL.plaster), Tp = R('#7a5a3a'), H = ROOMW;
  /* the face of a run across the view at rows (b - H .. b), r counted from its top */
  const face = (x, y, b) => {
    const r = y - (b - H);
    if (r < 3) return Tp[r === 0 ? 1 : 2];
    if (r >= H - 5) return Tp[r === H - 5 ? 0 : r === H - 1 ? 4 : 3];
    const n = h2(x >> 1, (y >> 1) + 3, 11); return P[n < 0.07 ? 3 : n > 0.93 ? 1 : 2];
  };
  const cap = (x, y) => Tp[h2(x >> 2, y, 12) < 0.12 ? 3 : (x + 2 * y) % 9 === 0 ? 2 : 1];
  const side = (x, y, foot) => (y >= foot - 5 ? Tp[4] : P[(x - c1) === 0 ? 3 : 4]);
  const W = {
    c0, c1, P, Tp, H,
    /* a run across the view from a0 to a1, its face shown, and its east end if free */
    across(a0, a1, eastEnd, window = false) {
      K.rect(a0, c0 - H, a1, c1 - H, cap);
      K.rect(a0, c1 - H, a1, c1, (x, y) => {
        if (window) { const m = (a0 + a1) / 2, dx = Math.abs(x + 0.5 - m), r = y - (c1 - H); if (dx < 8 && r >= 7 && r < 22) return dx > 6.5 || r === 7 || r === 21 ? Tp[2] : Math.abs(x + 0.5 - m) < 0.8 || r === 14 ? Tp[3] : R('#9cc0d0')[r < 11 ? 0 : r < 16 ? 1 : 2]; if (dx < 9 && r === 22) return Tp[1]; }
        return face(x, y, c1);
      });
      if (eastEnd) K.rect(a1, c0 - H + 1, a1 + RSIDE, c1, (x, y) => side(x, y, c1));
    },
    /* a run up the view from a0 (north) to a1 (south): its capping beam, its east face, and its south end if free */
    upDown(a0, a1, southEnd) {
      K.rect(c1, a0 - H + 1, c1 + RSIDE, a1, (x, y) => side(x, y, a1));
      K.rect(c0, a0 - H, c1, a1 - H, cap);
      if (southEnd) K.rect(c0, a1 - H, c1, a1, (x, y) => face(x, y, a1));
    }
  };
  return W;
}
function roomWall(K, o, window = false) {
  const { FW, FD } = K, L = o.links || [0, 0, 0, 0], W = wallKit(K), { c0, c1 } = W;
  const across = L[0] || L[2] || !(L[1] || L[3]);
  /* the arm to the north behind, the run across, then the arm to the south in front */
  if (L[3]) W.upDown(0, c1, false);
  if (across) W.across(L[2] ? 0 : c0, L[0] ? FW : c1, !L[0], window && across);
  else W.upDown(c0, c1, !L[1]);
  if (L[1]) W.upDown(across ? c1 : c0, FD, false);
  /* a window in a run up the view: a slit of glass in its east face */
  if (window && !across) K.rect(c1, FD / 2 - 12 - ROOMW / 2, c1 + RSIDE, FD / 2 + 12 - ROOMW / 2, (x, y) => (y % 12 === 0 ? W.Tp[2] : R('#9cc0d0')[x === c1 ? 1 : 2]));
}
/* a doorway: an opening DOOR_HALF either side of the middle of the tile, the wall on either side of it */
function roomDoor(K, o) {
  const { FW, FD } = K, L = o.links || [0, 0, 0, 0], W = wallKit(K), { c0, c1, Tp, H } = W, m = FW / 2, d0 = m - DOOR_HALF, d1 = m + DOOR_HALF;
  const across = L[0] || L[2] || !(L[1] || L[3]), sill = R('#8e6a44');
  if (across) {
    /* the sill on the floor, the wall either side, the lintel and capping beam over the opening, the jambs */
    K.rect(d0, c0, d1, c1, (x, y) => sill[y === c0 ? 3 : x % 6 === 0 ? 2 : 1]);
    W.across(L[2] ? 0 : d0 - 6, d0, false); W.across(d1, L[0] ? FW : d1 + 6, !L[0]);
    K.rect(d0, c0 - H, d1, c1 - H, (x, y) => Tp[h2(x >> 2, y, 12) < 0.12 ? 3 : 1]);
    K.rect(d0, c1 - H, d1, c1 - H + 5, (x, y) => Tp[y === c1 - H + 4 ? 4 : y === c1 - H ? 1 : 2]);
    for (const [a, b, lit] of [[d0, d0 + 3, true], [d1 - 3, d1, false]]) K.rect(a, c1 - H + 5, b, c1, (x) => Tp[lit ? (x === a ? 1 : 2) : (x === b - 1 ? 4 : 3)]);
  } else {
    const e0 = FD / 2 - DOOR_HALF, e1 = FD / 2 + DOOR_HALF;
    K.rect(c0, e0, c1, e1, (x, y) => sill[x === c0 ? 3 : y % 6 === 0 ? 2 : 1]);
    W.upDown(L[3] ? 0 : e0 - 6, e0, true); K.rect(c0, e0 - H, c1, e1 - H, (x, y) => Tp[h2(x, y >> 2, 12) < 0.12 ? 3 : 1]);
    /* the jambs at either end of the opening, then the wall to the south in front */
    for (const y of [e0, e1]) K.rect(c0 - 1, y - H, c1 + 1, y, (x, yy) => Tp[yy < y - H + 2 ? 1 : x === c0 - 1 ? 2 : 3]);
    W.upDown(e1, L[1] ? FD : e1 + 6, !L[1]);
  }
}
/* ---------- the fireplace ----------
   A fireplace stands in a room wall, the wall running into it from either side. A chimney breast of coursed stone
   projects from the wall into the room it faces, a narrower stack rising from it above the wall's top under a stone
   cap. In its face an arched firebox: soot, firedogs and two logs, a fire on them (its flames flicker in the town view,
   FIRE gives where), under a lintel stone with a keystone. Above it a timber mantel shelf with candlesticks and a jug;
   before it a flagstone hearth on the floor, and the fire's warm light spilling over the hearth and the floor. Facing
   the viewer's way (face 0, in a north wall) all of it shows; in a side wall the breast is seen from its side, the
   fire on its flank; in a south wall, facing away, the chimney rises behind the wall. */
const BREAST = 26, PROJECT = 16, FIREBOX = 15;
const stoneAt = (S, x, y, x0) => { const row = Math.floor(y / 6), off = row % 2 ? 7 : 0, col = ((x - x0 + off) % 13 + 13) % 13; return y % 6 === 0 || col === 0 ? S[3] : S[h2(Math.floor((x - x0 + off) / 13), row, 21) < 0.3 ? 1 : 2]; };
function flame(K, cx, base, w, h) {
  /* a fire seen from the front: tongues of flame of uneven height, white-yellow at the heart, orange, then red */
  const Y = R('#f6d36a'), O = R('#f08a2a'), Rd = R('#c8502a');
  for (let i = -w; i <= w; i++) {
    const t = 1 - Math.abs(i) / (w + 1), hh = Math.max(1, Math.round(h * t * (0.6 + 0.4 * h2(i + 9, 3, 41))));
    for (let k = 0; k < hh; k++) { const f = k / hh; K.set(cx + i, base - k, f > 0.72 ? Rd[1] : f > 0.42 || Math.abs(i) > w * 0.6 ? O[1] : t > 0.6 && f < 0.25 ? R('#fff4c0')[0] : Y[0]); }
  }
}
function roomHearth(K, o) {
  const { FW, FD } = K, f = facing(o), L = o.links || [0, 0, 0, 0], W = wallKit(K), { c0, c1, H } = W, m = FW / 2, S = R('#bdb4a2'), Wd = R('#7a5a3a'), G = R('#c9a24f');
  const across = f % 2 === 0;
  const glow = (cx, cy, rx, ry) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const d = Math.hypot((x - cx) / rx, (y - cy) / ry); if (d > 1) continue; const a = Math.round(70 * (1 - d) * (1 - d)); if (!K.get(x, y)) K.set(x, y, R('#f4a03a')[1], a); } };
  /* a block of stone [x0, x1) × [y0, y1) on the floor, z0..z1 high: its top, its face, its east side in shade */
  const block = (x0, y0, x1, y1, z0, z1, faceFn = null) => {
    K.rect(x0, y1 - z1, x1, y1 - z0, (x, y) => (faceFn && faceFn(x, y)) || (y === y1 - z1 ? S[0] : stoneAt(S, x, y, x0)));
    K.rect(x0, y0 - z1, x1, y1 - z1, (x, y) => (y >= y1 - z1 - 1 ? S[0] : (y - (y0 - z1)) % 8 === 0 || ((x - x0 + (Math.floor((y - y0 + z1) / 8) % 2) * 9) % 17) === 0 ? S[2] : S[h2(x >> 3, y >> 3, 27) < 0.3 ? 0 : 1]));
    K.rect(x1, y0 - z1 + 1, x1 + 3, y1 - z0, (x, y) => S[y > y1 - z0 - 3 ? 4 : 3]);
  };
  if (across) {
    const front = f === 0, b0 = front ? c0 - 3 : c0 - PROJECT, b1 = front ? c1 + PROJECT : c1 + 3, bx0 = m - BREAST, bx1 = m + BREAST;
    if (!front) { block(bx0, b0, bx1, b1, 0, H + 2); block(m - 14, b0 + 1, m + 14, b0 + 15, H + 2, H + 18); block(m - 16, b0, m + 16, b0 + 16, H + 18, H + 20); }
    /* the wall either side, drawn round the breast */
    W.across(L[2] ? 0 : c0, L[0] ? FW : c1, !L[0]);
    if (!front) return;
    /* the hearth on the floor and the firelight over it */
    K.rect(m - 28, b1, m + 28, b1 + 12, (x, y) => (y === b1 || (x - m + 28) % 14 === 0 || y === b1 + 6 ? S[3] : S[h2(x >> 3, y >> 2, 23) < 0.3 ? 0 : 1]));
    glow(m, b1 + 8, 40, 14);
    /* the breast with its firebox, lintel and keystone; the stack and its cap above */
    const fb = (x, y) => {
      const r = b1 - y, dx = Math.abs(x + 0.5 - m);
      if (dx < FIREBOX + 3 && r >= 20 && r < 23) return dx < 2.5 ? S[0] : S[r === 22 ? 1 : 2];
      const top = 20 - Math.max(0, (dx - FIREBOX + 5) * 0.8);
      if (dx < FIREBOX && r < top) return r < 2 ? R('#3a2c20')[2] : (h2(x >> 2, y >> 1, 25) < 0.25 ? R('#4a3424')[3] : R('#2a2018')[r > 12 ? 4 : 3]);
      return null;
    };
    block(bx0, b0, bx1, b1, 0, H + 2, fb);
    block(m - 14, b0 + 1, m + 14, b0 + 15, H + 2, H + 18);
    block(m - 16, b0, m + 16, b0 + 16, H + 18, H + 20, (x, y) => S[y === b0 + 16 - H - 20 ? 0 : 3]);
    /* firedogs, logs and the fire */
    for (const dx of [-9, 9]) K.rect(m + dx - 1, b1 - 6, m + dx + 1, b1 - 1, R('#3b3a38')[2]);
    K.rect(m - 11, b1 - 5, m + 11, b1 - 3, (x) => Wd[x % 5 === 0 ? 4 : 3]); K.rect(m - 9, b1 - 7, m + 10, b1 - 5, (x) => Wd[x % 4 === 0 ? 3 : 2]);
    for (let i = -11; i <= 11; i += 2) K.set(m + i, b1 - 2, R('#f4a03a')[h2(i, 1, 2) < 0.5 ? 0 : 2]);
    flame(K, m, b1 - 7, 9, 11);
    /* the mantel shelf and what stands on it */
    K.rect(bx0 - 4, b1 - 31, bx1 + 4, b1 - 28, (x) => Wd[x === bx0 - 4 ? 1 : 0]);
    K.rect(bx0 - 4, b1 - 28, bx1 + 4, b1 - 25, (x) => Wd[x === bx1 + 3 ? 4 : 2]);
    K.rect(bx0 - 2, b1 - 25, bx1 + 2, b1 - 24, S[4]);
    for (const cx of [bx0 + 4, bx1 - 5]) { K.rect(cx - 1, b1 - 33, cx + 2, b1 - 31, G[1]); K.rect(cx, b1 - 38, cx + 1, b1 - 33, R('#f4efe2')[0]); K.set(cx, b1 - 39, R('#f6d36a')[0]); K.set(cx, b1 - 40, R('#f4a03a')[1], 160); }
    K.rect(m - 2, b1 - 37, m + 2, b1 - 31, (x) => R('#c97a56')[x < m - 1 ? 1 : x > m ? 3 : 2]); K.rect(m - 1, b1 - 38, m + 1, b1 - 37, R('#c97a56')[1]);
  } else {
    /* in a wall up the view: the wall's run, then the breast standing out from it the way it faces, seen side on */
    const east = f === 1, a0 = east ? c0 - 3 : c0 - PROJECT, a1 = east ? c1 + PROJECT : c1 + 3, by0 = m - BREAST, by1 = m + BREAST;
    if (L[3]) W.upDown(0, by0, false);
    if (!east) { K.rect(a0 - 12, by0 - 2, a0, by1 + 2, (x, y) => S[(x + y) % 9 === 0 || y === by0 - 2 ? 3 : 1]); glow(a0 - 10, m, 18, 34); }
    else { K.rect(a1, by0 - 2, a1 + 12, by1 + 2, (x, y) => S[(x + y) % 9 === 0 || y === by0 - 2 ? 3 : 1]); glow(a1 + 12, m, 18, 34); }
    block(a0, by0, a1, by1, 0, H + 2);
    block(c0 - 1, m - 12, c1 + 1, m + 12, H + 2, H + 18);
    /* the fire on the flank it faces: seen past the breast's edge, on the east, as the east side shows */
    if (east) {
      K.rect(a1, by0 + 6 - H, a1 + 6, by1 - 4, (x, y) => (y > m + 8 && y < by1 - 6 ? R('#2a2018')[3] : S[x === a1 ? 2 : 3]));
      for (let k = 0; k < 10; k++) for (let i = 0; i < 5; i++) if (h2(i, k, 7) < 0.8 - k * 0.07) K.set(a1 + 1 + i, by1 - 7 - k, k > 6 ? R('#c8502a')[1] : k > 3 ? R('#f08a2a')[1] : R('#f6d36a')[0]);
      K.rect(a1 + 6, by0 - 8 - H + 12, a1 + 9, by1 - 30, Wd[2]);
    }
    if (L[1]) W.upDown(by1, FD, false); else if (!L[3]) W.upDown(by1, by1 + 1, true);
  }
}
/* where the fire burns in a fireplace's sprite (drawing coordinates), for the town view to flicker: { x, y, w, h }
   with (x, y) the middle of its base; null where it cannot be seen */
const FIRE = o => {
  const f = facing(o), m = T / 2, c1 = T / 2 + RT;
  if (f === 0) return { x: m, y: c1 + PROJECT - 7, w: 9, h: 11 };
  if (f === 1) return { x: c1 + PROJECT + 3, y: m + BREAST - 7, w: 2, h: 9 };
  return null;
};
const facing = o => (o.face || 0);

/* ---------- furniture ----------
   Each piece is made of blocks in its own frame, described as if it faced south: a across it from its left to its
   right (0..WD), b from its back to its front (0..DD), z up from the floor, in pixels at the figures' scale (32 to a
   tile; a figure stands about 30 high). The frame is turned to the piece's facing, so a turned piece shows its side,
   and from behind its back, as it would: drawers, doors and locks only where its front faces the viewer. A block is
   drawn as the town's houses are, seen from the south and a little east with the light from the upper left: a lit top
   (its grain or pattern running the way the piece does), a face toward the viewer, a dark sliver of its east side,
   and a lit edge where top meets face. Blocks are drawn back to front, then each piece throws a soft shadow east. */
/* materials: a top, a face and a side colour, each a five-step ramp */
const MAT = {
  oak: ['#b48c5c', '#8c6842', '#5c4128'], walnut: ['#9a7350', '#73523a', '#4a3424'], pine: ['#c9a676', '#a5825a', '#6e5236'],
  iron: ['#6f7276', '#4e5054', '#34363a'], brass: ['#e2c26a', '#c9a24f', '#8e6e30'], stone: ['#ddd5c2', '#bfb59f', '#8f8672'],
  linen: ['#f6f1e4', '#e2d9c4', '#b9ae96'], straw: ['#e2cb84', '#c9ae64', '#9a8248'], clay: ['#c97a56', '#a85e40', '#7a4430'],
  red: ['#c25a46', '#a3443a', '#74302a'], blue: ['#6f8fb4', '#56769a', '#3e5470'], green: ['#7f9e62', '#64824c', '#465c36'],
  velvet: ['#b03a30', '#8e2c26', '#5e1e1c'], gold: ['#ecd27c', '#d1ae58', '#97763a']
};
const mat = k => MAT[k].map(R);
/* footprint rect of the local box [a0, a1) × [b0, b1) for facing f, in a piece WD across and DD deep */
function turned(f, WD, DD, a0, a1, b0, b1) {
  return f === 0 ? [a0, b0, a1, b1] : f === 2 ? [WD - a1, DD - b1, WD - a0, DD - b0] : f === 1 ? [b0, a0, b1, a1] : [DD - b1, WD - a1, DD - b0, WD - a0];
}
/* which face of the piece's own a box shows toward the viewer (south), and which as its east side */
const SOUTH = ['front', 'right', 'back', 'left'], EAST = ['right', 'front', 'left', 'back'];
function furniture(K, o, WD, DD) {
  const f = facing(o), parts = [];
  const F = {
    f, ns: f % 2 === 0, south: SOUTH[f], east: EAST[f],
    /* a block [a0, a1) × [b0, b1) from z0 to z1 in material m (a MAT key or three ramps); style may give top(u, v, x, y) or
       face(s, t, which, x, y) colours (u, v across and along the piece's top, 0..1; s, t across and down the face shown),
       or null to fall back to the material */
    box(a0, a1, b0, b1, z0, z1, m, style = {}) {
      const [x0, y0, x1, y1] = turned(f, WD, DD, a0, a1, b0, b1), M3 = typeof m === 'string' ? mat(m) : m;
      parts.push({ x0, x1, y0, y1, z0, z1, draw: () => {
        const ux = (x, y) => { const fx = x + 0.5, fy = y + z1 + 0.5; const [a, b] = f === 0 ? [fx, fy] : f === 2 ? [WD - fx, DD - fy] : f === 1 ? [fy, fx] : [WD - fy, DD - fx]; return [(a - a0) / (a1 - a0), (b - b0) / (b1 - b0)]; };
        /* the face toward the viewer */
        for (let y = Math.ceil(y1 - z1); y < y1 - z0; y++) for (let x = Math.ceil(x0); x < x1; x++) {
          const s = (x + 0.5 - x0) / (x1 - x0), t = (y + 0.5 - (y1 - z1)) / Math.max(1, z1 - z0);
          let c = style.face && style.face(s, t, F.south, x, y);
          /* a tall face with nothing else on it is a framed, sunken panel: the frame lit, the panel's top and west edges
             in the frame's shadow */
          const W0 = Math.ceil(x0), H0 = Math.ceil(y1 - z1), wide = x1 - x0, tall = z1 - z0;
          if (!c && tall >= 12 && wide >= 8 && style.panel !== false) {
            const px = x - W0, py = y - H0, inX = px >= 2 && px < wide - 2, inY = py >= 3 && py < tall - 3;
            c = !(inX && inY) ? M3[1][py === 0 || px === 0 ? 1 : py >= tall - 1 ? 3 : 1] : (px === 2 || py === 3) ? M3[1][3] : (px === Math.ceil(wide) - 3 || py === tall - 4) ? M3[1][1] : M3[1][2];
          }
          if (!c) c = M3[1][y === Math.ceil(y1 - z1) ? 1 : x === Math.ceil(x0) ? 1 : y >= y1 - z0 - 1 ? 3 : 2];
          K.set(x, y, c);
        }
        /* the top, its south edge lit */
        for (let y = Math.ceil(y0 - z1); y < y1 - z1; y++) for (let x = Math.ceil(x0); x < x1; x++) {
          const [u, v] = ux(x, y); let c = style.top && style.top(u, v, x, y);
          if (!c) c = M3[0][y >= y1 - z1 - 1 ? 0 : x === Math.ceil(x0) ? 1 : (F.ns ? (h2(x >> 1, y * 3, 7) < 0.12) : (h2(x * 3, y >> 1, 7) < 0.12)) ? 3 : 2];
          K.set(x, y, c);
        }
        /* a sliver of the east side, in shade */
        if (z1 - z0 >= 3 && !style.noSide) for (let y = Math.ceil(y0 - z1 + 1); y < y1 - z0; y++) K.set(Math.ceil(x1), y, M3[2][y < y1 - z1 ? 2 : 3]);
      } });
      return F;
    },
    /* anything else, drawn in turn at local (a, b) on the floor or lifted to z: fn(x, y) gets the screen point */
    at(a, b, z, fn) {
      const [x0, y0] = turned(f, WD, DD, a, a + 0.001, b, b + 0.001);
      parts.push({ x0, x1: x0 + 0.001, y0, y1: y0 + 0.001, z0: z, z1: z, draw: () => fn(Math.round(x0), Math.round(y0 - z)) });
      return F;
    },
    /* the four legs of a frame [a0, a1) × [b0, b1), w square, up to z */
    legs(a0, a1, b0, b1, z, m, w = 2) { for (const a of [a0, a1 - w]) for (const b of [b0, b1 - w]) F.box(a, a + w, b, b + w, 0, z, m, { noSide: true }); return F; },
    done(shade = 4) {
      for (const p of order(parts)) p.draw();
      /* a soft shadow east of it and under it, on the floor, fitted to the blocks it stands on */
      const boxes = parts.filter(p => p.x1 - p.x0 > 0.01 && !p.z0);
      if (shade && boxes.length) K.shadow(Math.min(...boxes.map(p => p.x0)) + 1, Math.min(...boxes.map(p => p.y0)), Math.max(...boxes.map(p => p.x1)) - 1, Math.max(...boxes.map(p => p.y1)), shade);
    }
  };
  return F;
}
/* the blocks of a piece in drawing order: one drawn after another it stands in front of, or on top of, where the two
   overlap across the view; otherwise in the order given */
function order(parts) {
  const n = parts.length, after = parts.map(() => []), need = new Array(n).fill(0), e = 0.01;
  const over = (p, q) => p.x0 < q.x1 - e && q.x0 < p.x1 - e;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const p = parts[i], q = parts[j]; if (!over(p, q) && !(p.x1 - p.x0 < 0.01 || q.x1 - q.x0 < 0.01 ? p.x0 >= q.x0 - e && p.x0 <= q.x1 + e || q.x0 >= p.x0 - e && q.x0 <= p.x1 + e : false)) continue;
    let first = 0;
    if (q.y0 >= p.y1 - e) first = 1; else if (p.y0 >= q.y1 - e) first = -1;
    else if (q.z0 >= p.z1 - e) first = 1; else if (p.z0 >= q.z1 - e) first = -1;
    if (first === 1) { after[i].push(j); need[j]++; } else if (first === -1) { after[j].push(i); need[i]++; }
  }
  const out = [], ready = parts.map((p, i) => i).filter(i => !need[i]);
  while (ready.length) { ready.sort((a, b) => a - b); const i = ready.shift(); out.push(parts[i]); for (const j of after[i]) if (!--need[j]) ready.push(j); }
  /* a cycle (it should not happen) falls back to the order given */
  for (let i = 0; i < n; i++) if (!out.includes(parts[i])) out.push(parts[i]);
  return out;
}
/* little things set on furniture: a jug, a mug, a plate, a candle with its flame, a book */
const JUG = (K, x, y) => { const C = R('#c97a56'); K.rect(x - 2, y - 6, x + 2, y, (px, py) => C[px < x - 1 ? 1 : px > x ? 3 : 2]); K.rect(x - 1, y - 7, x + 1, y - 6, C[1]); K.set(x + 2, y - 4, C[3]); K.set(x + 2, y - 3, C[3]); };
const MUG = (K, x, y) => { const C = R('#8e6a44'); K.rect(x - 1, y - 3, x + 1, y, C[1]); K.set(x + 1, y - 2, C[3]); K.set(x - 1, y - 3, R('#f6f1e4')[0]); };
const PLATE = (K, x, y) => { const C = R('#f2ece0'); K.oval(x, y - 1, 3, 1.5, (px, py, dx, dy) => C[Math.hypot(dx, dy) > 0.6 ? 2 : 0]); };
const CANDLE = (K, x, y, h = 4) => { const W = R('#f4efe2'); K.rect(x, y - h, x + 1, y, W[1]); K.set(x, y - h - 1, R('#f6d36a')[0]); K.set(x, y - h - 2, R('#f4a03a')[1]); for (const [dx, dy] of [[-1, -h - 1], [1, -h - 1], [0, -h - 3]]) K.set(x + dx, y + dy, R('#f6d36a')[0], 90); };
const BOOK = (K, x, y, col = '#4f6a9a') => { const C = R(col); K.rect(x - 3, y - 2, x + 3, y, (px, py) => (py === y - 2 ? R('#f2ece0')[1] : C[2])); K.rect(x - 3, y - 3, x + 3, y - 2, C[1]); };
const BLANKET = ['red', 'blue', 'green'];

/* ---------- the tavern's pieces ----------
   A bar counter, the table sets and the back bar and casks are drawn at the figures' scale across their whole tile
   (FULL), not a third of it as the rest of the furniture is: a table with its chairs pulled up round it fills a tile,
   and the bar's pieces meet the next across the tile's edge. */
/* a bar counter, built a tile at a time: it joins the bar pieces beside it (links, as the room walls do), so a run of
   them makes one counter, straight or round a corner. In its tile it is a band BAR_D either side of the middle, BAR_H
   high: a front of raised panels between stiles over a kick board, a polished oak top overhanging it, and a brass foot
   rail on brackets along the side its customers stand (the way it faces). Tankards, a jug, a candle and a few coins
   stand along the top. Where it meets the next piece there is no ink (pieceSprite). */
const BAR_D = 10, BAR_H = 15, BAR_BACK = 32, REACH = T / 2 - RT;
/* the front of the worktop of a back bar in the wall north of a tile (wallbar: backBar at T / 2 + RT + 1, 18 deep), in
   that tile's pixels */
const BACKBAR_FRONT = RT + 19 - T / 2;
/* the runs of counter in a bar piece's tile, [a0, a1, b0, b1, along x] in tile pixels. o.shift ([x, y], fitTo) sets the
   counter back from the middle of its tiles toward the back of the bar, the same all along a run of joined pieces; a
   free end with a room wall beside it (o.ends, [+x, +y, -x, -y]) runs on to the wall's face, or, where the wall to
   the north carries a back bar (ends 2), up to the back bar's worktop. */
function barRuns(o) {
  const L = o.links || [0, 0, 0, 0], E = o.ends || [0, 0, 0, 0], f = facing(o), d = BAR_D, any = L.some(Boolean), [sx, sy] = o.shift || [0, 0];
  const mx = T / 2 + sx, my = T / 2 + sy, runs = [];
  const end = (k, joined, centre, alone) => (L[k] ? joined : E[k] === 2 && k === 3 ? BACKBAR_FRONT : E[k] ? (joined ? joined + REACH : -REACH) : any ? centre : alone);
  if (L[0] || L[2] || (!any && f % 2 === 0)) {
    runs.push([end(2, 0, mx - d, 10), end(0, T, mx + d, T - 10), my - d, my + d, true]);
    if (L[3]) runs.push([mx - d, mx + d, 0, my - d, false]);
    if (L[1]) runs.push([mx - d, mx + d, my + d, T, false]);
  } else runs.push([mx - d, mx + d, end(3, 0, my - d, 10), end(1, T, my + d, T - 10), false]);
  return runs;
}
/* the bar stools pulled up to a bar piece on its customers' side, [x, y] in tile pixels: up to two a tile, by o.v */
function barStools(o) {
  const f = facing(o), v = Math.floor((o.v ?? 0.5) * 997), out = [];
  for (const [a0, a1, b0, b1, ax] of barRuns(o)) {
    if (ax !== (f % 2 === 0)) continue;
    for (const p of [24, 72]) {
      if (h2(p, v, 12) > 0.75 || p < (ax ? a0 : b0) + 6 || p > (ax ? a1 : b1) - 6) continue;
      out.push(ax ? [p, f === 0 ? b1 + 14 : b0 - 14] : [f === 1 ? a1 + 14 : a0 - 14, p]);
    }
  }
  return out;
}
/* How each kind of counter is dressed, the run of joined pieces being the same for all (barRuns): its wood (three
   ramps), its front, its top, whether it has a tavern's brass foot rail and stools, and what stands along it. */
const COUNTER = {
  bar: { wood: ['#7a5238', '#5e3e2a', '#3e2a1e'], top: 'walnut', front: 'panels', rail: true, stools: true, goods: 'tavern' },
  /* a smith's counter: oak planks under iron straps, its top scarred with use */
  smithcounter: { wood: ['#7c5a38', '#5e4228', '#40301e'], top: 'oak', front: 'strapped', goods: 'smith' },
  /* an apothecary's counter: a front of little labelled drawers with brass pulls under a polished top */
  alchcounter: { wood: ['#5e4034', '#48302a', '#30221c'], top: 'walnut', front: 'drawers', goods: 'alchemist' }
};
const COUNTERS = new Set(Object.keys(COUNTER));
function counterFront(kind, W, G, BODY) {
  if (kind === 'strapped') return (s, t, which, x) => {
    const r = Math.floor(t * BODY), k = ((x % 6) + 6) % 6;
    if (r === 0) return W[1][1];
    if (r >= BODY - 2) return W[1][r === BODY - 1 ? 4 : 3];
    if (r === 3 || r === BODY - 5) return ((x % 16) + 16) % 16 === 4 ? STEEL[1] : STEEL[r === 3 ? 3 : 4];
    if (r === 4 || r === BODY - 4) return W[1][4];
    return W[1][k === 0 ? 4 : k === 1 ? 1 : h2(x >> 1, r >> 2, 17) < 0.15 ? 3 : 2];
  };
  if (kind === 'drawers') return (s, t, which, x) => {
    const r = Math.floor(t * BODY), k = ((x % 12) + 12) % 12, row = r < BODY / 2 ? 0 : 1, rr = row ? r - Math.floor(BODY / 2) : r;
    if (r === 0) return W[1][1];
    if (r >= BODY - 1) return W[1][4];
    if (k === 0 || rr === 0) return W[1][4];
    if (k === 1 || rr === 1) return W[1][1];
    if (rr === 3 && k >= 4 && k <= 8) return R('#efe3c4')[k === 4 ? 1 : 2];
    if (rr === 5 && k === 6) return G[1][0];
    return W[1][2];
  };
  return (s, t, which, x) => {
    const r = Math.floor(t * BODY), k = ((x % 16) + 16) % 16;
    if (r === 0) return W[1][1];
    if (r >= BODY - 2) return W[1][r === BODY - 1 ? 4 : 3];
    if (k < 2) return W[1][k ? 2 : 1];
    if (r < 2 || r > BODY - 4) return W[1][2];
    return W[1][r === 2 || k === 2 ? 1 : r === BODY - 4 || k === 15 ? 3 : 2];
  };
}
/* what stands along a counter's top at (x, y), picked by k (0..1); some places are left bare */
const COUNTER_GOODS = {
  tavern: (K, x, y, k, G) => {
    if (k < 0.3) MUG(K, x, y); else if (k < 0.45) { MUG(K, x - 2, y); MUG(K, x + 3, y + 1); } else if (k < 0.55) JUG(K, x, y);
    else if (k < 0.63) CANDLE(K, x, y, 4); else if (k < 0.72) { K.set(x, y, G[0][0]); K.set(x + 2, y, G[0][1]); K.set(x + 1, y - 1, G[0][0]); }
  },
  /* horseshoes, a sword laid across, a box of nails, a hammer, a helm */
  smith: (K, x, y, k) => {
    if (k < 0.24) { shoeAt(K, x - 3, y - 2); shoeAt(K, x + 3, y - 1); }
    else if (k < 0.44) { rod(K, x - 9, y - 1, x + 4, y - 1, STEEL, 1); K.set(x - 9, y - 1, STEEL[0]); K.rect(x + 4, y - 3, x + 5, y + 1, R('#c9a24f')[1]); rod(K, x + 5, y - 1, x + 8, y - 1, LEATHER, 1); K.set(x + 9, y - 1, R('#c9a24f')[0]); }
    else if (k < 0.58) { K.rect(x - 4, y - 4, x + 4, y, (px, py) => OAK[py === y - 4 ? 1 : px === x + 3 ? 4 : 3]); for (const dx of [-2, 0, 2]) K.set(x + dx, y - 4, STEEL[(dx + 2) % 3]); }
    else if (k < 0.7) { rod(K, x - 6, y - 1, x + 2, y - 2, OAK, 1); K.rect(x + 2, y - 4, x + 5, y, (px, py) => STEEL[py === y - 4 ? 1 : 3]); }
    else if (k < 0.82) { K.oval(x, y - 3, 4, 4, (px, py, dx, dy) => (dy > 0.3 ? null : STEEL[dx < -0.2 && dy < -0.4 ? 0 : overBall(dx, dy) + 1])); K.rect(x - 4, y - 2, x + 5, y - 1, STEEL[4]); }
  },
  /* bottles, brass scales, a mortar and pestle, a ledger and quill, a candle, a row of jars */
  alchemist: (K, x, y, k, G) => {
    if (k < 0.22) { BOTTLE(K, x - 2, y, '#6fbf6a', 5); BOTTLE(K, x + 3, y + 1, '#a46ac8', 4); }
    else if (k < 0.38) { K.rect(x, y - 9, x + 1, y, G[1][1]); K.rect(x - 6, y - 9, x + 7, y - 8, G[1][1]); for (const dx of [-6, 6]) { K.line(x + dx, y - 8, x + dx, y - 5, G[1][3]); K.rect(x + dx - 2, y - 5, x + dx + 3, y - 4, G[1][0]); } K.rect(x - 2, y - 1, x + 3, y + 1, G[1][2]); }
    else if (k < 0.52) { K.oval(x, y - 2, 4, 3, (px, py, dx, dy) => (dy < -0.4 ? R('#4a4642')[2] : R('#bfb59f')[overBall(dx, dy)])); rod(K, x + 1, y - 4, x + 4, y - 9, OAK, 1); }
    else if (k < 0.66) { BOOK(K, x - 1, y, '#3e5470'); K.rect(x - 4, y - 3, x + 2, y - 2, R('#f4efe2')[0]); K.line(x + 3, y - 2, x + 6, y - 7, R('#f6f1e4')[0]); }
    else if (k < 0.76) CANDLE(K, x, y, 5);
    else if (k < 0.88) for (const [dx, c] of [[-4, '#e0a23a'], [0, '#cfe4e4'], [4, '#c4503e']]) { const C = R(c); K.rect(x + dx - 1, y - 4, x + dx + 2, y, (px) => C[px === x + dx - 1 ? 0 : 2]); K.rect(x + dx - 1, y - 5, x + dx + 2, y - 4, R('#8e6a44')[1]); }
  }
};
/* A counter, built a tile at a time from the pieces joined in a run (barRuns): a front over a kick board, a top
   overhanging it, and along it what its trade keeps to hand. A tavern's bar also has a brass foot rail on its customers'
   side and stools pulled up to it (barStools). kind picks the dressing (COUNTER). */
function barCounter(K, o, kind = 'bar') {
  const St = COUNTER[kind] || COUNTER.bar, L = o.links || [0, 0, 0, 0], f = facing(o), F = furniture(K, { face: 0 }, T, T), runs = barRuns(o);
  const W = St.wood.map(R), Tp = mat(St.top), G = mat('brass'), I = mat('iron'), BODY = BAR_H - 2, front = counterFront(St.front, W, G, BODY);
  for (const [a0, a1, b0, b1] of runs) F.box(a0, a1, b0, b1, 0, BODY, W, { face: front, panel: false });
  for (const [a0, a1, b0, b1, ax] of runs) {
    const top = ax ? [a0 - (L[2] ? 0 : 2), a1 + (L[0] ? 0 : 2), b0 - 2, b1 + 2] : [a0 - 2, a1 + 2, b0 - (b0 && !L[3] ? 2 : 0), b1 + (b1 < T || !L[1] ? 2 : 0)];
    F.box(top[0], top[1], top[2], top[3], BODY, BAR_H, Tp, { top: (u, v, x, y) => (h2(x >> 3, y, 4) < 0.05 ? Tp[0][0] : kind === 'smithcounter' && h2(x, y, 6) < 0.06 ? Tp[0][3] : null) });
  }
  /* the foot rail on the customers' side of the runs that lie the way it faces */
  if (St.rail) for (const [a0, a1, b0, b1, ax] of runs) {
    if (ax !== (f % 2 === 0)) continue;
    if (ax) { const b = f === 0 ? b1 + 4 : b0 - 5; F.box(a0 + (L[2] ? 0 : 2), a1 - (L[0] ? 0 : 2), b, b + 1, 3, 4, G, { noSide: true }); for (let a = a0 + 8; a < a1 - 2; a += 24) F.box(a, a + 1, f === 0 ? b1 : b0 - 5, f === 0 ? b1 + 5 : b0, 3, 4, I, { noSide: true }); }
    else { const a = f === 1 ? a1 + 4 : a0 - 5; F.box(a, a + 1, b0 + (L[3] ? 0 : 2), b1 - (L[1] ? 0 : 2), 3, 4, G, { noSide: true }); }
  }
  /* what stands along the top */
  const v = Math.floor((o.v ?? 0.5) * 997), goods = COUNTER_GOODS[St.goods];
  for (const [a0, a1, b0, b1, ax] of runs) for (let p = 12; p < T; p += 24) {
    const a = ax ? p : (a0 + a1) / 2, b = ax ? (b0 + b1) / 2 - 2 + Math.round(h2(p, v, 8) * 4) : p;
    if (ax ? a < a0 + 4 || a > a1 - 4 : b < b0 + 6 || b > b1 - 4) continue;
    const k = h2(p, v + (ax ? 0 : 7), 5);
    F.at(a, b, BAR_H, (x, y) => goods(K, x, y, k, G));
  }
  /* the stools: three splayed legs and a rung under a round seat */
  if (St.stools) for (const [a, b] of barStools(o)) F.at(a, b, 0, (x, y) => {
    for (const [dx, dy] of [[-5, 0], [5, 0], [0, 1]]) { K.line(x + dx, y + dy, x + Math.round(dx * 0.6), y - 11, W[1][dy ? 3 : dx < 0 ? 1 : 2]); K.line(x + dx + 1, y + dy, x + Math.round(dx * 0.6) + 1, y - 11, W[1][3]); }
    K.rect(x - 4, y - 5, x + 5, y - 4, W[1][3]);
    K.oval(x, y - 12, 6, 2.5, W[1][3]); K.oval(x, y - 13, 6, 2.5, (px, py, dx, dy) => Tp[0][dx + dy < -0.6 ? 0 : dx + dy > 0.6 ? 3 : 1]);
    K.ovalShadow(x + 2, y + 1, 6, 2);
  });
  F.done(0);
  if (!L[0]) { const e = runs.reduce((q, r) => (r[1] > q[1] ? r : q)); K.shadow(e[1] - 2, e[2] + 2, e[1] + 2, e[3] + 2, 4); }
}
/* a tavern table: a square table on four legs, things on its top, chairs pulled up on three or four sides of it (by
   o.v), each chair's back on the side away from the table */
const SEATS = [[36, 18, 'n'], [60, 18, 'n'], [36, 80, 's'], [60, 80, 's'], [8, 48, 'w'], [88, 48, 'e']], TABLE = [22, 74, 32, 64];
const seatsOf = o => { const v = o.v ?? 0.5, k = Math.floor(v * 997), d1 = v < 0.3 ? -1 : k % 6, d2 = v < 0.65 ? -1 : (k >> 3) % 6; return SEATS.filter((s, i) => i !== d1 && i !== d2); };
function chairAt(F, a, b, back, W) {
  F.legs(a - 6, a + 6, b - 6, b + 6, 8, W);
  F.box(a - 7, a + 7, b - 7, b + 7, 8, 10, W, { top: (u, v) => W[0][u < 0.15 || v < 0.15 ? 1 : 2] });
  /* the back: two stiles, three slats with the room showing between them, a top rail; seen end on, a plain board */
  const lit = { top: () => W[0][1] };
  if (back === 'n' || back === 's') {
    const b0 = back === 'n' ? b - 7 : b + 5;
    for (const k of [-7, 5]) F.box(a + k, a + k + 2, b0, b0 + 2, 10, 20, W, lit);
    for (const k of [-3, 0, 3]) F.box(a + k - 1, a + k + 1, b0, b0 + 2, 10, 17, W, { noSide: true });
    F.box(a - 7, a + 7, b0, b0 + 2, 17, 20, W, lit);
  } else {
    const a0 = back === 'w' ? a - 7 : a + 5;
    F.box(a0, a0 + 2, b - 7, b + 7, 10, 20, W, { face: (s2, t) => W[1][t < 0.25 ? 1 : 2], top: () => W[0][1] });
  }
}
/* a back bar: a cupboard of four panelled doors under a worktop, and over it open shelves of bottles (green, brown,
   clear) and pewter tankards under a cornice. snug: its back is set against the room wall behind its tile */
function backBar(K, o, b0 = o.snug ? -40 : 4) {
  const F = furniture(K, o, T, T), W = mat('walnut'), Tp = mat('oak'), G = mat('brass');
  const BOT = ['#5f8a4a', '#7a4a2a', '#c9d8d0', '#8e2c26', '#6a7a3a'];
  F.box(6, 90, b0, b0 + 16, 0, 14, W, { panel: false, face: (s, t, which) => {
    if (which !== 'front') return null;
    const k = (s * 4) % 1, door = Math.floor(s * 4);
    if (k < 0.03 || k > 0.97 || t < 0.1 || t > 0.88) return W[1][t > 0.88 ? 3 : 1];
    if (Math.abs(t - 0.45) < 0.08 && Math.abs(k - (door % 2 ? 0.15 : 0.85)) < 0.04) return G[1][0];
    return W[1][k < 0.12 || t < 0.2 ? 3 : k > 0.88 || t > 0.8 ? 1 : 2];
  } });
  F.box(4, 92, b0 - 1, b0 + 18, 14, 16, Tp);
  F.box(8, 88, b0, b0 + 6, 16, 46, W, { panel: false, face: (s, t, which, x) => {
    if (which !== 'front') return null;
    if (s < 0.03 || s > 0.97) return W[1][s < 0.03 ? 1 : 3];
    const row = Math.floor(t * 3), tt = t * 3 - row;
    if (tt > 0.86) return W[1][tt > 0.93 ? 3 : 0];
    const cell = Math.floor(x / 4), px = ((x % 4) + 4) % 4, kind = h2(cell, row, 31), hgt = 0.4 + h2(cell, row, 32) * 0.35, up = 1 - tt / 0.86;
    if (px === 3 || kind < 0.12 || up > hgt) return W[2][4];
    if (kind < 0.3) return up > hgt * 0.6 ? W[2][4] : R('#a8aeb0')[px === 0 ? 1 : px === 2 ? 3 : 2];
    if (up > hgt - 0.12 && px !== 1) return W[2][4];
    const C = R(BOT[Math.floor(h2(cell, row, 33) * BOT.length)]);
    return C[up > hgt - 0.12 ? 3 : px === 0 ? 1 : px === 2 ? 3 : 2];
  } });
  F.box(6, 90, b0 - 1, b0 + 8, 46, 49, W, { top: () => W[0][1], face: (s, t) => W[1][t < 0.4 ? 0 : 2] });
  F.at(20, b0 + 12, 16, (x, y) => MUG(K, x, y)); F.at(70, b0 + 11, 16, (x, y) => JUG(K, x, y));
  F.done(4);
}
/* a cask rack: a timber cradle with two casks lying on it and a third on those, their heads to the front with a
   brass tap in each, hooped in iron. snug: set against the room wall behind its tile */
function caskRack(K, o) {
  const F = furniture(K, o, T, T), W = mat('oak'), Cw = R('#9a6a40'), I = mat('iron'), G = mat('brass'), b0 = o.snug ? -40 : 6, LEN = 24, r = 11;
  F.box(10, 86, b0 + 2, b0 + LEN - 2, 0, 4, W);
  const f = F.f, ns = F.ns;
  const cask = (a, z) => F.at(a, b0 + LEN, z, (x, y) => {
    const cy = y - r;
    if (ns) {
      /* seen from its head: the staves running back, the round head in front */
      K.rect(x - r, cy - LEN, x + r + 1, cy, (px, py) => ((cy - py) % 8 === 3 ? I[1][2] : Cw[px < x - r / 2 ? 1 : px > x + r / 2 ? 3 : 2]));
      K.oval(x, cy - LEN, r, r * 0.5, (px, py, dx) => Cw[dx < 0 ? 1 : 2]);
      K.oval(x, cy, r, r, (px, py, dx, dy) => { const dd = Math.hypot(dx, dy); return dd > 0.86 ? I[1][dx + dy < 0 ? 1 : 3] : dd > 0.72 ? Cw[3] : Cw[(Math.floor((px - x + r) / 4) % 2) ? 1 : 2]; });
      if (f === 0) { K.rect(x - 1, cy + 2, x + 2, cy + 4, G[1][1]); K.set(x, cy + 4, G[1][3]); K.set(x, cy + 5, G[1][3]); }
    } else {
      /* side on: its length across the view, hoops round it, its head at the front end */
      const dir = f === 1 ? 1 : -1, x0 = dir > 0 ? x - LEN : x, x1 = dir > 0 ? x : x + LEN;
      K.rect(x0, cy - r, x1, cy + r, (px, py) => (Math.abs(px - (x0 + x1) / 2) % 9 < 1.5 ? I[1][2] : Cw[py < cy - r / 2 ? 1 : py > cy + r / 2 ? 3 : 2]));
      K.oval(dir > 0 ? x1 : x0, cy, 3, r, (px, py, dx) => Cw[dx * dir > 0 ? 1 : 3]);
    }
  });
  cask(30, 4); cask(66, 4); cask(48, 4 + r * 2 - 4);
  F.done(4);
}

/* ---------- the smithy's and the alchemist's pieces ----------
   The forge and the alchemist's workbench are drawn across their whole tile (FULL) and stand back against the wall
   behind it (SNUG), as the back bar does; the rest keep the figures' scale in the middle of their tile. */
const BRICK = '#9a4e36', COAL = ['#f6d36a', '#f08a2a', '#c8502a', '#3a2c20'];
const brickAt = (B, x, y) => ((((y % 3) + 3) % 3) === 0 || ((((x + (Math.floor(y / 3) % 2) * 2) % 5) + 5) % 5) === 0 ? B[4] : B[h2(x >> 2, y / 3 | 0, 81) < 0.25 ? 1 : 2]);
/* ---------- modelling the smithy's pieces ----------
   The smith's things are drawn as lit volumes, the light from the upper left: steel in a wide ramp from a white glint
   to near black (STEEL, 0 the glint), so an anvil's face shines and its waist falls into shadow; wood shaded round as
   a log or a handle is; stone in courses with mortar, lit along the top of each course. */
const STEEL = ['#e4e7ea', '#b4bac0', '#8d939a', '#6c7279', '#52575d', '#3d4146', '#2b2e32'].map(hexRgb);
const OAK = ['#c4a274', '#a8875a', '#8e6a44', '#755434', '#5c4028', '#45301e'].map(hexRgb);
const LEATHER = ['#a8744a', '#8e5c38', '#76482a', '#5e3820', '#472a18'].map(hexRgb);
/* the tone across a lit cylinder, t from -1 at its west edge to 1 at its east: a highlight left of the middle, the east
   side turned from the light */
const acrossCyl = t => (t < -0.8 ? 2 : t < -0.45 ? 1 : t < -0.15 ? 0 : t < 0.3 ? 2 : t < 0.7 ? 3 : 4);
/* the tone over a rounded mass at (dx, dy) in radii from its middle */
const overBall = (dx, dy) => { const l = dx * 0.62 + dy * 0.78; return l < -0.62 ? 0 : l < -0.2 ? 1 : l < 0.3 ? 2 : l < 0.66 ? 3 : 4; };
/* a translucent puff (steam, smoke) round (cx, cy), lit on its upper left, over nothing already drawn */
function haze(K, cx, cy, rx, ry, P, a) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy > 1 || K.get(x, y) === 255) continue;
    K.set(x, y, P[dx + dy < -0.3 ? 0 : 1], a);
  }
}
/* a cast shadow: darken what is drawn at (x, y) */
const umbra = (K, x, y, k = 0.32) => K.shade(x, y, k);
/* a handle: a rod from (x0, y0) to (x1, y1), w wide, shaded round across its width */
function rod(K, x0, y0, x1, y1, P, w = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1), steep = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    for (let k = 0; k < w; k++) K.set(steep ? x + k : x, steep ? y : y + k, P[w === 1 ? 2 : k === 0 ? 1 : k === w - 1 ? 3 : 2]);
  }
}
/* a smith's hammer hanging from (x, y) by its handle: a turned handle, an iron head lit along its top, a glint on its
   face, a dark underside; peen to the west */
function hammerAt(K, x, y, len = 10, wide = 3) {
  rod(K, x, y, x, y + len, OAK, 2);
  K.rect(x - wide, y + len, x + wide + 2, y + len + 3, (px, py) => STEEL[py === y + len ? (px === x + wide + 1 ? 0 : 2) : py === y + len + 2 ? 5 : px === x - wide ? 3 : px === x + wide + 1 ? 4 : 3]);
  K.set(x - wide - 1, y + len + 1, STEEL[4]);
}
/* smith's tongs hanging from (x, y): two long reins pinned at a rivet, opening into curved jaws */
function tongsAt(K, x, y, len = 12) {
  for (let i = 0; i <= len; i++) { const s = i < len - 4 ? Math.round(i * 0.12) : 1 - (i - len + 4) * 0.5; K.set(x - 1 - Math.round(s), y + i, STEEL[2]); K.set(x + 1 + Math.round(s), y + i, STEEL[4]); }
  K.set(x, y + len - 4, STEEL[0]); K.set(x - 2, y + len + 1, STEEL[3]); K.set(x + 2, y + len + 1, STEEL[5]);
}
/* a horseshoe, points down, lit on its upper left */
function shoeAt(K, x, y) { for (const [dx, dy, k] of [[-2, 2, 2], [-2, 1, 1], [-2, 0, 1], [-1, -1, 0], [0, -1, 1], [1, -1, 2], [2, 0, 3], [2, 1, 3], [2, 2, 4]]) K.set(x + dx, y + dy, STEEL[k]); }
/* coursed stone at (x, y) on a face whose left edge is x0: blocks lit along their top, mortar between */
const ashlarAt = (S, x, y, x0, course = 5, len = 11) => { const row = Math.floor(y / course), m = ((y % course) + course) % course, c = (((x - x0 + (row % 2) * Math.floor(len / 2)) % len) + len) % len; return m === course - 1 || c === 0 ? S[4] : m === 0 ? S[1] : S[h2(Math.floor((x - x0 + (row % 2) * 5) / len), row, 23) < 0.3 ? 3 : 2]; };

/* A smith's forge. A brick hearth waist high, its top a stone kerb round a sunken firepot where the coals glow
   white at the heart through orange to dull red and grey clinker at the edge, a fire burning on them; over it a hood of
   coursed stone, sloping back to a flue that rises to the ceiling, blackened with soot above its mouth, an iron
   lintel along its lower edge with tongs and a poker hung from it. At its side a pair of great leather bellows on a
   trestle, pleated between their boards, their nozzle in the hearth's flank and a lever to work them; a coal scuttle
   at its foot. The fire's light falls on the floor before it. */
function forgeHearth(K, o) {
  const F = furniture(K, o, T, T), B = R(BRICK), Bm = [R(BRICK), R(BRICK), R(shade3(BRICK))], S = mat('stone'), b0 = o.snug ? -40 : 6, ns = F.ns;
  const Sk = R('#cfc6b2'), Soot = R('#4a423a');
  /* the hearth: brick under a stone kerb, the firepot sunk in its top */
  F.box(18, 78, b0, b0 + 26, 0, 16, Bm, { panel: false, face: (s, t, which, x, y) => (t < 0.08 ? Sk[1] : t > 0.94 ? B[4] : brickAt(B, x, y)) });
  F.box(16, 80, b0 - 1, b0 + 27, 16, 18, [Sk, Sk, R('#a89f8c')], { top: (u, v, x, y) => {
    const d = Math.hypot((u - 0.5) / 0.34, (v - 0.56) / 0.32);
    if (d > 1.12) return Sk[u < 0.04 || v > 0.94 ? 0 : h2(x, y, 84) < 0.12 ? 2 : 1];
    if (d > 1) return v < 0.56 ? Soot[4] : Sk[3];                                  /* the firepot's rim: its far wall in shadow */
    const k = d + (h2(x, y, 82) - 0.5) * 0.45;
    if (k > 0.86 && h2(x, y, 83) < 0.5) return R('#5a524a')[h2(x, y, 86) < 0.5 ? 2 : 3]; /* clinker */
    return R(COAL[k < 0.32 ? 0 : k < 0.6 ? 1 : k < 0.84 ? 2 : 3])[h2(x, y, 85) < 0.4 ? 0 : 1];
  } });
  /* the bellows on their trestle, the nozzle into the hearth's flank */
  F.legs(4, 14, b0 + 12, b0 + 22, 7, mat('oak'));
  F.at(9, b0 + 18, 7, (x, y) => {
    /* teardrop boards, broad at the back and narrowing to the nozzle; the leather between them pleated in ridges that
       catch the light and bulging a little past the boards */
    const x0 = x - 10, x1 = x + 7, top = px => Math.round(y - 14 + (px - x0) * 8 / (x1 - x0)), bot = px => Math.round(y - 1 - (px - x0) * 2 / (x1 - x0));
    for (let px = x0; px <= x1; px++) {
      const t0 = top(px) + 2, t1 = bot(px) - 2, bulge = px < x1 - 3 ? 1 : 0;
      for (let py = t0 - bulge; py <= t1 + bulge; py++) { const r = (py - t0 + 9) % 3; K.set(px, py, LEATHER[Math.min(4, (r === 0 ? 0 : r === 1 ? 2 : 3) + (px > x1 - 5 ? 1 : 0) + (py > t1 ? 1 : 0))]); }
      for (const [py, k] of [[top(px), 1], [top(px) + 1, 3], [bot(px) - 1, 2], [bot(px), 4]]) K.set(px, py, OAK[k]);
    }
    K.rect(x1 + 1, y - 6, x1 + 8, y - 4, (px, py) => STEEL[py === y - 6 ? 1 : 4]); K.set(x1 + 8, y - 5, STEEL[6]);
    /* the lever and the chain up to it */
    rod(K, x0 + 2, y - 15, x0 - 4, y - 27, OAK, 2); K.rect(x0 - 6, y - 29, x0 - 2, y - 27, OAK[1]);
    for (let py = y - 26; py < y - 15; py += 2) K.set(x0 + 4, py, STEEL[(py >> 1) & 1 ? 2 : 4]);
  });
  /* the hood: a sloping front of coursed stone narrowing from the mouth to the flue, sooty above the fire, an iron
     lintel along its mouth; the flue above it, capped */
  const hb = ns ? 36 : 16, ht = ns ? 13 : 7;
  F.at(48, b0 + 22, 32, (x, y) => {
    const top = y - 30, cap = top - 30;
    for (let py = top; py <= y; py++) {
      const f = (py - top) / (y - top), half = Math.round(ht + (hb - ht) * f);
      for (let px = x - half; px <= x + half; px++) {
        let c = ashlarAt(S[0], px, py, x - half, 5, 12);
        const sootK = Math.max(0, 1 - Math.abs(px - x) / (half * 0.9)) * (0.25 + 0.55 * f);
        c = mix(c, Soot[3], sootK);
        if (px === x - half) c = mix(c, [255, 250, 235], 0.25); if (px >= x + half - 1) c = mix(c, INK, 0.3);
        K.set(px, py, c);
      }
    }
    /* the flue: its face, its east side in shade, its cap */
    K.rect(x - ht, cap, x + ht + 1, top, (px, py) => mix(ashlarAt(S[1], px, py, x - ht, 5, 9), Soot[3], 0.15 + 0.2 * (py - cap) / (top - cap)));
    K.rect(x + ht + 1, cap - 3, x + ht + 4, top - 2, (px, py) => S[2][py < cap ? 2 : 4]);
    K.rect(x - ht - 1, cap - 4, x + ht + 4, cap, (px, py) => (py === cap - 4 ? Sk[0] : py === cap - 1 ? S[2][3] : Sk[1]));
    /* the lintel along the mouth, riveted */
    K.rect(x - hb - 1, y - 1, x + hb + 2, y + 3, (px, py) => STEEL[py === y - 1 ? 2 : py === y + 2 ? 6 : (px - x) % 9 === 0 && py === y ? 0 : 4]);
    /* tongs and a poker hung from it on the east */
    tongsAt(K, x + hb - 6, y + 3, 14); rod(K, x + hb - 1, y + 3, x + hb - 1, y + 19, STEEL, 1); K.set(x + hb - 2, y + 19, STEEL[3]);
  });
  /* the fire, and its light on the hood and the floor */
  F.at(48, b0 + 15, 18, (x, y) => {
    flame(K, x, y - 1, 7, 12); flame(K, x - 9, y + 1, 3, 6); flame(K, x + 8, y, 3, 7);
    candlelight(K, x, y - 6, 52, 34, 0.5);
    for (let yy = y + 16; yy < y + 30; yy++) for (let xx = x - 32; xx < x + 32; xx++) if (!K.get(xx, yy)) { const a = 1 - Math.hypot((xx - x) / 32, (yy - y - 16) / 14); if (a > 0) K.set(xx, yy, R('#f4a03a')[1], Math.round(60 * a)); }
  });
  /* the coal scuttle at its foot */
  F.at(85, b0 + 33, 0, (x, y) => {
    K.poly([[x - 6, y], [x + 5, y], [x + 7, y - 8], [x - 7, y - 8]], (px) => STEEL[acrossCyl((px - x) / 7) + 2]);
    K.oval(x, y - 8, 7, 2.5, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.78 ? STEEL[dy < 0 ? 3 : 2] : R('#2a2622')[h2(px, py, 87) < 0.25 ? 0 : 3]));
    K.oval(x - 1, y - 9, 4, 2, (px, py) => R('#3a3632')[h2(px, py, 88) < 0.3 ? 0 : 2]);
    K.ovalShadow(x + 3, y + 1, 8, 2.5);
  });
  F.done(4);
}
const shade3 = hex => mixHex(hex, '#000000', 0.3);
/* a stand-in for the kit that casts what is drawn through it as a shadow one pixel down and east, on what is already
   there (a tool's shadow on the board or wall it hangs on) */
const caster = (K, k = 0.3) => { const C = { set: (x, y) => umbra(K, x + 1, y + 1, k), rect(x0, y0, x1, y1) { for (let y = Math.ceil(y0); y < y1; y++) for (let x = Math.ceil(x0); x < x1; x++) C.set(x, y); }, shade() {} }; return C; };
/* rows of a steel silhouette, [y, x0, x1, role]: 'top' a lit upper face with a glint at gx, 'face' toward the viewer
   (lit on its west end, dark on its east), 'under' a shaded underside; dk darkens a row (a waist in shadow) */
function steelRows(K, rows, gx) {
  for (const [y, x0, x1, role, dk = 0] of rows) for (let x = x0; x <= x1; x++) {
    const c = role === 'top' ? (Math.abs(x - gx) <= 1 ? 0 : x === x1 ? 2 : 1) : role === 'under' ? 5 : x === x0 ? 2 : x === x1 ? 5 : x === x1 - 1 ? 4 : 3;
    K.set(x, y, STEEL[Math.min(6, c + dk)]);
  }
}
const SMITHY = {
  /* An anvil on an elm stump. The stump is shaded round, an iron hoop about it and its cut top ringed with years. The
     anvil's polished face catches the light, its horn tapers away to the west (seen from the side) or points out at
     the viewer (end on), its waist falls into the shadow of the overhang above it, and it stands on a broad foot. A
     hammer rests on its face. */
  anvil: (K, o) => {
    const F = furniture(K, o, 32, 32), ns = F.ns, f = F.f;
    F.at(16, 23, 0, (x, y) => {
      K.ovalShadow(x + 3, y + 1, 10, 3);
      const r = ns ? 6 : 5, h = 9, top = y - h;
      for (let py = top; py <= y; py++) for (let px = x - r; px <= x + r; px++) {
        const t = (px + 0.5 - x) / (r + 0.5); let k = acrossCyl(t);
        if (py === top + 3 || py === top + 4) { K.set(px, py, STEEL[k + (py === top + 3 ? 1 : 2)]); continue; }
        if (h2(px, py >> 1, 5) < 0.2) k++;
        K.set(px, py, OAK[Math.min(5, k + (py >= y - 1 ? 1 : 0))]);
      }
      K.oval(x, top, r + 0.5, 2.2, (px, py, dx, dy) => { const d = Math.hypot(dx, dy); return d > 0.8 ? OAK[dx + dy < 0 ? 1 : 4] : R('#d8bb8a')[d < 0.25 ? 3 : Math.round(d * 5) % 2 ? 1 : 2]; });
      const b = top - 1;
      if (ns) {
        const s = f === 0 ? 1 : -1, X = dx => x + s * dx, span = (a0, a1) => [Math.min(X(a0), X(a1)), Math.max(X(a0), X(a1))];
        steelRows(K, [
          [b, ...span(-6, 5), 'under'], [b - 1, ...span(-6, 5), 'face'], [b - 2, ...span(-5, 4), 'face'],
          [b - 3, ...span(-3, 2), 'face', 1], [b - 4, ...span(-3, 2), 'face', 1], [b - 5, ...span(-5, 4), 'face', 1],
          [b - 6, ...span(-8, 7), 'under'], [b - 7, ...span(-8, 7), 'face'], [b - 8, ...span(-8, 7), 'face'],
          [b - 9, ...span(-8, 7), 'top'],
          /* the horn, tapering */
          [b - 9, ...span(-12, -9), 'top'], [b - 8, ...span(-11, -9), 'face'], [b - 7, ...span(-10, -9), 'under'], [b - 9, ...span(-13, -13), 'face']
        ], X(-3));
        K.set(X(5), b - 9, STEEL[6]); K.set(X(3), b - 9, STEEL[5]);
        /* the hammer resting on the face */
        rod(K, X(-6), b - 10, X(1), b - 10, OAK, 1);
        K.rect(Math.min(X(2), X(4)), b - 12, Math.max(X(2), X(4)) + 1, b - 9, (px, py) => STEEL[py === b - 12 ? 1 : py === b - 10 ? 4 : 3]);
      } else {
        steelRows(K, [
          [b, x - 4, x + 3, 'under'], [b - 1, x - 4, x + 3, 'face'], [b - 2, x - 3, x + 2, 'face'],
          [b - 3, x - 2, x + 1, 'face', 1], [b - 4, x - 2, x + 1, 'face', 1], [b - 5, x - 3, x + 2, 'face', 1],
          [b - 6, x - 4, x + 3, 'under'], [b - 7, x - 4, x + 3, 'face'], [b - 8, x - 4, x + 3, 'face'], [b - 9, x - 4, x + 3, 'top'], [b - 10, x - 4, x + 3, 'top']
        ], x - 2);
        /* end on: the horn pointing out at the viewer, or the heel toward them */
        if (f === 3) K.oval(x - 0.5, b - 7, 2.6, 2.2, (px, py, dx, dy) => STEEL[overBall(dx, dy) + 1]);
        K.rect(x - 1, b - 13, x + 2, b - 10, (px, py) => STEEL[py === b - 13 ? 1 : 3]); rod(K, x, b - 10, x, b - 7, OAK, 1);
      }
    });
    F.done(0);
  },
  /* A quenching trough of dressed stone, its front coursed and damp at the foot, a lit rim round dark water that holds
     a glint of the light; steam curls off it, and a pair of tongs stands in it. */
  quench: (K, o) => {
    const F = furniture(K, o, 32, 32), ns = F.ns, S = R('#bdb4a2'), Wt = R('#4e6e78'), hw = ns ? 12 : 6, D = ns ? 9 : 15, H = 8;
    F.at(16, 24, 0, (x, y) => {
      const ft = y - H, tt = ft - D;
      K.ovalShadow(x + 3, y + 1, hw + 2, 3);
      /* the front: coursed stone, its top edge lit, its foot damp */
      K.rect(x - hw, ft, x + hw + 1, y + 1, (px, py) => { let c = py === ft ? S[0] : px === x - hw ? S[1] : ashlarAt(S, px, py, x - hw, 4, 7); if (py >= y - 1) c = mix(c, R('#5a6a5e')[3], 0.35); return c; });
      K.rect(x + hw + 1, tt + 1, x + hw + 3, y + 1, (px, py) => S[py < ft ? 3 : 4]);
      /* the rim and, inside it, the far wall and the water */
      K.rect(x - hw, tt, x + hw + 1, ft, (px, py) => {
        const rim = px <= x - hw + 1 || px >= x + hw - 1 || py <= tt + 1 || py >= ft - 1;
        if (rim) return S[py === tt || px === x - hw ? 0 : py >= ft - 1 ? 0 : 1];
        if (py <= tt + 3) return S[py === tt + 2 ? 2 : 3];
        if (px <= x - hw + 2) return Wt[3];
        const glint = h2(px >> 1, py, 41) < 0.12 && py > tt + 4, back = py === tt + 4;
        return Wt[back ? 4 : glint ? 0 : (px + py) % 7 === 0 ? 1 : py > ft - 3 ? 3 : 2];
      });
      /* the tongs standing in the water, a ring of ripples round them */
      const tx = x + (ns ? 5 : 2), ty = ft - 3;
      for (const [dx, dy] of [[-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) K.set(tx + dx, ty + dy, Wt[0]);
      for (let i = 0; i < 14; i++) { K.set(tx - 1 - Math.round(i * 0.2), ty - i, STEEL[2]); K.set(tx + 1 - Math.round(i * 0.08), ty - i, STEEL[4]); }
      K.set(tx, ty - 3, STEEL[0]); K.set(tx - 4, ty - 14, STEEL[3]); K.set(tx, ty - 14, STEEL[5]);
      /* steam */
      for (const [dx, dy, rr, a] of [[-5, -3, 2.5, 120], [-3, -8, 3, 90], [-6, -13, 3.5, 60]]) haze(K, x + dx, tt + dy, rr, rr * 0.8, R('#eef0ee'), a);
    });
    F.done(0);
  },
  /* A grindstone: a sandstone wheel on an iron axle between two timber uprights, its face lit on the upper left and its
     thickness showing in shade on the east, dipping into a trough of water at its foot; a crank to turn it. Edge on,
     the wheel is a narrow band rounded at top and bottom. */
  grindstone: (K, o) => {
    const F = furniture(K, o, 32, 32), ns = F.ns, Sd = R('#b9ad90'), Wt = R('#4e6e78');
    F.at(16, 24, 0, (x, y) => {
      K.ovalShadow(x + 3, y + 1, 12, 3);
      const cy = y - 14, post = (px) => { for (let py = y - 18; py <= y; py++) { K.set(px, py, OAK[py === y - 18 ? 0 : 1]); K.set(px + 1, py, OAK[py === y - 18 ? 1 : 3]); } K.rect(px - 1, y - 1, px + 3, y + 1, OAK[4]); };
      if (ns) {
        post(x - 12); rod(K, x - 11, cy, x + 12, cy, STEEL, 1);
        K.oval(x + 1.5, cy, 8.5, 8.5, (px, py, dx, dy) => Sd[dy > 0.4 ? 4 : 3]);
        K.oval(x, cy, 8.5, 8.5, (px, py, dx, dy) => { const d = Math.hypot(dx, dy); let k = overBall(dx * 0.8, dy * 0.8); if (d > 0.88) k = Math.min(4, k + 1); if (Math.abs(d - 0.55) < 0.07) k = Math.max(0, k - 1); if (h2(px, py, 44) < 0.12) k = Math.min(4, k + 1); return Sd[k]; });
        K.rect(x - 1, cy - 1, x + 2, cy + 2, (px, py) => STEEL[px === x - 1 && py === cy - 1 ? 0 : 3]);
        post(x + 10);
        rod(K, x + 12, cy, x + 14, cy + 5, STEEL, 1); K.rect(x + 13, cy + 5, x + 16, cy + 8, (px, py) => OAK[px === x + 13 ? 1 : 3]);
      } else {
        post(x - 4);
        for (let py = cy - 9; py <= cy + 8; py++) { const e = Math.abs(py - cy) > 7 ? 1 : 0; for (let px = x - 2 + e; px <= x + 2 - e; px++) K.set(px, py, Sd[Math.min(4, acrossCyl((px + 0.5 - x) / 2.5) + (py > cy + 4 ? 1 : 0))]); }
        K.rect(x - 1, cy - 1, x + 1, cy + 1, STEEL[2]);
        post(x + 3); K.rect(x + 5, cy + 3, x + 8, cy + 6, OAK[2]);
      }
      /* the water trough at its foot, in front of the wheel's lower edge */
      const tw = ns ? 8 : 5;
      K.rect(x - tw, y - 9, x + tw + 1, y - 5, (px, py) => (py === y - 9 || px === x - tw || px === x + tw ? OAK[1] : Wt[py === y - 8 ? 3 : h2(px, py, 45) < 0.15 ? 0 : 2]));
      K.rect(x - tw, y - 5, x + tw + 1, y + 1, (px, py) => OAK[py === y - 5 ? 1 : py === y ? 5 : (py - y) % 3 === 0 ? 4 : px === x - tw ? 2 : 3]);
    });
    F.done(0);
  },
  /* A smith's tool rack against the wall: a board of three planks between two stout posts under a rail, hammers,
     tongs and a file hung on its pegs, each throwing a shadow on the boards; a crate of horseshoes on the shelf below.
     Side on, the posts and the edge of the board, the tools' heads standing out from it. */
  toolrack: (K, o) => {
    const F = furniture(K, o, 32, 32), front = F.south === 'front' || F.south === 'back';
    F.at(16, 20, 0, (x, y) => {
      const post = (px) => { for (let py = y - 29; py <= y; py++) for (let k = 0; k < 3; k++) K.set(px + k, py, OAK[py === y - 29 ? 0 : k === 0 ? 1 : k === 1 ? 2 : 4]); };
      if (!front) {
        post(x - 1); K.rect(x + 2, y - 26, x + 3, y - 6, OAK[4]);
        for (const [py, sz] of [[y - 22, 2], [y - 15, 3], [y - 9, 2]]) K.rect(x + 3, py, x + 3 + sz, py + 3, (px, ppy) => STEEL[ppy === py ? 1 : 3]);
        return;
      }
      post(x - 13); post(x + 11);
      K.rect(x - 10, y - 25, x + 11, y - 6, (px, py) => { const pl = Math.floor((py - (y - 25)) / 6), r = (py - (y - 25)) % 6; return OAK[r === 0 ? 1 : r === 5 ? 4 : h2(px >> 2, py, 46 + pl) < 0.2 ? 3 : 2]; });
      K.rect(x - 13, y - 28, x + 14, y - 25, (px, py) => OAK[py === y - 28 ? 0 : py === y - 26 ? 3 : 1]);
      for (let px = x - 10; px < x + 11; px++) umbra(K, px, y - 25, 0.35);
      for (const S2 of [caster(K), K]) { hammerAt(S2, x - 7, y - 24, 9, 2); tongsAt(S2, x - 2, y - 24, 13); hammerAt(S2, x + 3, y - 24, 6, 2); rod(S2, x + 8, y - 24, x + 8, y - 12, STEEL, 1); }
      for (const px of [x - 7, x - 2, x + 3, x + 8]) K.set(px, y - 24, STEEL[0]);
      /* the shelf and a crate of horseshoes on it */
      K.rect(x - 11, y - 6, x + 12, y - 4, (px, py) => OAK[py === y - 6 ? 0 : 3]);
      K.rect(x - 8, y - 3, x + 9, y + 1, (px, py) => OAK[py === y - 3 ? 1 : px === x - 8 ? 2 : (py - y) % 2 ? 3 : 4]);
      for (const [dx, dy] of [[-5, -5], [-1, -6], [3, -5], [6, -6]]) shoeAt(K, x + dx, y + dy);
    });
    F.done(4);
  },
  /* An armour stand: a mail hauberk on a wooden form, rounded and lit across the chest, the rings glinting, short
     sleeves, a belt with a brass buckle; a coif and a domed helm with a nasal over it; the post on three splayed feet,
     a kite shield leaning on it. */
  armorstand: (K, o) => {
    const F = furniture(K, o, 32, 32), wf = F.ns ? 1 : 0.62;
    F.at(16, 22, 0, (x, y) => {
      K.ovalShadow(x + 3, y + 1, 9, 3);
      for (const [dx, dy] of [[-6, 1], [6, 1], [0, -2]]) rod(K, x, y - 2, x + dx, y + dy, OAK, 1);
      rod(K, x, y - 13, x, y - 2, OAK, 2);
      /* the hauberk: its half width down the body */
      const half = py => (py < y - 27 ? 8 : py < y - 19 ? 7 : py < y - 16 ? 6 : 6 + (py - (y - 16)) * 0.4) * wf;
      for (let py = y - 31; py <= y - 12; py++) {
        const hw = half(py);
        for (let px = Math.round(x - hw); px <= Math.round(x + hw); px++) {
          if (py > y - 15 && Math.abs(px + 0.5 - x - 0.5) < 0.6) continue;
          let k = acrossCyl((px + 0.5 - x) / (hw + 0.5)) + 1 + (py > y - 14 ? 1 : 0);
          if (((px + (py >> 1)) & 1) === 0 && (py & 1) === 0) k--; else if ((px + py) % 3 === 0) k++;
          K.set(px, py, STEEL[Math.max(0, Math.min(6, k))]);
        }
      }
      for (const s of [-1, 1]) for (let py = y - 30; py <= y - 24; py++) for (let k = 0; k < 3; k++) { const px = Math.round(x + s * (half(py) + 1 + k)); K.set(px, py, STEEL[Math.min(6, (s < 0 ? 2 : 4) + (py > y - 26 ? 1 : 0) + (k === 2 ? 1 : 0))]); }
      K.rect(Math.round(x - 6 * wf), y - 19, Math.round(x + 6 * wf) + 1, y - 17, (px, py) => LEATHER[py === y - 19 ? 1 : 3]); K.rect(x, y - 19, x + 2, y - 17, R('#e2c26a')[1]);
      /* the coif, the helm and its nasal */
      K.oval(x + 0.5, y - 33, 5 * wf, 3.5, (px, py, dx, dy) => STEEL[Math.min(6, overBall(dx, dy) + 2 + ((px + py) & 1))]);
      K.oval(x + 0.5, y - 36, 5 * wf, 4.5, (px, py, dx, dy) => (dy > 0.2 ? null : STEEL[dx < -0.2 && dy < -0.4 ? 0 : overBall(dx, dy) + 1]));
      K.rect(Math.round(x - 5 * wf), y - 36, Math.round(x + 5 * wf) + 2, y - 35, STEEL[4]); K.rect(x, y - 35, x + 1, y - 32, STEEL[2]);
      /* the shield, leaning on the post */
      if (F.ns) {
        const Sd = R('#3e5470'), G = R('#c9a24f');
        K.poly([[x + 6, y - 13], [x + 15, y - 13], [x + 14, y - 6], [x + 10.5, y + 1], [x + 7, y - 6]], (px, py) => { const dx = (px - x - 10.5) / 5, dy = (py - y + 7) / 7; return Math.abs(px - x - 10.5) < 0.6 || py === y - 9 ? G[1] : Sd[overBall(dx, dy)]; });
        K.rect(x + 10, y - 10, x + 12, y - 8, (px, py) => G[px === x + 10 && py === y - 10 ? 0 : 2]);
      }
    });
    F.done(0);
  },
  /* A coal bin heaped with coal, the lumps catching the light here and there, a shovel stuck in it; beside it bars of
     iron stacked in three layers on two bearers, each bar lit along its top. */
  ironstock: (K, o) => {
    const F = furniture(K, o, 32, 32), Co = ['#6e6862', '#4c4844', '#36322e', '#272320', '#1a1816'].map(hexRgb);
    F.at(16, 22, 0, (x, y) => {
      K.ovalShadow(x + 2, y + 1, 14, 3);
      /* the coal, heaped over the bin's rim */
      K.oval(x - 7, y - 9, 6.5, 4.5, (px, py, dx, dy) => (dy > 0 ? null : Co[Math.max(0, Math.min(4, overBall(dx, dy) + (h2(px, py, 47) < 0.3 ? 1 : 0) - (h2(px, py, 48) < 0.08 ? 2 : 0)))]));
      K.set(x - 9, y - 12, R('#aab4c0')[0]); K.set(x - 5, y - 11, R('#aab4c0')[1]);
      rod(K, x - 3, y - 21, x - 6, y - 11, OAK, 1); K.rect(x - 5, y - 23, x - 1, y - 21, OAK[1]);
      /* the bin: two planks between iron corner straps */
      K.rect(x - 13, y - 9, x, y + 1, (px, py) => (px === x - 13 || px === x - 1 ? STEEL[px === x - 13 ? 2 : 4] : OAK[py === y - 9 || py === y - 4 ? 1 : py === y - 5 || py === y ? 4 : h2(px >> 1, py, 49) < 0.2 ? 3 : 2]));
      /* the bars on their bearers */
      for (const bx of [x + 2, x + 10]) K.rect(bx, y - 2, bx + 3, y + 1, (px, py) => OAK[py === y - 2 ? 1 : 3]);
      for (let i = 0; i < 3; i++) {
        const y0 = y - 4 - i * 2, x0 = x + 1 + i, x1 = x + 14 - i, g = x0 + 2 + Math.floor(h2(i, 3, 50) * (x1 - x0 - 4));
        for (let px = x0; px <= x1; px++) { K.set(px, y0, STEEL[px === g ? 0 : px === x1 ? 3 : 1]); K.set(px, y0 + 1, STEEL[px === x0 ? 3 : px === x1 ? 5 : 4]); }
      }
    });
    F.done(0);
  }
};

/* An alchemist's workbench: a heavy table against the wall with a shelf of jars above it, and on it the work: a copper
   alembic over a little furnace with its swan neck running down to a receiving flask, a retort bubbling over a spirit
   lamp, a rack of phials, a mortar and pestle, an open grimoire and a candle. Vapour curls from the alembic. */
function alchemyBench(K, o) {
  const F = furniture(K, o, T, T), W = mat('walnut'), Tp = mat('oak'), G = mat('brass'), Cu = mat('clay'), b0 = o.snug ? -40 : 4;
  const JARS = ['#6fbf6a', '#a46ac8', '#e0a23a', '#c4503e', '#4fb0b0', '#d8d06a', '#c9d8d0'];
  F.box(6, 90, b0, b0 + 22, 0, 13, W, { panel: false, face: (s, t, which) => {
    if (which !== 'front') return null;
    const k = (s * 3) % 1; if (k < 0.04 || t < 0.12 || t > 0.9) return W[1][t > 0.9 ? 3 : 1];
    return Math.abs(k - 0.5) < 0.05 && Math.abs(t - 0.4) < 0.08 ? G[1][0] : W[1][k < 0.1 ? 3 : 2];
  } });
  F.box(4, 92, b0 - 1, b0 + 24, 13, 15, Tp);
  /* the shelf of jars on the wall over the bench */
  F.box(8, 88, b0, b0 + 6, 30, 32, W, { top: () => W[0][1] });
  F.at(10, b0 + 3, 32, (x, y) => { for (let k = 0, px = x; px < x + 74; k++) { const C = R(JARS[Math.floor(h2(k, 3, 87) * JARS.length)]), w = 3 + Math.floor(h2(k, 4, 88) * 3), h = 4 + Math.floor(h2(k, 5, 89) * 4); K.rect(px, y - h, px + w, y, (qx, qy) => (qy === y - h ? R('#8e6a44')[1] : C[qx === px ? 0 : qx === px + w - 1 ? 2 : 1])); px += w + 2; } });
  /* the alembic: a copper pot on a brick furnace, its head, the swan neck down to the receiver */
  F.at(22, b0 + 12, 15, (x, y) => {
    K.rect(x - 7, y - 8, x + 7, y, (px, py) => brickAt(R(BRICK), px, py)); K.rect(x - 3, y - 4, x + 3, y, R('#2a2018')[3]); K.rect(x - 2, y - 2, x + 2, y, R('#f08a2a')[1]);
    K.oval(x, y - 14, 7, 6, (px, py, dx, dy) => Cu[1][dx + dy < -0.5 ? 0 : dx > 0.4 ? 3 : 1]);
    K.oval(x, y - 21, 4, 4, (px, py, dx, dy) => Cu[1][dx + dy < -0.4 ? 0 : 2]);
    for (let i = 0; i < 16; i++) { const px = x + 3 + i, py = y - 22 + Math.round(i * 0.7); K.set(px, py, Cu[1][1]); K.set(px, py + 1, Cu[1][3]); }
    K.oval(x + 21, y - 7, 4, 5, (px, py, dx, dy) => (dy > 0.1 ? R('#c4503e')[dx < 0 ? 0 : 1] : R('#cfe4e4')[Math.hypot(dx, dy) > 0.8 ? 2 : 0]));
    for (const [dx, dy, a] of [[1, -27, 150], [-1, -31, 110], [2, -35, 70]]) K.oval(x + dx, y + dy, 2.5, 2, R('#e0f0e0')[0], a);
  });
  /* the retort over its spirit lamp, a rack of phials, the mortar and pestle */
  F.at(54, b0 + 13, 15, (x, y) => {
    K.rect(x - 2, y - 3, x + 2, y, G[1][1]); flame(K, x, y - 3, 1, 3);
    K.oval(x, y - 9, 4.5, 4, (px, py, dx, dy) => (dy > 0 ? R('#a46ac8')[dx < 0 ? 0 : 1] : R('#cfe4e4')[Math.hypot(dx, dy) > 0.8 ? 2 : 0]));
    for (let i = 0; i < 9; i++) K.set(x + 3 + i, y - 12 - Math.round(i * 0.4), R('#cfe4e4')[i % 3 ? 1 : 2]);
    for (const [dx, dy] of [[-1, -10], [1, -11], [0, -7]]) K.set(x + dx, y + dy, R('#f0e0ff')[0]);
  });
  F.at(68, b0 + 9, 15, (x, y) => { K.rect(x - 1, y - 3, x + 12, y - 2, W[1][1]); for (let k = 0; k < 4; k++) { const C = R(JARS[k + 1]); K.rect(x + k * 3, y - 7, x + k * 3 + 2, y, (px, py) => (py > y - 4 ? C[1] : R('#cfe4e4')[1])); } });
  F.at(82, b0 + 16, 15, (x, y) => { K.oval(x, y - 2, 4, 3, (px, py, dx, dy) => (dy < -0.4 ? R('#6f7276')[3] : R('#bfb59f')[dx < 0 ? 1 : 2])); K.line(x + 1, y - 4, x + 4, y - 9, W[1][1]); });
  F.at(40, b0 + 18, 15, (x, y) => { const P = R('#f4efe2'); K.rect(x - 6, y - 2, x, y, (px) => P[px === x - 1 ? 2 : 0]); K.rect(x, y - 2, x + 6, y, (px) => P[px === x ? 2 : 1]); K.rect(x - 5, y - 1, x - 1, y, R('#7a6a5a')[2]); K.rect(x - 6, y, x + 6, y + 1, R('#8e2c26')[2]); });
  F.at(74, b0 + 19, 15, (x, y) => CANDLE(K, x, y, 5));
  F.done(4);
}
/* little things for the smithy and the alchemist's shelves */
const BOTTLE = (K, x, y, col, h = 6) => { const C = R(col); K.rect(x - 1, y - h, x + 2, y, (px) => C[px === x - 1 ? 0 : px === x + 1 ? 2 : 1]); K.rect(x, y - h - 2, x + 1, y - h, R('#cfe4e4')[1]); K.set(x, y - h - 3, R('#8e6a44')[1]); };

const SHOP_FURNITURE = {
  forge: (K, o) => forgeHearth(K, o),
  alchemybench: (K, o) => alchemyBench(K, o),
  ...SMITHY,
  /* the alchemist's cauldron: a great black pot on a ring of bricks with a fire under it, a green brew bubbling in it and
     green vapour rising, a ladle hooked on its rim */
  brewcauldron: (K, o) => {
    const F = furniture(K, o, 32, 32), I = mat('iron'), Br = R(BRICK), Lq = R('#7fd06a');
    F.at(16, 24, 0, (x, y) => {
      K.rect(x - 11, y - 6, x + 12, y, (px, py) => brickAt(Br, px, py)); K.rect(x - 4, y - 5, x + 4, y, R('#2a2018')[3]);
      flame(K, x, y - 1, 3, 5);
      K.oval(x, y - 13, 12, 10, (px, py, dx, dy) => (dy < -0.5 ? null : I[1][dx + dy * 0.3 < -0.45 ? 1 : dx > 0.45 ? 4 : 2]));
      K.oval(x, y - 18, 11, 3.5, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.8 ? I[0][1] : Lq[h2(px, py, 93) < 0.15 ? 0 : dy < 0 ? 1 : 2]));
      for (const [dx, dy] of [[-5, -19], [3, -18], [6, -19]]) K.oval(x + dx, y + dy, 1.5, 1, R('#c8f0b0')[0]);
      for (const [dx, dy, r, a] of [[-2, -25, 3, 150], [2, -31, 3.5, 110], [-1, -38, 4, 70]]) K.oval(x + dx, y + dy, r, r * 0.8, R('#b8e8a8')[0], a);
      K.line(x + 8, y - 21, x + 13, y - 10, R('#8e6a44')[2]);
      K.ovalShadow(x + 3, y, 14, 3);
    });
    F.done(0);
  },
  /* shelves of potions: bottles and flasks of every colour, labelled jars, a stoppered phial or two lying down */
  potionshelf: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('walnut'), COLS = ['#6fbf6a', '#a46ac8', '#e0a23a', '#c4503e', '#4fb0b0', '#d8d06a', '#cfe4e4'];
    F.box(4, 28, 12, 24, 0, 36, W, { panel: false, face: (s, t, which, x) => {
      if (which !== 'front') return null;
      if (s < 0.08 || s > 0.92 || t < 0.05) return W[1][s > 0.92 ? 3 : 1];
      const row = Math.floor(t * 4), tt = t * 4 - row; if (tt > 0.86) return W[1][tt > 0.94 ? 1 : 3];
      /* bottles four pixels apart: a body three wide, a neck of glass and a cork over its middle */
      const cell = Math.floor(x / 4), px = ((x % 4) + 4) % 4, C = R(COLS[Math.floor(h2(cell, row, 94) * COLS.length)]), hgt = 0.28 + h2(cell, row, 95) * 0.25, up = 1 - tt / 0.86;
      if (h2(cell, row, 96) < 0.12 || px === 3) return W[2][4];
      if (up > hgt + 0.36) return W[2][4];
      if (up > hgt) return px === 1 ? (up > hgt + 0.26 ? R('#8e6a44')[1] : R('#cfe4e4')[1]) : W[2][4];
      return C[up > hgt - 0.08 ? 0 : px === 0 ? 1 : px === 2 ? 3 : 2];
    } });
    F.box(3, 29, 11, 25, 36, 38, W, { top: () => W[0][1] });
    F.at(11, 17, 38, (x, y) => BOTTLE(K, x, y, '#a46ac8', 4)); F.at(21, 18, 38, (x, y) => BOTTLE(K, x, y, '#6fbf6a', 5));
    F.done(5);
  },
  /* a rack of herbs drying: two posts and two rails hung with bunches, green, grey-green, gold and lavender */
  herbrack: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('pine'), HERB = ['#7f9a52', '#93a862', '#a8a46a', '#b98ad8', '#6f8a5a'];
    F.box(3, 29, 15, 19, 0, 2, W);
    for (const a of [3, 26]) F.box(a, a + 3, 15, 19, 2, 30, W);
    for (const z of [16, 27]) F.box(3, 29, 16, 18, z, z + 2, W);
    F.at(16, 17, 0, (x, y) => {
      const front = F.south === 'front' || F.south === 'back', n = front ? 5 : 1;
      for (const z of [16, 27]) for (let k = 0; k < n; k++) {
        const px = front ? x - 9 + k * 4 + (z === 16 ? 2 : 0) : x, C = R(HERB[Math.floor(h2(k, z, 97) * HERB.length)]);
        K.rect(px, y - z, px + 1, y - z + 2, R('#c8b28a')[2]); K.rect(px - 1, y - z + 2, px + 2, y - z + 8, (qx, qy) => C[qx === px - 1 ? 1 : qy > y - z + 6 ? 3 : 2]);
      }
    });
    F.done(4);
  },
  /* apothecary drawers: a cabinet of many little labelled drawers with brass pulls, jars on its top */
  apothecary: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('walnut'), G = mat('brass');
    F.box(4, 28, 12, 25, 0, 2, W);
    F.box(4, 28, 12, 25, 2, 24, W, { panel: false, face: (s, t, which) => {
      if (which !== 'front') return null;
      const c = (s * 4) % 1, r = (t * 5) % 1;
      if (c < 0.1 || r < 0.12) return W[2][3];
      if (Math.abs(c - 0.55) < 0.12 && Math.abs(r - 0.45) < 0.12) return G[1][0];
      if (Math.abs(c - 0.55) < 0.25 && r > 0.65 && r < 0.85) return R('#efe3c4')[1];
      return W[1][r < 0.25 ? 1 : 2];
    } });
    F.box(3, 29, 11, 26, 24, 26, W, { top: () => W[0][1] });
    for (const [a, col] of [[9, '#e0a23a'], [16, '#cfe4e4'], [23, '#a46ac8']]) F.at(a, 18, 26, (x, y) => { const C = R(col); K.rect(x - 2, y - 5, x + 2, y, (px) => C[px === x - 2 ? 0 : px === x + 1 ? 2 : 1]); K.rect(x - 2, y - 6, x + 2, y - 5, R('#8e6a44')[1]); });
    F.done(5);
  }
};

const FURNITURE = {
  /* a bed, its head at the back: posts and a panelled headboard, a lower footboard, a mattress under a white sheet
     turned down over a quilted blanket (red, blue or green), and a plump pillow */
  bed: (K, o) => {
    const F = furniture(K, o, 32, 64), B = mat(BLANKET[Math.floor((o.v ?? 0.5) * 3) % 3]), L = mat('linen'), W = mat('walnut');
    F.box(3, 29, 6, 60, 0, 6, W);
    F.box(4, 28, 6, 59, 6, 9, L, { top: (u, v, x, y) => {
      /* the sheet at the head, its hem turned down, then the quilt in squares with sunken seams */
      if (v < 0.3) return L[0][h2(x, y, 3) < 0.08 ? 2 : 1];
      if (v < 0.36) return L[0][0];
      const qu = u * 4, qv = (v - 0.36) * 7;
      if (Math.abs(qu - Math.round(qu)) < 0.08 || Math.abs(qv - Math.round(qv)) < 0.07) return B[0][3];
      return B[0][(Math.floor(qu) + Math.floor(qv)) % 2 ? 1 : 2];
    }, face: (s, t, which) => (which === 'front' || which === 'back' ? L[1][2] : t < 0.5 ? B[1][1] : B[1][2]) });
    F.box(8, 24, 8, 17, 9, 11, L, { top: (u, v) => L[0][u < 0.15 || v < 0.2 ? 2 : u > 0.85 || v > 0.8 ? 1 : 0] });
    F.box(2, 30, 2, 6, 0, 17, W, { face: (s, t, which) => (which === 'front' || which === 'back' ? W[1][(s > 0.12 && s < 0.88 && t > 0.3 && t < 0.75) ? 3 : t < 0.12 ? 1 : 2] : null) });
    for (const a of [2, 27]) F.box(a, a + 3, 2, 6, 0, 20, W, { top: () => W[0][0] });
    F.box(2, 30, 59, 62, 0, 11, W, { face: (s, t, which) => (which === 'front' || which === 'back' ? W[1][(s > 0.12 && s < 0.88 && t > 0.35) ? 3 : t < 0.15 ? 1 : 2] : null) });
    F.done(5);
  },
  /* a straw pallet on the floor: a rough sacking blanket over its foot and a rolled wool pillow */
  cot: (K, o) => {
    const F = furniture(K, o, 32, 64), S = mat('straw'), Wl = [R('#8c7a62'), R('#6e5e4a'), R('#4e4234')];
    F.box(4, 28, 5, 60, 0, 4, S, { top: (u, v, x, y) => S[0][h2(x, y, 5) < 0.18 ? 3 : h2(x, y, 6) < 0.3 ? 1 : 2] });
    F.box(5, 27, 26, 58, 4, 5, Wl, { top: (u, v, x, y) => Wl[0][Math.floor(v * 10) % 2 ? 2 : (h2(x, y, 9) < 0.2 ? 3 : 1)] });
    F.box(7, 25, 7, 13, 4, 7, Wl, { top: (u) => Wl[0][u < 0.2 ? 2 : 0] });
    F.done(2);
  },
  /* a square table on turned legs, a grained top with a jug and a mug on it */
  table: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('oak');
    F.legs(4, 28, 8, 26, 10, W);
    F.box(4, 28, 8, 11, 7, 10, W); F.box(4, 28, 24, 26, 7, 10, W);
    F.box(2, 30, 6, 28, 10, 12, W);
    F.at(12, 15, 12, (x, y) => JUG(K, x, y), 30); F.at(20, 19, 12, (x, y) => MUG(K, x, y), 30);
    F.done(5);
  },
  /* a long trestle table: two trestles and a stretcher, a planked top set with plates, mugs and a loaf */
  longtable: (K, o) => {
    const F = furniture(K, o, 64, 32), W = mat('oak');
    for (const a of [6, 55]) { F.box(a, a + 3, 9, 25, 0, 2, W); F.box(a, a + 3, 15, 18, 0, 10, W); }
    F.box(8, 56, 15, 17, 4, 6, W);
    F.box(2, 62, 6, 28, 10, 12, W, { top: (u, v, x, y) => W[0][F.ns ? (Math.floor(v * 4) !== Math.floor((v + 0.04) * 4) ? 3 : h2(x >> 2, y, 7) < 0.1 ? 3 : 2) : (Math.floor(v * 4) !== Math.floor((v + 0.04) * 4) ? 3 : h2(x, y >> 2, 7) < 0.1 ? 3 : 2)] });
    for (const [a, b] of [[12, 12], [32, 12], [52, 12], [22, 22], [42, 22]]) F.at(a, b, 12, (x, y) => PLATE(K, x, y), 40);
    for (const [a, b] of [[18, 10], [46, 20]]) F.at(a, b, 12, (x, y) => MUG(K, x, y), 41);
    F.at(30, 20, 12, (x, y) => { const C = R('#c99a5a'); K.oval(x, y - 2, 4, 2, (px, py, dx, dy) => C[dy < -0.3 ? 0 : dx > 0.4 ? 3 : 1]); });
    F.done(5);
  },
  /* a chair: a seat on four legs and a back of three slats under a top rail */
  chair: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('walnut');
    F.legs(10, 22, 12, 24, 8, W);
    F.box(9, 23, 12, 24, 8, 10, W, { top: (u, v) => W[0][v > 0.85 ? 0 : 2] });
    F.box(9, 23, 11, 13, 10, 24, W, { face: (s, t, which) => (which === 'front' || which === 'back' ? (t < 0.18 ? W[1][1] : (Math.floor(s * 7) % 2 ? W[1][2] : null) || W[2][4]) : null), top: () => W[0][0] });
    F.done(3);
  },
  /* a three-legged milking stool with a round seat */
  stool: (K, o) => {
    /* the same from every side: three legs splayed out from under a thick round seat */
    const F = furniture(K, o, 32, 32), W = mat('oak');
    F.at(16, 20, 0, (x, y) => {
      for (const [dx, dy] of [[-6, 0], [6, 0], [0, 2]]) K.line(x + dx, y + dy, x + Math.round(dx * 0.4), y - 7, W[1][dy ? 3 : dx < 0 ? 1 : 2]);
      K.rect(x - 4, y - 4, x + 5, y - 3, W[1][3]);
      K.oval(x, y - 8, 6.5, 2.6, W[1][3]);
      K.oval(x, y - 9, 6.5, 2.6, (px, py, dx, dy) => W[0][dx + dy < -0.7 ? 0 : dx + dy > 0.6 ? 3 : h2(px, py, 2) < 0.15 ? 2 : 1]);
      K.ovalShadow(x + 2, y + 1, 7, 2.5);
    });
    F.done(0);
  },
  /* a plain bench: a thick plank on splayed end boards */
  bench: (K, o) => {
    const F = furniture(K, o, 64, 32), W = mat('oak');
    for (const a of [5, 56]) F.box(a, a + 3, 13, 23, 0, 6, W);
    F.box(9, 55, 17, 19, 2, 4, W);
    F.box(2, 62, 12, 24, 6, 9, W);
    F.done(4);
  },
  /* an iron-bound chest with a domed lid, a lock plate on its front */
  chest: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('walnut'), I = mat('iron'), G = mat('brass');
    const band = (s) => Math.abs(s - 0.18) < 0.06 || Math.abs(s - 0.82) < 0.06;
    F.box(5, 27, 11, 26, 0, 10, W, { face: (s, t, which, x) => (band(s) ? I[1][t > 0.9 ? 3 : 1] : which === 'front' && Math.abs(s - 0.5) < 0.1 && t < 0.55 ? G[1][t < 0.15 ? 0 : 2] : null) });
    F.box(5, 27, 11, 26, 10, 13, W, { top: (u, v) => (band(F.ns ? u : v) ? I[0][1] : W[0][v > 0.8 || v < 0.15 ? 3 : 1]), face: (s) => (band(s) ? I[1][1] : W[1][1]) });
    F.done(4);
  },
  /* a tall wardrobe: a cornice, two panelled doors with brass knobs, on bracket feet */
  wardrobe: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('walnut'), G = mat('brass');
    F.box(4, 28, 10, 25, 0, 3, W);
    F.box(4, 28, 10, 25, 3, 36, W, { face: (s, t, which) => {
      if (which !== 'front') return t < 0.04 ? W[1][1] : null;
      const door = s < 0.5 ? s * 2 : (s - 0.5) * 2, panel = door > 0.18 && door < 0.82 && ((t > 0.08 && t < 0.45) || (t > 0.52 && t < 0.92));
      if (Math.abs(s - 0.5) < 0.03) return W[2][4];
      if (Math.abs(t - 0.5) < 0.02 && (door > 0.7 || door < 0.3)) return null;
      if ((s > 0.42 && s < 0.47 || s > 0.53 && s < 0.58) && Math.abs(t - 0.5) < 0.04) return G[1][0];
      return panel ? W[1][door < 0.25 || t < 0.12 ? 1 : 3] : null;
    } });
    F.box(3, 29, 9, 26, 36, 39, W, { top: () => W[0][1], face: (s, t) => W[1][t < 0.4 ? 0 : 2] });
    F.done(6);
  },
  /* a bookshelf: four shelves of books of all heights and colours, a few leaning, in a dark frame */
  bookshelf: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('walnut'), COLS = ['#b8483a', '#4f6a9a', '#7f9a5a', '#d9b44a', '#8e6a8f', '#7a5a3a', '#c97a56'];
    F.box(4, 28, 12, 24, 0, 36, W, { face: (s, t, which, x, y) => {
      if (which !== 'front') return null;
      if (s < 0.08 || s > 0.92 || t < 0.05) return W[1][s > 0.92 ? 3 : 1];
      const row = Math.floor(t * 4), tt = t * 4 - row; if (tt > 0.86) return W[1][tt > 0.94 ? 1 : 3];
      const k = Math.floor((s - 0.08) * 40), c = COLS[Math.floor(h2(k, row, 3) * COLS.length)], hgt = 0.35 + h2(k, row, 4) * 0.5;
      if (h2(k, row, 5) < 0.1 || 1 - tt / 0.86 > hgt) return W[2][4];
      return R(c)[((x + 1) % 3 === 0) ? 3 : tt < 0.86 - hgt * 0.86 + 0.12 ? 1 : 2];
    } });
    F.box(3, 29, 11, 25, 36, 38, W, { top: () => W[0][1] });
    F.done(5);
  },
  /* a dresser: three drawers with brass pulls under a top set with a jug and a washbowl */
  dresser: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('oak'), G = mat('brass');
    F.box(4, 28, 12, 25, 0, 2, W);
    F.box(4, 28, 12, 25, 2, 20, W, { face: (s, t, which) => {
      if (which !== 'front') return null;
      const row = Math.floor(t * 3), tt = t * 3 - row;
      if (tt < 0.12) return W[2][3];
      if (Math.abs(s - 0.3) < 0.05 && Math.abs(tt - 0.5) < 0.15 || Math.abs(s - 0.7) < 0.05 && Math.abs(tt - 0.5) < 0.15) return G[1][0];
      return W[1][tt < 0.25 ? 1 : 2];
    } });
    F.box(3, 29, 11, 26, 20, 22, W, { top: () => W[0][1] });
    F.at(11, 18, 22, (x, y) => JUG(K, x, y), 40);
    F.at(20, 19, 22, (x, y) => { const C = R('#f2ece0'); K.oval(x, y - 1, 4, 2, (px, py, dx, dy) => (dy < -0.2 && Math.hypot(dx, dy) < 0.7 ? R('#9cc0d0')[1] : C[dx > 0.4 ? 2 : 0])); });
    F.done(5);
  },
  /* a writing desk: a pedestal of drawers on one side, legs on the other, paper, a book, an inkwell and a quill */
  desk: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('walnut'), G = mat('brass');
    F.box(3, 12, 10, 24, 0, 11, W, { face: (s, t, which) => (which === 'front' ? (Math.floor(t * 3) !== Math.floor((t + 0.1) * 3) ? W[2][3] : Math.abs(s - 0.5) < 0.12 && Math.abs((t * 3) % 1 - 0.55) < 0.15 ? G[1][0] : null) : null) });
    F.legs(24, 29, 10, 24, 11, W);
    F.box(2, 30, 8, 25, 11, 13, W);
    F.at(9, 14, 13, (x, y) => { K.rect(x - 4, y - 3, x + 3, y, R('#f4efe2')[0]); K.rect(x - 3, y - 2, x + 2, y - 1, R('#c9c0ac')[1]); });
    F.at(20, 14, 13, (x, y) => BOOK(K, x, y, '#8e2c26'), 40);
    F.at(25, 19, 13, (x, y) => { K.rect(x - 1, y - 2, x + 1, y, R('#2a2018')[1]); K.line(x, y - 2, x + 3, y - 7, R('#f6f1e4')[0]); });
    F.done(5);
  },
  /* a bar counter: a panelled front, a polished top with tankards on it */
  counter: (K, o) => {
    const F = furniture(K, o, 64, 32), W = mat('walnut'), T0 = mat('oak');
    F.box(2, 62, 10, 25, 0, 14, W, { face: (s, t, which) => {
      if (which === 'back') return t < 0.1 ? W[1][1] : Math.abs(t - 0.5) < 0.04 ? W[1][3] : null;
      if (which !== 'front') return null;
      const k = (s * 4) % 1; if (k < 0.06) return W[2][3];
      return t > 0.1 && t < 0.88 && k > 0.14 && k < 0.92 ? W[1][(k < 0.2 || t < 0.16) ? 3 : 1] : null;
    } });
    F.box(1, 63, 8, 26, 14, 16, T0, { top: (u, v, x, y) => T0[0][v > 0.88 ? 0 : h2(x, y, 3) < 0.06 ? 2 : 1] });
    for (const [a, b] of [[10, 16], [22, 13], [40, 17], [52, 14]]) F.at(a, b, 16, (x, y) => MUG(K, x, y), 50);
    F.done(5);
  },
  /* a cooking pot hung over embers on an iron tripod, stew in it and steam rising */
  cauldron: (K, o) => {
    const F = furniture(K, o, 32, 32), I = mat('iron');
    F.at(16, 22, 0, (x, y) => {
      /* the tripod's legs meet over the pot, a chain hanging from them to its bail */
      for (const [dx, k] of [[-10, 1], [10, 3], [1, 2]]) K.line(x + dx, y + (dx === 1 ? 1 : 0), x, y - 26, I[1][k]);
      K.set(x, y - 27, I[0][0]);
      for (let yy = y - 25; yy < y - 18; yy++) K.set(x, yy, I[1][(yy % 2) ? 1 : 3]);
      K.line(x - 7, y - 13, x, y - 18, I[1][2]); K.line(x + 7, y - 13, x, y - 18, I[1][3]);
      K.oval(x, y - 1, 7, 2.5, (px, py, dx, dy) => R('#f4a03a')[h2(px, py, 2) < 0.5 ? 1 : 3]);
      for (const [dx, dy] of [[-3, -2], [2, -3], [0, -1]]) K.set(x + dx, y + dy, R('#f6d36a')[0]);
      K.oval(x, y - 9, 8, 7, (px, py, dx, dy) => (dy < -0.45 ? null : I[1][dx + dy * 0.3 < -0.4 ? 1 : dx > 0.4 ? 4 : 2]));
      K.oval(x, y - 13, 8, 2.5, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.75 ? I[0][1] : R('#8e6a3a')[h2(px, py, 4) < 0.25 ? 1 : 2]));
      for (const [dx, dy] of [[-3, -17], [3, -19], [-4, -22], [4, -24]]) K.set(x + dx, y + dy, R('#e8e4dc')[0], 110);
      K.ovalShadow(x + 3, y, 11, 3);
    });
    F.done(0);
  },
  /* a coopered wash tub bound with iron hoops, water in it with a little soap foam */
  tub: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('oak'), I = mat('iron');
    F.at(16, 22, 0, (x, y) => {
      K.rect(x - 10, y - 9, x + 11, y, (px, py) => ((py === y - 3 || py === y - 7) ? I[1][2] : W[1][(px - x + 20) % 4 === 0 ? 3 : px < x - 5 ? 1 : px > x + 6 ? 3 : 2]));
      K.oval(x, y - 9, 10.5, 3.5, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.78 ? W[0][dy < 0 ? 1 : 2] : R('#9cc0d0')[dy < -0.2 ? 0 : 2]));
      for (const [dx, dy] of [[-4, -10], [-3, -9], [3, -10], [5, -9], [0, -8]]) K.set(x + dx, y + dy, R('#f6f8f4')[0]);
      K.ovalShadow(x + 3, y - 1, 12, 3);
    });
    F.done(0);
  },
  /* a brass candle stand: a domed foot, a turned stem, three arms with candles and a warm glow round the flames */
  candelabra: (K, o) => {
    const F = furniture(K, o, 32, 32), G = mat('brass');
    F.at(16, 22, 0, (x, y) => {
      K.oval(x, y - 1, 5, 2, (px, py, dx) => G[1][dx < -0.3 ? 0 : dx > 0.4 ? 3 : 1]);
      K.rect(x, y - 27, x + 1, y - 2, (px, py) => G[1][(py % 6 === 0) ? 0 : 2]); K.set(x + 1, y - 14, G[1][3]);
      K.rect(x - 6, y - 27, x + 7, y - 26, G[1][1]);
      for (const dx of [-6, 0, 6]) { K.rect(x + dx - 1, y - 28, x + dx + 2, y - 27, G[1][0]); CANDLE(K, x + dx, y - 28, 5); }
      for (let r = 4; r <= 9; r++) for (let a = 0; a < 24; a++) { const px = Math.round(x + Math.cos(a / 24 * 6.283) * r * 1.4), py = Math.round(y - 35 + Math.sin(a / 24 * 6.283) * r); if (!K.get(px, py)) K.set(px, py, R('#f6d36a')[0], Math.round(46 * (1 - (r - 4) / 6))); }
    });
    F.done(0);
  },
  /* a potted fern: a terracotta pot with a rolled rim, fronds arching out of it, lit from the upper left */
  plantpot: (K, o) => {
    const F = furniture(K, o, 32, 32), C = mat('clay'), Lf = R('#6f9a52');
    F.at(16, 22, 0, (x, y) => {
      K.poly([[x - 5, y - 9], [x + 6, y - 9], [x + 4, y], [x - 3, y]], (px) => C[1][px < x - 2 ? 1 : px > x + 2 ? 3 : 2]);
      K.rect(x - 6, y - 11, x + 7, y - 9, (px) => C[0][px < x - 2 ? 0 : px > x + 3 ? 2 : 1]);
      K.oval(x, y - 11, 5.5, 1.2, R('#4a3424')[2]);
      for (let k = 0; k < 9; k++) {
        const ang = -Math.PI / 2 + (k - 4) * 0.36, len = 9 + h2(k, 1, 3) * 5;
        for (let t = 0; t <= 1; t += 0.06) { const px = x + Math.cos(ang) * len * t + (k - 4) * t * t * 1.5, py = y - 11 + Math.sin(ang) * len * t + t * t * 6; K.set(px, py, Lf[t < 0.3 ? 3 : (k < 4 ? 1 : 2)]); if (t > 0.25 && Math.round(t * 16) % 2 === 0) K.set(px + (k < 4 ? -1 : 1), py + 1, Lf[k < 4 ? 0 : 2]); }
      }
    });
    F.done(0);
  },
  /* a throne on a stepped dais: a tall gilt back padded in red velvet under a crest, arms and a cushioned seat */
  throne: (K, o) => {
    const F = furniture(K, o, 32, 32), G = mat('gold'), V = mat('velvet'), S = mat('stone');
    F.box(1, 31, 4, 30, 0, 3, S);
    F.box(7, 25, 12, 26, 3, 10, G, { face: (s, t, which) => (which === 'front' ? (s > 0.15 && s < 0.85 && t > 0.2 && t < 0.8 ? V[1][t < 0.35 ? 1 : 2] : null) : null) });
    F.box(9, 23, 13, 25, 10, 12, V, { top: (u, v) => V[0][v > 0.8 ? 0 : u < 0.2 ? 1 : 2] });
    for (const a of [6, 23]) F.box(a, a + 3, 13, 25, 10, 16, G, { top: () => G[0][0] });
    F.box(7, 25, 10, 13, 3, 36, G, { face: (s, t, which) => (which === 'front' ? (s > 0.16 && s < 0.84 && t > 0.1 && t < 0.78 ? V[1][(Math.floor(s * 6) + Math.floor(t * 8)) % 2 && h2(Math.floor(s * 6), Math.floor(t * 8), 2) < 0.4 ? 1 : 2] : null) : null) });
    F.at(16, 11, 36, (x, y) => { K.rect(x - 2, y - 5, x + 3, y, G[1][1]); K.set(x, y - 6, R('#b8483a')[0]); K.set(x - 1, y - 2, G[0][0]); });
    F.done(6);
  },
  /* an altar of dressed stone under a white cloth hanging down its front with a gold-edged red panel, a cross,
     two candles and a book on it */
  altar: (K, o) => {
    const F = furniture(K, o, 64, 32), S = mat('stone'), L = mat('linen'), Rd = mat('red'), G = mat('gold');
    F.box(1, 63, 8, 28, 0, 2, S);
    F.box(3, 61, 10, 26, 2, 17, S, { face: (s, t, which, x, y) => {
      if (which === 'front' && Math.abs(s - 0.5) < 0.18) return t < 0.35 ? L[1][1] : Math.abs(s - 0.5) > 0.15 ? G[1][1] : Rd[1][t > 0.92 ? 3 : 2];
      return S[1][(y % 5 === 0 || (x + (Math.floor(y / 5) % 2) * 6) % 12 === 0) ? 3 : 1];
    } });
    F.box(3, 61, 10, 26, 17, 18, L, { top: (u, v) => (Math.abs(u - 0.5) < 0.18 ? L[0][0] : L[0][1]) });
    F.at(32, 14, 18, (x, y) => { const C = G[0]; K.rect(x, y - 9, x + 1, y, C[1]); K.rect(x - 2, y - 7, x + 3, y - 6, C[1]); });
    for (const a of [12, 52]) F.at(a, 15, 18, (x, y) => { K.rect(x - 1, y - 1, x + 2, y, G[0][2]); CANDLE(K, x, y - 1, 6); });
    F.at(22, 20, 18, (x, y) => BOOK(K, x, y, '#8e2c26'), 32);
    F.done(5);
  },
  /* a church pew: a seat and a high back with carved ends */
  pew: (K, o) => {
    const F = furniture(K, o, 64, 32), W = mat('walnut');
    F.box(4, 60, 12, 24, 5, 8, W);
    F.box(4, 60, 10, 12, 5, 22, W, { face: (s, t) => W[1][t < 0.1 ? 1 : Math.floor(s * 10) % 2 ? 2 : 3] });
    for (const a of [2, 59]) F.box(a, a + 3, 9, 25, 0, 24, W, { top: () => W[0][0], face: (s, t) => W[1][t < 0.12 ? 1 : 2] });
    F.done(4);
  },
  /* a weapon rack: two uprights and rails holding spears and swords upright, a round shield hung at its end */
  weaponrack: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('oak'), M = R('#c8ccd0'), I = mat('iron'), Sd = mat('red');
    F.box(3, 29, 16, 20, 0, 2, W);
    for (const a of [3, 26]) F.box(a, a + 3, 16, 20, 2, 30, W);
    F.box(3, 29, 17, 19, 24, 26, W); F.box(3, 29, 17, 19, 10, 12, W);
    F.at(16, 18, 0, (x, y) => {
      const front = F.south === 'front' || F.south === 'back';
      if (front) for (let k = 0; k < 4; k++) { const px = x - 7 + k * 5; if (k % 2) { K.rect(px, y - 34, px + 1, y - 2, W[1][1]); K.poly([[px - 1, y - 34], [px + 2, y - 34], [px, y - 40]], M[1]); } else { K.rect(px, y - 30, px + 1, y - 4, M[k ? 1 : 0]); K.rect(px - 2, y - 8, px + 3, y - 7, R('#c9a24f')[1]); K.rect(px, y - 7, px + 1, y - 3, R('#5a3f28')[2]); } }
      else {
        /* side on: a post with its rails standing out, the shafts of the spears and the swords' grips beside it, their
           heads and pommels above */
        for (let py = y - 30; py <= y - 2; py++) for (let k = 0; k < 3; k++) K.set(x - 1 + k, py, OAK[k === 0 ? 1 : k === 1 ? 2 : 4]);
        for (const ry of [y - 25, y - 11]) K.rect(x - 3, ry, x + 4, ry + 2, (px, py) => OAK[py === ry ? 1 : 3]);
        for (const [dx, h, spear] of [[-3, 38, true], [3, 35, true], [-2, 30, false]]) {
          rod(K, x + dx, y - h + 3, x + dx, y - 3, spear ? OAK : STEEL, 1);
          if (spear) { K.set(x + dx, y - h, STEEL[0]); K.set(x + dx, y - h + 1, STEEL[1]); K.set(x + dx, y - h + 2, STEEL[3]); }
          else { K.rect(x + dx - 1, y - h + 2, x + dx + 2, y - h + 3, R('#c9a24f')[1]); K.set(x + dx, y - h + 1, R('#c9a24f')[0]); }
        }
      }
      K.oval(x + (front ? 10 : 0), y - 12, 5, 6, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.78 ? I[1][1] : Math.hypot(dx, dy) < 0.25 ? R('#c9a24f')[1] : Sd[1][dx + dy < 0 ? 1 : 2]));
    });
    F.done(4);
  },
  /* a spinning wheel: a slanted bench on three legs, the wheel with its spokes and treadle, a distaff of wool */
  spinwheel: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('pine');
    F.legs(6, 27, 14, 22, 6, W);
    F.box(5, 28, 14, 22, 6, 9, W);
    F.at(16, 16, 9, (x, y) => {
      const side = F.ns, cx = x + (side ? 2 : 0);
      if (side) K.oval(cx, y - 11, 10, 10, (px, py, dx, dy) => { const d = Math.hypot(dx, dy); return d > 0.84 ? W[1][dx + dy < 0 ? 1 : 3] : (Math.abs(dx * 0.7 - dy * 0.7) < 0.08 || Math.abs(dx * 0.7 + dy * 0.7) < 0.08 || Math.abs(dx) < 0.07 || Math.abs(dy) < 0.07) && d > 0.15 ? W[1][2] : null; });
      else K.rect(cx - 1, y - 21, cx + 1, y - 1, W[1][2]);
      K.oval(cx, y - 11, 2, 2, W[1][3]);
      K.line(x - 8, y, x - 8, y - 18, W[1][3]); K.oval(x - 8, y - 20, 3, 3, (px, py, dx, dy) => R('#f0e6cb')[dx + dy < 0 ? 0 : 2]);
    });
    F.done(3);
  }  ,
  /* the tavern's: the bar counter, a table with chairs, a long table between benches, the back bar and the casks
     (see barCounter and the rest above) */
  bar: (K, o) => barCounter(K, o),
  smithcounter: (K, o) => barCounter(K, o, 'smithcounter'),
  alchcounter: (K, o) => barCounter(K, o, 'alchcounter'),
  tableset: (K, o) => {
    const F = furniture(K, o, T, T), W = mat('oak'), C = mat('walnut'), v = Math.floor((o.v ?? 0.5) * 991);
    const [t0, t1, t2, t3] = TABLE;
    for (const [a, b, back] of seatsOf(o)) chairAt(F, a, b, back, C);
    F.legs(t0 + 2, t1 - 2, t2 + 2, t3 - 2, 11, W, 3);
    F.box(t0 + 2, t1 - 2, t2 + 2, t2 + 4, 8, 11, W); F.box(t0 + 2, t1 - 2, t3 - 4, t3 - 2, 8, 11, W);
    F.box(t0, t1, t2, t3, 11, 13, W, { top: (u, vv, x, y) => W[0][(F.ns ? y : x) % 8 === 0 ? 3 : h2(x, y, 6) < 0.05 ? 1 : 2] });
    const things = [[32, 40, MUG], [62, 54, MUG], [44, 52, PLATE], [56, 40, JUG], [36, 56, (K2, x, y) => CANDLE(K2, x, y, 3)], [66, 42, PLATE], [50, 46, MUG]];
    for (const [a, b, fn] of things) if (h2(a, v, 3) < 0.7) F.at(a, b, 13, (x, y) => fn(K, x, y));
    F.done(0);
    /* a soft shadow east of the table and under it, and one beside each chair */
    const tr = turned(F.f, T, T, t0, t1, t2, t3); K.shadow(tr[0] + 2, tr[1] + 2, tr[2], tr[3], 4);
  },
  feastset: (K, o) => {
    const F = furniture(K, o, 2 * T, T), W = mat('oak'), v = Math.floor((o.v ?? 0.5) * 991);
    for (const b of [16, 70]) { for (const a of [32, 156]) F.box(a, a + 3, b + 1, b + 9, 0, 7, W); F.box(28, 164, b, b + 10, 7, 10, W); }
    for (const a of [26, 162]) { F.box(a, a + 4, 36, 60, 0, 2, W); F.box(a, a + 4, 46, 50, 2, 11, W); }
    F.box(30, 162, 47, 49, 4, 6, W);
    F.box(22, 170, 34, 62, 11, 13, W, { top: (u, vv, x, y) => W[0][Math.floor(vv * 4) !== Math.floor((vv + 0.06) * 4) ? 3 : h2(x >> 2, y, 7) < 0.08 ? 3 : 2] });
    for (let a = 34; a < 166; a += 22) { F.at(a, 39, 13, (x, y) => PLATE(K, x, y)); F.at(a + 11, 57, 13, (x, y) => PLATE(K, x, y)); if (h2(a, v, 2) < 0.6) F.at(a + 6, 44, 13, (x, y) => MUG(K, x, y)); }
    F.at(96, 50, 13, (x, y) => { const P = R('#e6dcc6'), M = R('#b8743a'); K.oval(x, y - 1, 7, 3, P[1]); K.oval(x, y - 3, 5, 3, (px, py, dx, dy) => M[dx + dy < -0.4 ? 0 : dx > 0.4 ? 3 : 1]); K.set(x - 5, y - 5, R('#f2ece0')[0]); K.set(x - 6, y - 6, R('#f2ece0')[0]); });
    for (const a of [62, 130]) F.at(a, 50, 13, (x, y) => { K.rect(x - 1, y - 1, x + 2, y, R('#c9a24f')[1]); CANDLE(K, x, y - 1, 5); });
    F.at(150, 52, 13, (x, y) => JUG(K, x, y)); F.at(44, 52, 13, (x, y) => { const C = R('#c99a5a'); K.oval(x, y - 2, 5, 2.5, (px, py, dx, dy) => C[dy < -0.3 ? 0 : dx > 0.4 ? 3 : 1]); });
    F.done(0);
    const tr = turned(F.f, 2 * T, T, 22, 170, 34, 62); K.shadow(tr[0] + 2, tr[1] + 2, tr[2], tr[3], 4);
  },
  backbar: (K, o) => backBar(K, o),
  casks: (K, o) => caskRack(K, o),
  /* a coat stand: a turned pole on splayed feet, a cloak and a satchel on its pegs and a hat on top */
  coatrack: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('walnut'), cloak = mat(['green', 'blue', 'red'][Math.floor((o.v ?? 0.5) * 3) % 3]), Lr = R('#8e6a44');
    F.at(16, 22, 0, (x, y) => {
      for (const [dx, dy] of [[-5, 1], [5, 1], [0, -2]]) K.line(x, y - 3, x + dx, y + dy, W[1][3]);
      K.rect(x, y - 32, x + 2, y - 2, (px) => W[1][px === x ? 1 : 3]);
      K.rect(x - 4, y - 29, x + 6, y - 28, W[1][2]);
      K.poly([[x - 3, y - 29], [x - 9, y - 9], [x - 6, y - 7], [x - 1, y - 9], [x, y - 28]], (px, py) => cloak[1][px < x - 6 ? 1 : py > y - 12 ? 3 : 2]);
      K.rect(x + 3, y - 27, x + 4, y - 19, Lr[3]); K.rect(x + 2, y - 20, x + 8, y - 14, (px) => Lr[px === x + 2 ? 1 : px === x + 7 ? 3 : 2]);
      K.rect(x - 4, y - 34, x + 6, y - 32, R('#4a3424')[2]); K.rect(x - 2, y - 38, x + 4, y - 34, (px) => R('#5a4030')[px === x - 2 ? 1 : 2]); K.rect(x - 2, y - 35, x + 4, y - 34, R('#8e2c26')[2]);
      K.ovalShadow(x + 3, y + 1, 7, 2.5);
    });
    F.done(0);
  },
  /* sacks of grain: two leaning together, tied at the neck, one open with the grain showing */
  sacks: (K, o) => {
    const F = furniture(K, o, 32, 32), S = R('#c8b28a'), Gr = R('#e2cb84');
    F.at(16, 24, 0, (x, y) => {
      K.mass(x - 5, y - 7, 6, 8, S, 3); K.rect(x - 6, y - 17, x - 3, y - 14, S[3]); K.oval(x - 5, y - 17, 2.5, 1.5, S[1]);
      K.mass(x + 5, y - 6, 7, 7, S, 5); K.oval(x + 5, y - 12, 5, 2, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.7 ? S[3] : Gr[h2(px, py, 3) < 0.4 ? 0 : 2]));
      K.mass(x - 1, y - 2, 5, 3, S, 7);
      K.ovalShadow(x + 3, y, 12, 3);
    });
    F.done(0);
  },
  /* a crib of split firewood, the cut ends to the front, an axe leaning on it */
  firewood: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('oak'), Lg = R('#8e6a44'), End = R('#d8bb8a');
    F.box(5, 27, 14, 26, 0, 2, W);
    for (const a of [5, 25]) F.box(a, a + 2, 14, 26, 2, 14, W);
    F.at(16, 26, 2, (x, y) => {
      for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - (row === 2 ? 1 : 0); k++) {
        const cx = x - 7 + k * 5 + (row % 2) * 2, cy = y - 3 - row * 4;
        K.rect(cx - 2, cy - 14, cx + 3, cy - 2, Lg[2]);
        K.oval(cx, cy, 2.5, 2, (px, py, dx, dy) => (Math.hypot(dx, dy) > 0.7 ? Lg[3] : End[h2(px, py, row) < 0.3 ? 2 : 1]));
      }
      K.line(x + 11, y - 1, x + 9, y - 14, W[1][1]); K.rect(x + 7, y - 16, x + 11, y - 13, R('#a8aeb0')[1]);
    });
    F.done(3);
  },
  /* a notice board on two posts, bills and notices pinned to it */
  noticeboard: (K, o) => {
    const F = furniture(K, o, 32, 32), W = mat('oak'), Cork = R('#b08a58');
    for (const a of [5, 25]) F.box(a, a + 2, 15, 17, 0, 30, W);
    F.box(4, 28, 15, 17, 12, 30, W, { panel: false, face: (s, t, which, x, y) => {
      if (s < 0.06 || s > 0.94 || t < 0.08 || t > 0.92) return W[1][t < 0.08 || s < 0.06 ? 1 : 3];
      if (which !== 'front') return null;
      const k = Math.floor(s * 4), rw = t < 0.5 ? 0 : 1, n = h2(k, rw, 11), ok = n < 0.75 && Math.abs((s * 4) % 1 - 0.5) < 0.38 && Math.abs((t * 2) % 1 - 0.5) < 0.32;
      if (ok) return R(n < 0.25 ? '#f4efe2' : n < 0.5 ? '#e8d8a8' : '#d9c4a0')[((y + x) % 3 === 0 && (t * 2) % 1 > 0.35) ? 3 : 1];
      return Cork[h2(x, y, 4) < 0.3 ? 1 : 2];
    } });
    F.box(3, 29, 14, 18, 30, 32, W, { top: () => W[0][1] });
    F.done(3);
  }

};

Object.assign(FURNITURE, SHOP_FURNITURE);

/* ---------- things hung on a room wall ----------
   A wall with something on it is the wall (roomWall) with the thing on its face, where the face shows: on a run across
   the view. A shelf of plates and tankards on brackets, a stag's antlers on a carved plaque, a painted shield over
   crossed swords, an iron sconce whose candle warms the plaster round it. */
/* warm what is drawn round (cx, cy) toward candlelight, most at the middle */
function candlelight(K, cx, cy, rx, ry, k = 0.5) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry); if (d > 1) continue;
    const X = x + K.ox, Y = y + K.oy; if (X < 0 || Y < 0 || X >= K.w || Y >= K.h) continue;
    const i = (Y * K.w + X) * 4, a = k * (1 - d) * (1 - d); if (K.px[i + 3] !== 255) continue;
    K.px[i] += (255 - K.px[i]) * a; K.px[i + 1] += (214 - K.px[i + 1]) * a; K.px[i + 2] += (130 - K.px[i + 2]) * a * 0.5;
  }
}
const HUNG = {
  wallshelf(K, m, top) {
    const Wd = R('#7a5a3a'), y = top + 16;
    for (const x of [m - 15, m + 14]) { K.rect(x, y + 1, x + 2, y + 6, Wd[3]); K.line(x, y + 5, x - 2, y + 1, Wd[3]); }
    /* plates standing on the back of the shelf, tankards and a jug in front of them */
    for (const [dx, c] of [[-12, '#f2ece0'], [-4, '#c9d4d8'], [5, '#e8c49a']]) K.oval(m + dx, y - 4, 3.5, 3.5, (px, py, ddx, ddy) => R(c)[Math.hypot(ddx, ddy) > 0.7 ? 2 : Math.hypot(ddx, ddy) < 0.3 ? 1 : 0]);
    for (const dx of [-8, 1, 10]) { const C = R(dx === 1 ? '#a8aeb0' : '#8e6a44'); K.rect(m + dx - 1, y - 4, m + dx + 2, y, (px) => C[px === m + dx - 1 ? 1 : 2]); K.set(m + dx + 2, y - 3, C[3]); K.set(m + dx + 2, y - 2, C[3]); }
    JUG(K, m + 15, y);
    K.rect(m - 18, y, m + 19, y + 1, Wd[0]); K.rect(m - 18, y + 1, m + 19, y + 3, Wd[2]);
  },
  wallantlers(K, m, top) {
    const Wd = R('#6b4c32'), B = R('#e8dcc0');
    K.oval(m, top + 18, 5, 7, (px, py, dx, dy) => Wd[Math.hypot(dx, dy) > 0.75 ? 3 : dx + dy < -0.3 ? 1 : 2]);
    K.oval(m, top + 15, 2.5, 3, R('#c8b28a')[2]);
    for (const s of [-1, 1]) {
      /* a beam curving up and out, tines off it */
      let px = m + s * 2, py = top + 13;
      for (let k = 0; k < 12; k++) { px += s * (k < 6 ? 1 : 0.5); py -= k < 6 ? 0.6 : 1; K.set(px, py, B[k % 3 === 0 ? 2 : 1]); K.set(px, py + 1, B[3]); }
      for (const [k, l] of [[3, 4], [7, 4], [10, 3]]) { const bx = m + s * (2 + Math.min(k, 6) + Math.max(0, k - 6) * 0.5), by = top + 13 - (Math.min(k, 6) * 0.6 + Math.max(0, k - 6)); for (let i = 1; i <= l; i++) K.set(bx - s * i * 0.3, by - i, B[1]); }
    }
  },
  wallshield(K, m, top, o) {
    const Mt = R('#c8ccd0'), Gd = R('#c9a24f'), C = R(['#8e2c26', '#3e5470', '#465c36'][Math.floor((o.v ?? 0.5) * 3) % 3]);
    for (const s of [-1, 1]) { for (let i = 0; i <= 22; i++) K.set(m - s * 11 + s * i, top + 4 + i, Mt[i < 3 ? 2 : 1]); K.rect(m + s * 8 - 2, top + 21, m + s * 8 + 2, top + 22, Gd[1]); K.rect(m + s * 10 - 1, top + 22, m + s * 10 + 1, top + 26, R('#5a3f28')[2]); }
    K.oval(m, top + 14, 8, 9, (px, py, dx, dy) => { const d = Math.hypot(dx, dy); if (d > 0.84) return Gd[dx + dy < 0 ? 1 : 3]; if (d < 0.22) return Gd[dx + dy < 0 ? 0 : 2]; return Math.abs(dx) < 0.12 || Math.abs(dy) < 0.12 ? R('#efe3c4')[1] : C[dx + dy < -0.2 ? 1 : 2]; });
  },
  /* the smith's wall: a rail on the plaster with hammers and tongs hung from its pegs and a horseshoe nailed up at
     either end, each throwing its shadow on the wall */
  walltools(K, m, top) {
    const y = top + 8;
    K.rect(m - 18, y, m + 19, y + 3, (x, yy) => OAK[yy === y ? 0 : yy === y + 2 ? 4 : h2(x >> 2, yy, 51) < 0.2 ? 3 : 2]);
    for (let x = m - 18; x < m + 19; x++) umbra(K, x, y + 3, 0.35);
    for (const S2 of [caster(K, 0.35), K]) { hammerAt(S2, m - 13, y + 3, 9, 2); tongsAt(S2, m - 7, y + 3, 14); hammerAt(S2, m - 1, y + 3, 7, 3); tongsAt(S2, m + 5, y + 3, 12); hammerAt(S2, m + 11, y + 3, 9, 2); shoeAt(S2, m - 17, y + 17); shoeAt(S2, m + 17, y + 17); }
    for (const px of [m - 13, m - 7, m - 1, m + 5, m + 11]) K.set(px, y + 1, STEEL[0]);
  },
  /* the alchemist's wall shelf: two shelves of bottles, flasks and a jar */
  wallpotions(K, m, top) {
    const Wd = R('#6b4c32'), COLS = ['#6fbf6a', '#a46ac8', '#e0a23a', '#c4503e', '#4fb0b0'];
    for (const [y, n] of [[top + 13, 0], [top + 24, 1]]) {
      for (let k = 0; k < 6; k++) BOTTLE(K, m - 14 + k * 6, y, COLS[(k + n * 2) % COLS.length], 3 + Math.round(h2(k, n, 98) * 3));
      K.rect(m - 17, y, m + 18, y + 1, Wd[0]); K.rect(m - 17, y + 1, m + 18, y + 3, Wd[2]);
      for (const x of [m - 15, m + 15]) K.rect(x, y + 3, x + 2, y + 6, Wd[3]);
    }
  },
  /* bunches of herbs hung upside down to dry from a cord along the wall */
  wallherbs(K, m, top) {
    const Cd = R('#c8b28a'), HERB = ['#7f9a52', '#93a862', '#a8a46a', '#b98ad8', '#6f8a5a'], y = top + 7;
    for (let x = m - 18; x <= m + 18; x++) K.set(x, y + Math.round(Math.abs(x - m) / 9), Cd[2]);
    for (let k = 0; k < 6; k++) {
      const x = m - 15 + k * 6, yy = y + Math.round(Math.abs(x - m) / 9) + 1, C = R(HERB[k % HERB.length]);
      K.rect(x, yy, x + 1, yy + 3, Cd[3]); K.rect(x - 1, yy + 3, x + 2, yy + 10, (px, py) => C[px === x - 1 ? 1 : py > yy + 8 ? 3 : 2]);
    }
  },
  /* a star chart pinned to the wall: a dark blue sheet with the circles of the heavens and stars in gold */
  wallchart(K, m, top) {
    const B = R('#2f3f66'), G = R('#e2c26a'), P = R('#e8dcc0');
    K.rect(m - 14, top + 5, m + 15, top + 27, (x, y) => (x === m - 14 || y === top + 5 ? P[1] : x === m + 14 || y === top + 26 ? P[3] : B[h2(x, y, 99) < 0.1 ? 1 : 2]));
    K.oval(m, top + 16, 9, 8, (x, y, dx, dy) => { const d = Math.hypot(dx, dy); return d > 0.88 || Math.abs(d - 0.5) < 0.08 || Math.abs(dx) < 0.06 ? G[2] : null; });
    for (const [dx, dy] of [[-10, -7], [-4, -3], [3, -6], [8, 2], [-7, 5], [5, 7], [11, -4], [0, 3]]) K.set(m + dx, top + 16 + dy, G[0]);
    for (const x of [m - 13, m + 13]) K.set(x, top + 6, R('#c4503e')[1]);
  },
  wallsconce(K, m, top) {
    const I = R('#3b3a38'), y = top + 20;
    K.rect(m - 1, y, m + 2, y + 6, I[2]); K.line(m, y + 2, m + 3, y - 2, I[1]);
    K.rect(m + 1, y - 3, m + 6, y - 2, I[2]);
    K.rect(m + 3, y - 9, m + 5, y - 3, R('#f4efe2')[1]);
    K.set(m + 3, y - 10, R('#f6d36a')[0]); K.set(m + 4, y - 10, R('#f6d36a')[0]); K.set(m + 3, y - 11, R('#f4a03a')[1]); K.set(m + 3, y - 12, R('#f6d36a')[0], 140);
    candlelight(K, m + 4, y - 10, 18, 15, 0.55);
  }
};
function wallHung(K, o, id) {
  roomWall(K, o);
  const L = o.links || [0, 0, 0, 0];
  if (L[0] || L[2] || !(L[1] || L[3])) HUNG[id](K, T / 2, T / 2 + RT - ROOMW, o);
}

const INTERIOR = {
  iwall: (K, o) => roomWall(K, o),
  iwindow: (K, o) => roomWall(K, o, true),
  idoor: (K, o) => roomDoor(K, o),
  post: (K) => { const P = R('#7a5a3a'), cx = K.FW / 2, cy = K.FD / 2; K.rect(cx - 3, cy - ROOMW, cx + 3, cy + 3, (x) => P[x < cx - 1 ? 1 : 3]); },
  hearth: (K, o) => roomHearth(K, o),
  stairs: (K, o) => stairsSprite(K, o),
  wallshelf: (K, o) => wallHung(K, o, 'wallshelf'),
  wallantlers: (K, o) => wallHung(K, o, 'wallantlers'),
  wallshield: (K, o) => wallHung(K, o, 'wallshield'),
  wallsconce: (K, o) => wallHung(K, o, 'wallsconce'),
  walltools: (K, o) => wallHung(K, o, 'walltools'),
  wallpotions: (K, o) => wallHung(K, o, 'wallpotions'),
  wallherbs: (K, o) => wallHung(K, o, 'wallherbs'),
  wallchart: (K, o) => wallHung(K, o, 'wallchart'),
  /* a wall with the back bar standing against it (backBar) */
  wallbar: (K, o) => { roomWall(K, o); const L = o.links || [0, 0, 0, 0]; if (L[0] || L[2] || !(L[1] || L[3])) backBar(K, { face: 0, v: o.v }, T / 2 + RT + 1); },
  ...FURNITURE
};

/* ---------- the elven wood (town/elven.js) ---------- */
{
  const E = elvenTown({ R, mix, INK, h2, hexRgb, crown, foliageRamp, leafRamp, leafClump, trunk, broadleaf, wallTone, ROOF });
  Object.assign(BUILD, E.build); Object.assign(NATURE, E.nature); Object.assign(PROPS, E.props);
}

/* ---------- a piece ---------- */
const DRAW = { ...BUILD, ...NATURE, ...PROPS, ...INTERIOR };
/* how far a piece's shadow falls east of it, in art pixels */
const FLAT = new Set(['flowers', 'mushrooms', 'rocks', 'rowboat', 'reeds', 'fence', 'moonflowers']);
const TREES = new Set(['oak', 'beech', 'birch', 'poplar', 'pine', 'snowpine', 'palm', 'deadtree', 'mallorn', 'willow']);
/* the leafy pieces, whose edges are kept soft (kit softEdge) */
const SOFT = new Set(['oak', 'beech', 'birch', 'poplar', 'bush', 'mallorn', 'willow']);
/* how far a tree stands off its tile's middle: [east, north] in art pixels (collision follows it) */
const treeOffset = o => { const v = Math.floor((o.v ?? 0.5) * 1e4); return [Math.round((h2(v, 1) - 0.5) * 18), Math.round(h2(v, 2) * 8)]; };
/* a shadow cast east from a piece's own outline: on each of its lowest `rows` rows, ground beyond its rightmost drawn
   pixel is darkened for up to len pixels, tapering toward the back; for pieces that do not fill their footprint */
function castEast(K, len, rows = 70) {
  const { w, h, px } = K, yEnd = Math.min(h - 1, K.oy + K.FD - 2);
  for (let y = Math.max(0, yEnd - rows); y <= yEnd; y++) {
    let r = -1; for (let x = w - 1; x >= 0; x--) if (px[(y * w + x) * 4 + 3] === 255) { r = x; break; }
    if (r < 0) continue;
    const reach = Math.round(len * Math.min(1, (y - (yEnd - rows) + 2) / 14));
    for (let x = r + 1; x <= Math.min(w - 1, r + reach); x++) { const i = (y * w + x) * 4; if (px[i + 3]) continue; px[i] = SHADOW[0]; px[i + 1] = SHADOW[1]; px[i + 2] = SHADOW[2]; px[i + 3] = SHADOW[3]; }
  }
}
const OPEN_SHADOW = {
  elvenhall: K => castEast(K, 16, 60), elvenmanor: K => castEast(K, 18, 90), elvenrotunda: K => castEast(K, 18, 80), elvenspire: K => castEast(K, 14, 110),
  elvenpavilion: K => K.ovalShadow(K.FW / 2 + 4, K.FD - 9, K.FW * 0.42, 7),
  flet: K => K.ovalShadow(K.FW / 2 + 4, K.FD - 8, 20, 6),
  elvenarch: (K, o) => { if ((o.face || 0) % 2) for (const y of [14, K.FD - 14]) K.ovalShadow(K.FW / 2 + 4, y, 8, 4); else for (const x of [18, K.FW - 18]) K.ovalShadow(x + 4, K.FD / 2 + 14, 10, 4); }
};
/* A flight of stairs at the figures' scale in the middle of its tile (flightBox): eight steps a stride deep climbing
   toward the back (face 0: north) between stringers, a banister along each side on newel posts, and on some flights (by
   o.v) a red runner held by brass rods. It is drawn as it would be seen from the south with the light from the upper
   left: climbing north, every riser faces the viewer, darkest under its lit nosing; climbing south, each nosing throws
   a shadow on the step below; climbing east or west, the flight is seen side on, its treads stepping up toward the
   top over a stepped stringer, the risers catching the light (east) or turned from it (west). A soft shadow lies east
   of it. Treads carry a grain and lighten toward the top. */
function stairsSprite(K, o) {
  const f = facing(o), [x0, y0, x1, y1] = o.box || flightBox(f), ns = f % 2 === 0, len = ns ? y1 - y0 : x1 - x0, W = ns ? x1 - x0 : y1 - y0;
  const P = R('#a8814f'), D = R('#6b4c32'), RUN = R('#a8432f'), BRASS = R('#c9a24f'), n = 8, sw = 3, runner = (o.v ?? 0.5) >= 0.5;
  /* side on, the flight rises RISE pixels from foot to top, a step at a time */
  const RISE = ns ? 0 : 12, stepOf = p => Math.min(n - 1, Math.floor(p * n / len)), rise = p => (RISE ? Math.round((stepOf(p) + 1) * RISE / n) : 0);
  /* the pixel at p along the flight (0 at its foot) and a across it (0 on its west or north side), raised by the rise */
  const at = (p, a, up = rise(p)) => (f === 0 ? [x0 + a, y1 - 1 - p] : f === 2 ? [x0 + a, y0 + p] : f === 1 ? [x0 + p, y0 + a - up] : [x1 - 1 - p, y0 + a - up]);
  const put = (p, a, c, up) => { const [x, y] = at(p, a, up); K.set(x, y, c); };
  const r0 = Math.round(W * 0.3), r1 = W - r0, RH = 9;
  /* the shadow east of the flight, on the floor */
  for (let y = y0 - (ns ? 0 : RISE); y < y1; y++) for (let x = x1; x < x1 + 4; x++) if (!K.get(x, y)) K.set(x, y, SHADOW, Math.round(SHADOW[3] * (1 - (x - x1) / 4)));
  /* side on: the south face of the flight under its treads, stepped along its top, darker toward the ground */
  if (RISE) for (let p = 0; p < len; p++) { const e = rise(p), [x, yb] = at(p, W - 1, 0); for (let k = 0; k <= e; k++) K.set(x, yb - k, k === e ? D[1] : D[k < 2 ? 4 : 3]); }
  /* the north banister stands behind the treads */
  const banister = (side, front) => {
    const a = side ? W - 2 : 1;
    for (let p = 0; p < len; p++) {
      const up = RISE * p / len, [x, y] = at(p, a, Math.round(up));
      if (ns) { K.set(x - 1, y - RH, D[0]); K.set(x, y - RH, D[2]); } else { K.set(x, y - RH - 1, D[0]); K.set(x, y - RH, D[2]); }
      /* balusters where the rail runs across the view: sparse in front so the steps show through */
      if (!ns && p > 2 && p < len - 2 && p % (front ? 7 : 5) === 3) for (let k = 1; k < RH; k++) K.set(x, y - k, D[k < 3 ? 3 : 2]);
    }
    for (const [p, big] of [[1, true], [len - 2, false]]) {
      const [x, y] = at(p, a), w = big ? 4 : 3, top = y - RH - (big ? 3 : 1);
      K.rect(x - 1, top, x - 1 + w, y + 1, (px) => D[px === x - 1 ? 1 : px === x - 2 + w ? 3 : 2]);
      K.rect(x - 2, top - 1, x + w, top + 1, (px) => D[px <= x - 1 ? 0 : 1]);
      if (big) K.set(x, top - 2, BRASS[1]);
    }
  };
  if (!ns) banister(0, false);
  for (let i = 0; i < n; i++) {
    const p0 = Math.round(i * len / n), p1 = Math.round((i + 1) * len / n), tone = i > 4 ? 1 : 2;
    for (let p = p0; p < p1; p++) for (let a = sw; a < W - sw; a++) {
      const q = p - p0, on = runner && a >= r0 && a < r1, T0 = on ? RUN : P; let c = T0[tone];
      if (f === 0 && q < 3) c = T0[q === 2 ? 4 : 3];               /* the riser, darkest under the nosing */
      else if (f === 0 && q === 3) c = T0[0];                       /* the nosing */
      else if (f === 2 && q === 0 && i) c = T0[0];                  /* the nosing, toward the viewer */
      else if (f === 2 && q === p1 - p0 - 1 && i < n - 1) c = T0[4]; /* the shadow it throws on the step below */
      else if (f === 2 && q === p1 - p0 - 2 && i < n - 1) c = T0[3];
      else if (f === 1 && q === 0) c = T0[0];                       /* risers facing the light */
      else if (f === 3 && q === 0) c = T0[4];                       /* risers turned from it */
      else if (f % 2 && q === 1) c = T0[f === 1 ? 1 : 3];
      else if (!on && h2(...at(p, a, 0), 91) < 0.14 && (ns ? a : p) % 5 !== 0) c = P[tone + 1];
      if (on && (a === r0 || a === r1 - 1) && !(f === 0 && q < 4)) c = RUN[4];
      put(p, a, c);
    }
    /* a brass rod across the runner where each tread meets the riser above */
    if (runner && i) { const q = f === 0 ? 3 : f === 2 ? p1 - p0 - 1 : 1; for (let a = r0 - 1; a <= r1; a++) put(p0 + q, a, BRASS[a === r0 - 1 || a === r1 ? 2 : 0]); }
  }
  /* the stringers, their tops lit on the side toward the light */
  for (let p = 0; p < len; p++) for (const side of [0, 1]) for (let k = 0; k < sw; k++) { const a = side ? W - sw + k : k; put(p, a, D[k === 0 ? 1 : k === sw - 1 ? 3 : 2]); }
  if (ns) { banister(0, false); banister(1, false); } else banister(1, true);
}
/* where a flight of stairs lies in its tile, in tile pixels [x0, y0, x1, y1]: at the figures' scale (about a person
   and a half wide, a few strides long) in the middle, its long side running the way it climbs. The town view walks
   the hero up it (or down the stairwell over it) when their feet reach this box. */
const FLIGHT_W = 30, FLIGHT_L = 56;
/* (the town view sets a flight in a corner of its tile: see flightRect in town/view.js) */
const flightBox = f => { const a = (T - FLIGHT_W) / 2, b = (T - FLIGHT_L) / 2; return f % 2 === 0 ? [a, b, a + FLIGHT_W, b + FLIGHT_L] : [b, a, b + FLIGHT_L, a + FLIGHT_W]; };
const ROOM = new Set(['iwall', 'iwindow', 'idoor', 'post', 'stairs', 'hearth', ...HUNG_WALLS]);
/* the tavern's pieces drawn across their whole tile (see barCounter) */
const FULL = new Set([...COUNTERS, 'tableset', 'feastset', 'backbar', 'casks', 'forge', 'alchemybench']);
/* the room pieces a piece can stand against, and the pieces that do (drawn back against the wall behind their tile) */
const WALLED = new Set(['iwall', 'iwindow', 'hearth', 'post', ...HUNG_WALLS]), SNUG = new Set(['backbar', 'casks', 'forge', 'alchemybench']);
/* The pieces at the figures' scale that stand back against a room wall behind them, as shelves, cupboards, racks and
   beds do, instead of at the front of their tile: nudged [x, y] map pixels toward the wall by their facing (north, west or east;
   a piece with its back to a wall south of it would be hidden by that wall, so it stays where it is). */
const SNUG_SMALL = new Set(['potionshelf', 'apothecary', 'herbrack', 'toolrack', 'weaponrack', 'armorstand', 'ironstock', 'quench', 'bookshelf', 'wardrobe', 'dresser', 'desk', 'bed', 'cot', 'chest']);
/* the nudge for piece o facing f, from the middle of the south edge of its footprint (where a piece at the figures'
   scale stands) to just in front of the wall's face: a north wall's face is 43 pixels into the tile behind, a side
   wall's shaded east face 39 */
const nudgeOf = (o, f) => {
  const [fw, fd] = footprint(o), across = (fw * T - fw * 32) / 2;
  return f === 0 ? [0, -(fd * T - fd * 32) - 53] : f === 1 ? [-across - 49, 0] : f === 3 ? [across + 53, 0] : null;
};
/* how the pieces objs fit the room round them: for piece o, { snug: whether it stands with its back to a room wall on the
   tile behind it (SNUG and SNUG_SMALL pieces only), nudge: for a SNUG_SMALL piece standing so, how far it is moved
   toward that wall ([x, y] map pixels), and for an anvil before a forge, how far it is drawn up to it, onWall: whether
   it is furniture standing on a wall's own tile (tiles/index.js standsOnWall), shift and ends: for a bar piece, how far its counter stands off the middle of
   its tile ([x, y], the same for every piece of a run of joined bar pieces: set back toward the back of the pieces
   facing north or south, and of those facing east or west) and which of its sides have a room wall beside them
   ([+x, +y, -x, -y]) } */
function fitTo(objs) {
  const key = (L, x, y) => `${L},${x},${y}`, walls = new Set(), backs = new Set(), bars = new Map(), shift = new Map(), D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const forges = new Set();
  for (const p of objs) { if (WALLED.has(p.id)) walls.add(key(p.level || 0, p.x, p.y)); if (p.id === 'wallbar') backs.add(key(p.level || 0, p.x, p.y)); if (COUNTERS.has(p.id)) bars.set(key(p.level || 0, p.x, p.y), p); if (p.id === 'forge') forges.add(key(p.level || 0, p.x, p.y)); }
  for (const p of bars.values()) {
    if (shift.has(p)) continue;
    const net = [p], sh = [0, 0]; shift.set(p, sh);
    for (let i = 0; i < net.length; i++) {
      const c = net[i], f = facing(c) & 3;
      if (f % 2 === 0 && !sh[1]) sh[1] = f === 0 ? -BAR_BACK : BAR_BACK;
      if (f % 2 && !sh[0]) sh[0] = f === 3 ? BAR_BACK : -BAR_BACK;
      for (const [dx, dy] of D) { const n = bars.get(key(c.level || 0, c.x + dx, c.y + dy)); if (n && !shift.has(n)) { shift.set(n, sh); net.push(n); } }
    }
  }
  const onWall = standsOnWall(objs);
  return o => {
    /* furniture on a wall's own tile: back against the wall's face on the side it faces, drawn after the wall */
    if (onWall.has(o)) {
      const f = facing(o) & 3, n = nudgeOf(o, f), [sx, sy] = [[0, 1], [1, 0], [0, -1], [-1, 0]][f];
      return { snug: true, nudge: [n[0] + sx * T, n[1] + sy * T], onWall: true, shift: null, ends: null };
    }
    const L = o.level || 0, wall = (dx, dy) => walls.has(key(L, o.x + dx, o.y + dy)), [bx, by] = [[0, -1], [-1, 0], [0, 1], [1, 0]][facing(o) & 3];
    if (COUNTERS.has(o.id)) return { snug: false, shift: shift.get(o) || null, ends: D.map(([dx, dy]) => (dy < 0 && backs.has(key(L, o.x, o.y - 1)) ? 2 : wall(dx, dy) ? 1 : 0)) };
    /* an anvil with a forge on the tile north of it stands up close before the forge, where the smith works */
    if (o.id === 'anvil' && forges.has(key(L, o.x, o.y - 1))) return { snug: false, nudge: [0, -100], shift: null, ends: null };
    if (SNUG_SMALL.has(o.id)) {
      /* the wall behind its back: to the north or west of its footprint's corner, or east past its width */
      const f = facing(o) & 3, [fw] = footprint(o), n = nudgeOf(o, f), back = f === 0 ? wall(0, -1) : f === 1 ? wall(-1, 0) : f === 3 ? wall(fw, 0) : false;
      return n && back ? { snug: true, nudge: n, shift: null, ends: null } : { snug: false, shift: null, ends: null };
    }
    return { snug: SNUG.has(o.id) && wall(bx, by), shift: null, ends: null };
  };
}
const shadowOf = a => (a.group === 'Interior' ? 0 : Math.min(16, 4 + a.h * 0.3));
/* the sprite for placed piece o ({ id, face, v, links }), trimmed to what is drawn:
   { w, h, px, ox, oy } with (ox, oy) the footprint's north-west corner */
/* drawn at the tile set's 32 scale and stood in the middle of the south edge of their footprint */
const SMALL = new Set([...Object.keys(NATURE), ...Object.keys(PROPS).filter(id => id !== 'fence'), ...Object.keys(INTERIOR).filter(id => !ROOM.has(id) && !FULL.has(id))]), MID = new Set(['yurt', 'mine', 'watchtower', 'granary', 'dovecote', 'shrine']);
function pieceSprite(o) {
  const a = ASSET_BY_ID[o.id], [fw, fd] = footprint(o), U = SMALL.has(o.id) ? 32 : MID.has(o.id) ? 64 : T, small = U !== T, FW = fw * U, FD = fd * U, up = Math.round(Math.max(40, (a ? a.h : 16) * 4.4 + 60));
  /* a flight set in a corner reaches into the tiles beside its own */
  const K = kit(FW, FD, up, small ? 50 : o.id === 'stairs' || COUNTERS.has(o.id) ? 64 : 16), draw = DRAW[o.id];
  const inst = { face: o.face || 0, v: o.v ?? 0.5, links: o.links || null, box: o.box || null, snug: o.snug || 0, shift: o.shift || null, ends: o.ends || null };
  if (draw) draw(K, inst);
  else K.box(4, 4, FW - 4, FD - 4, Math.min(30, (a ? a.h : 8) * 1.4), R('#c4b99f')[1], R('#c4b99f')[3]);
  if (SOFT.has(o.id)) K.softEdge();
  /* room walls join the next seamlessly: no ink where they meet it */
  else if (WALLS_JOINED.has(o.id) || COUNTERS.has(o.id)) { const L = o.links || [0, 0, 0, 0], top = COUNTERS.has(o.id) ? -BAR_H : -ROOMW + 1; K.outline(0.6, (x, y) => (L[2] && x <= 0) || (L[0] && x >= FW - 1) || (L[3] && y <= top) || (L[1] && y >= FD - 1)); }
  else K.outline(a && a.group === 'Interior' ? 0.6 : TREES.has(o.id) ? 0.5 : 0.75);
  /* the shadow falls on the ground to the east, and under trees and props as a pool round their foot */
  const len = a ? shadowOf(a) : 6;
  if (a && (a.group === 'Nature' || a.group === 'Props')) { if (!FLAT.has(o.id)) K.ovalShadow(FW / 2 + 3, FD - 7, FW * 0.4, Math.min(8, FD * 0.18)); }
  /* open pieces cast no block of shadow: the pavilion and the flet a pool round their foot, an archway only under its pillars */
  else if (OPEN_SHADOW[o.id]) OPEN_SHADOW[o.id](K, o);
  else if (len) K.shadow(2, 4, FW - 2, FD - 2, len);
  const s = trim(K);
  if (small) { s.ox -= (fw * T - FW) / 2; s.oy -= fd * T - FD; }
  if (o.nudge) { s.ox -= o.nudge[0]; s.oy -= o.nudge[1]; }
  /* trees stand a little off the grid, each its own way, so a wood does not grow in rows */
  if (TREES.has(o.id)) { const [dx, dy] = treeOffset(o); s.ox -= dx; s.oy += dy; }
  return s;
}
function trim(K) {
  const { w, h, px } = K; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { w: 1, h: 1, px: new Uint8ClampedArray(4), ox: 0, oy: 0 };
  const W2 = x1 - x0 + 1, H2 = y1 - y0 + 1, out = new Uint8ClampedArray(W2 * H2 * 4);
  for (let y = 0; y < H2; y++) out.set(px.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * W2 * 4);
  return { w: W2, h: H2, px: out, ox: K.ox - x0, oy: K.oy - y0 };
}
const DESIGNED = new Set(Object.keys(DRAW));

export { COUNTERS, DESIGNED, FIRE, FLIGHT_L, FLIGHT_W, MID, ROOM, SMALL, TREES, TABLE, barRuns, barStools, fitTo, flightBox, pieceSprite, seatsOf, treeOffset, turned };
