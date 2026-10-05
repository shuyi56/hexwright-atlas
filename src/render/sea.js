import { TAU } from '../core/geometry.js';
import { GOLD, INK, WAX, castShadow, shadeRight } from './palette.js';

/* ---------- sea ornaments ---------- */
function drawShip(g, x, y, s, flip) {
  g.save(); g.translate(x, y); if (flip) g.scale(-1, 1);
  g.strokeStyle = '#3c5a5d'; g.globalAlpha = 0.5; g.lineWidth = 0.8; g.lineCap = 'round'; g.beginPath();
  g.moveTo(-s * 0.7, s * 0.28); g.quadraticCurveTo(-s * 1.1, s * 0.3, -s * 1.4, s * 0.42); g.moveTo(-s * 0.6, s * 0.36); g.quadraticCurveTo(-s * 0.95, s * 0.45, -s * 1.2, s * 0.6);
  g.stroke(); g.globalAlpha = 1;
  castShadow(g, 0, s * 0.33, s * 1.3, s * 0.12);
  const hull = () => { g.beginPath(); g.moveTo(-s * 0.68, -s * 0.08); g.lineTo(-s * 0.5, -s * 0.02); g.lineTo(s * 0.52, -s * 0.02); g.lineTo(s * 0.72, -s * 0.14); g.quadraticCurveTo(s * 0.55, s * 0.28, s * 0.25, s * 0.3); g.lineTo(-s * 0.38, s * 0.3); g.quadraticCurveTo(-s * 0.6, s * 0.24, -s * 0.68, -s * 0.08); g.closePath(); };
  hull(); g.fillStyle = '#86593a'; g.fill();
  g.save(); hull(); g.clip(); g.fillStyle = '#6a4329'; g.fillRect(-s, s * 0.14, 2 * s, s); g.strokeStyle = GOLD; g.lineWidth = 1; g.beginPath(); g.moveTo(-s, s * 0.06); g.lineTo(s, s * 0.06); g.stroke(); g.restore();
  hull(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.fillStyle = INK; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(-s * 0.2 + k * s * 0.22, s * 0.11, 1.2, 0, TAU); g.fill(); }
  const sail = (mx, top, bot, sw) => {
    const p = () => { g.beginPath(); g.moveTo(mx - sw / 2, top); g.lineTo(mx + sw / 2, top); g.quadraticCurveTo(mx + sw / 2 + s * 0.1, (top + bot) / 2, mx + sw / 2, bot); g.lineTo(mx - sw / 2, bot); g.quadraticCurveTo(mx - sw / 2 + s * 0.1, (top + bot) / 2, mx - sw / 2, top); g.closePath(); };
    p(); g.fillStyle = '#f4ead0'; g.fill(); shadeRight(g, p, mx + sw * 0.15, '#dccca4'); p(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
  };
  g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-s * 0.18, -s * 0.02); g.lineTo(-s * 0.18, -s * 1.05); g.moveTo(s * 0.26, -s * 0.02); g.lineTo(s * 0.26, -s * 0.88); g.moveTo(s * 0.72, -s * 0.14); g.lineTo(s * 0.98, -s * 0.36); g.stroke();
  sail(-s * 0.18, -s * 0.95, -s * 0.58, s * 0.46); sail(-s * 0.18, -s * 0.54, -s * 0.12, s * 0.56);
  sail(s * 0.26, -s * 0.8, -s * 0.48, s * 0.38); sail(s * 0.26, -s * 0.45, -s * 0.1, s * 0.46);
  g.beginPath(); g.moveTo(s * 0.72, -s * 0.14); g.lineTo(s * 0.98, -s * 0.36); g.lineTo(s * 0.6, -s * 0.5); g.closePath(); g.fillStyle = '#f4ead0'; g.fill(); g.lineWidth = 0.7; g.stroke();
  g.beginPath(); g.moveTo(-s * 0.18, -s * 1.05); g.lineTo(s * 0.1, -s * 1.0); g.lineTo(-s * 0.18, -s * 0.95); g.closePath(); g.fillStyle = WAX; g.fill(); g.stroke();
  g.strokeStyle = '#3c5a5d'; g.globalAlpha = 0.65; g.lineWidth = 0.9; g.beginPath();
  for (let k = 0; k < 4; k++) { const wx = -s * 0.55 + k * s * 0.38; g.moveTo(wx - s * 0.14, s * 0.32); g.quadraticCurveTo(wx, s * 0.25, wx + s * 0.14, s * 0.32); }
  g.stroke(); g.globalAlpha = 1; g.restore();
}
function drawSerpent(g, x, y, s, flip) {
  g.save(); g.translate(x, y); if (flip) g.scale(-1, 1);
  const body = '#4f7563', belly = '#c9d4a8';
  const ripple = (cx, w) => { g.strokeStyle = '#3c5a5d'; g.globalAlpha = 0.55; g.lineWidth = 0.8; g.beginPath(); g.ellipse(cx, 1, w, w * 0.22, 0, 0, TAU); g.stroke(); g.globalAlpha = 1; };
  const arch = (cx, w, h) => { g.beginPath(); g.moveTo(cx - w / 2, 0); g.bezierCurveTo(cx - w / 2, -h * 1.3, cx + w / 2, -h * 1.3, cx + w / 2, 0); };
  const thick = (fn, wd) => { g.lineCap = 'round'; fn(); g.strokeStyle = INK; g.lineWidth = wd + 2; g.stroke(); fn(); g.strokeStyle = body; g.lineWidth = wd; g.stroke(); fn(); g.strokeStyle = belly; g.globalAlpha = 0.5; g.lineWidth = wd * 0.25; g.stroke(); g.globalAlpha = 1; };
  const humps = [[-s * 0.55, s * 0.28, s * 0.2], [-s * 0.12, s * 0.34, s * 0.26]];
  ripple(-s * 0.95, s * 0.08);
  g.beginPath(); g.moveTo(-s * 0.95, 0); g.quadraticCurveTo(-s * 1.0, -s * 0.2, -s * 0.86, -s * 0.22); g.strokeStyle = INK; g.lineWidth = 3; g.lineCap = 'round'; g.stroke(); g.strokeStyle = body; g.lineWidth = 1.8; g.stroke();
  humps.forEach(([cx, w, h]) => {
    ripple(cx - w / 2, s * 0.07); ripple(cx + w / 2, s * 0.07);
    thick(() => arch(cx, w, h), s * 0.11);
    g.fillStyle = WAX; g.strokeStyle = INK; g.lineWidth = 0.6;
    for (let k = -1; k <= 1; k++) { const fx = cx + k * w * 0.2, fy = -h * 0.95 + Math.abs(k) * h * 0.12; g.beginPath(); g.moveTo(fx - 2.5, fy); g.lineTo(fx + 1, fy - s * 0.1); g.lineTo(fx + 2.5, fy + 0.5); g.closePath(); g.fill(); g.stroke(); }
  });
  ripple(s * 0.4, s * 0.09);
  thick(() => { g.beginPath(); g.moveTo(s * 0.4, 0); g.bezierCurveTo(s * 0.42, -s * 0.4, s * 0.62, -s * 0.55, s * 0.78, -s * 0.5); }, s * 0.11);
  const head = () => { g.beginPath(); g.moveTo(s * 0.7, -s * 0.58); g.quadraticCurveTo(s * 0.86, -s * 0.66, s * 1.02, -s * 0.52); g.lineTo(s * 0.98, -s * 0.46); g.quadraticCurveTo(s * 0.86, -s * 0.42, s * 0.72, -s * 0.42); g.closePath(); };
  head(); g.fillStyle = body; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.moveTo(s * 0.74, -s * 0.6); g.lineTo(s * 0.66, -s * 0.74); g.lineTo(s * 0.8, -s * 0.62); g.closePath(); g.fillStyle = WAX; g.fill(); g.lineWidth = 0.6; g.stroke();
  g.beginPath(); g.arc(s * 0.86, -s * 0.555, 1.3, 0, TAU); g.fillStyle = GOLD; g.fill();
  g.strokeStyle = WAX; g.lineWidth = 0.8; g.beginPath(); g.moveTo(s * 1.0, -s * 0.48); g.lineTo(s * 1.1, -s * 0.46); g.lineTo(s * 1.14, -s * 0.5); g.moveTo(s * 1.1, -s * 0.46); g.lineTo(s * 1.14, -s * 0.42); g.stroke();
  g.restore();
}

export { drawSerpent, drawShip };
