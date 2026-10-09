import { MAX_LEVEL, levelOf } from '../editor/model.js';
import { neighbours } from '../editor/walk.js';

/* ================= tactical view: how far a unit moves =================
   A unit's turn reaches every place within its move (MOVE unless its data in data/units/ says otherwise), by the
   editor's walking rules (editor/walk.js: up or down as many height levels a step as its jump, around pieces and
   other figures, up and down stairs). Pure, so tests and the view share it. Places are [x, y, level] in model
   tiles. */
const MOVE = 5, JUMP = 1;
/* every place character k reaches in at most `move` steps of at most `jump` height levels: Map of place id ->
   { at, d, from } (from = the id of the place before it on a shortest route, -1 at the start) */
function moveRange(M, k, move = MOVE, jump = JUMP) {
  const c = M.chars[k], S = M.S, NN = S * S, id = (x, y, L) => L * NN + y * S + x, start = id(c.x, c.y, levelOf(c));
  const seen = new Map([[start, { at: [c.x, c.y, levelOf(c)], d: 0, from: -1 }]]), q = [start];
  for (let h = 0; h < q.length; h++) {
    const p = seen.get(q[h]); if (p.d >= move) continue;
    for (const n of neighbours(M, p.at[0], p.at[1], p.at[2], k, jump)) {
      const v = id(n[0], n[1], n[2]); if (seen.has(v) || n[2] > MAX_LEVEL) continue;
      seen.set(v, { at: n, d: p.d + 1, from: q[h] }); q.push(v);
    }
  }
  return seen;
}
const placeId = (M, x, y, L) => L * M.S * M.S + y * M.S + x;
/* the route to place id inside a range, without the start, as walkChar takes it; null if out of range */
function routeTo(range, id) {
  if (!range.has(id)) return null;
  const out = []; for (let v = id; range.get(v).from !== -1; v = range.get(v).from) out.push(range.get(v).at);
  return out.reverse();
}

export { JUMP, MOVE, moveRange, placeId, routeTo };
