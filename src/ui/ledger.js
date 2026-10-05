import { state } from './state.js';
import { COLS, CX, CY, N, R, hexDist, hexNo, hexPath } from '../core/geometry.js';
import { mulberry32 } from '../core/random.js';
import { drawSerpent, drawShip } from '../render/sea.js';
import { drawSettlement } from '../render/settlements.js';
import { ROAD_STYLE, roadLine, texRoad } from '../render/rivers-roads.js';
import { $ } from './state.js';
import { requestDraw } from './draw.js';
import { flyTo } from './view.js';
import { openCity } from './city-view.js';
import { BIOME, FLAVOUR, KIND } from '../world/data.js';
import { INK } from '../render/palette.js';
import { drawTree } from '../render/trees.js';
import { drawFarm, tuft } from '../render/ground.js';
import { drawTerrainIcon } from '../render/terrain.js';

/* ================= ledger ================= */
const tabs = ['survey', 'places', 'key'];
function showTab(t) { tabs.forEach(n => { $('tab-' + n).setAttribute('aria-selected', String(n === t)); $('pane-' + n).hidden = n !== t; }); }
tabs.forEach(n => $('tab-' + n).addEventListener('click', () => showTab(n)));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function nearestSettlement(i, maxD) { let b = null, bd = maxD + 1; for (const s of state.map.settle) { if (!['capital', 'city', 'town', 'village'].includes(s.kind)) continue; const d = hexDist(i, s.i); if (d < bd) { bd = d; b = s; } } return b ? [b, bd] : null; }
function terrainName(i) { return state.map.farm[i] ? 'Farmland' : BIOME[state.map.B[i]].name; }
function survey(i) {
  const b = state.map.B[i], bio = BIOME[b], r = mulberry32(state.map.seedHash ^ (i * 2654435761));
  const s = state.map.sAt[i] >= 0 ? state.map.settle[state.map.sAt[i]] : null;
  const fk = state.map.farm[i] ? 'farm' : b;
  let flavour = FLAVOUR[fk][Math.floor(r() * FLAVOUR[fk].length)];
  const o = state.map.ornAt.get(i);
  if (o) flavour = o.type === 'ship' ? 'A carrack under full sail, bound for the capital with wine and wool.' : 'Here be serpents. Pilots give this water a wide berth.';
  const facts = [['Terrain', terrainName(i)]];
  let title, kind;
  if (bio.water) {
    const lake = state.map.lakeOf[i] >= 0 ? state.map.lakes[state.map.lakeOf[i]] : null;
    const sea = state.map.seaOf[i] >= 0 ? state.map.seas[state.map.seaOf[i]] : null;
    title = s ? s.name : lake ? (lake.name || 'A nameless tarn') : sea ? sea.name : bio.name;
    kind = s ? KIND[s.kind] + (sea ? ` · ${sea.name}` : '') : lake ? (lake.hyd && lake.hyd.salt ? 'Salt lake, no outlet' : lake.hyd && lake.hyd.out ? 'Lake and reservoir' : 'Inland water') : bio.name;
    const fath = b === 'shallow' ? 2 + Math.floor(r() * 7) : b === 'sea' ? 18 + Math.floor(r() * 50) : b === 'lake' ? 4 + Math.floor(r() * 30) : 180 + Math.floor(r() * 700);
    facts.push(['Depth', `${fath} fathoms`]);
    if (lake && lake.hyd) {
      const h = lake.hyd;
      facts.push(['Fed by', h.ins.length ? h.ins.join(', ') : 'Springs and rain']);
      facts.push(['Outflow', h.salt ? 'None: the sun takes it all, leaving salt' : h.out ? h.out : h.sea ? 'Spills straight into the sea' : 'A trickle over the lowest rim']);
      if (!h.salt) facts.push(['Lost to the sun', `${Math.round(h.keep * 100)}% of what flows in`]);
    }
    facts.push(['Crossing', b === 'lake' ? 'About two hours by boat' : 'About an hour under sail']);
  } else {
    const reg = state.map.regionOf[i] >= 0 ? state.map.regions[state.map.regionOf[i]].name : null;
    const ms = state.map.ms[i], hr = state.map.hR[i];
    const ft = Math.round((30 + hr * 1300 + (b === 'hills' ? 700 : 0) + (b === 'mountain' ? 3000 + ms * 3600 : 0) + (b === 'peak' ? 8200 + ms * 4500 : 0)) / 10) * 10;
    if (s) { title = s.name; kind = KIND[s.kind] + (s.pop ? ` · pop. ${s.pop.toLocaleString('en-US')}` : ''); }
    else if (state.map.sprawl && state.map.sprawl[i] >= 0) { const o = state.map.settle[state.map.sprawl[i]]; title = `Outskirts of ${o.name}`; kind = `Suburb · ${KIND[o.kind]}`; facts[0] = ['Terrain', 'Suburbs and kitchen gardens']; facts.push(['Part of', `${o.name}, pop. ${o.pop.toLocaleString('en-US')}`]); }
    else { title = reg || terrainName(i); kind = reg ? terrainName(i) : (() => { const n = nearestSettlement(i, 5); return n ? `${n[1]} ${n[1] === 1 ? 'hex' : 'hexes'} from ${n[0].name}` : 'Unclaimed wilds'; })(); }
    if (reg && (s || title !== reg)) facts.push(['Region', reg]);
    facts.push(['Elevation', `${ft.toLocaleString('en-US')} ft`]);
    const hrs = bio.hrs;
    facts.push(['Travel', state.map.onRoad[i] ? `1½ hours by road (${hrs} off it)` : b === 'peak' ? `${hrs}+ hours with a guide` : `${hrs} hours on foot`]);
    if (state.map.riverOf[i] >= 0) facts.push(['Waterway', state.map.rivers[state.map.riverOf[i]].name]);
    if (state.map.onRoad[i] && !s) facts.push(['Road', 'The King\'s road passes through']);
  }
  facts.push(['Hex', `${hexNo(i)} · column ${i % COLS + 1}, row ${((i / COLS) | 0) + 1}`]);
  const sub = !s && state.map.sprawl && state.map.sprawl[i] >= 0 ? state.map.settle[state.map.sprawl[i]] : null;
  const text = s && s.kind !== 'village' ? settlementLine(s, r) : sub ? ['Cottages and kitchen gardens crowd the road outside the gates; the town has long outgrown its walls.', 'Tanners, dyers and carters live out here, where the rents are low and the smells are tolerated.', 'Lanes of lodging houses and smithies, busy from first light with traffic bound for the gates.'][Math.floor(r() * 3)] : flavour;
  $('pane-survey').innerHTML = `
    <p class="eyebrow">hex ${hexNo(i)}</p>
    <h2>${esc(title)}</h2>
    <p class="kind">${esc(kind)}</p>
    ${(s || sub) && ((s || sub).kind === 'capital' || (s || sub).kind === 'city' || (s || sub).kind === 'temple') ? `<button class="btn btn-brass enter-city" id="enterCity">${(s || sub).kind === 'temple' ? 'Visit' : 'Enter'} ${esc((s || sub).name)}</button>` : ''}
    <p class="flavour">${esc(text)}</p>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <p class="hint">Click any hex on the map to survey it. Drag to pan, scroll or pinch to zoom.</p>`;
  const ec = $('enterCity'); if (ec) ec.addEventListener('click', () => openCity(s || sub));
}
function settlementLine(s, r) {
  const L = {
    capital: ['Seat of the crown, ringed by a curtain wall of pale stone. Market day fills every street.', 'The royal keep looms over a city of slate roofs and guildhalls.'],
    city: ['A walled city of guilds and bell towers, rich on the river trade.', 'Merchant houses crowd the harbour; the watch is bribable but polite.'],
    town: ['A market town with a fair every quarter-day and an inn called the Crooked Lantern.', 'Timber houses around a well, a smithy, and a tithe barn.'],
    keep: ['A border keep. Its garrison is half the size it should be.', 'The lord here collects tolls on the road and asks few questions.'],
    tower: ['A sorcerer\'s tower with no door at ground level.', 'Lights burn in the top window on moonless nights.'],
    ruin: ['Broken columns and a stair that descends into darkness.', 'The stones bear the sigil of a dynasty no one remembers.'],
    cave: ['A cave mouth exhaling warm air that smells of sulphur.', 'Miners sealed this shaft two generations ago. The seal is broken.'],
    temple: ['A hilltop temple where pilgrims leave ribbons on the gate.', 'The monks keep a library and refuse to lend from it.'],
    lighthouse: ['A red-banded light on a black rock. The keeper has not spoken to anyone in years.', 'Its lamp burns whale oil and, some say, something stranger.'],
    windmill: ['A post mill grinding the valley\'s barley. The miller weighs short.', 'Its sails turn even on windless days.'],
    mine: ['Silver ore and bad air. The foreman pays in scrip.', 'The deepest gallery was walled up after the third collapse.'],
    stones: ['Seven grey stones that are never the same number twice.', 'Farmers leave milk at the centre stone on midsummer night.'],
    lair: ['Scorched rock, cracked bones and a hoard nobody has counted and lived.', 'The dragon sleeps for decades. It has been eleven years.'],
    volcano: ['A smoking cone. Lava lights the clouds red at night.', 'Smiths make the climb to quench blades in its fire.'],
    waterfall: ['The river throws itself off a lip of black rock and the spray hangs over the pool all day.', 'You hear the falls an hour before you see them. Pilgrims bathe in the plunge pool for luck.', 'Behind the curtain of water, the locals say, is a cave nobody has walked out of.'],
    outpost: ['A stockade of sharpened logs where the king\'s wardens watch the forest road.', 'Woodsmen, a few archers and a beacon on the watchtower, lit when the wolves come close.', 'The rangers here know every track in the wood and charge a toll for the safe ones.'],
    hillfort: ['Grass-grown ramparts from an older age, ringed three times around the summit. A chieftain has fortified them again.', 'Earth banks and a timber palisade on the hilltop; from the gate you can see three valleys.', 'The ditches are older than the kingdom. Shepherds say the dead still keep the inner ring.'],
    wreck: ['A merchantman broken on the shoals. Divers still bring up coins.', 'The wreck of a royal galley, its figurehead staring at the sky.']
  };
  const a = L[s.kind] || ['']; return a[Math.floor(r() * a.length)];
}
function buildPlaces() {
  const g = [['Royal capital', ['capital']], ['Cities', ['city']], ['Market towns', ['town']], ['Landmarks', ['keep', 'hillfort', 'outpost', 'waterfall', 'tower', 'temple', 'lighthouse', 'windmill', 'mine', 'stones']], ['Perils', ['ruin', 'cave', 'lair', 'volcano', 'wreck']], ['Villages', ['village']]];
  let html = '';
  for (const [h, ks] of g) {
    const items = state.map.settle.filter(s => ks.includes(s.kind)).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) continue;
    html += `<div class="group"><h3>${h}</h3>${items.map(s => `<button class="place" data-i="${s.i}"><span class="nm">${esc(s.name)}</span><span class="meta">${ks.length > 1 ? KIND[s.kind] + ' · ' : ''}${hexNo(s.i)}</span></button>`).join('')}</div>`;
  }
  const rv = [...new Set(state.map.rivers.map(r => r.name))].sort();
  if (rv.length) html += `<div class="group"><h3>Rivers</h3><p class="note" style="margin:0">${rv.map(esc).join(' · ')}</p></div>`;
  $('pane-places').innerHTML = html;
  $('pane-places').querySelectorAll('.place').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.i; select(i, true); flyTo(i, Math.max(state.z, state.fitZ * 2.4)); }));
}
function buildKey() {
  const terr = ['grass', 'farm', 'forest', 'deepwood', 'taiga', 'hills', 'mountain', 'peak', 'desert', 'swamp', 'tundra', 'shallow', 'sea', 'lake'];
  const sym = ['capital', 'city', 'town', 'village', 'keep', 'hillfort', 'outpost', 'waterfall', 'tower', 'temple', 'lighthouse', 'windmill', 'mine', 'stones', 'ruin', 'cave', 'lair', 'volcano', 'wreck'];
  const fake = { temp: new Float32Array(N).fill(0.55), farm: new Uint8Array(N) };
  const item = (label, paint) => {
    const wrapEl = document.createElement('div'); wrapEl.className = 'keyitem';
    const c = document.createElement('canvas'); const k = Math.min(window.devicePixelRatio || 1, 2); c.width = 44 * k; c.height = 40 * k;
    const g = c.getContext('2d'); g.scale(k, k); paint(g);
    const sp = document.createElement('span'); sp.textContent = label; wrapEl.append(c, sp); return wrapEl;
  };
  const at = (g, fn, sc = 0.66) => { g.save(); g.translate(22, 23); g.scale(sc, sc); g.translate(-CX[0], -CY[0]); fn(); g.restore(); };
  const hexFill = (g, col) => { g.beginPath(); hexPath(g, CX[0], CY[0], R); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(43,33,22,0.45)'; g.lineWidth = 1; g.stroke(); };
  const pane = $('pane-key'); pane.innerHTML = '<div class="group"><h3>Terrain</h3><div class="keygrid" id="kTerr"></div></div><div class="group"><h3>Settlements and landmarks</h3><div class="keygrid" id="kSym"></div></div><div class="group"><h3>Lines and waters</h3><div class="keygrid" id="kLine"></div></div><p class="note">Each hex measures six miles from flat side to flat side. Hex numbers follow the column-then-row convention: 0412 is column 4, row 12.</p>';
  const SEEDS = { grass: 11, forest: 5, deepwood: 9, taiga: 3, hills: 21, mountain: 4, peak: 8, desert: 40, swamp: 2, tundra: 6, shallow: 1, sea: 1, lake: 1 };
  terr.forEach(b => $('kTerr').append(item(b === 'farm' ? 'Farmland' : BIOME[b].name, g => at(g, () => {
    hexFill(g, BIOME[b === 'farm' ? 'grass' : b].col);
    if (b === 'farm') { drawFarm(g, CX[0], CY[0], mulberry32(77)); return; }
    if (b === 'grass') { tuft(g, CX[0] - 8, CY[0] + 4, R * 0.15, 0.6); tuft(g, CX[0] + 7, CY[0] - 4, R * 0.15, 0.6); drawTree(g, CX[0] + 4, CY[0] + 14, R * 0.3, 'oak', mulberry32(3)); return; }
    if (b === 'sea') { drawTerrainIcon(g, 'deep', 0, () => 0.1, fake); return; }
    if (b === 'shallow') { drawTerrainIcon(g, 'shallow', 0, () => 0.05, fake); return; }
    drawTerrainIcon(g, b, 0, mulberry32(SEEDS[b] || 1), fake);
  }))));
  const fillFor = k => ['cave', 'lair', 'volcano'].includes(k) ? BIOME.mountain.col : k === 'mine' || k === 'hillfort' || k === 'waterfall' ? BIOME.hills.col : k === 'outpost' ? BIOME.forest.col : k === 'wreck' ? BIOME.shallow.col : BIOME.grass.col;
  sym.forEach(k => $('kSym').append(item(KIND[k], g => at(g, () => { hexFill(g, fillFor(k)); drawSettlement(g, { kind: k, i: 3, pop: k === 'town' ? 3000 : 0 }, CX[0], CY[0]); }, ['lair', 'volcano', 'lighthouse', 'tower', 'outpost', 'waterfall'].includes(k) ? 0.5 : k === 'hillfort' ? 0.46 : 0.62))));
  const roadKey = st => g => { const pl = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pl.push([(1 - t) * (1 - t) * 4 + 2 * (1 - t) * t * 22 + t * t * 40, (1 - t) * (1 - t) * 27 + 2 * (1 - t) * t * 9 + t * t * 20]); } g.save(); g.translate(0, 0); roadLine(g, pl, ROAD_STYLE[st].haloC || 'rgba(244,234,208,0.9)', ROAD_STYLE[st].halo + 0.6); for (const ph of ['verge', 'fill', 'tex']) texRoad(g, pl, ROAD_STYLE[st].o, ph); g.restore(); };
  [['Paved road', 'paved'], ['Dirt road', 'dirt'], ['Forest track', 'forest'], ['Mountain trail', 'trail'], ['Marsh causeway', 'causeway'], ['Caravan track', 'sand']].forEach(([lbl, st]) => $('kLine').append(item(lbl, roadKey(st))));
  $('kLine').append(item('River', g => { g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 4.6; g.beginPath(); g.moveTo(4, 14); g.quadraticCurveTo(20, 34, 40, 22); g.stroke(); g.strokeStyle = '#86aaa9'; g.lineWidth = 2.8; g.stroke(); g.strokeStyle = 'rgba(240,244,228,0.8)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(14, 21); g.quadraticCurveTo(20, 26, 27, 25); g.stroke(); }));
  $('kLine').append(item('Merchant ship', g => { g.fillStyle = BIOME.sea.col; g.fillRect(0, 0, 44, 40); drawShip(g, 22, 27, 15, false); }));
  $('kLine').append(item('Sea serpent', g => { g.fillStyle = BIOME.deep.col; g.fillRect(0, 0, 44, 40); drawSerpent(g, 20, 28, 17, false); }));
}
function select(i, keepView) {
  state.sel = i; survey(i); showTab('survey'); requestDraw();
  if (!keepView && matchMedia('(max-width:880px)').matches) { /* stay on map on phones */ }
}

export { buildKey, buildPlaces, esc, select, showTab, survey, terrainName };
