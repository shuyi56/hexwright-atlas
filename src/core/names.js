/* ================= names ================= */
const SA = ['al','am','an','ar','bel','cor','dra','el','er','fal','gal','hal','il','ir','kar','lor','mar','mir','nor','or','ra','sel','tha','tor','ul','val','vel','ys','zan','dor','wen','lin','mor','quel','ser','than','eld','cal','fen','gil','is','ka','lu','os','ro','sa','te','ve','yr','bra','cae','ith'];
const SE = ['a','ar','as','ath','en','eth','ia','il','in','ion','is','or','oth','um','ur','yn','wyn','mar','dell','grim','os','ra','th','ys','orn'];
const PRE = ['Ash','Black','Bright','Cold','Crow','Dun','Elder','Fair','Frost','Gold','Grey','Hollow','Iron','Long','Oak','Raven','Red','Salt','Silver','Stone','Storm','Thorn','White','Wolf','Wyrm','Amber','Briar','Dusk','Ember','Glimmer','Hart','Moon','Rook','Shadow','Star','Sun','Wither','Yew','Gloam','Bramble','Cinder','Hawk','Mist','Rime','Shale','Wind','Hallow','Lark'];
const TSUF = ['ford','holm','mere','wick','stead','bury','gate','hollow','fell','watch','reach','by','ton','dale','moor','barrow','crest','bridge','well','field','combe','ley','thorpe','wold','march','hythe'];
const PSUF = ['port','haven','mouth','strand','quay','harbour'];
const NOUNS = ['Ravens','Storms','Whispers','Pearls','Lanterns','Kings','Sorrows','Bells','Tides','Serpents','Mists','Stars','Lost Ships','Gulls'];
const ADJ = ['Sunless','Weeping','Silver','Shivering','Grey','Drowned','Amber','Restless','Glass','Hollow'];
const ADJ2 = ['Pale','Burning','Silent','Seventh','Hidden','Waning','Golden'];
function makeNamer(rng) {
  const used = new Set();
  const pick = a => a[Math.floor(rng() * a.length)];
  const cap = s => s[0].toUpperCase() + s.slice(1);
  function rawName() {
    for (let t = 0; t < 40; t++) {
      let s = pick(SA); if (rng() < 0.5) s += pick(SA); s += pick(SE);
      s = s.replace(/([aeiouy])\1+/g, '$1').replace(/([^aeiouy])\1\1+/g, '$1$1').replace(/^([aeiou])([aeiou])/, '$1');
      if (s.length >= 4 && s.length <= 10) return cap(s);
    }
    return 'Varn';
  }
  function uniq(fns) { for (let t = 0; t < 60; t++) { const s = pick(fns)(); if (!used.has(s)) { used.add(s); return s; } } return pick(fns)(); }
  return { pick, rawName, uniq, P: () => pick(PRE), name: () => uniq([rawName]) };
}

export { ADJ, ADJ2, NOUNS, PSUF, TSUF, makeNamer };
