import { TAU } from '../core/geometry.js';
import { GOLD, INK } from '../render/palette.js';
import { shade } from './kit.js';

/* ================= interiors: room pieces and furniture =================
   Same contract as assets.js: footprint w×d (before turning), shadow height h, draw(K, o). Furniture is
   drawn in the piece's own frame, a across its front (0..1) and b from its back (0) to its front (1), so
   one drawing serves all four facings; face 0..3 turns the front to +y, +x, -y or -x. Heights are in
   drawing units, where a cottage wall is 8 and a person about 13. Interior walls are kept low, cut away
   the way a dolls' house is, so the room behind them stays visible. */
const PLASTER = '#efe3c4', TIMBER = '#7a5a3a', WOOD = '#9a7650', WOOD_L = '#b48a58', WOOD_D = '#6b4c32';
const LINEN = '#f0e6cb', STONE = '#d8cfb9', IRON = '#5f646a', GLASS = '#8eaab0', CLOTHS = ['#a6533b', '#5f7b3d', '#4f6f8f', '#c9a24f', '#7a6a8a'];
const WALL_H = 10, WALL_T = 0.11;
const BRICK = '#9a4e36', COPPER = '#c97a56', POTIONS = ['#6fbf6a', '#a46ac8', '#e0a23a', '#c4503e', '#4fb0b0'], HERBS = ['#7f9a52', '#93a862', '#a8a46a', '#b98ad8', '#6f8a5a'];
const pickv = (a, v) => a[Math.floor(v * a.length) % a.length];

