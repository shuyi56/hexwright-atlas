import { R, TAU } from '../core/geometry.js';
import { HILLP, INK, MT, castShadow, lerp, poly, shadeRight } from './palette.js';
import { drawTree } from './trees.js';

/* ---------- mountains ---------- */
function drawMountain(g, x, by, w, h, o) {
  const rnd = o.rnd, [cl, cd] = o.pal || MT.temperate;
  const ax = x + (rnd() - 0.5) * w * 0.14, ay = by - h, Rx = x + w / 2, Lx = x - w / 2;
  const sh = 0.36 + rnd() * 0.16;
  const pts = [[Lx, by], [lerp(Lx, ax, sh) - w * 0.02, lerp(by, ay, sh) - h * 0.07], [lerp(Lx, ax, sh + 0.12) + w * 0.02, lerp(by, ay, sh + 0.12)], [ax, ay]];
  let A2 = null;
  if (o.twin) { A2 = [x + w * 0.25, by - h * (0.7 + rnd() * 0.1)]; pts.push([x + w * 0.1, by - h * 0.55], A2, [lerp(A2[0], Rx, 0.5) + w * 0.02, lerp(A2[1], by, 0.5)]); }
  else pts.push([lerp(ax, Rx, 0.42) + w * 0.03, lerp(ay, by, 0.42) - h * 0.03]);
  pts.push([Rx, by]);
  const outline = () => { g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
  const bm = [x + w * 0.05, by], rid = [lerp(ax, bm[0], 0.42) - w * 0.06, lerp(ay, by, 0.42)];
  const shadeP = new Path2D(); shadeP.moveTo(ax, ay); for (let k = 4; k < pts.length; k++) shadeP.lineTo(pts[k][0], pts[k][1]); shadeP.lineTo(bm[0], bm[1]); shadeP.lineTo(rid[0], rid[1]); shadeP.closePath();
  castShadow(g, x + w * 0.12, by, w * 1.05, h * 0.16);
  outline(); g.closePath(); g.fillStyle = cl; g.fill();
  g.save(); outline(); g.closePath(); g.clip();
  g.fillStyle = cd; g.fill(shadeP);
  if (o.snow) {
    const sy = by - h * (0.6 + rnd() * 0.06), snowP = new Path2D();
    snowP.moveTo(x - w, ay - 20); snowP.lineTo(x + w, ay - 20); snowP.lineTo(x + w, sy);
    for (let k = 0; k <= 10; k++) snowP.lineTo(x + w / 2 - k * w / 10, sy + (k % 2 ? h * 0.09 : -h * 0.015) + (k % 3 === 0 ? h * 0.04 : 0));
    snowP.lineTo(x - w, sy); snowP.closePath();
    g.fillStyle = '#fbf8ef'; g.fill(snowP);
    g.save(); g.clip(shadeP); g.fillStyle = '#d4dade'; g.fill(snowP); g.restore();
  }
  g.strokeStyle = INK; g.lineCap = 'round'; g.lineWidth = 0.55; g.globalAlpha = 0.6; g.beginPath();
  for (let k = 0; k < 5; k++) {
    const t = (o.snow ? 0.52 : 0.3) + k * 0.13; if (t > 0.94) break;
    const px = lerp(ax, Rx, t), py = lerp(ay, by, t), qx = lerp(ax, bm[0], t), qy = lerp(ay, by, t);
    g.moveTo(px, py); g.lineTo(lerp(px, qx, 0.6), lerp(py, qy, 0.6) + 1.2);
  }
  g.globalAlpha = 0.35;
  for (let k = 0; k < 2; k++) { const px = Lx + w * (0.18 + k * 0.12), py = by - h * (0.12 + k * 0.08); g.moveTo(px, py); g.lineTo(px + w * 0.06, py); }
  g.stroke(); g.globalAlpha = 1; g.restore();
  g.strokeStyle = INK; g.lineJoin = 'round'; g.lineWidth = 1.25; outline(); g.stroke();
  g.lineWidth = 0.75; g.beginPath(); g.moveTo(ax, ay); g.lineTo(rid[0], rid[1]); g.lineTo(lerp(rid[0], bm[0], 0.5), lerp(rid[1], by, 0.5)); g.stroke();
  if (A2) { g.lineWidth = 0.6; g.beginPath(); g.moveTo(A2[0], A2[1]); g.lineTo(A2[0] - w * 0.04, A2[1] + h * 0.22); g.stroke(); }
}
function drawVolcano(g, x, by, w, h, rnd) {
  const tw = w * 0.24, ty = by - h, Lx = x - w / 2, Rx = x + w / 2;
  const cone = () => poly(g, [[Lx, by], [lerp(Lx, x - tw / 2, 0.55) - w * 0.03, lerp(by, ty, 0.55)], [x - tw / 2, ty], [x + tw / 2, ty], [lerp(x + tw / 2, Rx, 0.45) + w * 0.03, lerp(ty, by, 0.45)], [Rx, by]]);
  castShadow(g, x + w * 0.1, by, w * 1.05, h * 0.16);
  for (let k = 5; k >= 0; k--) {
    const cx = x + k * w * 0.09 + Math.sin(k * 1.7) * 3, cy = ty - 8 - k * h * 0.2, r = w * 0.09 + k * w * 0.028;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = `rgba(128,118,110,${0.62 - k * 0.07})`; g.fill();
    g.strokeStyle = INK; g.globalAlpha = 0.25; g.lineWidth = 0.6; g.stroke(); g.globalAlpha = 1;
  }
  cone(); g.fillStyle = '#a3958a'; g.fill();
  shadeRight(g, cone, x + w * 0.04, '#6c5f56');
  g.save(); cone(); g.clip();
  const lava = (sx, ex, ey, wob) => { g.beginPath(); g.moveTo(sx, ty + 1); g.bezierCurveTo(sx + wob, lerp(ty, ey, 0.35), ex - wob, lerp(ty, ey, 0.7), ex, ey); };
  [[x - tw * 0.25, x - w * 0.2, by - h * 0.15, 4], [x + tw * 0.15, x + w * 0.16, by - h * 0.3, -3]].forEach(([sx, ex, ey, wob]) => {
    lava(sx, ex, ey, wob); g.strokeStyle = '#c4492a'; g.lineWidth = 2.2; g.stroke();
    lava(sx, ex, ey, wob); g.strokeStyle = '#f2a53a'; g.lineWidth = 0.8; g.stroke();
  });
  g.restore();
  cone(); g.strokeStyle = INK; g.lineWidth = 1.25; g.stroke();
  g.beginPath(); g.ellipse(x, ty, tw / 2, h * 0.06, 0, 0, TAU); g.fillStyle = '#3a2418'; g.fill(); g.lineWidth = 0.9; g.stroke();
  g.beginPath(); g.ellipse(x, ty + 0.5, tw * 0.32, h * 0.035, 0, 0, TAU); g.fillStyle = '#e8702e'; g.fill();
}

/* ---------- hills ---------- */
function hillPath(g, x, by, w, h) { g.beginPath(); g.moveTo(x - w / 2, by); g.bezierCurveTo(x - w * 0.3, by - h * 1.33, x + w * 0.3, by - h * 1.33, x + w / 2, by); }
function drawHill(g, x, by, w, h, o) {
  const [hl, hd] = o.pal || HILLP.temperate, rnd = o.rnd;
  castShadow(g, x + w * 0.08, by, w * 0.95, h * 0.28);
  hillPath(g, x, by, w, h); g.closePath(); g.fillStyle = hl; g.fill();
  g.save(); g.clip(); g.beginPath(); g.ellipse(x + w * 0.42, by, w * 0.42, h * 1.25, 0, 0, TAU); g.fillStyle = hd; g.fill(); g.restore();
  hillPath(g, x, by, w, h); g.strokeStyle = INK; g.lineWidth = 1.1; g.lineCap = 'round'; g.stroke();
  g.lineWidth = 0.6; g.globalAlpha = 0.55; g.beginPath();
  g.moveTo(x + w * 0.14, by - h * 0.62); g.lineTo(x + w * 0.2, by - h * 0.18);
  g.moveTo(x + w * 0.27, by - h * 0.45); g.lineTo(x + w * 0.31, by - h * 0.1);
  g.globalAlpha = 0.4; const tx = x - w * 0.22, ty = by - h * 0.55;
  g.moveTo(tx, ty); g.lineTo(tx - 1.5, ty - 3); g.moveTo(tx, ty); g.lineTo(tx + 1.5, ty - 3);
  g.stroke(); g.globalAlpha = 1;
  if (o.kind === 'rock') drawRock(g, x - w * 0.1, by - h * 0.92, R * 0.16, rnd);
  if (o.kind === 'tree') drawTree(g, x + w * 0.02, by - h * 0.95, R * 0.24, 'oak', rnd);
}
function drawRock(g, x, y, s, rnd) {
  const pts = [[x - s * 0.5, y], [x - s * 0.42, y - s * 0.38], [x - s * 0.1, y - s * (0.6 + rnd() * 0.15)], [x + s * 0.3, y - s * 0.45], [x + s * 0.5, y]];
  castShadow(g, x + s * 0.1, y, s * 1.1, s * 0.25);
  poly(g, pts); g.fillStyle = '#d3cab6'; g.fill();
  shadeRight(g, () => poly(g, pts), x + s * 0.02, '#a59a86');
  poly(g, pts); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
}

export { drawHill, drawMountain, drawRock, drawVolcano, hillPath };
