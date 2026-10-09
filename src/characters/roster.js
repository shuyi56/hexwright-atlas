import { BASE, BODY_TYPES, REF, measure } from './body.js';
import { BOW, BUCKLER, DAGGER, HAIR_BUN, HAIR_LONG, HAIR_PONYTAIL, HAIR_SHORT, HEAD_BACK, HEAD_FRONT, KITE, LANCE, SKIN, SWORD, TAN, recolor, staff } from './parts.js';
import { BANDANA, FEATHER_CAP, WIZARD_HAT } from './hats.js';
import { finish, frameBuf, mixHex, ramp, shrink, stamp } from './pixels.js';
import { TOWNSFOLK } from './townsfolk.js';
import { ENEMIES } from './enemies.js';

/* ================= character sprites: the roster =================
   Each job is a build, an outfit, a palette and a stack of hand-drawn parts. The body (torso, arms, legs, a
   cloak) is cut for the build by body.js; the rest hangs on its landmarks. A frame is built back to front
   through fixed slots; a job fills the slots it needs. Views: 'front' (south-west) and 'back' (north-east);
   the other two facings are their mirror images. Poses: 0 standing, 1 and 2 the two strides. */
const SLOTS = {
  front: ['cloak', 'behind', 'weapon', 'armFar', 'legs', 'torso', 'overTorso', 'head', 'hair', 'hat', 'armNear', 'mantle', 'staff', 'fist', 'shield'],
  back: ['shield', 'armFar', 'legs', 'torso', 'overTorso', 'cloak', 'weapon', 'head', 'hair', 'hat', 'behind', 'hairOver', 'armNear', 'mantle', 'staff', 'fist'] };
/* From behind, a weapon held at the near side is on the figure's far side, so the back, the hair and the arm all
   cover it. */
/* the landmark each slot's hand-drawn parts hang on; held things go with their hand. A mantle lies over the
   shoulders and upper arms, so it comes after the near arm. A mage's staff is held a little forward, in front
   of the hood and mantle, and the fist that grips it is drawn again over the shaft. */
const ANCHOR = {
  front: { head: 'head', hair: 'head', hat: 'head', weapon: 'handFar', staff: 'handFar', shield: 'handNear', armNear: 'shoulderNear', armFar: 'shoulderFar' },
  back: { head: 'head', hair: 'head', hairOver: 'head', hat: 'head', weapon: 'handNear', staff: 'handNear', shield: 'handFar', armNear: 'shoulderNear', armFar: 'shoulderFar' } };
const POSES = 3, VIEWS = ['front', 'back'], BODIES = Object.keys(BODY_TYPES);
/* the walk cycle, as the poses play: a stride, passing upright, the other stride, upright again */
const WALK = [1, 0, 2, 0];
/* slots that meet without a contour: the head with its hair and hat, the torso with what is worn over it */
const GROUP = { head: 1, hair: 1, hairOver: 1, hat: 1, torso: 2, overTorso: 2 };

