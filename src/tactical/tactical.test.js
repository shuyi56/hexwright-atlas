import assert from 'node:assert/strict';
import test from 'node:test';
import { TI, blankModel } from '../editor/model.js';
import { placeChar } from '../editor/walk.js';
import { TERRAIN } from '../tiles/terrain.js';
import { MOVE, moveRange, placeId, routeTo } from './move.js';
import { P, buildScene, liftOf, pickTile, withFigures } from './scene.js';
import { buildAtlas, buildSheet } from './sheet.js';
import { ANIMATED, FRAMES, PAD, TH, TW, VARIANTS, bottomOf, inDiamond, sideFace, topTile } from './tiles.js';

const alpha = (im, x, y) => im.px[(y * im.w + x) * 4 + 3];

test('the diamond tiles the plane with no gap and no overlap', () => {
  const hits = new Map();
  for (let ty = -2; ty <= 2; ty++) for (let tx = -2; tx <= 2; tx++) {
    const [ox, oy] = P(tx, ty);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (inDiamond(x, y)) { const k = `${ox - 16 + x},${oy + y}`; hits.set(k, (hits.get(k) || 0) + 1); }
  }
  for (let y = -8; y < 8; y++) for (let x = -16; x < 16; x++) assert.equal(hits.get(`${x},${y}`), 1, `pixel ${x},${y}`);
});

test('every ground draws four full variants, and the animated ones four frames', () => {
  for (const T of TERRAIN) for (let v = 0; v < VARIANTS; v++) {
    const im = topTile(T.id, v, 0);
    assert.equal(im.w, TW); assert.equal(im.h, TH + PAD);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (inDiamond(x, y)) assert.ok(alpha(im, x, y + PAD) === 255, `${T.id} v${v} hole at ${x},${y}`);
  }
  for (const id of ANIMATED) {
    const frames = Array.from({ length: FRAMES }, (_, f) => Buffer.from(topTile(id, 0, f).px).toString('base64'));
    assert.ok(new Set(frames).size > 1, `${id} moves`);
  }
  assert.equal(Buffer.compare(Buffer.from(topTile('grass', 1).px), Buffer.from(topTile('grass', 1).px)), 0, 'drawn the same every time');
});

test('a face fills the drop under its edge and meets the tile in front', () => {
  for (const id of ['grass', 'cobble', 'water', 'planks']) for (const side of [0, 1]) {
    const h = 13, im = sideFace(id, side, h, 8);
    assert.equal(im.w, 16); assert.equal(im.h, h + 8);
    for (let i = 0; i < 16; i++) {
      const x = side * 16 + i, b = bottomOf(x);
      for (let d = 0; d < h; d++) assert.ok(alpha(im, i, b + 1 + d - 8) === 255, `${id} side ${side} col ${x} depth ${d}`);
      /* the top of the tile below it (beside, or straight in front at the corner) starts right under the face */
      assert.ok(inDiamond(x + (side ? -16 : 16), b + 1 - 8) || inDiamond(x, b + 1 - 16), `col ${x}`);
    }
  }
});

test('the scene is ordered back to front, figures slot in after the tile they stand on', () => {
  const M = blankModel(6); M.elev[2 * 6 + 3] = 2; M.objs.push({ id: 'oak', x: 1, y: 1, face: 0, v: 0.4 });
  const sc = buildScene(M), keys = sc.items.map(it => it.key);
  assert.deepEqual(keys, keys.slice().sort((a, b) => a - b));
  const piece = sc.items.find(it => it.kind === 'piece'), tile = sc.items.findIndex(it => it.kind === 'tile' && it.u === 7);
  assert.ok(sc.items.indexOf(piece) > tile, 'the oak after its own tile');
  assert.ok(piece.lift > 1, 'pieces stand taller than on the editor map');
  const fig = { key: 1 + 1 + 1, lv: 0, pri: 2 }, out = withFigures(sc.items, [fig]);
  assert.ok(out.indexOf(fig) > out.indexOf(piece) && out[out.indexOf(fig) + 1].key > fig.key);
  /* the raised tile has cliff faces; the map's edge tiles drop to the base */
  const hill = sc.items.find(it => it.kind === 'tile' && it.u === 2 * 6 + 3);
  assert.equal(hill.draws.filter(d => d.s.k === 'face').length, 2);
  assert.equal(liftOf(10), 3); assert.ok(liftOf(90) * 90 > 100 && liftOf(90) < 2);
});

