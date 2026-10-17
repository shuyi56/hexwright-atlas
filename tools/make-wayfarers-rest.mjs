#!/usr/bin/env node
/* ================= the Wayfarer's Rest scene =================
   node tools/make-wayfarers-rest.mjs [out.json]
   Builds scenes/town/wayfarers-rest.json by hand: a village inn with a fully furnished interior (editor/interiors.js)
   on a cobbled lane. The scene opens inside it (town.inside in its .scene.json).
   A tavern's common room, 9 tiles square (seven of floor inside the walls), and an upper floor of guest rooms:
   - Downstairs: an aisle of oak boards runs from the door to the back wall. West of it the fireside: a stone
     fireplace with firewood beside it, two tables with their chairs on a red rug before it, two more tables below
     them, and a long table between benches with a table beside it. In the north-east the bar: a counter of joined bar
     pieces running from the east wall and turning north at its west end to meet the back wall, stools along it, and
     behind it, closed in, the innkeeper's lane with the back bar of bottles against the back wall and a rack of ale
     casks in the corner. South
     of the bar two tables and a long table by the stairs; by the door a coat stand, a notice board, grain sacks and
     barrels; on the walls antlers, a shelf of plates and a candle sconce. The stairs stand in the south-east corner,
     stepped onto at their right-hand end and climbing west.
   - Upstairs (floor 1), walled and windowed like the room below: two guest rooms through doorways in a timber
     partition (two beds in the east one), a passage along the south with a bench, a candle stand, a chest and a
     plant, sconces and a shield on the partition, and the open stairwell in the south-east corner.
   - The people: the innkeeper behind the bar (talked to across the counter), a healer and a guard at it, a monk at the fire, a farmer and a
     villager at the tables, and a noble guest upstairs.
   Two shops stand on the lane either side of the inn, each furnished inside:
   - The smithy, east of the inn, a stone-floored workshop two tiles across: the forge in the back corner with its
     bellows, coal and bar iron beside it and a quenching trough under a rail of hammers and tongs, the anvil before it
     and the smith at its side; a grindstone on the west wall, and a weapon rack and an armour stand of finished work
     on the east wall by the door.
   - The alchemist's shop, west of the inn, three tiles across on a dark oak floor with a blue runner: two workbenches
     of apparatus against the back wall beside shelves of potions, herbs drying on the wall, a cabinet of apothecary
     drawers and a herb rack on the west wall, a bubbling cauldron, the alchemist before the benches, and stairs in
     the corner up to a study: a bed, a chest under the star chart, a bookshelf, a desk and more potions.
   Outside, cottages and a townhouse stand on the lane with the shops and the inn, with a well, lamp posts, a
   signpost, barrels, crates and a log pile, a garden with oaks, a bush and flowers to the south, and the hero on the
   lane. Deterministic: the same map every time. */
import { writeFileSync } from 'node:fs';
import { blankModel, TI, toJSON } from '../src/editor/model.ts';
import { paintTiles, placePiece, rectTiles, removeFloor } from '../src/editor/ops.js';
import { placeChar } from '../src/editor/walk.js';

const out = process.argv[2] || 'scenes/town/wayfarers-rest.json', fail = [];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const put = (M, id, x, y, face = 0, level = 0) => { const r = placePiece(M, { id, x, y, face, v: rnd(), ...(level ? { level } : {}) }); if (!r.ok) fail.push(`${M.name}: ${id}@${x},${y}${level ? ' L' + level : ''}: ${r.reason}`); return r.piece; };
const stand = (M, sprite, x, y, face = 0, level = 0) => { const r = placeChar(M, { sprite, x, y, face, ...(level ? { level } : {}) }); if (!r.ok) fail.push(`${M.name}: ${sprite}@${x},${y}: ${r.reason}`); };