/* the build a job is drawn in: its own unless the caller names another */
function frame(job, view, pose, body = job.body) {
  if (job.draw) return job.draw(view, pose);                                    /* a beast draws its own (enemies.js) */
  const m = measure(body, view, pose, job.outfit), buf = frameBuf();
  const head = { ...((job.head && job.head[view]) || (view === 'front' ? HEAD_FRONT : HEAD_BACK)), anchor: 'head' };
  const own = (job.parts && job.parts[view]) || {};
  const held = job.weapon && job.weapon[view], forward = job.weapon && job.weapon.forward;
  const base = {
    ...m.parts, head, hair: job.hair && job.hair[view], hairOver: job.hair && job.hair.over && job.hair.over[view], shield: job.shield && job.shield[view],
    weapon: forward ? null : held, staff: forward ? held : null, fist: forward ? { ...m.parts[view === 'front' ? 'fistFar' : 'fistNear'], fixed: true } : null };
  let layer = 0;
  for (const slot of SLOTS[view]) {
    const generated = slot in m.parts;
    for (let part of [].concat(base[slot] || [], own[slot] || [])) {
      const at = (generated && part === base[slot]) || part.fixed ? null : part.anchor || ANCHOR[view][slot] || 'neck';
      let dx = at ? m.at[at][0] - REF[at][0] : 0, dy = at ? m.at[at][1] - REF[at][1] : 0;
      /* a weapon is made for the fist that holds it, its outward side away from the body */
      if (part.make) { const [hx, hy] = m.at[at]; part = part.make({ hand: [hx, hy], dir: hx < 16 ? -1 : 1, face: view === 'front' ? m.at.head : null }); dx = dy = 0; }
      const g = part.group || GROUP[slot];
      stamp(buf, part.rows, part.x + dx, part.y + dy, layer, g ? 1000 + g : layer); layer++;
    }
  }
  return buf;
}
/* the palette a job's letters resolve to: its own colours plus the marks drawn from them */
function palette(job) {
  const p = { ...job.pal }, skin = ramp(p.K || '#e8b890'), hair = ramp(p.H || '#6b4a30');
  const out = { E: { flat: '#1c1218' }, W: { flat: '#f4ece0' }, M: { flat: skin[4] }, Q: { flat: hair[4] }, I: { flat: mixHex(hair[0], '#fff4dc', 0.3) }, Y: '#dde2e6', ...p };
  if (typeof out.K === 'string') out.K = { ramp: out.K, clean: true, cel: true };          /* skin: solid, cel-shaded, never inked inside */
  return out;
}
/* every frame of a job: { front: [rgba x3], back: [rgba x3] }, in its own build or the one named */
/* every frame drawn smaller (scale < 1) about the feet, for a view that wants the figures less tall: the
   tactical camera draws them at about three quarters, so they stand closer to a tile's width */
function renderScaled(job, scale, body = job.body) {
  const pal = palette(job), out = {};
  for (const v of VIEWS) out[v] = Array.from({ length: POSES }, (_, k) => finish(shrink(frame(job, v, k, body), scale, 16, BASE + 1), pal));
  return out;
}
function render(job, body = job.body) {
  const pal = palette(job), out = {};
  for (const v of VIEWS) out[v] = Array.from({ length: POSES }, (_, k) => finish(frame(job, v, k, body), pal));
  return out;
}

/* ---------- the jobs ----------
   Shared letters are listed in parts.js. Jobs add: X hat or hood, R a bright accent (plume, scarf, pennant),
   V cape, F feather, bone or white, D a dark accent, U a shield's face, J a jewel, Z a face lost in shadow and
   N eyes glowing out of it. */
/* pauldrons riding over the arms */
const PAULDRONS = { armNear: { x: 19, y: 17, rows: ['.SSS.', 'SSSSS', 'SSSSS', 'sssss'], hand: 'near' }, armFar: { x: 7, y: 18, rows: ['.SS.', 'SSSS', 'ssss'], hand: 'far' } };

const SQUIRE = {
  id: 'squire', name: 'Squire', blurb: 'Every recruit starts here: a padded jerkin and a borrowed blade.',
  body: 'standard', outfit: { torso: 'tunic', strap: 1 }, hair: HAIR_SHORT, weapon: SWORD,
  pal: { K: SKIN, H: '#8a5a30', A: '#bb8d5c', B: '#ece0c6', C: '#93653d', L: '#6b4a30', G: '#c9a24f', P: '#7b6c55', O: '#5c4231', S: '#c8c9c2' }
};

