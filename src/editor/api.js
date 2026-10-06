import { ASSET_BY_ID, ASSETS, TERRAIN, footprint } from '../tiles/index.js';
import { $ } from '../ui/state.js';
import { METHODS } from './api-spec.js';
import * as library from '../characters/library.js';
import { ED, LEVEL_NAME, closeEditor, doWalk, ensureModel, fitView, mutate, openEditor, pick, rebuild, redo, replaceModel, req, runStroke, setRot, setTab, setTool, setLevel, syncBrush, syncPalette, toView, undo, zoomAt } from './editor.js';
import { BIOMES, generateScene } from './generate.js';
import { MAX_ELEV, MAX_LEVEL, STOREY, TI, blankModel, floorAt, fromJSON, levelOf, objAt, toJSON } from './model.js';
import { brushTiles, eraseAt, floodFill, inb, paintTiles, placePiece, rectTiles, removeFloor, setElev, shiftElev } from './ops.js';
import { SZ, renderTiles } from './render.js';
import { charAt, findPath, placeChar } from './walk.js';

/* ================= tile editor automation API =================
   window.hexwright.call(method, params) drives the live editor with JSON in and JSON out; the
   methods and their schemas live in api-spec.js. Every edit goes through the same operations as the
   mouse tools and lands on the same undo stack. The dev-server bridge (src/editor/bridge.js) and the
   MCP server reach this object, so no browser automation is needed to edit a map. */
class ApiError extends Error { constructor(message, detail) { super(message); this.name = 'ApiError'; this.detail = detail; } }
const fail = msg => { throw new ApiError(msg); };

/* ---------- parameter checking: catches typos and bad ranges before anything is touched ---------- */
function check(schema, value, path) {
  const t = schema.type;
  if (t === 'integer' && !Number.isInteger(value)) fail(`${path} must be an integer, got ${JSON.stringify(value)}`);
  if (t === 'number' && !(typeof value === 'number' && isFinite(value))) fail(`${path} must be a number, got ${JSON.stringify(value)}`);
  if (t === 'string' && typeof value !== 'string') fail(`${path} must be a string, got ${JSON.stringify(value)}`);
  if (t === 'boolean' && typeof value !== 'boolean') fail(`${path} must be true or false, got ${JSON.stringify(value)}`);
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) fail(`${path} must be at least ${schema.minimum}, got ${value}`);
    if (schema.maximum != null && value > schema.maximum) fail(`${path} must be at most ${schema.maximum}, got ${value}`);
  }
  if (schema.enum && !schema.enum.includes(value)) fail(`${path} must be one of ${schema.enum.join(', ')}; got ${JSON.stringify(value)}`);
  if (t === 'array') {
    if (!Array.isArray(value)) fail(`${path} must be an array`);
    if (schema.minItems != null && value.length < schema.minItems) fail(`${path} needs at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) fail(`${path} takes at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => check(schema.items, v, `${path}[${i}]`));
  }
  if (t === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
    if (schema.properties) checkProps(schema.properties, schema.required, value, path, schema.additionalProperties === true);
  }
}
function checkProps(props, required = [], value, path, open = false) {
  for (const [k, v] of Object.entries(value)) {
    if (v == null) continue;
    if (!props[k]) { if (open) continue; fail(`unknown parameter "${path ? path + '.' : ''}${k}"; known: ${Object.keys(props).join(', ') || '(none)'}`); }
    check(props[k], v, path ? `${path}.${k}` : k);
  }
  for (const k of required) if (value[k] == null) fail(`${path ? path + '.' : ''}${k} is required`);
}

/* ---------- lookups ---------- */
const guess = (id, list) => { const q = String(id).toLowerCase(), near = list.filter(s => s.includes(q) || q.includes(s)).slice(0, 5); return near.length ? ` Did you mean ${near.join(', ')}?` : ' See describe() for the full list.'; };
const terrainId = id => { if (TI[id] == null) fail(`unknown terrain "${id}".${guess(id, TERRAIN.map(t => t.id))}`); return id; };
const assetId = id => { if (!ASSET_BY_ID[id]) fail(`unknown asset "${id}".${guess(id, ASSETS.map(a => a.id))}`); return id; };
const biomeOf = id => { if (id != null && !BIOMES[id]) fail(`unknown biome "${id}"; use one of ${Object.keys(BIOMES).join(', ')}`); return BIOMES[id]; };
const tileOf = (M, x, y, what = 'tile') => { if (!inb(M, x, y)) fail(`${what} ${x},${y} is outside the ${M.S}×${M.S} map (valid 0..${M.S - 1})`); return y * M.S + x; };
const rectOf = (M, r) => rectTiles(M, r.x, r.y, r.w, r.h);

