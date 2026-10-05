import { R, TAU } from '../core/geometry.js';
import { mulberry32 } from '../core/random.js';
import { RIV_DRAWN } from './rivers-roads.js';
import { GOLD, GOLD_D, HILLP, INK, MT, ROOFS, STONE, WALL, WALL_D, WAX, castShadow, climate, hexRgb, lerp, poly, rgbStr, shadeRight } from './palette.js';
import { drawHill, drawMountain, drawRock, drawVolcano, hillPath } from './relief.js';
import { drawPine, drawTree } from './trees.js';
import { drawBones, drawHaystack } from './ground.js';

/* ---------- buildings ---------- */
function house(g, x, y, s, roof, chim) {
  const bw = s * 0.84, bh = s * 0.55, lft = x - bw / 2, top = y - bh, rt = top - s * 0.55, ov = s * 0.12;
  g.lineWidth = 0.85; g.strokeStyle = INK; g.lineJoin = 'round';
  g.fillStyle = WALL; g.fillRect(lft, top, bw, bh); g.fillStyle = WALL_D; g.fillRect(x + bw * 0.16, top, bw * 0.34, bh);
  g.strokeRect(lft, top, bw, bh);
  if (chim) { g.beginPath(); g.rect(x + bw * 0.14, rt + s * 0.14, s * 0.12, s * 0.3); g.fillStyle = WALL_D; g.fill(); g.stroke(); g.strokeStyle = 'rgba(90,80,70,0.45)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x + bw * 0.2, rt + s * 0.1); g.quadraticCurveTo(x + bw * 0.1, rt - s * 0.05, x + bw * 0.24, rt - s * 0.18); g.quadraticCurveTo(x + bw * 0.36, rt - s * 0.3, x + bw * 0.26, rt - s * 0.42); g.stroke(); g.strokeStyle = INK; g.lineWidth = 0.85; }
  g.beginPath(); g.moveTo(lft - ov, top); g.lineTo(x, rt); g.lineTo(x + bw / 2 + ov, top); g.closePath(); g.fillStyle = roof[0]; g.fill();
  g.beginPath(); g.moveTo(x, rt); g.lineTo(x + bw / 2 + ov, top); g.lineTo(x, top); g.closePath(); g.fillStyle = roof[1]; g.fill();
  g.beginPath(); g.moveTo(lft - ov, top); g.lineTo(x, rt); g.lineTo(x + bw / 2 + ov, top); g.closePath(); g.stroke();
  g.fillStyle = INK; g.fillRect(x - s * 0.06, y - s * 0.25, s * 0.12, s * 0.25); g.fillRect(lft + bw * 0.12, top + bh * 0.28, s * 0.1, s * 0.1);
}
function crenTower(g, x, y, w, h) {
  g.lineWidth = 0.9; g.strokeStyle = INK; g.lineJoin = 'round';
  g.fillStyle = WALL; g.fillRect(x - w / 2, y - h, w, h); g.fillStyle = WALL_D; g.fillRect(x + w * 0.12, y - h, w * 0.38, h); g.strokeRect(x - w / 2, y - h, w, h);
  const cw = w / 5;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.rect(x - w / 2 + k * 2 * cw, y - h - cw * 0.9, cw, cw * 0.9); g.fillStyle = k === 2 ? WALL_D : WALL; g.fill(); g.stroke(); }
  g.fillStyle = INK; g.fillRect(x - w * 0.06, y - h * 0.68, w * 0.12, h * 0.16);
}
function coneTower(g, x, y, w, h, roof) {
  g.lineWidth = 0.85; g.strokeStyle = INK; g.lineJoin = 'round';
  g.fillStyle = WALL; g.fillRect(x - w / 2, y - h, w, h); g.fillStyle = WALL_D; g.fillRect(x + w * 0.12, y - h, w * 0.38, h); g.strokeRect(x - w / 2, y - h, w, h);
  const top = y - h, tip = top - w * 1.5;
  g.beginPath(); g.moveTo(x - w * 0.66, top); g.lineTo(x, tip); g.lineTo(x + w * 0.66, top); g.closePath(); g.fillStyle = roof[0]; g.fill();
  g.beginPath(); g.moveTo(x, tip); g.lineTo(x + w * 0.66, top); g.lineTo(x, top); g.closePath(); g.fillStyle = roof[1]; g.fill();
  g.beginPath(); g.moveTo(x - w * 0.66, top); g.lineTo(x, tip); g.lineTo(x + w * 0.66, top); g.closePath(); g.stroke();
  g.fillStyle = INK; g.fillRect(x - w * 0.07, y - h * 0.6, w * 0.14, h * 0.18);
  return tip;
}
function banner(g, x, y, len, col) {
  g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - len); g.stroke();
  g.beginPath(); g.moveTo(x, y - len); g.lineTo(x + len * 0.62, y - len + len * 0.07); g.lineTo(x + len * 0.46, y - len + len * 0.17); g.lineTo(x + len * 0.62, y - len + len * 0.27); g.lineTo(x, y - len + len * 0.3); g.closePath();
  g.fillStyle = col; g.fill(); g.lineWidth = 0.6; g.stroke();
}
function church(g, x, y, s, roof) {
  g.lineWidth = 0.85; g.strokeStyle = INK; g.lineJoin = 'round';
  const nl = x - s * 0.12, nw = s * 0.62, nh = s * 0.42;
  g.fillStyle = WALL; g.fillRect(nl, y - nh, nw, nh); g.fillStyle = WALL_D; g.fillRect(nl + nw * 0.6, y - nh, nw * 0.4, nh); g.strokeRect(nl, y - nh, nw, nh);
  g.beginPath(); g.moveTo(nl - s * 0.04, y - nh); g.lineTo(nl + s * 0.08, y - nh - s * 0.3); g.lineTo(nl + nw + s * 0.04, y - nh - s * 0.3); g.lineTo(nl + nw + s * 0.1, y - nh); g.closePath(); g.fillStyle = roof[0]; g.fill(); g.stroke();
  const tl = x - s * 0.44, tw = s * 0.32, th = s * 0.9;
  g.fillStyle = WALL; g.fillRect(tl, y - th, tw, th); g.fillStyle = WALL_D; g.fillRect(tl + tw * 0.62, y - th, tw * 0.38, th); g.strokeRect(tl, y - th, tw, th);
  const sx = tl + tw / 2, tip = y - th - s * 0.62;
  g.beginPath(); g.moveTo(tl - s * 0.03, y - th); g.lineTo(sx, tip); g.lineTo(tl + tw + s * 0.03, y - th); g.closePath(); g.fillStyle = roof[0]; g.fill();
  g.beginPath(); g.moveTo(sx, tip); g.lineTo(tl + tw + s * 0.03, y - th); g.lineTo(sx, y - th); g.closePath(); g.fillStyle = roof[1]; g.fill();
  g.beginPath(); g.moveTo(tl - s * 0.03, y - th); g.lineTo(sx, tip); g.lineTo(tl + tw + s * 0.03, y - th); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(sx, tip); g.lineTo(sx, tip - s * 0.16); g.moveTo(sx - s * 0.05, tip - s * 0.11); g.lineTo(sx + s * 0.05, tip - s * 0.11); g.stroke();
  g.beginPath(); g.arc(sx, y - th * 0.62, s * 0.05, Math.PI, 0); g.lineTo(sx + s * 0.05, y - th * 0.5); g.lineTo(sx - s * 0.05, y - th * 0.5); g.closePath(); g.fillStyle = INK; g.fill();
}
function wallRing(g, x, y, r, towers, fill) {
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill();
  g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = WALL; g.lineWidth = 1.9; g.stroke();
  for (let k = 0; k < towers; k++) { const a = k / towers * TAU + 0.3, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; g.beginPath(); g.arc(px, py, 2.6, 0, TAU); g.fillStyle = WALL; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke(); }
}
function stoneShape(g, pts) { poly(g, pts); g.fillStyle = STONE[0]; g.fill(); g.save(); g.clip(); g.fillStyle = STONE[1]; const xs = pts.map(p => p[0]); const mx = (Math.min(...xs) + Math.max(...xs)) / 2; g.fillRect(mx + 0.5, -1e4, 2e4, 2e4); g.restore(); poly(g, pts); g.strokeStyle = INK; g.lineWidth = 0.85; g.stroke(); }
function drawDragon(g, x, y, s, flip) {
  g.save(); g.translate(x, y); if (flip) g.scale(-1, 1);
  const col = '#7d2a20';
  const wing = sgn => { g.beginPath(); g.moveTo(-s * 0.05, 0); g.lineTo(-s * 0.25, -s * 0.6 * sgn); g.lineTo(-s * 0.75, -s * 0.42 * sgn); g.quadraticCurveTo(-s * 0.55, -s * 0.3 * sgn, -s * 0.52, -s * 0.12 * sgn); g.quadraticCurveTo(-s * 0.35, -s * 0.12 * sgn, -s * 0.3, 0); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke(); };
  wing(1);
  g.beginPath(); g.moveTo(-s * 0.6, s * 0.12); g.quadraticCurveTo(-s * 0.3, 0, 0, -s * 0.02); g.quadraticCurveTo(s * 0.22, -s * 0.06, s * 0.36, -s * 0.16); g.strokeStyle = INK; g.lineWidth = 2.6; g.lineCap = 'round'; g.stroke(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
  g.beginPath(); g.moveTo(s * 0.3, -s * 0.2); g.lineTo(s * 0.5, -s * 0.16); g.lineTo(s * 0.34, -s * 0.1); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
  g.beginPath(); g.moveTo(-s * 0.6, s * 0.12); g.lineTo(-s * 0.72, s * 0.08); g.lineTo(-s * 0.66, s * 0.18); g.closePath(); g.fillStyle = col; g.fill();
  g.restore();
}

function drawSettlement(g, s, x, y, map) {
  const k = s.kind, rnd = mulberry32((s.i + 1) * 9301 + 49297), roofA = ROOFS[Math.floor(rnd() * 3)], roofB = ROOFS[Math.floor(rnd() * 3)];
  const pal = map && map.temp ? MT[climate(map, s.i)] : MT.temperate;
  if (k === 'capital') {
    const cy = y + R * 0.12;
    g.beginPath(); g.arc(x, cy, R * 0.74, 0, TAU); g.fillStyle = 'rgba(201,162,79,0.42)'; g.fill();
    wallRing(g, x, cy, R * 0.64, 8, 'rgba(240,230,203,0.75)');
    const gy = y + R * 0.38;
    coneTower(g, x - R * 0.25, gy, R * 0.15, R * 0.5, ROOFS[1]); coneTower(g, x + R * 0.25, gy, R * 0.15, R * 0.5, ROOFS[1]);
    g.fillStyle = WALL; g.fillRect(x - R * 0.2, gy - R * 0.3, R * 0.4, R * 0.3); g.fillStyle = WALL_D; g.fillRect(x + R * 0.06, gy - R * 0.3, R * 0.14, R * 0.3); g.strokeStyle = INK; g.lineWidth = 0.9; g.strokeRect(x - R * 0.2, gy - R * 0.3, R * 0.4, R * 0.3);
    crenTower(g, x, gy, R * 0.26, R * 0.74);
    g.beginPath(); g.arc(x, gy, R * 0.07, Math.PI, 0); g.lineTo(x + R * 0.07, gy); g.closePath(); g.fillStyle = INK; g.fill();
    banner(g, x, gy - R * 0.74 - R * 0.05, R * 0.42, WAX);
    banner(g, x - R * 0.25, gy - R * 0.5 - R * 0.22, R * 0.2, GOLD); banner(g, x + R * 0.25, gy - R * 0.5 - R * 0.22, R * 0.2, GOLD);
    house(g, x - R * 0.47, y + R * 0.52, R * 0.2, roofA, true); house(g, x + R * 0.48, y + R * 0.5, R * 0.2, roofB, false);
  } else if (k === 'city') {
    wallRing(g, x, y + R * 0.12, R * 0.56, 6, 'rgba(240,230,203,0.72)');
    church(g, x + R * 0.06, y + R * 0.18, R * 0.36, ROOFS[1]);
    house(g, x - R * 0.28, y + R * 0.36, R * 0.26, roofA, true); house(g, x + R * 0.28, y + R * 0.42, R * 0.25, roofB, false); house(g, x - R * 0.02, y + R * 0.52, R * 0.24, roofA, rnd() < 0.5);
  } else if (k === 'town') {
    if ((s.pop || 0) > 2200) { church(g, x - R * 0.02, y + R * 0.2, R * 0.3, ROOFS[1]); house(g, x + R * 0.26, y + R * 0.36, R * 0.27, roofA, true); house(g, x - R * 0.26, y + R * 0.44, R * 0.26, roofB, false); }
    else { house(g, x - R * 0.2, y + R * 0.24, R * 0.3, roofA, true); house(g, x + R * 0.18, y + R * 0.32, R * 0.28, roofB, false); house(g, x, y + R * 0.48, R * 0.25, roofA, rnd() < 0.5); }
  } else if (k === 'village') {
    const v = rnd();
    house(g, x - R * 0.12, y + R * 0.3, R * 0.27, ROOFS[2], v < 0.5);
    if (v > 0.35) house(g, x + R * 0.2, y + R * 0.42, R * 0.22, v > 0.75 ? ROOFS[0] : ROOFS[2], false);
    if (v < 0.6) drawHaystack(g, x + R * 0.3, y + R * 0.2, R * 0.13);
    else { g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x - R * 0.45, y + R * 0.5); g.lineTo(x - R * 0.05, y + R * 0.56); for (let t = 0; t < 4; t++) { const fx = lerp(x - R * 0.45, x - R * 0.05, t / 3), fy = lerp(y + R * 0.5, y + R * 0.56, t / 3); g.moveTo(fx, fy + 1.5); g.lineTo(fx, fy - 2.5); } g.stroke(); }
  } else if (k === 'waterfall') {
    // a scarp of layered rock laid across the river's own course: the river runs to the lip, pours down the face into a
    // plunge pool and carries on from the pool, all along the channel the map has already drawn, so nothing doubles up
    const cl = map && map.temp ? climate(map, s.i) : 'temperate', [rl, rd] = MT[cl] || MT.temperate, snowy = map && map.temp ? map.temp[s.i] < 0.2 : false;
    const H = R * 0.48, W = R * 0.78;
    let top = [x, y - R * 0.18], bot = [x, y - R * 0.18 + H], ww = R * 0.12, course = null;
    const RVd = map && map.riverOf && RIV_DRAWN && map.riverOf[s.i] >= 0 ? RIV_DRAWN[map.riverOf[s.i]] : null;
    if (RVd) {
      // the steepest run of the drawn channel near the hex centre: a stretch that falls a face-height with least sideways travel
      const P = RVd.P; let best = null, bs = 1e9;
      for (let i = 0; i < P.length; i++) {
        const a = P[i]; if (Math.hypot(a[0] - x, a[1] - (y + R * 0.05)) > R * 0.62) continue;
        let j = i; while (j < P.length - 1 && P[j][1] - a[1] < H) j++;
        if (P[j][1] - a[1] < H * 0.9) continue;
        let side = 0; for (let k3 = i; k3 <= j; k3++) side = Math.max(side, Math.abs(P[k3][0] - lerp(a[0], P[j][0], (k3 - i) / Math.max(1, j - i))));
        const sc = Math.abs(P[j][0] - a[0]) * 0.8 + side * 1.5 + (j - i) * 0.05 + Math.hypot((a[0] + P[j][0]) / 2 - x, (a[1] + P[j][1]) / 2 - (y + R * 0.05)) * 0.35;
        if (sc < bs) { bs = sc; best = [i, j]; }
      }
      if (best) { top = P[best[0]]; bot = [top[0], P[best[1]][1], P[best[1]][2]]; ww = Math.max(R * 0.07, top[2] + 0.6); course = P; var outFrom = best[1]; }   // water falls plumb; the pool feeds the river on
    }
    const lipY = top[1], baseY = bot[1], cx = (top[0] + bot[0]) / 2;
    const nearWater = (px, py, gap) => course ? course.some(q => Math.hypot(q[0] - px, q[1] - py) < q[2] + gap) : Math.abs(px - x) < R * 0.2 + gap;
    // trees on the high ground behind the lip, kept off the water
    for (const [dx, dy, sz] of [[-0.6, -0.26, 0.24], [0.62, -0.3, 0.22], [-0.36, -0.42, 0.2], [0.34, -0.44, 0.19]]) { const px = cx + R * dx, py = lipY + R * (dy + 0.14); if (!nearWater(px, py - R * sz, R * sz * 0.7) && !nearWater(px, py, 3)) drawPine(g, px, py, R * sz, rnd, snowy); }
    if (!course) {   // the key has no river beneath it: draw a short one
      g.strokeStyle = INK; g.lineWidth = ww * 2 + 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - R * 0.1, y - R * 0.7); g.quadraticCurveTo(x - R * 0.05, lipY - R * 0.2, x, lipY + 1); g.moveTo(x, baseY); g.quadraticCurveTo(x + R * 0.08, baseY + R * 0.3, x + R * 0.04, y + R * 0.75); g.stroke();
      g.strokeStyle = '#86aaa9'; g.lineWidth = ww * 2; g.stroke();
    }
    // the scarp: a jagged lip, a layered face, darker on the shaded side; it hides the channel where the water drops
    const lx = top[0], lip = [[cx - W, lipY + R * 0.06], [cx - W * 0.7, lipY - R * 0.01], [cx - W * 0.45, lipY + R * 0.04], [lx - ww - 1.5, lipY + 0.5], [lx + ww + 1.5, lipY + 0.5], [cx + W * 0.42, lipY + R * 0.03], [cx + W * 0.72, lipY - R * 0.02], [cx + W, lipY + R * 0.07]];
    const face = () => { g.beginPath(); lip.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.lineTo(cx + W * 0.9, baseY); g.lineTo(cx - W * 0.9, baseY); g.closePath(); };
    castShadow(g, cx + R * 0.06, baseY, W * 2, R * 0.14);
    face(); g.fillStyle = rl; g.fill();
    g.save(); face(); g.clip();
    g.fillStyle = rd; g.fillRect(bot[0] + ww + 1, lipY - 4, W * 2, baseY - lipY + 8);
    g.strokeStyle = 'rgba(43,33,22,0.35)'; g.lineWidth = 0.55; g.beginPath();
    for (const f of [0.3, 0.56, 0.8]) { const yy = lerp(lipY, baseY, f), sx = lerp(top[0], bot[0], f); g.moveTo(cx - W, yy + Math.sin(f * 9) * 1.2); g.lineTo(sx - ww - 2, yy); g.moveTo(sx + ww + 2, yy + 0.8); g.lineTo(cx + W, yy - Math.cos(f * 7) * 1.2); }
    g.stroke(); g.restore();
    face(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    if (snowy) { g.strokeStyle = '#f8f5ec'; g.lineWidth = 1.4; g.beginPath(); lip.forEach((p, i) => i ? g.lineTo(p[0], p[1] + 0.8) : g.moveTo(p[0], p[1] + 0.8)); g.stroke(); }
    // the falling sheet, exactly as wide as the river that feeds it, widening a touch as it drops
    const sheet = () => { g.beginPath(); g.moveTo(top[0] - ww, lipY); g.quadraticCurveTo(top[0] - ww * 1.25, lipY + H * 0.15, bot[0] - ww * 1.2, baseY - 1); g.lineTo(bot[0] + ww * 1.2, baseY - 1); g.quadraticCurveTo(top[0] + ww * 1.25, lipY + H * 0.15, top[0] + ww, lipY); g.closePath(); };
    sheet(); g.fillStyle = '#d9e8e3'; g.fill();
    g.save(); sheet(); g.clip();
    g.fillStyle = 'rgba(110,150,152,0.5)'; g.beginPath(); g.moveTo(top[0] + ww * 0.25, lipY); g.lineTo(bot[0] + ww * 0.3, baseY); g.lineTo(bot[0] + ww * 1.3, baseY); g.lineTo(top[0] + ww * 1.1, lipY); g.closePath(); g.fill();
    g.lineCap = 'round';
    for (let k2 = 0; k2 < 7; k2++) { const f = -0.85 + k2 * 0.28 + (rnd() - 0.5) * 0.1, y0 = lipY + rnd() * H * 0.2; g.strokeStyle = k2 % 3 === 1 ? 'rgba(96,136,140,0.7)' : 'rgba(255,255,255,0.95)'; g.lineWidth = k2 % 3 === 1 ? 0.6 : 0.85; g.beginPath(); g.moveTo(lerp(top[0], bot[0], (y0 - lipY) / H) + ww * f, y0); g.lineTo(bot[0] + ww * f * 1.15, baseY - 1); g.stroke(); }
    g.restore();
    sheet(); g.strokeStyle = 'rgba(43,33,22,0.7)'; g.lineWidth = 0.6; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(top[0] - ww, lipY + 0.5); g.quadraticCurveTo(top[0], lipY - 1.2, top[0] + ww, lipY + 0.5); g.stroke();
    // plunge pool at the foot, centred on the channel the river leaves by
    const px0 = bot[0], pr = Math.max(R * 0.3, ww * 2.6), py0 = baseY + R * 0.04;
    if (course) { // the river leaves the pool and rejoins its drawn course a little downstream
      let o = null; for (let k3 = outFrom; k3 < course.length; k3++) { const q = course[k3]; if (((q[0] - px0) / pr) ** 2 + ((q[1] - py0) / (R * 0.12)) ** 2 >= 1.6 && q[1] > py0) { o = k3; break; } }
      if (o != null) {
        const q = course[o], q2 = course[Math.min(course.length - 1, o + 4)], c1 = [px0, py0 + R * 0.1], c2 = [q[0] - (q2[0] - q[0]) * 1.2, q[1] - (q2[1] - q[1]) * 1.2];
        const run = () => { g.beginPath(); g.moveTo(px0, py0); g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], q[0], q[1]); };
        g.lineCap = 'round'; run(); g.strokeStyle = INK; g.lineWidth = q[2] * 2 + 1.6; g.stroke(); run(); g.strokeStyle = '#86aaa9'; g.lineWidth = q[2] * 2; g.stroke();
      }
    }
    g.beginPath(); g.ellipse(px0, py0, pr, R * 0.12, 0, 0, TAU); g.fillStyle = '#7fa3a3'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.85; g.stroke();
    g.beginPath(); g.ellipse(px0, baseY + R * 0.02, pr * 0.72, R * 0.065, 0, 0, TAU); g.fillStyle = 'rgba(250,252,248,0.9)'; g.fill();
    for (const sd of [-1, 1]) { g.strokeStyle = 'rgba(244,248,236,0.85)'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(px0, baseY + R * 0.05, pr * (0.8 + 0.1 * sd), R * (0.09 + 0.01 * sd), 0, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
    // boulders at the foot, clear of the stream
    for (const [dx, sz] of [[-1, 0.15], [1, 0.12]]) { const rx = px0 + dx * (pr + R * 0.12), ry = baseY + R * 0.1; if (!nearWater(rx, ry, 2)) drawRock(g, rx, ry, R * sz, rnd); }
    // spray and a bow in the mist
    const sp = g.createRadialGradient(px0, baseY - R * 0.05, 0, px0, baseY - R * 0.05, R * 0.4); sp.addColorStop(0, 'rgba(255,255,255,0.75)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.beginPath(); g.ellipse(px0, baseY - R * 0.05, R * 0.42, R * 0.24, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; for (let k2 = 0; k2 < 7; k2++) { g.beginPath(); g.arc(px0 + (rnd() - 0.5) * R * 0.55, baseY - R * (0.02 + rnd() * 0.15), 0.6 + rnd() * 0.9, 0, TAU); g.fill(); }
    g.lineWidth = 0.7; g.lineCap = 'butt';
    [['rgba(214,92,72,0.4)', 0], ['rgba(232,200,90,0.38)', 0.7], ['rgba(96,150,196,0.36)', 1.4]].forEach(([c, o]) => { g.strokeStyle = c; g.beginPath(); g.arc(px0 + R * 0.26, baseY + R * 0.02, R * 0.24 - o, Math.PI * 1.08, Math.PI * 1.62); g.stroke(); });
    g.lineCap = 'round';
  } else if (k === 'outpost') {
    // a palisaded clearing in the woods: watchtower, longhouse, beacon, trees crowding the stakes
    const cl = map && map.temp ? climate(map, s.i) : 'temperate', b = map && map.B ? map.B[s.i] : 'forest';
    const pines = b === 'taiga' || cl === 'cold', snowy = map && map.temp ? map.temp[s.i] < 0.2 : false;
    const tree = (tx, ty, sz) => pines || rnd() < 0.3 ? drawPine(g, tx, ty, R * sz * 0.85, rnd, snowy) : drawTree(g, tx, ty, R * sz, b === 'deepwood' ? 'deep' : rnd() < 0.2 ? 'birch' : 'oak', rnd);
    tree(x - R * 0.5, y - R * 0.06, 0.34); tree(x + R * 0.52, y - R * 0.1, 0.32); tree(x - R * 0.06, y - R * 0.3, 0.3);
    const cx = x, cy = y + R * 0.3, rx = R * 0.58, ry = R * 0.24;
    g.beginPath(); g.ellipse(cx, cy, rx * 0.97, ry * 0.97, 0, 0, TAU); g.fillStyle = 'rgba(200,172,116,0.75)'; g.fill();
    g.fillStyle = 'rgba(120,92,52,0.35)'; for (let k2 = 0; k2 < 6; k2++) { g.beginPath(); g.arc(cx + (rnd() - 0.5) * rx * 1.2, cy + (rnd() - 0.5) * ry * 1.1, 0.6, 0, TAU); g.fill(); }
    const stakes = (a0, a1, gate) => {
      const n = Math.round((a1 - a0) / TAU * 40);
      for (let k2 = 0; k2 <= n; k2++) {
        const a = a0 + (a1 - a0) * k2 / n; if (gate && Math.abs(a - Math.PI / 2) < 0.26) continue;
        const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry, hgt = R * (0.12 + 0.025 * Math.sin(k2 * 2.7)), sw = R * 0.04;
        g.beginPath(); g.moveTo(px - sw, py); g.lineTo(px - sw, py - hgt); g.lineTo(px, py - hgt - sw * 1.4); g.lineTo(px + sw, py - hgt); g.lineTo(px + sw, py); g.closePath();
        g.fillStyle = Math.cos(a) > 0.35 ? '#8f6a40' : '#b98c58'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.45; g.stroke();
      }
    };
    stakes(Math.PI, TAU, false);
    // longhouse with a thatched roof and a wisp of smoke
    house(g, x - R * 0.24, cy + R * 0.02, R * 0.27, ['#c4a35e', '#a3843f'], true);
    // timber watchtower: splayed legs, braced, a roofed platform and a beacon
    const tx = x + R * 0.24, tb = cy + R * 0.02, th = R * 0.84, lw2 = R * 0.13, tw2 = R * 0.09;
    castShadow(g, tx + R * 0.05, tb, R * 0.34, R * 0.08);
    g.lineCap = 'round';
    for (const [w0, w1, col] of [[-lw2, -tw2, '#8a6238'], [lw2, tw2, '#6a4826']]) { g.strokeStyle = INK; g.lineWidth = 2.1; g.beginPath(); g.moveTo(tx + w0, tb); g.lineTo(tx + w1, tb - th); g.stroke(); g.strokeStyle = col; g.lineWidth = 1.1; g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath();
    for (const f of [0.15, 0.5]) { const y0 = tb - th * f, y1 = tb - th * (f + 0.32), w0 = lerp(lw2, tw2, f), w1 = lerp(lw2, tw2, f + 0.32); g.moveTo(tx - w0, y0); g.lineTo(tx + w1, y1); g.moveTo(tx + w0, y0); g.lineTo(tx - w1, y1); }
    g.stroke();
    const py2 = tb - th; g.fillStyle = '#a27648'; g.fillRect(tx - tw2 * 1.6, py2 - R * 0.13, tw2 * 3.2, R * 0.13); g.fillStyle = '#7a5532'; g.fillRect(tx + tw2 * 0.4, py2 - R * 0.13, tw2 * 1.2, R * 0.13);
    g.strokeStyle = INK; g.lineWidth = 0.75; g.strokeRect(tx - tw2 * 1.6, py2 - R * 0.13, tw2 * 3.2, R * 0.13);
    g.beginPath(); g.moveTo(tx - tw2 * 1.6, py2 - R * 0.065); g.lineTo(tx + tw2 * 1.6, py2 - R * 0.065); g.lineWidth = 0.45; g.stroke();
    const rt = py2 - R * 0.13; g.beginPath(); g.moveTo(tx - tw2 * 2.1, rt); g.lineTo(tx, rt - R * 0.2); g.lineTo(tx + tw2 * 2.1, rt); g.closePath(); g.fillStyle = '#c4a35e'; g.fill();
    g.beginPath(); g.moveTo(tx, rt - R * 0.2); g.lineTo(tx + tw2 * 2.1, rt); g.lineTo(tx, rt); g.closePath(); g.fillStyle = '#a3843f'; g.fill();
    g.beginPath(); g.moveTo(tx - tw2 * 2.1, rt); g.lineTo(tx, rt - R * 0.2); g.lineTo(tx + tw2 * 2.1, rt); g.closePath(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
    const gl = g.createRadialGradient(tx, py2 - R * 0.07, 0, tx, py2 - R * 0.07, R * 0.2); gl.addColorStop(0, 'rgba(255,190,90,0.7)'); gl.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = gl; g.beginPath(); g.arc(tx, py2 - R * 0.07, R * 0.2, 0, TAU); g.fill();
    banner(g, tx, rt - R * 0.18, R * 0.2, '#4f6b3a');
    // front stakes with a gate, then a tree or two crowding outside
    stakes(0, Math.PI, true);
    const gx = cx, gy2 = cy + ry; g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); g.moveTo(gx - R * 0.1, gy2); g.lineTo(gx - R * 0.1, gy2 - R * 0.22); g.moveTo(gx + R * 0.1, gy2); g.lineTo(gx + R * 0.1, gy2 - R * 0.22); g.stroke();
    g.strokeStyle = '#8a6238'; g.lineWidth = 1.1; g.stroke(); g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(gx - R * 0.14, gy2 - R * 0.2); g.lineTo(gx + R * 0.14, gy2 - R * 0.2); g.stroke();
    tree(x - R * 0.62, y + R * 0.62, 0.26); tree(x + R * 0.64, y + R * 0.56, 0.24);
  } else if (k === 'hillfort') {
    // an old earthwork on a summit: three ramparts with ditches, a palisade, roundhouses and a gate
    const pal2 = map && map.temp ? HILLP[climate(map, s.i)] : HILLP.temperate, hb = y + R * 0.74, hw = R * 1.86, hh = R * 0.8;
    drawHill(g, x, hb, hw, hh, { pal: pal2, rnd });
    const cx = x, cy = y + R * 0.1;
    // stepped earthworks: each rampart a pale bank, each ditch a shadowed trough inside it
    g.save(); hillPath(g, x, hb, hw, hh); g.closePath(); g.clip();
    const bank = rgbStr(hexRgb(pal2[0]), 1.06), ditch = rgbStr(hexRgb(pal2[1]), 0.74), crown = rgbStr(hexRgb(pal2[0]), 0.98);
    const RINGS = [[R * 0.86, R * 0.33, R * 0.2], [R * 0.66, R * 0.25, R * 0.11], [R * 0.47, R * 0.18, R * 0.04]];
    RINGS.forEach(([rx, ry, oy], k2) => {
      g.beginPath(); g.ellipse(cx, cy + oy, rx, ry, 0, 0, TAU); g.fillStyle = bank; g.fill();
      g.beginPath(); g.ellipse(cx, cy + oy, rx, ry, 0, Math.PI * 0.08, Math.PI * 0.92); g.strokeStyle = rgbStr(hexRgb(pal2[1]), 0.95); g.lineWidth = 1.6; g.stroke();
      g.beginPath(); g.ellipse(cx, cy + oy, rx, ry, 0, 0, TAU); g.strokeStyle = 'rgba(43,33,22,0.6)'; g.lineWidth = 0.6; g.stroke();
      g.beginPath(); g.ellipse(cx, cy + oy - 0.9, rx - 2.2, ry - 1.4, 0, 0, TAU); g.fillStyle = k2 === RINGS.length - 1 ? crown : ditch; g.fill();
      if (k2 < RINGS.length - 1) { g.beginPath(); g.ellipse(cx, cy + oy - 0.9, rx - 2.2, ry - 1.4, 0, Math.PI, TAU); g.strokeStyle = 'rgba(60,44,22,0.45)'; g.lineWidth = 1.2; g.stroke(); }
    });
    g.restore();
    const prx = R * 0.4, pry = R * 0.15;
    const stakes = (a0, a1, gate) => {
      const n = Math.round((a1 - a0) / TAU * 34);
      for (let k2 = 0; k2 <= n; k2++) {
        const a = a0 + (a1 - a0) * k2 / n; if (gate && Math.abs(a - Math.PI / 2) < 0.32) continue;
        const px = cx + Math.cos(a) * prx, py = cy + R * 0.03 + Math.sin(a) * pry, hgt = R * 0.1, sw = R * 0.035;
        g.beginPath(); g.moveTo(px - sw, py); g.lineTo(px - sw, py - hgt); g.lineTo(px, py - hgt - sw * 1.3); g.lineTo(px + sw, py - hgt); g.lineTo(px + sw, py); g.closePath();
        g.fillStyle = Math.cos(a) > 0.35 ? '#7a5532' : '#a27648'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
      }
    };
    stakes(Math.PI, TAU, false);
    // roundhouses: wattle walls under tall conical thatch
    const round = (hx, hy, r2) => {
      g.fillStyle = '#e4d3ae'; g.fillRect(hx - r2, hy - r2 * 0.75, r2 * 2, r2 * 0.75); g.fillStyle = '#c8b48a'; g.fillRect(hx + r2 * 0.25, hy - r2 * 0.75, r2 * 0.75, r2 * 0.75);
      g.strokeStyle = INK; g.lineWidth = 0.7; g.strokeRect(hx - r2, hy - r2 * 0.75, r2 * 2, r2 * 0.75);
      g.fillStyle = INK; g.fillRect(hx - r2 * 0.18, hy - r2 * 0.5, r2 * 0.36, r2 * 0.5);
      const top = hy - r2 * 0.75, tip = top - r2 * 1.35;
      g.beginPath(); g.moveTo(hx - r2 * 1.25, top + 0.6); g.lineTo(hx, tip); g.lineTo(hx + r2 * 1.25, top + 0.6); g.closePath(); g.fillStyle = '#c4a35e'; g.fill();
      g.beginPath(); g.moveTo(hx, tip); g.lineTo(hx + r2 * 1.25, top + 0.6); g.lineTo(hx + r2 * 0.1, top + 0.6); g.closePath(); g.fillStyle = '#a3843f'; g.fill();
      g.strokeStyle = 'rgba(110,84,40,0.6)'; g.lineWidth = 0.45; g.beginPath(); for (const f of [0.35, 0.65]) { g.moveTo(hx - r2 * 1.25 * (1 - f), lerp(top, tip, f)); g.lineTo(hx + r2 * 1.25 * (1 - f), lerp(top, tip, f)); } g.stroke();
      g.beginPath(); g.moveTo(hx - r2 * 1.25, top + 0.6); g.lineTo(hx, tip); g.lineTo(hx + r2 * 1.25, top + 0.6); g.closePath(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
      return tip;
    };
    round(x + R * 0.17, cy + R * 0.02, R * 0.13);
    const tip = round(x - R * 0.12, cy + R * 0.09, R * 0.17);
    g.strokeStyle = 'rgba(90,80,70,0.45)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - R * 0.12, tip); g.quadraticCurveTo(x - R * 0.04, tip - R * 0.14, x - R * 0.14, tip - R * 0.26); g.stroke();
    banner(g, x + R * 0.17, cy + R * 0.02 - R * 0.13 * 2.1, R * 0.26, WAX);
    stakes(0, Math.PI, true);
    // gate: two posts and a fighting platform over the causeway
    const gx = cx, gy2 = cy + R * 0.03 + pry + 0.5, gh = R * 0.22;
    g.lineCap = 'butt';
    for (const sx of [-1, 1]) { g.fillStyle = '#8a6238'; g.fillRect(gx + sx * R * 0.1 - R * 0.035, gy2 - gh, R * 0.07, gh); g.strokeStyle = INK; g.lineWidth = 0.7; g.strokeRect(gx + sx * R * 0.1 - R * 0.035, gy2 - gh, R * 0.07, gh); }
    g.fillStyle = '#a27648'; g.fillRect(gx - R * 0.16, gy2 - gh - R * 0.07, R * 0.32, R * 0.07); g.strokeRect(gx - R * 0.16, gy2 - gh - R * 0.07, R * 0.32, R * 0.07);
    g.lineCap = 'round';
    // the causeway running down through the ramparts
    g.strokeStyle = 'rgba(150,118,70,0.55)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(gx, gy2 + 1); g.quadraticCurveTo(gx + R * 0.05, gy2 + R * 0.22, gx - R * 0.02, hb - 1); g.stroke();
  } else if (k === 'keep') {
    const gy = y + R * 0.46;
    castShadow(g, x + R * 0.05, gy, R * 0.9, R * 0.14);
    crenTower(g, x, gy - R * 0.1, R * 0.3, R * 0.62);
    banner(g, x, gy - R * 0.1 - R * 0.62 - R * 0.06, R * 0.34, WAX);
    g.fillStyle = WALL; g.fillRect(x - R * 0.36, gy - R * 0.22, R * 0.72, R * 0.22); g.fillStyle = WALL_D; g.fillRect(x + R * 0.08, gy - R * 0.22, R * 0.28, R * 0.22);
    g.strokeStyle = INK; g.lineWidth = 0.9; g.strokeRect(x - R * 0.36, gy - R * 0.22, R * 0.72, R * 0.22);
    for (let t = 0; t < 5; t++) { g.beginPath(); g.rect(x - R * 0.33 + t * R * 0.15, gy - R * 0.27, R * 0.07, R * 0.05); g.fillStyle = WALL; g.fill(); g.stroke(); }
    crenTower(g, x - R * 0.38, gy, R * 0.14, R * 0.34); crenTower(g, x + R * 0.38, gy, R * 0.14, R * 0.34);
    g.beginPath(); g.moveTo(x - R * 0.07, gy); g.lineTo(x - R * 0.07, gy - R * 0.09); g.arc(x, gy - R * 0.09, R * 0.07, Math.PI, 0); g.lineTo(x + R * 0.07, gy); g.closePath(); g.fillStyle = INK; g.fill();
  } else if (k === 'tower') {
    const gy = y + R * 0.48, w0 = R * 0.24, w1 = R * 0.16, h = R * 0.82;
    castShadow(g, x + R * 0.06, gy, R * 0.5, R * 0.1);
    const body = () => poly(g, [[x - w0 / 2, gy], [x - w1 / 2, gy - h], [x + w1 / 2, gy - h], [x + w0 / 2, gy]]);
    body(); g.fillStyle = WALL; g.fill(); shadeRight(g, body, x + w1 * 0.12, WALL_D); body(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    g.globalAlpha = 0.4; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x - w0 * 0.42, gy - h * 0.3); g.lineTo(x + w0 * 0.42, gy - h * 0.3); g.moveTo(x - w0 * 0.38, gy - h * 0.55); g.lineTo(x + w0 * 0.38, gy - h * 0.55); g.stroke(); g.globalAlpha = 1;
    g.fillStyle = WALL; g.fillRect(x - w1 * 0.78, gy - h - 2.4, w1 * 1.56, 2.6); g.strokeRect(x - w1 * 0.78, gy - h - 2.4, w1 * 1.56, 2.6);
    const top = gy - h - 2.4, tip = [x + R * 0.04, top - R * 0.5];
    g.beginPath(); g.moveTo(x - w1 * 0.9, top); g.quadraticCurveTo(x - w1 * 0.2, top - R * 0.2, tip[0], tip[1]); g.quadraticCurveTo(x + w1 * 0.3, top - R * 0.15, x + w1 * 0.9, top); g.closePath(); g.fillStyle = '#5a4f7a'; g.fill();
    g.save(); g.clip(); g.fillStyle = '#433a5e'; g.fillRect(x + w1 * 0.05, top - R, R, R); g.restore();
    g.beginPath(); g.moveTo(x - w1 * 0.9, top); g.quadraticCurveTo(x - w1 * 0.2, top - R * 0.2, tip[0], tip[1]); g.quadraticCurveTo(x + w1 * 0.3, top - R * 0.15, x + w1 * 0.9, top); g.closePath(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    const wy = gy - h * 0.72, gl = g.createRadialGradient(x, wy, 0, x, wy, R * 0.22); gl.addColorStop(0, 'rgba(255,214,120,0.75)'); gl.addColorStop(1, 'rgba(255,214,120,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, wy, R * 0.22, 0, TAU); g.fill();
    g.beginPath(); g.arc(x, wy - 1, R * 0.035, Math.PI, 0); g.lineTo(x + R * 0.035, wy + 2.5); g.lineTo(x - R * 0.035, wy + 2.5); g.closePath(); g.fillStyle = '#f2c460'; g.fill(); g.lineWidth = 0.6; g.stroke();
    const star = (sx, sy, r) => { g.beginPath(); g.moveTo(sx, sy - r); g.lineTo(sx + r * 0.25, sy - r * 0.25); g.lineTo(sx + r, sy); g.lineTo(sx + r * 0.25, sy + r * 0.25); g.lineTo(sx, sy + r); g.lineTo(sx - r * 0.25, sy + r * 0.25); g.lineTo(sx - r, sy); g.lineTo(sx - r * 0.25, sy - r * 0.25); g.closePath(); g.fillStyle = GOLD; g.fill(); };
    star(tip[0] + R * 0.2, tip[1] + R * 0.05, 2.6); star(tip[0] - R * 0.22, tip[1] + R * 0.16, 1.8); star(tip[0] + R * 0.1, tip[1] - R * 0.12, 1.4);
    g.beginPath(); g.moveTo(x - R * 0.04, gy); g.lineTo(x - R * 0.04, gy - R * 0.08); g.arc(x, gy - R * 0.08, R * 0.04, Math.PI, 0); g.lineTo(x + R * 0.04, gy); g.closePath(); g.fillStyle = INK; g.fill();
  } else if (k === 'ruin') {
    const gy = y + R * 0.44;
    castShadow(g, x, gy, R * 0.9, R * 0.12);
    stoneShape(g, [[x + R * 0.28, gy], [x + R * 0.28, gy - R * 0.16], [x + R * 0.34, gy - R * 0.2], [x + R * 0.4, gy - R * 0.14], [x + R * 0.4, gy]]);
    stoneShape(g, [[x - R * 0.36, gy], [x - R * 0.36, gy - R * 0.56], [x - R * 0.24, gy - R * 0.56], [x - R * 0.24, gy]]);
    stoneShape(g, [[x + R * 0.06, gy], [x + R * 0.06, gy - R * 0.34], [x + R * 0.1, gy - R * 0.4], [x + R * 0.14, gy - R * 0.33], [x + R * 0.18, gy - R * 0.38], [x + R * 0.18, gy]]);
    stoneShape(g, [[x - R * 0.36, gy - R * 0.56], [x - R * 0.3, gy - R * 0.72], [x - R * 0.14, gy - R * 0.8], [x - R * 0.02, gy - R * 0.78], [x - R * 0.04, gy - R * 0.68], [x - R * 0.14, gy - R * 0.69], [x - R * 0.24, gy - R * 0.6], [x - R * 0.24, gy - R * 0.56]]);
    [[-0.12, 0.02], [0.24, 0.04], [-0.02, 0.05]].forEach(([dx, dy]) => stoneShape(g, [[x + dx * R - 3, gy + dy * R], [x + dx * R - 3, gy + dy * R - 3.2], [x + dx * R + 3, gy + dy * R - 4], [x + dx * R + 3.5, gy + dy * R]]));
    g.fillStyle = '#6c8549'; [[-0.34, -0.5], [-0.27, -0.42], [-0.32, -0.3], [-0.26, -0.18], [-0.2, -0.72], [-0.1, -0.79], [0.1, -0.3]].forEach(([dx, dy]) => { g.beginPath(); g.ellipse(x + dx * R, gy + dy * R, 1.9, 1.3, 0.5, 0, TAU); g.fill(); });
  } else if (k === 'cave') {
    drawMountain(g, x, y + R * 0.5, R * 1.45, R * 1.02, { rnd, pal });
    g.beginPath(); g.moveTo(x - R * 0.17, y + R * 0.5); g.quadraticCurveTo(x - R * 0.16, y + R * 0.14, x, y + R * 0.14); g.quadraticCurveTo(x + R * 0.16, y + R * 0.14, x + R * 0.17, y + R * 0.5); g.closePath();
    g.fillStyle = '#1f1710'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    drawRock(g, x - R * 0.26, y + R * 0.52, R * 0.14, rnd); drawRock(g, x + R * 0.26, y + R * 0.54, R * 0.12, rnd);
    g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); [[0.05, -0.08], [0.2, -0.2]].forEach(([dx, dy]) => { const bx = x + dx * R, by2 = y + dy * R; g.moveTo(bx - 3, by2); g.quadraticCurveTo(bx - 1.5, by2 - 2, bx, by2); g.quadraticCurveTo(bx + 1.5, by2 - 2, bx + 3, by2); }); g.stroke();
  } else if (k === 'lair') {
    drawMountain(g, x, y + R * 0.5, R * 1.5, R * 1.12, { rnd, pal: MT.dark, twin: true });
    g.beginPath(); g.moveTo(x - R * 0.19, y + R * 0.5); g.quadraticCurveTo(x - R * 0.18, y + R * 0.1, x, y + R * 0.1); g.quadraticCurveTo(x + R * 0.18, y + R * 0.1, x + R * 0.19, y + R * 0.5); g.closePath();
    g.fillStyle = '#1a100b'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    const gl = g.createRadialGradient(x, y + R * 0.42, 0, x, y + R * 0.42, R * 0.2); gl.addColorStop(0, 'rgba(240,110,40,0.95)'); gl.addColorStop(1, 'rgba(240,110,40,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, y + R * 0.42, R * 0.2, 0, TAU); g.fill();
    drawBones(g, x + R * 0.38, y + R * 0.6, R * 0.22);
    drawDragon(g, x + R * 0.2, y - R * 0.95, R * 0.62, rnd() < 0.5);
  } else if (k === 'volcano') {
    drawVolcano(g, x, y + R * 0.52, R * 1.6, R * 1.1, rnd);
  } else if (k === 'temple') {
    const gy = y + R * 0.46;
    castShadow(g, x + R * 0.04, gy, R * 0.9, R * 0.12);
    const step = (w, yy, h) => { g.fillStyle = WALL; g.fillRect(x - w / 2, yy - h, w, h); g.fillStyle = WALL_D; g.fillRect(x + w * 0.2, yy - h, w * 0.3, h); g.strokeStyle = INK; g.lineWidth = 0.85; g.strokeRect(x - w / 2, yy - h, w, h); };
    step(R * 0.82, gy, R * 0.07); step(R * 0.7, gy - R * 0.07, R * 0.06);
    const base = gy - R * 0.13, ch = R * 0.36;
    for (let c = 0; c < 4; c++) { const cx = x - R * 0.24 + c * R * 0.16; g.fillStyle = c > 1 ? WALL_D : WALL; g.fillRect(cx - R * 0.035, base - ch, R * 0.07, ch); g.strokeRect(cx - R * 0.035, base - ch, R * 0.07, ch); }
    step(R * 0.68, base - ch, R * 0.06);
    const pb = base - ch - R * 0.06, ped = () => poly(g, [[x - R * 0.38, pb], [x, pb - R * 0.24], [x + R * 0.38, pb]]);
    ped(); g.fillStyle = GOLD; g.fill(); shadeRight(g, ped, x, GOLD_D); ped(); g.stroke();
    g.beginPath(); g.arc(x, pb - R * 0.08, R * 0.04, 0, TAU); g.fillStyle = WALL; g.fill(); g.stroke();
  } else if (k === 'lighthouse') {
    const gy = y + R * 0.5;
    const rock = () => poly(g, [[x - R * 0.34, gy], [x - R * 0.28, gy - R * 0.12], [x - R * 0.08, gy - R * 0.18], [x + R * 0.2, gy - R * 0.15], [x + R * 0.36, gy]]);
    castShadow(g, x + R * 0.06, gy, R * 0.8, R * 0.12);
    rock(); g.fillStyle = '#c4b9a4'; g.fill(); shadeRight(g, rock, x + R * 0.04, '#9d927d'); rock(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    const tb = gy - R * 0.15, w0 = R * 0.24, w1 = R * 0.15, h = R * 0.74, tt = tb - h;
    const body = () => poly(g, [[x - w0 / 2, tb], [x - w1 / 2, tt], [x + w1 / 2, tt], [x + w0 / 2, tb]]);
    body(); g.fillStyle = WALL; g.fill();
    g.save(); body(); g.clip(); g.fillStyle = WAX; g.fillRect(x - R, tb - h * 0.36, 2 * R, h * 0.18); g.fillRect(x - R, tb - h * 0.76, 2 * R, h * 0.18); g.fillStyle = 'rgba(60,40,20,0.2)'; g.fillRect(x + w1 * 0.15, tt - 2, R, h + 4); g.restore();
    body(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    g.fillStyle = WALL; g.fillRect(x - w1 * 0.8, tt - 2, w1 * 1.6, 2.4); g.strokeRect(x - w1 * 0.8, tt - 2, w1 * 1.6, 2.4);
    const ly = tt - 2 - R * 0.14;
    const gl = g.createRadialGradient(x, ly + R * 0.07, 0, x, ly + R * 0.07, R * 0.42); gl.addColorStop(0, 'rgba(255,220,130,0.7)'); gl.addColorStop(1, 'rgba(255,220,130,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, ly + R * 0.07, R * 0.42, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(201,162,79,0.8)'; g.lineWidth = 0.8; g.beginPath(); [-0.5, -0.2, 0.2, 0.5].forEach(a => { const dx = Math.cos(a) * (a < 0 ? -1 : 1); g.moveTo(x + dx * R * 0.14, ly + R * 0.07 + Math.sin(Math.abs(a)) * R * 0.04); g.lineTo(x + dx * R * 0.38, ly + R * 0.07 + Math.sin(Math.abs(a)) * R * 0.14 * (a < -0.3 || a > 0.3 ? 1 : -1)); }); g.stroke();
    g.fillStyle = '#f2c460'; g.fillRect(x - w1 * 0.4, ly, w1 * 0.8, R * 0.14); g.strokeStyle = INK; g.lineWidth = 0.8; g.strokeRect(x - w1 * 0.4, ly, w1 * 0.8, R * 0.14);
    g.beginPath(); g.moveTo(x - w1 * 0.6, ly); g.lineTo(x, ly - R * 0.12); g.lineTo(x + w1 * 0.6, ly); g.closePath(); g.fillStyle = '#3e3732'; g.fill(); g.stroke();
  } else if (k === 'windmill') {
    const gy = y + R * 0.48, top = gy - R * 0.5;
    castShadow(g, x + R * 0.05, gy, R * 0.5, R * 0.1);
    const body = () => poly(g, [[x - R * 0.15, gy], [x - R * 0.09, top], [x + R * 0.09, top], [x + R * 0.15, gy]]);
    body(); g.fillStyle = WALL; g.fill(); shadeRight(g, body, x + R * 0.03, WALL_D); body(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    g.beginPath(); g.moveTo(x - R * 0.12, top); g.lineTo(x, top - R * 0.13); g.lineTo(x + R * 0.12, top); g.closePath(); g.fillStyle = ROOFS[2][0]; g.fill(); g.stroke();
    g.fillStyle = INK; g.fillRect(x - R * 0.035, gy - R * 0.12, R * 0.07, R * 0.12);
    const hx = x, hy = top + R * 0.04, a0 = 0.35 + rnd() * 0.5;
    for (let b = 0; b < 4; b++) {
      g.save(); g.translate(hx, hy); g.rotate(a0 + b * Math.PI / 2);
      g.beginPath(); g.rect(R * 0.07, -R * 0.055, R * 0.36, R * 0.09); g.fillStyle = 'rgba(244,236,214,0.92)'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.44, 0); for (let t = 1; t < 4; t++) { g.moveTo(R * (0.07 + t * 0.09), -R * 0.055); g.lineTo(R * (0.07 + t * 0.09), R * 0.035); } g.lineWidth = 0.6; g.stroke();
      g.restore();
    }
    g.beginPath(); g.arc(hx, hy, 1.6, 0, TAU); g.fillStyle = INK; g.fill();
  } else if (k === 'mine') {
    const gy = y + R * 0.48;
    drawHill(g, x - R * 0.04, gy, R * 1.1, R * 0.5, { pal: HILLP[map && map.temp ? climate(map, s.i) : 'temperate'], rnd });
    g.fillStyle = '#1f1710'; g.fillRect(x - R * 0.13, gy - R * 0.32, R * 0.26, R * 0.32);
    const beam = (x0, y0, x1, y1) => { g.lineCap = 'butt'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = INK; g.lineWidth = 3.2; g.stroke(); g.strokeStyle = '#8a6136'; g.lineWidth = 1.8; g.stroke(); };
    beam(x - R * 0.14, gy, x - R * 0.14, gy - R * 0.36); beam(x + R * 0.14, gy, x + R * 0.14, gy - R * 0.36); beam(x - R * 0.2, gy - R * 0.34, x + R * 0.2, gy - R * 0.34);
    g.strokeStyle = INK; g.lineWidth = 0.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - R * 0.05, gy); g.lineTo(x + R * 0.1, gy + R * 0.22); g.moveTo(x + R * 0.06, gy); g.lineTo(x + R * 0.22, gy + R * 0.2); for (let t = 1; t < 4; t++) { g.moveTo(lerp(x - R * 0.06, x + R * 0.1, t / 4), lerp(gy, gy + R * 0.22, t / 4)); g.lineTo(lerp(x + R * 0.07, x + R * 0.23, t / 4), lerp(gy, gy + R * 0.2, t / 4)); } g.stroke();
    const cart = () => poly(g, [[x + R * 0.24, gy + R * 0.02], [x + R * 0.48, gy + R * 0.02], [x + R * 0.44, gy + R * 0.14], [x + R * 0.28, gy + R * 0.14]]);
    cart(); g.fillStyle = '#8a6136'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = '#7a7068'; g.beginPath(); g.arc(x + R * 0.32, gy + R * 0.01, R * 0.05, Math.PI, 0); g.arc(x + R * 0.41, gy + R * 0.0, R * 0.05, Math.PI, 0); g.fill();
    g.fillStyle = INK; [[0.31, 0.16], [0.42, 0.16]].forEach(([dx, dy]) => { g.beginPath(); g.arc(x + dx * R, gy + dy * R, 1.5, 0, TAU); g.fill(); });
  } else if (k === 'stones') {
    const cx = x, cy = y + R * 0.24, rx = R * 0.44, ry = R * 0.2, n = 7;
    g.beginPath(); g.ellipse(cx, cy, rx * 1.05, ry * 1.1, 0, 0, TAU); g.fillStyle = 'rgba(120,140,80,0.22)'; g.fill();
    const st = Array.from({ length: n }, (_, k2) => { const a = k2 / n * TAU + 0.2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, Math.sin(a)]; }).sort((a, b) => a[1] - b[1]);
    g.beginPath(); g.ellipse(cx, cy, R * 0.12, R * 0.05, 0, 0, TAU); g.fillStyle = STONE[0]; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
    for (const [px, py, d] of st) {
      const h = R * (0.24 + rnd() * 0.06) * (0.8 + 0.3 * (d + 1) / 2), w = R * 0.1;
      castShadow(g, px + w * 0.4, py, w * 1.6, w * 0.4);
      const sp = () => { g.beginPath(); g.moveTo(px - w / 2, py); g.lineTo(px - w / 2, py - h + w * 0.4); g.quadraticCurveTo(px - w / 2, py - h, px, py - h); g.quadraticCurveTo(px + w / 2, py - h, px + w / 2, py - h + w * 0.4); g.lineTo(px + w / 2, py); g.closePath(); };
      sp(); g.fillStyle = STONE[0]; g.fill(); shadeRight(g, sp, px + 0.4, STONE[1]); sp(); g.strokeStyle = INK; g.lineWidth = 0.85; g.stroke();
    }
  } else if (k === 'wreck') {
    const wy = y + R * 0.24;
    g.strokeStyle = '#3c5a5d'; g.globalAlpha = 0.55; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x, wy + 2, R * 0.55, R * 0.12, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(x, wy + 2, R * 0.36, R * 0.07, 0, 0, TAU); g.stroke(); g.globalAlpha = 1;
    g.save(); g.translate(x, wy); g.rotate(-0.32);
    const hull = () => poly(g, [[-R * 0.48, -R * 0.06], [R * 0.16, -R * 0.06], [R * 0.1, R * 0.01], [R * 0.22, R * 0.05], [R * 0.12, R * 0.12], [-R * 0.3, R * 0.14]]);
    hull(); g.fillStyle = '#6e4a2c'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    g.lineWidth = 1; g.beginPath(); for (let t = 0; t < 3; t++) { const rx2 = R * (0.12 + t * 0.07); g.moveTo(rx2, -R * 0.04); g.quadraticCurveTo(rx2 + R * 0.05, -R * 0.16, rx2 + R * 0.02, -R * 0.24); } g.stroke();
    g.lineWidth = 1.2; g.beginPath(); g.moveTo(-R * 0.16, -R * 0.06); g.lineTo(-R * 0.12, -R * 0.62); g.stroke();
    poly(g, [[-R * 0.14, -R * 0.56], [R * 0.08, -R * 0.52], [R * 0.06, -R * 0.36], [R * 0.0, -R * 0.4], [-R * 0.04, -R * 0.3], [-R * 0.08, -R * 0.36], [-R * 0.13, -R * 0.3]]);
    g.fillStyle = 'rgba(240,230,203,0.92)'; g.fill(); g.lineWidth = 0.6; g.stroke();
    g.restore();
    g.strokeStyle = '#3c5a5d'; g.globalAlpha = 0.7; g.lineWidth = 0.9; g.beginPath(); for (let t = 0; t < 3; t++) { const qx = x - R * 0.36 + t * R * 0.3; g.moveTo(qx - R * 0.1, wy + R * 0.12); g.quadraticCurveTo(qx, wy + R * 0.07, qx + R * 0.1, wy + R * 0.12); } g.stroke(); g.globalAlpha = 1;
  }
}

export { banner, church, drawSettlement, house };
