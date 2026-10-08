import { TAU } from '../core/geometry.js';
import { GOLD, INK, castShadow } from '../render/palette.js';
import { foliage, makeBlob, mixHex, trunkStroke } from '../render/trees.js';
import { WALL_H, axisOf, flame, frame, glow, run } from './interior.js';
import { shade } from './kit.js';

/* ================= the East Asian set: halls, pagodas, gates, gardens and paddies =================
   Same contract as assets.js: footprint w×d (before turning), shadow height h, draw(K, o). Every piece
   carries a section (Buildings, Props, Plants, Interior), which is how the East Asia tab is laid out.
   Roofs are drawn by eaveRoof: hipped, half-hipped (hip and gable) or gabled, with eaves that sag
   between corners swept up at the ends. */
const TILE = ['#5f6a74', '#6f9a8c', '#c9a24f'], BARK = '#7d6a55', THATCH = '#b99b62';
const LACQ = '#b5503c', LACQ_D = '#8e3a2c', PLAST = '#f2ece0', TIMB = '#5e4430', WOOD = '#9a7650', WOOD_L = '#b48a58';
const PAPER = '#f6f0de', STONE = '#d0c8b4', STONE_D = '#b7ae98', BRONZE = '#6f7c66', PAINT = '#5f7b6e', LANTERN = '#c9553c', BAMBOO = '#c9b06a';
const pickv = (a, v) => a[Math.floor(v * a.length) % a.length];
const inset = (o, k) => [o.x0 + k, o.y0 + k, o.x1 - k, o.y1 - k];
const mid = o => [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2];
const doorWall = (o, x0, y0, x1, y1) => o.face === 0 ? ['y', y1, (x0 + x1) / 2] : o.face === 1 ? ['x', x1, (y0 + y1) / 2] : null;

