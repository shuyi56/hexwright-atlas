import { fromSpec } from './custom.js';
import { SKIN, TAN } from './parts.js';

/* ================= character sprites: the townsfolk =================
   The people of the map's towns and villages: a villager, a farmer, a guard, a merchant, a monk, a healer, a noble
   lady, and the shopkeepers of the smithy and the alchemist's shop. Each is a spec (custom.js), the same choices and colours the character maker offers, so they are
   drawn like the jobs in roster.js and the maker can start from any of them. */
const SPECS = [
  { id: 'villager', name: 'Villager', blurb: 'A linen shirt under a green vest: the people the map is for.',
    build: 'standard', clothes: 'vest', hair: 'short',
    colours: { skin: SKIN, hair: '#7a5c3e', cloth: '#a48e6a', shirt: '#a48e6a', trim: '#9e8a66', second: '#647f46', belt: '#5c4231', gold: '#c9a24f', legs: '#806446', boots: '#634830' } },
  { id: 'farmer', name: 'Farmer', blurb: 'Rolled sleeves and bib-and-brace overalls, out in all weathers.',
    build: 'standard', clothes: 'overalls', hair: 'tousled',
    colours: { skin: TAN, hair: '#9c7a4e', cloth: '#77905a', shirt: '#efe3c4', trim: '#c2a274', second: '#5a7090', belt: '#5c4231', gold: '#c9a24f', boots: '#6a4e34' } },
  { id: 'guard', name: 'Guard', blurb: 'The town watch: a kettle helm, a breastplate over a red tunic, a spear and a red cape.',
    build: 'standard', clothes: 'plate', sleeves: 'second', hair: 'short', hat: 'kettle', cape: 'cape', held: 'spear',
    colours: { skin: SKIN, hair: '#6b4c32', cloth: '#b8664a', trim: '#c9a24f', belt: '#5c4231', gold: '#c9a24f', legs: '#808a94', boots: '#8a6a48', steel: '#c4c8c6', second: '#94a0aa', wood: '#7a5a3a', cape: '#a6533b' } },
  { id: 'merchant', name: 'Merchant', blurb: 'A grey beard, a long blue coat edged in gold, and a satchel of accounts.',
    build: 'stocky', clothes: 'robe', cut: 'bell', hair: 'short', beard: 'full', satchel: 'satchel',
    colours: { skin: SKIN, hair: '#a39a86', cloth: '#536c8c', second: '#8a4436', trim: '#c09a4a', belt: '#6b4c32', gold: '#c09a4a', boots: '#6a4e34', bag: '#9a7e58' } },
  { id: 'monk', name: 'Monk', blurb: 'A plain cowl and a robe of undyed wool to the floor, tied with a rope.',
    build: 'standard', clothes: 'gown', rope: 'rope', cut: 'bell', hair: 'short', hat: 'cowl',
    colours: { skin: TAN, hair: '#8a6a48', cloth: '#b49872', trim: '#9e8360', belt: '#e6dcc0', gold: '#e6dcc0', boots: '#7a5a3a', hat: '#a88a64' } },
  { id: 'healer', name: 'Healer', blurb: 'Long fair hair, a lilac tunic over white sleeves, and a satchel marked with a cross.',
    build: 'slim', clothes: 'tunic', sleeves: 'second', hair: 'long', satchel: 'cross',
    colours: { skin: SKIN, hair: '#dfc070', cloth: '#a898b8', shirt: '#f0e6cb', second: '#f0e6cb', trim: '#8a7a9a', belt: '#9a7a56', gold: '#c9a24f', legs: '#8a7a9a', boots: '#7a5a3a', bag: '#f0e6cb', accent: '#b8483a' } },
  { id: 'noble', name: 'Noble Lady', blurb: 'A green gown to the floor, a red braid over her shoulder and a gold circlet.',
    build: 'slim', clothes: 'gown', neckline: 'square', sleeves: 'second', cut: 'bell', hair: 'braid', hat: 'circlet',
    colours: { skin: '#eccaa6', hair: '#b4502c', cloth: '#356a52', trim: '#dfc070', second: '#3f7a5e', gold: '#e2c262', boots: '#5a3a2a', jewel: '#b8443a', accent: '#dfc070' } },
  { id: 'smith', name: 'Smith', blurb: 'Broad as a door, sleeves rolled, a soot-dark leather apron, a beard and a sweatband.',
    build: 'stocky', clothes: 'overalls', hair: 'short', beard: 'full', hat: 'bandana',
    colours: { skin: TAN, hair: '#3e2e22', cloth: '#5e4430', shirt: '#cdb894', trim: '#4a3424', second: '#4a3424', belt: '#3e2e22', gold: '#8a8f90', legs: '#4e4a44', boots: '#3e2e22', hat: '#7a3a2a' } },
  { id: 'alchemist', name: 'Alchemist', blurb: 'A long violet coat with a green sash, a grey beard to the chest and a satchel of phials.',
    build: 'tall', clothes: 'robe', cut: 'bell', hair: 'long', beard: 'full', satchel: 'satchel',
    colours: { skin: SKIN, hair: '#b8b2a4', cloth: '#5a4a7a', second: '#3f7a5e', trim: '#c9a24f', belt: '#3f7a5e', gold: '#c9a24f', boots: '#4a3424', bag: '#7a5a3a' } }];
const TOWNSFOLK = SPECS.map(s => fromSpec(s, { blurb: s.blurb }));

export { TOWNSFOLK };
