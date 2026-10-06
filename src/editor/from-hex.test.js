import assert from 'node:assert/strict';
import { test } from 'node:test';

/* world generation reads an optional debug override from window */
globalThis.window ??= {};
const { generate } = await import('../world/generate.js');
const { generateCity } = await import('../city/generate.js');
const { HEX_TILES, hexToModel } = await import('./from-hex.js');
const { cityToModel, districtToModel } = await import('./from-city.js');
const { MAX_ELEV, toJSON } = await import('./model.js');
const { ASSET_BY_ID, TERRAIN, footprint } = await import('../tiles/index.js');

const map = generate('ember-1147');

/* every piece inside the map, on its own tiles, boats on water and everything else on dry ground */
function assertSound(M, label) {
  assert.equal(M.terr.length, M.S * M.S, label);
  for (let u = 0; u < M.S * M.S; u++) { assert.ok(TERRAIN[M.terr[u]], `${label}: terrain at ${u}`); assert.ok(M.elev[u] <= MAX_ELEV, `${label}: height at ${u}`); }
  const taken = new Int32Array(M.S * M.S).fill(-1);
  M.objs.forEach((o, k) => {
    const [w, d] = footprint(o), a = ASSET_BY_ID[o.id];
    assert.ok(a, `${label}: asset ${o.id}`);
    assert.ok(o.x >= 0 && o.y >= 0 && o.x + w <= M.S && o.y + d <= M.S, `${label}: ${o.id} at ${o.x},${o.y} leaves the map`);
    for (let y = o.y; y < o.y + d; y++) for (let x = o.x; x < o.x + w; x++) {
      const u = y * M.S + x; assert.equal(taken[u], -1, `${label}: ${o.id} overlaps piece ${taken[u]}`); taken[u] = k;
      assert.equal(!!TERRAIN[M.terr[u]].water, !!a.water, `${label}: ${o.id} on the wrong ground`);
    }
  });
}

test('every hex of a realm becomes a sound tile map', () => {
  for (let i = 0; i < map.B.length; i++) assertSound(hexToModel(map, i), `hex ${i} (${map.B[i]})`);
});

test('the same hex always gives the same tiles', () => {
  const i = map.settle.find(s => s.kind === 'town').i;
  assert.deepEqual(toJSON(hexToModel(map, i)), toJSON(hexToModel(map, i)));
  assert.equal(hexToModel(map, i).S, HEX_TILES);
});

test('hex maps carry the realm into them', () => {
  const town = map.settle.find(s => s.kind === 'town'), T = hexToModel(map, town.i);
  assert.ok(T.name.startsWith(town.name));
  assert.ok(T.objs.filter(o => ['cottage', 'townhouse', 'longhouse', 'tavern', 'markethall', 'chapel', 'smithy', 'dovecote'].includes(o.id)).length >= 8, 'a town has houses');
  const riv = map.riverOf.findIndex((r, i) => r >= 0 && map.sAt[i] < 0 && !map.onRoad[i]);
  assert.ok(hexToModel(map, riv).terr.some(t => TERRAIN[t].id === 'water'), 'a river hex has water');
  const sea = map.B.indexOf('deep');
  assert.ok(hexToModel(map, sea).terr.every(t => TERRAIN[t].water || ['sand', 'shingle', 'grass', 'meadow'].includes(TERRAIN[t].id)));
});

test('a city district crops to a sound square around it', () => {
  const s = map.settle.find(x => x.kind === 'capital'), C = generateCity(map, s), whole = cityToModel(C);
  for (const D of C.districts.filter(d => d.tiles > 0)) {
    const M = districtToModel(C, D.id, whole);
    assert.ok(M && M.S >= 12 && M.S <= C.S, D.name);
    assert.ok(M.name.startsWith(D.name));
    assertSound(M, D.name);
  }
});

test('a converted city keeps its walls, slate houses and churches', () => {
  const ids = s => { const C = generateCity(map, s), M = cityToModel(C); assertSound(M, s.name); return M.objs.reduce((n, o) => (n[o.id] = (n[o.id] || 0) + 1, n), {}); };
  const cap = ids(map.settle.find(x => x.kind === 'capital'));
  assert.ok(cap.wall > 40, `wall pieces: ${cap.wall}`); assert.ok(cap.walltower >= 4, 'towers'); assert.ok(cap.gatehouse >= 1, 'gatehouse');
  assert.ok((cap.slatehouse || 0) + (cap.stonehouse || 0) + (cap.mansion || 0) > 0, 'slate-roofed houses');
  assert.ok(cap.keep, 'the castle');
  /* every great church the city plan records stands in the tiles */
  for (const s of map.settle.filter(x => ['capital', 'city', 'temple'].includes(x.kind))) {
    const C = generateCity(map, s), n = ids(s), churches = (n.cathedral || 0) + (n.church || 0);
    assert.equal(churches, C.complexes.length, `${s.name}: ${churches} of ${C.complexes.length} churches`);
  }
});

test('wall pieces join to their neighbours', async () => {
  const { linkWalls } = await import('../tiles/index.js');
  const objs = linkWalls([{ id: 'wall', x: 1, y: 1 }, { id: 'wall', x: 2, y: 1 }, { id: 'walltower', x: 1, y: 2 }, { id: 'gatehouse', x: 3, y: 0, face: 1 }, { id: 'wall', x: 4, y: 1 }]);
  assert.deepEqual(objs[0].links, [1, 1, 0, 0]);
  assert.deepEqual(objs[1].links, [0, 0, 1, 0], 'a gatehouse running north-south does not join a wall beside it');
  assert.deepEqual(objs[2].links, [0, 0, 0, 1]);
});
