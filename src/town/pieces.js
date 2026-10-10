import { OUTLINE, hexRgb, ramp } from '../characters/pixels.js';
import { ASSET_BY_ID, footprint } from '../tiles/index.js';
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
    /* ink every opaque pixel that touches a clear one */
    outline(k = 0.75) {
      const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] === 255, edge = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1))) edge.push((y * w + x) * 4);
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
  thatch: '#c9a463', tiles: '#a6533b', slate: '#6d7a86', shingle: '#7d6a55', copper: '#6f9c86', felt: '#cbb894', lead: '#8a8f90'
};
function roofTone(tex, P, u, v, plane = 0) {
  /* u runs along the eave, v up the slope from it */
  let t;
  if (tex === 'thatch') { const row = Math.floor(v / 4), m = v % 4; t = m === 3 ? 3 : h2(u, row, 3) < 0.28 ? 3 : h2(u, row, 4) < 0.2 ? 1 : 2; if (m === 0 && h2(u, row, 5) < 0.4) t = 1; }
  else if (tex === 'tiles') { const row = Math.floor(v / 4), m = v % 4, c = ((u + (row % 2) * 2) % 4 + 4) % 4; t = m === 0 ? 4 : c === 0 ? 3 : m === 3 && c === 1 ? 1 : 2; }
  else if (tex === 'slate' || tex === 'lead') { const row = Math.floor(v / 3), m = v % 3, c = ((u + (row % 2) * 3) % 6 + 6) % 6; t = m === 0 ? 4 : c === 0 ? 3 : h2(Math.floor((u + (row % 2) * 3) / 6), row, 7) < 0.25 ? 1 : 2; }
  else if (tex === 'shingle') { const row = Math.floor(v / 3), m = v % 3, c = ((u + Math.floor(h2(row, 1) * 5)) % 5 + 5) % 5; t = m === 0 ? 4 : c === 0 ? 3 : 2; }
  else if (tex === 'copper') { t = ((u % 6) + 6) % 6 === 0 ? 3 : v % 7 === 0 ? 1 : 2; }
  else { t = v % 5 === 0 ? 3 : 2; }
  return P[Math.min(4, t + plane)];
}
const WALL = {
  plaster: '#efe3c4', cream: '#e9d6ae', ochre: '#e6cfa6', rose: '#e9c4b2', stone: '#d8cfb9', grey: '#c4bcab', planks: '#9a7650', barn: '#a4553b', logs: '#8e6a44', white: '#f2ece0', felt: '#d9c9a0', adobe: '#d7b48a'
};
const TIMBER = R('#5a3f28');
function wallTone(tex, P, x, y, wx0, wx1, floorH, top) {
  if (tex === 'stone' || tex === 'grey') { const row = Math.floor(y / 5), m = ((y % 5) + 5) % 5, c = ((x + (row % 2) * 4) % 8 + 8) % 8; return P[m === 4 ? 4 : c === 0 ? 3 : m === 0 ? 1 : h2(Math.floor((x + (row % 2) * 4) / 8), row, 9) < 0.25 ? 3 : 2]; }
  if (tex === 'planks' || tex === 'barn') { const c = ((x % 4) + 4) % 4; return P[c === 0 ? 4 : c === 1 ? 1 : h2(Math.floor(x / 4), Math.floor(y / 14), 3) < 0.3 ? 3 : 2]; }
  if (tex === 'logs') { const m = ((y % 4) + 4) % 4; return P[m === 0 ? 1 : m === 3 ? 4 : 2]; }
  if (tex === 'timber') {
    /* plaster panels in a timber frame: posts at the ends and every 9 pixels, rails at each floor, a brace or two */
    const lx = x - wx0, ly = y - top, fl = ((ly % floorH) + floorH) % floorH, n = Math.max(1, Math.round((wx1 - wx0) / 9)), pw = (wx1 - wx0) / n, px = ((lx % pw) + pw) % pw;
    if (px < 1.5 || lx > wx1 - wx0 - 2 || fl < 2) return TIMBER[fl < 2 || px < 1 ? 2 : 3];
    const panel = Math.floor(lx / pw), d = panel === 0 ? px - fl * pw / floorH : panel === n - 1 && n > 1 ? pw - px - fl * pw / floorH : 9; if (Math.abs(d) < 1) return TIMBER[2];
    return P[h2(x, y, 5) < 0.06 ? 3 : 2];
  }
  return P[h2(x, y, 5) < 0.07 ? 3 : h2(x, y, 6) < 0.04 ? 1 : 2];
}
/* a window set into the wall: a lintel over it, a frame, glass shadowed under the lintel with a glint, glazing bars,
   a sill that stands out with its shadow below, and shutters if asked */
