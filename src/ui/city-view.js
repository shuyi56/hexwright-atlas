import { state } from './state.js';
import { TAU, hexNo } from '../core/geometry.js';
import { DTYPE, EL, THH, TWH, generateCity } from '../city/generate.js';
import { renderCity } from '../city/render.js';
import { $, canvas, coarse, reduceMotion } from './state.js';
import { FONT_FELL, FONT_SC } from './draw.js';
import { esc, showTab, survey } from './ledger.js';
import { KIND } from '../world/data.js';

/* ================= city view ================= */
const cityEl = $('city'), cc = $('cityCanvas'), cctx = cc.getContext('2d'), ctip = $('cityTip'), cveil = $('cityVeil');
const CS = coarse ? 1.3 : 1.8;
const CV = { open: false, C: null, s: null, rot: 0, R: null, z: 1, ox: 0, oy: 0, fitZ: 1, cw: 0, ch: 0, hover: -1, sel: -1, labels: true, dirty: false, list: [] };
let BAR_H = 64;
function citySize() {
  const r = cityEl.getBoundingClientRect(); if (!r.width) return;
  const pw = CV.cw, ph = CV.ch;
  BAR_H = (cityEl.querySelector('.city-bar').offsetHeight || 48) + 16;
  CV.cw = r.width; CV.ch = r.height; cc.width = Math.round(CV.cw * state.dpr); cc.height = Math.round(CV.ch * state.dpr);
  if (CV.R) { const nf = Math.min(CV.cw / CV.R.W, (CV.ch - BAR_H) / CV.R.H) * 0.98; if (!pw) { CV.fitZ = nf; cityFit(); } else { const wx = (pw / 2 - CV.ox) / CV.z, wy = (ph / 2 - CV.oy) / CV.z; CV.z = cClampZ(CV.z * nf / CV.fitZ); CV.fitZ = nf; CV.ox = CV.cw / 2 - wx * CV.z; CV.oy = CV.ch / 2 - wy * CV.z; } }
  cityReq();
}
const cClampZ = v => Math.max(CV.fitZ * 0.8, Math.min(Math.max(CV.fitZ * 7, 3), v));
function cityFit() { if (!CV.R) return; CV.fitZ = Math.min(CV.cw / CV.R.W, (CV.ch - BAR_H) / CV.R.H) * 0.98; CV.z = CV.fitZ; CV.ox = (CV.cw - CV.R.W * CV.z) / 2; CV.oy = BAR_H + (CV.ch - BAR_H - CV.R.H * CV.z) / 2; cityReq(); }
function cZoomAt(sx, sy, nz) { nz = cClampZ(nz); const wx = (sx - CV.ox) / CV.z, wy = (sy - CV.oy) / CV.z; CV.z = nz; CV.ox = sx - wx * CV.z; CV.oy = sy - wy * CV.z; cityReq(); }
const cityReq = () => { if (!CV.dirty) { CV.dirty = true; requestAnimationFrame(cityDraw); } };