/* a target is x,y (+brush), tiles, or rect */
function targetTiles(M, p) {
  if (p.tiles) { p.tiles.forEach(([x, y]) => tileOf(M, x, y)); return p.tiles; }
  if (p.rect) return rectOf(M, p.rect);
  if (p.x != null && p.y != null) { tileOf(M, p.x, p.y); return brushTiles(M, p.x, p.y, p.brush || 1); }
  return fail('give a target: x and y, tiles, or rect');
}
const spriteId = id => { if (!library.get(id)) fail(`unknown sprite "${id}".${guess(id, library.list().map(s => s.id))}`); return id; };
const charInfo = (M, k) => { const c = M.chars[k], s = library.get(c.sprite); return { index: k, sprite: c.sprite, name: s ? s.name : null, x: c.x, y: c.y, level: levelOf(c), face: c.face }; };
function charIndex(M, p) {
  const k = p.index != null ? p.index : p.at ? (tileOf(M, p.at.x, p.at.y), charAt(M, p.at.x, p.at.y, -1, p.at.level || 0)) : fail('give index or at to pick a character');
  if (k < 0 || k >= (M.chars || []).length) fail(p.index != null ? `no character with index ${p.index}; the map has ${(M.chars || []).length}` : `no character at ${p.at.x},${p.at.y}`);
  return k;
}
const pieceInfo = (M, o, k) => { const [w, d] = footprint(o), a = ASSET_BY_ID[o.id]; return { index: k, id: o.id, label: a.label, x: o.x, y: o.y, level: levelOf(o), face: o.face, w, d, v: o.v }; };