const KNIGHT = {
  id: 'knight', name: 'Knight', blurb: 'Plate, a kite shield and a long cloak: the line that holds.',
  body: 'stocky', outfit: { torso: 'plate', sleeves: { A: 'S', C: 'S' }, hands: 'D', cloak: true }, hair: HAIR_SHORT, weapon: SWORD, shield: KITE,
  pal: { K: SKIN, H: '#c9a05a', A: '#5f7c9c', C: '#c9a24f', L: '#5c4231', G: '#c9a24f', P: '#aeb0aa', O: '#6d747a', S: '#c8c8c0', D: '#858a8c', R: '#b0503c', V: '#536d8c', U: '#5f7c9c' },
  parts: {
    front: {
      armNear: PAULDRONS.armNear, armFar: PAULDRONS.armFar,
      hat: { x: 8, y: 0, rows: [
        '.........RRR....',
        '......SSSSRRRR..',
        '....SSSSSSSSRRR.',
        '...SSSSSSSSSSSRR',
        '..SSSSSSSSSSSSSR',
        '.SSSSSSSSSSSSSSS',
        '.SSSSSSSSSSSSSSS',
        '.ssssssssssSSSSS',
        '.S........SSSSSS',
        '.S.........SSSS.',
        '...........SSSS.',
        '...........SSS..',
        '............SS..'] } },
    back: {
      armNear: PAULDRONS.armNear, armFar: PAULDRONS.armFar,
      hat: { x: 8, y: 0, rows: [
        '....RRR.........',
        '..RRRRSSSS......',
        '.RRRSSSSSSSS....',
        'RRSSSSSSSSSSS...',
        'RSSSSSSSSSSSSS..',
        '.SSSSSSSSSSSSSS.',
        '.SSSSSSSSSSSSSSS',
        '.SSSSSSSSSSSSSSS',
        '.sssssssssssssss',
        '.SSSSSSSSSS..SSS',
        '.SSSSSSSSSS..SS.',
        '..SSSSSSSSS.....',
        '...SSSSSSS......'] } } }
};

const ARCHER = {
  id: 'archer', name: 'Archer', blurb: 'A feathered cap, a quiver at her back and a longbow in hand.',
  body: 'slim', outfit: { torso: 'tunic', strap: -1 }, hair: HAIR_PONYTAIL,
  weapon: BOW,
  pal: { K: SKIN, H: '#a6533b', A: '#87a05a', B: '#e8dcc0', C: '#637d43', L: '#7a5434', G: '#c9a24f', P: '#6e6048', O: '#5c4231', T: '#8a6238', F: '#efe6d2', X: '#6c8549', R: '#b8483a' },
  parts: {
    front: {
      behind: { x: 6, y: 12, rows: ['.R.R', 'RFRF', '.LL.', '.LL.', '.LL.'] },
      hat: FEATHER_CAP.front },
    back: {
      behind: { x: 11, y: 12, rows: ['.......RFR.', '......RFRF.', '.......LLL.', '......LLL..', '......LLL..', '.....LLL...', '.....LLL...', '....LLL....', '....LLL....', '...LLL.....', '...LLL.....', '..LLL......', '..lll......'] },
      hat: FEATHER_CAP.back } }
};

const THIEF = {
  id: 'thief', name: 'Thief', blurb: 'Bandana, scarf and a dirk held low: in and out before the dust settles.',
  body: 'slim', outfit: { torso: 'tunic', vest: true }, hair: HAIR_SHORT, weapon: DAGGER, shield: DAGGER,
  pal: { K: TAN, H: '#4f3c2e', A: '#66727e', B: '#d8ccb0', C: '#4d5862', L: '#4a3526', G: '#c9a24f', P: '#55525a', O: '#3e3029', S: '#c8c9c2', D: '#7a5a3a', R: '#a8483a' },
  parts: {
    front: {
      overTorso: { x: 11, y: 16, rows: ['..RRRRRR.....', '.RRRRRRRRRR..', '..rrRRrrRRRR.', '...RR....RRR.', '...R......RR.'] },
      hat: BANDANA.front },
    back: {
      overTorso: { x: 11, y: 16, rows: ['..RRRRRRR..', '.RRRRRRRRRR', '..RRRRRRRR.', '....RR.....', '....RR.....', '....RRR....', '.....RR....'] },
      hat: BANDANA.back } }
};

