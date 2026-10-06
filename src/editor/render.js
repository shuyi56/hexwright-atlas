import { mulberry32 } from '../core/random.js';
import { INK, hexRgb, rgbStr } from '../render/palette.js';
import { ASSET_BY_ID, TERRAIN, decorateTerrain, drawAsset, footprint, linkWalls, turnAsset, wallLinks } from '../tiles/index.js';
import { MAX_LEVEL, STOREY, levelOf } from './model.js';

/* ================= tile editor: rendering =================
   Same projection as the city districts (TWH x THH tiles, EL px per height level) so assets
   look identical in both places. `rot` turns the whole map in quarter steps. opts.top is the highest storey
   drawn (default all): the editor hides the floors above the one being worked on, so it can always be seen. */
const TWH = 16, THH = 8, EL = 8, BASE = 24, SZ = STOREY * EL, SLAB = 2.5;
/* hypsometric tints for height levels 0..6, in the map's own chalky palette: low meadow to pale summit.
   opts.heights washes each ground tile with its level's tint, and the editor's legend shows the same scale. */
const HEIGHT_RAMP = ['#9fb47a', '#bcc283', '#d6c98d', '#dcb277', '#c8936a', '#a98a76', '#e2dcd0'];
const hrand = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let k = p.length - 1; k >= 0; k--) { const q = p[k]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
const rotInst = turnAsset;
function layout(S) { const padX = 40, top = 90 + MAX_LEVEL * SZ, bot = BASE + 30; return { W: S * TWH * 2 + padX * 2, H: S * THH * 2 + top + bot, OX: S * TWH + padX, OY: top }; }

/* ---------- the map image, drawn whole or patched in place ----------
   renderTiles draws a map from scratch. updateTiles brings that same image up to date with a model
   that has since been edited: it diffs against what was last drawn and repaints only the screen
   rectangle the changed tiles and pieces can reach, so one click costs a few tiles, not the map.
   Every paint step culls by conservative screen bounds (tileBox, pieceBox), which is what lets a
   clipped repaint come out identical to a full one. */
const GRAIN = (() => { let c; return () => {
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 128; const gx = c.getContext('2d'), gi = gx.createImageData(128, 128), rr = mulberry32(11);
  for (let k = 0; k < gi.data.length; k += 4) { gi.data[k] = 70; gi.data[k + 1] = 52; gi.data[k + 2] = 30; gi.data[k + 3] = rr() * 26; }
  gx.putImageData(gi, 0, 0); return c;
}; })();
const pieceKey = o => `${o.id},${o.x},${o.y},${o.face},${o.v},${levelOf(o)}`;
/* walls are drawn from their neighbours, so which pieces they join is part of what identifies them: the
   neighbour of a wall that was added or removed counts as changed and is repainted with it */
const pieceKeys = objs => { const wl = wallLinks(objs); return objs.map(o => pieceKey(o) + (wl.has(o) ? ',' + wl.get(o).join('') : '')); };

function renderTiles(M, rot, SC, opts = {}) {
  const S = M.S, NN = S * S, { W, H, OX, OY } = layout(S);
  const P = (x, y, z) => [OX + (x - y) * TWH, OY + (x + y) * THH - z];
  const rti = t => { const x = t % S, y = (t / S) | 0; const X = rot === 0 ? x : rot === 1 ? S - 1 - y : rot === 2 ? S - 1 - x : y, Y = rot === 0 ? y : rot === 1 ? x : rot === 2 ? S - 1 - y : S - 1 - x; return Y * S + X; };
  const back = new Int32Array(NN); for (let t = 0; t < NN; t++) back[rti(t)] = t;
  const can = document.createElement('canvas'); can.width = Math.ceil(W * SC); can.height = Math.ceil(H * SC);
  const R = { can, W, H, OX, OY, P, rti, back, S, rot, SC, opts, clim: M.clim, RT: new Uint8Array(NN), RE: new Uint8Array(NN), objs: [], covered: new Uint8Array(NN) };
  R.zOf = u => R.RE[u] * EL - (TERRAIN[R.RT[u]].sink || 0);
  /* the surface height of level L at view tile u: the ground, or an upper floor's top */
  R.zAt = (u, L) => (L ? R.RE[u] * EL + L * SZ : R.zOf(u));
  R.top = opts.top ?? MAX_LEVEL;
  scene(R, M); paint(R, null);
  return R;
}

/* copy the model into view space: terrain, heights, and pieces with the height they stand at */
function scene(R, M) {
  const { S, rot, rti, RT, RE, covered, zOf } = R, NN = S * S;
  for (let t = 0; t < NN; t++) { const u = rti(t); RT[u] = M.terr[t]; RE[u] = M.elev[t]; }
  covered.fill(0);
  /* upper floors up to the top storey drawn, in view space; zTop is the highest surface on each tile */
  R.FL = [null]; R.zTop = new Float32Array(NN);
  for (let u = 0; u < NN; u++) R.zTop[u] = zOf(u);
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const f = M.floors && M.floors[L - 1]; if (!f || L > R.top) { R.FL.push(null); continue; }
    const v = new Uint8Array(NN); for (let t = 0; t < NN; t++) if (f[t]) { const u = rti(t); v[u] = f[t]; R.zTop[u] = Math.max(R.zTop[u], R.zAt(u, L)); }
    R.FL.push(v);
  }
  const keys = pieceKeys(M.objs);
  /* copies: at rot 0 turnAsset hands back the model's own piece, and render data (key, links) must not leak into it */
  R.objs = M.objs.map((o, k) => Object.assign({}, rotInst(o, rot, S), { k, key: keys[k] })).filter(o => levelOf(o) <= R.top);
  linkWalls(R.objs);
  for (const o of R.objs) {
    const [w, d] = footprint(o), L = levelOf(o); let z = 0, zmin = Infinity;
    for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) { const u = y * S + x, zz = R.zAt(u, L); if (!L) covered[u] = 1; z = Math.max(z, zz); zmin = Math.min(zmin, zz); }
    o.z = ASSET_BY_ID[o.id].water ? zmin : z;
  }
  R.terr = M.terr.slice(); R.elev = M.elev.slice(); R.fl = (M.floors || []).map(f => f && f.slice()); R.ver = (R.ver || 0) + 1;
}

