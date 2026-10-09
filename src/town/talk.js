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
  goblin: ['Shinies! Give shinies!', 'Grrk. Go away.'],
  bandit: ['Your purse or your life. Actually, both.', 'Keep walking, friend.'],
  orc: ['RAAAGH!', 'Puny. Very puny.'],
  skeleton: ['...', '*rattle*'],
  wolf: ['Grrrr...', '*sniff sniff*'],
  slime: ['*blorp*', '*squelch*']
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
  throne: 'An empty throne, waiting.', altar: 'Candles flicker on the altar.', lamppost: 'An iron lamp on a post.', obelisk: 'Strange marks run up the obelisk.'
};
function sightFor(asset, terrain, place) {
  if (asset) return (SIGHTS[asset.id] || (asset.group === 'Buildings' ? `The ${asset.label.toLowerCase()} is shut tight.` : asset.group === 'Nature' ? `${asset.label}.` : `A ${asset.label.toLowerCase()}.`)).replace('{place}', place || 'this town');
  if (!terrain) return null;
  if (terrain.water) return 'The water is cool and clear.';
  if (terrain.glow) return 'Lava! Best keep back.';
  return null;
}

export { lineFor, sightFor };