/* The dragoon: a dragon helm, its snout jutting forward over the brow with two fangs beneath, a crest of spikes
   swept back along its crown, a horn sweeping back from the temple, and a cheek guard down to a point; layered
   pauldrons each thrown up into a spike; a ridged cuirass over mail with pointed tassets, spiked couters, flared
   gauntlets, greaves with spiked knee cops and pointed sabatons; a short cape dagged into points like a wing; and
   the winged lance (parts.js). Crimson-lacquered plate over black iron and mail, a black iron crest, gauntlets and
   cape, brass trim, bone horns and fangs, an amber eye and a gold tuft on the lance. */
const DRAGOON_PAULDRONS = {
  armNear: { x: 19, y: 13, rows: [
    '.......S.',
    '......SS.',
    '.....SSS.',
    '..SSSSSS.',
    '.SSSSSSSS',
    'SSSSSSSS.',
    'GGGGGGG..',
    'SSSSSS...',
    'sssss....'] },
  armFar: { x: 3, y: 15, rows: [
    'S......',
    '.SS....',
    '.SSSSS.',
    'SSSSSSS',
    '.GGGGGG',
    '..SSSSS'] } };
const DRAGOON = {
  id: 'dragoon', name: 'Dragoon', blurb: 'Dragon-helmed and spiked from crest to sabaton: the lance that falls from the sky.',
  body: 'standard', outfit: { torso: 'dragon', tassets: 3, greaves: true, cloak: 'dagged', sleeves: { A: 'S', C: 'G', spike: true }, hands: 'D', steady: true }, hair: HAIR_SHORT,
  weapon: LANCE,
  pal: { K: SKIN, H: '#3e2e26', S: '#a0503f', D: '#3f3a3d', A: '#5d5a62', P: '#5d5a62', O: '#8c4a3d', C: '#c9a24f', G: '#c9a24f', L: '#4a3526', T: '#8a6238', R: '#c9a24f', V: '#34303a', F: '#e6dcc4', J: '#e0c060' },
  parts: {
    front: {
      armNear: DRAGOON_PAULDRONS.armNear, armFar: DRAGOON_PAULDRONS.armFar,
      hat: { x: 2, y: 0, rows: [
        '...........D...D...D......',
        '..........DD..DD..DD.....F',
        '........SDDSSDDSSDD.....FF',
        '......SSSSSSSSSSSSS.....FF',
        '.....SSSssssssssSSSS...FF.',
        '.....SJJSSSSSSSSSSSSSFFF..',
        '...SSSSSSSSSSSSSSSSFFFF...',
        '..SsSSSsssssssssSSSSSS....',
        '.SSSSSSSSSSSSSSSSSSSSS....',
        '..sssGGGGGGGGGGGSSSSSS....',
        '...F.F..........SSSSSS....',
        '.................SSSSS....',
        '.................SSSSS....',
        '.................sssss....',
        '.................SSSSS....',
        '.................GSSS.....',
        '.................GSS......',
        '..................S.......'] } },
    back: {
      armNear: DRAGOON_PAULDRONS.armNear, armFar: DRAGOON_PAULDRONS.armFar,
      hat: { x: 4, y: 0, rows: [
        '...........D............',
        '..F........D............',
        '..FF......DDD.......F...',
        '...FF..SSSSDSSSS...FF...',
        '...FFFSSSSDDDSSSSFFF....',
        '....FFFSSSSDSSSSSFFF....',
        '....SFFSSSSDSSSSSFFS....',
        '....SSSSSSDDDSSSSSSSSS..',
        '....SSSSSSSDSSSSSSSSSS..',
        '....GGGGGGGGGGGGGGGGGs..',
        '....SSSSSSSSSSSSSSSSF.F.',
        '.....SSSSSSSSSSSSSS.....',
        '.....ssssssssssssss.....',
        '.....SSSSSSSSSSSSSS.....',
        '......ssssssssssss......',
        '.......SSSSSSSSSS.......',
        '.........SSSSSS.........',
        '...........SS...........'] } } }
};

