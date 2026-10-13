import { ASSET_BY_ID, footprint } from '../tiles/index.js';
import { TILE } from './ground.js';
import { MID, SMALL, TABLE, TREES, barRuns, barStools, fitTo, seatsOf, treeOffset, turned } from './pieces.js';

/* ================= town view: what a walker bumps into =================
   The hero walks freely in map pixels, not tile by tile, so each piece blocks only the ground it is drawn
   standing on: a tree its trunk, a bush or a well its round base, a house its walls (the step in front of the door
   stays open), a fence a strip along its rails, an interior wall the band it is drawn as, joined to the walls
   beside it, a doorway the wall either side of its opening, a bar counter its band (joined like a wall), a table set its table
   and each chair round it. Flowers, toadstools, reeds and stairs block nothing. Shapes are circles { x, y, r } and
   rectangles { x0, y0, x1, y1 } in map pixels, grouped by storey. No DOM. */
const T = TILE;
const circle = (x, y, r) => ({ x, y, r });
const rect = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
const OPEN = new Set(['flowers', 'mushrooms', 'reeds', 'rowboat', 'stairs', 'moonflowers']);
const ROUND_FURNITURE = { chair: 6, stool: 5, candelabra: 4, plantpot: 6, cauldron: 10, spinwheel: 9 };

