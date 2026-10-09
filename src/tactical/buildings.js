import { GOLD, ROOFS, WAX } from '../render/palette.js';
import { R, TILE, hash, lum, tone, toneOf } from './forge.js';

/* ================= tactical view: the buildings =================
   Every building in the tile set redrawn for the tactical camera as pixel art at the figures' own scale, built on
   the forge (tactical/forge.js) rather than shrunk from the editor's drawings. Each keeps its editor self (the
   thatched cottage, the jettied townhouse, the red barn, the slate-roofed city houses) with the detail a close
   camera can show: plaster with timber framing and braces, coursed ashlar with quoins at the corners, rubble,
   vertical boards, logs; windows with frames, mullions, sills, a glint on the glass and shutters; plank doors
   with hinges and a latch, arched where the walls are stone; thatch laid in courses with a stitched ridge and a
   ragged eave, clay tiles, slates, wooden shingles and copper with standing seams; chimneys with caps and smoke.

   A design is draw(F, o) in the footprint's own frame: o.w × o.d tiles after turning, o.face the side the door
   is on (0 +y, 1 +x, 2 -y, 3 -x; only +y and +x are seen), o.axis the long axis, o.v the piece's variant and
   o.links which neighbouring wall pieces a wall joins. Heights are art pixels: a figure is 40. */
const C = {
  plaster: ['#efe3c4', '#e9d6ae', '#e6cfa6', '#f0e4c6'], ashlar: '#e6dece', ashlarD: '#d6ccb6', stone: '#d8cfb9', rubble: '#c4b99f', grey: '#b9b0a0',
  timber: '#5a3f28', plank: '#9a7650', plankD: '#7a5a3a', barn: '#a4553b', log: '#8d6b45', marble: '#efe9da',
  thatch: '#c9a463', tiles: ROOFS[0][0], slate: '#6d7a86', shingle: '#7d6a55', copper: '#6f9a8c', lead: '#8f969a',
  glass: '#46566a', warm: '#f2c460', door: '#6e4a2e', iron: '#3a3632', shutter: ['#5f7b5a', '#4f6f8f', '#9a4a3a', '#7d6a55'], smoke: '#e8e6df', felt: ['#e7dcc3', '#d8c7a4', '#cdb38c']
};
const pickv = (a, v) => a[Math.floor(v * a.length) % a.length];

/* ---------- lighting of a plane ---------- */
/* the fractional tone of a flat surface through A, B, D (its normal from (B - A) × (D - A), turned upward) */
function planeTone(A, B, D) {
  const u = [(B[0] - A[0]) * TILE, (B[1] - A[1]) * TILE, B[2] - A[2]], v = [(D[0] - A[0]) * TILE, (D[1] - A[1]) * TILE, D[2] - A[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[2] < 0 || (Math.abs(n[2]) < 1e-6 && n[0] + n[1] < 0)) n = n.map(c => -c);
  return toneOf(lum(n[0] / TILE, n[1] / TILE, n[2]));
}
const WALL_T = { y: toneOf(lum(0, 1, 0)), x: toneOf(lum(1, 0, 0)) };

/* ---------- wall materials: (u, v, i, j, t) -> rgb, u columns along the wall, v pixels up it, t its tone ---------- */
const MAT = {
  plaster: col => (u, v, i, j, t) => { const n = hash(u | 0, v | 0, 3); let k = t - 0.15; if (n < 0.05) k += 0.8; else if (n < 0.08) k -= 0.7; if (v < 4) k += 0.5; return tone(R(col), k, i, j); },
  ashlar: (col, course = 4, len = 7) => (u, v, i, j, t) => {
    const row = Math.floor(v / course), uu = u + (row % 2 ? len / 2 : 0), r = R(col), bu = uu % len, bv = v % course;
    if (bv < 0.9 || bu < 0.9) return tone(r, t + 1.4, i, j);
    const blk = hash(Math.floor(uu / len), row, 7); let k = t + (blk < 0.2 ? 0.5 : blk > 0.85 ? -0.4 : 0);
    if (bv >= course - 1) k -= 0.8; else if (bu < 1.9) k -= 0.4;
    return tone(r, k, i, j);
  },
  rubble: col => (u, v, i, j, t) => {
    /* irregular stones: nearest of a jittered grid of centres, mortar where two are near equal */
    const cu = Math.floor(u / 5), cv = Math.floor(v / 4); let d1 = 99, d2 = 99, id = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const gu = cu + a, gv = cv + b, x = gu * 5 + hash(gu, gv, 1) * 5, y = gv * 4 + hash(gu, gv, 2) * 4, dd = Math.hypot((u - x) * 0.8, v - y); if (dd < d1) { d2 = d1; d1 = dd; id = gu * 31 + gv; } else if (dd < d2) d2 = dd; }
    const r = R(col); if (d2 - d1 < 0.9) return tone(r, t + 1.5, i, j);
    return tone(r, t + (hash(id, 3) < 0.3 ? 0.5 : hash(id, 4) < 0.2 ? -0.5 : 0) - (d1 < 1.2 ? 0.4 : 0), i, j);
  },
  boards: (col, wide = 3) => (u, v, i, j, t) => { const r = R(col), b = Math.floor(u / wide); if (u % wide < 0.9) return tone(r, t + 1.4, i, j); let k = t + (hash(b, 5) < 0.3 ? 0.4 : hash(b, 6) < 0.2 ? -0.3 : 0); if (hash(b, v | 0) < 0.04) k += 0.8; if ((v | 0) % 11 === 5 && u % wide < 1.9) return tone(r, t + 2, i, j); return tone(r, k, i, j); },
  logs: col => (u, v, i, j, t) => { const r = R(col), row = v % 4; if (row < 0.9) return tone(r, t + 1.5, i, j); return tone(r, t + (row >= 3 ? -0.8 : row < 1.9 ? 0.5 : 0) + (hash(u | 0, Math.floor(v / 4), 9) < 0.05 ? 0.7 : 0), i, j); }
};

/* ---------- windows, doors, framing ---------- */
/* a wall shader: mat for the fill and on top of it, in this order: door, windows, timber framing, quoins, plinth.
   spec: { mat, len (columns), h (wall height), floors, z0, win, door: { u, w, h, kind }, timber, quoins: 'end' |
   'start', plinth, eave (darken under the eaves) }. u, v come from the world point: along x (face y) or y (face x). */
