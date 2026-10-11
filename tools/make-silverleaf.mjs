#!/usr/bin/env node
/* ================= the Silverleaf Hollow scene =================
   node tools/make-silverleaf.mjs [out.json]
   Builds scenes/town/silverleaf-hollow.json by hand: an elven hollow laid out to show the elven wood's grounds,
   pieces and people (tiles/elven.js, characters/elves.js). A moonstone court round a moonwell, lanterns at its
   corners, the hall to the north and a white spire beside it; flets in the great trees round about, mallorns on
   their fallen gold leaves, silver willows over a moonlit pool in the south-east, moss starred with moonflowers
   everywhere else; the ranger, the warden, the sage and the elf lady about the court, and two dark elves creeping
   in from the western wood. Deterministic: the same map every time. */
import { writeFileSync } from 'node:fs';
import { placePiece } from '../src/editor/ops.js';
import { blankModel, TI, toJSON } from '../src/editor/model.js';
import { placeChar } from '../src/editor/walk.js';

const S = 24, M = blankModel(S, 'elvenmoss', 'Silverleaf Hollow'), out = process.argv[2] || 'scenes/town/silverleaf-hollow.json';
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < S && y < S) M.terr[y * S + x] = TI[t]; };
const elev = (x, y, e) => { if (x >= 0 && y >= 0 && x < S && y < S) M.elev[y * S + x] = e; };
const fail = [];
const put = (id, x, y, v, face = 0) => { const r = placePiece(M, { id, x, y, face, v: v ?? rnd() }); if (!r.ok) fail.push(`${id}@${x},${y}: ${r.reason}`); };
const tryPut = (id, x, y, v = rnd(), face = 0) => placePiece(M, { id, x, y, face, v }).ok;

/* the ground: moss, with drifts of fallen gold leaves under the woods */
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const woods = x < 6 || y < 4 || x > 19 || (y > 19 && x < 14);
  if (woods && rnd() < 0.55) set(x, y, 'goldleaf');
}
/* the court: moonstone round the moonwell, one level up on a low terrace, with paths out east and south */
for (let y = 8; y < 15; y++) for (let x = 8; x < 15; x++) { set(x, y, 'moonstone'); elev(x, y, 1); }
for (let x = 15; x < S; x++) set(x, 11, 'moonstone');
for (let y = 15; y < S; y++) set(11, y, 'moonstone');
for (let y = 4; y < 8; y++) for (let x = 9; x < 14; x++) { set(x, y, 'moonstone'); elev(x, y, 1); }
/* a rise in the north-west for the spire's neighbour flet, in walkable steps */
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const d = Math.hypot(x - 2, y - 2); elev(x, y, d < 2.5 ? 2 : d < 4.5 ? 1 : 0); }
/* the moonlit pool in the south-east, fringed with moss and moonflowers */
for (let y = 15; y < 22; y++) for (let x = 15; x < 22; x++) { const d = Math.hypot((x - 18.2) / 2.8, (y - 18.2) / 2.4); if (d < 1) set(x, y, 'moonpool'); }

/* the hall to the north of the court, its doors toward the well, and the spire beside it */
put('elvenhall', 10, 5, 0.4, 0); put('elvenspire', 13, 4, 0.5, 0);
put('moonwell', 11, 11, 0.5);
/* the high houses: a domed rotunda east of the court, a manor in the western wood, a pavilion by the pool, and
   archways over the paths into the court */
put('elvenrotunda', 16, 7, 0.5, 0); put('elvenmanor', 2, 9, 0.5, 1); put('elvenpavilion', 13, 17, 0.5, 0);
put('elvenarch', 15, 11, 0.5, 1); put('elvenarch', 11, 15, 0.5, 0);
for (const [x, y] of [[8, 8], [14, 8], [8, 14], [14, 14]]) put('elvenlantern', x, y, 0.5, x < 11 ? 1 : 0);
for (const [x, y] of [[16, 10], [16, 12], [10, 16], [12, 16]]) put('elvenlantern', x, y, 0.5, (x + y) % 2);
/* flets in the great trees round the hollow */
for (const [x, y] of [[2, 2], [19, 6], [4, 17], [20, 14]]) put('flet', x, y, rnd());
/* the woods: mallorns, a few willows, moonflowers in the clearings, never on the paths or the court */
const kept = new Set(['4,12', '1,13', '17,2', '22,9', '6,21']);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const t = M.terr[y * S + x]; if (t === TI.moonstone || t === TI.moonpool || kept.has(x + ',' + y)) continue;
  const woods = x < 7 || y < 3 || x > 18 || (y > 19 && x < 15), r = rnd();
  if (woods && r < 0.42) tryPut('mallorn', x, y); else if (r < (woods ? 0.52 : 0.12)) tryPut('moonflowers', x, y);
}
for (const [x, y] of [[15, 16], [21, 17], [16, 21], [21, 20], [14, 19]]) tryPut('willow', x, y);
for (const [x, y] of [[17, 15], [20, 22], [14, 17]]) tryPut('moonflowers', x, y);

/* the people: the elves about the court, two dark elves creeping in from the western wood */
for (const c of [{ sprite: 'elflady', x: 11, y: 13, face: 0 }, { sprite: 'elfsage', x: 10, y: 7, face: 0 }, { sprite: 'elfwarden', x: 12, y: 7, face: 0 }, { sprite: 'elfranger', x: 17, y: 11, face: 3 }, { sprite: 'darkelf', x: 4, y: 12, face: 1 }, { sprite: 'darkelf', x: 1, y: 13, face: 1 }]) {
  const r = placeChar(M, c); if (!r.ok) fail.push(`${c.sprite}: ${r.reason}`);
}
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
writeFileSync(out, JSON.stringify(toJSON(M)));
console.log(`wrote ${out}: ${M.objs.length} pieces, ${M.chars.length} people`);
