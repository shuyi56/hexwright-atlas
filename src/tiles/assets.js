import { R, TAU } from '../core/geometry.js';
import { GOLD, INK, ROOFS, WAX } from '../render/palette.js';
import { drawSettlement } from '../render/settlements.js';
import { drawPalm, drawPine, drawSnag, drawTree, mixHex } from '../render/trees.js';
import { shade } from './kit.js';

/* ================= placeable assets: buildings, props and nature =================
   Each asset has a footprint (w x d tiles, before turning), a shadow height `h`, and
   draw(K, o) where K is the iso kit and o = { x0, y0, x1, y1, z, face, axis, r, v, clim }.
   face 0..3 puts the door on the +y, +x, -y or -x side; only +y and +x are visible. */
const SLATE = ['#6d7a86', '#4d5862'], THATCH = '#c9a463', SHINGLE = '#7d6a55', PLANK = '#9a7650', PLANK_D = '#7a5a3a', STONE = '#d8cfb9', STONE_D = '#c4b99f';
const WALLS = ['#efe3c4', '#e9d6ae', '#e6cfa6', '#f0e4c6'];
const pickv = (a, v) => a[Math.floor(v * a.length) % a.length];
const inset = (o, k) => [o.x0 + k, o.y0 + k, o.x1 - k, o.y1 - k];
const mid = o => [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2];
/* the visible wall the door sits on, or null when it faces away */
const doorWall = (o, x0, y0, x1, y1) => o.face === 0 ? ['y', y1, (x0 + x1) / 2] : o.face === 1 ? ['x', x1, (y0 + y1) / 2] : null;
const sx = (K, x, y, z) => K.P(x, y, z);

function house(K, o, { wall, roof, h, rh, tex = 'tiles', timber = false, chimney = 0, ins = 0.14, hip = false, floors = 1 }) {
  const [x0, y0, x1, y1] = inset(o, ins), z = o.z;
  K.box(x0, y0, x1, y1, z, z + h, wall, { noTop: true });
  if (timber) { K.timber('y', y1, x0, x1, z, z + h); K.timber('x', x1, y0, y1, z, z + h); }
  const fl = h / floors;
  for (let f = 0; f < floors; f++) { const wz = z + fl * f + fl * 0.42; K.windows('y', y1, x0, x1, wz, Math.max(1, Math.round((x1 - x0) / 0.45))); K.windows('x', x1, y0, y1, wz, Math.max(1, Math.round((y1 - y0) / 0.45)), '#251d16'); }
  const dw = doorWall(o, x0, y0, x1, y1); if (dw) K.door(dw[0], dw[1], dw[2], z);
  if (hip) K.hip(x0, y0, x1, y1, z + h, rh, roof, { tex }); else K.gable(x0, y0, x1, y1, z + h, rh, o.axis, roof, wall, { tex });
  if (chimney) { const cx = x0 + (x1 - x0) * 0.72, cy = y0 + (y1 - y0) * 0.6; K.box(cx - 0.07, cy - 0.07, cx + 0.07, cy + 0.07, z + h + rh * 0.4, z + h + rh + 3, '#b9a98a'); if (chimney > 1) { const [px, py] = sx(K, cx, cy, z + h + rh + 3); K.smoke(px, py); } }
  return [x0, y0, x1, y1];
}

