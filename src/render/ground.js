import { R, TAU, hexPath } from '../core/geometry.js';
import { INK, castShadow, poly, shadeRight } from './palette.js';
import { drawTree } from './trees.js';

/* ---------- small ground details ---------- */
function tuft(g, px, py, s, a) { g.strokeStyle = INK; g.lineWidth = 0.7; g.globalAlpha = a || 0.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(px, py); g.lineTo(px - s * 0.6, py - s); g.moveTo(px, py); g.lineTo(px, py - s * 1.3); g.moveTo(px, py); g.lineTo(px + s * 0.6, py - s); g.stroke(); g.globalAlpha = 1; }
function drawDune(g, x, y, w, h) {
  const C = [x, y - h * 0.8], E = [x + w / 2, y - h * 0.1];
  g.beginPath(); g.moveTo(C[0], C[1]); g.quadraticCurveTo(x + w * 0.3, y - h * 0.7, E[0], E[1]); g.quadraticCurveTo(x + w * 0.18, y + h * 0.05, x - w * 0.1, y - h * 0.25); g.closePath();
  g.fillStyle = 'rgba(190,150,90,0.55)'; g.fill();
  g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x - w * 0.25, y - h * 0.9, C[0], C[1]); g.quadraticCurveTo(x + w * 0.3, y - h * 0.7, E[0], E[1]);
  g.strokeStyle = '#7a5a30'; g.lineWidth = 0.9; g.lineCap = 'round'; g.stroke();
}
function drawMesa(g, x, by, w, h, rnd) {
  const pts = [[x - w / 2, by], [x - w * 0.36, by - h * 0.7], [x - w * 0.3, by - h], [x + w * 0.28, by - h], [x + w * 0.34, by - h * 0.62], [x + w / 2, by]];
  castShadow(g, x + w * 0.12, by, w * 1.1, h * 0.2);
  poly(g, pts); g.fillStyle = '#dcae78'; g.fill();
  g.save(); poly(g, pts); g.clip(); g.fillStyle = '#a9764b'; g.fillRect(x + w * 0.12, by - h - 2, w, h + 4);
  g.strokeStyle = INK; g.globalAlpha = 0.4; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - w, by - h * 0.36); g.lineTo(x + w, by - h * 0.4); g.moveTo(x - w, by - h * 0.68); g.lineTo(x + w, by - h * 0.7); g.stroke(); g.globalAlpha = 1; g.restore();
  poly(g, pts); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
  g.beginPath(); g.ellipse(x - w * 0.01, by - h, w * 0.29, h * 0.07, 0, 0, TAU); g.fillStyle = '#e8c495'; g.fill(); g.lineWidth = 0.7; g.stroke();
}
function drawBones(g, x, y, s) {
  const draw = () => { g.beginPath(); g.moveTo(x - s * 0.5, y); g.quadraticCurveTo(x, y - s * 0.12, x + s * 0.5, y); for (let k = 0; k < 4; k++) { const bx = x - s * 0.3 + k * s * 0.2; g.moveTo(bx, y - s * 0.05); g.quadraticCurveTo(bx + s * 0.12, y - s * 0.4, bx + s * 0.02, y - s * 0.55); } };
  g.lineCap = 'round'; draw(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke(); draw(); g.strokeStyle = '#f6f0e0'; g.lineWidth = 1.1; g.stroke();
  g.beginPath(); g.ellipse(x + s * 0.62, y - s * 0.06, s * 0.13, s * 0.1, 0, 0, TAU); g.fillStyle = '#f6f0e0'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
}
function drawPool(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = '#86a8a3'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke(); g.strokeStyle = 'rgba(240,240,225,0.7)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - rx * 0.45, y - ry * 0.15); g.lineTo(x + rx * 0.1, y - ry * 0.15); g.stroke(); }
function drawReeds(g, px, py) {
  g.strokeStyle = INK; g.lineWidth = 0.75; g.lineCap = 'round'; g.beginPath();
  g.moveTo(px, py); g.lineTo(px - R * 0.1, py - R * 0.32); g.moveTo(px, py); g.lineTo(px, py - R * 0.4); g.moveTo(px, py); g.lineTo(px + R * 0.1, py - R * 0.3); g.moveTo(px, py); g.lineTo(px + R * 0.17, py - R * 0.18); g.stroke();
  g.fillStyle = '#5a4128'; g.beginPath(); g.ellipse(px, py - R * 0.42, 1.3, 2.6, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(px - R * 0.1, py - R * 0.34, 1.1, 2.2, -0.3, 0, TAU); g.fill();
}
function drawFarm(g, x, y, rnd) {
  g.save(); g.beginPath(); hexPath(g, x, y, R * 0.88); g.clip();
  g.translate(x, y); g.rotate((rnd() - 0.5) * 1.1);
  const cw = R * 0.56, chh = R * 0.4, tints = ['rgba(224,196,108,0.78)', 'rgba(176,186,104,0.72)', 'rgba(206,168,108,0.72)', 'rgba(200,206,128,0.62)'];
  const cells = [];
  for (let gx = -3; gx <= 2; gx++) for (let gy = -3; gy <= 2; gy++) cells.push([gx * cw + (gy & 1 ? cw * 0.35 : 0), gy * chh]);
  g.lineWidth = 0.5;
  for (const [ox, oy] of cells) {
    g.fillStyle = tints[Math.floor(rnd() * tints.length)]; g.fillRect(ox, oy, cw, chh);
    if (rnd() < 0.65) { g.strokeStyle = 'rgba(110,85,40,0.33)'; g.beginPath(); const v = rnd() < 0.5; for (let f = 1; f < 5; f++) { if (v) { g.moveTo(ox + cw * f / 5, oy + 1); g.lineTo(ox + cw * f / 5, oy + chh - 1); } else { g.moveTo(ox + 1, oy + chh * f / 5); g.lineTo(ox + cw - 1, oy + chh * f / 5); } } g.stroke(); }
  }
  g.strokeStyle = 'rgba(78,98,48,0.6)'; g.lineWidth = 1; g.beginPath(); for (const [ox, oy] of cells) g.rect(ox, oy, cw, chh); g.stroke();
  g.restore();
  /* two separate draws: the haystack roll only happens when the tree roll fails */
  const tree = rnd() < 0.4;
  if (tree) drawTree(g, x + (rnd() - 0.5) * R * 0.7, y + (rnd() - 0.2) * R * 0.5, R * 0.26, rnd() < 0.5 ? 'oak' : 'bush', rnd);
  else if (rnd() < 0.4) drawHaystack(g, x + (rnd() - 0.5) * R * 0.6, y + (rnd() - 0.2) * R * 0.5, R * 0.14);
}
function drawHaystack(g, x, y, s) {
  castShadow(g, x + s * 0.2, y, s * 1.4, s * 0.35);
  const p = () => { g.beginPath(); g.moveTo(x - s * 0.6, y); g.bezierCurveTo(x - s * 0.6, y - s * 1.3, x + s * 0.6, y - s * 1.3, x + s * 0.6, y); g.closePath(); };
  p(); g.fillStyle = '#dcb862'; g.fill(); shadeRight(g, p, x + s * 0.1, '#b48f42');
  p(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
}

export { drawBones, drawDune, drawFarm, drawHaystack, drawMesa, drawPool, drawReeds, tuft };