/* ---------- the piece's own frame ---------- */
function frame(K, o) {
  const W = o.x1 - o.x0, D = o.y1 - o.y0, f = o.face & 3;
  const at = (a, b) => f === 0 ? [o.x0 + a * W, o.y0 + b * D] : f === 1 ? [o.x0 + b * W, o.y1 - a * D] : f === 2 ? [o.x1 - a * W, o.y1 - b * D] : [o.x1 - b * W, o.y0 + a * D];
  const rect = (a0, a1, b0, b1) => { const p = at(a0, b0), q = at(a1, b1); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
  const parts = [];
  const F = {
    at, rect, z: o.z, front: f < 2,
    /* queue a block; done() draws them back to front so a piece made of several reads correctly from any side */
    box(a0, a1, b0, b1, z0, z1, col, opt = {}) { const r = rect(a0, a1, b0, b1); parts.push({ d: r[0] + r[1] + r[2] + r[3], z: z0, fn: () => K.box(...r, o.z + z0, o.z + z1, col, Object.assign({ lw: 0.5 }, opt)) }); },
    /* anything else, drawn in turn with the blocks at its depth */
    at3(a, b, z, fn) { const [x, y] = at(a, b); parts.push({ d: 2 * (x + y), z, fn: () => fn(K.P(x, y, o.z + z), x, y) }); },
    done() { parts.sort((p, q) => p.d - q.d || p.z - q.z); for (const p of parts) p.fn(); },
    /* a flat quad on the front plane b (only seen when the front faces the viewer) */
    onFront(a0, a1, b, z0, z1, fill, lw = 0.4) {
      if (!F.front) return; const p = at(a0, b), q = at(a1, b);
      /* drawn just after the block whose front it lies on, before anything standing in front of it */
      parts.push({ d: p[0] + p[1] + q[0] + q[1] + 1e-3, z: z0, fn: () => K.face([[p[0], p[1], o.z + z0], [q[0], q[1], o.z + z0], [q[0], q[1], o.z + z1], [p[0], p[1], o.z + z1]], fill, lw) });
    }
  };
  return F;
}
const glow = (g, x, y, r, a = 0.55) => { const gl = g.createRadialGradient(x, y, 0, x, y, r); gl.addColorStop(0, `rgba(255,214,120,${a})`); gl.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = gl; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const flame = (g, x, y, s = 1) => { g.beginPath(); g.moveTo(x, y - 3.2 * s); g.quadraticCurveTo(x + 1.6 * s, y - 0.8 * s, x, y); g.quadraticCurveTo(x - 1.6 * s, y - 0.8 * s, x, y - 3.2 * s); g.fillStyle = '#f4b545'; g.fill(); g.beginPath(); g.ellipse(x, y - 0.8 * s, 0.6 * s, 1 * s, 0, 0, TAU); g.fillStyle = '#fff1c4'; g.fill(); };
const candle = (K, x, y, z) => { const [px, py] = K.P(x, y, z), g = K.g; g.fillStyle = '#f4eede'; g.fillRect(px - 0.7, py - 3, 1.4, 3); g.strokeStyle = INK; g.lineWidth = 0.35; g.strokeRect(px - 0.7, py - 3, 1.4, 3); glow(g, px, py - 4.5, 7, 0.45); flame(g, px, py - 3, 0.6); };

/* ---------- interior walls: low cutaway walls that join the room pieces beside them ---------- */
/* links = [+x, +y, -x, -y] from tiles/index.js; with none, the wall runs across the tile along its facing */
function armsOf(o) {
  const L = o.links && o.links.some(Boolean) ? o.links : null;
  if (L) return L;
  return o.face % 2 === 0 ? [1, 0, 1, 0] : [0, 1, 0, 1];
}
/* one wall run along an axis through the tile centre, from s0 to s1 (0..1 along it) */
function run(K, o, axis, s0, s1, h, col) {
  const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2, t = WALL_T;
  const r = axis === 'x' ? [o.x0 + s0, cy - t, o.x0 + s1, cy + t] : [cx - t, o.y0 + s0, cx + t, o.y0 + s1];
  K.box(...r, o.z, o.z + h, col, { lw: 0.5, top: '#c8b48c' });
  /* skirting board and a timber cap along the visible face */
  const fc = axis === 'x' ? 'y' : 'x', c = axis === 'x' ? r[3] : r[2], a0 = axis === 'x' ? r[0] : r[1], a1 = axis === 'x' ? r[2] : r[3];
  K.onWall(fc, c, a0, a1, o.z, o.z + 1.2, TIMBER, 0.3);
  return { fc, c, a0, a1 };
}
/* walls as arms from the centre: the far arms first, then the near ones, so corners and tees overlap right */
function wallBody(K, o, h = WALL_H, col = PLASTER) {
  const [px, py, nx, ny] = armsOf(o), lo = 0.5 - WALL_T, hi = 0.5 + WALL_T;
  if (nx) run(K, o, 'x', 0, hi, h, col);
  if (ny) run(K, o, 'y', 0, hi, h, col);
  const out = {};
  if (px) out.x = run(K, o, 'x', lo, 1, h, col);
  if (py) out.y = run(K, o, 'y', lo, 1, h, col);
  if (!(px || nx) && !(py || ny)) out.x = run(K, o, 'x', 0, 1, h, col);
  return out;
}
/* the axis a straight piece (window, doorway) runs along: the way it links, else its facing */
/* a wall with something hung on it: the wall, and where its face is, the middle of it (null for a run whose face does
   not show) */
const hung = (K, o) => { const ax = axisOf(o), f = run(K, o, ax, 0, 1, WALL_H, PLASTER); return { ...f, m: (f.a0 + f.a1) / 2 }; };
const axisOf = o => { const L = o.links || [0, 0, 0, 0]; return L[0] || L[2] ? 'x' : L[1] || L[3] ? 'y' : o.face % 2 === 0 ? 'x' : 'y'; };

const INTERIOR = [
  { id: 'iwall', label: 'Interior wall', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { wallBody(K, o, WALL_H, pickv([PLASTER, '#e9d6ae', '#efe7d6'], o.v)); } },
  { id: 'iwindow', label: 'Wall with window', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) {
    const ax = axisOf(o), f = run(K, o, ax, 0, 1, WALL_H, PLASTER), m = (f.a0 + f.a1) / 2;
    K.onWall(f.fc, f.c, m - 0.2, m + 0.2, o.z + 3.5, o.z + 8.2, GLASS, 0.5);
    K.onWall(f.fc, f.c, m - 0.012, m + 0.012, o.z + 3.5, o.z + 8.2, TIMBER, 0);
    K.onWall(f.fc, f.c, m - 0.2, m + 0.2, o.z + 5.8, o.z + 6.1, TIMBER, 0);
    K.onWall(f.fc, f.c, m - 0.25, m + 0.25, o.z + 3, o.z + 3.5, WOOD_L, 0.35);
  } },
  { id: 'idoor', label: 'Doorway', w: 1, d: 1, h: WALL_H, joins: 'room', walk: true, draw(K, o) {
    /* two short wall ends either side of an opening, a lintel over it and the door standing open */
    const ax = axisOf(o), cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2, t = WALL_T, z = o.z;
    const seg = (s0, s1, z0, z1, col) => K.box(...(ax === 'x' ? [o.x0 + s0, cy - t, o.x0 + s1, cy + t] : [cx - t, o.y0 + s0, cx + t, o.y0 + s1]), z + z0, z + z1, col, { lw: 0.5, top: '#c8b48c' });
    seg(0, 0.18, 0, WALL_H, PLASTER);
    const leaf = ax === 'x' ? [o.x0 + 0.2, cy - t - 0.5, o.x0 + 0.26, cy - t] : [cx - t - 0.5, o.y0 + 0.2, cx - t, o.y0 + 0.26];
    K.box(...leaf, z, z + 7.6, WOOD, { lw: 0.45 });
    seg(0.18, 0.82, 7.6, WALL_H, TIMBER);
    seg(0.82, 1, 0, WALL_H, PLASTER);
  } },
  { id: 'hearth', label: 'Fireplace', w: 1, d: 1, h: 18, joins: 'room', draw(K, o) {
    const F = frame(K, o);
    F.box(0.08, 0.92, 0.05, 0.42, 0, 12, STONE, { top: '#c9bea6' });
    F.box(0.28, 0.72, 0.1, 0.32, 12, 18, STONE);
    F.box(0.02, 0.98, 0.42, 0.52, 7.5, 8.4, WOOD_D);
    F.onFront(0.24, 0.76, 0.42, 0.4, 6, '#2f271f', 0.5);
    F.at3(0.5, 0.46, 0.6, ([px, py]) => { const g = K.g; glow(g, px, py - 2, 14, 0.6); for (const dx of [-1.6, 0, 1.6]) flame(g, px + dx, py, dx ? 0.8 : 1.1); g.strokeStyle = WOOD_D; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px - 3, py + 0.5); g.lineTo(px + 3, py - 0.3); g.stroke(); });
    F.box(0.05, 0.95, 0.52, 0.95, 0, 0.5, '#c9bea6');
    F.done();
  } },
  /* a straight flight rising from its front to its back, one storey (16 units) in one tile; a character on it
     can step off its high end onto the floor above (see editor/walk.js) */
  { id: 'stairs', label: 'Stairs', w: 1, d: 1, h: 18, top: 16, walk: true, draw(K, o) {
    const F = frame(K, o), n = 6, rise = 16 / n;
    for (let i = 0; i < n; i++) F.box(0.16, 0.84, 1 - (i + 1) / n, 1 - i / n, 0, (i + 1) * rise, i % 2 ? WOOD : WOOD_L, { top: shade(WOOD_L, 1.06) });
    for (const a of [0.12, 0.88]) F.box(a - 0.04, a + 0.04, 0, 1, 0, 1.2, WOOD_D);
    F.done();
  } },
  /* walls with something hung on their face: a shelf of plates and tankards, antlers, a shield over crossed swords,
     a candle sconce */
  { id: 'wallshelf', label: 'Wall with shelf', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { const f = hung(K, o); if (!f) return; const { fc, c, m } = f; K.onWall(fc, c, m - 0.3, m + 0.3, o.z + 5.6, o.z + 6.1, TIMBER, 0.35); for (const [d, col] of [[-0.2, LINEN], [-0.05, '#c9d4d8'], [0.12, '#8c6d4b'], [0.22, '#8c6d4b']]) K.onWall(fc, c, m + d - 0.04, m + d + 0.04, o.z + 6.1, o.z + 7.4, col, 0.3); } },
  { id: 'wallantlers', label: 'Wall with antlers', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { const f = hung(K, o); if (!f) return; const { fc, c, m } = f; K.onWall(fc, c, m - 0.06, m + 0.06, o.z + 4.6, o.z + 6.6, WOOD_D, 0.35); for (const s of [-1, 1]) K.onWall(fc, c, Math.min(m + s * 0.05, m + s * 0.24), Math.max(m + s * 0.05, m + s * 0.24), o.z + 7, o.z + 7.5, '#e8dcc0', 0.3); } },
  { id: 'wallshield', label: 'Wall with shield', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { const f = hung(K, o); if (!f) return; const { fc, c, m } = f; K.onWall(fc, c, m - 0.26, m + 0.26, o.z + 5.6, o.z + 6, '#c8ccd0', 0); K.onWall(fc, c, m - 0.13, m + 0.13, o.z + 3.6, o.z + 8, pickv(['#8e2c26', '#3e5470', '#465c36'], o.v), 0.4); K.onWall(fc, c, m - 0.03, m + 0.03, o.z + 5.5, o.z + 6.1, GOLD, 0); } },
  { id: 'wallsconce', label: 'Wall with candle sconce', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { const f = hung(K, o); if (!f) return; const { fc, c, m } = f; K.onWall(fc, c, m - 0.03, m + 0.03, o.z + 4.4, o.z + 6, IRON, 0); K.onWall(fc, c, m - 0.02, m + 0.02, o.z + 6, o.z + 7.2, '#f4eede', 0.2); const [x, y] = fc === 'y' ? [m, c] : [c, m], [px, py] = K.P(x, y, o.z + 7.4); glow(K.g, px, py, 9, 0.5); flame(K.g, px, py + 0.6, 0.5); } },
  { id: 'wallbar', label: 'Wall with back bar', w: 1, d: 1, h: 16, joins: 'room', draw(K, o) {
    const f = hung(K, o); if (!f || f.fc !== 'y') return;
    const { c } = f, F = frame(K, { ...o, face: 0 }), b = c - o.y0;
    F.box(0.06, 0.94, b, b + 0.22, 0, 5, WOOD, { top: WOOD_L });
    F.box(0.08, 0.92, b, b + 0.08, 5, 15, WOOD_D, { top: WOOD });
    for (const z of [6, 9.5, 12.5]) { F.onFront(0.1, 0.9, b + 0.08, z, z + 2.6, '#3a2c1e', 0.3); for (let a = 0.12; a < 0.86; a += 0.08) F.onFront(a, a + 0.04, b + 0.081, z, z + 1.6 + (a * 37 % 1), pickv(['#5f8a4a', '#7a4a2a', '#c9d8d0', '#a8aeb0'], (a * 13 + z) % 1), 0.2); }
    F.done();
  } },
  /* the smithy's and the alchemist's walls: hammers and tongs on a rail, a shelf of potions, herbs hung to dry, a star
     chart */
  { id: 'walltools', label: 'Wall with smith\'s tools', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { const f = hung(K, o); if (!f) return; const { fc, c, m } = f; K.onWall(fc, c, m - 0.32, m + 0.32, o.z + 7.6, o.z + 8, WOOD_D, 0.3); for (let k = 0; k < 5; k++) { const a = m - 0.24 + k * 0.12; K.onWall(fc, c, a - 0.012, a + 0.012, o.z + 4.8, o.z + 7.6, k % 2 ? IRON : WOOD_D, 0); if (!(k % 2)) K.onWall(fc, c, a - 0.04, a + 0.04, o.z + 4.4, o.z + 5.1, IRON, 0.2); } } },
  { id: 'wallpotions', label: 'Wall with potion shelf', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { const f = hung(K, o); if (!f) return; const { fc, c, m } = f; for (const z of [4.4, 7]) { K.onWall(fc, c, m - 0.3, m + 0.3, o.z + z - 0.4, o.z + z, TIMBER, 0.3); for (let k = 0; k < 6; k++) { const a = m - 0.25 + k * 0.1; K.onWall(fc, c, a - 0.025, a + 0.025, o.z + z, o.z + z + 1.2 + (k * 7 + z) % 3 * 0.25, POTIONS[(k + z * 3) % POTIONS.length], 0.2); } } } },
  { id: 'wallherbs', label: 'Wall with drying herbs', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { const f = hung(K, o); if (!f) return; const { fc, c, m } = f; K.onWall(fc, c, m - 0.34, m + 0.34, o.z + 8, o.z + 8.2, '#c8b28a', 0); for (let k = 0; k < 6; k++) { const a = m - 0.27 + k * 0.11; K.onWall(fc, c, a - 0.03, a + 0.03, o.z + 5.6, o.z + 8, pickv(HERBS, k / 6), 0.25); } } },
  { id: 'wallchart', label: 'Wall with star chart', w: 1, d: 1, h: WALL_H, joins: 'room', draw(K, o) { const f = hung(K, o); if (!f) return; const { fc, c, m } = f; K.onWall(fc, c, m - 0.26, m + 0.26, o.z + 3.6, o.z + 8.4, '#2f3f66', 0.4); const [x, y] = fc === 'y' ? [m, c] : [c, m], [px, py] = K.P(x, y, o.z + 6), g = K.g; g.strokeStyle = GOLD; g.lineWidth = 0.4; g.beginPath(); g.ellipse(px, py, 4.2, 2.6, fc === 'y' ? 0.46 : -0.46, 0, TAU); g.stroke(); g.fillStyle = '#f6e6a0'; for (const [dx, dy] of [[-3, -1.5], [2, -2], [3, 1], [-1, 2], [0, 0]]) g.fillRect(px + dx, py + dy, 0.8, 0.8); } },
  { id: 'post', label: 'Timber post', w: 1, d: 1, h: WALL_H + 4, joins: 'room', draw(K, o) { const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2]; K.box(cx - 0.12, cy - 0.12, cx + 0.12, cy + 0.12, o.z, o.z + 1, STONE, { lw: 0.45 }); K.box(cx - 0.08, cy - 0.08, cx + 0.08, cy + 0.08, o.z + 1, o.z + WALL_H + 3, TIMBER, { lw: 0.5 }); } }
];

