import { ASSET_BY_ID, ASSET_GROUPS, TERRAIN, drawAsset, footprint } from '../tiles/index.js';
import { $, coarse, state } from '../ui/state.js';
import { BIOMES, generateScene } from './generate.js';
import { MAX_ELEV, blankModel, cloneModel, fits, fromJSON, objAt, toJSON } from './model.js';
import { brushTiles as brushAt, eraseAt, floodFill, paintTiles, placePiece, setElev, shiftElev } from './ops.js';
import { EL, THH, TWH, renderTiles, rotInst, thumb, updateTiles } from './render.js';

/* ================= tile editor screen ================= */
const root = $('editor'), cv = $('edCanvas'), cx = cv.getContext('2d'), ov = $('edOverlay'), ovx = ov.getContext('2d'), statusEl = $('edStatus'), stage = $('edStage');
const SC = coarse ? 1.4 : 2, SAVE_KEY = 'hexwright.tiles.v1', HIST = 60;
const TOOLS = [
  ['paint', 'Paint', 'B', '▦'], ['fill', 'Fill', 'G', '◩'], ['raise', 'Raise', 'U', '▲'], ['lower', 'Lower', 'J', '▼'], ['level', 'Level', 'L', '▬'],
  ['place', 'Place', 'P', '⌂'], ['erase', 'Erase', 'E', '✕'], ['pick', 'Pick', 'I', '◉'], ['pan', 'Pan', 'H', '✥']
];
const ED = { open: false, M: null, R: null, rot: 0, z: 1, ox: 0, oy: 0, fitZ: 1, cw: 0, ch: 0, tool: 'paint', brush: 1, terrain: 'grass', asset: 'cottage', face: 0, hover: null, grid: true, undo: [], redo: [], stale: true, dirty: false, stroke: null, tab: 'Terrain' };

