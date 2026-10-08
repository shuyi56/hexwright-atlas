import { HAIR_BRAID, HAIR_LONG, HAIR_SHORT, SKIN, TAN, staff } from './parts.js';

/* ================= character sprites: the townsfolk =================
   The people of the map's towns and villages: a villager, a farmer, a guard, a merchant, a monk, a healer and a
   noble lady. They are built like the jobs in roster.js (a build, an outfit cut by body.js, a palette and
   hand-drawn parts hung on the body's landmarks), in the same frames, facings and strides, and the same soft
   palette taken from the tile set. Letters as in parts.js and roster.js; townsfolk add U for a satchel. */

/* a straw hat with a wide brim and a flat crown ringed by a band (R), the brim's weave picked out in creases */
const STRAW_HAT = { x: 4, y: 3, rows: [
  '.......XXXXXXXX.........',
  '......XXXxXXXXXX........',
  '......XXXXXXXXXX........',
  '......RRRRRRRRRR........',
  '..XXXXXXXXXXXXXXXXXXXX..',
  'XXXxXXXXxXXXXxXXXXxXXXXX',
  '.xxxxxxxxxxxxxxxxxxxxxx.'] };
/* a kettle helm: a round steel crown with a comb along its top and a broad brim turned down all round */
const KETTLE_HELM = { x: 5, y: 1, rows: [
  '.......SSSSSSS........',
  '.....SSSSSsSSSSS......',
  '....SSSSSSsSSSSSS.....',
  '....SSSSSSsSSSSSS.....',
  '...SSSSSSSsSSSSSSS....',
  '.SSSSSSSSSSSSSSSSSSS..',
  'SSSSSSSSSSSSSSSSSSSSS.',
  '.sssssssssssssssssss..'] };
/* a full beard: a moustache over the mouth, sideburns joining the hair, and a beard falling in locks to a point on
   the chest, its mouth left showing */
const BEARD = { x: 9, y: 14, rows: [
  '.HHQHHH....HHH',
  'HHH..HHHHHHHHH',
  'HHQHHHQHHHQHHH',
  '.HHHQHHHQHHHH.',
  '..HHHQHHHQHH..',
  '...HHHQHHHH...',
  '....HHHQHH....',
  '.....HHHH.....',
  '......HH......'] };
/* a monk's cowl: a deep plain hood round the head, the face in the shadow of its lip, closing under the chin;
   from behind, a seam up its back. It falls into a capelet over the shoulders, and its point hangs down the back */
const COWL = {
  front: { x: 7, y: 1, rows: [
    '.....XXXXXXX......',
    '...XXXXXXXXXXX....',
    '..XXXXXXXXXXXXX...',
    '.XXXXXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXXXX.',
    'XXXXXXXXXXXXXXXXX.',
    'XXxxxxxxxxXXXXXXX.',
    'Xx........xXXXXXXX',
    'Xx........xXXXXXXX',
    'Xx.........xXXXXXX',
    'Xx.........xXXXXXX',
    'Xx.........xXXXXXX',
    'Xx.........xXXXXX.',
    'XXx.......xXXXXXX.',
    'XXx.......xXXXXX..',
    '.XXx.....xXXXXX...',
    '..XXxxxxxXXXXX....'] },
  back: { x: 7, y: 1, rows: [
    '.....XXXXXXX......',
    '...XXXXXXXXXXX....',
    '..XXXXXXxXXXXXX...',
    '.XXXXXXXxXXXXXXX..',
    '.XXXXXXXxXXXXXXXX.',
    'XXXXXXXXxXXXXXXXX.',
    'XXXXXXXXxXXXXXXXX.',
    'XXXXXXXXxXXXXXXXX.',
    'XXXXXXXXxXXXXXXXX.',
    'XXXXXXXXxXXXXXXXX.',
    'XXXXXXXXxXXXXXXXX.',
    'XXXXXXXXxXXXXXXXX.',
    '.XXXXXXXxXXXXXXX..',
    '.XXXXXXXXXXXXXXX..',
    '..XXXXXXXXXXXXX...',
    '..XXXXXXXXXXXXX...',
    '...XXXXXXXXXXX....'] } };
const CAPELET = {
  front: { x: 7, y: 17, rows: [
    '...XXXXXXXXXXXX...',
    '..XXXXXXxXXXXXXX..',
    '.XXXXXXXxXXXXXXXX.',
    'XXXXXXXXxXXXXXXXXX',
    'xxxxxxxxxxxxxxxxxx'] },
  back: { x: 7, y: 17, group: 3, rows: [
    '...XXXXXXXXXXXX...',
    '..XXXXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXXXX.',
    'XXXXXXXXXXXXXXXXXX',
    'xxxxxxxxxxxxxxxxxx'] } };
const COWL_POINT = { x: 12, y: 21, group: 3, rows: [
  'XXXxXXX',
  '.XXxXX.',
  '..XxX..',
  '...X...'] };