/* a closed path through 3D points; an entry { c, p } is a quadratic curve to p with control point c */
function trace(K, pts) {
  const g = K.g; g.beginPath();
  pts.forEach((s, k) => {
    if (s.c) { const c = K.P(...s.c), p = K.P(...s.p); g.quadraticCurveTo(c[0], c[1], p[0], p[1]); return; }
    const p = K.P(...s); if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
  });
  g.closePath();
}
/* fill a traced face, stroke lines down its slope from eave point e(t) to ridge point r(t), then ink it */
function roofFace(K, pts, fill, lines, tex, col) {
  const g = K.g; trace(K, pts); g.fillStyle = fill; g.fill();
  if (lines) {
    g.save(); g.clip(); g.lineWidth = tex === 'thatch' ? 0.5 : 0.42; g.strokeStyle = tex === 'thatch' ? 'rgba(90,64,28,0.42)' : shade(col, 0.6); g.beginPath();
    const n = Math.max(4, Math.round(lines.len / (tex === 'thatch' ? 0.045 : 0.065)));
    for (let k = 0; k <= n; k++) { const t = k / n, a = K.P(...lines.e(t)), b = K.P(...lines.r(t)); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.stroke(); g.restore();
  }
  trace(K, pts); g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke();
}
/* Roof over x0..x1 × y0..y1 from eave height zt rising rh. hip is how much of each end is hipped: 1 a hipped
   roof (a pyramid when square), 0.5 hip and gable, 0 a gable. lift sweeps the eave corners up. The ridge runs
   along the longer side unless o.axis says otherwise. ends colours the ridge-end ornaments. */
function eaveRoof(K, x0, y0, x1, y1, zt, rh, col, o = {}) {
  const ov = o.ov ?? 0.16, L = o.lift ?? 2, tex = o.tex || 'tiles';
  x0 -= ov; y0 -= ov; x1 += ov; y1 += ov;
  const ax = o.axis || (x1 - x0 >= y1 - y0 ? 'x' : 'y');
  const [A0, A1, B0, B1] = ax === 'x' ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  const pt = (a, b, z) => (ax === 'x' ? [a, b, z] : [b, a, z]);
  const hd = (B1 - B0) / 2, bm = (B0 + B1) / 2, dl = Math.min(hd * (o.hip ?? 0.5), (A1 - A0) / 2), zb = zt + rh * dl / hd, zr = zt + rh;
  const C = (a, b) => pt(a, b, zt + L), Bk = (a, b) => pt(a, b, zb), R0 = pt(A0 + dl, bm, zr), R1 = pt(A1 - dl, bm, zr);
  const eave = (a0, b0, a1, b1) => ({ c: pt((a0 + a1) / 2, (b0 + b1) / 2, zt - L * 0.6), p: C(a1, b1) });
  const hipc = (a0, b0, a1, b1) => { const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2; return { c: pt(ca, cb, (zt + L + zb) / 2 - rh * 0.1), p: Bk(a1, b1) }; };
  const hipb = (a0, b0, a1, b1) => ({ c: pt((a0 + a1) / 2, (b0 + b1) / 2, (zt + L + zb) / 2 - rh * 0.1), p: C(a1, b1) });
  const side = (B, Bi, fill) => roofFace(K, [C(A0, B), eave(A0, B, A1, B), hipc(A1, B, A1 - dl, Bi), R1, R0, Bk(A0 + dl, Bi), hipb(A0 + dl, Bi, A0, B)], fill,
    { len: A1 - A0, e: t => pt(A0 + (A1 - A0) * t, B, zt), r: t => pt(A0 + (A1 - A0) * t, bm, zr) }, tex, col);
  const end = (A, Ai, fill) => { if (dl < 1e-3) return; roofFace(K, [C(A, B0), eave(A, B0, A, B1), hipc(A, B1, Ai, B1 - dl), Bk(Ai, B0 + dl), hipb(Ai, B0 + dl, A, B0)], fill,
    { len: B1 - B0, e: t => pt(A, B0 + (B1 - B0) * t, zt), r: t => pt(A + (Ai - A) * hd / dl, B0 + (B1 - B0) * t, zr) }, tex, col); };
  const gab = (A, fill) => { if (zr - zb < 0.3) return; K.face([Bk(A, B0 + dl), Bk(A, B1 - dl), pt(A, bm, zr)], fill, 0.6); };
  const lit = ax === 'x' ? [col, shade(col, 0.84)] : [shade(col, 0.86), col];
  side(B0, B0 + dl, shade(col, 0.7)); end(A0, A0 + dl, shade(col, 0.64));
  end(A1, A1 - dl, lit[1]); gab(A1 - dl, o.wood || shade(col, 0.9));
  side(B1, B1 - dl, lit[0]);
  /* the ridge, and ornaments curling up off its ends */
  const g = K.g, p = K.P(...R0), q = K.P(...R1);
  g.lineCap = 'round'; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke(); g.strokeStyle = o.ridge || shade(col, 0.75); g.lineWidth = 0.8; g.stroke();
  if (o.ends) for (const [e, s] of [[p, -1], [q, 1]]) { g.beginPath(); g.moveTo(e[0], e[1] + 0.5); g.quadraticCurveTo(e[0] - s * 0.5, e[1] - 3.2, e[0] + s * 1.6, e[1] - 3.4); g.quadraticCurveTo(e[0] + s * 0.4, e[1] - 1.8, e[0] + s * 1.2, e[1] + 0.4); g.closePath(); g.fillStyle = o.ends; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.45; g.stroke(); }
  return { top: K.P(...pt((A0 + A1) / 2, bm, zr)), zr };
}

/* ---------- walls ---------- */
const wallPt = (K, fc, c) => (a, z) => K.P(...(fc === 'y' ? [a, c, z] : [c, a, z]));
/* paper screens in a dark frame across a visible wall */
function shoji(K, fc, c, a0, a1, z0, z1, frameCol = TIMB) {
  K.onWall(fc, c, a0, a1, z0, z1, fc === 'y' ? PAPER : shade(PAPER, 0.88), 0.5);
  const g = K.g, pt = wallPt(K, fc, c), n = Math.max(2, Math.round((a1 - a0) / 0.07)), panels = Math.max(1, Math.round((a1 - a0) / 0.28));
  g.strokeStyle = shade(frameCol, 1.3); g.lineWidth = 0.3; g.beginPath();
  for (let k = 1; k < n; k++) { const a = a0 + (a1 - a0) * k / n, p = pt(a, z0), q = pt(a, z1); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
  for (let z = z0 + 1.3; z < z1 - 0.4; z += 1.3) { const p = pt(a0, z), q = pt(a1, z); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
  g.stroke(); g.strokeStyle = frameCol; g.lineWidth = 0.8; g.beginPath();
  for (let k = 0; k <= panels; k++) { const a = a0 + (a1 - a0) * k / panels, p = pt(a, z0), q = pt(a, z1); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
  for (const z of [z0 + 0.3, z1 - 0.2]) { const p = pt(a0, z), q = pt(a1, z); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
  g.stroke();
}
/* close-set vertical slats over a visible wall */
function slats(K, fc, c, a0, a1, z0, z1, col = TIMB, step = 0.05) {
  const g = K.g, pt = wallPt(K, fc, c); g.strokeStyle = col; g.lineWidth = 0.55; g.beginPath();
  for (let a = a0 + step / 2; a < a1; a += step) { const p = pt(a, z0), q = pt(a, z1); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
  g.stroke();
}
/* dark timber framing: posts at the ends and every so often, a sill and a lintel */
function frameWall(K, fc, c, a0, a1, z0, z1, col = TIMB) {
  const g = K.g, pt = wallPt(K, fc, c), n = Math.max(1, Math.round((a1 - a0) / 0.34)); g.strokeStyle = col; g.lineWidth = 1.1; g.beginPath();
  for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n, p = pt(a, z0), q = pt(a, z1); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
  for (const z of [z0 + 0.4, z1 - 0.5]) { const p = pt(a0, z), q = pt(a1, z); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
  g.stroke();
}
/* the visible walls of a block, both faces */
const bothWalls = (x0, y0, x1, y1, fn) => { fn('y', y1, x0, x1); fn('x', x1, y0, y1); };
/* round lacquered posts, drawn back to front */
function posts(K, pts, z0, z1, col = LACQ, r = 0.04) { pts.slice().sort((a, b) => a[0] + a[1] - b[0] - b[1]).forEach(([x, y]) => K.cyl(x, y, r, z0, z1, col, { lw: 0.45, noTop: true })); }
/* posts round the edge of a rectangle, n to a side */
function ring(x0, y0, x1, y1, n) { const out = []; for (let k = 0; k <= n; k++) { const f = k / n; out.push([x0 + (x1 - x0) * f, y0], [x0 + (x1 - x0) * f, y1]); if (k && k < n) out.push([x0, y0 + (y1 - y0) * f], [x1, y0 + (y1 - y0) * f]); } return out; }
const lantern = (g, x, y, s = 1, col = LANTERN) => {
  glow(g, x, y, 8 * s, 0.4);
  g.beginPath(); g.ellipse(x, y, 1.7 * s, 2.3 * s, 0, 0, TAU); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.45; g.stroke();
  g.strokeStyle = 'rgba(60,20,10,0.45)'; g.lineWidth = 0.3; g.beginPath(); for (const k of [-0.9, 0, 0.9]) { g.moveTo(x - 1.6 * s * Math.cos(k * 0.5), y + k * s); g.lineTo(x + 1.6 * s * Math.cos(k * 0.5), y + k * s); } g.stroke();
  g.fillStyle = '#2f271f'; g.fillRect(x - 0.9 * s, y - 2.7 * s, 1.8 * s, 0.7 * s); g.fillRect(x - 0.9 * s, y + 2 * s, 1.8 * s, 0.7 * s);
};

const BUILDINGS = [
  { id: 'minka', label: 'Thatched farmhouse', w: 2, d: 1, h: 26, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.18), z = o.z;
    K.box(x0, y0, x1, y1, z, z + 1, STONE_D, { lw: 0.5 });
    K.box(x0, y0, x1, y1, z + 1, z + 8, PLAST, { noTop: true });
    bothWalls(x0, y0, x1, y1, (fc, c, a0, a1) => frameWall(K, fc, c, a0, a1, z + 1, z + 8));
    const dw = doorWall(o, x0, y0, x1, y1);
    if (dw) { const [fc, c, m] = dw; K.onWall(fc, c, m - 0.2, m + 0.1, z + 1, z + 6.5, '#2f271f', 0.5); shoji(K, fc, c, m + 0.1, m + 0.4, z + 1, z + 6.5); }
    const r = eaveRoof(K, x0, y0, x1, y1, z + 8, 14, THATCH, { ov: 0.16, lift: 0.8, hip: 0.6, tex: 'thatch', wood: TIMB, ridge: '#4a3a2a', axis: o.axis });
    if (o.v > 0.4) K.smoke(r.top[0] + 2, r.top[1] - 1);
  } },
  { id: 'teahouse', label: 'Teahouse', w: 1, d: 1, h: 20, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.1), [wx0, wy0, wx1, wy1] = inset(o, 0.22), z = o.z, zf = z + 1.8;
    for (const [x, y] of [[x1 - 0.04, y1 - 0.04], [x0 + 0.04, y1 - 0.04], [x1 - 0.04, y0 + 0.04]]) K.box(x - 0.04, y - 0.04, x + 0.04, y + 0.04, z, zf - 0.5, STONE_D, { lw: 0.35 });
    K.box(x0, y0, x1, y1, zf - 0.5, zf, WOOD_L, { lw: 0.5, top: shade(WOOD_L, 1.04) });
    K.box(wx0, wy0, wx1, wy1, zf, zf + 6.8, PLAST, { noTop: true });
    bothWalls(wx0, wy0, wx1, wy1, (fc, c, a0, a1) => shoji(K, fc, c, a0, a1, zf, zf + 5.8));
    posts(K, [[x1 - 0.03, y1 - 0.03], [x0 + 0.03, y1 - 0.03], [x1 - 0.03, y0 + 0.03]], zf, zf + 6.8, WOOD, 0.025);
    eaveRoof(K, wx0, wy0, wx1, wy1, zf + 6.8, 7, o.v < 0.5 ? BARK : TILE[0], { ov: 0.15, lift: 1.4, hip: 0.5, wood: WOOD, axis: o.axis });
    if (o.v > 0.35) { const [lx, ly] = K.P(x1 - 0.05, y1 - 0.05, zf + 4.6); K.g.strokeStyle = INK; K.g.lineWidth = 0.4; K.g.beginPath(); K.g.moveTo(lx, ly - 2.5); K.g.lineTo(lx, ly - 1.4); K.g.stroke(); lantern(K.g, lx, ly + 1, 0.8); }
  } },
  { id: 'shophouse', label: 'Shophouse', w: 1, d: 1, h: 30, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.1), z = o.z, g = K.g, cloth = pickv(['#3f5a78', '#8e3a2c', '#5f7b6e'], o.v);
    K.box(x0, y0, x1, y1, z, z + 8.5, '#8a6a48', { noTop: true });
    const dw = doorWall(o, x0, y0, x1, y1);
    bothWalls(x0, y0, x1, y1, (fc, c, a0, a1) => {
      if (dw && dw[0] === fc) { const m = dw[2]; K.onWall(fc, c, m - 0.16, m + 0.16, z, z + 6.8, '#2f271f', 0.5); slats(K, fc, c, a0 + 0.04, m - 0.2, z + 0.5, z + 6.8); slats(K, fc, c, m + 0.2, a1 - 0.04, z + 0.5, z + 6.8);
        for (let k = 0; k < 3; k++) { const s = m - 0.16 + k * 0.107; K.onWall(fc, c + 0.005, s + 0.005, s + 0.1, z + 4.3, z + 6.9, fc === 'y' ? cloth : shade(cloth, 0.85), 0.35); } }
      else slats(K, fc, c, a0 + 0.04, a1 - 0.04, z + 0.5, z + 6.8);
      frameWall(K, fc, c, a0, a1, z, z + 8.5, '#4a3524');
    });
    /* a pent roof between the storeys along both visible faces */
    const zp = z + 9.4, ov = 0.16, pent = (pts, fill) => { K.face(pts, fill, 0.6); g.save(); K.path(pts.map(p => K.P(...p))); g.clip(); g.strokeStyle = shade(TILE[0], 0.6); g.lineWidth = 0.4; g.beginPath(); const a = pts[0], b = pts[1], c = pts[2], d = pts[3]; for (let k = 1; k < 12; k++) { const t = k / 12, p = K.P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2]), q = K.P(d[0] + (c[0] - d[0]) * t, d[1] + (c[1] - d[1]) * t, d[2]); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); } g.stroke(); g.restore(); };
    pent([[x1 + ov, y0 - 0.02, zp - 2], [x1 + ov, y1 + ov, zp - 2], [x1, y1, zp], [x1, y0 - 0.02, zp]], shade(TILE[0], 0.84));
    pent([[x0 - 0.02, y1 + ov, zp - 2], [x1 + ov, y1 + ov, zp - 2], [x1, y1, zp], [x0 - 0.02, y1, zp]], TILE[0]);
    K.box(x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, zp, zp + 7, PLAST, { noTop: true });
    bothWalls(x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, (fc, c, a0, a1) => { const m = (a0 + a1) / 2; K.onWall(fc, c, m - 0.18, m + 0.18, zp + 2, zp + 5, fc === 'y' ? '#8a6a48' : shade('#8a6a48', 0.85), 0.45); slats(K, fc, c, m - 0.17, m + 0.17, zp + 2, zp + 5, '#3a2a1c', 0.04); frameWall(K, fc, c, a0, a1, zp, zp + 7, '#4a3524'); });
    eaveRoof(K, x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, zp + 7, 8, TILE[0], { ov: 0.14, lift: 1.2, hip: 0, wood: PLAST, axis: o.axis === 'x' ? 'y' : 'x' });
    if (dw) for (const s of [-0.3, 0.3]) { const [lx, ly] = K.P(...(dw[0] === 'y' ? [dw[2] + s, dw[1] + 0.12, z + 8] : [dw[1] + 0.12, dw[2] + s, z + 8])); lantern(g, lx, ly, 0.75); }
  } },
  { id: 'hall', label: 'Temple hall', w: 2, d: 2, h: 44, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.08), z = o.z, zc = z + 3, roof = pickv([TILE[0], TILE[0], TILE[1], TILE[2]], o.v);
    K.box(x0, y0, x1, y1, z, zc, STONE); K.courses('y', y1, x0, x1, z, zc, 'rgba(70,55,35,0.22)'); K.courses('x', x1, y0, y1, z, zc, 'rgba(70,55,35,0.22)');
    const dw = doorWall(o, x0, y0, x1, y1);
    if (dw) for (let k = 0; k < 3; k++) { const [fc, c, m] = dw, w = 0.42 - k * 0.04, e = 0.18 - k * 0.06; if (fc === 'y') K.box(m - w, c, m + w, c + e, z, z + (k + 1), STONE_D, { lw: 0.4 }); else K.box(c, m - w, c + e, m + w, z, z + (k + 1), STONE_D, { lw: 0.4 }); }
    const [ix0, iy0, ix1, iy1] = inset(o, 0.42);
    K.box(ix0, iy0, ix1, iy1, zc, zc + 12, '#8a5a3a', { noTop: true });
    bothWalls(ix0, iy0, ix1, iy1, (fc, c, a0, a1) => { shoji(K, fc, c, a0 + 0.05, a1 - 0.05, zc + 0.6, zc + 10, '#6b3a2a'); K.onWall(fc, c, a0, a1, zc + 10, zc + 12, fc === 'y' ? PLAST : shade(PLAST, 0.86), 0.4); });
    const [px0, py0, px1, py1] = inset(o, 0.24);
    posts(K, ring(px0, py0, px1, py1, 3).filter(([x, y]) => x > px0 + 0.01 || y > py0 + 0.01), zc, zc + 12, LACQ, 0.05);
    K.box(px0 - 0.03, py0 - 0.03, px1 + 0.03, py1 + 0.03, zc + 12, zc + 14, PAINT, { lw: 0.5, top: shade(PAINT, 0.9) });
    bothWalls(px0 - 0.03, py0 - 0.03, px1 + 0.03, py1 + 0.03, (fc, c, a0, a1) => { const pt = wallPt(K, fc, c), g = K.g; g.fillStyle = GOLD; for (let a = a0 + 0.12; a < a1 - 0.05; a += 0.24) { const p = pt(a, zc + 13); g.fillRect(p[0] - 1, p[1] - 0.6, 2, 1.2); } });
    eaveRoof(K, px0 - 0.03, py0 - 0.03, px1 + 0.03, py1 + 0.03, zc + 14, 17, roof, { ov: 0.3, lift: 3.4, hip: 0.5, wood: LACQ_D, ends: roof === TILE[2] ? '#8a6a2a' : GOLD, axis: o.axis });
  } },
  { id: 'pagoda', label: 'Pagoda', w: 1, d: 1, h: 64, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g, roof = o.v < 0.6 ? TILE[0] : TILE[1];
    K.box(cx - 0.4, cy - 0.4, cx + 0.4, cy + 0.4, z, z + 2, STONE); let zz = z + 2;
    for (let k = 0; k < 5; k++) {
      const s = 0.27 - k * 0.032, wh = k ? 4.2 : 5.5;
      K.box(cx - s, cy - s, cx + s, cy + s, zz, zz + wh, PLAST, { noTop: true });
      bothWalls(cx - s, cy - s, cx + s, cy + s, (fc, c, a0, a1) => { for (const a of [a0 + 0.02, (a0 + a1) / 2 - 0.12, (a0 + a1) / 2 + 0.12, a1 - 0.02]) K.onWall(fc, c, a - 0.022, a + 0.022, zz, zz + wh, fc === 'y' ? LACQ : LACQ_D, 0); K.onWall(fc, c, (a0 + a1) / 2 - 0.08, (a0 + a1) / 2 + 0.08, zz + 0.4, zz + wh - 0.8, fc === 'y' ? '#7a3a2a' : '#5e2c22', 0.35); });
      zz += wh; eaveRoof(K, cx - s, cy - s, cx + s, cy + s, zz, 3.4, roof, { ov: 0.17 - k * 0.01, lift: 1.7, hip: 1 }); zz += 2.4;
    }
    /* the finial: a mast of rings over a dew basin, a jewel at the top */
    const [bx, by] = K.P(cx, cy, zz + 0.6);
    g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - 16); g.stroke(); g.strokeStyle = BRONZE; g.lineWidth = 0.9; g.stroke();
    for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(bx, by - 3 - k * 1.6, 1.8 - k * 0.1, 0.6, 0, 0, TAU); g.fillStyle = BRONZE; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); }
    g.beginPath(); g.arc(bx, by - 17, 1.2, 0, TAU); g.fillStyle = GOLD; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke();
  } },
  { id: 'castle', label: 'Castle keep', w: 2, d: 2, h: 66, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.06), z = o.z, b = 0.18, zt = z + 11, g = K.g;
    /* a battered stone base: its walls lean in as they rise */
    const front = [[x0, y1, z], [x1, y1, z], [x1 - b, y1 - b, zt], [x0 + b, y1 - b, zt]], right = [[x1, y0, z], [x1, y1, z], [x1 - b, y1 - b, zt], [x1 - b, y0 + b, zt]];
    for (const [pts, col] of [[right, shade(STONE_D, 0.8)], [front, STONE_D]]) { K.face(pts, col, 0.7); g.save(); K.path(pts.map(p => K.P(...p))); g.clip(); g.strokeStyle = 'rgba(60,48,32,0.35)'; g.lineWidth = 0.45; g.beginPath(); for (let k = 1; k < 5; k++) { const f = k / 5, zz = z + (zt - z) * f, e = b * f, a = pts === front ? K.P(x0 + e, y1 - e, zz) : K.P(x1 - e, y0 + e, zz), c = pts === front ? K.P(x1 - e, y1 - e, zz) : K.P(x1 - e, y1 - e, zz); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); for (let s = 0.08 + (k % 2) * 0.1; s < 1; s += 0.2) { const p = [a[0] + (c[0] - a[0]) * s, a[1] + (c[1] - a[1]) * s]; g.moveTo(p[0], p[1]); g.lineTo(p[0], p[1] + (zt - z) / 5); } } g.stroke(); g.restore(); }
    K.face([[x0 + b, y0 + b, zt], [x1 - b, y0 + b, zt], [x1 - b, y1 - b, zt], [x0 + b, y1 - b, zt]], shade(STONE, 0.95), 0.6);
    /* white storeys, each under its own skirt of roof, smaller as they climb */
    let zz = zt;
    const tiers = [[0.3, 9, 5], [0.48, 8, 4.5], [0.62, 7, 0]];
    tiers.forEach(([k, h, rh], i) => {
      const [sx0, sy0, sx1, sy1] = inset(o, k);
      K.box(sx0, sy0, sx1, sy1, zz, zz + h, PLAST, { noTop: true });
      bothWalls(sx0, sy0, sx1, sy1, (fc, c, a0, a1) => { K.onWall(fc, c, a0, a1, zz, zz + 1.4, fc === 'y' ? '#4a4440' : '#3a3532', 0.3); K.windows(fc, c, a0, a1, zz + h * 0.42, Math.max(2, Math.round((a1 - a0) / 0.3)), '#2f271f', h * 0.32, 0.09); });
      zz += h;
      if (rh) {
        const sk = inset(o, k - 0.02); eaveRoof(K, sk[0], sk[1], sk[2], sk[3], zz, rh, TILE[0], { ov: 0.16, lift: 1.6, hip: 1 });
        /* a little gable dormer facing out of the lower roofs */
        const m = i === 0 ? 'y' : 'x', [ga, gb] = m === 'y' ? [(sk[0] + sk[2]) / 2, sk[3] + 0.08] : [sk[2] + 0.08, (sk[1] + sk[3]) / 2];
        K.face(m === 'y' ? [[ga - 0.2, gb, zz + 0.4], [ga + 0.2, gb, zz + 0.4], [ga, gb, zz + 3.8]] : [[ga, gb - 0.2, zz + 0.4], [ga, gb + 0.2, zz + 0.4], [ga, gb, zz + 3.8]], m === 'y' ? PLAST : shade(PLAST, 0.86), 0.6);
        zz += rh * 0.55;
      }
    });
    const [tx0, ty0, tx1, ty1] = inset(o, 0.62);
    eaveRoof(K, tx0, ty0, tx1, ty1, zz, 9, TILE[0], { ov: 0.2, lift: 2.2, hip: 0.5, wood: PLAST, ends: GOLD, axis: o.axis });
  } },
  { id: 'courtyard', label: 'Courtyard house', w: 2, d: 2, h: 28, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.08), z = o.z, brick = '#b9b6ac', t = 0.08, wh = 6.5, g = K.g;
    const cap = (bx0, by0, bx1, by1) => { K.box(bx0, by0, bx1, by1, z, z + wh, brick, { top: shade(brick, 0.9) }); K.hip(bx0 - 0.03, by0 - 0.03, bx1 + 0.03, by1 + 0.03, z + wh, 1.6, TILE[0], { ov: 0.02 }); };
    /* the courtyard itself, paved in grey brick with a tree in a planter */
    K.face([[x0, y0, z + 0.05], [x1, y0, z + 0.05], [x1, y1, z + 0.05], [x0, y1, z + 0.05]], '#c7c3b8', 0);
    cap(x0, y0, x1, y0 + t); cap(x0, y0 + t, x0 + t, y1);
    /* the main hall across the back, a wing down one side */
    const hall = (hx0, hy0, hx1, hy1, ax) => { K.box(hx0, hy0, hx1, hy1, z, z + 7.5, LACQ_D, { noTop: true }); bothWalls(hx0, hy0, hx1, hy1, (fc, c, a0, a1) => shoji(K, fc, c, a0 + 0.04, a1 - 0.04, z + 0.6, z + 6.6, '#5e2c22')); eaveRoof(K, hx0, hy0, hx1, hy1, z + 7.5, 7, TILE[0], { ov: 0.12, lift: 1.4, hip: 0, wood: shade(PLAST, 0.95), axis: ax }); };
    hall(x0 + 0.14, y0 + 0.14, x1 - 0.14, y0 + 0.66, 'x');
    hall(x0 + 0.14, y0 + 0.8, x0 + 0.58, y1 - 0.4, 'y');
    const [tx, ty] = [x1 - 0.55, y1 - 0.62]; K.box(tx - 0.12, ty - 0.12, tx + 0.12, ty + 0.12, z, z + 1.2, STONE, { lw: 0.4 });
    const [px, py] = K.P(tx, ty, z + 1.2); trunkStroke(g, px, py, 5, 0.6, false, 0.7); foliage(g, [makeBlob(px - 2.5, py - 8, 4, 3.3, o.r, 7), makeBlob(px + 2.5, py - 9, 4, 3.3, o.r, 7), makeBlob(px, py - 11, 4.2, 3.4, o.r, 7)], o.v < 0.5 ? SAKURA : PINE, o.r, { lw: 0.4, detail: false });
    /* front walls, with the gate in the one the door faces */
    const gate = o.face === 1 ? 'x' : 'y';
    if (gate === 'x') { cap(x1 - t, y0 + t, x1, y0 + 0.75); cap(x1 - t, y0 + 1.15, x1, y1); cap(x0 + t, y1 - t, x1 - t, y1); }
    else { cap(x0 + t, y1 - t, x0 + 0.75, y1); cap(x0 + 1.15, y1 - t, x1 - t, y1); cap(x1 - t, y0 + t, x1, y1); }
    const gr = gate === 'x' ? [x1 - 0.12, y0 + 0.72, x1 + 0.04, y0 + 1.18] : [x0 + 0.72, y1 - 0.12, x0 + 1.18, y1 + 0.04];
    K.box(gr[0], gr[1], gr[2], gr[3], z, z + 8, LACQ, { noTop: true }); K.onWall(gate, gate === 'x' ? gr[2] : gr[3], (gate === 'x' ? gr[1] : gr[0]) + 0.1, (gate === 'x' ? gr[3] : gr[2]) - 0.1, z, z + 6.4, '#4a2a20', 0.45);
    eaveRoof(K, gr[0], gr[1], gr[2], gr[3], z + 8, 3.5, TILE[0], { ov: 0.1, lift: 1.2, hip: 0, axis: gate === 'x' ? 'y' : 'x', wood: PLAST });
  } },
  { id: 'bellhouse', label: 'Bell pavilion', w: 1, d: 1, h: 30, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.12), [px0, py0, px1, py1] = inset(o, 0.24), z = o.z, g = K.g;
    K.box(x0, y0, x1, y1, z, z + 2.4, STONE); K.courses('y', y1, x0, x1, z, z + 2.4, 'rgba(70,55,35,0.25)');
    posts(K, [[px0, py0], [px1, py0], [px0, py1]], z + 2.4, z + 17, LACQ, 0.04);
    K.box(px0, py0, px1, py1, z + 16, z + 17, LACQ_D, { lw: 0.5, noTop: true });
    const [cx, cy] = mid(o), [bx, by] = K.P(cx, cy, z + 11.5), [, ry] = K.P(cx, cy, z + 16);
    g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); g.moveTo(bx, ry); g.lineTo(bx, by + 1.2); g.stroke();
    const gr = g.createLinearGradient(bx - 4, 0, bx + 4, 0); gr.addColorStop(0, '#9aa88e'); gr.addColorStop(0.5, BRONZE); gr.addColorStop(1, '#4f5a48');
    g.beginPath(); g.moveTo(bx - 2.6, by + 1.2); g.quadraticCurveTo(bx - 3.2, by + 5, bx - 3.6, by + 8.4); g.quadraticCurveTo(bx, by + 9.6, bx + 3.6, by + 8.4); g.quadraticCurveTo(bx + 3.2, by + 5, bx + 2.6, by + 1.2); g.quadraticCurveTo(bx, by + 0.2, bx - 2.6, by + 1.2); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.55; g.stroke();
    g.strokeStyle = 'rgba(40,50,35,0.55)'; g.lineWidth = 0.4; g.beginPath(); for (const k of [3.4, 6.4]) { g.moveTo(bx - 3.1, by + k); g.quadraticCurveTo(bx, by + k + 0.8, bx + 3.1, by + k); } g.stroke();
    /* the striking log on its ropes */
    g.strokeStyle = INK; g.lineWidth = 0.35; g.beginPath(); g.moveTo(bx + 5, by - 0.6); g.lineTo(bx + 5, by + 4.6); g.moveTo(bx + 9, by - 2.6); g.lineTo(bx + 9, by + 2.6); g.stroke();
    g.lineCap = 'round'; g.beginPath(); g.moveTo(bx + 4.4, by + 5); g.lineTo(bx + 9.6, by + 2.4); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke(); g.strokeStyle = WOOD_L; g.lineWidth = 1.2; g.stroke();
    posts(K, [[px1, py1]], z + 2.4, z + 17, LACQ, 0.04);
    eaveRoof(K, px0, py0, px1, py1, z + 17, 7, TILE[0], { ov: 0.14, lift: 2, hip: 0.5, wood: LACQ_D, ends: GOLD, axis: o.axis });
  } },
  { id: 'pavilion', label: 'Garden pavilion', w: 1, d: 1, h: 22, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.14), [px0, py0, px1, py1] = inset(o, 0.22), z = o.z, g = K.g;
    K.box(x0, y0, x1, y1, z, z + 1.6, STONE, { top: shade(STONE, 1.04) });
    posts(K, [[px0, py0], [px1, py0], [px0, py1]], z + 1.6, z + 11, LACQ, 0.03);
    /* low rails between the front posts, open on the side the piece faces */
    const rail = (a, b) => { K.seg([...a, z + 4.2], [...b, z + 4.2], INK, 1.3); K.seg([...a, z + 4.2], [...b, z + 4.2], LACQ, 0.6); };
    if (o.face !== 1) rail([px1, py0], [px1, py1]); if (o.face !== 0) rail([px0, py1], [px1, py1]);
    posts(K, [[px1, py1]], z + 1.6, z + 11, LACQ, 0.03);
    const r = eaveRoof(K, px0, py0, px1, py1, z + 11, 7.5, o.v < 0.5 ? TILE[1] : TILE[0], { ov: 0.2, lift: 2.2, hip: 1 });
    g.beginPath(); g.arc(r.top[0], r.top[1] - 1.5, 1.3, 0, TAU); g.fillStyle = GOLD; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke();
  } },
  /* an archway of four posts and three openings under tiled caps; people walk through it */
  { id: 'paifang', label: 'Memorial archway', w: 3, d: 1, h: 30, walk: true, draw(K, o) {
    const ax = o.axis === 'x', z = o.z, x0 = o.x0, y0 = o.y0, stone = o.v < 0.5, col = stone ? STONE : LACQ;
    const at = (a, b) => (ax ? [x0 + a, y0 + b] : [x0 + b, y0 + a]);
    const span = (a0, a1, b0, b1) => { const p = at(a0, b0), q = at(a1, b1); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
    const ps = [0.2, 1.05, 1.95, 2.8];
    for (const a of ps) { const [x, y] = at(a, 0.5); K.box(x - 0.1, y - 0.1, x + 0.1, y + 0.1, z, z + 1.5, STONE_D, { lw: 0.4 }); }
    for (const a of ps) { const [x, y] = at(a, 0.5), hi = a > 1 && a < 2; K.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, z + 1.5, z + (hi ? 17 : 13.5), col, { lw: 0.45 }); }
    const beam = (a0, a1, z0, z1, c = col) => K.box(...span(a0, a1, 0.44, 0.56), z + z0, z + z1, c, { lw: 0.45 });
    beam(0.12, 1.13, 10.5, 11.5); beam(1.87, 2.88, 10.5, 11.5); beam(1, 2, 13, 14.4); beam(1, 2, 16, 17.2);
    const pl = span(1.3, 1.7, 0.56, 0.57); K.box(pl[0], pl[1], pl[2], pl[3], z + 14.4, z + 16, PAINT, { lw: 0.4 });
    const fc = ax ? 'y' : 'x', pc = ax ? pl[3] : pl[2], pa = ax ? [pl[0], pl[2]] : [pl[1], pl[3]];
    K.onWall(fc, pc + 0.002, pa[0] + 0.04, pa[1] - 0.04, z + 14.7, z + 15.7, GOLD, 0.3);
    const cap = (a0, a1, zz, rh) => { const r = span(a0, a1, 0.4, 0.6); eaveRoof(K, ...r, z + zz, rh, TILE[0], { ov: 0.1, lift: 1.4, hip: 0.5, wood: col, ends: GOLD, axis: ax ? 'x' : 'y' }); };
    cap(0.08, 1.12, 13.5, 3.2); cap(1.88, 2.92, 13.5, 3.2); cap(0.95, 2.05, 17.2, 4);
  } }
];

