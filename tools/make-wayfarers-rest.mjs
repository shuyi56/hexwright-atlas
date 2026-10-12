#!/usr/bin/env node
/* ================= the Wayfarer's Rest scene =================
   node tools/make-wayfarers-rest.mjs [out.json]
   Builds scenes/town/wayfarers-rest.json by hand: a village inn with a fully furnished interior (editor/interiors.js)
   on a cobbled lane. The scene opens inside it (town.inside in its .scene.json).
   A tavern's room, 7 tiles square (five of floor inside the walls), packed full:
   - The common room (ground floor): oak boards and an aisle from the door to the fire; west of it a red rug and a
     candle stand at the hearth and a long table between two benches; east of it the bar (a counter facing the room,
     a dresser of crockery behind it, a stool before it); a weapon rack and barrels by the door, stairs in the
     south-east corner.
   - Upstairs (floor 1), walled and windowed like the room below: a passage along the south with a bench and a candle stand, the open stairwell at its east
     end, and two bedrooms through doorways in a timber partition: the west on a red carpet with a bed and a dresser,
     the east on a blue one with a bed and a wardrobe.
   - The people: the innkeeper behind the bar, a healer at it, a monk warming himself at the fire, a farmer by the long
     table, a guard by the stairs, and a noble guest upstairs.
   Outside, a cottage and a townhouse flank the inn on the lane, with a well, a lamp post, a signpost, barrels and
   crates, a garden with oaks, a bush and flowers to the south, and the hero on the lane. Deterministic: the same map
   every time. */
import { writeFileSync } from 'node:fs';
import { blankModel, TI, toJSON } from '../src/editor/model.js';
import { paintTiles, placePiece, rectTiles, removeFloor } from '../src/editor/ops.js';
import { placeChar } from '../src/editor/walk.js';

const out = process.argv[2] || 'scenes/town/wayfarers-rest.json', fail = [];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const put = (M, id, x, y, face = 0, level = 0) => { const r = placePiece(M, { id, x, y, face, v: rnd(), ...(level ? { level } : {}) }); if (!r.ok) fail.push(`${M.name}: ${id}@${x},${y}${level ? ' L' + level : ''}: ${r.reason}`); return r.piece; };
const stand = (M, sprite, x, y, face = 0, level = 0) => { const r = placeChar(M, { sprite, x, y, face, ...(level ? { level } : {}) }); if (!r.ok) fail.push(`${M.name}: ${sprite}@${x},${y}: ${r.reason}`); };

/* ---------- the inn's interior: 7 tiles square (five of floor inside the walls), the door in the middle of the south wall ---------- */
const S = 7, I = blankModel(S, 'oakfloor', 'The Wayfarer\'s Rest');
/* the outer walls: the fireplace in the back wall, windows round about, the door at 3,6 */
const special = { '2,0': 'hearth', '4,0': 'iwindow', '0,2': 'iwindow', '0,4': 'iwindow', '6,2': 'iwindow', '6,4': 'iwindow', '1,6': 'iwindow', '5,6': 'iwindow', '3,6': 'idoor' };
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!x || !y || x === S - 1 || y === S - 1) put(I, special[x + ',' + y] || 'iwall', x, y);
/* the common room, an aisle up the middle (x = 3) from the door to the fire. West of it the hearth corner (a red rug,
   a candle stand) and the long table between two benches; east of it the bar (the counter facing the room, a dresser
   of crockery behind it, a stool before it); a weapon rack by the door, and the stairs in the south-east corner. */
paintTiles(I, rectTiles(I, 1, 1, 3, 1), 'carpet');
put(I, 'candelabra', 1, 1);
put(I, 'longtable', 1, 3); put(I, 'bench', 1, 2, 0); put(I, 'bench', 1, 4, 2);
put(I, 'counter', 4, 2, 0); put(I, 'dresser', 5, 1, 0); put(I, 'stool', 5, 3);
put(I, 'weaponrack', 1, 5, 1); put(I, 'barrels', 2, 5);
/* the stairs climbing north to the landing at 5,4 on floor 1, stepped onto from the bar's side or the aisle */
put(I, 'stairs', 5, 5, 0);