/* ---------- the inn's interior: 9 tiles square (seven of floor inside the walls), the door in the middle of the south wall ---------- */
const S = 9, I = blankModel(S, 'oakfloor', 'The Wayfarer\'s Rest');
/* the outer walls: the fireplace in the back wall between a shelf of plates, a sconce and antlers, the back bar against
   the wall behind the counter, windows round about, the door at 4,8 */
const special = {
  '1,0': 'wallshelf', '2,0': 'wallsconce', '3,0': 'hearth', '4,0': 'wallantlers', '5,0': 'wallbar', '6,0': 'wallbar',
  '0,3': 'iwindow', '0,6': 'iwindow', '8,4': 'iwindow', '8,6': 'iwindow', '2,8': 'iwindow', '6,8': 'iwindow', '4,8': 'idoor'
};
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!x || !y || x === S - 1 || y === S - 1) put(I, special[x + ',' + y] || 'iwall', x, y);
/* the fireside, west of the aisle (x = 4): a red rug before the fire with two tables on it, a candle stand and firewood
   by the hearth; two more tables below, and a long table between benches with a table beside it */
paintTiles(I, rectTiles(I, 1, 1, 3, 2), 'carpet');
put(I, 'candelabra', 1, 1); put(I, 'firewood', 2, 1);
put(I, 'tableset', 1, 2, 0); put(I, 'tableset', 3, 2, 1);
put(I, 'tableset', 1, 4, 2); put(I, 'tableset', 3, 4, 3);
put(I, 'feastset', 1, 6, 0); put(I, 'tableset', 3, 6, 1);
/* the bar, east of the aisle: a counter across the room (its customers to the south, stools along it) running from the
   east wall, and a side counter at its west end (5,1), facing the aisle, running back to the back bar, closing in the
   innkeeper's lane behind it with the back bar against the back wall and a rack of casks in the corner */
for (const x of [5, 6, 7]) put(I, 'bar', x, 2, 0);
put(I, 'bar', 5, 1, 3);
put(I, 'casks', 7, 1, 0);
/* south of the bar two tables, and a long table by the stairs */
put(I, 'tableset', 5, 4, 0); put(I, 'tableset', 7, 4, 1); put(I, 'feastset', 5, 6, 0);
/* by the door: sacks, barrels and a coat stand along the south wall west of it, a notice board east of it */
put(I, 'sacks', 1, 7); put(I, 'barrels', 2, 7); put(I, 'coatrack', 3, 7); put(I, 'noticeboard', 5, 7, 0);
/* the stairs in the south-east corner, against the south wall with their foot at the east wall: stepped onto at the
   right-hand end, from the corner, and climbing west to the landing on floor 1 */
put(I, 'stairs', 7, 7, 1);

/* upstairs: floor out to the walls but the stairwell over the flight, and the outer walls again with their windows */
paintTiles(I, rectTiles(I, 0, 0, S, S), 'floorboards', 1);
removeFloor(I, [[7, 7]], 1);
const upper = { '2,0': 'iwindow', '6,0': 'iwindow', '0,2': 'iwindow', '0,6': 'iwindow', '8,2': 'iwindow', '8,6': 'iwindow', '2,8': 'iwindow', '6,8': 'iwindow' };
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!x || !y || x === S - 1 || y === S - 1) put(I, upper[x + ',' + y] || 'iwall', x, y, 0, 1);
/* a timber partition along y = 4 with a doorway into each of two rooms, sconces and a shield on its passage side, and a
   wall between the rooms */
const partition = { 2: 'idoor', 6: 'idoor', 3: 'wallsconce', 4: 'wallshield', 5: 'wallsconce' };
for (let x = 1; x <= 7; x++) put(I, partition[x] || 'iwall', x, 4, 0, 1);
for (let y = 1; y <= 3; y++) put(I, 'iwall', 4, y, 0, 1);
/* the west room on a red carpet: a bed, a dresser, a chest and a wardrobe; the east one on a blue carpet: two beds
   with a writing desk between them and a wardrobe. Each keeps the tile inside its doorway clear */