test('turning the view keeps each tile its drawing and picks the top under a point', () => {
  const M = blankModel(8, 'field');
  const v0 = buildScene(M, { rot: 0 }), v1 = buildScene(M, { rot: 1 });
  const at = (sc, t) => sc.items.find(it => it.kind === 'tile' && sc.back[it.u] === t).draws[0].s.v;
  for (const t of [0, 9, 27, 63]) assert.equal(at(v0, t) ^ 1, at(v1, t), 'a furrowed field keeps its furrows running the same way');
  M.elev[3 * 8 + 4] = 3; const sc = buildScene(M), [px, py] = P(4.5, 3.5, 24);
  assert.deepEqual(pickTile(sc, px, py), { u: 3 * 8 + 4, L: 0 });
  assert.equal(pickTile(sc, -500, -500), null);
});

test('a unit reaches MOVE steps, climbing one level a step', () => {
  const M = blankModel(12, 'grass');
  for (let x = 0; x < 12; x++) M.elev[3 * 12 + x] = 2; /* a two-level ridge it cannot climb */
  M.terr[6 * 12 + 7] = TI.water;
  placeChar(M, { sprite: 'knight', x: 6, y: 6, face: 0 });
  const range = moveRange(M, 0);
  for (const p of range.values()) { assert.ok(p.d <= MOVE); assert.ok(p.at[1] > 3, 'not over the ridge'); }
  assert.ok(!range.has(placeId(M, 7, 6, 0)), 'not into water');
  const path = routeTo(range, placeId(M, 6, 10, 0));
  assert.equal(path.length, 4); assert.deepEqual(path[path.length - 1], [6, 10, 0]);
  assert.equal(routeTo(range, placeId(M, 0, 11, 0)), null, 'too far');
});

test('the sheet and the atlas are drawn whole', () => {
  const s = buildSheet(2); assert.equal(s.rgba.length, s.width * s.height * 4);
  const a = buildAtlas(); assert.equal(Object.keys(a.rects).length, TERRAIN.length);
  assert.equal(a.rects.water.frames.length, FRAMES - 1); assert.equal(a.rects.grass.variants.length, VARIANTS);
});

test('every building, tree and plant has a design that draws whole in every facing', async () => {
  const { DESIGNS, pieceImage } = await import('./pieces.js');
  const { ASSET_BY_ID } = await import('../tiles/index.js');
  for (const id of Object.keys(DESIGNS)) {
    assert.ok(ASSET_BY_ID[id], `${id} is a tile-set piece`);
    for (const face of [0, 1, 2, 3]) for (const v of [0.1, 0.5, 0.9]) {
      const im = pieceImage({ id, x: 0, y: 0, face, v, links: id === 'wall' ? [1, 0, 0, 1] : null }, v > 0.8 ? 'arid' : 'temperate');
      assert.equal(im.clipped, 0, `${id} face ${face} v ${v} stays inside its image`);
      let solid = 0; for (let k = 3; k < im.px.length; k += 4) if (im.px[k] === 255) solid++;
      assert.ok(solid > 40, `${id} draws something`);
    }
  }
  for (const group of ['Buildings', 'Nature']) for (const a of Object.values(ASSET_BY_ID).filter(x => x.group === group)) assert.ok(DESIGNS[a.id], `${a.id} has a tactical design`);
  const a = pieceImage({ id: 'cottage', x: 0, y: 0, face: 0, v: 0.4 }), b = pieceImage({ id: 'cottage', x: 0, y: 0, face: 0, v: 0.4 });
  assert.equal(Buffer.compare(Buffer.from(a.px), Buffer.from(b.px)), 0, 'drawn the same every time');
});