/* upstairs: floor out to the walls but the stairwell over the flight, and the outer walls again with their windows */
paintTiles(I, rectTiles(I, 0, 0, S, S), 'floorboards', 1);
removeFloor(I, [[5, 5]], 1);
const upper = { '2,0': 'iwindow', '4,0': 'iwindow', '0,2': 'iwindow', '0,4': 'iwindow', '6,2': 'iwindow', '6,4': 'iwindow', '1,6': 'iwindow', '5,6': 'iwindow' };
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!x || !y || x === S - 1 || y === S - 1) put(I, upper[x + ',' + y] || 'iwall', x, y, 0, 1);
/* a timber partition: two bedrooms to the north, a doorway into each, the passage along the south */
for (let x = 1; x <= 5; x++) put(I, x === 2 || x === 4 ? 'idoor' : 'iwall', x, 3, 0, 1);
for (let y = 1; y <= 2; y++) put(I, 'iwall', 3, y, 0, 1);
/* the west room on a red carpet: a bed and a dresser; the east room on a blue one: a bed and a wardrobe; each keeps
   the tile inside its doorway clear */
paintTiles(I, rectTiles(I, 1, 1, 2, 2), 'carpet', 1); paintTiles(I, rectTiles(I, 4, 1, 2, 2), 'carpetblue', 1);
put(I, 'bed', 1, 1, 0, 1); put(I, 'dresser', 2, 1, 0, 1);
put(I, 'bed', 5, 1, 0, 1); put(I, 'wardrobe', 4, 1, 0, 1);
/* the passage, two tiles wide all along: a bench under the window and a candle stand at its west end */
put(I, 'bench', 1, 5, 2, 1); put(I, 'candelabra', 1, 4, 0, 1);

/* the people inside */
stand(I, 'merchant', 4, 1, 0);   /* the innkeeper behind the bar */
stand(I, 'healer', 4, 3, 2);     /* at the bar */
stand(I, 'monk', 2, 1, 2);       /* at the fire */
stand(I, 'farmer', 3, 3, 3);     /* by the long table */
stand(I, 'guard', 4, 4, 0);      /* by the stairs */
stand(I, 'noble', 2, 4, 0, 1);   /* a guest upstairs */

/* ---------- the lane outside ---------- */
const N = 14, M = blankModel(N, 'grass', 'Oakfield Lane');
const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < N && y < N) M.terr[y * N + x] = TI[t]; };
for (let x = 0; x < N; x++) for (const y of [5, 6]) set(x, y, 'cobble');
for (let y = 7; y < N; y++) set(9, y, 'dirt');
for (let y = 9; y < 13; y++) for (let x = 2; x < 7; x++) set(x, y, rnd() < 0.5 ? 'meadow' : 'grass');
const inn = put(M, 'tavern', 5, 4, 0);
inn.interior = I;
put(M, 'cottage', 2, 4, 0); put(M, 'townhouse', 9, 4, 0); put(M, 'cottage', 12, 4, 0);
put(M, 'barrels', 7, 4); put(M, 'crates', 4, 4); put(M, 'signpost', 8, 4);
put(M, 'well', 10, 8); put(M, 'lamppost', 4, 7); put(M, 'lamppost', 11, 7);
/* the garden to the south behind a fence, oaks, a bush and flowers */
for (let x = 1; x < 8; x++) if (x !== 4) put(M, 'fence', x, 8, 0);
for (const [x, y] of [[2, 11], [6, 12], [12, 11]]) put(M, 'oak', x, y);
for (const [x, y] of [[3, 10], [5, 10], [4, 12], [11, 10]]) put(M, 'flowers', x, y);
put(M, 'bush', 7, 10); put(M, 'beech', 13, 13); put(M, 'oak', 0, 1); put(M, 'birch', 7, 1); put(M, 'oak', 13, 0);
stand(M, 'villager', 6, 6, 2);

if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
writeFileSync(out, JSON.stringify(toJSON(M)));
console.log(`wrote ${out}: outside ${M.objs.length} pieces, ${M.chars.length} people; inside ${I.objs.length} pieces, ${I.chars.length} people`);
