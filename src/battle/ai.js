import { MAX_LEVEL, levelOf } from '../editor/model.js';
import { neighbours } from '../editor/walk.js';
import { attackReach } from '../tactical/attack.js';
import { moveRange, placeId, routeTo } from '../tactical/move.js';

/* ================= battle: how the computer plays a unit =================
   In the enemy phase each enemy in turn walks and strikes as a plain tactics-game soldier would:
     - if a foe can be struck from anywhere in its move range, it goes there and strikes, picking the foe with the
       fewest hit points left (a kill if it can get one) and, among the places it could strike from, the nearest;
     - otherwise it closes in: it walks to the place in its range nearest a foe by the walking rules (around pieces,
       up and down only as far as its jump), or as the crow flies where no route gets there, and waits.
   Pure: it reads the map and returns a plan; the view walks the route and makes the strike. */

/* score a comes before score b: compared element by element, lower first */
const before = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
/* the map with unit k standing at place `at` instead, for asking what it could strike from there */
function withUnitAt(M, k, [x, y, L]) {
  const chars = M.chars.slice(), c = { ...chars[k], x, y }; if (L) c.level = L; else delete c.level;
  chars[k] = c; return { ...M, chars };
}

/* how many steps each place is from the nearest of the foes' tiles, walking as unit k would (other figures block);
   Map of place id -> steps */
function distanceTo(M, k, foes, jump) {
  const NN = M.S * M.S, id = (x, y, L) => placeId(M, x, y, L), dist = new Map(), q = [];
  for (const j of foes) { const c = M.chars[j], v = id(c.x, c.y, levelOf(c)); if (!dist.has(v)) { dist.set(v, 0); q.push(v); } }
  for (let h = 0; h < q.length; h++) {
    const v = q[h], L = (v / NN) | 0, r = v % NN, d = dist.get(v);
    for (const n of neighbours(M, r % M.S, (r / M.S) | 0, L, k, jump)) {
      const w = id(n[0], n[1], n[2]); if (dist.has(w) || n[2] > MAX_LEVEL) continue;
      dist.set(w, d + 1); q.push(w);
    }
  }
  return dist;
}

/* unit k's plan for its phase: { path, target }, path the route to walk as routeTo gives it (empty to stay put),
   target the unit to strike from its end (-1 for none). opts: move, jump (its movement), range, pattern (its
   attack), isFoe(j) (a unit it may strike: standing, on the other side) and hpOf(j) (hit points left). */
function planTurn(M, k, { move, jump, range, pattern, isFoe, hpOf = () => 0 }) {
  const reach = moveRange(M, k, move, jump), places = [...reach.entries()];
  /* strike if it can: the weakest foe in reach of any place, from the nearest such place */
  let best = null;
  for (const [v, p] of places) {
    for (const j of attackReach(withUnitAt(M, k, p.at), k, range, pattern, isFoe).targets) {
      const score = [hpOf(j), p.d, j];
      if (!best || before(score, best.score)) best = { v, target: j, score };
    }
  }
  if (best) return { path: routeTo(reach, best.v), target: best.target };
  /* else close in on the nearest foe */
  const foes = M.chars.map((c, j) => j).filter(j => j !== k && isFoe(j));
  if (!foes.length) return { path: [], target: -1 };
  const dist = distanceTo(M, k, foes, jump);
  const crow = ([x, y]) => Math.min(...foes.map(j => Math.abs(M.chars[j].x - x) + Math.abs(M.chars[j].y - y)));
  let pick = null;
  for (const [v, p] of places) {
    const score = [dist.has(v) ? dist.get(v) : Infinity, crow(p.at), p.d];
    if (!pick || before(score, pick.score)) pick = { v, score };
  }
  return { path: routeTo(reach, pick.v), target: -1 };
}

export { planTurn };