/* ---------- edits: each takes the model and returns { changed, ... } ---------- */
const EDITS = {
  paint(M, p) { terrainId(p.terrain); return { changed: paintTiles(M, targetTiles(M, p), p.terrain, p.level || 0) }; },
  fill(M, p) { terrainId(p.terrain); tileOf(M, p.x, p.y); return { changed: floodFill(M, p.x, p.y, p.terrain, p.level || 0) }; },
  removeFloor(M, p) { return { changed: removeFloor(M, targetTiles(M, p), p.level) }; },
  elevation(M, p) {
    const tiles = targetTiles(M, p), m = p.mode;
    if ((m === 'set' || m === 'level') && p.level == null) fail(`elevation mode "${m}" needs level (0-${MAX_ELEV})`);
    return { changed: m === 'set' || m === 'level' ? setElev(M, tiles, p.level) : shiftElev(M, tiles, (m === 'raise' ? 1 : -1) * (p.amount || 1)) };
  },
  place(M, p) {
    assetId(p.id); tileOf(M, p.x, p.y, 'anchor');
    const r = placePiece(M, p);
    return r.ok ? { changed: 1, placed: true, piece: pieceInfo(M, r.piece, r.index) } : { changed: 0, placed: false, reason: r.reason };
  },
  erase(M, p) {
    const L = p.level || 0;
    if (p.rect) { const keep = M.objs.filter(o => levelOf(o) !== L || !rectOf(M, p.rect).some(([x, y]) => { const [w, d] = footprint(o); return x >= o.x && y >= o.y && x < o.x + w && y < o.y + d; })), n = M.objs.length - keep.length; M.objs = keep; return { changed: n, erased: n }; }
    if (p.index != null) { if (p.index >= M.objs.length) fail(`no piece with index ${p.index}; the map has ${M.objs.length}`); M.objs.splice(p.index, 1); return { changed: 1, erased: 1 }; }
    if (p.x != null && p.y != null) { tileOf(M, p.x, p.y); const n = eraseAt(M, p.x, p.y, L); return { changed: n, erased: n }; }
    return fail('erase needs x and y, an index, or a rect');
  },
  moveObject(M, p) {
    const k = p.index != null ? p.index : p.at ? (tileOf(M, p.at.x, p.at.y), objAt(M, p.at.x, p.at.y, p.level || 0)) : fail('moveObject needs index or at');
    if (k < 0 || k >= M.objs.length) fail(p.index != null ? `no piece with index ${p.index}` : `no piece covers ${p.at.x},${p.at.y}`);
    const o = M.objs[k]; M.objs.splice(k, 1);
    const r = placePiece(M, { id: o.id, x: p.to ? p.to.x : o.x, y: p.to ? p.to.y : o.y, face: p.face != null ? p.face : o.face, v: o.v, level: o.level });
    if (!r.ok) { M.objs.splice(k, 0, o); return { changed: 0, moved: false, reason: r.reason }; }
    M.objs.splice(k, 0, M.objs.pop()); return { changed: 1, moved: true, piece: pieceInfo(M, M.objs[k], k) };
  },
  placeCharacter(M, p) {
    spriteId(p.sprite); tileOf(M, p.x, p.y);
    const r = placeChar(M, p); return r.ok ? { changed: 1, placed: true, character: charInfo(M, r.index) } : { changed: 0, placed: false, reason: r.reason };
  },
  walkCharacter(M, p) {
    const k = charIndex(M, p); let path;
    if (p.path) { p.path.forEach(([x, y]) => tileOf(M, x, y)); path = p.path; }
    else { if (!p.to) fail('walkCharacter needs to or path'); tileOf(M, p.to.x, p.to.y, 'target'); path = findPath(M, k, p.to.x, p.to.y, p.to.level); if (!path) return { changed: 0, walked: false, reason: `no route to ${p.to.x},${p.to.y}: the tile is blocked or cut off` }; }
    if (!path.length) return { changed: 0, walked: false, reason: 'already there' };
    const r = doWalk(k, path); return r.ok ? { changed: 1, walked: true, steps: r.steps, route: path.map(([x, y, L]) => [x, y, L || 0]), character: charInfo(M, k) } : { changed: 0, walked: false, reason: r.reason };
  },
  removeCharacter(M, p) {
    const k = p.index != null ? p.index : p.x != null && p.y != null ? (tileOf(M, p.x, p.y), charAt(M, p.x, p.y, -1, p.level || 0)) : fail('removeCharacter needs index or x and y');
    if (k < 0 || k >= (M.chars || []).length) fail(p.index != null ? `no character with index ${p.index}` : `no character at ${p.x},${p.y}`);
    M.chars.splice(k, 1); return { changed: 1, removed: 1 };
  },
  rename(M, p) { const n = String(p.name).trim().slice(0, 60) || 'Untitled survey'; const was = M.name; M.name = n; return { changed: n === was ? 0 : 1 }; }
};
const syncName = () => { $('edName').value = ED.M.name; };
const edit = op => p => { const r = mutate(M => EDITS[op](M, p)); syncName(); return r; };

function batch(p) {
  const atomic = p.atomic !== false, results = [];
  const r = mutate(M => {
    let changed = 0;
    p.ops.forEach((o, i) => {
      const { op, ...args } = o;
      if (!EDITS[op]) fail(`ops[${i}]: unknown op "${op}"`);
      try {
        const spec = METHODS[op]; checkProps(spec.input, spec.required, args, '');
        const res = EDITS[op](M, args); changed += res.changed || 0; results.push({ op, ...res });
      } catch (err) {
        if (atomic) throw new ApiError(`ops[${i}] (${op}) failed, nothing was applied: ${err.message}`);
        results.push({ op, changed: 0, error: err.message });
      }
    });
    return { changed, results };
  });
  syncName(); return { changed: r.changed, results };
}

