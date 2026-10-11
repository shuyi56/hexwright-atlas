import { TAU } from '../core/geometry.js';
import { GOLD, INK, TREE } from '../render/palette.js';
import { foliage, leafPal, makeBlob, mixHex } from '../render/trees.js';
import { shade } from './kit.js';

/* ================= the elven pieces =================
   Pieces for an elven wood, drawn for the editor's map with the iso kit (tiles/kit.js) like every other asset:
   a hall of moonstone under a verdigris roof with lancet windows and gold finials, a slender white spire with a
   balcony ring, a flet (a round house on a platform high in a great tree), the mallorn with its silver bark and
   gold crown, a weeping silver willow, moonflowers, a lantern hung from a silver crook and a moonwell. Each list
   joins its group in tiles/assets.js, so the pieces sit beside the others of their kind. The tactical view's
   designs are in tactical/elven.js, the town view's in town/pieces.js. */
const MOON = '#ece9df', MOON_D = '#d6d2c4', VERD = '#6f9c86', GLASS = '#5f8f8c', DOOR = '#56785a', BARK = '#d8d4c6', GLOW = '#e4f6ea';
const mid = o => [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2];
/* a soft pool of pale light round (x, y) */
function halo(g, x, y, r, a = 0.55) { const gl = g.createRadialGradient(x, y, 0, x, y, r); gl.addColorStop(0, `rgba(222,246,232,${a})`); gl.addColorStop(1, 'rgba(222,246,232,0)'); g.fillStyle = gl; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
/* a gold finial: a rod topped with a leaf */
function finial(g, x, y, h) {
  g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
  g.strokeStyle = GOLD; g.lineWidth = 0.6; g.stroke();
  g.beginPath(); g.moveTo(x, y - h - 3.4); g.quadraticCurveTo(x + 1.6, y - h - 1.4, x, y - h + 0.3); g.quadraticCurveTo(x - 1.6, y - h - 1.4, x, y - h - 3.4); g.fillStyle = GOLD; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke();
}
/* a leaf-pointed door on the seen wall the piece faces */
function leafDoor(K, o, x0, y0, x1, y1, z, h = 8) {
  const fc = o.face === 0 ? 'y' : o.face === 1 ? 'x' : null; if (!fc) return;
  const c = fc === 'y' ? y1 : x1, m = fc === 'y' ? (x0 + x1) / 2 : (y0 + y1) / 2;
  K.door(fc, c, m, z, DOOR, 0.24, h);
  const [px, py] = K.P(...(fc === 'y' ? [m, c, z + h + 2.2] : [c, m, z + h + 2.2])); finial(K.g, px, py + 1, 0);
}

/* ---------- the high elven buildings: tracery ----------
   A pointed arch in a plane: pt(s, z) gives the screen point s (across, -1..1 of the half-width hw) and z up from
   the sill; the arch springs at sh and rises to a point at h. */
function archPath(g, pt, hw, sh, h, n = 10) {
  g.beginPath(); const a = pt(-hw, 0); g.moveTo(a[0], a[1]);
  const L = pt(-hw, sh); g.lineTo(L[0], L[1]);
  for (let k = 1; k <= n; k++) { const t = k / n, q = pt(-hw * (1 - Math.pow(t, 1.5)), sh + (h - sh) * t); g.lineTo(q[0], q[1]); }
  for (let k = n - 1; k >= 0; k--) { const t = k / n, q = pt(hw * (1 - Math.pow(t, 1.5)), sh + (h - sh) * t); g.lineTo(q[0], q[1]); }
  const b = pt(hw, 0); g.lineTo(b[0], b[1]); g.closePath();
}
/* a tracery window: teal glass in a pointed arch, a mullion branching in a Y, an oculus in the head, a gold hood */
function traceryWindow(g, pt, hw, h, lit = false) {
  const sh = h - hw * 1.9;
  archPath(g, (s, z) => pt(s * 1.3, z), hw, sh, h + hw * 0.4); g.strokeStyle = GOLD; g.lineWidth = 0.5; g.stroke();
  archPath(g, pt, hw, sh, h); g.fillStyle = lit ? '#f0dc96' : GLASS; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.45; g.stroke();
  g.strokeStyle = MOON; g.lineWidth = 0.45; g.beginPath();
  const m0 = pt(0, 0), m1 = pt(0, sh), l = pt(-hw * 0.8, sh + hw * 0.8), r = pt(hw * 0.8, sh + hw * 0.8);
  g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]); g.moveTo(l[0], l[1]); g.lineTo(m1[0], m1[1]); g.lineTo(r[0], r[1]); g.stroke();
  const o = pt(0, sh + (h - sh) * 0.5), e = pt(hw * 0.4, sh + (h - sh) * 0.5); g.beginPath(); g.arc(o[0], o[1], Math.max(0.6, Math.abs(e[0] - o[0])), 0, TAU); g.stroke();
}
/* tracery windows along a seen wall, n of them */
function traceried(K, fc, c, a0, a1, z, n, hw = 0.06, h = 7, lit = false) {
  for (let k = 0; k < n; k++) {
    const m = a0 + (a1 - a0) * (k + 0.5) / n;
    traceryWindow(K.g, (s, zz) => K.P(...(fc === 'y' ? [m + s, c, z + zz] : [c, m - s, z + zz])), hw, h, lit);
  }
}
/* a swept roof: a gable whose eaves flick up in gold curls at the corners */
function sweptRoof(K, x0, y0, x1, y1, zt, rh, axis) {
  K.gable(x0, y0, x1, y1, zt, rh, axis, VERD, MOON, { ov: 0.16, tex: 'slate' });
  const g = K.g, ov = 0.16;
  for (const [x, y, d] of [[x0 - ov, y1 + ov, -1], [x1 + ov, y1 + ov, 1], [x1 + ov, y0 - ov, 1]]) { const [px, py] = K.P(x, y, zt); g.strokeStyle = GOLD; g.lineWidth = 1; g.beginPath(); g.moveTo(px - d * 3, py + 0.5); g.quadraticCurveTo(px, py + 0.5, px + d * 1.4, py - 3); g.stroke(); }
  const ends = axis === 'x' ? [[x0 - ov, (y0 + y1) / 2], [x1 + ov, (y0 + y1) / 2]] : [[(x0 + x1) / 2, y0 - ov], [(x0 + x1) / 2, y1 + ov]];
  for (const [x, y] of ends) { const [px, py] = K.P(x, y, zt + rh); finial(g, px, py, 6); }
}
/* an ogee roof over (x, y): swelling out, then drawing in to a point, verdigris ribbed in gold */
function ogee(K, x, y, rx, h) {
  const g = K.g, gr = g.createLinearGradient(x - rx, 0, x + rx, 0); gr.addColorStop(0, shade(VERD, 1.18)); gr.addColorStop(0.5, VERD); gr.addColorStop(1, shade(VERD, 0.66));
  g.beginPath(); g.moveTo(x - rx, y); g.bezierCurveTo(x - rx * 1.15, y - h * 0.35, x - rx * 0.1, y - h * 0.6, x, y - h); g.bezierCurveTo(x + rx * 0.1, y - h * 0.6, x + rx * 1.15, y - h * 0.35, x + rx, y); g.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI); g.closePath();
  g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke();
  g.save(); g.clip(); g.strokeStyle = GOLD; g.lineWidth = 0.5; g.beginPath(); for (const f of [-0.6, -0.2, 0.2, 0.6]) { g.moveTo(x + rx * f * 1.05, y + rx * 0.3 * Math.sqrt(1 - f * f)); g.quadraticCurveTo(x + rx * f * 0.9, y - h * 0.45, x, y - h); } g.stroke(); g.restore();
  g.strokeStyle = GOLD; g.lineWidth = 0.9; g.beginPath(); g.ellipse(x, y, rx, rx * 0.5, 0, 0.05, Math.PI - 0.05); g.stroke();
  finial(g, x, y - h, 4);
}
const HIGH = [
  { id: 'elvenpavilion', label: 'Elven pavilion', w: 1, d: 1, h: 40, draw(K, o) {
    const z = o.z, g = K.g, c0 = o.x0 + 0.2, c1 = o.x1 - 0.2, d0 = o.y0 + 0.2, d1 = o.y1 - 0.2, zc = z + 16;
    K.box(o.x0 + 0.08, o.y0 + 0.08, o.x1 - 0.08, o.y1 - 0.08, z, z + 1.6, MOON_D);
    const col = (x, y) => { const c = K.cyl(x, y, 0.035, z + 1.6, zc, MOON, { lw: 0.45 }); g.fillStyle = GOLD; g.fillRect(c.x - c.rx - 0.3, c.ty - 0.8, c.rx * 2 + 0.6, 0.9); };
    const arches = (fc, c, a0, a1, dark) => { const m = (a0 + a1) / 2, hw = (a1 - a0) / 2 - 0.03, pt = (s, zz) => K.P(...(fc === 'y' ? [m + s, c, z + zz] : [c, m - s, z + zz])); g.save(); archPath(g, pt, hw, 9, 14.4); g.strokeStyle = dark ? shade(MOON, 0.75) : MOON; g.lineWidth = 1.4; g.stroke(); g.strokeStyle = GOLD; g.lineWidth = 0.4; g.stroke(); const s0 = pt(0, 11.4), l = pt(-hw * 0.7, 13), r = pt(hw * 0.7, 13); g.strokeStyle = dark ? shade(MOON, 0.75) : MOON; g.lineWidth = 0.6; g.beginPath(); g.moveTo(l[0], l[1]); g.quadraticCurveTo(s0[0], s0[1] - 1, r[0], r[1]); g.stroke(); g.restore(); };
    col(c0, d0); arches('y', d0, c0, c1, true); arches('x', c0, d0, d1, true); col(c1, d0); col(c0, d1);
    const [lx, ly] = K.P((c0 + c1) / 2, (d0 + d1) / 2, z + 8); halo(g, lx, ly, 6, 0.6); g.fillStyle = GLOW; g.beginPath(); g.arc(lx, ly, 1.1, 0, TAU); g.fill();
    col(c1, d1); arches('y', d1, c0, c1); arches('x', c1, d0, d1);
    const [rx0, ry0] = K.P((c0 + c1) / 2, (d0 + d1) / 2, zc); ogee(K, rx0, ry0, 0.36 * 16 * 1.414, 18);
  } },
  { id: 'elvenrotunda', label: 'Elven rotunda', w: 2, d: 2, h: 70, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g;
    K.cyl(cx, cy, 0.92, z, z + 2, MOON_D, { lw: 0.5 });
    const d = K.cyl(cx, cy, 0.6, z + 2, z + 30, MOON, { noTop: true });
    for (let k = -2; k <= 2; k++) { const f = k / 2.6, x = d.x + f * d.rx * 0.95, yb = d.by + Math.sqrt(1 - f * f) * d.ry - 24; traceryWindow(g, (s, zz) => [x + s * 16 * Math.sqrt(1 - f * f), yb - zz], 0.11, 16, k === 0); }
    /* the arcade's front half: columns round the drum, pointed arches between them, a lean-to roof */
    const ra = 0.86, [ax, ay] = K.P(cx, cy, z + 2), arx = ra * 16 * 1.414, ary = ra * 8 * 1.414, n = 9;
    for (let k = 0; k <= n; k++) { const t = Math.PI * k / n, x = ax + Math.cos(t) * arx, y = ay + Math.sin(t) * ary; g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 16); g.stroke(); g.strokeStyle = MOON; g.lineWidth = 0.7; g.stroke(); }
    for (let k = 0; k < n; k++) { const t0 = Math.PI * k / n, t1 = Math.PI * (k + 1) / n, xa = ax + Math.cos(t0) * arx, ya = ay + Math.sin(t0) * ary - 16, xb = ax + Math.cos(t1) * arx, yb = ay + Math.sin(t1) * ary - 16; g.strokeStyle = MOON; g.lineWidth = 1; g.beginPath(); g.moveTo(xa, ya); g.quadraticCurveTo((xa + xb) / 2, (ya + yb) / 2 - 5, xb, yb); g.stroke(); g.strokeStyle = GOLD; g.lineWidth = 0.35; g.stroke(); }
    g.beginPath(); g.ellipse(ax, ay - 17, arx + 1, ary + 0.5, 0, 0, Math.PI); g.strokeStyle = INK; g.lineWidth = 1.9; g.stroke(); g.strokeStyle = VERD; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.ellipse(ax, ay - 17.8, arx, ary, 0, 0, Math.PI); g.strokeStyle = GOLD; g.lineWidth = 0.45; g.stroke();
    /* the dome, a gold band, the lantern and the finial */
    const [dx, dy] = K.P(cx, cy, z + 30); g.fillStyle = GOLD; g.beginPath(); g.ellipse(dx, dy, d.rx + 0.8, d.ry + 0.4, 0, 0, TAU); g.fill();
    ogee(K, dx, dy - 1, d.rx + 0.5, 26);
    halo(g, dx, dy - 22, 4, 0.5);
  } },
  { id: 'elvenmanor', label: 'Elven manor', w: 2, d: 2, h: 62, draw(K, o) {
    const ax = o.axis === 'x', z = o.z, g = K.g, [x0, y0, x1, y1] = ax ? [o.x0 + 0.14, o.y0 + 0.5, o.x1 - 0.14, o.y1 - 0.14] : [o.x0 + 0.5, o.y0 + 0.14, o.x1 - 0.14, o.y1 - 0.14], H = 22;
    K.box(x0, y0, x1, y1, z, z + H, MOON, { noTop: true }); K.courses('y', y1, x0, x1, z, z + H, 'rgba(110,104,88,0.2)'); K.courses('x', x1, y0, y1, z, z + H, 'rgba(110,104,88,0.2)');
    for (const zz of [10.5, H - 1]) { K.seg([x0, y1, z + zz], [x1, y1, z + zz], GOLD, 0.7); K.seg([x1, y1, z + zz], [x1, y0, z + zz], shade(GOLD, 0.8), 0.7); }
    for (const zz of [2, 12.5]) { traceried(K, 'y', y1, x0, x1 - 0.3, z + zz, Math.round((x1 - x0 - 0.3) / 0.4), 0.06, 7, zz > 10); traceried(K, 'x', x1, y0, y1 - 0.3, z + zz, Math.round((y1 - y0 - 0.3) / 0.4), 0.06, 7); }
    leafDoor(K, o, x0, y0, x1, y1, z, 8);
    /* a balcony on the upper floor of the long front */
    if (ax) { K.box(x0 + 0.3, y1, x0 + 1, y1 + 0.16, z + 10, z + 11, MOON_D, { lw: 0.5 }); for (let k = 0; k < 6; k++) { const a = x0 + 0.3 + k * 0.7 / 6, p = K.P(a, y1 + 0.16, z + 11), q = K.P(a + 0.7 / 6, y1 + 0.16, z + 11); g.strokeStyle = GOLD; g.lineWidth = 0.5; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0], p[1] - 3); g.quadraticCurveTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 5, q[0], q[1] - 3); g.stroke(); } }
    sweptRoof(K, x0, y0, x1, y1, z + H, 16, ax ? 'x' : 'y');
    /* the turret on the front corner */
    const c = K.cyl(x1 - 0.06, y1 - 0.06, 0.24, z, z + 32, MOON, { noTop: true });
    traceryWindow(g, (s, zz) => [c.x - 1.5 + s * 16, c.by - 14 - zz], 0.09, 8, true);
    g.fillStyle = GOLD; g.beginPath(); g.ellipse(c.x, c.ty, c.rx + 0.8, c.ry + 0.4, 0, 0, TAU); g.fill();
    const tip = K.cone(x1 - 0.06, y1 - 0.06, 0.26, z + 32, 22, VERD); finial(g, tip[0], tip[1], 5);
  } },
  { id: 'elvenarch', label: 'Elven archway', w: 1, d: 1, h: 40, walk: true, draw(K, o) {
    const span = o.face % 2 === 0, z = o.z, g = K.g, at = (a, zz) => K.P(...(span ? [o.x0 + a, o.y0 + 0.5, z + zz] : [o.x0 + 0.5, o.y0 + a, z + zz]));
    for (const a of [0.2, 0.8]) { const [x, y] = span ? [o.x0 + a, o.y0 + 0.5] : [o.x0 + 0.5, o.y0 + a]; K.box(x - 0.07, y - 0.07, x + 0.07, y + 0.07, z, z + 1.5, MOON_D, { lw: 0.5 }); K.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, z + 1.5, z + 15, MOON, { lw: 0.5 }); }
    const pt = (s, zz) => at(0.5 + s, zz);
    g.save(); archPath(g, pt, 0.36, 15, 25); archPath(g, pt, 0.27, 15, 21.5); g.fillStyle = MOON; g.fill('evenodd'); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
    archPath(g, pt, 0.36, 15, 25); g.strokeStyle = GOLD; g.lineWidth = 0.45; g.stroke(); g.restore();
    g.strokeStyle = MOON; g.lineWidth = 0.9; g.beginPath(); const l = pt(-0.2, 19), c = pt(0, 17), r = pt(0.2, 19), top = pt(0, 21.5); g.moveTo(l[0], l[1]); g.quadraticCurveTo(c[0], c[1], r[0], r[1]); g.moveTo(c[0], c[1]); g.lineTo(top[0], top[1]); g.stroke();
    const tp = pt(0, 25); finial(g, tp[0], tp[1], 3);
    for (const s of [-0.18, 0.18]) { const [lx, ly] = pt(s, 13); halo(g, lx, ly, 5, 0.55); g.fillStyle = GLOW; g.beginPath(); g.arc(lx, ly, 0.9, 0, TAU); g.fill(); }
  } }
];

