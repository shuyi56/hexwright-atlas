/* ================= character sprites: pure data =================
   A sprite is a 32×32 pixel picture in four facings (as the tile editor turns them: sw se ne nw), each
   with two frames (standing, mid-stride). Pixels are 0 (clear) or 1 + an index into the sprite's own
   palette. No DOM here, so the sprite editor, the tile editor and the tests all share it. */
const SIZE = 32, OLD_SIZE = 16, FACES = ['sw', 'se', 'ne', 'nw'], FRAMES = 2, MAX_PAL = 35;
const FACE_LABEL = { sw: 'Front left', se: 'Front right', ne: 'Back right', nw: 'Back left' };
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
/* the tile set's own colours: ink, skin, timber, thatch, roof tiles, slate, plaster, foliage, stone */
const DEFAULT_PAL = ['#2b2116', '#e8c49a', '#d0a87e', '#7a5a3a', '#9a7a56', '#d9b860', '#c9a868', '#b8664a', '#9a4a38', '#8592a0', '#6f7a86', '#6f8faa', '#efe3c4', '#d3c199', '#9fb06a', '#87a05a', '#ddd1b0', '#b9bfc0', '#9a8aaa', '#c9a24f'];

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
/* a frame from the first, 16×16 release, doubled */
function grow(fr16) { const fr = blankFrame(); for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) fr[y * SIZE + x] = fr16[(y >> 1) * OLD_SIZE + (x >> 1)]; return fr; }
function decodeOld(str, palN) { const fr = new Uint8Array(OLD_SIZE * OLD_SIZE); if (typeof str === 'string') for (let u = 0; u < fr.length && u < str.length; u++) { const v = DIGITS.indexOf(str[u]); fr[u] = v > 0 && v <= palN ? v : 0; } return grow(fr); }
function spriteFromJSON(J) {
  if (!J || typeof J !== 'object' || (J.size !== SIZE && J.size !== OLD_SIZE) || !Array.isArray(J.palette) || !J.frames) throw new Error('Not a Hexwright character');
  const pal = J.palette.filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).slice(0, MAX_PAL);
  if (pal.length !== J.palette.length) throw new Error('Character palette must be #rrggbb colours');
  const s = blankSprite(String(J.name || 'Character').slice(0, 40), String(J.id || newId()).slice(0, 40)); s.pal = pal;
  const dec = J.size === OLD_SIZE ? decodeOld : decodeFrame;
  for (const f of FACES) for (let k = 0; k < FRAMES; k++) s.frames[f][k] = dec(J.frames[f] && J.frames[f][k], pal.length);
  return s;
}

/* ---------- starter characters, built from parts ----------
   The art stays flat: the renderer (draw.js) adds the one-pixel ink outline and the lit-left/shaded-right
   light bands. Front views look a little to the right
   (south-east); the left-facing views are mirror images. */