/* ---------- props ---------- */
const rope = (g, a, b, sag, col = INK, lw = 0.4) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag, b[0], b[1]); g.stroke(); };
const along = (o, a, b) => { const ax = o.face % 2 === 0; return ax ? [o.x0 + a, o.y0 + b] : [o.x0 + b, o.y0 + a]; };
const stoneBlob = (K, x, y, z, rx, h, col = '#bdb39d') => { const [px, py] = K.P(x, y, z), g = K.g; g.beginPath(); g.moveTo(px - rx, py); g.quadraticCurveTo(px - rx, py - h, px - rx * 0.1, py - h); g.quadraticCurveTo(px + rx, py - h * 0.9, px + rx, py); g.quadraticCurveTo(px, py + rx * 0.35, px - rx, py); g.closePath(); g.fillStyle = col; g.fill(); g.save(); g.clip(); g.fillStyle = 'rgba(60,50,35,0.22)'; g.fillRect(px + rx * 0.15, py - h - 2, rx * 2, h + 4); g.restore(); g.strokeStyle = INK; g.lineWidth = 0.55; g.stroke(); };

const PROPS = [
  /* two posts under a double lintel, spanning the path through the tile; people walk through it */
  { id: 'torii', label: 'Shrine gate', w: 1, d: 1, h: 20, walk: true, draw(K, o) {
    const ax = o.face % 2 === 0, z = o.z, g = K.g, [cx, cy] = mid(o);
    const at = a => (ax ? [o.x0 + a, cy] : [cx, o.y0 + a]);
    const [p0, p1] = [at(0.2), at(0.8)].sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [x, y] of [p0, p1]) { K.cyl(x, y, 0.055, z, z + 1.6, '#2f2a28', { lw: 0.45 }); K.cyl(x, y, 0.045, z + 1.6, z + 15, LACQ, { lw: 0.5, noTop: true }); }
    const bar = (a0, a1, z0, z1, col, t = 0.035) => { const p = at(a0), q = at(a1); K.box(Math.min(p[0], q[0]) - (ax ? 0 : t), Math.min(p[1], q[1]) - (ax ? t : 0), Math.max(p[0], q[0]) + (ax ? 0 : t), Math.max(p[1], q[1]) + (ax ? t : 0), z + z0, z + z1, col, { lw: 0.45 }); };
    bar(0.08, 0.92, 11, 12, LACQ);
    bar(0.46, 0.54, 12, 14.2, LACQ_D);
    bar(0.02, 0.98, 14.2, 15.2, LACQ, 0.045);
    /* the top lintel, black, its ends swept up */
    bar(-0.06, 1.06, 15.2, 16.4, '#2f2a28', 0.05);
    for (const [e, k] of [[at(-0.06), -1], [at(1.06), 1]]) { const p = K.P(e[0], e[1], z + 16.4), q = K.P(e[0], e[1], z + 15.2), d = ax ? k : -k; g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] + d * 1.4, p[1] - 0.4, p[0] + d * 2, p[1] - 2); g.quadraticCurveTo(q[0] + d * 0.8, q[1] - 1, q[0], q[1]); g.closePath(); g.fillStyle = '#2f2a28'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.45; g.stroke(); }
  } },
  { id: 'stonelantern', label: 'Stone lantern', w: 1, d: 1, h: 14, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g;
    K.box(cx - 0.17, cy - 0.17, cx + 0.17, cy + 0.17, z, z + 1, STONE_D, { lw: 0.45 });
    K.cyl(cx, cy, 0.055, z + 1, z + 5.2, STONE, { lw: 0.45 });
    K.box(cx - 0.13, cy - 0.13, cx + 0.13, cy + 0.13, z + 5.2, z + 6.2, STONE, { lw: 0.45 });
    K.box(cx - 0.09, cy - 0.09, cx + 0.09, cy + 0.09, z + 6.2, z + 9, STONE_D, { lw: 0.45, noTop: true });
    const [lx, ly] = K.P(cx, cy + 0.09, z + 7.6); glow(g, lx, ly, 9, 0.5); K.onWall('y', cy + 0.09, cx - 0.05, cx + 0.05, z + 6.8, z + 8.4, '#f4c460', 0.35); K.onWall('x', cx + 0.09, cy - 0.05, cy + 0.05, z + 6.8, z + 8.4, '#e0a84a', 0.35);
    const r = eaveRoof(K, cx - 0.12, cy - 0.12, cx + 0.12, cy + 0.12, z + 9, 2.6, STONE, { ov: 0.08, lift: 1.1, hip: 1, ridge: STONE_D });
    g.beginPath(); g.arc(r.top[0], r.top[1] - 1.1, 1.1, 0, TAU); g.fillStyle = STONE; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.45; g.stroke();
  } },
  { id: 'lanterns', label: 'Paper lanterns', w: 1, d: 1, h: 13, draw(K, o) {
    const z = o.z, g = K.g, a = along(o, 0.08, 0.5), b = along(o, 0.92, 0.5);
    for (const [x, y] of [a, b]) K.box(x - 0.025, y - 0.025, x + 0.025, y + 0.025, z, z + 11, TIMB, { lw: 0.4 });
    const pa = K.P(a[0], a[1], z + 10.6), pb = K.P(b[0], b[1], z + 10.6); rope(g, pa, pb, 3);
    const cols = pickv([[LANTERN, LANTERN, LANTERN], ['#d9a54a', LANTERN, '#d9a54a'], [PAPER, LANTERN, PAPER]], o.v);
    for (let k = 0; k < 3; k++) { const t = (k + 1) / 4, x = pa[0] + (pb[0] - pa[0]) * t, y = pa[1] + (pb[1] - pa[1]) * t + 3 * 2 * t * (1 - t) * 2 - 0.4; g.strokeStyle = INK; g.lineWidth = 0.35; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 1.2); g.stroke(); lantern(g, x, y + 3.6, 0.85, cols[k]); }
  } },
  { id: 'incense', label: 'Incense burner', w: 1, d: 1, h: 10, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g;
    K.box(cx - 0.22, cy - 0.22, cx + 0.22, cy + 0.22, z, z + 1, STONE, { lw: 0.45 });
    for (const [dx, dy] of [[-0.09, -0.06], [0.09, -0.06], [0, 0.1]]) K.box(cx + dx - 0.02, cy + dy - 0.02, cx + dx + 0.02, cy + dy + 0.02, z + 1, z + 2.6, '#4f5a48', { lw: 0.35, noTop: true });
    const c = K.cyl(cx, cy, 0.15, z + 2.6, z + 5.6, BRONZE, { lw: 0.5, top: '#d8cfb2' });
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(c.x + s * (c.rx + 0.4), c.ty - 0.8, 0.9, 1.4, 0, 0, TAU); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke(); g.strokeStyle = BRONZE; g.lineWidth = 0.5; g.stroke(); }
    g.strokeStyle = '#8a3a2a'; g.lineWidth = 0.5; g.beginPath(); for (const dx of [-1.2, 0, 1.2]) { g.moveTo(c.x + dx, c.ty); g.lineTo(c.x + dx * 1.2, c.ty - 4); } g.stroke();
    g.fillStyle = '#f4b545'; for (const dx of [-1.2, 0, 1.2]) g.fillRect(c.x + dx * 1.2 - 0.3, c.ty - 4.4, 0.6, 0.6);
    g.strokeStyle = 'rgba(225,220,210,0.7)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(c.x, c.ty - 4.6); g.bezierCurveTo(c.x - 3, c.ty - 7, c.x + 3, c.ty - 9, c.x - 1, c.ty - 13); g.moveTo(c.x + 1.4, c.ty - 4.6); g.bezierCurveTo(c.x + 4, c.ty - 7, c.x, c.ty - 9, c.x + 2.5, c.ty - 12); g.stroke();
  } },
  { id: 'lions', label: 'Guardian lions', w: 1, d: 1, h: 10, draw(K, o) {
    const z = o.z, g = K.g, col = o.v < 0.5 ? '#c9c2b0' : BRONZE;
    const spots = [along(o, 0.2, 0.55), along(o, 0.8, 0.55)].sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [x, y] of spots) {
      K.box(x - 0.11, y - 0.11, x + 0.11, y + 0.11, z, z + 2.6, STONE_D, { lw: 0.45 });
      const [px, py] = K.P(x, y, z + 2.6);
      g.beginPath(); g.moveTo(px - 2.6, py); g.quadraticCurveTo(px - 3, py - 4, px - 1.4, py - 5); g.lineTo(px + 1.8, py - 4.4); g.quadraticCurveTo(px + 2.8, py - 2, px + 2.6, py); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
      g.beginPath(); g.arc(px - 0.4, py - 6.2, 2.2, 0, TAU); g.fillStyle = col; g.fill(); g.stroke();
      g.fillStyle = shade(col, 0.7); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.arc(px - 0.4 + Math.cos(a) * 1.9, py - 6.2 + Math.sin(a) * 1.9, 0.55, 0, TAU); g.fill(); }
      g.fillStyle = INK; g.fillRect(px - 1.3, py - 6.8, 0.6, 0.6); g.fillRect(px + 0.1, py - 6.8, 0.6, 0.6);
    }
  } },
  { id: 'ricebales', label: 'Rice bales', w: 1, d: 1, h: 7, draw(K, o) {
    const [cx, cy] = mid(o), g = K.g, ax = o.face % 2 === 0;
    for (const [s, dz] of [[-0.13, 0], [0.13, 0], [0, 2.9]]) {
      const a = ax ? [cx - 0.24, cy + s, o.z + 1.6 + dz] : [cx + s, cy - 0.24, o.z + 1.6 + dz], b = ax ? [cx + 0.24, cy + s, o.z + 1.6 + dz] : [cx + s, cy + 0.24, o.z + 1.6 + dz];
      const p = K.P(...a), q = K.P(...b); g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 4.4; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); g.strokeStyle = THATCH; g.lineWidth = 3.4; g.stroke();
      g.strokeStyle = '#7a5a3a'; g.lineWidth = 0.6; g.beginPath(); for (const t of [0.25, 0.5, 0.75]) { const m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; g.moveTo(m[0], m[1] - 1.8); g.lineTo(m[0], m[1] + 1.8); } g.stroke();
      g.beginPath(); g.ellipse(q[0], q[1], 1.5, 1.8, 0, 0, TAU); g.fillStyle = '#d9bf7a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke();
    }
  } },
  { id: 'bamboofence', label: 'Bamboo fence', w: 1, d: 1, h: 6, draw(K, o) {
    const z = o.z, g = K.g, ax = o.face % 2 === 0, c = ax ? (o.face === 0 ? o.y1 - 0.08 : o.y0 + 0.08) : (o.face === 1 ? o.x1 - 0.08 : o.x0 + 0.08);
    const pt = (a, zz) => K.P(...(ax ? [a, c, zz] : [c, a, zz])), a0 = ax ? o.x0 : o.y0, a1 = ax ? o.x1 : o.y1;
    const stroke = (lines, w, col) => { g.lineCap = 'round'; g.beginPath(); for (const [a, b] of lines) { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } g.strokeStyle = INK; g.lineWidth = w + 0.8; g.stroke(); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
    const verts = []; for (let k = 0; k <= 6; k++) { const a = a0 + 0.04 + (a1 - a0 - 0.08) * k / 6; verts.push([pt(a, z), pt(a, z + 5)]); }
    stroke(verts, 0.7, BAMBOO);
    stroke([[pt(a0, z + 1.6), pt(a1, z + 1.6)], [pt(a0, z + 3.6), pt(a1, z + 3.6)]], 0.9, shade(BAMBOO, 0.9));
    stroke([[pt(a0 + 0.02, z), pt(a0 + 0.02, z + 5.8)], [pt(a1 - 0.02, z), pt(a1 - 0.02, z + 5.8)]], 1.4, shade(BAMBOO, 0.8));
    g.fillStyle = '#2f271f'; for (const k of [1, 3, 5]) for (const zz of [1.6, 3.6]) { const p = pt(a0 + 0.04 + (a1 - a0 - 0.08) * k / 6, z + zz); g.fillRect(p[0] - 0.5, p[1] - 0.5, 1, 1); }
  } },
  { id: 'waterbasin', label: 'Stone basin', w: 1, d: 1, h: 7, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g;
    stoneBlob(K, cx - 0.28, cy + 0.05, z, 2.2, 2, '#b3aa96'); stoneBlob(K, cx + 0.05, cy - 0.3, z, 1.8, 1.6, '#a59a85');
    const c = K.cyl(cx, cy, 0.17, z, z + 2.6, '#bdb39d', { lw: 0.5, top: '#8eb0ab' });
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.4; g.beginPath(); g.ellipse(c.x, c.ty, c.rx * 0.5, c.ry * 0.5, 0, 0, TAU); g.stroke();
    /* a bamboo pipe on a post, dripping into it */
    const [qx, qy] = K.P(cx - 0.3, cy - 0.3, z);
    g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx, qy - 7); g.lineTo(c.x - 1, c.ty - 3.4); g.stroke(); g.strokeStyle = '#8fae5a'; g.lineWidth = 1.1; g.stroke();
    g.strokeStyle = 'rgba(160,200,200,0.9)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(c.x - 1, c.ty - 3.2); g.lineTo(c.x - 0.8, c.ty - 0.4); g.stroke();
    stoneBlob(K, cx + 0.3, cy + 0.22, z, 1.4, 1.2, '#c4b99f');
  } },
  { id: 'yatai', label: 'Street stall', w: 1, d: 1, h: 14, draw(K, o) {
    const F = frame(K, o), cloth = pickv(['#3f5a78', LACQ_D, '#5f7b6e'], o.v), g = K.g;
    for (const a of [0.24, 0.76]) F.at3(a, 0.84, 1.8, (p, x, y) => { const [px, py] = K.P(x, y, o.z + 1.8); g.beginPath(); g.arc(px, py, 1.8, 0, TAU); g.fillStyle = TIMB; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke(); });
    F.box(0.15, 0.85, 0.3, 0.8, 1.2, 6, WOOD, { top: WOOD_L });
    for (const [a, b] of [[0.17, 0.32], [0.83, 0.32], [0.17, 0.78], [0.83, 0.78]]) F.box(a - 0.02, a + 0.02, b - 0.02, b + 0.02, 6, 12, TIMB, { noTop: true });
    F.at3(0.35, 0.55, 6, ([px, py]) => { for (const dx of [0, 2.4]) { g.beginPath(); g.ellipse(px + dx, py - 0.8, 1.3, 0.7, 0, 0, TAU); g.fillStyle = '#e6dcc6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); } });
    F.box(0.1, 0.9, 0.24, 0.86, 12, 12.8, TILE[0], { top: shade(TILE[0], 1.15) });
    for (let k = 0; k < 4; k++) F.onFront(0.16 + k * 0.17, 0.31 + k * 0.17, 0.861, 9, 12, cloth, 0.3);
    F.at3(0.12, 0.86, 11.6, ([px, py]) => lantern(g, px, py + 2.2, 0.7));
    F.done();
  } },
  { id: 'moonbridge', label: 'Arched bridge', w: 1, d: 1, h: 14, water: true, draw(K, o) {
    const ax = o.face % 2 === 0, [cx, cy] = mid(o), z0 = o.z + 5, H = 7, g = K.g, n = 14;
    const pt = (s, b, dz = 0) => { const a = -0.08 + 1.16 * s, h = Math.sin(Math.PI * s) * H; return ax ? [o.x0 + a, cy + b, z0 + h + dz] : [cx + b, o.y0 + a, z0 + h + dz]; };
    const curve = (b, dz) => Array.from({ length: n + 1 }, (_, k) => K.P(...pt(k / n, b, dz)));
    const line = (pts, w, col) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = INK; g.lineWidth = w + 0.9; g.stroke(); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
    const rails = b => { const top = curve(b, 3.2); g.strokeStyle = INK; g.lineWidth = 0.9; g.beginPath(); for (let k = 1; k < n; k += 2) { const p = K.P(...pt(k / n, b)), q = top[k]; g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); } g.stroke(); line(top, 0.8, LACQ); };
    const W = 0.15, back = -W, front = W;
    rails(back);
    /* the deck, then the arched side we see */
    const near = curve(front, 0), far = curve(back, 0);
    g.beginPath(); near.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); for (let k = n; k >= 0; k--) g.lineTo(far[k][0], far[k][1]); g.closePath(); g.fillStyle = WOOD_L; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
    const under = curve(front, -1.6);
    g.beginPath(); near.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); for (let k = n; k >= 0; k--) g.lineTo(under[k][0], under[k][1]); g.closePath(); g.fillStyle = LACQ_D; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
    rails(front);
  } },
  { id: 'sampan', label: 'Sampan', w: 1, d: 1, h: 7, water: true, draw(K, o) {
    const [cx, cy] = mid(o), g = K.g, ax = o.face % 2 === 0, L = 0.42, Wd = 0.12, z = o.z;
    const P2 = (a, b, zz) => K.P(...(ax ? [cx + a, cy + b, zz] : [cx + b, cy + a, zz]));
    const hull = [[-L, 0], [-L * 0.5, -Wd], [L * 0.55, -Wd], [L, 0], [L * 0.55, Wd], [-L * 0.5, Wd]];
    K.poly(hull.map(([a, b]) => P2(a, b, z - 0.6)), '#5e4430', 0.6);
    K.poly(hull.map(([a, b]) => P2(a * 0.86, b * 0.8, z + 0.4)), WOOD, 0.45);
    /* a woven canopy arched over the middle */
    const ca = [-0.16, 0.14], pts = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8, b = -Wd * 0.9 + 2 * Wd * 0.9 * t, h = Math.sin(Math.PI * t) * 4; pts.push([b, h]); }
    const side = a => pts.map(([b, h]) => P2(a, b, z + 0.4 + h));
    const s0 = side(ca[0]), s1 = side(ca[1]);
    g.beginPath(); s1.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); for (let k = s0.length - 1; k >= 0; k--) g.lineTo(s0[k][0], s0[k][1]); g.closePath(); g.fillStyle = '#c9b07a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
    g.save(); g.clip(); g.strokeStyle = 'rgba(110,80,40,0.45)'; g.lineWidth = 0.4; g.beginPath(); for (let k = 1; k < 8; k++) { g.moveTo(s0[k][0], s0[k][1]); g.lineTo(s1[k][0], s1[k][1]); } g.stroke(); g.restore();
    g.beginPath(); s1.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = '#b39a66'; g.fill(); g.stroke();
    const a = P2(L * 0.8, 0, z + 1), b = P2(L * 1.6, Wd * 1.6, z - 1); g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  } }
];

