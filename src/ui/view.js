import { state } from './state.js';
import { CX, CY, hexAt, worldH, worldW } from '../core/geometry.js';
import { canvas, reduceMotion, wrap } from './state.js';
import { draw, requestDraw } from './draw.js';

/* ================= view ================= */
function resize() {
  const r = wrap.getBoundingClientRect(); const pcw = state.cw, pch = state.ch;
  state.cw = Math.max(1, r.width); state.ch = Math.max(1, r.height); state.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(state.cw * state.dpr); canvas.height = Math.round(state.ch * state.dpr);
  const nf = Math.min(state.cw / worldW, state.ch / worldH) * 0.97;
  if (!pcw) { state.fitZ = nf; fit(); } else { const wx = (pcw / 2 - state.ox) / state.z, wy = (pch / 2 - state.oy) / state.z; const k = nf / state.fitZ; state.fitZ = nf; state.z = clampZ(state.z * k); state.ox = state.cw / 2 - wx * state.z; state.oy = state.ch / 2 - wy * state.z; clampPan(); }
  requestDraw();
}
const clampZ = v => Math.max(state.fitZ * 0.85, Math.min(Math.max(state.fitZ * 6, 2.6), v));
function clampPan() {
  const mw = worldW * state.z, mh = worldH * state.z;
  state.ox = mw < state.cw ? Math.min(Math.max(state.ox, -mw * 0.25), state.cw - mw * 0.75) : Math.min(state.cw * 0.35, Math.max(state.cw * 0.65 - mw, state.ox));
  state.oy = mh < state.ch ? Math.min(Math.max(state.oy, -mh * 0.25), state.ch - mh * 0.75) : Math.min(state.ch * 0.35, Math.max(state.ch * 0.65 - mh, state.oy));
}
function fit() { state.z = state.fitZ; state.ox = (state.cw - worldW * state.z) / 2; state.oy = (state.ch - worldH * state.z) / 2; requestDraw(); }
function zoomAt(sx, sy, nz) { nz = clampZ(nz); const wx = (sx - state.ox) / state.z, wy = (sy - state.oy) / state.z; state.z = nz; state.ox = sx - wx * state.z; state.oy = sy - wy * state.z; clampPan(); requestDraw(); }
function flyTo(i, tz) {
  const z1 = clampZ(tz), x1 = state.cw / 2 - CX[i] * z1, y1 = state.ch / 2 - CY[i] * z1;
  if (reduceMotion) { state.z = z1; state.ox = x1; state.oy = y1; clampPan(); requestDraw(); return; }
  const z0 = state.z, x0 = state.ox, y0 = state.oy, t0 = performance.now(), id = ++state.anim;
  const step = now => { if (id !== state.anim) return; const t = Math.min(1, (now - t0) / 520), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; state.z = z0 + (z1 - z0) * e; state.ox = x0 + (x1 - x0) * e; state.oy = y0 + (y1 - y0) * e; draw(); if (t < 1) requestAnimationFrame(step); else { clampPan(); requestDraw(); } };
  requestAnimationFrame(step);
}
const toWorldHex = (sx, sy) => hexAt((sx - state.ox) / state.z, (sy - state.oy) / state.z);

export { clampPan, clampZ, fit, flyTo, resize, toWorldHex, zoomAt };
