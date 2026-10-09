import { BASE } from './body.js';
import { BUCKLER, HAIR_SHORT, HEAD_BACK, SWORD, staff } from './parts.js';
import { CAPELET, COWL, COWL_POINT } from './hats.js';
import { cellsToPart, frameBuf, stamp, W } from './pixels.js';

/* ================= character sprites: the enemies =================
   What a party meets on the road: a goblin, a bandit, an orc and a skeleton, drawn like the jobs (a build, an
   outfit and hand-drawn parts on the body's landmarks), and two beasts, a wolf and a slime, that are not built on
   a body at all: each draws its own frames (draw(view, pose) returns a frame buffer, as roster.js frame does).
   Letters as in parts.js and roster.js; the beasts name theirs below. */

const both = make => ({ front: { make }, back: { make } });
/* a cudgel held head-down at the side: a grip through the fist, then a knotted head swelling outward a pixel every
   three rows, studded with nails, angling away from the body like a sword */
const CLUB = both(({ hand: [hx, hy], dir }) => {
  const cells = [], n = Math.min(10, BASE - hy - 3);
  for (let j = 0; j < n; j++) {
    const bx = hx + dir * Math.floor(j / 3), w = j < 2 ? 1 : j < 4 ? 2 : j < n - 1 ? 3 : 2;
    for (let i = 0; i < w; i++) cells.push([bx + dir * i, hy + 2 + j, (j === 4 || j === 7) && (i === w - 1 || (w === 3 && i === 0)) ? 'S' : j === 5 && i === 1 ? 't' : 'T']);
  }
  return cellsToPart(cells);
});

/* ---------- the goblin ----------
   Small, sallow and spiteful: long ears swept out and up to points from a bald head, yellow eyes under a dark
   brow, a rag of a tunic, bare feet and a nail-studded club. */
/* long ears swept out and up to a point, a crease of shadow running down the inside of each */
const GOBLIN_EARS = {
  front: { x: 3, y: 5, rows: [
    'K........................K',
    'KK......................KK',
    'KkK....................KkK',
    '.KkKK................KKkK.',
    '..KkkKK............KKkkK..',
    '...KKkK...........KKkKK...',
    '....KKK...........KKK.....'] },
  back: { x: 3, y: 5, rows: [
    'K........................K',
    'KK......................KK',
    'KkK....................KkK',
    '.KkKK................KKkK.',
    '..KkkKK............KKkkK..',
    '...KKkKK..........KKkKK...',
    '.....KKK..........KKK.....'] } };
const GOBLIN_BROW = { x: 9, y: 9, rows: ['.QQ...QQ.'] };
const GOBLIN = {
  id: 'goblin', name: 'Goblin', blurb: 'Knee-high, green and all ears: a cudgel full of nails and no manners.',
  enemy: true, body: 'small', outfit: { torso: 'tunic', strap: 1 }, weapon: CLUB,
  pal: { K: '#94a656', H: '#3e3029', W: { flat: '#e8cc5a' }, A: '#7a6a4e', B: '#94a656', C: '#5f4f38', L: '#4a3526', G: '#8a8478', P: '#5a4c3a', O: '#94a656', T: '#6b4a30', S: '#a8a8a0' },
  parts: { front: { hat: [GOBLIN_EARS.front, GOBLIN_BROW] }, back: { hat: GOBLIN_EARS.back } }
};

/* ---------- the bandit ----------
   A road-agent's hood and capelet, a red kerchief tied over the nose and mouth, a leather vest buttoned over a
   dun tunic, and a sword. */
const KERCHIEF = { x: 9, y: 13, rows: [
  'RRRRRRRRR',
  'RRRrRRRRR',
  '.RRRrRRR.',
  '..RRRRR..'] };
