import { GOLD, TREE } from '../render/palette.js';
import { MAT, ROOF, WALL_T, cone, planeTone, stoneSh } from './buildings.js';
import { R, TILE, hash, lum, tone, toneOf } from './forge.js';
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

/* ---------- high elven building: tracery, swept roofs ----------
   The houses of a high elven valley, after Rivendell: tall pointed windows filled with stone tracery, roofs that
   sweep down in a concave curve and flick up at the eaves, gold along every edge, slender columns and open
   arcades. tracery(du, dv, hw, h) is the shape of one lancet, du across from its middle and dv up from its sill,
   hw its half-width and h its height to the point: 0 outside it, 1 the stone of its frame and tracery, 2 its
   glass (or opening), 3 the glass of the oculus in its head. Above the springing line the sides draw in to a
   point; a mullion runs up the middle and branches there in a Y, an oculus rings the head, and a tall light has
   a transom. A narrow one keeps only its frame and mullion. */
function tracery(du, dv, hw, h) {
  if (dv < 0 || dv >= h) return 0;
  const sh = h - hw * 1.9, ad = Math.abs(du), t = dv > sh ? (dv - sh) / (h - sh) : 0, lim = hw * (1 - Math.pow(t, 1.5));
  if (ad >= lim) return 0;
  if (ad >= lim - 1 || dv < 1) return 1;
  if (hw < 2.5) return 2;
  if (ad < 0.6 && dv < sh + 0.6) return 1;
  const yy = dv - sh; if (yy >= 0 && yy < hw * 1.1 && Math.abs(ad - yy * 0.85) < 0.6) return 1;
  if (hw >= 3.5) { const oc = sh + (h - sh) * 0.5, r = hw * 0.42, d = Math.hypot(du, dv - oc); if (Math.abs(d - r) < 0.55) return 1; if (d < r) return 3; }
  if (h >= 16 && Math.abs(dv - sh * 0.55) < 0.5) return 1;
  return 2;
}
/* the colours of a tracery window: frame stone lit by the wall's tone, teal glass leaded, a pale oculus */
function traceryCol(k, t, i, j, dv, h, lit = false) {
  if (k === 1) return tone(R(MOON), t - 0.7, i, j);
  if (k === 3) return lit ? glowOf('#f2e8b8', 0) : R('#a8d0c8')[1];
  if (lit) return glowOf('#f2e2a0', dv > h * 0.5 ? 0 : 1);
  return R(GLASS)[dv > h * 0.6 ? 1 : (i + j) % 7 === 0 ? 1 : 3];
}
const glowOf = (hex, k) => Object.assign(R(hex)[k].slice(), { glow: 1 });
/* A wall of coursed moonstone on face 'y' or 'x' of [x0, y0, x1, y1] from z0: spec { h, floors, win: { w, h, at,
   every, lit }, door: { w, h } (on this face), bands: [z, ...] gold string courses, plinth }. */
