import { TAU } from '../core/geometry.js';
import { INK, TREE, castShadow, hexRgb, lerp } from './palette.js';

/* ---------- trees ---------- */
function crown(g, cx, cy, rx, ry, bl) {
  const n = bl.length; g.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = k / n * TAU - Math.PI / 2, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    if (!k) { g.moveTo(px, py); continue; }
    const am = (k - 0.5) / n * TAU - Math.PI / 2, b = bl[k - 1];
    g.quadraticCurveTo(cx + Math.cos(am) * rx * b, cy + Math.sin(am) * ry * b, px, py);
  }
  g.closePath();
}
/* ---- foliage: clustered canopies with lit volume, leaf clumps and a single ink silhouette ---- */
function mixHex(a, b, t) { const A = hexRgb(a), Bc = hexRgb(b); return '#' + A.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (Bc[i] - v) * t))).toString(16).padStart(2, '0')).join(''); }
const _leafPals = new Map();
function leafPal(base, shade) { const k = base + shade; let p = _leafPals.get(k); if (!p) { p = { hi: mixHex(base, '#fff2c4', 0.3), mid: base, lo: shade, deep: mixHex(shade, '#1c2812', 0.45) }; _leafPals.set(k, p); } return p; }
function makeBlob(cx, cy, rx, ry, rnd, n) { n = n || 8 + Math.floor(rnd() * 4); return { cx, cy, rx, ry, a0: rnd() * TAU, bl: Array.from({ length: n }, () => 1.07 + rnd() * 0.24) }; }
function blobPath(g, b) {
  const n = b.bl.length; g.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = k / n * TAU + b.a0, px = b.cx + Math.cos(a) * b.rx, py = b.cy + Math.sin(a) * b.ry;
    if (!k) { g.moveTo(px, py); continue; }
    const am = (k - 0.5) / n * TAU + b.a0, f = b.bl[k - 1];
    g.quadraticCurveTo(b.cx + Math.cos(am) * b.rx * f, b.cy + Math.sin(am) * b.ry * f, px, py);
  }
  g.closePath();
}
function foliage(g, blobs, pal, rnd, o = {}) {
  const lw = o.lw || 0.46, detail = o.detail !== false, edge = mixHex(INK, pal.deep, 0.35);
  g.lineJoin = 'round'; g.lineCap = 'round';
  // one silhouette: stroke every lobe wide, then fill over the inner strokes
  for (const b of blobs) { blobPath(g, b); g.strokeStyle = edge; g.lineWidth = lw * 2; g.stroke(); }
  for (const b of blobs) {
    blobPath(g, b); g.fillStyle = pal.lo; g.fill();
    g.save(); blobPath(g, b); g.clip();
    g.beginPath(); g.ellipse(b.cx - b.rx * 0.26, b.cy - b.ry * 0.3, b.rx * 0.98, b.ry * 0.9, 0, 0, TAU); g.fillStyle = pal.mid; g.fill();
    g.globalAlpha = 0.6; g.beginPath(); g.ellipse(b.cx - b.rx * 0.42, b.cy - b.ry * 0.5, b.rx * 0.52, b.ry * 0.42, -0.4, 0, TAU); g.fillStyle = pal.hi; g.fill();
    g.globalAlpha = 0.38; g.beginPath(); g.ellipse(b.cx + b.rx * 0.48, b.cy + b.ry * 0.58, b.rx * 0.72, b.ry * 0.5, -0.3, 0, TAU); g.fillStyle = pal.deep; g.fill();
    g.globalAlpha = 1;
    if (detail) {
      const n = Math.max(3, Math.min(26, Math.round(b.rx * b.ry / 6)));
      for (let k = 0; k < n; k++) {
        const u = rnd() * 2 - 1, v = rnd() * 2 - 1; if (u * u + v * v > 0.92) continue;
        const px = b.cx + u * b.rx * 0.86, py = b.cy + v * b.ry * 0.86, r = 1.1 + rnd() * Math.min(1.7, b.rx * 0.17);
        g.beginPath();
        if (u + v < -0.25) { g.arc(px, py, r, Math.PI * 1.08, Math.PI * 1.92); g.strokeStyle = pal.hi; g.lineWidth = 0.8; g.globalAlpha = 0.85; }
        else { g.arc(px, py, r, Math.PI * 0.08, Math.PI * 0.92); g.strokeStyle = pal.deep; g.lineWidth = 0.75; g.globalAlpha = u + v > 0.4 ? 0.75 : 0.5; }
        g.stroke();
      }
      g.globalAlpha = 0.9; g.fillStyle = pal.hi;
      for (let k = 0; k < 3; k++) { const px = b.cx - b.rx * (0.15 + rnd() * 0.5), py = b.cy - b.ry * (0.15 + rnd() * 0.5); g.beginPath(); g.arc(px, py, 0.55 + rnd() * 0.5, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    }
    // soft dark rim along each lobe's lower right, so overlapping lobes read apart without ink
    g.beginPath(); g.rect(b.cx - b.rx * 0.1, b.cy - b.ry * 0.15, b.rx * 2, b.ry * 2); g.clip();
    blobPath(g, b); g.strokeStyle = pal.deep; g.globalAlpha = 0.5; g.lineWidth = 1.5; g.stroke(); g.globalAlpha = 1;
    g.restore();
  }
}
function trunkStroke(g, x, y, h, lean, white, w = 1) {
  g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.3, y - h * 0.5, x + lean, y - h);
  g.strokeStyle = INK; g.lineWidth = (white ? 2.4 : 2.2) * w; g.stroke();
  g.strokeStyle = white ? '#f2ede0' : '#6e5236'; g.lineWidth = (white ? 1.2 : 1.05) * w; g.stroke();
  if (!white) { g.beginPath(); g.moveTo(x - 0.35 * w, y); g.quadraticCurveTo(x + lean * 0.3 - 0.35 * w, y - h * 0.5, x + lean - 0.35 * w, y - h); g.strokeStyle = 'rgba(190,160,120,0.6)'; g.lineWidth = 0.4 * w; g.stroke(); }
  else { g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); for (const f of [0.25, 0.48, 0.72]) { const yy = y - h * f, xx = x + lean * f; g.moveTo(xx - 0.7, yy); g.lineTo(xx + 0.4, yy + 0.3); } g.stroke(); }
}
function branchFork(g, x, y, s, lean) {
  g.strokeStyle = INK; g.lineWidth = 0.9; g.lineCap = 'round'; g.beginPath();
  g.moveTo(x + lean * 0.5, y - s * 0.4); g.quadraticCurveTo(x + lean * 0.5 - s * 0.12, y - s * 0.55, x + lean * 0.5 - s * 0.24, y - s * 0.66);
  g.moveTo(x + lean * 0.6, y - s * 0.46); g.quadraticCurveTo(x + lean * 0.6 + s * 0.1, y - s * 0.58, x + lean * 0.6 + s * 0.22, y - s * 0.62);
  g.stroke();
}
// deciduous tree used on the realm map and in the key
function drawTree(g, x, y, s, sp, rnd) {
  const pal = TREE[sp] || TREE.oak, LP = leafPal(pal[0], pal[1]);
  const poplar = sp === 'poplar', bush = sp === 'bush', birch = sp === 'birch';
  castShadow(g, x + s * 0.12, y, s * (bush ? 1.05 : 0.95), s * 0.22);
  const lean = (rnd() - 0.5) * s * 0.12, B = [];
  if (bush) { for (const [dx, dy, r] of [[-0.24, -0.22, 0.3], [0.24, -0.2, 0.28], [0, -0.36, 0.32]]) B.push(makeBlob(x + dx * s, y + dy * s, r * s, r * s * 0.82, rnd, 7)); }
  else if (poplar) { trunkStroke(g, x, y, s * 0.35, 0, false, 0.85); for (const [dy, r, ry] of [[-0.48, 0.27, 0.32], [-0.9, 0.25, 0.36], [-1.28, 0.19, 0.32]]) B.push(makeBlob(x, y + dy * s, r * s, ry * s, rnd, 7)); B.reverse(); }
  else if (birch) { trunkStroke(g, x, y, s * 0.9, lean, true, 0.85); for (const [dx, dy, r] of [[0, -1.22, 0.26], [-0.22, -0.98, 0.26], [0.22, -1.0, 0.24], [0.02, -0.78, 0.2]]) B.push(makeBlob(x + lean + dx * s, y + dy * s, r * s, r * s * 1.1, rnd, 7)); }
  else {
    trunkStroke(g, x, y, s * 0.55, lean, false, 0.9); branchFork(g, x, y, s, lean);
    const cx = x + lean, cy = y - s * 0.98;
    for (const [dx, dy, r] of [[0, -0.28, 0.42], [-0.34, 0.02, 0.37], [0.34, 0.04, 0.36], [0.02, 0.24, 0.34]]) B.push(makeBlob(cx + dx * s, cy + dy * s, r * s, r * s * 0.92, rnd));
  }
  foliage(g, B, LP, rnd, { lw: 0.44 });
}
// conifer with drooping tiers, toothed fringes and needle strokes
function drawPine(g, x, y, s, rnd, snow, pal) {
  pal = pal || TREE.pine;
  const LP = leafPal(pal[0], pal[1]), h = s * (1.75 + rnd() * 0.4), w = s * 1.0, base = y - s * 0.15, T = 4;
  castShadow(g, x + s * 0.1, y, s * 0.85, s * 0.2);
  g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x, base); g.strokeStyle = INK; g.lineWidth = 2.1; g.stroke(); g.strokeStyle = '#6e5236'; g.lineWidth = 1; g.stroke();
  for (let t = 0; t < T; t++) {
    const f = t / T, ty = lerp(base, y - h * 0.82, f), tw = w / 2 * (1 - f * 0.72) * (0.92 + rnd() * 0.16), th = h / T * 1.5, tip = t === T - 1 ? y - h : ty - th, droop = th * 0.16;
    const n = Math.max(4, Math.round(tw * 2 / 2.1));
    const path = () => {
      g.beginPath(); g.moveTo(x, tip);
      g.quadraticCurveTo(x - tw * 0.38, ty - th * 0.38, x - tw, ty + droop);
      for (let k = 1; k <= n; k++) {
        const fx = k / n, px = lerp(x - tw, x + tw, fx), arc = Math.sin(fx * Math.PI) * droop * 0.9;
        const mx = lerp(x - tw, x + tw, fx - 0.5 / n);
        g.lineTo(mx, ty + droop - arc + 1.3); g.lineTo(px, ty + droop - arc - (k < n ? 0.5 : 0));
      }
      g.quadraticCurveTo(x + tw * 0.38, ty - th * 0.38, x, tip); g.closePath();
    };
    path(); g.strokeStyle = mixHex(INK, LP.deep, 0.3); g.lineWidth = 1.1; g.stroke();
    path(); g.fillStyle = LP.mid; g.fill();
    g.save(); path(); g.clip();
    g.fillStyle = LP.lo; g.globalAlpha = 0.85; g.fillRect(x + 0.4, tip - 2, tw + 3, th + droop + 6);
    g.fillStyle = LP.hi; g.globalAlpha = 0.3; g.beginPath(); g.moveTo(x - 0.3, tip + 1); g.quadraticCurveTo(x - tw * 0.3, ty - th * 0.3, x - tw * 0.75, ty + droop * 0.2); g.lineTo(x - 0.3, ty - th * 0.1); g.closePath(); g.fill();
    g.fillStyle = LP.deep; g.globalAlpha = 0.28; g.fillRect(x - tw - 2, ty + droop - 2, tw * 2 + 4, 3.6); g.globalAlpha = 1;
    g.strokeStyle = LP.hi; g.lineWidth = 0.6; g.globalAlpha = 0.95; g.beginPath();
    for (let k = 1; k <= 3; k++) { const sx = x - 0.6, sy = lerp(tip, ty, k / 4); g.moveTo(sx, sy); g.lineTo(sx - tw * 0.55 * (k / 3), sy + th * 0.22); }
    g.stroke();
    g.strokeStyle = LP.deep; g.globalAlpha = 0.4; g.beginPath();
    for (let k = 1; k <= 3; k++) { const sx = x + 0.8, sy = lerp(tip, ty, k / 4); g.moveTo(sx, sy); g.lineTo(sx + tw * 0.55 * (k / 3), sy + th * 0.22); }
    g.stroke(); g.globalAlpha = 1;
    if (snow) { g.strokeStyle = '#f8f5ec'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, tip + 0.5); g.quadraticCurveTo(x - tw * 0.38, ty - th * 0.36, x - tw * 0.85, ty + droop * 0.4); g.moveTo(x + 0.5, tip + 1); g.quadraticCurveTo(x + tw * 0.3, ty - th * 0.36, x + tw * 0.45, ty - th * 0.12); g.stroke(); }
    g.restore();
  }
}
function drawPalm(g, x, y, s, rnd) {
  const tx = x + s * 0.22 * (rnd() < 0.5 ? 1 : -1), ty = y - s * 1.35;
  castShadow(g, x + s * 0.3, y, s * 0.9, s * 0.2);
  g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - (tx - x) * 0.6, y - s * 0.7, tx, ty);
  g.strokeStyle = INK; g.lineWidth = 2.8; g.stroke(); g.strokeStyle = '#9a7646'; g.lineWidth = 1.5; g.stroke();
  [-165, -125, -60, -20, 160].forEach(d => {
    const a = d * Math.PI / 180, L = s * (0.6 + rnd() * 0.15), px = tx + Math.cos(a) * L, py = ty + Math.sin(a) * L + L * 0.45;
    const nx = -Math.sin(a) * s * 0.12, ny = Math.cos(a) * s * 0.12, mx = (tx + px) / 2, my = (ty + py) / 2 - L * 0.12;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx + nx, my + ny, px, py); g.quadraticCurveTo(mx - nx, my - ny, tx, ty);
    g.fillStyle = d > -90 && d < 90 ? '#5f7b3d' : '#7f9c4e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
  });
}
function drawSnag(g, x, y, s) {
  castShadow(g, x + s * 0.1, y, s * 0.5, s * 0.14);
  g.strokeStyle = '#4a3a28'; g.lineCap = 'round'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.05, y - s * 1.1);
  g.moveTo(x + s * 0.02, y - s * 0.55); g.lineTo(x - s * 0.3, y - s * 0.85); g.lineTo(x - s * 0.36, y - s * 1.0);
  g.moveTo(x + s * 0.04, y - s * 0.75); g.lineTo(x + s * 0.3, y - s * 1.0);
  g.stroke(); g.lineWidth = 0.7; g.beginPath(); g.moveTo(x - s * 0.3, y - s * 0.85); g.lineTo(x - s * 0.18, y - s * 1.05); g.moveTo(x + s * 0.22, y - s * 0.92); g.lineTo(x + s * 0.36, y - s * 0.9); g.stroke();
}

export { branchFork, drawPalm, drawPine, drawSnag, drawTree, foliage, leafPal, makeBlob, mixHex, trunkStroke };