const BANDIT = {
  id: 'bandit', name: 'Bandit', blurb: 'Hooded and masked on the high road: your purse or your life.',
  enemy: true, body: 'standard', outfit: { torso: 'tunic', vest: true, strap: -1 }, hair: HAIR_SHORT, weapon: SWORD,
  pal: { K: '#d9a77c', H: '#4f3c2e', A: '#a6966e', B: '#d8ccb0', C: '#7f7056', D: '#6b4a30', L: '#4a3526', G: '#c9a24f', P: '#5d564c', O: '#4a3526', S: '#c8c9c2', X: '#5f5a48', R: '#9a4034' },
  parts: { front: { hat: [COWL.front, KERCHIEF], mantle: CAPELET.front }, back: { hat: COWL.back, mantle: [CAPELET.back, COWL_POINT] } }
};

/* ---------- the orc ----------
   Tall, dark green and bare-armed: tusks thrust up from a jutting jaw, red eyes over streaks of war paint under
   a heavy scowl, a bald head, spiked iron pauldrons on both shoulders, a black leather jerkin and a great
   double-bitted axe. */
/* a brutal face: a heavy brow slanting down to the nose, red eyes burning over streaks of war paint (R) run down
   the cheeks, a broad jutting jaw, and two tusks thrust up past the lip from a wide mouth */
const ORC_FACE = { x: 9, y: 4, rows: [
  '....KKKKKK....',
  '..KKKKKKKKKK..',
  '.KKKKKKKKKKkk.',
  '.KKKKKKKKKKkk.',
  'KQKKKKQKKkkkkk',
  'KQQQKQQQKkkkkk',
  'KNNKKNNKKkkkkk',
  'KRKKKKRKKkkkkk',
  'KRKKKKRKkkkkkk',
  'KFKKkkKFkkkkkk',
  'KFKKKKKFkkkkkk',
  'KFMMMMMFkkkkkk',
  '.KMMMMMkkkkkk.',
  '..kkkkkkkkkk..'] };
/* small pointed ears either side of the head: in front the far one peeks past the face */
const ORC_EARS = {
  front: { x: 7, y: 9, rows: [
    'K..............K.',
    'KK............KKk',
    '.K............Kk.'] },
  back: { x: 7, y: 9, rows: [
    'K...............K',
    'kK.............Kk',
    '.k.............k.'] } };
const FAR_PAULDRON = { x: 6, y: 15, rows: [
  'S....',
  'SS...',
  'SSSS.',
  'SSSSS',
  'sssss'] };
const SPIKED_PAULDRON = { x: 19, y: 14, rows: [
  '...S..',
  '..SS..',
  '.SSSS.',
  'SSSSSS',
  'SSSSSS',
  'ssssss'] };
const ORC = {
  id: 'orc', name: 'Orc', blurb: 'Tusks, war paint and a great axe: the warband\'s front rank.',
  enemy: true, body: 'tall', outfit: { torso: 'tunic', strap: 1, sleeves: { A: 'K', C: 'L' }, steady: true }, head: { front: ORC_FACE, back: HEAD_BACK },
  weapon: staff(['.S.T.S.', 'SS.T.SS', 'SSSTSSS', 'SSSTSSS', 'SSSTSSS', 'SS.T.SS', '.S.T.S.'], 23, { behind: true }),
  pal: { K: '#6c8248', R: '#8a3328', N: { flat: '#f2843a' }, M: { flat: '#2e1c18' }, Q: { flat: '#2a2a1e' }, A: '#4a3a30', B: '#6c8248', C: '#4a3526', L: '#4a3526', G: '#8a8478', P: '#5a4a3a', O: '#3e3029', S: '#8f908a', T: '#7a5434', F: '#ece2cc' },
  parts: { front: { hat: ORC_EARS.front, armNear: SPIKED_PAULDRON, armFar: FAR_PAULDRON }, back: { hat: ORC_EARS.back, armNear: SPIKED_PAULDRON, armFar: FAR_PAULDRON } }
};

/* ---------- the skeleton ----------
   Bare bone on a slim build: a skull with two embers burning in its sockets and a row of teeth, a ribcage over the
   dark of the chest, thin shins, a rag about the hips, a rusted sword and a cracked wooden buckler. */
