/* ================= world data ================= */
const BIOME = {
  deep:{name:'Deep ocean', col:'#86a1a0', water:true}, sea:{name:'Open sea', col:'#9db5ab', water:true},
  shallow:{name:'Shallows', col:'#b9c9b0', water:true}, lake:{name:'Lake', col:'#a2bcb0', water:true},
  grass:{name:'Grassland', col:'#d2c891', hrs:2}, forest:{name:'Forest', col:'#a8b273', hrs:3},
  deepwood:{name:'Old-growth forest', col:'#8a9b63', hrs:4}, taiga:{name:'Pinewood', col:'#9ca889', hrs:3},
  hills:{name:'Hills', col:'#d0bb85', hrs:3}, mountain:{name:'Mountains', col:'#bea885', hrs:6},
  peak:{name:'Snow peaks', col:'#e0d9c8', hrs:10}, desert:{name:'Desert', col:'#e6cf95', hrs:4},
  swamp:{name:'Marsh', col:'#aaab7f', hrs:5}, tundra:{name:'Tundra', col:'#d4d4c0', hrs:3}
};
const MOVE = { grass:1, forest:2, deepwood:3, taiga:2, hills:2.4, mountain:9, peak:40, desert:2.6, swamp:4, tundra:2 };
const FLAVOUR = {
  farm:['Strip fields and hedgerows, worked by tenants of the nearest manor.','Barley, beans and a scarecrow wearing a bishop\'s hat.','A patchwork of fields; harvest carts creak along the lanes.'],
  grass:['Rolling meadows dotted with sheep and old boundary stones.','Tall grass hissing in the wind; a drover\'s track cuts through it.','Farmsteads and hedgerows, the fields ripening gold.','A standing stone leans in the middle of a barley field.'],
  forest:['Oak and beech, with deer trails underfoot.','A charcoal-burners\' clearing, long abandoned.','Thick canopy. Woodsmen notch the bark to mark the safe paths.','Bluebells under the beeches, and a hermit\'s smoke rising somewhere.'],
  deepwood:['Ancient trees so close that the noon light comes down green.','Moss-hung boughs and the smell of rot. Few return the way they came.','Someone has carved spirals into the oldest trunks.','The birds go quiet here, all at once.'],
  taiga:['Snow-dusted pines and the tracks of wolves.','Resin and cold air. The trappers\' huts stand empty this season.','A frozen stream threads between the firs.'],
  hills:['Barrow mounds crown the low hills.','Shepherd\'s country, all dry-stone walls and wind.','Old mine adits pock the hillsides.','A beacon tower, unlit for a generation.'],
  mountain:['Scree slopes and goat tracks above the treeline.','A narrow pass, watched by eagles.','Cold springs and the bones of something very large.','Dwarven waymarks, worn almost smooth.'],
  peak:['Eternal snow. The air is thin and the silence total.','A summit where storms are said to be born.','Ice that groans and shifts at night.'],
  desert:['Wind-carved dunes over the bones of a buried road.','Salt flats shimmer. Water is worth more than silver here.','A caravan well, marked by a cairn of bleached horns.'],
  swamp:['Black water, reeds, and lights that drift at dusk.','Stilt-houses of the fen folk, joined by rope bridges.','Leeches, mist, and the croak of a thousand frogs.'],
  tundra:['Frozen plain, lichen and stone under a white sky.','Herds of shaggy elk drift across the frost.','Wind and nothing else, for a day in every direction.'],
  deep:['Open water. Sailors speak of a leviathan in these depths.','Grey swells and a steady westerly.','No bottom has ever been sounded here.'],
  sea:['Fishing grounds, busy with gulls.','A trade lane, marked on pilots\' charts.','Choppy water where two currents meet.'],
  shallow:['Shoals and sandbars. Pilots charge double here.','Kelp beds and fishing skiffs.','A wreck shows its ribs at low tide.'],
  lake:['Still, cold water. The far shore is lost in mist.','Fishermen will not cast nets after dark.','Reed beds and a ferryman\'s jetty.']
};
const KIND = { capital:'Royal capital', city:'City', town:'Market town', village:'Village', keep:'Keep', tower:'Tower', ruin:'Ruin', cave:'Cave', temple:'Temple', lighthouse:'Lighthouse', windmill:'Windmill', mine:'Mine', stones:'Standing stones', lair:'Dragon lair', volcano:'Volcano', wreck:'Shipwreck', outpost:'Forest outpost', hillfort:'Hill fort', waterfall:'Waterfall' };

export { BIOME, FLAVOUR, KIND, MOVE };
