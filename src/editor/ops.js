import { ASSET_BY_ID, footprint } from '../tiles/index.js';
import { MAX_ELEV, MAX_LEVEL, TI, fits, floorAt, levelOf, objAt } from './model.js';

/* ================= tile editor: pure map operations =================
   Every tool the editor offers, as functions on a model with no DOM in sight. The pointer tools in
   editor.js and the automation API in api.js both call these, so a scripted edit and a mouse edit
   behave identically. Each returns the number of tiles or pieces it changed. */
const inb = (M, x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < M.S && y < M.S;
const clampElev = v => Math.max(0, Math.min(MAX_ELEV, v));

/* tiles under a square brush of side n centred on (x, y), clipped to the map */
function brushTiles(M, x, y, n = 1) {
  const out = [], o = Math.floor((n - 1) / 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const xx = x - o + i, yy = y - o + j; if (inb(M, xx, yy)) out.push([xx, yy]); }
  return out;
}
/* every tile of the rectangle (x, y, w, d), clipped to the map */
function rectTiles(M, x, y, w, d) {
  const out = [];
  for (let j = Math.max(0, y); j < Math.min(M.S, y + d); j++) for (let i = Math.max(0, x); i < Math.min(M.S, x + w); i++) out.push([i, j]);
  return out;
}

/* the byte grid of upper floor L, made on first use */
function floorGrid(M, L) { M.floors = M.floors || []; return M.floors[L - 1] || (M.floors[L - 1] = new Uint8Array(M.S * M.S)); }
/* paint ground (level 0) or lay floor on upper level L */
function paintTiles(M, tiles, terrainId, L = 0) {
  const t = TI[terrainId]; let n = 0;
  if (L) { const f = floorGrid(M, L); for (const [x, y] of tiles) { const u = y * M.S + x; if (f[u] !== t + 1) { f[u] = t + 1; n++; } } return n; }
  for (const [x, y] of tiles) { const u = y * M.S + x; if (M.terr[u] !== t) { M.terr[u] = t; n++; } }
  return n;
}
/* take up the floor of upper level L under tiles, unless a piece or a character stands there */
function removeFloor(M, tiles, L) {
  const f = M.floors && M.floors[L - 1]; if (!L || !f) return 0; let n = 0;
  for (const [x, y] of tiles) { const u = y * M.S + x; if (!f[u] || objAt(M, x, y, L) >= 0 || (M.chars || []).some(c => c.x === x && c.y === y && levelOf(c) === L)) continue; f[u] = 0; n++; }
  return n;
}
/* four-way flood fill of the ground type under (x, y); pieces are left where they stand */
function floodFill(M, x, y, terrainId, L = 0) {
  if (L) {
    /* on an upper level: the connected floor of the same kind (or the connected open space) under (x, y) */
    const S = M.S, f = floorGrid(M, L), t0 = f[y * S + x], tn = TI[terrainId] + 1; if (t0 === tn) return 0;
    const q = [y * S + x], seen = new Uint8Array(S * S); seen[q[0]] = 1; let n = 0;
    while (q.length) { const u = q.pop(); f[u] = tn; n++; const ux = u % S, uy = (u / S) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = ux + dx, yy = uy + dy, v = yy * S + xx; if (xx < 0 || yy < 0 || xx >= S || yy >= S || seen[v] || f[v] !== t0) continue; seen[v] = 1; q.push(v); } }
    return n;
  }
  const S = M.S, t0 = M.terr[y * S + x], tn = TI[terrainId]; if (t0 === tn) return 0;
  const q = [y * S + x], seen = new Uint8Array(S * S); seen[q[0]] = 1; let n = 0;
  while (q.length) {
    const u = q.pop(); M.terr[u] = tn; n++; const ux = u % S, uy = (u / S) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = ux + dx, yy = uy + dy, v = yy * S + xx; if (xx < 0 || yy < 0 || xx >= S || yy >= S || seen[v] || M.terr[v] !== t0) continue; seen[v] = 1; q.push(v); }
  }
  return n;
}
function shiftElev(M, tiles, dz) {
  let n = 0;
  for (const [x, y] of tiles) { const u = y * M.S + x, v = clampElev(M.elev[u] + dz); if (v !== M.elev[u]) { M.elev[u] = v; n++; } }
  return n;
}
function setElev(M, tiles, level) {
  const v = clampElev(level); let n = 0;
  for (const [x, y] of tiles) { const u = y * M.S + x; if (M.elev[u] !== v) { M.elev[u] = v; n++; } }
  return n;
}
/* returns the piece that was placed, or null with a reason string when it does not fit */
function placePiece(M, inst) {
  if (!ASSET_BY_ID[inst.id]) return { ok: false, reason: `unknown asset "${inst.id}"` };
  const o = { id: inst.id, x: inst.x, y: inst.y, face: (inst.face | 0) & 3, v: inst.v ?? Math.random() }, L = levelOf(inst);
  if (L) o.level = L;
  if (!fits(M, o)) return { ok: false, reason: whyNot(M, o) };
  M.objs.push(o); return { ok: true, index: M.objs.length - 1, piece: o };
}
/* a human reason for a placement that fits() refused */
function whyNot(M, o) {
  const [w, d] = footprint(o), a = ASSET_BY_ID[o.id], L = levelOf(o), on = L ? ` on floor ${L}` : '';
  if (L > MAX_LEVEL) return `there are only ${MAX_LEVEL} upper floors`;
  if (o.x < 0 || o.y < 0 || o.x + w > M.S || o.y + d > M.S) return `${a.label} (${w}×${d}) at ${o.x},${o.y} leaves the ${M.S}×${M.S} map`;
  for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) {
    const k = objAt(M, x, y, L); if (k >= 0) return `tile ${x},${y}${on} is already taken by ${ASSET_BY_ID[M.objs[k].id].label} #${k}`;
    if ((M.chars || []).some(c => c.x === x && c.y === y && levelOf(c) === L)) return `a character stands on tile ${x},${y}${on}`;
    if (L && !floorAt(M, L, y * M.S + x)) return `tile ${x},${y} has no floor on level ${L}; lay one first`;
  }
  if (L) return `${a.label} cannot stand on an upper floor`;
  return a.water ? `${a.label} needs water under every tile` : `${a.label} needs dry ground under every tile`;
}
function eraseAt(M, x, y, L = 0) { const k = objAt(M, x, y, L); if (k < 0) return 0; M.objs.splice(k, 1); return 1; }

export { brushTiles, clampElev, eraseAt, floodFill, floorGrid, inb, paintTiles, placePiece, removeFloor, rectTiles, setElev, shiftElev, whyNot };
