/* ================= character sprites: the choices a made character is built from =================
   Every choice the character maker offers, and every colour, split in two: the body (build, hair, ears, beard, skin
   and hair colour), which is the character's own, and the outfit (clothes, hat, gear and their colours), which a
   class can give it (data/classes.ts). Pure data with no imports, so the class data can read it in Node too. */
/* each choice: its options as [value, label], the first being the default */
const CHOICES = {
  build: [['standard', 'Standard'], ['slim', 'Slim'], ['stocky', 'Stocky'], ['tall', 'Tall'], ['small', 'Small']],
  clothes: [['vest', 'Shirt and vest'], ['tunic', 'Tunic'], ['overalls', 'Overalls'], ['plate', 'Breastplate'], ['robe', 'Long coat and sash'], ['gown', 'Gown to the floor']],
  sleeves: [['cloth', 'Same cloth'], ['second', 'Second colour']],
  cut: [['plain', 'Plain'], ['bell', 'Bell']],
  neckline: [['high', 'High'], ['square', 'Square']],
  rope: [['none', 'None'], ['rope', 'Rope belt']],
  hair: [['short', 'Short'], ['tousled', 'Tousled'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['bun', 'Low bun'], ['braid', 'Braid'], ['flowing', 'Flowing (elven)']],
  ears: [['round', 'Round'], ['pointed', 'Pointed (elven)']],
  hat: [['none', 'None'], ['straw', 'Straw hat'], ['kettle', 'Kettle helm'], ['circlet', 'Circlet'], ['cowl', 'Cowl'], ['cap', 'Feathered cap'], ['bandana', 'Bandana'], ['wizard', 'Wizard hat']],
  beard: [['none', 'None'], ['full', 'Full beard']],
  cape: [['none', 'None'], ['cape', 'Cape'], ['dagged', 'Dagged cape']],
  satchel: [['none', 'None'], ['satchel', 'Satchel'], ['cross', 'Satchel with a cross']],
  held: [['none', 'Nothing'], ['sword', 'Sword'], ['dagger', 'Dagger'], ['daggers', 'Two daggers'], ['spear', 'Spear'], ['staff', 'Staff'], ['bow', 'Bow']],
  shield: [['none', 'None'], ['kite', 'Kite shield'], ['buckler', 'Buckler']] };
/* the choices that only mean something with some clothes or gear: the neckline and the rope belt on a gown, a
   shield in the hand a second dagger would take */
const APPLIES = {
  neckline: s => s.clothes === 'gown',
  rope: s => s.clothes === 'gown',
  shield: s => s.held !== 'daggers' };
/* every colour a spec sets: [key, the material letter it paints, label] */
const COLOURS = [
  ['skin', 'K', 'Skin'], ['hair', 'H', 'Hair'], ['cloth', 'A', 'Cloth'], ['shirt', 'B', 'Shirt'], ['second', 'D', 'Second cloth'],
  ['trim', 'C', 'Trim and cuffs'], ['belt', 'L', 'Belt, straps and rope'], ['gold', 'G', 'Buckles and gold'], ['legs', 'P', 'Legs'],
  ['boots', 'O', 'Boots and shoes'], ['hat', 'X', 'Hat or hood'], ['accent', 'R', 'Band, feather and cross'], ['steel', 'S', 'Steel'],
  ['bag', 'U', 'Bag'], ['shield', 'N', 'Shield'], ['wood', 'T', 'Wood'], ['string', 'F', 'Bowstring'], ['jewel', 'J', 'Jewel'], ['cape', 'V', 'Cape']];
const DEFAULT_COLOURS = {
  skin: '#ecc39a', hair: '#8a6a48', cloth: '#e6d8b6', shirt: '#efe3c4', second: '#8fa462', trim: '#d3c199', belt: '#7a5a3a', gold: '#c9a24f',
  legs: '#a68a62', boots: '#7a5a3a', hat: '#dfc070', accent: '#b8664a', steel: '#c4c8c6', bag: '#b89a70', shield: '#6f8faa',
  wood: '#8a6238', string: '#efe6d2', jewel: '#b8443a', cape: '#a6533b' };
/* the body is the character's own; everything else is the outfit, which its class can give it */
const BODY_KEYS = ['build', 'hair', 'ears', 'beard'];
const OUTFIT_KEYS = Object.keys(CHOICES).filter(k => !BODY_KEYS.includes(k));
const BODY_COLOURS = ['skin', 'hair'];
const OUTFIT_COLOURS = COLOURS.map(([k]) => k).filter(k => !BODY_COLOURS.includes(k));
const HEX = /^#[0-9a-f]{6}$/i;
/* an outfit from anything: each outfit choice one of its options and each outfit colour #rrggbb, anything missing
   or wrong from the defaults; a spec's own outfit when given one */
function cleanOutfit(J) {
  const src = J && typeof J === 'object' ? J : {}, o = {};
  for (const k of OUTFIT_KEYS) o[k] = CHOICES[k].some(([v]) => v === src[k]) ? src[k] : CHOICES[k][0][0];
  o.colours = {};
  for (const k of OUTFIT_COLOURS) { const c = src.colours && src.colours[k]; o.colours[k] = typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : DEFAULT_COLOURS[k]; }
  return o;
}

export { APPLIES, BODY_COLOURS, BODY_KEYS, CHOICES, COLOURS, DEFAULT_COLOURS, OUTFIT_COLOURS, OUTFIT_KEYS, cleanOutfit };