paintTiles(I, rectTiles(I, 1, 1, 3, 3), 'carpet', 1); paintTiles(I, rectTiles(I, 5, 1, 3, 3), 'carpetblue', 1);
put(I, 'bed', 1, 1, 0, 1); put(I, 'dresser', 2, 1, 0, 1); put(I, 'chest', 3, 1, 0, 1); put(I, 'wardrobe', 3, 3, 0, 1);
put(I, 'bed', 5, 1, 0, 1); put(I, 'desk', 6, 1, 0, 1); put(I, 'bed', 7, 1, 0, 1); put(I, 'wardrobe', 7, 3, 0, 1); put(I, 'chest', 5, 3, 0, 1);
/* the passage: a candle stand and a chest at its west end, a bench under the window, a plant */
put(I, 'candelabra', 1, 5, 0, 1); put(I, 'chest', 1, 7, 0, 1); put(I, 'bench', 2, 7, 2, 1); put(I, 'plantpot', 5, 7, 0, 1);

/* the people inside */
stand(I, 'merchant', 6, 1, 0);   /* the innkeeper behind the bar, talked to across it */
stand(I, 'healer', 5, 3, 2);     /* at the bar */
stand(I, 'guard', 6, 3, 2);      /* at the bar */
stand(I, 'monk', 3, 1, 2);       /* at the fire */
stand(I, 'farmer', 2, 3, 0);     /* among the tables */
stand(I, 'villager', 2, 5, 2);   /* by the long table */
stand(I, 'noble', 4, 6, 0, 1);   /* a guest upstairs */

/* ---------- the shops' interiors ---------- */
/* the outer walls of room R (side S) on floor L: the special pieces by 'x,y', interior wall elsewhere */
const shell = (R, S, special, L = 0) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!x || !y || x === S - 1 || y === S - 1) put(R, special[x + ',' + y] || 'iwall', x, y, 0, L); };

/* the smithy: 4 tiles square (two of stone floor inside the walls, a workshop about six paces across), the door at the
   east end of the south wall. The hot work round the forge in the west, the finished work by the door in the east:
   - the forge in the back corner, coal and bar iron against the west wall beside its bellows, the quenching trough
     against the back wall at its side under a rail of hammers and tongs, and the anvil before it, the smith between
     the anvil and the trough;
   - the grindstone against the west wall by the anvil, for the edges;
   - against the east wall, by the door where customers come in, a weapon rack and an armour stand of finished work.
   The pieces against the walls stand on the walls' own tiles, in front of them (tiles/index.js standsOnWall). */
const SM = 4, H = blankModel(SM, 'stonefloor', 'The Smithy');
shell(H, SM, { '2,0': 'walltools', '1,3': 'iwindow', '2,3': 'idoor' });
put(H, 'forge', 1, 1, 0); put(H, 'anvil', 1, 2);
put(H, 'ironstock', 0, 1, 1); put(H, 'quench', 2, 0, 0); put(H, 'grindstone', 0, 2, 1);
put(H, 'weaponrack', 3, 1, 3); put(H, 'armorstand', 3, 2, 3);
stand(H, 'smith', 2, 1, 0);

/* the alchemist's shop: 5 tiles square on a dark oak floor with a blue runner, the stairs in the south-east corner up to
   a study */
const AS = 5, A = blankModel(AS, 'oakfloor', 'The Alchemist\'s Shop');
paintTiles(A, rectTiles(A, 2, 2, 1, 2), 'carpetblue');
/* herbs drying on the back wall, plain wall behind the benches, windows in the side walls and by the door */
shell(A, AS, { '1,0': 'wallherbs', '0,2': 'iwindow', '4,2': 'iwindow', '1,4': 'iwindow', '2,4': 'idoor' });
/* along the back: shelves of potions and two workbenches of apparatus */
put(A, 'potionshelf', 1, 1, 0); put(A, 'alchemybench', 2, 1, 0); put(A, 'alchemybench', 3, 1, 0);
/* the apothecary's drawers and a herb rack against the west wall, the cauldron bubbling on the east side, and the stairs
   in the corner, stepped onto from the doorway and climbing west */
