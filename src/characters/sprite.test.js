import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FACES, FRAMES, SIZE, blankSprite, fillFrame, flipFrame, setPixel, shiftFrame, spriteFromJSON, spriteToJSON, starters } from './sprite.js';

test('a sprite survives a round trip through JSON', () => {
  const s = starters()[0], back = spriteFromJSON(JSON.parse(JSON.stringify(spriteToJSON(s))));
  assert.equal(back.name, s.name); assert.deepEqual(back.pal, s.pal);
  for (const f of FACES) for (let k = 0; k < FRAMES; k++) assert.deepEqual(back.frames[f][k], s.frames[f][k]);
});
test('a sprite keeps its eye colour through JSON, and a malformed one is dropped', () => {
  const s = starters()[0]; assert.match(s.iris, /^#[0-9a-f]{6}$/i);
  assert.equal(spriteFromJSON(JSON.parse(JSON.stringify(spriteToJSON(s)))).iris, s.iris);
  assert.equal(spriteFromJSON({ ...spriteToJSON(s), iris: 'blue' }).iris, undefined);
});
test('starter characters have art in every facing and frame', () => {
  for (const s of starters()) for (const f of FACES) for (let k = 0; k < FRAMES; k++) assert.ok(s.frames[f][k].some(Boolean), `${s.name} ${f} ${k}`);
});
test('pixels are clipped to the frame and report whether they changed', () => {
  const fr = blankSprite().frames.se[0];
  assert.equal(setPixel(fr, 3, 4, 2), 1); assert.equal(setPixel(fr, 3, 4, 2), 0); assert.equal(setPixel(fr, -1, 0, 1), 0); assert.equal(setPixel(fr, SIZE, 0, 1), 0);
});
test('fill stops at colour borders', () => {
  const fr = blankSprite().frames.se[0]; for (let y = 0; y < SIZE; y++) fr[y * SIZE + 8] = 1;
  assert.equal(fillFrame(fr, 0, 0, 2), 8 * SIZE); assert.equal(fr[15], 0);
});
test('flip and shift move pixels', () => {
  const fr = blankSprite().frames.se[0]; fr[0] = 3;
  flipFrame(fr); assert.equal(fr[SIZE - 1], 3); assert.equal(fr[0], 0);
  shiftFrame(fr, -1, 1); assert.equal(fr[SIZE + SIZE - 2], 3);
  shiftFrame(fr, 0, SIZE); assert.ok(!fr.some(Boolean));
});
test('a damaged file is refused', () => {
  assert.throws(() => spriteFromJSON({ size: 8 }), /Not a Hexwright character/);
  assert.throws(() => spriteFromJSON({ size: SIZE, palette: ['red'], frames: {} }), /colours/);
});
test('16×16 characters from the first release are doubled to the current size', () => {
  const old = '1' + '0'.repeat(15) + '0'.repeat(16 * 15), frames = {}; for (const f of FACES) frames[f] = [old, old];
  const s = spriteFromJSON({ id: 'old', name: 'Old', size: 16, palette: ['#112233'], frames }), fr = s.frames.se[0];
  assert.equal(SIZE, 32); assert.equal(fr.length, SIZE * SIZE);
  assert.deepEqual([fr[0], fr[1], fr[SIZE], fr[SIZE + 1], fr[2]], [1, 1, 1, 1, 0]);
});
