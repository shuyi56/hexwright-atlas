import { GARMENTS } from './garments.js';
import { cellsToPart } from './pixels.js';

/* ================= character sprites: bodies =================
   The torso, arms and legs are cut from a body type's measurements, so any job can wear any build. Clothing is
   a set of rules over the cut shape (where the collar, belt, ridge or front panel falls) rather than fixed
   grids. The hand-drawn heads, hats and gear in parts.js are hung on the body's landmarks (measure()): the
   head, the neck, each shoulder and each hand.

   All builds share the 14-pixel head and stand with their soles on row BASE, so they line up on a battlefield;
   they differ in shoulders, waist, limb thickness and how the height splits between torso and legs. */
const BASE = 46, CX = 16;
const BODY_TYPES = {
  small: { name: 'Small', torso: 11, legs: 8, shoulder: 10, chest: 10, waist: 9, hem: 10, legW: 3, arm: 2, hand: 2 },
  slim: { name: 'Slim', torso: 12, legs: 13, shoulder: 10, chest: 10, waist: 8, hem: 10, legW: 3, arm: 2, hand: 2 },
  standard: { name: 'Standard', torso: 12, legs: 12, shoulder: 12, chest: 12, waist: 10, hem: 12, legW: 4, arm: 3, hand: 3, smooth: true },
  stocky: { name: 'Stocky', torso: 12, legs: 9, shoulder: 14, chest: 14, waist: 13, hem: 14, legW: 5, arm: 4, hand: 3 },
  tall: { name: 'Tall', torso: 14, legs: 15, shoulder: 13, chest: 13, waist: 11, hem: 13, legW: 4, arm: 3, hand: 3, smooth: true } };
/* where the landmarks fell on the layout the hand-drawn parts were authored against; a part hung on a
   landmark moves by however far that landmark is from here */
const REF = { head: [9, 4], neck: [16, 18], shoulderNear: [21, 18], shoulderFar: [10, 18], handNear: [22, 28], handFar: [9, 28] };

const span = w => { const l = CX - Math.ceil(w / 2); return [l, l + w - 1]; };
/* the torso's outline: rounded shoulders, the chest, in to the waist at the belt, out again at the hem */
function profile(bt) {
  const T = bt.torso, belt = Math.round(T * 0.6), rows = [];
  for (let j = 0; j < T; j++) rows.push(span(j === 0 ? bt.shoulder - 4 : j === 1 ? bt.shoulder - 2 : j < 4 ? bt.chest : j < T - 2 ? bt.waist : bt.hem));
  return { rows, belt };
}

/* ---------- arms ----------
   An arm hangs from a fixed shoulder: a rounded cap, the upper arm overlapping the body's edge by a column, an
   elbow where it steps a pixel further out, the forearm, a cuff and a fist. In a stride it swings from the
   shoulder like a pendulum, against the leg on its side: the leading arm leans forward (toward the facing) until
   its hand is four pixels ahead and three rows up, the trailing arm leans back until its hand is three pixels
   behind and two rows up; a hand stops CLEAR pixels short of the frame's side, so a blade held out beyond it
   stays in frame. Forward on screen is left in the front view and right in the back view, so in front the
   leading near arm crosses before the body. A far arm swinging in behind the body moves only a pixel: it is
   turning away from the viewer, and it keeps what it holds in sight. */
