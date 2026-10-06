import { mulberry32 } from '../core/random.js';
import { INK, hexRgb, rgbStr } from '../render/palette.js';
import { ASSET_BY_ID, TERRAIN, decorateTerrain, drawAsset, footprint, turnAsset } from '../tiles/index.js';

/* ================= tile editor: rendering =================
   Same projection as the city districts (TWH x THH tiles, EL px per height level) so assets
   look identical in both places. `rot` turns the whole map in quarter steps. */
const TWH = 16, THH = 8, EL = 8, BASE = 24;
const hrand = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let k = p.length - 1; k >= 0; k--) { const q = p[k]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
const rotInst = turnAsset;
function layout(S) { const padX = 40, top = 90, bot = BASE + 30; return { W: S * TWH * 2 + padX * 2, H: S * THH * 2 + top + bot, OX: S * TWH + padX, OY: top }; }

function renderTiles(M, rot, SC, opts = {}) {
  const S = M.S, NN = S * S, { W, H, OX, OY } = layout(S);
  const P = (x, y, z) => [OX + (x - y) * TWH, OY + (x + y) * THH - z];
  const rti = t => { const x = t % S, y = (t / S) | 0; const X = rot === 0 ? x : rot === 1 ? S - 1 - y : rot === 2 ? S - 1 - x : y, Y = rot === 0 ? y : rot === 1 ? x : rot === 2 ? S - 1 - y : S - 1 - x; return Y * S + X; };
  const RT = new Uint8Array(NN), RE = new Uint8Array(NN), back = new Int32Array(NN);
  for (let t = 0; t < NN; t++) { const u = rti(t); RT[u] = M.terr[t]; RE[u] = M.elev[t]; back[u] = t; }
  const sink = u => TERRAIN[RT[u]].sink || 0;
  const zOf = u => RE[u] * EL - sink(u);
  const can = document.createElement('canvas'); can.width = Math.ceil(W * SC); can.height = Math.ceil(H * SC);
  const g = can.getContext('2d'); g.setTransform(SC, 0, 0, SC, 0, 0); g.lineJoin = 'round'; g.lineCap = 'round';
  const poly = (pts, fill, lw) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); } };

  /* diorama slab and ground tiles depend only on terrain and height, never on pieces, so edits that
     only move pieces hand the finished layer back in as opts.base and skip all of it */
  let base = opts.base;
  if (base) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(base, 0, 0); g.restore(); }
  else {
  const zb = -6 - BASE;
  poly([P(0, S, -6), P(S, S, -6), P(S, S, zb), P(0, S, zb)], '#8c6d4b', 1);
  poly([P(S, 0, -6), P(S, S, -6), P(S, S, zb), P(S, 0, zb)], '#6f553a', 1);
  g.strokeStyle = 'rgba(43,33,22,0.28)'; g.lineWidth = 0.8; g.beginPath();
  for (const k of [9, 17]) { const a = P(0, S, -6 - k), b = P(S, S, -6 - k), c = P(S, 0, -6 - k); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); }
  g.stroke();
  }

  /* asset instances in view space; tiles under a footprint are never repainted over it */
  const objs = M.objs.map((o, k) => Object.assign(rotInst(o, rot, S), { k }));
  const covered = new Uint8Array(NN);
  for (const o of objs) { const [w, d] = footprint(o); let z = 0; for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) { const u = y * S + x; covered[u] = 1; z = Math.max(z, zOf(u)); } o.z = ASSET_BY_ID[o.id].water ? Math.min(...Array.from({ length: w * d }, (_, j) => zOf((o.y + ((j / w) | 0)) * S + o.x + (j % w)))) : z; }

  function drawTile(u) {
    const X = u % S, Y = (u / S) | 0, T = TERRAIN[RT[u]], z = zOf(u);
    const a = P(X, Y, z), b = P(X + 1, Y, z), c = P(X + 1, Y + 1, z), d = P(X, Y + 1, z);
    const zr = X + 1 < S ? zOf(u + 1) : -6, zl = Y + 1 < S ? zOf(u + S) : -6;
    if (zr < z) { poly([b, c, [c[0], c[1] + z - zr], [b[0], b[1] + z - zr]], T.side[1], 0.7); if (z - zr > EL) strata(b, c, z - zr); }
    if (zl < z) { poly([d, c, [c[0], c[1] + z - zl], [d[0], d[1] + z - zl]], T.side[0], 0.7); if (z - zl > EL) strata(d, c, z - zl); }
    const fs = rgbStr(hexRgb(T.top), 1 + 0.05 * (hrand(back[u], 3) - 0.5) + 0.04 * RE[u]);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fillStyle = fs; g.fill(); g.strokeStyle = fs; g.lineWidth = 0.6; g.stroke();
    if (T.glow) { const m = P(X + 0.5, Y + 0.5, z), gl = g.createRadialGradient(m[0], m[1], 0, m[0], m[1], 18); gl.addColorStop(0, 'rgba(255,190,90,0.35)'); gl.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gl; g.fillRect(m[0] - 18, m[1] - 18, 36, 36); }
    const t0 = back[u], at = (fx, fy) => P(X + fx, Y + fy, z);
    if (opts.deco !== false) decorateTerrain(g, T.id, at, hrand(t0 % S, (t0 / S) | 0), t0 * 7919 + 13);
    /* ink shoreline where land meets water */
    if (!T.water) {
      const wet = v => v >= 0 && TERRAIN[RT[v]].water;
      g.strokeStyle = INK; g.lineWidth = 0.9; g.beginPath(); let any = false;
      if (Y > 0 && wet(u - S)) { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); any = true; }
      if (X + 1 < S && wet(u + 1)) { g.moveTo(b[0], b[1]); g.lineTo(c[0], c[1]); any = true; }
      if (Y + 1 < S && wet(u + S)) { g.moveTo(d[0], d[1]); g.lineTo(c[0], c[1]); any = true; }
      if (X > 0 && wet(u - 1)) { g.moveTo(a[0], a[1]); g.lineTo(d[0], d[1]); any = true; }
      if (any) g.stroke();
    }
    if (opts.grid) { g.strokeStyle = 'rgba(43,33,22,0.16)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke(); }
  }
  function strata(p, q, h) { g.strokeStyle = 'rgba(43,33,22,0.3)'; g.lineWidth = 0.5; g.beginPath(); for (let k = EL; k < h; k += EL) { g.moveTo(p[0], p[1] + k); g.lineTo(q[0], q[1] + k); } g.stroke(); }

  if (!base) {
    for (let s2 = 0; s2 <= 2 * S - 2; s2++) for (let X = Math.max(0, s2 - S + 1); X <= Math.min(S - 1, s2); X++) drawTile((s2 - X) * S + X);
    base = document.createElement('canvas'); base.width = can.width; base.height = can.height; base.getContext('2d').drawImage(can, 0, 0);
  }

  /* soft shadows composited once */
  if (objs.length) {
    const sh = document.createElement('canvas'); sh.width = can.width; sh.height = can.height;
    const sg = sh.getContext('2d'); sg.setTransform(SC, 0, 0, SC, 0, 0); sg.fillStyle = '#000';
    for (const o of objs) {
      const a = ASSET_BY_ID[o.id], [w, d] = footprint(o), k = a.group === 'Nature' ? 0.3 : a.group === 'Props' ? 0.12 : 0.06;
      const pts = [[o.x + k, o.y + k], [o.x + w - k, o.y + k], [o.x + w - k, o.y + d - k], [o.x + k, o.y + d - k]];
      const all = pts.concat(pts.map(([x, y]) => [x + a.h * 0.042, y - a.h * 0.024]));
      sg.beginPath(); hull(all).forEach((p, j) => { const q = P(p[0], p[1], o.z); j ? sg.lineTo(q[0], q[1]) : sg.moveTo(q[0], q[1]); }); sg.closePath(); sg.fill();
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.2; g.drawImage(sh, 0, 0); g.restore();
    sh.width = sh.height = 1;
  }

  /* assets interleaved with raised tiles, back to front */
  const list = [];
  for (const o of objs) { const [w, d] = footprint(o); list.push({ key: o.x + w / 2 + o.y + d / 2, pri: 1, o }); }
  for (let u = 0; u < NN; u++) if (RE[u] > 0 && !covered[u]) list.push({ key: (u % S) + ((u / S) | 0) + 1, pri: 0, u });
  list.sort((a, b) => a.key - b.key || a.pri - b.pri);
  for (const it of list) {
    if (it.u != null) { drawTile(it.u); continue; }
    if (opts.dim === it.o.k) { g.save(); g.globalAlpha = 0.35; }
    drawAsset(g, P, it.o, it.o.z, M.clim);
    if (opts.dim === it.o.k) g.restore();
  }
  /* faint paper grain */
  {
    const gr = document.createElement('canvas'); gr.width = gr.height = 128; const gx = gr.getContext('2d'), gi = gx.createImageData(128, 128), rr = mulberry32(11);
    for (let k = 0; k < gi.data.length; k += 4) { gi.data[k] = 70; gi.data[k + 1] = 52; gi.data[k + 2] = 30; gi.data[k + 3] = rr() * 26; }
    gx.putImageData(gi, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = g.createPattern(gr, 'repeat'); g.fillRect(0, 0, can.width, can.height); g.restore();
  }
  return { can, base, W, H, OX, OY, P, zOf, rti, back, S, rot, objs };
}

/* small square preview of one terrain or asset for the palette */
function thumb(kind, id, size = 64) {
  const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = size * dpr;
  const g = c.getContext('2d'), a = kind === 'asset' ? ASSET_BY_ID[id] : null, n = a ? Math.max(a.w, a.d) : 1, top = a ? a.h + 8 : 4;
  const k = Math.min(size / ((n + 0.3) * TWH * 2), size / (2 * n * THH + 6 + top)) * dpr;
  g.setTransform(k, 0, 0, k, size * dpr / 2, size * dpr - (2 * n * THH + 7) * k);
  const P = (x, y, z) => [(x - y) * TWH, (x + y) * THH - z];
  const T = kind === 'terrain' ? TERRAIN.find(t => t.id === id) : null;
  const col = T || TERRAIN[0], p = [P(0, 0, 0), P(n, 0, 0), P(n, n, 0), P(0, n, 0)], dz = 6;
  g.beginPath(); g.moveTo(p[1][0], p[1][1]); g.lineTo(p[2][0], p[2][1]); g.lineTo(p[2][0], p[2][1] + dz); g.lineTo(p[1][0], p[1][1] + dz); g.closePath(); g.fillStyle = col.side[1]; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
  g.beginPath(); g.moveTo(p[3][0], p[3][1]); g.lineTo(p[2][0], p[2][1]); g.lineTo(p[2][0], p[2][1] + dz); g.lineTo(p[3][0], p[3][1] + dz); g.closePath(); g.fillStyle = col.side[0]; g.fill(); g.stroke();
  g.beginPath(); p.forEach((q, j) => j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fillStyle = a ? (a.water ? '#8eb0ab' : '#c4c99a') : col.top; g.fill(); g.stroke();
  if (T) decorateTerrain(g, T.id, (fx, fy) => P(fx, fy, 0), 0.1, 5);
  if (a) drawAsset(g, P, { id, x: (n - a.w) / 2, y: (n - a.d) / 2, face: 0, v: 0.3 }, a.water ? -1 : 0);
  return c;
}

export { EL, THH, TWH, layout, renderTiles, rotInst, thumb };