function wall(face, x0, y0, x1, y1, z0, spec) {
  const len = face === 'y' ? (x1 - x0) * 16 : (y1 - y0) * 16, base = WALL_T[face], floors = spec.floors || 1, fh = spec.h / floors;
  const win = spec.win === undefined ? { w: 5, h: 7 } : spec.win, door = spec.door;
  const nwin = win ? Math.max(1, Math.floor(len / (win.every || 13))) : 0;
  return (p, a, b, i, j) => {
    const u = face === 'y' ? (p[0] - x0) * 16 : (y1 - p[1]) * 16, v = p[2] - z0, t = base;
    /* the door */
    if (door) {
      const du = u - door.u, hw = door.w / 2;
      if (Math.abs(du) < hw + 1 && v < door.h + 1) {
        const arch = door.kind === 'arch' || door.kind === 'portal', top = arch ? door.h - hw + Math.sqrt(Math.max(0, hw * hw - du * du)) : door.h;
        if (v < top + 1) {
          if (Math.abs(du) >= hw || v >= top) return tone(R(spec.trim || C.timber), t + 0.6, i, j);
          if (door.kind === 'open') return R('#3a2416')[v < 3 ? 4 : 3];
          if (door.kind === 'gate') return (Math.round(du + 10) % 3 === 0 || (v | 0) % 4 === 0) ? tone(R(C.iron), t, i, j) : R('#2a2018')[5];
          const dr = R(door.col || C.door), plank = Math.round(du + 10) % 2 === 0 && Math.abs(du) > 0.5;
          if ((v | 0) === 3 || (v | 0) === Math.floor(top) - 3) { if (du < hw - 1.5) return R(C.iron)[2]; }
          if (Math.abs(du - (hw - 1.6)) < 0.6 && Math.abs(v - door.h * 0.5) < 0.6) return R(GOLD)[1];
          if (door.kind === 'barn' && (Math.abs(Math.abs(du) - v * hw / door.h) < 0.7 || Math.abs(Math.abs(du) - (door.h - v) * hw / door.h) < 0.7)) return R('#f0e6cb')[2];
          return tone(dr, t + (plank ? 0.9 : 0) - (Math.abs(du) < hw - 1 && v > 1 && v < top - 1 ? 0 : -0.2), i, j);
        }
      }
    }
    /* windows */
    if (win) for (let f = 0; f < floors; f++) {
      if (win.ground === false && f === 0) continue;
      const vb = f * fh + (win.at ?? Math.max(3, fh * 0.32)), dv = v - vb;
      if (dv < -2.5 || dv > win.h + 1) continue;
      for (let m = 0; m < nwin; m++) {
        const uc = len * (m + 0.5) / nwin, du = u - uc, hw = win.w / 2;
        if (door && f === 0 && Math.abs(uc - door.u) < door.w / 2 + hw + 2) continue;
        const sh = win.shutter, reach = hw + (sh ? 2.5 : 1);
        if (Math.abs(du) >= reach) continue;
        const pointed = win.kind === 'lancet' ? win.h - hw : win.kind === 'round' ? win.h - hw : Infinity;
        const inTop = dv < pointed || (win.kind === 'lancet' ? Math.abs(du) < (win.h - dv) * 0.9 : Math.hypot(du * 1, dv - pointed) < hw);
        if (dv >= -1 && dv < 0 && Math.abs(du) < hw + 1) return R(win.sill || C.stone)[1];
        if (dv >= -2 && dv < -1 && Math.abs(du) < hw + 1) return null;  /* the sill's shadow: the fill, a step darker */
        if (dv < 0 || dv >= win.h) continue;
        if (Math.abs(du) < hw && inTop) {
          const edge = Math.abs(du) >= hw - 1 || dv < 1 || (pointed === Infinity && dv >= win.h - 1);
          if (edge) return tone(R(win.frame || C.timber), t - 0.2, i, j);
          const g = R(win.lit ? C.warm : win.glass || C.glass);
          if (win.kind !== 'slit' && ((win.w >= 6 && Math.abs(du) < 0.5) || (win.kind !== 'lancet' && win.w >= 5 && Math.abs(dv - win.h * 0.5) < 0.5))) return tone(R(win.frame || C.timber), t - 0.6, i, j);
          if (win.lit) return g[dv < win.h * 0.5 ? 1 : 2];
          return g[du < 0 && dv > win.h * 0.5 ? 1 : 3];
        }
        if (sh && Math.abs(du) >= hw && dv < win.h && inTop) { const s = R(sh); return Math.abs(Math.abs(du) - hw - 1.25) < 0.4 ? tone(s, t + 1.2, i, j) : tone(s, t, i, j); }
      }
    }
    /* timber framing: corner posts, studs, rails at each floor and braces in the end bays */
    if (spec.timber) {
      const tr = R(spec.timber === true ? C.timber : spec.timber), fv = v % fh, bay = 8, bu = u % bay;
      const post = u < 1.6 || u > len - 1.6, rail = fv < 1.6 || v > spec.h - 1.6 || Math.abs(fv - fh * 0.5) < 0.6 && spec.midrail, stud = bu < 1.2 && u > 3 && u < len - 3;
      const brace = (u < bay && Math.abs(u - fv * bay / fh) < 1) || (u > len - bay && Math.abs(len - u - fv * bay / fh) < 1);
      if (post || rail || stud || (brace && v > 2)) return tone(tr, t + (rail && fv > 0.8 ? -0.3 : 0), i, j);
    }
    /* quoins at the corner nearest the viewer */
    if (spec.quoins) {
      const cd = spec.quoins === 'end' ? len - u : u, course = Math.floor(v / 5), wq = course % 2 ? 6 : 3.5;
      if (cd < wq && v < spec.h) { const r = R(C.ashlarD); if (v % 5 < 0.9 || Math.abs(cd - wq) < 0.9) return tone(r, t + 1.5, i, j); return tone(r, t - 0.6 - (v % 5 >= 4 ? 0.5 : 0), i, j); }
    }
    if (spec.plinth && v < spec.plinth) return MAT.ashlar(C.grey, 3, 5)(u, v, i, j, t);
    let k = t; if (spec.eave !== false && v > spec.h - 2.5 && v <= spec.h) k += 0.9;
    return spec.mat(u, v, i, j, k);
  };
}
/* the window's sill shadow comes back as null: draw the fill a step darker there */
const withShadow = (sh, spec) => (p, a, b, i, j) => { const c = sh(p, a, b, i, j); if (c !== null) return c; const face = spec.face, u = face === 'y' ? (p[0] - spec.x0) * 16 : (spec.y1 - p[1]) * 16; return spec.mat(u, p[2] - spec.z0, i, j, WALL_T[face] + 1.2); };
/* the two seen walls of a block, door placed on o.face when it is seen */
function walls(F, o, x0, y0, x1, y1, z0, spec, part = 1) {
  const mk = face => {
    const len = face === 'y' ? (x1 - x0) * 16 : (y1 - y0) * 16, seen = face === 'y' ? o.face === 0 : o.face === 1;
    const s = Object.assign({}, spec, { door: spec.door && seen ? Object.assign({ u: len / 2 }, spec.door) : null, quoins: spec.quoins ? (face === 'y' ? 'end' : 'start') : null });
    return withShadow(wall(face, x0, y0, x1, y1, z0, s), { face, x0, y1, z0, mat: spec.mat });
  };
  F.box(x0, y0, x1, y1, z0, z0 + spec.h, { y: mk('y'), x: mk('x') }, part);
  return mk;
}

/* ---------- roofs ---------- */
/* roof materials: (s, t, i, j, k) with s columns along the eave, t pixels up the slope from it, T the slope's length */
const ROOF = {
  thatch: col => (s, t, i, j, k, T) => {
    const r = R(col), row = Math.floor(t / 4), rt = t % 4;
    if (t < 1.4 && hash(s | 0, 1) < 0.4) return null;
    if (t > T - 3) return tone(r, k + 0.3 + ((s | 0) % 5 === 0 ? 1.2 : 0) + (t > T - 1 ? -0.6 : 0), i, j);
    let q = k; if (rt < 0.9 && row > 0) q += 1.2; else if (rt >= 3) q -= 0.5;
    const n = hash(s | 0, row, 3); if (n < 0.22) q += 0.6; else if (n > 0.86) q -= 0.6;
    return tone(r, q, i, j);
  },
  tiles: col => (s, t, i, j, k) => { const r = R(col), row = Math.floor(t / 3), rt = t % 3, ss = (s + (row % 2) * 2) % 4; if (rt < 0.9) return tone(r, k + 1.6, i, j); if (ss < 0.9) return tone(r, k + 1, i, j); return tone(r, k + (ss < 1.9 ? -0.6 : 0) + (rt >= 2 ? -0.3 : 0) + (hash(Math.floor((s + (row % 2) * 2) / 4), row, 5) < 0.12 ? 0.6 : 0), i, j); },
  slate: col => (s, t, i, j, k) => { const r = R(col), row = Math.floor(t / 3), rt = t % 3, ss = (s + (row % 2) * 2.5) % 5, id = Math.floor((s + (row % 2) * 2.5) / 5); if (rt < 0.9) return tone(r, k + 1.5, i, j); if (ss < 0.9) return tone(r, k + 1, i, j); return tone(r, k + (hash(id, row, 4) < 0.25 ? 0.5 : hash(id, row, 6) < 0.15 ? -0.5 : 0) + (rt >= 2 ? -0.4 : 0), i, j); },
  shingle: col => (s, t, i, j, k) => { const r = R(col), row = Math.floor(t / 3), w = 2 + Math.floor(hash(Math.floor(s / 3), row, 2) * 2); if (t % 3 < 0.9) return tone(r, k + 1.5, i, j); if (s % w < 0.9) return tone(r, k + 0.9, i, j); return tone(r, k + (hash(Math.floor(s / w), row, 9) < 0.3 ? 0.4 : 0), i, j); },
  copper: col => (s, t, i, j, k) => { const r = R(col); if (s % 4 < 0.9) return tone(r, k - 0.8, i, j); return tone(r, k + (hash(s | 0, (t / 3) | 0, 2) < 0.18 ? 0.6 : 0), i, j); },
  lead: col => (s, t, i, j, k) => tone(R(col), k + ((s | 0) % 6 === 0 ? 0.8 : 0), i, j)
};
/* a roof plane A B C D (A->B the eave, A->D up the slope) in a material; len columns along, T px up */
function roofPlane(F, A, B, C, D, mat, part, len, T) {
  const k = planeTone(A, B, D);
  F.quad(A, B, C, D, (p, a, b, i, j) => mat(a * len, b * T, i, j, k, T), part);
}
function roofTri(F, A, B, C, mat, part, len, T) {
  const k = planeTone(A, B, C);
  F.tri(A, B, C, (p, a, b, i, j) => mat(a * len, b * T, i, j, k, T), part, [0, 0], [1, 0], [0.5, 1]);
}
/* map a canonical frame (ridge along x) to the footprint: swap x and y when the ridge runs along y */
const frame = along => (along === 'y' ? (x, y, z) => [y, x, z] : (x, y, z) => [x, y, z]);
/* a gable roof over [x0, y0, x1, y1] from height h, rising rh, ridge along `along`, with eave overhang ov (tiles),
   gable overhang g; the gable end seen is filled by gableSh (a wall shader), barge boards in trim */
