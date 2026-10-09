/* ================= character sprites: the townsfolk's garments =================
   Three outfits built in layers rather than painted onto one torso: what is worn underneath (body.js's torso
   slot), what is worn over it as a piece of its own (the coat slot), and what goes on the legs. The outer piece
   is its own layer, so the finish inks a contour where it stands over the shirt and shades the shirt beneath its
   edge, the depth the dragoon's plates and the black mage's collar get from being separate pieces. Each
   piece is creased where cloth folds: drawn in under the arms, gathered at a belt, fanning out below it, broken
   at the knee.

   - vest: an open waistcoat, its fronts falling to points below the belt, over a laced linen shirt that shows
     between them, the belt buckled in the gap; welt pockets, a lapel fold, a half-belt across the back. Full
     sleeves gathered into the cuff, trousers bloused over the boots.
   - overalls: a bib with a pocket on two braces buckled at its corners, crossing to a point on the back over a
     shirt with its sleeves rolled to the elbow; side buttons, a fly, a seat seam and back pockets, and trouser legs turned up over the boots.
   - coat: a long coat to the floor, open down the front over an under-robe, its edges faced in gold from a
     shawl collar to the hem, with deep pleats in the skirt; a sash round the waist knotted at the hip with its
     ends hanging.

   Each garment is given the frame's measurements (body.js garmentContext) and returns cells for its pieces. */
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function grid() { const cells = []; return { cells, put: (x, y, ch) => cells.push([x, y, ch]) }; }
/* every cell of the torso's outline in one letter, for a garment to paint over (later cells win) */
function fill(c, letter) {
  const g = grid(); c.rows.forEach(([l, r], j) => { for (let x = l; x <= r; x++) g.put(x, c.top + j, letter); }); return g;
}
const inRow = (c, j, x) => j >= 0 && j < c.T && x >= c.rows[j][0] && x <= c.rows[j][1];
/* below the belt cloth falls in folds that fan outward from the middle toward the hem */
const fan = (c, j, x) => { const k = (j - c.belt - 1) >> 1; return j > c.belt && (x === c.fc - 3 - k || x === c.fc + 4 + k); };
/* above it, a fold runs down and inward from under each arm, where the cloth is drawn in to the waist */
const drawn = (c, j, x, from = 2, to = 4) => j >= from && j <= to && (x === c.rows[j][0] + j - 1 || x === c.rows[j][1] - j + 1);

/* A strap from one shoulder across to the other hip and a satchel where it ends (a cross on a healer's), worn
   over everything else */
function gear(c, put) {
  const { o, rows, top, belt, front } = c; if (!o.satchel || !o.strap) return;
  const [cl, cr] = rows[2], near = (o.strap > 0) === front;
  for (let j = 0; j < belt; j++) put(near ? cl + 1 + j : cr - 1 - j, top + j, 'L');
  const bx = near ? cl + belt - 2 : cr - belt - 1;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) put(bx + i, top + belt - 1 + j, j === 0 ? 'L' : j === 1 ? 'u' : 'U');
  if (o.satchel === 'cross') for (const [i, j] of [[1, 1], [2, 1], [1, 2], [2, 2]]) put(bx + i, top + belt + j, 'R');
}

/* Trousers into boots, each leg with a fold breaking at the knee toward the facing. Bloused (blouse) the trousers balloon a pixel over the boot tops with a shadow beneath;
   turned up (turnup) they end in a wider cuff over a creased fold. */
function trousers(c, { blouse = false, turnup = false } = {}) {
  const { bt, CX, BASE } = c, { dir, legs, y0 } = c.geo, g = grid(), boot = Math.round(bt.legs * 0.5), knee = BASE - boot;
  for (let x = legs[0][0][0]; x <= legs[1][0][1]; x++) {
    g.put(x, y0, 'P'); g.put(x, y0 + 1, 'P');
  }
  for (const [[a, b], { dx, lift }] of legs) {
    const end = BASE - lift, mid = a + dx + ((b - a) >> 1);
    for (let y = y0 + 2; y <= end; y++) {
      const inBoot = y > knee, toe = y > BASE - 3 && !lift, sole = y === end;
      let l = a + dx, r = b + dx; if (toe) { if (dir < 0) l--; else r++; }
      if (sole && lift) { if (dir < 0) r = l + 1; else l = r - 1; }
      if (y === knee && (blouse || turnup)) { l--; r++; }
      const fold = y >= knee - 2 && y < knee && !(turnup && y === knee - 1) && (y === knee - 1 ? mid + dir : mid);
      for (let x = l; x <= r; x++) {
        let ch = sole ? 'o' : inBoot ? 'O' : 'P';
        if (!inBoot && !sole && ((turnup && y === knee - 1) || x === fold)) ch = 'p';
        if (blouse && y === knee + 1 && !sole) ch = 'o';
        g.put(x, y, ch);
      }
    }
  }
  g.put(CX, y0 + 2, 'p');                                                       /* the crotch tapers a row */
  return g.cells;
}

