import { fbm, hashStr, makeNoise, mulberry32 } from '../core/random.js';
import { TERRAIN, footprint } from '../tiles/index.js';
import { MAX_ELEV, TI, blankModel, fits } from './model.js';

/* ================= tile editor: procedural scenes =================
   Builds a starting map from the shared tile set: terrain from layered noise, a settlement
   along a crossroads, farms or camps that suit the biome, then nature scattered by ground type. */
const BIOMES = {
  vale:     { label: 'River vale', clim: 'temperate', wl: -0.32, island: 0, river: true,
              ground: ['grass', 'meadow', 'tallgrass', 'pasture'], high: ['moor', 'rock', 'scree'], shore: 'shingle', water: 'water', deep: 'deep',
              town: ['cottage', 'cottage', 'townhouse', 'townhouse', 'longhouse', 'tavern', 'smithy', 'chapel', 'markethall', 'dovecote'], road: 'road', square: 'cobble',
              trees: ['oak', 'oak', 'birch', 'beech', 'poplar', 'pine'], farm: true },
  coast:    { label: 'Island harbour', clim: 'temperate', wl: 0.02, island: 1,
              ground: ['grass', 'tallgrass', 'meadow'], high: ['heath', 'rock'], shore: 'sand', water: 'water', deep: 'deep', beach: 'dunes',
              town: ['cottage', 'townhouse', 'townhouse', 'tavern', 'longhouse', 'markethall', 'cottage'], road: 'cobble', square: 'flagstone',
              trees: ['palm', 'oak', 'pine', 'bush'], harbour: true },
  desert:   { label: 'Desert oasis', clim: 'arid', wl: -0.42, island: 0, relief: 3.5,
              ground: ['sand', 'dunes', 'scrub', 'dunes'], high: ['rock', 'scree'], shore: 'sand', water: 'shallows', deep: 'water',
              town: ['yurt', 'yurt', 'shrine', 'temple', 'ruin', 'stonetower', 'granary'], road: 'dirt', square: 'flagstone',
              trees: ['palm', 'cactus', 'cactus', 'deadtree'], oasis: true },
  tundra:   { label: 'Frozen fells', clim: 'cold', wl: -0.3, island: 0, relief: 4, peak: 2,
              ground: ['snow', 'snow', 'tundra', 'tundra'], high: ['rock', 'snow', 'scree'], shore: 'shingle', water: 'ice', deep: 'deep',
              town: ['longhouse', 'longhouse', 'yurt', 'watchtower', 'stonetower', 'granary'], road: 'dirt', square: 'flagstone',
              trees: ['snowpine', 'snowpine', 'pine', 'deadtree'] },
  marsh:    { label: 'Fenland', clim: 'temperate', wl: -0.12, island: 0, relief: 3,
              ground: ['marsh', 'grass', 'tallgrass', 'mud'], high: ['moor', 'heath'], shore: 'mud', water: 'water', deep: 'swamp',
              town: ['longhouse', 'cottage', 'cottage', 'granary', 'watchtower', 'dovecote'], road: 'planks', square: 'planks',
              trees: ['deadtree', 'birch', 'bush', 'oak'] },
  volcanic: { label: 'Ashlands', clim: 'arid', wl: -0.5, island: 0, relief: 4, peak: 2,
              ground: ['ash', 'rock', 'ash', 'scree'], high: ['rock', 'ash'], shore: 'ash', water: 'lava', deep: 'lava',
              town: ['ruin', 'ruin', 'mine', 'stonetower', 'keep', 'shrine'], road: 'dirt', square: 'flagstone',
              trees: ['deadtree', 'deadtree', 'rocks'] }
};

