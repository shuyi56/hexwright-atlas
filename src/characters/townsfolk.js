import { fromSpec } from './custom.js';
import { SKIN, TAN } from './parts.js';

/* ================= character sprites: the townsfolk =================
   The people of the map's towns and villages: a villager, a farmer, a guard, a merchant, a monk, a healer and a
   noble lady. Each is a spec (custom.js), the same choices and colours the character maker offers, so they are
   drawn like the jobs in roster.js and the maker can start from any of them. */
const SPECS = [
  { id: 'villager', name: 'Villager', blurb: 'A linen shirt under a green vest: the people the map is for.',
    build: 'standard', clothes: 'vest', hair: 'short',
    colours: { skin: SKIN, hair: '#8a6a48', cloth: '#e6d8b6', shirt: '#efe3c4', trim: '#d3c199', second: '#8fa462', belt: '#7a5a3a', gold: '#c9a24f', legs: '#a68a62', boots: '#7a5a3a' } },
  { id: 'farmer', name: 'Farmer', blurb: 'A straw hat and bib-and-brace overalls, out in all weathers.',
    build: 'stocky', clothes: 'overalls', hair: 'short', hat: 'straw',
    colours: { skin: TAN, hair: '#9a7a56', cloth: '#a6b878', shirt: '#efe3c4', trim: '#8c9e62', second: '#8297b0', belt: '#7a5a3a', gold: '#c9a24f', boots: '#8a6a48', hat: '#dfc070', accent: '#b8664a' } },
  { id: 'guard', name: 'Guard', blurb: 'The town watch: a kettle helm, a breastplate over a red tunic, a spear and a red cape.',
    build: 'standard', clothes: 'plate', sleeves: 'second', hair: 'short', hat: 'kettle', cape: 'cape', held: 'spear',
    colours: { skin: SKIN, hair: '#6b4c32', cloth: '#b8664a', trim: '#c9a24f', belt: '#5c4231', gold: '#c9a24f', legs: '#808a94', boots: '#8a6a48', steel: '#c4c8c6', second: '#94a0aa', wood: '#7a5a3a', cape: '#a6533b' } },
  { id: 'merchant', name: 'Merchant', blurb: 'A white beard, a long blue robe edged in gold, and a satchel of accounts.',
    build: 'stocky', clothes: 'robe', hair: 'short', beard: 'full', satchel: 'satchel',
    colours: { skin: SKIN, hair: '#e0d6bc', cloth: '#7f9cb4', trim: '#dfc070', belt: '#8a6a48', gold: '#dfc070', boots: '#8a6a48', bag: '#b89a70' } },
  { id: 'monk', name: 'Monk', blurb: 'A plain cowl and a robe of undyed wool to the floor, tied with a rope.',
    build: 'standard', clothes: 'gown', rope: 'rope', cut: 'bell', hair: 'short', hat: 'cowl',
    colours: { skin: TAN, hair: '#8a6a48', cloth: '#b49872', trim: '#9e8360', belt: '#e6dcc0', gold: '#e6dcc0', boots: '#7a5a3a', hat: '#a88a64' } },
  { id: 'healer', name: 'Healer', blurb: 'Long fair hair, a lilac tunic over white sleeves, and a satchel marked with a cross.',
    build: 'slim', clothes: 'tunic', sleeves: 'second', hair: 'long', satchel: 'cross',
    colours: { skin: SKIN, hair: '#dfc070', cloth: '#a898b8', shirt: '#f0e6cb', second: '#f0e6cb', trim: '#8a7a9a', belt: '#9a7a56', gold: '#c9a24f', legs: '#8a7a9a', boots: '#7a5a3a', bag: '#f0e6cb', accent: '#b8483a' } },
  { id: 'noble', name: 'Noble Lady', blurb: 'A green gown to the floor, a red braid over her shoulder and a gold circlet.',
    build: 'slim', clothes: 'gown', neckline: 'square', sleeves: 'second', cut: 'bell', hair: 'braid', hat: 'circlet',
    colours: { skin: '#eccaa6', hair: '#b4502c', cloth: '#356a52', trim: '#dfc070', second: '#3f7a5e', gold: '#e2c262', boots: '#5a3a2a', jewel: '#b8443a', accent: '#dfc070' } }];
const TOWNSFOLK = SPECS.map(s => fromSpec(s, { blurb: s.blurb }));

export { TOWNSFOLK };
