import { ASSET_BY_ID, footprint } from '../tiles/index.js';
import { MAX_ELEV, TI, fits, objAt } from './model.js';

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

function paintTiles(M, tiles, terrainId) {
  const t = TI[terrainId]; let n = 0;
  for (const [x, y] of tiles) { const u = y * M.S + x; if (M.terr[u] !== t) { M.terr[u] = t; n++; } }
  return n;
}
/* four-way flood fill of the ground type under (x, y); pieces are left where they stand */
function floodFill(M, x, y, terrainId) {
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
  const o = { id: inst.id, x: inst.x, y: inst.y, face: (inst.face | 0) & 3, v: inst.v ?? Math.random() };
  if (!fits(M, o)) return { ok: false, reason: whyNot(M, o) };
  M.objs.push(o); return { ok: true, index: M.objs.length - 1, piece: o };
}
/* a human reason for a placement that fits() refused */
function whyNot(M, o) {
  const [w, d] = footprint(o), a = ASSET_BY_ID[o.id];
  if (o.x < 0 || o.y < 0 || o.x + w > M.S || o.y + d > M.S) return `${a.label} (${w}×${d}) at ${o.x},${o.y} leaves the ${M.S}×${M.S} map`;
  for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) {
    const k = objAt(M, x, y); if (k >= 0) return `tile ${x},${y} is already taken by ${ASSET_BY_ID[M.objs[k].id].label} #${k}`;
  }
  return a.water ? `${a.label} needs water under every tile` : `${a.label} needs dry ground under every tile`;
}
function eraseAt(M, x, y) { const k = objAt(M, x, y); if (k < 0) return 0; M.objs.splice(k, 1); return 1; }

export { brushTiles, clampElev, eraseAt, floodFill, inb, paintTiles, placePiece, rectTiles, setElev, shiftElev, whyNot };
