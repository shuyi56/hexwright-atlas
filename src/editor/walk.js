import { ASSET_BY_ID, TERRAIN } from '../tiles/index.js';
import { inb } from './ops.js';
import { MAX_LEVEL, floorAt, levelOf, objAt } from './model.js';

/* ================= tile editor: where characters can stand and walk =================
   A tile on level L is free when it is on the map, has ground (dry, not lava) or, above the ground, a floor,
   and holds neither a piece (other than one made to be walked through, such as a doorway or stairs) nor
   another character on that level.
   A step goes to one of the four edge-neighbours on the same level and may climb or drop at most one height
   level; an upper floor follows the ground under it, so the rule holds there too. Stairs join two levels:
   from a stairs piece on level L a step towards its high end (its back) lands on the tile behind it on level
   L + 1, and the same step back comes down, provided the flight's top and that floor are within one height
   level of each other. Pure, so the
   pointer and the automation API walk by the same rules. Positions in paths are [x, y, level]. */
const FACE_DELTA = [[0, 1], [1, 0], [0, -1], [-1, 0]];  /* facing 0..3 = south-west, south-east, north-east, north-west */
const MAX_STEP = 1;
const charAt = (M, x, y, except = -1, L = 0) => (M.chars || []).findIndex((c, k) => k !== except && c.x === x && c.y === y && levelOf(c) === L);
function blockedBy(M, x, y, except = -1, L = 0) {
  if (!inb(M, x, y)) return 'outside the map';
  if (L < 0 || L > MAX_LEVEL) return 'no such level';
  if (L) { if (!floorAt(M, L, y * M.S + x)) return `no floor on level ${L}`; }
  else { const T = TERRAIN[M.terr[y * M.S + x]]; if (T.water) return 'water'; if (T.glow) return 'lava'; }
  const k = objAt(M, x, y, L); if (k >= 0 && !ASSET_BY_ID[M.objs[k].id].walk) return 'a piece stands there';
  if (charAt(M, x, y, except, L) >= 0) return 'another character stands there';
  return null;
}
const isFree = (M, x, y, except = -1, L = 0) => !blockedBy(M, x, y, except, L);
/* a step on one level: free, and no more than MAX_STEP height levels up or down (floors sit on the ground's height) */
const climb = (M, x, y, nx, ny) => Math.abs(M.elev[ny * M.S + nx] - M.elev[y * M.S + x]);
const canStep = (M, x, y, nx, ny, except = -1, L = 0) => isFree(M, nx, ny, except, L) && climb(M, x, y, nx, ny) <= MAX_STEP;
const faceOf = (dx, dy) => FACE_DELTA.findIndex(([a, b]) => a === dx && b === dy);
/* the stairs piece on (x, y, L), if any, and the tile its top lands on (one level up) */
function stairsAt(M, x, y, L) {
  const k = objAt(M, x, y, L); if (k < 0 || M.objs[k].id !== 'stairs') return null;
  const [dx, dy] = FACE_DELTA[(M.objs[k].face + 2) % 4]; return { k, up: [x + dx, y + dy, L + 1] };
}
/* every place one step from (x, y, L) */
function neighbours(M, x, y, L, except) {
  const out = [];
  for (const [dx, dy] of FACE_DELTA) {
    const nx = x + dx, ny = y + dy; if (!inb(M, nx, ny)) continue;
    if (canStep(M, x, y, nx, ny, except, L)) out.push([nx, ny, L]);
    /* down a flight: the tile in front is stairs on the level below whose top is here */
    if (L > 0) { const st = stairsAt(M, nx, ny, L - 1); if (st && st.up[0] === x && st.up[1] === y && isFree(M, nx, ny, except, L - 1) && climb(M, x, y, nx, ny) <= MAX_STEP) out.push([nx, ny, L - 1]); }
  }
  /* up a flight */
  const st = stairsAt(M, x, y, L); if (st && L < MAX_LEVEL && inb(M, st.up[0], st.up[1]) && isFree(M, st.up[0], st.up[1], except, L + 1) && climb(M, x, y, st.up[0], st.up[1]) <= MAX_STEP) out.push(st.up);
  return out;
}
const stepOK = (M, from, to, except) => neighbours(M, from[0], from[1], from[2], except).some(n => n[0] === to[0] && n[1] === to[1] && n[2] === to[2]);

