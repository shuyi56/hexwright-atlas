import { CX, CY, R, TAU, hexDist } from '../core/geometry.js';
import { church, house } from './settlements.js';
import { corrHit, fitIcon } from './rivers-roads.js';
import { HILLP, INK, MT, ROOFS, climate } from './palette.js';
import { drawHill, drawMountain, drawRock } from './relief.js';
import { drawPalm, drawPine, drawSnag, drawTree } from './trees.js';
import { drawBones, drawDune, drawFarm, drawMesa, drawPool, drawReeds, tuft } from './ground.js';

/* ---------- terrain dispatcher ---------- */
const FPTS = [[-0.42, -0.08], [0.06, -0.36], [0.46, -0.02], [-0.16, 0.34], [0.3, 0.42], [-0.55, 0.42], [0.62, 0.38]];
// a suburb hex: lanes of cottages thickening toward the walls, kitchen gardens and orchards between, a parish church
// in the first ring of the bigger places; every building stands clear of the roads and rivers that cross it
function drawSprawl(g, i, map, rnd) {
  const s = map.settle[map.sprawl[i]], x = CX[i], y = CY[i], cx = CX[s.i], cy = CY[s.i];
  const dx = cx - x, dy = cy - y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
  const big = s.kind === 'capital' ? 2 : s.kind === 'city' ? 1 : 0, ring1 = hexDist(i, s.i) === 1;
  const cl = climate(map, i), slate = cl === 'cold' || big === 2;
  const roofs = slate ? [ROOFS[1], ROOFS[0], ROOFS[1], ROOFS[2]] : [ROOFS[0], ROOFS[2], ROOFS[0], ROOFS[1]];
  // kitchen gardens and paddocks: flat, so they go down first
  const plotCols = cl === 'arid' ? ['rgba(214,190,120,0.65)', 'rgba(190,170,110,0.6)'] : ['rgba(168,188,104,0.62)', 'rgba(204,190,112,0.6)', 'rgba(150,170,96,0.6)'];
  for (let k = 0; k < 5; k++) {
    const a = rnd() * TAU, r = R * (0.25 + rnd() * 0.5), px = x + Math.cos(a) * r - ux * R * 0.12, py = y + Math.sin(a) * r * 0.8 - uy * R * 0.12, w = R * (0.22 + rnd() * 0.16), h = R * (0.12 + rnd() * 0.08);
    if (corrHit(px, py + h / 2, w, h, 'box')) continue;
    g.save(); g.translate(px, py); g.rotate((rnd() - 0.5) * 0.5);
    g.fillStyle = plotCols[k % plotCols.length]; g.fillRect(-w / 2, -h / 2, w, h); g.strokeStyle = 'rgba(80,96,48,0.55)'; g.lineWidth = 0.5; g.strokeRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = 'rgba(110,90,50,0.35)'; g.beginPath(); for (let f = 0.25; f < 1; f += 0.25) { g.moveTo(-w / 2 + w * f, -h / 2); g.lineTo(-w / 2 + w * f, h / 2); } g.stroke();
    g.restore();
  }
  // lanes running out from the gates: the suburb grows along them
  const items = [], nx = -uy, ny = ux, lanes = ring1 ? (big ? 2 : 1) : 1;
  for (let L2 = 0; L2 < lanes; L2++) {
    const off = (L2 - (lanes - 1) / 2) * R * 0.42 + (rnd() - 0.5) * R * 0.12, bend = (rnd() - 0.5) * R * 0.5;
    const a = [x + ux * R * 0.85 + nx * off * 0.6, y + uy * R * 0.85 + ny * off * 0.6], c = [x + nx * (off + bend), y + ny * (off + bend)], b = [x - ux * R * (0.45 + rnd() * 0.2) + nx * off * 1.3, y - uy * R * (0.45 + rnd() * 0.2) + ny * off * 1.3];
    const at = t => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
    g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], b[0], b[1]);
    g.strokeStyle = 'rgba(120,92,58,0.45)'; g.lineWidth = 2.4; g.stroke(); g.strokeStyle = 'rgba(222,206,170,0.95)'; g.lineWidth = 1.5; g.stroke();
    // houses face the lane on both sides, close-packed by the walls, spacing out toward the fields
    for (let t = 0.06; t < 0.98; t += 0.1 + t * 0.12) for (const sd of [-1, 1]) {
      if (rnd() < 0.12 + t * 0.35) continue;
      const p = at(t), q = at(Math.min(1, t + 0.02)), tx = q[0] - p[0], ty = q[1] - p[1], tl = Math.hypot(tx, ty) || 1, side = R * (0.14 + rnd() * 0.05);
      items.push({ x: p[0] - ty / tl * side * sd, y: p[1] + tx / tl * side * sd + R * 0.08, s: R * ((ring1 ? 0.21 : 0.18) - t * 0.05 + rnd() * 0.04) * (1 + big * 0.05), roof: roofs[Math.floor(rnd() * roofs.length)], chim: rnd() < 0.5 });
    }
  }
  // a scatter of cottages and barns between the lanes
  for (let k = 0; k < 2 + big; k++) { const a = rnd() * TAU, r = R * (0.3 + rnd() * 0.35); items.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.75 + R * 0.08, s: R * (0.15 + rnd() * 0.04), roof: roofs[Math.floor(rnd() * roofs.length)], chim: rnd() < 0.3 }); }
  if (ring1 && big && (s.sprawl || []).indexOf(i) === 0) items.push({ church: true, x: x - ux * R * 0.15, y: y - uy * R * 0.1 + R * 0.2, s: R * 0.3 });
  const trees = 2 + Math.floor(rnd() * 3);
  for (let k = 0; k < trees; k++) { const a = rnd() * TAU, r = R * (0.4 + rnd() * 0.3); items.push({ tree: true, x: x + Math.cos(a) * r - ux * R * 0.2, y: y + Math.sin(a) * r * 0.7 - uy * R * 0.2 + R * 0.1, s: R * (0.2 + rnd() * 0.06) }); }
  items.sort((a, b) => a.y - b.y);
  const placed = [];
  for (const it of items) {
    const w = it.church ? it.s * 1.1 : it.tree ? it.s * 1.4 : it.s * 1.05, h = it.church ? it.s * 1.6 : it.tree ? it.s * 1.5 : it.s * 1.15;
    const f = fitIcon(it.x, it.y, w, h, it.tree ? 'tree' : 'box', 0.6, [1, 0.85]); if (!f) continue;
    if (placed.some(p => Math.abs(p[0] - f[0]) < (p[2] + w) * 0.42 && Math.abs(p[1] - f[1]) < R * 0.08)) continue;   // no two roofs on one spot
    placed.push([f[0], f[1], w]);
    if (it.church) church(g, f[0], f[1], it.s * f[2], ROOFS[1]);
    else if (it.tree) drawTree(g, f[0], f[1], it.s * f[2], rnd() < 0.6 ? 'oak' : 'bush', rnd);
    else house(g, f[0], f[1], it.s * f[2], it.roof, it.chim);
  }
}
function drawTerrainIcon(g, b, i, rnd, map) {
  const x = CX[i], y = CY[i], cl = climate(map, i);
  // place an upright drawing only where it stands clear of roads and rivers
  const put = (px, by, w, h, shape, draw, sc) => { const f = fitIcon(px, by, w, h, shape, 1, sc); if (f) draw(f[0], f[1], f[2]); };
  if (map.farm && map.farm[i]) { drawFarm(g, x, y, rnd); return; }
  if (b === 'mountain' || b === 'peak') {
    const snow = b === 'peak', pal = MT[cl];
    const MS = [1, 0.8, 0.64, 0.5];
    if (rnd() < 0.6) { const w = R * 0.92, h = R * (snow ? 0.95 : 0.7); put(x - R * 0.46, y + R * 0.06, w, h, 'tri', (px, py, k) => drawMountain(g, px, py, w * k, h * k, { snow, rnd, pal }), MS); }
    if (rnd() < 0.4) { const w = R * 0.82, h = R * (snow ? 0.85 : 0.6); put(x + R * 0.5, y, w, h, 'tri', (px, py, k) => drawMountain(g, px, py, w * k, h * k, { snow, rnd, pal }), MS); }
    { const mx = x + (rnd() - 0.5) * R * 0.15, w = R * (1.4 + rnd() * 0.25), h = R * ((snow ? 1.4 : 1.05) + rnd() * 0.25), twin = rnd() < 0.35; put(mx, y + R * 0.5, w, h, 'tri', (px, py, k) => drawMountain(g, px, py, w * k, h * k, { snow, rnd, pal, twin }), MS); }
    if (!snow && cl === 'temperate' && rnd() < 0.4) { for (const [dx, dy, sz] of [[-0.58, 0.66, 0.2], [0.62, 0.6, 0.18]]) { const s2 = R * sz; put(x + R * dx, y + R * dy, s2, s2 * 2.1, 'pine', (px, py, k) => drawPine(g, px, py, s2 * k, rnd)); } }
  } else if (b === 'hills') {
    const pal = HILLP[cl], v = rnd();
    const hill = (hx, hy, w, h, kind) => put(hx, hy, w, h + (kind === 'tree' ? R * 0.38 : kind === 'rock' ? R * 0.12 : 0), 'dome', (px, py, k) => drawHill(g, px, py, w * k, h * k, { pal, rnd, kind: k < 0.75 ? '' : kind }), [1, 0.8, 0.64, 0.5]);
    if (rnd() < 0.5) hill(x - R * 0.05, y - R * 0.14, R * 0.66, R * 0.3, '');
    hill(x - R * 0.32, y + R * 0.22, R * 0.82, R * 0.42, v < 0.28 ? 'rock' : '');
    hill(x + R * 0.3, y + R * 0.44, R * 0.74, R * 0.36, v > 0.72 && cl !== 'arid' ? 'tree' : '');
  } else if (b === 'forest' || b === 'deepwood' || b === 'taiga') {
    const n = b === 'deepwood' ? 7 : b === 'taiga' ? 6 : 4 + (rnd() < 0.6 ? 1 : 0);
    const pts = FPTS.slice(0, n).map(p => [x + (p[0] + (rnd() - 0.5) * 0.14) * R, y + (p[1] + (rnd() - 0.5) * 0.12) * R]).sort((a, c) => a[1] - c[1]);
    const cold = map.temp[i] < 0.36, snowy = map.temp[i] < 0.2, autumn = rnd() < 0.16 ? (rnd() < 0.5 ? 'autumn1' : 'autumn2') : null;
    for (const [px, py] of pts) {
      if (b === 'taiga' || (cold && rnd() < 0.55) || (b === 'deepwood' && rnd() < 0.18)) { const s2 = R * (0.3 + rnd() * 0.08) * (b === 'deepwood' ? 1.15 : 1); put(px, py, s2, s2 * 2.1, 'pine', (qx, qy, k) => drawPine(g, qx, qy, s2 * k, rnd, snowy), [1, 0.8]); continue; }
      let sp = b === 'deepwood' ? 'deep' : 'oak'; const r2 = rnd();
      if (b === 'forest') { if (r2 < 0.14) sp = 'poplar'; else if (r2 < 0.25) sp = 'birch'; else if (r2 < 0.33) sp = 'bush'; }
      if (autumn && sp !== 'birch' && rnd() < 0.55) sp = autumn;
      const s2 = R * (b === 'deepwood' ? 0.42 : 0.36) * (0.88 + rnd() * 0.24); put(px, py, s2 * 1.45, s2 * 1.5, 'tree', (qx, qy, k) => drawTree(g, qx, qy, s2 * k, sp, rnd), [1, 0.8]);
    }
  } else if (b === 'grass') {
    const v = rnd(), spot = () => [x + (rnd() - 0.5) * R * 1.0, y + (rnd() - 0.3) * R * 0.85];
    if (v < 0.4) { const k = 2 + (rnd() < 0.4 ? 1 : 0); for (let t = 0; t < k; t++) { const [px, py] = spot(); tuft(g, px, py, R * 0.13); } }
    else if (v < 0.56) { for (let t = 0; t < 2; t++) { const [px, py] = spot(); tuft(g, px, py, R * 0.13); } const cols = ['#b8483a', '#f6efdc', '#d9b44a', '#7a6aa8']; for (let t = 0; t < 7; t++) { const [px, py] = spot(); g.beginPath(); g.arc(px, py, 1.1, 0, TAU); g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.fill(); } }
    else if (v < 0.68) { const [px, py] = spot(), sp = rnd() < 0.55 ? 'oak' : 'bush'; const s2 = R * 0.32; put(px, py + R * 0.1, s2 * 1.45, s2 * 1.5, 'tree', (qx, qy, k) => drawTree(g, qx, qy, s2 * k, sp, rnd)); const [qx, qy] = spot(); tuft(g, qx, qy, R * 0.12); }
    else if (v < 0.75) { const [px, py] = spot(); put(px, py, R * 0.2, R * 0.15, 'dome', (qx, qy, k) => drawRock(g, qx, qy, R * 0.2 * k, rnd)); tuft(g, px - R * 0.3, py + R * 0.05, R * 0.11); }
    else if (v < 0.8 && map.temp[i] > 0.6) { const s2 = R * 0.38; put(x + R * 0.1, y + R * 0.35, s2 * 1.3, s2 * 1.6, 'tree', (qx, qy, k) => drawPalm(g, qx, qy, s2 * k, rnd)); }
  } else if (b === 'desert') {
    const v = rnd();
    const dune = (dx, dy, w, h) => put(dx, dy, w, h, 'dome', (qx, qy, k) => drawDune(g, qx, qy, w * k, h * k), [1, 0.8, 0.64]);
    const palm = (dx, dy, s2) => put(dx, dy, s2 * 1.3, s2 * 1.6, 'tree', (qx, qy, k) => drawPalm(g, qx, qy, s2 * k, rnd));
    if (v < 0.08) { put(x, y + R * 0.31, R * 0.72, R * 0.32, 'dome', (qx, qy, k) => drawPool(g, qx, qy - R * 0.16 * k, R * 0.36 * k, R * 0.16 * k)); palm(x - R * 0.3, y + R * 0.1, R * 0.36); palm(x + R * 0.28, y + R * 0.3, R * 0.32); }
    else if (v < 0.26) { put(x - R * 0.12, y + R * 0.3, R * 0.7, R * 0.45, 'box', (qx, qy, k) => drawMesa(g, qx, qy, R * 0.7 * k, R * 0.45 * k, rnd), [1, 0.8, 0.64]); dune(x + R * 0.35, y + R * 0.5, R * 0.5, R * 0.2); }
    else if (v < 0.33) { dune(x - R * 0.2, y - R * 0.1, R * 0.7, R * 0.28); put(x + R * 0.05, y + R * 0.42, R * 0.8, R * 0.12, 'box', (qx, qy, k) => drawBones(g, qx, qy, R * 0.4 * k)); }
    else { dune(x - R * 0.28, y - R * 0.02, R * 0.72, R * 0.3); dune(x + R * 0.24, y + R * 0.38, R * 0.66, R * 0.26); g.fillStyle = '#8a6a3a'; g.globalAlpha = 0.6; for (let t = 0; t < 5; t++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * R * 1.1, y + (rnd() - 0.5) * R * 0.9, 0.7, 0, TAU); g.fill(); } g.globalAlpha = 1; }
  } else if (b === 'swamp') {
    const pool = (px, py, rx, ry) => put(px, py + ry, rx * 2, ry * 2, 'dome', (qx, qy, k) => drawPool(g, qx, qy - ry * k, rx * k, ry * k), [1, 0.75]);
    pool(x - R * 0.22, y - R * 0.08, R * 0.26, R * 0.1);
    if (rnd() < 0.7) pool(x + R * 0.3, y + R * 0.3, R * 0.2, R * 0.08);
    g.fillStyle = '#6f8a4c'; for (let t = 0; t < 3; t++) { g.beginPath(); g.ellipse(x - R * 0.3 + t * R * 0.09, y - R * 0.08 + (t % 2) * 2, 1.8, 1.1, 0, 0, TAU); g.fill(); }
    g.strokeStyle = '#3f5f5e'; g.lineWidth = 0.8; g.globalAlpha = 0.6; g.beginPath(); for (let t = 0; t < 2; t++) { const px = x + (rnd() - 0.5) * R * 0.9, py = y + (rnd() - 0.2) * R * 0.8; g.moveTo(px - 5, py); g.lineTo(px + 5, py); } g.stroke(); g.globalAlpha = 1;
    const reeds = (px, py) => put(px, py, R * 0.3, R * 0.46, 'box', (qx, qy) => drawReeds(g, qx, qy), [1]);
    reeds(x + R * 0.05, y + R * 0.2);
    if (rnd() < 0.45) put(x + R * 0.38, y + R * 0.02, R * 0.28, R * 0.44, 'box', (qx, qy, k) => drawSnag(g, qx, qy, R * 0.4 * k)); else reeds(x - R * 0.4, y + R * 0.35);
  } else if (b === 'tundra') {
    g.lineCap = 'round';
    for (let t = 0; t < 2; t++) { const px = x + (t ? R * 0.2 : -R * 0.28), py = y + (t ? R * 0.35 : -R * 0.05); g.beginPath(); g.moveTo(px - R * 0.25, py); g.quadraticCurveTo(px, py - R * 0.14, px + R * 0.25, py); g.strokeStyle = '#8a9294'; g.lineWidth = 1.6; g.stroke(); g.strokeStyle = '#fbfaf4'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(px - R * 0.22, py - 1.2); g.quadraticCurveTo(px, py - R * 0.15, px + R * 0.2, py - 1.4); g.stroke(); }
    if (rnd() < 0.45) put(x + R * 0.3, y - R * 0.1, R * 0.17, R * 0.13, 'dome', (qx, qy, k) => drawRock(g, qx, qy, R * 0.17 * k, rnd));
    if (rnd() < 0.3) { const s2 = R * 0.2; put(x - R * 0.35, y + R * 0.45, s2, s2 * 2.1, 'pine', (qx, qy, k) => drawPine(g, qx, qy, s2 * k, rnd, true)); }
  } else if (b === 'deep' || b === 'sea' || b === 'shallow') {
    if (map.ornAt && map.ornAt.has(i)) return;
    const v = rnd(), px = x + (rnd() - 0.5) * R * 0.6, py = y + (rnd() - 0.5) * R * 0.5;
    g.lineCap = 'round';
    if ((b === 'deep' && v < 0.2) || (b === 'sea' && v < 0.09)) {
      g.strokeStyle = '#3c5a5d'; g.lineWidth = 0.9; g.globalAlpha = 0.55; g.beginPath();
      g.moveTo(px - 9, py + 1); g.quadraticCurveTo(px - 5, py - 5, px - 1, py - 1); g.quadraticCurveTo(px - 2.5, py - 3.5, px - 4.5, py - 2);
      g.moveTo(px - 1, py - 1); g.quadraticCurveTo(px + 3, py - 4, px + 8, py + 1);
      g.moveTo(px - 3, py + 5); g.quadraticCurveTo(px + 1, py + 1.5, px + 5, py + 5);
      g.stroke(); g.globalAlpha = 1;
    } else if (b === 'deep' && v < 0.26) {
      g.strokeStyle = '#f2eee0'; g.lineWidth = 1; g.globalAlpha = 0.7; g.beginPath(); for (let t = 0; t < 3; t++) { const qx = px + t * 6 - 6, qy = py + (t % 2) * 4; g.moveTo(qx - 2.5, qy); g.quadraticCurveTo(qx, qy - 2.5, qx + 2.5, qy); } g.stroke(); g.globalAlpha = 1;
    } else if (b === 'shallow' && v < 0.07) {
      for (let t = 0; t < 3; t++) drawRock(g, px + t * R * 0.14 - R * 0.14, py + (t % 2) * 3, R * 0.1, rnd);
    } else if (b === 'shallow' && v < 0.12) {
      g.beginPath(); g.ellipse(px, py, R * 0.32, R * 0.07, -0.2, 0, TAU); g.fillStyle = '#e3d3a4'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.globalAlpha = 0.6; g.stroke(); g.globalAlpha = 1;
    }
  }
}

export { drawSprawl, drawTerrainIcon };
