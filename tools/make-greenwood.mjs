#!/usr/bin/env node
/* ================= the Greenwood glade scene =================
   node tools/make-greenwood.mjs [out.json]
   Builds scenes/town/greenwood-glade.json by hand: a woodland glade round a woodcutter's cottage, laid out to
   show every kind of tree and plant in the town view. An oak grove (some turning) and copper beeches to the
   north-west, a birch copse on the heath to the south-east, poplars lining the road in from the east, pines
   climbing a hill to a snowy summit of firs in the north-east, and a reed-fringed pond fed by a stream in the
   south-west, with bushes, wildflowers and toadstools along the edges of the woods. Deterministic: the same map
   every time. */
import { writeFileSync } from 'node:fs';
import { placePiece } from '../src/editor/ops.js';
import { blankModel, TI, toJSON } from '../src/editor/model.js';
import { placeChar } from '../src/editor/walk.js';

const S = 24, M = blankModel(S, 'grass', 'Greenwood glade'), out = process.argv[2] || 'scenes/town/greenwood-glade.json';
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < S && y < S) M.terr[y * S + x] = TI[t]; };
const elev = (x, y, e) => { if (x >= 0 && y >= 0 && x < S && y < S) M.elev[y * S + x] = e; };
const tree = (id, x, y, v = rnd()) => placePiece(M, { id, x, y, face: 0, v }).ok;
const fail = [];
const put = (id, x, y, v, face = 0) => { const r = placePiece(M, { id, x, y, face, v: v ?? rnd() }); if (!r.ok) fail.push(`${id}@${x},${y}: ${r.reason}`); };

/* the ground: meadow in the glade, tall grass under the woods, heath for the birches */
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const r = rnd();
  if (x < 9 && y < 10) set(x, y, r < 0.5 ? 'tallgrass' : 'grass');
  else if (x > 14 && y > 13) set(x, y, r < 0.55 ? 'heath' : 'meadow');
  else if (x > 7 && x < 16 && y > 7 && y < 16) set(x, y, r < 0.35 ? 'meadow' : 'grass');
}
/* a hill in the north-east rising in walkable steps to a rocky, snowy summit */
for (let y = 0; y < 11; y++) for (let x = 13; x < S; x++) {
  const d = Math.hypot(x - 19, (y - 3) * 1.25) + (rnd() - 0.5) * 1.1;
  const e = d < 1.9 ? 4 : d < 3.6 ? 2 : d < 5.6 ? 1 : 0; elev(x, y, e);
  if (e === 4) set(x, y, 'snow'); else if (e === 2) set(x, y, rnd() < 0.5 ? 'moor' : 'tallgrass');
}
set(19, 6, 'scree'); set(20, 6, 'scree'); set(18, 6, 'rock');
/* the stream from the north edge down to the pond in the south-west */
const stream = [[5, 0], [5, 1], [6, 2], [6, 3], [5, 4], [5, 5], [4, 6], [4, 7], [4, 8], [3, 9], [3, 10], [3, 11], [3, 12], [2, 13]];
for (const [x, y] of stream) set(x, y, 'water');
for (let y = 14; y < 20; y++) for (let x = 0; x < 7; x++) { const d = Math.hypot((x - 3) / 3.2, (y - 16.5) / 2.6); if (d < 0.75) set(x, y, 'deep'); else if (d < 1) set(x, y, 'water'); else if (d < 1.25) set(x, y, 'shallows'); else if (d < 1.45 && rnd() < 0.6) set(x, y, 'marsh'); }
/* the road in from the east edge to the cottage door, and a footpath on to the pond */
for (let x = 13; x < S; x++) set(x, 12, 'road');
for (const [x, y] of [[12, 12], [11, 12], [11, 11], [11, 13], [11, 14], [11, 15]]) set(x, y, 'road');
for (let x = 6; x < 11; x++) set(x, 15, 'road');
/* the cottage yard: a garden, a well, the woodpile */
for (let y = 8; y < 10; y++) for (let x = 13; x < 15; x++) set(x, y, 'garden');

