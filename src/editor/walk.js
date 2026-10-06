import { ASSET_BY_ID, TERRAIN } from '../tiles/index.js';
import { inb } from './ops.js';
import { objAt } from './model.js';

/* ================= tile editor: where characters can stand and walk =================
   A tile is free when it is on the map, dry, not lava and holds neither a piece (other than one made to be
   walked through, such as a doorway) nor another character.
   A step goes to one of the four edge-neighbours and may climb or drop at most one height level. Pure,
   so the pointer, the keyboard and the automation API walk by the same rules. */
const FACE_DELTA = [[0, 1], [1, 0], [0, -1], [-1, 0]];  /* facing 0..3 = south-west, south-east, north-east, north-west */
const MAX_STEP = 1;
const charAt = (M, x, y, except = -1) => (M.chars || []).findIndex((c, k) => k !== except && c.x === x && c.y === y);
function blockedBy(M, x, y, except = -1) {
  if (!inb(M, x, y)) return 'outside the map';
  const T = TERRAIN[M.terr[y * M.S + x]];
  if (T.water) return 'water'; if (T.glow) return 'lava';
  const k = objAt(M, x, y); if (k >= 0 && !ASSET_BY_ID[M.objs[k].id].walk) return 'a piece stands there';
  if (charAt(M, x, y, except) >= 0) return 'another character stands there';
  return null;
}
const isFree = (M, x, y, except = -1) => !blockedBy(M, x, y, except);
const canStep = (M, x, y, nx, ny, except = -1) => isFree(M, nx, ny, except) && Math.abs(M.elev[ny * M.S + nx] - M.elev[y * M.S + x]) <= MAX_STEP;
const faceOf = (dx, dy) => FACE_DELTA.findIndex(([a, b]) => a === dx && b === dy);

/* shortest route from the character's tile to (tx, ty), as [[x, y], ...] without the start; null if unreachable */
function findPath(M, k, tx, ty) {
  const c = M.chars[k], S = M.S;
  if (!isFree(M, tx, ty, k)) return null;
  const from = new Int32Array(S * S).fill(-2), q = [c.y * S + c.x]; from[q[0]] = -1;
  for (let h = 0; h < q.length; h++) {
    const u = q[h], ux = u % S, uy = (u / S) | 0; if (ux === tx && uy === ty) break;
    for (const [dx, dy] of FACE_DELTA) { const nx = ux + dx, ny = uy + dy; if (!inb(M, nx, ny) || from[ny * S + nx] !== -2 || !canStep(M, ux, uy, nx, ny, k)) continue; from[ny * S + nx] = u; q.push(ny * S + nx); }
  }
  const end = ty * S + tx; if (from[end] === -2) return null;
  const path = []; for (let u = end; u !== c.y * S + c.x; u = from[u]) path.push([u % S, (u / S) | 0]);
  return path.reverse();
}
/* every tile the character could walk to */
function reachable(M, k) {
  const c = M.chars[k], S = M.S, seen = new Uint8Array(S * S), q = [c.y * S + c.x]; seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) { const u = q[h], ux = u % S, uy = (u / S) | 0; for (const [dx, dy] of FACE_DELTA) { const nx = ux + dx, ny = uy + dy; if (inb(M, nx, ny) && !seen[ny * S + nx] && canStep(M, ux, uy, nx, ny, k)) { seen[ny * S + nx] = 1; q.push(ny * S + nx); } } }
  return seen;
}

/* ---------- character edits: like ops.js, each says what happened rather than throwing ---------- */
function placeChar(M, c) {
  const why = blockedBy(M, c.x, c.y); if (why) return { ok: false, reason: `tile ${c.x},${c.y} is not free: ${why}` };
  const ch = { sprite: c.sprite, x: c.x, y: c.y, face: (c.face | 0) & 3 }; (M.chars || (M.chars = [])).push(ch);
  return { ok: true, index: M.chars.length - 1, char: ch };
}
function eraseCharAt(M, x, y) { const k = charAt(M, x, y); if (k < 0) return 0; M.chars.splice(k, 1); return 1; }
/* walk character k along a path (as findPath returns it); the model jumps to the end, facing the last step */
function walkChar(M, k, path) {
  const c = M.chars[k]; let px = c.x, py = c.y;
  for (const [x, y] of path) { if (Math.abs(x - px) + Math.abs(y - py) !== 1 || !canStep(M, px, py, x, y, k)) return { ok: false, reason: `cannot step from ${px},${py} to ${x},${y}` }; px = x; py = y; }
  if (path.length) { const [lx, ly] = path.length > 1 ? path[path.length - 2] : [c.x, c.y]; c.face = faceOf(px - lx, py - ly); c.x = px; c.y = py; }
  return { ok: true, steps: path.length };
}

export { FACE_DELTA, blockedBy, canStep, charAt, eraseCharAt, faceOf, findPath, isFree, placeChar, reachable, walkChar };