const BUILDINGS = [
  { id: 'elvenhall', label: 'Elven hall', w: 2, d: 1, h: 34, draw(K, o) {
    const x0 = o.x0 + 0.14, y0 = o.y0 + 0.14, x1 = o.x1 - 0.14, y1 = o.y1 - 0.14, z = o.z, hw = 13;
    K.box(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, z, z + 1.6, MOON_D);
    K.box(x0, y0, x1, y1, z + 1.6, z + hw, MOON, { noTop: true }); K.courses('y', y1, x0, x1, z + 1.6, z + hw, 'rgba(110,104,88,0.22)'); K.courses('x', x1, y0, y1, z + 1.6, z + hw, 'rgba(110,104,88,0.22)');
    traceried(K, 'y', y1, x0, x1, z + 3, Math.max(1, Math.round((x1 - x0) / 0.36)), 0.06, 8, true); traceried(K, 'x', x1, y0, y1, z + 3, Math.max(1, Math.round((y1 - y0) / 0.36)), 0.06, 8);
    leafDoor(K, o, x0, y0, x1, y1, z + 1.6, 8.5);
    /* a gold string course under the eaves */
    K.seg([x0, y1, z + hw - 0.8], [x1, y1, z + hw - 0.8], GOLD, 0.8); K.seg([x1, y1, z + hw - 0.8], [x1, y0, z + hw - 0.8], shade(GOLD, 0.8), 0.8);
    sweptRoof(K, x0, y0, x1, y1, z + hw, 14, o.axis);
  } },
  { id: 'elvenspire', label: 'Elven spire', w: 1, d: 1, h: 60, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g;
    K.cyl(cx, cy, 0.34, z, z + 2, MOON_D, { lw: 0.5 });
    const c = K.cyl(cx, cy, 0.25, z + 2, z + 30, MOON, { noTop: true });
    for (const dz of [8, 18]) { g.fillStyle = GLASS; g.beginPath(); g.moveTo(c.x - 2.2, c.ty + 30 - dz); g.lineTo(c.x - 2.2, c.ty + 26 - dz); g.lineTo(c.x - 1.4, c.ty + 24.5 - dz); g.lineTo(c.x - 0.6, c.ty + 26 - dz); g.lineTo(c.x - 0.6, c.ty + 30 - dz); g.closePath(); g.fill(); g.strokeStyle = GOLD; g.lineWidth = 0.4; g.stroke(); }
    if (o.face < 2) { const dx = o.face ? 2.5 : -4.5; g.fillStyle = DOOR; g.beginPath(); g.moveTo(c.x + dx, c.by + 1); g.lineTo(c.x + dx, c.by - 5); g.lineTo(c.x + dx + 1, c.by - 7); g.lineTo(c.x + dx + 2, c.by - 5); g.lineTo(c.x + dx + 2, c.by + 1.4); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke(); }
    /* the balcony: a ledge round the tower and a gold rail on slender posts */
    K.ell(cx, cy, z + 30, 0.38, MOON_D, 0.6);
    const [bx, by] = K.P(cx, cy, z + 30), rx = 0.38 * 16 * 1.414, ry = 0.38 * 8 * 1.414;
    g.strokeStyle = GOLD; g.lineWidth = 0.5; g.beginPath(); g.ellipse(bx, by - 2.6, rx, ry, 0, 0, Math.PI); g.stroke();
    for (let k = 1; k < 8; k++) { const a = k / 8 * Math.PI; g.beginPath(); g.moveTo(bx + Math.cos(a) * rx, by + Math.sin(a) * ry); g.lineTo(bx + Math.cos(a) * rx, by + Math.sin(a) * ry - 2.6); g.stroke(); }
    K.cyl(cx, cy, 0.2, z + 30, z + 37, MOON, { noTop: true });
    const tip = K.cone(cx, cy, 0.27, z + 37, 22, VERD);
    finial(g, tip[0], tip[1], 5);
  } },
  { id: 'flet', label: 'Tree flet', w: 1, d: 1, h: 62, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g, [tx, ty] = K.P(cx, cy, z), rnd = o.r;
    /* the great trunk rising through the platform, flaring into roots */
    g.lineCap = 'round';
    for (const [w, col] of [[6.4, INK], [5, BARK]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx, ty - 50); g.stroke(); }
    g.strokeStyle = 'rgba(120,112,96,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(tx + 1.4, ty); g.lineTo(tx + 1.4, ty - 50); g.stroke();
    for (const d of [-1, 1]) { g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.moveTo(tx + d * 2, ty - 3); g.quadraticCurveTo(tx + d * 4, ty - 0.5, tx + d * 6, ty + 0.6); g.stroke(); g.strokeStyle = BARK; g.lineWidth = 1.2; g.stroke(); }
    /* the platform on its brackets, and the round house on it */
    for (const d of [-1, 1]) { g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(tx + d * 2, ty - 12); g.lineTo(tx + d * 9, ty - 19.5); g.stroke(); }
    K.ell(cx, cy, z + 20, 0.46, '#b89a6a', 0.7);
    const [px, py] = K.P(cx, cy, z + 20), rx = 0.46 * 16 * 1.414, ry = 0.46 * 8 * 1.414;
    g.fillStyle = '#8e7048'; g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, Math.PI); g.lineTo(px - rx, py); g.ellipse(px, py + 1.6, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
    g.strokeStyle = GOLD; g.lineWidth = 0.45; g.beginPath(); g.ellipse(px, py - 2.4, rx * 0.98, ry * 0.98, 0, 0, Math.PI); g.stroke();
    const hut = K.cyl(cx, cy, 0.24, z + 20, z + 28, '#d9c49a', { noTop: true });
    g.fillStyle = DOOR; g.fillRect(hut.x - 1.5, hut.by - 5, 3, 5.2);
    const tip = K.cone(cx, cy, 0.32, z + 28, 9, VERD);
    /* the crown above: gold leaves of the mallorn */
    const B = []; for (const [dx, dy, r] of [[0, -10, 9], [-8, -4, 7], [8, -3, 7], [-3, 1, 6], [5, 2, 6]]) B.push(makeBlob(tip[0] + dx, tip[1] - 6 + dy, r, r * 0.86, rnd));
    foliage(g, B, leafPal(...TREE.mallorn), rnd, { lw: 0.44 });
    const [lx, ly] = K.P(cx + 0.26, cy + 0.26, z + 24); halo(g, lx, ly, 6, 0.6); g.fillStyle = GLOW; g.beginPath(); g.arc(lx, ly, 1, 0, TAU); g.fill();
  } }
];

