/* ================= character sprites: pure data =================
   A sprite is a 16×16 pixel picture in four facings (as the tile editor turns them: sw se ne nw), each
   with two frames (standing, mid-stride). Pixels are 0 (clear) or 1 + an index into the sprite's own
   palette. No DOM here, so the sprite editor, the tile editor and the tests all share it. */
const SIZE = 16, FACES = ['sw', 'se', 'ne', 'nw'], FRAMES = 2, MAX_PAL = 35;
const FACE_LABEL = { sw: 'Front left', se: 'Front right', ne: 'Back right', nw: 'Back left' };
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const DEFAULT_PAL = ['#2b2116', '#f2d2b0', '#c99a6e', '#6b4a2b', '#d9b24a', '#9a3b2e', '#d9644a', '#3f6b99', '#6f9bc8', '#4a7a3a', '#8fb35c', '#7a7a80', '#c9c9c9', '#f4eede', '#5b3a6b', '#8b5a2b'];

const blankFrame = () => new Uint8Array(SIZE * SIZE);
function blankSprite(name = 'New character', id = newId()) {
  const frames = {}; for (const f of FACES) frames[f] = Array.from({ length: FRAMES }, blankFrame);
  return { id, name, pal: DEFAULT_PAL.slice(), frames, rev: 0 };
}
const newId = () => 'c' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
function cloneSprite(s, keepId = true) {
  const frames = {}; for (const f of FACES) frames[f] = s.frames[f].map(a => a.slice());
  return { id: keepId ? s.id : newId(), name: s.name, pal: s.pal.slice(), frames, rev: s.rev || 0 };
}

/* ---------- pixel operations: each works on one frame and returns the number of pixels changed ---------- */
const inFrame = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
function setPixel(fr, x, y, v) { if (!inFrame(x, y) || fr[y * SIZE + x] === v) return 0; fr[y * SIZE + x] = v; return 1; }
function fillFrame(fr, x, y, v) {
  if (!inFrame(x, y)) return 0; const t = fr[y * SIZE + x]; if (t === v) return 0;
  const q = [y * SIZE + x]; let n = 0;
  while (q.length) {
    const u = q.pop(); if (fr[u] !== t) continue; fr[u] = v; n++; const ux = u % SIZE, uy = (u / SIZE) | 0;
    if (ux > 0) q.push(u - 1); if (ux < SIZE - 1) q.push(u + 1); if (uy > 0) q.push(u - SIZE); if (uy < SIZE - 1) q.push(u + SIZE);
  }
  return n;
}
function flipFrame(fr) { const o = fr.slice(); for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) fr[y * SIZE + x] = o[y * SIZE + SIZE - 1 - x]; return fr; }
function shiftFrame(fr, dx, dy) { const o = fr.slice(); fr.fill(0); for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const xx = x + dx, yy = y + dy; if (inFrame(xx, yy)) fr[yy * SIZE + xx] = o[y * SIZE + x]; } return fr; }
const isBlank = fr => !fr.some(Boolean);

/* ---------- JSON form: frames as 256-character strings, '0' clear, then 1-9 a-z for palette entries ---------- */
const encodeFrame = fr => Array.from(fr, v => DIGITS[v]).join('');
function decodeFrame(str, palN) {
  const fr = blankFrame(); if (typeof str !== 'string') return fr;
  for (let u = 0; u < SIZE * SIZE && u < str.length; u++) { const v = DIGITS.indexOf(str[u]); fr[u] = v > 0 && v <= palN ? v : 0; }
  return fr;
}
function spriteToJSON(s) {
  const frames = {}; for (const f of FACES) frames[f] = s.frames[f].map(encodeFrame);
  return { id: s.id, name: s.name, size: SIZE, palette: s.pal.slice(), frames };
}
function spriteFromJSON(J) {
  if (!J || typeof J !== 'object' || J.size !== SIZE || !Array.isArray(J.palette) || !J.frames) throw new Error('Not a Hexwright character');
  const pal = J.palette.filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).slice(0, MAX_PAL);
  if (pal.length !== J.palette.length) throw new Error('Character palette must be #rrggbb colours');
  const s = blankSprite(String(J.name || 'Character').slice(0, 40), String(J.id || newId()).slice(0, 40)); s.pal = pal;
  for (const f of FACES) for (let k = 0; k < FRAMES; k++) s.frames[f][k] = decodeFrame(J.frames[f] && J.frames[f][k], pal.length);
  return s;
}