/* ---------- furniture ---------- */
const FURNITURE = [
  { id: 'bed', label: 'Bed', w: 1, d: 2, h: 7, draw(K, o) {
    const F = frame(K, o), cloth = pickv(CLOTHS, o.v);
    for (const [a, b] of [[0.12, 0.04], [0.88, 0.04], [0.12, 0.96], [0.88, 0.96]]) F.box(a - 0.05, a + 0.05, b - 0.02, b + 0.02, 0, b < 0.5 ? 8 : 4, WOOD_D, { noTop: b > 0.5 });
    F.box(0.08, 0.92, 0.05, 0.95, 1.4, 3.2, WOOD);
    F.box(0.1, 0.9, 0.06, 0.94, 3.2, 4.6, LINEN, { top: '#f6efdc' });
    F.box(0.22, 0.78, 0.08, 0.25, 4.6, 5.8, '#f8f2e2');
    F.box(0.09, 0.91, 0.38, 0.95, 4.6, 5.2, cloth);
    F.box(0.05, 0.95, 0.01, 0.06, 1.4, 7.4, WOOD);
    F.done();
  } },
  { id: 'cot', label: 'Straw cot', w: 1, d: 2, h: 3, draw(K, o) { const F = frame(K, o); F.box(0.15, 0.85, 0.08, 0.92, 0, 1.6, '#d9b860', { top: '#e2c776' }); F.box(0.18, 0.82, 0.4, 0.9, 1.6, 2.1, pickv(['#8c6d4b', '#7a6a8a', '#5f7b3d'], o.v)); F.done(); } },
  { id: 'table', label: 'Table', w: 1, d: 1, h: 6, draw(K, o) {
    const F = frame(K, o);
    for (const [a, b] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) F.box(a - 0.04, a + 0.04, b - 0.04, b + 0.04, 0, 4.8, WOOD_D, { noTop: true });
    F.box(0.1, 0.9, 0.1, 0.9, 4.8, 5.6, WOOD_L);
    if (o.v > 0.3) F.at3(0.35, 0.45, 5.6, ([px, py]) => { const g = K.g; g.beginPath(); g.ellipse(px, py, 2.6, 1.3, 0, 0, TAU); g.fillStyle = '#e6dcc6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); g.beginPath(); g.ellipse(px, py - 0.6, 1.6, 0.9, 0, 0, TAU); g.fillStyle = '#c99a5a'; g.fill(); g.stroke(); });
    if (o.v > 0.55) F.at3(0.68, 0.6, 5.6, () => { const [x, y] = F.at(0.68, 0.6); K.cyl(x, y, 0.05, o.z + 5.6, o.z + 7.6, '#8c6d4b', { lw: 0.35, top: '#5a3f28' }); });
    F.done();
  } },
  { id: 'longtable', label: 'Long table', w: 2, d: 1, h: 6, draw(K, o) {
    const F = frame(K, o);
    for (const a of [0.1, 0.9]) { F.box(a - 0.025, a + 0.025, 0.2, 0.8, 0, 4.8, WOOD_D, { noTop: true }); F.box(a - 0.03, a + 0.03, 0.15, 0.85, 0, 0.7, WOOD_D); }
    F.box(0.04, 0.96, 0.12, 0.88, 4.8, 5.6, WOOD_L);
    for (const a of [0.25, 0.5, 0.75]) if (o.r() > 0.3) F.at3(a, 0.4 + o.r() * 0.2, 5.6, ([px, py]) => { const g = K.g; g.beginPath(); g.ellipse(px, py, 2.2, 1.1, 0, 0, TAU); g.fillStyle = '#e6dcc6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); });
    F.done();
  } },
  { id: 'chair', label: 'Chair', w: 1, d: 1, h: 8, draw(K, o) {
    const F = frame(K, o);
    for (const [a, b] of [[0.3, 0.32], [0.7, 0.32], [0.3, 0.72], [0.7, 0.72]]) F.box(a - 0.03, a + 0.03, b - 0.03, b + 0.03, 0, 3, WOOD_D, { noTop: true });
    F.box(0.26, 0.74, 0.28, 0.76, 3, 3.6, WOOD);
    F.box(0.26, 0.74, 0.25, 0.31, 3.6, 8.4, WOOD);
    F.done();
  } },
  { id: 'stool', label: 'Stool', w: 1, d: 1, h: 4, draw(K, o) { const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2]; for (const [dx, dy] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) K.box(cx + dx - 0.025, cy + dy - 0.025, cx + dx + 0.025, cy + dy + 0.025, o.z, o.z + 3, WOOD_D, { lw: 0.35, noTop: true }); K.cyl(cx, cy, 0.14, o.z + 3, o.z + 3.7, WOOD, { lw: 0.45, top: WOOD_L }); } },
  { id: 'bench', label: 'Bench', w: 2, d: 1, h: 4, draw(K, o) {
    const F = frame(K, o);
    for (const a of [0.12, 0.88]) F.box(a - 0.03, a + 0.03, 0.38, 0.62, 0, 3, WOOD_D, { noTop: true });
    F.box(0.05, 0.95, 0.35, 0.65, 3, 3.7, WOOD);
    F.done();
  } },
  { id: 'chest', label: 'Chest', w: 1, d: 1, h: 5, draw(K, o) {
    const F = frame(K, o);
    F.box(0.2, 0.8, 0.3, 0.72, 0, 3.4, WOOD);
    F.box(0.18, 0.82, 0.28, 0.74, 3.4, 4.6, WOOD_L);
    F.onFront(0.2, 0.8, 0.72, 2.6, 3.0, IRON, 0);
    F.onFront(0.45, 0.55, 0.72, 2.3, 3.8, GOLD, 0.35);
    F.done();
  } },
  { id: 'wardrobe', label: 'Wardrobe', w: 1, d: 1, h: 16, draw(K, o) {
    const F = frame(K, o);
    F.box(0.15, 0.85, 0.15, 0.55, 0, 15, WOOD, { top: WOOD_L });
    F.box(0.12, 0.88, 0.12, 0.58, 15, 16, WOOD_D);
    F.onFront(0.49, 0.51, 0.55, 1, 14, WOOD_D, 0);
    F.onFront(0.43, 0.46, 0.55, 7, 9, GOLD, 0); F.onFront(0.54, 0.57, 0.55, 7, 9, GOLD, 0);
    F.done();
  } },
  { id: 'bookshelf', label: 'Bookshelf', w: 1, d: 1, h: 15, draw(K, o) {
    const F = frame(K, o), r = o.r;
    F.box(0.12, 0.88, 0.15, 0.45, 0, 14.5, WOOD_D, { top: WOOD });
    if (F.front) for (const z of [1, 4.6, 8.2, 11.6]) {
      F.onFront(0.16, 0.84, 0.45, z, z + 3.2, '#3a2c1e', 0.3);
      let a = 0.17; while (a < 0.8) { const w = 0.04 + r() * 0.05, h = 2.2 + r() * 0.9; F.onFront(a, Math.min(0.83, a + w), 0.451, z, z + h, pickv(['#a6533b', '#5f7b3d', '#4f6f8f', '#c9a24f', '#efe3c4', '#7a6a8a', '#8c6d4b'], r()), 0.25); a += w + 0.008; }
    }
    F.done();
  } },
  { id: 'dresser', label: 'Dresser', w: 1, d: 1, h: 13, draw(K, o) {
    const F = frame(K, o);
    F.box(0.1, 0.9, 0.2, 0.62, 0, 6, WOOD, { top: WOOD_L });
    F.box(0.12, 0.88, 0.2, 0.32, 6, 13, WOOD_D, { top: WOOD });
    F.onFront(0.14, 0.86, 0.62, 3.2, 3.5, WOOD_D, 0);
    F.onFront(0.47, 0.53, 0.62, 4, 5, GOLD, 0.3);
    if (F.front) for (const z of [7.5, 10.4]) for (const a of [0.28, 0.5, 0.72]) F.at3(a, 0.33, z, ([px, py]) => { const g = K.g; g.beginPath(); g.ellipse(px, py - 1.3, 1.3, 1.3, 0, 0, TAU); g.fillStyle = pickv(['#e6dcc6', '#c9d4d8', '#e8c49a'], (a * 7 + z) % 1); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); });
    F.done();
  } },
  { id: 'desk', label: 'Writing desk', w: 1, d: 1, h: 9, draw(K, o) {
    const F = frame(K, o);
    F.box(0.12, 0.42, 0.2, 0.75, 0, 5, WOOD);
    for (const b of [0.24, 0.72]) F.box(0.8, 0.86, b - 0.03, b + 0.03, 0, 5, WOOD_D, { noTop: true });
    F.box(0.08, 0.92, 0.18, 0.78, 5, 5.7, WOOD_L);
    F.at3(0.55, 0.45, 5.7, ([px, py]) => { const g = K.g; g.save(); g.translate(px, py); g.transform(1, 0.5, -1, 0.5, 0, 0); g.fillStyle = '#f4eede'; g.fillRect(-2.2, -1.5, 3.6, 2.6); g.strokeStyle = INK; g.lineWidth = 0.3; g.strokeRect(-2.2, -1.5, 3.6, 2.6); g.restore(); });
    F.at3(0.3, 0.3, 5.7, (p, x, y) => candle(K, x, y, o.z + 5.7));
    F.done();
  } },
  { id: 'counter', label: 'Counter', w: 2, d: 1, h: 7, draw(K, o) {
    const F = frame(K, o);
    F.box(0.04, 0.96, 0.3, 0.7, 0, 6, WOOD, { top: WOOD_L });
    F.onFront(0.06, 0.94, 0.7, 1, 5, WOOD_D, 0.3);
    for (const a of [0.2, 0.38]) F.at3(a, 0.5, 6, (p, x, y) => K.cyl(x, y, 0.05, o.z + 6, o.z + 8, '#8c6d4b', { lw: 0.35, top: '#e6d6a0' }));
    F.at3(0.75, 0.5, 6, (p, x, y) => { K.cyl(x, y, 0.09, o.z + 6, o.z + 9.2, '#9a6a3a', { lw: 0.4, top: '#b98a52' }); });
    F.done();
  } },
  { id: 'cauldron', label: 'Cooking pot', w: 1, d: 1, h: 10, draw(K, o) {
    const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2], g = K.g, [px, py] = K.P(cx, cy, o.z);
    glow(g, px, py - 1, 9, 0.5);
    for (const [dx, dy] of [[-0.25, -0.25], [0.25, 0.25]]) K.seg([cx + dx, cy + dy, o.z], [cx, cy, o.z + 11], INK, 0.9);
    flame(g, px - 1.2, py + 0.6, 0.7); flame(g, px + 1.4, py + 0.4, 0.7);
    const c = K.cyl(cx, cy, 0.17, o.z + 2, o.z + 5.5, '#4a4f55', { lw: 0.5, top: '#7a8a5a' });
    g.strokeStyle = INK; g.lineWidth = 0.5; g.beginPath(); g.moveTo(c.x, c.ty); g.lineTo(K.P(cx, cy, o.z + 11)[0], K.P(cx, cy, o.z + 11)[1]); g.stroke();
    K.smoke(c.x, c.ty - 2);
  } },
  { id: 'tub', label: 'Wash tub', w: 1, d: 1, h: 4, draw(K, o) { const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2], c = K.cyl(cx, cy, 0.3, o.z, o.z + 3.4, '#9a6a3a', { lw: 0.5, top: '#8eb0ab' }), g = K.g; g.strokeStyle = 'rgba(40,30,20,0.55)'; g.lineWidth = 0.45; g.beginPath(); for (const k of [1.1, 2.4]) { g.moveTo(c.x - c.rx, c.by - k); g.ellipse(c.x, c.by - k, c.rx, c.ry, 0, Math.PI, 0, true); } g.stroke(); } },
  { id: 'candelabra', label: 'Candle stand', w: 1, d: 1, h: 12, draw(K, o) { const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2], [px, py] = K.P(cx, cy, o.z), g = K.g; g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 9); g.moveTo(px - 3, py); g.lineTo(px + 3, py); g.moveTo(px - 3, py - 9); g.lineTo(px + 3, py - 9); g.stroke(); g.strokeStyle = '#a07e34'; g.lineWidth = 0.6; g.stroke(); for (const dx of [-3, 0, 3]) candle(K, cx + dx / 32, cy - dx / 32, o.z + 9 + (dx ? 0 : 1)); } },
  { id: 'plantpot', label: 'Potted plant', w: 1, d: 1, h: 7, draw(K, o) { const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2], c = K.cyl(cx, cy, 0.12, o.z, o.z + 3, '#b8664a', { lw: 0.45, top: '#5a3f28' }), g = K.g; for (const [dx, dy, r] of [[-2, -4.5, 2.6], [2, -5, 2.4], [0, -7, 2.8]]) K.blob(c.x + dx, c.ty + dy, r, r * 0.85, pickv(['#87a05a', '#7f9a52', '#93a862'], (dx + 3) / 6), 0.45); g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(c.x - 1, c.ty - 7.5, 1, 0, TAU); g.fill(); } },
  { id: 'throne', label: 'Throne', w: 1, d: 1, h: 16, draw(K, o) {
    const F = frame(K, o);
    F.box(0.15, 0.85, 0.15, 0.9, 0, 1, STONE);
    F.box(0.25, 0.75, 0.3, 0.75, 1, 4.5, WOOD_D);
    F.box(0.27, 0.73, 0.32, 0.73, 4.5, 5.3, '#a6533b');
    F.box(0.2, 0.28, 0.3, 0.75, 4.5, 8, WOOD_D); F.box(0.72, 0.8, 0.3, 0.75, 4.5, 8, WOOD_D);
    F.box(0.22, 0.78, 0.22, 0.32, 1, 16, WOOD_D, { top: GOLD });
    F.onFront(0.3, 0.7, 0.32, 7, 14, '#a6533b', 0.35);
    F.done();
  } },
  { id: 'altar', label: 'Altar', w: 2, d: 1, h: 9, draw(K, o) {
    const F = frame(K, o);
    F.box(0.05, 0.95, 0.2, 0.8, 0, 6, STONE, { top: '#e6dece' });
    F.box(0.06, 0.94, 0.2, 0.8, 6, 6.3, LINEN);
    F.onFront(0.3, 0.7, 0.8, 1.2, 5.7, '#a6533b', 0.35);
    for (const a of [0.2, 0.8]) F.at3(a, 0.4, 6.3, (p, x, y) => candle(K, x, y, o.z + 6.3));
    F.at3(0.5, 0.4, 6.3, ([px, py]) => { const g = K.g; g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 6); g.moveTo(px - 2, py - 4.2); g.lineTo(px + 2, py - 4.2); g.stroke(); g.strokeStyle = GOLD; g.lineWidth = 0.6; g.stroke(); });
    F.done();
  } },
  { id: 'pew', label: 'Pew', w: 2, d: 1, h: 7, draw(K, o) {
    const F = frame(K, o);
    for (const a of [0.04, 0.96]) F.box(a - 0.03, a + 0.03, 0.25, 0.75, 0, 6, WOOD_D);
    F.box(0.04, 0.96, 0.35, 0.72, 2.8, 3.5, WOOD);
    F.box(0.04, 0.96, 0.28, 0.35, 3.5, 7, WOOD);
    F.done();
  } },
  { id: 'weaponrack', label: 'Weapon rack', w: 1, d: 1, h: 13, draw(K, o) {
    const F = frame(K, o);
    F.box(0.12, 0.88, 0.32, 0.42, 0, 1, WOOD_D);
    for (const a of [0.15, 0.85]) F.box(a - 0.03, a + 0.03, 0.34, 0.4, 1, 9, WOOD_D);
    F.box(0.12, 0.88, 0.34, 0.4, 7.4, 8, WOOD);
    for (const a of [0.3, 0.5, 0.7]) F.at3(a, 0.38, 0.6, ([px, py]) => { const g = K.g; g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 12); g.stroke(); g.strokeStyle = WOOD; g.lineWidth = 0.5; g.stroke(); g.beginPath(); g.moveTo(px - 1, py - 12); g.lineTo(px, py - 14.5); g.lineTo(px + 1, py - 12); g.closePath(); g.fillStyle = '#c4c8c6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); });
    F.done();
  } },
  { id: 'spinwheel', label: 'Spinning wheel', w: 1, d: 1, h: 9, draw(K, o) {
    const F = frame(K, o);
    F.box(0.25, 0.75, 0.42, 0.58, 1.4, 2.2, WOOD);
    for (const [a, b] of [[0.3, 0.45], [0.7, 0.45], [0.5, 0.56]]) F.box(a - 0.025, a + 0.025, b - 0.025, b + 0.025, 0, 1.4, WOOD_D, { noTop: true });
    F.at3(0.38, 0.5, 2.2, ([px, py]) => { const g = K.g; g.beginPath(); g.ellipse(px, py - 3.8, 3.2, 3.8, 0, 0, TAU); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke(); g.strokeStyle = WOOD_L; g.lineWidth = 0.55; g.stroke(); g.lineWidth = 0.35; g.strokeStyle = WOOD_D; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.moveTo(px, py - 3.8); g.lineTo(px + Math.cos(a) * 3.2, py - 3.8 + Math.sin(a) * 3.8); } g.stroke(); });
    F.at3(0.7, 0.5, 2.2, ([px, py]) => { const g = K.g; g.fillStyle = '#efe3c4'; g.beginPath(); g.ellipse(px, py - 1.6, 1.2, 1.8, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); });
    F.done();
  } },
  /* the tavern's: a bar counter that joins the bar pieces beside it into one counter, a table with chairs round it,
     a long table between benches, a back bar of shelves, a rack of casks, and odds and ends */
  { id: 'bar', label: 'Bar counter', w: 1, d: 1, h: 7, joins: 'bar', draw(K, o) {
    const L = o.links && o.links.some(Boolean) ? o.links : null, cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2, t = 0.2, z = o.z;
    const [px, py, nx, ny] = L || (o.face % 2 === 0 ? [1, 0, 1, 0] : [0, 1, 0, 1]), e = L ? 0.5 : 0.4;
    const part = r => { K.box(...r, z, z + 5.4, WOOD_D, { lw: 0.45 }); K.box(r[0] - 0.02, r[1] - 0.02, r[2] + 0.02, r[3] + 0.02, z + 5.4, z + 6.2, WOOD_L, { lw: 0.4 }); };
    if (nx) part([cx - e, cy - t, cx + t, cy + t]);
    if (ny) part([cx - t, cy - e, cx + t, cy + t]);
    part([cx - t, cy - t, cx + t, cy + t]);
    if (px) part([cx - t, cy - t, cx + e, cy + t]);
    if (py) part([cx - t, cy - t, cx + t, cy + e]);
    K.cyl(cx + 0.05, cy - 0.02, 0.05, z + 6.2, z + 7.6, '#8c6d4b', { lw: 0.35, top: '#e6d6a0' });
  } },
  { id: 'tableset', label: 'Table and chairs', w: 1, d: 1, h: 8, draw(K, o) {
    const F = frame(K, o), k = Math.floor(o.v * 997), d1 = o.v < 0.3 ? -1 : k % 6, d2 = o.v < 0.65 ? -1 : (k >> 3) % 6;
    [[0.38, 0.2, 'n'], [0.62, 0.2, 'n'], [0.38, 0.82, 's'], [0.62, 0.82, 's'], [0.12, 0.5, 'w'], [0.88, 0.5, 'e']].forEach(([a, b, back], i) => {
      if (i === d1 || i === d2) return;
      F.box(a - 0.08, a + 0.08, b - 0.08, b + 0.08, 2.4, 3, WOOD);
      const r = { n: [a - 0.08, a + 0.08, b - 0.08, b - 0.05], s: [a - 0.08, a + 0.08, b + 0.05, b + 0.08], w: [a - 0.08, a - 0.05, b - 0.08, b + 0.08], e: [a + 0.05, a + 0.08, b - 0.08, b + 0.08] }[back];
      F.box(...r, 3, 7, WOOD_D);
    });
    F.box(0.25, 0.75, 0.35, 0.65, 0, 4.2, WOOD_D, { noTop: true });
    F.box(0.23, 0.77, 0.33, 0.67, 4.2, 4.8, WOOD_L);
    F.at3(0.42, 0.46, 4.8, (p, x, y) => K.cyl(x, y, 0.04, o.z + 4.8, o.z + 6, '#8c6d4b', { lw: 0.3, top: '#e6d6a0' }));
    F.done();
  } },
  { id: 'feastset', label: 'Long table and benches', w: 2, d: 1, h: 6, draw(K, o) {
    const F = frame(K, o);
    for (const b of [0.2, 0.8]) F.box(0.12, 0.88, b - 0.06, b + 0.06, 0, 2.6, WOOD);
    F.box(0.1, 0.9, 0.34, 0.66, 0, 4.2, WOOD_D, { noTop: true });
    F.box(0.08, 0.92, 0.32, 0.68, 4.2, 4.8, WOOD_L);
    for (const a of [0.2, 0.4, 0.6, 0.8]) F.at3(a, 0.42, 4.8, ([px, py]) => { const g = K.g; g.beginPath(); g.ellipse(px, py, 2, 1, 0, 0, TAU); g.fillStyle = '#e6dcc6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.3; g.stroke(); });
    F.done();
  } },
  { id: 'backbar', label: 'Back bar', w: 1, d: 1, h: 16, draw(K, o) {
    const F = frame(K, o);
    F.box(0.06, 0.94, 0.04, 0.3, 0, 5, WOOD, { top: WOOD_L });
    F.box(0.08, 0.92, 0.04, 0.12, 5, 15, WOOD_D, { top: WOOD });
    if (F.front) for (const z of [6, 9.5, 12.5]) { F.onFront(0.1, 0.9, 0.12, z, z + 2.6, '#3a2c1e', 0.3); for (let a = 0.12; a < 0.86; a += 0.08) F.onFront(a, a + 0.04, 0.121, z, z + 1.6 + (a * 37 % 1), pickv(['#5f8a4a', '#7a4a2a', '#c9d8d0', '#a8aeb0'], (a * 13 + z) % 1), 0.2); }
    F.done();
  } },
  { id: 'casks', label: 'Ale casks', w: 1, d: 1, h: 10, draw(K, o) {
    const F = frame(K, o);
    F.box(0.12, 0.88, 0.08, 0.4, 0, 1.2, WOOD_D);
    for (const [a, z] of [[0.3, 1.2], [0.7, 1.2], [0.5, 6]]) F.at3(a, 0.42, z, ([px, py]) => { const g = K.g; g.beginPath(); g.ellipse(px, py - 3, 3.4, 3.4, 0, 0, TAU); g.fillStyle = '#9a6a3a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke(); g.beginPath(); g.ellipse(px, py - 3, 2.6, 2.6, 0, 0, TAU); g.strokeStyle = IRON; g.lineWidth = 0.4; g.stroke(); g.fillStyle = GOLD; g.fillRect(px - 0.4, py - 2.2, 0.8, 1.4); });
    F.done();
  } },
  { id: 'coatrack', label: 'Coat stand', w: 1, d: 1, h: 12, draw(K, o) { const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2]; K.seg([cx, cy, o.z], [cx, cy, o.z + 11], WOOD_D, 1.2); const [px, py] = K.P(cx, cy, o.z + 10), g = K.g; g.beginPath(); g.moveTo(px - 0.5, py); g.lineTo(px - 3, py + 7); g.lineTo(px, py + 6.5); g.closePath(); g.fillStyle = pickv(CLOTHS, o.v); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); g.fillStyle = '#5a4030'; g.fillRect(px - 1.6, py - 3, 3.2, 1.6); g.strokeRect(px - 1.6, py - 3, 3.2, 1.6); } },
  { id: 'sacks', label: 'Grain sacks', w: 1, d: 1, h: 4, draw(K, o) { const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2]; for (const [dx, dy, r] of [[-0.12, -0.05, 2.6], [0.12, 0.05, 2.8]]) { const [px, py] = K.P(cx + dx, cy + dy, o.z); K.blob(px, py - r, r * 0.9, r, '#c8b28a', 0.45); } } },
  { id: 'firewood', label: 'Firewood', w: 1, d: 1, h: 4, draw(K, o) { const F = frame(K, o); F.box(0.2, 0.8, 0.3, 0.7, 0, 2.6, '#8c6d4b', { top: '#d8bb8a' }); F.done(); } },
  { id: 'noticeboard', label: 'Notice board', w: 1, d: 1, h: 11, draw(K, o) {
    const F = frame(K, o);
    for (const a of [0.18, 0.82]) F.box(a - 0.03, a + 0.03, 0.46, 0.52, 0, 10, WOOD_D);
    F.box(0.14, 0.86, 0.46, 0.52, 4.5, 10, '#b08a58');
    for (const [a, z] of [[0.24, 6.5], [0.44, 7.2], [0.62, 5.6], [0.7, 7.6]]) F.onFront(a, a + 0.12, 0.52, z, z + 1.6, LINEN, 0.25);
    F.done();
  } },
  /* the smithy's: a forge, an anvil, a quenching trough, a grindstone, racks of tools and armour, coal and bar iron */
  { id: 'forge', label: 'Forge', w: 1, d: 1, h: 18, draw(K, o) {
    const F = frame(K, o);
    F.box(0.15, 0.85, 0.04, 0.5, 0, 5, BRICK, { top: '#3a2c20' });
    F.at3(0.5, 0.27, 5, ([px, py]) => { const g = K.g; glow(g, px, py - 1, 14, 0.7); for (const dx of [-2.4, 0, 2.4]) flame(g, px + dx, py + 0.6, dx ? 0.7 : 1); });
    F.box(0.1, 0.9, 0.02, 0.44, 10, 11.4, STONE);
    F.box(0.32, 0.68, 0.02, 0.2, 11.4, 18, STONE);
    for (const a of [0.14, 0.86]) F.box(a - 0.03, a + 0.03, 0.4, 0.46, 5, 10, IRON);
    F.box(0.0, 0.13, 0.18, 0.46, 2.6, 4.2, '#7a4a2a');
    F.done();
  } },
  { id: 'anvil', label: 'Anvil', w: 1, d: 1, h: 5, draw(K, o) {
    const F = frame(K, o);
    F.box(0.38, 0.62, 0.38, 0.62, 0, 2.8, WOOD, { top: '#d8bb8a' });
    F.box(0.42, 0.58, 0.44, 0.56, 2.8, 3.6, IRON);
    F.box(0.3, 0.72, 0.42, 0.58, 3.6, 4.6, IRON, { top: '#8a8e94' });
    F.box(0.18, 0.3, 0.46, 0.54, 3.9, 4.5, IRON);
    F.done();
  } },
  { id: 'quench', label: 'Quenching trough', w: 1, d: 1, h: 4, draw(K, o) { const F = frame(K, o); F.box(0.1, 0.9, 0.36, 0.76, 0, 3, STONE, { top: '#4f7480' }); F.at3(0.72, 0.56, 3, ([px, py]) => { const g = K.g; g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); g.moveTo(px - 0.6, py); g.lineTo(px - 0.6, py - 5); g.moveTo(px + 0.6, py); g.lineTo(px + 0.6, py - 5); g.stroke(); }); F.done(); } },
  { id: 'grindstone', label: 'Grindstone', w: 1, d: 1, h: 8, draw(K, o) {
    const F = frame(K, o);
    for (const [a, b] of [[0.25, 0.4], [0.75, 0.4], [0.25, 0.62], [0.75, 0.62]]) F.box(a - 0.03, a + 0.03, b - 0.03, b + 0.03, 0, 3.4, WOOD_D, { noTop: true });
    F.box(0.22, 0.78, 0.37, 0.65, 3.4, 4, WOOD);
    F.at3(0.5, 0.51, 4, ([px, py]) => { const g = K.g; g.beginPath(); g.ellipse(px, py - 2.6, F.front === (o.face % 2 === 0) ? 3.6 : 2.2, 3.6, 0, 0, TAU); g.fillStyle = '#a59a85'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke(); g.fillStyle = IRON; g.fillRect(px - 0.5, py - 3.1, 1, 1); });
    F.done();
  } },
  { id: 'toolrack', label: 'Smith\'s tool rack', w: 1, d: 1, h: 10, draw(K, o) {
    const F = frame(K, o);
    F.box(0.12, 0.88, 0.32, 0.42, 0, 0.8, WOOD_D);
    for (const a of [0.15, 0.85]) F.box(a - 0.03, a + 0.03, 0.34, 0.4, 0.8, 8, WOOD_D);
    F.box(0.12, 0.88, 0.34, 0.4, 7.2, 7.8, WOOD);
    for (const [a, k] of [[0.3, 0], [0.42, 1], [0.58, 0], [0.7, 1]]) F.at3(a, 0.38, 7.2, ([px, py]) => { const g = K.g; g.strokeStyle = k ? IRON : WOOD_D; g.lineWidth = 0.6; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + 4.4); g.stroke(); if (!k) { g.fillStyle = IRON; g.fillRect(px - 1.2, py + 4.2, 2.4, 1.2); } });
    F.done();
  } },
  { id: 'armorstand', label: 'Armour stand', w: 1, d: 1, h: 13, draw(K, o) {
    const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2], [px, py] = K.P(cx, cy, o.z), g = K.g;
    K.seg([cx, cy, o.z], [cx, cy, o.z + 6], WOOD_D, 1.2);
    g.beginPath(); g.moveTo(px - 3.4, py - 11.5); g.lineTo(px + 3.4, py - 11.5); g.lineTo(px + 2.8, py - 5.5); g.lineTo(px - 2.8, py - 5.5); g.closePath(); g.fillStyle = '#a8aeb0'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
    g.beginPath(); g.arc(px, py - 13, 2, Math.PI, 0); g.lineTo(px + 2, py - 12); g.lineTo(px - 2, py - 12); g.closePath(); g.fillStyle = '#7d8288'; g.fill(); g.stroke();
  } },
  { id: 'ironstock', label: 'Coal and bar iron', w: 1, d: 1, h: 4, draw(K, o) { const F = frame(K, o); F.box(0.1, 0.48, 0.3, 0.75, 0, 2.6, WOOD, { top: '#2a2420' }); F.box(0.54, 0.9, 0.38, 0.75, 0, 1.6, IRON, { top: '#7d8288' }); F.done(); } },
  /* the alchemist's: a workbench with its apparatus, a bubbling cauldron, shelves of potions, herbs drying, a cabinet of
     little drawers */
  { id: 'alchemybench', label: 'Alchemist\'s workbench', w: 1, d: 1, h: 12, draw(K, o) {
    const F = frame(K, o);
    F.box(0.04, 0.96, 0.05, 0.4, 0, 5, WOOD_D);
    F.box(0.02, 0.98, 0.03, 0.42, 5, 5.6, WOOD_L);
    F.box(0.06, 0.94, 0.02, 0.12, 9, 9.5, WOOD_D);
    for (let k = 0; k < 7; k++) F.at3(0.12 + k * 0.12, 0.07, 9.5, ([px, py]) => { K.g.fillStyle = POTIONS[k % POTIONS.length]; K.g.fillRect(px - 0.7, py - 1.6, 1.4, 1.6); });
    F.at3(0.22, 0.22, 5.6, (p, x, y) => { K.cyl(x, y, 0.06, o.z + 5.6, o.z + 8, COPPER, { lw: 0.4 }); });
    F.at3(0.5, 0.25, 5.6, ([px, py]) => { const g = K.g; g.beginPath(); g.arc(px, py - 1.6, 1.6, 0, TAU); g.fillStyle = '#a46ac8'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); });
    F.at3(0.72, 0.28, 5.6, ([px, py]) => { const g = K.g; g.fillStyle = LINEN; g.fillRect(px - 2, py - 0.8, 4, 1.4); g.strokeStyle = INK; g.lineWidth = 0.3; g.strokeRect(px - 2, py - 0.8, 4, 1.4); });
    F.at3(0.86, 0.22, 5.6, (p, x, y) => candle(K, x, y, o.z + 5.6));
    F.done();
  } },
  { id: 'brewcauldron', label: 'Alchemist\'s cauldron', w: 1, d: 1, h: 9, draw(K, o) {
    const [cx, cy] = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2], g = K.g, [px, py] = K.P(cx, cy, o.z);
    glow(g, px, py - 1, 9, 0.45);
    K.cyl(cx, cy, 0.24, o.z, o.z + 1.6, BRICK, { lw: 0.5 });
    const c = K.cyl(cx, cy, 0.2, o.z + 1.6, o.z + 5.6, '#3e4248', { lw: 0.5, top: '#7fd06a' });
    g.fillStyle = 'rgba(184,232,168,0.6)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(c.x + k * 1.2, c.ty - 3 - k * 3, 1.6 + k * 0.6, 0, TAU); g.fill(); }
  } },
  { id: 'potionshelf', label: 'Potion shelves', w: 1, d: 1, h: 15, draw(K, o) {
    const F = frame(K, o), r = o.r;
    F.box(0.12, 0.88, 0.15, 0.45, 0, 14.5, WOOD_D, { top: WOOD });
    if (F.front) for (const z of [1, 4.6, 8.2, 11.6]) {
      F.onFront(0.16, 0.84, 0.45, z, z + 3.2, '#3a2c1e', 0.3);
      let a = 0.18; while (a < 0.8) { const h = 1.4 + r() * 1.2; F.onFront(a, a + 0.05, 0.451, z, z + h, pickv(POTIONS, r()), 0.2); a += 0.09; }
    }
    F.done();
  } },
  { id: 'herbrack', label: 'Herb drying rack', w: 1, d: 1, h: 10, draw(K, o) {
    const F = frame(K, o);
    for (const a of [0.14, 0.86]) F.box(a - 0.03, a + 0.03, 0.44, 0.5, 0, 9, WOOD);
    for (const z of [5, 8.4]) F.box(0.12, 0.88, 0.45, 0.49, z, z + 0.5, WOOD_L);
    for (const z of [5, 8.4]) for (let k = 0; k < 5; k++) F.at3(0.24 + k * 0.13, 0.47, z, ([px, py]) => { K.g.fillStyle = HERBS[(k + z) % HERBS.length | 0]; K.g.fillRect(px - 0.8, py, 1.6, 2.4); });
    F.done();
  } },
  { id: 'apothecary', label: 'Apothecary drawers', w: 1, d: 1, h: 10, draw(K, o) {
    const F = frame(K, o);
    F.box(0.12, 0.88, 0.2, 0.62, 0, 8, WOOD, { top: WOOD_L });
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { const a = 0.15 + k * 0.18, z = 0.6 + r * 1.85; F.onFront(a, a + 0.15, 0.62, z, z + 1.5, WOOD_D, 0.25); F.onFront(a + 0.06, a + 0.09, 0.621, z + 0.6, z + 0.9, GOLD, 0); }
    for (const [a, col] of [[0.3, '#e0a23a'], [0.5, '#cfe4e4'], [0.7, '#a46ac8']]) F.at3(a, 0.4, 8, (p, x, y) => K.cyl(x, y, 0.05, o.z + 8, o.z + 9.6, col, { lw: 0.35, top: '#8e6a44' }));
    F.done();
  } }
];
/* the furniture that stands back against a wall, and so may stand on a room wall's own tile, in front of it on the side
   it faces (tiles/index.js standsOnWall) */
const WALLSIDE = new Set(['potionshelf', 'apothecary', 'herbrack', 'toolrack', 'weaponrack', 'armorstand', 'ironstock', 'quench', 'grindstone', 'bookshelf', 'wardrobe', 'dresser', 'desk', 'chest']);
for (const a of FURNITURE) if (WALLSIDE.has(a.id)) a.wallside = true;
/* soft shadows: walls are thin, furniture sits inside its tile */
for (const a of INTERIOR) a.shade = a.id === 'hearth' || a.id === 'stairs' ? 0.12 : 0.38;
for (const a of FURNITURE) a.shade = 0.16;

export { FURNITURE, INTERIOR };