const SKULL = { x: 9, y: 4, rows: [
  '....KKKKKK....',
  '..KKKKKKKKKK..',
  '.KKKKKKKKKKkk.',
  '.KKKKKKKKKKkk.',
  'KKKKKKKKKKkkkk',
  'KKKKKKKKKKkkkk',
  'KZZKKZZKKkkkkk',
  'KZNKKZNKKkkkkk',
  'KZZKKZZKkkkkkk',
  '.KKKZKKKkkkkk.',
  '..KKKKKKkkkk..',
  '..KZKZKZkkk...',
  '..KKKKKKkk....',
  '...kkkkk......'] };
const SKELETON = {
  id: 'skeleton', name: 'Skeleton', blurb: 'Bones that will not lie still: a rusted blade, a cracked buckler and embers for eyes.',
  enemy: true, body: 'slim', outfit: { torso: 'ribs', bones: true, sleeves: { C: 'A' } }, head: { front: SKULL, back: HEAD_BACK },
  weapon: SWORD, shield: BUCKLER,
  pal: { K: '#e6dcc0', A: '#e6dcc0', D: '#3a3238', L: '#6b5a48', P: '#e6dcc0', O: '#e6dcc0', C: '#8a8478', G: '#8a8478', U: '#7a5a3a', Y: '#b9ab8e', Z: { flat: '#2a2228' }, N: { flat: '#e0603f' } }
};

/* ---------- the beasts ----------
   A beast draws its own frames rather than wearing a body: draw(view, pose) returns a frame buffer like
   roster.js frame. Its parts are authored facing left (the front view, south-west), and the back view (north-east)
   is the same body mirrored with its head seen from behind and its parts layered the other way round: from the
   front the head is nearest, from behind the tail. Poses as for everyone: 0 standing, 1 and 2 the two strides.
   A beast has no build (it is drawn the same in any) and no outfit, and its skin (K) is its own hide, which a
   shrunk frame paints where its eyes and mouth were. */
const mirror = (part, flip) => (flip ? { rows: part.rows.map(r => [...r].reverse().join('')), x: W - part.x - part.rows[0].length, y: part.y } : part);
/* parts are stamped in order; a part's layer (its index unless it names one) decides its light and contours, so
   parts sharing a layer are lit and outlined as one piece */
function beastFrame(layers, flip) {
  const buf = frameBuf();
  layers.forEach((p, k) => { if (p) { const q = mirror(p, flip), l = p.layer ?? k; stamp(buf, q.rows, q.x, q.y, l, l); } });
  return buf;
}

/* The wolf. Letters: A grey fur, D the dark saddle down its back, the backs of its tall ears and the tip of its tail,
   B the cream of its muzzle, throat, belly, legs and the insides of its ears, J an amber eye, Z its pupil and nose, F a fang. Its legs are cut like a
   body's: a foreleg straight from the elbow to the paw, a hind leg sloping back from the haunch to the hock and
   down again to the paw. It trots: in each stride one diagonal pair reaches forward with a paw lifted and the other
   pair pushes back, the body riding a pixel lower, the head bobbing with it and the tail swinging. Its coat is
   one piece of fur, so creases (a) mark the back of the cheek and the curve of the haunch. */