/* a gold circlet round the brow, set with a jewel (J) in front */
const CIRCLET = {
  front: { x: 9, y: 5, rows: [
    '.....G........',
    'GGGGGJGGGGGGGG'] },
  back: { x: 9, y: 6, rows: ['GGGGGGGGGGGGGG'] } };

const VILLAGER = {
  id: 'villager', name: 'Villager', blurb: 'A linen shirt under a green vest: the people the map is for.',
  body: 'standard', outfit: { torso: 'tunic', vest: true }, hair: HAIR_SHORT,
  pal: { K: SKIN, H: '#8a6a48', A: '#e6d8b6', B: '#efe3c4', C: '#d3c199', D: '#8fa462', L: '#7a5a3a', G: '#c9a24f', P: '#a68a62', O: '#7a5a3a' }
};

const FARMER = {
  id: 'farmer', name: 'Farmer', blurb: 'A straw hat and bib-and-brace overalls, out in all weathers.',
  body: 'stocky', outfit: { torso: 'tunic', bib: true }, hair: HAIR_SHORT,
  pal: { K: TAN, H: '#9a7a56', A: '#a6b878', B: '#efe3c4', C: '#8c9e62', D: '#8297b0', L: '#7a5a3a', G: '#c9a24f', P: '#8297b0', O: '#8a6a48', X: '#dfc070', R: '#b8664a' },
  parts: { front: { hat: STRAW_HAT }, back: { hat: STRAW_HAT } }
};

const GUARD = {
  id: 'guard', name: 'Guard', blurb: 'The town watch: a kettle helm, a breastplate over a red tunic, a spear and a red cape.',
  body: 'standard', outfit: { torso: 'plate', skirt: 2, sleeves: { A: 'D', C: 'D' }, cloak: true, steady: true }, hair: HAIR_SHORT,
  weapon: staff(['..S..', '.SSS.', '.SSS.', '..S..', '.GGG.'], 26, { lean: 5, behind: true }),
  pal: { K: SKIN, H: '#6b4c32', A: '#b8664a', C: '#c9a24f', L: '#5c4231', G: '#c9a24f', P: '#808a94', O: '#8a6a48', S: '#c4c8c6', D: '#94a0aa', T: '#7a5a3a', V: '#a6533b' },
  parts: { front: { hat: KETTLE_HELM }, back: { hat: KETTLE_HELM } }
};

const MERCHANT = {
  id: 'merchant', name: 'Merchant', blurb: 'A white beard, a long blue robe edged in gold, and a satchel of accounts.',
  body: 'stocky', outfit: { torso: 'robe', legs: 'robe', strap: 1, satchel: true }, hair: HAIR_SHORT,
  pal: { K: SKIN, H: '#e0d6bc', A: '#7f9cb4', C: '#dfc070', L: '#8a6a48', G: '#dfc070', O: '#8a6a48', U: '#b89a70' },
  parts: { front: { hair: BEARD } }
};

const MONK = {
  id: 'monk', name: 'Monk', blurb: 'A plain cowl and a robe of undyed wool tied with a rope.',
  body: 'standard', outfit: { torso: 'robe', legs: 'robe', cord: 4 }, hair: HAIR_SHORT,
  pal: { K: TAN, H: '#8a6a48', A: '#b49872', C: '#9e8360', L: '#e6dcc0', G: '#e6dcc0', O: '#7a5a3a', X: '#a88a64' },
  parts: { front: { hat: COWL.front, mantle: CAPELET.front }, back: { hat: COWL.back, mantle: [CAPELET.back, COWL_POINT] } }
};

const HEALER = {
  id: 'healer', name: 'Healer', blurb: 'Long fair hair, a lilac tunic over white sleeves, and a satchel marked with a cross.',
  body: 'slim', outfit: { torso: 'tunic', strap: -1, satchel: 'cross', sleeves: { A: 'B', C: 'B' } }, hair: HAIR_LONG,
  pal: { K: SKIN, H: '#dfc070', A: '#a898b8', B: '#f0e6cb', C: '#8a7a9a', L: '#9a7a56', G: '#c9a24f', P: '#8a7a9a', O: '#7a5a3a', U: '#f0e6cb', R: '#b8483a' }
};

const NOBLE = {
  id: 'noble', name: 'Noble Lady', blurb: 'A green gown to the floor, a red braid over her shoulder and a gold circlet.',
  body: 'slim', outfit: { torso: 'gown', legs: 'gown', neckline: true, sleeves: { A: 'D', C: 'C', bell: true } }, hair: HAIR_BRAID,
  pal: { K: '#eccaa6', H: '#b4502c', A: '#356a52', C: '#dfc070', D: '#3f7a5e', G: '#e2c262', O: '#5a3a2a', J: '#b8443a', R: '#dfc070' },
  parts: { front: { hat: CIRCLET.front }, back: { hat: CIRCLET.back } }
};

const TOWNSFOLK = [VILLAGER, FARMER, GUARD, MERCHANT, MONK, HEALER, NOBLE];

export { BEARD, CAPELET, CIRCLET, COWL, COWL_POINT, KETTLE_HELM, STRAW_HAT, TOWNSFOLK };
