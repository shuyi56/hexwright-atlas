/* ================= character sprites: pure data =================
   A sprite is a 16×16 pixel picture in four facings (as the tile editor turns them: sw se ne nw), each
   with two frames (standing, mid-stride). Pixels are 0 (clear) or 1 + an index into the sprite's own
   palette. No DOM here, so the sprite editor, the tile editor and the tests all share it. */
const SIZE = 16, FACES = ['sw', 'se', 'ne', 'nw'], FRAMES = 2, MAX_PAL = 35;
const FACE_LABEL = { sw: 'Front left', se: 'Front right', ne: 'Back right', nw: 'Back left' };
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
/* the tile set's own colours: ink, skin, timber, thatch, roof tiles, slate, plaster, foliage, stone */
const DEFAULT_PAL = ['#2b2116', '#e8c49a', '#c99a6e', '#5a3f28', '#7a5a3a', '#d9b860', '#bf9850', '#a6533b', '#7c3a2a', '#66727e', '#48525c', '#4f6f8f', '#efe3c4', '#d3c199', '#87a05a', '#637d43', '#ddd1b0', '#9aa3a6', '#7a6a8a', '#c9a24f'];

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

/* ---------- starter characters, built from parts ----------
   The art stays flat: the renderer (draw.js) adds the ink outline, the lit-left/shaded-right
   rounding and the paper grain that the tile pieces have, so plain areas of colour are what read best. */
function figure(name, id, c) {
  const pal = [], K = {}; for (const [k, v] of Object.entries(c.col)) { let i = pal.indexOf(v); if (i < 0) { pal.push(v); i = pal.length - 1; } K[k] = i + 1; }
  const s = blankSprite(name, id); s.pal = pal.concat(DEFAULT_PAL.filter(d => !pal.includes(d))).slice(0, MAX_PAL);
  const make = (back, step) => {
    const fr = blankFrame(), r = (x, y, w, h, v) => { if (v) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) fr[j * SIZE + i] = v; };
    /* legs and feet */
    if (c.robe) { r(5, 6, 6, 8, K.top); r(4, 12, 8, 2, K.top); if (step) { r(5, 14, 2, 1, K.boots); r(9, 14, 2, 1, K.boots); r(9, 15, 2, 1, K.boots); } else { r(5, 14, 6, 1, K.top); r(6, 15, 2, 1, K.boots); r(8, 15, 2, 1, K.boots); } }
    else if (step) { r(5, 12, 2, 2, K.legs); r(4, 14, 3, 1, K.boots); r(9, 12, 2, 3, K.legs2); r(9, 15, 2, 1, K.boots); }
    else { r(6, 12, 2, 3, K.legs); r(8, 12, 2, 3, K.legs2); r(6, 15, 2, 1, K.boots); r(8, 15, 2, 1, K.boots); }
    /* body, belt, arms swinging opposite the legs */
    r(5, 6, 6, 6, K.top); r(5, 10, 6, 1, K.belt);
    const la = step ? 1 : 0, ra = step ? -1 : 0;
    r(4, 6 + la, 1, 4, K.sleeve); r(4, 10 + la, 1, 1, K.skin); r(11, 6, 1, 4 + ra + 1, K.sleeve); r(11, 10 + ra + 1, 1, 1, K.skin);
    if (c.cape && back) r(5, 6, 6, 7, K.cape);
    /* head */
    r(6, 2, 4, 4, K.skin);
    if (back) r(5, 1, 6, 4, K.hair), r(6, 5, 4, 1, K.hair); else { r(6, 1, 4, 1, K.hair); r(5, 2, 6, 1, K.hair); r(5, 3, 1, 1, K.hair); r(10, 3, 1, 2, K.hair); r(7, 4, 1, 1, K.eye); r(9, 4, 1, 1, K.eye); }
    if (c.hair === 'long') r(5, 3, 1, 3, K.hair), r(10, 3, 1, 3, K.hair);
    if (c.hat === 'straw') { r(6, 0, 4, 2, K.hat); r(3, 2, 10, 1, K.hat); }
    if (c.hat === 'helm') { r(5, 0, 6, 3, K.hat); if (!back) r(8, 3, 1, 1, K.hat); }
    if (c.hat === 'hood') { r(5, 0, 6, 2, K.hat); r(5, 2, 1, 4, K.hat); r(10, 2, 1, 4, K.hat); if (back) r(5, 2, 6, 4, K.hat); }
    return fr;
  };
  for (let k = 0; k < FRAMES; k++) { s.frames.se[k] = make(false, k); s.frames.ne[k] = make(true, k); s.frames.sw[k] = flipFrame(s.frames.se[k].slice()); s.frames.nw[k] = flipFrame(s.frames.ne[k].slice()); }
  return s;
}
const SKIN = '#e8c49a', EYE = '#2b2116';
const starters = () => [
  figure('Villager', 'starter-villager', { col: { skin: SKIN, eye: EYE, hair: '#5a3f28', top: '#87a05a', sleeve: '#87a05a', belt: '#7a5a3a', legs: '#8c6d4b', legs2: '#8c6d4b', boots: '#4a3524' } }),
  figure('Farmer', 'starter-farmer', { hat: 'straw', col: { skin: SKIN, eye: EYE, hair: '#7a5a3a', hat: '#d9b860', top: '#efe3c4', sleeve: '#efe3c4', belt: '#a07a4a', legs: '#7a5a3a', legs2: '#7a5a3a', boots: '#4a3524' } }),
  figure('Guard', 'starter-guard', { hat: 'helm', cape: true, col: { skin: '#d9b088', eye: EYE, hair: '#3a2a1a', hat: '#9aa3a6', top: '#a6533b', sleeve: '#66727e', belt: '#4a3524', legs: '#48525c', legs2: '#48525c', boots: '#2f271f', cape: '#7c3a2a' } }),
  figure('Merchant', 'starter-merchant', { robe: true, col: { skin: SKIN, eye: EYE, hair: '#d3c199', top: '#4f6f8f', sleeve: '#4f6f8f', belt: '#c9a24f', boots: '#5a3f28' } }),
  figure('Monk', 'starter-monk', { robe: true, hat: 'hood', col: { skin: '#d9b088', eye: EYE, hair: '#5a3f28', hat: '#7a5a3a', top: '#7a5a3a', sleeve: '#7a5a3a', belt: '#d3c199', boots: '#4a3524' } }),
  figure('Healer', 'starter-healer', { hair: 'long', col: { skin: SKIN, eye: EYE, hair: '#bf9850', top: '#7a6a8a', sleeve: '#efe3c4', belt: '#c9a24f', legs: '#5a4a62', legs2: '#5a4a62', boots: '#4a3524' } })
];

export { DEFAULT_PAL, FACES, FACE_LABEL, FRAMES, MAX_PAL, SIZE, blankFrame, blankSprite, cloneSprite, fillFrame, flipFrame, inFrame, isBlank, newId, setPixel, shiftFrame, spriteFromJSON, spriteToJSON, starters };