function vest(c) {
  const { rows, top, belt, T, front, fc } = c, shirt = fill(c, 'A'), coat = grid();
  /* the shirt: open at the throat and laced across in the gap between the vest's fronts, the belt buckled
     there, its tail below the belt in folds */
  rows.forEach(([l, r], j) => {
    for (let x = l; x <= r; x++) {
      let ch = null;
      if (j === belt) ch = front && (x === fc || x === fc + 1) ? 'G' : 'L';
      else if (front && j === 0 && (x === fc || x === fc + 1)) ch = 'K';
      else if (front && j === 1 && x === fc) ch = 'K';
      else if (front && j >= 1 && j <= 3 && x === (j % 2 ? fc + 1 : fc)) ch = 'L';
      else if (fan(c, j, x) || (!front && x === fc && j > belt + 1)) ch = 'a';
      if (ch) shirt.put(x, top + j, ch);
    }
  });
  const last = Math.min(T - 1, belt + 2);
  for (let j = 0; j <= last; j++) {
    const [l, r] = rows[j];
    if (front) {
      /* two fronts, open from the collar down, each cut to a point at the bottom by the opening */
      const point = j === last, sides = point ? [[fc - 3, fc - 2], [fc + 3, fc + 4]] : [[l, fc - 2], [fc + 3, r]];
      for (const [a, b] of sides) for (let x = Math.max(a, l); x <= Math.min(b, r); x++) {
        let ch = 'D';
        if (j <= 2 && (x === fc - 3 || x === fc + 4)) ch = 'd';                                 /* the lapels' fold */
        else if (j === belt - 2 && (x === l + 2 || x === l + 3 || x === r - 2 || x === r - 3) && (x < fc - 3 || x > fc + 4)) ch = 'd'; /* welt pockets */
        else if (drawn(c, j, x, 2, 3)) ch = 'd';
        coat.put(x, top + j, ch);
      }
    } else {
      /* the back: one panel with a seam down it and a half-belt buckled across the small of the back */
      if (j === last) continue;
      for (let x = l; x <= r; x++) {
        let ch = 'D';
        if (j === belt - 2 && x >= fc - 2 && x <= fc + 3) ch = x === fc + 1 ? 'G' : 'L';
        else if (x === fc && j >= 2) ch = 'd';
        else if (drawn(c, j, x)) ch = 'd';
        coat.put(x, top + j, ch);
      }
    }
  }
  gear(c, coat.put);
  return { torso: shirt.cells, coat: coat.cells, legs: trousers(c, { blouse: true }) };
}

function overalls(c) {
  const { bt, rows, top, belt, T, front, fc } = c, e = bt.chest >= 14 ? 1 : 0, bl = fc - 2 - e, br = fc + 3 + e, shirt = fill(c, 'A'), coat = grid(), put = coat.put;
  /* the shirt: open at the collar, drawn in under the arms beside the bib */
  rows.forEach(([l, r], j) => {
    for (let x = l; x <= r; x++) {
      if (front && j === 0 && (x === fc || x === fc + 1)) shirt.put(x, top + j, 'K');
      else if ((front && j <= 1 && (x === fc - 1 || x === fc + 2)) || drawn(c, j, x)) shirt.put(x, top + j, 'a');
    }
  });
  if (front) {
    /* the braces over the shoulders, buckled to the bib's corners; the bib with a pocket on it */
    for (let j = 0; j < 2; j++) for (const x of [bl - 1, bl, br, br + 1]) if (inRow(c, j, x)) put(x, top + j, 'D');
    for (let j = 2; j < belt; j++) for (let x = bl; x <= br; x++) {
      let ch = 'D';
      if (j === 2 && (x === bl || x === br)) ch = 'G';
      else if (j === 3 && x >= fc - 1 && x <= fc + 2) ch = 'd';
      else if (j > 3 && j < belt - 1 && (x === fc - 1 || x === fc + 2)) ch = 'd';
      put(x, top + j, ch);
    }
    /* the trousers' top: buttoned at the sides, a fly down the front, and the cloth pulling in to the crotch */
    for (let j = belt; j < T; j++) {
      const [l, r] = rows[j];
      for (let x = l; x <= r; x++) {
        let ch = 'D';
        if (j === belt && (x === l + 1 || x === r - 1)) ch = 'G';
        else if ((j > belt && j < T - 1 && x === fc + 1) || (j === T - 1 && x === fc)) ch = 'd';
        else if (j >= T - 2 && (x === fc - 4 + j - (T - 2) || x === fc + 5 - j + (T - 2))) ch = 'd';
        put(x, top + j, ch);
      }
    }
  } else {
    /* the braces cross the back to a buckle, and the back bib widens from it to the waist */
    for (let j = 0; j <= 3; j++) for (const x0 of [lerp(bl - 1, fc - 1, j / 3), lerp(br, fc + 1, j / 3)]) for (const x of [x0, x0 + 1]) if (inRow(c, j, x)) put(x, top + j, j === 3 && (x === fc || x === fc + 1) ? 'G' : 'D');
    for (let j = 4; j < belt; j++) for (let x = fc - (j - 4); x <= fc + 1 + (j - 4); x++) if (inRow(c, j, x)) put(x, top + j, 'D');
    /* the seat: a seam down the middle and a pocket either side */
    for (let j = belt; j < T; j++) {
      const [l, r] = rows[j];
      for (let x = l; x <= r; x++) put(x, top + j, (x === fc && j > belt) || (j === belt + 1 && ((x >= l + 1 && x <= l + 2) || (x >= r - 2 && x <= r - 1))) ? 'd' : 'D');
    }
  }
  gear(c, put);
  return { torso: shirt.cells, coat: coat.cells, legs: trousers(c, { turnup: true }) };
}