test('the tactical figures are three quarters size, on the same ground line, with their faces intact', async () => {
  const { ROSTER, render, renderScaled } = await import('../characters/roster.js');
  const { BASE } = await import('../characters/body.js');
  const { FIGURE_SCALE } = await import('./scene.js');
  const rows = px => { let t = 99, b = -1; for (let u = 0; u < px.length / 4; u++) if (px[u * 4 + 3]) { const y = (u / 32) | 0; t = Math.min(t, y); b = Math.max(b, y); } return [t, b]; };
  for (const c of ROSTER) {
    const big = render(c).front[0], small = renderScaled(c, FIGURE_SCALE).front[0], [bt, bb] = rows(big), [st, sb] = rows(small);
    assert.ok(Math.abs(sb - bb) <= 1 && sb >= BASE, `${c.id} keeps its feet on the ground`);
    const k = (sb - st) / (bb - bt); assert.ok(k > 0.68 && k < 0.82, `${c.id} is ${k.toFixed(2)} of its height`);
  }
  /* the eyes survive the shrink: dark pixels in the face rows of a bare-headed figure */
  const v = renderScaled(ROSTER.find(c => c.id === 'villager'), FIGURE_SCALE).front[0];
  let dark = 0; for (let y = 14; y < 28; y++) for (let x = 6; x < 26; x++) { const u = (y * 32 + x) * 4; if (v[u + 3] && v[u] + v[u + 1] + v[u + 2] < 150) dark++; }
  assert.ok(dark >= 2, 'eyes');
});

test('cliffs and buildings cast shadows to the right and darken the ground at their feet', () => {
  const M = blankModel(9); M.elev[4 * 9 + 2] = 4; /* a pillar of rock four levels high */
  const sc = buildScene(M), at = (x, y) => sc.items.find(it => it.kind === 'tile' && it.u === y * 9 + x).light;
  assert.ok(at(3, 3).mask, 'the shadow falls to the right of the pillar (+x, -y)');
  assert.equal(at(1, 5).mask, 0, 'and not to its left');
  assert.equal(at(2, 4).mask, 0, 'its own top is in the light');
  assert.ok(at(3, 4).occ[0] > 0 && at(2, 5).occ[1] > 0, 'the ground at its foot is darker on the side that meets it');
  assert.ok(at(2, 4).elev > at(7, 7).elev, 'high ground reads lighter than low');
  M.objs.push({ id: 'townhouse', x: 6, y: 6, face: 0, v: 0.3 });
  assert.ok(buildScene(M).items.find(it => it.kind === 'tile' && it.u === 5 * 9 + 7).light.mask, 'a house throws a shadow too');
});

test('a figure beside a long piece is drawn on the right side of it, and what hides it is known', async () => {
  const { figureOrder } = await import('./scene.js');
  /* a church four tiles by two: its centre sorts at 7 */
  const M = blankModel(9); M.objs.push({ id: 'church', x: 1, y: 3, face: 0, v: 0.3 });
  const sc = buildScene(M);
  const fig = (x, y) => ({ key: x + y + 1, lv: 0, pri: 2, X: x + 0.5, Y: y + 0.5, z: 0, ground: 0, c: {}, k: 0 });
  /* behind the church (short of its -y edge) though it sorts with it */
  let list = withFigures(sc.items, [fig(4, 2)]), f = list.findIndex(it => it.c), b = list.findIndex(it => it.kind === 'piece');
  let { after, hiders } = figureOrder(list);
  assert.ok(f > b && (after.get(f) || []).includes(b), 'the church is drawn again after the figure behind it');
  assert.ok((hiders.get(f) || []).includes(b), 'and hides it');
  /* past its +y edge, though it sorts before the church */
  list = withFigures(sc.items, [fig(0, 5)]); f = list.findIndex(it => it.c); b = list.findIndex(it => it.kind === 'piece');
  ({ after, hiders } = figureOrder(list));
  assert.ok(f < b && (after.get(b) || []).includes(f), 'the figure is drawn again after the church');
  assert.ok(!(hiders.get(f) || []).includes(b), 'and the church does not hide it');
});

