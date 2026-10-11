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
/* lancet windows: pointed arches of teal glass along a seen wall */
function lancets(K, fc, c, a0, a1, z, n, h = 6, w = 0.1) {
  const g = K.g;
  for (let k = 0; k < n; k++) {
    const m = a0 + (a1 - a0) * (k + 0.5) / n, pt = (a, zz) => K.P(...(fc === 'y' ? [a, c, zz] : [c, a, zz]));
    const p = pt(m - w / 2, z), q = pt(m + w / 2, z), r = pt(m + w / 2, z + h * 0.7), s = pt(m - w / 2, z + h * 0.7), tip = pt(m, z + h);
    g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(s[0], s[1]); g.quadraticCurveTo(s[0], tip[1] + 1, tip[0], tip[1]); g.quadraticCurveTo(r[0], tip[1] + 1, r[0], r[1]); g.lineTo(q[0], q[1]); g.closePath();
    g.fillStyle = fc === 'y' ? GLASS : shade(GLASS, 0.8); g.fill(); g.strokeStyle = GOLD; g.lineWidth = 0.5; g.stroke();
  }
}
/* a leaf-pointed door on the seen wall the piece faces */
function leafDoor(K, o, x0, y0, x1, y1, z, h = 8) {
  const fc = o.face === 0 ? 'y' : o.face === 1 ? 'x' : null; if (!fc) return;
  const c = fc === 'y' ? y1 : x1, m = fc === 'y' ? (x0 + x1) / 2 : (y0 + y1) / 2;
  K.door(fc, c, m, z, DOOR, 0.24, h);
  const [px, py] = K.P(...(fc === 'y' ? [m, c, z + h + 2.2] : [c, m, z + h + 2.2])); finial(K.g, px, py + 1, 0);
}

const BUILDINGS = [
  { id: 'elvenhall', label: 'Elven hall', w: 2, d: 1, h: 34, draw(K, o) {
    const x0 = o.x0 + 0.14, y0 = o.y0 + 0.14, x1 = o.x1 - 0.14, y1 = o.y1 - 0.14, z = o.z, g = K.g, hw = 13;
    K.box(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, z, z + 1.6, MOON_D);
    K.box(x0, y0, x1, y1, z + 1.6, z + hw, MOON, { noTop: true }); K.courses('y', y1, x0, x1, z + 1.6, z + hw, 'rgba(110,104,88,0.22)'); K.courses('x', x1, y0, y1, z + 1.6, z + hw, 'rgba(110,104,88,0.22)');
    lancets(K, 'y', y1, x0, x1, z + 4, Math.max(1, Math.round((x1 - x0) / 0.36))); lancets(K, 'x', x1, y0, y1, z + 4, Math.max(1, Math.round((y1 - y0) / 0.36)));
    leafDoor(K, o, x0, y0, x1, y1, z + 1.6, 8.5);
    /* a gold string course under the eaves */
    K.seg([x0, y1, z + hw - 0.8], [x1, y1, z + hw - 0.8], GOLD, 0.8); K.seg([x1, y1, z + hw - 0.8], [x1, y0, z + hw - 0.8], shade(GOLD, 0.8), 0.8);
    K.gable(x0, y0, x1, y1, z + hw, 14, o.axis, VERD, MOON, { ov: 0.12, tex: 'slate' });
    /* finials at the ridge's ends and the eaves' tips curling up */
    const ax = o.axis === 'x', ends = ax ? [[x0 - 0.1, (y0 + y1) / 2], [x1 + 0.1, (y0 + y1) / 2]] : [[(x0 + x1) / 2, y0 - 0.1], [(x0 + x1) / 2, y1 + 0.1]];
    for (const [x, y] of ends) { const [px, py] = K.P(x, y, z + hw + 14); finial(g, px, py, 6); }
    for (const [x, y] of [[x1 + 0.12, y1 + 0.12], [ax ? x0 - 0.12 : x1 + 0.12, ax ? y1 + 0.12 : y0 - 0.12]]) { const [px, py] = K.P(x, y, z + hw); g.strokeStyle = GOLD; g.lineWidth = 0.9; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + 2, py - 0.5, px + 2.4, py - 3); g.stroke(); }
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

export { BUILDINGS as ELVEN_BUILDINGS, NATURE as ELVEN_NATURE, PROPS as ELVEN_PROPS };