function coat(c) {
  const { bt, rows, top, belt, T, front, fc, pose, BASE, span } = c, { dir, legs, y0 } = c.geo, coatG = grid(), put = coatG.put;
  /* the under-robe: to the floor, seen where the coat falls open, the toes beneath it */
  const under = fill(c, 'D'), skirtTop = top + T, hemY = BASE - 1, n = hemY - skirtTop + 1;
  const robe = grid();
  for (let y = y0; y < BASE; y++) { const [l, r] = span(bt.hem); for (let x = l; x <= r; x++) robe.put(x, y, x === fc + 1 && y > skirtTop ? 'd' : 'D'); }
  for (const [[a, b], { dx, lift }] of legs) {
    if (lift) continue;
    const l = a + dx + dir, r = b + dx + dir;
    for (let x = dir < 0 ? l : Math.max(l, r - 2); x <= (dir < 0 ? Math.min(r, l + 2) : r); x++) robe.put(x, BASE, 'O');
  }
  /* the coat, the torso's rows then the skirt's, flaring to the hem and swinging in a stride like a gown's */
  for (let j = 0; j < T + n; j++) {
    const sk = j - T, y = top + j, hem = sk === n - 1;
    let l, r;
    if (sk < 0) [l, r] = rows[j];
    else {
      const t = n > 1 ? sk / (n - 1) : 1;
      [l, r] = span(bt.hem + 2 * Math.round(2 * t ** 1.3));
      if (pose && t > 0.4) { if (dir < 0) l--; else r++; }
      if (pose && sk >= n - 2) { if (dir < 0) r--; else l++; }
    }
    const g = j < belt ? 0 : Math.min(3, Math.floor((j - belt) / 3)), ol = fc - 1 - g, or = fc + 2 + g;
    for (let x = l; x <= r; x++) {
      if (hem && (x === l || x === r)) continue;                                 /* the hem rounds off at its corners */
      let ch = 'A';
      if (front) {
        if (x >= ol && x <= or) continue;                                         /* open down the front */
        const edge = x === ol - 1 || x === or + 1;
        if (hem || j === 0 || (j === 1 && x >= ol - 3 && x <= or + 3) || (j === 2 && x >= ol - 2 && x <= or + 2) || edge) ch = 'C';
        else if (drawn(c, j, x)) ch = 'a';
        else if (sk >= 0 && (x === l + 2 || x === r - 2 || x === ((l + ol) >> 1) + 1 || x === ((r + or) >> 1))) ch = 'a';   /* pleats */
      } else {
        if (hem || j === 0) ch = 'C';
        else if (drawn(c, j, x) || (x === fc && j >= 2) || (sk > 0 && (x === l + 2 || x === r - 2))) ch = 'a';
      }
      put(x, y, ch);
    }
  }
  /* the sash, wound round the waist and knotted at the far hip, its two ends hanging */
  const [sl, sr] = rows[belt];
  for (let x = sl; x <= sr; x++) put(x, top + belt, 'L');
  if (front) {
    const k = fc - 3;
    put(k, top + belt, 'G');
    for (let i = 1; i <= 4; i++) put(k, top + belt + i, i === 4 ? 'G' : 'L');
    for (let i = 1; i <= 3; i++) put(k - 1, top + belt + i, i === 3 ? 'G' : 'L');
  }
  gear(c, put);
  return { torso: under.cells, coat: coatG.cells, legs: robe.cells };
}

const GARMENTS = { vest, overalls, coat };

export { GARMENTS };
