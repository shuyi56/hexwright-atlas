import { levelOf } from '../editor/model.js';

/* ================= tactical view: what a unit can strike =================
   A unit's attack reaches tiles by its pattern (data/units/, src/data/units.js) and its range, on the map's grid:
     melee   the four tiles beside it, never the diagonals, whatever its range
     line    straight out along the grid in the four directions, up to its range
     ranged  every tile up to its range steps along the grid (no diagonal steps), not its own
   A melee blow lands only on a unit on the attacker's own storey; line and ranged attacks reach any storey. Pure, so
   tests and the view share it. Places are [x, y, level] in model tiles. */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/* the (x, y) offsets a pattern reaches out to range */
function patternOffsets(pattern, range) {
  if (pattern === 'line') return DIRS.flatMap(([dx, dy]) => Array.from({ length: Math.max(1, range) }, (_, i) => [dx * (i + 1), dy * (i + 1)]));
  if (pattern === 'ranged') {
    const out = [];
    for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) if ((dx || dy) && Math.abs(dx) + Math.abs(dy) <= range) out.push([dx, dy]);
    return out;
  }
  return DIRS.map(d => d.slice());
}
/* the storey a tile is seen on from level L: L, or the floor or ground below where L has no floor there */
function floorLevel(M, x, y, L) { while (L > 0 && !(M.floors && M.floors[L - 1] && M.floors[L - 1][y * M.S + x])) L--; return L; }

/* where character k's attack reaches: cells, the tiles to light up as [x, y, level]; targets, the indices of the
   other characters standing in them that canHit(j) allows (the view leaves out the fallen and the unit's own side) */
function attackReach(M, k, range, pattern, canHit = () => true) {
  const c = M.chars[k], L0 = levelOf(c), cells = [], targets = [];
  for (const [dx, dy] of patternOffsets(pattern, range)) {
    const x = c.x + dx, y = c.y + dy; if (x < 0 || y < 0 || x >= M.S || y >= M.S) continue;
    const here = M.chars.map((o, j) => j).filter(j => j !== k && M.chars[j].x === x && M.chars[j].y === y && canHit(j) && (pattern === 'line' || pattern === 'ranged' || levelOf(M.chars[j]) === L0));
    targets.push(...here);
    cells.push(here.length ? [x, y, levelOf(M.chars[here[0]])] : [x, y, floorLevel(M, x, y, L0)]);
  }
  return { cells, targets };
}

export { attackReach, patternOffsets };