function gable(F, x0, y0, x1, y1, h, rh, along, mat, opt = {}) {
  const M = frame(along), [a0, b0, a1, b1] = along === 'y' ? [y0, x0, y1, x1] : [x0, y0, x1, y1];
  const ov = opt.ov ?? 0.12, g = opt.g ?? 0.08, hd = (b1 - b0) / 2, cb = (b0 + b1) / 2, ze = h - ov * rh / hd, top = h + rh, thick = opt.thick ?? 2;
  const len = (a1 - a0 + 2 * g) * 16, T = Math.hypot((hd + ov) * TILE, rh + ov * rh / hd), part = opt.part ?? 5;
  roofPlane(F, M(a0 - g, b0 - ov, ze), M(a1 + g, b0 - ov, ze), M(a1 + g, cb, top), M(a0 - g, cb, top), mat, part, len, T);
  roofPlane(F, M(a0 - g, b1 + ov, ze), M(a1 + g, b1 + ov, ze), M(a1 + g, cb, top), M(a0 - g, cb, top), mat, part, len, T);
  /* the roof's thickness along the front eave, and the gable seen */
  const edge = R(opt.edge || C.timber);
  F.quad(M(a0 - g, b1 + ov, ze), M(a1 + g, b1 + ov, ze), M(a1 + g, b1 + ov, ze - thick), M(a0 - g, b1 + ov, ze - thick), (p, a, b, i, j) => tone(edge, 2.6, i, j), part);
  if (opt.gableSh) F.tri(M(a1, b1, h), M(a1, b0, h), M(a1, cb, top), opt.gableSh, opt.gablePart ?? 1);
  /* barge boards up the seen gable */
  for (const [bb, sgn] of [[b1 + ov, 1], [b0 - ov, -1]]) {
    const A = M(a1 + g, bb, ze), B = M(a1 + g, cb, top + 0.5);
    F.quad(A, B, [B[0], B[1], B[2] - 2], [A[0], A[1], A[2] - 2], (p, a, b, i, j) => tone(edge, sgn > 0 ? 2 : 3, i, j), part + 1);
  }
  return { top, ze };
}
/* a hipped roof (a pyramid on a square) */
function hip(F, x0, y0, x1, y1, h, rh, mat, opt = {}) {
  const along = x1 - x0 >= y1 - y0 ? 'x' : 'y', M = frame(along), [a0, b0, a1, b1] = along === 'y' ? [y0, x0, y1, x1] : [x0, y0, x1, y1];
  const ov = opt.ov ?? 0.1, hd = (b1 - b0) / 2, cb = (b0 + b1) / 2, ze = h - ov * rh / hd, top = h + rh, part = opt.part ?? 5;
  let r0 = a0 + hd, r1 = a1 - hd; if (r0 > r1) r0 = r1 = (a0 + a1) / 2;
  const len = (a1 - a0 + 2 * ov) * 16, T = Math.hypot((hd + ov) * TILE, rh + ov * rh / hd);
  roofPlane(F, M(a0 - ov, b0 - ov, ze), M(a1 + ov, b0 - ov, ze), M(r1, cb, top), M(r0, cb, top), mat, part, len, T);
  roofPlane(F, M(a0 - ov, b1 + ov, ze), M(a1 + ov, b1 + ov, ze), M(r1, cb, top), M(r0, cb, top), mat, part, len, T);
  const lenE = (b1 - b0 + 2 * ov) * 16;
  roofTri(F, M(a1 + ov, b1 + ov, ze), M(a1 + ov, b0 - ov, ze), M(r1, cb, top), mat, part, lenE, T);
  roofTri(F, M(a0 - ov, b0 - ov, ze), M(a0 - ov, b1 + ov, ze), M(r0, cb, top), mat, part, lenE, T);
  const edge = R(opt.edge || C.timber);
  F.quad(M(a0 - ov, b1 + ov, ze), M(a1 + ov, b1 + ov, ze), M(a1 + ov, b1 + ov, ze - 2), M(a0 - ov, b1 + ov, ze - 2), (p, a, b, i, j) => tone(edge, 2.6, i, j), part);
  F.quad(M(a1 + ov, b1 + ov, ze), M(a1 + ov, b0 - ov, ze), M(a1 + ov, b0 - ov, ze - 2), M(a1 + ov, b1 + ov, ze - 2), (p, a, b, i, j) => tone(edge, 3.2, i, j), part);
  return { top, ze, apex: M((r0 + r1) / 2, cb, top) };
}
/* a cone or spire on a round tower */
function cone(F, cx, cy, r, z, h, mat, part = 5, ov = 0.06) {
  const T = Math.hypot((r + ov) * TILE, h), circ = (r + ov) * Math.PI * 2 * 16;
  F.lathe(cx, cy, t => [(r + ov) * (1 - t), z - 2 + (h + 2) * t], (p, ang, t, i, j, n) => mat(ang * circ, t * T, i, j, toneOf(lum(...n)), T), part);
}
/* a pyramid spire on a square tower */
function spire(F, x0, y0, x1, y1, z, h, mat, part = 5) { return hip(F, x0, y0, x1, y1, z, h, mat, { ov: 0.03, part }); }

/* ---------- small parts ---------- */
const stoneSh = (col, face, course = 4, len = 6) => (p, a, b, i, j) => MAT.ashlar(col, course, len)(face === 'y' ? p[0] * 16 : -p[1] * 16, p[2], i, j, WALL_T[face]);
function chimney(F, x, y, z0, z1, col = C.stone, part = 8, smoke = false) {
  const s = 0.09;
  F.box(x - s, y - s, x + s, y + s, z0, z1, { y: stoneSh(col, 'y', 3, 4), x: stoneSh(col, 'x', 3, 4), top: (p, a, b, i, j) => R(col)[5] }, part);
  F.box(x - s - 0.03, y - s - 0.03, x + s + 0.03, y + s + 0.03, z1, z1 + 2, { y: (p, a, b, i, j) => tone(R(col), WALL_T.y - 0.5, i, j), x: (p, a, b, i, j) => tone(R(col), WALL_T.x, i, j), top: (p, a, b, i, j) => R('#2a2018')[3] }, part);
  F.box(x - s + 0.04, y - s + 0.04, x + s - 0.04, y + s - 0.04, z1 + 2, z1 + 3, { y: (p, a, b, i, j) => R('#7a5a3a')[2], x: (p, a, b, i, j) => R('#7a5a3a')[3] }, part);
  if (smoke) puff(F, x, y, z1 + 3);
}
function puff(F, x, y, z, part = 30) {
  /* two small puffs drifting off to the right as they rise */
  const sm = R(C.smoke);
  [[1, 4, 2.2], [4, 10, 2.8]].forEach(([dx, dz, r], k) => F.blob(x + dx / 32, y - dx / 32, z + dz, r, r * 0.8, (n, i, j) => {
    const l = -n[0] * 0.5 - n[1] * 0.7 + n[2] * 0.4; return sm[l > 0.45 ? 0 : l > 0 ? 1 : 2];
  }, part + k, a => 1 + 0.15 * Math.sin(a * 4 + k), 0.2));
}
function flag(F, x, y, z, hgt, col, part = 40) {
  const pole = R('#5a4632'), cl = R(col);
  F.line([x, y, z], [x, y, z + hgt], pole[2], part);
  F.line([x, y, z], [x, y, z + hgt], pole[1], part, 0.6);
  for (let k = 0; k < 7; k++) for (let m = 0; m <= Math.max(0, 3 - Math.floor(k / 2)); m++) F.dot(x, y, z + hgt - 1 - m, cl[k % 3 === 0 ? 1 : 2], part, 1, 1 + k, Math.floor(k / 4));
  F.dot(x, y, z + hgt + 1, R(GOLD)[1], part, 1);
}
function merlons(F, x0, y0, x1, y1, z, col, part = 9, step = 0.22, size = 0.1, hgt = 4) {
  const sh = { y: stoneSh(col, 'y', 4, 5), x: stoneSh(col, 'x', 4, 5), top: (p, a, b, i, j) => R(col)[1] };
  const n = (a0, a1) => Math.max(2, Math.round((a1 - a0) / step));
  for (let k = 0; k <= n(x0, x1); k++) { const x = x0 + (x1 - x0 - size) * k / n(x0, x1); F.box(x, y0, x + size, y0 + size, z, z + hgt, sh, part); F.box(x, y1 - size, x + size, y1, z, z + hgt, sh, part); }
  for (let k = 0; k <= n(y0, y1); k++) { const y = y0 + (y1 - y0 - size) * k / n(y0, y1); F.box(x0, y, x0 + size, y + size, z, z + hgt, sh, part); F.box(x1 - size, y, x1, y + size, z, z + hgt, sh, part); }
}
const flat = col => (p, a, b, i, j) => tone(R(col), 1 + (hash(i, j, 2) < 0.08 ? 0.8 : 0), i, j);
/* a round tower: coursed stone on a lathe, with slit windows */
function tower(F, cx, cy, r, z0, z1, col, part = 2, slits = []) {
  const circ = r * Math.PI * 2 * 16;
  F.lathe(cx, cy, t => [r, z0 + (z1 - z0) * t], (p, ang, t, i, j, n) => {
    const v = p[2] - z0, u = ang * circ, k = toneOf(lum(...n));
    for (const [a, zz] of slits) { const du = Math.abs(((ang - a + 1.5) % 1) - 0.5) * circ; if (du < 1.1 && Math.abs(p[2] - zz) < 3) return R('#2f271f')[du < 0.5 ? 3 : 4]; }
    return MAT.ashlar(col, 4, 6)(u, v, i, j, k);
  }, part);
}

/* ---------- houses ---------- */
/* a house: walls (mat, floors), windows and a door, a gable or hipped roof, chimneys */
function house(F, o, s) {
  const ins = s.ins ?? 0.12, x0 = ins, y0 = ins, x1 = o.w - ins, y1 = o.d - ins, z0 = s.z0 || 0, h = s.h, along = o.axis;
  const spec = { mat: s.mat, h, floors: s.floors || 1, win: s.win, door: s.door === false ? null : Object.assign({ w: 6, h: 12 }, s.door || {}), timber: s.timber, quoins: s.quoins, plinth: s.plinth, trim: s.trim, midrail: s.midrail };
  if (s.jetty) {
    /* a jettied upper storey overhangs the one below */
    const lo = Object.assign({}, spec, { h: s.jetty, floors: 1 }), j2 = 0.05;
    walls(F, o, x0, y0, x1, y1, z0, lo, 1);
    F.box(x0 - j2, y0 - j2, x1 + j2, y1 + j2, z0 + s.jetty - 2, z0 + s.jetty, { y: (p, a, b, i, j) => tone(R(C.timber), 2, i, j), x: (p, a, b, i, j) => tone(R(C.timber), 3, i, j) }, 3);
    walls(F, o, x0 - j2, y0 - j2, x1 + j2, y1 + j2, z0 + s.jetty, Object.assign({}, spec, { h: h - s.jetty, floors: Math.max(1, (s.floors || 2) - 1), door: null }), 3);
  } else walls(F, o, x0, y0, x1, y1, z0, spec, 1);
  const j2 = s.jetty ? 0.05 : 0, gx1 = x1 + j2, gx0 = x0 - j2, gy0 = y0 - j2, gy1 = y1 + j2;
  const gSpec = Object.assign({}, spec, { h: h + s.rh, floors: 1, door: null, win: s.attic ? { w: 3, h: 4, at: h + s.rh * 0.25, every: 99 } : null, eave: false, quoins: null, plinth: 0 });
  const gableSh = along === 'y' ? wall('y', gx0, gy0, gx1, gy1, z0, gSpec) : wall('x', gx0, gy0, gx1, gy1, z0, gSpec);
  const roof = s.hip ? hip(F, gx0, gy0, gx1, gy1, z0 + h, s.rh, s.roof, { ov: s.ov ?? 0.1, edge: s.edge }) : gable(F, gx0, gy0, gx1, gy1, z0 + h, s.rh, along, s.roof, { ov: s.ov ?? 0.12, gableSh, edge: s.edge, thick: s.thick });
  for (const [fx, fy, extra = 4, smoke] of s.chimneys || []) chimney(F, x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy, z0 + h, z0 + h + s.rh + extra, s.chimneyCol || C.stone, 8, smoke);
  return { x0, y0, x1, y1, roof };
}