const darken = (hex, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
function figure(name, id, o) {
  const c = Object.assign({ skin: '#e8c49a', eye: '#2b2116', lip: '#8a5444', boots: '#7a5a3a', legs: '#9a7d5a', belt: '#7a5a3a', buckle: '#c9a24f', inner: '#efe3c4' }, o.col);
  c.skinD = darken(c.skin, 0.84); c.topD = darken(c.top, 0.82); c.sleeve = c.sleeve || c.top; c.sleeveD = darken(c.sleeve, 0.82); c.legsD = darken(c.legs, 0.84); c.bootsD = darken(c.boots, 0.8); c.hairD = darken(c.hair, 0.8);
  if (c.hat) c.hatD = darken(c.hat, 0.8); if (c.apron) c.apronD = darken(c.apron, 0.86); if (c.cape) c.capeD = darken(c.cape, 0.8);
  const pal = [], K = {};
  for (const [k, v] of Object.entries(c)) { let i = pal.indexOf(v); if (i < 0) { pal.push(v); i = pal.length - 1; } K[k] = i + 1; }
  const s = blankSprite(name, id); s.pal = pal.concat(DEFAULT_PAL.filter(d => !pal.includes(d))).slice(0, MAX_PAL);

  const make = (back, step) => {
    const fr = blankFrame();
    const r = (x, y, w, h, v) => { if (!v) return; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < SIZE && j < SIZE) fr[j * SIZE + i] = v; };
    const p = (x, y, v) => r(x, y, 1, 1, v);
    /* stride: the viewer-left leg steps forward (down and out), the other lifts; arms swing the other way */
    const lf = step ? 1 : 0, rl = step ? -2 : 0, la = step ? -1 : 0, ra = step ? 1 : 0;

    /* spear, behind the body */
    if (o.spear) { const sx = back ? 8 : 23; r(sx, 3, 1, 26, K.belt); r(sx - 1, 1, 3, 2, K.inner); p(sx, 0, K.inner); }
    /* cape, seen from behind */
    if (o.cape && back) { r(10, 14, 12, 14, K.cape); r(9, 22, 14, 6, K.cape); r(9, 27, 14, 1, K.capeD); r(15, 15, 2, 12, K.capeD); }

    /* legs and boots */
    if (o.robe) {
      r(11 - lf, 28 + lf, 4, 3, K.boots); r(11 - lf, 30 + lf, 4, 1, K.bootsD);
      r(17, 28 + rl, 4, 3, K.boots); r(17, 30 + rl, 4, 1, K.bootsD);
    } else {
      r(12 - lf, 24, 3, 4 + lf, K.legs); r(17, 24, 3, 4 + rl, K.legsD);
      r(11 - lf, 28 + lf, 4, 3, K.boots); r(11 - lf, 28 + lf, 4, 1, K.bootsD); r(10 - lf, 30 + lf, 5, 1, K.bootsD);
      r(17, 28 + rl, 4, 3, K.boots); r(17, 28 + rl, 4, 1, K.bootsD); r(17, 30 + rl, 5, 1, K.bootsD);
    }

    /* arms (behind the torso's edge), with cuffs and hands */
    const arm = (x, dy) => { r(x, 14 + dy, 2, 8, K.sleeve); r(x, 21 + dy, 2, 1, K.sleeveD); r(x, 22 + dy, 2, 2, K.skin); };
    arm(9, back ? ra : la); arm(21, back ? la : ra);
    r(10, 14, 1, 2, K.sleeve); r(21, 14, 1, 2, K.sleeve);

    /* torso, hem, or a robe to the ankles */
    r(11, 14, 10, 8, K.top); r(10, 22, 12, 2, K.top); r(10, 23, 12, 1, K.topD);
    if (o.robe) { r(10, 22, 12, 5, K.top); r(9, 26, 14, 3, K.top); r(9, 28, 14, 1, K.trim || K.topD); r(17, 22, 1, 6, K.topD); }
    if (!back) {
      r(14, 14, 4, 1, K.inner); r(15, 15, 2, 1, K.inner);                     /* open collar */
      if (o.vest) { r(11, 14, 3, 7, K.vest); r(18, 14, 3, 7, K.vest); }
      else { r(16, 16, 1, 4, K.topD); p(17, 16, K.buckle); p(17, 18, K.buckle); } /* placket and buttons */
      if (o.apron) { r(13, 16, 6, 4, K.apron); r(12, 21, 8, 6, K.apron); r(14, 23, 4, 2, K.apronD); }
    } else r(15, 15, 2, 6, K.topD);                                              /* back seam */
    r(11, 20, 10, 1, K.belt); if (!back) r(15, 20, 2, 1, K.buckle);
    if (o.rope) { r(11, 20, 10, 1, K.rope); if (!back) r(13, 21, 1, 4, K.rope); }
    /* satchel strap across the chest, bag on the hip */
    if (o.satchel) {
      if (!back) for (let k = 0; k < 7; k++) p(12 + k, 14 + k, K.strap);
      const bx = back ? 10 : 18; r(bx, 20, 4, 4, K.bag); r(bx, 20, 4, 1, K.strap);
    }
    if (o.cape && !back) { p(11, 14, K.cape); p(20, 14, K.cape); r(10, 15, 1, 8, K.cape); r(21, 15, 1, 8, K.cape); p(12, 14, K.buckle); p(19, 14, K.buckle); }

    /* neck and head */
    r(15, 13, 2, 1, K.skinD);
    r(13, 4, 6, 1, K.skin); r(12, 5, 8, 7, K.skin); r(13, 12, 6, 1, K.skin);
    if (back) {
      r(12, 3, 8, 1, K.hair); r(11, 4, 10, 8, K.hair); r(12, 12, 8, 1, K.hair); r(13, 2, 6, 1, K.hair); r(15, 6, 1, 5, K.hairD);
      if (o.longHair) { r(11, 12, 10, 4, K.hair); r(12, 16, 8, 1, K.hairD); }
    } else {
      /* hair: crown, fringe swept to the right, a sideburn on the near (left) side */
      r(13, 2, 6, 1, K.hair); r(12, 3, 8, 1, K.hair); r(11, 4, 10, 2, K.hair); r(11, 6, 2, 3, K.hair); r(19, 6, 2, 2, K.hair); p(14, 6, K.hair); p(15, 6, K.hairD);
      if (o.longHair) { r(11, 6, 2, 9, K.hair); r(19, 6, 2, 9, K.hair); r(11, 14, 1, 2, K.hairD); r(20, 14, 1, 2, K.hairD); }
      p(12, 9, K.skinD);                                                          /* ear */
      p(15, 7, K.hairD); p(18, 7, K.hairD);                                       /* brows */
      r(15, 8, 1, 2, K.eye); r(18, 8, 1, 2, K.eye);                               /* eyes */
      p(17, 10, K.skinD); r(16, 11, 2, 1, K.lip);                                 /* nose and mouth */
      if (o.beard) { r(13, 10, 7, 3, K.beard); r(14, 13, 5, 1, K.beard); r(16, 11, 2, 1, K.lip); p(17, 10, K.skinD); }
    }
    /* headgear */
    if (o.hat === 'straw') { r(13, 1, 6, 3, K.hat); r(13, 3, 6, 1, K.band); r(8, 4, 16, 1, K.hat); r(9, 5, 14, 1, K.hatD); }
    if (o.hat === 'helm') { r(12, 1, 8, 1, K.hat); r(11, 2, 10, 4, K.hat); r(10, 6, 12, 1, K.hatD); if (!back) { r(17, 7, 1, 3, K.hat); r(11, 7, 2, 4, K.hat); } else r(11, 7, 10, 4, K.hat); r(15, 2, 1, 4, K.hatD); }
    if (o.hat === 'hood') {
      r(12, 1, 8, 1, K.hat); r(11, 2, 10, 3, K.hat); r(10, 5, 2, 9, K.hat); r(20, 5, 2, 9, K.hat); r(10, 13, 12, 3, K.hat); r(11, 15, 10, 1, K.hatD);
      if (back) { r(10, 2, 12, 14, K.hat); r(15, 4, 2, 10, K.hatD); r(14, 16, 4, 3, K.hat); }
      else { r(12, 4, 8, 1, K.hatD); }
    }
    return fr;
  };
  for (let k = 0; k < FRAMES; k++) { s.frames.se[k] = make(false, k); s.frames.ne[k] = make(true, k); s.frames.sw[k] = flipFrame(s.frames.se[k].slice()); s.frames.nw[k] = flipFrame(s.frames.ne[k].slice()); }
  return s;
}
const starters = () => [
  figure('Villager', 'starter-villager', { vest: true, col: { hair: '#8a6a48', top: '#efe3c4', vest: '#9fb06a', sleeve: '#e6d8b6', legs: '#a68a62' } }),
  figure('Farmer', 'starter-farmer', { hat: 'straw', apron: true, col: { hair: '#9a7a56', hat: '#dfc070', band: '#b8664a', top: '#a6b878', apron: '#e6dcc0', legs: '#9a7d5a', boots: '#8a6a48' } }),
  figure('Guard', 'starter-guard', { hat: 'helm', cape: true, spear: true, col: { skin: '#e0b890', hair: '#6b4c32', hat: '#c4c8c6', top: '#c27458', sleeve: '#94a0aa', legs: '#808a94', boots: '#8a6a48', cape: '#a6533b', inner: '#e2dccb' } }),
  figure('Merchant', 'starter-merchant', { robe: true, beard: true, satchel: true, col: { hair: '#e0d6bc', beard: '#efe8d6', top: '#7f9cb4', trim: '#dfc070', strap: '#8a6a48', bag: '#b89a70', boots: '#8a6a48' } }),
  figure('Monk', 'starter-monk', { robe: true, hat: 'hood', rope: true, col: { skin: '#e0b890', hair: '#8a6a48', hat: '#a88a64', top: '#b49872', rope: '#e6dcc0', boots: '#7a5a3a' } }),
  figure('Healer', 'starter-healer', { longHair: true, satchel: true, col: { hair: '#dfc070', top: '#a898b8', sleeve: '#f0e6cb', legs: '#8a7a9a', strap: '#9a7a56', bag: '#f0e6cb', inner: '#f6efdc' } })
];

export { DEFAULT_PAL, FACES, FACE_LABEL, FRAMES, MAX_PAL, SIZE, blankFrame, blankSprite, cloneSprite, fillFrame, flipFrame, inFrame, isBlank, newId, setPixel, shiftFrame, spriteFromJSON, spriteToJSON, starters };
