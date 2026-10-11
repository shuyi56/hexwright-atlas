import { GOLD, TREE } from '../render/palette.js';
import { MAT, ROOF, cone, house, stoneSh } from './buildings.js';
import { R, hash, lum, tone, toneOf } from './forge.js';
import { broadleaf, mass, trunk } from './foliage.js';

/* ================= tactical view: the elven pieces =================
   The elven wood's buildings, trees and props (tiles/elven.js) as pixel art for the close camera, on the forge
   like the rest: a hall of coursed moonstone with lancet windows of teal glass under a verdigris roof, gold along
   its eaves and a leaf finial at each end of the ridge; a slender spire with a balcony ring and a needle of
   verdigris; a flet, a round house on a platform in a silver-barked tree under its gold crown; the mallorn; a
   weeping silver willow; moonflowers, a lantern on a silver crook and a moonwell, whose light (glow) is never
   inked over. */
const MOON = '#ece9df', MOON_D = '#d6d2c4', VERD = '#6f9c86', GLASS = '#5f8f8c', DOOR = '#56785a', BARK = '#d6d1c2', GLOW = '#e4f6ea';
const lit = (hex, k = 1) => Object.assign(R(hex)[k].slice(), { glow: 1 });
/* a gold rod with a leaf at its top, standing at world (x, y, z) */
function finial(F, x, y, z, h, part = 40) {
  const G = R(GOLD);
  F.line([x, y, z], [x, y, z + h], G[2], part, 1);
  for (const [di, dj, k] of [[0, -1, 0], [-1, 0, 1], [1, 0, 2], [0, 1, 2], [0, -2, 1]]) F.dot(x, y, z + h + 1, G[k], part, 2, di, dj);
}
/* a round wall of moonstone from z0 to z1 with slit windows of glass at [ang, z] and a pointed door facing the
   viewer when the piece faces a seen side */
function roundWall(F, cx, cy, r, z0, z1, part, slits, door) {
  const circ = r * Math.PI * 2 * 16, G = R(GOLD), D = R(DOOR), Gl = R(GLASS);
  F.lathe(cx, cy, t => [r, z0 + (z1 - z0) * t], (p, ang, t, i, j, n) => {
    const v = p[2] - z0, u = ang * circ, k = toneOf(lum(...n)), da = Math.abs(((ang - 0.125 + 1.5) % 1) - 0.5) * circ;
    if (door && da < 3.6 && v < 12 - Math.max(0, da - 1) * 1.2) return da > 2.8 || v > 11 - Math.max(0, da - 1) * 1.2 ? G[2] : tone(D, k + (Math.round(da) % 2 ? 0.5 : 0), i, j);
    for (const [a, zz] of slits) { const du = Math.abs(((ang - a + 1.5) % 1) - 0.5) * circ; if (du < 1.6 && Math.abs(p[2] - zz) < 4 - du * 0.6) return du > 1 ? G[2] : Gl[p[2] > zz ? 1 : 3]; }
    return MAT.ashlar(MOON, 4, 7)(u, v, i, j, k);
  }, part);
}
/* a weeping strand of leaves from screen (sx, sy) hanging len pixels, swaying by bend */
function strand(F, sx, sy, d, len, bend, L, part) {
  for (let k = 0; k < len; k++) { const t = k / len, x = Math.floor(sx + bend * t * t), y = Math.floor(sy + k); F.put(x, y, d, L[k % 3 === 0 ? 1 : t > 0.7 ? 3 : 2], part); if (k % 3 === 1) F.put(x + (bend > 0 ? 1 : -1), y, d, L[3], part); }
}