/* the woodcutter's cottage and his things */
put('cottage', 11, 10, 0.7); put('logpile', 12, 9, 0.4); put('stump', 9, 12, 0.3); put('well', 14, 13, 0.5);
put('fence', 13, 10, 0.5); put('fence', 14, 10, 0.5); put('flowers', 13, 8, 0.2); put('flowers', 14, 9, 0.6);
put('haystack', 10, 8, 0.5); put('signpost', 16, 13, 0.5); put('cart', 13, 13, 0.4);

/* Woods: on each tile of an area, a tree with chance `dense`, else now and then undergrowth (bush, toadstools,
   flowers), never on water, road or the paths kept clear */
const clear = new Set(['5,3', '9,9', '17,6', '19,16', '8,16']);
function wood(x0, y0, x1, y1, dense, pick, under) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (clear.has(x + ',' + y)) continue;
    const r = rnd(); if (r < dense) { tree(pick(x, y), x, y); continue; }
    if (r < dense + 0.18) { const u = under[Math.floor(rnd() * under.length)]; placePiece(M, { id: u, x, y, face: 0, v: rnd() }); }
  }
}
/* the oak grove, a few turning, with copper beeches among them */
wood(0, 0, 9, 9, 0.62, () => (rnd() < 0.25 ? 'beech' : 'oak'), ['mushrooms', 'bush', 'mushrooms', 'flowers']);
/* the birch copse on the heath */
wood(15, 14, 23, 23, 0.55, () => (rnd() < 0.12 ? 'bush' : 'birch'), ['flowers', 'bush', 'rocks']);
/* poplars lining the road */
for (const x of [15, 17, 19, 21, 23]) { tree('poplar', x, 11); tree('poplar', x, 13); }
/* pines up the hill, snowy firs on the summit */
for (let y = 0; y < 11; y++) for (let x = 13; x < S; x++) {
  if (clear.has(x + ',' + y) || M.terr[y * S + x] === TI.road) continue;
  const e = M.elev[y * S + x], r = rnd();
  if (e === 4 && r < 0.7) tree('snowpine', x, y); else if (e >= 1 && r < 0.62) tree('pine', x, y); else if (e === 0 && x > 15 && r < 0.3) tree('pine', x, y);
}
put('boulders', 13, 1, 0.5);
/* the pond's edge: reeds, a rowing boat, and the meadow beyond */
{ let n = 0; for (let y = 12; y < 22 && n < 7; y++) for (let x = 0; x < 9 && n < 7; x++) if (M.terr[y * S + x] === TI.marsh && placePiece(M, { id: 'reeds', x, y, face: 0, v: rnd() }).ok) n++; }
put('rowboat', 4, 15, 0.5, 1);
for (const [x, y] of [[9, 17], [11, 19], [8, 21], [13, 18], [10, 22]]) put('flowers', x, y);
for (const [x, y] of [[12, 16], [9, 20], [12, 22], [7, 22], [13, 21], [10, 18]]) tree(rnd() < 0.3 ? 'beech' : 'oak', x, y);
for (const [x, y] of [[10, 16], [13, 19], [6, 21], [8, 19]]) put('bush', x, y, 0.8);
wood(0, 20, 5, 23, 0.6, () => 'pine', ['bush', 'mushrooms']);

/* the people */
for (const c of [{ sprite: 'villager', x: 9, y: 9, face: 3 }, { sprite: 'farmer', x: 14, y: 11, face: 3 }, { sprite: 'healer', x: 5, y: 3, face: 0 }, { sprite: 'monk', x: 19, y: 16, face: 3 }, { sprite: 'archer', x: 17, y: 6, face: 0 }, { sprite: 'noble', x: 8, y: 16, face: 1 }]) {
  const r = placeChar(M, c); if (!r.ok) fail.push(`${c.sprite}: ${r.reason}`);
}
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
writeFileSync(out, JSON.stringify(toJSON(M)));
console.log(`wrote ${out}: ${M.objs.length} pieces, ${M.chars.length} people`);