const SWING = { fwd: [4, 3], back: [-3, 2] }, CLEAR = 3, W_FRAME = 32;
const SPLAY = 2;                                   /* [hand reach toward the facing, rows it rises] */
function armPlan(bt, view, pose, side, steady) {
  const { rows } = profile(bt), w = bt.arm, s = side === 'near' ? 1 : -1, dir = view === 'front' ? -1 : 1;
  /* a hand carrying a staff or polearm keeps it upright: that arm rides with the body but does not swing */
  if (steady && side === (view === 'front' ? 'far' : 'near')) pose = 0;
  const edge = s > 0 ? rows[2][1] : rows[2][0];
  const fwd = pose && (pose === 1) === (side === 'near'), [reach, rise] = !pose ? [0, 0] : SWING[fwd ? 'fwd' : 'back'];
  const upper = s > 0 ? edge : edge - w + 1, lower = upper + s;                 /* left column of each section */
  /* a swinging hand stops CLEAR pixels short of the frame's side, leaving room for a blade held out beyond it */
  let sx = s < 0 && reach * dir > 0 ? 1 : reach * dir;
  sx = Math.max(CLEAR - lower, Math.min(W_FRAME - 1 - CLEAR - (lower + w - 1), sx));
  const cuff = bt.torso - 4 - rise;
  /* how far row j has leaned: nothing at the shoulder cap, the full reach at the cuff */
  const lean = j => (j < 1 ? 0 : Math.round(sx * j / cuff));
  return { w, s, dir, upper, lower, sx, cuff, lean, hand: bt.hand };
}
function armPart(bt, view, pose, side, top, o = {}) {
  const sl = o.sleeves || {}, sleeve = sl.A || 'A', cuffL = sl.C || 'C', skin = o.hands || 'K';
  const a = armPlan(bt, view, pose, side, o.steady), cells = [];
  const put = (x, y, ch) => cells.push([x, y, ch]);
  /* A smooth arm (bt.smooth) hangs at a gentle angle instead of stepping out at the elbow: it leaves the shoulder
     against the body and moves a pixel outward at even intervals, SPLAY pixels by the wrist (one while it swings,
     since the swing carries it out already), so its edges run as
     straight lines and the gap under the arm opens gradually. Its cuff is the forearm's own width and the fist
     sits centred under it. */
  const spread = a.sx ? 1 : SPLAY, splay = j => (bt.smooth ? Math.round((j * spread) / a.cuff) : j >= 5 ? 1 : 0);
  let cuffX = a.lower;
  for (let j = 0; j <= a.cuff; j++) {
    const x0 = a.upper + a.s * splay(j) + a.lean(j); if (j === a.cuff) cuffX = x0 - a.lean(j);
    let n = j === 0 ? a.w - 1 : a.w, from = j === 0 && a.s < 0 ? x0 + 1 : x0;
    /* a bell sleeve widens below the elbow: a pixel outward over the forearm, and both ways at its mouth */
    if (sl.bell && j >= a.cuff - 2) { n++; if (a.s < 0) from--; }
    if (sl.bell && j === a.cuff) { n++; if (a.s > 0) from--; }
    /* a full sleeve (puff) gathers into its cuff, blousing a pixel outward over the forearm above it; a rolled
       sleeve (roll) is turned up above the elbow in a thick band, the bare forearm beneath */
    const rolled = sl.roll && j >= 5 && j <= 6, bare = sl.roll && j > 6;
    if ((sl.puff && j >= a.cuff - 3 && j < a.cuff) || rolled) { n++; if (a.s < 0) from--; }
    /* spiked armour: the gauntlet's cuff flares a pixel outward */
    if (sl.spike && j === a.cuff) { n++; if (a.s < 0) from--; }
    for (let i = 0; i < n; i++) {
      const x = from + i, inner = a.s > 0 ? i === 0 : i === n - 1;
      /* cloth sleeves (folds) crease at the elbow, the fold turning across the forearm, and at the gather */
      const next = a.s > 0 ? i === 1 : i === n - 2;
      const crease = (inner && j > 0 && j < 5) || (sl.folds && !sl.roll && ((j === 5 && inner) || (j === 6 && next) || (sl.puff && j === a.cuff - 1 && next)));
      put(x, top + j, bare ? skin : rolled ? (j === 6 ? sleeve.toLowerCase() : sleeve) : j === a.cuff ? cuffL : crease ? sleeve.toLowerCase() : sleeve);
    }
    /* and a spike stands out from the elbow, pointing out and up */
    if (sl.spike && j === 5) {
      const out = a.s > 0 ? from + n : from - 1; put(out, top + j, sleeve); put(out + a.s, top + j - 1, sleeve);
      /* on a smooth arm there is no step at the elbow for the spike to stand from, so it runs a pixel further out */
      if (bt.smooth) put(out + 2 * a.s, top + j - 2, sleeve);
    }
  }
  /* the fist, its thumb on the side the figure faces */
  const hw = Math.max(a.hand, 2), hx = (bt.smooth ? cuffX : a.lower) + a.sx + Math.floor((a.w - hw) / 2), hy = top + a.cuff + 1;
  const fist = hw === 2 ? ['KK', 'KK', a.dir < 0 ? 'K.' : '.K'] : bt.smooth ? ['KKK', 'KKK', '.K.'] : ['KKK', 'KKK', a.dir < 0 ? 'KK.' : '.KK'];
  const fistCells = [];
  fist.forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') fistCells.push([hx + i, hy + j, j === 2 ? skin.toLowerCase() : skin]); }));
  return { cells: cells.concat(fistCells), fist: fistCells, hand: [hx + Math.floor(hw / 2), hy + 1] };
}

