import { state } from './state.js';
import { CX, CY, HW, N, R, hexNo, hexPath, worldH, worldW } from '../core/geometry.js';
import { ctx, table } from './state.js';

const FONT_SC = '"IM Fell English SC", Georgia, serif', FONT_FELL = '"IM Fell English", Georgia, serif';
function buildLabels() {
  state.labels = [];
  for (const s of state.map.seas) state.labels.push({ text: s.name, x: s.x, y: s.y, size: 19, style: 'italic', fam: FONT_FELL, color: '#2e5257', halo: 'rgba(205,220,208,0.75)', sp: 0.32, min: 7, pri: 1, ang: 0, floor: 11.5 });
  for (const r of state.map.regions) state.labels.push({ text: r.name, x: r.x, y: r.y, size: Math.min(21, 8.5 + Math.sqrt(r.size) * 1.5), style: 'italic', fam: FONT_FELL, color: '#5a3c1f', halo: 'rgba(242,232,206,0.82)', sp: 0.2, min: 7.5, pri: 2, ang: r.ang, floor: r.size >= 14 ? 10 : 0 });
  for (const l of state.map.lakes) if (l.name) state.labels.push({ text: l.name, x: l.x, y: l.y + 2, size: 10, style: 'italic', fam: FONT_FELL, color: '#2e5257', halo: 'rgba(214,226,214,0.8)', sp: 0.12, min: 8, pri: 4, ang: 0 });
  const SP = { capital: [16.5, FONT_SC, '', 0.06, 6, 0], city: [13, FONT_SC, '', 0.05, 7, 3], town: [11, FONT_FELL, '', 0.02, 8, 5], village: [9, FONT_FELL, 'italic', 0.02, 8.5, 6], keep: [9, FONT_FELL, 'italic', 0.02, 9, 7], tower: [9, FONT_FELL, 'italic', 0.02, 9, 7], ruin: [9, FONT_FELL, 'italic', 0.02, 9, 7], cave: [9, FONT_FELL, 'italic', 0.02, 9, 7], temple: [9, FONT_FELL, 'italic', 0.02, 9, 7] };
  for (const s of state.map.settle) { const [size, fam, style, sp, min, pri] = SP[s.kind] || SP.keep; state.labels.push({ text: s.name, x: CX[s.i], y: CY[s.i], size, fam, style, color: '#24180f', halo: 'rgba(243,234,210,0.88)', sp, min, pri, ang: 0, anchor: true, kind: s.kind, floor: s.kind === 'capital' ? 12.5 : s.kind === 'city' ? 10.5 : 0 }); }
  state.labels.sort((a, b) => a.pri - b.pri);
  const m = document.createElement('canvas').getContext('2d');
  for (const l of state.labels) { m.font = `${l.style} 100px ${l.fam}`; l.cw = [...l.text].map(ch => m.measureText(ch).width / 100); l.w = l.cw.reduce((a, b) => a + b, 0) + l.sp * (l.text.length - 1); }
}
function drawLabels() {
  const boxes = []; const hit = b => boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  for (const l of state.labels) {
    const fs = Math.max(l.size * state.z, l.floor || 0); if (fs < l.min) continue;
    const w = l.w * fs, h = fs * 1.05;
    let sx = l.x * state.z + state.ox, sy = l.y * state.z + state.oy;
    let cand = [[0, 0]];
    if (l.anchor) { const ir = R * state.z; cand = [[0, ir * 0.62 + h * 0.62], [ir * 0.62 + w / 2 + 2, ir * 0.2], [-(ir * 0.62 + w / 2 + 2), ir * 0.2], [0, -ir * 0.9 - h * 0.3]]; }
    let placed = null;
    for (const [dx, dy] of cand) {
      const px = sx + dx, py = sy + dy, c = Math.cos(l.ang), s = Math.abs(Math.sin(l.ang));
      const bw = Math.abs(c) * w + s * h, bh = s * w + Math.abs(c) * h;
      const box = { x: px - bw / 2 - 2, y: py - bh / 2 - 1, w: bw + 4, h: bh + 2 };
      if (box.x + box.w < 0 || box.x > state.cw || box.y + box.h < 0 || box.y > state.ch) { placed = 'off'; break; }
      if (!hit(box)) { placed = [px, py, box]; break; }
    }
    if (!placed || placed === 'off') continue;
    boxes.push(placed[2]);
    const [px, py] = placed;
    ctx.save(); ctx.translate(px, py); ctx.rotate(l.ang);
    ctx.font = `${l.style} ${fs}px ${l.fam}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, fs * 0.3); ctx.strokeStyle = l.halo; ctx.fillStyle = l.color;
    const xs = []; let cx = -w / 2; for (let k = 0; k < l.cw.length; k++) { xs.push(cx); cx += l.cw[k] * fs + l.sp * fs; }
    const chars = [...l.text];
    chars.forEach((chr, k) => ctx.strokeText(chr, xs[k], 0));
    chars.forEach((chr, k) => ctx.fillText(chr, xs[k], 0));
    ctx.restore();
  }
}
function drawScale() {
  const opts = [1, 2, 3, 6, 12, 18, 30, 60]; const per = HW * state.z / 6; let miles = 60;
  for (const m of opts) if (m * per >= 26) { miles = m; break; }
  const seg = miles * per, n = 4, x0 = 22, y0 = state.ch - 22;
  ctx.save();
  ctx.fillStyle = 'rgba(240,230,203,0.92)'; ctx.fillRect(x0 - 10, y0 - 20, seg * n + 52, 34);
  ctx.strokeStyle = '#2b2116'; ctx.lineWidth = 1; ctx.strokeRect(x0 - 9.5, y0 - 19.5, seg * n + 51, 33);
  for (let k = 0; k < n; k++) { ctx.fillStyle = k % 2 ? '#f0e6cb' : '#2b2116'; ctx.fillRect(x0 + seg * k, y0, seg, 5); }
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, seg * n, 5);
  ctx.fillStyle = '#2b2116'; ctx.font = `11px ${FONT_FELL}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (let k = 0; k <= n; k += 2) ctx.fillText(String(miles * k), x0 + seg * k, y0 - 5);
  ctx.textAlign = 'left'; ctx.font = `italic 11px ${FONT_FELL}`; ctx.fillText('miles', x0 + seg * n + 8, y0 + 6);
  ctx.restore();
}
function draw() {
  state.dirty = false;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.fillStyle = table; ctx.fillRect(0, 0, state.cw, state.ch);
  if (!state.baseImg) return;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 10; ctx.fillStyle = '#d8c9a4'; ctx.fillRect(state.ox, state.oy, worldW * state.z, worldH * state.z); ctx.restore();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.baseImg, state.ox, state.oy, worldW * state.z, worldH * state.z);
  ctx.setTransform(state.dpr * state.z, 0, 0, state.dpr * state.z, state.dpr * state.ox, state.dpr * state.oy);
  if (state.showNums && R * state.z >= 24) {
    const x0 = (-state.ox) / state.z - R, x1 = (state.cw - state.ox) / state.z + R, y0 = (-state.oy) / state.z - R, y1 = (state.ch - state.oy) / state.z + R;
    ctx.font = `6.5px ${FONT_FELL}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(43,33,22,0.62)';
    for (let i = 0; i < N; i++) { if (CX[i] < x0 || CX[i] > x1 || CY[i] < y0 || CY[i] > y1) continue; ctx.fillText(hexNo(i), CX[i], CY[i] - HW * 0.36); }
  }
  if (state.hover >= 0 && state.hover !== state.sel) { ctx.beginPath(); hexPath(ctx, CX[state.hover], CY[state.hover], R - 0.6); ctx.fillStyle = 'rgba(255,248,225,0.22)'; ctx.fill(); ctx.strokeStyle = 'rgba(43,33,22,0.7)'; ctx.lineWidth = 1.4 / Math.min(state.z, 1.6); ctx.stroke(); }
  if (state.sel >= 0) {
    ctx.beginPath(); hexPath(ctx, CX[state.sel], CY[state.sel], R - 1); ctx.strokeStyle = '#b8483a'; ctx.lineWidth = 2.6 / Math.min(state.z, 1.4); ctx.stroke();
    ctx.beginPath(); hexPath(ctx, CX[state.sel], CY[state.sel], R + 2.2 / Math.min(state.z, 1.4)); ctx.strokeStyle = 'rgba(243,234,210,0.9)'; ctx.lineWidth = 1.2 / Math.min(state.z, 1.4); ctx.stroke();
  }
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  if (state.showLabels) drawLabels();
  drawScale();
}
const requestDraw = () => { if (!state.dirty) { state.dirty = true; requestAnimationFrame(draw); } };

export { FONT_FELL, FONT_SC, buildLabels, draw, requestDraw };