/* ---------- persistence ---------- */
let saveT = 0;
function autosave() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(toJSON(ED.M))); } catch { /* storage unavailable: the map still lives in memory */ } }, 400); }
function restore() { try { const s = localStorage.getItem(SAVE_KEY); return s ? fromJSON(JSON.parse(s)) : null; } catch { return null; } }
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
const slug = s => (s || 'tile-map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tile-map';

/* ---------- history ---------- */
function checkpoint() { ED.undo.push(cloneModel(ED.M)); if (ED.undo.length > HIST) ED.undo.shift(); ED.redo.length = 0; syncHist(); }
function undo() { if (!ED.undo.length) return; ED.redo.push(cloneModel(ED.M)); setModel(ED.undo.pop(), true); }
function redo() { if (!ED.redo.length) return; ED.undo.push(cloneModel(ED.M)); setModel(ED.redo.pop(), true); }
function syncHist() { $('edUndo').disabled = !ED.undo.length; $('edRedo').disabled = !ED.redo.length; }
function setModel(M, keepView) {
  const resize = !ED.M || ED.M.S !== M.S; ED.M = M; ED.stale = resize || ED.stale === true ? true : 'model';
  $('edName').value = M.name; $('edSize').value = String(M.S);
  syncHist(); autosave();
  if (resize || !keepView) { rebuild(); fitView(); } else changed();
  status();
}
/* the model was edited: the next frame patches the map image rather than redrawing it */
function changed() { if (!ED.stale) ED.stale = 'model'; autosave(); req(); }

/* ---------- programmatic edits (used by the automation API) ---------- */
function ensureModel() { if (!ED.M) { ED.M = restore() || generateScene('ember', 28, 'vale'); ED.stale = true; } return ED.M; }
/* run fn(M) as one undoable edit; fn returns { changed } (a count) and anything else is passed through.
   If fn throws, the map is put back as it was. */
function mutate(fn) {
  ensureModel(); const snap = cloneModel(ED.M); let r;
  try { r = fn(ED.M); } catch (err) { Object.assign(ED.M, snap); throw err; }
  if (r && r.changed) { ED.undo.push(snap); if (ED.undo.length > HIST) ED.undo.shift(); ED.redo.length = 0; syncHist(); changed(); status(); }
  return r;
}
/* swap in a whole new map as one undoable step */
function replaceModel(M) { ensureModel(); checkpoint(); setModel(M); }
/* drag the current tool through a path of model tiles, as pointer events would */
function runStroke(path) {
  ensureModel(); checkpoint(); ED.stroke = { seen: new Set() }; const keep = ED.hover;
  try { path.forEach((p, i) => { ED.hover = { x: p[0], y: p[1] }; applyAt(ED.hover, i === 0); }); } finally { ED.hover = keep; endStroke(); status(); }
}
function setRot(r) {
  if (!ED.open || !ED.R) { ED.rot = r; ED.stale = true; return; }
  for (let n = ((r - ED.rot) % 4 + 4) % 4; n > 0; n--) turnView(1);
}

/* ---------- view ---------- */
/* ED.stale is true when the view itself changed (rotation, grid, size) and 'model' after an edit */
function rebuild() {
  if (ED.stale !== true && ED.R && updateTiles(ED.R, ED.M)) { const b = ED.R.patched; if (b && patch !== 'all') patch = patch ? [Math.min(patch[0], b[0]), Math.min(patch[1], b[1]), Math.max(patch[2], b[2]), Math.max(patch[3], b[3])] : b; }
  else { ED.R = renderTiles(ED.M, ED.rot, SC, { grid: ED.grid }); patch = 'all'; }
  ED.stale = false;
}
function size() { const r = stage.getBoundingClientRect(); if (!r.width) return; ED.cw = r.width; ED.ch = r.height; for (const c of [cv, ov]) { c.width = Math.round(r.width * state.dpr); c.height = Math.round(r.height * state.dpr); c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; } patch = 'all'; req(); }
function fitView() { if (!ED.R) return; ED.fitZ = Math.min(ED.cw / ED.R.W, ED.ch / ED.R.H) * 0.96; ED.z = ED.fitZ; ED.ox = (ED.cw - ED.R.W * ED.z) / 2; ED.oy = (ED.ch - ED.R.H * ED.z) / 2; req(); }
const clampZ = v => Math.max(ED.fitZ * 0.5, Math.min(Math.max(ED.fitZ * 8, 4), v));
function zoomAt(sx, sy, nz) { nz = clampZ(nz); const wx = (sx - ED.ox) / ED.z, wy = (sy - ED.oy) / ED.z; ED.z = nz; ED.ox = sx - wx * ED.z; ED.oy = sy - wy * ED.z; req(); }
let raf = 0; const req = () => { if (!raf) raf = requestAnimationFrame(draw); };

/* model tile -> view tile */
const toView = (x, y) => { const S = ED.M.S, r = ED.rot; const X = r === 0 ? x : r === 1 ? S - 1 - y : r === 2 ? S - 1 - x : y, Y = r === 0 ? y : r === 1 ? x : r === 2 ? S - 1 - y : S - 1 - x; return Y * S + X; };
/* screen point -> model tile, testing the highest ground first */
function pick(sx, sy) {
  const R = ED.R; if (!R) return null; const wx = (sx - ED.ox) / ED.z, wy = (sy - ED.oy) / ED.z, S = R.S;
  for (let e = MAX_ELEV; e >= 0; e--) {
    const zz = e * EL, a = (wx - R.OX) / TWH, b = (wy + zz - R.OY) / THH, X = Math.floor((a + b) / 2), Y = Math.floor((b - a) / 2);
    if (X < 0 || Y < 0 || X >= S || Y >= S) continue;
    const t = R.back[Y * S + X]; if (ED.M.elev[t] === e) return { x: t % S, y: (t / S) | 0 };
  }
  return null;
}
const brushTiles = (x, y) => brushAt(ED.M, x, y, ED.brush);
const ghost = () => ED.hover && { id: ED.asset, x: ED.hover.x, y: ED.hover.y, face: ED.face, v: 0.37 };

/* the soft shadow the map casts on the desk, blurred once per map and zoom level rather than every
   frame; blurring the whole map image on each hover cost more than everything else in a frame */
let shade = null;
function dropShadow(R) {
  const z = ED.z, dpr = state.dpr;
  if (shade && shade.R === R && shade.z === z && shade.dpr === dpr) return shade;
  const S = R.S, pts = [R.P(0, 0, 0), R.P(S, 0, 0), R.P(S, 0, -30), R.P(S, S, -30), R.P(0, S, -30), R.P(0, S, 0)];
  const x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), x1 = Math.max(...pts.map(p => p[0])), y1 = Math.max(...pts.map(p => p[1]));
  /* blur 36 and drop 16 device px, as a canvas shadow on the image itself would; drawn at reduced size when zoomed in, which a blur this soft hides */
  const pad = 90, q = Math.min(1, 1600 / ((Math.max(x1 - x0, y1 - y0)) * z * dpr + 2 * pad)), k = z * dpr * q;
  const can = document.createElement('canvas'); can.width = Math.ceil((x1 - x0) * k + 2 * pad * q); can.height = Math.ceil((y1 - y0) * k + 2 * pad * q);
  const g = can.getContext('2d'), off = can.width + 50;
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 36 * q; g.shadowOffsetX = off; g.shadowOffsetY = 16 * q;
  /* the shape itself sits off the left edge so only its shadow lands on the canvas */
  g.setTransform(k, 0, 0, k, pad * q - x0 * k - off, pad * q - y0 * k);
  g.beginPath(); pts.forEach((p, j) => j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = '#000'; g.fill();
  const css = 1 / (dpr * q);
  shade = { R, z, dpr, can, x: x0 * z - pad / dpr, y: y0 * z - pad / dpr, w: can.width * css, h: can.height * css };
  return shade;
}

/* Two stacked canvases: the map below is redrawn only when the map or the view changes, since
   scaling the full-size map image down to the screen is the slowest thing a frame does. The hover
   outline and piece ghost go on the overlay above, which every pointer move redraws. */
let drawn = '', patch = null;
function draw() {
  raf = 0; if (!ED.open) return;
  if (ED.stale) rebuild();
  const R = ED.R, dpr = state.dpr, view = [ED.ox, ED.oy, ED.z, ED.cw, ED.ch, dpr].join(), m = cx;
  if (view !== drawn || patch === 'all') {
    drawn = view; patch = null;
    m.setTransform(dpr, 0, 0, dpr, 0, 0); m.clearRect(0, 0, ED.cw, ED.ch);
    m.imageSmoothingEnabled = true; m.imageSmoothingQuality = 'high';
    const sh = dropShadow(R); m.drawImage(sh.can, ED.ox + sh.x, ED.oy + sh.y, sh.w, sh.h);
    m.drawImage(R.can, ED.ox, ED.oy, R.W * ED.z, R.H * ED.z);
  } else if (patch) {
    /* an edit patched part of the map image: copy just that part to the screen, reading a margin
       around it so the scaled edges sample the same neighbours a full copy would */
    const b = patch, k = ED.z * dpr, x0 = Math.max(0, Math.floor((ED.ox + b[0] * ED.z) * dpr)), y0 = Math.max(0, Math.floor((ED.oy + b[1] * ED.z) * dpr));
    const x1 = Math.min(cv.width, Math.ceil((ED.ox + b[2] * ED.z) * dpr)), y1 = Math.min(cv.height, Math.ceil((ED.oy + b[3] * ED.z) * dpr)); patch = null;
    if (x1 > x0 && y1 > y0) {
      const pad = 4 / Math.min(1, k / R.SC), sx0 = Math.max(0, (x0 - ED.ox * dpr) / k * R.SC - pad), sy0 = Math.max(0, (y0 - ED.oy * dpr) / k * R.SC - pad);
      const sx1 = Math.min(R.can.width, (x1 - ED.ox * dpr) / k * R.SC + pad), sy1 = Math.min(R.can.height, (y1 - ED.oy * dpr) / k * R.SC + pad);
      m.save(); m.setTransform(1, 0, 0, 1, 0, 0); m.beginPath(); m.rect(x0, y0, x1 - x0, y1 - y0); m.clip(); m.clearRect(x0, y0, x1 - x0, y1 - y0);
      m.imageSmoothingEnabled = true; m.imageSmoothingQuality = 'high';
      const sh = dropShadow(R); m.drawImage(sh.can, (ED.ox + sh.x) * dpr, (ED.oy + sh.y) * dpr, sh.w * dpr, sh.h * dpr);
      if (sx1 > sx0 && sy1 > sy0) m.drawImage(R.can, sx0, sy0, sx1 - sx0, sy1 - sy0, ED.ox * dpr + sx0 / R.SC * k, ED.oy * dpr + sy0 / R.SC * k, (sx1 - sx0) / R.SC * k, (sy1 - sy0) / R.SC * k);
      m.restore();
    }
  }
  const g = ovx;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, ov.width, ov.height);
  if (!ED.hover) return;
  g.save(); g.setTransform(dpr * ED.z, 0, 0, dpr * ED.z, dpr * ED.ox, dpr * ED.oy);
  const outline = (tiles, stroke, fill) => {
    g.beginPath();
    for (const [x, y] of tiles) { const u = toView(x, y), X = u % R.S, Y = (u / R.S) | 0, z = R.zOf(u), a = R.P(X, Y, z), b = R.P(X + 1, Y, z), c = R.P(X + 1, Y + 1, z), d = R.P(X, Y + 1, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); }
    if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = stroke; g.lineWidth = 1.6 / ED.z; g.stroke();
  };
  const { x, y } = ED.hover;
  if (ED.tool === 'place') {
    const o = ghost(), ok = fits(ED.M, o), [w, d] = footprint(o), tiles = [];
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (x + i < ED.M.S && y + j < ED.M.S) tiles.push([x + i, y + j]);
    outline(tiles, ok ? 'rgba(255,240,200,0.9)' : '#b8483a', ok ? 'rgba(255,240,200,0.18)' : 'rgba(184,72,58,0.25)');
    const v = rotInst(o, ED.rot, ED.M.S); let z = 0; for (const [tx, ty] of tiles) z = Math.max(z, R.zOf(toView(tx, ty)));
    g.globalAlpha = ok ? 0.85 : 0.45; drawAsset(g, R.P, v, ASSET_BY_ID[o.id].water ? z : z, ED.M.clim); g.globalAlpha = 1;
  } else if (ED.tool === 'erase' || ED.tool === 'pick') {
    const k = objAt(ED.M, x, y);
    if (k >= 0) { const o = ED.M.objs[k], [w, d] = footprint(o), tiles = []; for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) tiles.push([o.x + i, o.y + j]); outline(tiles, ED.tool === 'erase' ? '#b8483a' : '#e4c684', ED.tool === 'erase' ? 'rgba(184,72,58,0.3)' : 'rgba(228,198,132,0.25)'); }
    else outline([[x, y]], 'rgba(255,240,200,0.7)');
  } else if (ED.tool !== 'pan') outline(ED.tool === 'fill' ? [[x, y]] : brushTiles(x, y), 'rgba(255,240,200,0.9)', 'rgba(255,240,200,0.12)');
  g.restore();
}