/* ---------- legs ----------
   Trousers into boots, or a robe to the ankles with the shoes beneath. In a stride one leg reaches forward a
   pixel and the other lifts its heel two rows; the hips drop with the body. Greaves (o.greaves) turn the boots
   into plate: a knee cop standing forward of the knee, trimmed in gold along its lower edge, with a spike
   thrown forward and up from its point, and sabatons drawn out to a pointed toe. */
function legGeometry(bt, view, pose) {
  const dir = view === 'front' ? -1 : 1, far = [CX - 1 - bt.legW, CX - 2], near = [CX + 1, CX + bt.legW];
  const step = [[{ dx: 0, lift: 0 }, { dx: 0, lift: 0 }], [{ dx: dir, lift: 0 }, { dx: 0, lift: 2 }], [{ dx: 0, lift: 2 }, { dx: dir, lift: 0 }]][pose];
  return { dir, legs: [[far, step[0]], [near, step[1]]], y0: BASE + 1 - bt.legs + (pose ? 1 : 0) };
}
function pantsCells(bt, view, pose, o = {}) {
  const { dir, legs, y0 } = legGeometry(bt, view, pose), cells = [], boot = Math.round(bt.legs * 0.5), knee = BASE - boot;
  for (let x = legs[0][0][0]; x <= legs[1][0][1]; x++) { cells.push([x, y0, 'P']); cells.push([x, y0 + 1, x === CX - 1 ? 'p' : 'P']); }
  if (o.bones) for (const c of cells) c[2] = 'L';                                  /* the rag hangs over the hips */
  for (const [[a, b], { dx, lift }] of legs) {
    const end = BASE - lift;
    for (let y = y0 + 2; y <= end; y++) {
      const cop = o.greaves && y >= knee - 1 && y <= knee + 1, inBoot = y > BASE - boot || cop, toe = y > BASE - 3 && !lift, sole = y === end;
      let l = a + dx, r = b + dx; if (toe) { if (dir < 0) l--; else r++; }
      /* bones (o.bones): a shin a pixel thinner than the leg, its outer side dropped, with a knob at the knee */
      if (o.bones && y > y0 + 2 && y !== knee && !toe) { if (a < CX) l++; else r--; }
      if (cop || (o.greaves && sole && !lift)) { if (dir < 0) l--; else r++; }     /* the knee cop and the sabaton's point */
      if (sole && lift) { if (dir < 0) r = l + 1; else l = r - 1; }                 /* a lifted heel: only the toe touches down */
      for (let x = l; x <= r; x++) cells.push([x, y, sole ? (o.bones ? 'p' : 'o') : cop && y === knee + 1 ? 'G' : inBoot && !o.bones ? 'O' : 'P']);
      /* the knee cop's spike, standing forward and up from its point */
      if (o.greaves && y === knee - 1) { const f = dir < 0 ? l - 1 : r + 1; cells.push([f, y, 'O'], [f + dir, y - 1, 'O']); }
    }
  }
  cells.push([CX, y0 + 2, 'P']);                                                 /* the crotch tapers a row */
  return cells;
}
/* A gown: one garment from the chest to the floor, no waist. It flares as it falls in an A-line from the lower
   chest, its folds fanning out from the middle toward the hem, and ends in a trimmed hem with only the toes
   showing beneath. In front the robe's overlap runs down its middle as a fold; behind, a seam. In a stride the
   hem swings: the leading foot kicks it forward and the back of it pulls in, and the lifted foot is hidden. */
