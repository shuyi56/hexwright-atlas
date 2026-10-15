/* ================= town view: what people say and what things look like =================
   A line for whoever the hero talks to, picked by who they are (their sprite, else their side in the unit data),
   turning through their lines on each talk; and a line for a piece or ground the hero looks at. {place} is the
   map's name. No DOM. */
const SAYS = {
  villager: ['Welcome to {place}! Not much happens here, and we like it that way.', 'The well water is the sweetest for miles.', 'Mind the geese by the pond. They bite.'],
  farmer: ['Rain tomorrow, if my knee is right.', 'The wheat came in early this year.', 'You look like you could use a good meal.'],
  guard: ['Keep your blade sheathed inside the walls.', 'All quiet. Too quiet, if you ask me.', 'Halt! Oh, it is you. Carry on.'],
  merchant: ['Finest wares in {place}, at the fairest prices!', 'Come back when you have coin to spend.', 'Silk from the south, salt from the coast. Have a look!'],
  monk: ['Peace be with you, traveller.', 'The bell rings at dusk. Do stop in.', 'Patience is its own reward.'],
  healer: ['Let me look at those scrapes.', 'Feverfew for headaches, yarrow for cuts.', 'Rest is the best medicine. Then soup.'],
  noble: ['Do you know who I am? No? How refreshing.', 'The harvest ball is next week. You are not invited.', '{place} was my grandfather\'s, and his before him.'],
  smith: ['Horseshoes, hinges, a good blade if you can wait a week. What will it be?', 'Mind the sparks. And the anvil. And me.', 'Iron is honest: heat it, beat it, and it does as it is told.'],
  alchemist: ['Touch nothing green. Or violet. Actually, touch nothing.', 'A draught for courage, a salve for burns, and one for warts. Never mix them up.', 'Lead into gold? Do not believe all you hear about {place}.'],
  goblin: ['Shinies! Give shinies!', 'Grrk. Go away.'],
  bandit: ['Your purse or your life. Actually, both.', 'Keep walking, friend.'],
  orc: ['RAAAGH!', 'Puny. Very puny.'],
  skeleton: ['...', '*rattle*'],
  wolf: ['Grrrr...', '*sniff sniff*'],
  slime: ['*blorp*', '*squelch*'],
  elfranger: ['The trees spoke of your coming. They did not say you would be so loud.', 'Walk softly here. The wood is listening.', 'I have watched this road for three hundred winters.'],
  elfwarden: ['None pass the moonwell armed. Save you, it seems.', 'The deep wood stirs. Keep to the paths.', 'Our blades are old, but they remember.'],
  elfsage: ['The moon rises full tonight. Come to the well and see.', 'Every leaf that falls is written down, somewhere.', 'Patience. Even the mallorn was once a seed.'],
  elflady: ['Welcome to {place}, traveller. Rest beneath the gold.', 'Have you heard the singing in the high flets at dusk?', 'The lanterns here never go out. We forgot how to make them stop.'],
  darkelf: ['The light here burns my eyes. You will do instead.', 'Your kin cast us out. I have come to return the favour.']
};
const GROUP = {
  characters: ['Fine day for a walk around {place}.', 'Have you seen the market? Busy as ever.', 'Stay out of trouble, now.'],
  enemies: ['Grrr...', 'You should not be here.']
};
function lineFor(sprite, group, place, n = 0) {
  const lines = SAYS[sprite] || GROUP[group] || GROUP.characters;
  return lines[(n - 1 + lines.length) % lines.length].replace('{place}', place || 'this town');
}
const SIGHTS = {
  well: 'A deep stone well. Somewhere far below, water glints.', signpost: 'The sign reads: {place}.', haystack: 'A great stack of hay. Something rustles inside.',
  barrels: 'Barrels of cider, by the smell.', crates: 'Crates, nailed shut.', statue: 'A statue of someone very important, now mostly remembered by pigeons.',
  graves: 'Old gravestones. The names are worn away.', campfire: 'The fire crackles warmly.', stall: 'A market stall, piled with goods.',
  bookshelf: 'Rows of dusty books. Nothing you can read in a hurry.', chest: 'A sturdy chest. It is locked.', bed: 'A soft bed. Not now.',
  hearth: 'A fire burns low in the hearth.', wardrobe: 'Clothes, mothballs, and one odd boot.', cauldron: 'Something bubbles in the pot. It smells of onions.',
  throne: 'An empty throne, waiting.', altar: 'Candles flicker on the altar.', lamppost: 'An iron lamp on a post.', obelisk: 'Strange marks run up the obelisk.',
  moonwell: 'The water holds the moon, even at noon.', elvenlantern: 'A pale lantern on a silver crook. It gives no heat at all.', mallorn: 'A mallorn. Its leaves are gold, and its bark is silver.',
  willow: 'A silver willow, its strands brushing the ground.', moonflowers: 'Moonflowers, glowing faintly.', flet: 'A round house high in the tree. A rope ladder has been drawn up.',
  elvenhall: 'The hall\'s doors are carved with leaves. They are shut.', elvenspire: 'A white spire. Someone is singing at the top.',
  elvenpavilion: 'An open pavilion. A lantern turns slowly under its roof.', elvenrotunda: 'Light falls through the tracery in long gold bars. Inside, someone is reading aloud.',
  blacksmith: 'Heat rolls out of the open forge. Somewhere inside a hammer rings.', alchemist: 'Bottles glow in the shop window: green, violet, amber. Something inside goes *pop*.',
  smithcounter: 'Horseshoes by the pair, nails by the box, and a sword nobody has paid for yet.', alchcounter: 'Brass scales, a ledger in a crabbed hand, and a hundred little drawers below.',
  forge: 'The coals glow white at the heart. Too hot to stand close.', anvil: 'A heavy anvil, its face polished by years of blows.', quench: 'Black water, still warm. It hisses when you touch it.',
  grindstone: 'A grindstone, its wheel worn hollow in the middle.', toolrack: 'Hammers and tongs, each in its place.', armorstand: 'A mail shirt, freshly mended. It is not for sale.',
  ironstock: 'Coal and bars of iron, waiting their turn.', alchemybench: 'Flasks, coils of glass and a book of crabbed notes. Something is distilling, drop by drop.',
  brewcauldron: 'A green brew, bubbling. It smells of mint and thunder.', potionshelf: 'Potions in every colour, each labelled in a tiny hand.', herbrack: 'Bunches of herbs hung up to dry: sage, feverfew, lavender.',
  apothecary: 'A hundred little drawers, each with its label: newt, nightshade, nutmeg...',
  elvenmanor: 'Every window is filled with stone lace. A song drifts down from the balcony.', elvenarch: 'An archway of moonstone, carved as fine as frost.'
};
function sightFor(asset, terrain, place) {
  if (asset) return (SIGHTS[asset.id] || (asset.group === 'Buildings' ? `The ${asset.label.toLowerCase()} is shut tight.` : asset.group === 'Nature' ? `${asset.label}.` : `A ${asset.label.toLowerCase()}.`)).replace('{place}', place || 'this town');
  if (!terrain) return null;
  if (terrain.water) return 'The water is cool and clear.';
  if (terrain.glow) return 'Lava! Best keep back.';
  return null;
}

export { lineFor, sightFor };