/* ---------- inspection ---------- */
/* one printable symbol per terrain, stable for a given catalogue */
const SYM = (() => {
  const used = new Set(), pool = '.,:;~"\'^#%&*+=-|/<>!?@$()[]{}0123456789', out = {};
  for (const t of TERRAIN) {
    let c = [...t.id].find(ch => /[a-z]/.test(ch) && !used.has(ch)); if (!c) c = [...t.id.toUpperCase()].find(ch => /[A-Z]/.test(ch) && !used.has(ch)); if (!c) c = [...pool].find(ch => !used.has(ch));
    used.add(c); out[t.id] = c;
  }
  return out;
})();
const B36 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pieceAt = (M, x, y, L = 0) => objAt(M, x, y, L);
const tileInfo = (M, x, y, L = 0) => {
  const u = y * M.S + x, T = TERRAIN[M.terr[u]], k = pieceAt(M, x, y, L), ck = charAt(M, x, y, -1, L), f = floorAt(M, L, u);
  const base = { x, y, terrain: T.id, label: T.label, water: !!T.water, elevation: M.elev[u] };
  if (L) Object.assign(base, { level: L, floor: f ? TERRAIN[f - 1].id : null });
  return Object.assign(base, { piece: k >= 0 ? pieceInfo(M, M.objs[k], k) : null, character: ck >= 0 ? charInfo(M, ck) : null });
};

function ascii(p) {
  const M = ensureModel(), r = p.rect ? { x: Math.max(0, p.rect.x), y: Math.max(0, p.rect.y), w: Math.min(M.S, p.rect.x + p.rect.w) - Math.max(0, p.rect.x), h: Math.min(M.S, p.rect.y + p.rect.h) - Math.max(0, p.rect.y) } : { x: 0, y: 0, w: M.S, h: M.S };
  if (r.w <= 0 || r.h <= 0) fail('rect is outside the map');
  const want = p.layers || ['terrain', 'elevation', 'objects'], out = { size: M.S, rect: r, layers: {} }, seen = new Set();
  const ruler = ' '.repeat(3) + Array.from({ length: r.w }, (_, i) => (r.x + i) % 10).join('');
  const grid = f => [ruler, ...Array.from({ length: r.h }, (_, j) => String(r.y + j).padStart(2) + ' ' + Array.from({ length: r.w }, (_, i) => f(r.x + i, r.y + j)).join(''))];
  const L = p.level || 0; if (L) out.level = L;
  if (want.includes('terrain')) { out.layers.terrain = grid((x, y) => { const f = floorAt(M, L, y * M.S + x); if (!f) return ' '; const id = TERRAIN[f - 1].id; seen.add(id); return SYM[id]; }); out.legend = Object.fromEntries([...seen].map(id => [SYM[id], id])); }
  if (want.includes('elevation')) out.layers.elevation = grid((x, y) => M.elev[y * M.S + x] || '.');
  if (want.includes('objects')) out.layers.objects = grid((x, y) => { const k = pieceAt(M, x, y, L); return k < 0 ? '.' : B36[k % B36.length]; });
  out.text = want.filter(l => out.layers[l]).map(l => `${l}:\n${out.layers[l].join('\n')}`).join('\n\n');
  return out;
}

function describe() {
  return {
    api: 'hexwright-tiles automation', version: 1, coordinates: 'x east, y south, (0,0) top-left of the unrotated map; rect = {x, y, w, h}',
    limits: { size: [4, 96], elevation: [0, MAX_ELEV], levels: [0, MAX_LEVEL], brush: [1, 3], facing: [0, 3] },
    storeys: `level 0 is the ground; levels 1-${MAX_LEVEL} are floors laid with paint (level), each ${STOREY} height levels (${SZ} px) above the ground below. Pieces and characters belong to one level; stairs (asset 'stairs') lead from their high end to the tile behind them one level up.`,
    tools: ['paint', 'fill', 'raise', 'lower', 'level', 'place', 'character', 'walk', 'erase', 'pick', 'pan'],
    sprites: library.list().map(s => ({ id: s.id, name: s.name })),
    biomes: Object.entries(BIOMES).map(([id, B]) => ({ id, label: B.label, climate: B.clim })),
    terrain: TERRAIN.map(t => ({ id: t.id, label: t.label, group: t.group, water: !!t.water, symbol: SYM[t.id] })),
    assets: ASSETS.map(a => ({ id: a.id, label: a.label, group: a.group, w: a.w, d: a.d, height: a.h, water: !!a.water, walkable: !!a.walk })),
    methods: Object.fromEntries(Object.entries(METHODS).map(([k, m]) => [k, m.description]))
  };
}