/* ---------- the designs ---------- */
const DESIGNS = {
  cottage: { top: 70, draw(F, o) {
    house(F, o, { mat: MAT.plaster(pickv(C.plaster, o.v)), h: 20, rh: 18, roof: ROOF.thatch(C.thatch), ov: 0.1, thick: 3, edge: '#8a6a3a', win: { w: 5, h: 6, shutter: pickv(C.shutter, o.v * 3.7) }, door: { w: 5, h: 12 }, timber: o.v > 0.6 ? C.timber : null, plinth: 3, chimneys: [[0.7, 0.3, 4, o.v > 0.5]], chimneyCol: C.rubble });
  } },
  townhouse: { top: 82, draw(F, o) {
    house(F, o, { mat: MAT.plaster(pickv(['#f0e4c6', '#ecd2a2', '#e9c4b2'], o.v)), h: 40, jetty: 18, floors: 2, rh: 20, roof: ROOF.tiles(C.tiles), timber: true, midrail: true, win: { w: 5, h: 7, every: 10 }, door: { w: 5, h: 12, col: '#5a3a28' }, plinth: 3, chimneys: [[0.75, 0.25, 6]], attic: true });
  } },
  longhouse: { top: 56, draw(F, o) {
    const r = house(F, o, { mat: MAT.logs(C.log), h: 14, rh: 24, roof: ROOF.thatch(C.thatch), ov: 0.18, thick: 3, edge: '#8a6a3a', win: { w: 4, h: 4, at: 5, every: 18, shutter: null }, door: { w: 6, h: 11 }, ins: 0.12 });
    const [px, py] = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]; puff(F, px, py, r.roof.top);
  } },
  barn: { top: 62, draw(F, o) {
    const ins = 0.1, x0 = ins, y0 = ins, x1 = o.w - ins, y1 = o.d - ins, h = 22, dface = o.face % 2 ? 1 : 0;
    const spec = { mat: MAT.boards(C.barn), h, win: { w: 4, h: 4, at: 14, every: 20, frame: '#f0e6cb', glass: '#2a2018' }, door: { w: 12, h: 16, kind: 'barn', col: '#7c3a2a' }, trim: '#f0e6cb', eave: true };
    walls(F, Object.assign({}, o, { face: dface }), x0, y0, x1, y1, 0, spec, 1);
    const gSpec = Object.assign({}, spec, { h: h + 20, door: null, win: { w: 5, h: 6, at: h + 3, every: 99, frame: '#f0e6cb', glass: '#d9b860' }, eave: false });
    gable(F, x0, y0, x1, y1, h, 20, o.axis, ROOF.shingle(C.shingle), { ov: 0.12, gableSh: wall(o.axis === 'y' ? 'y' : 'x', x0, y0, x1, y1, 0, gSpec), edge: '#f0e6cb' });
  } },
  granary: { top: 52, draw(F, o) {
    const x0 = 0.2, y0 = 0.2, x1 = o.w - 0.2, y1 = o.d - 0.2, st = R(C.stone);
    for (const [x, y] of [[x0 + 0.08, y0 + 0.08], [x1 - 0.08, y0 + 0.08], [x0 + 0.08, y1 - 0.08], [x1 - 0.08, y1 - 0.08]]) {
      F.lathe(x, y, t => [0.05, t * 7], (p, a, t, i, j, n) => tone(st, toneOf(lum(...n)), i, j), 2, 12);
      F.lathe(x, y, t => [0.11 * (1 - t * 0.6), 7 + t * 3], (p, a, t, i, j, n) => tone(st, toneOf(lum(...n)) - 0.3, i, j), 2, 14);
    }
    walls(F, o, x0, y0, x1, y1, 10, { mat: MAT.boards(C.plank, 2), h: 16, win: null, door: { w: 4, h: 9, col: '#5a3f28' }, timber: C.timber }, 1);
    hip(F, x0, y0, x1, y1, 26, 16, ROOF.thatch(C.thatch), { ov: 0.14, edge: '#8a6a3a' });
  } },
  smithy: { top: 70, draw(F, o) {
    const r = house(F, o, { mat: MAT.rubble(C.rubble), h: 20, rh: 12, roof: ROOF.slate(C.slate), win: { w: 4, h: 5 }, door: { w: 8, h: 13, kind: 'open' }, edge: '#4d5862' });
    /* the forge's glow in the doorway and the anvil before it */
    const seen = o.face === 0 ? 'y' : o.face === 1 ? 'x' : null;
    if (seen) {
      const [dx, dy] = seen === 'y' ? [(r.x0 + r.x1) / 2, r.y1] : [r.x1, (r.y0 + r.y1) / 2], gl = R('#f4a040');
      for (let k = -2; k <= 2; k++) for (let m = 1; m < 6; m++) if (hash(k, m, 4) < 0.6) F.dot(dx + (seen === 'y' ? k * 0.06 : 0), dy - (seen === 'x' ? k * 0.06 : 0), m, Object.assign(gl[m < 3 ? 0 : 1].slice(), { glow: 1 }), 20, 0.4);
      const ax = dx + (seen === 'y' ? 0.18 : 0.12), ay = dy + (seen === 'y' ? 0.12 : 0.18), an = R(C.iron);
      F.box(ax - 0.05, ay - 0.03, ax + 0.05, ay + 0.03, 0, 4, { y: flat(C.grey), x: flat(C.grey) }, 21);
      F.box(ax - 0.09, ay - 0.04, ax + 0.07, ay + 0.04, 4, 6, { y: (p, a, b, i, j) => an[2], x: (p, a, b, i, j) => an[3], top: (p, a, b, i, j) => an[1] }, 21);
    }
    chimney(F, r.x0 + 0.18, r.y0 + 0.2, 6, 46, C.grey, 8, true);
  } },
  tavern: { top: 92, draw(F, o) {
    const r = house(F, o, { mat: MAT.plaster('#efdfc0'), h: 40, jetty: 18, floors: 2, rh: 20, hip: true, roof: ROOF.tiles(C.tiles), timber: true, win: { w: 5, h: 7, every: 11, lit: true }, door: { w: 6, h: 13, col: '#5a3a28' }, plinth: 4, chimneys: [[0.2, 0.3, 6, true], [0.85, 0.3, 6]] });
    /* the hanging sign: a bracket from the corner and a board with a golden tankard */
    const fy = o.axis === 'x', bx = fy ? r.x0 + 0.3 : r.x1 + 0.05, by = fy ? r.y1 + 0.05 : r.y0 + 0.3, z = 26, wood = R('#5a3f28');
    const out = fy ? [0, 0.32] : [0.32, 0];
    F.line([bx, by, z], [bx + out[0], by + out[1], z], wood[3], 22, 2);
    const sx = bx + out[0] * 0.75, sy = by + out[1] * 0.75;
    F.quad([sx - (fy ? 0.12 : 0), sy - (fy ? 0 : 0.12), z - 1], [sx + (fy ? 0.12 : 0), sy + (fy ? 0 : 0.12), z - 1], [sx + (fy ? 0.12 : 0), sy + (fy ? 0 : 0.12), z - 9], [sx - (fy ? 0.12 : 0), sy - (fy ? 0 : 0.12), z - 9],
      (p, a, b, i, j) => { const e = a < 0.12 || a > 0.88 || b < 0.12 || b > 0.88; if (e) return wood[3]; if (Math.abs(a - 0.5) < 0.2 && b > 0.3 && b < 0.75) return R(GOLD)[a < 0.45 ? 1 : 2]; return R('#7a4a2a')[2]; }, 23);
  } },
  chapel: { top: 108, draw(F, o) {
    const ax = o.axis === 'x', L = ax ? o.w : o.d, ins = 0.12, tw = 0.64;
    const nave = ax ? [ins, 0.2, L - tw - 0.02, o.d - 0.2] : [0.2, ins, o.w - 0.2, L - tw - 0.02];
    const tw0 = ax ? [L - tw, 0.14, L - ins, o.d - 0.14] : [0.14, L - tw, o.w - 0.14, L - ins];
    const spec = { mat: MAT.ashlar('#ebe2cc'), h: 26, win: { w: 5, h: 13, kind: 'lancet', frame: C.ashlarD, glass: '#4b5a6e', every: 10 }, door: null, plinth: 3 };
    walls(F, o, ...nave, 0, spec, 1);
    gable(F, ...nave, 26, 18, o.axis, ROOF.slate(C.slate), { ov: 0.08, edge: '#4d5862', gableSh: wall(ax ? 'x' : 'y', ...nave, 0, Object.assign({}, spec, { h: 44, win: { w: 5, h: 5, kind: 'round', at: 30, every: 99, frame: C.ashlarD }, eave: false })) });
    walls(F, Object.assign({}, o, { face: ax ? 1 : 0 }), ...tw0, 0, { mat: MAT.ashlar('#e2d8c0'), h: 58, floors: 1, win: { w: 4, h: 7, kind: 'lancet', at: 44, every: 99, glass: '#2f271f', frame: C.ashlarD }, door: { w: 7, h: 15, kind: 'arch', col: '#4a3524' }, plinth: 3, quoins: true, trim: C.ashlarD }, 3);
    const sp = spire(F, ...tw0, 58, 30, ROOF.slate(C.slate), 6);
    const [cx, cy] = [sp.apex[0], sp.apex[1]], gold = R(GOLD);
    F.line([cx, cy, sp.top], [cx, cy, sp.top + 9], gold[2], 41); F.line([cx - 0.07, cy + 0.07, sp.top + 6], [cx + 0.07, cy - 0.07, sp.top + 6], gold[1], 41);
  } },
  watchtower: { top: 86, draw(F, o) {
    const x0 = 0.24, y0 = 0.24, x1 = o.w - 0.24, y1 = o.d - 0.24, zp = 44, wood = R(C.plankD);
    const leg = (x, y) => F.box(x - 0.035, y - 0.035, x + 0.035, y + 0.035, 0, zp, { y: (p, a, b, i, j) => tone(wood, 2 + (hash(i, j) < 0.1 ? 0.7 : 0), i, j), x: (p, a, b, i, j) => wood[3] }, 2);
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) leg(x, y);
    /* cross bracing on the two seen sides */
    for (let z = 4; z < zp - 6; z += 13) {
      F.line([x0, y1, z], [x1, y1, z + 11], wood[2], 3); F.line([x1, y1, z], [x0, y1, z + 11], wood[3], 3);
      F.line([x1, y1, z], [x1, y0, z + 11], wood[3], 3); F.line([x1, y0, z], [x1, y1, z + 11], wood[4], 3);
    }
    F.box(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, zp, zp + 2, { y: (p, a, b, i, j) => wood[2], x: (p, a, b, i, j) => wood[3], top: (p, a, b, i, j) => wood[1] }, 4);
    walls(F, o, x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, zp + 2, { mat: MAT.boards(C.plank, 2), h: 7, win: null, door: null, eave: false }, 4);
    for (const [x, y] of [[x1 + 0.06, y1 + 0.06], [x1 + 0.06, y0 - 0.04], [x0 - 0.04, y1 + 0.06]]) F.box(x - 0.03, y - 0.03, x, y, zp + 9, zp + 16, { y: (p, a, b, i, j) => wood[2], x: (p, a, b, i, j) => wood[3] }, 4);
    hip(F, x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, zp + 16, 12, ROOF.thatch(C.thatch), { ov: 0.1, edge: '#8a6a3a' });
    if (o.v > 0.3) flag(F, o.w / 2, o.d / 2, zp + 27, 12, WAX);
  } },
  stonetower: { top: 132, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2;
    tower(F, cx, cy, 0.36, 0, 78, '#e2d8c0', 2, [[0.1, 26], [0.2, 50], [0.05, 68]]);
    if (o.v < 0.5) { cone(F, cx, cy, 0.36, 78, 38, ROOF.slate(C.slate)); if (o.v < 0.25) flag(F, cx, cy, 116, 12, GOLD); }
    else {
      F.lathe(cx, cy, t => [0.4, 78 + t * 3], (p, a, t, i, j, n) => MAT.ashlar('#d6ccb6', 3, 5)(a * 40, p[2], i, j, toneOf(lum(...n))), 3);
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; if (Math.cos(a) + Math.sin(a) < -0.6) continue; const x = cx + Math.cos(a) * 0.36, y = cy + Math.sin(a) * 0.36; F.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 81, 86, { y: stoneSh('#e2d8c0', 'y', 5, 4), x: stoneSh('#e2d8c0', 'x', 5, 4), top: flat('#d6ccb6') }, 4); }
      F.lathe(cx, cy, t => [0.32 * (1 - t), 80 + t * 0.1], (p, a, t, i, j) => tone(R(C.lead), 2, i, j), 3);
      flag(F, cx, cy, 81, 16, WAX);
    }
  } },
  keep: { top: 118, draw(F, o) {
    const x0 = 0.18, y0 = 0.18, x1 = o.w - 0.18, y1 = o.d - 0.18, zt = 70;
    walls(F, o, x0, y0, x1, y1, 0, { mat: MAT.ashlar(C.stone, 4, 8), h: zt, floors: 3, win: { w: 5, h: 8, kind: 'round', frame: C.ashlarD, glass: '#2f271f', every: 12, ground: false }, door: { w: 9, h: 16, kind: 'arch', col: '#3a2a1c' }, quoins: true, plinth: 5, trim: C.ashlarD }, 1);
    /* buttressed corners and a string course */
    for (const [x, y] of [[x1, y1], [x1, y0 + 0.1], [x0 + 0.1, y1]]) F.box(x - 0.12, y - 0.12, x + 0.04, y + 0.04, 0, zt, { y: stoneSh(C.ashlarD, 'y', 4, 5), x: stoneSh(C.ashlarD, 'x', 4, 5) }, 2);
    F.box(x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, zt, zt + 3, { y: stoneSh(C.ashlarD, 'y', 3, 5), x: stoneSh(C.ashlarD, 'x', 3, 5), top: (p, a, b, i, j) => tone(R(C.lead), 1.6 + (hash(i >> 2, j >> 1) < 0.2 ? 0.5 : 0), i, j) }, 3);
    merlons(F, x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, zt + 3, C.stone, 9, 0.24, 0.12, 5);
    flag(F, o.w / 2, o.d / 2, zt + 3, 22, WAX);
  } },
  lighthouse: { top: 150, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2;
    F.box(cx - 0.42, cy - 0.42, cx + 0.42, cy + 0.42, 0, 8, { y: stoneSh(C.stone, 'y'), x: stoneSh(C.stone, 'x'), top: flat(C.ashlarD) }, 1);
    F.lathe(cx, cy, t => [0.32 - t * 0.08, 8 + t * 92], (p, ang, t, i, j, n) => {
      const k = toneOf(lum(...n)), band = Math.floor((p[2] - 8) / 15) % 2 === 1, col = band ? '#b8483a' : '#f1ebdc';
      if (Math.abs(((ang * 3) % 1) - 0.2) < 0.03 && (p[2] | 0) % 23 > 15) return R('#2f271f')[3];
      return tone(R(col), k - 0.2 + ((p[2] | 0) % 15 === 0 ? 0.9 : 0), i, j);
    }, 2);
    F.lathe(cx, cy, t => [0.3, 100 + t * 3], (p, a, t, i, j, n) => tone(R('#5a5048'), toneOf(lum(...n)), i, j), 3);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, x = cx + Math.cos(a) * 0.3, y = cy + Math.sin(a) * 0.3; F.line([x, y, 103], [x, y, 107], R(C.iron)[2], 4, 0.2); }
    F.lathe(cx, cy, t => [0.17, 103 + t * 12], (p, ang, t, i, j) => (Math.abs(((ang * 6) % 1) - 0.5) < 0.12 ? R(C.iron)[3] : Object.assign(R(C.warm)[t > 0.5 ? 0 : 1].slice(), { glow: 1 })), 5);
    cone(F, cx, cy, 0.19, 115, 10, (s, t, i, j, k) => tone(R('#3e3732'), k, i, j), 6, 0.02);
    F.dot(cx, cy, 126, R(GOLD)[1], 7);
  } },
  temple: { top: 70, draw(F, o) {
    const x0 = 0.08, y0 = 0.08, x1 = o.w - 0.08, y1 = o.d - 0.08, mb = R(C.marble), ax = o.axis === 'x';
    F.box(x0, y0, x1, y1, 0, 3, { y: stoneSh('#d9d0bb', 'y', 3, 6), x: stoneSh('#d9d0bb', 'x', 3, 6), top: flat('#e2dac6') }, 1);
    F.box(x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, 3, 6, { y: stoneSh('#e2dac6', 'y', 3, 6), x: stoneSh('#e2dac6', 'x', 3, 6), top: flat('#ece5d4') }, 1);
    const [c0, d0, c1, d1] = [x0 + 0.22, y0 + 0.22, x1 - 0.22, y1 - 0.22];
    walls(F, o, c0 + 0.12, d0 + 0.12, c1 - 0.12, d1 - 0.12, 6, { mat: MAT.ashlar('#ddd3bb', 4, 8), h: 26, win: null, door: { w: 7, h: 16, kind: 'arch', col: '#5a4232' }, eave: true }, 2);
    const cols = [], n = 5;
    for (let k = 0; k < n; k++) { const f = k / (n - 1); cols.push(ax ? [c0 + (c1 - c0) * f, d1] : [c1, d0 + (d1 - d0) * f]); }
    for (let k = 0; k < 3; k++) { const f = k / 2; cols.push(ax ? [c1, d0 + (d1 - d0) * f] : [c0 + (c1 - c0) * f, d1]); }
    for (const [x, y] of cols) {
      F.lathe(x, y, t => [t < 0.05 || t > 0.94 ? 0.085 : 0.065 - t * 0.012, 6 + t * 26], (p, ang, t, i, j, n) => tone(mb, toneOf(lum(...n)) - 0.3 + (Math.abs(((ang * 8) % 1) - 0.5) < 0.12 ? 0.7 : 0), i, j), 3, 16);
    }
    F.box(x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, 32, 37, { y: (p, a, b, i, j) => tone(mb, WALL_T.y - 0.3 + ((p[2] | 0) === 34 ? 1 : 0) + (((p[0] * 16) | 0) % 4 === 0 && p[2] > 35 ? 0.8 : 0), i, j), x: (p, a, b, i, j) => tone(mb, WALL_T.x - 0.3 + ((p[2] | 0) === 34 ? 1 : 0), i, j), top: flat(C.marble) }, 4);
    const pd = Object.assign({}, { mat: MAT.ashlar(C.marble, 20, 99), h: 50, win: null, door: null, eave: false });
    gable(F, x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, 37, 12, o.axis, ROOF.tiles('#c9bfa6'), { ov: 0.04, g: 0.02, edge: C.marble, gableSh: wall(ax ? 'x' : 'y', x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, 0, pd) });
  } },
  markethall: { top: 80, draw(F, o) {
    const x0 = 0.1, y0 = 0.1, x1 = o.w - 0.1, y1 = o.d - 0.1, ax = o.axis === 'x', n = 4, posts = [];
    for (let k = 0; k < n; k++) { const f = k / (n - 1); posts.push(ax ? [x0 + 0.06 + (x1 - x0 - 0.12) * f, y1 - 0.06] : [x1 - 0.06, y0 + 0.06 + (y1 - y0 - 0.12) * f]); posts.push(ax ? [x0 + 0.06 + (x1 - x0 - 0.12) * f, y0 + 0.06] : [x0 + 0.06, y0 + 0.06 + (y1 - y0 - 0.12) * f]); }
    for (const [x, y] of posts) F.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 18, { y: stoneSh(C.stone, 'y', 3, 4), x: stoneSh(C.stone, 'x', 3, 4) }, 2);
    /* goods under the hall */
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    F.box(mx - 0.25, my - 0.1, mx - 0.05, my + 0.1, 0, 5, { y: flat('#b48a58'), x: flat('#8a643c'), top: flat('#c9a46a') }, 3);
    F.lathe(mx + 0.15, my, t => [0.07, t * 6], (p, a, t, i, j, nn) => tone(R('#9a6a3a'), toneOf(lum(...nn)) + ((p[2] | 0) % 3 === 0 ? 0.8 : 0), i, j), 3, 12);
    /* the hall's timber-framed upper floor stands on the posts */
    F.box(x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, 16, 18, { y: (p, a, b, i, j) => tone(R(C.timber), 2, i, j), x: (p, a, b, i, j) => tone(R(C.timber), 3, i, j) }, 3);
    house(F, o, { z0: 18, mat: MAT.plaster('#efe0c0'), h: 18, rh: 18, hip: true, roof: ROOF.tiles(C.tiles), timber: true, win: { w: 5, h: 6, at: 6, every: 11 }, door: false, ins: 0.1, plinth: 0, chimneys: [] });
  } },
  yurt: { top: 44, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2, felt = pickv(C.felt, o.v), seen = o.face === 0 ? Math.PI / 2 : o.face === 1 ? 0 : null;
    F.lathe(cx, cy, t => [0.36, t * 16], (p, ang, t, i, j, n) => {
      const a = ang * Math.PI * 2, z = p[2], k = toneOf(lum(...n));
      if (seen !== null) { const da = Math.abs(((a - seen + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < 0.32 && z < 12) return da > 0.25 || z > 11 ? R('#5a3f28')[3] : tone(R('#9a6a3a'), k + (Math.floor(da * 40) % 2 ? 0.6 : 0), i, j); }
      if ((z > 5 && z < 7) || (z > 9 && z < 11)) return tone(R(WAX), k + ((Math.floor(ang * 60) % 3) === 0 ? 0.8 : 0), i, j);
      if (z < 6 && Math.abs(((ang * 40 + z * 0.35) % 1) - 0.5) < 0.1) return tone(R(felt), k + 0.8, i, j);
      return tone(R(felt), k, i, j);
    }, 2);
    F.lathe(cx, cy, t => [0.42 * (1 - t) + 0.06 * t, 15 + t * 14], (p, ang, t, i, j, n) => tone(R(felt), toneOf(lum(...n)) - 0.2 + ((Math.floor(ang * 16) % 2) ? 0.35 : 0) + (t < 0.08 ? 0.8 : 0), i, j), 3);
    F.lathe(cx, cy, t => [0.06, 29 + t * 3], (p, a, t, i, j, n) => tone(R(C.plankD), toneOf(lum(...n)), i, j), 4, 10);
  } },
  ruin: { top: 40, draw(F, o) {
    const x0 = 0.12, y0 = 0.12, x1 = o.w - 0.12, y1 = o.d - 0.12, mat = MAT.ashlar('#d4cab2', 4, 6), moss = R('#7d9450');
    const jag = (a, seed) => 10 + 16 * Math.abs(Math.sin(a * 5.3 + seed)) * (0.6 + 0.4 * hash(Math.floor(a * 6), seed)) + 8 * hash(Math.floor(a * 3), seed + 1);
    const sh = (face, seed) => (p, a, b, i, j) => {
      const along = face === 'y' ? p[0] : p[1], top = jag(along, seed); if (p[2] > top) return null;
      const u = along * 16, k = WALL_T[face];
      if (p[2] > top - 2 && hash(u | 0, 9, seed) < 0.6) return tone(moss, k - 0.3, i, j);
      if (hash(u | 0, (p[2] / 4) | 0, seed) < 0.05) return R('#2f271f')[3];
      return mat(u, p[2], i, j, k);
    };
    /* two broken walls a stone thick, their tops jagged, the top of the masonry showing where it broke */
    const capY = (p, a, b, i, j) => (p[2] > jag(p[0], 1) ? null : tone(R('#cbc1a8'), 1.2 + (hash(i, j, 4) < 0.2 ? 0.8 : 0), i, j));
    F.box(x0, y0 + 0.06, x1, y0 + 0.2, 0, 40, { y: sh('y', 1), x: (p, a, b, i, j) => (p[2] > jag(x1, 1) ? null : mat(-p[1] * 16, p[2], i, j, WALL_T.x)) }, 1);
    F.box(x0 + 0.06, y0 + 0.2, x0 + 0.2, y1 - 0.3, 0, 40, { x: sh('x', 2), y: (p, a, b, i, j) => (p[2] > jag(y1 - 0.3, 2) ? null : mat(p[0] * 16, p[2], i, j, WALL_T.y)) }, 2);
    for (let k = 0; k < 24; k++) { const f = k / 23, x = x0 + (x1 - x0) * f, z = jag(x, 1); F.dot(x, y0 + 0.13, z, capY([x, 0, z - 1], 0, 0, k, 0) || R('#cbc1a8')[1], 3, 0.5); }
    for (let k = 0; k < 7; k++) { const x = x0 + 0.25 + hash(k, 1) * (x1 - x0 - 0.3), y = y0 + 0.35 + hash(k, 2) * (y1 - y0 - 0.4), s = 0.04 + hash(k, 3) * 0.05; F.box(x - s, y - s, x + s, y + s, 0, 2 + hash(k, 4) * 3, { y: stoneSh('#c4b99f', 'y', 3, 4), x: stoneSh('#c4b99f', 'x', 3, 4), top: flat('#d4cab2') }, 10 + k); }
    for (let k = 0; k < 5; k++) F.dot(x1 - 0.2 + k * 0.03, y1 - 0.2, 1 + (k % 3), moss[k % 2 ? 1 : 2], 30);
  } },
  mine: { top: 44, draw(F, o) {
    /* a rocky knoll with a grassy crown, cut back at the front to a face that holds a timbered adit */
    const cx = o.w / 2, cy = o.d / 2, rock = R('#a59a85'), grass = R('#8fa05a'), seen = o.face === 0 ? 'y' : o.face === 1 ? 'x' : 'y';
    F.lathe(cx - 0.1, cy - 0.1, t => [0.42 * Math.cos(t * Math.PI / 2) + 0.03, 22 * Math.sin(t * Math.PI / 2)], (p, ang, t, i, j, n) => {
      const k = toneOf(lum(...n)), c = hash(i >> 1, j >> 1, 2);
      if (t > 0.72 + 0.1 * hash(Math.floor(ang * 20), 3)) return tone(grass, k - 0.2 + (c < 0.2 ? 0.7 : 0), i, j);
      return tone(rock, k + (c < 0.18 ? 0.8 : c > 0.88 ? -0.6 : 0) + ((Math.floor(p[2] / 5) + Math.floor(ang * 9)) % 3 === 0 ? 0.4 : 0), i, j);
    }, 1);
    const fc = seen === 'y' ? [0.1, cy + 0.36, o.w - 0.1, cy + 0.36] : [cx + 0.36, 0.1, cx + 0.36, o.d - 0.1];
    const face = (p, a, b, i, j) => { const top = 20 - 13 * Math.abs(a - 0.5) * 2 - 3 * hash(Math.floor(a * 9), 4); if (p[2] > top) return null; return tone(rock, WALL_T[seen] + (hash(i >> 1, j, 6) < 0.15 ? 0.8 : 0) + ((Math.floor(p[2] / 4) + Math.floor(a * 6)) % 2 ? 0.3 : 0), i, j); };
    F.quad([fc[0], fc[1], 0], [fc[2], fc[3], 0], [fc[2], fc[3], 24], [fc[0], fc[1], 24], face, 2);
    const wood = R(C.plankD), m = seen === 'y' ? o.w / 2 : o.d / 2, Dp = (a, z, out = 0.02) => (seen === 'y' ? [m + a, fc[1] + out, z] : [fc[0] + out, m - a, z]);
    F.quad(Dp(-0.18, 0), Dp(0.18, 0), Dp(0.18, 13), Dp(-0.18, 13), (p, a, b, i, j) => R('#1e1812')[b > 0.8 || a < 0.15 ? 4 : 5], 3);
    F.quad(Dp(-0.24, 0, 0.04), Dp(-0.18, 0, 0.04), Dp(-0.18, 15, 0.04), Dp(-0.24, 15, 0.04), (p, a, b, i, j) => tone(wood, 1.8 + (hash(i, j) < 0.15 ? 0.8 : 0), i, j), 4);
    F.quad(Dp(0.18, 0, 0.04), Dp(0.24, 0, 0.04), Dp(0.24, 15, 0.04), Dp(0.18, 15, 0.04), (p, a, b, i, j) => tone(wood, 2.8, i, j), 4);
    F.quad(Dp(-0.3, 13, 0.06), Dp(0.3, 13, 0.06), Dp(0.3, 16, 0.06), Dp(-0.3, 16, 0.06), (p, a, b, i, j) => tone(wood, b > 0.6 ? 1 : 2.4, i, j), 4);
    /* rails running out of the adit */
    for (const a of [-0.09, 0.09]) F.line(Dp(a, 0.3, 0.02), Dp(a, 0.3, 0.42), R(C.iron)[2], 5);
    for (let k = 0; k < 4; k++) F.line(Dp(-0.13, 0.2, 0.08 + k * 0.1), Dp(0.13, 0.2, 0.08 + k * 0.1), wood[3], 5, -0.2);
  } },
  dovecote: { top: 70, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2, circ = 0.26 * Math.PI * 2 * 16;
    F.lathe(cx, cy, t => [0.26, t * 34], (p, ang, t, i, j, n) => {
      const k = toneOf(lum(...n)), u = ang * circ, z = p[2];
      if (z > 12 && z < 30 && (z | 0) % 6 < 2 && (u | 0) % 5 < 2) return (z | 0) % 6 === 0 ? R(C.stone)[1] : R('#2f271f')[3];
      return MAT.plaster('#e8dec7')(u, z, i, j, k);
    }, 2);
    cone(F, cx, cy, 0.3, 34, 20, ROOF.tiles(C.tiles));
    F.lathe(cx, cy, t => [0.06, 54 + t * 5], (p, a, t, i, j, n) => tone(R(C.plankD), toneOf(lum(...n)), i, j), 4, 10);
    cone(F, cx, cy, 0.07, 59, 5, ROOF.tiles(C.tiles), 5, 0.02);
  } },
  windmill: { top: 100, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2;
    F.lathe(cx, cy, t => [0.34 - t * 0.12, t * 54], (p, ang, t, i, j, n) => {
      const k = toneOf(lum(...n)), z = p[2];
      if (Math.abs(((ang + 0.12) % 1) - 0.12) < 0.035 && z > 16 && z < 26) return R(C.glass)[3];
      if (Math.abs(ang - 0.125) < 0.04 && z < 12) return z > 11 ? R(C.timber)[3] : tone(R(C.door), k, i, j);
      return MAT.plaster('#efe7d6')(ang * 30, z, i, j, k);
    }, 2);
    cone(F, cx, cy, 0.24, 54, 16, ROOF.shingle(C.shingle));
    /* the sails: four lattice blades turning in the plane facing +x +y */
    const hub = [cx + 0.32, cy + 0.32, 54], spin = o.v * Math.PI / 2, wood = R('#5a3f28'), cloth = R('#efe6d0');
    for (let k = 0; k < 4; k++) {
      const a = spin + (k * Math.PI) / 2, dir = [Math.cos(a), Math.sin(a)], side = [-Math.sin(a), Math.cos(a)];
      const pt = (along, across) => [hub[0] + (dir[0] * along + side[0] * across) * 0.71 * 0.045, hub[1] - (dir[0] * along + side[0] * across) * 0.71 * 0.045, hub[2] + dir[1] * along + side[1] * across];
      F.line(pt(0, 0), pt(40, 0), wood[2], 10 + k, 1);
      F.quad(pt(8, 1), pt(40, 1), pt(40, 8), pt(8, 8), (p, aa, bb, i, j) => (Math.abs(((aa * 6) % 1) - 0.5) > 0.42 || bb < 0.12 || bb > 0.88 ? wood[2] : cloth[aa < 0.5 ? 1 : 2]), 10 + k);
    }
    F.dot(...hub, wood[3], 20, 2);
  } },
  shrine: { top: 60, draw(F, o) {
    const cx = o.w / 2, cy = o.d / 2, mb = R(C.marble);
    F.box(cx - 0.38, cy - 0.38, cx + 0.38, cy + 0.38, 0, 4, { y: stoneSh('#d9d0bb', 'y', 2, 5), x: stoneSh('#d9d0bb', 'x', 2, 5), top: flat('#e2dac6') }, 1);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.lathe(cx + dx * 0.25, cy + dy * 0.25, t => [t < 0.06 || t > 0.93 ? 0.07 : 0.05, 4 + t * 22], (p, ang, t, i, j, n) => tone(mb, toneOf(lum(...n)) - 0.3 + (Math.abs(((ang * 6) % 1) - 0.5) < 0.12 ? 0.6 : 0), i, j), 2, 14);
    F.box(cx - 0.34, cy - 0.34, cx + 0.34, cy + 0.34, 26, 30, { y: (p, a, b, i, j) => tone(mb, WALL_T.y - 0.3 + ((p[2] | 0) === 28 ? 0.9 : 0), i, j), x: (p, a, b, i, j) => tone(mb, WALL_T.x - 0.3, i, j), top: flat(C.marble) }, 3);
    F.lathe(cx, cy, t => [0.3 * Math.cos(t * Math.PI / 2), 30 + 18 * Math.sin(t * Math.PI / 2)], (p, ang, t, i, j, n) => tone(R('#7fa89a'), toneOf(lum(...n)) - 0.2 + (Math.abs(((ang * 12) % 1) - 0.5) < 0.07 ? -0.7 : 0), i, j), 4);
    F.lathe(cx, cy, t => [0.03, 48 + t * 4], (p, a, t, i, j, n) => tone(R(GOLD), toneOf(lum(...n)), i, j), 5, 8);
    F.blob(cx, cy, 54, 1.6, 1.6, (n, i, j) => R(GOLD)[n[0] < 0 ? 0 : 2], 6);
  } },
  slatehouse: { top: 80, draw(F, o) {
    house(F, o, { mat: MAT.ashlar(pickv([C.ashlar, '#efe7d6', '#ece4d2', '#e2dccb'], o.v), 4, 9), h: 38, floors: 2, rh: 18, roof: ROOF.slate(C.slate), edge: '#4d5862', win: { w: 5, h: 8, frame: '#f4f0e6', every: 10 }, door: { w: 6, h: 13, kind: 'arch', col: '#4a3524' }, trim: C.ashlarD, quoins: true, plinth: 4, chimneys: [[0.75, 0.3, 6]], ins: 0.1, attic: true });
  } },
  stonehouse: { top: 96, draw(F, o) {
    house(F, o, { mat: MAT.ashlar(pickv(['#efe7d6', C.ashlar, '#f2ece0'], o.v), 4, 9), h: 52, floors: 3, rh: 20, roof: ROOF.slate(C.slate), edge: '#4d5862', win: { w: 5, h: 8, frame: '#f4f0e6', every: 11 }, door: { w: 7, h: 14, kind: 'arch', col: '#4a3524' }, trim: C.ashlarD, quoins: true, plinth: 4, chimneys: [[0.2, 0.3, 6, o.v > 0.4], [0.85, 0.3, 6]], ins: 0.1 });
  } },
  mansion: { top: 110, draw(F, o) {
    const roof = o.v < 0.4 ? ROOF.slate(C.slate) : o.v < 0.7 ? ROOF.copper(C.copper) : ROOF.tiles(C.tiles);
    const r = house(F, o, { mat: MAT.ashlar(pickv(['#f4eee0', '#ece2cc', '#f2ece0'], o.v), 4, 10), h: 54, floors: 3, rh: 26, hip: true, roof, edge: '#4d5862', win: { w: 6, h: 9, frame: '#f8f4ea', every: 11, shutter: o.v > 0.5 ? '#4f6f8f' : null }, door: { w: 9, h: 16, kind: 'arch', col: '#3a2a1c' }, trim: C.ashlarD, quoins: true, plinth: 5, ins: 0.16 });
    for (const [fx, fy] of [[0.2, 0.25], [0.8, 0.2]]) chimney(F, r.x0 + (r.x1 - r.x0) * fx, r.y0 + (r.y1 - r.y0) * fy, 54, 92, C.ashlarD);
    /* a pediment over the door */
    const seen = o.face === 0 ? 'y' : o.face === 1 ? 'x' : null;
    if (seen) {
      const m = seen === 'y' ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2, c = seen === 'y' ? r.y1 + 0.03 : r.x1 + 0.03, A = (a, z) => (seen === 'y' ? [m + a, c, z] : [c, m - a, z]);
      F.tri(A(-0.28, 18), A(0.28, 18), A(0, 25), (p, a, b, i, j) => tone(R(C.ashlarD), seen === 'y' ? 1.6 : 2.6, i, j), 12);
    }
  } },
  wall: { top: 52, draw(F, o) {
    const L = o.links || (o.axis === 'x' ? [1, 0, 1, 0] : [0, 1, 0, 1]), cx = o.w / 2, cy = o.d / 2, t = 0.2, h = 34;
    const arm = (dir, part) => {
      const [x0, y0, x1, y1] = dir === 0 ? [cx, cy - t, o.w, cy + t] : dir === 1 ? [cx - t, cy, cx + t, o.d] : dir === 2 ? [0, cy - t, cx, cy + t] : dir === 3 ? [cx - t, 0, cx + t, cy] : [cx - t, cy - t, cx + t, cy + t];
      F.box(x0, y0, x1, y1, 0, h, { y: (p, a, b, i, j) => MAT.ashlar(C.stone, 4, 7)(p[0] * 16, p[2], i, j, WALL_T.y + (p[2] < 4 ? 0.4 : 0)), x: (p, a, b, i, j) => MAT.ashlar(C.stone, 4, 7)(-p[1] * 16, p[2], i, j, WALL_T.x + (p[2] < 4 ? 0.4 : 0)), top: (p, a, b, i, j) => tone(R('#cbc1a8'), 1.4 + (hash(i >> 1, j, 5) < 0.12 ? 0.8 : 0), i, j) }, part);
      const m = (x, y) => F.box(x - 0.055, y - 0.055, x + 0.055, y + 0.055, h, h + 5, { y: stoneSh(C.stone, 'y', 5, 4), x: stoneSh(C.stone, 'x', 5, 4), top: flat('#cbc1a8') }, part + 1);
      if (dir === 0 || dir === 2 || dir < 0) for (let x = x0 + 0.06; x < x1 - 0.02; x += 0.2) { m(x, y0 + 0.055); m(x, y1 - 0.055); }
      if (dir === 1 || dir === 3) for (let y = y0 + 0.06; y < y1 - 0.02; y += 0.2) { m(x0 + 0.055, y); m(x1 - 0.055, y); }
    };
    if (!L.some(Boolean)) { arm(-1, 1); return; }
    arm(-1, 1); L.forEach((on, k) => on && arm(k, 1));
  } },
  walltower: { top: 104, draw(F, o) {
    DESIGNS.wall.draw(F, Object.assign({}, o, { links: (o.links || [0, 0, 0, 0]).map(v => v) }));
    const cx = o.w / 2, cy = o.d / 2;
    tower(F, cx, cy, 0.42, 0, 56, C.ashlar, 20, [[0.1, 24], [0.18, 42]]);
    if (o.v < 0.45) { cone(F, cx, cy, 0.42, 56, 36, ROOF.slate(C.slate), 25); if (o.v < 0.2) flag(F, cx, cy, 92, 10, WAX); return; }
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; if (Math.cos(a) + Math.sin(a) < -0.6) continue; const x = cx + Math.cos(a) * 0.4, y = cy + Math.sin(a) * 0.4; F.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 56, 61, { y: stoneSh(C.ashlar, 'y', 5, 4), x: stoneSh(C.ashlar, 'x', 5, 4), top: flat('#d6ccb6') }, 26); }
    F.lathe(cx, cy, t => [0.4 * (1 - t), 56 + t * 0.2], (p, a, t, i, j) => tone(R(C.lead), 2, i, j), 24);
  } },
  gatehouse: { top: 112, draw(F, o) {
    const ax = o.axis === 'x', part = (a0, a1, b0, b1) => (ax ? [a0, b0, a1, b1] : [b0, a0, b1, a1]);
    const twr = (r, p) => {
      walls(F, Object.assign({}, o, { face: -1 }), ...r, 0, { mat: MAT.ashlar(C.ashlar, 4, 8), h: 64, floors: 2, win: { w: 3, h: 7, kind: 'slit', frame: C.ashlarD, glass: '#2f271f', every: 14, ground: false }, door: null, quoins: true, plinth: 4 }, p);
      F.box(r[0] - 0.03, r[1] - 0.03, r[2] + 0.03, r[3] + 0.03, 64, 67, { y: stoneSh(C.ashlarD, 'y', 3, 5), x: stoneSh(C.ashlarD, 'x', 3, 5), top: flat(C.lead) }, p);
      merlons(F, r[0] - 0.03, r[1] - 0.03, r[2] + 0.03, r[3] + 0.03, 67, C.ashlar, p + 1, 0.24, 0.11, 5);
    };
    twr(part(0.05, 1.1, 0.06, 0.94), 1);
    const m = part(1.1, 1.9, 0.18, 0.82);
    walls(F, Object.assign({}, o, { face: ax ? 0 : 1 }), ...m, 0, { mat: MAT.ashlar(C.stone, 4, 8), h: 46, win: { w: 3, h: 6, kind: 'slit', at: 36, every: 99, glass: '#2f271f', frame: C.ashlarD }, door: { w: 14, h: 28, kind: 'arch' }, trim: C.ashlarD }, 5);
    /* the portcullis, half raised, inside the arch */
    const [pa, pc] = ax ? [(m[0] + m[2]) / 2, m[3] - 0.05] : [(m[1] + m[3]) / 2, m[2] - 0.05], D = (a, z) => (ax ? [pa + a, pc, z] : [pc, pa - a, z]);
    F.quad(D(-0.42, 12), D(0.42, 12), D(0.42, 30), D(-0.42, 30), (p, a, b, i, j) => (Math.round(a * 14) % 2 === 0 || Math.round(b * 18) % 3 === 0 ? (b < 0.08 && Math.round(a * 14) % 2 === 0 ? R(C.iron)[1] : R(C.iron)[2]) : null), 6);
    merlons(F, ...m, 46, C.stone, 7, 0.22, 0.1, 5);
    twr(part(1.9, 2.95, 0.06, 0.94), 8);
    if (o.v < 0.6) { const [fx, fy] = ax ? [2.42, 0.5] : [0.5, 2.42]; flag(F, fx, fy, 67, 16, WAX); }
  } }
};

