import { drawFrame, footShadow, frameCanvas, spriteThumb } from '../characters/draw.js';
import * as library from '../characters/library.js';
import { openSpriteEditor } from '../characters/sprite-editor.js';
import { FACES, SIZE as SPRITE_SIZE } from '../characters/sprite.js';
import { ASSET_BY_ID, ASSET_GROUPS, TERRAIN, drawAsset, footprint } from '../tiles/index.js';
import { $, coarse, state } from '../ui/state.js';
import { BIOMES, generateScene } from './generate.js';
import { MAX_ELEV, blankModel, cloneModel, fits, fromJSON, objAt, toJSON } from './model.js';
import { brushTiles as brushAt, eraseAt, floodFill, paintTiles, placePiece, setElev, shiftElev } from './ops.js';
import { EL, THH, TWH, pieceBox, renderTiles, rotInst, thumb, updateTiles } from './render.js';
import { blockedBy, charAt, eraseCharAt, findPath, placeChar, reachable, walkChar } from './walk.js';

/* ================= tile editor screen ================= */
const root = $('editor'), cv = $('edCanvas'), cx = cv.getContext('2d'), ov = $('edOverlay'), ovx = ov.getContext('2d'), statusEl = $('edStatus'), stage = $('edStage');
const SC = coarse ? 1.4 : 2, SAVE_KEY = 'hexwright.tiles.v1', HIST = 60;
const TOOLS = [
  ['paint', 'Paint', 'B', '▦'], ['fill', 'Fill', 'G', '◩'], ['raise', 'Raise', 'U', '▲'], ['lower', 'Lower', 'J', '▼'], ['level', 'Level', 'L', '▬'],
  ['place', 'Place', 'P', '⌂'], ['character', 'Person', 'C', '☺'], ['walk', 'Walk', 'W', '➜'], ['erase', 'Erase', 'E', '✕'], ['pick', 'Pick', 'I', '◉'], ['pan', 'Pan', 'H', '✥']
];
const ED = { open: false, M: null, R: null, rot: 0, z: 1, ox: 0, oy: 0, fitZ: 1, cw: 0, ch: 0, tool: 'paint', brush: 1, terrain: 'grass', asset: 'cottage', face: 0, hover: null, grid: true, undo: [], redo: [], stale: true, dirty: false, stroke: null, tab: 'Terrain', char: null, sel: -1, walk: new Map(), lastT: 0, preview: null };
/* one sprite pixel in drawing units: a figure stands about as tall as a cottage's eaves and chimney */
const WALK_SPEED = 3.2, SPRITE_PX = 0.42, FIG_H = SPRITE_SIZE * SPRITE_PX;

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
/* the size picker shows the map's own size, adding it to the list when it is not a preset (a cropped district, say) */
function showSize(S) { const sel = $('edSize'); if (![...sel.options].some(o => +o.value === S)) { const o = new Option(String(S)); sel.add(o, [...sel.options].find(x => +x.value > S) || null); } sel.value = String(S); }
function syncHist() { $('edUndo').disabled = !ED.undo.length; $('edRedo').disabled = !ED.redo.length; }
function setModel(M, keepView) {
  const resize = !ED.M || ED.M.S !== M.S; ED.M = M; ED.walk.clear(); ED.sel = -1; ED.stale = resize || ED.stale === true ? true : 'model';
  $('edName').value = M.name; showSize(M.S);
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

/* ---------- characters: where they are drawn, and walking ---------- */
const zAt = (x, y) => { const u = y * ED.M.S + x; return ED.M.elev[u] * EL - (TERRAIN[ED.M.terr[u]].sink || 0); };
/* a position is a model-space tile centre with a height: { x: tile + 0.5, y: tile + 0.5, z } */
const tilePt = (x, y) => ({ x: x + 0.5, y: y + 0.5, z: zAt(x, y) });
const viewPt = (x, y) => { const S = ED.M.S, r = ED.rot; return r === 0 ? [x, y] : r === 1 ? [S - y, x] : r === 2 ? [S - x, S - y] : [y, S - x]; };
const faceIn = f => (f + 3 * ED.rot) % 4;
function walkerPos(w) {
  let d = w.d; const P = w.pts;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    if (d <= len || i + 2 === P.length) { const f = Math.min(1, d / len); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, face: Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 1 : 3) : (b.y > a.y ? 0 : 2) }; }
    d -= len;
  }
  return Object.assign({ face: 0 }, P[P.length - 1]);
}
const walkLen = w => w.pts.reduce((n, p, i) => i ? n + Math.hypot(p.x - w.pts[i - 1].x, p.y - w.pts[i - 1].y) : 0, 0);
/* where a character is drawn right now: its tile, or partway along its walk */
function curPoint(c) { const w = ED.walk.get(c); if (!w) return tilePt(c.x, c.y); const p = walkerPos(w); return { x: p.x, y: p.y, z: p.z }; }
/* the model already holds the end of the walk; this only sets up the picture of getting there */
function beginWalk(c, start, path) { ED.walk.set(c, { pts: [start, ...path.map(([x, y]) => tilePt(x, y))], d: 0 }); req(); }
/* walk character k along path as one step of the current edit */
function doWalk(k, path) {
  const M = ED.M, c = M.chars[k], start = curPoint(c), r = walkChar(M, k, path);
  if (r.ok && path.length) { beginWalk(c, start, path); changed(); status(); }
  return r;
}
function stepAnim(now) {
  const dt = Math.min(0.1, (now - (ED.lastT || now)) / 1000); ED.lastT = now;
  for (const [c, w] of ED.walk) { w.d += dt * WALK_SPEED; if (w.d >= walkLen(w)) ED.walk.delete(c); }
  if (!ED.walk.size) ED.lastT = 0;
}
/* each character as it is drawn: view-space centre, height, facing and frame, nearest the viewer last */
function charViews() {
  const out = [];
  (ED.M.chars || []).forEach((c, k) => {
    const w = ED.walk.get(c), p = w ? walkerPos(w) : Object.assign(tilePt(c.x, c.y), { face: c.face }), [X, Y] = viewPt(p.x, p.y), stride = w ? Math.floor(w.d * 2) % 2 : 0;
    out.push({ c, k, X, Y, ground: p.z, z: p.z + (w ? Math.abs(Math.sin(w.d * Math.PI)) * 0.7 : 0), face: FACES[faceIn(p.face)], frame: stride, walking: !!w });
  });
  return out.sort((a, b) => a.X + a.Y - (b.X + b.Y));
}
/* the character whose picture is under a screen point, nearest first */
function charAtScreen(sx, sy) {
  const R = ED.R; if (!R || !ED.M.chars || !ED.M.chars.length) return -1;
  const wx = (sx - ED.ox) / ED.z, wy = (sy - ED.oy) / ED.z, half = FIG_H * 0.3 + 2, views = charViews();
  for (let i = views.length - 1; i >= 0; i--) { const v = views[i], [px, py] = R.P(v.X, v.Y, v.z); if (wx >= px - half && wx <= px + half && wy >= py - FIG_H - 2 && wy <= py + 5) return v.k; }
  return -1;
}
const spriteOf = c => library.get(c.sprite);
/* draw one character, then the pieces in front of it again so it can stand behind a house */
function drawChar(g, R, v) {
  const [px, py] = R.P(v.X, v.Y, v.z), s = spriteOf(v.c), key = v.X + v.Y;
  footShadow(g, px, R.P(v.X, v.Y, v.ground)[1], SPRITE_PX);
  if (s) drawFrame(g, frameCanvas(s, v.face, v.frame), px, py + 1, SPRITE_PX);
  else { g.save(); g.fillStyle = '#b8483a'; g.strokeStyle = '#2b2116'; g.beginPath(); g.arc(px, py - 8, 6, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); }
  const box = [px - FIG_H / 2 - 2, py - FIG_H - 4, px + FIG_H / 2 + 2, py + 4];
  for (const o of R.objs) {
    const [w, d] = footprint(o); if (o.x + w / 2 + o.y + d / 2 <= key) continue;
    const b = pieceBox(R, o); if (b[0] >= box[2] || b[2] <= box[0] || b[1] >= box[3] || b[3] <= box[1]) continue;
    drawAsset(g, R.P, o, o.z, R.clim);
  }
}
function drawChars(g, R) {
  const views = charViews();
  if (ED.sel >= (ED.M.chars || []).length) ED.sel = -1;
  for (const v of views) {
    if (v.k === ED.sel) { const u = [Math.floor(v.X), Math.floor(v.Y)], z = v.z; g.beginPath(); for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const q = R.P(u[0] + a, u[1] + b, z); a || b ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } g.closePath(); g.strokeStyle = '#e4c684'; g.lineWidth = 2 / ED.z; g.stroke(); g.fillStyle = 'rgba(228,198,132,0.16)'; g.fill(); }
    drawChar(g, R, v);
  }
}
/* every tile the selected character can reach, faintly tinted while walking is armed */
function walkArea() {
  const M = ED.M, k = ED.sel; if (k < 0 || !M.chars[k]) return null;
  const key = [k, M.chars[k].x, M.chars[k].y, ED.undo.length, M.objs.length, M.chars.length].join();
  if (!ED.area || ED.area.key !== key) { const seen = reachable(M, k), tiles = []; for (let u = 0; u < seen.length; u++) if (seen[u]) tiles.push([u % M.S, (u / M.S) | 0]); ED.area = { key, tiles }; }
  return ED.area.tiles;
}
/* the tiles the selected character would walk over to reach the hovered tile, or the reachable area in faint tint */
function walkPreview() {
  const M = ED.M, k = ED.sel; if (ED.tool !== 'walk' || k < 0 || !M.chars[k] || !ED.hover) return null;
  const key = [k, ED.hover.x, ED.hover.y, M.chars[k].x, M.chars[k].y, ED.undo.length, M.objs.length, M.chars.length].join();
  if (!ED.preview || ED.preview.key !== key) { const path = findPath(M, k, ED.hover.x, ED.hover.y); ED.preview = { key, path }; }
  return ED.preview.path;
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
const isFreeTile = (x, y) => !blockedBy(ED.M, x, y);
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
  if (ED.walk.size) { stepAnim(performance.now()); req(); }
  const hasChars = ED.M.chars && ED.M.chars.length;
  if (!ED.hover && !hasChars) return;
  g.save(); g.setTransform(dpr * ED.z, 0, 0, dpr * ED.z, dpr * ED.ox, dpr * ED.oy);
  const outline = (tiles, stroke, fill) => {
    g.beginPath();
    for (const [x, y] of tiles) { const u = toView(x, y), X = u % R.S, Y = (u / R.S) | 0, z = R.zOf(u), a = R.P(X, Y, z), b = R.P(X + 1, Y, z), c = R.P(X + 1, Y + 1, z), d = R.P(X, Y + 1, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); }
    if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = stroke; g.lineWidth = 1.6 / ED.z; g.stroke();
  };
  if (ED.hover && ED.tool === 'character') {
    const { x, y } = ED.hover, ok = isFreeTile(x, y), z = zAt(x, y), [X, Y] = viewPt(x + 0.5, y + 0.5), s = library.get(ED.char);
    outline([[x, y]], ok ? 'rgba(255,240,200,0.9)' : '#b8483a', ok ? 'rgba(255,240,200,0.18)' : 'rgba(184,72,58,0.25)');
    if (s) { const [px, py] = R.P(X, Y, z); g.globalAlpha = ok ? 0.85 : 0.4; footShadow(g, px, py, SPRITE_PX); drawFrame(g, frameCanvas(s, FACES[faceIn(ED.face)], 0), px, py + 1, SPRITE_PX); g.globalAlpha = 1; }
  }
  /* walking: the reachable ground tinted, the route to the hovered tile traced, all beneath the figures */
  if (ED.tool === 'walk') {
    const area = walkArea(); if (area) outline(area, 'rgba(228,198,132,0.3)', 'rgba(228,198,132,0.2)');
    if (ED.hover) {
      const { x, y } = ED.hover, path = walkPreview(), k = charAt(ED.M, x, y);
      if (k >= 0) outline([[x, y]], 'rgba(255,240,200,0.9)', 'rgba(255,240,200,0.15)');
      else if (path && path.length) outline(path, 'rgba(228,198,132,0.9)', 'rgba(228,198,132,0.25)');
      else outline([[x, y]], ED.sel >= 0 ? '#b8483a' : 'rgba(255,240,200,0.7)', ED.sel >= 0 ? 'rgba(184,72,58,0.22)' : null);
    }
  }
  if (hasChars) drawChars(g, R);
  if (!ED.hover) { g.restore(); return; }
  const { x, y } = ED.hover;
  if (ED.tool === 'walk' || ED.tool === 'character') { /* drawn above */ }
  else if (ED.tool === 'place') {
    const o = ghost(), ok = fits(ED.M, o), [w, d] = footprint(o), tiles = [];
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (x + i < ED.M.S && y + j < ED.M.S) tiles.push([x + i, y + j]);
    outline(tiles, ok ? 'rgba(255,240,200,0.9)' : '#b8483a', ok ? 'rgba(255,240,200,0.18)' : 'rgba(184,72,58,0.25)');
    const v = rotInst(o, ED.rot, ED.M.S); let z = 0; for (const [tx, ty] of tiles) z = Math.max(z, R.zOf(toView(tx, ty)));
    g.globalAlpha = ok ? 0.85 : 0.45; drawAsset(g, R.P, v, ASSET_BY_ID[o.id].water ? z : z, ED.M.clim); g.globalAlpha = 1;
  } else if (ED.tool === 'erase' || ED.tool === 'pick') {
    const k = objAt(ED.M, x, y), ck = charAt(ED.M, x, y);
    if (ck >= 0) outline([[x, y]], ED.tool === 'erase' ? '#b8483a' : '#e4c684', ED.tool === 'erase' ? 'rgba(184,72,58,0.3)' : 'rgba(228,198,132,0.25)');
    else if (k >= 0) { const o = ED.M.objs[k], [w, d] = footprint(o), tiles = []; for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) tiles.push([o.x + i, o.y + j]); outline(tiles, ED.tool === 'erase' ? '#b8483a' : '#e4c684', ED.tool === 'erase' ? 'rgba(184,72,58,0.3)' : 'rgba(228,198,132,0.25)'); }
    else outline([[x, y]], 'rgba(255,240,200,0.7)');
  } else if (ED.tool !== 'pan') outline(ED.tool === 'fill' ? [[x, y]] : brushTiles(x, y), 'rgba(255,240,200,0.9)', 'rgba(255,240,200,0.12)');
  g.restore();
}