/* ---------- tools ---------- */
function applyAt(p, first) {
  const M = ED.M, S = M.S, st = ED.stroke;
  const key = p.x + ',' + p.y; if (!first && st.seen.has(key) && ED.tool !== 'paint') return; st.seen.add(key);
  if (ED.tool === 'paint') { if (paintTiles(M, brushTiles(p.x, p.y), ED.terrain)) changed(); }
  else if (ED.tool === 'raise' || ED.tool === 'lower') { const fresh = brushTiles(p.x, p.y).filter(([x, y]) => { const k = x + ',' + y + '#'; if (st.seen.has(k)) return false; st.seen.add(k); return true; }); shiftElev(M, fresh, ED.tool === 'raise' ? 1 : -1); changed(); }
  else if (ED.tool === 'level') { if (first) st.level = M.elev[p.y * S + p.x]; setElev(M, brushTiles(p.x, p.y), st.level); changed(); }
  else if (ED.tool === 'fill' && first) { if (floodFill(M, p.x, p.y, ED.terrain)) changed(); }
  else if (ED.tool === 'place') { if (placePiece(M, ghost()).ok) changed(); }
  else if (ED.tool === 'erase') { if (eraseAt(M, p.x, p.y)) changed(); }
  else if (ED.tool === 'pick' && first) { const k = objAt(M, p.x, p.y); if (k >= 0) { ED.asset = M.objs[k].id; ED.face = M.objs[k].face; setTab(ASSET_BY_ID[ED.asset].group); setTool('place'); } else { ED.terrain = TERRAIN[M.terr[p.y * S + p.x]].id; setTab('Terrain'); setTool('paint'); } syncPalette(); }
}
function setTool(t) { ED.tool = t; for (const b of root.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t)); cv.style.cursor = t === 'pan' ? 'grab' : 'crosshair'; req(); }
function setTab(t) { ED.tab = t; for (const b of root.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t)); buildPalette(); }
function status() {
  if (!ED.hover) { statusEl.textContent = `${ED.M.S}×${ED.M.S} tiles · ${ED.M.objs.length} pieces`; return; }
  const { x, y } = ED.hover, u = y * ED.M.S + x, k = objAt(ED.M, x, y);
  statusEl.textContent = `${x}, ${y} · ${TERRAIN[ED.M.terr[u]].label} · height ${ED.M.elev[u]}${k >= 0 ? ' · ' + ASSET_BY_ID[ED.M.objs[k].id].label : ''}`;
}