const VALKYRIE = {
  id: 'valkyrie', name: 'Valkyrie', blurb: 'Winged helm, crimson skirts, spear and buckler: a shield-maiden.',
  body: 'tall', outfit: { torso: 'plate', skirt: 3, sleeves: { A: 'S', C: 'S' }, steady: true }, hair: HAIR_BUN, shield: BUCKLER,
  weapon: staff(['..S..', '.SSS.', '.SSS.', '.SSS.', '..S..', '.GGG.'], 27, { lean: 5, behind: true }),
  pal: { K: SKIN, H: '#dcc070', A: '#a84a3c', C: '#c9a24f', L: '#5c4231', G: '#c9a24f', P: '#aeb0aa', O: '#6b4a34', S: '#ccccc4', T: '#7a5434', F: '#f4efe4', U: '#a84a3c', J: '#6f8faa' },
  parts: {
    front: {
      armNear: PAULDRONS.armNear,
      hat: { x: 6, y: 0, rows: [
        '................F...',
        '........SSSS...FFF..',
        '......SSSSSSSSFFFFF.',
        '.....SSSSSSSSSSFFFF.',
        '....SSSSSSSSSSSSFFF.',
        '...SSSSSSSSSSSSSSF..',
        '....ssssJsssssssss..'] } },
    back: {
      armNear: PAULDRONS.armNear,
      hat: { x: 6, y: 0, rows: [
        '...F............F...',
        '..FFF...SSSS...FFF..',
        '.FFFFFSSSSSSSSFFFFF.',
        '.FFFFSSSSSSSSSSFFFF.',
        '..FFSSSSSSSSSSSSFF..',
        '...FSSSSSSSSSSSSF...',
        '....ssssssssssss....'] } } }
};

/* the black mage's head: a face lost in the hat's shadow, two eyes glowing out of it */
const SHADOW_FACE = { x: 9, y: 4, rows: HEAD_FRONT.rows.map((r, j) => r.replace(/[A-Z]/gi, 'Z').replace(/./g, (c, i) => (c === 'Z' && (j === 7 || j === 8) && (i === 2 || i === 6) ? 'N' : c))) };
/* the robe's high collar, standing up round the jaw: in front it hides the chin, so the face is a band of
   shadow between the brim and the collar; behind, it rises over the nape. It hangs on the neck. */
const BM_COLLAR = {
  front: { anchor: 'neck', x: 9, y: 14, rows: [
    'AA..........AA',
    'AAA........AAA',
    'AAAAA....AAAAA',
    'AAAAAAACAAAAAa',
    '.aAAAAACAAAAa.',
    '..AAAAACAAAA..'] },
  back: { anchor: 'neck', x: 9, y: 14, rows: [
    'A............A',
    'AA..........AA',
    'AAAAAAAAAAAAAA',
    'aAAAAAAAAAAAAa',
    '.aaaaaaaaaaaa.',
    '..AAAAAAAAAA..'] } };
const BLACK_MAGE = {
  id: 'blackmage', name: 'Black Mage', blurb: 'A wide-brimmed hat, a face of shadow and two burning eyes over a high collar.',
  body: 'stocky', outfit: { torso: 'gown', legs: 'gown', sleeves: { bell: true }, hands: 'D', steady: true }, head: { front: SHADOW_FACE, back: recolor(HEAD_BACK, { K: 'Z' }) },
  weapon: staff(['T...T', 'TT.TT', '.TTT.', '..T..', '..T..'], 19),
  pal: { K: SKIN, A: '#56688f', C: '#c9a24f', L: '#6b4a30', G: '#c9a24f', O: '#5c3d2c', T: '#8a6238', X: '#5d5a74', D: '#45404f', Z: { flat: '#251f2b' }, N: { flat: '#f2c460' } },
  parts: {
    front: { hat: WIZARD_HAT.front, mantle: BM_COLLAR.front },
    back: { mantle: BM_COLLAR.back, hat: WIZARD_HAT.back } }
};