test('a shrunk face keeps both eyes as drawn: pupil and glint, apart, inside the face', async () => {
  const { ROSTER, frame } = await import('../characters/roster.js');
  const { BASE } = await import('../characters/body.js');
  const { shrink, W: FW, H: FH } = await import('../characters/pixels.js');
  const { FIGURE_SCALE } = await import('./scene.js');
  for (const c of ROSTER) {
    const src = frame(c, 'front', 0), n = m => src.mat.filter(v => v === m).length; if (!n('E')) continue;
    const b = shrink(src, FIGURE_SCALE, 16, BASE + 1), count = m => b.mat.filter(v => v === m).length;
    assert.equal(count('E'), n('E'), `${c.id}: every pupil pixel kept`);
    assert.equal(count('W'), n('W'), `${c.id}: the glints kept`);
    const xs = [...new Set(b.mat.map((v, u) => (v === 'E' ? u % FW : -1)).filter(x => x >= 0))].sort((p, q) => p - q);
    const gaps = xs.slice(1).map((x, k) => x - xs[k]);
    assert.ok(gaps.some(g => g >= 2), `${c.id}: skin between the eyes`);
    for (let u = 0; u < FW * FH; u++) if (b.mat[u] === 'E') assert.ok(b.mat[u - 1] && b.mat[u + 1], `${c.id}: an eye inside the face`);
  }
});

test('a shadow carries up the walls of a house it reaches, with a clean edge on the ground', () => {
  const M = blankModel(10);
  M.objs.push({ id: 'stonetower', x: 3, y: 6, face: 0, v: 0.3 }, { id: 'cottage', x: 4, y: 5, face: 0, v: 0.2 }, { id: 'cottage', x: 1, y: 8, face: 0, v: 0.2 });
  const sc = buildScene(M), piece = (x, y) => sc.items.find(it => it.kind === 'piece' && it.o.x === x && it.o.y === y);
  const shaded = piece(4, 5).shadow;
  assert.ok(shaded && Math.max(...shaded) >= 8, 'the cottage in the tower\'s shadow is darkened up its walls');
  assert.ok(!piece(1, 8).shadow, 'the cottage on the lit side is not');
  const tower = piece(3, 6).shadow;
  assert.ok(!tower || Math.max(...tower) < 40, 'a house on the lit side shades only the foot of the tower');
  /* a tile the shadow's edge crosses is worked out pixel by pixel */
  assert.ok(sc.items.some(it => it.kind === 'tile' && it.light && it.light.px && it.light.px().includes('1') && it.light.px().includes('0')), 'partly shaded tiles');
});

test('the ground under a piece of several tiles is drawn before the piece', () => {
  const M = blankModel(10); M.objs.push({ id: 'barn', x: 2, y: 7, face: 0, v: 0.3 }, { id: 'cathedral', x: 1, y: 1, face: 0, v: 0.3 });
  const sc = buildScene(M), at = it => sc.items.indexOf(it);
  for (const p of sc.items.filter(it => it.kind === 'piece')) {
    const [w, d] = [p.o.id === 'barn' ? 2 : 8, p.o.id === 'barn' ? 1 : 4];
    for (let y = p.o.y; y < p.o.y + d; y++) for (let x = p.o.x; x < p.o.x + w; x++) {
      const t = sc.items.find(it => it.kind === 'tile' && it.u === y * 10 + x); if (t) assert.ok(at(t) < at(p), `${p.o.id}: tile ${x},${y} before it`);
    }
  }
});