/* ---------- palette ---------- */
const thumbs = new Map();
function buildPalette() {
  const box = $('edItems'); box.textContent = '';
  const groups = ED.tab === 'Terrain' ? [...new Set(TERRAIN.map(t => t.group))].map(gn => [gn, TERRAIN.filter(t => t.group === gn), 'terrain']) : [[ED.tab, ASSET_GROUPS.find(a => a[0] === ED.tab)[1], 'asset']];
  for (const [gn, items, kind] of groups) {
    if (ED.tab === 'Terrain') { const h = document.createElement('h3'); h.className = 'ed-group'; h.textContent = gn; box.appendChild(h); }
    const grid = document.createElement('div'); grid.className = 'ed-grid'; box.appendChild(grid);
    for (const it of items) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ed-item'; b.dataset.kind = kind; b.dataset.id = it.id; b.title = it.label + (kind === 'asset' && (it.w > 1 || it.d > 1) ? ` (${it.w}×${it.d})` : '');
      const key = kind + it.id; if (!thumbs.has(key)) thumbs.set(key, thumb(kind, it.id, 60));
      const c = document.createElement('canvas'), src = thumbs.get(key); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); b.appendChild(c);
      const s = document.createElement('span'); s.textContent = it.label; b.appendChild(s);
      b.addEventListener('click', () => { if (kind === 'terrain') { ED.terrain = it.id; if (!['paint', 'fill'].includes(ED.tool)) setTool('paint'); } else { ED.asset = it.id; setTool('place'); } syncPalette(); });
      grid.appendChild(b);
    }
  }
  syncPalette();
}
function syncPalette() { for (const b of root.querySelectorAll('.ed-item')) b.setAttribute('aria-pressed', String(b.dataset.kind === 'terrain' ? b.dataset.id === ED.terrain : b.dataset.id === ED.asset)); $('edFace').textContent = `Facing ${['south-west', 'south-east', 'north-east', 'north-west'][ED.face]}`; }