/* a weeping crown: a mound of foliage with strands hanging from its rim to near the ground */
function willow(g, x, y, s, rnd) {
  const pal = leafPal(...TREE.willow);
  g.lineCap = 'round';
  for (const [w, col] of [[2.8, INK], [1.6, BARK]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 1.5, y - s * 0.5, x + 0.5, y - s * 0.9); g.stroke(); }
  const B = []; for (const [dx, dy, r] of [[0, -1.05, 0.36], [-0.32, -0.9, 0.3], [0.32, -0.88, 0.3]]) B.push(makeBlob(x + dx * s, y + dy * s, r * s, r * s * 0.7, rnd, 8));
  foliage(g, B, pal, rnd, { lw: 0.4, detail: false });
  for (let k = 0; k < 15; k++) {
    const f = k / 14, sx = x + (f - 0.5) * s * 1.15, sy = y - s * (0.82 + 0.16 * Math.sin(f * Math.PI)), len = s * (0.42 + 0.3 * Math.sin(f * Math.PI)) * (0.85 + rnd() * 0.3), bend = (f - 0.5) * 2.4;
    for (const [w, col] of [[1.5, mixHex(INK, pal.deep, 0.35)], [0.8, k % 3 ? pal.mid : pal.hi]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + bend, sy + len * 0.5, sx + bend * 0.6, sy + len); g.stroke(); }
  }
}
const NATURE = [
  { id: 'mallorn', label: 'Mallorn', w: 1, d: 1, h: 30, draw(K, o) {
    const [cx, cy] = mid(o), [x, y] = K.P(cx + (o.v - 0.5) * 0.2, cy, o.z), g = K.g, s = 18 + o.v * 3, rnd = o.r;
    g.lineCap = 'round';
    for (const [w, col] of [[3.2, INK], [2, BARK]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.95); g.stroke(); }
    g.strokeStyle = 'rgba(120,112,96,0.5)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x + 0.6, y); g.lineTo(x + 0.6, y - s * 0.9); g.stroke();
    for (const d of [-1, 1]) { g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - s * 0.62); g.quadraticCurveTo(x + d * s * 0.12, y - s * 0.72, x + d * s * 0.26, y - s * 0.8); g.stroke(); }
    const B = []; for (const [dx, dy, r] of [[0, -1.42, 0.3], [-0.28, -1.2, 0.28], [0.28, -1.18, 0.27], [-0.14, -0.96, 0.26], [0.18, -0.95, 0.25]]) B.push(makeBlob(x + dx * s, y + dy * s, r * s, r * s * 0.95, rnd));
    foliage(g, B, leafPal(...TREE.mallorn), rnd, { lw: 0.44 });
  } },
  { id: 'willow', label: 'Silver willow', w: 1, d: 1, h: 22, draw(K, o) { const [cx, cy] = mid(o), [x, y] = K.P(cx + (o.v - 0.5) * 0.16, cy, o.z); willow(K.g, x, y, 15 + o.v * 3, o.r); } },
  { id: 'moonflowers', label: 'Moonflowers', w: 1, d: 1, h: 3, draw(K, o) {
    const g = K.g;
    for (let k = 0; k < 9; k++) {
      const [px, py] = K.P(o.x0 + 0.14 + o.r() * 0.72, o.y0 + 0.14 + o.r() * 0.72, o.z);
      if (k % 3 === 0) halo(g, px, py - 2.6, 4, 0.35);
      g.strokeStyle = '#5c773f'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 2.4); g.stroke();
      g.fillStyle = '#f4f6f2'; for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; g.beginPath(); g.arc(px + Math.cos(a) * 0.9, py - 2.6 + Math.sin(a) * 0.6, 0.55, 0, TAU); g.fill(); }
      g.fillStyle = '#9fb8dc'; g.fillRect(px - 0.35, py - 2.95, 0.7, 0.7);
    }
  } }
];