/* ---------- plants ---------- */
const SAKURA = { hi: '#fdf0ee', mid: '#f2c9cf', lo: '#dfa3b0', deep: '#b97b8d' };
const MAPLE = [{ hi: '#eab08a', mid: '#cf6a4c', lo: '#ac4a36', deep: '#7d3027' }, { hi: '#f2c98a', mid: '#df9248', lo: '#bd6d34', deep: '#87492a' }];
const GINKGO = { hi: '#f7ebb0', mid: '#e4c661', lo: '#c9a540', deep: '#94762c' };
const PINE = { hi: '#a9bf86', mid: '#759457', lo: '#567645', deep: '#3b5733' };
const WILLOW = { hi: '#d9e2a6', mid: '#a8bc72', lo: '#86a05a', deep: '#5d7441' };
const AZALEA = { hi: '#c4d49a', mid: '#8fa862', lo: '#6c8447', deep: '#4b6235' };
const plant = fn => function (K, o) { const [cx, cy] = mid(o), [px, py] = K.P(cx + (o.v - 0.5) * 0.16, cy + (o.r() - 0.5) * 0.16, o.z); fn(K.g, px, py, o, K); };
const blobs = (x, y, s, r, list) => list.map(([dx, dy, rx, ry]) => makeBlob(x + dx * s, y + dy * s, rx * s, (ry ?? rx * 0.82) * s, r));
/* a crooked trunk that forks once */
function crooked(g, x, y, h, lean, w = 1, col = '#5e4a3a') {
  g.lineCap = 'round'; const tx = x + lean, ty = y - h;
  const draw = (lw, c) => { g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + lean * 0.9, y - h * 0.3, x - lean * 0.3, y - h * 0.7, tx, ty); g.moveTo(x + lean * 0.3, y - h * 0.55); g.quadraticCurveTo(x - h * 0.3, y - h * 0.8, x - h * 0.45, y - h * 1.05); g.moveTo(tx, ty); g.quadraticCurveTo(tx + h * 0.2, ty - h * 0.2, tx + h * 0.4, ty - h * 0.25); g.strokeStyle = c; g.lineWidth = lw; g.stroke(); };
  draw(2.6 * w, INK); draw(1.4 * w, col);
}