function buildCityLabels() {
  const C = CV.C, R = CV.R, out = [];
  const at = (x, y, z) => { const [X, Y] = R.rp(x, y); return R.P(X, Y, z); };
  C.districts.forEach(D => { if (D.cx == null || D.tiles < 6) return; let px = D.cx, py = D.cy; if (D.cands && D.cands.length) { let bs = -1e9; for (const [cx2, cy2] of D.cands) { const [X, Y] = R.rp(cx2, cy2), sc = (X - Y) - Math.abs(X + Y - R.S) * 0.35; if (sc > bs) { bs = sc; px = cx2; py = cy2; } } } const [x, y] = at(px, py, (D.ce || 0) * EL + 6); out.push({ text: D.name, x, y, size: D.type === 'outer' ? 11 : 13, fam: FONT_SC, style: '', color: '#2e2014', halo: 'rgba(244,236,214,0.9)', sp: 0.16, min: 7.5, floor: 10.5, pri: 1, d: D.id }); });
  const SZ = { church: [9, 2], cloister: [7.5, 4], chapter: [7.2, 4], refectory: [7.2, 4], range: [6.8, 5], kitchen: [6.8, 5], lodge: [7, 4], infirmary: [7, 4], orchard: [7, 5], herbs: [7, 5], pond: [7, 5], dovecote: [6.8, 5], palace: [10, 2], castle: [10, 2], cathedral: [9, 2], temple: [8.5, 3], hall: [8, 3], guild: [8, 3], barracks: [8, 3], academy: [8, 3], lighthouse: [8, 3], manor: [7.5, 4], gate: [7.5, 4], grave: [7.5, 4], well: [7, 5], mill: [7, 5], tavern: [6.8, 6] };
  for (const l of C.landmarks) { const [sz, pri] = SZ[l.kind] || [7, 5]; const [x, y] = at(l.x, l.y, l.z || 0); out.push({ text: l.name, x, y: y + 9, size: sz, fam: FONT_FELL, style: 'italic', color: l.kind === 'tavern' ? '#5a3c1f' : '#24180f', halo: 'rgba(244,236,214,0.92)', sp: 0.02, min: 8.5, pri: pri + 1 }); }
  out.sort((a, b) => a.pri - b.pri);
  const m = document.createElement('canvas').getContext('2d');
  for (const l of out) { m.font = `${l.style} 100px ${l.fam}`; l.cw = [...l.text].map(ch => m.measureText(ch).width / 100); l.w = l.cw.reduce((a, b) => a + b, 0) + l.sp * (l.text.length - 1); }
  CV.list = out;
}
function drawCityLabels(g) {
  const boxes = [], hit = b => boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  for (const l of CV.list) {
    const fs = Math.max(l.size * CV.z, l.floor || 0); if (fs < l.min) continue;
    const w = l.w * fs, h = fs * 1.05, px = l.x * CV.z + CV.ox, py = l.y * CV.z + CV.oy;
    const box = { x: px - w / 2 - 3, y: py - h / 2 - 1, w: w + 6, h: h + 2 };
    if (box.x + box.w < 0 || box.x > CV.cw || box.y + box.h < BAR_H - 10 || box.y > CV.ch || hit(box)) continue;
    boxes.push(box);
    g.font = `${l.style} ${fs}px ${l.fam}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
    g.lineWidth = Math.max(2.2, fs * 0.32); g.strokeStyle = l.halo; g.fillStyle = l.d != null && l.d === CV.sel ? '#8f2f22' : l.color;
    const chars = [...l.text], xs = []; let x = px - w / 2; for (let k = 0; k < chars.length; k++) { xs.push(x); x += l.cw[k] * fs + l.sp * fs; }
    chars.forEach((c, k) => g.strokeText(c, xs[k], py)); chars.forEach((c, k) => g.fillText(c, xs[k], py));
  }
}
function cityDraw() {
  CV.dirty = false; if (!CV.open) return;
  const g = cctx; g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0); g.clearRect(0, 0, CV.cw, CV.ch);
  if (!CV.R) return;
  const R = CV.R;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 40; g.shadowOffsetY = 18; g.drawImage(R.can, CV.ox, CV.oy, R.W * CV.z, R.H * CV.z); g.restore();
  const hl = (k, fill, stroke, lw) => {
    const tiles = R.dTiles[k]; if (!tiles || !tiles.length) return;
    g.save(); g.setTransform(state.dpr * CV.z, 0, 0, state.dpr * CV.z, state.dpr * CV.ox, state.dpr * CV.oy);
    g.beginPath();
    for (const u of tiles) { const X = u % R.S, Y = (u / R.S) | 0, z = R.zOf(u), a = R.P(X, Y, z), b = R.P(X + 1, Y, z), c = R.P(X + 1, Y + 1, z), d = R.P(X, Y + 1, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); }
    g.fillStyle = fill; g.fill();
    g.beginPath();
    for (const u of tiles) {
      const X = u % R.S, Y = (u / R.S) | 0, z = R.zOf(u), a = R.P(X, Y, z), b = R.P(X + 1, Y, z), c = R.P(X + 1, Y + 1, z), d = R.P(X, Y + 1, z);
      const other = v => v < 0 || R.RD[v] !== k;
      if (other(Y > 0 ? u - R.S : -1)) { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      if (other(X + 1 < R.S ? u + 1 : -1)) { g.moveTo(b[0], b[1]); g.lineTo(c[0], c[1]); }
      if (other(Y + 1 < R.S ? u + R.S : -1)) { g.moveTo(d[0], d[1]); g.lineTo(c[0], c[1]); }
      if (other(X > 0 ? u - 1 : -1)) { g.moveTo(a[0], a[1]); g.lineTo(d[0], d[1]); }
    }
    g.strokeStyle = stroke; g.lineWidth = lw / CV.z; g.lineCap = 'round'; g.stroke(); g.restore();
  };
  if (CV.hover >= 0 && CV.hover !== CV.sel) hl(CV.hover, 'rgba(255,246,220,0.16)', 'rgba(43,33,22,0.6)', 1.4);
  if (CV.sel >= 0) hl(CV.sel, 'rgba(201,164,90,0.22)', '#b8483a', 2.2);
  if (CV.labels) drawCityLabels(g);
  // north arrow
  const nv = [[0, -1], [1, 0], [0, 1], [-1, 0]][CV.rot], sx = (nv[0] - nv[1]) * 16, sy = (nv[0] + nv[1]) * 8, l = Math.hypot(sx, sy), ux = sx / l, uy = sy / l;
  const ax = 40, ay = CV.ch - 40;
  g.beginPath(); g.arc(ax, ay, 24, 0, TAU); g.fillStyle = 'rgba(240,230,203,0.9)'; g.fill(); g.strokeStyle = '#2b2116'; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.moveTo(ax + ux * 17, ay + uy * 17); g.lineTo(ax - uy * 5, ay + ux * 5); g.lineTo(ax + uy * 5, ay - ux * 5); g.closePath(); g.fillStyle = '#a83a2c'; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(ax - ux * 14, ay - uy * 14); g.lineTo(ax - uy * 5, ay + ux * 5); g.lineTo(ax + uy * 5, ay - ux * 5); g.closePath(); g.fillStyle = '#2b2116'; g.fill();
  g.fillStyle = '#2b2116'; g.font = `12px ${FONT_SC}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', ax + ux * 33, ay + uy * 33);
}
function cityPick(sx, sy) {
  const R = CV.R; if (!R) return -1;
  const wx = (sx - CV.ox) / CV.z, wy = (sy - CV.oy) / CV.z;
  for (const e of [2, 1, 0, -1]) {
    const zz = e < 0 ? -5 : e * EL, a = (wx - R.OX) / TWH, b = (wy + zz - R.OY) / THH, X = Math.floor((a + b) / 2), Y = Math.floor((b - a) / 2);
    if (X < 0 || Y < 0 || X >= R.S || Y >= R.S) continue;
    const u = Y * R.S + X; if (R.zOf(u) === zz) return u;
  }
  return -1;
}
function openCity(s) {
  if (!state.map) return;
  state.map.cities = state.map.cities || {};
  Object.assign(CV, { s, open: true, sel: -1, hover: -1, rot: 0, R: null, cw: 0, ch: 0 });
  cityEl.hidden = false; cityEl.classList.remove('entering'); void cityEl.offsetWidth; if (!reduceMotion) cityEl.classList.add('entering');
  $('cityName').textContent = s.name; $('cityKind').textContent = s.kind === 'capital' ? 'royal capital' : s.kind === 'temple' ? 'abbey' : 'city';
  cveil.hidden = false; cveil.textContent = `Drawing ${s.name}…`;
  setTimeout(() => {
    CV.C = state.map.cities[s.i] || (state.map.cities[s.i] = generateCity(state.map, s));
    CV.R = renderCity(CV.C, CV.rot, CS); buildCityLabels();
    citySize(); cityFit(); { const [X, Y] = CV.R.rp(CV.C.cx, CV.C.cy), [qx, qy] = CV.R.P(X, Y, 0); CV.z = cClampZ(CV.fitZ * (CV.cw < 700 ? 2.4 : 1.35)); CV.ox = CV.cw / 2 - qx * CV.z; CV.oy = (CV.ch + BAR_H) / 2 - qy * CV.z; cityReq(); } cityPanel(); cveil.hidden = true; cc.focus({ preventScroll: true });
  }, 40);
}
function closeCity() {
  if (!CV.open) return;
  CV.open = false; cityEl.hidden = true; ctip.hidden = true;
  if (CV.R) CV.R.can.width = CV.R.can.height = 1; CV.R = null;
  if (state.sel >= 0) survey(state.sel);
  canvas.focus({ preventScroll: true });
}
function rotateCity(dir) {
  if (!CV.R) return;
  const R = CV.R, S2 = R.S;
  const wx = (CV.cw / 2 - CV.ox) / CV.z, wy = (CV.ch / 2 - CV.oy) / CV.z, a = (wx - R.OX) / TWH, b = (wy - R.OY) / THH;
  const X = (a + b) / 2, Y = (b - a) / 2;
  const inv = [(x, y) => [x, y], (x, y) => [y, S2 - x], (x, y) => [S2 - x, S2 - y], (x, y) => [S2 - y, x]][CV.rot];
  const [px, py] = inv(X, Y);
  CV.rot = (CV.rot + dir + 4) % 4;
  cveil.hidden = false; cveil.textContent = 'Turning the view…';
  setTimeout(() => {
    CV.R.can.width = CV.R.can.height = 1;
    CV.R = renderCity(CV.C, CV.rot, CS); buildCityLabels();
    const [nX, nY] = CV.R.rp(px, py), [qx, qy] = CV.R.P(nX, nY, 0);
    CV.ox = CV.cw / 2 - qx * CV.z; CV.oy = CV.ch / 2 - qy * CV.z;
    cveil.hidden = true; cityReq();
  }, 30);
}
function cityFlyToDistrict(k) {
  const D = CV.C.districts[k]; if (!D || D.cx == null || !CV.R) return;
  const [X, Y] = CV.R.rp(D.cx, D.cy), [qx, qy] = CV.R.P(X, Y, 0), z1 = cClampZ(Math.max(CV.z, CV.fitZ * 2));
  const x1 = CV.cw / 2 - qx * z1, y1 = (CV.ch + BAR_H) / 2 - qy * z1;
  if (reduceMotion) { CV.z = z1; CV.ox = x1; CV.oy = y1; cityReq(); return; }
  const z0 = CV.z, x0 = CV.ox, y0 = CV.oy, t0 = performance.now();
  const step = now => { const t = Math.min(1, (now - t0) / 500), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; CV.z = z0 + (z1 - z0) * e; CV.ox = x0 + (x1 - x0) * e; CV.oy = y0 + (y1 - y0) * e; cityDraw(); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function selectDistrict(k, fly) { CV.sel = k; if (k >= 0) districtPanel(k); else cityPanel(); showTab('survey'); if (fly && k >= 0) cityFlyToDistrict(k); cityReq(); }
function cityPanel() {
  const C = CV.C, s = CV.s, ds = C.districts.filter(d => d.tiles > 0);
  const lm = C.landmarks.filter(l => !['tavern', 'gate', 'well'].includes(l.kind)).map(l => l.name);
  if (C.kind === 'abbey') {
    const facts = [['Order', C.order], ['Community', `${C.community} brothers and sisters`], ['Founded', `In the year ${C.founded}`], ['Gate', C.gates.map(g => g.name).join(', ') || 'A wicket in the precinct wall']];
    if (C.river) facts.push(['River', C.river]);
    $('pane-survey').innerHTML = `
    <p class="eyebrow">abbey survey · hex ${hexNo(s.i)}</p>
    <h2>${esc(s.name)}</h2>
    <p class="kind">Abbey and grange</p>
    <p class="flavour">${esc(C.intro)}</p>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <div class="group" style="margin-top:18px"><h3>Grounds</h3>${ds.map(d => `<button class="place" data-d="${d.id}"><span class="nm">${esc(d.name)}</span><span class="meta">${DTYPE[d.type].label}</span></button>`).join('')}</div>
    <div class="group"><h3>Buildings and gardens</h3><p class="note" style="margin:0">${lm.map(esc).join(' · ')}</p></div>
    <p class="hint">Click the precinct or the grange to survey it. Drag to pan, scroll or pinch to zoom, and turn the view with the arrows.</p>
    <button class="btn" id="cityBack2" style="margin-top:12px">Back to the realm map</button>`;
    $('pane-survey').querySelectorAll('.place').forEach(b => b.addEventListener('click', () => selectDistrict(+b.dataset.d, true)));
    $('cityBack2').addEventListener('click', closeCity);
    return;
  }
  const facts = [['Walls', `${C.towers} towers · ${C.gates.length} gates`], ['Gates', C.gates.map(g => g.name).join(', ') || 'None'], ['Span', `${C.spanYards.toLocaleString('en-US')} yards across the walls`]];
  if (C.coastal) facts.push(['Waterfront', C.waterName || (C.isLake ? 'Lake shore' : 'Open sea')]);
  if (C.river) facts.push(['River', C.river]);
  $('pane-survey').innerHTML = `
    <p class="eyebrow">city survey · hex ${hexNo(s.i)}</p>
    <h2>${esc(s.name)}</h2>
    <p class="kind">${KIND[s.kind]} · pop. ${s.pop.toLocaleString('en-US')}</p>
    <p class="flavour">${esc(C.intro)}</p>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <div class="group" style="margin-top:18px"><h3>Districts</h3>${ds.map(d => `<button class="place" data-d="${d.id}"><span class="nm">${esc(d.name)}</span><span class="meta">${DTYPE[d.type].label}</span></button>`).join('')}</div>
    <div class="group"><h3>Landmarks</h3><p class="note" style="margin:0">${lm.map(esc).join(' · ')}</p></div>
    <div class="group"><h3>Taverns</h3><p class="note" style="margin:0">${C.taverns.map(t => esc(t.tavern)).join(' · ') || 'None of note'}</p></div>
    <p class="hint">Click a district to survey it. Drag to pan, scroll or pinch to zoom, and turn the view with the arrows.</p>
    <button class="btn" id="cityBack2" style="margin-top:12px">Back to the realm map</button>`;
  $('pane-survey').querySelectorAll('.place').forEach(b => b.addEventListener('click', () => selectDistrict(+b.dataset.d, true)));
  $('cityBack2').addEventListener('click', closeCity);
}
function districtPanel(k) {
  const C = CV.C, D = C.districts[k], pr = DTYPE[D.type];
  const lms = C.landmarks.filter(l => l.d === k && !['tavern', 'gate'].includes(l.kind)).map(l => l.name);
  const tvs = C.taverns.filter(t => t.district === k).map(t => t.tavern);
  const storeys = pr.floors[0] === pr.floors[1] ? `${pr.floors[0]} ${pr.floors[0] === 1 ? 'storey' : 'storeys'}` : `${pr.floors[0]}–${pr.floors[1]} storeys`;
  const facts = [['Buildings', String(D.bcount + lms.length)], ['Houses', `${storeys}, ${pr.timber > 0.4 ? 'timber-framed' : 'stone and plaster'}`]];
  if (D.type === 'precinct') facts.push(['Enclosure', 'Within the precinct wall']); else if (D.type !== 'outer' && D.type !== 'grange') facts.push(['Share', `${Math.max(1, Math.round(D.tiles / C.insideCount * 100))}% of the walled city`]); else facts.push(['Share', 'Outside the walls']);
  if (lms.length) facts.push(['Landmarks', lms.join(', ')]);
  if (tvs.length) facts.push(['Taverns', tvs.join(', ')]);
  $('pane-survey').innerHTML = `
    <button class="crumb" id="crumb">← ${esc(C.name)}</button>
    <p class="eyebrow">${pr.label.toLowerCase()}</p>
    <h2>${esc(D.name)}</h2>
    <p class="kind">${C.kind === 'abbey' ? 'Part of' : 'District of'} ${esc(C.name)}</p>
    <p class="flavour">${esc(D.desc)}</p>
    <dl class="facts">${facts.map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>
    <p class="hint">Click another district, or the city name above to return to the overview.</p>`;
  $('crumb').addEventListener('click', () => selectDistrict(-1, false));
}
/* city input */
{
  const pts2 = new Map(); let drag2 = null, pinch2 = null;
  const loc = e => { const r = cc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cc.addEventListener('pointerdown', e => { cc.setPointerCapture(e.pointerId); const [x, y] = loc(e); pts2.set(e.pointerId, [x, y]); if (pts2.size === 1) drag2 = { x, y, ox: CV.ox, oy: CV.oy, moved: false }; if (pts2.size === 2) { const [a, b] = [...pts2.values()]; pinch2 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, z: CV.z, ox: CV.ox, oy: CV.oy }; if (drag2) drag2.moved = true; } });
  cc.addEventListener('pointermove', e => {
    const [x, y] = loc(e);
    if (pts2.has(e.pointerId)) {
      pts2.set(e.pointerId, [x, y]);
      if (pts2.size === 2 && pinch2) { const [a, b] = [...pts2.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nz = cClampZ(pinch2.z * d / pinch2.d), wx = (pinch2.mx - pinch2.ox) / pinch2.z, wy = (pinch2.my - pinch2.oy) / pinch2.z; CV.z = nz; CV.ox = mx - wx * nz; CV.oy = my - wy * nz; cityReq(); return; }
      if (drag2) { const dx = x - drag2.x, dy = y - drag2.y; if (Math.hypot(dx, dy) > 4) { drag2.moved = true; cc.classList.add('dragging'); ctip.hidden = true; } if (drag2.moved) { CV.ox = drag2.ox + dx; CV.oy = drag2.oy + dy; cityReq(); } }
      return;
    }
    if (e.pointerType !== 'mouse' || !CV.R) return;
    const u = cityPick(x, y), k = u >= 0 ? CV.R.RD[u] : -1;
    if (k !== CV.hover) { CV.hover = k; cityReq(); }
    if (k < 0) { ctip.hidden = true; return; }
    const D = CV.C.districts[k]; ctip.innerHTML = `<b>${esc(D.name)}</b> · ${DTYPE[D.type].label}`; ctip.hidden = false;
    ctip.style.left = Math.min(x, CV.cw - ctip.offsetWidth - 24) + 'px'; ctip.style.top = Math.min(y, CV.ch - 44) + 'px';
  });
  const end = e => {
    if (!pts2.has(e.pointerId)) return; pts2.delete(e.pointerId); cc.classList.remove('dragging');
    if (pts2.size === 0) { if (drag2 && !drag2.moved && e.type === 'pointerup') { const [x, y] = loc(e), u = cityPick(x, y); selectDistrict(u >= 0 ? CV.R.RD[u] : -1, false); } drag2 = null; pinch2 = null; }
    else if (pts2.size === 1) { const [p] = [...pts2.values()]; drag2 = { x: p[0], y: p[1], ox: CV.ox, oy: CV.oy, moved: true }; pinch2 = null; }
  };
  cc.addEventListener('pointerup', end); cc.addEventListener('pointercancel', end);
  cc.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { CV.hover = -1; ctip.hidden = true; cityReq(); } });
  cc.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = loc(e); cZoomAt(x, y, CV.z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016))); }, { passive: false });
  cc.addEventListener('keydown', e => {
    const k = e.key;
    if (k === '+' || k === '=') cZoomAt(CV.cw / 2, CV.ch / 2, CV.z * 1.3);
    else if (k === '-' || k === '_') cZoomAt(CV.cw / 2, CV.ch / 2, CV.z / 1.3);
    else if (k.startsWith('Arrow')) { CV.ox += k === 'ArrowLeft' ? 60 : k === 'ArrowRight' ? -60 : 0; CV.oy += k === 'ArrowUp' ? 60 : k === 'ArrowDown' ? -60 : 0; cityReq(); }
    else if (k === '[') rotateCity(-1); else if (k === ']') rotateCity(1);
    else return;
    e.preventDefault();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && CV.open) closeCity(); });
  $('cityBack').addEventListener('click', closeCity);
  $('cityRotL').addEventListener('click', () => rotateCity(-1));
  $('cityRotR').addEventListener('click', () => rotateCity(1));
  $('cIn').addEventListener('click', () => cZoomAt(CV.cw / 2, CV.ch / 2, CV.z * 1.4));
  $('cOut').addEventListener('click', () => cZoomAt(CV.cw / 2, CV.ch / 2, CV.z / 1.4));
  $('cFit').addEventListener('click', cityFit);
  $('cityLabels').addEventListener('click', () => { CV.labels = !CV.labels; $('cityLabels').setAttribute('aria-pressed', String(CV.labels)); cityReq(); });
  new ResizeObserver(() => { if (CV.open) citySize(); }).observe(cityEl);
}

export { closeCity, openCity };