const PROPS = [
  { id: 'elvenlantern', label: 'Elven lantern', w: 1, d: 1, h: 14, draw(K, o) {
    const [cx, cy] = mid(o), [px, py] = K.P(cx, cy, o.z), g = K.g, d = o.face % 2 ? 1 : -1;
    halo(g, px + d * 3.6, py - 10, 11);
    /* a slender silver post curling over into a crook, the lantern hanging from its end */
    g.lineCap = 'round';
    for (const [w, col] of [[1.5, INK], [0.7, '#cfd2cc']]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 13); g.quadraticCurveTo(px, py - 16, px + d * 2.4, py - 16); g.quadraticCurveTo(px + d * 4.2, py - 15.6, px + d * 3.8, py - 13.4); g.stroke(); }
    const lx = px + d * 3.8, ly = py - 10.4;
    g.beginPath(); g.moveTo(lx, ly - 3); g.quadraticCurveTo(lx + 2, ly - 0.6, lx, ly + 1.8); g.quadraticCurveTo(lx - 2, ly - 0.6, lx, ly - 3); g.fillStyle = GLOW; g.fill(); g.strokeStyle = GOLD; g.lineWidth = 0.5; g.stroke();
    g.beginPath(); g.ellipse(px, py, 1.6, 0.8, 0, 0, TAU); g.fillStyle = '#cfd2cc'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke();
  } },
  { id: 'moonwell', label: 'Moonwell', w: 1, d: 1, h: 8, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g;
    const c = K.cyl(cx, cy, 0.34, z, z + 2.6, MOON, { top: MOON_D });
    g.beginPath(); g.ellipse(c.x, c.ty, c.rx * 0.76, c.ry * 0.76, 0, 0, TAU); g.fillStyle = '#9fd0c4'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
    halo(g, c.x, c.ty - 1, 10, 0.5);
    g.fillStyle = '#f4fbf6'; for (const [dx, dy] of [[-2, -0.5], [1.6, 0.8], [0.4, -1.2]]) g.fillRect(c.x + dx - 0.4, c.ty + dy - 0.4, 0.8, 0.8);
    /* two carved posts at the back of the rim, each crowned with a leaf */
    for (const [dx, dy] of [[-0.26, -0.18], [0.18, -0.26]]) { const p = K.P(cx + dx, cy + dy, z + 2.6); g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0], p[1] - 6); g.stroke(); g.strokeStyle = MOON; g.lineWidth = 0.8; g.stroke(); finial(g, p[0], p[1] - 6, 0); }
    g.strokeStyle = GOLD; g.lineWidth = 0.4; g.beginPath(); g.ellipse(c.x, c.by - 1.3, c.rx, c.ry, 0, 0.15, Math.PI - 0.15); g.stroke();
  } }
];

BUILDINGS.push(...HIGH);

export { BUILDINGS as ELVEN_BUILDINGS, NATURE as ELVEN_NATURE, PROPS as ELVEN_PROPS };