/* ---------- churches: parts along the long axis, the west front toward the viewer when the face allows ---------- */
function church(F, o, parts) {
  const ax = o.axis === 'x', ins = 0.12, L = (ax ? o.w : o.d) - 2 * ins, D = (ax ? o.d : o.w) - 2 * ins, front = o.face === 0 || o.face === 3, A = a => (front ? a : L - a);
  const rect = (a0, a1, b0, b1) => { const p = Math.min(A(a0), A(a1)), q = Math.max(A(a0), A(a1)); return ax ? [ins + p, ins + b0, ins + q, ins + b1] : [ins + b0, ins + p, ins + b1, ins + q]; };
  const list = parts(L, D).map(p => Object.assign({}, p, p.round ? { c: ax ? [ins + A(p.a), ins + p.b] : [ins + p.b, ins + A(p.a)] } : { r: rect(p.a0, p.a1, p.b0, p.b1) }));
  let part = 1;
  for (const p of list) {
    part += 4;
    if (p.round) { tower(F, p.c[0], p.c[1], p.rad, 0, p.h, C.ashlar, part, [[0.12, p.h * 0.55]]); cone(F, p.c[0], p.c[1], p.rad, p.h, p.rh, ROOF.slate(C.slate), part + 1); continue; }
    const [x0, y0, x1, y1] = p.r, longA = ax ? 'x' : 'y', along = p.along === 'cross' ? (ax ? 'y' : 'x') : longA;
    const spec = { mat: MAT.ashlar(C.ashlar, 4, 8), h: p.h, floors: 1, win: p.lancets ? { w: 4, h: Math.min(18, p.h * 0.5), kind: 'lancet', frame: C.ashlarD, glass: '#4b5a6e', every: 10 } : null, door: null, plinth: 4, quoins: !p.roof || p.roof === 'spire' };
    if (p.front && front) spec.door = { w: 12, h: Math.min(24, p.h * 0.45), kind: 'portal', col: '#3a2a1c' };
    walls(F, Object.assign({}, o, { face: p.front && front ? (ax ? 1 : 0) : -1 }), x0, y0, x1, y1, 0, spec, part);
    if (p.buttress) {
      const n = Math.round((ax ? x1 - x0 : y1 - y0) / 0.55);
      for (let k = 0; k <= n; k++) { const f = k / n; if (ax) { const x = x0 + (x1 - x0) * f; F.box(x - 0.05, y1, x + 0.05, y1 + 0.14, 0, p.h * 0.8, { y: stoneSh(C.ashlarD, 'y', 4, 4), x: stoneSh(C.ashlarD, 'x', 4, 4), top: flat(C.slate) }, part + 2); } else { const y = y0 + (y1 - y0) * f; F.box(x1, y - 0.05, x1 + 0.14, y + 0.05, 0, p.h * 0.8, { y: stoneSh(C.ashlarD, 'y', 4, 4), x: stoneSh(C.ashlarD, 'x', 4, 4), top: flat(C.slate) }, part + 2); } }
    }
    if (p.roof === 'gable') {
      const gs = Object.assign({}, spec, { h: p.h + p.rh, door: null, win: p.front && front ? { w: 9, h: 9, kind: 'round', at: p.h * 0.62, every: 99, frame: C.ashlarD, glass: '#4b5a6e' } : null, eave: false, quoins: null });
      gable(F, x0, y0, x1, y1, p.h, p.rh, along, ROOF.slate(C.slate), { ov: 0.06, g: 0.03, edge: '#4d5862', gableSh: wall(along === 'y' ? 'y' : 'x', x0, y0, x1, y1, 0, gs) });
    } else if (p.roof === 'spire') {
      F.box(x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, p.h, p.h + 3, { y: stoneSh(C.ashlarD, 'y', 3, 5), x: stoneSh(C.ashlarD, 'x', 3, 5), top: flat(C.lead) }, part + 1);
      merlons(F, x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, p.h + 3, C.ashlar, part + 2, 0.2, 0.09, 4);
      const sp = spire(F, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, p.h + 3, p.rh, ROOF.slate(C.slate), part + 3), g = R(GOLD);
      F.line([sp.apex[0], sp.apex[1], sp.top], [sp.apex[0], sp.apex[1], sp.top + 10], g[2], part + 3); F.line([sp.apex[0] - 0.07, sp.apex[1] + 0.07, sp.top + 7], [sp.apex[0] + 0.07, sp.apex[1] - 0.07, sp.top + 7], g[1], part + 3);
    } else if (p.roof === 'lean') hip(F, x0, y0, x1, y1, p.h, p.rh, ROOF.slate(C.slate), { ov: 0.04, part: part + 1, edge: '#4d5862' });
  }
}
DESIGNS.church = { top: 170, draw(F, o) {
  church(F, o, (L, D) => [
    { round: true, a: 0.55, b: D / 2, rad: 0.5, h: 30, rh: 22 },
    { a0: 0.55, a1: L - 1.05, b0: D * 0.22, b1: D * 0.78, h: 34, roof: 'gable', rh: 24, lancets: true, buttress: true },
    { a0: L - 1.05, a1: L, b0: D * 0.24, b1: D * 0.76, h: 66, roof: 'spire', rh: 60, front: true }
  ].sort((a, b) => (a.a ?? a.a0) - (b.a ?? b.a0)));
} };
DESIGNS.cathedral = { top: 230, draw(F, o) {
  church(F, o, (L, D) => {
    const tr = L * 0.42, tw = 0.65, tb = D * 0.27, nb0 = D * 0.31, nb1 = D * 0.69;
    return [
      { round: true, a: 0.95, b: D / 2, rad: 0.72, h: 40, rh: 28 },
      { a0: 0.9, a1: L - 1.2, b0: 0.12, b1: nb0, h: 26, roof: 'lean', rh: 10, lancets: true },
      { a0: tr - tw, a1: tr + tw, b0: 0, b1: nb0, h: 52, roof: 'gable', rh: 24, along: 'cross', lancets: true },
      { a0: 0.9, a1: L - 1.2, b0: nb0, b1: nb1, h: 56, roof: 'gable', rh: 28, lancets: true },
      { a0: tr - tw + 0.1, a1: tr + tw - 0.1, b0: nb0 + 0.05, b1: nb1 - 0.05, h: 84, roof: 'spire', rh: 80 },
      { a0: L - 1.25, a1: L, b0: 0.05, b1: tb + 0.05, h: 100, roof: 'spire', rh: 56 },
      { a0: L - 1.2, a1: L, b0: tb + 0.05, b1: D - tb - 0.05, h: 70, roof: 'gable', rh: 24, along: 'cross', front: true },
      { a0: tr - tw, a1: tr + tw, b0: nb1, b1: D, h: 52, roof: 'gable', rh: 24, along: 'cross', lancets: true },
      { a0: 0.9, a1: L - 1.2, b0: nb1, b1: D - 0.12, h: 26, roof: 'lean', rh: 10, lancets: true, buttress: true },
      { a0: L - 1.25, a1: L, b0: D - tb - 0.05, b1: D - 0.05, h: 100, roof: 'spire', rh: 56 }
    ];
  });
} };

export { C, DESIGNS, MAT, ROOF, chimney, flag, gable, hip, house, puff, wall, walls };