/* The hoods are a fitted cowl over the head (hat slot) and what falls from it over the shoulders (mantle slot,
   above the arms), drawn on the reference layout. The white mage's cowl rises to a peak; a red band frames her
   face over the cowl's shadowed lining, and the peak trails behind as a tail down her back over a mantle hemmed
   in red teeth. The summoner's cowl is round, banded in gold with a jewel at the brow, horns curling up and back
   from its temples; long gold-edged lappets hang down her chest and a long tail down her back. */
const WM_HOOD_FRONT = { x: 8, y: 0, rows: [
  '........XXXXX......',
  '......XXXXXXXXX....',
  '....XXXXXXXXXxXXX..',
  '...XXXXXXXXXXXxXXX.',
  '..XXXXXXXXXXXXXxXxX',
  '.XXXXXXXXXXXXXXXX.X',
  '.XXCCCCCCCCCXXXXX..',
  'XXCxxxxxxxxxXXXXX..',
  'XC..........XXXXX..',
  'XC..........XXXXX..',
  'XC..........XXXXX..',
  'XC..........XXXXX..',
  'XC..........XXXX...',
  'XC..........XXXX...',
  'XC..........XXX....',
  'XXC.........XXX....',
  'XXXC.......XXXX....',
  '.XXXCCCCCCCXXX.....'] };
const WM_HOOD_BACK = { x: 9, y: 1, rows: [
  '....XXXXXXX....',
  '..XXXXXxXXXXX..',
  '.XXXXXXxXXXXXX.',
  'XXXXXXXxXXXXXXX',
  'XXXXXXXxXXXXXXX',
  'XXXXXXXxXXXXXXX',
  'XXXXXXXxXXXXXXX',
  'XXXXXXXxXXXXXXX',
  'XXXXXXXxXXXXXXX',
  'XXXXXXXxXXXXXXX',
  'XXXXXXXxXXXXXXX',
  'XXXXXXXxXXXXXXX',
  '.XXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXX.',
  '..XXXXXXXXXXX..',
  '..XXXXXXXXXXX..',
  '...XXXXXXXXX...'] };
const WM_MANTLE_FRONT = { x: 6, y: 17, rows: [
  '....XXXXXGXXXXXX....',
  '...XXXXXXxXXXXXXX...',
  '..XXXXXXXxXXXXXXXX..',
  '.XXXXXXXXxXXXXXXXXX.',
  'XXXXXXXXXxXXXXXXXXXX',
  'CCCCCCCCCCCCCCCCCCCC',
  '.C..C..C..C..C..C..C'] };
const WM_MANTLE_BACK = { group: 3, x: 6, y: 17, rows: [
  '....XXXXXXXXXXXX....',
  '...XXXXXXXXXXXXXX...',
  '..XXXXXXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXXXXXX.',
  'XXXXXXXXXXXXXXXXXXXX',
  'CCCCCCCCCCCCCCCCCCCC',
  '.C..C..C..C..C..C..C'] };
const WM_TAIL = { x: 13, y: 17, group: 3, rows: [
  'XXXxXXX',
  '.xXxXx.',
  '.xXxXx.',
  '.xXXx..',
  '..xXx..',
  '..xXx..',
  '..CC...',
  '..CC...',
  '...C...'] };
const SM_HOOD_FRONT = { x: 5, y: 0, rows: [
  '.FF.................FF.',
  'FF......XXXXXXX......FF',
  'F.....XXXXXXXXXXX.....F',
  'FF...XXXXXXXXXXXXX...FF',
  '.FF.XXXXXXXXXXXXXXX.FF.',
  '..FfXXXXXXXXXXXXXXXfF..',
  '....XXGGGGJGGGGXXXX....',
  '...XXGxxxxxxxxxXXXX....',
  '...XG..........XXXX....',
  '...XG..........XXXX....',
  '...XG..........XXXX....',
  '...XG..........XXXX....',
  '...XG..........XXXX....',
  '...XG..........XXXX....',
  '...XG..........XXXX....',
  '...XXG.........XXXX....',
  '...XXXG.......XXXXX....',
  '...XXXX.......XXXXX....'] };
