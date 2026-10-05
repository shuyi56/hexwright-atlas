import { TAU } from '../core/geometry.js';
import { CT, FH, SLATE } from './generate.js';
import { ROOFS } from '../render/palette.js';

/* ================= city architecture: solids, cathedrals, monasteries ================= */
const STONE_A = '#e8dec7', STONE_B = '#dcd0b3', LEAD = '#76818b', MROOF = '#a6533b', MSLATE = '#8b8077';
function makeBuilder(X0, Y0, W, D, o, z0) {
  const M = (lx, ly) => o === 0 ? [X0 + lx, Y0 + ly] : o === 1 ? [X0 + D - ly, Y0 + lx] : o === 2 ? [X0 + W - lx, Y0 + D - ly] : [X0 + ly, Y0 + W - lx];
  const out = [], ground = [], marks = [];
  const q = (lx, ly, z) => { const [x, y] = M(lx, ly); return [x, y, z0 + z]; };
  const solid = (faces, klx, kly, kb) => { const [kx, ky] = M(klx, kly); out.push({ type: 'solid', faces, kx, ky, kb: kb || 0 }); };
  const ring = (cx, cy, r, n, a0) => Array.from({ length: n }, (_, k) => { const a = a0 + k / n * TAU; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const B = {
    M, out, ground, marks, z0, W, D, o,
    box(x0, y0, x1, y1, za, zb, col, deco = {}, top, kb) {
      solid([
        { p: [q(x0, y0, za), q(x1, y0, za), q(x1, y0, zb), q(x0, y0, zb)], c: col, deco: deco.yn },
        { p: [q(x1, y0, za), q(x1, y1, za), q(x1, y1, zb), q(x1, y0, zb)], c: col, deco: deco.xp },
        { p: [q(x1, y1, za), q(x0, y1, za), q(x0, y1, zb), q(x1, y1, zb)], c: col, deco: deco.yp },
        { p: [q(x0, y1, za), q(x0, y0, za), q(x0, y0, zb), q(x0, y1, zb)], c: col, deco: deco.xn },
        { p: [q(x0, y0, zb), q(x1, y0, zb), q(x1, y1, zb), q(x0, y1, zb)], c: top || col }
      ], (x0 + x1) / 2, (y0 + y1) / 2, kb);
    },
    gable(x0, y0, x1, y1, zt, rh, axis, roof, wall, ends = {}, kb, ov = 0.08) {
      const zr = zt + rh, TL = [{ k: 'tiles' }];
      if (axis === 'x') {
        const ym = (y0 + y1) / 2;
        solid([
          { p: [q(x0 - ov, y0 - ov, zt), q(x1 + ov, y0 - ov, zt), q(x1 + ov, ym, zr), q(x0 - ov, ym, zr)], c: roof, deco: TL },
          { p: [q(x1 + ov, y1 + ov, zt), q(x0 - ov, y1 + ov, zt), q(x0 - ov, ym, zr), q(x1 + ov, ym, zr)], c: roof, deco: TL },
          { p: [q(x1, y0, zt), q(x1, y1, zt), q(x1, ym, zr)], c: wall, deco: ends.xp },
          { p: [q(x0, y1, zt), q(x0, y0, zt), q(x0, ym, zr)], c: wall, deco: ends.xn }
        ], (x0 + x1) / 2, ym, kb);
      } else {
        const xm = (x0 + x1) / 2;
        solid([
          { p: [q(x0 - ov, y1 + ov, zt), q(x0 - ov, y0 - ov, zt), q(xm, y0 - ov, zr), q(xm, y1 + ov, zr)], c: roof, deco: TL },
          { p: [q(x1 + ov, y0 - ov, zt), q(x1 + ov, y1 + ov, zt), q(xm, y1 + ov, zr), q(xm, y0 - ov, zr)], c: roof, deco: TL },
          { p: [q(x1, y1, zt), q(x0, y1, zt), q(xm, y1, zr)], c: wall, deco: ends.yp },
          { p: [q(x0, y0, zt), q(x1, y0, zt), q(xm, y0, zr)], c: wall, deco: ends.yn }
        ], xm, (y0 + y1) / 2, kb);
      }
    },
    lean(x0, y0, x1, y1, zlo, zhi, high, roof, wall, kb) {
      const cz = (x, y) => ((high === 'yn' && y === y0) || (high === 'yp' && y === y1) || (high === 'xn' && x === x0) || (high === 'xp' && x === x1)) ? zhi : zlo;
      const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const faces = [{ p: C.map(([x, y]) => q(x, y, cz(x, y))), c: roof, deco: [{ k: 'tiles' }] }];
      for (let k = 0; k < 4; k++) {
        const a = C[k], b = C[(k + 1) % 4], za = cz(a[0], a[1]), zb = cz(b[0], b[1]), pts = [q(a[0], a[1], zlo), q(b[0], b[1], zlo)];
        if (zb > zlo + 0.01) pts.push(q(b[0], b[1], zb)); if (za > zlo + 0.01) pts.push(q(a[0], a[1], za));
        if (pts.length >= 3) faces.push({ p: pts, c: wall });
      }
      solid(faces, (x0 + x1) / 2, (y0 + y1) / 2, kb);
    },
    prism(cx, cy, r, n, za, zb, col, deco, a0 = 0, kb, top) {
      const P2 = ring(cx, cy, r, n, a0), faces = [];
      for (let k = 0; k < n; k++) { const a = P2[k], b = P2[(k + 1) % n]; faces.push({ p: [q(a[0], a[1], za), q(b[0], b[1], za), q(b[0], b[1], zb), q(a[0], a[1], zb)], c: col, deco }); }
      faces.push({ p: P2.map(([x, y]) => q(x, y, zb)), c: top || col });
      solid(faces, cx, cy, kb);
    },
    pyramid(cx, cy, r, n, za, zb, col, a0 = 0, kb, deco) {
      const P2 = ring(cx, cy, r, n, a0), apex = q(cx, cy, zb), faces = [];
      for (let k = 0; k < n; k++) { const a = P2[k], b = P2[(k + 1) % n]; faces.push({ p: [q(a[0], a[1], za), q(b[0], b[1], za), apex], c: col, deco }); }
      faces.push({ p: P2.map(([x, y]) => q(x, y, za)), c: col });
      solid(faces, cx, cy, kb);
    },
    apse(cx, cy, r, za, zb, rh, wall, roof, deco, kb) {
      const pts = [-90, -45, 0, 45, 90].map(d => [cx + Math.cos(d * Math.PI / 180) * r, cy + Math.sin(d * Math.PI / 180) * r]);
      const wf = [];
      for (let k = 0; k < 4; k++) { const a = pts[k], b = pts[k + 1]; wf.push({ p: [q(a[0], a[1], za), q(b[0], b[1], za), q(b[0], b[1], zb), q(a[0], a[1], zb)], c: wall, deco }); }
      wf.push({ p: [q(pts[4][0], pts[4][1], za), q(pts[0][0], pts[0][1], za), q(pts[0][0], pts[0][1], zb), q(pts[4][0], pts[4][1], zb)], c: wall });
      solid(wf, cx + r * 0.4, cy, kb);
      const apex = q(cx, cy, zb + rh), rf = [];
      for (let k = 0; k < 4; k++) { const a = pts[k], b = pts[k + 1]; rf.push({ p: [q(a[0], a[1], zb), q(b[0], b[1], zb), apex], c: roof, deco: [{ k: 'tiles' }] }); }
      rf.push({ p: [q(pts[4][0], pts[4][1], zb), q(pts[0][0], pts[0][1], zb), apex], c: roof });
      solid(rf, cx + r * 0.4, cy, (kb || 0) + 0.05);
    },
    flyer(ax, ay, az, bx, by, bz, kb) { const [x1, y1] = M(ax, ay), [x2, y2] = M(bx, by); out.push({ type: 'flyer', x1, y1, z1: z0 + az, x2, y2, z2: z0 + bz, kb: kb || 0.15 }); },
    round(lx, ly, o2) { const [x, y] = M(lx, ly); out.push(Object.assign({ type: 'round', x, y, z0, r: 0.4, h: 20, roof: 'cone', roofC: SLATE, wall: STONE_A }, o2, { z0: z0 + ((o2 && o2.dz) || 0) })); },
    tree(lx, ly, s, sp) { const [x, y] = M(lx, ly); out.push({ type: 'tree', x, y, z0, s, sp }); },
    obj(type, lx, ly, extra) { const [x, y] = M(lx, ly); out.push(Object.assign({ type, x, y, z0 }, extra)); },
    rect(x0, y0, x1, y1, t) { ground.push([x0, y0, x1, y1, t]); },
    mark(name, lx, ly, kind, z) { const [x, y] = M(lx, ly); marks.push({ name, x, y, kind, z: z0 + (z || 0) }); }
  };
  return B;
}
const LAN = (n, v0 = 0.55, v1 = 0.9, w = 0.48) => ({ k: 'lancet', n, v0, v1, w });
const BELFRY = { k: 'belfry', n: 2 };
function cathedralDims(cap, cloister) { const D0 = cap ? 5.8 : 4.8; return { W: cap ? 11.2 : 9.4, D: D0 + (cloister ? (cap ? 4.8 : 4.2) : 0), D0 }; }
function buildCathedral(B, cap, cloister, names) {
  const { D0 } = cathedralDims(cap, cloister);
  const c = D0 / 2, nh = cap ? 1.0 : 0.85, aw = cap ? 1.1 : 0.9;
  const hN = (cap ? 5.4 : 4.6) * FH, hA = (cap ? 2.8 : 2.4) * FH, rN = cap ? 24 : 20;
  const xW = cap ? 1.7 : 1.8, xT0 = cap ? 6.4 : 5.4, xT1 = xT0 + 2 * nh, xC1 = cap ? 9.9 : 8.2;
  const bays = Math.max(3, Math.round((xT0 - xW) / 0.95));
  const naveX0 = cap ? 0 : xW;
  /* nave and its roof */
  B.box(naveX0, c - nh, xT0, c + nh, 0, hN, STONE_A, { yn: [LAN(bays)], yp: [LAN(bays)], xn: cap ? [{ k: 'portal', w: 0.44, h: 0.34 }, { k: 'rose', v: 0.66, r: 0.27 }] : null }, null, 0);
  B.gable(naveX0, c - nh, xT0, c + nh, hN, rN, 'x', LEAD, STONE_A, cap ? { xn: [{ k: 'lancet', n: 1, v0: 0.15, v1: 0.62, w: 0.26 }] } : {}, 0.02);
  /* aisles, buttresses and flying buttresses */
  for (const sd of [-1, 1]) {
    const yi = c + sd * nh, yo = c + sd * (nh + aw), y0 = Math.min(yi, yo), y1 = Math.max(yi, yo);
    const dz = sd < 0 ? { yn: [LAN(bays, 0.2, 0.84)], xn: [LAN(1, 0.2, 0.8)] } : { yp: [LAN(bays, 0.2, 0.84)], xn: [LAN(1, 0.2, 0.8)] };
    B.box(xW, y0, xT0, y1, 0, hA, STONE_B, dz, null, -0.05);
    B.lean(xW, y0, xT0, y1, hA, hA + 11, sd < 0 ? 'yp' : 'yn', LEAD, STONE_B, -0.04);
    for (let k = 0; k <= bays; k++) {
      const bx = xW + 0.1 + k * (xT0 - xW - 0.2) / bays, yo2 = yo + sd * 0.32, p0 = Math.min(yo, yo2), p1 = Math.max(yo, yo2);
      B.box(bx - 0.12, p0, bx + 0.12, p1, 0, hA + 14, STONE_B, {}, null, 0.1);
      B.pyramid(bx, (p0 + p1) / 2, 0.17, 4, hA + 14, hA + 27, STONE_A, Math.PI / 4, 0.12);
      if (k > 0) B.flyer(bx, (p0 + p1) / 2, hA + 12, bx, yi, hN - 8);
    }
    if (cap) {
      B.box(xT1, y0, xC1, y1, 0, hA, STONE_B, sd < 0 ? { yn: [LAN(3, 0.2, 0.84)] } : { yp: [LAN(3, 0.2, 0.84)] }, null, -0.05);
      B.lean(xT1, y0, xC1, y1, hA, hA + 11, sd < 0 ? 'yp' : 'yn', LEAD, STONE_B, -0.04);
      for (let k = 0; k <= 2; k++) { const bx = xT1 + 0.2 + k * (xC1 - xT1 - 0.4) / 2, yo2 = yo + sd * 0.32, p0 = Math.min(yo, yo2), p1 = Math.max(yo, yo2); B.box(bx - 0.12, p0, bx + 0.12, p1, 0, hA + 14, STONE_B, {}, null, 0.1); B.pyramid(bx, (p0 + p1) / 2, 0.17, 4, hA + 14, hA + 27, STONE_A, Math.PI / 4, 0.12); B.flyer(bx, (p0 + p1) / 2, hA + 12, bx, yi, hN - 8); }
    }
  }
  /* transept arms with rose windows */
  const arm = nh + aw + (cap ? 0.8 : 0.6);
  for (const sd of [-1, 1]) {
    const ya = c + sd * nh, yb = c + sd * arm, y0 = Math.min(ya, yb), y1 = Math.max(ya, yb), end = sd < 0 ? 'yn' : 'yp';
    const dz = { xn: [LAN(1, 0.3, 0.86)], xp: [LAN(1, 0.3, 0.86)] }; dz[end] = [{ k: 'portal', w: 0.34, h: 0.3 }, { k: 'rose', v: 0.66, r: 0.3 }];
    B.box(xT0, y0, xT1, y1, 0, hN, STONE_A, dz, null, 0.05);
    const ends = {}; ends[end] = [{ k: 'lancet', n: 1, v0: 0.15, v1: 0.6, w: 0.28 }];
    B.gable(xT0, y0, xT1, y1, hN, rN, 'y', LEAD, STONE_A, ends, 0.07);
    const yb2 = yb + sd * 0.3;
    for (const bx of [xT0 + 0.1, xT1 - 0.1]) { B.box(bx - 0.12, Math.min(yb, yb2), bx + 0.12, Math.max(yb, yb2), 0, hN - 8, STONE_B, {}, null, 0.1); B.pyramid(bx, (yb + yb2) / 2, 0.16, 4, hN - 8, hN + 6, STONE_A, Math.PI / 4, 0.12); }
  }
  /* choir and apse with radiating buttresses */
  B.box(xT1, c - nh, xC1, c + nh, 0, hN, STONE_A, { yn: [LAN(2)], yp: [LAN(2)] }, null, 0);
  B.gable(xT1, c - nh, xC1, c + nh, hN, rN, 'x', LEAD, STONE_A, {}, 0.02);
  B.apse(xC1, c, nh, 0, hN, rN, STONE_A, LEAD, [LAN(1, 0.32, 0.88, 0.4)], 0);
  for (const a of [-Math.PI / 3, 0, Math.PI / 3]) { const bx = xC1 + Math.cos(a) * (nh + 0.14), by = c + Math.sin(a) * (nh + 0.14); B.box(bx - 0.11, by - 0.11, bx + 0.11, by + 0.11, 0, hN - 6, STONE_B, {}, null, 0.2); B.pyramid(bx, by, 0.15, 4, hN - 6, hN + 7, STONE_A, Math.PI / 4, 0.22); }
  /* crossing tower */
  const hX = hN + (cap ? 2.6 : 2.2) * FH;
  B.box(xT0, c - nh, xT1, c + nh, 0, hX, STONE_A, { yn: [BELFRY], yp: [BELFRY], xn: [BELFRY], xp: [BELFRY] }, null, 0.6);
  if (cap) {
    B.pyramid((xT0 + xT1) / 2, c, nh * 0.88, 8, hX, hX + 46, LEAD, Math.PI / 8, 0.62, [{ k: 'spireband' }]);
    for (const [px, py] of [[xT0 + 0.14, c - nh + 0.14], [xT1 - 0.14, c - nh + 0.14], [xT0 + 0.14, c + nh - 0.14], [xT1 - 0.14, c + nh - 0.14]]) B.pyramid(px, py, 0.14, 4, hX, hX + 13, STONE_A, Math.PI / 4, 0.64);
  } else B.pyramid((xT0 + xT1) / 2, c, nh * 1.42, 4, hX, hX + 17, LEAD, Math.PI / 4, 0.62);
  /* west front */
  if (cap) {
    for (const sd of [-1, 1]) {
      const y0 = sd < 0 ? c - nh - aw - 0.2 : c + nh, y1 = sd < 0 ? c - nh : c + nh + aw + 0.2, hT = 8.2 * FH, tw = y1 - y0;
      B.box(0, y0, xW, y1, 0, hT, STONE_A, { xn: [{ k: 'portal', w: 0.38, h: 0.2 }, { k: 'lancet', n: 1, v0: 0.36, v1: 0.6, w: 0.34 }, BELFRY], yn: [BELFRY], yp: [BELFRY], xp: [BELFRY] }, null, 0.4);
      B.pyramid(xW / 2, (y0 + y1) / 2, Math.min(xW, tw) * 0.42, 8, hT, hT + 54, LEAD, Math.PI / 8, 0.45, [{ k: 'spireband' }]);
      for (const [px, py] of [[0.16, y0 + 0.16], [xW - 0.16, y0 + 0.16], [0.16, y1 - 0.16], [xW - 0.16, y1 - 0.16]]) B.pyramid(px, py, 0.15, 4, hT, hT + 15, STONE_A, Math.PI / 4, 0.47);
    }
  } else {
    const hT = 7 * FH;
    B.box(0, c - 0.92, xW, c + 0.92, 0, hT, STONE_A, { xn: [{ k: 'portal', w: 0.4, h: 0.24 }, { k: 'rose', v: 0.47, r: 0.22 }, BELFRY], yn: [BELFRY], yp: [BELFRY], xp: [BELFRY] }, null, 0.4);
    B.pyramid(xW / 2, c, 0.74, 8, hT, hT + 42, LEAD, Math.PI / 8, 0.45, [{ k: 'spireband' }]);
    for (const [px, py] of [[0.15, c - 0.77], [xW - 0.15, c - 0.77], [0.15, c + 0.77], [xW - 0.15, c + 0.77]]) B.pyramid(px, py, 0.14, 4, hT, hT + 13, STONE_A, Math.PI / 4, 0.47);
  }
  B.mark(names.church, (xT0 + xT1) / 2, c, 'cathedral', hN);
  /* cloister and octagonal chapter house */
  if (cloister) {
    const y0 = D0 + 0.05, y1 = D0 + (cap ? 4.6 : 4.0), x0 = xW, x1 = xT0;
    buildCloister(B, x0, y0, x1, y1, 0.8, 1.35 * FH, LEAD);
    const r = cap ? 1.05 : 0.9, chx = Math.min(x1 + r + 0.35, B.W - r - 0.1), chy = y0 + r + 0.35;
    B.prism(chx, chy, r, 8, 0, 2.8 * FH, STONE_A, [LAN(1, 0.28, 0.86, 0.5)], Math.PI / 8, 0);
    B.pyramid(chx, chy, r * 1.06, 8, 2.8 * FH, 2.8 * FH + 20, LEAD, Math.PI / 8, 0.05);
    for (let k = 0; k < 8; k += 2) { const a = Math.PI / 8 + (k + 0.5) / 8 * TAU, bx = chx + Math.cos(a) * (r + 0.12), by = chy + Math.sin(a) * (r + 0.12); B.box(bx - 0.1, by - 0.1, bx + 0.1, by + 0.1, 0, 2.6 * FH, STONE_B, {}, null, 0.1); B.pyramid(bx, by, 0.13, 4, 2.6 * FH, 2.6 * FH + 10, STONE_A, Math.PI / 4, 0.12); }
    B.mark('Chapter House', chx, chy, 'chapter', 2.8 * FH);
  }
}
function buildCloister(B, x0, y0, x1, y1, ww, hw, roof) {
  const nx = Math.max(3, Math.round((x1 - x0 - 2 * ww) / 0.5)), ny = Math.max(3, Math.round((y1 - y0 - 2 * ww) / 0.5));
  const AR = n => [{ k: 'arcade', n }];
  B.box(x0, y0, x1, y0 + ww, 0, hw, STONE_A, { yp: AR(nx + 2) }, null, -0.1); B.lean(x0, y0, x1, y0 + ww, hw, hw + 8, 'yn', roof, STONE_A, -0.08);
  B.box(x0, y1 - ww, x1, y1, 0, hw, STONE_A, { yn: AR(nx + 2) }, null, -0.1); B.lean(x0, y1 - ww, x1, y1, hw, hw + 8, 'yp', roof, STONE_A, -0.08);
  B.box(x0, y0 + ww, x0 + ww, y1 - ww, 0, hw, STONE_A, { xp: AR(ny) }, null, -0.1); B.lean(x0, y0 + ww, x0 + ww, y1 - ww, hw, hw + 8, 'xn', roof, STONE_A, -0.08);
  B.box(x1 - ww, y0 + ww, x1, y1 - ww, 0, hw, STONE_A, { xn: AR(ny) }, null, -0.1); B.lean(x1 - ww, y0 + ww, x1, y1 - ww, hw, hw + 8, 'xp', roof, STONE_A, -0.08);
  B.rect(x0 + ww, y0 + ww, x1 - ww, y1 - ww, CT.GARDEN);
  const gx = (x0 + x1) / 2, gy = (y0 + y1) / 2;
  B.obj('well', gx, gy);
  B.tree(gx + (x1 - x0) * 0.22, gy - (y1 - y0) * 0.18, 12, 'yew');
  for (const [dx, dy] of [[-0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) B.tree(gx + dx * (x1 - x0 - 2 * ww), gy + dy * (y1 - y0 - 2 * ww), 7, 'bush');
  B.mark('The Cloister', gx, gy, 'cloister');
}
function monasteryDims(kind) { return kind === 'abbey' ? { W: 13.8, D: 12.6 } : { W: 9.8, D: 8.4 }; }
function buildMonastery(B, kind, names) {
  if (kind === 'abbey') {
    const c = 2.3, nh = 0.95, hN = 3.9 * FH, rN = 18, xT0 = 7.4, xT1 = xT0 + 2 * nh, xC1 = xT1 + 1.9, arm = 2.25;
    B.rect(2, 0, 6.8, c - nh - 0.05, CT.GRAVE);
    // church
    B.box(1, c - nh, xT0, c + nh, 0, hN, STONE_A, { yn: [LAN(5, 0.5, 0.86)], yp: [LAN(5, 0.5, 0.86)], xn: [{ k: 'portal', w: 0.4, h: 0.36 }, { k: 'rose', v: 0.7, r: 0.24 }] }, null, 0);
    B.gable(1, c - nh, xT0, c + nh, hN, rN, 'x', LEAD, STONE_A, { xn: [{ k: 'lancet', n: 1, v0: 0.18, v1: 0.6, w: 0.24 }] }, 0.02);
    for (const sd of [-1, 1]) { B.pyramid(1.12, c + sd * (nh - 0.12), 0.14, 4, hN, hN + 22, STONE_A, Math.PI / 4, 0.1); }
    for (let k = 1; k < 5; k++) { const bx = 1 + k * (xT0 - 1) / 5; B.box(bx - 0.1, c - nh - 0.26, bx + 0.1, c - nh, 0, hN - 10, STONE_B, {}, null, 0.1); B.lean(bx - 0.1, c - nh - 0.26, bx + 0.1, c - nh, hN - 10, hN - 4, 'yp', STONE_A, STONE_B, 0.11); }
    for (const sd of [-1, 1]) {
      const ya = c + sd * nh, yb = c + sd * arm, y0 = Math.min(ya, yb), y1 = Math.max(ya, yb), end = sd < 0 ? 'yn' : 'yp';
      const dz = { xn: [LAN(1, 0.35, 0.86)], xp: [LAN(1, 0.35, 0.86)] }; dz[end] = [LAN(3, 0.3, 0.84, 0.55)];
      B.box(xT0, y0, xT1, y1, 0, hN, STONE_A, dz, null, 0.05);
      const ends = {}; ends[end] = [{ k: 'rose', v: 0.32, r: 0.18 }];
      B.gable(xT0, y0, xT1, y1, hN, rN, 'y', LEAD, STONE_A, ends, 0.07);
    }
    B.box(xT1, c - nh, xC1, c + nh, 0, hN, STONE_A, { yn: [LAN(2)], yp: [LAN(2)] }, null, 0);
    B.gable(xT1, c - nh, xC1, c + nh, hN, rN, 'x', LEAD, STONE_A, {}, 0.02);
    B.apse(xC1, c, nh, 0, hN, rN, STONE_A, LEAD, [LAN(1, 0.34, 0.86, 0.4)], 0);
    const hX = hN + 2.3 * FH;
    B.box(xT0, c - nh, xT1, c + nh, 0, hX, STONE_A, { yn: [BELFRY], yp: [BELFRY], xn: [BELFRY], xp: [BELFRY] }, null, 0.6);
    B.pyramid((xT0 + xT1) / 2, c, nh * 1.42, 4, hX, hX + 20, LEAD, Math.PI / 4, 0.62);
    B.mark(names.church, (xT0 + xT1) / 2, c, 'church', hN);
    // cloister and ranges
    const cy0 = c + nh + 0.05, cy1 = 9.0;
    buildCloister(B, 1.2, cy0, xT0, cy1, 0.85, 1.3 * FH, MROOF);
    B.box(xT0, c + arm, xT0 + 2, 10.4, 0, 2.6 * FH, STONE_A, { xp: [LAN(3, 0.12, 0.42, 0.4), { k: 'win', rows: 1, n: 5, v0: 0.62, v1: 0.82 }], yp: [{ k: 'win', rows: 2, n: 1 }] }, null, 0);
    B.gable(xT0, c + arm, xT0 + 2, 10.4, 2.6 * FH, 13, 'y', MROOF, STONE_A, { yp: [{ k: 'win', rows: 1, n: 1, v0: 0.2, v1: 0.45 }] }, 0.02);
    B.mark('Chapter House and Dorter', xT0 + 1, (c + arm + 10.4) / 2, 'chapter', 2.6 * FH);
    B.box(1.2, cy1, xT0, 10.6, 0, 2.3 * FH, STONE_A, { yp: [LAN(5, 0.18, 0.84, 0.38)], xn: [LAN(1, 0.2, 0.8)] }, null, 0);
    B.gable(1.2, cy1, xT0, 10.6, 2.3 * FH, 12, 'x', MROOF, STONE_A, { xn: [{ k: 'rose', v: 0.35, r: 0.18 }] }, 0.02);
    B.mark('Refectory', (1.2 + xT0) / 2, 9.8, 'refectory', 2.3 * FH);
    B.box(0, cy0, 1.2, 10.6, 0, 2.2 * FH, STONE_B, { xn: [{ k: 'win', rows: 2, n: 6 }], yp: [{ k: 'win', rows: 2, n: 1 }] }, null, 0);
    B.gable(0, cy0, 1.2, 10.6, 2.2 * FH, 10, 'y', MROOF, STONE_B, {}, 0.02);
    B.mark('Cellarium', 0.6, 6.5, 'range', 2.2 * FH);
    // octagonal kitchen with a smoke lantern
    B.prism(0.65, 11.5, 0.6, 8, 0, 1.7 * FH, STONE_B, [{ k: 'win', rows: 1, n: 1, v0: 0.4, v1: 0.7 }], Math.PI / 8, 0);
    B.pyramid(0.65, 11.5, 0.66, 8, 1.7 * FH, 1.7 * FH + 13, MSLATE, Math.PI / 8, 0.05);
    B.prism(0.65, 11.5, 0.16, 8, 1.7 * FH + 12, 1.7 * FH + 18, STONE_A, null, Math.PI / 8, 0.08);
    B.pyramid(0.65, 11.5, 0.2, 8, 1.7 * FH + 18, 1.7 * FH + 23, MSLATE, Math.PI / 8, 0.09);
    B.obj('smoke', 0.65, 11.5, { dz: 1.7 * FH + 24 });
    B.mark('Kitchen', 0.65, 11.5, 'kitchen', 1.7 * FH);
    // abbot's lodge and infirmary
    B.box(10.4, 5.3, 12.9, 7.1, 0, 2.2 * FH, '#ece4d2', { yp: [{ k: 'win', rows: 2, n: 3 }], xp: [{ k: 'win', rows: 2, n: 2 }], xn: [{ k: 'win', rows: 2, n: 2 }] }, null, 0);
    B.gable(10.4, 5.3, 12.9, 7.1, 2.2 * FH, 12, 'x', MSLATE, '#ece4d2', { xp: [{ k: 'win', rows: 1, n: 1, v0: 0.15, v1: 0.42 }] }, 0.02);
    B.box(12.3, 5.0, 12.8, 5.5, 2.2 * FH, 2.2 * FH + 12, '#d9cdb2', {}, null, 0.05);
    B.obj('smoke', 12.55, 5.25, { dz: 2.2 * FH + 13 });
    B.mark('Abbot\'s Lodge', 11.65, 6.2, 'lodge', 2.2 * FH);
    B.box(10.4, 8.3, 13.2, 9.8, 0, 1.6 * FH, STONE_A, { yp: [LAN(4, 0.2, 0.82, 0.4)], xp: [LAN(1, 0.2, 0.8)] }, null, 0);
    B.gable(10.4, 8.3, 13.2, 9.8, 1.6 * FH, 11, 'x', MROOF, STONE_A, {}, 0.02);
    B.box(12.1, 9.8, 13.2, 10.8, 0, 1.6 * FH, STONE_A, { yp: [LAN(1, 0.2, 0.82)], xp: [LAN(1, 0.2, 0.82)] }, null, 0);
    B.gable(12.1, 9.8, 13.2, 10.8, 1.6 * FH, 10, 'y', MROOF, STONE_A, { yp: [{ k: 'rose', v: 0.3, r: 0.2 }] }, 0.02);
    B.mark('Infirmary', 11.8, 9.1, 'infirmary', 1.6 * FH);
    // gardens, orchard, fishponds, dovecote, hives, bakehouse
    B.rect(10.0, 2.4, 13.6, 4.9, CT.GARDEN);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) B.tree(10.6 + i * 1.15, 2.95 + j * 1.25, 9.5, 'fruit');
    B.mark('Orchard', 11.8, 3.6, 'orchard');
    B.rect(9.6, 10.9, 13.6, 12.5, CT.GARDEN);
    for (let i = 0; i < 4; i++) B.obj('bed', 10.1 + i * 0.9, 11.7, { c: ['#b8483a', '#7a6aa8', '#d9b44a', '#6f8a4c'][i] });
    for (let i = 0; i < 3; i++) B.obj('hive', 12.8 + (i % 2) * 0.3, 11.1 + i * 0.4);
    B.mark('Herb Garden', 11.4, 11.7, 'herbs');
    B.rect(1.6, 11.2, 5.6, 12.5, CT.RIVER);
    B.mark('Fishponds', 3.6, 11.85, 'pond');
    B.box(6.0, 11.0, 8.6, 12.3, 0, 1.3 * FH, '#e6dcc6', { yp: [{ k: 'win', rows: 1, n: 3 }], xp: [{ k: 'door' }] }, null, 0);
    B.gable(6.0, 11.0, 8.6, 12.3, 1.3 * FH, 10, 'x', ROOFS[2][0], '#e6dcc6', {}, 0.02);
    B.box(8.1, 11.1, 8.45, 11.45, 1.3 * FH, 1.3 * FH + 11, '#d9cdb2', {}, null, 0.05);
    B.obj('smoke', 8.27, 11.27, { dz: 1.3 * FH + 12 });
    B.mark('Bakehouse and Brewhouse', 7.3, 11.6, 'range', 1.3 * FH);
    B.round(12.9, 1.0, { r: 0.48, h: 2.4 * FH, roof: 'cone', rh: 14, roofC: ROOFS[2], wall: STONE_A, holes: true });
    B.mark('Dovecote', 12.9, 1.0, 'dovecote', 2.4 * FH);
    B.tree(8.8, 0.6, 13, 'yew'); B.tree(9.8, 1.4, 12, 'oak');
    B.obj('cross', 4.4, 0.75);
  } else {
    const c = 1.85, nh = 0.8, hN = 3.2 * FH, rN = 15, xE = 6.2;
    B.rect(1.2, 0, 5.4, c - nh - 0.05, CT.GRAVE);
    B.box(0.8, c - nh, xE, c + nh, 0, hN, STONE_A, { yn: [LAN(4, 0.45, 0.86)], yp: [LAN(4, 0.45, 0.86)], xn: [{ k: 'portal', w: 0.42, h: 0.4 }, { k: 'lancet', n: 1, v0: 0.55, v1: 0.92, w: 0.26 }] }, null, 0);
    B.gable(0.8, c - nh, xE, c + nh, hN, rN, 'x', LEAD, STONE_A, { xn: [{ k: 'rose', v: 0.3, r: 0.2 }] }, 0.02);
    B.box(0.75, c - 0.24, 1.15, c + 0.24, hN + rN - 5, hN + rN + 8, STONE_A, { xn: [{ k: 'lancet', n: 1, v0: 0.2, v1: 0.8, w: 0.5, dark: true }], xp: [{ k: 'lancet', n: 1, v0: 0.2, v1: 0.8, w: 0.5, dark: true }] }, null, 0.2);
    B.gable(0.75, c - 0.24, 1.15, c + 0.24, hN + rN + 8, 6, 'y', LEAD, STONE_A, {}, 0.22, 0.03);
    B.apse(xE, c, nh, 0, hN, rN, STONE_A, LEAD, [LAN(1, 0.34, 0.86, 0.4)], 0);
    B.mark(names.church, 3.5, c, 'church', hN);
    const cy0 = c + nh + 0.05, cy1 = 6.4;
    buildCloister(B, 0.8, cy0, 4.8, cy1, 0.7, 1.2 * FH, MROOF);
    B.box(4.8, cy0, 6.6, 7.6, 0, 2.3 * FH, STONE_A, { xp: [LAN(2, 0.12, 0.42, 0.4), { k: 'win', rows: 1, n: 4, v0: 0.6, v1: 0.82 }], yp: [{ k: 'win', rows: 2, n: 1 }] }, null, 0);
    B.gable(4.8, cy0, 6.6, 7.6, 2.3 * FH, 12, 'y', MROOF, STONE_A, {}, 0.02);
    B.mark('Chapter House', 5.7, 4.6, 'chapter', 2.3 * FH);
    B.box(0.8, cy1, 4.8, 7.6, 0, 2 * FH, STONE_A, { yp: [LAN(4, 0.2, 0.82, 0.38)], xn: [{ k: 'win', rows: 2, n: 1 }] }, null, 0);
    B.gable(0.8, cy1, 4.8, 7.6, 2 * FH, 11, 'x', MROOF, STONE_A, {}, 0.02);
    B.box(1.0, 6.9, 1.35, 7.25, 2 * FH, 2 * FH + 10, '#d9cdb2', {}, null, 0.05);
    B.obj('smoke', 1.17, 7.07, { dz: 2 * FH + 11 });
    B.mark('Refectory', 2.8, 7.0, 'refectory', 2 * FH);
    B.rect(7.0, 2.4, 9.8, 6.2, CT.GARDEN);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) B.tree(7.6 + i * 1.2, 2.9 + j * 1.15, 9, 'fruit');
    for (let i = 0; i < 2; i++) B.obj('hive', 9.3, 2.8 + i * 0.4);
    B.mark('Orchard', 8.2, 4.2, 'orchard');
    B.round(8.8, 7.3, { r: 0.42, h: 2.2 * FH, roof: 'cone', rh: 12, roofC: ROOFS[2], wall: STONE_A, holes: true });
    B.tree(8.6, 0.8, 12, 'yew');
    B.obj('cross', 3.3, 0.6);
  }
}

export { buildCathedral, buildMonastery, cathedralDims, makeBuilder, monasteryDims };
