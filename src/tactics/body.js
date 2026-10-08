import { cellsToPart } from './pixels.js';

/* ================= tactics sprites: bodies =================
   The torso, arms and legs are cut from a body type's measurements, so any job can wear any build. Clothing is
   a set of rules over the cut shape (where the collar, belt, ridge or front panel falls) rather than fixed
   grids. The hand-drawn heads, hats and gear in parts.js are hung on the body's landmarks (measure()): the
   head, the neck, each shoulder and each hand.

   All builds share the 14-pixel head and stand with their soles on row BASE, so they line up on a battlefield;
   they differ in shoulders, waist, limb thickness and how the height splits between torso and legs. */
const BASE = 46, CX = 16;
const BODY_TYPES = {
  slim: { name: 'Slim', torso: 12, legs: 13, shoulder: 10, chest: 10, waist: 8, hem: 10, legW: 3, arm: 2, hand: 2 },
  standard: { name: 'Standard', torso: 12, legs: 12, shoulder: 12, chest: 12, waist: 10, hem: 12, legW: 4, arm: 3, hand: 3 },
  stocky: { name: 'Stocky', torso: 12, legs: 9, shoulder: 14, chest: 14, waist: 13, hem: 14, legW: 5, arm: 4, hand: 3 },
  tall: { name: 'Tall', torso: 14, legs: 15, shoulder: 13, chest: 13, waist: 11, hem: 13, legW: 4, arm: 3, hand: 3 } };
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
   elbow where it steps a pixel further out, the forearm, a cuff and a fist. In a stride it swings from the shoulder: the forearm and hand
   reach forward (toward the facing) or trail back, and rise a row as the arm leaves the vertical. Forward on
   screen is left in the front view and right in the back view. */
function armPlan(bt, view, pose, side, steady) {
  const { rows } = profile(bt), w = bt.arm, s = side === 'near' ? 1 : -1, dir = view === 'front' ? -1 : 1;
  /* a hand carrying a staff or polearm keeps it upright: that arm rides with the body but does not swing */
  if (steady && side === (view === 'front' ? 'far' : 'near')) pose = 0;
  const edge = s > 0 ? rows[2][1] : rows[2][0];
  const fwd = pose && (pose === 1) === (side === 'near'), sx = !pose ? 0 : fwd ? 2 * dir : -dir;
  const upper = s > 0 ? edge : edge - w + 1, lower = upper + s;                 /* left column of each section */
  const cuff = bt.torso - 4 - (sx ? 1 : 0);
  return { w, s, dir, upper, lower, sx, cuff, hand: bt.hand };
}
function armPart(bt, view, pose, side, top, o = {}) {
  const sl = o.sleeves || {}, sleeve = sl.A || 'A', cuffL = sl.C || 'C', skin = o.hands || 'K';
  const a = armPlan(bt, view, pose, side, o.steady), cells = [];
  const put = (x, y, ch) => cells.push([x, y, ch]);
  for (let j = 0; j <= a.cuff; j++) {
    const elbow = j >= 5, x0 = (elbow ? a.lower : a.upper) + (j > 5 ? a.sx : j === 5 ? Math.trunc(a.sx / 2) : 0);
    const n = j === 0 ? a.w - 1 : a.w, from = j === 0 && a.s < 0 ? x0 + 1 : x0;
    for (let i = 0; i < n; i++) {
      const x = from + i, inner = a.s > 0 ? i === 0 : i === n - 1;
      put(x, top + j, j === a.cuff ? cuffL : inner && j > 0 && j < 5 ? sleeve.toLowerCase() : sleeve);
    }
  }
  /* the fist, its thumb on the side the figure faces */
  const hw = Math.max(a.hand, 2), hx = a.lower + a.sx + Math.floor((a.w - hw) / 2), hy = top + a.cuff + 1;
  const fist = hw === 2 ? ['KK', 'KK', a.dir < 0 ? 'K.' : '.K'] : ['KKK', 'KKK', a.dir < 0 ? 'KK.' : '.KK'];
  const fistCells = [];
  fist.forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') fistCells.push([hx + i, hy + j, j === 2 ? skin.toLowerCase() : skin]); }));
  return { cells: cells.concat(fistCells), fist: fistCells, hand: [hx + Math.floor(hw / 2), hy + 1] };
}

/* ---------- legs ----------
   Trousers into boots, or a robe to the ankles with the shoes beneath. In a stride one leg reaches forward a
   pixel and the other lifts its heel two rows; the hips drop with the body. */