/* ---------- tools ---------- */
let walkNote = '';
function applyAt(p, first) {
  const M = ED.M, S = M.S, st = ED.stroke;
  const key = p.x + ',' + p.y; if (!first && st.seen.has(key) && ED.tool !== 'paint') return; st.seen.add(key);
  if (ED.tool === 'paint') { if (paintTiles(M, brushTiles(p.x, p.y), ED.terrain)) changed(); }
  else if (ED.tool === 'raise' || ED.tool === 'lower') { const fresh = brushTiles(p.x, p.y).filter(([x, y]) => { const k = x + ',' + y + '#'; if (st.seen.has(k)) return false; st.seen.add(k); return true; }); shiftElev(M, fresh, ED.tool === 'raise' ? 1 : -1); changed(); }
  else if (ED.tool === 'level') { if (first) st.level = M.elev[p.y * S + p.x]; setElev(M, brushTiles(p.x, p.y), st.level); changed(); }
  else if (ED.tool === 'fill' && first) { if (floodFill(M, p.x, p.y, ED.terrain)) changed(); }
  else if (ED.tool === 'place') { if (placePiece(M, ghost()).ok) changed(); }
  else if (ED.tool === 'character' && first) {
    /* clicking a character that is already there picks it up for walking instead of stacking another */
    const k = charAt(M, p.x, p.y);
    if (k >= 0) { ED.sel = k; setTool('walk'); walkNote = 'Selected: click a tile to walk there.'; }
    else if (ED.char && placeChar(M, { sprite: ED.char, x: p.x, y: p.y, face: ED.face }).ok) { ED.sel = M.chars.length - 1; changed(); }
  }
  else if (ED.tool === 'walk' && first) {
    /* click a character to choose it, then click any tile it can reach */
    const k = charAt(M, p.x, p.y);
    if (k >= 0) { ED.sel = k; walkNote = 'Selected: click a tile to walk there.'; req(); return; }
    if (ED.sel < 0 && M.chars.length === 1) ED.sel = 0;
    if (ED.sel >= 0 && M.chars[ED.sel]) { const path = findPath(M, ED.sel, p.x, p.y); if (path && path.length) doWalk(ED.sel, path); else walkNote = `No way to ${p.x}, ${p.y}: ${blockedBy(M, p.x, p.y, ED.sel) || 'cut off from here'}.`; }
    else walkNote = M.chars.length ? 'Click a character, then click a tile to walk there.' : 'Place a character first (Characters tab).';
  }
  else if (ED.tool === 'erase') { if (eraseCharAt(M, p.x, p.y)) { changed(); } else if (eraseAt(M, p.x, p.y)) changed(); }
  else if (ED.tool === 'pick' && first) { const ck = charAt(M, p.x, p.y), k = objAt(M, p.x, p.y); if (ck >= 0) { ED.char = M.chars[ck].sprite; ED.face = M.chars[ck].face; ED.sel = ck; setTab('Characters'); setTool('character'); } else if (k >= 0) { ED.asset = M.objs[k].id; ED.face = M.objs[k].face; setTab(ASSET_BY_ID[ED.asset].group); setTool('place'); } else { ED.terrain = TERRAIN[M.terr[p.y * S + p.x]].id; setTab('Terrain'); setTool('paint'); } syncPalette(); }
}
function setTool(t) { ED.tool = t; for (const b of root.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t)); cv.style.cursor = t === 'pan' ? 'grab' : 'crosshair'; req(); }
function setTab(t) { ED.tab = t; for (const b of root.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t)); buildPalette(); }
function status() {
  const nc = (ED.M.chars || []).length, cname = c => (library.get(c.sprite) || { name: 'Unknown character' }).name;
  if (walkNote) { const n = walkNote; walkNote = ''; statusEl.textContent = n; return; }
  if (!ED.hover) { statusEl.textContent = `${ED.M.S}×${ED.M.S} tiles · ${ED.M.objs.length} pieces${nc ? ` · ${nc} character${nc > 1 ? 's' : ''}` : ''}`; return; }
  const { x, y } = ED.hover, u = y * ED.M.S + x, k = objAt(ED.M, x, y), ck = charAt(ED.M, x, y);
  statusEl.textContent = `${x}, ${y} · ${TERRAIN[ED.M.terr[u]].label} · height ${ED.M.elev[u]}${k >= 0 ? ' · ' + ASSET_BY_ID[ED.M.objs[k].id].label : ''}${ck >= 0 ? ' · ' + cname(ED.M.chars[ck]) : ''}`;
}

