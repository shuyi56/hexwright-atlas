import { COLS, HW, M, R, ROWS, TAU, worldH, worldW } from '../core/geometry.js';
import { GOLD, INK, VEL, WAX } from './palette.js';

function drawCompass(g, x, y, r) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = 'rgba(240,230,203,0.55)'; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  g.lineWidth = 0.6; g.beginPath(); g.arc(0, 0, r * 0.9, 0, TAU); g.stroke();
  g.beginPath(); for (let k = 0; k < 64; k++) { const a = k * TAU / 64, i = k % 4 === 0 ? r * 0.8 : r * 0.86; g.moveTo(Math.cos(a) * i, Math.sin(a) * i); g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); } g.stroke();
  const star = (L, w, rot, north) => {
    for (let k = 0; k < 4; k++) {
      const a = rot + k * Math.PI / 2 - Math.PI / 2, tx = Math.cos(a) * L, ty = Math.sin(a) * L;
      const lx = Math.cos(a - Math.PI / 2) * w, ly = Math.sin(a - Math.PI / 2) * w, rx = -lx, ry = -ly;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(tx, ty); g.lineTo(lx, ly); g.closePath(); g.fillStyle = north && k === 0 ? WAX : INK; g.fill();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(tx, ty); g.lineTo(rx, ry); g.closePath(); g.fillStyle = VEL; g.fill();
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(tx, ty); g.lineTo(rx, ry); g.lineWidth = 0.8; g.strokeStyle = INK; g.stroke();
    }
  };
  star(r * 0.62, r * 0.1, Math.PI / 4, false);
  star(r * 1.1, r * 0.15, 0, true);
  g.beginPath(); g.arc(0, 0, r * 0.07, 0, TAU); g.fillStyle = GOLD; g.fill(); g.lineWidth = 0.8; g.stroke();
  g.fillStyle = INK; g.font = `${Math.round(r * 0.3 + 6)}px "IM Fell English SC", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText('N', 0, -r * 1.12 - 4);
  g.restore();
}
function notched(g, x, y, w, h, n) { g.beginPath(); g.moveTo(x + n, y); g.lineTo(x + w - n, y); g.lineTo(x + w, y + n); g.lineTo(x + w, y + h - n); g.lineTo(x + w - n, y + h); g.lineTo(x + n, y + h); g.lineTo(x, y + h - n); g.lineTo(x, y + n); g.closePath(); }
function drawCartouche(g, c, realm) {
  g.save();
  notched(g, c.x + 3, c.y + 4, c.w, c.h, 12); g.fillStyle = 'rgba(60,40,20,0.2)'; g.fill();
  notched(g, c.x, c.y, c.w, c.h, 12); g.fillStyle = '#f3e9cf'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  notched(g, c.x + 5, c.y + 5, c.w - 10, c.h - 10, 9); g.lineWidth = 0.6; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = INK;
  const cx = c.x + c.w / 2;
  g.font = 'italic 12px "IM Fell English", Georgia, serif'; g.fillStyle = '#5b3f22';
  g.fillText(`The ${realm.kind} of`, cx, c.y + 27);
  let fs = 32; g.font = `${fs}px "IM Fell English SC", Georgia, serif`;
  while (g.measureText(realm.name).width > c.w - 50 && fs > 16) { fs--; g.font = `${fs}px "IM Fell English SC", Georgia, serif`; }
  g.fillStyle = INK; g.fillText(realm.name, cx, c.y + 60);
  g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath(); g.moveTo(cx - 70, c.y + 71); g.lineTo(cx - 6, c.y + 71); g.moveTo(cx + 6, c.y + 71); g.lineTo(cx + 70, c.y + 71); g.stroke();
  g.beginPath(); g.moveTo(cx, c.y + 67.5); g.lineTo(cx + 3.5, c.y + 71); g.lineTo(cx, c.y + 74.5); g.lineTo(cx - 3.5, c.y + 71); g.closePath(); g.fillStyle = WAX; g.fill();
  g.font = 'italic 10.5px "IM Fell English", Georgia, serif'; g.fillStyle = '#5b3f22';
  g.fillText(`Surveyed in the year ${realm.year} · each hex six miles across`, cx, c.y + 89);
  g.restore();
}
function drawFrame(g) {
  const W = worldW, H = worldH;
  g.save(); g.strokeStyle = INK; g.fillStyle = INK;
  g.lineWidth = 2.4; g.strokeRect(12, 12, W - 24, H - 24);
  g.lineWidth = 0.8; g.strokeRect(17, 17, W - 34, H - 34);
  g.strokeRect(21, 21, W - 42, H - 42); g.strokeRect(29, 29, W - 58, H - 58);
  for (let c = 0; c < COLS; c++) { if (c % 2) continue; const x0 = M + R + 1.5 * R * c - 0.75 * R; g.fillRect(x0, 21, 1.5 * R, 8); g.fillRect(x0, H - 29, 1.5 * R, 8); }
  for (let r = 0; r < ROWS; r++) { if (r % 2) continue; const y0 = M + HW * r; g.fillRect(21, y0, 8, HW); g.fillRect(W - 29, y0, 8, HW); }
  [[21, 21], [W - 29, 21], [21, H - 29], [W - 29, H - 29]].forEach(([x, y]) => g.fillRect(x, y, 8, 8));
  g.lineWidth = 1.2; g.strokeRect(M - 6, M - 6, W - 2 * M + 12, H - 2 * M + 12);
  g.font = '10px "IM Fell English", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#4a3622';
  for (let c = 0; c < COLS; c++) { const x = M + R + 1.5 * R * c; g.fillText(String(c + 1).padStart(2, '0'), x, 44); g.fillText(String(c + 1).padStart(2, '0'), x, H - 44); }
  for (let r = 0; r < ROWS; r++) { const y = M + HW / 2 + HW * r; g.fillText(String(r + 1).padStart(2, '0'), 45, y); g.fillText(String(r + 1).padStart(2, '0'), W - 45, y); }
  g.restore();
}

export { drawCartouche, drawCompass, drawFrame };