function windowAt(K, x, y, w = 6, h = 7, opts = {}) {
  const F = R(opts.frame || '#efe6d0'), G = R(opts.glass || '#3b4a5a'), S = opts.shutter ? R(opts.shutter) : null, lit = opts.lit ? R('#f2c25a') : null;
  if (S) for (const sx of [x - 4, x + w + 1]) K.rect(sx, y, sx + 3, y + h, (px, py) => (py === y ? S[1] : (py - y) % 3 === 0 ? S[3] : px === sx ? S[1] : S[2]));
  K.rect(x - 1, y - 2, x + w + 1, y - 1, inked(F[3], 0.35));
  if (opts.arch) K.oval(x + w / 2, y, w / 2 + 1, 2.5, F[2]);
  K.rect(x, y - 1, x + w, y + h, F[1]);
  K.rect(x + 1, y, x + w - 1, y + h - 1, (px, py) => {
    if (py === y) return lit ? lit[2] : inked(G[3], 0.4);
    if (px === x + 2 && py > y + 1 && py < y + 4) return lit ? lit[0] : G[0];
    return lit ? lit[py < y + h / 2 ? 0 : 1] : G[py < y + 3 ? 2 : 3];
  });
  if (w > 5) K.rect(x + Math.floor(w / 2), y, x + Math.floor(w / 2) + 1, y + h - 1, F[2]);
  if (h > 7) K.rect(x + 1, y + Math.floor(h / 2), x + w - 1, y + Math.floor(h / 2) + 1, F[2]);
  K.rect(x - 2, y + h - 1, x + w + 2, y + h + 1, (px, py) => (py === y + h - 1 ? F[0] : F[3]));
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
function chimney(K, x, y, h, smoke) {
  const C = R('#b9a98a'); K.rect(x, y - h, x + 5, y, (px, py) => C[(py - y) % 3 === 0 ? 3 : px === x ? 1 : 2]); K.rect(x - 1, y - h - 2, x + 6, y - h, C[1]);
  if (smoke) { const S = R('#e8e6e0'); [[2, -6, 3], [4, -12, 3.5], [1, -19, 4]].forEach(([dx, dy, r], i) => K.oval(x + dx, y - h + dy, r, r * 0.8, (px, py, a, b) => (K.get(px, py) ? null : S[a + b < -0.3 ? 0 : 1]))); }
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
  /* the wall takes what it needs, up to all but the room a roof needs above it */
  const wallH = Math.round(Math.min((p.wallH ?? 24) * HS, yb - Math.max(16, FD * 0.28))), rise = Math.round((p.rise ?? 16) * HS);
  const Wl = R(WALL[p.wall] || p.wall || WALL.plaster), Rf = R(ROOF[p.roof] || p.roof), floors = p.floors || 1, top = yb - wallH, floorH = wallH / floors;
  const ov = p.overhang ?? 4, ridgeX = p.ridge ? p.ridge === 'x' : FW >= FD, door = p.door !== false && o.face !== 2;
  /* the east wall: a strip sw wide beside the front, turned away from the light */
  const sw = Math.max(4, Math.round((x1 - x0) * 0.09)), k = 0, xf = x1 - sw;
  const tex = (x, y) => wallTone(p.wallTex || p.wall, Wl, x, y, x0, xf, floorH, top);
  if (p.lift) for (const sx of [x0 + 2, xf - 6, x1 - 3]) K.rect(sx, yb, sx + 4, yb + Math.round(p.lift * HS) - (sx > xf ? k : 0), R('#c4b99f')[sx < FW / 2 ? 2 : 3]);
  /* walls: the east one in shade, then the front with a lit west corner and a dark east one */
  K.poly([[xf, yb], [x1, yb - k], [x1, top], [xf, top]], (x, y) => mix(wallTone(p.wallTex || p.wall, Wl, x, y + Math.round((x - xf) * k / sw), xf, x1, floorH, top), INK, 0.3));
  K.rect(x0, top, xf, yb, tex);
  K.rect(x0, top, x0 + 1, yb, (x, y) => mix(tex(x, y), [255, 250, 235], 0.35));
  K.rect(xf - 1, top, xf, yb, (x, y) => mix(tex(x, y), INK, 0.3));
  /* the plinth along the foot of both walls */
  const Pl = R('#b5aa94');
  K.rect(x0, yb - 4, xf, yb, (x, y) => (y === yb - 4 ? Pl[1] : ((x + (y % 2) * 3) % 7 === 0 ? Pl[4] : Pl[2])));
  K.poly([[xf, yb], [x1, yb - k], [x1, yb - k - 4], [xf, yb - 4]], Pl[3]);
  const dx = p.doorX ?? (x0 + xf) / 2, doorW = Math.round((p.doorW || 10) * 1.6), doorH = Math.min(wallH - 10, Math.max(Math.round(floorH - 5), 30), Math.round((p.doorH || 16) * 2.1));
  if (p.windows !== false) {
    for (let f = 0; f < floors; f++) {
      const wh = Math.min(18, Math.round(floorH * 0.4)), wy = Math.round(top + floorH * (floors - 1 - f) + (floorH - wh) * (f ? 0.45 : 0.36)), ww = Math.round((p.winW || 6) * 2);
      for (const wx of windowSlots(x0 + 2, xf - 2, ww, door && f === 0, dx, doorW)) windowAt(K, wx, wy, ww, wh, { shutter: p.shutter, lit: p.lit, arch: p.arch, glass: p.glass });
    }
  }
  if (door) doorAt(K, dx, yb, doorW, doorH, { col: p.doorCol, arch: p.arch, open: p.open });
  if (ridgeX) {
    /* The roof fills the footprint above both walls: its south slope from the eave up to a capped ridge, straight
       along every edge, lighter toward the ridge and darker toward the eave, its east end (over the east wall) in
       shade. */
    const ridge = Math.min(top - 10, 2), eave = top + ov, l = x0 - ov, r = x1 + ov, hip = Math.min(rise, (eave - ridge) * 0.8), span = eave - ridge;
    const pts = p.hip ? [[l, eave], [l + hip, ridge], [r - hip, ridge], [r, eave]] : [[l, eave], [l, ridge], [r, ridge], [r, eave]];
    K.poly(pts, (x, y) => { const v = eave - y, band = v < 3 ? 1 : v > span * 0.72 ? -1 : 0; return roofTone(p.roof, Rf, x, v, band + (x >= xf + ov - 1 ? 1 : 0)) || Rf[1]; });
    /* the ridge cap: a row of capping tiles, lit along its top */
    const c0 = l + (p.hip ? hip : 0), c1 = r - (p.hip ? hip : 0);
    K.rect(c0, ridge, c1, ridge + 3, (x, y) => (y === ridge ? Rf[0] : y === ridge + 2 ? Rf[4] : (x - c0) % 5 === 0 ? Rf[3] : Rf[1]));
    if (!p.hip) { K.rect(l, ridge, l + 1, eave, Rf[3]); K.rect(r - 1, ridge, r, eave, Rf[4]); }
    /* the fascia under the eave, lit along its top, and its shadow on the walls */
    K.rect(l, eave - 1, r, eave + 1, (x, y) => (y === eave - 1 ? Rf[1] : inked(Rf[4], 0.4)));
    K.rect(x0, eave + 1, xf, eave + 4, (x, y) => mix(tex(x, y), INK, y === eave + 1 ? 0.45 : 0.25));
    if (p.chimney) chimney(K, Math.round(x0 + (xf - x0) * 0.7), Math.round(ridge + span * 0.4), 10, p.chimney > 1);
    if (p.dormer && span > 18) for (const fx of [0.3, 0.7]) { const cx = Math.round(x0 + (xf - x0) * fx), cy = Math.round(ridge + span * 0.5); K.poly([[cx - 8, cy + 2], [cx, cy - 7], [cx + 8, cy + 2]], Rf[1]); K.rect(cx - 6, cy + 2, cx + 6, cy + 10, Wl[2]); windowAt(K, cx - 3, cy + 3, 6, 6, {}); }
    return { ridge, eave, top, yb, x0, x1: xf };
  }
  /* ridge north-south: two slopes running back from the gable end in front, the east one in shade over the east wall */
  const cx = (x0 + xf) / 2, apex = Math.round(top - Math.min(rise, (xf - x0) * 0.45)), ridgeTop = 1, l = x0 - ov, r = x1 + ov, eaveTop = ridgeTop + Math.round((x1 - x0) * 0.3);
  K.poly([[l, eaveTop], [cx, ridgeTop], [cx, apex], [l, top + ov]], (x, y) => roofTone(p.roof, Rf, y, x - l, 0));
  K.poly([[cx, ridgeTop], [r, eaveTop], [r, top + ov], [cx, apex]], (x, y) => roofTone(p.roof, Rf, y, r - x, 1));
  K.rect(Math.floor(cx) - 1, ridgeTop, Math.floor(cx) + 1, apex, Rf[4]);
  K.poly([[x0, top + 1], [cx, apex + 3], [xf, top + 1]], tex);
  /* the bargeboards along the gable, standing proud */
  K.line(l, top + ov, cx, apex, Rf[1]); K.line(l, top + ov + 1, cx, apex + 1, inked(Rf[4], 0.45));
  K.line(cx, apex, xf + ov, top + ov, inked(Rf[3], 0.3)); K.line(cx, apex + 1, xf + ov, top + ov + 1, inked(Rf[4], 0.45));
  if (top - apex > 16) windowAt(K, Math.round(cx - 3), Math.round(apex + (top - apex) * 0.42), 6, 7, {});
  if (p.chimney) chimney(K, Math.round(cx + 8), Math.round((ridgeTop + apex) / 2), 10, p.chimney > 1);
  return { ridge: ridgeTop, eave: top + ov, top, yb, x0, x1: xf };
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
    const Rf = R(ROOF[p.roof] || p.roof), rise = p.rise ?? r * 2.2, rr = r + 2;
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

const BUILD = {
  cottage: (K, o) => house(K, o, { wall: ['plaster', 'cream', 'ochre', 'plaster'][Math.floor(o.v * 4) % 4], roof: 'thatch', wallH: 22, rise: 16, chimney: o.v > 0.5 ? 2 : 1, shutter: o.v > 0.3 ? '#6f8a5a' : null }),
  townhouse: (K, o) => house(K, o, { wall: ['plaster', 'cream', 'rose'][Math.floor(o.v * 3) % 3], wallTex: 'timber', roof: 'tiles', wallH: 38, floors: 2, rise: 14, chimney: 1, inset: 1 }),
  longhouse: (K, o) => house(K, o, { wall: '#c7b28a', wallTex: 'timber', roof: 'thatch', wallH: 20, rise: 20, chimney: 2 }),
  barn: (K, o) => house(K, o, { wall: 'barn', roof: 'shingle', wallH: 26, rise: 18, doorW: 16, doorH: 20, doorCol: '#6e3a28', windows: false }),
  granary: (K, o) => house(K, o, { wall: 'planks', roof: 'thatch', wallH: 14, rise: 12, lift: 6, hip: true, inset: 5, door: false, windows: false }),
  smithy: (K, o) => { house(K, o, { wall: 'stone', roof: 'slate', wallH: 22, rise: 12, chimney: 2, open: true, doorW: 12 }); K.oval(K.FW / 2, K.FD - 8, 5, 3, (x, y) => (y > K.FD - 9 ? R('#f4a03a')[1] : null)); },
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
    const { FW, FD } = K, P = R('#c4b99f'), b = house(K, o, { wall: 'cream', wallTex: 'timber', roof: 'tiles', wallH: 40, rise: 14, door: false, windows: false });
    K.rect(b.x0, b.yb - 18, b.x1, b.yb, R('#3a2e22')[3]);
    for (let x = b.x0; x < b.x1; x += 12) { K.rect(x, b.yb - 18, x + 4, b.yb, (px) => P[px === x ? 1 : 2]); K.oval(x + 8, b.yb - 18, 4, 3, P[2]); }
    for (let k = 0; k < Math.floor(FW / 14); k++) windowAt(K, Math.round(b.x0 + 6 + k * 14), b.top + 6, 6, 7, {});
    K.rect(b.x0, b.yb, b.x1, FD - 1, R('#d4cbb3')[2]);
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
/* A crown of leaf clumps round (cx, cy) within rx × ry. Each clump is lit on its upper left and shaded underneath,
   the ones higher in the crown lighter, the lower ones (drawn after, in front) darker, with a dark rim where a clump
   overlaps the one behind it. Inside, the leaves show as small dabs, a lit leaf over a darker one. Gaps between
   clumps open onto shadow, and the crown's lower edge hangs in its own shade. */
function crown(K, Lr, cx, cy, rx, ry, seed, opts = {}) {
  const n = opts.clumps || 7, clumps = [];
  /* a column (a poplar): clumps stacked up the stem, narrowing toward the top */
  if (opts.column) for (let i = 0; i < n; i++) { const f = i / (n - 1); clumps.push({ x: cx, y: cy + ry * 0.72 - f * ry * 1.6, r: rx * (f < 0.55 ? 0.92 : 0.92 - (f - 0.55) * 1.25) }); }
  else clumps.push({ x: cx, y: cy - ry * 0.35, r: Math.min(rx, ry) * 0.5 });
  for (let i = 0; i < (opts.column ? 0 : n); i++) {
    const a = (i / n) * Math.PI * 2 + seed * 1.7 + (h2(i, 1, seed * 13) - 0.5) * 0.6, d = 0.5 + h2(i, 2, seed * 13) * 0.22;
    clumps.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d * 0.9, r: Math.min(rx, ry) * (0.36 + h2(i, 3, seed * 13) * 0.12) });
  }
  if (!opts.column) clumps.push({ x: cx + rx * 0.05, y: cy + ry * 0.3, r: Math.min(rx, ry) * 0.42 });
  clumps.sort((p, q) => p.y - q.y);
  const own = new Map(), key = (x, y) => (Math.floor(y) + 512) * 4096 + Math.floor(x) + 512;
  clumps.forEach((c, j) => {
    const depth = (c.y - (cy - ry)) / (2 * ry);           /* 0 at the crown's top, 1 at its foot */
    for (let y = Math.floor(c.y - c.r - 2); y <= c.y + c.r; y++) for (let x = Math.floor(c.x - c.r - 2); x <= c.x + c.r + 1; x++) {
      const dx = (x + 0.5 - c.x) / c.r, dy = (y + 0.5 - c.y) / c.r;
      /* a scalloped edge: the clump's outline bulges in small leafy lobes */
      const ang = Math.atan2(dy, dx), lobe = 1 + 0.05 * Math.sin(ang * 5 + j * 2.1 + seed), d = Math.sqrt(dx * dx + dy * dy) / lobe;
      if (d > 1) continue;
      const under = own.has(key(x, y));
      /* flat, cel-like light: a lit band along the clump's top, shade along its underside, the body between in
         one tone; no rounded gradient, which reads as a polished ball */
      let l = -dy * 0.95 - dx * 0.2 - depth * 0.6 + 0.15 + (h2(j, 9, seed * 11) - 0.5) * 0.3;
      /* leaf dabs: a lit leaf above a dark notch, on a staggered grid */
      const gx = Math.floor((x + (Math.floor(y / 3) % 2) * 2) / 4), gy = Math.floor(y / 3), lx = ((x + (Math.floor(y / 3) % 2) * 2) % 4 + 4) % 4, ly = ((y % 3) + 3) % 3;
      const dab = h2(gx, gy, seed * 7 + 5);
      if (dab < 0.45) { if (ly === 0 && lx < 2) l += 0.2; else if (ly === 2 && lx === 1) l -= 0.25; }
      let t = l > 0.62 ? 1 : l > -0.12 ? 2 : l > -0.62 ? 3 : 4;
      if (t === 1 && dab < 0.25 && ly === 0) t = 0;
      /* the rim where this clump stands over the one behind, on its lower side */
      if (under && d > 0.88 && dy > -0.2) t = Math.max(t, 4);
      else if (d > 0.92 && dy > 0.4) t = Math.max(t, 3);
      K.set(x, y, Lr[t]); own.set(key(x, y), j);
    }
  });
  /* sun flecks on the top clumps, and fruit or blossom if asked */
  for (let k = 0; k < 10; k++) { const x = Math.round(cx - rx * 0.6 + h2(k, 4, seed * 5) * rx * 0.9), y = Math.round(cy - ry * 0.9 + h2(k, 5, seed * 5) * ry * 0.8); if (own.has(key(x, y)) && own.has(key(x + 1, y))) { K.set(x, y, Lr[1]); K.set(x + 1, y, Lr[1]); } }
  if (opts.fruit) for (let k = 0; k < 7; k++) { const x = Math.round(cx + (h2(k, 6, seed * 3) - 0.5) * rx * 1.5), y = Math.round(cy + (h2(k, 7, seed * 3) - 0.4) * ry * 1.2); if (own.has(key(x, y))) { const F = R(opts.fruit); K.set(x, y, F[1]); K.set(x + 1, y, F[2]); K.set(x, y + 1, F[3]); } }
  return own;
}
/* a trunk tapering from roots to crown, lit on its left, with bark and two boughs reaching into the crown */
function trunk(K, cx, base, top, col, birch = false) {
  const B = R(col), W = R('#eeeae0');
  for (let y = Math.floor(top); y < base; y++) {
    const f = (y - top) / (base - top), hw = 2 + f * 1.2 + (y > base - 4 ? (y - base + 4) * 0.9 : 0);
    for (let x = Math.floor(cx - hw); x < cx + hw; x++) {
      const u = (x + 0.5 - (cx - hw)) / (2 * hw);
      let c = birch ? W[u < 0.3 ? 0 : u < 0.7 ? 1 : 3] : B[u < 0.28 ? 1 : u < 0.62 ? 2 : u < 0.85 ? 3 : 4];
      if (birch && h2(Math.floor(y / 2), x, 3) < 0.16) c = INK;
      else if (!birch && h2(x, Math.floor(y / 3), 5) < 0.18) c = B[4];
      K.set(x, y, c);
    }
  }
  for (const [d, len] of [[-1, 9], [1, 8]]) for (let i = 0; i < len; i++) { const x = cx + d * (2 + i * 0.8), y = top + 6 - i * 0.9; K.set(x, y, B[d < 0 ? 2 : 3]); K.set(x, y + 1, B[4]); }
}
function broadleaf(K, col, cx, base, h, rw, bark = '#6e5236', s = 0, opts = {}) {
  const top = base - h, ry = rw * 0.48;
  trunk(K, cx, base, top + 2, bark, opts.birch);
  crown(K, leafRamp(col), cx, top - ry * 0.35, rw * 0.58, ry, s, opts);
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
  oak: (K, o) => broadleaf(K, o.v > 0.86 ? '#c99a3e' : '#7f9a4a', K.FW / 2, K.FD - 8, 50, 80, '#6e5236', o.v * 6, { clumps: 10 }),
  beech: (K, o) => broadleaf(K, '#b8683a', K.FW / 2, K.FD - 8, 50, 80, '#7a6a5a', o.v * 6, { clumps: 10 }),
  birch: (K, o) => broadleaf(K, '#9fb862', K.FW / 2, K.FD - 8, 56, 62, '#eeeae0', o.v * 6, { birch: true, clumps: 8 }),
  poplar: (K, o) => { const cx = K.FW / 2, b = K.FD - 8; trunk(K, cx, b, b - 22, '#6e5236'); crown(K, leafRamp('#76924a'), cx, b - 64, 18, 42, o.v * 5, { clumps: 10, column: true }); },
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
  bush: (K, o) => { const cx = K.FW / 2, b = K.FD - 6; crown(K, leafRamp('#86a058'), cx, b - 9, 14, 9, o.v * 4 + 1, { clumps: 5, fruit: o.v > 0.5 ? '#c4503e' : null }); },
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
const ROOMW = 34;
function roomWall(K, o, front) {
  const { FW, FD } = K, L = o.links || [0, 0, 0, 0], t = 5, c0 = FW / 2 - t, c1 = FW / 2 + t, P = R(WALL.plaster), Tp = R('#7a5a3a');
  const x0 = L[2] ? 0 : c0, x1 = L[0] ? FW : c1, y0 = L[3] ? 0 : c0, y1 = L[1] ? FD : c1;
  const seg = (a0, b0, a1, b1, f) => { K.rect(a0, b1 - ROOMW, a1, b1, (x, y) => (f ? f(x, y, b1) : null) || (y === b1 - 1 ? P[3] : y < b1 - ROOMW + 3 ? P[1] : P[2])); K.rect(a0, b0 - ROOMW, a1, b1 - ROOMW, (x, y) => Tp[(x + y) % 5 === 0 ? 3 : 2]); };
  seg(x0, c0, x1, c1, front); seg(c0, y0, c1, y1, null);
}
function furnBox(K, x0, y0, x1, y1, h, col, opt = {}) { const P = R(col); K.box(x0, y0, x1, y1, h, opt.top || ((x, y) => P[(x + y) % 7 === 0 ? 2 : 1]), opt.front || ((x, y) => P[y === y1 - 1 ? 4 : x === x0 ? 2 : 3])); return P; }
const facing = o => (o.face || 0);
const INTERIOR = {
  iwall: (K, o) => roomWall(K, o),
  iwindow: (K, o) => roomWall(K, o, (x, y, b) => (Math.abs(x - K.FW / 2) < 5 && y > b - ROOMW + 6 && y < b - 9 ? (Math.abs(x - K.FW / 2) < 4 && y > b - ROOMW + 7 && y < b - 10 ? R('#9cc0d0')[y < b - 16 ? 0 : 2] : R('#7a5a3a')[2]) : null)),
  idoor: (K, o) => { const L = o.links || [0, 0, 0, 0], P = R('#7a5a3a'), along = L[0] || L[2] || !(L[1] || L[3]); if (along) { K.rect(0, K.FD / 2 - ROOMW + 2, K.FW, K.FD / 2 - ROOMW + 6, P[2]); for (const x of [0, K.FW - 4]) K.rect(x, K.FD / 2 - ROOMW + 2, x + 4, K.FD / 2 + 4, P[x ? 3 : 1]); } else { K.rect(K.FW / 2 - 4, -ROOMW + 2, K.FW / 2 + 4, 4, P[2]); K.rect(K.FW / 2 - 4, K.FD - 4 - ROOMW, K.FW / 2 + 4, K.FD - 2, P[3]); } },
  post: (K) => { const P = R('#7a5a3a'), cx = K.FW / 2, cy = K.FD / 2; K.rect(cx - 3, cy - ROOMW, cx + 3, cy + 3, (x) => P[x < cx - 1 ? 1 : 3]); },
  hearth: (K, o) => { const S = R('#b3aa96'), { FW, FD } = K; K.box(2, 4, FW - 2, FD - 6, 28, (x, y) => S[2], (x, y) => wallTone('stone', S, x, y)); K.rect(FW / 2 - 8, FD - 20, FW / 2 + 8, FD - 6, R('#2a2018')[3]); K.poly([[FW / 2 - 6, FD - 6], [FW / 2 - 2, FD - 16], [FW / 2, FD - 11], [FW / 2 + 3, FD - 17], [FW / 2 + 6, FD - 6]], R('#f4a03a')[1]); K.rect(0, FD - 30, FW, FD - 27, R('#8e6a44')[1]); },
  stairs: (K, o) => {
    /* steps climb toward the back (face 0: north), drawn from the highest so each lower one stands in front */
    const P = R('#a07a4c'), f = facing(o), n = 6, { FW, FD } = K, rise = 30 / n;
    for (let i = n - 1; i >= 0; i--) {
      const h = Math.round((i + 1) * rise);
      if (f % 2 === 0) { const y0 = f === 0 ? FD - 2 - (i + 1) * (FD - 4) / n : 2 + i * (FD - 4) / n; K.box(2, y0, FW - 2, y0 + (FD - 4) / n, h, P[1], (x, y) => P[y % 3 === 0 ? 3 : 2]); }
      else { const x0 = f === 1 ? 2 + i * (FW - 4) / n : FW - 2 - (i + 1) * (FW - 4) / n; K.box(x0, 2, x0 + (FW - 4) / n, FD - 2, h, P[1], (x) => P[x === Math.ceil(x0) ? 2 : 3]); }
    }
  },
  bed: (K, o) => { const { FW, FD } = K, f = facing(o), F = furnBox(K, 3, 3, FW - 3, FD - 3, 7, '#8e6a44'), B = R('#c4503e'), W = R('#f4efe2'); const pil = f === 0 ? [3, 3, FW - 3, 13] : f === 2 ? [3, FD - 13, FW - 3, FD - 3] : f === 1 ? [3, 3, 13, FD - 3] : [FW - 13, 3, FW - 3, FD - 3]; K.rect(4, 4 - 7, FW - 4, FD - 4 - 7, (x, y) => B[(x + y) % 6 === 0 ? 2 : 1]); K.rect(pil[0] + 1, pil[1] - 7 + 1, pil[2] - 1, pil[3] - 7 - 1, W[1]); void F; },
  cot: (K) => { const P = R('#d8b968'); K.box(4, 4, K.FW - 4, K.FD - 4, 3, (x, y) => P[h2(x, y) < 0.3 ? 1 : 0], P[3]); },
  table: (K) => { const P = R('#9a7650'); K.rect(6, K.FD - 14, 9, K.FD - 5, P[3]); K.rect(K.FW - 9, K.FD - 14, K.FW - 6, K.FD - 5, P[3]); K.box(3, 6, K.FW - 3, K.FD - 12, 10, (x, y) => P[((y % 5) + 5) % 5 === 0 ? 2 : 1], P[3]); },
  longtable: (K) => { const P = R('#8e6a44'); for (const x of [6, K.FW / 2, K.FW - 9]) K.rect(x, K.FD - 14, x + 3, K.FD - 5, P[3]); K.box(3, 6, K.FW - 3, K.FD - 12, 10, (x, y) => P[((y % 5) + 5) % 5 === 0 ? 2 : 1], P[3]); for (const x of [K.FW * 0.25, K.FW * 0.75]) K.oval(x, 0, 3, 2, R('#eeeae0')[1]); },
  chair: (K, o) => { const P = R('#8e6a44'), f = facing(o), cx = K.FW / 2, cy = K.FD / 2 + 4; K.box(cx - 6, cy - 6, cx + 6, cy + 6, 8, P[1], P[3]); const back = f === 0 ? [cx - 6, cy - 7, cx + 6, cy - 5] : f === 2 ? [cx - 6, cy + 4, cx + 6, cy + 6] : f === 1 ? [cx - 7, cy - 6, cx - 5, cy + 6] : [cx + 5, cy - 6, cx + 7, cy + 6]; K.rect(back[0], back[1] - 22, back[2], back[3] - 8, (x, y) => P[y % 4 === 0 ? 3 : 2]); },
  stool: (K) => { const P = R('#9a7650'), cx = K.FW / 2, cy = K.FD - 10; K.rect(cx - 4, cy - 4, cx - 2, cy + 3, P[3]); K.rect(cx + 2, cy - 4, cx + 4, cy + 3, P[3]); K.oval(cx, cy - 6, 6, 3, P[1]); },
  bench: (K) => { const P = R('#9a7650'); K.box(3, K.FD - 14, K.FW - 3, K.FD - 6, 7, P[1], P[3]); },
  chest: (K) => { const P = furnBox(K, 5, 8, K.FW - 5, K.FD - 6, 12, '#8e6a44'), I = R('#c9a24f'); K.rect(5, K.FD - 14, K.FW - 5, K.FD - 13, I[2]); K.rect(K.FW / 2 - 1, K.FD - 13, K.FW / 2 + 2, K.FD - 10, I[1]); void P; },
  wardrobe: (K, o) => { const P = furnBox(K, 3, 6, K.FW - 3, K.FD - 6, 40, '#7a5a3a'); if (facing(o) !== 2) { K.rect(K.FW / 2, K.FD - 44, K.FW / 2 + 1, K.FD - 8, P[4]); K.set(K.FW / 2 - 2, K.FD - 26, R('#c9a24f')[1]); K.set(K.FW / 2 + 2, K.FD - 26, R('#c9a24f')[1]); } },
  bookshelf: (K, o) => { const P = furnBox(K, 3, 6, K.FW - 3, K.FD - 6, 38, '#7a5a3a'); if (facing(o) !== 2) for (let s = 0; s < 4; s++) { const y = K.FD - 42 + s * 9; K.rect(5, y, K.FW - 5, y + 7, (x) => R(['#b8483a', '#4f6a9a', '#7f9a5a', '#d9b44a', '#8e6a8f'][Math.floor(h2(x, s) * 5)])[h2(x, s, 2) < 0.3 ? 1 : 2]); K.rect(4, y + 7, K.FW - 4, y + 9, P[3]); } },
  dresser: (K, o) => { const P = furnBox(K, 3, 6, K.FW - 3, K.FD - 6, 26, '#8e6a44'); if (facing(o) !== 2) for (let s = 0; s < 3; s++) { const y = K.FD - 28 + s * 8; K.rect(5, y, K.FW - 5, y + 1, P[4]); K.set(K.FW / 2, y + 4, R('#c9a24f')[1]); } K.oval(K.FW / 2 - 6, 6 - 26 + 3, 3, 2, R('#eeeae0')[1]); },
  desk: (K) => { const P = R('#7a5a3a'); K.box(3, 6, K.FW - 3, K.FD - 8, 16, P[1], (x, y) => P[x > K.FW / 2 - 4 && x < K.FW / 2 + 4 && y > K.FD - 20 ? 4 : 3]); K.rect(8, -6, 16, -2, R('#f4efe2')[0]); K.rect(20, -8, 22, -2, R('#2a2018')[1]); },
  counter: (K) => { furnBox(K, 2, 8, K.FW - 2, K.FD - 6, 16, '#8e6a44'); K.rect(2, 8 - 16, K.FW - 2, K.FD - 6 - 16, (x, y) => R('#b08a58')[((x % 8) + 8) % 8 === 0 ? 2 : 1]); },
  cauldron: (K) => { const cx = K.FW / 2, b = K.FD - 8, I = R('#3b3a38'); K.oval(cx, b - 8, 10, 8, (x, y, dx, dy) => (dy < -0.3 ? null : I[dx < -0.3 ? 1 : 2])); K.oval(cx, b - 13, 9, 3, R('#7f9a5a')[1]); K.rect(cx - 12, b - 15, cx - 10, b - 2, I[3]); K.rect(cx + 10, b - 15, cx + 12, b - 2, I[3]); },
  tub: (K) => { const P = R('#9a7650'), cx = K.FW / 2, b = K.FD - 7; K.rect(cx - 11, b - 8, cx + 11, b, (x, y) => (y % 4 === 0 ? R('#5a5048')[2] : P[x < cx - 6 ? 1 : 2])); K.oval(cx, b - 8, 11, 4, P[1]); K.oval(cx, b - 8, 9, 3, R('#9cc0d0')[1]); },
  candelabra: (K) => { const cx = K.FW / 2, b = K.FD - 8, G = R('#c9a24f'); K.rect(cx - 1, b - 28, cx + 1, b, G[2]); K.oval(cx, b, 5, 2, G[3]); K.rect(cx - 7, b - 28, cx + 7, b - 26, G[2]); for (const x of [cx - 7, cx - 1, cx + 5]) { K.rect(x, b - 33, x + 2, b - 28, R('#f4efe2')[1]); K.set(x, b - 35, R('#f6d36a')[0]); K.set(x + 1, b - 34, R('#f4a03a')[1]); } },
  plantpot: (K) => { const cx = K.FW / 2, b = K.FD - 8; K.rect(cx - 5, b - 8, cx + 5, b, (x) => R('#b8684a')[x < cx - 2 ? 1 : x > cx + 2 ? 3 : 2]); K.mass(cx, b - 14, 8, 7, R('#7f9a5a'), 2); },
  throne: (K, o) => { const G = R('#c9a24f'), Rd = R('#a83a2c'), cx = K.FW / 2, b = K.FD - 6; K.box(cx - 10, b - 14, cx + 10, b, 10, Rd[1], G[2]); if (facing(o) !== 2) { K.rect(cx - 10, b - 44, cx + 10, b - 22, (x, y) => (x < cx - 7 || x > cx + 6 || y < b - 41 ? G[x > cx ? 2 : 1] : Rd[2])); K.rect(cx - 2, b - 48, cx + 2, b - 44, G[0]); } else K.rect(cx - 10, b - 44, cx + 10, b - 22, G[2]); },
  altar: (K) => { const S = R('#d8cfb9'); K.box(3, 6, K.FW - 3, K.FD - 8, 16, S[1], (x, y) => wallTone('stone', S, x, y)); K.rect(K.FW / 2 - 8, -10, K.FW / 2 + 8, K.FD - 8 - 4, (x, y) => (y < K.FD - 24 ? R('#f4efe2')[1] : R('#a83a2c')[2])); for (const x of [8, K.FW - 10]) { K.rect(x, -16, x + 2, -10, R('#f4efe2')[0]); K.set(x, -17, R('#f6d36a')[0]); } },
  pew: (K, o) => { const P = R('#7a5a3a'); K.box(2, K.FD - 14, K.FW - 2, K.FD - 6, 8, P[1], P[3]); K.rect(2, K.FD - (facing(o) === 2 ? 8 : 16) - 18, K.FW - 2, K.FD - (facing(o) === 2 ? 8 : 16) - 6, (x, y) => P[y % 4 === 0 ? 3 : 2]); },
  weaponrack: (K) => { const W = R('#7a5a3a'), M = R('#c8ccd0'); K.rect(4, K.FD - 34, K.FW - 4, K.FD - 31, W[2]); K.rect(4, K.FD - 14, K.FW - 4, K.FD - 11, W[2]); for (const x of [5, K.FW - 7]) K.rect(x, K.FD - 36, x + 2, K.FD - 6, W[3]); for (let k = 0; k < 4; k++) { const x = 9 + k * 5; K.rect(x, K.FD - 42, x + 1, K.FD - 8, k % 2 ? W[1] : M[1]); K.rect(x - 1, K.FD - 44, x + 2, K.FD - 40, M[k % 2 ? 0 : 2]); } },
  spinwheel: (K) => { const W = R('#9a7650'), cx = K.FW / 2 + 3, cy = K.FD - 22; K.box(4, K.FD - 12, K.FW - 4, K.FD - 6, 6, W[1], W[3]); K.oval(cx, cy, 10, 10, (x, y, dx, dy) => (Math.hypot(dx, dy) > 0.82 || Math.abs(dx - dy) < 0.12 || Math.abs(dx + dy) < 0.12 ? W[2] : null)); K.oval(cx, cy, 2, 2, W[3]); K.rect(8, K.FD - 24, 10, K.FD - 12, W[3]); K.rect(8, K.FD - 26, 12, K.FD - 22, R('#f0e6cb')[1]); }
};

/* ---------- a piece ---------- */
const DRAW = { ...BUILD, ...NATURE, ...PROPS, ...INTERIOR };
/* how far a piece's shadow falls east of it, in art pixels */
const FLAT = new Set(['flowers', 'mushrooms', 'rocks', 'rowboat', 'reeds', 'fence']);
const TREES = new Set(['oak', 'beech', 'birch', 'poplar', 'pine', 'snowpine', 'palm', 'deadtree']);
/* how far a tree stands off its tile's middle: [east, north] in art pixels (collision follows it) */
const treeOffset = o => { const v = Math.floor((o.v ?? 0.5) * 1e4); return [Math.round((h2(v, 1) - 0.5) * 18), Math.round(h2(v, 2) * 8)]; };
const ROOM = new Set(['iwall', 'iwindow', 'idoor', 'post', 'stairs', 'hearth']);
const shadowOf = a => (a.group === 'Interior' ? 0 : Math.min(16, 4 + a.h * 0.3));
/* the sprite for placed piece o ({ id, face, v, links }), trimmed to what is drawn:
   { w, h, px, ox, oy } with (ox, oy) the footprint's north-west corner */
/* drawn at the tile set's 32 scale and stood in the middle of the south edge of their footprint */
const SMALL = new Set([...Object.keys(NATURE), ...Object.keys(PROPS).filter(id => id !== 'fence'), ...Object.keys(INTERIOR).filter(id => !ROOM.has(id))]), MID = new Set(['yurt', 'mine', 'watchtower', 'granary', 'dovecote', 'shrine']);
function pieceSprite(o) {
  const a = ASSET_BY_ID[o.id], [fw, fd] = footprint(o), U = SMALL.has(o.id) ? 32 : MID.has(o.id) ? 64 : T, small = U !== T, FW = fw * U, FD = fd * U, up = Math.round(Math.max(40, (a ? a.h : 16) * 4.4 + 60));
  const K = kit(FW, FD, up, small ? 50 : 16), draw = DRAW[o.id];
  const inst = { face: o.face || 0, v: o.v ?? 0.5, links: o.links || null };
  if (draw) draw(K, inst);
  else K.box(4, 4, FW - 4, FD - 4, Math.min(30, (a ? a.h : 8) * 1.4), R('#c4b99f')[1], R('#c4b99f')[3]);
  K.outline(a && a.group === 'Interior' ? 0.6 : TREES.has(o.id) || o.id === 'bush' ? 0.5 : 0.75);
  /* the shadow falls on the ground to the east, and under trees and props as a pool round their foot */
  const len = a ? shadowOf(a) : 6;
  if (a && (a.group === 'Nature' || a.group === 'Props')) { if (!FLAT.has(o.id)) K.ovalShadow(FW / 2 + 3, FD - 7, FW * 0.4, Math.min(8, FD * 0.18)); }
  else if (len) K.shadow(2, 4, FW - 2, FD - 2, len);
  const s = trim(K);
  if (small) { s.ox -= (fw * T - FW) / 2; s.oy -= fd * T - FD; }
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

export { DESIGNED, MID, ROOM, SMALL, TREES, pieceSprite, treeOffset };
