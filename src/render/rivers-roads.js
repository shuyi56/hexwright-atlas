import { CX, CY, N, R, TAU, hexAt, hexDist } from '../core/geometry.js';
import { mulberry32 } from '../core/random.js';
import { BIOME } from '../world/data.js';
import { INK, hexRgb } from './palette.js';

/* ---- realm roads: surface follows the terrain, paved near towns, bridges at river crossings ---- */

/* ---- corridor: where roads and rivers run, so upright icons can keep clear of them ---- */
let CORR = null;
function buildCorridor(RV, RDS) {
  const G = new Map(), cell = 16, put = (x, y, hw) => { const k = Math.floor(x / cell) + ',' + Math.floor(y / cell); let a = G.get(k); if (!a) G.set(k, a = []); a.push([x, y, hw]); };
  for (const rv of RV) for (const q of rv.P) put(q[0], q[1], q[2] + 1.9);
  for (const r of RDS.runs) {
    const hw = ROAD_STYLE[r.st].halo / 2 + 0.9, pl = r.pts;
    for (let i = 1; i < pl.length; i++) { const a = pl[i - 1], b = pl[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 1.6)); for (let k = 0; k < n; k++) put(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, hw); }
    if (pl.length) put(pl[pl.length - 1][0], pl[pl.length - 1][1], hw);
  }
  return { G, cell };
}
// silhouette half-width at height fraction t (0 = base, 1 = top)
const SHAPE = {
  tri: (w, t) => w / 2 * (1 - t * 0.9),
  dome: (w, t) => w / 2 * Math.sqrt(Math.max(0, 1 - t * t * 0.9)),
  tree: (w, t) => t < 0.32 ? w * 0.08 : w / 2,
  pine: (w, t) => w / 2 * (1 - t * 0.85),
  box: w => w / 2
};
function corrHit(x, by, w, h, shape) {
  if (!CORR) return false;
  const { G, cell } = CORR, f = SHAPE[shape] || SHAPE.box, x0 = Math.floor((x - w / 2 - 7) / cell), x1 = Math.floor((x + w / 2 + 7) / cell), y0 = Math.floor((by - h - 7) / cell), y1 = Math.floor((by + 7) / cell);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const a = G.get(cx + ',' + cy); if (!a) continue;
    for (const [sx, sy, hw] of a) {
      if (sy < by - h - hw || sy > by + hw * 0.55) continue;
      const t = Math.min(1, Math.max(0, (by - sy) / h));
      if (Math.abs(sx - x) < f(w, t) + hw) return true;
    }
  }
  return false;
}
const FIT_OFF = [[0, 0], [0, -0.12], [-0.16, -0.04], [0.16, -0.04], [0, 0.12], [-0.28, 0], [0.28, 0], [0, -0.26], [-0.2, -0.22], [0.2, -0.22], [-0.24, 0.16], [0.24, 0.16], [-0.42, -0.1], [0.42, -0.1], [0, 0.26], [-0.4, 0.2], [0.4, 0.2]];
// find a spot near (x, by) where the drawing stands clear of every road and river: [x, by, scale] or null
function fitIcon(x, by, w, h, shape, reach = 1, scales = [1, 0.8, 0.64]) {
  if (!CORR) return [x, by, 1];
  for (const k of scales) for (const [dx, dy] of FIT_OFF) {
    if (Math.abs(dx) > 0.3 * reach + 0.13 || Math.abs(dy) > 0.2 * reach + 0.07) continue;
    const px = x + dx * R, py = by + dy * R;
    if (!corrHit(px, py, w * k, h * k, shape)) return [px, py, k];
  }
  return null;
}
/* ---- realm rivers: smooth tapered water bodies that widen with every tributary ---- */
let RIV_GRID = null, RIV_DRAWN = null;
function buildRivers(map) {
  const B = map.B, out = [];
  // flow: own length plus everything that drains into it
  const total = map.rivers.map(rv => rv.path.length), joins = map.rivers.map(() => []);
  for (let r = map.rivers.length - 1; r >= 0; r--) {
    const rv = map.rivers[r];
    for (const j of joins[r]) total[r] += j.flow;
    if (rv.joined >= 0) { const tgt = map.rivers[rv.joined], at = tgt.path.indexOf(rv.path[rv.path.length - 1]); if (at >= 0) joins[rv.joined].push({ at, flow: total[r] }); }
  }
  const land0 = h => !BIOME[B[h]].water;
  map.rivers.forEach((rv, r) => {
    const p = rv.path, pts = [], last = p[p.length - 1], toWater = BIOME[B[last]].water;
    if (BIOME[B[p[0]]].water) pts.push([(CX[p[0]] + CX[p[1]]) / 2 + (CX[p[0]] - CX[p[1]]) * 0.22, (CY[p[0]] + CY[p[1]]) / 2 + (CY[p[0]] - CY[p[1]]) * 0.22]);
    else pts.push([(CX[p[0]] + CX[p[1]]) / 2, (CY[p[0]] + CY[p[1]]) / 2]);
    for (let k = 1; k < p.length; k++) {
      const h = p[k];
      if (k === p.length - 1 && BIOME[B[h]].water) pts.push([(CX[h] + CX[p[k - 1]]) / 2 + (CX[h] - CX[p[k - 1]]) * 0.22, (CY[h] + CY[p[k - 1]]) / 2 + (CY[h] - CY[p[k - 1]]) * 0.22]);
      else pts.push([CX[h] + map.jit[h][0], CY[h] + map.jit[h][1]]);
    }
    // smooth centreline through hex centres (quadratic midpoint spline)
    const raw = [], n = pts.length;
    for (let k = 0; k < n - 1; k++) {
      const a = k === 0 ? pts[0] : [(pts[k][0] + pts[k - 1][0]) / 2, (pts[k][1] + pts[k - 1][1]) / 2];
      const b = k === n - 2 ? pts[n - 1] : [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2];
      const c = k === 0 ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : pts[k];
      for (let j = k ? 1 : 0; j <= 10; j++) { const t = j / 10; raw.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1], Math.max(0, k + t - 0.5)]); }
    }
    // resample evenly
    const even = [raw[0]]; let acc = 0;
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1], b = raw[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
      let d = 1.4 - acc;
      while (d <= L) { const t = d / L; even.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); d += 1.4; }
      acc = L - (d - 1.4);
    }
    const lastR = raw[raw.length - 1]; if (Math.hypot(lastR[0] - even[even.length - 1][0], lastR[1] - even[even.length - 1][1]) > 0.3) even.push(lastR);
    const m = even.length, Ltot = (m - 1) * 1.4, rnd = mulberry32(map.seedHash ^ (r * 7717 + 13));
    const ph1 = rnd() * TAU, ph2 = rnd() * TAU, lam1 = 17 + rnd() * 6, lam2 = 7 + rnd() * 3, ph0 = rnd() * TAU, lam0 = R * (2.6 + rnd() * 1.2);
    const flowAt = map.flow ? idx => {
      const fl = h => land0(h) ? map.flow[h] / map.flowT : -1, a = Math.min(p.length - 1, Math.floor(idx)), b = Math.min(p.length - 1, a + 1);
      let fa = fl(p[a]), fb = fl(p[b]); if (fa < 0) fa = fb; if (fb < 0) fb = fa; if (fa < 0) fa = fb = 1;
      return Math.max(0.35, (fa + (fb - fa) * Math.min(1, idx - a)) * 1.6 - 0.6);
    } : idx => { let f = 0.35 + idx; for (const j of joins[r]) f += j.flow * Math.min(1, Math.max(0, idx - (j.at - 0.6)) / 0.9); return f; };
    const S2 = even.map((q, i) => {
      const a = even[Math.max(0, i - 1)], b = even[Math.min(m - 1, i + 1)], dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / dl, ty = (b[1] - a[1]) / dl;
      const s = i * 1.4, fade = Math.min(1, s / 10, (Ltot - s) / (toWater ? 6 : 10));
      const fade2 = Math.max(0, Math.min(1, s / 22, (Ltot - s) / (toWater ? 10 : 22)));
      const big = Math.sin(s / lam0 * TAU + ph0) * R * 0.15 * fade2, wig = (Math.sin(s / lam1 * TAU + ph1) * 1.25 + Math.sin(s / lam2 * TAU + ph2) * 0.35) * Math.max(0, fade) + big;
      let w = Math.min(3.5, 0.15 + 0.6 * Math.sqrt(flowAt(q[2])));
      if (s < 6 && !(rv.fromLake >= 0)) w *= 0.55 + 0.45 * s / 6;
      if (toWater) { const e = Math.max(0, 1 - (Ltot - s) / 9); w *= 1 + 0.9 * e * e; }
      return [q[0] - ty * wig, q[1] + tx * wig, w, 0, 0, q[0] - ty * big, q[1] + tx * big, s];   // [5,6]: course without the small wiggle, for roads to follow
    });
    // light smoothing so the wiggle never kinks
    const P = S2.map((q, i) => { if (i === 0 || i === m - 1) return q.slice(); const a = S2[i - 1], c = S2[i + 1]; return [(a[0] + 2 * q[0] + c[0]) / 4, (a[1] + 2 * q[1] + c[1]) / 4, q[2], 0, 0, q[5], q[6], q[7]]; });
    if (rv.joined >= 0 && out[rv.joined]) {
      const e = P[m - 1], MP = out[rv.joined].P; let tq = null, bd = 1e9;
      for (const q of MP) { const d = Math.hypot(q[0] - e[0], q[1] - e[1]); if (d < bd) { bd = d; tq = q; } }
      if (tq) {
        const dx = tq[0] - e[0], dy = tq[1] - e[1], reach = Math.min(Ltot * 0.6, 30);
        for (let i = m - 1; i >= 0; i--) { const back = (m - 1 - i) * 1.4; if (back > reach) break; const t = 1 - back / reach, wgt = t * t * (3 - 2 * t); P[i][0] += dx * wgt; P[i][1] += dy * wgt; P[i][5] += dx * wgt; P[i][6] += dy * wgt; }
        // run the tributary a little way into the main channel so the two waters merge with no seam
        const ux = tq[3] || 0, uy = tq[4] || 0, ex = P[m - 1][0] - P[Math.max(0, m - 3)][0], ey = P[m - 1][1] - P[Math.max(0, m - 3)][1], el = Math.hypot(ex, ey) || 1;
        P.push([tq[0] + ex / el * tq[2] * 0.5 + ux * 0.4, tq[1] + ey / el * tq[2] * 0.5 + uy * 0.4, Math.min(P[m - 1][2], tq[2]), 0, 0, tq[5], tq[6], P[m - 1][7] + 1.4]);
        for (const q of P) q[2] = Math.min(q[2], tq[2] + 0.4 + Math.max(0, (P[P.length - 1][7] - q[7]) / 25));
      }
    }
    P.forEach((q, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; q[3] = (b[0] - a[0]) / dl; q[4] = (b[1] - a[1]) / dl; q[8] = r; });
    P.forEach((q, i) => { const a = P[Math.max(0, i - 7)], b = P[Math.min(P.length - 1, i + 7)], dl = Math.hypot(b[5] - a[5], b[6] - a[6]) || 1; q[9] = (b[5] - a[5]) / dl; q[10] = (b[6] - a[6]) / dl; });   // the valley's general heading
    out.push({ P, toWater, r });
  });
  // spatial lookup so trees can step back from the banks
  const G = new Map(), cell = 12;
  out.forEach(rv => rv.P.forEach(q => { const k = Math.floor(q[0] / cell) + ',' + Math.floor(q[1] / cell); let a = G.get(k); if (!a) G.set(k, a = []); a.push(q); }));
  RIV_GRID = { G, cell };
  return out;
}
// nearest river sample within reach: [dist, nx, ny, w] or null
function riverNear(x, y, reach) {
  if (!RIV_GRID) return null;
  const { G, cell } = RIV_GRID, cx = Math.floor(x / cell), cy = Math.floor(y / cell); let best = null, bd = reach;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const a = G.get((cx + i) + ',' + (cy + j)); if (!a) continue; for (const q of a) { const d = Math.hypot(q[0] - x, q[1] - y) - q[2]; if (d < bd) { bd = d; best = q; } } }
  if (!best) return null; const dx = x - best[0], dy = y - best[1], L = Math.hypot(dx, dy) || 1; return [bd, dx / L, dy / L, best[2]];
}
// push a point clear of the water by `gap`
function clearOfRiver(x, y, gap) { const q = riverNear(x, y, gap); if (!q) return [x, y]; const push = gap - q[0]; return [x + q[1] * push, y + q[2] * push]; }
function riverOutline(rv, extra) {
  const P = rv.P, L = [], Rr = [];
  for (const q of P) { const w = q[2] + extra; L.push([q[0] - q[4] * w, q[1] + q[3] * w]); Rr.push([q[0] + q[4] * w, q[1] - q[3] * w]); }
  const p = new Path2D(); p.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) p.lineTo(L[i][0], L[i][1]);
  const e = P[P.length - 1], we = e[2] + extra; p.arc(e[0], e[1], we, Math.atan2(e[3], -e[4]), Math.atan2(-e[3], e[4]), true);
  for (let i = Rr.length - 1; i >= 0; i--) p.lineTo(Rr[i][0], Rr[i][1]);
  const s = P[0], ws = s[2] + extra; p.arc(s[0], s[1], ws, Math.atan2(-s[3], s[4]), Math.atan2(s[3], -s[4]), true);
  p.closePath(); return p;
}
function drawRivers(g, RV, landP, groundAt, waterP, map) {
  // where a river reaches standing water it drops its silt: a pale fan spreading out from the mouth, a lighter plume beyond
  if (waterP) {
    g.save(); g.clip(waterP);
    for (const rv of RV) {
      if (!rv.toWater) continue;
      // the fan sits where the channel actually meets the shore
      const P = rv.P; let k = P.length - 1;
      while (k > 0) { const h = hexAt(P[k - 1][0], P[k - 1][1]); if (h >= 0 && !BIOME[map.B[h]].water) break; k--; }
      const e = P[k], a = P[Math.max(0, k - 5)], dx = e[0] - a[0], dy = e[1] - a[1], L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L, w = e[2], ang = Math.atan2(ty, tx);
      const fx = e[0] + tx * (w + 0.8), fy = e[1] + ty * (w + 0.8);
      g.beginPath(); g.ellipse(fx + tx * 3, fy + ty * 3, w * 2.4 + 4.5, w * 1.9 + 3.2, ang, 0, TAU); g.fillStyle = 'rgba(176,196,170,0.55)'; g.fill();   // silty plume
      // the bar itself: two lobes either side of the channel, like a small delta
      for (const sd of [-1, 1]) { const ox = -ty * sd * (w * 0.55 + 1), oy = tx * sd * (w * 0.55 + 1); g.beginPath(); g.ellipse(fx + ox - tx * 0.6, fy + oy - ty * 0.6, w * 0.9 + 1.9, w * 0.55 + 1.2, ang + sd * 0.5, 0, TAU); g.fillStyle = 'rgba(222,208,162,0.92)'; g.fill(); g.strokeStyle = 'rgba(110,92,58,0.55)'; g.lineWidth = 0.5; g.stroke(); g.fillStyle = 'rgba(92,120,60,0.7)'; g.fillRect(fx + ox * 1.3 - tx * 1.2, fy + oy * 1.3 - ty * 1.2, 0.9, 0.9); }
      // the current threads through its own bar
      g.strokeStyle = 'rgba(134,170,169,0.85)'; g.lineWidth = Math.max(0.8, w * 0.7); g.lineCap = 'round'; g.beginPath(); g.moveTo(e[0], e[1]); g.quadraticCurveTo(fx + ty * w * 0.4, fy - tx * w * 0.4, fx + tx * (w * 1.5 + 2.4), fy + ty * (w * 1.5 + 2.4)); g.stroke();
    }
    g.restore();
  }
  g.save(); g.clip(landP); g.lineCap = 'round'; g.lineJoin = 'round';
  // soft wet margin
  g.globalAlpha = 0.28; g.fillStyle = '#6f7d4a'; for (const rv of RV) g.fill(riverOutline(rv, 1.5)); g.globalAlpha = 1;
  const bodies = RV.map(rv => riverOutline(rv, 0)), inks = RV.map(rv => riverOutline(rv, 0.8));
  g.fillStyle = INK; for (const p of inks) g.fill(p);
  g.fillStyle = '#86aaa9'; for (const p of bodies) g.fill(p);
  // shade along the upper bank, glint along the lower
  RV.forEach((rv, ri) => {
    const P = rv.P;
    g.save(); g.clip(bodies[ri]);
    g.strokeStyle = 'rgba(52,85,90,0.45)'; g.lineWidth = 0.9; g.beginPath();
    let ps = 0; P.forEach(q => { const s = q[4] - q[3] >= 0 ? 1 : -1, x = q[0] - q[4] * q[2] * 0.8 * s, y = q[1] + q[3] * q[2] * 0.8 * s; s === ps ? g.lineTo(x, y) : g.moveTo(x, y); ps = s; }); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(240,244,228,0.75)'; g.lineWidth = 0.55; g.beginPath();
    for (let i = 9; i < P.length - 5; i += 9) {
      const q = P[i]; if (q[2] < 1.25) continue;
      const s = q[4] - q[3] >= 0 ? -1 : 1;
      for (let j = 0; j <= 3; j++) { const a = P[i + j], o = a[2] * 0.34 * s; j ? g.lineTo(a[0] - a[4] * o, a[1] + a[3] * o) : g.moveTo(a[0] - a[4] * o, a[1] + a[3] * o); }
    }
    g.stroke();
    // ripple chevrons on the broad stretches
    g.strokeStyle = 'rgba(52,85,90,0.55)'; g.lineWidth = 0.5; g.beginPath();
    for (let i = 13; i < P.length - 6; i += 17) { const q = P[i]; if (q[2] < 2.2) continue; const x = q[0] + q[4] * q[2] * 0.25, y = q[1] - q[3] * q[2] * 0.25, k = q[2] * 0.42; g.moveTo(x - q[3] * k - q[4] * k * 0.5, y - q[4] * k + q[3] * k * 0.5); g.lineTo(x, y); g.lineTo(x - q[3] * k + q[4] * k * 0.5, y - q[4] * k - q[3] * k * 0.5); }
    g.stroke();
  });
  // reed tufts on the banks
  g.strokeStyle = 'rgba(62,84,44,0.7)'; g.lineWidth = 0.6; g.beginPath();
  for (const rv of RV) { const P = rv.P; for (let i = 6; i < P.length - 4; i += 11) { const q = P[i], side = (i / 11) % 2 ? 1 : -1, d = q[2] + 1.6, x = q[0] - q[4] * d * side, y = q[1] + q[3] * d * side; g.moveTo(x - 1.2, y + 0.4); g.lineTo(x - 1.5, y - 1.3); g.moveTo(x, y + 0.5); g.lineTo(x, y - 1.8); g.moveTo(x + 1.2, y + 0.4); g.lineTo(x + 1.6, y - 1.2); } }
  g.stroke();
  g.restore();
}
function polyWalk(pl, spacing, cb, offset = 0) {
  let acc = -offset, k = 0;
  for (let i = 1; i < pl.length; i++) {
    const a = pl[i - 1], b = pl[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (!L) continue;
    let d = spacing - acc;
    while (d <= L) { cb(a[0] + dx * d / L, a[1] + dy * d / L, dx / L, dy / L, k++); d += spacing; }
    acc = L - (d - spacing);
  }
}
// a road is one continuous band: dark verge, packed surface, worn centre and scattered grit, never a ladder of ticks
function withAlpha(col, a) {
  let m = col.match(/rgba?\(([^)]+)\)/);
  if (m) { const v = m[1].split(',').map(Number); return `rgba(${v[0]},${v[1]},${v[2]},${(v[3] == null ? 1 : v[3]) * a})`; }
  const c = hexRgb(col); return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
const rHash = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
function offsetPl(pl, f) {
  const n = pl.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pl[Math.max(0, i - 1)], b = pl[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, o = f(i, pl[i]);
    out.push([pl[i][0] - dy / L * o, pl[i][1] + dx / L * o]);
  }
  return out;
}
function texRoad(g, pl, o, phase) {
  if (phase === 'verge') { if (o.verge) roadLine(g, pl, o.verge, o.w + (o.vw || 1.1)); return; }
  if (phase === 'fill') { roadLine(g, pl, o.fill, o.w); return; }
  // wear: two soft lanes that drift a little, so the surface reads as trodden rather than painted
  if (o.wear) for (const side of [-1, 1]) {
    const lane = offsetPl(pl, (i, p) => side * o.w * 0.2 + (rHash(Math.round(p[0] / 6), Math.round(p[1] / 6) + side) - 0.5) * o.w * 0.14);
    roadLine(g, lane, o.wear, o.w * 0.26);
  }
  if (o.mid) roadLine(g, offsetPl(pl, (i, p) => (rHash(Math.round(p[0] / 9), Math.round(p[1] / 9)) - 0.5) * o.w * 0.1), o.mid, o.w * 0.32);
  // grit, setts, leaf litter: scattered, not spaced
  if (o.grit) for (const [col, step, size, spread] of o.grit) {
    g.fillStyle = col;
    polyWalk(pl, step, (x, y, tx, ty) => {
      const h1 = rHash(x * 1.7, y * 2.3), h2 = rHash(y * 1.3 + 7, x * 0.9), h3 = rHash(x + y, x - y);
      const off = (h1 - 0.5) * o.w * (spread || 0.8), along = (h2 - 0.5) * step;
      const px = x - ty * off + tx * along, py = y + tx * off + ty * along, r = size * (0.6 + h3 * 0.7);
      g.beginPath(); g.ellipse(px, py, r * 1.25, r * 0.85, Math.atan2(ty, tx), 0, TAU); g.fill();
    }, 0);
  }
}
const ROAD_STYLE = {
  paved:    { halo: 5,   o: { w: 2.7, verge: 'rgba(78,60,38,0.85)', vw: 1.0, fill: '#ddd0b1', wear: 'rgba(160,138,104,0.32)', grit: [['rgba(120,100,72,0.55)', 0.9, 0.38], ['rgba(255,250,236,0.7)', 1.6, 0.34]] } },
  dirt:     { halo: 3.8, o: { w: 1.9, verge: 'rgba(92,62,34,0.6)', vw: 0.8, fill: '#b48a5a', mid: 'rgba(214,186,140,0.55)', grit: [['rgba(96,66,38,0.6)', 1.3, 0.3], ['rgba(232,212,170,0.6)', 2.4, 0.28]] } },
  hill:     { halo: 3.4, o: { w: 1.6, verge: 'rgba(92,62,34,0.6)', vw: 0.7, fill: '#ab8656', mid: 'rgba(210,184,140,0.5)', grit: [['rgba(110,104,92,0.75)', 1.5, 0.34], ['rgba(96,66,38,0.55)', 1.6, 0.26]] } },
  forest:   { halo: 3.6, haloC: 'rgba(222,200,150,0.75)', o: { w: 1.9, verge: 'rgba(70,52,28,0.6)', vw: 0.9, fill: '#94683d', mid: 'rgba(170,128,80,0.5)', grit: [['rgba(84,112,50,0.85)', 1.4, 0.36, 1.05], ['rgba(150,96,40,0.8)', 2.2, 0.32, 1], ['rgba(58,40,22,0.55)', 1.7, 0.26]] } },
  trail:    { halo: 2.8, o: { w: 1.15, verge: 'rgba(80,58,36,0.55)', vw: 0.6, fill: '#9c7a52', grit: [['rgba(110,104,96,0.8)', 1.7, 0.32, 1.2]] } },
  causeway: { halo: 4.4, o: { w: 2.5, verge: 'rgba(58,44,26,0.75)', vw: 1.1, fill: '#8f7048', mid: 'rgba(170,140,96,0.5)', grit: [['rgba(150,150,140,0.85)', 1.5, 0.42, 1.15], ['rgba(70,92,48,0.7)', 2.4, 0.36, 1.25]] } },
  sand:     { halo: 3.4, haloC: 'rgba(240,226,190,0.8)', o: { w: 2.1, verge: 'rgba(160,120,66,0.4)', vw: 0.7, fill: 'rgba(196,158,98,0.75)', mid: 'rgba(236,214,170,0.55)', grit: [['rgba(130,96,52,0.55)', 1.2, 0.3]] } },
  tundra:   { halo: 3.2, o: { w: 1.7, verge: 'rgba(86,74,60,0.55)', vw: 0.7, fill: '#a99886', mid: 'rgba(240,238,230,0.55)', grit: [['rgba(90,84,76,0.6)', 1.5, 0.3]] } }
};
function roadLine(g, pl, col, w, dash) { g.beginPath(); pl.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; if (dash) g.setLineDash(dash); g.stroke(); if (dash) g.setLineDash([]); }
// a road running along a river keeps to the bank instead of riding on the water
function besideRiver(x, y, dx, dy, hc, st) {
  if (!RIV_GRID) return [x, y];
  const { G, cell } = RIV_GRID, cx = Math.floor(x / cell), cy = Math.floor(y / cell); let q = null, bd = 12;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const a = G.get((cx + i) + ',' + (cy + j)); if (a) for (const p of a) { const d = Math.hypot(p[5] - x, p[6] - y); if (d < bd) { bd = d; q = p; } } }
  if (!q) return [x, y];
  const L = Math.hypot(dx, dy) || 1, par = Math.abs((dx * q[9] + dy * q[10]) / L), along = Math.abs((x - q[5]) * q[9] + (y - q[6]) * q[10]), f = Math.min(1, Math.max(0, (par - 0.4) / 0.3)) * Math.max(0, 1 - Math.max(0, along - 1.5) / 6), need = q[2] + 4.6 * Math.min(1, q[7] / 24);
  if (bd >= need || f <= 0) { if (st && f <= 0) st.river = -1; return [x, y]; }
  let nx = -q[10], ny = q[9]; let side = Math.sign((x - q[5]) * nx + (y - q[6]) * ny || ((hc[0] - q[5]) * nx + (hc[1] - q[6]) * ny) || 1);
  // keep to the bank it is already on: a road following a river does not hop across and back
  if (st) { if (st.river === q[8] && st.side) side = st.side; else if (f > 0.3) { st.river = q[8]; st.side = side; } }
  if (side < 0) { nx = -nx; ny = -ny; }
  const off = Math.abs((x - q[5]) * nx + (y - q[6]) * ny), push = (need - off) * f * f * (3 - 2 * f);
  return push > 0 ? [x + nx * push, y + ny * push] : [x, y];
}
function buildRoads(map) {
  const paved = new Uint8Array(N);
  for (const s of map.settle) { const r = s.kind === 'capital' || s.kind === 'city' ? 2 : s.kind === 'town' ? 1 : s.kind === 'village' ? 0 : -1; if (r < 0) continue; for (let i = 0; i < N; i++) if (hexDist(i, s.i) <= r) paved[i] = 1; }
  const styleAt = h => {
    if (h < 0) return 'dirt'; const b = map.B[h];
    if (paved[h]) return 'paved';
    if (b === 'forest' || b === 'deepwood' || b === 'taiga') return 'forest';
    if (b === 'swamp') return 'causeway';
    if (b === 'mountain' || b === 'peak') return 'trail';
    if (b === 'hills') return 'hill';
    if (b === 'desert') return 'sand';
    if (b === 'tundra') return 'tundra';
    return 'dirt';
  };
  const seen = new Set(), runs = [], samples = [];
  for (const p of map.roads) {
    const pts = p.map(h => [CX[h], CY[h]]); if (pts.length < 2) continue;
    let cur = null;
    const add = (x, y) => { const st = styleAt(hexAt(x, y)); if (!cur || cur.st !== st) { const nr = { st, pts: cur ? [cur.pts[cur.pts.length - 1]] : [], prev: cur }; runs.push(nr); cur = nr; } cur.pts.push([x, y]); samples.push([x, y, cur]); };
    const rs = { river: -1, side: 0 };
    const piece = (a, c, b, first) => { for (let k = first ? 0 : 1; k <= 8; k++) { const t = k / 8; const [x, y] = besideRiver((1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1], 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1]), c, rs); add(x, y); } };
    if (pts.length === 2) { piece(pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1], true); continue; }
    let start = pts[0], fresh = true;
    for (let k = 1; k < pts.length - 1; k++) {
      const end = k === pts.length - 2 ? pts[k + 1] : [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2];
      const key = Math.min(p[k - 1], p[k + 1]) + ',' + p[k] + ',' + Math.max(p[k - 1], p[k + 1]);
      if (seen.has(key)) { cur = null; fresh = true; start = end; continue; }
      seen.add(key); piece(start, pts[k], end, fresh); fresh = false; start = end;
    }
  }
  return { runs, samples };
}
function drawRoads(g, RDS, riverSamples) {
  const { runs, samples } = RDS;
  for (const r of runs) if (r.pts.length > 1) { const S2 = ROAD_STYLE[r.st]; roadLine(g, r.pts, S2.haloC || 'rgba(244,234,208,0.85)', S2.halo); }
  // one continuous road: all verges, then all surfaces, so style changes never leave a seam or a cap
  const live = runs.filter(r => r.pts.length > 1);
  for (const r of live) texRoad(g, r.pts, ROAD_STYLE[r.st].o, 'verge');
  for (const r of live) texRoad(g, r.pts, ROAD_STYLE[r.st].o, 'fill');
  // where the surface changes, fade the new one back over the old for a few strides
  for (const r of live) {
    const p = r.prev; if (!p || p.st === r.st || p.pts.length < 2) continue;
    const o = ROAD_STYLE[r.st].o, tail = [p.pts[p.pts.length - 1]]; let acc = 0;
    for (let i = p.pts.length - 2; i >= 0 && acc < 9; i--) { const a = p.pts[i], b = tail[tail.length - 1]; acc += Math.hypot(a[0] - b[0], a[1] - b[1]); tail.push(a); }
    const A = tail[tail.length - 1], Bp = tail[0], gr = g.createLinearGradient(A[0], A[1], Bp[0], Bp[1]);
    gr.addColorStop(0, withAlpha(o.fill, 0)); gr.addColorStop(1, withAlpha(o.fill, 1));
    roadLine(g, tail, gr, Math.min(o.w, ROAD_STYLE[p.st].o.w));
  }
  for (const r of live) texRoad(g, r.pts, ROAD_STYLE[r.st].o, 'tex');
  // bridges where a road crosses a river: snap to the closest pass over the water
  const cands = [];
  for (let i = 2; i < samples.length - 2; i++) {
    const [x, y] = samples[i], a = samples[i - 2], b = samples[i + 2];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 30) continue;
    let best = null, bd = 1e9;
    for (const q of riverSamples) { if (Math.abs(q[0] - x) > 5 || Math.abs(q[1] - y) > 5) continue; const d = Math.hypot(q[0] - x, q[1] - y); if (d < q[2] + 0.8 && d < bd && q[7] > 10) { bd = d; best = q; } }
    if (best) cands.push({ x, y, dx: b[0] - a[0], dy: b[1] - a[1], st: samples[i][2].st, q: best, d: bd });
  }
  cands.sort((a, b) => a.d - b.d);
  // one crossing per river per pass
  const crossings = [];
  for (const c of cands) if (!crossings.some(b => b.q[8] === c.q[8] && Math.hypot(b.x - c.x, b.y - c.y) < 12)) crossings.push(c);
  // where a road meets a confluence or a run of streams, the biggest water gets the bridge and the lesser ones are forded
  crossings.sort((a, b) => b.q[2] - a.q[2] || a.d - b.d);
  const bridges = [], fords = [];
  for (const c of crossings) {
    const near = bridges.find(b => Math.hypot(b.x - c.x, b.y - c.y) < R * 1.8);
    if (!near) bridges.push(c);
    else if (Math.hypot(near.x - c.x, near.y - c.y) > near.q[2] * 2.4 + 5) fords.push(c);   // otherwise the bridge already spans it
  }
  for (const c of fords) drawFord(g, c.x, c.y, c.dx, c.dy, c.q, c.st);
  for (const c of bridges) drawRealmBridge(g, c.x, c.y, c.dx, c.dy, c.q, c.st);
  LAST_BRIDGES = bridges.map(c => [c.x, c.y]); LAST_FORDS = fords.map(c => [c.x, c.y]);
}
let LAST_BRIDGES = [], LAST_FORDS = [];
// a ford: the stream runs over the road, with ripples where it breaks on either side
function drawFord(g, x, y, dx, dy, q, st) {
  const L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L, rw = (ROAD_STYLE[st] ? ROAD_STYLE[st].o.w : 2) / 2 + 0.4, w = q[2];
  let ux = q[3], uy = q[4]; const half = rw / Math.max(0.45, Math.abs(ux * -ty + uy * tx));
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(134,170,169,0.72)'; g.lineWidth = w * 1.8; g.beginPath(); g.moveTo(x - ux * half, y - uy * half); g.lineTo(x + ux * half, y + uy * half); g.stroke();
  g.fillStyle = 'rgba(214,206,186,0.95)'; g.strokeStyle = 'rgba(43,33,22,0.55)'; g.lineWidth = 0.35;
  for (const k of [-1, 0, 1]) { const px = x + tx * k * rw * 0.55, py = y + ty * k * rw * 0.55; g.beginPath(); g.ellipse(px, py, 0.65, 0.45, 0, 0, TAU); g.fill(); g.stroke(); }
  g.strokeStyle = 'rgba(244,248,236,0.9)'; g.lineWidth = 0.5;
  for (const sd of [-1, 1]) { const cx = x + ux * sd * (half + 0.7), cy = y + uy * sd * (half + 0.7), k = w * 0.9 + 0.6; g.beginPath(); g.moveTo(cx - tx * k, cy - ty * k); g.quadraticCurveTo(cx + ux * sd * 0.6, cy + uy * sd * 0.6, cx + tx * k, cy + ty * k); g.stroke(); }
}
function drawRealmBridge(g, x, y, dx, dy, q, st) {
  let L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L;
  if (Math.abs(tx * q[4] - ty * q[3]) < 0.6) { const s2 = Math.sign(tx * -q[4] + ty * q[3]) || 1; tx = -q[4] * s2; ty = q[3] * s2; }
  const wood = st === 'forest' || st === 'causeway' || st === 'trail', hw = st === 'paved' ? 2.6 : 2.2;
  const sinA = Math.max(0.45, Math.abs(tx * q[4] - ty * q[3])), hl = Math.min(q[2] * 2.4, q[2] / sinA) + 3.6;
  let nx = -ty, ny = tx; if (ny < 0) { nx = -nx; ny = -ny; }          // n points down-screen: the face we can see
  const at = (s, o) => [x + tx * s + nx * o, y + ty * s + ny * o];
  const poly = (pts, fill, ink, lw) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (ink) { g.strokeStyle = ink; g.lineWidth = lw; g.stroke(); } };
  const deck = [at(-hl, -hw), at(hl, -hw), at(hl, hw), at(-hl, hw)];
  const fh = 2.2 * ny;                                                   // face height shrinks as the bridge turns north-south
  g.lineJoin = 'round'; g.lineCap = 'round';
  // shadow on the water
  poly(deck.map(p => [p[0] + 0.9, p[1] + 1.6 + fh]), 'rgba(28,36,34,0.32)');
  // wing walls splaying onto the banks
  for (const e of [-1, 1]) poly([at(e * (hl - 1.6), -hw), at(e * (hl + 0.7), -hw - 1.3), at(e * (hl + 0.7), hw + 1.3), at(e * (hl - 1.6), hw)], wood ? '#8d6a40' : '#d2c39d', INK, 0.6);
  // visible side face
  const f0 = at(-hl, hw), f1 = at(hl, hw);
  if (fh > 0.5) {
    poly([f0, f1, [f1[0], f1[1] + fh], [f0[0], f0[1] + fh]], wood ? '#7b5a35' : '#bba982', INK, 0.6);
    if (wood) {
      g.strokeStyle = INK; g.lineWidth = 0.75; g.beginPath();
      const n = Math.max(2, Math.round(hl / 1.7));
      for (let k = 0; k <= n; k++) { const p = at(-hl + 0.8 + (2 * hl - 1.6) * k / n, hw); g.moveTo(p[0], p[1]); g.lineTo(p[0], p[1] + fh + 1.1); }
      g.stroke();
    } else {
      const n = Math.max(1, Math.round((2 * hl - 2.4) / 3.6)), span = (2 * hl - 2.4) / n;
      for (let k = 0; k < n; k++) {
        const s0 = -hl + 1.2 + span * k + span * 0.14, s1 = -hl + 1.2 + span * (k + 1) - span * 0.14, a = at(s0, hw), b = at(s1, hw), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        g.beginPath(); g.moveTo(a[0], a[1] + fh + 0.05); g.lineTo(a[0], a[1] + fh * 0.62); g.quadraticCurveTo(mx, my + fh * 0.05 - 0.6, b[0], b[1] + fh * 0.62); g.lineTo(b[0], b[1] + fh + 0.05); g.closePath();
        g.fillStyle = '#3e5552'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.45; g.stroke();
      }
    }
  }
  // deck
  poly(deck, wood ? '#b38750' : '#e6dabc', INK, 0.75);
  if (wood) {
    g.strokeStyle = 'rgba(70,45,22,0.75)'; g.lineWidth = 0.45; g.beginPath();
    for (let s2 = -hl + 0.9; s2 < hl - 0.4; s2 += 1.15) { const a = at(s2, -hw + 0.2), b = at(s2, hw - 0.2); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.stroke();
    g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath();
    for (const o of [-hw, hw]) { const a = at(-hl + 0.4, o), b = at(hl - 0.4, o); g.moveTo(a[0], a[1] - 0.6); g.lineTo(b[0], b[1] - 0.6); }
    g.stroke();
    g.fillStyle = INK; for (const o of [-hw, hw]) for (const s2 of [-hl + 0.5, 0, hl - 0.5]) { const p = at(s2, o); g.fillRect(p[0] - 0.5, p[1] - 1.3, 1, 1.5); }
  } else {
    g.strokeStyle = 'rgba(120,100,70,0.7)'; g.lineWidth = 0.45; g.beginPath();
    for (let s2 = -hl + 1.4, k = 0; s2 < hl - 1; s2 += 1.25, k++) { const o = k % 2 ? 0.45 : -0.45, a = at(s2, -hw + 0.9 + o * 0.3), b = at(s2, hw - 0.9 + o * 0.3); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.stroke();
    // parapets with a lit top edge
    for (const o of [-hw + 0.45, hw - 0.45]) { const a = at(-hl + 0.3, o), b = at(hl - 0.3, o); g.strokeStyle = INK; g.lineWidth = 1.15; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.strokeStyle = 'rgba(255,250,232,0.85)'; g.lineWidth = 0.45; g.beginPath(); g.moveTo(a[0], a[1] - 0.35); g.lineTo(b[0], b[1] - 0.35); g.stroke(); }
    g.fillStyle = INK; for (const e of [-1, 1]) for (const o of [-hw + 0.45, hw - 0.45]) { const p = at(e * (hl - 0.3), o); g.beginPath(); g.arc(p[0], p[1], 0.75, 0, TAU); g.fill(); }
  }
}

export const setCorridor = c => { CORR = c; };
export const setRivDrawn = r => { RIV_DRAWN = r; };

export { CORR, RIV_DRAWN, ROAD_STYLE, buildCorridor, buildRivers, buildRoads, corrHit, drawRivers, drawRoads, fitIcon, riverNear, roadLine, texRoad };