function legGeometry(bt, view, pose) {
  const dir = view === 'front' ? -1 : 1, far = [CX - 1 - bt.legW, CX - 2], near = [CX + 1, CX + bt.legW];
  const step = [[{ dx: 0, lift: 0 }, { dx: 0, lift: 0 }], [{ dx: dir, lift: 0 }, { dx: 0, lift: 2 }], [{ dx: 0, lift: 2 }, { dx: dir, lift: 0 }]][pose];
  return { dir, legs: [[far, step[0]], [near, step[1]]], y0: BASE + 1 - bt.legs + (pose ? 1 : 0) };
}
function pantsCells(bt, view, pose) {
  const { dir, legs, y0 } = legGeometry(bt, view, pose), cells = [], boot = Math.round(bt.legs * 0.5);
  for (let x = legs[0][0][0]; x <= legs[1][0][1]; x++) { cells.push([x, y0, 'P']); cells.push([x, y0 + 1, x === CX - 1 ? 'p' : 'P']); }
  for (const [[a, b], { dx, lift }] of legs) {
    const end = BASE - lift;
    for (let y = y0 + 2; y <= end; y++) {
      const inBoot = y > BASE - boot, toe = y > BASE - 3 && !lift, sole = y === end;
      let l = a + dx, r = b + dx; if (toe) { if (dir < 0) l--; else r++; }
      if (sole && lift) { if (dir < 0) r = l + 1; else l = r - 1; }                 /* a lifted heel: only the toe touches down */
      for (let x = l; x <= r; x++) cells.push([x, y, sole ? 'o' : inBoot ? 'O' : 'P']);
    }
  }
  cells.push([CX, y0 + 2, 'P']);                                                 /* the crotch tapers a row */
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
    : j === t.belt ? 'L' : x === fc && j >= 3 && j !== t.belt ? 'a' : 'A') };
function torsoCells(bt, view, top, o = {}) {
  const { rows, belt } = profile(bt), T = bt.torso, front = view === 'front', style = TORSO[o.torso || 'tunic'], cells = [], [cl, cr] = rows[2];
  rows.forEach(([l, r], j) => {
    for (let x = l; x <= r; x++) {
      let ch = style(j, x, { T, belt, front });
      if (o.skirt && j === T - 1 && ch === 'C') ch = 'A';                     /* the trim moves down to the skirt's hem */
      /* a leather vest left open down the front, a solid back from behind */
      if (o.vest && j < belt && ch !== 'L' && (!front || x < fc - 1 || x > fc + 2 || j > 2 && (x < fc || x > fc + 1))) ch = 'D';
      /* a strap from one shoulder across to the other hip */
      if (o.strap && j < belt && x === ((o.strap > 0) === front ? cl + 1 + j : cr - 1 - j)) ch = 'L';
      cells.push([x, top + j, ch]);
    }
  });
  /* a skirt carried on below the hem, over the legs */
  for (let k = 0; k < (o.skirt || 0); k++) { const [l, r] = span(bt.hem + (k ? 2 : 0)); for (let x = l; x <= r; x++) cells.push([x, top + T + k, k === o.skirt - 1 ? 'C' : (x - l) % 4 === 2 ? 'a' : 'A']); }
  return cells;
}

/* ---------- a cloak hanging from the shoulders: edges behind the body from the front, the whole from behind ---------- */
function cloakCells(bt, view, top) {
  const cells = [], bottom = BASE + 1 - bt.legs + Math.round(bt.legs * 0.55), front = view === 'front';
  for (let y = top - (front ? 0 : 1); y <= bottom; y++) {
    const j = y - top, w = Math.min(bt.shoulder + (front ? 4 : 2), (front ? 8 : 6) + 2 * Math.max(0, j + 2)), [l, r] = span(w);
    for (let x = l; x <= r; x++) cells.push([x, y, y === bottom && (x - l) % 3 === 1 ? '.' : (x - l) % 5 === 2 && j > 3 ? 'v' : 'V']);
  }
  return cells;
}

/* Everything a frame needs from the body: the generated parts and the landmarks. */
function measure(type, view, pose, o = {}) {
  const bt = BODY_TYPES[type]; if (!bt) throw new Error(`unknown body type "${type}"`);
  const top = BASE + 1 - bt.legs - bt.torso + (pose ? 1 : 0), { rows } = profile(bt);
  const near = armPart(bt, view, pose, 'near', top, o), far = armPart(bt, view, pose, 'far', top, o);
  return {
    bt, top,
    parts: {
      torso: cellsToPart(torsoCells(bt, view, top, o)),
      legs: cellsToPart(o.legs === 'robe' ? robeCells(bt, view, pose, o.teeth) : pantsCells(bt, view, pose)),
      armNear: cellsToPart(near.cells), armFar: cellsToPart(far.cells), fistNear: cellsToPart(near.fist), fistFar: cellsToPart(far.fist),
      cloak: o.cloak ? cellsToPart(cloakCells(bt, view, top)) : null },
    at: { head: [9, top - 14], neck: [CX, top], shoulderNear: [rows[2][1], top], shoulderFar: [rows[2][0], top], handNear: near.hand, handFar: far.hand } };
}

export { BASE, BODY_TYPES, REF, measure, profile };
