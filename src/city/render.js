import { R, TAU } from '../core/geometry.js';
import { mulberry32 } from '../core/random.js';
import { drawShip } from '../render/sea.js';
import { banner, drawSettlement } from '../render/settlements.js';
import { CT, EL, FH, SLATE, THH, TWH } from './generate.js';
import { GOLD, INK, ROOFS, TREE, WAX, hexRgb, lerp, rgbStr } from '../render/palette.js';
import { ASSET_BY_ID, TERRAIN_BY_ID, decorateTerrain, drawAsset, footprint, turnAsset } from '../tiles/index.js';
import { branchFork, drawPine, foliage, leafPal, makeBlob, mixHex, trunkStroke } from '../render/trees.js';

/* ================= city districts: 2.5D rendering ================= */
function rotObj(o, rot, S) {
  if (o.type === 'asset') return turnAsset(o, rot, S);
  const rp = (x, y) => rot === 0 ? [x, y] : rot === 1 ? [S - y, x] : rot === 2 ? [S - x, S - y] : [y, S - x];
  if (o.type === 'bldg' || o.type === 'bridge') { const [ax, ay] = rp(o.x, o.y), [bx, by] = rp(o.x + o.w, o.y + o.d); return Object.assign({}, o, { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), d: Math.abs(by - ay), axis: rot % 2 ? (o.axis === 'x' ? 'y' : 'x') : o.axis }); }
  if (o.type === 'wall' || o.type === 'flyer') { const [x1, y1] = rp(o.x1, o.y1), [x2, y2] = rp(o.x2, o.y2); return Object.assign({}, o, { x1, y1, x2, y2 }); }
  if (o.type === 'solid') { const [kx, ky] = rp(o.kx, o.ky); return Object.assign({}, o, { kx, ky, faces: o.faces.map(f => Object.assign({}, f, { p: f.p.map(([x, y, z]) => { const [a, b] = rp(x, y); return [a, b, z]; }) })) }); }
  const [x, y] = rp(o.x, o.y); return Object.assign({}, o, { x, y, flip: o.type === 'ship' ? (rot % 2 ? !o.flip : o.flip) : o.flip });
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let k = p.length - 1; k >= 0; k--) { const q = p[k]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function renderCity(C, rot, SC) {
  const S = C.S, NN = S * S, padX = 50, top = 150, bot = 74;
  const W = S * TWH * 2 + padX * 2, H = S * THH * 2 + top + bot, OX = W / 2, OY = top;
  const P = (x, y, z) => [OX + (x - y) * TWH, OY + (x + y) * THH - z];
  const rp = (x, y) => rot === 0 ? [x, y] : rot === 1 ? [S - y, x] : rot === 2 ? [S - x, S - y] : [y, S - x];
  const rti = t => { const x = t % S, y = (t / S) | 0; const X = rot === 0 ? x : rot === 1 ? S - 1 - y : rot === 2 ? S - 1 - x : y, Y = rot === 0 ? y : rot === 1 ? x : rot === 2 ? S - 1 - y : S - 1 - x; return Y * S + X; };
  const RT = new Uint8Array(NN), RE = new Uint8Array(NN), RD = new Int16Array(NN), RTi = new Float32Array(NN), RF = new Uint8Array(NN), RM = new Uint8Array(NN), RB = new Uint8Array(NN);
  for (let t = 0; t < NN; t++) { const u = rti(t); RT[u] = C.T[t]; RE[u] = C.elev[t]; RD[u] = C.dist[t]; RTi[u] = C.tint[t]; RF[u] = C.ftint[t] ^ ((rot & 1) << 2); RM[u] = C.rmat ? C.rmat[t] : 0; RB[u] = C.chan ? C.chan[t] : 0; }
  const isW = ty => ty === CT.SEA || ty === CT.RIVER;
  const wet = u => isW(RT[u]) && !RB[u];   // river channel tiles are banks; the current is drawn as one smooth body
  const zOf = u => { const ty = RT[u]; return wet(u) ? -5 : ty === CT.DOCK ? -1 : RE[u] * EL; };
  const can = document.createElement('canvas'); can.width = Math.ceil(W * SC); can.height = Math.ceil(H * SC);
  let g = can.getContext('2d'); g.setTransform(SC, 0, 0, SC, 0, 0); g.lineJoin = 'round'; g.lineCap = 'round';
  const poly4 = (pts, fill, sw) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (sw) { g.strokeStyle = INK; g.lineWidth = sw; g.stroke(); } };
  const line = (a, b) => { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); };
  const shd = (hex, k) => rgbStr(hexRgb(hex), k);
  const hrand = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

  /* diorama slab */
  const BASE = 30;
  poly4([P(0, S, -5), P(S, S, -5), P(S, S, -5 - BASE), P(0, S, -5 - BASE)], '#8c6d4b', 1);
  poly4([P(S, 0, -5), P(S, S, -5), P(S, S, -5 - BASE), P(S, 0, -5 - BASE)], '#6f553a', 1);
  g.strokeStyle = 'rgba(43,33,22,0.28)'; g.lineWidth = 0.8; g.beginPath();
  for (const k of [11, 20]) { line(P(0, S, -5 - k), P(S, S, -5 - k)); line(P(S, 0, -5 - k), P(S, S, -5 - k)); }
  g.stroke();

  /* ground */
  const GC = { temperate: '#b5be83', arid: '#d3c48e', cold: '#c6cab3' }[C.clim];
  const COL = {}; COL[CT.GRASS] = GC; COL[CT.SEA] = '#8eb0ab'; COL[CT.RIVER] = '#94b6af'; COL[CT.SAND] = '#e2d3a2'; COL[CT.FOREST] = '#97a86c'; COL[CT.STREET] = '#d6c9a9'; COL[CT.PLAZA] = '#e0d3b4'; COL[CT.DOCK] = '#a27a4c'; COL[CT.GARDEN] = '#a5ba76'; COL[CT.YARD] = '#d9c89d'; COL[CT.GRAVE] = '#a9b384'; COL[CT.BRIDGE] = '#cbbb97'; COL[CT.ROAD] = '#cfb98e';
  const WILD = {}; WILD[CT.MEADOW] = 'meadow'; WILD[CT.MARSH] = 'marsh'; WILD[CT.SCREE] = 'scree'; WILD[CT.SNOW] = 'snow'; WILD[CT.HEATH] = 'heath';
  for (const k in WILD) COL[k] = TERRAIN_BY_ID[WILD[k]].top;
  const RGB = {}; for (const k in COL) RGB[k] = hexRgb(COL[k]);
  const BANK = hexRgb(mixHex(GC, '#8a8456', 0.3));
  const FRGB = ['#d8c27a', '#b5bd76', '#cfb27b', '#c4ca8b'].map(hexRgb);
  const sideCol = (u, right) => { const ty = RT[u]; if (wet(u)) return right ? '#5f7d79' : '#6f8e89'; if (ty === CT.DOCK) return right ? '#6e4f2e' : '#86613a'; if (RE[u] > 0 && RD[u] === 1) return right ? '#a3977c' : '#c2b69a'; if (RE[u] > 0) return right ? '#7d8a56' : '#94a167'; return right ? '#7a5f41' : '#957452'; };
  const streety = ty => ty === CT.STREET || ty === CT.PLAZA || ty === CT.BRIDGE || ty === CT.ROAD;
  const MRGB = [null, '#d4cbb3', '#cdb284', '#ad8d60', '#e0cc99', '#c8c0aa', '#e2d9c1', '#a99270'].map(c => c ? hexRgb(c) : null);
  function roadTex(u, X, Y, at, h, ty) {
    const m = RM[u];
    const ax = (X > 0 && streety(RT[u - 1])) || (X + 1 < S && streety(RT[u + 1])), ay = (Y > 0 && streety(RT[u - S])) || (Y + 1 < S && streety(RT[u + S]));
    const along = ax && !ay ? 'x' : ay && !ax ? 'y' : null;
    if (m === 1 || m === 6) {
      const n = m === 1 ? 3 : 2;
      g.lineWidth = 0.45; g.strokeStyle = m === 1 ? 'rgba(85,70,50,0.34)' : 'rgba(85,70,50,0.26)';
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const off = j % 2 ? (m === 1 ? 0.17 : 0.25) : 0, x0 = Math.max(0, (i - (off ? 0.5 : 0)) / n + off * 0) + 0.04, y0 = j / n + 0.04, x1 = Math.min(1, (i + 1) / n + off) - 0.04, y1 = (j + 1) / n - 0.04;
        if (x1 - x0 < 0.08) continue;
        const pa = along === 'y' ? [at(y0, x0), at(y0, x1), at(y1, x1), at(y1, x0)] : [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
        g.beginPath(); pa.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
        const v = hrand(X * 3 + i, Y * 3 + j); if (v < 0.35 || v > 0.75) { g.fillStyle = v < 0.35 ? 'rgba(255,250,235,0.2)' : 'rgba(90,70,45,0.13)'; g.fill(); }
        g.stroke();
      }
    } else {
      const rut = m === 3 ? 'rgba(80,55,30,0.45)' : m === 7 ? 'rgba(70,50,30,0.5)' : m === 5 ? 'rgba(90,85,75,0.35)' : 'rgba(110,82,48,0.36)';
      if (along) { g.strokeStyle = rut; g.lineWidth = 0.85; g.beginPath(); for (const f of [0.33, 0.67]) { if (along === 'x') line(at(0, f), at(1, f)); else line(at(f, 0), at(f, 1)); } g.stroke(); }
      if ((m === 2 || m === 3) && along) { g.fillStyle = 'rgba(100,128,58,0.65)'; for (let k = 0; k < 2; k++) { const f = 0.2 + hrand(X + k, Y) * 0.6, p = along === 'x' ? at(f, 0.5) : at(0.5, f); g.fillRect(p[0] - 0.7, p[1] - 0.5, 1.4, 1); } }
      if (m === 3) { g.strokeStyle = 'rgba(60,40,22,0.55)'; g.lineWidth = 0.6; g.beginPath(); const p = at(0.15 + h * 0.2, 0.82), q = at(0.38 + h * 0.2, 0.72); g.moveTo(p[0], p[1]); g.quadraticCurveTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 1.4, q[0], q[1]); g.stroke(); g.fillStyle = hrand(Y, X) < 0.5 ? '#9a6a35' : '#6f8a40'; const l = at(0.62 + h * 0.3, 0.24); g.fillRect(l[0] - 0.6, l[1] - 0.4, 1.2, 0.8); }
      if ((m === 3 || m === 7) && h > (m === 7 ? 0.78 : 0.88)) { const p = at(0.5, 0.5); g.beginPath(); g.ellipse(p[0], p[1], 3.4, 1.4, 0, 0, TAU); g.fillStyle = '#8fa9a4'; g.fill(); g.strokeStyle = 'rgba(60,45,30,0.5)'; g.lineWidth = 0.5; g.stroke(); g.strokeStyle = 'rgba(240,245,240,0.8)'; g.beginPath(); g.moveTo(p[0] - 1.6, p[1] - 0.4); g.lineTo(p[0] + 0.4, p[1] - 0.4); g.stroke(); }
      if (m === 4 || m === 5) { g.fillStyle = m === 5 ? 'rgba(90,85,75,0.42)' : 'rgba(150,120,70,0.35)'; for (let k = 0; k < 6; k++) { const p = at(0.1 + hrand(X + k * 3, Y) * 0.8, 0.1 + hrand(Y + k * 5, X) * 0.8); g.fillRect(p[0] - 0.5, p[1] - 0.4, 1, 0.8); } }
    }
    if (ty !== CT.ROAD) return;
    const verge = v => v >= 0 && !streety(RT[v]) && !isW(RT[v]) && RT[v] !== CT.DOCK;
    const E = [[Y > 0 ? u - S : -1, [0, 0], [1, 0]], [X + 1 < S ? u + 1 : -1, [1, 0], [1, 1]], [Y + 1 < S ? u + S : -1, [0, 1], [1, 1]], [X > 0 ? u - 1 : -1, [0, 0], [0, 1]]];
    for (const [v, e0, e1] of E) {
      if (!verge(v)) continue;
      if (m === 1) { g.strokeStyle = 'rgba(248,242,226,0.9)'; g.lineWidth = 1; g.beginPath(); line(at(e0[0], e0[1]), at(e1[0], e1[1])); g.stroke(); g.strokeStyle = 'rgba(85,70,50,0.45)'; g.lineWidth = 0.4; g.stroke(); }
      else if (m !== 4) { g.strokeStyle = 'rgba(88,118,52,0.75)'; g.lineWidth = 0.6; g.beginPath(); for (const f of [0.3, 0.7]) { const p = at(lerp(e0[0], e1[0], f), lerp(e0[1], e1[1], f)); g.moveTo(p[0] - 0.8, p[1]); g.lineTo(p[0] - 0.3, p[1] - 1.8); g.moveTo(p[0] + 0.4, p[1]); g.lineTo(p[0] + 0.9, p[1] - 1.6); } g.stroke(); }
    }
  }
  function drawTile(u) {
    const X = u % S, Y = (u / S) | 0, ty = RT[u], z = zOf(u);
    const a = P(X, Y, z), b = P(X + 1, Y, z), c = P(X + 1, Y + 1, z), d = P(X, Y + 1, z);
    const zr = X + 1 < S ? zOf(u + 1) : -5, zl = Y + 1 < S ? zOf(u + S) : -5;
    if (zr < z) { poly4([b, c, [c[0], c[1] + z - zr], [b[0], b[1] + z - zr]], sideCol(u, true), 0.7); if (RE[u] > 0 && RD[u] === 1) { g.strokeStyle = 'rgba(43,33,22,0.3)'; g.lineWidth = 0.5; g.beginPath(); line([b[0], b[1] + (z - zr) / 2], [c[0], c[1] + (z - zr) / 2]); g.stroke(); } }
    if (zl < z) { poly4([d, c, [c[0], c[1] + z - zl], [d[0], d[1] + z - zl]], sideCol(u, false), 0.7); if (RE[u] > 0 && RD[u] === 1) { g.strokeStyle = 'rgba(43,33,22,0.3)'; g.lineWidth = 0.5; g.beginPath(); line([d[0], d[1] + (z - zl) / 2], [c[0], c[1] + (z - zl) / 2]); g.stroke(); } }
    const rgb = RB[u] ? BANK : ty === CT.FIELD ? FRGB[RF[u] & 3] : RM[u] ? MRGB[RM[u]] : (RGB[ty] || RGB[CT.GRASS]);
    const fs = rgbStr(rgb, 1 + 0.06 * RTi[u]);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fillStyle = fs; g.fill(); g.strokeStyle = fs; g.lineWidth = 0.6; g.stroke();
    const h = hrand(X + rot * 0.37, Y), at = (fx, fy) => P(X + fx, Y + fy, z);
    g.lineWidth = 0.6;
    if ((ty === CT.STREET || ty === CT.ROAD) && RM[u]) roadTex(u, X, Y, at, h, ty);
    else if (ty === CT.STREET || ty === CT.ROAD) { g.fillStyle = 'rgba(70,52,30,0.16)'; for (let k = 0; k < 3; k++) { const p = at(0.2 + hrand(X, Y + k) * 0.6, 0.2 + hrand(Y + k, X) * 0.6); g.fillRect(p[0] - 0.6, p[1] - 0.4, 1.3, 0.8); } }
    else if (ty === CT.PLAZA) { g.strokeStyle = 'rgba(70,52,30,0.14)'; g.beginPath(); line(at(0.5, 0), at(0.5, 1)); line(at(0, 0.5), at(1, 0.5)); g.stroke(); }
    else if (ty === CT.FIELD) { g.strokeStyle = 'rgba(110,85,40,0.28)'; g.beginPath(); for (const f of [0.25, 0.5, 0.75]) { if (RF[u] & 4) line(at(f, 0.06), at(f, 0.94)); else line(at(0.06, f), at(0.94, f)); } g.stroke(); }
    else if (ty === CT.DOCK) { g.strokeStyle = 'rgba(50,34,20,0.4)'; g.beginPath(); for (const f of [0.33, 0.66]) { line(at(f, 0), at(f, 1)); line(at(0, f), at(1, f)); } g.stroke(); }
    else if (RB[u]) { if (h < 0.3) { const p = at(0.2 + h * 2, 0.5 + h); g.strokeStyle = 'rgba(70,92,48,0.6)'; g.lineWidth = 0.55; g.beginPath(); line(p, [p[0] - 1, p[1] - 2.2]); line(p, [p[0] + 0.2, p[1] - 2.8]); line(p, [p[0] + 1.2, p[1] - 2]); g.stroke(); } }
    else if (ty === CT.BRIDGE) { const alongX = (X > 0 && streety(RT[u - 1])) || (X + 1 < S && streety(RT[u + 1])); g.strokeStyle = INK; g.lineWidth = 0.9; g.beginPath(); if (alongX) { line(at(0, 0.08), at(1, 0.08)); line(at(0, 0.92), at(1, 0.92)); } else { line(at(0.08, 0), at(0.08, 1)); line(at(0.92, 0), at(0.92, 1)); } g.stroke(); }
    else if (wet(u) && h < 0.08) { const p = at(0.5, 0.5); g.strokeStyle = 'rgba(245,245,232,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(p[0] - 4, p[1]); g.quadraticCurveTo(p[0] - 2, p[1] - 2, p[0], p[1]); g.quadraticCurveTo(p[0] + 2, p[1] - 2, p[0] + 4, p[1]); g.stroke(); }
    else if (ty === CT.GRAVE) { for (let k = 0; k < 3; k++) { const p = at(0.2 + k * 0.3, 0.3 + (k % 2) * 0.35); g.fillStyle = '#d7d1c2'; g.fillRect(p[0] - 1, p[1] - 3, 2, 3); g.strokeStyle = INK; g.lineWidth = 0.4; g.strokeRect(p[0] - 1, p[1] - 3, 2, 3); } }
    else if (ty === CT.GARDEN && h < 0.5) { const cols = ['#b8483a', '#f4ecd8', '#d9b44a']; for (let k = 0; k < 3; k++) { const p = at(0.2 + hrand(X + k, Y) * 0.6, 0.2 + hrand(Y, X + k) * 0.6); g.fillStyle = cols[k]; g.fillRect(p[0] - 0.6, p[1] - 0.6, 1.2, 1.2); } }
    else if (WILD[ty]) decorateTerrain(g, WILD[ty], at, h, X * 7919 + Y * 131 + rot);
    else if (ty === CT.GRASS && h < 0.07) { const p = at(0.5, 0.5); g.strokeStyle = 'rgba(43,33,22,0.35)'; g.beginPath(); line(p, [p[0] - 1.5, p[1] - 2.5]); line(p, [p[0], p[1] - 3.2]); line(p, [p[0] + 1.5, p[1] - 2.5]); g.stroke(); }
    if (!wet(u) && ty !== CT.DOCK) {
      g.strokeStyle = INK; g.lineWidth = 0.9; g.beginPath(); let any = false;
      if (Y > 0 && wet(u - S)) { line(a, b); any = true; }
      if (X + 1 < S && wet(u + 1)) { line(b, c); any = true; }
      if (Y + 1 < S && wet(u + S)) { line(d, c); any = true; }
      if (X > 0 && wet(u - 1)) { line(a, d); any = true; }
      if (any) g.stroke();
    }
    if (ty === CT.FIELD) {
      g.strokeStyle = 'rgba(78,98,48,0.5)'; g.lineWidth = 0.8; g.beginPath();
      const diff = v => v < 0 || RT[v] !== CT.FIELD || (RF[v] & 3) !== (RF[u] & 3);
      if (diff(Y > 0 ? u - S : -1)) line(a, b); if (diff(X + 1 < S ? u + 1 : -1)) line(b, c); if (diff(Y + 1 < S ? u + S : -1)) line(d, c); if (diff(X > 0 ? u - 1 : -1)) line(a, d);
      g.stroke();
    }
  }
  for (let s2 = 0; s2 <= 2 * S - 2; s2++) for (let X = Math.max(0, s2 - S + 1); X <= Math.min(S - 1, s2); X++) drawTile((s2 - X) * S + X);

  /* river channel: one smooth sunken current instead of a staircase of water tiles */
  const RC = C.riverCurve, WZ = -6;
  if (RC) {
    const bez = t => { const v = 1 - t; return [v * v * RC.p0[0] + 2 * v * t * RC.ctrl[0] + t * t * RC.p2[0], v * v * RC.p0[1] + 2 * v * t * RC.ctrl[1] + t * t * RC.p2[1]]; };
    const ph = hrand(RC.p0[0], RC.p2[1]) * TAU, pts = [];
    for (let k = 0; k <= 320; k++) {
      const t = k / 320, [x, y] = bez(t), a = bez(Math.max(0, t - 0.003)), b = bez(Math.min(1, t + 0.003)), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
      const m = Math.sin(t * 11 + ph) * 0.14, w = RC.w * (1 + 0.06 * Math.sin(t * 27 + ph * 2)), cx = x - ty * m, cy = y + tx * m;
      pts.push({ l: rp(cx - ty * w, cy + tx * w), r: rp(cx + ty * w, cy - tx * w), c: rp(cx, cy), w });
    }
    const band = (z, key) => { const p = new Path2D(); pts.forEach((q, i) => { const v = P(q[key][0], q[key][1], z); i ? p.lineTo(v[0], v[1]) : p.moveTo(v[0], v[1]); }); return p; };
    const ribbon = z => { const p = new Path2D(); pts.forEach((q, i) => { const v = P(q.l[0], q.l[1], z); i ? p.lineTo(v[0], v[1]) : p.moveTo(v[0], v[1]); }); for (let i = pts.length - 1; i >= 0; i--) { const v = P(pts[i].r[0], pts[i].r[1], z); p.lineTo(v[0], v[1]); } p.closePath(); return p; };
    const top = ribbon(0), wat = ribbon(WZ);
    // the channel may only cut through bank tiles; where it meets the sea the front faces open too
    const clipT = new Path2D(), mouth = new Path2D();
    for (let u = 0; u < NN; u++) {
      if (!RB[u]) continue; const X = u % S, Y = (u / S) | 0;
      const a = P(X, Y, 0), b = P(X + 1, Y, 0), c = P(X + 1, Y + 1, 0), d = P(X, Y + 1, 0);
      clipT.moveTo(a[0], a[1]); clipT.lineTo(b[0], b[1]); clipT.lineTo(c[0], c[1]); clipT.lineTo(d[0], d[1]); clipT.closePath();
      if (X + 1 < S && wet(u + 1)) { mouth.moveTo(b[0], b[1]); mouth.lineTo(c[0], c[1]); mouth.lineTo(c[0], c[1] + 5); mouth.lineTo(b[0], b[1] + 5); mouth.closePath(); }
      if (Y + 1 < S && wet(u + S)) { mouth.moveTo(d[0], d[1]); mouth.lineTo(c[0], c[1]); mouth.lineTo(c[0], c[1] + 5); mouth.lineTo(d[0], d[1] + 5); mouth.closePath(); }
    }
    const WATER = '#8db2ac';
    g.save(); g.clip(clipT);
    g.fillStyle = '#7d6848'; g.fill(top);                                      // far bank wall, earth
    g.save(); g.clip(top);
    g.strokeStyle = 'rgba(52,38,22,0.35)'; g.lineWidth = 0.5; for (const k of ['l', 'r']) g.stroke(band(-1.6, k));
    g.strokeStyle = 'rgba(205,180,130,0.45)'; g.lineWidth = 0.6; for (const k of ['l', 'r']) g.stroke(band(-0.5, k));
    g.fillStyle = WATER; g.fill(wat);
    g.save(); g.clip(wat);
    g.strokeStyle = 'rgba(40,72,74,0.4)'; g.lineWidth = 3.2; g.stroke(wat);             // depth where the water meets the far wall
    g.strokeStyle = 'rgba(40,72,74,0.18)'; g.lineWidth = 7; g.stroke(wat);
    // current lines and glints
    g.lineWidth = 0.7;
    for (let k = 6; k < pts.length - 8; k += 13) {
      const o = (hrand(k, 3) - 0.5) * 1.2, len = 4 + Math.floor(hrand(k, 7) * 5);
      g.strokeStyle = hrand(k, 5) < 0.5 ? 'rgba(244,248,236,0.75)' : 'rgba(58,94,96,0.4)'; g.beginPath();
      for (let j = 0; j <= len && k + j < pts.length; j++) { const q = pts[k + j], f = 0.5 + o * 0.5, x = lerp(q.l[0], q.r[0], f), y = lerp(q.l[1], q.r[1], f), v = P(x, y, WZ); j ? g.lineTo(v[0], v[1]) : g.moveTo(v[0], v[1]); }
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(43,33,22,0.5)'; g.lineWidth = 0.55; g.stroke(wat);           // waterline
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 0.9; for (const k of ['l', 'r']) g.stroke(band(0, k));   // bank lips
    g.restore();
    // the open mouth where the river spills into the sea
    g.save(); g.clip(mouth); g.fillStyle = WATER; g.fill(wat); g.restore();
    // reeds along the banks
    g.strokeStyle = 'rgba(66,88,44,0.8)'; g.lineWidth = 0.6; g.beginPath();
    for (let k = 4; k < pts.length - 4; k += 7) {
      if (hrand(k, 11) < 0.45) continue;
      const q = pts[k], side = hrand(k, 13) < 0.5 ? 'l' : 'r', o = side === 'l' ? q.l : q.r, f = 1.18, x = q.c[0] + (o[0] - q.c[0]) * f, y = q.c[1] + (o[1] - q.c[1]) * f;
      const tx = Math.floor(x), ty2 = Math.floor(y); if (tx < 0 || ty2 < 0 || tx >= S || ty2 >= S || !RB[ty2 * S + tx]) continue;
      const v = P(x, y, 0); for (const [dx, h2] of [[-1.2, 2.4], [0, 3.4], [1.1, 2.6]]) { g.moveTo(v[0] + dx * 0.4, v[1]); g.lineTo(v[0] + dx, v[1] - h2); }
    }
    g.stroke();
  }

  /* objects in rotated space */
  const objs = C.objs.map(o => rotObj(o, rot, S));

  /* shadows, composited once so they never stack */
  {
    const shC = document.createElement('canvas'); shC.width = can.width; shC.height = can.height;
    const sg = shC.getContext('2d'); sg.setTransform(SC, 0, 0, SC, 0, 0); sg.fillStyle = '#000';
    const SX = 0.042, SY = -0.024;
    const cast = (pts, z0, hp) => { const all = pts.concat(pts.map(([x, y]) => [x + hp * SX, y + hp * SY])); const hl = convexHull(all); sg.beginPath(); hl.forEach((p, k) => { const q = P(p[0], p[1], z0); k ? sg.lineTo(q[0], q[1]) : sg.moveTo(q[0], q[1]); }); sg.closePath(); sg.fill(); };
    const circ = (x, y, r) => Array.from({ length: 8 }, (_, k) => [x + Math.cos(k * TAU / 8) * r, y + Math.sin(k * TAU / 8) * r]);
    for (const o of objs) {
      if (o.type === 'bldg') cast([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.d], [o.x, o.y + o.d]], o.z0, o.h + (o.roof === 'spire' ? (o.rh || 30) * 0.7 : (o.rh || 8) * 0.5));
      else if (o.type === 'round') cast(circ(o.x, o.y, o.r), o.z0, o.h + 10);
      else if (o.type === 'wall') { const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 0.31, ny = dx / L * 0.31; cast([[o.x1 + nx, o.y1 + ny], [o.x2 + nx, o.y2 + ny], [o.x2 - nx, o.y2 - ny], [o.x1 - nx, o.y1 - ny]], o.z0, o.h); }
      else if (o.type === 'tree') cast(circ(o.x, o.y, 0.28), o.z0, o.s * 1.6);
      else if (o.type === 'mill') cast(circ(o.x, o.y, 0.3), o.z0, 22);
      else if (o.type === 'asset') { const a = ASSET_BY_ID[o.id], [w, d] = footprint(o), k = a.group === 'Nature' ? 0.3 : a.group === 'Props' ? 0.12 : 0.06; cast([[o.x + k, o.y + k], [o.x + w - k, o.y + k], [o.x + w - k, o.y + d - k], [o.x + k, o.y + d - k]], o.z0, a.h); }
      else if (o.type === 'bridge') cast([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.d], [o.x, o.y + o.d]], WZ, 8);
      else if (o.type === 'solid') { let zmin = 1e9, zmax = -1e9; const pts = []; for (const f of o.faces) for (const q of f.p) { pts.push([q[0], q[1]]); zmin = Math.min(zmin, q[2]); zmax = Math.max(zmax, q[2]); } cast(convexHull(pts), zmin, (zmax - zmin) * 0.85); }
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.2; g.drawImage(shC, 0, 0); g.restore();
    shC.width = shC.height = 1;
  }

  /* draw primitives */
  function quadWin(p1, p2, p3, p4, fill) { g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.lineTo(p4[0], p4[1]); g.closePath(); g.fillStyle = fill; g.fill(); }
  function merlonsAlong(x1, y1, x2, y2, zt, col) { const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L; for (let s2 = 0.06; s2 < L - 0.12; s2 += 0.4) { const bx = x1 + ux * s2, by = y1 + uy * s2, ex = bx + ux * 0.2, ey = by + uy * 0.2; poly4([P(bx, by, zt), P(ex, ey, zt), P(ex, ey, zt + 3), P(bx, by, zt + 3)], col, 0.45); } }
  function dome(cxw, cyw, zt, r, dh, col) {
    const [dx, dy] = P(cxw, cyw, zt), rx = r * TWH * 1.414, ry = r * THH * 1.414;
    const gr = g.createLinearGradient(dx - rx, 0, dx + rx, 0); gr.addColorStop(0, shd(col, 1.18)); gr.addColorStop(0.5, col); gr.addColorStop(1, shd(col, 0.68));
    g.beginPath(); g.ellipse(dx, dy, rx, ry, 0, 0, Math.PI); g.ellipse(dx, dy, rx, dh, 0, Math.PI, TAU); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.75; g.stroke();
    g.beginPath(); g.moveTo(dx, dy - dh); g.lineTo(dx, dy - dh - 5); g.stroke(); g.beginPath(); g.arc(dx, dy - dh - 5.5, 1.3, 0, TAU); g.fillStyle = GOLD; g.fill(); g.stroke();
  }
  /* ---- bridges: humpbacked stone arches or timber trestles over the channel ---- */
  function bridgeDraw(o) {
    const ax = o.axis === 'x', L = ax ? o.w : o.d, Wd = ax ? o.d : o.w, stone = o.stone;
    const Q = (s, c, z) => ax ? P(o.x + s, o.y + c, z) : P(o.x + c, o.y + s, z);
    const lit = ax ? 1 : 0.8, zE = 0.3, zM = stone ? 3.6 + L * 0.55 : 2 + L * 0.15, n = Math.max(8, Math.round(L * 6));
    const zd = s => zE + (zM - zE) * Math.pow(Math.max(0, 1 - Math.pow(2 * s / L - 1, 2)), 0.65);
    const SS = Array.from({ length: n + 1 }, (_, i) => i / n * L);
    const strip = (c, zf, zg) => { g.beginPath(); SS.forEach((s, i) => { const p = Q(s, c, zf(s)); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); for (let i = n; i >= 0; i--) { const p = Q(SS[i], c, zg(SS[i])); g.lineTo(p[0], p[1]); } g.closePath(); };
    const polyl = (c, zf, s0 = 0, s1 = L) => { g.beginPath(); for (let i = 0; i <= n; i++) { const s = s0 + (s1 - s0) * i / n, p = Q(s, c, zf(s)); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } };
    const piers = stone ? Math.max(1, Math.round((L - 1.4) / 1.7)) : Math.max(2, Math.round(L / 1.1));
    const s0 = 0.7, s1 = L - 0.7, span = (s1 - s0) / piers;
    // deck
    g.beginPath(); SS.forEach((s, i) => { const p = Q(s, 0, zd(s)); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); for (let i = n; i >= 0; i--) { const p = Q(SS[i], Wd, zd(SS[i])); g.lineTo(p[0], p[1]); } g.closePath();
    g.fillStyle = stone ? '#dccfae' : '#b08752'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
    g.strokeStyle = stone ? 'rgba(90,72,48,0.32)' : 'rgba(60,38,18,0.6)'; g.lineWidth = stone ? 0.45 : 0.5; g.beginPath();
    for (let s = stone ? 0.25 : 0.14; s < L - 0.05; s += stone ? 0.3 : 0.2) { const a = Q(s, 0.05, zd(s)), b = Q(s, Wd - 0.05, zd(s)); line(a, b); }
    g.stroke();
    if (stone) { g.strokeStyle = 'rgba(90,72,48,0.25)'; polyl(Wd / 2, zd); g.stroke(); }
    // far parapet or railing
    if (stone) { strip(0.06, s => zd(s) + 1.7, zd); g.fillStyle = shd('#cfc2a0', 0.92); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke(); }
    else { g.strokeStyle = '#4a3420'; g.lineWidth = 0.7; g.beginPath(); for (let s = 0.15; s <= L - 0.1; s += 0.55) { line(Q(s, 0.06, zd(s)), Q(s, 0.06, zd(s) + 2.4)); } g.stroke(); polyl(0.06, s => zd(s) + 2.4); g.lineWidth = 0.8; g.stroke(); }
    // the face we can see, down to the water
    if (stone) {
      strip(Wd, zd, () => WZ); g.fillStyle = shd('#c6b792', lit); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke();
      g.strokeStyle = 'rgba(70,55,35,0.22)'; g.lineWidth = 0.4; for (const dz of [-1.4, -2.8]) { polyl(Wd, s => Math.max(WZ + 0.2, zd(s) + dz)); g.stroke(); }
      for (let k = 0; k < piers; k++) {
        const a = s0 + span * k + 0.17, b = s0 + span * (k + 1) - 0.17, mid = (a + b) / 2, hw = (b - a) / 2, crown = Math.min(zd(mid) - 1.1, WZ + 1.2 + hw * 3.4), spring = WZ + 0.8;
        const arch = (grow) => { g.beginPath(); const p0 = Q(a - grow, Wd, WZ); g.moveTo(p0[0], p0[1]); for (let j = 0; j <= 14; j++) { const th = Math.PI * j / 14, s = mid - Math.cos(th) * (hw + grow), z = spring + Math.sin(th) * (crown - spring + grow * 2.2), p = Q(s, Wd, z); g.lineTo(p[0], p[1]); } const p1 = Q(b + grow, Wd, WZ); g.lineTo(p1[0], p1[1]); };
        arch(0.13); g.strokeStyle = 'rgba(70,55,35,0.45)'; g.lineWidth = 0.45; g.stroke();
        arch(0); g.closePath(); g.fillStyle = '#334441'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
        // daylight on the water beyond the arch
        g.save(); g.clip(); const lo = Q(mid, Wd, WZ); g.fillStyle = 'rgba(141,178,172,0.55)'; g.beginPath(); g.ellipse(lo[0], lo[1] - 0.6, hw * 12, 1.3, 0, 0, TAU); g.fill(); g.restore();
      }
      // cutwaters breaking the current at each pier
      for (let k = 1; k < piers; k++) {
        const sp = s0 + span * k, h2 = 2.4;
        const A = Q(sp - 0.17, Wd, WZ), B = Q(sp, Wd + 0.32, WZ), Cc = Q(sp + 0.17, Wd, WZ), A2 = Q(sp - 0.17, Wd, WZ + h2), B2 = Q(sp, Wd + 0.32, WZ + h2 - 0.5), C2 = Q(sp + 0.17, Wd, WZ + h2);
        poly4([A, B, B2, A2], shd('#c6b792', lit * 1.06), 0.5); poly4([B, Cc, C2, B2], shd('#c6b792', lit * 0.8), 0.5);
        g.strokeStyle = 'rgba(244,248,236,0.8)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(B[0] - 2.2, B[1] + 0.6); g.quadraticCurveTo(B[0], B[1] + 1.4, B[0] + 2.2, B[1] + 0.6); g.stroke();
      }
      // near parapet with a pale coping
      strip(Wd, s => zd(s) + 1.7, zd); g.fillStyle = shd('#d4c7a5', lit * 1.04); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
      polyl(Wd, s => zd(s) + 1.7, 0.05, L - 0.05); g.strokeStyle = 'rgba(255,250,236,0.85)'; g.lineWidth = 0.6; g.stroke();
      for (const s of [0.12, L - 0.12]) for (const c of [0.06, Wd]) { const b0 = Q(s, c, zd(s)), t0 = Q(s, c, zd(s) + 2.6); g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); line(b0, t0); g.stroke(); g.strokeStyle = shd('#d4c7a5', 1.05); g.lineWidth = 1.4; g.stroke(); }
    } else {
      strip(Wd, zd, s => zd(s) - 0.9); g.fillStyle = shd('#7d5832', lit); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
      g.lineCap = 'butt';
      for (let k = 0; k <= piers; k++) {
        const sp = s0 + span * k, top = zd(sp) - 0.9;
        g.strokeStyle = INK; g.lineWidth = 1.7; g.beginPath(); line(Q(sp, Wd, top), Q(sp, Wd, WZ - 0.3)); g.stroke();
        g.strokeStyle = shd('#6e4c2a', lit); g.lineWidth = 0.9; g.stroke();
        if (k < piers) { const nx = s0 + span * (k + 1), t2 = zd(nx) - 0.9; g.strokeStyle = 'rgba(60,40,22,0.8)'; g.lineWidth = 0.5; g.beginPath(); line(Q(sp, Wd, top), Q(nx, Wd, WZ + 0.6)); line(Q(nx, Wd, t2), Q(sp, Wd, WZ + 0.6)); g.stroke(); }
        const w0 = Q(sp, Wd, WZ); g.strokeStyle = 'rgba(244,248,236,0.75)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(w0[0] - 1.8, w0[1] + 0.4); g.quadraticCurveTo(w0[0], w0[1] + 1.1, w0[0] + 1.8, w0[1] + 0.4); g.stroke();
      }
      g.lineCap = 'round';
      g.strokeStyle = '#4a3420'; g.lineWidth = 0.75; g.beginPath(); for (let s = 0.15; s <= L - 0.1; s += 0.55) line(Q(s, Wd, zd(s)), Q(s, Wd, zd(s) + 2.4)); g.stroke();
      polyl(Wd, s => zd(s) + 2.4); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke(); polyl(Wd, s => zd(s) + 1.3); g.lineWidth = 0.5; g.stroke();
    }
  }
  /* ---- houses ---- */
  const SHUT = ['#5f7b5a', '#4f6f8f', '#9a4a3a', '#6a5a8a', '#7a6a3a'];
  function smokeAt(sx, sy) { g.strokeStyle = 'rgba(150,145,140,0.55)'; g.lineWidth = 1.1; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(sx - 3, sy - 4, sx + 3, sy - 7, sx - 1, sy - 11); g.moveTo(sx + 1.5, sy - 3); g.bezierCurveTo(sx + 4, sy - 7, sx + 1, sy - 10, sx + 4, sy - 15); g.stroke(); }
  function bldgDraw(o) {
    const e = 0.06, x0 = o.x + e, y0 = o.y + e, x1 = o.x + o.w - e, y1 = o.y + o.d - e, z0 = o.z0, zt = z0 + o.h;
    const wl = o.wall, wr = shd(o.wall, 0.78), floors = Math.max(1, Math.round(o.h / FH));
    const jet = o.jetty && floors >= 2 ? 0.08 : 0;
    const LP = (u, z, yy = y1) => P(u, yy, z), RP = (v, z, xx = x1) => P(xx, v, z);
    const rh = o.rh || Math.max(6, Math.min(o.w, o.d) * 6.5), r0 = o.roofC[0], r1 = o.roofC[1];
    /* walls */
    if (jet) {
      poly4([LP(x0, z0, y1 - jet), LP(x1 - jet, z0, y1 - jet), LP(x1 - jet, z0 + FH, y1 - jet), LP(x0, z0 + FH, y1 - jet)], shd(wl, 0.93), 0.7);
      poly4([RP(y1 - jet, z0, x1 - jet), RP(y0, z0, x1 - jet), RP(y0, z0 + FH, x1 - jet), RP(y1 - jet, z0 + FH, x1 - jet)], shd(o.wall, 0.725), 0.7);
      poly4([LP(x0, z0 + FH), LP(x1, z0 + FH), LP(x1, zt), LP(x0, zt)], wl, 0.75);
      poly4([RP(y1, z0 + FH), RP(y0, z0 + FH), RP(y0, zt), RP(y1, zt)], wr, 0.75);
      g.strokeStyle = 'rgba(30,20,12,0.55)'; g.lineWidth = 1.3; g.beginPath(); line(LP(x0, z0 + FH - 0.7), LP(x1, z0 + FH - 0.7)); line(RP(y1, z0 + FH - 0.7), RP(y0, z0 + FH - 0.7)); g.stroke();
    } else {
      poly4([LP(x0, z0), LP(x1, z0), LP(x1, zt), LP(x0, zt)], wl, 0.75);
      poly4([RP(y1, z0), RP(y0, z0), RP(y0, zt), RP(y1, zt)], wr, 0.75);
    }
    /* lean-to gable pieces on the visible walls */
    let cz = null;
    if (o.roof === 'lean') {
      cz = (x, y) => ((o.high === 'x0' && x < (x0 + x1) / 2) || (o.high === 'x1' && x > (x0 + x1) / 2) || (o.high === 'y0' && y < (y0 + y1) / 2) || (o.high === 'y1' && y > (y0 + y1) / 2)) ? zt + rh : zt;
      if (cz(x0, y1) > zt || cz(x1, y1) > zt) poly4([LP(x0, zt), LP(x1, zt), LP(x1, cz(x1, y1)), LP(x0, cz(x0, y1))], wl, 0.7);
      if (cz(x1, y1) > zt || cz(x1, y0) > zt) poly4([RP(y1, zt), RP(y0, zt), RP(y0, cz(x1, y0)), RP(y1, cz(x1, y1))], wr, 0.7);
    }
    /* surface texture */
    const zw0 = z0 + (jet ? FH : 0);
    if (o.mat === 'stone') {
      g.strokeStyle = 'rgba(80,65,45,0.16)'; g.lineWidth = 0.5; g.beginPath();
      for (let z = zw0 + 3; z < zt - 1; z += 3) { line(LP(x0, z), LP(x1, z)); line(RP(y1, z), RP(y0, z)); }
      g.stroke();
      for (let z = zw0, k = 0; z < zt - 2; z += 3, k++) { const d = k % 2 ? 0.1 : 0.18; quadWin(LP(x1 - d, z), LP(x1, z), LP(x1, z + 2.6), LP(x1 - d, z + 2.6), shd(wl, 1.06)); }
    } else if (o.mat === 'brick') {
      g.strokeStyle = 'rgba(90,40,25,0.16)'; g.lineWidth = 0.45; g.beginPath();
      for (let z = zw0 + 2; z < zt - 0.5; z += 2) { line(LP(x0, z), LP(x1, z)); line(RP(y1, z), RP(y0, z)); }
      g.stroke();
    }
    if (o.timber) {
      g.strokeStyle = 'rgba(88,62,42,0.7)'; g.lineWidth = 0.75; g.beginPath();
      for (let f = 1; f <= floors; f++) { const zz = z0 + f * FH - (f === floors ? 0.5 : 0); line(LP(x0, zz), LP(x1, zz)); line(RP(y1, zz), RP(y0, zz)); }
      for (let u = x0 + 0.25, k = 0; u < x1 - 0.1; u += 0.5, k++) { line(LP(u, z0 + FH), LP(u, zt)); if (k % 2 === 0 && floors > 1) line(LP(u, z0 + FH), LP(Math.min(u + 0.25, x1), z0 + 2 * FH)); }
      for (let v = y0 + 0.25, k = 0; v < y1 - 0.1; v += 0.5, k++) { line(RP(v, z0 + FH), RP(v, zt)); if (k % 2 === 1 && floors > 1) line(RP(v, z0 + FH), RP(Math.min(v + 0.25, y1), z0 + 2 * FH)); }
      g.stroke();
    }
    /* windows, shutters and flower boxes */
    if (o.windows !== false) {
      const nL = Math.max(1, Math.round((x1 - x0) * 1.6)), nR = Math.max(1, Math.round((y1 - y0) * 1.6));
      const tall = o.mat === 'stone' ? 4.4 : 3.6;
      for (let f = 0; f < floors; f++) {
        const za = z0 + f * FH + 2.6, zb = za + tall;
        for (let k = 0; k < nL; k++) {
          const u = x0 + (x1 - x0) * (k + 0.5) / nL;
          if (f === 0 && o.shop && k !== Math.floor(nL / 2)) { quadWin(LP(u - 0.17, z0 + 1.5), LP(u + 0.17, z0 + 1.5), LP(u + 0.17, z0 + FH * 0.72), LP(u - 0.17, z0 + FH * 0.72), 'rgba(48,38,28,0.85)'); continue; }
          if (f === 0 && (o.arcade || k === Math.floor(nL / 2))) { const zz = o.arcade ? z0 + FH * 0.8 : z0 + 5.6; quadWin(LP(u - 0.12, z0), LP(u + 0.12, z0), LP(u + 0.12, zz), LP(u - 0.12, zz), o.arcade ? '#3d3328' : (o.door || '#4a3524')); continue; }
          if (f === 0 && o.ware) continue;
          const lit = hrand(u * 7 + f, o.x + o.y) < 0.04;
          if (o.shut) { quadWin(LP(u - 0.15, za), LP(u - 0.09, za), LP(u - 0.09, zb), LP(u - 0.15, zb), o.shut); quadWin(LP(u + 0.09, za), LP(u + 0.15, za), LP(u + 0.15, zb), LP(u + 0.09, zb), o.shut); }
          quadWin(LP(u - 0.08, za), LP(u + 0.08, za), LP(u + 0.08, zb), LP(u - 0.08, zb), lit ? '#f0c060' : 'rgba(55,45,35,0.82)');
          if (o.flowers && f > 0) { quadWin(LP(u - 0.1, za - 1.2), LP(u + 0.1, za - 1.2), LP(u + 0.1, za), LP(u - 0.1, za), '#7a5a3a'); const p = LP(u, za + 0.3); g.fillStyle = hrand(u, f) < 0.5 ? '#c8452f' : '#e07aa0'; g.fillRect(p[0] - 1.8, p[1] - 1.2, 1.2, 1.2); g.fillRect(p[0] + 0.4, p[1] - 1.4, 1.2, 1.2); }
        }
        for (let k = 0; k < nR; k++) {
          const v = y0 + (y1 - y0) * (k + 0.5) / nR;
          if (f === 0 && o.arcade) { quadWin(RP(v + 0.12, z0), RP(v - 0.12, z0), RP(v - 0.12, z0 + FH * 0.8), RP(v + 0.12, z0 + FH * 0.8), '#2f271f'); continue; }
          if (f === 0 && o.ware) continue;
          const lit = hrand(v * 7 + f, o.x - o.y) < 0.04;
          if (o.shut) { quadWin(RP(v + 0.15, za), RP(v + 0.09, za), RP(v + 0.09, zb), RP(v + 0.15, zb), shd(o.shut, 0.8)); quadWin(RP(v - 0.09, za), RP(v - 0.15, za), RP(v - 0.15, zb), RP(v - 0.09, zb), shd(o.shut, 0.8)); }
          quadWin(RP(v + 0.08, za), RP(v - 0.08, za), RP(v - 0.08, zb), RP(v + 0.08, zb), lit ? '#f0c060' : 'rgba(40,32,25,0.82)');
        }
      }
    }
    if (o.ware) {
      const um = (x0 + x1) / 2;
      quadWin(LP(um - 0.22, z0), LP(um + 0.22, z0), LP(um + 0.22, z0 + FH * 0.85), LP(um - 0.22, z0 + FH * 0.85), '#3a2c1f');
      g.strokeStyle = 'rgba(120,90,60,0.8)'; g.lineWidth = 0.6; g.beginPath(); line(LP(um, z0), LP(um, z0 + FH * 0.85)); g.stroke();
      const vm = (y0 + y1) / 2; quadWin(RP(vm + 0.25, z0), RP(vm - 0.25, z0), RP(vm - 0.25, z0 + FH * 0.85), RP(vm + 0.25, z0 + FH * 0.85), '#2f241a');
      if (floors > 1) { quadWin(LP(um - 0.1, zt - FH + 1), LP(um + 0.1, zt - FH + 1), LP(um + 0.1, zt - 1.5), LP(um - 0.1, zt - 1.5), '#3a2c1f'); const a = LP(um, zt + 1.5), b = P(um, y1 + 0.3, zt + 1.5); g.strokeStyle = INK; g.lineWidth = 1.4; g.beginPath(); line(a, b); g.stroke(); g.lineWidth = 0.5; g.beginPath(); line(b, [b[0], b[1] + 8]); g.stroke(); g.fillStyle = '#c9b48a'; g.fillRect(b[0] - 1.5, b[1] + 8, 3, 2.6); }
    }
    if (o.shop) {
      const xa2 = x0 + 0.05, xb2 = x1 - 0.05, za = z0 + FH * 0.95, zb2 = z0 + FH * 0.6, pts = [LP(xa2, za), LP(xb2, za), P(xb2, y1 + 0.22, zb2), P(xa2, y1 + 0.22, zb2)];
      poly4(pts, o.shop[0], 0.55);
      g.save(); poly4(pts); g.clip(); g.strokeStyle = o.shop[1]; g.lineWidth = 1.8; g.beginPath(); for (let u = xa2 + 0.08; u < xb2; u += 0.16) line(LP(u, za), P(u, y1 + 0.22, zb2)); g.stroke(); g.restore();
      poly4(pts, null, 0.55);
    }
    if (o.sign) { const p = P(x0 + 0.15, y1, z0 + FH * 1.2); g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] - 4, p[1] + 2); g.stroke(); g.fillStyle = GOLD; g.fillRect(p[0] - 6, p[1] + 2, 4, 3.5); g.strokeRect(p[0] - 6, p[1] + 2, 4, 3.5); }
    if (o.clock) { for (const c of [P(x1, (y0 + y1) / 2, zt - FH * 0.9), P((x0 + x1) / 2, y1, zt - FH * 0.9)]) { g.beginPath(); g.arc(c[0], c[1], 2.2, 0, TAU); g.fillStyle = '#f4ecd8'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke(); g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(c[0], c[1] - 1.6); g.moveTo(c[0], c[1]); g.lineTo(c[0] + 1.1, c[1]); g.stroke(); } }
    if (o.rose) { const c = o.axis === 'x' ? P(x1, (y0 + y1) / 2, zt - 7) : P((x0 + x1) / 2, y1, zt - 7); g.beginPath(); g.arc(c[0], c[1], 3, 0, TAU); g.fillStyle = '#6f5f9a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke(); }
    /* roofs */
    const xa = x0 - 0.07, xb = x1 + 0.07, ya = y0 - 0.07, yb = y1 + 0.07, zr = zt + rh;
    const moss = (pts4) => { if (!o.moss) return; g.save(); poly4(pts4); g.clip(); g.fillStyle = 'rgba(70,85,40,0.22)'; for (let k = 0; k < 3; k++) { const a = pts4[0], c = pts4[2], f1 = hrand(o.x + k, o.y), f2 = hrand(o.y, o.x + k); g.beginPath(); g.ellipse(lerp(a[0], c[0], f1), lerp(a[1], c[1], f2), 3, 1.6, 0, 0, TAU); g.fill(); } g.restore(); };
    const chimney = (cxw, cyw, zc) => { const sw = 0.1; poly4([P(cxw - sw, cyw + sw, zc), P(cxw + sw, cyw + sw, zc), P(cxw + sw, cyw + sw, zc + 7), P(cxw - sw, cyw + sw, zc + 7)], shd(o.chimC || '#b8a283', 1), 0.55); poly4([P(cxw + sw, cyw + sw, zc), P(cxw + sw, cyw - sw, zc), P(cxw + sw, cyw - sw, zc + 7), P(cxw + sw, cyw + sw, zc + 7)], shd(o.chimC || '#b8a283', 0.8), 0.55); poly4([P(cxw - sw, cyw - sw, zc + 7), P(cxw + sw, cyw - sw, zc + 7), P(cxw + sw, cyw + sw, zc + 7), P(cxw - sw, cyw + sw, zc + 7)], '#5a4a3a', 0.5); if (o.smoke) { const p = P(cxw, cyw, zc + 8); smokeAt(p[0], p[1]); } };
    const dormer = (fx, fy, zd, alongX) => {
      const w2 = 0.12, h2 = 5.5;
      const pa = alongX ? P(fx - w2, fy, zd) : P(fx, fy + w2, zd), pb = alongX ? P(fx + w2, fy, zd) : P(fx, fy - w2, zd);
      const pc = [pb[0], pb[1] - h2], pd = [pa[0], pa[1] - h2], apex = alongX ? P(fx, fy, zd + h2 + 4.5) : P(fx, fy, zd + h2 + 4.5);
      poly4([pa, pb, pc, pd], alongX ? wl : wr, 0.55);
      const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 - h2 * 0.25]; g.fillStyle = 'rgba(45,36,28,0.85)'; g.fillRect(m[0] - 1, m[1] - 2.2, 2, 2.6);
      poly4([[pd[0] - 1, pd[1] + 0.5], [pc[0] + 1, pc[1] + 0.5], apex], r0, 0.55);
    };
    if (o.roof === 'flat' || o.roof === 'dome') {
      poly4([P(x0, y0, zt), P(x1, y0, zt), P(x1, y1, zt), P(x0, y1, zt)], r0, 0.75);
      if (o.crenel) { merlonsAlong(x0, y0, x1, y0, zt, wr); merlonsAlong(x0, y0, x0, y1, zt, wl); merlonsAlong(x0, y1, x1, y1, zt, wl); merlonsAlong(x1, y0, x1, y1, zt, wr); }
      if (o.roof === 'dome') dome((x0 + x1) / 2, (y0 + y1) / 2, zt, Math.min(x1 - x0, y1 - y0) / 2 * 0.82, rh, o.domeC || GOLD);
      if (o.flag) { const p = P((x0 + x1) / 2, (y0 + y1) / 2, zt); banner(g, p[0], p[1], 16, o.flag); }
    } else if (o.roof === 'lean') {
      const pts = [P(xa, ya, cz(x0, y0)), P(xb, ya, cz(x1, y0)), P(xb, yb, cz(x1, y1)), P(xa, yb, cz(x0, y1))];
      poly4(pts, r0, 0.75); moss(pts);
    } else if (o.roof === 'gable') {
      if (o.axis === 'x') {
        const ym = (y0 + y1) / 2;
        if (o.chimney && !o.chimFront) chimney(lerp(x0, x1, 0.72), lerp(ym, y0, 0.45), lerp(zr, zt, 0.45));
        poly4([P(xa, ya, zt), P(xb, ya, zt), P(xb, ym, zr), P(xa, ym, zr)], r1, 0.75);
        if (!o.stepped) poly4([P(x1, y0, zt), P(x1, y1, zt), P(x1, ym, zr)], wr, 0.75);
        const fr = [P(xa, ym, zr), P(xb, ym, zr), P(xb, yb, zt), P(xa, yb, zt)];
        poly4(fr, r0, 0.75); moss(fr);
        g.strokeStyle = 'rgba(43,33,22,0.22)'; g.lineWidth = 0.55; g.beginPath(); for (const f of [0.3, 0.55, 0.8]) line(P(xa, lerp(ym, yb, f), lerp(zr, zt, f)), P(xb, lerp(ym, yb, f), lerp(zr, zt, f))); g.stroke();
        if (o.dormers) for (let k = 0; k < o.dormers; k++) { const fx = lerp(x0, x1, (k + 0.5) / o.dormers + (o.dormers === 1 ? -0.15 : 0)); dormer(fx, lerp(ym, yb, 0.5), lerp(zr, zt, 0.5) - 1, true); }
        if (o.stepped) { const pts = [[y0, zt]]; for (let k = 1; k <= 3; k++) { const yy = lerp(y0, ym, k / 3.4), zz = zt + rh * k / 3 + 2; pts.push([pts[pts.length - 1][0], zz], [yy, zz]); } const right = pts.map(([yy, zz]) => [y0 + y1 - yy, zz]).reverse(); const all = pts.concat([[ym, zr + 3]], right).map(([yy, zz]) => P(x1, yy, zz)); poly4(all, wr, 0.7); }
        if (o.chimney && o.chimFront) chimney(lerp(x0, x1, 0.3), lerp(ym, yb, 0.4), lerp(zr, zt, 0.4));
      } else {
        const xm = (x0 + x1) / 2;
        if (o.chimney && !o.chimFront) chimney(lerp(xm, x0, 0.45), lerp(y0, y1, 0.3), lerp(zr, zt, 0.45));
        const lf = [P(xa, ya, zt), P(xm, ya, zr), P(xm, yb, zr), P(xa, yb, zt)];
        poly4(lf, r0, 0.75); moss(lf);
        poly4([P(xm, ya, zr), P(xb, ya, zt), P(xb, yb, zt), P(xm, yb, zr)], r1, 0.75);
        if (!o.stepped) poly4([P(x0, y1, zt), P(x1, y1, zt), P(xm, y1, zr)], wl, 0.75);
        g.strokeStyle = 'rgba(43,33,22,0.22)'; g.lineWidth = 0.55; g.beginPath(); for (const f of [0.3, 0.55, 0.8]) line(P(lerp(xm, xb, f), ya, lerp(zr, zt, f)), P(lerp(xm, xb, f), yb, lerp(zr, zt, f))); g.stroke();
        if (o.dormers) for (let k = 0; k < o.dormers; k++) { const fy = lerp(y0, y1, (k + 0.5) / o.dormers + (o.dormers === 1 ? -0.15 : 0)); dormer(lerp(xm, xb, 0.5), fy, lerp(zr, zt, 0.5) - 1, false); }
        if (o.stepped) { const pts = [[x0, zt]]; for (let k = 1; k <= 3; k++) { const xx = lerp(x0, xm, k / 3.4), zz = zt + rh * k / 3 + 2; pts.push([pts[pts.length - 1][0], zz], [xx, zz]); } const right = pts.map(([xx, zz]) => [x0 + x1 - xx, zz]).reverse(); const all = pts.concat([[xm, zr + 3]], right).map(([xx, zz]) => P(xx, y1, zz)); poly4(all, wl, 0.7); }
        if (o.chimney && o.chimFront) chimney(lerp(xm, xb, 0.4), lerp(y0, y1, 0.7), lerp(zr, zt, 0.4));
      }
    } else {
      let rx0, rx1, ry0, ry1; const wX = xb - xa, wY = yb - ya;
      if (o.roof === 'spire' || Math.abs(wX - wY) < 0.02) { rx0 = rx1 = (xa + xb) / 2; ry0 = ry1 = (ya + yb) / 2; }
      else if (wX > wY) { ry0 = ry1 = (ya + yb) / 2; rx0 = xa + wY / 2; rx1 = xb - wY / 2; }
      else { rx0 = rx1 = (xa + xb) / 2; ry0 = ya + wX / 2; ry1 = yb - wX / 2; }
      if (o.chimney) chimney(lerp(x0, x1, 0.3), lerp(y0, y1, 0.3), zt + rh * 0.35);
      poly4([P(xa, ya, zt), P(xb, ya, zt), P(rx1, ry0, zr), P(rx0, ry0, zr)], shd(r1, 0.95), 0.75);
      poly4([P(xa, ya, zt), P(rx0, ry0, zr), P(rx0, ry1, zr), P(xa, yb, zt)], shd(r0, 1.05), 0.75);
      const sf = [P(xa, yb, zt), P(rx0, ry1, zr), P(rx1, ry1, zr), P(xb, yb, zt)]; poly4(sf, r0, 0.75); moss(sf);
      poly4([P(xb, ya, zt), P(xb, yb, zt), P(rx1, ry1, zr), P(rx1, ry0, zr)], r1, 0.75);
      if (o.roof === 'spire') { const p = P(rx0, ry0, zr); g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0], p[1] - 7); g.moveTo(p[0] - 2.2, p[1] - 4.8); g.lineTo(p[0] + 2.2, p[1] - 4.8); g.stroke(); }
      if (o.flag) { const p = P(rx0, ry0, zr); banner(g, p[0], p[1], 14, o.flag); }
    }
  }
  /* ---- convex solids with lit faces and Gothic ornament ---- */
  const LDIR = (() => { const v = [-0.35, 0.45, 0.82], l = Math.hypot(v[0], v[1], v[2]); return v.map(a => a / l); })();
  function decoDraw(f, d, k) {
    const p = f.p, tri = p.length === 3, p0 = p[0], p1 = p[1], p2 = p[2], p3 = tri ? p[2] : p[3];
    const at = (u, v) => { const bx = lerp(p0[0], p1[0], u), by = lerp(p0[1], p1[1], u), bz = lerp(p0[2], p1[2], u), tx = lerp(p3[0], p2[0], u), ty = lerp(p3[1], p2[1], u), tz = lerp(p3[2], p2[2], u); return P(lerp(bx, tx, v), lerp(by, ty, v), lerp(bz, tz, v)); };
    const wR = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), hR = Math.max(0.05, (p3[2] - p0[2]) / 16);
    const arch = (uc, hw, v0, v1, ah) => { const a = at(uc - hw, v0), b = at(uc - hw, v1 - ah), c = at(uc, v1), d2 = at(uc + hw, v1 - ah), e2 = at(uc + hw, v0), cl = at(uc - hw, v1 - ah * 0.2), cr = at(uc + hw, v1 - ah * 0.2); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.quadraticCurveTo(cl[0], cl[1], c[0], c[1]); g.quadraticCurveTo(cr[0], cr[1], d2[0], d2[1]); g.lineTo(e2[0], e2[1]); g.closePath(); };
    const ahFor = (hw, span) => Math.min(span * 0.5, hw * wR / hR * 1.5);
    const tiny = (Math.hypot(at(1, 0)[0] - at(0, 0)[0], at(1, 0)[1] - at(0, 0)[1])) < 3;
    if (d.k === 'tiles') { g.strokeStyle = 'rgba(30,25,20,0.2)'; g.lineWidth = 0.5; g.beginPath(); for (const v of [0.28, 0.52, 0.76]) line(at(0, v), at(1, v)); g.stroke(); return; }
    if (d.k === 'spireband') { g.strokeStyle = 'rgba(30,25,20,0.3)'; g.lineWidth = 0.6; g.beginPath(); for (const v of [0.22, 0.46, 0.7]) line(at(0, v), at(1, v)); g.stroke(); return; }
    if (tiny) return;
    if (d.k === 'lancet') {
      const n = d.n, v0 = d.v0, v1 = d.v1;
      for (let i = 0; i < n; i++) {
        const uc = (i + 0.5) / n, hw = d.w * 0.5 / n;
        arch(uc, hw, v0, v1, ahFor(hw, v1 - v0)); g.fillStyle = d.dark ? '#221a14' : shd('#3e4a68', Math.min(1, k)); g.fill(); g.strokeStyle = 'rgba(43,33,22,0.8)'; g.lineWidth = 0.5; g.stroke();
        if (!d.dark && hw * wR > 0.06) { g.strokeStyle = 'rgba(230,220,195,0.55)'; g.lineWidth = 0.5; g.beginPath(); line(at(uc, v0), at(uc, v1 - (v1 - v0) * 0.25)); g.stroke(); const s1 = at(uc - hw * 0.45, lerp(v0, v1, 0.4)), s2 = at(uc + hw * 0.45, lerp(v0, v1, 0.62)); g.fillStyle = '#b8483a'; g.fillRect(s1[0] - 0.5, s1[1] - 0.5, 1.1, 1.1); g.fillStyle = '#d9b44a'; g.fillRect(s2[0] - 0.5, s2[1] - 0.5, 1.1, 1.1); }
      }
    } else if (d.k === 'rose') {
      const ru = d.r * 0.5, rv = ru * wR / hR, pts = [];
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; pts.push(at(0.5 + Math.cos(a) * ru, d.v + Math.sin(a) * rv)); }
      g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fillStyle = '#ece3cc'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
      const inner = []; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; inner.push(at(0.5 + Math.cos(a) * ru * 0.86, d.v + Math.sin(a) * rv * 0.86)); }
      g.beginPath(); inner.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fillStyle = '#4a4878'; g.fill();
      g.strokeStyle = 'rgba(236,227,204,0.85)'; g.lineWidth = 0.6; g.beginPath(); const c = at(0.5, d.v); for (let i = 0; i < 24; i += 2) line(c, inner[i]); g.stroke();
      g.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, q = at(0.5 + Math.cos(a) * ru * 0.4, d.v + Math.sin(a) * rv * 0.4); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } g.closePath(); g.stroke();
      g.beginPath(); g.arc(c[0], c[1], 1, 0, TAU); g.fillStyle = GOLD; g.fill();
    } else if (d.k === 'portal') {
      const hw = d.w / 2, ah = ahFor(hw, d.h);
      arch(0.5, hw + 0.05, 0, d.h + 0.05, ah); g.fillStyle = shd('#d8ccb0', k); g.fill(); g.strokeStyle = 'rgba(43,33,22,0.7)'; g.lineWidth = 0.6; g.stroke();
      arch(0.5, hw + 0.025, 0, d.h + 0.025, ah); g.stroke();
      arch(0.5, hw, 0, d.h, ah); g.fillStyle = '#2a211a'; g.fill(); g.stroke();
      g.strokeStyle = 'rgba(160,120,80,0.6)'; g.lineWidth = 0.5; g.beginPath(); line(at(0.5, 0), at(0.5, d.h - ah)); g.stroke();
    } else if (d.k === 'belfry') {
      const n = d.n || 2;
      for (let i = 0; i < n; i++) { const uc = (i + 0.5) / n, hw = 0.28 / n; arch(uc, hw, 0.74, 0.93, ahFor(hw, 0.19)); g.fillStyle = '#251d16'; g.fill(); g.strokeStyle = 'rgba(43,33,22,0.8)'; g.lineWidth = 0.5; g.stroke(); g.strokeStyle = 'rgba(200,185,160,0.5)'; g.beginPath(); for (const v of [0.78, 0.82, 0.86]) line(at(uc - hw * 0.8, v), at(uc + hw * 0.8, v)); g.stroke(); }
    } else if (d.k === 'arcade') {
      const n = d.n;
      for (let i = 0; i < n; i++) { const uc = (i + 0.5) / n, hw = 0.36 / n, ah = ahFor(hw, 0.7) * 0.8; arch(uc, hw, 0, 0.72, ah); g.fillStyle = 'rgba(52,42,32,0.88)'; g.fill(); }
      g.strokeStyle = 'rgba(43,33,22,0.35)'; g.lineWidth = 0.5; g.beginPath(); line(at(0, 0.8), at(1, 0.8)); g.stroke();
    } else if (d.k === 'win') {
      const rows = d.rows || 1, n = d.n || 1, v0 = d.v0 != null ? d.v0 : 0.15, v1 = d.v1 != null ? d.v1 : 0.85;
      for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) { const uc = (i + 0.5) / n, hw = 0.12 / n + 0.03, vr0 = lerp(v0, v1, (r + 0.2) / rows), vr1 = lerp(v0, v1, (r + 0.75) / rows); arch(uc, Math.min(hw, 0.12), vr0, vr1, ahFor(Math.min(hw, 0.12), vr1 - vr0) * 0.6); g.fillStyle = 'rgba(48,38,28,0.85)'; g.fill(); }
    } else if (d.k === 'door') { arch(0.5, 0.14, 0, 0.62, ahFor(0.14, 0.62) * 0.6); g.fillStyle = '#3a2b1d'; g.fill(); }
  }
  function solidDraw(o) {
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const f of o.faces) for (const p of f.p) { cx += p[0]; cy += p[1]; cz += p[2]; n++; }
    cx /= n; cy /= n; cz /= n;
    for (const f of o.faces) {
      const pts = f.p, m = pts.length;
      let nx = 0, ny = 0, nz = 0, fx = 0, fy = 0, fz = 0, rx = 0, ry = 0, rz = 0;
      for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % m]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); rx += (a[1] - b[1]) * (a[2] + b[2]) / 16; ry += (a[2] - b[2]) / 16 * (a[0] + b[0]); fx += a[0]; fy += a[1]; fz += a[2]; }
      rz = nz; fx /= m; fy /= m; fz /= m;
      const sgn = (nx * (fx - cx) + ny * (fy - cy) + nz * (fz - cz)) < 0 ? -1 : 1;
      if (sgn * (nx + ny + 16 * nz) <= 1e-6) continue;
      const rl = Math.hypot(rx, ry, rz) || 1, lam = sgn * (rx * LDIR[0] + ry * LDIR[1] + rz * LDIR[2]) / rl;
      const kk = Math.max(0.6, Math.min(1.1, 0.72 + 0.36 * lam));
      g.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1], p[2]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath();
      g.fillStyle = shd(f.c, kk); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7; g.lineJoin = 'round'; g.stroke();
      if (f.deco) for (const d of f.deco) if (d) decoDraw(f, d, kk);
    }
  }
  function flyerDraw(o) {
    const a = P(o.x1, o.y1, o.z1), b = P(o.x2, o.y2, o.z2), mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 3;
    g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(mx, my, b[0], b[1]); g.strokeStyle = INK; g.lineWidth = 3.2; g.stroke(); g.strokeStyle = '#e0d5bc'; g.lineWidth = 1.9; g.stroke();
    const a2 = P(o.x1, o.y1, o.z1 - 7), b2 = P(o.x2, o.y2, o.z2 - 5); g.beginPath(); g.moveTo(a2[0], a2[1]); g.quadraticCurveTo(mx, my + 5, b2[0], b2[1]); g.strokeStyle = 'rgba(43,33,22,0.5)'; g.lineWidth = 0.7; g.stroke();
  }
  /* ---- trees ---- */
  const TP = {
    oak: [['#7f9a55', '#5b783e'], ['#88a25b', '#627f42'], ['#76914e', '#55703a']], beech: [['#93ab5f', '#6b8743'], ['#8aa55a', '#64803f']],
    birch: [['#b2c26f', '#8a9f4f'], ['#a9bd66', '#839a49']], willow: [['#a9bb6a', '#7f9549']], poplar: [['#7d9a52', '#5a7a3c'], ['#86a056', '#61803f']],
    cypress: [['#5b764d', '#3e5536']], yew: [['#506b46', '#374d32']], olive: [['#a8b28d', '#7c8866']], fruit: [['#8aa75b', '#678642'], ['#93ad60', '#6d8a46']],
    bush: [['#90a65e', '#6b8446'], ['#7f9852', '#5d773e']], autumn: [['#d6a54c', '#a77a31'], ['#c8743f', '#95522c'], ['#c9a13b', '#9b7527'], ['#b9563c', '#8a3c2b']]
  };
  const strands = (cx, cy, rx, ry, s, LP, rnd, front) => {
    g.lineCap = 'round';
    const n = front ? 12 : 9;
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (0.04 + 0.92 * (k + rnd() * 0.5) / n), sx = cx - Math.cos(a) * rx * (front ? 0.9 : 1.02), sy = cy + Math.sin(a) * ry * (front ? 0.55 : 0.2), len = s * (0.38 + rnd() * 0.3) * (front ? 1 : 1.1);
      const ex = sx + (rnd() - 0.5) * 2.5, ey = sy + len;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + (rnd() - 0.5) * 3, sy + len * 0.5, ex, ey);
      g.strokeStyle = front ? INK : LP.deep; g.globalAlpha = front ? 0.55 : 0.9; g.lineWidth = front ? 2.2 : 1.8; g.stroke();
      g.globalAlpha = 1; g.strokeStyle = front ? LP.lo : LP.deep; g.lineWidth = front ? 1.5 : 1.2; g.stroke();
      if (front) { g.strokeStyle = LP.hi; g.lineWidth = 0.6; g.beginPath(); g.moveTo(sx - 0.4, sy + 1); g.quadraticCurveTo(sx - 0.4 + (rnd() - 0.5) * 2, sy + len * 0.45, ex - 0.4, ey - len * 0.25); g.stroke(); }
    }
  };
  function isoTree(x, y, s, sp, rnd, cold) {
    s *= 0.88 + rnd() * 0.26;
    const palOf = k2 => { const l = TP[k2] || TP.oak, p = l[Math.floor(rnd() * l.length)]; const j = 0.94 + rnd() * 0.12; return leafPal(mixHex(p[0], j > 1 ? '#e8e2a0' : '#3a5a30', Math.abs(j - 1) * 1.2), p[1]); };
    const lean = (rnd() - 0.5) * s * 0.14, B = [];
    if (sp === 'pine') { drawPine(g, x, y, s * 0.82, rnd, cold); return; }
    if (sp === 'spruce') { g.save(); g.translate(x, y); g.scale(0.74, 1.28); drawPine(g, 0, 0, s * 0.7, rnd, cold, TREE.spruce); g.restore(); return; }
    if (sp === 'cypress') { trunkStroke(g, x, y, s * 0.2, 0, false, 0.8); for (const [dy, r, ry] of [[-0.38, 0.27, 0.42], [-0.86, 0.25, 0.44], [-1.32, 0.19, 0.4], [-1.68, 0.11, 0.25]]) B.push(makeBlob(x, y + dy * s, r * s, ry * s, rnd, 9)); B.reverse(); foliage(g, B, palOf('cypress'), rnd, { lw: 0.44 }); return; }
    if (sp === 'yew') { trunkStroke(g, x, y, s * 0.18, 0, false, 0.8); for (const [dy, r, ry] of [[-0.42, 0.44, 0.36], [-0.82, 0.36, 0.34], [-1.12, 0.22, 0.24]]) B.push(makeBlob(x, y + dy * s, r * s, ry * s, rnd, 10)); B.reverse(); foliage(g, B, palOf('yew'), rnd, { lw: 0.44 }); return; }
    if (sp === 'poplar') { const LP = palOf('poplar'); trunkStroke(g, x, y, s * 0.32, lean * 0.3, false, 0.85); for (const [dy, r, ry] of [[-0.45, 0.27, 0.33], [-0.85, 0.26, 0.37], [-1.24, 0.2, 0.34]]) B.push(makeBlob(x + lean * 0.4, y + dy * s, r * s, ry * s, rnd, 8)); B.reverse(); foliage(g, B, LP, rnd, { lw: 0.44 }); return; }
    if (sp === 'birch') { const LP = palOf('birch'); trunkStroke(g, x, y, s * 1.0, lean, true, 0.9); g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + lean * 0.7, y - s * 0.72); g.lineTo(x + lean * 0.7 - s * 0.18, y - s * 0.92); g.stroke(); for (const [dx, dy, r] of [[0.02, -1.3, 0.22], [-0.24, -1.06, 0.22], [0.22, -1.08, 0.21], [-0.06, -0.86, 0.18], [0.18, -0.82, 0.14]]) B.push(makeBlob(x + lean + dx * s, y + dy * s, r * s, r * s * 1.12, rnd, 7)); foliage(g, B, LP, rnd, { lw: 0.42 }); return; }
    if (sp === 'willow') {
      const LP = palOf('willow'); trunkStroke(g, x, y, s * 0.58, lean, false, 1); const cx = x + lean, cy = y - s * 0.98;
      strands(cx, cy, s * 0.62, s * 0.42, s, LP, rnd, false);
      for (const [dx, dy, r, ry] of [[-0.3, 0.02, 0.38, 0.3], [0.28, 0.04, 0.38, 0.3], [0, -0.18, 0.44, 0.32]]) B.push(makeBlob(cx + dx * s, cy + dy * s, r * s, ry * s, rnd, 9));
      foliage(g, B, LP, rnd, { lw: 0.44 });
      strands(cx, cy + s * 0.06, s * 0.6, s * 0.3, s, LP, rnd, true);
      return;
    }
    if (sp === 'olive') {
      const LP = palOf('olive'); g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - 2, y - s * 0.2, x + 2, y - s * 0.35, x - 1, y - s * 0.62); g.moveTo(x, y - s * 0.25); g.quadraticCurveTo(x + 3, y - s * 0.42, x + 3.8, y - s * 0.6); g.strokeStyle = INK; g.lineWidth = 2.1; g.stroke(); g.strokeStyle = '#7d6a52'; g.lineWidth = 1; g.stroke();
      for (const [dx, dy, r] of [[-0.3, -0.72, 0.2], [0.26, -0.76, 0.22], [0, -0.98, 0.22], [-0.1, -0.58, 0.15], [0.32, -0.56, 0.13]]) B.push(makeBlob(x + dx * s, y + dy * s, r * s, r * s * 0.8, rnd, 8));
      foliage(g, B, LP, rnd, { lw: 0.42 }); return;
    }
    if (sp === 'fruit') {
      const LP = palOf('fruit'); trunkStroke(g, x, y, s * 0.38, lean * 0.5, false, 0.9); const cx = x + lean * 0.5, cy = y - s * 0.74;
      for (const [dx, dy, r] of [[0, -0.14, 0.38], [-0.27, 0.06, 0.28], [0.27, 0.08, 0.28], [0.02, 0.16, 0.24]]) B.push(makeBlob(cx + dx * s, cy + dy * s, r * s, r * s * 0.9, rnd, 8));
      foliage(g, B, LP, rnd, { lw: 0.42 });
      const fc = rnd() < 0.5 ? '#c8452f' : '#e09a2b';
      for (let k2 = 0; k2 < 7; k2++) { const fx = cx + (rnd() - 0.5) * s * 0.75, fy = cy + (rnd() - 0.25) * s * 0.45; g.beginPath(); g.arc(fx, fy, 1.05, 0, TAU); g.fillStyle = fc; g.fill(); g.strokeStyle = 'rgba(43,33,22,0.6)'; g.lineWidth = 0.35; g.stroke(); g.fillStyle = 'rgba(255,240,210,0.85)'; g.fillRect(fx - 0.5, fy - 0.6, 0.5, 0.5); }
      return;
    }
    if (sp === 'bush') { for (const [dx, dy, r] of [[-0.24, -0.2, 0.3], [0.24, -0.18, 0.28], [0, -0.34, 0.32]]) B.push(makeBlob(x + dx * s, y + dy * s, r * s, r * s * 0.8, rnd, 8)); foliage(g, B, palOf('bush'), rnd, { lw: 0.42 }); return; }
    if (sp === 'beech') {
      const LP = palOf('beech'); trunkStroke(g, x, y, s * 0.64, lean, false, 1.05); branchFork(g, x, y, s * 1.1, lean); const cx = x + lean, cy = y - s * 1.06;
      for (const [dx, dy, r, ry] of [[0, -0.42, 0.36, 0.36], [-0.32, -0.12, 0.34, 0.34], [0.32, -0.1, 0.33, 0.34], [-0.14, 0.16, 0.33, 0.3], [0.2, 0.2, 0.3, 0.28]]) B.push(makeBlob(cx + dx * s, cy + dy * s, r * s, ry * s, rnd));
      foliage(g, B, LP, rnd); return;
    }
    const LP = sp === 'autumn' ? palOf('autumn') : palOf('oak');
    trunkStroke(g, x, y, s * 0.55, lean, false, 1.1); branchFork(g, x, y, s, lean);
    const cx = x + lean, cy = y - s * 0.98;
    const lobes = [[0, -0.32, 0.4], [-0.38, -0.04, 0.36], [0.38, -0.02, 0.35], [-0.16, 0.2, 0.34], [0.2, 0.22, 0.32], [0.02, -0.02, 0.3]].slice(0, 4 + Math.floor(rnd() * 3));
    lobes.sort((a2, b2) => a2[1] - b2[1]).forEach(([dx, dy, r]) => B.push(makeBlob(cx + dx * s, cy + dy * s, r * s * (0.9 + rnd() * 0.2), r * s * 0.9, rnd)));
    foliage(g, B, LP, rnd);
  }
  /* tree sprites: each species drawn once in eight variants, then stamped */
  const sprites = new Map(), S0 = 17, SW = S0 * 2.6, SH = S0 * 3.1, SAX = SW / 2, SAY = SH - S0 * 0.35;
  function treeSprite(sp, v, cold) {
    const key = sp + '|' + v + '|' + (cold ? 1 : 0); let c = sprites.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = Math.ceil(SW * SC); c.height = Math.ceil(SH * SC);
    const keep = g; g = c.getContext('2d'); g.setTransform(SC, 0, 0, SC, 0, 0); g.lineJoin = 'round'; g.lineCap = 'round';
    isoTree(SAX, SAY, S0, sp, mulberry32(v * 7919 + sp.length * 131 + (cold ? 7 : 0) + 3), cold);
    g = keep; sprites.set(key, c); return c;
  }
  function stampTree(sx, sy, s2, sp, rnd, cold) { const spr = treeSprite(sp, Math.floor(rnd() * 8), cold), k2 = s2 / S0; g.drawImage(spr, sx - SAX * k2, sy - SAY * k2, SW * k2, SH * k2); }
  function smallObj(o) {
    const [sx, sy] = P(o.x, o.y, o.z0);
    if (o.type === 'smoke') { const [px, py] = P(o.x, o.y, o.z0 + (o.dz || 0)); smokeAt(px, py); return; }
    if (o.type === 'hive') { g.beginPath(); g.moveTo(sx - 2.8, sy); g.bezierCurveTo(sx - 2.8, sy - 6, sx + 2.8, sy - 6, sx + 2.8, sy); g.closePath(); g.fillStyle = '#d6b45e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke(); g.strokeStyle = 'rgba(90,60,20,0.5)'; g.beginPath(); g.moveTo(sx - 2.4, sy - 1.6); g.lineTo(sx + 2.4, sy - 1.6); g.moveTo(sx - 1.9, sy - 3.2); g.lineTo(sx + 1.9, sy - 3.2); g.stroke(); g.fillStyle = '#2a1f15'; g.fillRect(sx - 0.6, sy - 1.2, 1.2, 1.2); return; }
    if (o.type === 'bed') { const s2 = 0.3, pts = [P(o.x - s2, o.y - 0.14, o.z0 + 1.5), P(o.x + s2, o.y - 0.14, o.z0 + 1.5), P(o.x + s2, o.y + 0.14, o.z0 + 1.5), P(o.x - s2, o.y + 0.14, o.z0 + 1.5)]; poly4(pts, '#7a5a3a', 0.5); for (let k2 = 0; k2 < 5; k2++) { const q = P(o.x - s2 + 0.1 + k2 * 0.12, o.y + (k2 % 2 ? 0.05 : -0.05), o.z0 + 2.5); g.fillStyle = k2 % 2 ? o.c : '#6f8a4c'; g.beginPath(); g.arc(q[0], q[1], 1.3, 0, TAU); g.fill(); } return; }
    if (o.type === 'cross') { g.fillStyle = '#d8d0bf'; g.strokeStyle = INK; g.lineWidth = 0.6; g.fillRect(sx - 2.5, sy - 2, 5, 2); g.strokeRect(sx - 2.5, sy - 2, 5, 2); g.fillRect(sx - 0.8, sy - 13, 1.6, 11); g.strokeRect(sx - 0.8, sy - 13, 1.6, 11); g.fillRect(sx - 3, sy - 10.5, 6, 1.6); g.strokeRect(sx - 3, sy - 10.5, 6, 1.6); }
  }
  function roundDraw(o) {
    const [cx2, by] = P(o.x, o.y, o.z0), ty = by - o.h, rx = o.r * TWH * 1.414, ry = o.r * THH * 1.414, base = o.wall || '#e2d8c0';
    const gr = g.createLinearGradient(cx2 - rx, 0, cx2 + rx, 0); gr.addColorStop(0, shd(base, 1.06)); gr.addColorStop(0.45, base); gr.addColorStop(1, shd(base, 0.66));
    const body = () => { g.beginPath(); g.moveTo(cx2 - rx, ty); g.lineTo(cx2 - rx, by); g.ellipse(cx2, by, rx, ry, 0, Math.PI, 0, true); g.lineTo(cx2 + rx, ty); g.ellipse(cx2, ty, rx, ry, 0, 0, Math.PI, false); g.closePath(); };
    body(); g.fillStyle = gr; g.fill();
    if (o.bands) { g.save(); body(); g.clip(); g.fillStyle = WAX; for (const f of [0.3, 0.62]) g.fillRect(cx2 - rx - 1, by - o.h * f - 5, rx * 2 + 2, 6); g.fillStyle = 'rgba(40,25,15,0.25)'; g.fillRect(cx2 + rx * 0.2, ty - 2, rx, o.h + ry + 4); g.restore(); }
    body(); g.strokeStyle = INK; g.lineWidth = 0.75; g.stroke();
    g.fillStyle = '#2f271f'; g.fillRect(cx2 - rx * 0.3, ty + o.h * 0.3, 1.4, 3.6); if (o.h > 40) g.fillRect(cx2 - rx * 0.15, ty + o.h * 0.62, 1.4, 3.6);
    if (o.holes) { for (let r2 = 0; r2 < 3; r2++) for (let k2 = 0; k2 < 4; k2++) { const a = Math.PI * (0.62 + k2 * 0.12 + (r2 % 2) * 0.06); g.fillRect(cx2 - Math.cos(a) * rx * 0.9 - 0.6, ty + 4 + r2 * 3.4 + Math.sin(a) * ry * 0.3, 1.2, 1.2); } }
    const topEll = (k, fill) => { g.beginPath(); g.ellipse(cx2, ty, rx * k, ry * k, 0, 0, TAU); g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke(); };
    if (o.roof === 'cone') {
      const k = 1.16, rh = o.rh || 18, [c0, c1] = o.roofC || SLATE;
      const gr2 = g.createLinearGradient(cx2 - rx * k, 0, cx2 + rx * k, 0); gr2.addColorStop(0, shd(c0, 1.15)); gr2.addColorStop(0.5, c0); gr2.addColorStop(1, c1);
      g.beginPath(); g.moveTo(cx2 - rx * k, ty); g.lineTo(cx2, ty - rh); g.lineTo(cx2 + rx * k, ty); g.ellipse(cx2, ty, rx * k, ry * k, 0, 0, Math.PI, false); g.closePath(); g.fillStyle = gr2; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.75; g.stroke();
      if (o.flag) banner(g, cx2, ty - rh, 13, o.flag);
    } else if (o.roof === 'dome') { topEll(1, shd(base, 0.85)); dome(o.x, o.y, o.z0 + o.h, o.r * 0.9, o.r * 18, o.domeC || GOLD); }
    else if (o.roof === 'lantern') {
      topEll(1.15, shd(base, 0.85));
      const lh = 7, lr = rx * 0.55;
      const glow = g.createRadialGradient(cx2, ty - lh / 2, 0, cx2, ty - lh / 2, 26); glow.addColorStop(0, 'rgba(255,220,130,0.75)'); glow.addColorStop(1, 'rgba(255,220,130,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(cx2, ty - lh / 2, 26, 0, TAU); g.fill();
      g.fillStyle = '#f2c460'; g.fillRect(cx2 - lr, ty - lh, lr * 2, lh); g.strokeStyle = INK; g.lineWidth = 0.7; g.strokeRect(cx2 - lr, ty - lh, lr * 2, lh);
      g.beginPath(); g.moveTo(cx2 - lr * 1.3, ty - lh); g.lineTo(cx2, ty - lh - 6); g.lineTo(cx2 + lr * 1.3, ty - lh); g.closePath(); g.fillStyle = '#3e3732'; g.fill(); g.stroke();
    } else {
      topEll(1, shd(base, 0.85));
      const mer = (a) => { const px = cx2 + Math.cos(a) * rx, py = ty + Math.sin(a) * ry; g.fillStyle = Math.cos(a) > 0.3 ? shd(base, 0.75) : base; g.fillRect(px - 1.5, py - 3, 3, 3); g.strokeStyle = INK; g.lineWidth = 0.45; g.strokeRect(px - 1.5, py - 3, 3, 3); };
      for (let k = 0; k < 6; k++) mer(Math.PI + (k + 0.5) / 6 * Math.PI);
      for (let k = 0; k < 6; k++) mer((k + 0.5) / 6 * Math.PI);
      if (o.flag) banner(g, cx2, ty, 14, o.flag);
    }
  }
  function wallDraw(o) {
    const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, t = (o.t || 0.62) / 2;
    const A = [o.x1 + nx * t, o.y1 + ny * t], Bq = [o.x2 + nx * t, o.y2 + ny * t], Cq = [o.x2 - nx * t, o.y2 - ny * t], Dq = [o.x1 - nx * t, o.y1 - ny * t];
    const z0 = o.z0, zt = z0 + o.h, light = '#ddd3bb', dark = '#b3a88e';
    const back = (nx + ny) > 0 ? -1 : 1;
    merlonsAlong(o.x1 + nx * t * back, o.y1 + ny * t * back, o.x2 + nx * t * back, o.y2 + ny * t * back, zt, light);
    for (const [p, q, fx, fy] of [[A, Bq, nx, ny], [Bq, Cq, ux, uy], [Cq, Dq, -nx, -ny], [Dq, A, -ux, -uy]]) {
      if (fx + fy <= 0.001) continue;
      poly4([P(p[0], p[1], z0), P(q[0], q[1], z0), P(q[0], q[1], zt), P(p[0], p[1], zt)], fy > fx ? light : dark, 0.7);
      if (o.gate && Math.abs(fx * nx + fy * ny) > 0.9) {
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], w2 = Math.min(0.32, L * 0.3), lp = [m[0] - ux * w2, m[1] - uy * w2], rq = [m[0] + ux * w2, m[1] + uy * w2];
        const a1 = P(lp[0], lp[1], z0), a2 = P(lp[0], lp[1], z0 + 9), a3 = P(rq[0], rq[1], z0 + 9), a4 = P(rq[0], rq[1], z0), top = P(m[0], m[1], z0 + 15);
        g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.quadraticCurveTo(top[0], top[1], a3[0], a3[1]); g.lineTo(a4[0], a4[1]); g.closePath(); g.fillStyle = '#2b231b'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
      }
    }
    poly4([P(A[0], A[1], zt), P(Bq[0], Bq[1], zt), P(Cq[0], Cq[1], zt), P(Dq[0], Dq[1], zt)], '#cbc0a4', 0.7);
    merlonsAlong(o.x1 - nx * t * back, o.y1 - ny * t * back, o.x2 - nx * t * back, o.y2 - ny * t * back, zt, light);
  }
  function stallDraw(o) {
    const s2 = 0.22, x0 = o.x - s2, x1 = o.x + s2, y0 = o.y - s2, y1 = o.y + s2, z0 = o.z0;
    poly4([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z0 + 3), P(x0, y1, z0 + 3)], '#a07a4a', 0.5);
    poly4([P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z0 + 3), P(x1, y1, z0 + 3)], '#7f5f38', 0.5);
    g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); line(P(x0, y1, z0), P(x0, y1, z0 + 7)); line(P(x1, y1, z0), P(x1, y1, z0 + 7)); line(P(x1, y0, z0), P(x1, y0, z0 + 8)); g.stroke();
    const e = 0.06, pts = [P(x0 - e, y0 - e, z0 + 9), P(x1 + e, y0 - e, z0 + 9), P(x1 + e, y1 + e, z0 + 6.5), P(x0 - e, y1 + e, z0 + 6.5)];
    poly4(pts, o.c[0], 0.55);
    g.save(); poly4(pts); g.clip(); g.strokeStyle = o.c[1]; g.lineWidth = 2; g.beginPath(); for (const f of [0.25, 0.75]) line(P(lerp(x0, x1, f), y0 - 0.2, z0 + 9), P(lerp(x0, x1, f), y1 + 0.2, z0 + 6.5)); g.stroke(); g.restore();
    poly4(pts, null, 0.55);
  }
  function fountainDraw(o) {
    const [cx2, cy2] = P(o.x, o.y, o.z0), rx = 0.7 * TWH * 1.414, ry = 0.7 * THH * 1.414;
    g.beginPath(); g.ellipse(cx2, cy2, rx, ry, 0, 0, TAU); g.fillStyle = '#cfc4ab'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke();
    g.beginPath(); g.ellipse(cx2, cy2 - 1.5, rx * 0.8, ry * 0.8, 0, 0, TAU); g.fillStyle = '#8fb3b0'; g.fill(); g.stroke();
    g.fillStyle = '#ddd3bb'; g.fillRect(cx2 - 1.5, cy2 - 12, 3, 10); g.strokeRect(cx2 - 1.5, cy2 - 12, 3, 10);
    g.beginPath(); g.ellipse(cx2, cy2 - 12, 4, 1.8, 0, 0, TAU); g.fillStyle = '#ddd3bb'; g.fill(); g.stroke();
    g.strokeStyle = 'rgba(235,245,245,0.85)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx2, cy2 - 13); g.quadraticCurveTo(cx2 - 5, cy2 - 18, cx2 - 7, cy2 - 4); g.moveTo(cx2, cy2 - 13); g.quadraticCurveTo(cx2 + 5, cy2 - 18, cx2 + 7, cy2 - 4); g.stroke();
  }
  /* sort and paint */
  const list = [];
  const under = new Uint8Array(NN);
  for (const o of objs) {
    if (o.type !== 'asset') continue;
    const [w, d] = footprint(o); list.push({ key: o.x + w / 2 + o.y + d / 2, pri: 1, o });
    for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) if (x >= 0 && y >= 0 && x < S && y < S) under[y * S + x] = 1;
  }
  for (const o of objs) { if (o.type === 'asset') continue; const key = o.type === 'bridge' ? o.x + o.w / 2 + o.y + o.d / 2 - 0.6 : o.type === 'bldg' ? o.x + o.w / 2 + o.y + o.d / 2 : (o.type === 'wall' || o.type === 'flyer') ? (o.x1 + o.x2) / 2 + (o.y1 + o.y2) / 2 + (o.kb || 0) : o.type === 'solid' ? o.kx + o.ky + o.kb : o.x + o.y; list.push({ key, pri: 1, o }); }
  for (let u = 0; u < NN; u++) if (RE[u] > 0 && !under[u]) list.push({ key: (u % S) + ((u / S) | 0) + 1, pri: 0, u });
  list.sort((a, b) => a.key - b.key || a.pri - b.pri);
  for (const it of list) {
    if (it.u != null) { drawTile(it.u); continue; }
    const o = it.o, rr = mulberry32(Math.floor(o.x * 131 + o.y * 977 + 7));
    if (o.type === 'bldg') bldgDraw(o);
    else if (o.type === 'bridge') bridgeDraw(o);
    else if (o.type === 'round') roundDraw(o);
    else if (o.type === 'wall') wallDraw(o);
    else if (o.type === 'tree') { const [sx2, sy2] = P(o.x, o.y, o.z0); stampTree(sx2, sy2, o.s, o.sp, rr, C.clim === 'cold'); }
    else if (o.type === 'solid') solidDraw(o);
    else if (o.type === 'flyer') flyerDraw(o);
    else if (o.type === 'smoke' || o.type === 'hive' || o.type === 'bed' || o.type === 'cross') smallObj(o);
    else if (o.type === 'asset') drawAsset(g, P, o, o.z0, C.clim);
    else if (o.type === 'stall') stallDraw(o);
    else if (o.type === 'fountain') fountainDraw(o);
    else if (o.type === 'well') roundDraw({ x: o.x, y: o.y, z0: o.z0, r: 0.28, h: 5, roof: 'cone', rh: 9, roofC: ROOFS[2], wall: '#cfc6b2' });
    else if (o.type === 'ship') { const [sx2, sy2] = P(o.x, o.y, -5); drawShip(g, sx2, sy2 - 3, 17, o.flip); }
    else if (o.type === 'mill') { const [sx2, sy2] = P(o.x, o.y, o.z0); g.save(); g.translate(sx2, sy2); g.scale(0.95, 0.95); drawSettlement(g, { kind: 'windmill', i: Math.round(o.x * 7 + o.y * 3) }, 0, -R * 0.48); g.restore(); }
  }
  /* paper grain on the diorama only */
  {
    const gr = document.createElement('canvas'); gr.width = gr.height = 256; const gx = gr.getContext('2d'), gi = gx.createImageData(256, 256), grng = mulberry32(11);
    for (let k = 0; k < gi.data.length; k += 4) { gi.data[k] = 70; gi.data[k + 1] = 52; gi.data[k + 2] = 30; gi.data[k + 3] = grng() * 30; }
    gx.putImageData(gi, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = g.createPattern(gr, 'repeat'); g.fillRect(0, 0, can.width, can.height); g.restore();
  }
  const dTiles = C.districts.map(() => []);
  for (let u = 0; u < NN; u++) if (RD[u] >= 0 && !isW(RT[u]) && RT[u] !== CT.ROAD) dTiles[RD[u]].push(u);
  return { can, W, H, OX, OY, P, rp, RT, RE, RD, zOf, dTiles, rot, S };
}

export { renderCity };