function state() {
  const M = ensureModel();
  return {
    open: ED.open, name: M.name, size: M.S, climate: M.clim, objects: M.objs.length, characters: (M.chars || []).length, selectedCharacter: ED.sel,
    tool: ED.tool, brush: ED.brush, terrain: ED.terrain, asset: ED.asset, sprite: ED.char, face: ED.face, tab: ED.tab,
    view: { level: ED.level, levelName: LEVEL_NAME(ED.level), rot: ED.rot, zoom: ED.fitZ ? +(ED.z / ED.fitZ).toFixed(3) : null, grid: ED.grid, stage: { width: ED.cw, height: ED.ch } },
    history: { undo: ED.undo.length, redo: ED.redo.length }, status: $('edStatus').textContent,
    page: { url: location.href, title: document.title }
  };
}

/* ---------- view ---------- */
const needOpen = () => { if (!ED.open) fail('the editor is closed; call open first'); ensureModel(); if (ED.stale) rebuild(); };
function setView(p) {
  needOpen();
  if (p.level != null) setLevel(p.level);
  if (p.rot != null) setRot(p.rot);
  if (p.grid != null && p.grid !== ED.grid) $('edGrid').click();
  if (p.fit) fitView();
  if (p.zoom != null) zoomAt(ED.cw / 2, ED.ch / 2, ED.fitZ * p.zoom);
  if (p.center) { if (ED.stale) rebuild(); const [wx, wy] = tileWorld(p.center.x, p.center.y); ED.ox = ED.cw / 2 - wx * ED.z; ED.oy = ED.ch / 2 - wy * ED.z; req(); }
  return state().view;
}
function tileWorld(x, y) { tileOf(ED.M, x, y); const R = ED.R, u = toView(x, y); return R.P(u % R.S + 0.5, ((u / R.S) | 0) + 0.5, R.zAt(u, ED.level)); }
function tileToScreen(p) {
  needOpen(); const [wx, wy] = tileWorld(p.x, p.y), cv = $('edCanvas').getBoundingClientRect(), sx = ED.ox + wx * ED.z, sy = ED.oy + wy * ED.z;
  return { canvas: { x: +sx.toFixed(1), y: +sy.toFixed(1) }, client: { x: +(cv.left + sx).toFixed(1), y: +(cv.top + sy).toFixed(1) }, visible: sx >= 0 && sy >= 0 && sx <= ED.cw && sy <= ED.ch };
}
function screenToTile(p) { needOpen(); const t = pick(p.sx, p.sy); return t ? tileInfo(ED.M, t.x, t.y, ED.level) : null; }

const frames = n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); });
async function screenshot(p) {
  const M = ensureModel(), max = p.maxSize || 1600; let can;
  if (p.source === 'viewport') { needOpen(); await frames(2); const m = $('edCanvas'); can = document.createElement('canvas'); can.width = m.width; can.height = m.height; const g = can.getContext('2d'); g.drawImage(m, 0, 0); g.drawImage($('edOverlay'), 0, 0); }
  else {
    const scale = p.scale || 1, R = renderTiles(M, p.rot != null ? p.rot : ED.rot, scale, { grid: !!p.grid }); can = R.can;
    if (p.rect) {
      const tiles = rectOf(M, p.rect); if (!tiles.length) fail('rect is outside the map');
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of tiles) { const u = R.rti(y * M.S + x), X = u % R.S, Y = (u / R.S) | 0, z = R.zOf(u); for (const [cx, cy] of [[X, Y], [X + 1, Y], [X + 1, Y + 1], [X, Y + 1]]) { const q = R.P(cx, cy, 0); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); } y0 = Math.min(y0, R.P(X, Y, Math.max(z, 0) + 70)[1]); y1 = Math.max(y1, R.P(X + 1, Y + 1, -8)[1] + 4); }
      const sx = Math.max(0, Math.floor((x0 - 8) * scale)), sy = Math.max(0, Math.floor(y0 * scale)), ex = Math.min(can.width, Math.ceil((x1 + 8) * scale)), ey = Math.min(can.height, Math.ceil(y1 * scale));
      const c = document.createElement('canvas'); c.width = ex - sx; c.height = ey - sy; c.getContext('2d').drawImage(can, sx, sy, c.width, c.height, 0, 0, c.width, c.height); can = c;
    }
  }
  /* opaque backdrop so the ink reads in any viewer; shrink to maxSize on the way */
  const k = Math.min(1, max / Math.max(can.width, can.height)), out = document.createElement('canvas'); out.width = Math.max(1, Math.round(can.width * k)); out.height = Math.max(1, Math.round(can.height * k));
  const g = out.getContext('2d'); g.fillStyle = p.source === 'viewport' ? '#1a2224' : '#eadfc4'; g.fillRect(0, 0, out.width, out.height); g.imageSmoothingQuality = 'high'; g.drawImage(can, 0, 0, out.width, out.height); can = out;
  return { image: { mime: 'image/png', base64: can.toDataURL('image/png').split(',')[1], width: can.width, height: can.height } };
}