const PLANTS = [
  { id: 'sakura', label: 'Cherry blossom', w: 1, d: 1, h: 20, draw: plant((g, x, y, o) => {
    const s = 12 + o.v * 3, r = o.r; castShadow(g, x + s * 0.12, y, s * 1.15, s * 0.24);
    crooked(g, x, y, s * 0.6, s * 0.1, 0.9);
    foliage(g, blobs(x + s * 0.05, y - s * 0.95, s, r, [[0, -0.22, 0.38], [-0.46, 0.04, 0.34], [0.46, 0.02, 0.34], [-0.2, 0.24, 0.3], [0.24, 0.22, 0.3]]), SAKURA, r, { lw: 0.44 });
    g.fillStyle = '#f2c9cf'; for (let k = 0; k < 9; k++) { g.beginPath(); g.ellipse(x + (r() - 0.5) * s * 1.6, y + (r() - 0.5) * s * 0.5, 0.8, 0.5, 0, 0, TAU); g.fill(); }
  }) },
  { id: 'maple', label: 'Red maple', w: 1, d: 1, h: 18, draw: plant((g, x, y, o) => {
    const s = 11 + o.v * 3, r = o.r; castShadow(g, x + s * 0.12, y, s * 1.05, s * 0.22);
    crooked(g, x, y, s * 0.55, -s * 0.08, 0.75, '#6a4a3a');
    foliage(g, blobs(x - s * 0.05, y - s * 0.8, s, r, [[0, -0.42, 0.34, 0.2], [-0.42, -0.12, 0.34, 0.2], [0.4, -0.16, 0.36, 0.2], [-0.12, 0.08, 0.36, 0.2], [0.26, 0.12, 0.3, 0.18]]), MAPLE[o.v < 0.6 ? 0 : 1], r, { lw: 0.44 });
  }) },
  { id: 'ginkgo', label: 'Ginkgo', w: 1, d: 1, h: 24, draw: plant((g, x, y, o) => {
    const s = 12 + o.v * 3, r = o.r; castShadow(g, x + s * 0.12, y, s * 0.95, s * 0.22);
    trunkStroke(g, x, y, s * 0.6, 0, false, 0.9);
    foliage(g, blobs(x, y - s, s, r, [[0, -0.6, 0.26, 0.3], [-0.24, -0.3, 0.28, 0.28], [0.24, -0.32, 0.28, 0.28], [-0.1, 0.02, 0.32, 0.26], [0.18, 0.04, 0.28, 0.24]]), GINKGO, r, { lw: 0.44 });
    g.fillStyle = '#e4c661'; for (let k = 0; k < 7; k++) g.fillRect(x + (r() - 0.5) * s * 1.4, y + (r() - 0.5) * s * 0.4, 1.1, 0.7);
  }) },
  { id: 'gardenpine', label: 'Garden pine', w: 1, d: 1, h: 20, draw: plant((g, x, y, o) => {
    const s = 12 + o.v * 3, r = o.r, lean = s * (o.v < 0.5 ? 0.35 : -0.35); castShadow(g, x + s * 0.12, y, s * 1.1, s * 0.22);
    const pads = [[-0.42, -0.42, 0.34, 0.13], [0.46, -0.66, 0.36, 0.13], [-0.1, -0.92, 0.38, 0.14], [lean / s + 0.05, -1.2, 0.3, 0.13]];
    g.lineCap = 'round';
    for (const [lw, c] of [[2.8, INK], [1.6, '#5e4a3a']]) { g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - lean * 0.6, y - s * 0.4, x + lean * 1.2, y - s * 0.75, x + lean, y - s * 1.15); for (const [dx, dy] of pads.slice(0, 3)) { const t = -dy / 1.2, bx = x + lean * t * 0.6, by = y + dy * s * 0.95; g.moveTo(bx, by); g.quadraticCurveTo(bx + dx * s * 0.5, by - 1, x + dx * s * 0.85, y + dy * s - 0.5); } g.strokeStyle = c; g.lineWidth = lw; g.stroke(); }
    foliage(g, pads.map(([dx, dy, rx, ry]) => makeBlob(x + dx * s, y + dy * s - s * 0.08, rx * s, ry * s, r, 9)), PINE, r, { lw: 0.44 });
  }) },
  { id: 'bamboo', label: 'Bamboo grove', w: 1, d: 1, h: 30, shade: 0.24, draw(K, o) {
    const g = K.g, r = o.r, culms = [];
    for (let k = 0; k < 8; k++) culms.push([o.x0 + 0.2 + r() * 0.6, o.y0 + 0.2 + r() * 0.6, 20 + r() * 9, (r() - 0.5) * 4]);
    culms.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    const [cx, cy] = mid(o), [sx0, sy0] = K.P(cx, cy, o.z); castShadow(g, sx0 + 2, sy0, 22, 5);
    for (const [x, y, h, lean] of culms) {
      const [px, py] = K.P(x, y, o.z), tx = px + lean, ty = py - h;
      g.lineCap = 'round'; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + lean * 0.2, py - h * 0.5, tx, ty);
      g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke(); g.strokeStyle = h > 25 ? '#8fae5a' : '#a3b968'; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = INK; g.lineWidth = 0.5; g.beginPath(); for (let f = 0.15; f < 0.95; f += 0.16) { const qx = px + lean * f * f, qy = py - h * f; g.moveTo(qx - 1, qy); g.lineTo(qx + 1, qy); } g.stroke();
      for (let k = 0; k < 4; k++) {
        const f = 0.55 + k * 0.13, qx = px + lean * f * f, qy = py - h * f, side = k % 2 ? 1 : -1;
        for (let j = 0; j < 3; j++) { const a = side * (0.35 + j * 0.35) + (r() - 0.5) * 0.3, lx = qx + Math.cos(a) * side * 4.5, ly = qy + Math.sin(Math.abs(a)) * 1.6 - 0.4 + j * 0.7; g.beginPath(); g.moveTo(qx, qy); g.quadraticCurveTo((qx + lx) / 2, ly - 1.4, lx, ly); g.quadraticCurveTo((qx + lx) / 2, ly + 0.6, qx, qy); g.fillStyle = j % 2 ? '#7f9a52' : '#6c8a46'; g.fill(); g.strokeStyle = 'rgba(43,33,22,0.55)'; g.lineWidth = 0.35; g.stroke(); }
      }
    }
  } },
  { id: 'willow', label: 'Weeping willow', w: 1, d: 1, h: 22, draw: plant((g, x, y, o) => {
    const s = 12 + o.v * 3, r = o.r; castShadow(g, x + s * 0.12, y, s * 1.15, s * 0.24);
    trunkStroke(g, x, y, s * 0.7, s * 0.05, false, 1);
    const top = y - s * 1.2;
    foliage(g, blobs(x, top, s, r, [[-0.25, 0.05, 0.32, 0.2], [0.25, 0.04, 0.32, 0.2], [0, -0.08, 0.34, 0.22]]), WILLOW, r, { lw: 0.44, detail: false });
    /* long strands falling from the crown */
    g.lineCap = 'round';
    for (let k = 0; k < 22; k++) {
      const f = k / 21, sx = x + (f - 0.5) * s * 1.1, sy = top + Math.abs(f - 0.5) * s * 0.3 - s * 0.05, len = s * (0.55 + r() * 0.35) * (1 - Math.abs(f - 0.5) * 0.7), bend = (f - 0.5) * 3;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + bend * 1.5, sy + len * 0.5, sx + bend, sy + len);
      g.strokeStyle = mixHex(INK, WILLOW.deep, 0.5); g.lineWidth = 1.5; g.stroke(); g.strokeStyle = k % 3 ? WILLOW.mid : WILLOW.hi; g.lineWidth = 0.8; g.stroke();
    }
  }) },
  { id: 'azalea', label: 'Clipped azaleas', w: 1, d: 1, h: 7, shade: 0.24, draw(K, o) {
    const g = K.g, r = o.r, flower = pickv(['#c4587a', '#d9788f', '#e8e0d8'], o.v), spots = [[0.3, 0.32, 0.9], [0.68, 0.36, 0.8], [0.45, 0.68, 1]].sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [fx, fy, k] of spots) {
      const [px, py] = K.P(o.x0 + fx, o.y0 + fy, o.z), b = makeBlob(px, py - 3.4 * k, 5.4 * k, 3.6 * k, r, 9);
      foliage(g, [b], AZALEA, r, { lw: 0.42, detail: false });
      g.fillStyle = flower; for (let j = 0; j < 9; j++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.85; g.beginPath(); g.arc(px + Math.cos(a) * d * 5 * k, py - 3.4 * k + Math.sin(a) * d * 3 * k - 0.6, 0.75, 0, TAU); g.fill(); }
    }
  } },
  { id: 'lotus', label: 'Lotus', w: 1, d: 1, h: 4, water: true, shade: 0.4, draw(K, o) {
    const g = K.g, r = o.r;
    for (let k = 0; k < 6; k++) {
      const [px, py] = K.P(o.x0 + 0.15 + r() * 0.7, o.y0 + 0.15 + r() * 0.7, o.z), rx = 2.4 + r() * 1.6, a = r() * TAU;
      g.beginPath(); g.ellipse(px, py, rx, rx * 0.5, 0, a + 0.3, a + TAU - 0.3); g.lineTo(px, py); g.closePath(); g.fillStyle = k % 2 ? '#7f9a52' : '#8fa862'; g.fill(); g.strokeStyle = 'rgba(43,33,22,0.6)'; g.lineWidth = 0.4; g.stroke();
    }
    for (let k = 0; k < 2; k++) {
      const [px, py] = K.P(o.x0 + 0.3 + r() * 0.4, o.y0 + 0.3 + r() * 0.4, o.z), h = 3 + r() * 2;
      g.strokeStyle = '#5c773f'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - h); g.stroke();
      for (const [dx, w] of [[-1.6, 1.2], [1.6, 1.2], [0, 1.4]]) { g.beginPath(); g.moveTo(px, py - h + 0.4); g.quadraticCurveTo(px + dx - w, py - h - 1.4, px + dx * 0.8, py - h - 3.2); g.quadraticCurveTo(px + dx + w, py - h - 1.4, px, py - h + 0.4); g.fillStyle = dx ? '#e8a8b6' : '#f6d4dc'; g.fill(); g.strokeStyle = 'rgba(120,50,70,0.7)'; g.lineWidth = 0.35; g.stroke(); }
    }
  } }
];

