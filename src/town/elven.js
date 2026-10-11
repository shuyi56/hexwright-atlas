/* ================= town view: the elven wood =================
   The elven pieces (tiles/elven.js) seen from the south, as town/pieces.js draws every piece: front walls square to
   the screen, roofs leaning back over them, inked round the edge. The buildings are after Rivendell, each with its
   own shape rather than one house in different clothes:

   - the hall: a long hall behind a tall gabled porch whose concave gable holds a rose window, buttresses with gold
     caps between its tracery windows, ivy up its west end;
   - the manor: a steep gable front with a balcony on carved brackets across its upper floor and a triple light
     behind it, a lower wing to the east and a round turret with a flared, curving roof;
   - the rotunda: a drum ringed with tracery lights between pilasters over an arcade whose arches open on a lit
     interior, under a dome of scale tiles ribbed in gold and a small arcaded lantern;
   - the spire: a tapering tower on a stepped base, slender lights stacked up it, a corbelled balcony, a bell stage of
     tall lit tracery and a flared needle roof;
   - the pavilion: an open arcade on columns wound with gold vines, a bench and a lantern inside, an onion roof of
     scales with drops at its eave;
   - the archway: clustered shafts carrying a pointed arch of voussoirs with a gold leaf trail and tracery in its
     head, lanterns hung under it, ivy up one side;
   - the flet: a round house of pale boards under a flared roof on a railed platform, a stair winding up the trunk
     to it, lanterns hung from the platform, the mallorn's gold crown above.

   Everything shares one kit, below: moonstone laid in long, shallow courses (so it never reads as brick); pilasters
   that stand proud and cast a shadow east; carved friezes; roofs of verdigris scale tiles that sweep down in a
   concave curve and flick up at the eaves, gold along the ridge with a cresting of curls; concave gables with carved
   barge boards, a finial above and a pendant below; tracery lights, rose windows, carved double doors with a lit
   tympanum; lanterns on gold brackets; and ivy. The light is cool and pale against the warm lamps of the towns.

   elvenTown(H) is handed the raster helpers it needs from town/pieces.js and returns the drawings by asset id. */