/* ---------- input ---------- */
const pts = new Map(); let pan = null, pinch = null, spaceDown = false;
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const [x, y] = local(e); pts.set(e.pointerId, [x, y]);
  if (pts.size === 2) { if (ED.stroke) endStroke(); const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, z: ED.z, ox: ED.ox, oy: ED.oy }; pan = null; return; }
  if (ED.tool === 'pan' || e.button === 1 || e.button === 2 || spaceDown) { pan = { x, y, ox: ED.ox, oy: ED.oy }; cv.style.cursor = 'grabbing'; return; }
  const p = pick(x, y); if (!p) return;
  checkpoint(); ED.stroke = { seen: new Set() }; ED.hover = p; applyAt(p, true); status();
});
cv.addEventListener('pointermove', e => {
  const [x, y] = local(e);
  if (pts.has(e.pointerId)) pts.set(e.pointerId, [x, y]);
  if (pinch && pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nz = clampZ(pinch.z * d / pinch.d), wx = (pinch.mx - pinch.ox) / pinch.z, wy = (pinch.my - pinch.oy) / pinch.z; ED.z = nz; ED.ox = mx - wx * nz; ED.oy = my - wy * nz; req(); return; }
  if (pan) { ED.ox = pan.ox + x - pan.x; ED.oy = pan.oy + y - pan.y; req(); return; }
  const p = pick(x, y), same = p && ED.hover && p.x === ED.hover.x && p.y === ED.hover.y;
  if (!same) { ED.hover = p; status(); req(); if (p && ED.stroke) applyAt(p, false); }
});
function endStroke() { if (ED.stroke) { ED.stroke = null; const last = ED.undo[ED.undo.length - 1]; if (last && JSON.stringify(toJSON(last)) === JSON.stringify(toJSON(ED.M))) { ED.undo.pop(); syncHist(); } } }
const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { pan = null; endStroke(); cv.style.cursor = ED.tool === 'pan' ? 'grab' : 'crosshair'; } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) { ED.hover = null; status(); req(); } });
cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, ED.z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016))); }, { passive: false });
function turnView(dir) {
  const R = ED.R; if (!R) return;
  const wx = (ED.cw / 2 - ED.ox) / ED.z, wy = (ED.ch / 2 - ED.oy) / ED.z, S = R.S;
  const gx = ((wx - R.OX) / TWH + (wy - R.OY) / THH) / 2, gy = ((wy - R.OY) / THH - (wx - R.OX) / TWH) / 2;
  const back = [[gx, gy], [gy, S - gx], [S - gx, S - gy], [S - gy, gx]][ED.rot], nr = (ED.rot + dir + 4) % 4, [nx, ny] = [[back[0], back[1]], [S - back[1], back[0]], [S - back[0], S - back[1]], [back[1], S - back[0]]][nr];
  ED.rot = nr; ED.stale = true; rebuild();
  const sx = ED.R.OX + (nx - ny) * TWH, sy = ED.R.OY + (nx + ny) * THH; ED.ox = ED.cw / 2 - sx * ED.z; ED.oy = ED.ch / 2 - sy * ED.z; req();
}
function turnPiece() { ED.face = (ED.face + 1) % 4; syncPalette(); req(); }
document.addEventListener('keydown', e => { if (ED.open && e.key === ' ' && e.target.tagName !== 'INPUT') { spaceDown = true; e.preventDefault(); } });
document.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });
root.addEventListener('keydown', e => {
  if (!ED.open || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && (k === 'z' || k === 'Z')) { e.shiftKey ? redo() : undo(); }
  else if (mod && (k === 'y' || k === 'Y')) redo();
  else if (mod) return;
  else if (k === 'r' || k === 'R') turnPiece();
  else if (k === '[') turnView(-1); else if (k === ']') turnView(1);
  else if (k === '+' || k === '=') zoomAt(ED.cw / 2, ED.ch / 2, ED.z * 1.3);
  else if (k === '-' || k === '_') zoomAt(ED.cw / 2, ED.ch / 2, ED.z / 1.3);
  else if (k >= '1' && k <= '3') { ED.brush = +k; syncBrush(); }
  else if (k === 'Escape') closeEditor();
  else { const t = TOOLS.find(t2 => t2[2].toLowerCase() === k.toLowerCase()); if (!t) return; setTool(t[0]); }
  e.preventDefault();
});
function syncBrush() { for (const b of root.querySelectorAll('[data-brush]')) b.setAttribute('aria-pressed', String(+b.dataset.brush === ED.brush)); req(); }