/* where a click on (x, y) of level L sends character k: a flight of stairs means "go up it", to the landing on
   the floor above; the open stairwell over a flight means "go down", onto the flight; anything else is itself */
function walkGoal(M, k, x, y, L) {
  const st = stairsAt(M, x, y, L);
  if (st && L < MAX_LEVEL && inb(M, st.up[0], st.up[1]) && isFree(M, st.up[0], st.up[1], k, L + 1)) return st.up;
  if (L > 0 && inb(M, x, y) && !floorAt(M, L, y * M.S + x) && stairsAt(M, x, y, L - 1)) return [x, y, L - 1];
  return [x, y, L];
}
/* shortest route from character k to (tx, ty) on level tL (default its own), as [[x, y, level], ...] without the start; null if unreachable */
function findPath(M, k, tx, ty, tL) {
  const c = M.chars[k], S = M.S, NN = S * S, L0 = levelOf(c); if (tL == null) tL = L0;
  if (!isFree(M, tx, ty, k, tL)) return null;
  const id = (x, y, L) => L * NN + y * S + x, start = id(c.x, c.y, L0), end = id(tx, ty, tL);
  const from = new Int32Array(NN * (MAX_LEVEL + 1)).fill(-2), q = [start]; from[start] = -1;
  for (let h = 0; h < q.length && from[end] === -2; h++) {
    const u = q[h], L = (u / NN) | 0, r = u % NN;
    for (const [nx, ny, nL] of neighbours(M, r % S, (r / S) | 0, L, k)) { const v = id(nx, ny, nL); if (from[v] !== -2) continue; from[v] = u; q.push(v); }
  }
  if (from[end] === -2) return null;
  const path = []; for (let u = end; u !== start; u = from[u]) { const r = u % NN; path.push([r % S, (r / S) | 0, (u / NN) | 0]); }
  return path.reverse();
}
/* every place the character could walk to: one byte per tile per level, level-major */
function reachable(M, k) {
  const c = M.chars[k], S = M.S, NN = S * S, seen = new Uint8Array(NN * (MAX_LEVEL + 1)), start = levelOf(c) * NN + c.y * S + c.x, q = [start]; seen[start] = 1;
  for (let h = 0; h < q.length; h++) {
    const u = q[h], L = (u / NN) | 0, r = u % NN;
    for (const [nx, ny, nL] of neighbours(M, r % S, (r / S) | 0, L, k)) { const v = nL * NN + ny * S + nx; if (!seen[v]) { seen[v] = 1; q.push(v); } }
  }
  return seen;
}

/* ---------- character edits: like ops.js, each says what happened rather than throwing ---------- */
function placeChar(M, c) {
  const L = levelOf(c), why = blockedBy(M, c.x, c.y, -1, L); if (why) return { ok: false, reason: `tile ${c.x},${c.y}${L ? ` on level ${L}` : ''} is not free: ${why}` };
  const ch = { sprite: c.sprite, x: c.x, y: c.y, face: (c.face | 0) & 3 }; if (L) ch.level = L; (M.chars || (M.chars = [])).push(ch);
  return { ok: true, index: M.chars.length - 1, char: ch };
}
function eraseCharAt(M, x, y, L = 0) { const k = charAt(M, x, y, -1, L); if (k < 0) return 0; M.chars.splice(k, 1); return 1; }
/* walk character k along a path (as findPath returns it); the model jumps to the end, facing the last step */
function walkChar(M, k, path) {
  const c = M.chars[k]; let at = [c.x, c.y, levelOf(c)];
  for (const p of path) {
    const to = [p[0], p[1], p[2] ?? at[2]];
    if (!stepOK(M, at, to, k)) return { ok: false, reason: `cannot step from ${at[0]},${at[1]} (level ${at[2]}) to ${to[0]},${to[1]} (level ${to[2]})` };
    at = to;
  }
  if (path.length) {
    const prev = path.length > 1 ? path[path.length - 2] : [c.x, c.y]; c.face = faceOf(at[0] - prev[0], at[1] - prev[1]);
    c.x = at[0]; c.y = at[1]; if (at[2]) c.level = at[2]; else delete c.level;
  }
  return { ok: true, steps: path.length };
}

export { FACE_DELTA, blockedBy, canStep, charAt, eraseCharAt, faceOf, findPath, isFree, neighbours, placeChar, reachable, stairsAt, walkChar, walkGoal };