function elvenTown(H) {
  const { R, mix, INK, h2, hexRgb, crown, foliageRamp, leafRamp, leafClump, trunk, broadleaf, wallTone, ROOF } = H;
  const ELF = { moon: '#ece9df', moonD: '#d6d2c4', verd: ROOF.copper, glass: '#5f8f8c', door: '#4f6e5c', bark: '#d6d1c2', gold: '#c9a24f', mallorn: '#e2c45a', willow: '#aac08a', glow: '#e4f6ea', ivy: '#5f7f4a', dark: '#2a3a36', lit: '#f2e2a0' };
  const M = R(ELF.moon), MD = R(ELF.moonD), G = R(ELF.gold), V = R(ELF.verd), Gl = R(ELF.glass), D = R(ELF.door), L = R(ELF.lit), GLOW = R(ELF.glow), IVY = leafRamp(ELF.ivy), DK = R(ELF.dark);

  /* ---------- light and stone ---------- */
  /* lay a pale light over what is drawn round (cx, cy), dithered at its edge */
  function glow(K, cx, cy, r, k = 0.35) {
    const c = hexRgb(ELF.glow);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r; if (d >= 1 || !K.get(x, y) || (d > 0.5 && (x + y) % 2)) continue;
      const q = ((Math.floor(y) + K.oy) * K.w + Math.floor(x) + K.ox) * 4; for (let i = 0; i < 3; i++) K.px[q + i] += (c[i] - K.px[q + i]) * k * (1 - d * 0.5);
    }
  }
  /* moonstone in long shallow courses: a lit arris along each course's top, a soft joint under it, the odd stone a
     shade off; east is darker by `side` (0 the front, 1 a wall turned from the light) */
  function ashlar(x, y, side = 0) {
    const row = Math.floor(y / 8), off = Math.floor(h2(row, 3) * 30), bx = (((x + off) % 30) + 30) % 30, by = ((y % 8) + 8) % 8, blk = h2(row, Math.floor((x + off) / 30), 5);
    let t = by === 7 ? 3 : bx === 0 ? 2.6 : by === 0 ? 0.6 : blk < 0.2 ? 1.6 : blk > 0.85 ? 1.2 : 1.35;
    if (h2(x, y, 7) < 0.03) t += 0.6;
    t += side * 1.3;
    const i = Math.floor(t), f = t - i; return i >= 4 ? M[4] : mix(M[i], M[i + 1], f > 0.5 && (x + y) % 2 ? 1 : f > 0.75 ? 1 : 0);
  }
  /* a stretch of front wall, its east end turned from the light; shade lies along its foot and under its top */
  function wall(K, x0, x1, top, yb, opts = {}) {
    K.rect(x0, top, x1, yb, (x, y) => ashlar(x, y, opts.side || 0));
    if (opts.plinth !== false) K.rect(x0 - 1, yb - 6, x1 + 1, yb, (x, y) => (y === yb - 6 ? MD[0] : y === yb - 5 ? MD[1] : (x + (y > yb - 3 ? 7 : 0)) % 14 === 0 ? MD[3] : MD[2]));
    K.rect(x0, top, x1, top + 2, (x, y) => mix(ashlar(x, y, opts.side || 0), INK, 0.25));
  }
  /* the turned east wall of a block: a strip `w` wide beside x, in shade, its top receding a few pixels */
  function sideWall(K, x, w, top, yb) { K.poly([[x, yb], [x + w, yb - 4], [x + w, top - 4], [x, top]], (px, py) => mix(ashlar(px, py, 1), INK, 0.12)); }
  /* a pilaster or buttress standing proud of the wall: lit on its west face, a shadow cast east; a gold cap */
  function pilaster(K, x, top, yb, w = 6, cap = true) {
    for (let y = top; y < yb; y++) { K.shade(x + w, y, 0.32); K.shade(x + w + 1, y, 0.18); }
    K.rect(x, top, x + w, yb, (px, py) => (px === x ? M[0] : px === x + w - 1 ? M[3] : ((py % 8) + 8) % 8 === 7 ? M[2] : M[1]));
    if (cap) { K.rect(x - 1, top - 3, x + w + 1, top, (px, py) => G[py === top - 3 ? 1 : px > x + w - 1 ? 3 : 2]); K.set(x + (w >> 1), top - 4, G[0]); }
    K.rect(x - 1, yb - 5, x + w + 1, yb, (px, py) => MD[py === yb - 5 ? 0 : px === x + w ? 3 : 2]);
  }
  /* a carved frieze: a running scroll of gold vine with leaves on a band of stone */
  function frieze(K, x0, x1, y, h = 6) {
    K.rect(x0, y, x1, y + h, (x, yy) => (yy === y ? M[0] : yy === y + h - 1 ? M[3] : M[2]));
    for (let x = x0 + 1; x < x1 - 1; x++) {
      const v = y + Math.round(h / 2 - 0.5 + (h / 2 - 1.5) * Math.sin(x / 3.2)); K.set(x, v, G[1]);
      if (x % 8 === 0) { const up = Math.sin(x / 3.2) < 0 ? 1 : -1; K.set(x, v + up, G[2]); K.set(x + 1, v + up, G[1]); }
    }
  }
  /* ivy climbing from (x, yb) up h pixels, its stem wandering, leaves in pairs */
  function ivy(K, x, yb, h, seed) {
    let cx = x;
    for (let i = 0; i < h; i++) {
      const y = yb - i; cx += Math.round((h2(i >> 2, seed, 3) - 0.5) * 1.4); K.set(cx, y, IVY[4]);
      if (i % 3 === 0) for (const d of [-1, 1]) { if (h2(i, d + 2, seed) < 0.75 - i / h * 0.5) { const lx = cx + d * (1 + Math.floor(h2(i, d, seed) * 3)); K.set(lx, y, IVY[1]); K.set(lx + d, y, IVY[2]); K.set(lx, y + 1, IVY[3]); K.set(lx + d, y - 1, IVY[2]); } }
    }
  }
  /* a gold finial h high standing on (x, y): a rod with a knop and a leaf at its top */
  function finial(K, x, y, h) {
    K.rect(x, y - h, x + 2, y, (px) => G[px === x ? 1 : 3]); K.rect(x - 1, y - Math.round(h * 0.45), x + 3, y - Math.round(h * 0.45) + 2, G[2]);
    K.set(x, y - h - 4, G[0]); K.rect(x - 1, y - h - 3, x + 3, y - h - 1, (px) => G[px <= x ? 1 : 2]); K.set(x + 1, y - h - 4, G[1]); K.set(x, y - h - 5, G[0]);
  }
  /* a lantern hung from a gold bracket off a wall at (x, y), reaching toward dir */
  function lantern(K, x, y, dir = 1) {
    for (let i = 0; i < 7; i++) K.set(x + dir * i, y - Math.round(Math.sin(i / 6 * Math.PI) * 2), G[i < 2 ? 2 : 1]);
    K.set(x + dir * 6, y + 1, G[2]);
    const lx = x + dir * 6; K.rect(lx - 2, y + 2, lx + 3, y + 4, G[1]); K.rect(lx - 2, y + 4, lx + 3, y + 10, (px, py) => GLOW[py < y + 7 ? 0 : 1]); K.rect(lx - 1, y + 10, lx + 2, y + 12, G[2]);
    glow(K, lx + 0.5, y + 7, 14);
  }

  /* ---------- openings ---------- */
  /* how wide a pointed arch hw half-wide and h high is dy above its sill: straight up to the springing line, then
     drawing in to a point */
  const archHalf = (hw, h, dy) => { const sh = h - hw * 1.9; return dy < sh ? hw : hw * (1 - Math.pow((dy - sh) / (h - sh), 1.5)); };
  /* a tracery light: set back in a reveal (shaded along its top and west), glass behind a mullion that branches in
     a Y under an oculus, a transom in a tall one, a sill below and a gold hood-mould over the arch */
  function light(K, cx, yb, w, h, opts = {}) {
    const hw = w / 2, sh = h - hw * 1.9, glass = opts.lit ? L : Gl, oc = sh + (h - sh) * 0.5, r = hw * 0.42;
    K.rect(cx - hw - 2, yb, cx + hw + 2, yb + 2, (x, y) => (y === yb ? M[0] : M[3]));
    for (let dy = 0; dy < h + 3; dy++) {
      const y = yb - dy - 1, hood = archHalf(hw + 2, h + 3, dy), lim = archHalf(hw, h, dy);
      for (let x = Math.floor(cx - hw - 3); x <= cx + hw + 3; x++) {
        const dx = x + 0.5 - cx, ad = Math.abs(dx);
        if (ad >= lim) { if (ad < hood && dy > sh - 2) K.set(x, y, G[ad > hood - 1 ? 3 : 1]); continue; }
        let c;
        if (ad >= lim - 1.2) c = dx < 0 ? M[1] : M[3];
        else if (ad < 0.8 && dy < sh + 1) c = M[1];
        else if (dy >= sh && dy < sh + hw * 1.1 && Math.abs(ad - (dy - sh) * 0.85) < 0.8) c = M[1];
        else if (hw >= 3.5 && Math.abs(Math.hypot(dx, dy - oc) - r) < 0.8) c = M[1];
        else if (h > 18 && Math.abs(dy - sh * 0.55) < 0.7) c = M[1];
        else {
          /* the glass: the reveal's shadow along the west and top, a sheen across the upper panes */
          const inset = dx < -lim + 2.8 || dy > h - 4;
          c = hw >= 3.5 && Math.hypot(dx, dy - oc) < r ? (opts.lit ? L[0] : R('#a8d0c8')[1]) : glass[inset ? 3 : dy > h * 0.55 && (x + dy) % 5 ? 1 : (x + dy) % 7 === 0 ? 1 : 2];
        }
        K.set(x, y, c);
      }
    }
  }
  /* a group of three lights under one hood, the middle one taller */
  function tripleLight(K, cx, yb, w, h, lit) { light(K, cx - w - 3, yb, w, h - 8, { lit }); light(K, cx + w + 3, yb, w, h - 8, { lit }); light(K, cx, yb, w, h, { lit: true }); }
  /* a rose window: a gold rim round a ring of stone, six lobes of tracery about a lit heart */
  function rose(K, cx, cy, r, lit = true) {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx); if (d > r + 2) continue;
      let c;
      if (d > r + 0.8) c = G[dx + dy < 0 ? 1 : 3];
      else if (d > r - 1.5) c = dx + dy < 0 ? M[1] : M[3];
      else if (d < r * 0.24) c = lit ? L[0] : Gl[1];
      else if (Math.abs(d - r * 0.24) < 0.8) c = M[1];
      else {
        const lobe = Math.min(...Array.from({ length: 6 }, (_, k) => { const b = k * Math.PI / 3; return Math.hypot(dx - Math.cos(b) * r * 0.58, dy - Math.sin(b) * r * 0.58); }));
        c = Math.abs(lobe - r * 0.3) < 0.8 ? M[1] : Math.abs(Math.sin(3 * a)) < 0.08 && d > r * 0.3 ? M[2] : (lit ? L : Gl)[lobe < r * 0.3 ? 1 : 2];
      }
      K.set(x, y, c);
    }
  }
  /* a carved double door in a pointed arch: a frame of stone with a gold bead, two leaves of green wood with gold
     vines carved on them and ring handles, a lit tracery tympanum, and steps before it */
  function door(K, cx, yb, w, h) {
    const hw = w / 2, sh = h - hw * 1.9;
    K.rect(cx - hw - 8, yb, cx + hw + 8, yb + 3, (x, y) => (y === yb ? M[0] : M[2])); K.rect(cx - hw - 12, yb + 3, cx + hw + 12, yb + 6, (x, y) => (y === yb + 3 ? M[0] : M[3]));
    for (let dy = 0; dy < h + 4; dy++) {
      const y = yb - dy - 1, out = archHalf(hw + 4, h + 4, dy), lim = archHalf(hw, h, dy);
      for (let x = Math.floor(cx - hw - 4); x <= cx + hw + 4; x++) {
        const dx = x + 0.5 - cx, ad = Math.abs(dx); if (ad >= out) continue;
        if (ad >= lim) { K.set(x, y, ad < lim + 1.2 ? G[1] : ad > out - 1 ? (dx < 0 ? M[1] : M[4]) : dx < 0 ? M[0] : M[2]); continue; }
        let c;
        if (dy >= sh - 2) {
          /* the tympanum: tracery over a warm light within */
          const t = dy - sh + 2, k = Math.abs(ad - t * 0.8) < 0.8 || ad < 0.8 || dy < sh - 1 || Math.abs(Math.hypot(dx, dy - (sh + (h - sh) * 0.55)) - hw * 0.35) < 0.8;
          c = k ? M[1] : L[t > 6 ? 0 : 1];
        } else if (ad < 0.8) c = D[4];
        else {
          const lx = dx < 0 ? dx + hw / 2 : dx - hw / 2, vine = Math.abs(lx - 1.6 * Math.sin(dy / 4)) < 0.7 && dy > 4 && dy < sh - 6;
          c = vine ? G[dy % 8 < 4 ? 1 : 2] : (dy % 8 === 4 && Math.abs(lx) < 2.5 && dy > 4 && dy < sh - 6) ? G[2] : D[ad > hw - 1.5 ? 3 : dx < 0 ? 1 : 2];
        }
        K.set(x, y, c);
      }
    }
    for (const d of [-1, 1]) { const x = Math.round(cx + d * 3); K.set(x, yb - Math.round(sh * 0.45), G[0]); K.set(x - d, yb - Math.round(sh * 0.45) + 1, G[2]); K.set(x + d, yb - Math.round(sh * 0.45) + 1, G[2]); K.set(x, yb - Math.round(sh * 0.45) + 2, G[2]); }
  }
  /* an open pointed bay: the lit interior beyond, a stone rim, tracery hung in its head */
  function bay(K, cx, yb, hw, h, inside = null) {
    const sh = h - hw * 1.9;
    for (let dy = 0; dy < h; dy++) {
      const lim = archHalf(hw, h, dy);
      for (let x = Math.floor(cx - lim); x < cx + lim; x++) {
        const dx = x + 0.5 - cx, ad = Math.abs(dx);
        let c = inside ? inside(x, yb - dy, dy) : DK[dy < 3 ? 4 : 3];
        if (ad > lim - 1.6) c = dx < 0 ? M[1] : M[3];
        else if (dy > sh && dy < sh + hw * 0.9 && Math.abs(ad - (dy - sh) * 0.9) < 0.9) c = M[1];
        else if (dy > sh && Math.abs(Math.hypot(dx, dy - (sh + (h - sh) * 0.55)) - hw * 0.36) < 0.8) c = M[1];
        K.set(x, yb - dy, c);
      }
    }
  }

  /* ---------- roofs ---------- */
  /* verdigris scale tiles: rows of rounded scales, each lit along its upper edge and shadowed along its lower; plane
     shifts the whole a step lighter (-1) or darker (+1) */
  function scale(x, y, plane = 0, P = V) {
    const row = Math.floor(y / 6), ly = ((y % 6) + 6) % 6, sx = x + (row % 2) * 4, lx = ((sx % 8) + 8) % 8 - 3.5, edge = 5 - Math.round(2.6 * Math.sqrt(Math.max(0, 1 - (lx / 4.2) ** 2)));
    let t = ly >= edge ? 4 : ly === edge - 1 ? 3 : ly <= 1 ? 1 : 2;
    if (t === 2 && h2(Math.floor(sx / 8), row, 21) < 0.12) t = 1;
    return P[Math.max(0, Math.min(4, t + plane))];
  }
  /* A broadside roof seen from the south from x l to r: its eave at yE flicks up `flick` pixels at both ends, its ends
     sweep in concave curves to a ridge at yR shortened by `hip` each side, scales lighter toward the ridge, the east end
     in shade; a gold fascia along the eave with the shadow under it; a gold ridge with a cresting of curls. */
  function sweptRoof(K, l, r, yE, yR, opts = {}) {
    const flick = opts.flick ?? 6, hip = opts.hip ?? 14, fw = 28, span = yE - yR;
    const eave = x => yE - flick * (Math.max(0, 1 - (x - l) / fw) ** 2 + Math.max(0, 1 - (r - x) / fw) ** 2);
    const inset = y => hip * Math.pow(Math.max(0, (yE - y) / span), 1.7);
    for (let y = Math.floor(yR); y <= yE; y++) for (let x = Math.floor(l + inset(y)); x < r - inset(y); x++) {
      if (y > eave(x)) continue;
      const t = (y - yR) / span, east = x > r - (r - l) * 0.12 - inset(y) ? 1 : 0;
      K.set(x, y, scale(x, y, (t < 0.3 ? -1 : t > 0.8 ? 1 : 0) + east));
    }
    for (let x = Math.floor(l); x < r; x++) { const e = Math.round(eave(x)); K.set(x, e, G[1]); K.set(x, e + 1, G[3]); if (x % 6 === 3) K.set(x, e + 2, G[2]); }
    if (opts.wallTop != null) for (let x = Math.ceil(l + 6); x < r - 6; x++) for (let k = 2; k < 6; k++) K.shade(x, Math.round(eave(x)) + k + 1, 0.3 - k * 0.04);
    const r0 = Math.ceil(l + hip), r1 = Math.floor(r - hip);
    K.rect(r0, yR - 1, r1, yR + 3, (x, y) => G[y === yR - 1 ? 0 : y === yR + 2 ? 3 : 1]);
    for (let x = r0 + 3; x < r1 - 3; x += 7) { K.set(x, yR - 2, G[1]); K.set(x + 1, yR - 3, G[0]); K.set(x - 1, yR - 3, G[1]); K.set(x, yR - 4, G[0]); }
    for (const x of [r0 - 1, r1 - 1]) finial(K, x, yR, 10);
  }
  /* A gable seen end on, apex at (cx, ya), its wall top at yb0, hw half-wide there: the concave barge boards flare
     at their feet; behind them the two slopes run back `back` pixels in scales; the gable wall is moonstone. Returns
     half(y), the inside half-width of the gable at y. */
  function gable(K, cx, ya, yb0, hw, back = 26) {
    const half = y => { const t = Math.max(0, Math.min(1, (y - ya) / (yb0 - ya))); return hw * Math.pow(t, 1.35) + 5 * Math.max(0, (t - 0.82) / 0.18) ** 2; };
    /* the slopes behind, the east one in shade */
    for (let y = ya - back; y <= yb0; y++) { const w = half(Math.min(yb0, y + back)) + 4; for (let x = Math.floor(cx - w); x < cx + w; x++) { if (y + back < ya) continue; K.set(x, y, scale(x, y, x > cx ? 1 : -1 + (y < ya ? 1 : 0))); } }
    /* the ridge running back from the apex, capped in gold */
    for (let y = ya - back; y < ya; y++) { K.set(Math.round(cx) - 1, y, G[1]); K.set(Math.round(cx), y, G[2]); K.set(Math.round(cx) + 1, y, G[3]); }
    /* the gable wall */
    for (let y = ya; y <= yb0; y++) { const w = half(y) - 3; for (let x = Math.floor(cx - w); x < cx + w; x++) K.set(x, y, ashlar(x, y, 0)); }
    /* barge boards: a gold bead, carved board, a dark under-edge */
    for (let y = ya - 2; y <= yb0 + 1; y++) {
      const w = half(y);
      for (const s of [-1, 1]) for (let k = -3; k <= 1; k++) { const x = Math.round(cx + s * (w + k)); K.set(x, y, k === 1 ? G[3] : k === -3 ? M[3] : k === 0 ? G[1] : (y % 4 === 0 ? G[0] : M[s < 0 ? 0 : 2])); }
    }
    finial(K, Math.round(cx) - 1, ya - 2, 14);
    /* a pendant hanging inside the apex */
    K.rect(Math.round(cx) - 1, ya, Math.round(cx) + 1, ya + 9, G[2]); K.rect(Math.round(cx) - 2, ya + 9, Math.round(cx) + 2, ya + 12, G[1]); K.set(Math.round(cx), ya + 13, G[2]);
    return half;
  }
  /* a cone or needle roof over a round tower at (cx, y) rx wide and h tall, its flanks concave so it flares at the
     eave, scales ribbed in gold, a gold rim */
  function needle(K, cx, y, rx, h, flare = 0.5) {
    for (let dy = 0; dy < h; dy++) {
      const t = dy / h, w = rx * Math.pow(1 - t, 1 + flare) + 1;
      for (let x = Math.floor(cx - w); x < cx + w; x++) { const u = (x + 0.5 - cx) / w; K.set(x, y - dy, Math.abs(u) < 0.06 || Math.abs(Math.abs(u) - 0.55) < 0.05 ? G[t > 0.5 ? 1 : 2] : scale(x, y - dy, u < -0.45 ? -1 : u > 0.35 ? 1 : 0)); }
    }
    K.rect(Math.floor(cx - rx - 1), y - 1, Math.ceil(cx + rx + 1), y + 2, (x, yy) => G[yy === y - 1 ? 1 : 3]);
    for (let x = Math.floor(cx - rx); x < cx + rx; x += 6) { K.set(x, y + 2, G[2]); K.set(x, y + 3, G[3]); }
    finial(K, Math.round(cx) - 1, y - h, 10);
  }
  /* an onion or dome over (cx, y), rx wide and h tall: it swells out, then draws in to a point; scales and gold ribs */
  function onion(K, cx, y, rx, h, swell = 0.35) {
    for (let dy = 0; dy < h; dy++) {
      const t = dy / h, w = rx * (Math.pow(1 - t, 1.6) + swell * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t)) + 1;
      for (let x = Math.floor(cx - w); x < cx + w; x++) { const u = (x + 0.5 - cx) / w; K.set(x, y - dy, Math.abs(u) < 0.05 || Math.abs(Math.abs(u) - 0.5) < 0.05 || Math.abs(Math.abs(u) - 0.86) < 0.04 ? G[t > 0.5 ? 1 : 2] : scale(x, y - dy, u < -0.5 ? -1 : u > 0.3 ? 1 : 0)); }
    }
    K.rect(Math.floor(cx - rx - 2), y - 1, Math.ceil(cx + rx + 2), y + 2, (x, yy) => G[yy === y - 1 ? 1 : 3]);
    finial(K, Math.round(cx) - 1, y - h, 9);
  }
  /* a round wall from yb up `h`, rx wide: moonstone lit on the west and turning into shade east, in courses that
     curve with the drum */
  function drum(K, cx, yb, rx, h, ry = rx * 0.32) {
    for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, bow = Math.sqrt(Math.max(0, 1 - u * u)) * ry, side = u < -0.55 ? -0.4 : u < 0.2 ? 0 : u < 0.65 ? 0.45 : 0.9;
      for (let y = Math.floor(yb - h + bow); y < yb + bow; y++) K.set(x, y, side < 0 ? mix(ashlar(x, Math.round(y - bow), 0), [255, 252, 240], 0.25) : mix(ashlar(x, Math.round(y - bow), 0), INK, side * 0.25));
    }
  }

  /* ---------- the buildings ---------- */
  const build = {
    /* the hall: a long hall behind a tall porch with a rose window in its gable */
    elvenhall: (K, o) => {
      const { FW, FD } = K, yb = FD - 8, seen = o.face !== 2;
      if (FW < FD) {
        /* turned end on: the hall's whole width under one tall concave gable with a rose window, its roof running
           back into the footprint, buttresses at its corners */
        const x0 = 8, x1 = FW - 16, cx = Math.round((x0 + x1) / 2), top = yb - 62;
        wall(K, x0, x1, top, yb); sideWall(K, x1, 8, top, yb);
        gable(K, cx, top - 70, top, (x1 - x0) / 2 + 2, 40);
        rose(K, cx, top - 24, 13, true);
        frieze(K, x0, x1, top + 2, 6);
        pilaster(K, x0 - 1, top + 8, yb, 6); pilaster(K, x1 - 6, top + 8, yb, 6);
        if (seen) { door(K, cx, yb, 18, 40); lantern(K, cx - 16, yb - 38, -1); lantern(K, cx + 16, yb - 38, 1); } else light(K, cx, yb - 12, 14, 34, {});
        ivy(K, x0 + 3, yb - 2, 52, 3);
        return;
      }
      const x0 = 10, x1 = FW - 22, top = yb - 58, cx = Math.round((x0 + x1) / 2);
      sweptRoof(K, x0 - 10, x1 + 18, top + 2, top - 48, { hip: 22, flick: 7, wallTop: top });
      wall(K, x0, x1, top, yb); sideWall(K, x1, 12, top, yb);
      frieze(K, x0, x1, top + 4);
      for (const x of [x0 + 2, x0 + 46, x1 - 52, x1 - 8]) pilaster(K, x, top + 10, yb);
      for (const x of [x0 + 27, x1 - 30]) light(K, x, yb - 12, 14, 34, { lit: x > cx });
      ivy(K, x0 + 4, yb - 2, 48, 3); ivy(K, x0 + 12, yb - 2, 30, 8);
      /* the porch: stepped out a little, its own concave gable over the door with a rose window */
      const pw = 30, pt = top - 6;
      wall(K, cx - pw, cx + pw, pt, yb + 2); sideWall(K, cx + pw, 6, pt, yb + 2);
      gable(K, cx, pt - 54, pt, pw + 2, 22);
      rose(K, cx, pt - 20, 12, true);
      frieze(K, cx - pw, cx + pw, pt + 2, 5);
      pilaster(K, cx - pw - 2, pt + 8, yb + 2, 5); pilaster(K, cx + pw - 3, pt + 8, yb + 2, 5);
      if (seen) { door(K, cx, yb, 20, 42); lantern(K, cx - 18, yb - 40, -1); lantern(K, cx + 18, yb - 40, 1); } else light(K, cx, yb - 12, 14, 34, {});
    },
    /* the manor: a steep gable front with a balcony, a lower wing and a round turret */
    elvenmanor: (K, o) => {
      const { FW, FD } = K, yb = FD - 8, gx = 62, gw = 46, top = yb - 104, wx0 = gx + gw, wx1 = FW - 46, wtop = yb - 76, seen = o.face !== 2;
      /* the wing to the east, under a broadside swept roof */
      sweptRoof(K, wx0 - 6, wx1 + 14, wtop + 2, wtop - 40, { hip: 8, flick: 6, wallTop: wtop });
      wall(K, wx0, wx1, wtop, yb); sideWall(K, wx1, 10, wtop, yb);
      frieze(K, wx0, wx1, wtop + 4, 5);
      light(K, Math.round((wx0 + wx1) / 2), yb - 12, 12, 30, {}); light(K, Math.round((wx0 + wx1) / 2), wtop + 44, 12, 26, { lit: true });
      /* the gable front: two storeys of moonstone under a tall concave gable */
      wall(K, gx - gw, gx + gw, top, yb);
      gable(K, gx, top - 76, top, gw + 2, 34);
      light(K, gx, top - 14, 10, 34, { lit: true });
      frieze(K, gx - gw, gx + gw, top + 2, 6);
      const fl = yb - 52;
      for (const x of [gx - gw + 2, gx + gw - 8]) pilaster(K, x, top + 10, yb, 6);
      /* the upper floor: a triple light behind a balcony on carved brackets */
      tripleLight(K, gx, fl - 8, 10, 34, true);
      const by = fl, bx0 = gx - 34, bx1 = gx + 34;
      for (const x of [bx0 + 4, gx - 2, bx1 - 8]) for (let i = 0; i < 9; i++) { K.rect(x, by + 3 + i, x + 4 - Math.floor(i / 3), by + 4 + i, M[i < 2 ? 1 : 2]); K.set(x + 4 - Math.floor(i / 3), by + 3 + i, M[4]); }
      K.rect(bx0 - 2, by, bx1 + 2, by + 4, (x, y) => (y === by ? G[1] : y === by + 3 ? M[4] : M[2]));
      for (let x = bx0; x < bx1; x += 7) { K.rect(x, by - 12, x + 2, by, (px) => M[px === x ? 0 : 2]); for (let i = 0; i < 5; i++) K.set(x + 2 + i, by - 7 - Math.round(3 * Math.sin(Math.PI * i / 4)), M[1]); }
      K.rect(bx0 - 2, by - 14, bx1 + 2, by - 11, (x, y) => G[y === by - 14 ? 0 : 2]);
      if (seen) { door(K, gx, yb, 18, 40); lantern(K, gx - 16, yb - 38, -1); } else light(K, gx, yb - 12, 12, 30, {});
      light(K, gx - 32, yb - 12, 10, 28, {}); light(K, gx + 32, yb - 12, 10, 28, {});
      /* the turret: a round tower against the wing's east end, lights up it, a flared needle */
      const tx = FW - 30, tr = 22, tyb = yb + 2, th = 168;
      drum(K, tx, tyb, tr, th);
      for (let y = tyb - th + 4; y < tyb - 6; y += 46) K.rect(tx - tr, y, tx + tr, y + 2, (x, yy) => G[yy === y ? 1 : 3]);
      light(K, tx - 3, tyb - 22, 9, 26, {}); light(K, tx - 3, tyb - 72, 9, 26, { lit: true }); light(K, tx - 3, tyb - 120, 9, 24, {});
      ivy(K, tx - 14, tyb, 90, 5); ivy(K, tx + 10, tyb, 50, 11);
      needle(K, tx, tyb - th + 6, tr + 6, 70, 0.6);
    },
    /* the rotunda: a drum of tracery over an arcade, a dome of scales and a lantern */
    elvenrotunda: (K) => {
      const { FW, FD } = K, cx = FW / 2, yb = FD - 10, dr = 54, ar = 82, aTop = yb - 66, dTop = yb - 152;
      /* the drum, ringed with tracery lights between pilasters, a frieze under the dome */
      drum(K, cx, aTop, dr, dTop > 0 ? aTop - dTop : 80, 10);
      for (const dx of [-38, -13, 13, 38]) light(K, cx + dx, aTop - 16, 12, 50, { lit: dx === 13 });
      for (const dx of [-26, 0, 26]) pilaster(K, Math.round(cx + dx - 3), dTop + 14, aTop - 10, 5);
      frieze(K, cx - dr, cx + dr, dTop + 4, 7);
      /* the dome, ribbed, with an arcaded lantern on top */
      onion(K, cx, dTop + 2, dr + 4, 76, 0.28);
      const lb = dTop - 66;
      K.rect(cx - 12, lb - 20, cx + 12, lb, (x, y) => mix(ashlar(x, y, 0), INK, (x - cx) / 12 > 0.4 ? 0.3 : (x - cx) / 12 > 0 ? 0.12 : 0));
      for (const dx of [-7, 0, 7]) bay(K, cx + dx, lb - 2, 3, 15, (x, y, dy) => L[dy > 9 ? 2 : dy > 4 ? 1 : 3]);
      K.rect(cx - 12, lb - 18, cx + 12, lb - 15, G[1]);
      onion(K, cx, lb - 17, 10, 18, 0.4);
      glow(K, cx, lb - 8, 10);
      /* the arcade round the foot: columns on bases, pointed bays opening on the lit floor within, a lean-to */
      K.rect(cx - ar - 4, yb - 4, cx + ar + 4, yb + 4, (x, y) => (y === yb - 4 ? M[0] : y > yb + 1 ? M[3] : MD[(x >> 3) % 2 ? 1 : 2]));
      K.rect(cx - ar, aTop, cx + ar, yb - 4, (x, y) => ashlar(x, y, (x - cx) / ar > 0.6 ? 0.6 : 0));
      for (let k = -3; k <= 3; k++) bay(K, cx + k * 23, yb - 4, 8.5, 54, (x, y, dy) => (dy < 6 ? MD[(x + y) % 2 ? 2 : 3] : dy < 30 && Math.abs(k) < 3 ? mix(ashlar(x, y, 0), L[1], 0.35) : DK[2]));
      for (let k = -3; k <= 4; k++) { const x = Math.round(cx + (k - 0.5) * 23) - 2; K.rect(x - 1, aTop + 4, x + 5, aTop + 7, G[2]); }
      frieze(K, cx - ar, cx + ar, aTop, 5);
      K.poly([[cx - ar - 6, aTop], [cx - dr + 2, aTop - 20], [cx + dr - 2, aTop - 20], [cx + ar + 6, aTop]], (x, y) => scale(x, y, (x - cx) / ar > 0.55 ? 1 : (x - cx) / ar < -0.55 ? -1 : 0));
      K.rect(cx - ar - 6, aTop - 1, cx + ar + 6, aTop + 1, G[1]);
      glow(K, cx + 23, yb - 26, 20, 0.25);
    },
    /* the spire: a tapering tower of stacked lights, a corbelled balcony, a lit bell stage and a flared needle */
    elvenspire: (K, o) => {
      const { FW, FD } = K, cx = FW / 2, yb = FD - 6;
      K.rect(cx - 30, yb - 8, cx + 30, yb, (x, y) => (y === yb - 8 ? M[0] : y === yb - 4 ? M[0] : MD[x > cx + 18 ? 3 : 2]));
      /* the shaft, narrowing a pixel every twelve rows */
      const H = 150, w0 = 24;
      for (let y = yb - 8 - H; y < yb - 8; y++) { const w = w0 - Math.floor((yb - 8 - y) / 12) * 0.5; for (let x = Math.floor(cx - w); x < cx + w; x++) { const u = (x + 0.5 - cx) / w; K.set(x, y, u < -0.6 ? mix(ashlar(x, y), [255, 252, 240], 0.25) : mix(ashlar(x, y), INK, u > 0.6 ? 0.22 : u > 0.2 ? 0.1 : 0)); } }
      if (o.face !== 2) door(K, cx, yb - 8, 14, 32);
      for (const y of [yb - 64, yb - 112]) light(K, cx - 2, y, 7, 24, { lit: y < yb - 100 });
      ivy(K, cx - 18, yb - 8, 60, 2);
      /* the balcony on its corbels, with a gold rail */
      const by = yb - 8 - H;
      for (let x = Math.floor(cx - w0 + 2); x < cx + w0 - 2; x += 6) for (let i = 0; i < 6; i++) K.rect(x, by + 4 + i, x + 4 - (i >> 1), by + 5 + i, M[i < 2 ? 1 : 3]);
      K.rect(cx - w0 - 6, by, cx + w0 + 6, by + 4, (x, y) => (y === by ? M[0] : y === by + 3 ? M[4] : M[2]));
      /* the bell stage: narrower, tall lit tracery, a frieze, then the needle */
      const bw = 16, bh = 46, bt = by - bh;
      for (let y = bt; y < by; y++) for (let x = cx - bw; x < cx + bw; x++) K.set(x, y, mix(ashlar(x, y), INK, (x - cx) / bw > 0.5 ? 0.2 : 0));
      light(K, cx - 6, by - 4, 8, 32, { lit: true }); light(K, cx + 7, by - 4, 8, 32, { lit: true });
      for (let x = cx - w0 - 5; x < cx + w0 + 6; x += 4) K.rect(x, by - 10, x + 1, by, G[2]);
      K.rect(cx - w0 - 6, by - 11, cx + w0 + 6, by - 9, G[1]);
      frieze(K, cx - bw, cx + bw, bt, 5);
      glow(K, cx, by - 18, 16, 0.25);
      needle(K, cx, bt, bw + 6, 84, 0.7);
    },
    /* the pavilion: an open arcade on vine-wound columns under an onion roof */
    elvenpavilion: (K) => {
      const { FW, FD } = K, cx = FW / 2, yb = FD - 8, top = yb - 68;
      for (const [k, w] of [[0, 40], [1, 36], [2, 32]]) K.rect(cx - w, yb - 3 * (k + 1), cx + w, yb - 3 * k, (x, y) => (y === yb - 3 * (k + 1) ? M[0] : x > cx + w - 6 ? M[3] : M[2]));
      const fy = yb - 9;
      /* within: the back columns, a bench, the hanging lantern */
      K.rect(cx - 30, top + 4, cx + 30, fy, (x, y) => (y > fy - 5 ? MD[(x >> 2) % 2 ? 2 : 3] : DK[y < top + 20 ? 3 : 2]));
      for (const x of [cx - 22, cx + 19]) K.rect(x, top + 6, x + 3, fy, (px) => M[px === x ? 2 : 3]);
      K.rect(cx - 14, fy - 8, cx + 14, fy - 5, (x, y) => (y === fy - 8 ? M[0] : M[2])); for (const x of [cx - 12, cx + 10]) K.rect(x, fy - 5, x + 2, fy, M[3]);
      K.rect(cx, top + 6, cx + 1, top + 26, G[2]); K.rect(cx - 2, top + 26, cx + 3, top + 34, (x, y) => GLOW[y < top + 30 ? 0 : 1]); glow(K, cx + 0.5, top + 30, 22, 0.3);
      /* the arch heads of the front bay and the side bays */
      for (let dy = 0; dy < 26; dy++) { const lim = archHalf(26, 36, dy + 10); for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) K.set(Math.round(cx + sx * (lim + k)), top + 30 - dy, M[k === 0 ? 1 : k === 1 ? 2 : 3]); }
      for (let i = -14; i <= 14; i++) K.set(cx + i, top + 16 - Math.round(Math.abs(i) * 0.6), M[1]);
      K.rect(cx - 30, top + 2, cx + 30, top + 5, (x, y) => (y === top + 2 ? M[0] : M[2]));
      /* the front columns wound with gold vine */
      for (const x of [cx - 34, cx + 28]) {
        K.rect(x, top, x + 6, fy, (px, py) => { const v = ((py + px * 2) % 10 + 10) % 10; return v < 2 ? G[v ? 2 : 1] : M[px === x ? 0 : px === x + 5 ? 3 : 1]; });
        for (let y = top + 6; y < fy - 4; y += 10) { K.set(x - 1, y, IVY[2]); K.set(x + 6, y + 5, IVY[3]); }
        K.rect(x - 2, top - 3, x + 8, top, G[1]); K.rect(x - 2, fy - 3, x + 8, fy, M[1]);
      }
      /* the roof: an onion of scales, drops hung along its eave */
      onion(K, cx, top - 2, 42, 58, 0.36);
      for (let x = Math.round(cx - 40); x < cx + 40; x += 8) { K.set(x, top + 2, G[1]); K.set(x, top + 3, G[2]); K.set(x, top + 4, G[3]); }
    },
    /* the archway: clustered shafts and a pointed arch of voussoirs with a gold leaf trail and tracery */
    elvenarch: (K, o) => {
      const { FW, FD } = K, cx = FW / 2, yb = FD - FD / 2 + 12, side = (o.face || 0) % 2 === 1;
      if (side) {
        K.rect(cx - 5, yb - 74, cx + 5, yb + 30, (x) => M[x < cx - 2 ? 0 : x < cx + 2 ? 1 : 3]);
        K.rect(cx - 7, yb - 82, cx + 7, yb - 72, (x, y) => (y === yb - 82 ? G[1] : y < yb - 78 ? M[1] : G[2]));
        finial(K, cx - 1, yb - 82, 8); ivy(K, cx - 4, yb + 30, 70, 4); return;
      }
      /* the shafts, each three clustered columns with a gold capital and a moulded base */
      for (const x of [12, FW - 24]) {
        K.rect(x - 2, yb - 6, x + 14, yb + 2, (px, py) => (py === yb - 6 ? M[0] : px > x + 10 ? M[3] : M[2]));
        for (const [dx, w] of [[0, 4], [4, 4], [8, 4]]) K.rect(x + dx, yb - 66, x + dx + w, yb - 6, (px) => M[px === x + dx ? 0 : px === x + dx + w - 1 ? 3 : 1]);
        K.rect(x - 2, yb - 70, x + 14, yb - 66, (px, py) => G[py === yb - 70 ? 1 : 2]);
      }
      /* the arch: a band of voussoirs cut radially, a gold leaf trail along its face, a gold rim, tracery hung in
         its head */
      const wo = 44, th = 15, Ha = 108, ay = yb - 70;
      for (let dy = 0; dy < Ha; dy++) {
        const o2 = archHalf(wo, Ha, dy), i2 = archHalf(wo - th, Ha - th - 2, dy), y = ay - dy;
        for (let x = Math.floor(cx - o2); x < cx + o2; x++) {
          const dx = x + 0.5 - cx, ad = Math.abs(dx); if (ad < i2 && dy < Ha - th - 2) continue;
          const mid = o2 - th / 2, ang = Math.atan2(dy + 20, dx), joint = Math.abs(((ang * 11) % 1 + 1) % 1 - 0.5) > 0.45;
          let c = joint ? M[3] : dx < 0 ? M[1] : M[2];
          if (ad > o2 - 1.4) c = G[dx < 0 ? 1 : 2];
          else if (Math.abs(ad - mid) < 0.7 && dy < Ha - 14) c = G[(dy >> 2) % 2 ? 1 : 2];
          else if (Math.abs(ad - mid) < 2.4 && dy % 7 === 3 && dy < Ha - 14) c = G[0];
          else if (ad < i2 + 1.4) c = M[3];
          K.set(x, y, c);
        }
      }
      /* tracery in the head, in members three pixels thick so they read as stone against the sky: a transom, a Y
         rising from it, two rings and a ring under the point */
      const hy = ay - 40, iw = wo - th, bar = (x, y, sx = 1) => { K.set(x, y, M[0]); K.set(x + sx, y, M[1]); K.set(x + 2 * sx, y, M[3]); };
      for (let i = -iw + 2; i <= iw - 2; i++) for (const k of [0, 1, 2]) K.set(cx + i, hy + k - Math.round((iw - Math.abs(i)) * 0.15), M[k === 0 ? 0 : k === 1 ? 1 : 3]);
      for (let dy = 3; dy < 44; dy++) for (const sx of [-1, 1]) { const x = Math.round(cx + sx * dy * 0.6) - (sx < 0 ? 2 : 0); if (Math.abs(x + 1 - cx) < archHalf(iw, Ha - th - 2, ay - (hy - dy)) - 2) bar(x, hy - dy); }
      const ring = (ox, oy, r) => { for (let a = 0; a < 64; a++) { const t = a / 64 * Math.PI * 2; for (let k = 0; k < 3; k++) K.set(Math.round(ox + Math.cos(t) * (r - k)), Math.round(oy + Math.sin(t) * (r - k)), M[k === 0 ? (t > Math.PI ? 0 : 2) : k === 1 ? 1 : 3]); } };
      ring(cx - 15, hy - 16, 7); ring(cx + 15, hy - 16, 7); ring(cx, hy - 50, 6);
      K.rect(cx - 1, hy + 2, cx + 2, hy + 8, (x) => M[x === cx - 1 ? 0 : x === cx ? 1 : 3]); K.rect(cx - 2, hy + 8, cx + 3, hy + 11, G[1]); K.set(cx, hy + 11, G[2]);
      finial(K, cx - 1, ay - Ha, 10);
      for (const x of [cx - 24, cx + 23]) { K.rect(x, hy + 2, x + 1, hy + 12, G[2]); K.rect(x - 2, hy + 12, x + 3, hy + 20, (px, py) => GLOW[py < hy + 16 ? 0 : 1]); K.rect(x - 1, hy + 20, x + 2, hy + 22, G[2]); glow(K, x + 0.5, hy + 16, 16); }
      ivy(K, 14, yb - 2, 110, 6); ivy(K, 20, yb - 2, 50, 9);
    },
    /* the flet: a round house high in a silver tree, reached by a stair winding up the trunk */
    flet: (K, o) => {
      const { FW, FD } = K, cx = FW / 2, base = FD - 8, B = R(ELF.bark), W = R('#a8865a'), py = base - 96, seed = o.v * 6;
      for (let y = base - 250; y < base; y++) { const hw = 8 + (y > base - 14 ? (y - base + 14) * 0.9 : 0); for (let x = Math.floor(cx - hw); x < cx + hw; x++) { const u = (x + 0.5 - cx + hw) / (2 * hw); K.set(x, y, h2(x, Math.floor(y / 4), 5) < 0.12 ? B[3] : B[u < 0.25 ? 0 : u < 0.6 ? 1 : u < 0.85 ? 2 : 3]); } }
      /* the stair: treads winding round the trunk, a gold rope rail beside them */
      for (let i = 0; i < 26; i++) {
        const t = i / 26, a = t * Math.PI * 5, sx = Math.cos(a), front = Math.sin(a) > -0.2, y = Math.round(base - 6 - t * (base - py - 12)), x = Math.round(cx + sx * 12);
        if (!front) continue;
        K.rect(x - 5, y, x + 5, y + 3, (px, yy) => W[yy === y ? 0 : px > x + 2 ? 3 : 2]); K.set(x - 5, y - 6, G[2]); K.rect(x - 5, y - 6, x - 4, y, G[3]);
      }
      /* brackets curving out under the platform, the platform's deck and edge, a carved rail */
      for (const d of [-1, 1]) for (let i = 0; i < 28; i++) { const x = cx + d * (8 + i), y = py + 16 - Math.round(16 * Math.sin((i / 28) * Math.PI / 2)); K.rect(x, y, x + 1, y + 3, W[3]); }
      K.oval(cx, py, 48, 12, (x, y) => W[h2(Math.floor(x / 6), 1) < 0.3 ? 1 : 2]);
      K.rect(cx - 48, py, cx + 48, py + 6, (x, y) => { const t = Math.abs(x + 0.5 - cx) / 48, a = Math.sqrt(Math.max(0, 1 - t * t)) * 12; return y - py < a + 6 && y - py >= a - 0.5 ? (y - py < a + 1 ? G[1] : W[x > cx + 20 ? 4 : 3]) : null; });
      /* the round house: pale boards, gold banding, a carved door, a round window lit, a flared roof */
      const hx0 = cx - 24, hx1 = cx + 24, hy = py + 4, ht = hy - 40, P = R('#e2cfa6');
      for (let x = hx0; x < hx1; x++) { const u = (x + 0.5 - cx) / 24, bow = Math.sqrt(Math.max(0, 1 - u * u)) * 4; for (let y = ht; y < hy + bow; y++) K.set(x, y, (x - hx0) % 4 === 0 ? P[3] : y === ht + 8 || y === hy - 6 ? G[2] : P[u < -0.5 ? 1 : u < 0.4 ? 2 : 3]); }
      door(K, cx - 6, hy + 2, 10, 24);
      rose(K, cx + 13, hy - 22, 7, false);
      sweptRoof(K, hx0 - 12, hx1 + 12, ht + 2, ht - 34, { hip: 20, flick: 6 });
      for (let x = Math.ceil(cx - 46); x < cx + 46; x += 6) { const t = (x + 0.5 - cx) / 48, a = Math.sqrt(Math.max(0, 1 - t * t)) * 12; K.rect(x, py + a - 11, x + 1, py + a, G[2]); }
      for (let x = Math.ceil(cx - 47); x < cx + 47; x++) { const t = (x + 0.5 - cx) / 48, a = Math.sqrt(Math.max(0, 1 - t * t)) * 12; K.set(x, py + a - 12, G[1]); K.set(x, py + a - 11, G[3]); }
      for (const d of [-1, 1]) lantern(K, cx + d * 34, py + 8, d);
      glow(K, cx + 13, hy - 22, 12);
      crown(K, ELF.mallorn, cx, base - 258, 68, 46, seed);
    }
  };

  /* ---------- nature ---------- */
  /* A weeping willow, as one mass rather than a dome hung with sticks: a bell of foliage, rounded on top, falling in
     a curtain of hanging leaves almost to the ground, its hem ragged where the strands end at different lengths. The
     curtain is painted strand by strand, each a pixel wide, swaying a little and a shade off its neighbours, with
     leaves along it; it is lit on the west and over its crown, and darkens toward the hem. A darker curtain hangs
     behind the trunk; the front one parts round the trunk and here and there elsewhere, so the shade within and the
     trunk show through. */
  function weeping(K, cx, base, seed) {
    const P = foliageRamp('#9cb682'), s = Math.floor(seed * 61) + 5, W = 44, crownTop = base - 88, dome = 30;
    /* the crown's top: a dome scalloped into rounded bulges of leaves */
    const top = x => crownTop + Math.round(dome * (1 - Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / W) ** 2))) + 1.6 * Math.abs(Math.sin((x - cx) / 3.4 + s)));
    const hem = (x, id) => base - 4 - Math.round(16 * ((x + 0.5 - cx) / W) ** 4) - Math.round(h2(id, 7, s) * 10);
    const paint = (front) => {
      for (let x = Math.ceil(cx - W); x < cx + W; x++) {
        const u = (x + 0.5 - cx) / W, y0 = top(x), y1 = hem(x, x), strand = h2(Math.floor((x + 400) / 2), 3, s) - 0.5, groove = ((x % 3) + 3) % 3 === 0;
        for (let y = y0; y < y1; y++) {
          const g = (y - crownTop) / (base - crownTop);
          /* the front curtain parts round the trunk's foot and in a few narrow slits */
          if (front && ((Math.abs(u) < 0.22 && g > 0.6 - Math.abs(u) * 0.8) || (h2(Math.floor(x / 2), 5, s) < 0.14 && g > 0.4))) continue;
          const sway = g > 0.35 ? Math.round(Math.sin(y / 9 + x * 0.7) * 0.6 * g) : 0;
          let v;
          if (!front) v = -1.05 + strand * 0.4 - g * 0.2;
          else {
            v = 0.05 - u * 0.5 - g * 0.85 + strand * 0.9 - (groove && g > 0.3 ? 0.35 : 0);
            /* over the crown the leaves clump, lit from the upper left like any crown */
            if (g < 0.36) { const lc = leafClump(x, y, s, 6, 4), k = 1 - g / 0.36; v += k * (0.55 * (1 - Math.abs(u)) - 0.25 * u + 0.35 * lc.lit) + (lc.crease ? -0.3 : 0); }
            const leaf = (y + Math.floor(h2(x, 9, s) * 4)) % 4; if (g >= 0.3) { if (leaf === 0) v += 0.3; else if (leaf === 2) v -= 0.2; }
          }
          const tq = Math.round((0.32 - v) * 2.4 + (y - y0 < 2 ? -0.5 : 0));
          K.set(x + sway, y, P[Math.max(0, Math.min(5, tq))]);
        }
      }
    };
    paint(false);
    trunk(K, cx, base, crownTop + 26, ELF.bark, false, 3.4, 2);
    paint(true);
  }
  const nature = {
    mallorn: (K, o) => broadleaf(K, ELF.mallorn, K.FW / 2, K.FD - 8, 68, 84, ELF.bark, o.v * 6),
    willow: (K, o) => weeping(K, K.FW / 2, K.FD - 8, o.v * 5 + 1),
    moonflowers: (K, o) => {
      /* each a five-petalled star three pixels across round a blue heart, on a short stem */
      const Wf = R('#f4f6f2'), Gr = R('#6f8a40');
      for (let k = 0; k < 7; k++) {
        const x = Math.round(6 + h2(k, 1, o.v * 9) * (K.FW - 12)), y = Math.round(8 + h2(k, 2, o.v * 9) * (K.FD - 16));
        K.rect(x, y + 2, x + 1, y + 5, Gr[2]); K.set(x + 1, y + 4, Gr[1]);
        K.rect(x - 1, y - 1, x + 2, y + 2, (px, py) => (px === x && py === y ? R('#9fb8dc')[1] : Wf[py < y ? 0 : px > x ? 2 : 1]));
        K.set(x, y - 2, Wf[0]); K.set(x - 2, y, Wf[1]); K.set(x + 2, y, Wf[2]);
      }
    }
  };

  /* ---------- props ---------- */
  const props = {
    elvenlantern: (K, o) => {
      const cx = K.FW / 2, b = K.FD - 6, S = R('#cfd2cc'), d = (o.face || 0) % 2 ? 1 : -1;
      K.rect(cx - 1, b - 36, cx + 2, b, (x) => S[x < cx ? 0 : x === cx ? 1 : 3]); K.rect(cx - 3, b - 3, cx + 4, b, (x, y) => S[y === b - 3 ? 1 : 3]);
      for (const [i, j] of [[0, -38], [1, -39], [2, -40], [3, -40], [4, -40], [5, -39], [6, -38], [6, -37]]) for (let k = 0; k < 3; k++) K.set(cx + d * i, b + j + k, S[k === 0 ? 0 : k === 1 ? 1 : 3]);
      const lx = cx + d * 6;
      K.rect(lx - 2, b - 35, lx + 3, b - 33, G[1]);
      K.rect(lx - 2, b - 33, lx + 3, b - 25, (x, y) => GLOW[y < b - 29 ? 0 : 1]); K.rect(lx - 1, b - 25, lx + 2, b - 23, GLOW[2]); K.set(lx, b - 22, G[2]);
      glow(K, lx, b - 29, 12);
    },
    moonwell: (K) => {
      const S = M, cx = K.FW / 2, yb = K.FD - 6, Wt = R('#9fd0c4');
      /* the arch behind, then the rim, then the glowing water in it */
      for (const x of [cx - 11, cx + 9]) K.rect(x, yb - 34, x + 3, yb - 8, (px) => S[px === x ? 1 : 3]);
      for (let x = cx - 11; x < cx + 12; x++) { const t = (x + 0.5 - cx) / 11, y = yb - 34 - Math.round(5 * Math.sqrt(Math.max(0, 1 - t * t))); K.rect(x, y, x + 1, y + 3, S[1]); K.set(x, y + 3, G[2]); }
      finial(K, cx - 1, yb - 39, 1);
      K.rect(cx - 12, yb - 10, cx + 12, yb, (x, y) => (y === yb - 5 ? G[2] : wallTone('stone', S, x, y)));
      K.oval(cx, yb - 10, 12, 5, S[1]); K.oval(cx, yb - 10, 9, 3, (x, y, dx, dy) => (h2(x, y, 4) < 0.08 ? R('#f4fbf6')[0] : Wt[dy < 0 ? 0 : 1]));
      glow(K, cx, yb - 12, 12);
    }
  };
  return { build, nature, props };
}

export { elvenTown };
