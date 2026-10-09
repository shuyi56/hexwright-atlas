import { TREE } from '../render/palette.js';
import { R, hash, lum, mix, tone, toneOf } from './forge.js';

/* ================= tactical view: trees and plants =================
   The tile set's nature redrawn for the tactical camera on the forge (tactical/forge.js). Broadleaf crowns are a
   few rounded masses, each lit from the upper left, scalloped round its rim and broken into leaf clumps that
   catch the light on one side and fall into shade on the other, with a dark contour wherever one mass hangs in
   front of another. Trunks are barked and flare into roots. Pines are tiers of drooping needles with a zigzag
   hem (and snow lying on each tier for the snowy fir). The rest (palm, dead tree, cactus, reeds, toadstools,
   wildflowers, rocks) are drawn pixel by pixel. Colours are the tile set's own tree colours (render/palette.js);
   an oak in an arid land turns to autumn, as on the editor's map. */
const SL = (() => { const v = [-0.5, -0.72, 0.5], n = Math.hypot(...v); return v.map(c => c / n); })();
const sl = n => n[0] * SL[0] + n[1] * SL[1] + n[2] * SL[2];
const BARK = '#6e5238';

/* a screen-space mass at world (x, y, z) offset by (dx, dy) screen pixels */
const shift = (x, y, dx) => [x + dx / 32, y - dx / 32];
/* a leafy mass: pal = [light, dark] */
function mass(F, x, y, z, dx, dy, rx, ry, pal, part, seed, opt = {}) {
  const [wx, wy] = shift(x, y, dx), L = R(pal[0]), D = R(pal[1]), cell = opt.cell || 5, crown = opt.crown || 1;
  F.blob(wx, wy, z - dy, rx, ry, (n, i, j, px, py) => {
    /* leaf clumps: a staggered grid of little rounded tufts, lit on their upper left, shaded under */
    const row = Math.floor((j + seed) / 4), off = (row % 2) * (cell / 2), ci = Math.floor((i + off + seed * 3) / cell), fx = ((i + off + seed * 3) % cell + cell) % cell / cell, fy = ((j + seed) % 4 + 4) % 4 / 4;
    if (opt.airy && hash(ci, row, seed) < opt.airy && n[2] < 0.75) return null;
    const l = sl(n); let k = 2.4 - l * 2.4;
    const c = fx * 0.9 + fy; if (c < 0.55) k -= 0.8; else if (c > 1.45) k += 1.5; else if (c > 1.15) k += 0.6;
    if (hash(ci, row, seed + 7) < 0.18) k += 0.5;
    /* the crown shades itself: lower and right of its centre is darker */
    k += Math.max(0, (dy + py) / (crown * 1.6)) * 1.2 + Math.max(0, (dx + px) / (crown * 2.2)) * 0.6;
    if (l > 0.55 && c < 0.4 && hash(i, j, seed) < 0.12) k = 0;
    if (opt.fruit && hash(ci, row, seed + 3) < opt.fruit && c < 0.5 && n[2] > 0.3) return R(opt.fruitCol || '#b8483a')[1];
    return k > 3.5 ? D[Math.min(4, Math.round(k - 0.8))] : tone(L, k, i, j);
  }, part, a => 1 + 0.09 * Math.sin(a * 9 + seed) + 0.06 * Math.sin(a * 17 + seed * 2), opt.bulge ?? 0.7);
}
/* a barked trunk from z0 to z1, flaring into roots */
function trunk(F, x, y, r, z0, z1, col = BARK, part = 1, mark = null) {
  const b = R(col);
  F.lathe(x, y, t => [r * (1 + 0.9 * (1 - t) ** 5), z0 + (z1 - z0) * t], (p, ang, t, i, j, n) => {
    let k = toneOf(lum(...n)) - 0.2; const s = hash(Math.floor(ang * 14), Math.floor(p[2] / 3), 4);
    if (mark) { if (s < 0.25 && Math.floor(p[2]) % 5 < 1) return R('#2b2116')[2]; return tone(R(mark), k - 0.6, i, j); }
    if (s < 0.3) k += 0.8; else if (s > 0.9) k -= 0.5;
    return tone(b, k, i, j);
  }, part, 14);
}
/* a broadleaf tree: crown of masses (in screen px about the crown's centre) on a trunk */
function broadleaf(F, o, pal, s) {
  const x = o.w / 2 + (o.v - 0.5) * 0.16, y = o.d / 2 + (hash(o.v * 999 | 0, 1) - 0.5) * 0.16, seed = Math.floor(o.v * 97);
  const zc = s.zc, Rr = s.r;
  if (s.trunk !== false) {
    trunk(F, x, y, s.tr || 0.06, 0, zc - Rr * 0.3, s.bark, 1, s.mark);
    /* boughs showing between the masses */
    const bk = R(s.mark ? '#d8d2c2' : s.bark || BARK);
    F.line([x, y, zc - Rr * 0.5], [...shift(x, y, -Rr * 0.6), zc - Rr * 0.05], bk[3], 2, 0.3);
    F.line([x, y, zc - Rr * 0.4], [...shift(x, y, Rr * 0.55), zc + Rr * 0.05], bk[3], 2, 0.3);
  }
  const lobes = s.lobes || [[-0.55, 0.15, 0.62], [0.55, 0.12, 0.62], [0, 0.4, 0.62], [-0.3, -0.4, 0.55], [0.32, -0.35, 0.55], [0, -0.05, 0.75]];
  lobes.forEach(([dx, dy, k], n) => mass(F, x, y, zc, dx * Rr, dy * Rr * (s.tall || 1), Rr * k, Rr * k * (s.tall || 1) * 0.92, pal, 10 + n, seed + n * 5, Object.assign({ crown: Rr }, s.opt || {})));
}
/* a pine: tiers of needles, widest at the bottom, each drooping over the one below */
function pine(F, o, pal, snow) {
  const x = o.w / 2 + (o.v - 0.5) * 0.14, y = o.d / 2, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), seed = Math.floor(o.v * 53);
  const H = 48 + o.v * 8, tiers = 5, L = R(pal[0]), D = R(pal[1]), snowR = R('#f2f4f2');
  trunk(F, x, y, 0.04, 0, 12, '#5a4030', 1);
  for (let k = 0; k < tiers; k++) {
    const f = k / (tiers - 1), base = 8 + f * (H - 22), h = 17 - f * 5, w = 12 - f * 7.5, top = sy - base - h;
    /* where this tier shows below the hem of the one above it: snow lies along there */
    const nextBase = k + 1 < tiers ? 8 + ((k + 1) / (tiers - 1)) * (H - 22) : Infinity, shows = base + h - nextBase;
    for (let j = Math.floor(top); j <= Math.ceil(sy - base + 3); j++) for (let i = Math.floor(sx - w - 2); i <= Math.ceil(sx + w + 2); i++) {
      const dx = i + 0.5 - sx, dy = j + 0.5 - top, hw = w * Math.pow(Math.max(0, dy) / h, 0.85) + 0.6;
      const hem = h - 2.6 * Math.abs(((dx + seed) / 3.2 % 1 + 1) % 1 - 0.5) * 2 + (Math.abs(dx) > w * 0.8 ? 1.5 : 0);
      if (dy < 0 || Math.abs(dx) > hw || dy > hem) continue;
      const side = dx / Math.max(1, hw), n = [side * 0.8, -0.3 + 0.6 * (dy / h), 0.6];
      let t = 2.4 - sl(n) * 2.4; if (((Math.floor(dy * 1.5 - Math.abs(dx)) % 3) + 3) % 3 === 0) t += 0.8; if (dy > hem - 2) t += 0.9;
      let c = t > 3.6 ? D[3] : tone(L, t, i, j);
      if (snow) {
        /* snow lies on what faces up: near the top of each tier and along the upper edge of its skirt */
        const band = k + 1 < tiers ? shows - 1 : 0, upper = (dy >= band - 1 && dy < band + 3.2 + 1.4 * Math.sin(dx * 0.8 + seed + k)) || (dy < hem - 3 && dx < 0 && Math.abs(dx) > hw - 1.8 && hash(i >> 1, j >> 1, k) < 0.7);
        if (upper) c = snowR[dx > 2 ? 2 : dx > -2 ? 1 : 0];
      }
      F.put(i, j, d0 + 4 + k * 2.2 + (1 - Math.abs(side)) * 3, c, 10 + k);
    }
  }
}