const BUILDINGS = [
  { id: 'cottage', label: 'Thatched cottage', w: 1, d: 1, h: 16, draw(K, o) { house(K, o, { wall: pickv(WALLS, o.v), roof: THATCH, h: 8, rh: 8, tex: 'thatch', chimney: o.v > 0.5 ? 2 : 1 }); } },
  { id: 'townhouse', label: 'Timber townhouse', w: 1, d: 1, h: 26, draw(K, o) { house(K, o, { wall: pickv(['#f0e4c6', '#ecd2a2', '#e9c4b2'], o.v), roof: ROOFS[0][0], h: 18, rh: 9, timber: true, floors: 2, chimney: 1, ins: 0.1 }); } },
  { id: 'longhouse', label: 'Longhouse', w: 2, d: 1, h: 16, draw(K, o) { const [x0, y0, x1, y1] = house(K, o, { wall: '#c7b28a', roof: THATCH, h: 7, rh: 10, tex: 'thatch', timber: true, ins: 0.12 }); const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2]; const [px, py] = sx(K, cx, cy, o.z + 17); K.smoke(px, py); } },
  { id: 'barn', label: 'Barn', w: 2, d: 1, h: 20, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.1), z = o.z, col = '#a4553b';
    K.box(x0, y0, x1, y1, z, z + 10, col, { noTop: true });
    const g = K.g; g.strokeStyle = 'rgba(50,25,15,0.35)'; g.lineWidth = 0.4; g.beginPath();
    for (let a = x0 + 0.1; a < x1; a += 0.12) { const p = sx(K, a, y1, z), q = sx(K, a, y1, z + 10); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
    for (let a = y0 + 0.1; a < y1; a += 0.12) { const p = sx(K, x1, a, z), q = sx(K, x1, a, z + 10); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
    g.stroke();
    const dw = o.face === 0 || o.face === 2 ? ['y', y1, (x0 + x1) / 2] : ['x', x1, (y0 + y1) / 2], hw = 0.28;
    K.onWall(dw[0], dw[1], dw[2] - hw, dw[2] + hw, z, z + 8, '#6e3a28', 0.6);
    const a = dw[0] === 'y' ? [[dw[2] - hw, dw[1], z], [dw[2] + hw, dw[1], z + 8]] : [[dw[1], dw[2] - hw, z], [dw[1], dw[2] + hw, z + 8]];
    K.seg(a[0], a[1], '#f0e6cb', 0.7); K.seg([a[0][0], a[0][1], z + 8], [a[1][0], a[1][1], z], '#f0e6cb', 0.7);
    K.gable(x0, y0, x1, y1, z + 10, 11, o.axis, SHINGLE, col, { tex: 'shingle' });
  } },
  { id: 'granary', label: 'Raised granary', w: 1, d: 1, h: 18, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.2), z = o.z;
    for (const [x, y] of [[x0 + 0.08, y0 + 0.08], [x1 - 0.08, y0 + 0.08], [x0 + 0.08, y1 - 0.08], [x1 - 0.08, y1 - 0.08]]) { K.box(x - 0.04, y - 0.04, x + 0.04, y + 0.04, z, z + 3, STONE_D, { lw: 0.4 }); K.ell(x, y, z + 3.3, 0.08, STONE, 0.4); }
    K.box(x0, y0, x1, y1, z + 3.5, z + 10, PLANK, { noTop: true }); K.timber('y', y1, x0, x1, z + 3.5, z + 10, '#5a3f28');
    K.hip(x0, y0, x1, y1, z + 10, 8, THATCH, { tex: 'thatch', ov: 0.12 });
  } },
  { id: 'smithy', label: 'Smithy', w: 1, d: 1, h: 18, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.12), z = o.z, g = K.g;
    K.box(x0, y0, x1, y1, z, z + 8, STONE, { noTop: true }); K.courses('y', y1, x0, x1, z, z + 8); K.courses('x', x1, y0, y1, z, z + 8);
    const fc = o.face === 1 || o.face === 3 ? 'x' : 'y', c = fc === 'y' ? y1 : x1, m = fc === 'y' ? (x0 + x1) / 2 : (y0 + y1) / 2;
    K.onWall(fc, c, m - 0.2, m + 0.2, z, z + 4.5, '#3a2416', 0.5);
    const [gx, gy] = sx(K, ...(fc === 'y' ? [m, c, z + 2] : [c, m, z + 2]));
    const gl = g.createRadialGradient(gx, gy, 0, gx, gy, 9); gl.addColorStop(0, 'rgba(255,170,60,0.9)'); gl.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gl; g.beginPath(); g.arc(gx, gy, 9, 0, TAU); g.fill();
    K.gable(x0, y0, x1, y1, z + 8, 7, o.axis, SLATE[0], STONE);
    const cx = x0 + 0.18, cy = y0 + 0.2; K.box(cx - 0.1, cy - 0.1, cx + 0.1, cy + 0.1, z + 6, z + 22, '#a99f8c'); const [px, py] = sx(K, cx, cy, z + 22); K.smoke(px, py); K.smoke(px + 2, py - 6);
  } },
  { id: 'tavern', label: 'Tavern', w: 2, d: 1, h: 30, draw(K, o) {
    const [x0, y0, x1, y1] = house(K, o, { wall: '#efdfc0', roof: ROOFS[0][0], h: 18, rh: 10, timber: true, floors: 2, hip: true, chimney: 2, ins: 0.08 });
    const g = K.g, fc = o.axis === 'x' ? 'y' : 'x', p = fc === 'y' ? sx(K, x0 + 0.25, y1 + 0.02, o.z + 13) : sx(K, x1 + 0.02, y0 + 0.25, o.z + 13);
    g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + (fc === 'y' ? -5 : 5), p[1] + 2.5); g.stroke();
    const q = [p[0] + (fc === 'y' ? -5 : 5), p[1] + 2.5]; g.fillStyle = '#7a4a2a'; g.fillRect(q[0] - 2.2, q[1], 4.4, 4); g.strokeRect(q[0] - 2.2, q[1], 4.4, 4); g.fillStyle = GOLD; g.beginPath(); g.arc(q[0], q[1] + 2, 1.1, 0, TAU); g.fill();
  } },
  { id: 'chapel', label: 'Chapel', w: 2, d: 1, h: 34, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.12), z = o.z, ax = o.axis === 'x';
    const tw = 0.62, [tx0, ty0, tx1, ty1] = ax ? [x1 - tw, y0 + 0.02, x1, y1 - 0.02] : [x0 + 0.02, y1 - tw, x1 - 0.02, y1];
    const [nx0, ny0, nx1, ny1] = ax ? [x0, y0 + 0.08, x1 - tw, y1 - 0.08] : [x0 + 0.08, y0, x1 - 0.08, y1 - tw];
    K.box(nx0, ny0, nx1, ny1, z, z + 11, '#ebe2cc', { noTop: true }); K.courses('y', ny1, nx0, nx1, z, z + 11); K.courses('x', nx1, ny0, ny1, z, z + 11);
    for (let k = 0; k < 3; k++) { const f = (k + 0.5) / 3; if (ax) K.onWall('y', ny1, nx0 + (nx1 - nx0) * f - 0.06, nx0 + (nx1 - nx0) * f + 0.06, z + 3, z + 8.5, '#4b5a6e', 0.4); else K.onWall('x', nx1, ny0 + (ny1 - ny0) * f - 0.06, ny0 + (ny1 - ny0) * f + 0.06, z + 3, z + 8.5, '#4b5a6e', 0.4); }
    K.gable(nx0, ny0, nx1, ny1, z + 11, 9, o.axis, SLATE[0], '#ebe2cc');
    K.box(tx0, ty0, tx1, ty1, z, z + 22, '#e2d8c0', { noTop: true }); K.courses('y', ty1, tx0, tx1, z, z + 22); K.courses('x', tx1, ty0, ty1, z, z + 22);
    const bm = ax ? ['y', ty1, (tx0 + tx1) / 2] : ['x', tx1, (ty0 + ty1) / 2]; K.onWall(bm[0], bm[1], bm[2] - 0.1, bm[2] + 0.1, z + 16, z + 20, '#2f271f', 0);
    K.door(bm[0], bm[1], bm[2], z, '#4a3524', 0.2, 6);
    K.hip(tx0, ty0, tx1, ty1, z + 22, 14, SLATE[0], { ov: 0.05 });
    const [px, py] = sx(K, (tx0 + tx1) / 2, (ty0 + ty1) / 2, z + 36); const g = K.g; g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(px, py + 1); g.lineTo(px, py - 5); g.moveTo(px - 2, py - 3); g.lineTo(px + 2, py - 3); g.stroke();
  } },
  { id: 'watchtower', label: 'Wooden watchtower', w: 1, d: 1, h: 36, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.24), z = o.z, zp = z + 22, g = K.g;
    const legs = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); for (const [x, y] of legs) { const a = sx(K, x, y, z), b = sx(K, x, y, zp); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } g.stroke();
    g.strokeStyle = '#7a5a3a'; g.lineWidth = 0.8; g.stroke();
    g.strokeStyle = 'rgba(60,40,25,0.8)'; g.lineWidth = 0.5; g.beginPath(); for (const [a, b] of [[legs[2], legs[3]], [legs[1], legs[3]]]) { const p = sx(K, a[0], a[1], z + 2), q = sx(K, b[0], b[1], zp - 2), p2 = sx(K, b[0], b[1], z + 2), q2 = sx(K, a[0], a[1], zp - 2); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.moveTo(p2[0], p2[1]); g.lineTo(q2[0], q2[1]); } g.stroke();
    K.box(x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08, zp, zp + 1.5, PLANK_D);
    K.box(x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, zp + 1.5, zp + 5, PLANK, { noTop: true });
    K.hip(x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, zp + 9, 6, THATCH, { tex: 'thatch', ov: 0.06 });
    g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); for (const [x, y] of [[x1, y1], [x1, y0], [x0, y1]]) { const a = sx(K, x, y, zp + 5), b = sx(K, x, y, zp + 9); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } g.stroke();
    if (o.v > 0.3) { const [fx, fy] = sx(K, (x0 + x1) / 2, (y0 + y1) / 2, zp + 15); K.flag(fx, fy, 7, WAX); }
  } },
  { id: 'stonetower', label: 'Stone tower', w: 1, d: 1, h: 46, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, c = K.cyl(cx, cy, 0.36, z, z + 32, '#e2d8c0', { noTop: true }), g = K.g;
    g.fillStyle = '#2f271f'; g.fillRect(c.x - 3, c.ty + 9, 1.4, 3.6); g.fillRect(c.x - 1, c.ty + 20, 1.4, 3.6);
    if (o.v < 0.5) { K.cone(cx, cy, 0.42, z + 32, 18, SLATE[0]); if (o.v < 0.25) K.flag(c.x, c.ty - 18, 9, GOLD); }
    else { g.beginPath(); g.ellipse(c.x, c.ty, c.rx, c.ry, 0, 0, TAU); g.fillStyle = '#cbc0a4'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke(); for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * TAU, px = c.x + Math.cos(a) * c.rx, py = c.ty + Math.sin(a) * c.ry; g.fillStyle = Math.cos(a) > 0.3 ? '#b9ae94' : '#ddd3bb'; g.fillRect(px - 1.5, py - 3, 3, 3); g.strokeRect(px - 1.5, py - 3, 3, 3); } K.flag(c.x, c.ty, 12, WAX); }
  } },
  { id: 'keep', label: 'Stone keep', w: 2, d: 2, h: 42, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.18), z = o.z, zt = z + 32;
    K.box(x0, y0, x1, y1, z, zt, STONE); K.courses('y', y1, x0, x1, z, zt); K.courses('x', x1, y0, y1, z, zt);
    K.windows('y', y1, x0, x1, z + 14, 3, '#2f271f', 4); K.windows('x', x1, y0, y1, z + 14, 3, '#251d16', 4); K.windows('y', y1, x0, x1, z + 24, 3, '#2f271f', 4); K.windows('x', x1, y0, y1, z + 24, 3, '#251d16', 4);
    const dw = doorWall(o, x0, y0, x1, y1); if (dw) K.door(dw[0], dw[1], dw[2], z, '#3a2a1c', 0.36, 9);
    K.merlons(x0, y0, x1, y1, zt, STONE, 0.3);
    const [cx, cy] = mid(o), [fx, fy] = sx(K, cx, cy, zt); K.flag(fx, fy, 16, WAX);
  } },
  { id: 'lighthouse', label: 'Lighthouse', w: 1, d: 1, h: 58, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g;
    K.box(cx - 0.42, cy - 0.42, cx + 0.42, cy + 0.42, z, z + 4, STONE_D);
    const c = K.cyl(cx, cy, 0.3, z + 4, z + 44, '#f1ebdc', { noTop: true });
    g.save(); g.beginPath(); g.rect(c.x - c.rx - 1, c.ty, c.rx * 2 + 2, c.by - c.ty + c.ry); g.clip(); g.fillStyle = 'rgba(168,58,44,0.85)'; for (const f of [0.18, 0.5, 0.82]) g.fillRect(c.x - c.rx, c.ty + (c.by - c.ty) * f - 3, c.rx * 2, 6); g.restore();
    g.beginPath(); g.ellipse(c.x, c.ty, c.rx * 1.3, c.ry * 1.3, 0, 0, TAU); g.fillStyle = '#5a5048'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
    const gl = g.createRadialGradient(c.x, c.ty - 4, 0, c.x, c.ty - 4, 26); gl.addColorStop(0, 'rgba(255,220,130,0.8)'); gl.addColorStop(1, 'rgba(255,220,130,0)'); g.fillStyle = gl; g.beginPath(); g.arc(c.x, c.ty - 4, 26, 0, TAU); g.fill();
    g.fillStyle = '#f2c460'; g.fillRect(c.x - 3, c.ty - 7, 6, 6); g.strokeRect(c.x - 3, c.ty - 7, 6, 6);
    g.beginPath(); g.moveTo(c.x - 4.5, c.ty - 7); g.lineTo(c.x, c.ty - 13); g.lineTo(c.x + 4.5, c.ty - 7); g.closePath(); g.fillStyle = '#3e3732'; g.fill(); g.stroke();
  } },
  { id: 'temple', label: 'Pillared temple', w: 2, d: 1, h: 26, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.08), z = o.z, ax = o.axis === 'x', marble = '#efe9da';
    K.box(x0, y0, x1, y1, z, z + 2, '#d9d0bb'); K.box(x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, z + 2, z + 3.5, '#e2dac6');
    const [cx0, cy0, cx1, cy1] = [x0 + 0.22, y0 + 0.22, x1 - 0.22, y1 - 0.22];
    K.box(cx0 + 0.1, cy0 + 0.1, cx1 - 0.1, cy1 - 0.1, z + 3.5, z + 14, '#ddd3bb', { noTop: true });
    const cols = []; const n = 5;
    for (let k = 0; k < n; k++) { const f = k / (n - 1); if (ax) { cols.push([cx0 + (cx1 - cx0) * f, cy1]); } else cols.push([cx1, cy0 + (cy1 - cy0) * f]); }
    if (ax) for (let k = 1; k < 3; k++) cols.push([cx1, cy0 + (cy1 - cy0) * k / 3]); else for (let k = 1; k < 3; k++) cols.push([cx0 + (cx1 - cx0) * k / 3, cy1]);
    cols.sort((a, b) => a[0] + a[1] - b[0] - b[1]).forEach(([x, y]) => K.cyl(x, y, 0.06, z + 3.5, z + 14, marble, { lw: 0.45 }));
    K.box(x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, z + 14, z + 16, marble);
    K.gable(x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, z + 16, 6, o.axis, '#c9bfa6', marble, { ov: 0.04 });
  } },
  { id: 'markethall', label: 'Market hall', w: 2, d: 1, h: 26, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.1), z = o.z, g = K.g;
    K.ell((x0 + x1) / 2, (y0 + y1) / 2, z, 0.2, 'rgba(60,45,30,0.15)', 0);
    const posts = []; const ax = o.axis === 'x', n = 4;
    for (let k = 0; k < n; k++) { const f = k / (n - 1); posts.push(ax ? [x0 + 0.06 + (x1 - x0 - 0.12) * f, y0 + 0.06] : [x0 + 0.06, y0 + 0.06 + (y1 - y0 - 0.12) * f]); posts.push(ax ? [x0 + 0.06 + (x1 - x0 - 0.12) * f, y1 - 0.06] : [x1 - 0.06, y0 + 0.06 + (y1 - y0 - 0.12) * f]); }
    posts.sort((a, b) => a[0] + a[1] - b[0] - b[1]).forEach(([x, y]) => K.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, z, z + 8, STONE_D, { lw: 0.45 }));
    const bar = sx(K, (x0 + x1) / 2, (y0 + y1) / 2, z); g.fillStyle = '#c9a24f'; g.fillRect(bar[0] - 4, bar[1] - 3, 3, 2); g.fillStyle = '#b8483a'; g.fillRect(bar[0] + 1, bar[1] - 2, 3, 2);
    K.box(x0, y0, x1, y1, z + 8, z + 16, '#efe0c0', { noTop: true }); K.timber('y', y1, x0, x1, z + 8, z + 16); K.timber('x', x1, y0, y1, z + 8, z + 16);
    K.hip(x0, y0, x1, y1, z + 16, 9, ROOFS[0][0], { ov: 0.1 });
  } },
  { id: 'yurt', label: 'Yurt', w: 1, d: 1, h: 14, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, felt = pickv(['#e7dcc3', '#d8c7a4', '#cdb38c'], o.v), c = K.cyl(cx, cy, 0.34, z, z + 6, felt, { noTop: true }), g = K.g;
    g.strokeStyle = WAX; g.lineWidth = 1.1; g.beginPath(); g.ellipse(c.x, c.by - 3, c.rx, c.ry, 0, 0.1, Math.PI - 0.1); g.stroke();
    if (o.face < 2) { g.fillStyle = '#7a4a2a'; g.fillRect(c.x + (o.face ? 3 : -5), c.by - 1, 3, -4.5 + c.ry * 0.6); }
    K.cone(cx, cy, 0.38, z + 6, 8, shade(felt, 0.95), { tex: true });
  } },
  { id: 'ruin', label: 'Ruined walls', w: 1, d: 1, h: 14, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.12), z = o.z, g = K.g, r = o.r;
    const wall = (ax, c, a0, a1) => {
      const n = 6, tops = Array.from({ length: n + 1 }, () => 4 + r() * 9);
      const pt = (a, zz) => sx(K, ...(ax === 'y' ? [a, c, zz] : [c, a, zz]));
      g.beginPath(); let p = pt(a0, z); g.moveTo(p[0], p[1]); for (let k = 0; k <= n; k++) { p = pt(a0 + (a1 - a0) * k / n, z + tops[k]); g.lineTo(p[0], p[1]); } p = pt(a1, z); g.lineTo(p[0], p[1]); g.closePath();
      g.fillStyle = ax === 'y' ? '#d4cab2' : '#b3a88e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
    };
    wall('y', y0 + 0.1, x0, x1); wall('x', x0 + 0.1, y0, y1 - 0.4);
    for (let k = 0; k < 6; k++) { const p = sx(K, x0 + r() * (x1 - x0), y0 + 0.3 + r() * (y1 - y0 - 0.3), z); g.beginPath(); g.ellipse(p[0], p[1], 1.6, 1, 0, 0, TAU); g.fillStyle = '#c4b99f'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke(); }
    const p = sx(K, x1 - 0.2, y1 - 0.25, z); g.strokeStyle = '#5c773f'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] - 1, p[1] - 3); g.moveTo(p[0] + 1, p[1]); g.lineTo(p[0] + 2, p[1] - 3.4); g.stroke();
  } },
  { id: 'mine', label: 'Mine entrance', w: 1, d: 1, h: 14, draw(K, o) {
    const [x0, y0, x1, y1] = inset(o, 0.05), z = o.z, g = K.g;
    const pts = [sx(K, x0, y1, z), sx(K, x0, y0, z + 4), sx(K, x0 + 0.3, y0, z + 14), sx(K, x1, y0, z + 6), sx(K, x1, y1, z)];
    K.poly(pts, '#a59a85', 0.7); g.save(); K.path(pts); g.clip(); g.fillStyle = 'rgba(80,70,55,0.3)'; g.fillRect(pts[2][0], pts[2][1] - 30, 60, 80); g.restore();
    const m = (x0 + x1) / 2, e = sx(K, m - 0.2, y1, z), f = sx(K, m + 0.2, y1, z), tp = sx(K, m, y1, z + 9);
    g.beginPath(); g.moveTo(e[0], e[1]); g.lineTo(e[0], e[1] - 7); g.quadraticCurveTo(tp[0], tp[1], f[0], f[1] - 7); g.lineTo(f[0], f[1]); g.closePath(); g.fillStyle = '#1e1812'; g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.moveTo(e[0] - 0.5, e[1]); g.lineTo(e[0] - 0.5, e[1] - 8); g.lineTo(f[0] + 0.5, f[1] - 8); g.lineTo(f[0] + 0.5, f[1]); g.stroke(); g.strokeStyle = PLANK; g.lineWidth = 0.9; g.stroke();
    g.strokeStyle = 'rgba(60,50,40,0.8)'; g.lineWidth = 0.5; g.beginPath(); for (const d of [-0.07, 0.07]) { const a = sx(K, m + d, y1, z), b = sx(K, m + d, y1 + 0.5, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } g.stroke();
  } },
  { id: 'dovecote', label: 'Dovecote', w: 1, d: 1, h: 24, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, c = K.cyl(cx, cy, 0.26, z, z + 14, '#e8dec7', { noTop: true }), g = K.g;
    g.fillStyle = '#2f271f'; for (let r2 = 0; r2 < 2; r2++) for (let k = 0; k < 4; k++) g.fillRect(c.x - c.rx * 0.7 + k * c.rx * 0.45, c.ty + 3 + r2 * 3, 1.1, 1.1);
    K.cone(cx, cy, 0.32, z + 14, 9, ROOFS[0][0]);
  } },
  { id: 'windmill', label: 'Windmill', w: 1, d: 1, h: 26, draw(K, o) { const [cx, cy] = mid(o), [px, py] = sx(K, cx, cy, o.z), g = K.g; g.save(); g.translate(px, py); g.scale(0.95, 0.95); drawSettlement(g, { kind: 'windmill', i: Math.round(o.v * 97) }, 0, -R * 0.48); g.restore(); } },
  { id: 'shrine', label: 'Domed shrine', w: 1, d: 1, h: 20, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g;
    K.box(cx - 0.36, cy - 0.36, cx + 0.36, cy + 0.36, z, z + 2, '#d9d0bb');
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.cyl(cx + dx * 0.24, cy + dy * 0.24, 0.05, z + 2, z + 10, '#efe9da', { lw: 0.45 });
    K.box(cx - 0.32, cy - 0.32, cx + 0.32, cy + 0.32, z + 10, z + 11.5, '#efe9da');
    const [dx, dy] = sx(K, cx, cy, z + 11.5), rx = 0.3 * 16 * 1.414, gr = g.createLinearGradient(dx - rx, 0, dx + rx, 0); gr.addColorStop(0, '#9fc2b3'); gr.addColorStop(1, '#5f8a7c');
    g.beginPath(); g.ellipse(dx, dy, rx, rx / 2, 0, 0, Math.PI); g.ellipse(dx, dy, rx, 7, 0, Math.PI, TAU); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke();
    g.beginPath(); g.arc(dx, dy - 8.5, 1.3, 0, TAU); g.fillStyle = GOLD; g.fill(); g.stroke();
  } }
];