/* ---------- selection ---------- */
function setSelection(p) {
  ensureModel();
  if (p.terrain) { terrainId(p.terrain); ED.terrain = p.terrain; if (!p.tool && !p.asset) setTab('Terrain'); }
  if (p.asset) { assetId(p.asset); ED.asset = p.asset; setTab(ASSET_BY_ID[p.asset].group); }
  if (p.sprite) { spriteId(p.sprite); ED.char = p.sprite; setTab('Characters'); }
  if (p.character != null) { if (!(ED.M.chars || [])[p.character]) fail(`no character with index ${p.character}`); ED.sel = p.character; }
  if (p.face != null) ED.face = p.face;
  if (p.brush != null) { ED.brush = p.brush; syncBrush(); }
  if (p.tool) setTool(p.tool);
  syncPalette(); req(); return state();
}
function useTool(p) {
  const M = ensureModel(); p.path.forEach(([x, y]) => tileOf(M, x, y));
  if (!p.path.length) fail('path is empty');
  if (p.tool === 'walk') {
    const k = charAt(M, p.path[0][0], p.path[0][1]); if (k < 0) fail(`no character at ${p.path[0][0]},${p.path[0][1]} to select`);
    ED.sel = k; p = { ...p, path: [p.path[p.path.length - 1]] };
  }
  setSelection({ tool: p.tool, terrain: p.terrain, asset: p.asset, sprite: p.sprite, face: p.face, brush: p.brush });
  const before = JSON.stringify(toJSON(M)); runStroke(p.path); syncName();
  return { changed: before === JSON.stringify(toJSON(ED.M)) ? 0 : 1, tiles: p.path.length, objects: ED.M.objs.length, characters: ED.M.chars.length };
}