const GOWN_FLARE = 2.6;
function gownCells(bt, view, pose) {
  const { dir, legs, y0 } = legGeometry(bt, view, pose), cells = [], hemY = BASE - 1, n = hemY - y0 + 1, front = view === 'front';
  for (let j = 0; j < n; j++) {
    const t = n > 1 ? j / (n - 1) : 1, flare = Math.round(GOWN_FLARE * t ** 1.4), y = y0 + j, hem = j === n - 1;
    let [l, r] = span(bt.chest + 2 + 2 * flare);
    if (pose && t > 0.45) { if (dir < 0) l--; else r++; }                          /* the leading edge swings out */
    if (pose && j >= n - 2) { if (dir < 0) r--; else l++; }                        /* the trailing hem pulls in */
    const mid = front ? fc + 1 : fc, d = 3 + Math.round(t ** 1.6 * ((r - l) / 2 - 6)), folds = [mid - d, mid + d];
    for (let x = l; x <= r; x++) {
      if (hem && (x === l || x === r)) continue;                                   /* the hem rounds off at its corners */
      cells.push([x, y, hem ? 'C' : x === mid || folds.includes(x) ? 'a' : 'A']);
    }
  }
  /* the toes beneath the hem, turned toward the facing */
  for (const [[a, b], { dx, lift }] of legs) {
    if (lift) continue;
    const l = a + dx + dir, r = b + dx + dir;
    for (let x = dir < 0 ? l : Math.max(l, r - 2); x <= (dir < 0 ? Math.min(r, l + 2) : r); x++) cells.push([x, BASE, 'O']);
  }
  return cells;
}
function robeCells(bt, view, pose, teeth) {
  const { dir, legs, y0 } = legGeometry(bt, view, pose), cells = [], hemY = BASE - 3, rows = hemY - y0 + 1;
  for (let j = 0; j < rows; j++) {
    const w = j < 2 ? bt.hem - 2 : j < 5 ? bt.hem : bt.hem + 2, [l, r] = span(w), y = y0 + j;
    for (let x = l; x <= r; x++) {
      let ch = j === rows - 1 ? 'C' : x === CX && j > 0 ? 'a' : 'A';
      if (teeth && j === rows - 2 && (x - l) % 4 !== 3) ch = 'C';
      if (teeth && j === rows - 3 && (x - l) % 4 === 1) ch = 'C';
      cells.push([x, y, ch]);
    }
  }
  for (const [[a, b], { dx, lift }] of legs) {
    if (lift) { for (let x = a + dx; x <= b + dx; x++) cells.push([x, BASE - 2, 'O']); continue; }
    for (let y = BASE - 2; y <= BASE; y++) {
      let l = a + dx, r = b + dx; if (y > BASE - 2) { if (dir < 0) l--; else r++; }
      for (let x = l; x <= r; x++) cells.push([x, y, y === BASE ? 'o' : 'O']);
    }
  }
  return cells;
}

/* ---------- torsos ----------
   Each style is a rule giving the letter at (row j, column x). fc is the front's centre line: a pixel left of
   the body's middle, since the front views turn three-quarters to the viewer's left. */
const fc = CX - 1;
const TORSO = {
  tunic: (j, x, t) => (t.front
    ? (j === 0 && x >= fc - 1 && x <= fc + 2) || (j === 1 && (x === fc || x === fc + 1)) || (j === 2 && x === fc + 1) ? 'B'
      : j === t.belt ? (x === fc ? 'G' : 'L') : j > t.belt + 1 && x === fc ? 'a' : 'A'
    : j === t.belt ? 'L' : j >= 3 && j <= 5 && x === fc ? 'a' : 'A'),
  plate: (j, x, t) => (j === t.T - 1 ? 'C' : j === t.belt ? (t.front && x === fc ? 'G' : 'L') : j > t.belt ? (x === fc && j > t.belt + 1 ? 'a' : 'A')
    : j === t.belt - 1 ? 's' : t.front ? (x === fc + 1 && j >= 1 ? 's' : 'S') : (x === fc && j >= 2 && j <= 4 ? 's' : 'S')),
  robe: (j, x, t) => (t.front
    ? (j === 0 && x >= fc - 1 && x <= fc + 2) || (j === 1 && (x === fc || x === fc + 1)) ? 'C' : j === t.belt ? (x === fc ? 'G' : 'L') : x === fc + 1 && j >= 2 ? 'C' : 'A'
    : j === t.belt ? 'L' : x === fc && j >= 3 && j !== t.belt ? 'a' : 'A'),
  /* the bodice of a gown: no belt; in front a trimmed neckline, the robe's overlap running down the middle as a
     fold, and a fold either side below the chest that the skirt's folds carry on; behind, a seam down the back */
  gown: (j, x, t) => (t.front
    ? (j === 0 && x >= fc - 1 && x <= fc + 2) || (j === 1 && (x === fc || x === fc + 1)) ? 'C' : j >= 2 && x === fc + 1 ? 'a' : j > t.belt && (x === fc - 2 || x === fc + 4) ? 'a' : 'A'
    : x === fc && j >= 2 ? 'a' : 'A'),
  /* a dragoon's cuirass: a gorget at the neck, a breastplate ridged down the middle and cut with two chevrons that
     point down the ridge like overlapping scales, a belt, and mail below it; the backplate the same about the
     spine */
  dragon: (j, x, t) => {
    const r = t.front ? fc + 1 : fc, d = Math.abs(x - r), k = t.belt - 1 - j;
    if (j === t.belt) return t.front && x === fc ? 'G' : 'L';
    if (j > t.belt) return j === t.belt + 2 ? 'a' : 'A';
    if (j === 1 || j === t.belt - 1 || (j >= 2 && (d === 0 || d === k || d === k + 3))) return 's';
    return 'S';
  },
  /* a skeleton's ribcage: a collarbone, then ribs of bone (A) over the dark of the chest (D) on either side of a
     breastbone or spine, a pelvis at the belt and a rag (L) about the hips below it */
  ribs: (j, x, t) => {
    const r = t.front ? fc + 1 : fc;
    if (j === 0 || j === t.belt) return 'A';
    if (j > t.belt) return 'L';
    if (x === r) return t.front ? 'A' : 'a';
    return j % 2 ? 'A' : 'D';
  } };