/* the shapes of piece o in its own drawing's coordinates (kit pixels, the footprint FW × FD from (0, 0)) */
function local(o, FW, FD) {
  const id = o.id;
  if (TREES.has(id)) { const [dx, dy] = treeOffset(o), up = id === 'pine' || id === 'snowpine' ? 6 : 8; return [circle(FW / 2 + dx, FD - up - dy, id === 'palm' ? 4 : 5)]; }
  switch (id) {
    case 'bush': return [circle(FW / 2, FD - 9, 10)];
    case 'cactus': return [circle(FW / 2, FD - 8, 5)];
    case 'rocks': return [circle(FW / 2, FD - 8, 6)];
    case 'boulders': return [circle(14, FD - 10, 10), circle(22, FD - 8, 6)];
    case 'stump': return [circle(FW / 2, FD - 10, 6)];
    case 'logpile': return [rect(2, FD - 17, 27, FD - 3)];
    case 'haystack': return [circle(FW / 2, FD - 10, 12)];
    case 'haybales': return [rect(4, FD - 17, 29, FD - 5)];
    case 'barrels': return [circle(15, FD - 10, 10)];
    case 'crates': return [rect(4, FD - 16, 28, FD - 4)];
    case 'cart': return [rect(4, 8, FW - 4, FD - 5)];
    case 'well': return [circle(FW / 2, FD - 9, 11)];
    case 'scarecrow': case 'lamppost': case 'signpost': case 'elvenlantern': return [circle(FW / 2, FD - 6, 3)];
    case 'moonwell': return [circle(FW / 2, FD - 9, 12)];
    case 'flet': return [circle(FW / 2, FD - 9, 12)];
    case 'elvenpavilion': return [circle(15, FD - 12, 5), circle(FW - 15, FD - 12, 5), circle(25, FD - 40, 4), circle(FW - 25, FD - 40, 4)];
    case 'elvenarch': return (o.face || 0) % 2 ? [circle(FW / 2, 14, 6), circle(FW / 2, FD - 14, 6)] : [circle(18, FD / 2 + 8, 7), circle(FW - 18, FD / 2 + 8, 7)];
    case 'stones': return Array.from({ length: 7 }, (_, k) => { const a = k / 7 * Math.PI * 2; return circle(FW / 2 + Math.cos(a) * FW * 0.34, FD / 2 + Math.sin(a) * FD * 0.3, 4); });
    case 'stall': return [rect(3, FD - 14, FW - 3, FD - 4)];
    case 'beehives': return [rect(3, FD - 11, FW - 3, FD - 5)];
    case 'campfire': return [circle(FW / 2, FD - 9, 9)];
    case 'statue': return [rect(7, FD - 14, FW - 7, FD - 6)];
    case 'graves': return [rect(4, FD - 24, FW - 4, FD - 4)];
    case 'obelisk': return [circle(FW / 2, FD - 9, 8)];
    case 'fence': return (o.face || 0) % 2 ? [rect(FW / 2 - 3, 0, FW / 2 + 3, FD)] : [rect(0, FD - 15, FW, FD - 8)];
    case 'post': return [circle(FW / 2, FD / 2, 4)];
    case 'hearth': {
      /* the wall it stands in and its chimney breast, standing out the way it faces (town/pieces.js) */
      const L = o.links || [0, 0, 0, 0], f = (o.face || 0) & 3, m = FW / 2, c0 = m - 5, c1 = m + 5, b = 26, p = 16;
      const wall = f % 2 === 0 ? rect(L[2] ? 0 : c0, c0, L[0] ? FW : c1, c1) : rect(c0, L[3] ? 0 : c0, c1, L[1] ? FD : c1);
      const breast = [rect(m - b, c0 - 3, m + b, c1 + p), rect(c0 - 3, m - b, c1 + p, m + b), rect(m - b, c0 - p, m + b, c1 + 3), rect(c0 - p, m - b, c1 + 3, m + b)][f];
      return [wall, breast];
    }
    case 'idoor': {
      /* the wall either side of the opening (DOOR_HALF either side of the middle, town/pieces.js) */
      const L = o.links || [0, 0, 0, 0], across = L[0] || L[2] || !(L[1] || L[3]), c0 = FW / 2 - 5, c1 = FW / 2 + 5, h = 21;
      return across ? [rect(0, c0, FW / 2 - h, c1), rect(FW / 2 + h, c0, FW, c1)] : [rect(c0, 0, c1, FD / 2 - h), rect(c0, FD / 2 + h, c1, FD)];
    }
    case 'bar': {
      /* the counter's runs (joined like a wall), a little wider than drawn, and its stools */
      return [...barRuns(o).map(([a0, a1, b0, b1]) => rect(a0 - 2, b0 - 2, a1 + 2, b1 + 2)), ...barStools(o).map(([x, y]) => circle(x, y - 2, 4))];
    }
    case 'tableset': {
      /* the table, and a round seat for each chair pulled up to it */
      const f = (o.face || 0) & 3, t = turned(f, FW, FD, TABLE[0] - 2, TABLE[1] + 2, TABLE[2] - 2, TABLE[3] + 2);
      return [rect(...t), ...seatsOf(o).map(([a, b]) => { const r = turned(f, FW, FD, a - 6, a + 6, b - 6, b + 6); return circle((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 7); })];
    }
    case 'feastset': return [(o.face || 0) % 2 ? rect(14, 22, FW - 14, FD - 22) : rect(22, 14, FW - 22, FD - 14)];
    case 'backbar': case 'casks': {
      /* along the back of its tile, or against the wall behind it */
      const b0 = o.snug ? -40 : 4; return [rect(...turned((o.face || 0) & 3, FW, FD, 6, 90, b0, b0 + 20))];
    }
    case 'coatrack': return [circle(FW / 2, FD - 10, 4)];
    case 'wallbar': {
      /* the wall, and the back bar standing before it on a run across the view */
      const L = o.links || [0, 0, 0, 0], c0 = FW / 2 - 5, c1 = FW / 2 + 5, out = [rect(L[2] ? 0 : c0, c0, L[0] ? FW : c1, c1)];
      if (L[1]) out.push(rect(c0, c1, c1, FD)); if (L[3]) out.push(rect(c0, 0, c1, c0));
      if (L[0] || L[2] || !(L[1] || L[3])) out.push(rect(6, c1, FW - 6, c1 + 18));
      return out;
    }
    case 'iwall': case 'iwindow': case 'wall': case 'walltower': case 'wallshelf': case 'wallantlers': case 'wallshield': case 'wallsconce': {
      /* a band through the middle, with an arm to each side it joins */
      const L = o.links || [0, 0, 0, 0], t = id === 'wall' || id === 'walltower' ? FW / 2 - 12 : 5, c0 = FW / 2 - t, c1 = FW / 2 + t;
      const out = [rect(c0, c0, c1, c1)];
      if (L[0]) out.push(rect(c1, c0, FW, c1)); if (L[2]) out.push(rect(0, c0, c0, c1));
      if (L[1]) out.push(rect(c0, c1, c1, FD)); if (L[3]) out.push(rect(c0, 0, c1, c0));
      if (id === 'walltower') out.push(circle(FW / 2, FD - 14, Math.min(FW, FD) * 0.4));
      return out;
    }
  }
  const a = ASSET_BY_ID[id];
  if (ROUND_FURNITURE[id]) return [circle(FW / 2, FD - 10, ROUND_FURNITURE[id])];
  if (a && a.group === 'Interior') return [rect(4, 6, FW - 4, FD - 5)];
  if (a && a.group === 'Props') return [rect(4, FD - 14, FW - 4, FD - 4)];
  /* a building: its walls, leaving the step before the door open */
  return [rect(4, 6, FW - 4, FD - 5)];
}
/* every piece's shapes in map pixels, by storey: Map level -> [shape] */
function shapesOf(objs, links = new Map()) {
  const out = new Map(), fit = fitTo(objs);
  for (const p of objs) {
    if (OPEN.has(p.id) || !ASSET_BY_ID[p.id]) continue;
    const [fw, fd] = footprint(p), U = SMALL.has(p.id) ? 32 : MID.has(p.id) ? 64 : T, FW = fw * U, FD = fd * U;
    /* drawings at a smaller scale stand in the middle of the south edge of their footprint */
    const ox = p.x * T + (fw * T - FW) / 2, oy = p.y * T + (fd * T - FD), L = p.level || 0;
    const list = out.get(L) || []; out.set(L, list);
    for (const s of local({ ...p, links: links.get(p) || p.links || null, ...fit(p) }, FW, FD)) list.push('r' in s ? circle(s.x + ox, s.y + oy, s.r) : rect(s.x0 + ox, s.y0 + oy, s.x1 + ox, s.y1 + oy));
  }
  return out;
}
/* does a walker's foot circle (x, y, r) overlap any of the shapes? */
function hits(shapes, x, y, r) {
  if (!shapes) return false;
  for (const s of shapes) {
    if ('r' in s) { const dx = x - s.x, dy = y - s.y, rr = r + s.r; if (dx * dx + dy * dy < rr * rr) return true; }
    else { const cx = Math.max(s.x0, Math.min(s.x1, x)), cy = Math.max(s.y0, Math.min(s.y1, y)), dx = x - cx, dy = y - cy; if (dx * dx + dy * dy < r * r) return true; }
  }
  return false;
}

export { hits, shapesOf };