const SM_HOOD_BACK = { x: 5, y: 0, rows: [
  '.FF.................FF.',
  'FF......XXXXXXX......FF',
  'F.....XXXXXXXXXXX.....F',
  'FF...XXXXXXxXXXXXX...FF',
  '.FF.XXXXXXXxXXXXXXX.FF.',
  '..FFXXXXXXXxXXXXXXXFF..',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXxXXXXXXX....',
  '....XXXXXXXXXXXXXXX....',
  '.....XXXXXXXXXXXXX.....',
  '......XXXXXXXXXXX......'] };
const SM_LAPPETS = { x: 9, y: 16, rows: [
  'GXX.......XXG',
  'GXx.......xXG',
  'GXx.......xXG',
  'GXx.......xXG',
  'GXx.......xXG',
  'GXx.......xXG',
  'GXx.......xXG',
  'GXx.......xXG',
  'GXx.......xXG',
  'GXx.......xXG',
  'GXX.......XXG',
  'GGG.......GGG',
  '.G.........G.'] };
const SM_TAIL = { x: 12, y: 17, rows: [
  'XXXXXXXXX',
  '.GXXxXXG.',
  '.GXXxXXG.',
  '.GXXxXXG.',
  '.GXXxXXG.',
  '.GXXxXXG.',
  '.GXXxXXG.',
  '..GXxXG..',
  '..GXxXG..',
  '..GXxXG..',
  '..GXXXG..',
  '..GGGGG..',
  '...GGG...',
  '....G....'] };

const WHITE_MAGE = {
  id: 'whitemage', name: 'White Mage', blurb: 'A white hooded robe edged in red teeth, and a staff crowned with an orb.',
  body: 'slim', outfit: { torso: 'robe', legs: 'robe', teeth: true, steady: true }, hair: HAIR_SHORT,
  weapon: staff(['..J..', '.JJJ.', 'GJJJG', '.GGG.', '..G..'], 22),
  pal: { K: SKIN, H: '#9a6238', A: '#efe6d4', C: '#b8483a', L: '#b8483a', G: '#c9a24f', O: '#8a6a4a', T: '#a8865e', X: '#f2eadb', J: '#c0503c' },
  parts: { front: { hat: WM_HOOD_FRONT, mantle: WM_MANTLE_FRONT }, back: { hat: WM_HOOD_BACK, mantle: [WM_MANTLE_BACK, WM_TAIL] } }
};

const SUMMONER = {
  id: 'summoner', name: 'Summoner', blurb: 'A horned hood, robes of moss green, and a rod set with a calling stone.',
  body: 'standard', outfit: { torso: 'robe', legs: 'robe', steady: true }, hair: HAIR_LONG,
  weapon: staff(['..J..', '.JJJ.', 'FJJJF', 'F.J.F', '.FGF.', '..G..'], 20),
  pal: { K: SKIN, H: '#6b3f2a', A: '#738f5a', C: '#c9a24f', L: '#8a6238', G: '#c9a24f', O: '#5c4231', T: '#8a6238', X: '#5f7c49', F: '#ece2cc', J: '#6fb0b4' },
  parts: { front: { hat: SM_HOOD_FRONT, mantle: SM_LAPPETS }, back: { hat: SM_HOOD_BACK, mantle: SM_TAIL } }
};

const JOBS = [SQUIRE, KNIGHT, ARCHER, THIEF, DRAGOON, VALKYRIE, BLACK_MAGE, WHITE_MAGE, SUMMONER];
/* everyone who can be drawn: the townsfolk (townsfolk.js), the jobs, then the enemies (enemies.js) */
const ROSTER = [...TOWNSFOLK, ...JOBS, ...ENEMIES];
const BY_ID = new Map(ROSTER.map(c => [c.id, c]));
const byId = id => BY_ID.get(id) || null;

export { BODIES, ENEMIES, JOBS, POSES, ROSTER, VIEWS, WALK, byId, frame, palette, render, renderScaled };