const WOLF_HEAD = {
  front: { x: 1, y: 15, rows: [
    '.......D....D....',
    '.......DD...DD...',
    '......DBD..DBD...',
    '......DBAD.DBBD..',
    '.....DBBAD.DBBAD.',
    '.....DBBAADDBBAD.',
    '.....DAAAADAAAAD.',
    '......AAAAAAAAAA.',
    '.....AAAAAAAAAAAA',
    '....AAZJAAAAAAAAA',
    '..AAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAa',
    'ZBBBBAAAAAAAAAAAa',
    '.BBBBBBAAAAAAAAAa',
    '..FBBBBBBBAAAAAa.',
    '...BBBBBBBBBAAa..',
    '.....BBBBBBBB....'] },
  back: { x: 1, y: 15, rows: [
    '.......D....D....',
    '.......DD...DD...',
    '......DDD..DDD...',
    '......DDDD.DDDD..',
    '.....DDDDD.DDDDD.',
    '.....DDDDDDDDDDD.',
    '.....DAAAADAAAAD.',
    '......AAAAAAAAAA.',
    '.....AAAAAAAAAAAA',
    '.....AAAAAAAAAAAA',
    '....AAAAAAAAAAAAA',
    '...BAAAAAAAAAAAAA',
    '...BBAAAAAAAAAAAA',
    '....BBAAAAAAAAAAA',
    '.....BBAAAAAAAAA.',
    '......BBAAAAAAA..',
    '........AAAAA....'] } };
const WOLF_BODY = { x: 9, y: 26, rows: [
  '...DDDDDDDDDDDD....',
  '..DDDDDDDDDDDDDDD..',
  '.AADDDDDDDDDDDDDDD.',
  'AAAAADDDDDDDDDDDAAA',
  'AAAAAAAADDDDDDAAAAA',
  'AAAAAAAAAAAAAaAAAAA',
  'BAAAAAAAAAAAaAAAAAA',
  'BBAAAAAAAAAaAAAAAAA',
  'BBBAAAAAAAAaAAAAAAA',
  'BBBBAAAAAAAaAAAAAAA',
  '.BBBBAAAAAAAaAAAAA.',
  '..BBBBBBBAAAAAAAAA.',
  '...BBBBB...AAAAAA..'] };
const WOLF_TAIL = [
  'DDD..',
  'ADDD.',
  'AAADD',
  '.AAAD',
  '.AAAA',
  '.AAAA',
  '..AAA',
  '..AAA',
  '..AAA',
  '..ADD',
  '...DD',
  '...D.'];
/* a leg from its top (x0, the column nearest the facing) to the ground: reach moves the paw toward the facing
   (negative) or away; a lifted leg ends two rows up with its paw curled. A foreleg is three pixels to the elbow
   and two below; a hind leg is a broad thigh narrowing back to the hock, then the shank angling forward to the
   paw. The lower legs are cream. */
function wolfLeg(kind, x0, top, end, reach, lifted) {
  const cells = [], n = end - top, socks = end - 3;
  for (let y = top; y <= end; y++) {
    const j = y - top, dx = Math.round(reach * j / n);
    let l, r;
    if (kind === 'fore') { l = x0; r = x0 + (j < 3 ? 2 : 1); }
    else { l = x0 + [0, 0, 0, 1, 2, 3][Math.min(j, 5)] - (j >= 6 ? 1 : 0); r = x0 + (j < 5 ? 4 : j < 6 ? 4 : 3); }
    if (y === end) { l--; if (lifted) r--; }                                       /* the paw, toes toward the facing */
    for (let x = l + dx; x <= r + dx; x++) cells.push([x, y, y === end ? 'b' : y > socks ? 'B' : 'A']);
  }
  return cellsToPart(cells);
}
function wolfFrame(view, pose) {
  const back = view === 'back', drop = pose ? 1 : 0;
  /* the diagonal pairs: in stride 1 the near foreleg and far hind leg reach, in stride 2 the other pair. The far
     legs stand a row higher, further off. */
  const leg = (kind, near, x0, top) => {
    const reaching = pose && (pose === 1) === (near === (kind === 'fore')), end = BASE - (near ? 0 : 1) - (reaching ? 2 : 0);
    return wolfLeg(kind, x0, top + drop, end, !pose ? 0 : reaching ? -2 : 2, reaching);
  };
  const farFore = leg('fore', false, 13, 35), farHind = leg('hind', false, 23, 34), nearFore = leg('fore', true, 10, 37), nearHind = leg('hind', true, 20, 36);
  const sway = pose === 1 ? -1 : pose === 2 ? 1 : 0;
  /* the far legs stand behind; everything else is one coat of fur, lit as one piece without seams between its parts */
  const coat = p => ({ ...p, layer: 1 }), far = p => ({ ...p, layer: 0 });
  const tail = coat({ x: 25 + sway, y: 27 + drop, rows: WOLF_TAIL }), body = coat({ ...WOLF_BODY, y: WOLF_BODY.y + drop }), head = coat({ ...WOLF_HEAD[view], y: WOLF_HEAD[view].y + drop });
  const legs = [far(farFore), far(farHind)], near = [coat(nearFore), coat(nearHind)];
  return beastFrame(back ? [...legs, head, body, ...near, tail] : [...legs, tail, body, ...near, head], back);
}
const WOLF = {
  id: 'wolf', name: 'Wolf', blurb: 'Grey, lean and never alone: the pack that follows the road at dusk.',
  enemy: true, beast: true, body: 'standard', outfit: {}, draw: wolfFrame,
  pal: { K: '#8f8c84', A: { ramp: '#8f8c84', clean: true }, D: { ramp: '#5f5a55', clean: true }, B: { ramp: '#ddd2b8', clean: true }, J: { flat: '#e2b048' }, Z: { flat: '#2a2228' }, F: '#f4efe4' }
};

