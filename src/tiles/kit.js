import { TAU } from '../core/geometry.js';
import { INK, hexRgb, rgbStr } from '../render/palette.js';

/* ================= iso drawing kit =================
   Every asset draws in world tile coordinates through a projection P(x, y, z) -> [sx, sy]
   (x runs down-right, y down-left, z up). The camera looks from +x +y, so the visible
   walls are the +x face (in shade) and the +y face (lit). */
const shade = (hex, k) => rgbStr(hexRgb(hex), k);

function makeKit(g, P) {
  const path = pts => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); };
  const poly = (pts, fill, lw = 0.7) => { path(pts); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); } };
  const face = (pts3, fill, lw) => poly(pts3.map(p => P(p[0], p[1], p[2])), fill, lw);
  const seg = (a, b, col = INK, lw = 0.6) => { const p = P(...a), q = P(...b); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); };
  const K = {
    g, P, path, poly, face, seg, shade,
    /* axis-aligned block; only the three faces the camera sees */
    box(x0, y0, x1, y1, z0, z1, col, o = {}) {
      face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], o.side || shade(col, 0.78), o.lw);
      face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col, o.lw);
      if (!o.noTop) face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], o.top || shade(col, 1.08), o.lw);
    },
    /* a quad drawn flat on a visible wall: face 'y' is the +y wall at y=c, 'x' the +x wall at x=c */
    onWall(fc, c, a0, a1, z0, z1, fill, lw = 0.5) {
      const pts = fc === 'y' ? [[a0, c, z0], [a1, c, z0], [a1, c, z1], [a0, c, z1]] : [[c, a0, z0], [c, a1, z0], [c, a1, z1], [c, a0, z1]];
      face(pts, fill, lw);
    },
    windows(fc, c, a0, a1, z, n, col = '#2f271f', hgt = 3.4, wd = 0.13) {
      for (let k = 0; k < n; k++) { const m = a0 + (a1 - a0) * (k + 0.5) / n; K.onWall(fc, c, m - wd / 2, m + wd / 2, z, z + hgt, col, 0); }
    },
    door(fc, c, m, z, col = '#4a3524', wd = 0.22, hgt = 6) {
      const pts = fc === 'y' ? [[m - wd / 2, c, z], [m + wd / 2, c, z], [m + wd / 2, c, z + hgt], [m - wd / 2, c, z + hgt]] : [[c, m - wd / 2, z], [c, m + wd / 2, z], [c, m + wd / 2, z + hgt], [c, m - wd / 2, z + hgt]];
      const q = pts.map(p => P(...p)), top = P(...(fc === 'y' ? [m, c, z + hgt + wd * 6] : [c, m, z + hgt + wd * 6]));
      g.beginPath(); g.moveTo(q[0][0], q[0][1]); g.lineTo(q[3][0], q[3][1]); g.quadraticCurveTo(top[0], top[1], q[2][0], q[2][1]); g.lineTo(q[1][0], q[1][1]); g.closePath();
      g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
    },
    /* timber framing strokes on a visible wall */
    timber(fc, c, a0, a1, z0, z1, col = '#5a3f28') {
      const n = Math.max(2, Math.round((a1 - a0) / 0.34)), pt = (a, z) => P(...(fc === 'y' ? [a, c, z] : [c, a, z]));
      g.strokeStyle = col; g.lineWidth = 0.75; g.beginPath();
      for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n, p = pt(a, z0), q = pt(a, z1); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
      for (const z of [z0 + 0.4, (z0 + z1) / 2, z1 - 0.3]) { const p = pt(a0, z), q = pt(a1, z); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
      for (let k = 0; k < n; k += 2) { const p = pt(a0 + (a1 - a0) * k / n, z0), q = pt(a0 + (a1 - a0) * (k + 1) / n, (z0 + z1) / 2); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
      g.stroke();
    },
    /* courses of stone */
    courses(fc, c, a0, a1, z0, z1, col = 'rgba(70,55,35,0.28)') {
      const pt = (a, z) => P(...(fc === 'y' ? [a, c, z] : [c, a, z]));
      g.strokeStyle = col; g.lineWidth = 0.4; g.beginPath(); let r = 0;
      for (let z = z0 + 2.2; z < z1 - 0.5; z += 2.2, r++) { const p = pt(a0, z), q = pt(a1, z); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); for (let a = a0 + (r % 2 ? 0.12 : 0.24); a < a1; a += 0.26) { const s = pt(a, z), t = pt(a, Math.min(z1, z + 2.2)); g.moveTo(s[0], s[1]); g.lineTo(t[0], t[1]); } }
      g.stroke();
    },
    /* gable roof. axis is the ridge direction. Back slope, gable end, then the front slope */
    gable(x0, y0, x1, y1, zt, rh, axis, roof, wall, o = {}) {
      const ov = o.ov ?? 0.08, zr = zt + rh, tex = o.tex || 'tiles';
      if (axis === 'x') {
        const ym = (y0 + y1) / 2;
        face([[x0 - ov, y0 - ov, zt], [x1 + ov, y0 - ov, zt], [x1 + ov, ym, zr], [x0 - ov, ym, zr]], shade(roof, 0.72));
        face([[x1, y0, zt], [x1, y1, zt], [x1, ym, zr]], shade(wall, 0.78));
        const fr = [[x0 - ov, y1 + ov, zt], [x1 + ov, y1 + ov, zt], [x1 + ov, ym, zr], [x0 - ov, ym, zr]];
        face(fr, roof); K.roofTex(fr, tex, roof);
      } else {
        const xm = (x0 + x1) / 2;
        face([[x0 - ov, y0 - ov, zt], [x0 - ov, y1 + ov, zt], [xm, y1 + ov, zr], [xm, y0 - ov, zr]], shade(roof, 0.72));
        face([[x0, y1, zt], [x1, y1, zt], [xm, y1, zr]], wall);
        const fr = [[x1 + ov, y1 + ov, zt], [x1 + ov, y0 - ov, zt], [xm, y0 - ov, zr], [xm, y1 + ov, zr]];
        face(fr, shade(roof, 0.86)); K.roofTex(fr, tex, roof);
      }
    },
    /* hipped roof (a pyramid when square) */
    hip(x0, y0, x1, y1, zt, rh, roof, o = {}) {
      const ov = o.ov ?? 0.08; x0 -= ov; y0 -= ov; x1 += ov; y1 += ov;
      const w = x1 - x0, d = y1 - y0, zr = zt + rh, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
      const r0 = w >= d ? [x0 + d / 2, ym] : [xm, y0 + w / 2], r1 = w >= d ? [x1 - d / 2, ym] : [xm, y1 - w / 2];
      const A = [x0, y0, zt], B = [x1, y0, zt], C = [x1, y1, zt], D = [x0, y1, zt], R0 = [r0[0], r0[1], zr], R1 = [r1[0], r1[1], zr];
      if (w >= d) { face([A, B, R1, R0], shade(roof, 0.7)); face([A, D, R0], shade(roof, 0.66)); face([B, C, R1], shade(roof, 0.84)); const fr = [D, C, R1, R0]; face(fr, roof); K.roofTex(fr, o.tex || 'tiles', roof); }
      else { face([A, B, R0], shade(roof, 0.7)); face([A, D, R1, R0], shade(roof, 0.66)); face([D, C, R1], roof); const fr = [B, C, R1, R0]; face(fr, shade(roof, 0.86)); K.roofTex(fr, o.tex || 'tiles', roof); }
    },
    /* surface texture on a roof quad [eaveA, eaveB, ridgeB, ridgeA] */
    roofTex(q, tex, col) {
      const p = q.map(v => P(...v)), L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      g.save(); path(p); g.clip(); g.lineWidth = tex === 'thatch' ? 0.5 : 0.45;
      g.strokeStyle = tex === 'thatch' ? 'rgba(90,64,28,0.45)' : tex === 'shingle' ? 'rgba(40,28,18,0.32)' : shade(col, 0.62);
      g.beginPath();
      if (tex === 'thatch') { for (let t = 0.05; t < 1; t += 0.07) { const a = L(p[0], p[1], t), b = L(p[3], p[2], t); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } }
      for (let t = 0.2; t < 1; t += tex === 'thatch' ? 0.3 : 0.18) { const a = L(p[0], p[3], t), b = L(p[1], p[2], t); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      g.stroke(); g.restore();
    },
    /* upright cylinder with a lit left and shaded right */
    cyl(cx, cy, r, z0, z1, col, o = {}) {
      const [x, by] = P(cx, cy, z0), ty = by - (z1 - z0), rx = r * 16 * 1.414, ry = r * 8 * 1.414;
      const gr = g.createLinearGradient(x - rx, 0, x + rx, 0); gr.addColorStop(0, shade(col, 1.06)); gr.addColorStop(0.45, col); gr.addColorStop(1, shade(col, 0.66));
      g.beginPath(); g.moveTo(x - rx, ty); g.lineTo(x - rx, by); g.ellipse(x, by, rx, ry, 0, Math.PI, 0, true); g.lineTo(x + rx, ty); g.ellipse(x, ty, rx, ry, 0, 0, Math.PI, false); g.closePath();
      g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = o.lw ?? 0.7; g.stroke();
      if (!o.noTop) { g.beginPath(); g.ellipse(x, ty, rx, ry, 0, 0, TAU); g.fillStyle = o.top || shade(col, 0.9); g.fill(); g.stroke(); }
      return { x, ty, by, rx, ry };
    },
    cone(cx, cy, r, z, h, col, o = {}) {
      const [x, y] = P(cx, cy, z), rx = r * 16 * 1.414, ry = r * 8 * 1.414;
      const gr = g.createLinearGradient(x - rx, 0, x + rx, 0); gr.addColorStop(0, shade(col, 1.15)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, 0.68));
      g.beginPath(); g.moveTo(x - rx, y); g.lineTo(x, y - h); g.lineTo(x + rx, y); g.ellipse(x, y, rx, ry, 0, 0, Math.PI, false); g.closePath();
      g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = o.lw ?? 0.7; g.stroke();
      if (o.tex) { g.save(); g.clip(); g.strokeStyle = 'rgba(70,50,25,0.35)'; g.lineWidth = 0.45; g.beginPath(); for (let k = 1; k < 4; k++) { const f = k / 4; g.moveTo(x - rx * f, y - h * (1 - f)); g.quadraticCurveTo(x, y - h * (1 - f) + ry * f * 1.6, x + rx * f, y - h * (1 - f)); } g.stroke(); g.restore(); }
      return [x, y - h];
    },
    /* crenellations along the two visible edges of a block top, plus the back pair */
    merlons(x0, y0, x1, y1, z, col, step = 0.34) {
      const m = (x, y) => K.box(x - 0.07, y - 0.07, x + 0.07, y + 0.07, z, z + 2.6, col, { lw: 0.4 });
      for (let x = x0 + 0.08; x < x1 - 0.05; x += step) m(x, y0 + 0.08);
      for (let y = y0 + 0.08 + step; y < y1 - 0.05; y += step) m(x0 + 0.08, y);
      for (let y = y0 + 0.08 + step; y < y1 - 0.05; y += step) m(x1 - 0.08, y);
      for (let x = x0 + 0.08 + step; x < x1 - 0.05; x += step) m(x, y1 - 0.08);
    },
    ell(cx, cy, z, r, fill, lw = 0.6, ky = 1) { const [x, y] = P(cx, cy, z); g.beginPath(); g.ellipse(x, y, r * 16 * 1.414, r * 8 * 1.414 * ky, 0, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); } },
    blob(x, y, rx, ry, fill, lw = 0.6) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); } },
    smoke(x, y) { g.fillStyle = 'rgba(235,228,212,0.55)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + k * 1.6, y - 3 - k * 3.2, 1.6 + k * 0.7, 0, TAU); g.fill(); } },
    flag(x, y, len, col) { g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - len); g.stroke(); g.beginPath(); g.moveTo(x, y - len); g.quadraticCurveTo(x + 4, y - len + 1, x + 7, y - len + 2.5); g.lineTo(x, y - len + 4.5); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 0.5; g.stroke(); }
  };
  return K;
}

export { makeKit, shade };