/* screen bounds (unscaled px) of everything a tile or a piece can paint, with room to spare */
function tileBox(R, u) {
  const S = R.S, X = u % S, Y = (u / S) | 0, z = R.zTop ? R.zTop[u] : R.zOf(u), cx = R.OX + (X - Y) * TWH, top = R.OY + (X + Y) * THH;
  return [cx - TWH - 6, top - z - 24, cx + TWH + 6, top + 2 * THH + 10];
}
function pieceBox(R, o) {
  const a = ASSET_BY_ID[o.id], [w, d] = footprint(o), P = R.P;
  const l = P(o.x, o.y + d, o.z)[0], r = P(o.x + w, o.y, o.z)[0], t = P(o.x, o.y, o.z)[1], b = P(o.x + w, o.y + d, o.z)[1];
  /* the soft shadow leans toward +x, -y by up to a.h * (0.042, 0.024) tiles */
  const sx = a.h * 0.042, sy = a.h * 0.024, sh = [P(o.x + w + sx, o.y - sy, o.z), P(o.x + sx, o.y - sy, o.z), P(o.x + w + sx, o.y + d - sy, o.z)];
  return [Math.min(l, ...sh.map(p => p[0])) - 14, Math.min(t - a.h, ...sh.map(p => p[1])) - 30, Math.max(r, ...sh.map(p => p[0])) + 14, b + 10];
}
const hits = (b, c) => !c || (b[0] < c[2] && b[2] > c[0] && b[1] < c[3] && b[3] > c[1]);