const DESIGNS = {
  elvenhall: { top: 92, draw(F, o) {
    const r = house(F, o, { mat: MAT.ashlar(MOON, 4, 9), h: 32, rh: 24, roof: ROOF.copper(VERD), ov: 0.12, edge: '#4f7a6c',
      win: { w: 5, h: 14, kind: 'lancet', frame: '#c9a24f', glass: GLASS, every: 11, sill: MOON_D }, door: { w: 8, h: 17, kind: 'arch', col: DOOR }, plinth: 4, trim: '#c9a24f', chimneys: [] });
    /* gold along the top of the seen walls */
    const G = R(GOLD), { x0, y0, x1, y1 } = r;
    F.line([x0, y1, 30], [x1, y1, 30], G[1], 3, 1); F.line([x1, y1, 30], [x1, y0, 30], G[2], 3, 1);
    /* a leaf finial at each end of the ridge */
    const ax = o.axis === 'x', cb = ax ? (y0 + y1) / 2 : (x0 + x1) / 2;
    for (const e of ax ? [x0 - 0.04, x1 + 0.04] : [y0 - 0.04, y1 + 0.04]) finial(F, ax ? e : cb, ax ? cb : e, r.roof.top, 9);
  } },
  elvenspire: { top: 150, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2, G = R(GOLD);
    F.lathe(cx, cy, t => [0.36, t * 4], (p, a, t, i, j, n) => tone(R(MOON_D), toneOf(lum(...n)) + ((p[2] | 0) === 3 ? -0.6 : 0), i, j), 1);
    roundWall(F, cx, cy, 0.27, 4, 66, 2, [[0.05, 30], [0.2, 48], [0.1, 60]], o.face < 2);
    /* the balcony: a ledge, a gold rail on slender posts */
    F.lathe(cx, cy, t => [0.27 + t * 0.13, 64 + t * 2], (p, a, t, i, j, n) => tone(R(MOON_D), toneOf(lum(...n)) - 0.3, i, j), 3);
    F.lathe(cx, cy, t => [0.4, 66 + t * 1.2], (p, a, t, i, j, n) => tone(R(MOON_D), toneOf(lum(...n)) + 0.4, i, j), 3);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; if (Math.cos(a) + Math.sin(a) < -0.5) continue; const x = cx + Math.cos(a) * 0.38, y = cy + Math.sin(a) * 0.38; F.line([x, y, 67], [x, y, 71], G[2], 4, 0.3); }
    F.lathe(cx, cy, t => [0.39, 71 + t], (p, a, t, i, j) => G[a > 0.6 || a < 0.15 ? 1 : 2], 4);
    roundWall(F, cx, cy, 0.21, 67, 82, 5, [[0.125, 75]], false);
    cone(F, cx, cy, 0.22, 82, 50, ROOF.copper(VERD), 6, 0.07);
    finial(F, cx, cy, 132, 6);
  } },
  flet: { top: 150, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2, seed = Math.floor(o.v * 97), wood = R('#9a7a50'), G = R(GOLD);
    trunk(F, cx, cy, 0.17, 0, 92, BARK, 1);
    /* curved brackets from the trunk out under the platform's rim */
    for (const a of [Math.PI / 4, -0.15, Math.PI / 2 + 0.15]) { const c = Math.cos(a), s = Math.sin(a); for (let k = 0; k <= 8; k++) { const t = k / 8, rr = 0.17 + t * 0.3, z = 20 + 11 * Math.sin(t * Math.PI / 2); F.dot(cx + c * rr, cy + s * rr, z, wood[t < 0.5 ? 2 : 3], 2, 1); F.dot(cx + c * rr, cy + s * rr, z - 1, wood[4], 2, 1); } }
    F.lathe(cx, cy, t => [0.48, 31 + t * 3], (p, a, t, i, j, n) => tone(wood, toneOf(lum(...n)) + ((Math.floor(a * 48) % 3) === 0 ? 0.7 : 0), i, j), 3);
    F.lathe(cx, cy, t => [0.48 * (1 - t), 34], (p, a, t, i, j) => tone(R('#b89a6a'), 1.2 + (Math.floor(t * 9) % 2 ? 0.5 : 0), i, j), 3);
    /* a gold rail round the platform's edge */
    for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; if (Math.cos(a) + Math.sin(a) < -0.6) continue; const x = cx + Math.cos(a) * 0.46, y = cy + Math.sin(a) * 0.46; F.line([x, y, 34], [x, y, 38], G[2], 4, 0.3); }
    F.lathe(cx, cy, t => [0.46, 38 + t], (p, a, t, i, j) => G[a > 0.6 || a < 0.15 ? 1 : 2], 4);
    /* the round house: boards of pale wood, a door toward the viewer, a lit window */
    const circ = 0.27 * Math.PI * 2 * 16;
    F.lathe(cx, cy, t => [0.27, 34 + t * 15], (p, ang, t, i, j, n) => {
      const k = toneOf(lum(...n)), u = ang * circ, v = p[2] - 34, da = Math.abs(((ang - 0.125 + 1.5) % 1) - 0.5) * circ, dw = Math.abs(((ang - 0.3 + 1.5) % 1) - 0.5) * circ;
      if (da < 3 && v < 11 - Math.max(0, da - 1)) return da > 2.2 ? G[2] : tone(R(DOOR), k, i, j);
      if (dw < 2 && v > 5 && v < 10) return dw > 1.3 ? G[2] : lit('#f2e2a0', v > 7 ? 0 : 1);
      return tone(R('#d9c49a'), k + (u % 3 < 0.9 ? 0.8 : 0), i, j);
    }, 5);
    cone(F, cx, cy, 0.3, 49, 18, ROOF.copper(VERD), 6, 0.06);
    finial(F, cx, cy, 66, 4, 7);
    /* the crown of gold leaves overhead */
    for (const [dx, dy, k, n] of [[-14, 6, 0.6, 0], [14, 7, 0.6, 1], [0, 14, 0.62, 2], [-8, -6, 0.6, 3], [9, -5, 0.6, 4], [0, 2, 0.75, 5]]) mass(F, cx, cy, 104, dx, dy, 20 * k, 20 * k * 0.86, TREE.mallorn, 10 + n, seed + n * 5, { crown: 20 });
  } },
  mallorn: { top: 92, draw(F, o) {
    broadleaf(F, o, TREE.mallorn, { zc: 50 + o.v * 4, r: 15 + o.v * 2, tr: 0.075, bark: BARK, tall: 1.18,
      lobes: [[-0.55, 0.3, 0.6], [0.55, 0.28, 0.6], [0, 0.55, 0.6], [-0.35, -0.35, 0.58], [0.35, -0.32, 0.56], [0, -0.85, 0.55], [0, 0, 0.75]] });
  } },
  willow: { top: 70, draw(F, o) {
    const x = o.w / 2 + (o.v - 0.5) * 0.14, y = o.d / 2, seed = Math.floor(o.v * 61), L = R(TREE.willow[0]), D = R(TREE.willow[1]), zc = 38;
    trunk(F, x, y, 0.07, 0, zc - 4, BARK, 1);
    const [sx, sy] = F.P(x, y, zc), d0 = F.depth(x, y, zc);
    /* the strands behind the trunk, the crown's dome, then the strands in front */
    const strands = Array.from({ length: 22 }, (_, k) => { const a = (k / 22) * Math.PI * 2 + seed; return { a, front: Math.sin(a) > -0.15 }; });
    for (const s of strands.filter(q => !q.front)) strand(F, sx + Math.cos(s.a) * 15, sy + 2 + Math.sin(s.a) * 4, d0 - 6, 22 + hash(s.a * 99 | 0, seed) * 8, Math.cos(s.a) * 2, D, 3);
    for (const [dx, dy, k, n] of [[-8, 3, 0.62, 0], [8, 3, 0.6, 1], [0, -4, 0.7, 2], [0, 4, 0.6, 3]]) mass(F, x, y, zc, dx, dy, 14 * k, 14 * k * 0.7, TREE.willow, 10 + n, seed + n * 5, { crown: 14, cell: 4 });
    for (const s of strands.filter(q => q.front)) strand(F, sx + Math.cos(s.a) * 15, sy + 3 + Math.sin(s.a) * 4, d0 + 18 + Math.sin(s.a) * 6, 20 + hash(s.a * 99 | 0, seed) * 9, Math.cos(s.a) * 2.5, L, 20);
  } },
  moonflowers: { top: 10, draw(F, o) {
    const Gr = R('#5c773f');
    for (let k = 0; k < 11; k++) {
      const x = 0.15 + hash(k, 1, o.v * 9 | 0) * 0.7, y = 0.15 + hash(k, 2, o.v * 9 | 0) * 0.7, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), h = 3 + (k % 3), fx = Math.floor(sx), fy = Math.floor(sy - h);
      for (let z = 0; z < h; z++) F.put(fx, Math.floor(sy - z), d0, Gr[2], 1 + k);
      F.put(fx + 1, Math.floor(sy - 1), d0, Gr[1], 1 + k);
      for (const [a, b, t] of [[0, -1, 0], [-1, 0, 0], [1, 0, 1], [0, 1, 2], [-1, -1, 1], [1, -1, 2]]) F.put(fx + a, fy + b, d0 + 0.5, lit('#f4f6f2', t), 1 + k);
      F.put(fx, fy, d0 + 0.6, lit('#9fb8dc', 1), 1 + k);
    }
  } },
  elvenlantern: { top: 36, draw(F, o) {
    const x = o.w / 2, y = o.d / 2, [sx, sy] = F.P(x, y, 0), d0 = F.depth(x, y, 0), S = R('#cfd2cc'), G = R(GOLD), dir = o.face % 2 ? 1 : -1;
    /* a silver post curling over into a crook */
    for (let z = 0; z < 26; z++) { F.put(Math.floor(sx), Math.floor(sy - z), d0, S[z < 2 ? 3 : 1], 1); F.put(Math.floor(sx) + 1, Math.floor(sy - z), d0, S[3], 1); }
    for (const [i, j] of [[0, -27], [1, -28], [2, -28], [3, -28], [4, -27], [5, -26], [5, -25]]) F.put(Math.floor(sx) + dir * i, Math.floor(sy) + j, d0 + 1, S[j < -27 ? 1 : 2], 2);
    for (const [i, j] of [[-1, 0], [0, 0], [1, 0], [2, 0]]) F.put(Math.floor(sx) + i, Math.floor(sy) + j, d0 + 0.5, S[2], 1);
    /* the lantern: a teardrop of pale glass in a gold cap */
    const lx = Math.floor(sx) + dir * 5, ly = Math.floor(sy) - 24;
    F.put(lx, ly, d0 + 2, G[1], 3); F.put(lx - 1, ly + 1, d0 + 2, G[2], 3); F.put(lx + 1, ly + 1, d0 + 2, G[2], 3);
    for (const [i, j, k] of [[-1, 2, 0], [0, 2, 0], [1, 2, 1], [-1, 3, 0], [0, 3, 0], [1, 3, 1], [-1, 4, 1], [0, 4, 1], [1, 4, 2], [0, 5, 2]]) F.put(lx + i, ly + j, d0 + 2, lit(GLOW, k), 3);
    F.put(lx, ly + 6, d0 + 2, G[2], 3);
  } },
  moonwell: { top: 34, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2, G = R(GOLD);
    F.lathe(cx, cy, t => [0.36, t * 7], (p, a, t, i, j, n) => { const k = toneOf(lum(...n)); return (p[2] | 0) === 2 ? G[k < 2 ? 1 : 2] : MAT.ashlar(MOON, 3, 5)(a * 36, p[2], i, j, k); }, 1);
    F.lathe(cx, cy, t => [0.36 - t * 0.08, 7], (p, a, t, i, j) => R(MOON_D)[t < 0.4 ? 1 : 2], 2);
    F.lathe(cx, cy, t => [0.28 * (1 - t), 6], (p, a, t, i, j) => (hash(i, j, 7) < 0.05 ? lit('#f4fbf6', 0) : lit('#9fd0c4', t > 0.6 ? 0 : (i + j) % 5 === 0 ? 0 : 1)), 3);
    /* a carved arch over the back of the rim: two posts of moonstone and a gold-edged lintel bowed between them,
       a leaf at its crown */
    const A = [cx - 0.33, cy], B = [cx, cy - 0.33];
    for (const [x, y] of [A, B]) F.box(x - 0.04, y - 0.04, x + 0.04, y + 0.04, 7, 18, { y: stoneSh(MOON, 'y', 3, 3), x: stoneSh(MOON, 'x', 3, 3), top: (p, a, b, i, j) => R(MOON)[1] }, 4);
    for (let k = 0; k <= 16; k++) { const t = k / 16, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t, z = 18 + 4 * Math.sin(t * Math.PI); F.dot(x, y, z, R(MOON)[1], 4, 1); F.dot(x, y, z - 1, G[2], 4, 1); F.dot(x, y, z + 1, R(MOON)[0], 4, 1); }
    finial(F, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, 23, 1, 5);
  } }
};

export { DESIGNS };
