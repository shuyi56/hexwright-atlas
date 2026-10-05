import { state } from './state.js';
import { R, hexNo } from '../core/geometry.js';
import { $, canvas, tip } from './state.js';
import { requestDraw } from './draw.js';
import { clampPan, clampZ, fit, toWorldHex, zoomAt } from './view.js';
import { select, terrainName } from './ledger.js';
import { openCity } from './city-view.js';
import { rebuildBase } from '../main.js';

/* ================= input ================= */
const pts = new Map(); let drag = null, pinch = null;
const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); const [x, y] = local(e); pts.set(e.pointerId, [x, y]); state.anim++;
  if (pts.size === 1) drag = { x, y, ox: state.ox, oy: state.oy, moved: false };
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, z: state.z, ox: state.ox, oy: state.oy }; if (drag) drag.moved = true; }
});
canvas.addEventListener('pointermove', e => {
  const [x, y] = local(e);
  if (pts.has(e.pointerId)) {
    pts.set(e.pointerId, [x, y]);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const nz = clampZ(pinch.z * d / pinch.d); const wx = (pinch.mx - pinch.ox) / pinch.z, wy = (pinch.my - pinch.oy) / pinch.z;
      state.z = nz; state.ox = mx - wx * state.z; state.oy = my - wy * state.z; clampPan(); requestDraw(); return;
    }
    if (drag) { const dx = x - drag.x, dy = y - drag.y; if (Math.hypot(dx, dy) > 4) { drag.moved = true; canvas.classList.add('dragging'); } if (drag.moved) { state.ox = drag.ox + dx; state.oy = drag.oy + dy; clampPan(); requestDraw(); tip.hidden = true; } }
    return;
  }
  if (e.pointerType === 'mouse') setHover(toWorldHex(x, y), x, y);
});
const endPtr = e => {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId); canvas.classList.remove('dragging');
  if (pts.size === 0) { if (drag && !drag.moved && e.type === 'pointerup') { const [x, y] = local(e); const h = toWorldHex(x, y); if (h >= 0) { select(h); const st = state.map.sAt[h] >= 0 ? state.map.settle[state.map.sAt[h]] : null; if (st && (st.kind === 'capital' || st.kind === 'city' || st.kind === 'temple')) openCity(st); } } drag = null; pinch = null; }
  else if (pts.size === 1) { const [p] = [...pts.values()]; drag = { x: p[0], y: p[1], ox: state.ox, oy: state.oy, moved: true }; pinch = null; }
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { state.hover = -1; tip.hidden = true; requestDraw(); } });
canvas.addEventListener('wheel', e => { e.preventDefault(); state.anim++; const [x, y] = local(e); zoomAt(x, y, state.z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016))); }, { passive: false });
canvas.addEventListener('keydown', e => {
  const k = e.key, step = 60;
  if (k === '+' || k === '=') zoomAt(state.cw / 2, state.ch / 2, state.z * 1.3);
  else if (k === '-' || k === '_') zoomAt(state.cw / 2, state.ch / 2, state.z / 1.3);
  else if (k.startsWith('Arrow')) { if (k === 'ArrowLeft') state.ox += step; if (k === 'ArrowRight') state.ox -= step; if (k === 'ArrowUp') state.oy += step; if (k === 'ArrowDown') state.oy -= step; clampPan(); requestDraw(); }
  else return;
  e.preventDefault();
});
function setHover(h, x, y) {
  if (h !== state.hover) { state.hover = h; requestDraw(); }
  if (h < 0 || !state.map) { tip.hidden = true; return; }
  const s = state.map.sAt[h] >= 0 ? state.map.settle[state.map.sAt[h]] : null;
  tip.innerHTML = `${hexNo(h)} · ${terrainName(h)}${s ? ` · <b>${s.name}</b>` : ''}${s && (s.kind === 'capital' || s.kind === 'city' || s.kind === 'temple') ? ' · click to enter' : ''}`;
  tip.hidden = false;
  const tw = tip.offsetWidth; tip.style.left = Math.min(x, state.cw - tw - 24) + 'px'; tip.style.top = Math.min(y, state.ch - 44) + 'px';
}
$('zIn').onclick = () => zoomAt(state.cw / 2, state.ch / 2, state.z * 1.4);
$('zOut').onclick = () => zoomAt(state.cw / 2, state.ch / 2, state.z / 1.4);
$('zFit').onclick = () => { state.anim++; fit(); };
const toggle = (btn, fn) => btn.addEventListener('click', () => { const v = btn.getAttribute('aria-pressed') !== 'true'; btn.setAttribute('aria-pressed', String(v)); fn(v); });
toggle($('lyLabels'), v => { state.showLabels = v; requestDraw(); });
toggle($('lyNums'), v => { state.showNums = v; if (v && R * state.z < 24) zoomAt(state.cw / 2, state.ch / 2, 24 / R + 0.05); requestDraw(); });
toggle($('lyGrid'), v => { state.showGrid = v; rebuildBase(); });
