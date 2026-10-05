import { COS, CX, CY, M, N, NB, R, SIN, TAU, hexAt, hexDist, hexPath, worldH, worldW } from '../core/geometry.js';
import { fbm, makeNoise, mulberry32 } from '../core/random.js';
import { drawSerpent, drawShip } from './sea.js';
import { drawSettlement } from './settlements.js';
import { drawCartouche, drawCompass, drawFrame } from './chrome.js';
import { setCorridor, setRivDrawn, buildCorridor, buildRivers, buildRoads, drawRivers, drawRoads } from './rivers-roads.js';
import { BIOME } from '../world/data.js';
import { INK, hexRgb, rgbStr } from './palette.js';
import { drawSprawl, drawTerrainIcon } from './terrain.js';

function renderBase(map, S, showGrid) {
  const BW = Math.ceil(worldW * S), BH = Math.ceil(worldH * S);
  const mk = () => { const c = document.createElement('canvas'); c.width = BW; c.height = BH; return c; };
  const base = mk(), g = base.getContext('2d');
  const { B } = map;
  g.setTransform(S, 0, 0, S, 0, 0);
  g.fillStyle = '#eadcb9'; g.fillRect(0, 0, worldW, worldH);
  // terrain wash
  const T = mk(), t = T.getContext('2d'); t.setTransform(S, 0, 0, S, 0, 0);
  t.fillStyle = BIOME.deep.col; t.fillRect(M - 6, M - 6, worldW - 2 * M + 12, worldH - 2 * M + 12);
  const rgbCache = {}; for (const k in BIOME) rgbCache[k] = hexRgb(BIOME[k].col);
  const hr = mulberry32(map.seedHash ^ 0x9e3779b9);
  for (let i = 0; i < N; i++) {
    const v = 1 + 0.07 * map.nC(map.X[i] * 3, map.Y[i] * 3) + (hr() - 0.5) * 0.035;
    t.beginPath(); hexPath(t, CX[i], CY[i], R + 0.9); t.fillStyle = rgbStr(rgbCache[B[i]], v); t.fill();
  }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.filter = `blur(${(2.6 * S).toFixed(1)}px)`; g.drawImage(T, 0, 0); g.filter = 'none';
  g.globalAlpha = 0.62; g.drawImage(T, 0, 0); g.restore();
  T.width = T.height = 1;
  // paths
  const waterP = new Path2D(), gridLand = new Path2D(), gridWater = new Path2D(), coast = new Path2D(), landP = new Path2D();
  for (let i = 0; i < N; i++) {
    const w = BIOME[B[i]].water;
    hexPath(w ? waterP : gridLand, CX[i], CY[i], w ? R + 0.6 : R);
    if (!w) hexPath(landP, CX[i], CY[i], R + 0.7);
    if (w) hexPath(gridWater, CX[i], CY[i], R);
    else for (let d = 0; d < 6; d++) { const n = NB[i][d]; if (n < 0 || BIOME[B[n]].water) { coast.moveTo(CX[i] + R * COS[d], CY[i] + R * SIN[d]); coast.lineTo(CX[i] + R * COS[d + 1], CY[i] + R * SIN[d + 1]); } }
  }
  // rhumb lines + ripples, clipped to water
  g.save(); g.clip(waterP);
  if (map.compass) {
    g.strokeStyle = INK; g.lineWidth = 0.5; g.globalAlpha = 0.16; g.beginPath();
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16; g.moveTo(map.compass.x, map.compass.y); g.lineTo(map.compass.x + Math.cos(a) * 3000, map.compass.y + Math.sin(a) * 3000); }
    g.stroke(); g.globalAlpha = 1;
  }
  const O = mk(), o = O.getContext('2d'); o.setTransform(S, 0, 0, S, 0, 0); o.lineCap = 'round'; o.lineJoin = 'round';
  [[3, 0.22], [2, 0.36], [1, 0.55]].forEach(([k, a]) => {
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = a; o.strokeStyle = '#34555a'; o.lineWidth = 2 * k * 6.5 + 1.1; o.stroke(coast);
    o.globalCompositeOperation = 'destination-out'; o.globalAlpha = 1; o.lineWidth = 2 * k * 6.5 - 1.1; o.stroke(coast);
  });
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(O, 0, 0); g.restore();
  O.width = O.height = 1;
  g.setTransform(S, 0, 0, S, 0, 0);
  // grid
  if (showGrid) {
    g.strokeStyle = INK; g.lineWidth = 0.6;
    g.globalAlpha = 0.11; g.stroke(gridWater); g.globalAlpha = 0.2; g.stroke(gridLand); g.globalAlpha = 1;
  }
  // coastline
  g.strokeStyle = INK; g.lineWidth = 1.6; g.lineCap = 'round'; g.globalAlpha = 0.9; g.stroke(coast); g.globalAlpha = 1;
  // salt lakes: a pale crust where the brine has drawn back, white flecks of salt
  if (map.basins) for (const bs of map.basins) if (bs.salt) for (const c of bs.cells) {
    const sr = mulberry32(c * 7 + 3);
    g.save(); g.beginPath(); hexPath(g, CX[c], CY[c], R); g.clip();
    g.fillStyle = 'rgba(238,230,206,0.62)'; g.beginPath(); hexPath(g, CX[c], CY[c], R + 1); g.fill();
    g.beginPath(); g.ellipse(CX[c] + (sr() - 0.5) * 4, CY[c] + (sr() - 0.5) * 3, R * 0.55, R * 0.4, 0, 0, TAU); g.fillStyle = 'rgba(150,188,182,0.75)'; g.fill(); g.strokeStyle = 'rgba(255,252,240,0.9)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,253,245,0.9)'; for (let k = 0; k < 14; k++) { const a = sr() * TAU, d = R * (0.6 + sr() * 0.3); g.fillRect(CX[c] + Math.cos(a) * d, CY[c] + Math.sin(a) * d * 0.8, 1, 1); }
    g.restore();
  }
  const RV = buildRivers(map), RDS = buildRoads(map); setRivDrawn(RV);
  if (map.sprawl) for (const s of map.settle) {
    if (!s.sprawl || !s.sprawl.length) continue;
    const hs = [s.i, ...s.sprawl], blob = new Path2D();
    for (const h of hs) { blob.moveTo(CX[h] + R * 0.8, CY[h]); blob.arc(CX[h], CY[h], R * 0.8, 0, TAU); }
    for (const a of hs) for (const b of hs) if (a < b && hexDist(a, b) === 1) { const mx = (CX[a] + CX[b]) / 2, my = (CY[a] + CY[b]) / 2; blob.moveTo(mx + R * 0.62, my); blob.arc(mx, my, R * 0.62, 0, TAU); }
    g.save(); g.clip(landP);
    g.fillStyle = 'rgba(214,194,150,0.22)'; g.fill(blob);
    g.lineWidth = 6; g.strokeStyle = 'rgba(214,194,150,0.14)'; g.stroke(blob);
    g.restore();
  }
  setCorridor(buildCorridor(RV, RDS));
  // terrain icons, back to front, each one stepped aside so no road or river runs across an upright drawing
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => CY[a] - CY[b] || CX[a] - CX[b]);
  for (const i of order) { if (map.sAt[i] >= 0) continue; if (map.sprawl && map.sprawl[i] >= 0) { drawSprawl(g, i, map, mulberry32(map.seedHash + i * 7919)); continue; } drawTerrainIcon(g, B[i], i, mulberry32(map.seedHash + i * 7919), map); }
  setCorridor(null);
  for (const o of map.orn) { if (o.type === 'ship') drawShip(g, CX[o.i], CY[o.i] + R * 0.1, R * 0.95, o.flip); else drawSerpent(g, CX[o.i], CY[o.i] + R * 0.2, R * 1.15, o.flip); }
  // rivers
  const groundAt = (x, y) => { const h = hexAt(x, y); return h >= 0 ? rgbStr(rgbCache[B[h]], 1) : '#d8c9a4'; };
  drawRivers(g, RV, landP, groundAt, waterP, map);
  // roads
  const riverSamples = []; RV.forEach(rv => rv.P.forEach(q => riverSamples.push(q)));
  drawRoads(g, RDS, riverSamples);
  // settlements
  map.settle.slice().sort((a, b) => CY[a.i] - CY[b.i]).forEach(s => drawSettlement(g, s, CX[s.i], CY[s.i], map));
  if (map.compass) drawCompass(g, map.compass.x, map.compass.y, map.compass.r);
  if (map.cart) drawCartouche(g, map.cart, map.realm);
  drawFrame(g);
  // ageing: stains, grain, vignette
  const sw = 180, sh = Math.round(180 * worldH / worldW), st = document.createElement('canvas'); st.width = sw; st.height = sh;
  const sc = st.getContext('2d'), img = sc.createImageData(sw, sh), sn = makeNoise(mulberry32(map.seedHash ^ 0x51ed));
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const v = fbm(sn, x / 26, y / 26, 4), a = Math.max(0, Math.min(1, (v + 0.15) * 1.6));
    const o4 = (y * sw + x) * 4; img.data[o4] = 150; img.data[o4 + 1] = 110; img.data[o4 + 2] = 60; img.data[o4 + 3] = a * 55;
  }
  sc.putImageData(img, 0, 0);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.imageSmoothingQuality = 'high'; g.drawImage(st, 0, 0, BW, BH);
  const gr = document.createElement('canvas'); gr.width = gr.height = 256; const gx = gr.getContext('2d'), gi = gx.createImageData(256, 256), grng = mulberry32(7);
  for (let k = 0; k < gi.data.length; k += 4) { gi.data[k] = 90; gi.data[k + 1] = 70; gi.data[k + 2] = 40; gi.data[k + 3] = grng() * 34; }
  gx.putImageData(gi, 0, 0); g.fillStyle = g.createPattern(gr, 'repeat'); g.fillRect(0, 0, BW, BH);
  // folds
  const fold = (x0, y0, x1, y1) => { const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, 'rgba(120,90,50,0)'); lg.addColorStop(0.5, 'rgba(120,90,50,0.16)'); lg.addColorStop(1, 'rgba(120,90,50,0)'); return lg; };
  g.fillStyle = fold(BW / 2 - 10 * S, 0, BW / 2 + 10 * S, 0); g.fillRect(BW / 2 - 10 * S, 0, 20 * S, BH);
  g.fillStyle = fold(0, BH / 2 - 10 * S, 0, BH / 2 + 10 * S); g.fillRect(0, BH / 2 - 10 * S, BW, 20 * S);
  const vg = g.createRadialGradient(BW / 2, BH / 2, Math.min(BW, BH) * 0.35, BW / 2, BH / 2, Math.hypot(BW, BH) * 0.56);
  vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(120,78,36,0.5)');
  g.fillStyle = vg; g.fillRect(0, 0, BW, BH);
  g.restore();
  return base;
}

export { renderBase };