/* The slime. A round ball of blue-green jelly (A) sat on its flattened base (a, its rim), a shine (W) on its upper left, and in front two
   eyes (E) and a mouth (M). It does not walk but heaves: squashed wide in one stride and drawn up tall in the
   other. */
function slimeFrame(view, pose) {
  /* a ball of jelly: round as a ball above its middle, its sides bulging out and curling under to sit on a flattened
     base, the base a little wider in a squash */
  const [w, h] = [[22, 20], [24, 17], [19, 23]][pose], cells = [], top = BASE - h + 1, cy = top + (h - 1) * 0.48, ry = (h - 1) * 0.52;
  for (let j = 0; j < h; j++) {
    const y = top + j, t = Math.min(1, Math.abs(y - cy) / ry), base = j >= h - 2;
    const half = (w / 2) * Math.sqrt(1 - t * t * (y > cy ? 0.55 : 1)) - (base ? (h - 1 - j ? 0.5 : 1.5) : 0);
    const l = Math.round(16 - half), r = Math.round(16 + half) - 1;
    for (let x = l; x <= r; x++) cells.push([x, y, j === h - 1 ? 'a' : 'A']);
  }
  const at = (x, y, ch) => cells.push([x, y, ch]);
  /* the shine: a short arc high on the upper left, and a fleck beside it */
  const sx = 16 - Math.round(w * 0.27), sy = top + 3;
  at(sx, sy + 2, 'W'); at(sx, sy + 3, 'W'); at(sx + 1, sy + 1, 'W'); at(sx + 2, sy + 1, 'W'); at(sx + 4, sy, 'W');
  if (view === 'front') {
    const ey = top + Math.round(h * 0.42), mid = 14;
    for (const ex of [mid - 3, mid + 2]) { at(ex, ey, 'E'); at(ex, ey + 1, 'E'); }
    at(mid - 1, ey + 3, 'M'); at(mid, ey + 3, 'M');
  }
  return beastFrame([cellsToPart(cells)], false);
}
const SLIME = {
  id: 'slime', name: 'Slime', blurb: 'A heaving dome of blue-green jelly that swallows boots whole.',
  enemy: true, beast: true, body: 'standard', outfit: {}, draw: slimeFrame,
  pal: { K: '#72a8aa', A: '#72a8aa', W: { flat: '#f4f6e4' }, E: { flat: '#1c1218' }, M: { flat: '#2e4a4c' } }
};

const ENEMIES = [GOBLIN, BANDIT, ORC, SKELETON, WOLF, SLIME];

export { BANDIT, CLUB, ENEMIES, GOBLIN, ORC, SKELETON, SLIME, WOLF };