/* a gown hangs straight from the chest instead of taking in at the waist, and widens a pixel either side over its
   last rows (beside the hands, clear of them), so the skirt's flare runs on from it */
const GOWN_ROWS = (bt, rows) => rows.map((s, j) => (j < 2 ? s : span(bt.chest + (j >= bt.torso - 3 ? 2 : 0))));
function torsoCells(bt, view, top, o = {}) {
  const p = profile(bt), rows = o.torso === 'gown' ? GOWN_ROWS(bt, p.rows) : p.rows, { belt } = p;
  const T = bt.torso, front = view === 'front', style = TORSO[o.torso || 'tunic'], cells = [], [cl, cr] = rows[2];
  rows.forEach(([l, r], j) => {
    for (let x = l; x <= r; x++) {
      let ch = style(j, x, { T, belt, front });
      if (o.skirt && j === T - 1 && ch === 'C') ch = 'A';                     /* the trim moves down to the skirt's hem */
      /* a vest, buttoned up: the shirt shows only in a V at the collar; a solid back from behind */
      if (o.vest && j < belt && ch !== 'L' && (!front || j > 1 || x < fc || x > fc + 1) && (!front || j > 0 || x < fc - 1 || x > fc + 2)) ch = 'D';
      /* a strap from one shoulder across to the other hip */
      if (o.strap && j < belt && x === ((o.strap > 0) === front ? cl + 1 + j : cr - 1 - j)) ch = 'L';
      /* bib-and-brace overalls (D): two broad braces over the shoulders into a plain bib on the chest, and the
         trousers' top from the waist down; from behind, the braces down the back */
      if (o.bib) {
        const brace = x === fc - 2 || x === fc - 1 || x === fc + 2 || x === fc + 3;
        if (j >= belt) ch = 'D';
        else if (front ? (j < 2 ? brace : x >= fc - 2 && x <= fc + 3) : brace) ch = 'D';
      }
      /* a rope girdle tied round a gown at the waist (L), knotted (G) in front where its end hangs */
      if (o.girdle && j === belt) ch = front && x === fc - 1 ? 'G' : 'L';
      /* a square neckline: the skin of the throat and chest, edged below in trim with a jewel at its middle */
      if (o.neckline && front) {
        if ((j === 0 && x >= fc - 2 && x <= fc + 3) || (j === 1 && x >= fc - 1 && x <= fc + 2)) ch = 'K';
        else if (j === 2 && x >= fc - 2 && x <= fc + 3) ch = x === fc + 1 ? 'J' : 'C';
      }
      cells.push([x, top + j, ch]);
    }
  });
  /* a skirt carried on below the hem, over the legs */
  for (let k = 0; k < (o.skirt || 0); k++) { const [l, r] = span(bt.hem + (k ? 2 : 0)); for (let x = l; x <= r; x++) cells.push([x, top + T + k, k === o.skirt - 1 ? 'C' : (x - l) % 4 === 2 ? 'a' : 'A']); }
  /* the end of a rope belt hanging from its knot, with a tassel (front only) */
  if (o.cord && front) { for (let k = 1; k <= o.cord; k++) cells.push([fc - 1, top + belt + k, k === o.cord ? 'G' : 'L']); }
  /* a satchel on the hip where the strap ends: a bag (U) under its flap, and a cross on it for a healer's */
  if (o.satchel && o.strap) {
    const bx = (o.strap > 0) === front ? cl + belt - 2 : cr - belt - 1;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) cells.push([bx + i, top + belt - 1 + j, j === 0 ? 'L' : j === 1 ? 'u' : 'U']);
    if (o.satchel === 'cross') cells.push([bx + 1, top + belt + 1, 'R'], [bx + 2, top + belt + 1, 'R'], [bx + 1, top + belt + 2, 'R'], [bx + 2, top + belt + 2, 'R']);
  }
  /* plate tassets hung below the hem over the thighs, four pixels to a plate, each cut down to a point */
  for (let k = 0; k < (o.tassets || 0); k++) {
    const [l, r] = span(bt.hem + 2);
    for (let x = l; x <= r; x++) { const p = (x - l) % 4; if ((k === 1 && p === 3) || (k >= 2 && p !== 1)) continue; cells.push([x, top + T + k, k === 0 && p === 3 ? 's' : 'S']); }
  }
  return cells;
}