/* repaint the clip rectangle (unscaled px), or everything when clip is null */
function paint(R, clip) {
  const { S, P, RT, RE, back, covered, objs, SC, opts, zOf, can } = R, NN = S * S;
  const g = can.getContext('2d');
  let dx = 0, dy = 0, dw = can.width, dh = can.height;
  if (clip) {
    dx = Math.max(0, Math.floor(clip[0] * SC)); dy = Math.max(0, Math.floor(clip[1] * SC));
    dw = Math.min(can.width, Math.ceil(clip[2] * SC)) - dx; dh = Math.min(can.height, Math.ceil(clip[3] * SC)) - dy;
    if (dw <= 0 || dh <= 0) return;
    /* widen the cull rect to the whole device pixels actually repainted */
    clip = [dx / SC, dy / SC, (dx + dw) / SC, (dy + dh) / SC];
  }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.beginPath(); g.rect(dx, dy, dw, dh); g.clip(); g.clearRect(dx, dy, dw, dh);
  g.setTransform(SC, 0, 0, SC, 0, 0); g.lineJoin = 'round'; g.lineCap = 'round';
  const poly = (pts, fill, lw) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); } };

  /* diorama slab under the map */
  const zb = -6 - BASE;
  poly([P(0, S, -6), P(S, S, -6), P(S, S, zb), P(0, S, zb)], '#8c6d4b', 1);
  poly([P(S, 0, -6), P(S, S, -6), P(S, S, zb), P(S, 0, zb)], '#6f553a', 1);
  g.strokeStyle = 'rgba(43,33,22,0.28)'; g.lineWidth = 0.8; g.beginPath();
  for (const k of [9, 17]) { const a = P(0, S, -6 - k), b = P(S, S, -6 - k), c = P(S, 0, -6 - k); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); }
  g.stroke();

  function drawTile(u) {
    const X = u % S, Y = (u / S) | 0, T = TERRAIN[RT[u]], z = zOf(u);
    const a = P(X, Y, z), b = P(X + 1, Y, z), c = P(X + 1, Y + 1, z), d = P(X, Y + 1, z);
    const zr = X + 1 < S ? zOf(u + 1) : -6, zl = Y + 1 < S ? zOf(u + S) : -6;
    if (zr < z) { poly([b, c, [c[0], c[1] + z - zr], [b[0], b[1] + z - zr]], T.side[1], 0.7); if (z - zr > EL) strata(b, c, z - zr); }
    if (zl < z) { poly([d, c, [c[0], c[1] + z - zl], [d[0], d[1] + z - zl]], T.side[0], 0.7); if (z - zl > EL) strata(d, c, z - zl); }
    const fs = rgbStr(hexRgb(T.top), 1 + 0.05 * (hrand(back[u], 3) - 0.5) + 0.04 * RE[u]);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fillStyle = fs; g.fill(); g.strokeStyle = fs; g.lineWidth = 0.6; g.stroke();
    if (opts.heights && !T.water) { g.save(); g.globalAlpha = 0.62; g.fillStyle = HEIGHT_RAMP[Math.min(HEIGHT_RAMP.length - 1, RE[u])]; g.fill(); g.restore(); }
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
  /* a storey's floor tile: its top in the floor's colours and marks, edges inked and a thin side where the floor stops */
  function drawSlab(L, u) {
    const f = R.FL[L], X = u % S, Y = (u / S) | 0, T = TERRAIN[f[u] - 1], z = R.zAt(u, L);
    const a = P(X, Y, z), b = P(X + 1, Y, z), c = P(X + 1, Y + 1, z), d = P(X, Y + 1, z), open = v => v < 0 || !f[v];
    const nR = X + 1 < S ? u + 1 : -1, nL = Y + 1 < S ? u + S : -1;
    if (open(nR)) poly([b, c, [c[0], c[1] + SLAB], [b[0], b[1] + SLAB]], T.side[1], 0.6);
    if (open(nL)) poly([d, c, [c[0], c[1] + SLAB], [d[0], d[1] + SLAB]], T.side[0], 0.6);
    const fs = rgbStr(hexRgb(T.top), 1 + 0.05 * (hrand(back[u], 3 + L) - 0.5));
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fillStyle = fs; g.fill(); g.strokeStyle = fs; g.lineWidth = 0.6; g.stroke();
    const t0 = back[u];
    if (opts.deco !== false) decorateTerrain(g, T.id, (fx, fy) => P(X + fx, Y + fy, z), hrand(t0 % S + L * 7, (t0 / S) | 0), t0 * 7919 + 13 + L * 101);
    if (opts.grid) { g.strokeStyle = 'rgba(43,33,22,0.16)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); let any = false;
    if (open(Y > 0 ? u - S : -1)) { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); any = true; }
    if (open(nR)) { g.moveTo(b[0], b[1]); g.lineTo(c[0], c[1]); any = true; }
    if (open(nL)) { g.moveTo(d[0], d[1]); g.lineTo(c[0], c[1]); any = true; }
    if (open(X > 0 ? u - 1 : -1)) { g.moveTo(a[0], a[1]); g.lineTo(d[0], d[1]); any = true; }
    if (any) g.stroke();
  }
  function strata(p, q, h) { g.strokeStyle = 'rgba(43,33,22,0.3)'; g.lineWidth = 0.5; g.beginPath(); for (let k = EL; k < h; k += EL) { g.moveTo(p[0], p[1] + k); g.lineTo(q[0], q[1] + k); } g.stroke(); }

  for (let s2 = 0; s2 <= 2 * S - 2; s2++) for (let X = Math.max(0, s2 - S + 1); X <= Math.min(S - 1, s2); X++) { const u = (s2 - X) * S + X; if (hits(tileBox(R, u), clip)) drawTile(u); }

  const near = objs.filter(o => hits(pieceBox(R, o), clip));
  /* soft shadows, merged on their own layer so overlaps do not darken, composited once */
  if (near.length) {
    const sh = document.createElement('canvas'); sh.width = dw; sh.height = dh;
    const sg = sh.getContext('2d'); sg.setTransform(SC, 0, 0, SC, -dx, -dy); sg.fillStyle = '#000';
    for (const o of near) {
      const a = ASSET_BY_ID[o.id], [w, d] = footprint(o), k = a.shade ?? (a.group === 'Nature' ? 0.3 : a.group === 'Props' ? 0.12 : 0.06);
      const pts = [[o.x + k, o.y + k], [o.x + w - k, o.y + k], [o.x + w - k, o.y + d - k], [o.x + k, o.y + d - k]];
      const all = pts.concat(pts.map(([x, y]) => [x + a.h * 0.042, y - a.h * 0.024]));
      sg.beginPath(); hull(all).forEach((p, j) => { const q = P(p[0], p[1], o.z); j ? sg.lineTo(q[0], q[1]) : sg.moveTo(q[0], q[1]); }); sg.closePath(); sg.fill();
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.2; g.drawImage(sh, dx, dy); g.restore();
    sh.width = sh.height = 1;
  }

  /* assets interleaved with raised tiles, back to front */
  const list = [];
  for (const o of near) { const [w, d] = footprint(o); list.push({ key: o.x + w / 2 + o.y + d / 2, pri: 1, o }); }
  for (let u = 0; u < NN; u++) if (RE[u] > 0 && !covered[u] && hits(tileBox(R, u), clip)) list.push({ key: (u % S) + ((u / S) | 0) + 1, lv: 0, pri: 0, u });
  /* upper floors: each floor tile is a thin slab, ordered with everything else on its spot and above the levels below */
  for (let L = 1; L < R.FL.length; L++) { const f = R.FL[L]; if (f) for (let u = 0; u < NN; u++) if (f[u] && hits(tileBox(R, u), clip)) list.push({ key: (u % S) + ((u / S) | 0) + 1, lv: L, pri: 0, slab: u }); }
  for (const it of list) if (it.o) it.lv = levelOf(it.o);
  list.sort((a, b) => a.key - b.key || a.lv - b.lv || a.pri - b.pri || (a.o && b.o ? a.o.k - b.o.k : 0));
  for (const it of list) {
    if (it.slab != null) { drawSlab(it.lv, it.slab); continue; }
    if (it.u != null) { drawTile(it.u); continue; }
    if (opts.dim === it.o.k) { g.save(); g.globalAlpha = 0.35; }
    drawAsset(g, P, it.o, it.o.z, R.clim);
    if (opts.dim === it.o.k) g.restore();
  }
  /* faint paper grain */
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = g.createPattern(GRAIN(), 'repeat'); g.fillRect(dx, dy, dw, dh);
  g.restore();
}

/* Mask of everything drawn in front of depth minKey inside clip (unscaled px): the pieces and raised tiles
   whose sort key (the same one paint() orders by) is minKey or more. Only its alpha matters; the editor
   uses it to cut a character away where the map stands in front of it, so the map image itself is never
   drawn again. Returns the canvas (at the map's scale) and the rectangle it covers. */
function frontMask(R, clip, minKey, level = 0) {
  /* the storeys above the figure also cover it on its own tile: a floor overhead hides whoever stands under it */
  const from = L => (L > level ? minKey - 0.5 : minKey);
  const { S, SC, P, RE, covered, zOf } = R, NN = S * S, can = document.createElement('canvas');
  can.width = Math.max(1, Math.ceil((clip[2] - clip[0]) * SC)); can.height = Math.max(1, Math.ceil((clip[3] - clip[1]) * SC));
  const g = can.getContext('2d'); g.setTransform(SC, 0, 0, SC, -clip[0] * SC, -clip[1] * SC); g.fillStyle = '#000';
  const quad = pts => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); g.fill(); };
  for (let u = 0; u < NN; u++) {
    const X = u % S, Y = (u / S) | 0; if (!RE[u] || covered[u] || X + Y + 1 < from(0) || !hits(tileBox(R, u), clip)) continue;
    const z = zOf(u), a = P(X, Y, z), b = P(X + 1, Y, z), c = P(X + 1, Y + 1, z), d = P(X, Y + 1, z), zr = X + 1 < S ? zOf(u + 1) : -6, zl = Y + 1 < S ? zOf(u + S) : -6;
    quad([a, b, c, d]);
    if (zr < z) quad([b, c, [c[0], c[1] + z - zr], [b[0], b[1] + z - zr]]);
    if (zl < z) quad([d, c, [c[0], c[1] + z - zl], [d[0], d[1] + z - zl]]);
  }
  for (let L = 1; L < R.FL.length; L++) {
    const f = R.FL[L]; if (!f) continue;
    for (let u = 0; u < NN; u++) {
      const X = u % S, Y = (u / S) | 0; if (!f[u] || X + Y + 1 < from(L) || !hits(tileBox(R, u), clip)) continue;
      const z = R.zAt(u, L), a = P(X, Y, z), b = P(X + 1, Y, z), c = P(X + 1, Y + 1, z), d = P(X, Y + 1, z);
      quad([a, b, c, d]); quad([b, c, [c[0], c[1] + SLAB], [b[0], b[1] + SLAB]]); quad([d, c, [c[0], c[1] + SLAB], [d[0], d[1] + SLAB]]);
    }
  }
  for (const o of R.objs) { const [w, d] = footprint(o); if (o.x + w / 2 + o.y + d / 2 >= from(levelOf(o)) && hits(pieceBox(R, o), clip)) drawAsset(g, P, o, o.z, R.clim); }
  return { can, x: clip[0], y: clip[1], w: clip[2] - clip[0], h: clip[3] - clip[1] };
}