function elfWall(face, x0, y0, x1, y1, z0, spec) {
  const len = face === 'y' ? (x1 - x0) * 16 : (y1 - y0) * 16, t = WALL_T[face], floors = spec.floors || 1, fh = spec.h / floors, win = spec.win, door = spec.door;
  const nwin = win ? Math.max(1, Math.floor(len / (win.every || 14))) : 0, G = R(GOLD);
  return (p, a, b, i, j) => {
    const u = face === 'y' ? (p[0] - x0) * 16 : (y1 - p[1]) * 16, v = p[2] - z0;
    if (door) {
      const du = u - (door.u ?? len / 2), k = tracery(du, v, door.w / 2 + 1.5, door.h + 1.5);
      if (k) {
        const inner = tracery(du, v - 0.01, door.w / 2, door.h), spring = door.h - door.w * 0.95;
        if (!inner || k === 1 && Math.abs(du) >= door.w / 2) return G[(Math.abs(du) + v) % 3 < 1 ? 1 : 2];
        if (v < spring) return Math.abs(du) < 0.6 ? R(DOOR)[4] : tone(R(DOOR), t + (Math.round(du + 9) % 2 ? 0.5 : 0), i, j);
        return inner === 1 ? tone(R(MOON), t - 0.7, i, j) : traceryCol(inner, t, i, j, v, door.h, true);
      }
    }
    if (win) for (let f = 0; f < floors; f++) {
      const vb = f * fh + (win.at ?? 4), dv = v - vb;
      if (dv < -2 || dv > win.h + 1) continue;
      for (let m = 0; m < nwin; m++) {
        const uc = len * (m + 0.5) / nwin, du = u - uc;
        if (door && f === 0 && Math.abs(uc - (door.u ?? len / 2)) < door.w / 2 + win.w / 2 + 3) continue;
        if (dv >= -1.5 && dv < 0 && Math.abs(du) < win.w / 2 + 1.5) return tone(R(MOON), t - 0.8, i, j);
        const k = tracery(du, dv, win.w / 2, win.h); if (k) return traceryCol(k, t, i, j, dv, win.h, win.lit);
        /* a hood-mould: a gold line following the arch a pixel out */
        if (tracery(du, dv, win.w / 2 + 1.2, win.h + 1.6) && dv > win.h * 0.45) return G[2];
      }
    }
    for (const bz of spec.bands || []) if (Math.abs(v - bz) < 0.8) return G[v > bz ? 1 : 2];
    if (spec.plinth && v < spec.plinth) return MAT.ashlar(MOON_D, 3, 6)(u, v, i, j, t);
    return MAT.ashlar(MOON, 4, 9)(u, v, i, j, t + (v > spec.h - 2 ? 0.8 : 0));
  };
}
/* a block's two seen walls; the door goes on the face o.face names when it is seen */
function elfBlock(F, o, x0, y0, x1, y1, z0, spec, part = 1) {
  const mk = face => elfWall(face, x0, y0, x1, y1, z0, Object.assign({}, spec, { door: spec.door && (face === 'y' ? o.face === 0 : o.face === 1) ? spec.door : null }));
  F.box(x0, y0, x1, y1, z0, z0 + spec.h, { y: mk('y'), x: mk('x') }, part);
}
/* A swept gable over [x0, y0, x1, y1] from height h, rising rh, its ridge along `along`: each slope falls in a
   concave curve from the ridge and flicks up at the eave by lift pixels, laid in strips; the seen gable end is
   filled by gableSh up to the curve, with gold barge boards along it, a gold fascia on the front eave and a leaf
   finial at each end of the ridge. */
function sweptGable(F, x0, y0, x1, y1, h, rh, along, mat, opt = {}) {
  const M = along === 'y' ? (a, b, z) => [b, a, z] : (a, b, z) => [a, b, z], [a0, b0, a1, b1] = along === 'y' ? [y0, x0, y1, x1] : [x0, y0, x1, y1];
  const ov = opt.ov ?? 0.16, g = opt.g ?? 0.08, cb = (b0 + b1) / 2, hd = cb - b0 + ov, N = 8, lift = opt.lift ?? 4, part = opt.part ?? 5, G = R(GOLD);
  const zAt = t => h - 2 + rh * Math.pow(t, 1.7) + lift * Math.pow(1 - t, 5), bb = (side, t) => cb + side * hd * (1 - t);
  const len = (a1 - a0 + 2 * g) * 16, T = rh + hd * TILE;
  for (const side of [-1, 1]) for (let k = 0; k < N; k++) {
    const t0 = k / N, t1 = (k + 1) / N, A = M(a0 - g, bb(side, t0), zAt(t0)), B = M(a1 + g, bb(side, t0), zAt(t0)), C = M(a1 + g, bb(side, t1), zAt(t1)), D = M(a0 - g, bb(side, t1), zAt(t1)), kk = planeTone(A, B, D);
    F.quad(A, B, C, D, (p, a, b, i, j) => mat(a * len, (t0 + (t1 - t0) * b) * T, i, j, kk, T), part);
  }
  /* the gold fascia along the front eave */
  F.quad(M(a0 - g, bb(1, 0), zAt(0)), M(a1 + g, bb(1, 0), zAt(0)), M(a1 + g, bb(1, 0), zAt(0) - 2), M(a0 - g, bb(1, 0), zAt(0) - 2), (p, a, b, i, j) => G[b > 0.5 ? 1 : 3], part);
  /* the gable end seen, filled up to the roof's underside */
  if (opt.gableSh) for (const side of [-1, 1]) for (let k = 0; k < N; k++) {
    const s0 = k / N, s1 = (k + 1) / N, bw = s => cb + side * (cb - b0) * (1 - s), zt = s => Math.max(h, zAt(1 - (cb - b0) * (1 - s) / hd) - 1.5);
    F.quad(M(a1, bw(s0), h - 0.5), M(a1, bw(s1), h - 0.5), M(a1, bw(s1), zt(s1)), M(a1, bw(s0), zt(s0)), opt.gableSh, opt.gablePart ?? 1);
  }
  /* gold barge boards along the curve, two pixels deep */
  for (const side of [-1, 1]) for (let k = 0; k < N; k++) {
    const t0 = k / N, t1 = (k + 1) / N;
    F.line(M(a1 + g, bb(side, t0), zAt(t0)), M(a1 + g, bb(side, t1), zAt(t1)), G[1], part + 1, 1.2);
    F.line(M(a1 + g, bb(side, t0), zAt(t0) - 1), M(a1 + g, bb(side, t1), zAt(t1) - 1), G[3], part + 1, 1.2);
  }
  const top = h - 2 + rh;
  for (const a of [a0 - g, a1 + g]) { const [x, y] = M(a, cb, 0); finial(F, x, y, top, 7); }
  return { top };
}
/* An arcade screen on a vertical plane from A to B (world points at the same height z0), hgt pixels tall, n bays:
   slender columns between pointed openings whose heads are filled with tracery, solid stone in the spandrels and
   a gold line along the top. Openings are holes, so what is behind shows through. */