put(A, 'apothecary', 1, 2, 1); put(A, 'herbrack', 1, 3, 1); put(A, 'brewcauldron', 3, 2);
put(A, 'stairs', 3, 3, 1);
/* upstairs, the alchemist's study: floor out to the walls but the stairwell, the walls again with a star chart */
paintTiles(A, rectTiles(A, 0, 0, AS, AS), 'floorboards', 1);
removeFloor(A, [[3, 3]], 1);
shell(A, AS, { '2,0': 'wallchart', '3,0': 'iwindow', '0,2': 'iwindow', '4,2': 'iwindow', '1,4': 'iwindow' }, 1);
paintTiles(A, rectTiles(A, 2, 2, 1, 2), 'carpetblue', 1);
put(A, 'bed', 1, 1, 0, 1); put(A, 'chest', 2, 1, 0, 1); put(A, 'bookshelf', 3, 1, 0, 1);
put(A, 'desk', 3, 2, 3, 1); put(A, 'potionshelf', 1, 3, 1, 1);
stand(A, 'alchemist', 2, 2, 0); /* before the benches, facing the shop */

/* ---------- the lane outside ---------- */
const N = 16, M = blankModel(N, 'grass', 'Oakfield Lane');
const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < N && y < N) M.terr[y * N + x] = TI[t]; };
for (let x = 0; x < N; x++) for (const y of [5, 6]) set(x, y, 'cobble');
for (let y = 7; y < N; y++) set(9, y, 'dirt');
for (let y = 9; y < 13; y++) for (let x = 2; x < 7; x++) set(x, y, rnd() < 0.5 ? 'meadow' : 'grass');
const inn = put(M, 'tavern', 5, 4, 0);
inn.interior = I;
/* the alchemist's shop west of the inn, the smithy east of it with its log pile */
put(M, 'alchemist', 1, 4, 0).interior = A;
put(M, 'blacksmith', 9, 4, 0).interior = H;
put(M, 'logpile', 11, 4, 0); put(M, 'townhouse', 12, 4, 0); put(M, 'cottage', 14, 4, 0);
put(M, 'barrels', 7, 4); put(M, 'crates', 4, 4); put(M, 'signpost', 8, 4); put(M, 'bush', 3, 4);
put(M, 'well', 10, 8); put(M, 'lamppost', 4, 7); put(M, 'lamppost', 11, 7);
/* the garden to the south behind a fence, oaks, a bush and flowers */
for (let x = 1; x < 8; x++) if (x !== 4) put(M, 'fence', x, 8, 0);
for (const [x, y] of [[2, 11], [6, 12], [12, 11]]) put(M, 'oak', x, y);
for (const [x, y] of [[3, 10], [5, 10], [4, 12], [11, 10]]) put(M, 'flowers', x, y);
put(M, 'bush', 7, 10); put(M, 'beech', 13, 13); put(M, 'oak', 0, 1); put(M, 'birch', 7, 1); put(M, 'oak', 13, 0);
put(M, 'oak', 15, 10); put(M, 'birch', 14, 15); put(M, 'flowers', 13, 9); put(M, 'pine', 15, 2);
stand(M, 'villager', 6, 6, 2);
stand(M, 'farmer', 11, 6, 3);

if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
writeFileSync(out, JSON.stringify(toJSON(M)));
console.log(`wrote ${out}: outside ${M.objs.length} pieces, ${M.chars.length} people; inside the inn ${I.objs.length} pieces, ${I.chars.length} people; the smithy ${H.objs.length} and ${H.chars.length}; the alchemist's ${A.objs.length} and ${A.chars.length}`);