/* ---------- room pieces and furniture ---------- */
const INTERIOR = [
  { id: 'shoji', label: 'Paper screen wall', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) {
    const f = run(K, o, axisOf(o), 0, 1, WALL_H, PAPER);
    shoji(K, f.fc, f.c, f.a0, f.a1, o.z + 1.2, o.z + WALL_H, TIMB);
  } },
  { id: 'lowtable', label: 'Low table', w: 1, d: 1, h: 4, draw(K, o) {
    const F = frame(K, o), g = K.g;
    for (const [a, b] of [[0.26, 0.26], [0.74, 0.26], [0.26, 0.74], [0.74, 0.74]]) F.box(a - 0.03, a + 0.03, b - 0.03, b + 0.03, 0, 2.2, '#3a2a22', { noTop: true });
    F.box(0.18, 0.82, 0.18, 0.82, 2.2, 2.9, '#4a3028', { top: '#5e3c30' });
    for (const [a, b] of [[0.06, 0.5], [0.94, 0.5], [0.5, 0.96]]) F.box(a - 0.09, a + 0.09, b - 0.09, b + 0.09, 0, 0.8, pickv(['#8e3a2c', '#3f5a78', '#5f7b6e'], o.v), { top: shade(pickv(['#8e3a2c', '#3f5a78', '#5f7b6e'], o.v), 1.15) });
    F.at3(0.42, 0.45, 2.9, ([px, py]) => { g.beginPath(); g.ellipse(px, py - 1.2, 1.7, 1.4, 0, 0, TAU); g.fillStyle = '#6f7c66'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); g.beginPath(); g.moveTo(px + 1.5, py - 1.6); g.lineTo(px + 2.8, py - 2.4); g.stroke(); });
    F.at3(0.62, 0.6, 2.9, ([px, py]) => { for (const dx of [0, 2]) { g.beginPath(); g.ellipse(px + dx, py - 0.5, 0.8, 0.5, 0, 0, TAU); g.fillStyle = '#efe9da'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.3; g.stroke(); } });
    F.done();
  } },
  { id: 'futon', label: 'Futon', w: 1, d: 2, h: 3, draw(K, o) {
    const F = frame(K, o), quilt = pickv(['#3f5a78', '#8e3a2c', '#5f7b6e', '#7a6a8a'], o.v), g = K.g;
    F.box(0.12, 0.88, 0.06, 0.94, 0, 1, PAPER, { top: '#f8f3e6' });
    F.box(0.3, 0.7, 0.08, 0.2, 1, 1.9, '#e9dfc4');
    F.box(0.1, 0.9, 0.3, 0.92, 1, 1.8, quilt);
    F.at3(0.5, 0.62, 1.8, ([px, py]) => { g.fillStyle = 'rgba(255,245,225,0.55)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(px + ((k % 3) - 1) * 4, py + (k < 3 ? -1.5 : 1.5), 0.9, 0, TAU); g.fill(); } });
    F.done();
  } },
  { id: 'foldscreen', label: 'Folding screen', w: 1, d: 1, h: 10, draw(K, o) {
    const F = frame(K, o), z = o.z, n = 6, g = K.g, quads = [];
    for (let k = 0; k < n; k++) { const b0 = k % 2 ? 0.58 : 0.42, b1 = k % 2 ? 0.42 : 0.58, p = F.at(0.1 + 0.8 * k / n, b0), q = F.at(0.1 + 0.8 * (k + 1) / n, b1); quads.push({ k, p, q, d: p[0] + p[1] + q[0] + q[1] }); }
    quads.sort((a, b) => a.d - b.d);
    for (const { k, p, q } of quads) {
      const pts = [[p[0], p[1], z + 0.4], [q[0], q[1], z + 0.4], [q[0], q[1], z + 8.6], [p[0], p[1], z + 8.6]], lit = (q[1] - p[1]) * 1 + (q[0] - p[0]) * -1 > 0;
      K.face(pts, lit ? '#d9b45a' : '#b8963f', 0.55);
      const m = K.P((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, z + 3.5 + (k % 3) * 1.2); g.beginPath(); g.ellipse(m[0], m[1], 1.8, 0.9, 0, 0, TAU); g.fillStyle = 'rgba(80,110,70,0.75)'; g.fill();
      K.seg([p[0], p[1], z], [p[0], p[1], z + 8.8], '#3a2a22', 0.8);
    }
    F.done();
  } },
  { id: 'alcove', label: 'Scroll alcove', w: 1, d: 1, h: 11, draw(K, o) {
    const F = frame(K, o), g = K.g;
    F.box(0.05, 0.95, 0.04, 0.16, 0, WALL_H, PLAST, { top: '#c8b48c' });
    F.box(0.08, 0.92, 0.16, 0.66, 0, 1.1, '#6b4c32', { top: '#7d5a3c' });
    F.onFront(0.36, 0.64, 0.161, 2.4, 9, '#efe6cf', 0.4);
    F.onFront(0.4, 0.6, 0.162, 3.4, 8, '#f8f3e6', 0.3);
    F.at3(0.5, 0.162, 5.6, ([px, py]) => { g.fillStyle = 'rgba(60,70,60,0.7)'; g.beginPath(); g.moveTo(px - 1.5, py + 1.2); g.lineTo(px, py - 1.4); g.lineTo(px + 1.6, py + 1.2); g.closePath(); g.fill(); g.fillStyle = '#b8483a'; g.fillRect(px + 0.4, py - 2.6, 0.9, 0.9); });
    F.at3(0.72, 0.42, 1.1, (p, x, y) => { const c = K.cyl(x, y, 0.06, o.z + 1.1, o.z + 3.6, '#6f8a9a', { lw: 0.4 }); g.strokeStyle = '#5e4a3a'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(c.x, c.ty); g.quadraticCurveTo(c.x - 3, c.ty - 3, c.x - 4, c.ty - 6); g.stroke(); g.fillStyle = '#f2c9cf'; for (const [dx, dy] of [[-1.5, -2.5], [-3, -4.4], [-4, -6], [-2.2, -5]]) { g.beginPath(); g.arc(c.x + dx, c.ty + dy, 0.8, 0, TAU); g.fill(); } });
    F.done();
  } },
  { id: 'brazier', label: 'Charcoal brazier', w: 1, d: 1, h: 6, draw(K, o) {
    const [cx, cy] = mid(o), g = K.g, c = K.cyl(cx, cy, 0.16, o.z, o.z + 3.2, '#6f8a9a', { lw: 0.5, top: '#d9d0bb' });
    glow(g, c.x, c.ty, 7, 0.45); g.fillStyle = '#c0573d'; for (const [dx, dy] of [[-1, 0], [1, -0.3], [0, 0.5]]) { g.beginPath(); g.arc(c.x + dx, c.ty + dy, 0.8, 0, TAU); g.fill(); }
    flame(g, c.x, c.ty, 0.4);
    g.strokeStyle = 'rgba(30,40,60,0.45)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(c.x - c.rx, c.by - 1.6); g.quadraticCurveTo(c.x, c.by - 0.6, c.x + c.rx, c.by - 1.6); g.stroke();
  } }
];

for (const a of BUILDINGS) a.section = 'Buildings';
for (const a of PROPS) { a.section = 'Props'; a.shade ??= 0.12; }
for (const a of PLANTS) { a.section = 'Plants'; a.shade ??= 0.3; }
for (const a of INTERIOR) { a.section = 'Interior'; a.shade = a.joins ? 0.38 : 0.16; }
const EAST = [...BUILDINGS, ...PROPS, ...PLANTS, ...INTERIOR];

export { EAST, eaveRoof };