function generateScene(seed, S, biome = 'vale') {
  const B = BIOMES[biome] || BIOMES.vale, rng = mulberry32(hashStr(seed + '|' + biome)), nz = makeNoise(rng), nz2 = makeNoise(rng), nz3 = makeNoise(rng);
  const pick = a => a[Math.floor(rng() * a.length)];
  const M = blankModel(S, B.ground[0], `${B.label}, ${seed}`); M.clim = B.clim;
  const NN = S * S, c = (S - 1) / 2, id = (x, y) => y * S + x, inb = (x, y) => x >= 0 && y >= 0 && x < S && y < S;
  const H = new Float32Array(NN), wet = new Uint8Array(NN), road = new Uint8Array(NN);
  const sc = 3.2 / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dc = Math.hypot(x - c, y - c) / (S / 2);
    /* broad, smooth land: two slow octaves, no fine ripple, so heights come in wide terraces */
    let h = fbm(nz, x * sc * 0.8, y * sc * 0.8, 2);
    if (B.island) h += 0.45 - dc * dc * 0.9;
    if (B.oasis) h += Math.max(0, dc - 0.2) * 0.3;
    H[id(x, y)] = h;
  }
  /* a meandering river across the vale */
  const riverD = new Float32Array(NN).fill(99);
  if (B.river) {
    const a = rng() * Math.PI, ph = rng() * 6, ux = Math.cos(a), uy = Math.sin(a);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const s = (x - c) * ux + (y - c) * uy, t = -(x - c) * uy + (y - c) * ux; riverD[id(x, y)] = Math.abs(t - Math.sin(s / S * 7 + ph) * S * 0.12 - S * 0.18); }
  }
  for (let u = 0; u < NN; u++) {
    const x = u % S, y = (u / S) | 0, h = H[u], rv = riverD[u];
    const lvl = Math.max(0, Math.min(MAX_ELEV - 2, Math.floor((h - B.wl) * (B.relief || 4.5) * 0.65)));
    if (h < B.wl || rv < 1.3) { wet[u] = 1; M.elev[u] = 0; M.terr[u] = TI[h < B.wl - 0.18 || rv < 0.6 ? B.deep : B.water]; continue; }
    M.elev[u] = rv < 4 ? Math.min(lvl, Math.floor((rv - 1.3) / 1.2)) : lvl;
    /* the main ground covers most of the land; the others lie in a few broad patches of it */
    const n2 = nz2(x / 11, y / 11), n3 = nz3(x / 9, y / 9), gi = n2 < 0.15 ? 0 : n2 < 0.35 ? 1 : n2 < 0.55 ? 2 : 3;
    let t = M.elev[u] >= (B.peak || 3) ? B.high[n3 < 0 ? 0 : n3 < 0.4 ? 1 % B.high.length : 2 % B.high.length] : B.ground[gi % B.ground.length];
    if (h < B.wl + 0.06 || rv < 2.2) t = B.beach && h < B.wl + 0.03 ? B.beach : B.shore;
    M.terr[u] = TI[t];
  }
  /* knock down lone spikes and fill lone pits so the land steps in terraces */
  for (let pass = 0; pass < 2; pass++) {
    const E = M.elev.slice();
    for (let u = 0; u < NN; u++) {
      if (wet[u]) continue; const x = u % S, y = (u / S) | 0, nb = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy) && !wet[id(x + dx, y + dy)]) nb.push(E[id(x + dx, y + dy)]);
      nb.sort((a, b) => a - b); M.elev[u] = nb[nb.length >> 1];
    }
  }
  for (let u = 0; u < NN; u++) if (!wet[u] && M.elev[u] < (B.peak || 3) && B.high.includes(TERRAIN[M.terr[u]].id) && !B.ground.includes(TERRAIN[M.terr[u]].id)) M.terr[u] = TI[B.ground[0]];
  /* tidy the noise: ponds and islets of a few tiles go, so do plateaus and pits of a few tiles, and lone tiles of one
     ground in a field of another take their neighbours' ground */
  const regions = (same, fix, min) => {
    const seen = new Uint8Array(NN);
    for (let u = 0; u < NN; u++) {
      if (seen[u]) continue; const q = [u]; seen[u] = 1;
      for (let h = 0; h < q.length; h++) { const v = q[h], x = v % S, y = (v / S) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const w = id(X, Y); if (!seen[w] && same(u, w)) { seen[w] = 1; q.push(w); } } }
      if (q.length < min) fix(q);
    }
  };
  const around = (q, val) => { const inQ = new Set(q), count = new Map(); for (const v of q) { const x = v % S, y = (v / S) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const w = id(X, Y); if (!inQ.has(w)) { const k = val(w); count.set(k, (count.get(k) || 0) + 1); } } } let best = null, n = -1; for (const [k, c2] of count) if (c2 > n) { n = c2; best = k; } return best; };
  /* small ponds dry out; small islets go under */
  regions((u, w) => wet[u] === wet[w], q => { const w = around(q, v => v); if (w == null) return; for (const v of q) { wet[v] = wet[w]; M.terr[v] = M.terr[w]; M.elev[v] = M.elev[w]; } }, 4);
  /* small plateaus and pits level with what is round them */
  regions((u, w) => !wet[u] && !wet[w] && M.elev[u] === M.elev[w], q => { if (wet[q[0]]) return; const e = around(q, v => (wet[v] ? null : M.elev[v])); if (e != null) for (const v of q) M.elev[v] = e; }, 5);
  /* lone patches of a ground (under four tiles) take the ground round them */
  regions((u, w) => M.terr[u] === M.terr[w], q => { if (wet[q[0]]) return; const t = around(q, v => (wet[v] ? null : M.terr[v])); if (t != null) for (const v of q) M.terr[v] = t; }, 4);
  /* water deepens with distance from the shore: shallows along it, open water beyond, deep water in the middle */
  {
    const dist = new Int16Array(NN).fill(-1), q = [];
    for (let u = 0; u < NN; u++) if (!wet[u]) { dist[u] = 0; q.push(u); }
    for (let h = 0; h < q.length; h++) { const v = q[h], x = v % S, y = (v / S) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const w = id(X, Y); if (dist[w] < 0) { dist[w] = dist[v] + 1; q.push(w); } } }
    const real = B.water === 'water' || B.water === 'shallows';
    for (let u = 0; u < NN; u++) {
      if (!wet[u]) continue; const d = dist[u] < 0 ? 99 : dist[u];
      M.terr[u] = TI[real && B.water === 'water' ? (d <= 1 ? 'shallows' : d <= 3 ? 'water' : B.deep) : d <= 2 ? B.water : B.deep];
    }
  }

  const objs = M.objs;
  const flat = (x, y, w, d) => { const e = M.elev[id(x, y)]; for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) { if (!inb(xx, yy) || M.elev[id(xx, yy)] !== e || road[id(xx, yy)]) return false; } return true; };
  const place = (idn, x, y, face = Math.floor(rng() * 4), dry = true) => { const o = { id: idn, x, y, face, v: rng() }; const [w, d] = footprint(o); if (dry && !flat(x, y, w, d)) return null; if (!fits(M, o)) return null; objs.push(o); return o; };

  /* settlement: a crossroads on the flattest dry ground near the middle */
  let best = -1, bs = -1e9;
  for (let y = 4; y < S - 4; y++) for (let x = 4; x < S - 4; x++) { const u = id(x, y); if (wet[u]) continue; let ok = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = id(x + dx, y + dy); if (!wet[v] && M.elev[v] === M.elev[u]) ok++; } const s = ok - Math.hypot(x - c, y - c) * 0.35 + rng() * 0.5; if (s > bs) { bs = s; best = u; } }
  const tx = best % S, ty = (best / S) | 0, te = M.elev[best];
  const paveRun = (x, y, dx, dy, n) => { for (let k = 0; k < n; k++, x += dx, y += dy) { if (!inb(x, y)) break; const u = id(x, y); if (wet[u]) { if (B.water === 'water' || B.water === 'shallows') { M.terr[u] = TI.planks; road[u] = 1; continue; } break; } if (Math.abs(M.elev[u] - te) > 1) break; M.elev[u] = te; M.terr[u] = TI[B.road]; road[u] = 1; } };
  const arm = Math.floor(S * 0.32);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) paveRun(tx + dx, ty + dy, dx, dy, arm + Math.floor(rng() * 4));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(tx + dx, ty + dy)) { const u = id(tx + dx, ty + dy); M.elev[u] = te; M.terr[u] = TI[B.square]; road[u] = 1; wet[u] = 0; }
  road[best] = 0; place(B.oasis ? 'statue' : pick(['well', 'statue', 'well']), tx, ty, 0, false); road[best] = 1;
  /* buildings line the roads, doors toward the street */
  let nb = 0; const target = Math.round(S * 0.9);
  for (let ring = 1; ring < arm + 3 && nb < target; ring++) {
    for (let k = -ring; k <= ring && nb < target; k++) for (const [x, y] of [[tx + k, ty - ring], [tx + k, ty + ring], [tx - ring, ty + k], [tx + ring, ty + k]]) {
      if (!inb(x, y) || road[id(x, y)] || wet[id(x, y)] || rng() < 0.35) continue;
      let face = -1; if (inb(x, y + 1) && road[id(x, y + 1)]) face = 0; else if (inb(x + 1, y) && road[id(x + 1, y)]) face = 1; else if (inb(x, y - 1) && road[id(x, y - 1)]) face = 2; else if (inb(x - 1, y) && road[id(x - 1, y)]) face = 3;
      if (face < 0) continue;
      const kind = pick(B.town);
      let o = place(kind, x, y, face);
      if (!o) { const ox = face % 2 ? x : x - 1, oy = face % 2 ? y - 1 : y; o = place(kind, ox, oy, face); }
      if (!o) o = place(pick(['cottage', 'yurt', 'longhouse'].filter(k2 => B.town.includes(k2)).concat([B.town[0]])), x, y, face);
      if (o) nb++;
    }
  }
  /* street clutter */
  for (let j = 0; j < S; j++) { const x = tx + Math.floor((rng() - 0.5) * arm * 2), y = ty + Math.floor((rng() - 0.5) * arm * 2); if (!inb(x, y) || road[id(x, y)] || wet[id(x, y)]) continue; let near = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && road[id(x + dx, y + dy)]) near = true; if (near) place(pick(B.clim === 'arid' ? ['barrels', 'crates', 'campfire', 'stall'] : ['barrels', 'crates', 'lamppost', 'stall', 'cart', 'signpost', 'beehives']), x, y); }
  /* farms around the village */
  if (B.farm) {
    for (let f = 0; f < 4; f++) {
      const a = rng() * Math.PI * 2, r = arm * 0.7 + rng() * S * 0.2, fx = Math.round(tx + Math.cos(a) * r), fy = Math.round(ty + Math.sin(a) * r), w = 3 + Math.floor(rng() * 3), d = 3 + Math.floor(rng() * 2), crop = pick(['field', 'wheat', 'crops', 'vineyard', 'wheat']);
      for (let y = fy; y < fy + d; y++) for (let x = fx; x < fx + w; x++) { if (!inb(x, y)) continue; const u = id(x, y); if (wet[u] || road[u] || M.elev[u] > 2 || objs.some(o => o.x === x && o.y === y)) continue; M.terr[u] = TI[crop]; }
      if (crop === 'wheat' || crop === 'field') { place('haystack', fx + 1, fy + 1); if (rng() < 0.6) place('scarecrow', fx + w - 2, fy + d - 2); }
      place(rng() < 0.5 ? 'barn' : 'granary', fx - 2, fy);
      for (let x = fx; x < fx + w; x++) if (inb(x, fy + d) && !road[id(x, fy + d)]) place('fence', x, fy + d, 0);
    }
  }
  /* harbour: a jetty into the sea with boats */
  if (B.harbour) {
    let bw = -1, bd = 1e9; for (let u = 0; u < NN; u++) { if (!wet[u]) continue; const d = Math.hypot(u % S - tx, ((u / S) | 0) - ty); if (d < bd) { bd = d; bw = u; } }
    if (bw >= 0) { const wx = bw % S, wy = (bw / S) | 0, dx = Math.sign(wx - tx), dy = dx ? 0 : Math.sign(wy - ty) || 1; for (let k = 0; k < 4; k++) { const x = wx + dx * k, y = wy + dy * k; if (!inb(x, y)) break; M.terr[id(x, y)] = TI.planks; M.elev[id(x, y)] = 0; if (k === 1 || k === 3) { if (!place('rowboat', x + dy, y + dx, dx ? 0 : 1, false)) place('rowboat', x - dy, y - dx, dx ? 0 : 1, false); } } place('crates', wx - dx, wy - dy, 0); }
    for (let j = 0; j < 300; j++) { const u = Math.floor(rng() * NN), x = u % S, y = (u / S) | 0; if (wet[u] || road[u] || Math.hypot(x - tx, y - ty) < arm * 0.6) continue; if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ddx, ddy]) => inb(x + ddx, y + ddy) && wet[id(x + ddx, y + ddy)])) continue; if (place('lighthouse', x, y, 0)) break; }
  }
  /* landmarks out in the wilds */
  const wild = B.clim === 'cold' ? ['stones', 'stonetower', 'ruin'] : B.clim === 'arid' ? ['obelisk', 'ruin', 'stones', 'mine'] : ['stones', 'ruin', 'windmill', 'watchtower'];
  for (let j = 0, n = 0; j < 200 && n < 3; j++) { const x = Math.floor(rng() * (S - 2)), y = Math.floor(rng() * (S - 2)); if (Math.hypot(x - tx, y - ty) < arm + 2) continue; if (place(pick(wild), x, y)) n++; }
  /* nature by ground */
  for (let u = 0; u < NN; u++) {
    if (road[u]) continue;
    const x = u % S, y = (u / S) | 0, T = M.terr[u], forest = nz3(x / 6 + 11, y / 6 - 4);
    if (wet[u]) { if ((T === TI.shallows || T === TI.swamp) && rng() < 0.25) place('reeds', x, y, 0, false); continue; }
    if (Math.hypot(x - tx, y - ty) < 2.5) continue;
    if (T === TI.marsh || T === TI.mud) { if (rng() < 0.3) place(pick(['reeds', 'reeds', 'deadtree', 'mushrooms']), x, y); continue; }
    /* woods where the forest noise is high, a light scatter at their edges, and only the odd tree in the open */
    const p = forest > 0.22 ? 0.62 : forest > 0.1 ? 0.2 : 0.012;
    if (rng() < p) { place(pick(B.trees), x, y); continue; }
    if (rng() < 0.015) place(pick(B.clim === 'arid' ? ['rocks', 'boulders', 'cactus'] : B.clim === 'cold' ? ['rocks', 'boulders', 'stump'] : ['rocks', 'boulders', 'bush', 'flowers', 'stump', 'logpile', 'mushrooms']), x, y);
  }
  return M;
}

export { BIOMES, generateScene };