/* ---------- palette ---------- */
const thumbs = new Map();
function buildPalette() {
  const box = $('edItems'); box.textContent = '';
  if (ED.tab === 'Characters') { buildCharacters(box); return; }
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
/* the Characters tab lists the sprite library; clicking one arms the Person tool */
function buildCharacters(box) {
  const row = document.createElement('div'); row.className = 'ed-row ed-charbar';
  for (const [label, fn] of [['Draw new character…', () => edit('new')], ['Edit selected…', () => edit(ED.char)]]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label; b.addEventListener('click', fn); row.appendChild(b); }
  box.appendChild(row);
  const grid = document.createElement('div'); grid.className = 'ed-grid'; box.appendChild(grid);
  for (const s of library.list()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ed-item'; b.dataset.kind = 'char'; b.dataset.id = s.id; b.title = s.name;
    const c = spriteThumb(s, 60); c.className = 'ed-char'; b.appendChild(c);
    const t = document.createElement('span'); t.textContent = s.name; b.appendChild(t);
    b.addEventListener('click', () => { ED.char = s.id; setTool('character'); syncPalette(); });
    grid.appendChild(b);
  }
  syncPalette();
}
/* open the sprite editor; a new character is created when id is null. On return the list and the map pick up the changes. */
function edit(id) {
  const back = sid => { if (sid && library.get(sid)) ED.char = sid; buildPalette(); req(); cv.focus({ preventScroll: true }); };
  openSpriteEditor(id || 'new', 'Tile editor', back);
}
library.onChange(() => { if (ED.open && ED.tab === 'Characters' && $('spriteEditor').hidden) buildPalette(); req(); });
function syncPalette() { for (const b of root.querySelectorAll('.ed-item')) b.setAttribute('aria-pressed', String(b.dataset.kind === 'terrain' ? b.dataset.id === ED.terrain : b.dataset.kind === 'char' ? b.dataset.id === ED.char : b.dataset.id === ED.asset)); $('edFace').textContent = `Facing ${['south-west', 'south-east', 'north-east', 'north-west'][ED.face]}`; }

/* ---------- input ---------- */
const pts = new Map(); let pan = null, pinch = null, spaceDown = false;
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const [x, y] = local(e); pts.set(e.pointerId, [x, y]);
  if (pts.size === 2) { if (ED.stroke) endStroke(); const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, z: ED.z, ox: ED.ox, oy: ED.oy }; pan = null; return; }
  if (ED.tool === 'pan' || e.button === 1 || e.button === 2 || spaceDown) { pan = { x, y, ox: ED.ox, oy: ED.oy }; cv.style.cursor = 'grabbing'; return; }
  let p = pick(x, y);
  if (['walk', 'erase', 'pick'].includes(ED.tool)) { const ck = charAtScreen(x, y); if (ck >= 0) p = { x: ED.M.chars[ck].x, y: ED.M.chars[ck].y }; }
  if (!p) return;
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
  else if (k === 'Escape') { if (ED.sel >= 0) { ED.sel = -1; req(); } else closeEditor(); }
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
  for (const t of ['Terrain', ...ASSET_GROUPS.map(a => a[0]), 'Characters']) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.role = 'tab'; b.dataset.tab = t; b.textContent = t; b.addEventListener('click', () => setTab(t)); tabs.appendChild(b); }
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

/* back: label of the screen the editor returns to (the one left showing underneath it) */
function openEditor(M, back = 'Atlas') {
  ensureModel(); if (!library.get(ED.char)) ED.char = (library.list()[0] || {}).id || null;
  root.hidden = false; ED.open = true; ED.rot = 0; $('edBack').textContent = `← ${back}`;
  if (M) { if (ED.M) checkpoint(); ED.M = M; autosave(); }
  $('edName').value = ED.M.name; showSize(ED.M.S);
  if (!$('edItems').childElementCount) setTab('Terrain');
  size(); ED.stale = true; rebuild(); fitView(); syncHist(); setTool(ED.tool); syncBrush(); status();
  cv.focus({ preventScroll: true });
}
function closeEditor() { if (!ED.open) return; ED.open = false; root.hidden = true; ED.hover = null; }

buildChrome();
$('openEditor').addEventListener('click', () => openEditor());

export { ED, applyAt, beginWalk, closeEditor, curPoint, doWalk, ensureModel, fitView, mutate, openEditor, pick, rebuild, redo, replaceModel, req, runStroke, setRot, setTab, setTool, status, syncBrush, syncPalette, toView, undo, zoomAt };