/* ---------- map-level ---------- */
const sizeOf = (p, M) => { const S = p.size != null ? p.size : M.S; if (!(S >= 4 && S <= 96)) fail('size must be 4-96'); return S; };
const METHOD_IMPL = {
  describe, state, ascii, setView, tileToScreen, screenToTile, screenshot, setSelection, useTool, batch,
  open() { ensureModel(); openEditor(); return state(); },
  close() { closeEditor(); return state(); },
  getMap() { return toJSON(ensureModel()); },
  setMap(p) { let M; try { M = fromJSON(p.map); } catch (err) { fail(err.message); } replaceModel(M); return { size: M.S, objects: M.objs.length }; },
  newMap(p) {
    const M0 = ensureModel(), B = biomeOf(p.biome), ground = p.ground ? terrainId(p.ground) : B ? B.ground[0] : 'grass', M = blankModel(sizeOf(p, M0), ground, p.name ? String(p.name).slice(0, 60) : undefined);
    M.clim = B ? B.clim : M0.clim; replaceModel(M); return { size: M.S, ground };
  },
  generate(p) {
    const M0 = ensureModel(); biomeOf(p.biome); const seed = p.seed || Math.random().toString(36).slice(2, 7), M = generateScene(seed, sizeOf(p, M0), p.biome || 'vale');
    replaceModel(M); return { name: M.name, seed, size: M.S, objects: M.objs.length };
  },
  rename: edit('rename'), removeFloor: edit('removeFloor'), placeCharacter: edit('placeCharacter'), walkCharacter: edit('walkCharacter'), removeCharacter: edit('removeCharacter'), paint: edit('paint'), fill: edit('fill'), elevation: edit('elevation'), place: edit('place'), erase: edit('erase'), moveObject: edit('moveObject'),
  getTile(p) { const M = ensureModel(); tileOf(M, p.x, p.y); return tileInfo(M, p.x, p.y, p.level || 0); },
  getRegion(p) {
    const M = ensureModel(), tiles = rectOf(M, p); if (!tiles.length) fail('rect is outside the map');
    const x0 = tiles[0][0], y0 = tiles[0][1], w = tiles[tiles.length - 1][0] - x0 + 1, h = tiles[tiles.length - 1][1] - y0 + 1;
    return { x: x0, y: y0, w, h, terrain: tiles.map(([x, y]) => TERRAIN[M.terr[y * M.S + x]].id), elevation: tiles.map(([x, y]) => M.elev[y * M.S + x]), objects: M.objs.map((o, k) => pieceInfo(M, o, k)).filter(o => o.x < x0 + w && o.y < y0 + h && o.x + o.w > x0 && o.y + o.d > y0) };
  },
  listObjects(p) {
    const M = ensureModel(); let list = M.objs.map((o, k) => pieceInfo(M, o, k)); if (p.id) list = list.filter(o => o.id === p.id); if (p.level != null) list = list.filter(o => o.level === p.level);
    if (p.rect) list = list.filter(o => o.x < p.rect.x + p.rect.w && o.y < p.rect.y + p.rect.h && o.x + o.w > p.rect.x && o.y + o.d > p.rect.y);
    return { count: list.length, objects: list };
  },
  listSprites() { return { count: library.list().length, sprites: library.list().map(s => ({ id: s.id, name: s.name, colours: s.pal.length })) }; },
  listCharacters() { const M = ensureModel(); return { count: (M.chars || []).length, characters: (M.chars || []).map((c, k) => charInfo(M, k)) }; },
  undo(p) { ensureModel(); let n = 0; for (let i = 0; i < (p.steps || 1) && ED.undo.length; i++, n++) undo(); syncName(); return { undone: n, history: state().history }; },
  redo(p) { ensureModel(); let n = 0; for (let i = 0; i < (p.steps || 1) && ED.redo.length; i++, n++) redo(); syncName(); return { redone: n, history: state().history }; }
};

async function call(method, params = {}) {
  const spec = METHODS[method];
  if (!spec) throw new ApiError(`unknown method "${method}"; known: ${Object.keys(METHODS).join(', ')}`);
  checkProps(spec.input, spec.required, params || {}, '');
  return METHOD_IMPL[method](params || {});
}

/* test hook, not part of the API: compares the editor's patched-in-place map image with a fresh
   full render of the same map and counts the pixels that differ */
function renderCheck() {
  needOpen(); const R = ED.R, F = renderTiles(ED.M, R.rot, R.SC, R.opts), w = R.can.width, h = R.can.height;
  const a = R.can.getContext('2d').getImageData(0, 0, w, h).data, b = F.can.getContext('2d').getImageData(0, 0, w, h).data;
  let differing = 0, maxDelta = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
    if (d) { differing++; maxDelta = Math.max(maxDelta, d); const px = (i / 4) % w, py = (i / 4 / w) | 0; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
  }
  /* where the differences are, in map-image pixels and the patch rectangle last repainted, to help find a seam */
  return { pixels: w * h, differing, maxDelta, ...(differing ? { box: [x0, y0, x1, y1], patched: R.patched && R.patched.map(v => Math.round(v * R.SC)) } : {}) };
}

/* the object other code (and a DevTools console) talks to */
const api = { version: 1, spec: METHODS, call, ApiError, debug: { renderCheck }, ...Object.fromEntries(Object.keys(METHODS).map(k => [k, p => call(k, p)])) };
window.hexwright = api;

export { ApiError, api, call };
