/* ================= character sprites: headgear =================
   Every hat, hood and helm that more than one character can wear, and the beard, each a hand-drawn part (or a
   front and back pair) hung on the head (a capelet on the neck), as in parts.js. The jobs wear their own (the
   archer's cap, the thief's bandana, the black mage's hat), the townsfolk theirs, and the character maker
   (custom.js) offers them all. Letters: X the hat's cloth or straw, R a band or feather, S steel, G gold, J a
   jewel, H hair (the beard). */

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

/* the archer's cap: a green cap peaked forward, a red feather standing up behind */
const FEATHER_CAP = {
  front: { x: 7, y: 0, rows: [
    '..............R.',
    '.........XXXXRR.',
    '.......XXXXXXXRR',
    '.....XXXXXXXXXXR',
    '....XXXXXXXXXXXX',
    '...XXXXXXXXXXXXX',
    '..xxxxxxxxxxxXXX',
    '...........XXXX.',
    '............XX..'] },
  back: { x: 7, y: 0, rows: [
    '.R..............',
    'RR.XXXXX........',
    'RXXXXXXXXXX.....',
    'RXXXXXXXXXXXX...',
    'XXXXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.xxxxxxxxxxxxxx.'] } };

/* the thief's bandana: a red cloth knotted at the back, its ends trailing behind the ear */
const BANDANA = {
  front: { x: 8, y: 3, rows: [
    '....RRRRRRR.....',
    '..RRRRRRRRRRRR..',
    '.RRRRRRRRRRRRRR.',
    '.rrrrrrrrrRRRRRR',
    '..........RRRRRR',
    '............RRRR',
    '.............RR.',
    '.............RR.',
    '..............R.'] },
  back: { x: 8, y: 3, rows: [
    '.....RRRRRR.....',
    '..RRRRRRRRRRRR..',
    '.RRRRRRRRRRRRRR.',
    '.rrrrrrrrrrrrrr.',
    '......RRR.......',
    '.......RR.......',
    '.......RRR......',
    '........RR......',
    '........R.......'] } };

/* the black mage's hat: a wide brim and a pointed crown with a flopped tip, banded in gold */
const WIZARD_HAT = {
  front: { x: 4, y: 0, rows: [
    '..............XXx.......',
    '............XXXx........',
    '...........XXXX.........',
    '..........XXXXXX........',
    '.........XXXXXXXX.......',
    '........XXXXXXXXXX......',
    '.......GGGGGGGGGGGG.....',
    '......XXXXXXXXXXXXXX....',
    '..XXXXXXXXXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXXXXXXXXXXX',
    '..xxxxxxxxxxxxxxxxxxxx..'] },
  back: { x: 4, y: 0, rows: [
    '.......xXX..............',
    '........xXXX............',
    '.........XXXX...........',
    '........XXXXXX..........',
    '.......XXXXXXXX.........',
    '......XXXXXXXXXX........',
    '.....GGGGGGGGGGGG.......',
    '....XXXXXXXXXXXXXX......',
    '..XXXXXXXXXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXXXXXXXX..'] } };

export { BANDANA, BEARD, CAPELET, CIRCLET, COWL, COWL_POINT, FEATHER_CAP, KETTLE_HELM, STRAW_HAT, WIZARD_HAT };
