import { BOW, DAGGER, HAIR_LONG, staff } from './parts.js';
import { CIRCLET } from './hats.js';

/* ================= character sprites: the elves =================
   The people of the elven wood (tiles/elven.js), drawn like the jobs in roster.js: a build, an outfit cut by
   body.js, and hand-drawn parts on its landmarks. What makes them elves is shared: long pointed ears swept back
   and up out of the hair (ELF_EARS, worn in the hat slot so they lie over the hair, and offered by the character
   maker), and long straight hair falling to the middle of the back (ELF_HAIR). Fair skin, silver, gold and
   leaf-green, verdigris steel and white robes, after the hall's moonstone and copper.

   - The ranger: a leaf-green tunic and a grey-green cloak, a quiver at her back and a longbow of pale wood.
   - The warden: verdigris plate over a sea-green tunic and skirt, a long cloak, and a glaive whose blade curves
     like a leaf; she thrusts with it.
   - The sage: a white gown to the floor hemmed in gold, bell sleeves, a gold circlet over silver hair, and a staff
     whose branches cradle a pale crystal; his spells are moonlight.
   - The elf lady: a gown of pale sky blue with a square neckline and sleeves of a paler blue, raven hair, a circlet.
   - The dark elf (an enemy): ash-violet skin, white hair, eyes like embers, black leather and a dagged cape, a
     dagger in each hand.

   Letters as in parts.js and roster.js. */

/* Long ears, swept back and up to a point. In front only the near ear shows, rising behind the cheek out over the
   hair; from behind both stand out from the sides of the head. The inner ear is the skin's shadow (k). */
const ELF_EARS = {
  front: { x: 21, y: 6, rows: [
    '....K',
    '...Kk',
    '..KKk',
    '.KKk.',
    'KKk..',
    'Kk...'] },
  back: { x: 5, y: 6, rows: [
    'K....................K',
    'kK..................Kk',
    '.kK................Kk.',
    '..kKK............KKk..',
    '....kK..........Kk....'] } };

/* Long hair: in front, the long cut (its near lock falling beside the cheek); from behind, every lock falls
   straight down the back past the shoulder blades, ending in points. */
const FALL = ['.HQHHHQHHHQHHH..', '.HQHHHQHHHQHHH..', '.HHQHHHQHHHQHH..', '..HQHHHQHHHQHH..', '..HQHHHQHHHQH...', '..HHQHHHQHHQH...', '...HQHHHQHHQ....', '...HQH.HQH.HQ...', '....H...H...H...'];
const ELF_HAIR = { front: HAIR_LONG.front, back: { ...HAIR_LONG.back, rows: [...HAIR_LONG.back.rows.slice(0, 16), ...FALL] } };

/* a quiver slung across the back, fletched in gold: in front its feathers show over the far shoulder */
const QUIVER = {
  front: { x: 6, y: 12, rows: ['.R.R', 'RFRF', '.LL.', '.LL.', '.LL.'] },
  back: { x: 11, y: 12, rows: ['.......RFR.', '......RFRF.', '.......LLL.', '......LLL..', '......LLL..', '.....LLL...', '.....LLL...', '....LLL....', '....LLL....', '...LLL.....', '...LLL.....', '..LLL......', '..lll......'] } };

/* the glaive's head: a long blade curving like a leaf, its edge lit, on a gold socket */
const GLAIVE = staff([
  '...Y.',
  '..YY.',
  '..YyY',
  '.YyY.',
  '.YyY.',
  '.YyY.',
  'YyY..',
  '.YY..',
  '.GGG.',
  '..G..'], 28, { lean: 5, behind: true });
/* the sage's staff: two branches of pale wood curling round a crystal, held at the side (behind the flowing hair
   from the back, where a staff held forward would cross it) and cast with */
const SAGE_STAFF = staff([
  'T...T',
  'TTJT.',
  '.JJJT',
  'TJJJ.',
  '.TJTT',
  '..T..',
  '..T..'], 21, { behind: true, attack: 'cast' });

