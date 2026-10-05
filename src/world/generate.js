import { COLS, CX, CY, HW, M, N, NB, R, ROWS, hexDist, worldH, worldW } from '../core/geometry.js';
import { fbm, hashStr, makeNoise, mulberry32 } from '../core/random.js';
import { ADJ, ADJ2, NOUNS, PSUF, TSUF, makeNamer } from '../core/names.js';
import { BIOME, MOVE } from './data.js';

function generate(seedStr) {
  const seedHash = hashStr(seedStr);
  const rng = mulberry32(seedHash);
  const nm = makeNamer(rng); const { pick, P } = nm;
  const nE = makeNoise(rng), nW = makeNoise(rng), nR = makeNoise(rng), nT = makeNoise(rng), nM = makeNoise(rng), nC = makeNoise(rng);
  const el = new Float32Array(N), ridge = new Float32Array(N), X = new Float32Array(N), Y = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = i % COLS, r = (i / COLS) | 0;
    const x = CX[i] / worldH * 2.5, y = CY[i] / worldH * 2.5; X[i] = x; Y[i] = y;
    const wx = x + 0.45 * fbm(nW, x * 1.2, y * 1.2, 3), wy = y + 0.45 * fbm(nW, x * 1.2 + 31.7, y * 1.2 + 11.3, 3);
    const u = c / (COLS - 1), v = r / (ROWS - 1), dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    let e = fbm(nE, wx, wy, 5) + 0.3 - 0.85 * (dx * dx * 0.9 + dy * dy);
    if (c < 1 || r < 1 || c > COLS - 2 || r > ROWS - 2) e -= 2;
    el[i] = e;
    ridge[i] = Math.pow(1 - Math.abs(nR(wx * 1.5, wy * 1.5)), 3) + 0.45 * Math.pow(1 - Math.abs(nR(wx * 3.2 + 7, wy * 3.2 + 3)), 3);
  }
  const sorted = Array.from(el).sort((a, b) => a - b);
  const seaLvl = sorted[Math.floor(N * 0.58)];
  const land = new Uint8Array(N); for (let i = 0; i < N; i++) land[i] = el[i] > seaLvl ? 1 : 0;
  // ocean = water connected to the border
  const ocean = new Uint8Array(N); const q = [];
  for (let i = 0; i < N; i++) { const c = i % COLS, r = (i / COLS) | 0; if (!land[i] && (c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1)) { ocean[i] = 1; q.push(i); } }
  for (let h = 0; h < q.length; h++) for (const n of NB[q[h]]) if (n >= 0 && !land[n] && !ocean[n]) { ocean[n] = 1; q.push(n); }
  const bfs = (isSrc, passable) => { const d = new Int16Array(N).fill(999), qq = []; for (let i = 0; i < N; i++) if (isSrc(i)) { d[i] = 0; qq.push(i); } for (let h = 0; h < qq.length; h++) { const a = qq[h]; for (const n of NB[a]) if (n >= 0 && d[n] > d[a] + 1 && passable(n)) { d[n] = d[a] + 1; qq.push(n); } } return d; };
  const distW = bfs(i => !land[i], () => true);
  const distL = bfs(i => !!land[i], () => true);
  const L = []; for (let i = 0; i < N; i++) if (land[i]) L.push(i);
  const hR = new Float32Array(N), mR = new Float32Array(N), ms = new Float32Array(N), temp = new Float32Array(N), moist = new Float32Array(N);
  [...L].sort((a, b) => el[a] - el[b]).forEach((i, k) => hR[i] = k / Math.max(1, L.length - 1));
  for (const i of L) ms[i] = 0.5 * hR[i] + 0.55 * ridge[i] - (distW[i] === 1 ? 0.35 : distW[i] === 2 ? 0.12 : 0);
  const msR = new Float32Array(N); [...L].sort((a, b) => ms[a] - ms[b]).forEach((i, k) => msR[i] = k / Math.max(1, L.length - 1));
  /* climate.
     Temperature falls toward the north and with height (a lapse rate), so ranges stay snowy far into the south.
     Rain arrives on a prevailing wind off the sea: the air takes up moisture over open water, sheds it as it crosses
     land, and sheds most where it is forced up a slope. Leeward of a range the air is spent: a rain shadow.
     A belt of dry descending air lies toward the hot south, where the great deserts sit. */
  const alt = new Float32Array(N); for (const i of L) alt[i] = 0.45 * hR[i] + 0.55 * msR[i] * msR[i];
  for (const i of L) {
    const v = ((i / COLS) | 0) / (ROWS - 1);
    temp[i] = v * 1.2 - 0.12 + 0.2 * nT(X[i] * 1.4, Y[i] * 1.4) - 0.5 * Math.max(0, msR[i] - 0.72) - 0.05 * hR[i] + (distW[i] === 1 ? 0.03 : 0);
  }
  const windDir = (seedHash & 3) === 0 ? -1 : 1;                  // mostly westerlies; one realm in four has easterlies
  const air = new Float32Array(N), rainP = new Float32Array(N);
  const sweep = Array.from({ length: N }, (_, i) => i).sort((a, b) => (CX[a] - CX[b]) * windDir || CY[a] - CY[b]);
  for (const i of sweep) {
    let s = 0, n = 0, upAlt = 0, nl = 0;
    for (const nb of NB[i]) { if (nb < 0 || (CX[nb] - CX[i]) * windDir >= -1) continue; s += air[nb]; n++; if (land[nb]) { upAlt += alt[nb]; nl++; } }
    const inAir = n ? s / n : 0.9;
    if (!land[i]) { air[i] = Math.min(1, inAir * 0.72 + 0.32); continue; }
    const lift = Math.max(0, alt[i] - (nl ? upAlt / nl : 0)), rate = Math.min(0.7, 0.09 + 2.6 * lift + 0.08 * alt[i]);
    const p = inAir * rate; rainP[i] = p; air[i] = Math.max(0, inAir - p * 0.82);   // a little of each shower evaporates again and travels on
  }
  for (let pass = 0; pass < 2; pass++) { const nx = rainP.slice(); for (const i of L) { let s = 0, n = 0; for (const nb of NB[i]) if (nb >= 0 && land[nb]) { s += rainP[nb]; n++; } nx[i] = n ? rainP[i] * 0.55 + s / n * 0.45 : rainP[i]; } rainP.set(nx); }
  { const srt = L.map(i => rainP[i]).sort((a, b) => a - b), top = srt[Math.floor(srt.length * 0.95)] || 1;
    for (const i of L) { const v = ((i / COLS) | 0) / (ROWS - 1), belt = Math.exp(-Math.pow((v - 0.8) / 0.13, 2));
      moist[i] = 0.72 * Math.min(1.2, rainP[i] / top) + 0.28 * (fbm(nM, X[i] * 1.6, Y[i] * 1.6, 4) + 0.5) - 0.22 * belt + 0.12 * Math.exp(-(distW[i] - 1) / 1.5); } }
  [...L].sort((a, b) => moist[a] - moist[b]).forEach((i, k) => mR[i] = k / Math.max(1, L.length - 1));
  const cls = new Array(N).fill('');
  const byMs = [...L].sort((a, b) => ms[b] - ms[a]);
  byMs.forEach((i, k) => { const f = k / L.length; cls[i] = f < 0.03 ? 'peak' : f < 0.11 ? 'mount' : f < 0.25 ? 'hills' : ''; });
  /* vegetation follows warmth and wetness together (a Whittaker scheme): tundra and taiga in the cold, steppe, woods and
     deep forest across the temperate band, desert, savanna grass and dense jungle-dark woods in the heat, fen where low
     ground lies wet by the water */
  const B = new Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i]) { B[i] = !ocean[i] ? 'lake' : distL[i] === 1 ? 'shallow' : distL[i] <= 3 ? 'sea' : 'deep'; continue; }
    const t = temp[i], m = mR[i], wetLow = hR[i] < 0.3 && distW[i] <= 2 && t > 0.3 && m > 0.86;
    if (cls[i] === 'peak') B[i] = 'peak';
    else if (cls[i] === 'mount') B[i] = t < 0.15 ? 'peak' : 'mountain';
    else if (t < 0.08) B[i] = 'tundra';
    else if (cls[i] === 'hills') B[i] = t < 0.18 && m < 0.5 ? 'tundra' : 'hills';
    else if (t < 0.3) B[i] = m > 0.42 ? 'taiga' : 'tundra';
    else if (t > 0.68) B[i] = m < 0.3 ? 'desert' : m < 0.52 ? 'grass' : m < 0.82 ? 'forest' : wetLow ? 'swamp' : 'deepwood';
    else B[i] = m < 0.14 && t > 0.5 ? 'desert' : m < 0.42 ? 'grass' : m < 0.76 ? 'forest' : wetLow ? 'swamp' : 'deepwood';
  }
  // zones, not speckle: a lone hex unlike all its neighbours takes on the commonest one around it
  { const VEG = new Set(['grass', 'forest', 'deepwood', 'taiga', 'tundra', 'desert', 'swamp']), nx = B.slice();
    for (const i of L) {
      if (!VEG.has(B[i])) continue; const cnt = {}; let same = 0;
      for (const nb of NB[i]) { if (nb < 0 || !land[nb]) continue; if (B[nb] === B[i]) same++; else if (VEG.has(B[nb])) cnt[B[nb]] = (cnt[B[nb]] || 0) + 1; }
      if (same) continue; let best = null, bc = 2; for (const k in cnt) if (cnt[k] > bc) { bc = cnt[k]; best = k; }
      if (best && !(best === 'desert' && temp[i] < 0.45) && !(best === 'swamp' && hR[i] > 0.45)) nx[i] = best;
    }
    for (const i of L) B[i] = nx[i]; }
  const isWater = i => BIOME[B[i]].water;
  const jit = []; for (let i = 0; i < N; i++) jit.push([(rng() - 0.5) * R * 0.36, (rng() - 0.5) * R * 0.36]);

  const RIV_K = { ms: 0.2, he: 0.6, sm: 0.6, dw: 0, nz: 0.02, q: 0.7, floor: 1.8 };   // relief blend: ridges, broad height, valley noise; channel threshold
  const LAKE_K = window.__LAKEK || { dmin: 0.012, maxN: 5, maxArea: 0.03, minIn: 0.6, maxSize: 14 };
  /* hydrology. Every land hex drains toward the sea along the lowest route (a priority flood from the coast, so a
     basin fills until it spills over its lowest rim). Closed basins that gather enough water become lakes, and every
     lake works as a reservoir: it stores what its rivers bring, loses some to evaporation, and releases the rest
     through a single outlet at its lowest rim. A lake in hot, dry country can lose everything and become a salt lake
     with no outlet at all. Rain gathers downhill and wherever enough has collected a channel forms. */
  const riverOf = new Int16Array(N).fill(-1); const rivers = [];
  const flow = new Float32Array(N); let flowT = 1; const basins = []; const basinOf = new Int16Array(N).fill(-1);
  {
    const rr = mulberry32(seedHash ^ 0x2c1b3c6d);
    const relief = new Float32Array(N);
    for (let i = 0; i < N; i++) relief[i] = land[i] ? RIV_K.ms * ms[i] + RIV_K.he * hR[i] + RIV_K.sm * fbm(nE, X[i] * 0.9 + 40, Y[i] * 0.9 + 40, 3) + RIV_K.dw * distW[i] + rr() * RIV_K.nz : ocean[i] ? -1 : -0.25;
    const down = new Int32Array(N).fill(-1), lvl = new Float32Array(N).fill(-1), seen = new Uint8Array(N), heap = [];
    const push = it => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    for (let i = 0; i < N; i++) if (ocean[i]) { seen[i] = 1; if (NB[i].some(n => n >= 0 && !ocean[n])) push([-1, i]); }
    if (!heap.length) for (let i = 0; i < N; i++) if (!land[i]) { seen[i] = 1; push([relief[i], i]); }
    while (heap.length) {
      const [l, c] = pop();
      for (const n of NB[c]) { if (n < 0 || seen[n]) continue; seen[n] = 1; down[n] = c; lvl[n] = Math.max(relief[n], l + 1e-4); push([lvl[n], n]); }
    }
    // steepest descent over the filled surface gathers water into valleys; flats keep the flood's spill direction
    for (let i = 0; i < N; i++) {
      if (ocean[i] || down[i] < 0) continue;
      let best = down[i], bl = ocean[best] ? -1 : lvl[best];
      for (const n of NB[i]) { if (n < 0) continue; const ln = ocean[n] ? -1 : lvl[n]; if (ln < bl - 1e-6 && ln < lvl[i]) { bl = ln; best = n; } }
      down[i] = best;
    }
    // rain: wetter in moist country and on high ground, sparse in deserts and the frozen north
    const rain = i => { if (!land[i]) return 0.8; const b = B[i]; return Math.max(0.12, 0.3 + 0.9 * mR[i] + 0.45 * hR[i] - (b === 'desert' ? 0.55 : 0) - (b === 'tundra' ? 0.1 : 0)); };
    const byLvl = []; for (let i = 0; i < N; i++) if (!ocean[i] && down[i] >= 0) byLvl.push(i);
    byLvl.sort((a, b) => lvl[b] - lvl[a]);
    // first pass, no lakes yet: how much water would reach each hollow
    const f0 = new Float32Array(N);
    for (const i of byLvl) { f0[i] += rain(i); const d = down[i]; if (d >= 0 && !ocean[d]) f0[d] += f0[i]; }
    const lf0 = L.map(i => f0[i]).sort((a, b) => a - b);
    flowT = Math.max(RIV_K.floor, lf0[Math.floor(lf0.length * RIV_K.q)] || RIV_K.floor);
    // closed hollows: hexes the flood had to fill above their own ground
    { const seenD = new Uint8Array(N), cands = [];
      for (const i of L) {
        if (seenD[i] || lvl[i] - relief[i] < LAKE_K.dmin) continue;
        const cl = [i]; seenD[i] = 1;
        for (let h = 0; h < cl.length; h++) for (const n of NB[cl[h]]) if (n >= 0 && land[n] && !seenD[n] && lvl[n] - relief[n] >= LAKE_K.dmin) { seenD[n] = 1; cl.push(n); }
        if (cl.length > LAKE_K.maxSize) continue;
        let inflow = 0, depth = 0; for (const h of cl) { inflow = Math.max(inflow, f0[h]); depth = Math.max(depth, lvl[h] - relief[h]); }
        if (cl.some(h => distW[h] <= 1 && rr() < 0.5)) continue;   // hollows hard on the shore usually drain through the dunes
        if (inflow < flowT * LAKE_K.minIn) continue;
        cands.push({ cl, sc: inflow * (1 + depth * 8) });
      }
      cands.sort((a, b) => b.sc - a.sc);
      let area = 0, nL = 0; const cap = Math.max(4, Math.round(L.length * LAKE_K.maxArea));
      for (const c of cands) { if (nL >= LAKE_K.maxN || area + c.cl.length > cap) continue; for (const h of c.cl) { B[h] = 'lake'; land[h] = 0; } area += c.cl.length; nL++; }
      if (nL) {
        const keep = L.filter(i => land[i]); L.length = 0; L.push(...keep);
        distW.set(bfs(i => !land[i], () => true)); distL.set(bfs(i => !!land[i], () => true));
      }
    }
    // every lake is a reservoir with one outlet at its lowest rim
    { const seenB = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        if (land[i] || ocean[i] || seenB[i]) continue;
        const cells = [i]; seenB[i] = 1;
        for (let h = 0; h < cells.length; h++) for (const n of NB[cells[h]]) if (n >= 0 && !land[n] && !ocean[n] && !seenB[n]) { seenB[n] = 1; cells.push(n); }
        const id = basins.length, inL = new Set(cells);
        let outC = -1, outT = -1, ol = Infinity, lo = Infinity, tsum = 0, dry = 0;
        for (const c of cells) {
          basinOf[c] = id; lo = Math.min(lo, lvl[c]); tsum += temp[c] || 0;
          for (const n of NB[c]) { if (n < 0 || inL.has(n)) continue; if (land[n] && (B[n] === 'desert' || mR[n] < 0.25)) dry++; }
          const d = down[c]; if (d >= 0 && !inL.has(d)) { const l2 = ocean[d] ? -1 : lvl[d]; if (l2 < ol) { ol = l2; outC = c; outT = d; } }
        }
        const t = cells.reduce((a, c) => a + temp[c], 0) / cells.length;
        let rimT = 0, rimN = 0; for (const c of cells) for (const n of NB[c]) if (n >= 0 && land[n]) { rimT += temp[n]; rimN++; }
        const heat = rimN ? rimT / rimN : t, evap = cells.length * (0.25 + 3.2 * Math.max(0, heat - 0.55) + 0.25 * dry / Math.max(1, rimN) * 6);
        basins.push({ cells, outC, outT, lvl: lo - 1e-5, evap, inflow: 0, out: 0, salt: false, inRivers: [], outRiver: -1, rep: cells[0] });
      }
    }
    // second pass: route everything through the reservoirs
    const dn = new Int32Array(N).fill(-1), ord = [];
    for (const i of byLvl) {
      const b = basinOf[i];
      if (b >= 0) { if (i !== basins[b].rep) dn[i] = basins[b].rep; continue; }
      let d = down[i]; if (d >= 0 && basinOf[d] >= 0) d = basins[basinOf[d]].rep; dn[i] = d; ord.push([lvl[i], i]);
    }
    for (const bs of basins) { if (bs.outT >= 0) dn[bs.rep] = basinOf[bs.outT] >= 0 ? basins[basinOf[bs.outT]].rep : bs.outT; ord.push([bs.lvl, bs.rep, bs]); for (const c of bs.cells) if (c !== bs.rep) flow[bs.rep] += rain(c); }
    ord.sort((a, b) => b[0] - a[0]);
    for (const [, i, bs] of ord) {
      flow[i] += rain(i);
      if (bs) {
        bs.inflow = flow[i]; bs.out = Math.max(0, flow[i] - bs.evap);
        if (bs.out <= 0.06 * bs.inflow || bs.outT < 0) { bs.salt = true; bs.out = 0; dn[i] = -1; }
        flow[i] = bs.out;
      }
      const d = dn[i]; if (d >= 0 && !ocean[d]) flow[d] += flow[i];
    }
    const outletOf = new Map(); for (const bs of basins) if (!bs.salt && bs.out >= flowT && bs.outT >= 0 && land[bs.outT]) outletOf.set(bs.outT, bs);
    const isR = i => land[i] && flow[i] >= flowT;
    // channel heads, plus every reservoir strong enough to feed a river; longest courses first
    const lenTo = s => { let k = 0, c = s; while (c >= 0 && land[c] && k < 400) { c = down[c]; k++; } return k; };
    const starts = [];
    for (const i of L) if (isR(i) && !outletOf.has(i) && !NB[i].some(n => n >= 0 && land[n] && down[n] === i && isR(n))) starts.push({ path: [i], cur: i, len: lenTo(i), lake: -1 });
    for (const bs of basins) if (outletOf.get(bs.outT) === bs) starts.push({ path: [bs.outC, bs.outT], cur: bs.outT, len: lenTo(bs.outT) + 1, lake: basins.indexOf(bs) });
    starts.sort((a, b) => b.len - a.len || flow[b.cur] - flow[a.cur]);
    const owner = new Int16Array(N).fill(-1);
    for (const st of starts) {
      const path = st.path.slice(); let cur = st.cur, joined = -1, ok = false, toLake = -1;
      if (owner[cur] >= 0) continue;
      for (let guard = 0; guard < 400; guard++) {
        const d = down[cur]; if (d < 0) break;
        path.push(d);
        if (ocean[d]) { ok = true; break; }
        if (!land[d]) { ok = true; toLake = basinOf[d]; break; }
        if (owner[d] >= 0) { joined = owner[d]; ok = true; break; }
        cur = d;
      }
      const own = path.filter(h => land[h] && owner[h] < 0).length;
      if (!ok || own < (st.lake >= 0 ? 1 : joined >= 0 ? 3 : 4)) continue;
      const id = rivers.length;
      for (const h of path) if (land[h] && owner[h] < 0) owner[h] = id;
      for (const h of path) if (land[h] && riverOf[h] < 0) riverOf[h] = id;
      if (toLake >= 0) basins[toLake].inRivers.push(id);
      if (st.lake >= 0) basins[st.lake].outRiver = id;
      rivers.push({ path, joined, name: '', len: own, fromLake: st.lake, toLake });
    }
  }

  /* the water shapes what grows: green ribbons along desert rivers, gallery woods along the big rivers of the plains,
     fen and reed bed on low lake shores and at river mouths, baked flats around salt lakes */
  { const vr = mulberry32(seedHash ^ 0x7b1d), soft = b => b === 'grass' || b === 'forest' || b === 'deepwood';
    for (const rv of rivers) for (const h of rv.path) {
      if (!land[h]) continue; const f = flow[h] / flowT;
      if (B[h] === 'desert' && f >= 1.3) B[h] = 'grass';
      else if (B[h] === 'tundra' && f >= 2.5 && temp[h] > 0.12) B[h] = 'taiga';
      else if (B[h] === 'grass' && f >= 3 && temp[h] > 0.3 && vr() < 0.4) B[h] = 'forest';
      if (f >= 2) for (const n of NB[h]) if (n >= 0 && land[n] && B[n] === 'desert' && vr() < 0.35) B[n] = 'grass';
    }
    for (const rv of rivers) { if (rv.toLake < 0 && rv.joined >= 0) continue; const h = rv.path[rv.path.length - 2]; if (h >= 0 && land[h] && soft(B[h]) && hR[h] < 0.4 && temp[h] > 0.32 && mR[h] > 0.45 && vr() < 0.4) B[h] = 'swamp'; }
    for (const bs of basins) for (const c of bs.cells) for (const n of NB[c]) {
      if (n < 0 || !land[n]) continue;
      if (bs.salt) { if (temp[n] > 0.42 && (B[n] === 'grass' || B[n] === 'forest')) B[n] = 'desert'; }
      else if (soft(B[n]) && hR[n] < 0.38 && temp[n] > 0.3 && mR[n] > 0.5 && vr() < 0.22) B[n] = 'swamp';
    }
  }

  /* settlements */
  const settle = []; const sAt = new Int16Array(N).fill(-1);
  const coastal = i => NB[i].some(n => n >= 0 && isWater(n));
  const base = { grass: 3, forest: 1.6, hills: 1.5, taiga: 1, desert: 0.4, swamp: 0.3, tundra: 0.3, deepwood: 0.6 };
  const cand = L.filter(i => base[B[i]] !== undefined).map(i => ({ i, sc: base[B[i]] + (riverOf[i] >= 0 ? 2.6 : 0) + (coastal(i) ? 1.8 : 0) + rng() * 1.6 }));
  cand.sort((a, b) => b.sc - a.sc);
  const far = (i, d) => settle.every(s => hexDist(i, s.i) >= d);
  const add = (kind, i) => { sAt[i] = settle.length; settle.push({ kind, i, name: '', pop: 0 }); };
  const place = (kind, count, minD) => { let n = 0; for (const c of cand) { if (n >= count) break; if (sAt[c.i] >= 0 || !far(c.i, minD)) continue; add(kind, c.i); n++; } };
  place('capital', 1, 0); place('city', 4, 8); place('town', 9, 4); place('village', 15, 3);
  const shuffled = arr => { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const poi = (kind, count, filter, minD) => { let n = 0; for (const i of shuffled(L)) { if (n >= count) break; if (sAt[i] >= 0 || !filter(i) || !far(i, minD)) continue; add(kind, i); n++; } };
  poi('keep', 3, i => B[i] === 'hills' || (B[i] === 'grass' && NB[i].some(n => n >= 0 && B[n] === 'mountain')), 3);
  poi('cave', 2, i => B[i] === 'mountain' && NB[i].some(n => n >= 0 && B[n] !== 'mountain' && B[n] !== 'peak'), 3);
  poi('ruin', 3, i => ['forest', 'deepwood', 'desert', 'grass', 'tundra'].includes(B[i]), 3);
  poi('tower', 2, i => !['mountain', 'peak'].includes(B[i]), 4);
  poi('temple', 2, i => ['hills', 'grass', 'forest', 'tundra'].includes(B[i]), 3);
  const townlike = s => ['capital', 'city', 'town', 'village'].includes(s.kind);
  const nearTown = (i, d) => settle.some(s => townlike(s) && hexDist(i, s.i) <= d);
  const mtn = i => B[i] === 'mountain' || B[i] === 'peak';
  poi('volcano', 1, i => mtn(i) && distW[i] >= 2, 3);
  if (!settle.some(x => x.kind === 'volcano')) poi('volcano', 1, mtn, 2);
  poi('lair', 1, i => mtn(i) && !nearTown(i, 4), 3);
  if (!settle.some(x => x.kind === 'lair')) poi('lair', 1, mtn, 2);
  poi('lighthouse', 2, i => ['grass', 'hills', 'forest', 'tundra', 'desert'].includes(B[i]) && NB[i].some(n => n >= 0 && ocean[n]), 6);
  poi('windmill', 3, i => B[i] === 'grass' && nearTown(i, 3), 2);
  poi('mine', 2, i => B[i] === 'hills' || (B[i] === 'mountain' && NB[i].some(n => n >= 0 && B[n] !== 'mountain' && B[n] !== 'peak')), 3);
  poi('stones', 2, i => ['grass', 'hills', 'tundra'].includes(B[i]), 4);
  { let n = 0; for (const i of shuffled(Array.from({ length: N }, (_, k) => k))) { if (n >= 2) break; if (B[i] !== 'shallow' || sAt[i] >= 0 || !far(i, 4)) continue; add('wreck', i); n++; } }
  const farm = new Uint8Array(N);
  for (const i of L) { if (B[i] !== 'grass' || sAt[i] >= 0) continue; for (const s of settle) { if (townlike(s) && hexDist(i, s.i) <= (s.kind === 'village' ? 1 : 2)) { farm[i] = 1; break; } } }

  /* roads (A*) */
  const onRoad = new Uint8Array(N); const roads = [];
  // every river hex a road enters is a crossing to build, so roads cross once, cleanly, and do not ride along the water
  const stepCost = i => { if (isWater(i)) return Infinity; const b = MOVE[B[i]], wet = riverOf[i] >= 0 && sAt[i] < 0 ? 1.4 : 0; return (onRoad[i] ? b * 0.3 + 0.15 : b) + (onRoad[i] ? wet * 0.3 : wet); };
  function astar(a, b) {
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [[hexDist(a, b), a]]; g[a] = 0;
    const push = it => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    while (heap.length) {
      const [, cur] = pop(); if (closed[cur]) continue; closed[cur] = 1;
      if (cur === b) { const path = [b]; let k = b; while (from[k] >= 0) { k = from[k]; path.push(k); } return path.reverse(); }
      for (const n of NB[cur]) { if (n < 0 || closed[n]) continue; const c = stepCost(n); if (!isFinite(c)) continue; const ng = g[cur] + c; if (ng < g[n]) { g[n] = ng; from[n] = cur; push([ng + hexDist(n, b) * 0.6, n]); } }
    }
    return null;
  }
  const cap = settle.find(s => s.kind === 'capital');
  const hubs = [cap];
  const link = (s, targets) => {
    const t = targets.slice().sort((x, y) => hexDist(s.i, x.i) - hexDist(s.i, y.i));
    for (const tg of t.slice(0, 2)) { const p = astar(s.i, tg.i); if (p) { p.forEach(h => onRoad[h] = 1); roads.push(p); return true; } }
    return false;
  };
  if (cap) {
    for (const c of settle.filter(s => s.kind === 'city').sort((x, y) => hexDist(cap.i, x.i) - hexDist(cap.i, y.i))) if (link(c, hubs)) hubs.push(c);
    for (const t of settle.filter(s => s.kind === 'town').sort((x, y) => hexDist(cap.i, x.i) - hexDist(cap.i, y.i))) if (link(t, hubs)) hubs.push(t);
  }

  /* naming */
  const kinds = ['Kingdom', 'Principality', 'Free Marches', 'Grand Duchy', 'High Realm', 'Commonwealth', 'Old Kingdom'];
  const realm = { name: nm.name(), kind: pick(kinds), year: 900 + Math.floor(rng() * 600) };
  for (const s of settle) {
    const co = coastal(s.i), ri = riverOf[s.i] >= 0;
    const town = () => P() + (co && rng() < 0.6 ? pick(PSUF) : ri && rng() < 0.4 ? pick(['ford', 'bridge', 'mouth', 'well']) : pick(TSUF));
    switch (s.kind) {
      case 'capital': s.name = rng() < 0.5 ? realm.name : nm.name(); s.pop = 18000 + Math.floor(rng() * 24000); break;
      case 'city': s.name = nm.uniq([nm.rawName, town]); s.pop = 5500 + Math.floor(rng() * 9000); break;
      case 'town': s.name = nm.uniq([town, town, nm.rawName]); s.pop = 900 + Math.floor(rng() * 3200); break;
      case 'village': s.name = nm.uniq([town]); s.pop = 60 + Math.floor(rng() * 380); break;
      case 'keep': s.name = nm.uniq([() => `${P()}watch Keep`, () => `Castle ${nm.rawName()}`, () => `${P()}hold`, () => `Fort ${nm.rawName()}`]); break;
      case 'tower': s.name = nm.uniq([() => `Tower of ${nm.rawName()}`, () => `The ${P()} Spire`, () => `${nm.rawName()}'s Tower`]); break;
      case 'ruin': s.name = nm.uniq([() => `Ruins of ${nm.rawName()}`, () => `Old ${nm.rawName()}`, () => `The Broken Hall`, () => `${P()}fall Ruins`]); break;
      case 'cave': s.name = nm.uniq([() => `The ${P()} Delve`, () => `Caves of ${nm.rawName()}`, () => `${nm.rawName()}'s Hollow`, () => `The ${P()}mouth`]); break;
      case 'temple': s.name = nm.uniq([() => `Temple of the ${pick(ADJ2)} Moon`, () => `Shrine of ${nm.rawName()}`, () => `The ${P()} Abbey`]); break;
      case 'volcano': s.name = nm.uniq([() => `Mount ${nm.rawName()}`, () => `The ${P()}forge`, () => `${nm.rawName()}'s Anvil`, () => `The Smoking ${pick(['Crown', 'Throne', 'Tooth'])}`]); break;
      case 'lair': s.name = nm.uniq([() => `Lair of ${nm.rawName()} the ${pick(['Red', 'Grey', 'Old', 'Gilded', 'Black'])}`, () => `${nm.rawName()}'s Roost`]); break;
      case 'lighthouse': s.name = nm.uniq([() => `${P()}light`, () => `The ${nm.rawName()} Light`, () => `${P()}beacon`]); break;
      case 'windmill': s.name = nm.uniq([() => `${nm.rawName()}'s Mill`, () => `${P()}mill`, () => `The ${P()} Mill`]); break;
      case 'mine': s.name = nm.uniq([() => `The ${P()} Mine`, () => `${nm.rawName()} Diggings`, () => `${P()}deep Mine`]); break;
      case 'stones': s.name = nm.uniq([() => `The ${P()} Stones`, () => `Circle of ${nm.rawName()}`, () => `The ${pick(['Nine', 'Seven', 'Twelve'])} Maidens`]); break;
      case 'wreck': s.name = nm.uniq([() => `Wreck of the ${pick(['Gull', 'Merrow', 'Saint Ilse', 'Grey Lady', 'Kestrel', 'Hopeful', 'Wyvern'])}`]); break;
    }
  }
  if (cap && cap.name === realm.name) nm.uniq([() => realm.name]);
  // a river that runs into a lake and out again keeps its name; the outflow takes the name of the largest river feeding it
  const riverName = rv => rv.joined < 0 || rv.len >= 7 ? nm.uniq([() => `River ${nm.rawName()}`, () => `The ${P()}run`, () => `The ${P()}water`, () => `The ${nm.rawName()}`])
    : nm.uniq([() => `${P()} Brook`, () => `The ${P()} Beck`, () => `${nm.rawName()} Burn`, () => `${P()}bourne`, () => `The ${nm.rawName()} Rill`]);
  for (const rv of rivers) if (!(rv.fromLake >= 0 && basins[rv.fromLake].inRivers.length)) rv.name = riverName(rv);
  for (let pass = 0; pass < 8; pass++) for (const rv of rivers) {
    if (rv.name) continue;
    const feeders = basins[rv.fromLake].inRivers.map(r => rivers[r]);
    if (feeders.some(f => !f.name)) continue;
    const main = feeders.reduce((a, b) => (b.len > a.len ? b : a));
    rv.name = main.name.replace(/ (Brook|Beck|Burn|Rill)$/, ' Water');
  }
  for (const rv of rivers) if (!rv.name) rv.name = riverName(rv);

  /* regions */
  const GROUP = { forest: 'wood', deepwood: 'wood', taiga: 'pine', mountain: 'mount', peak: 'mount', hills: 'hills', desert: 'desert', swamp: 'swamp', tundra: 'tundra', grass: 'plain' };
  const MINSZ = { wood: 6, pine: 5, mount: 5, hills: 6, desert: 5, swamp: 4, tundra: 6, plain: 26 };
  const TPL = {
    wood: () => [() => `The ${P()}wood`, () => `${nm.rawName()} Forest`, () => `The ${nm.rawName()} Weald`, () => `${P()}holt Woods`],
    pine: () => [() => `The ${P()}pines`, () => `${nm.rawName()} Taiga`, () => `The ${P()}fir Wood`],
    mount: () => [() => `The ${P()}spine`, () => `${P()}crown Mountains`, () => `Teeth of ${nm.rawName()}`, () => `The ${nm.rawName()} Range`, () => `${P()}horn Peaks`],
    hills: () => [() => `The ${P()} Downs`, () => `${nm.rawName()} Hills`, () => `The ${P()} Fells`, () => `${P()}barrow Heights`],
    desert: () => [() => `The ${P()} Waste`, () => `Sands of ${nm.rawName()}`, () => `The ${nm.rawName()} Erg`, () => `${P()}glass Desert`],
    swamp: () => [() => `${P()}fen Mire`, () => `The ${nm.rawName()} Marshes`, () => `The ${P()} Bog`, () => `Fens of ${nm.rawName()}`],
    tundra: () => [() => `The ${P()} Barrens`, () => `The ${nm.rawName()} Tundra`, () => `${P()}rime Wastes`],
    plain: () => [() => `Vale of ${nm.rawName()}`, () => `The ${P()}field Plains`, () => `The ${P()} Meads`]
  };
  const regionOf = new Int16Array(N).fill(-1); const regions = [];
  const seen = new Uint8Array(N);
  for (const i0 of L) {
    if (seen[i0]) continue; const g = GROUP[B[i0]]; const cl = [i0]; seen[i0] = 1;
    for (let h = 0; h < cl.length; h++) for (const n of NB[cl[h]]) if (n >= 0 && !seen[n] && land[n] && GROUP[B[n]] === g) { seen[n] = 1; cl.push(n); }
    if (cl.length < MINSZ[g]) continue;
    const name = nm.uniq(TPL[g]());
    regions.push(labelFor(cl, name, g));
    cl.forEach(h => regionOf[h] = regions.length - 1);
  }
  function labelFor(cl, name, g) {
    let mx = 0, my = 0; for (const h of cl) { mx += CX[h]; my += CY[h]; } mx /= cl.length; my /= cl.length;
    let sxx = 0, syy = 0, sxy = 0; for (const h of cl) { const dx = CX[h] - mx, dy = CY[h] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
    if (l1 / Math.max(l2, 1) < 1.8) ang = 0;
    if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    ang = Math.max(-0.42, Math.min(0.42, ang));
    let best = cl[0], bd = 1e12; for (const h of cl) { const d = (CX[h] - mx) ** 2 + (CY[h] - my) ** 2; if (d < bd) { bd = d; best = h; } }
    return { name, group: g, size: cl.length, x: (CX[best] + mx) / 2, y: (CY[best] + my) / 2, ang };
  }

  /* lakes */
  const lakes = []; const lakeOf = new Int16Array(N).fill(-1); const seenL = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (B[i] !== 'lake' || seenL[i]) continue; const cl = [i]; seenL[i] = 1;
    for (let h = 0; h < cl.length; h++) for (const n of NB[cl[h]]) if (n >= 0 && !seenL[n] && B[n] === 'lake') { seenL[n] = 1; cl.push(n); }
    const bs = basinOf[i] >= 0 ? basins[basinOf[i]] : null, salt = !!(bs && bs.salt);
    const name = cl.length >= 3 || (bs && (bs.inRivers.length || bs.outRiver >= 0)) ? nm.uniq(salt ? [() => `The ${P()} Salt Pan`, () => `${nm.rawName()} Bitter Mere`, () => `The ${pick(ADJ)} Brine`] : [() => `Lake ${nm.rawName()}`, () => `${P()}mere`, () => `The ${pick(ADJ)} Lake`, () => `${P()} Water`]) : '';
    const hyd = bs ? { salt, ins: bs.inRivers.map(r => rivers[r].name), out: bs.outRiver >= 0 ? rivers[bs.outRiver].name : '', sea: !salt && bs.outT >= 0 && ocean[bs.outT], inflow: bs.inflow, keep: bs.inflow > 0 ? 1 - bs.out / bs.inflow : 1 } : null;
    lakes.push({ name, size: cl.length, hyd, ...labelFor(cl, name, 'lake'), ang: 0 });
    cl.forEach(h => lakeOf[h] = lakes.length - 1);
  }

  /* cartouche, compass, seas */
  const CW = 330, CH = 104, inset = M + 16;
  const corners = [[inset, worldH - inset - CH], [inset, inset], [worldW - inset - CW, worldH - inset - CH], [worldW - inset - CW, inset]];
  let cart = null;
  for (const [x, y] of corners) {
    let ok = true;
    for (let i = 0; i < N && ok; i++) if (CX[i] > x - R * 1.3 && CX[i] < x + CW + R * 1.3 && CY[i] > y - R * 1.3 && CY[i] < y + CH + R * 1.3 && !ocean[i]) ok = false;
    if (ok) { cart = { x, y, w: CW, h: CH }; break; }
  }
  const nearCart = (x, y, pad) => cart && x > cart.x - pad && x < cart.x + cart.w + pad && y > cart.y - pad && y < cart.y + cart.h + pad;
  let compass = null, bestSc = -1e9;
  for (let i = 0; i < N; i++) {
    if (!ocean[i] || distL[i] < 2) continue;
    const rad = Math.max(40, Math.min(74, (distL[i] - 0.7) * HW));
    const x = CX[i], y = CY[i];
    if (x - rad * 1.15 < M || x + rad * 1.15 > worldW - M || y - rad * 1.3 - 14 < M || y + rad * 1.15 > worldH - M) continue;
    if (nearCart(x, y, rad + 30)) continue;
    const cd = Math.min(Math.hypot(x - M, y - M), Math.hypot(x - worldW + M, y - M), Math.hypot(x - M, y - worldH + M), Math.hypot(x - worldW + M, y - worldH + M));
    const sc = rad * 1.4 - cd * 0.12 + (cart ? Math.hypot(x - cart.x - CW / 2, y - cart.y - CH / 2) * 0.05 : 0);
    if (sc > bestSc) { bestSc = sc; compass = { x, y, r: rad }; }
  }
  const seas = []; const seaOf = new Int16Array(N).fill(-1);
  for (const minD of [3, 2]) {
    if (seas.length) break;
    const sc = [];
    for (let i = 0; i < N; i++) { const c = i % COLS, r = (i / COLS) | 0; if (ocean[i] && distL[i] >= minD && c >= 3 && c <= COLS - 4 && r >= 2 && r <= ROWS - 3) sc.push(i); }
    sc.sort((a, b) => distL[b] - distL[a] || CY[a] - CY[b]);
    for (const i of sc) {
      if (seas.length >= 3) break;
      if (seas.some(s => hexDist(s.i, i) < 13)) continue;
      if (nearCart(CX[i], CY[i], 90)) continue;
      if (compass && Math.hypot(CX[i] - compass.x, CY[i] - compass.y) < compass.r + 110) continue;
      seas.push({ i, x: CX[i], y: CY[i], name: nm.uniq([() => `The Sea of ${pick(NOUNS)}`, () => `The ${nm.rawName()} Sea`, () => `The ${pick(ADJ)} Deep`, () => `The ${nm.rawName()} Reach`]) });
    }
  }
  if (seas.length) for (let i = 0; i < N; i++) if (ocean[i]) { let b = 0, bd = 1e9; seas.forEach((s, k) => { const d = hexDist(s.i, i); if (d < bd) { bd = d; b = k; } }); seaOf[i] = b; }

  const orn = [];
  { const oc = []; for (let i = 0; i < N; i++) if (ocean[i] && distL[i] >= 2 && sAt[i] < 0 && (B[i] === 'deep' || B[i] === 'sea')) oc.push(i);
    for (const i of shuffled(oc)) {
      if (orn.length >= 3) break;
      const x = CX[i], y = CY[i];
      if (x < M + R * 2.5 || x > worldW - M - R * 2.5 || y < M + R * 2.5 || y > worldH - M - R * 1.5) continue;
      if (nearCart(x, y, 70)) continue;
      if (compass && Math.hypot(x - compass.x, y - compass.y) < compass.r + 80) continue;
      if (seas.some(s => hexDist(s.i, i) < 4) || orn.some(o => hexDist(o.i, i) < 9)) continue;
      orn.push({ i, type: orn.length === 1 ? 'serpent' : 'ship', flip: rng() < 0.5 });
    } }
  const ornAt = new Map(orn.map(o => [o.i, o]));

  /* frontier works, placed last on their own stream so nothing laid out before them shifts:
     forest outposts watch the roads through the woods, hill forts crown the high ground */
  { const fr = mulberry32(seedHash ^ 0x5f0a7e11), sh = a => { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(fr() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
    const woody = i => B[i] === 'forest' || B[i] === 'deepwood' || B[i] === 'taiga';
    const nearRoad = i => onRoad[i] || NB[i].some(n => n >= 0 && onRoad[n]);
    const free = i => sAt[i] < 0 && !ornAt.has(i) && far(i, 3);
    const pickBy = (kind, count, score) => { const c = sh(L).filter(free).map(i => ({ i, sc: score(i) + fr() * 0.5 })).filter(o => o.sc > 0).sort((a, b) => b.sc - a.sc); let n = 0; for (const o of c) { if (n >= count) break; if (!free(o.i) || settle.some(t => t.kind === kind && hexDist(t.i, o.i) < 6)) continue; add(kind, o.i); n++; } };
    pickBy('outpost', 3, i => !woody(i) ? 0 : 1 + (onRoad[i] ? 2 : nearRoad(i) ? 1.2 : 0) + NB[i].filter(n => n >= 0 && woody(n)).length * 0.15 - (nearTown(i, 3) ? 1 : 0));
    pickBy('hillfort', 3, i => B[i] !== 'hills' ? 0 : 1 + el[i] * 2 + (nearRoad(i) ? 1 : 0) + (NB[i].some(n => n >= 0 && mtn(n)) ? 0.6 : 0) - (nearTown(i, 2) ? 1 : 0));
    // waterfalls: the steepest steps along any river, off a scarp of hills or mountains
    { const cand = [];
      rivers.forEach(rv => { const p = rv.path; for (let k = 1; k < p.length - 1; k++) {
        const h = p[k], up = p[k - 1], dn = p[k + 1]; if (!land[h] || !land[up]) continue;
        if (CY[dn] - CY[up] < R * 2.4 || Math.abs(CX[dn] - CX[up]) > R * 1.6) continue;   // the falls face the reader: the river must run steeply down the map, not across it
        const high = b => b === 'mountain' || b === 'peak' || b === 'hills';
        const drop = el[up] - (land[dn] ? el[dn] : el[h] - 0.08);
        cand.push({ i: h, sc: drop * 3 + (high(B[up]) ? 0.35 : 0) + (B[up] === 'mountain' || B[up] === 'peak' ? 0.25 : 0) + (high(B[h]) ? 0.15 : 0) + fr() * 0.2 });
      } });
      cand.sort((a, b) => b.sc - a.sc); let n = 0;
      for (const c of cand) { if (n >= 3 || c.sc < 0.25) break; if (sAt[c.i] >= 0 || ornAt.has(c.i) || !far(c.i, 2) || onRoad[c.i] || NB[c.i].some(x => x >= 0 && sAt[x] >= 0) || settle.some(t => t.kind === 'waterfall' && hexDist(t.i, c.i) < 6)) continue; add('waterfall', c.i); n++; } }
    for (const s of settle) {
      if (s.kind === 'outpost') s.name = nm.uniq([() => `${P()}watch Outpost`, () => `The ${P()} Stockade`, () => `Wardens' Post at ${nm.rawName()}`, () => `${nm.rawName()}'s Lodge`, () => `Fort ${P()}holt`]);
      else if (s.kind === 'waterfall') s.name = nm.uniq([() => `The ${P()} Falls`, () => `${nm.rawName()} Force`, () => `The ${pick(['Weeping', 'Silver', 'Thundering', 'White', 'Bridal', 'Long'])} Veil`, () => `${nm.rawName()}'s Leap`, () => `The ${P()}spout`]);
      else if (s.kind === 'hillfort') s.name = nm.uniq([() => `Dun ${nm.rawName()}`, () => `${P()}bury Rings`, () => `Caer ${nm.rawName()}`, () => `The ${P()} Ramparts`, () => `${nm.rawName()} Hillfort`]);
    }
  }

  /* sprawl: big places spill past their walls into the neighbouring hexes, along the roads and the river first.
     A capital grows a ring of suburbs, a city a few, a large market town one. */
  const sprawl = new Int16Array(N).fill(-1);
  { const sr = mulberry32(seedHash ^ 0x51ab07);
    const want = s => s.kind === 'capital' ? 4 + (s.pop > 30000 ? 1 : 0) : s.kind === 'city' ? 2 + (s.pop > 10000 ? 1 : 0) : s.kind === 'town' && s.pop > 2600 ? 1 : 0;
    const okB = b => b === 'grass' || b === 'forest' || b === 'hills' || b === 'desert' || b === 'tundra' || b === 'taiga' || b === 'deepwood';
    const order = settle.map((s, si) => [s, si]).filter(([s]) => want(s)).sort((a, b) => b[0].pop - a[0].pop);
    for (const [s, si] of order) {
      let n = want(s); const taken = [], front = [s.i];
      while (n > 0) {
        let best = -1, bs = -1e9;
        for (const f of front) for (const nb of NB[f]) {
          if (nb < 0 || !land[nb] || sAt[nb] >= 0 || sprawl[nb] >= 0 || ornAt.has(nb) || !okB(B[nb])) continue;
          const d = hexDist(nb, s.i); if (d > (s.kind === 'capital' ? 2 : 1)) continue;
          if (NB[nb].some(m => m >= 0 && sAt[m] >= 0 && m !== s.i)) continue;          // never grow into another place's doorstep
          const touch = NB[nb].filter(m => m >= 0 && (m === s.i || taken.includes(m))).length;
          const sc = (onRoad[nb] ? 2.2 : 0) + (riverOf[nb] >= 0 ? 1 : 0) + (B[nb] === 'grass' ? 1.2 : B[nb] === 'hills' ? 0.1 : 0.4) + (farm[nb] ? 0.5 : 0) - (d - 1) * 1.4 + touch * 0.6 + sr() * 0.7;
          if (sc > bs) { bs = sc; best = nb; }
        }
        if (best < 0) break;
        sprawl[best] = si; taken.push(best); front.push(best); n--;
      }
      s.sprawl = taken;
    }
  }
  return { orn, ornAt, farm, sprawl, seed: seedStr, seedHash, B, land, ocean, el, hR, ms, temp, distW, distL, jit, rivers, riverOf, flow, flowT, basins, basinOf, settle, sAt, roads, onRoad, regions, regionOf, lakes, lakeOf, seas, seaOf, cart, compass, realm, nC, X, Y };
}

export { generate };