const DESIGNS = {
  oak: { top: 56, draw(F, o) { broadleaf(F, o, o.clim === 'arid' ? TREE.autumn1 : TREE.oak, { zc: 23 + o.v * 3, r: 12 + o.v * 2, opt: o.v > 0.75 ? { fruit: 0.06 } : {} }); } },
  beech: { top: 60, draw(F, o) { broadleaf(F, o, TREE.autumn2, { zc: 25 + o.v * 3, r: 12.5 + o.v * 2, tall: 1.1 }); } },
  birch: { top: 58, draw(F, o) {
    broadleaf(F, o, TREE.birch, { zc: 27 + o.v * 3, r: 9.5 + o.v * 1.5, tr: 0.04, mark: '#ece6d8', tall: 1.15, opt: { airy: 0.12, cell: 3 },
      lobes: [[-0.6, 0.3, 0.55], [0.6, 0.2, 0.55], [-0.2, -0.55, 0.5], [0.35, -0.45, 0.5], [0, 0.55, 0.5], [0, 0, 0.7]] });
  } },
  poplar: { top: 72, draw(F, o) {
    broadleaf(F, o, TREE.poplar, { zc: 29 + o.v * 3, r: 7.5 + o.v * 1.2, tr: 0.045, lobes: [[0, 1.1, 0.85], [-0.2, 0.2, 0.95], [0.2, -0.7, 0.9], [0, -1.6, 0.7], [0, -0.3, 1]], tall: 1.35 });
  } },
  pine: { top: 80, draw(F, o) { pine(F, o, o.clim === 'cold' ? ['#6b9c5c', '#3f6a40'] : ['#76a356', '#45703a'], o.clim === 'cold'); } },
  snowpine: { top: 80, draw(F, o) { pine(F, o, ['#5f8a5a', '#3a5f3d'], true); } },
  bush: { top: 22, draw(F, o) {
    broadleaf(F, o, TREE.bush, { trunk: false, zc: 8, r: 8 + o.v * 1.5, lobes: [[-0.6, 0.1, 0.62], [0.6, 0.1, 0.6], [0, -0.25, 0.75], [0, 0.3, 0.6]], opt: o.v > 0.5 ? { fruit: 0.12, fruitCol: '#9a3a5a' } : {} });
  } },
  palm: { top: 72, draw(F, o) {
    const x = o.w / 2, y = o.d / 2, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), lean = (o.v - 0.5) * 16, H = 40 + o.v * 6, bark = R('#9a7a52');
    let cx = sx, cy = sy - H;
    for (let k = 0; k <= H; k++) {
      const t = k / H, px = sx + lean * t * t, py = sy - k, w = 2.6 - t * 0.8;
      for (let i = Math.floor(px - w); i <= Math.ceil(px + w); i++) { const f = (i + 0.5 - px) / w; if (Math.abs(f) > 1) continue; F.put(i, Math.floor(py), d0 + 2 - Math.abs(f), tone(bark, 1.7 + f * 1.6 + (k % 4 === 0 ? 1 : 0), i, Math.floor(py)), 1); }
      if (k === H) { cx = px; cy = py; }
    }
    const G = R('#7fa04e'), Dk = R('#4f6f34');
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2 + o.v, ex = Math.cos(a), ey = Math.sin(a) * 0.45, L = 16 + (f % 2) * 3, back = ey < 0;
      for (let s = 0; s <= L; s++) {
        const t = s / L, px = cx + ex * s, py = cy + ey * s - 6 * Math.sin(t * Math.PI * 0.8) + t * t * 12, z = d0 + 6 + (back ? -3 : 3) + ey * 4;
        const w = Math.max(0, 2.2 * (1 - t));
        for (let m = -Math.ceil(w) - 1; m <= Math.ceil(w) + 1; m++) {
          const leaflet = Math.abs(m) > w && (s + (m > 0 ? 0 : 1)) % 2 === 0 && Math.abs(m) < w + 2.5 && t > 0.15;
          if (Math.abs(m) > w && !leaflet) continue;
          const c = leaflet ? (m < 0 ? G[2] : Dk[2]) : m < 0 ? G[back ? 2 : 1] : Dk[back ? 3 : 2];
          F.put(Math.floor(px), Math.floor(py + m), z, c, 20 + f);
        }
      }
    }
    for (const [dx, dy] of [[-2, 3], [1, 4], [3, 2]]) F.blob(...shift(x, y, cx - sx + dx), H - dy, 1.8, 1.8, n => R('#7a5530')[n[0] < 0 ? 1 : 3], 40, null, 2);
  } },
  deadtree: { top: 48, draw(F, o) {
    const x = o.w / 2, y = o.d / 2, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), b = R('#8a8072'), H = 34 + o.v * 6;
    const limb = (x0, y0, ang, len, w, depth, part) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 - Math.sin(ang) * len, n = Math.ceil(len);
      for (let k = 0; k <= n; k++) {
        const t = k / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t, ww = w * (1 - t * 0.55);
        for (let m = -Math.ceil(ww); m <= Math.ceil(ww); m++) { if (Math.abs(m) > ww) continue; F.put(Math.floor(px + m), Math.floor(py), d0 + 3 - depth, tone(b, 1.6 + (m / Math.max(1, ww)) * 1.4 + (hash(k, m, part) < 0.12 ? 0.8 : 0), Math.floor(px + m), Math.floor(py)), part); }
      }
      if (depth < 3) { limb(x1, y1, ang + 0.5 + hash(part, 1) * 0.3, len * 0.62, Math.max(0.6, w * 0.55), depth + 1, part * 2); limb(x1, y1, ang - 0.55 - hash(part, 2) * 0.3, len * 0.55, Math.max(0.6, w * 0.5), depth + 1, part * 2 + 1); }
    };
    limb(sx, sy, Math.PI / 2 + (o.v - 0.5) * 0.2, H * 0.55, 2.6, 0, 1);
  } },
  cactus: { top: 40, draw(F, o) {
    const x = o.w / 2, y = o.d / 2, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), G = R('#6f9a5a'), H = 28 + o.v * 6;
    const col = (cx, y0, y1, w, part) => {
      for (let j = Math.floor(y1 - w); j <= Math.ceil(y0); j++) for (let i = Math.floor(cx - w); i <= Math.ceil(cx + w); i++) {
        const dx = i + 0.5 - cx, cap = j + 0.5 < y1 ? Math.hypot(dx, j + 0.5 - y1) : Math.abs(dx); if (cap > w) continue;
        const f = dx / w; let k = 1.8 + f * 1.6; if ((i - Math.floor(cx) + 20) % 2 === 0 && Math.abs(f) < 0.8) k += 0.7;
        if (hash(i, j, 3) < 0.05) { F.put(i, j, d0 + 3 - Math.abs(f), R('#f0ead0')[1], part); continue; }
        F.put(i, j, d0 + 3 - Math.abs(f) * 2, tone(G, k, i, j), part);
      }
    };
    const arm = (side, at, up, part) => { const ax = sx + side * 6.5; col(ax, sy - at, sy - at - up, 2.4, part); for (let i = 0; i < 5; i++) for (let m = -2; m <= 2; m++) F.put(Math.floor(sx + side * (2 + i)), Math.floor(sy - at + m), d0 + 1.5, tone(G, 2 + m * 0.5, i, m), part); };
    arm(-1, 12 + o.v * 4, 9, 2); arm(1, 16, 7, 3); col(sx, sy, sy - H, 3.6, 1);
    if (o.v > 0.6) for (const [dx, dy, c] of [[-1, 0, 1], [1, 0, 2], [0, -1, 0]]) F.put(Math.floor(sx + dx), Math.floor(sy - H - 4 + dy), d0 + 5, R('#d77a9a')[c], 4);
  } },
  reeds: { top: 22, draw(F, o) {
    const G = R('#5c773f'), B = R('#6e4f2e');
    for (let k = 0; k < 9; k++) {
      const x = 0.2 + hash(k, 1, o.v * 9 | 0) * 0.6, y = 0.2 + hash(k, 2, o.v * 9 | 0) * 0.6, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), h = 10 + hash(k, 3) * 8, bend = (hash(k, 4) - 0.5) * 3;
      for (let z = 0; z < h; z++) F.put(Math.floor(sx + bend * (z / h) ** 2), Math.floor(sy - z), d0, G[z < 3 ? 3 : 2], 1 + k);
      if (k % 2 === 0) for (let z = 0; z < 4; z++) for (const m of [0, 1]) F.put(Math.floor(sx + bend - 0.5 + m), Math.floor(sy - h + z), d0 + 0.5, B[m ? 3 : 1 + (z === 0 ? -1 : 0)], 1 + k);
      F.put(Math.floor(sx + 1), Math.floor(sy - 2), d0, G[1], 1 + k); F.put(Math.floor(sx + 2), Math.floor(sy - 4), d0, G[1], 1 + k);
    }
  } },
  mushrooms: { top: 12, draw(F, o) {
    const cap = R('#b8483a'), stem = R('#efe6d2');
    for (let k = 0; k < 4; k++) {
      const x = 0.25 + hash(k, 1, o.v * 9 | 0) * 0.5, y = 0.25 + hash(k, 2, o.v * 9 | 0) * 0.5, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), s = k === 0 ? 1.4 : 1, h = Math.round(3 * s), r = 2.6 * s;
      for (let z = 0; z < h; z++) for (const m of [-1, 0]) F.put(Math.floor(sx + m), Math.floor(sy - z), d0, stem[m ? 1 : 2], 1 + k);
      for (let j = -Math.ceil(r); j <= 0; j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
        if ((i / r) ** 2 + (j / (r * 0.75)) ** 2 > 1) continue;
        const spot = hash(i + 9, j + 9, k) < 0.16 && j < 0;
        F.put(Math.floor(sx + i), Math.floor(sy - h + j), d0 + 1, spot ? stem[0] : cap[i < 0 && j < -1 ? 1 : i > 0 ? 3 : 2], 1 + k);
      }
    }
  } },
  flowers: { top: 10, draw(F, o) {
    const G = R('#5c773f'), cols = ['#f4ecd8', '#d9b44a', '#b8483a', '#9a7fc0'];
    for (let k = 0; k < 12; k++) {
      const x = 0.15 + hash(k, 1, o.v * 9 | 0) * 0.7, y = 0.15 + hash(k, 2, o.v * 9 | 0) * 0.7, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), h = 3 + (k % 3), c = R(cols[k % 4]);
      for (let z = 0; z < h; z++) F.put(Math.floor(sx), Math.floor(sy - z), d0, G[2], 1 + k);
      F.put(Math.floor(sx) - 1, Math.floor(sy - 1), d0, G[1], 1 + k);
      for (const [a, b, t] of [[0, -1, 0], [-1, 0, 1], [1, 0, 2], [0, 1, 2]]) F.put(Math.floor(sx) + a, Math.floor(sy - h) + b, d0 + 0.5, c[t], 1 + k);
      F.put(Math.floor(sx), Math.floor(sy - h), d0 + 0.6, R('#d9b44a')[k % 4 === 1 ? 3 : 1], 1 + k);
    }
  } },
  rocks: { top: 12, draw(F, o) {
    for (let k = 0; k < 3; k++) {
      const x = 0.25 + hash(k, 1, o.v * 9 | 0) * 0.5, y = 0.25 + hash(k, 2, o.v * 9 | 0) * 0.5, r = 3 + hash(k, 3) * 3, col = R(mix([189, 179, 157], [138, 128, 112], hash(k, 4) * 0.5).map(Math.round).reduce((s, v) => s + v.toString(16).padStart(2, '0'), '#'));
      F.blob(x, y, r * 0.6, r * 1.2, r, (n, i, j) => { const l = sl(n), facet = Math.floor(Math.atan2(n[1], n[0]) * 1.6 + 9) % 3; return tone(col, 2.3 - l * 2.2 + facet * 0.35 + (hash(i, j, k) < 0.06 ? 0.8 : 0), i, j); }, 1 + k, a => 1 + 0.1 * Math.sin(a * 5 + k), 1);
    }
  } }
};

export { DESIGNS, broadleaf, mass, pine };