const SKIN_ELF = '#f0d4b4';
const RANGER = {
  id: 'elfranger', name: 'Elf Ranger', blurb: 'A grey-green cloak, a quiver of gold-fletched arrows and a longbow of pale wood.', elf: true,
  body: 'slim', outfit: { torso: 'tunic', strap: -1, cloak: true }, hair: ELF_HAIR, weapon: BOW,
  pal: { K: SKIN_ELF, H: '#e6d6a0', A: '#7f9a5a', B: '#e8e4d0', C: '#c9a24f', L: '#7a5a3a', G: '#c9a24f', P: '#6c7458', O: '#5c4a36', T: '#e2d6b6', F: '#efe6d2', V: '#7d8f7a', R: '#d9b44a', S: '#c8c9c2' },
  parts: { front: { behind: QUIVER.front, hat: ELF_EARS.front }, back: { behind: QUIVER.back, hat: ELF_EARS.back } }
};
const WARDEN = {
  id: 'elfwarden', name: 'Elf Warden', blurb: 'Verdigris plate, a long sea-green cloak and a leaf-bladed glaive: the wood\'s first guard.', elf: true,
  body: 'tall', outfit: { torso: 'plate', skirt: 3, sleeves: { A: 'S', C: 'G' }, cloak: true, steady: true }, hair: ELF_HAIR, weapon: GLAIVE,
  pal: { K: SKIN_ELF, H: '#5a4a3e', A: '#4f7a6c', C: '#c9a24f', L: '#5c4a36', G: '#c9a24f', P: '#9fb0a8', O: '#6f7f78', S: '#b6c6bc', T: '#e2d6b6', V: '#3f6a5a', J: '#7fb8c0' },
  parts: { front: { hat: [CIRCLET.front, ELF_EARS.front] }, back: { hat: [CIRCLET.back, ELF_EARS.back] } }
};
const SAGE = {
  id: 'elfsage', name: 'Elf Sage', blurb: 'A white robe hemmed in gold, silver hair under a circlet, and a staff that holds the moon in a crystal.', elf: true, spell: '#cdeee2',
  body: 'tall', outfit: { torso: 'gown', legs: 'gown', sleeves: { bell: true }, steady: true }, hair: ELF_HAIR, weapon: SAGE_STAFF,
  pal: { K: SKIN_ELF, H: '#c8ccd0', A: '#efebe0', C: '#c9a24f', L: '#8a6a4a', G: '#c9a24f', O: '#8a7a5a', T: '#e2d6b6', J: '#a8e0d4', D: '#d8d2c2' },
  parts: { front: { hat: [CIRCLET.front, ELF_EARS.front] }, back: { hat: [CIRCLET.back, ELF_EARS.back] } }
};
const LADY = {
  id: 'elflady', name: 'Elf Lady', blurb: 'A gown of pale sky blue, raven hair to her waist and a circlet set with a sea-green stone.', elf: true,
  body: 'slim', outfit: { torso: 'gown', legs: 'gown', neckline: true, sleeves: { A: 'D', C: 'C', bell: true } }, hair: ELF_HAIR,
  pal: { K: SKIN_ELF, H: '#3e3440', A: '#a9bcd0', D: '#c9d6e2', C: '#e2c262', G: '#e2c262', O: '#6a5a6a', L: '#8a7a6a', J: '#7fb8c0', R: '#e2c262' },
  parts: { front: { hat: [CIRCLET.front, ELF_EARS.front] }, back: { hat: [CIRCLET.back, ELF_EARS.back] } }
};
const DARK_ELF = {
  id: 'darkelf', name: 'Dark Elf', blurb: 'Ash-violet skin, white hair and ember eyes: a blade in each hand, out of the deep wood.', elf: true, enemy: true,
  body: 'slim', outfit: { torso: 'tunic', vest: true, cloak: 'dagged' }, hair: ELF_HAIR, weapon: DAGGER, shield: DAGGER,
  pal: { K: '#8a7e9c', H: '#ebe8f0', W: { flat: '#e8606e' }, A: '#4a4458', B: '#5e566c', C: '#8a4a6a', D: '#2f2a38', L: '#3a2e36', G: '#b0a8c0', P: '#3a3544', O: '#2a2430', S: '#c8c9d2', V: '#2a2633' },
  parts: { front: { hat: ELF_EARS.front }, back: { hat: ELF_EARS.back } }
};

const ELVES = [RANGER, WARDEN, SAGE, LADY, DARK_ELF];

export { ELF_EARS, ELF_HAIR, ELVES };