/* Patch R to show M, leaving the repainted rectangle (unscaled px, or null) in R.patched. Returns
   false when only a full render will do (the size or climate changed), with R left untouched. */
function updateTiles(R, M) {
  if (M.S !== R.S || M.clim !== R.clim) return false;
  const S = R.S, NN = S * S, dirty = new Uint8Array(NN);
  const mark = u => { dirty[u] = 1; const X = u % S, Y = (u / S) | 0; if (X > 0) dirty[u - 1] = 1; if (X + 1 < S) dirty[u + 1] = 1; if (Y > 0) dirty[u - S] = 1; if (Y + 1 < S) dirty[u + S] = 1; };
  for (let t = 0; t < NN; t++) if (M.terr[t] !== R.terr[t] || M.elev[t] !== R.elev[t]) mark(R.rti(t));
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const a = M.floors && M.floors[L - 1], b = R.fl[L - 1]; if (!a && !b) continue;
    for (let t = 0; t < NN; t++) if ((a ? a[t] : 0) !== (b ? b[t] : 0) && L <= R.top) mark(R.rti(t));
  }
  /* pieces that came or went, as a multiset of their model-space keys */
  const left = new Map(); for (const o of R.objs) left.set(o.key, (left.get(o.key) || 0) + 1);
  const added = new Set();
  for (const key of pieceKeys(M.objs)) { const n = left.get(key) || 0; if (n) left.set(key, n - 1); else added.add(key); }
  const gone = new Set([...left].filter(([, n]) => n > 0).map(([key]) => key));
  const touches = o => { const [w, d] = footprint(o); for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) if (dirty[y * S + x]) return true; return false; };
  let box = null; const grow = b => { box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b.slice(); };
  /* everything the old picture showed in the changed area, with the old heights */
  const before = R.objs.filter(o => gone.has(o.key) || touches(o));
  for (const o of before) { const [w, d] = footprint(o); for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) mark(y * S + x); }
  for (let u = 0; u < NN; u++) if (dirty[u]) grow(tileBox(R, u));
  for (const o of before) grow(pieceBox(R, o));
  R.clim = M.clim; scene(R, M);
  /* ...and in the new picture, with the new heights */
  for (const o of R.objs) if (added.has(o.key) || touches(o)) { const [w, d] = footprint(o); for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) dirty[y * S + x] = 1; grow(pieceBox(R, o)); }
  for (let u = 0; u < NN; u++) if (dirty[u]) grow(tileBox(R, u));
  if (box) paint(R, box);
  R.patched = box;
  return true;
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

export { EL, HEIGHT_RAMP, SZ, THH, TWH, frontMask, layout, renderTiles, rotInst, thumb, updateTiles };