/* ---- props ---- */
const barrel = (K, x, y, z, s = 1) => { const c = K.cyl(x, y, 0.07 * s, z, z + 4 * s, '#9a6a3a', { lw: 0.45, top: '#b98a52' }), g = K.g; g.strokeStyle = 'rgba(40,30,20,0.6)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(c.x - c.rx, c.by - 1.2 * s); g.lineTo(c.x + c.rx, c.by - 1.2 * s); g.moveTo(c.x - c.rx, c.ty + 1.2 * s); g.lineTo(c.x + c.rx, c.ty + 1.2 * s); g.stroke(); };
const crate = (K, x, y, z, s = 1) => { const e = 0.09 * s; K.box(x - e, y - e, x + e, y + e, z, z + 4 * s, '#b48a58', { lw: 0.45 }); K.seg([x - e, y + e, z], [x + e, y + e, z + 4 * s], 'rgba(60,40,20,0.6)', 0.4); };
const stone = (K, x, y, z, rx, h, col = '#bdb39d') => { const [px, py] = K.P(x, y, z), g = K.g; g.beginPath(); g.moveTo(px - rx, py); g.quadraticCurveTo(px - rx, py - h, px - rx * 0.2, py - h); g.quadraticCurveTo(px + rx, py - h * 0.9, px + rx, py); g.quadraticCurveTo(px, py + rx * 0.35, px - rx, py); g.closePath(); g.fillStyle = col; g.fill(); g.save(); g.clip(); g.fillStyle = 'rgba(60,50,35,0.22)'; g.fillRect(px + rx * 0.15, py - h - 2, rx * 2, h + 4); g.restore(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke(); };

const PROPS = [
  { id: 'haystack', label: 'Haystack', w: 1, d: 1, h: 10, draw(K, o) { const [cx, cy] = mid(o), [px, py] = K.P(cx, cy, o.z), g = K.g; g.beginPath(); g.moveTo(px - 7, py); g.bezierCurveTo(px - 7, py - 9, px - 2, py - 12, px, py - 12); g.bezierCurveTo(px + 2, py - 12, px + 7, py - 9, px + 7, py); g.quadraticCurveTo(px, py + 3, px - 7, py); g.closePath(); g.fillStyle = '#d9b860'; g.fill(); g.save(); g.clip(); g.fillStyle = 'rgba(140,100,40,0.35)'; g.fillRect(px + 1, py - 14, 9, 18); g.strokeStyle = 'rgba(120,85,30,0.6)'; g.lineWidth = 0.5; g.beginPath(); for (let k = -5; k <= 5; k += 2.5) { g.moveTo(px + k, py + 2); g.lineTo(px + k * 0.5, py - 11); } g.stroke(); g.restore(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke(); } },
  { id: 'haybales', label: 'Hay bales', w: 1, d: 1, h: 5, draw(K, o) { const [cx, cy] = mid(o); for (const [dx, dy] of [[-0.18, -0.12], [0.15, -0.15], [-0.1, 0.18], [0.2, 0.15]]) { const [px, py] = K.P(cx + dx, cy + dy, o.z), g = K.g; g.beginPath(); g.ellipse(px, py - 2.4, 2.6, 2.4, 0, 0, TAU); g.fillStyle = '#dcc070'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke(); g.beginPath(); g.ellipse(px + 1.1, py - 2.4, 1.3, 2.2, 0, 0, TAU); g.fillStyle = '#c9a85a'; g.fill(); g.stroke(); } } },
  { id: 'barrels', label: 'Barrels', w: 1, d: 1, h: 6, draw(K, o) { const [cx, cy] = mid(o); barrel(K, cx - 0.15, cy - 0.15, o.z); barrel(K, cx + 0.12, cy - 0.1, o.z); barrel(K, cx - 0.05, cy + 0.15, o.z); if (o.v > 0.5) barrel(K, cx + 0.2, cy + 0.2, o.z, 0.85); } },
  { id: 'crates', label: 'Crates', w: 1, d: 1, h: 8, draw(K, o) { const [cx, cy] = mid(o); crate(K, cx - 0.15, cy - 0.1, o.z); crate(K, cx + 0.1, cy - 0.15, o.z); crate(K, cx - 0.12, cy - 0.1, o.z + 4, 0.85); crate(K, cx + 0.12, cy + 0.15, o.z, 1.1); } },
  { id: 'cart', label: 'Hay cart', w: 1, d: 1, h: 8, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, ax = o.face % 2 === 0, L = 0.32, Wd = 0.16, g = K.g;
    const [x0, y0, x1, y1] = ax ? [cx - L, cy - Wd, cx + L, cy + Wd] : [cx - Wd, cy - L, cx + Wd, cy + L];
    const wheel = (x, y) => { const [px, py] = K.P(x, y, z + 2.2); g.beginPath(); g.ellipse(px, py, ax ? 2.4 : 2.4, 2.4, 0, 0, TAU); g.fillStyle = '#7a5a3a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke(); g.beginPath(); g.moveTo(px - 2, py); g.lineTo(px + 2, py); g.moveTo(px, py - 2); g.lineTo(px, py + 2); g.stroke(); };
    if (ax) wheel(cx, y0); else wheel(x0, cy);
    K.box(x0, y0, x1, y1, z + 2.5, z + 4.5, PLANK, { lw: 0.5 });
    const [hx, hy] = K.P(cx, cy, z + 4.5); g.beginPath(); g.ellipse(hx, hy - 1.5, 6, 3, 0, Math.PI, TAU); g.fillStyle = '#d9b860'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.5; g.stroke();
    if (ax) wheel(cx, y1); else wheel(x1, cy);
    const sh = ax ? [[x0, cy - 0.06], [x0 - 0.3, cy - 0.06]] : [[cx - 0.06, y0], [cx - 0.06, y0 - 0.3]]; K.seg([...sh[0], z + 3], [...sh[1], z + 1.5], INK, 0.8);
  } },
  { id: 'fence', label: 'Fence', w: 1, d: 1, h: 4, draw(K, o) {
    const z = o.z, g = K.g, ax = o.face % 2 === 0, c = ax ? (o.face === 0 ? o.y1 - 0.08 : o.y0 + 0.08) : (o.face === 1 ? o.x1 - 0.08 : o.x0 + 0.08);
    const pt = (a, zz) => K.P(...(ax ? [a, c, zz] : [c, a, zz])), a0 = ax ? o.x0 : o.y0, a1 = ax ? o.x1 : o.y1;
    g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k <= 3; k++) { const p = pt(a0 + (a1 - a0) * k / 3, z), q = pt(a0 + (a1 - a0) * k / 3, z + 4.5); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); } for (const zz of [z + 2, z + 3.8]) { const p = pt(a0, zz), q = pt(a1, zz); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); } g.stroke();
    g.strokeStyle = '#a07a4a'; g.lineWidth = 0.7; g.stroke();
  } },
  { id: 'well', label: 'Well', w: 1, d: 1, h: 12, draw(K, o) {
    const [cx, cy] = mid(o), z = o.z, g = K.g, c = K.cyl(cx, cy, 0.2, z, z + 3.5, '#cfc6b2', { top: '#4a5e60' });
    g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(c.x - c.rx * 0.9, c.ty); g.lineTo(c.x - c.rx * 0.9, c.ty - 7); g.moveTo(c.x + c.rx * 0.9, c.ty); g.lineTo(c.x + c.rx * 0.9, c.ty - 7); g.stroke();
    g.strokeStyle = '#7a5a3a'; g.lineWidth = 0.6; g.stroke();
    g.beginPath(); g.moveTo(c.x - c.rx * 1.2, c.ty - 6.5); g.lineTo(c.x, c.ty - 10); g.lineTo(c.x + c.rx * 1.2, c.ty - 6.5); g.closePath(); g.fillStyle = ROOFS[0][0]; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke();
  } },
  { id: 'scarecrow', label: 'Scarecrow', w: 1, d: 1, h: 10, draw(K, o) { const [cx, cy] = mid(o), [px, py] = K.P(cx, cy, o.z), g = K.g; g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 11); g.moveTo(px - 4.5, py - 8); g.lineTo(px + 4.5, py - 8); g.stroke(); g.fillStyle = '#7a6a8a'; g.fillRect(px - 2, py - 9, 4, 5); g.strokeRect(px - 2, py - 9, 4, 5); g.beginPath(); g.arc(px, py - 11, 1.6, 0, TAU); g.fillStyle = '#e0c88a'; g.fill(); g.stroke(); g.beginPath(); g.moveTo(px - 3, py - 12); g.lineTo(px, py - 15); g.lineTo(px + 3, py - 12); g.closePath(); g.fillStyle = '#8a6a3a'; g.fill(); g.stroke(); } },
  { id: 'stones', label: 'Standing stones', w: 2, d: 2, h: 12, draw(K, o) { const [cx, cy] = mid(o), n = 7, pts = []; for (let k = 0; k < n; k++) { const a = k / n * TAU + o.v; pts.push([cx + Math.cos(a) * 0.65, cy + Math.sin(a) * 0.65]); } pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]); K.ell(cx, cy, o.z, 0.35, 'rgba(120,130,80,0.25)', 0); for (const [x, y] of pts) { const [px, py] = K.P(x, y, o.z), g = K.g; g.beginPath(); g.moveTo(px - 2, py); g.lineTo(px - 2.3, py - 10); g.lineTo(px + 0.5, py - 12); g.lineTo(px + 2.3, py - 9.5); g.lineTo(px + 2, py); g.closePath(); g.fillStyle = '#bdb6a5'; g.fill(); g.save(); g.clip(); g.fillStyle = 'rgba(60,55,45,0.3)'; g.fillRect(px + 0.4, py - 14, 4, 16); g.restore(); g.strokeStyle = INK; g.lineWidth = 0.55; g.stroke(); } } },
  { id: 'boulders', label: 'Boulders', w: 1, d: 1, h: 6, draw(K, o) { const [cx, cy] = mid(o); stone(K, cx - 0.15, cy - 0.1, o.z, 5, 6); stone(K, cx + 0.18, cy + 0.05, o.z, 3.2, 3.6, '#c7bea9'); if (o.v > 0.4) stone(K, cx - 0.05, cy + 0.25, o.z, 2.4, 2.4, '#ada38f'); } },
  { id: 'stump', label: 'Tree stump', w: 1, d: 1, h: 3, draw(K, o) { const [cx, cy] = mid(o), c = K.cyl(cx, cy, 0.1, o.z, o.z + 2.5, '#7a5a3a', { top: '#d8b98a', lw: 0.5 }), g = K.g; g.strokeStyle = 'rgba(90,60,30,0.6)'; g.lineWidth = 0.35; g.beginPath(); g.ellipse(c.x, c.ty, c.rx * 0.5, c.ry * 0.5, 0, 0, TAU); g.stroke(); const p = K.P(cx + 0.25, cy + 0.1, o.z); g.fillStyle = '#c0573d'; g.beginPath(); g.arc(p[0], p[1] - 1.2, 1.2, Math.PI, 0); g.fill(); } },
  { id: 'logpile', label: 'Log pile', w: 1, d: 1, h: 5, draw(K, o) { const [cx, cy] = mid(o), g = K.g, ax = o.face % 2 === 0; const rowsL = [[0, 0, 3], [0.5, 2.6, 2], [1, 5.2, 1]]; for (const [off, dz, n] of rowsL) for (let k = 0; k < n; k++) { const s = (k - (n - 1) / 2) * 0.13; const a = ax ? [cx - 0.3, cy + s, o.z + 1.3 + dz] : [cx + s, cy - 0.3, o.z + 1.3 + dz], b = ax ? [cx + 0.3, cy + s, o.z + 1.3 + dz] : [cx + s, cy + 0.3, o.z + 1.3 + dz]; const p = K.P(...a), q = K.P(...b); g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); g.strokeStyle = '#8a643c'; g.lineWidth = 2; g.stroke(); g.beginPath(); g.arc(q[0], q[1], 1.2, 0, TAU); g.fillStyle = '#d8b98a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke(); void off; } } },
  { id: 'lamppost', label: 'Lamp post', w: 1, d: 1, h: 12, draw(K, o) { const [cx, cy] = mid(o), [px, py] = K.P(cx, cy, o.z), g = K.g; const gl = g.createRadialGradient(px, py - 12, 0, px, py - 12, 10); gl.addColorStop(0, 'rgba(255,220,130,0.6)'); gl.addColorStop(1, 'rgba(255,220,130,0)'); g.fillStyle = gl; g.beginPath(); g.arc(px, py - 12, 10, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 11); g.stroke(); g.fillStyle = '#f2c460'; g.fillRect(px - 1.5, py - 14, 3, 3); g.lineWidth = 0.5; g.strokeRect(px - 1.5, py - 14, 3, 3); g.beginPath(); g.moveTo(px - 2.2, py - 14); g.lineTo(px, py - 16); g.lineTo(px + 2.2, py - 14); g.closePath(); g.fillStyle = '#3e3732'; g.fill(); } },
  { id: 'signpost', label: 'Signpost', w: 1, d: 1, h: 10, draw(K, o) { const [cx, cy] = mid(o), [px, py] = K.P(cx, cy, o.z), g = K.g; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 11); g.stroke(); g.strokeStyle = '#8a643c'; g.lineWidth = 0.6; g.stroke(); for (const [dy, dir] of [[-10, 1], [-7, -1]]) { g.beginPath(); g.moveTo(px, py + dy - 1); g.lineTo(px + dir * 5, py + dy - 1 + dir * 0.8); g.lineTo(px + dir * 6.4, py + dy + dir * 0.8); g.lineTo(px + dir * 5, py + dy + 1 + dir * 0.8); g.lineTo(px, py + dy + 1); g.closePath(); g.fillStyle = '#c9a46a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.45; g.stroke(); } } },
  { id: 'stall', label: 'Market stall', w: 1, d: 1, h: 10, draw(K, o) { const [cx, cy] = mid(o), s = 0.26, z = o.z, cols = pickv([['#b8483a', '#f0e6cb'], ['#4f6f8f', '#f0e6cb'], ['#5f7b3d', '#f0e6cb'], ['#c9a24f', '#f6efdc']], o.v); K.box(cx - s, cy - s * 0.6, cx + s, cy + s * 0.6, z, z + 3, '#a07a4a', { lw: 0.5 }); const g = K.g; for (const [x, y] of [[cx - s, cy + s * 0.6], [cx + s, cy + s * 0.6], [cx + s, cy - s * 0.6]]) K.seg([x, y, z], [x, y, z + 8], INK, 0.6); const pts = [[cx - s - 0.05, cy - s * 0.6 - 0.05, z + 9], [cx + s + 0.05, cy - s * 0.6 - 0.05, z + 9], [cx + s + 0.05, cy + s * 0.6 + 0.08, z + 6.5], [cx - s - 0.05, cy + s * 0.6 + 0.08, z + 6.5]]; K.face(pts, cols[0], 0.55); g.save(); K.path(pts.map(p => K.P(...p))); g.clip(); g.strokeStyle = cols[1]; g.lineWidth = 2; g.beginPath(); for (const f of [0.25, 0.75]) { const a = K.P(cx - s + 2 * s * f, cy - s, z + 9), b = K.P(cx - s + 2 * s * f, cy + s, z + 6.5); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } g.stroke(); g.restore(); const [px, py] = K.P(cx, cy, z + 3); g.fillStyle = '#d9763a'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(px - 3 + k * 2, py - 0.5, 0.9, 0, TAU); g.fill(); } } },
  { id: 'beehives', label: 'Beehives', w: 1, d: 1, h: 5, draw(K, o) { const [cx, cy] = mid(o), g = K.g; for (const [dx, dy] of [[-0.2, -0.1], [0.12, -0.18], [0.0, 0.18]]) { const [sx2, sy2] = K.P(cx + dx, cy + dy, o.z); g.beginPath(); g.moveTo(sx2 - 2.8, sy2); g.bezierCurveTo(sx2 - 2.8, sy2 - 6, sx2 + 2.8, sy2 - 6, sx2 + 2.8, sy2); g.closePath(); g.fillStyle = '#d6b45e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.6; g.stroke(); g.strokeStyle = 'rgba(90,60,20,0.5)'; g.beginPath(); g.moveTo(sx2 - 2.4, sy2 - 1.6); g.lineTo(sx2 + 2.4, sy2 - 1.6); g.moveTo(sx2 - 1.9, sy2 - 3.2); g.lineTo(sx2 + 1.9, sy2 - 3.2); g.stroke(); g.fillStyle = '#2a1f15'; g.fillRect(sx2 - 0.6, sy2 - 1.2, 1.2, 1.2); } } },
  { id: 'campfire', label: 'Campfire', w: 1, d: 1, h: 4, draw(K, o) { const [cx, cy] = mid(o), [px, py] = K.P(cx, cy, o.z), g = K.g; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; g.beginPath(); g.ellipse(px + Math.cos(a) * 4.2, py + Math.sin(a) * 2.1, 1.2, 0.8, 0, 0, TAU); g.fillStyle = '#a49a86'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.35; g.stroke(); } const gl = g.createRadialGradient(px, py - 2, 0, px, py - 2, 12); gl.addColorStop(0, 'rgba(255,170,60,0.55)'); gl.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gl; g.beginPath(); g.arc(px, py - 2, 12, 0, TAU); g.fill(); g.beginPath(); g.moveTo(px - 2.4, py); g.quadraticCurveTo(px - 2, py - 4, px, py - 6.5); g.quadraticCurveTo(px + 2, py - 4, px + 2.4, py); g.closePath(); g.fillStyle = '#f0a43a'; g.fill(); g.beginPath(); g.moveTo(px - 1, py); g.quadraticCurveTo(px, py - 3, px + 0.3, py - 4); g.quadraticCurveTo(px + 1, py - 2, px + 1, py); g.fillStyle = '#fbe08a'; g.fill(); K.smoke(px, py - 6); } },
  { id: 'statue', label: 'Statue', w: 1, d: 1, h: 14, draw(K, o) { const [cx, cy] = mid(o), z = o.z; K.box(cx - 0.18, cy - 0.18, cx + 0.18, cy + 0.18, z, z + 5, '#d9d0bb'); const [px, py] = K.P(cx, cy, z + 5), g = K.g, c = pickv(['#8fa396', '#c9b48a', '#bdb6a5'], o.v); g.beginPath(); g.moveTo(px - 2.2, py); g.lineTo(px - 1.6, py - 7); g.lineTo(px - 3.5, py - 9.5); g.lineTo(px - 1.2, py - 9); g.lineTo(px, py - 11); g.lineTo(px + 1.4, py - 9); g.lineTo(px + 1.8, py); g.closePath(); g.fillStyle = c; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.55; g.stroke(); g.beginPath(); g.arc(px, py - 12.2, 1.5, 0, TAU); g.fill(); g.stroke(); } },
  { id: 'graves', label: 'Gravestones', w: 1, d: 1, h: 4, draw(K, o) { const g = K.g; for (const [fx, fy] of [[0.25, 0.3], [0.6, 0.25], [0.35, 0.7], [0.72, 0.65]]) { const [px, py] = K.P(o.x0 + fx, o.y0 + fy, o.z); g.beginPath(); g.moveTo(px - 1.2, py); g.lineTo(px - 1.2, py - 3); g.arc(px, py - 3, 1.2, Math.PI, 0); g.lineTo(px + 1.2, py); g.closePath(); g.fillStyle = '#d7d1c2'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke(); } } },
  { id: 'obelisk', label: 'Obelisk', w: 1, d: 1, h: 22, draw(K, o) { const [cx, cy] = mid(o), z = o.z; K.box(cx - 0.2, cy - 0.2, cx + 0.2, cy + 0.2, z, z + 2, '#d9d0bb'); K.box(cx - 0.09, cy - 0.09, cx + 0.09, cy + 0.09, z + 2, z + 20, '#c9bfa6', { noTop: true }); K.face([[cx - 0.09, cy + 0.09, z + 20], [cx + 0.09, cy + 0.09, z + 20], [cx, cy, z + 24]], '#d9cfb6', 0.6); K.face([[cx + 0.09, cy + 0.09, z + 20], [cx + 0.09, cy - 0.09, z + 20], [cx, cy, z + 24]], '#a89e86', 0.6); } },
  { id: 'rowboat', label: 'Rowing boat', w: 1, d: 1, h: 3, water: true, draw(K, o) { const [cx, cy] = mid(o), g = K.g, ax = o.face % 2 === 0, L = 0.36, Wd = 0.13; const pts = ax ? [[cx - L, cy, 0], [cx - L * 0.4, cy - Wd, 0], [cx + L * 0.6, cy - Wd, 0], [cx + L, cy, 0], [cx + L * 0.6, cy + Wd, 0], [cx - L * 0.4, cy + Wd, 0]] : [[cx, cy - L, 0], [cx + Wd, cy - L * 0.4, 0], [cx + Wd, cy + L * 0.6, 0], [cx, cy + L, 0], [cx - Wd, cy + L * 0.6, 0], [cx - Wd, cy - L * 0.4, 0]]; const z = o.z; K.face(pts.map(p => [p[0], p[1], z - 1]), '#7a5a3a', 0.6); K.face(pts.map(p => [cx + (p[0] - cx) * 0.8, cy + (p[1] - cy) * 0.8, z]), '#a07a4a', 0.4); const a = K.P(cx - 0.05, cy - 0.05, z), b = K.P(cx + 0.05, cy + 0.05, z); g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath(); g.moveTo(a[0] - 5, a[1] + 2); g.lineTo(b[0] + 5, b[1] - 2); g.stroke(); } }
];

/* ---- nature ---- */
const tree = (fn) => function (K, o) { const [cx, cy] = mid(o), [px, py] = K.P(cx + (o.v - 0.5) * 0.2, cy + (o.r() - 0.5) * 0.2, o.z); fn(K.g, px, py, o); };
const NATURE = [
  { id: 'oak', label: 'Oak', w: 1, d: 1, h: 20, draw: tree((g, x, y, o) => drawTree(g, x, y, 13 + o.v * 3, o.clim === 'arid' ? 'autumn1' : 'oak', o.r)) },
  { id: 'beech', label: 'Copper beech', w: 1, d: 1, h: 20, draw: tree((g, x, y, o) => drawTree(g, x, y, 13 + o.v * 3, 'autumn2', o.r)) },
  { id: 'birch', label: 'Birch', w: 1, d: 1, h: 20, draw: tree((g, x, y, o) => drawTree(g, x, y, 12 + o.v * 3, 'birch', o.r)) },
  { id: 'poplar', label: 'Poplar', w: 1, d: 1, h: 24, draw: tree((g, x, y, o) => drawTree(g, x, y, 12 + o.v * 3, 'poplar', o.r)) },
  { id: 'pine', label: 'Pine', w: 1, d: 1, h: 26, draw: tree((g, x, y, o) => drawPine(g, x, y, 11 + o.v * 3, o.r, o.clim === 'cold')) },
  { id: 'snowpine', label: 'Snowy fir', w: 1, d: 1, h: 26, draw: tree((g, x, y, o) => drawPine(g, x, y, 11 + o.v * 3, o.r, true, ['#5f8a5a', '#456b44'])) },
  { id: 'palm', label: 'Palm', w: 1, d: 1, h: 22, draw: tree((g, x, y, o) => drawPalm(g, x, y, 12 + o.v * 3, o.r)) },
  { id: 'deadtree', label: 'Dead tree', w: 1, d: 1, h: 16, draw: tree((g, x, y, o) => drawSnag(g, x, y, 13 + o.v * 3)) },
  { id: 'bush', label: 'Bush', w: 1, d: 1, h: 8, draw: tree((g, x, y, o) => drawTree(g, x, y, 8 + o.v * 2, 'bush', o.r)) },
  { id: 'cactus', label: 'Cactus', w: 1, d: 1, h: 12, draw: tree((g, x, y, o) => {
    const col = '#6f9a5a', arm = (dx, y0, h2) => { g.beginPath(); g.moveTo(x, y0); g.lineTo(x + dx, y0); g.lineTo(x + dx, y0 - h2); g.strokeStyle = INK; g.lineWidth = 3.2; g.lineCap = 'round'; g.stroke(); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); };
    arm(-3, y - 6 - o.v * 2, 4); arm(3, y - 8, 3.5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 13 - o.v * 3); g.strokeStyle = INK; g.lineWidth = 4.4; g.lineCap = 'round'; g.stroke(); g.strokeStyle = col; g.lineWidth = 3.2; g.stroke(); g.strokeStyle = 'rgba(240,250,220,0.6)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x - 0.6, y - 1); g.lineTo(x - 0.6, y - 12); g.stroke();
  }) },
  { id: 'reeds', label: 'Reeds', w: 1, d: 1, h: 6, draw(K, o) { const g = K.g; for (let k = 0; k < 6; k++) { const [px, py] = K.P(o.x0 + 0.2 + o.r() * 0.6, o.y0 + 0.2 + o.r() * 0.6, o.z); g.strokeStyle = '#5c773f'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px - 1, py - 4, px - 0.5, py - 7); g.moveTo(px + 1, py); g.lineTo(px + 2, py - 5); g.stroke(); g.fillStyle = '#6e4f2e'; g.fillRect(px - 1.1, py - 7.5, 1.2, 2.6); } } },
  { id: 'mushrooms', label: 'Toadstools', w: 1, d: 1, h: 3, draw(K, o) { const g = K.g; for (let k = 0; k < 4; k++) { const [px, py] = K.P(o.x0 + 0.2 + o.r() * 0.6, o.y0 + 0.2 + o.r() * 0.6, o.z); g.fillStyle = '#efe6d2'; g.fillRect(px - 0.5, py - 2.2, 1, 2.2); g.beginPath(); g.arc(px, py - 2.2, 1.8, Math.PI, 0); g.closePath(); g.fillStyle = '#b8483a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke(); g.fillStyle = '#fff'; g.fillRect(px - 0.8, py - 3.2, 0.6, 0.6); } } },
  { id: 'flowers', label: 'Wildflowers', w: 1, d: 1, h: 2, draw(K, o) { const g = K.g; for (let k = 0; k < 10; k++) { const [px, py] = K.P(o.x0 + 0.12 + o.r() * 0.76, o.y0 + 0.12 + o.r() * 0.76, o.z); g.strokeStyle = '#5c773f'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 2); g.stroke(); g.fillStyle = ['#f4ecd8', '#d9b44a', '#b8483a', '#9a7fc0'][k % 4]; g.beginPath(); g.arc(px, py - 2.3, 0.9, 0, TAU); g.fill(); } } },
  { id: 'rocks', label: 'Rocks', w: 1, d: 1, h: 3, draw(K, o) { for (let k = 0; k < 3; k++) stone(K, o.x0 + 0.2 + o.r() * 0.6, o.y0 + 0.2 + o.r() * 0.6, o.z, 1.6 + o.r() * 1.2, 1.8 + o.r(), mixHex('#bdb39d', '#8a8070', o.r() * 0.5)); } }
];

const ASSET_GROUPS = [['Buildings', BUILDINGS], ['Props', PROPS], ['Nature', NATURE]];
const ASSETS = [...BUILDINGS, ...PROPS, ...NATURE];
for (const [grp, list] of ASSET_GROUPS) for (const a of list) a.group = grp;
const ASSET_BY_ID = Object.fromEntries(ASSETS.map(a => [a.id, a]));

export { ASSETS, ASSET_BY_ID, ASSET_GROUPS };