/* ---------- starter characters, drawn from rectangles ---------- */
function person(name, c) {
  const s = blankSprite(name), pal = [c.outline, c.skin, c.skinShade, c.hair, c.shirt, c.shirtShade, c.pants, c.boots, c.accent];
  s.pal = pal.concat(DEFAULT_PAL.filter(d => !pal.includes(d))).slice(0, MAX_PAL);
  const K = { o: 1, skin: 2, sh: 3, hair: 4, shirt: 5, shs: 6, pants: 7, boots: 8, acc: 9 };
  const make = (back, step) => {
    const fr = blankFrame(), r = (x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) fr[j * SIZE + i] = v; };
    r(5, 1, 6, 1, K.hair); r(4, 2, 8, 3, K.hair);
    if (back) r(4, 5, 8, 2, K.hair); else { r(5, 5, 6, 2, K.skin); r(6, 5, 1, 1, K.o); r(9, 5, 1, 1, K.o); }
    if (!back) r(4, 5, 1, 1, K.hair), r(11, 5, 1, 1, K.hair);
    r(4, 7, 8, 5, K.shirt); r(4, 7, 8, 1, K.shs); r(3, 8, 1, 3, K.shirt); r(12, 8, 1, 3, K.shirt); r(3, 11, 1, 1, K.skin); r(12, 11, 1, 1, K.skin); r(4, 11, 8, 1, K.acc);
    if (step) { r(5, 12, 3, 2, K.pants); r(5, 14, 3, 1, K.boots); r(8, 12, 3, 2, K.pants); r(8, 14, 3, 1, K.pants); r(8, 13, 3, 1, K.boots); }
    else { r(5, 12, 3, 3, K.pants); r(8, 12, 3, 3, K.pants); r(5, 15, 3, 1, K.boots); r(8, 15, 3, 1, K.boots); }
    return fr;
  };
  for (let k = 0; k < FRAMES; k++) {
    s.frames.se[k] = make(false, k); s.frames.ne[k] = make(true, k); s.frames.sw[k] = flipFrame(s.frames.se[k].slice()); s.frames.nw[k] = flipFrame(s.frames.ne[k].slice());
  }
  return s;
}
const starters = () => [
  Object.assign(person('Villager', { outline: '#2b2116', skin: '#f2d2b0', skinShade: '#c99a6e', hair: '#6b4a2b', shirt: '#6f9bc8', shirtShade: '#3f6b99', pants: '#8b5a2b', boots: '#3a2a1a', accent: '#d9b24a' }), { id: 'starter-villager' }),
  Object.assign(person('Guard', { outline: '#2b2116', skin: '#c99a6e', skinShade: '#a87a50', hair: '#3a2a1a', shirt: '#9a3b2e', shirtShade: '#6b2a20', pants: '#4a4a52', boots: '#2b2116', accent: '#c9c9c9' }), { id: 'starter-guard' }),
  Object.assign(person('Merchant', { outline: '#2b2116', skin: '#f2d2b0', skinShade: '#c99a6e', hair: '#c9c9c9', shirt: '#5b3a6b', shirtShade: '#3f2a4a', pants: '#3a2a1a', boots: '#2b2116', accent: '#d9b24a' }), { id: 'starter-merchant' })
];

export { DEFAULT_PAL, FACES, FACE_LABEL, FRAMES, MAX_PAL, SIZE, blankFrame, blankSprite, cloneSprite, fillFrame, flipFrame, inFrame, isBlank, newId, setPixel, shiftFrame, spriteFromJSON, spriteToJSON, starters };