/* ---------- chrome ---------- */
function buildChrome() {
  const tb = $('edTools');
  for (const [id, label, key, glyph] of TOOLS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ed-tool'; b.dataset.tool = id; b.title = `${label} (${key})`; b.innerHTML = `<span aria-hidden="true">${glyph}</span>${label}`; b.addEventListener('click', () => setTool(id)); tb.appendChild(b); }
  for (const b of root.querySelectorAll('[data-brush]')) b.addEventListener('click', () => { ED.brush = +b.dataset.brush; syncBrush(); });
  const tabs = $('edTabs');
  for (const t of ['Terrain', ...ASSET_GROUPS.map(a => a[0])]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.role = 'tab'; b.dataset.tab = t; b.textContent = t; b.addEventListener('click', () => setTab(t)); tabs.appendChild(b); }
  const bs = $('edBiome'); for (const [k, B] of Object.entries(BIOMES)) { const o = document.createElement('option'); o.value = k; o.textContent = B.label; bs.appendChild(o); }
  $('edBack').addEventListener('click', closeEditor);
  $('edUndo').addEventListener('click', undo); $('edRedo').addEventListener('click', redo);
  $('edRotL').addEventListener('click', () => turnView(-1)); $('edRotR').addEventListener('click', () => turnView(1));
  $('edFace').addEventListener('click', turnPiece);
  $('edGrid').addEventListener('click', () => { ED.grid = !ED.grid; $('edGrid').setAttribute('aria-pressed', String(ED.grid)); ED.stale = true; req(); });
  $('edIn').addEventListener('click', () => zoomAt(ED.cw / 2, ED.ch / 2, ED.z * 1.4)); $('edOut').addEventListener('click', () => zoomAt(ED.cw / 2, ED.ch / 2, ED.z / 1.4)); $('edFit').addEventListener('click', fitView);
  $('edName').addEventListener('change', () => { ED.M.name = $('edName').value.trim().slice(0, 60) || 'Untitled survey'; autosave(); });
  $('edGen').addEventListener('click', () => { checkpoint(); const seed = Math.random().toString(36).slice(2, 7); setModel(generateScene(seed, +$('edSize').value, $('edBiome').value)); });
  $('edNew').addEventListener('click', () => { checkpoint(); const S = +$('edSize').value, B = BIOMES[$('edBiome').value]; const M = blankModel(S, B.ground[0]); M.clim = B.clim; setModel(M); });
  $('edPng').addEventListener('click', () => { const R = renderTiles(ED.M, ED.rot, 2, { grid: false }); R.can.toBlob(b => b && download(slug(ED.M.name) + '.png', b)); });
  $('edSave').addEventListener('click', () => download(slug(ED.M.name) + '.json', new Blob([JSON.stringify(toJSON(ED.M))], { type: 'application/json' })));
  $('edLoad').addEventListener('click', () => $('edFile').click());
  $('edFile').addEventListener('change', async () => { const f = $('edFile').files[0]; $('edFile').value = ''; if (!f) return; try { const M = fromJSON(JSON.parse(await f.text())); checkpoint(); setModel(M); } catch (err) { statusEl.textContent = `Could not open ${f.name}: ${err.message}`; } });
  new ResizeObserver(() => { const had = ED.cw; size(); if (!had && ED.R) fitView(); }).observe(stage);
}

function openEditor(M) {
  ensureModel();
  root.hidden = false; ED.open = true; ED.rot = 0;
  if (M) { if (ED.M) checkpoint(); ED.M = M; autosave(); }
  $('edName').value = ED.M.name; $('edSize').value = [16, 24, 28, 32, 48, 60].includes(ED.M.S) ? String(ED.M.S) : '32';
  if (!$('edItems').childElementCount) setTab('Terrain');
  size(); ED.stale = true; rebuild(); fitView(); syncHist(); setTool(ED.tool); syncBrush(); status();
  cv.focus({ preventScroll: true });
}
function closeEditor() { if (!ED.open) return; ED.open = false; root.hidden = true; ED.hover = null; }

buildChrome();
$('openEditor').addEventListener('click', () => openEditor());

export { ED, applyAt, closeEditor, ensureModel, fitView, mutate, openEditor, pick, rebuild, redo, replaceModel, req, runStroke, setRot, setTab, setTool, status, syncBrush, syncPalette, toView, undo, zoomAt };