function arcade(F, A, B, z0, hgt, n, part, shade = 0) {
  const lenpx = Math.hypot(B[0] - A[0], B[1] - A[1]) * 16, seg = lenpx / n, G = R(GOLD);
  F.quad([A[0], A[1], z0], [B[0], B[1], z0], [B[0], B[1], z0 + hgt], [A[0], A[1], z0 + hgt], (p, a, b, i, j) => {
    const u = a * lenpx, v = b * hgt, m = Math.min(n - 1, Math.floor(u / seg)), du = u - (m + 0.5) * seg, hw = seg / 2 - 1.3, oh = hgt - 4;
    if (v > hgt - 1.2) return G[1];
    const k = tracery(du, v, hw, oh), sh = oh - hw * 1.9;
    if (k === 1 && v > sh) return tone(R(MOON), 1.2 + shade, i, j);
    if (k) return null;
    if (Math.abs(du) > seg / 2 - 1.3) return tone(R(MOON), (Math.abs(du) > seg / 2 - 0.6 ? 1.0 : 2.0) + shade, i, j);
    return tone(R(MOON), 1.9 + shade + (hash(i >> 1, j >> 1) < 0.08 ? 0.5 : 0), i, j);
  }, part);
}

const DESIGNS = {
  elvenhall: { top: 100, draw(F, o) {
    const x0 = 0.12, y0 = 0.14, x1 = o.w - 0.12, y1 = o.d - 0.14, H = 34, ax = o.axis === 'x';
    elfBlock(F, o, x0, y0, x1, y1, 0, { h: H, win: { w: 7, h: 19, at: 6, every: 12 }, door: { w: 9, h: 21 }, bands: [H - 4], plinth: 4 }, 1);
    sweptGable(F, x0, y0, x1, y1, H, 26, o.axis, ROOF.slate(VERD), { ov: 0.14, lift: 5, gableSh: elfWall(ax ? 'x' : 'y', x0, y0, x1, y1, 0, { h: H + 40, win: { w: 7, h: 13, at: H + 3, every: 99, lit: true } }) });
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

/* the high elven buildings */
Object.assign(DESIGNS, {
  elvenpavilion: { top: 100, draw(F, o) {
    const G = R(GOLD), c0 = 0.2, c1 = 0.8, zc = 34;
    F.box(0.08, 0.08, 0.92, 0.92, 0, 3, { y: stoneSh(MOON_D, 'y', 3, 6), x: stoneSh(MOON_D, 'x', 3, 6), top: (p, a, b, i, j) => tone(R(MOON), 0.9 + ((Math.floor(p[0] * 8) + Math.floor(p[1] * 8)) % 2 ? 0.4 : 0), i, j) }, 1);
    F.box(0.14, 0.14, 0.86, 0.86, 3, 5, { y: stoneSh(MOON, 'y', 2, 5), x: stoneSh(MOON, 'x', 2, 5), top: (p, a, b, i, j) => tone(R(MOON), 0.6 + ((Math.floor(p[0] * 10) + Math.floor(p[1] * 10)) % 2 ? 0.5 : 0), i, j) }, 1);
    /* the arcades at the back first, then the columns, then the arcades in front */
    arcade(F, [c0, c0], [c1, c0], 5, zc - 5, 1, 2, 0.6); arcade(F, [c0, c0], [c0, c1], 5, zc - 5, 1, 2, 0.6);
    for (const [x, y] of [[c0, c0], [c1, c0], [c0, c1], [c1, c1]]) F.lathe(x, y, t => [t < 0.06 || t > 0.94 ? 0.06 : 0.04, 5 + t * (zc - 5)], (p, ang, t, i, j, n) => (t > 0.94 ? G[2] : tone(R(MOON), toneOf(lum(...n)) - 0.3 + (Math.floor(ang * 12) % 2 ? 0.4 : 0), i, j)), 3, 12);
    arcade(F, [c0, c1], [c1, c1], 5, zc - 5, 1, 4); arcade(F, [c1, c1], [c1, c0], 5, zc - 5, 1, 4, 0.7);
    /* a lantern hung in the middle */
    for (const [di, dj, k] of [[0, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 2]]) F.dot(0.5, 0.5, 20, glowOf(GLOW, k), 3, 0, di, dj);
    F.line([0.5, 0.5, 22], [0.5, 0.5, zc], G[2], 3, 0);
    /* an ogee roof of verdigris, ribbed in gold, under a leaf finial */
    F.lathe(0.5, 0.5, t => [0.44 * Math.pow(1 - t, 1.8) + 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - t), zc + t * 34], (p, ang, t, i, j, n) => (Math.abs(((ang * 8) % 1) - 0.5) > 0.45 ? G[t > 0.5 ? 1 : 2] : tone(R(VERD), toneOf(lum(...n)) + ((Math.floor(t * 12) % 2) ? 0.3 : 0), i, j)), 5);
    F.lathe(0.5, 0.5, t => [0.47 + 0.03 * (1 - t), zc - 1 + t], (p, ang, t, i, j) => G[ang > 0.6 || ang < 0.15 ? 1 : 2], 5);
    finial(F, 0.5, 0.5, zc + 34, 8);
  } },
  elvenrotunda: { top: 150, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2, G = R(GOLD), rd = 0.6, ra = 0.86;
    F.lathe(cx, cy, t => [0.94, t * 4], (p, a, t, i, j, n) => tone(R(MOON_D), toneOf(lum(...n)) + ((p[2] | 0) === 2 ? 0.7 : 0), i, j), 1);
    F.lathe(cx, cy, t => [0.94 * (1 - t), 4], (p, a, t, i, j) => tone(R(MOON), 0.8 + (Math.floor(t * 9) % 2 ? 0.4 : 0), i, j), 1);
    /* the drum, ringed with tall tracery windows */
    const circ = rd * Math.PI * 2 * 16, nw = 12, seg = circ / nw;
    F.lathe(cx, cy, t => [rd, 4 + t * 66], (p, ang, t, i, j, n) => {
      const k0 = toneOf(lum(...n)), u = ang * circ, v = p[2] - 4, du = (u % seg) - seg / 2, dv = v - 38;
      const k = tracery(du, dv, 4.5, 24); if (k) return traceryCol(k, k0, i, j, dv, 24, (Math.floor(u / seg) % 3) === 1);
      if (Math.abs(v - 64) < 0.8 || Math.abs(v - 36) < 0.8) return G[1];
      if (tracery(du, dv, 5.7, 25.6) && dv > 10) return G[2];
      return MAT.ashlar(MOON, 4, 8)(u, v, i, j, k0);
    }, 2);
    /* the arcade round it, a lean-to roof of verdigris over the walk */
    const ca = ra * Math.PI * 2 * 16, na = 16, sa = ca / na, ah = 30;
    F.lathe(cx, cy, t => [ra, 4 + t * ah], (p, ang, t, i, j, n) => {
      const k0 = toneOf(lum(...n)), u = ang * ca, v = p[2] - 4, du = (u % sa) - sa / 2, hw = sa / 2 - 1.4, oh = ah - 4;
      if (v > ah - 1.2) return G[1];
      const k = tracery(du, v, hw, oh), sh = oh - hw * 1.9;
      if (k === 1 && v > sh) return tone(R(MOON), k0 - 0.6, i, j);
      if (k) return null;
      return tone(R(MOON), k0 - 0.2 + (Math.abs(du) > sa / 2 - 0.7 ? -0.5 : 0) + (hash(i >> 1, j >> 1) < 0.06 ? 0.5 : 0), i, j);
    }, 3);
    F.lathe(cx, cy, t => [ra + 0.06 - (ra + 0.06 - rd) * t, 4 + ah + t * 8], (p, ang, t, i, j, n) => (Math.abs(((ang * 32) % 1) - 0.5) > 0.42 ? G[2] : tone(R(VERD), toneOf(lum(...n)), i, j)), 4);
    /* the dome: verdigris swelling to a point, ribbed in gold, on a gold band; a lantern and a finial on top */
    F.lathe(cx, cy, t => [rd + 0.04, 70 + t * 3], (p, a, t, i, j) => G[a > 0.6 || a < 0.15 ? 1 : 2], 5);
    F.lathe(cx, cy, t => [(rd + 0.06) * Math.pow(Math.cos(t * Math.PI / 2), 0.8) + 0.03 * Math.sin(Math.PI * t), 73 + t * 36], (p, ang, t, i, j, n) => (Math.abs(((ang * 12) % 1) - 0.5) > 0.46 ? G[t > 0.5 ? 1 : 2] : tone(R(VERD), toneOf(lum(...n)) + ((Math.floor(t * 14) % 2) ? 0.25 : 0), i, j)), 6);
    F.lathe(cx, cy, t => [0.12, 104 + t * 10], (p, ang, t, i, j, n) => (Math.abs(((ang * 6) % 1) - 0.5) < 0.15 ? glowOf(GLOW, 1) : tone(R(MOON), toneOf(lum(...n)), i, j)), 7);
    cone(F, cx, cy, 0.13, 114, 14, ROOF.copper(VERD), 8, 0.04);
    finial(F, cx, cy, 128, 6);
  } },
  elvenmanor: { top: 150, draw(F, o) {
    const ax = o.axis === 'x', [x0, y0, x1, y1] = ax ? [0.14, 0.5, o.w - 0.14, o.d - 0.14] : [0.5, 0.14, o.w - 0.14, o.d - 0.14], H = 50, G = R(GOLD);
    const spec = { h: H, floors: 2, win: { w: 7, h: 16, at: 5, every: 13 }, door: { w: 9, h: 19 }, bands: [25, H - 3], plinth: 4 };
    elfBlock(F, o, x0, y0, x1, y1, 0, spec, 1);
    sweptGable(F, x0, y0, x1, y1, H, 34, ax ? 'x' : 'y', ROOF.slate(VERD), { ov: 0.16, lift: 5, gableSh: elfWall(ax ? 'x' : 'y', x0, y0, x1, y1, 0, { h: H + 40, win: { w: 7, h: 14, at: H + 4, every: 99, lit: true } }) });
    /* a balcony across the front of the upper floor: a gold-edged slab and a balustrade of little arches */
    const fy = ax, bz = 25;
    if (fy) { const a = x0 + 0.35, b = x1 - 0.55; F.box(a, y1, b, y1 + 0.16, bz - 2, bz, { y: (p, aa, bb, i, j) => G[bb > 0.5 ? 1 : 2], x: (p, aa, bb, i, j) => G[3], top: (p, aa, bb, i, j) => tone(R(MOON), 1, i, j) }, 6); arcade(F, [a, y1 + 0.16], [b, y1 + 0.16], bz, 8, 8, 7); }
    else { const a = y0 + 0.35, b = y1 - 0.55; F.box(x1, a, x1 + 0.16, b, bz - 2, bz, { x: (p, aa, bb, i, j) => G[bb > 0.5 ? 2 : 3], y: (p, aa, bb, i, j) => G[2], top: (p, aa, bb, i, j) => tone(R(MOON), 1, i, j) }, 6); arcade(F, [x1 + 0.16, b], [x1 + 0.16, a], bz, 8, 8, 7, 0.7); }
    /* a round turret on the front corner, tracery lights up it, a needle of verdigris */
    const tx = x1 - 0.06, ty = y1 - 0.06, rt = 0.24, circ = rt * Math.PI * 2 * 16;
    F.lathe(tx, ty, t => [rt, t * 76], (p, ang, t, i, j, n) => {
      const k0 = toneOf(lum(...n)), u = ang * circ, v = p[2], da = Math.abs(((ang - 0.125 + 1.5) % 1) - 0.5) * circ;
      for (const zw of [30, 54]) { const k = tracery(da, v - zw, 3, 14); if (k) return traceryCol(k, k0, i, j, v - zw, 14, zw > 40); }
      if (Math.abs(v - 25) < 0.8 || Math.abs(v - 74) < 0.8) return G[1];
      return MAT.ashlar(MOON, 4, 7)(u, v, i, j, k0);
    }, 8);
    F.lathe(tx, ty, t => [rt + 0.04 * (1 - t), 76 + t], (p, a, t, i, j) => G[a > 0.6 || a < 0.15 ? 1 : 2], 9);
    cone(F, tx, ty, rt + 0.02, 77, 52, ROOF.slate(VERD), 9, 0.04);
    finial(F, tx, ty, 129, 8);
  } },
  elvenarch: { top: 80, draw(F, o) {
    const span = o.face % 2 === 0, at = (a, b, z) => (span ? [a, b, z] : [b, a, z]), G = R(GOLD), H = 46;
    /* two slender pillars, each on a plinth, with a lantern hung from a gold hook */
    for (const a of [0.14, 0.74]) {
      const [x, y] = at(a + 0.06, 0.5, 0);
      F.box(x - 0.09, y - 0.09, x + 0.09, y + 0.09, 0, 4, { y: stoneSh(MOON_D, 'y', 2, 4), x: stoneSh(MOON_D, 'x', 2, 4), top: (p, aa, bb, i, j) => R(MOON)[1] }, 1);
      F.box(x - 0.06, y - 0.06, x + 0.06, y + 0.06, 4, 32, { y: stoneSh(MOON, 'y', 5, 3), x: stoneSh(MOON, 'x', 5, 3) }, 1);
    }
    /* the arch: a pointed span of moonstone with tracery in its head and a gold-edged rim, two faces deep */
    for (const [b, part, shade] of [[0.44, 2, 0.8], [0.56, 3, 0]]) {
      const [Ax, Ay] = at(0.08, b, 0), [Bx, By] = at(0.92, b, 0), L = 0.84 * 16;
      F.quad([Ax, Ay, 24], [Bx, By, 24], [Bx, By, H], [Ax, Ay, H], (p, a, bb, i, j) => {
        const u = a * L, v = bb * (H - 24) + 24, du = u - L / 2, outer = tracery(du, v, L / 2, H), inner = tracery(du, v, L / 2 - 3, H - 4);
        if (!outer) return null;
        if (!inner) return outer === 1 && v > 30 ? G[1] : tone(R(MOON), 1.6 + shade, i, j);
        if (v < 30) return null;
        const head = tracery(du, v - 30, L / 2 - 3, H - 34);
        if (head === 1 || (head === 3)) return tone(R(MOON), 1 + shade, i, j);
        return Math.abs(du) < 0.6 && v < 34 ? tone(R(MOON), 1 + shade, i, j) : null;
      }, part);
    }
    finial(F, ...at(0.5, 0.56, 0).slice(0, 2), H, 5);
    for (const a of [0.3, 0.7]) { const [x, y] = at(a, 0.56, 0); F.line([x, y, 28], [x, y, 25], G[2], 4, 1); for (const [di, dj, k] of [[0, 0, 0], [0, 1, 1], [0, 2, 2]]) F.dot(x, y, 24, glowOf(GLOW, k), 4, 1, di, dj); }
  } }
});

export { DESIGNS };