/* ---------- a cloak hanging from the shoulders: edges behind the body from the front, the whole from behind ----------
   A dagged cloak ('dagged') is cut along its hem into sharp points, like a dragon's wing, its folds running down
   into them. */
function cloakCells(bt, view, top, style) {
  const dagged = style === 'dagged', cells = [], bottom = BASE + 1 - bt.legs + Math.round(bt.legs * (dagged ? 0.62 : 0.55)), front = view === 'front';
  for (let y = top - (front ? 0 : 1); y <= bottom; y++) {
    const j = y - top, w = Math.min(bt.shoulder + (front ? 4 : 2), (front ? 8 : 6) + 2 * Math.max(0, j + 2)), [l, r] = span(w);
    for (let x = l; x <= r; x++) {
      if (dagged) { const p = (x - l) % 4; if (y > bottom - [3, 1, 0, 2][p]) continue; cells.push([x, y, p === 2 && j > 3 ? 'v' : 'V']); continue; }
      cells.push([x, y, y === bottom && (x - l) % 3 === 1 ? '.' : (x - l) % 5 === 2 && j > 3 ? 'v' : 'V']);
    }
  }
  return cells;
}

/* what a garment (garments.js) is cut to: the build, the view and pose, the torso's rows, where its belt falls */
function garmentContext(bt, view, pose, top, o) {
  const { rows, belt } = profile(bt);
  return { bt, view, pose, top, rows, belt, T: bt.torso, front: view === 'front', fc, CX, BASE, span, geo: legGeometry(bt, view, pose), o };
}
/* Everything a frame needs from the body: the generated parts and the landmarks. A garment (o.garment) brings
   its own torso and legs, and a coat: the piece worn over the torso, drawn as a layer of its own. */
function measure(type, view, pose, o = {}) {
  const bt = BODY_TYPES[type]; if (!bt) throw new Error(`unknown body type "${type}"`);
  const top = BASE + 1 - bt.legs - bt.torso + (pose ? 1 : 0), { rows } = profile(bt);
  const near = armPart(bt, view, pose, 'near', top, o), far = armPart(bt, view, pose, 'far', top, o);
  const g = o.garment ? GARMENTS[o.garment](garmentContext(bt, view, pose, top, o)) : null;
  return {
    bt, top,
    parts: {
      torso: cellsToPart(g ? g.torso : torsoCells(bt, view, top, o)),
      coat: g ? cellsToPart(g.coat) : null,
      legs: cellsToPart(g ? g.legs : o.legs === 'gown' ? gownCells(bt, view, pose) : o.legs === 'robe' ? robeCells(bt, view, pose, o.teeth) : pantsCells(bt, view, pose, o)),
      armNear: cellsToPart(near.cells), armFar: cellsToPart(far.cells), fistNear: cellsToPart(near.fist), fistFar: cellsToPart(far.fist),
      cloak: o.cloak ? cellsToPart(cloakCells(bt, view, top, o.cloak)) : null },
    at: { head: [9, top - 14], neck: [CX, top], shoulderNear: [rows[2][1], top], shoulderFar: [rows[2][0], top], handNear: near.hand, handFar: far.hand } };
}

export { BASE, BODY_TYPES, REF, measure, profile };
