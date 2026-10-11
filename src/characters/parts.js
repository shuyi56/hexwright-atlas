import { BASE, attackAxis, unit } from './body.js';
import { W, cellsToPart } from './pixels.js';

/* ================= character sprites: hand-drawn parts =================
   The grids every figure shares: heads, hair and gear. Each part is { x, y, rows }: its top-left in the 32×48
   frame as authored against the reference layout in body.js (REF), and its rows of material letters (see
   pixels.js). The frame moves each part to its landmark on the actual body. The torso, arms and legs are cut
   per body type in body.js. Front views face south-west, three-quarters on: the face sits to the viewer's
   left, the ear and the near shoulder to the right. Back views face north-east and keep the near side on the
   right.

   Letters: K skin (k its shadow), H hair, I the hair's sheen, Q brow and strand line, E eye, M mouth, A main cloth, B undershirt, C cuff or trim, L leather,
   G gold, P legs, O boots, S steel, Y a blade's bright steel, T wood. Characters add their own (see roster.js). */

/* the skin tones every figure is drawn in: fair, and a warmer tan */
const SKIN = '#ecc39a', TAN = '#d9a77c';

/* ---------- heads ---------- */
/* Faces are cel-shaded: skin takes one flat lit tone (K) and one shadow tone (k), drawn as a deliberate shape
   rather than lit pixel by pixel. The shadow takes the far cheek as the face turns from the light, the side of
   the nose, the underside of the jaw and the neck; the frame adds a band under the fringe or brim. The eyes are a
   lid over a pupil and its white, under a brow; the mouth is a short dash. */
const HEAD_FRONT = { x: 9, y: 4, rows: [
  '....KKKKKK....',
  '..KKKKKKKKKK..',
  '.KKKKKKKKKKkk.',
  '.KKKKKKKKKKkk.',
  'KKKKKKKKKKkkkk',
  'KKKKKKKKKKkkkk',
  'KQQKKQQKKkkkkk',
  'KEEKKEEKKkkkkk',
  'KEWKKEWKKkkkkk',
  'KKKKKkKKkkkkkk',
  '.KKKKKKKkkkkk.',
  '.KKMMKKkkkkkk.',
  '..KKKKkkkkkk..',
  '....kkkkkk....'] };
const HEAD_BACK = { x: 9, y: 4, rows: [
  '....KKKKKK....',
  '..KKKKKKKKKK..',
  '.KKKKKKKKKKkk.',
  '.KKKKKKKKKKkk.',
  'KKKKKKKKKKkkkk',
  'KKKKKKKKKKkkkk',
  'KKKKKKKKKkkkkk',
  'KKKKKKKKKkkkkk',
  'KKKKKKKKkkkkkk',
  'KKKKKKKKkkkkkk',
  '.KKKKKKkkkkkk.',
  '.KKKKKkkkkkkk.',
  '..KKKkkkkkkk..',
  '....kkkkkk....'] };

/* ---------- hair ---------- */
/* Hair is drawn in locks: each separated from the next by a solid strand line (Q, the hair's deepest tone),
   a sheen arc (I) across the crown where the light from the upper left catches it, the fringe falling in pointed
   locks swept toward the facing, and long hair ending in points. Long hair's near lock hangs beside the cheek,
   clear of the eye. */
const HAIR_SHORT = {
  front: { x: 8, y: 1, rows: [
    '......HHHH......',
    '....HHHHHHHH....',
    '...HHHIIIHHHHH..',
    '..HHIIHHHHHHQHH.',
    '.HHIHHHHHQHHHQHH',
    '.HHHHHHHQHHHHHQH',
    '.HHHHQHHHHQHHHQH',
    '.HHHQHHHHQHHHHHH',
    '.HHQ.HHHQ.HHHQHH',
    '.H...HH...HHHQH.',
    '..........H.HHH.',
    '............HQH.',
    '............HHH.',
    '...........HHQ..',
    '...........HH...'] },
  back: { x: 8, y: 1, rows: [
    '......HHHH......',
    '....HHHHHHHH....',
    '...HHIIIIHHHHH..',
    '..HIIHHHHQHHHHH.',
    '.HHHHHHHQHHHQHHH',
    '.HHHQHHHQHHQHHHH',
    '.HHQHHHQHHHQHHHH',
    '.HHQHHHQHHHHQHHH',
    '.HQHHHQHHHHHQHHH',
    '.HQHHHQHHHQHHHHH',
    '.HQHHHQHHHQ..HHH',
    '.HHHHHHHHHH..HH.',
    '..HQHHQHHQH..H..',
    '...HHH.HHH......',
    '....HH..HH......'] } };
/* tousled: worn longer and messier than the short cut. A cowlick lifts in a clump at the back of the crown; the
   locks sweep down toward the facing in long strands, and the fringe falls in pieces of different lengths, one lock
   between the eyes; over the ear the hair runs down into a sideburn. Behind, the locks fan out and down from the
   crown and fall shaggy over the nape in uneven points. */
const HAIR_TOUSLED = {
  front: { x: 8, y: 1, rows: [
    '..........HH....',
    '.....HHHHHHH....',
    '...HHHHHHHHHHH..',
    '..HHHIIIHHHHQHH.',
    '.HHIIHHHHQHHHQHH',
    '.HHHHHHHQHHHQHQH',
    'HHHHHHQHHHHQHHQH',
    'HHHHHQHHHQHHHHQH',
    '.HHHQHHHQHHHHQHH',
    '.HHQ.HHQ..HHHQHH',
    '.H...H.....HHQH.',
    '...........HQHH.',
    '...........HHQH.',
    '............HQ..',
    '............H...'] },
  back: { x: 8, y: 1, rows: [
    '..........HH....',
    '.....HHHHHHH....',
    '...HHIIIIHHHHH..',
    '..HIIHHHHHHHHHH.',
    '.HHHHHHHQQHHHHHH',
    '.HHHHHHQHHQHHHHH',
    '.HHQHHQHHHHQHHHH',
    '.HQHHHQHHHHHQHHH',
    '.HQHHHQHHHHQHQHH',
    '.HQHHHQHHHQHHQHH',
    '.HHQHHQHHHQHHQHH',
    '.HHQHHHQHHQHHHQ.',
    '..HQHHHQHHHQHHH.',
    '..HHQHHHQHHHQHH.',
    '...HQH.HQH.HQH..',
    '...HH..HH..HH...',
    '....H...H..H....'] } };
const HAIR_LONG = {
  front: { x: 8, y: 1, rows: [
    '......HHHH......',
    '....HHHHHHHH....',
    '...HHHIIIHHHHH..',
    '..HHIIHHHHHHQHH.',
    '.HHIHHHHHQHHHQHH',
    '.HHHHHHHQHHHHHQH',
    '.HHHHQHHHHQHHHQH',
    '.HHHQHHHHQHHHHHH',
    '.HHQ.HHHQ.HHHQHH',
    'HH...HH...HHHQHH',
    'HQ........H.HQHH',
    'HH..........HQHH',
    'QH..........HQHH',
    'HH..........HHQH',
    'HQ.........HHHQH',
    '.H.........HQHHH',
    '...........HHQH.',
    '...........HQHH.',
    '............HH..'] },
  back: { x: 8, y: 1, rows: [
    '......HHHH......',
    '....HHHHHHHH....',
    '...HHIIIIHHHHH..',
    '..HIIHHHHQHHHHH.',
    '.HHHHHHHQHHHQHHH',
    '.HHHQHHHQHHHQHHH',
    '.HHQHHHQHHHHQHHH',
    '.HHQHHHQHHHHHQHH',
    '.HQHHHQHHHHHHQHH',
    '.HQHHHQHHHQHHQHH',
    '.HQHHHQHHHQHHHQH',
    '.HQHHHQHHHQHHHQ.',
    '.HHQHHHQHHHQHHH.',
    '..HQHHHQHHHQHH..',
    '..HQHHHQHHHQHH..',
    '..HHQHHHQHHHQH..',
    '...HQHHHQHHHQ...',
    '...HHHHHHHHHH...',
    '....HH.HHH.HH...',
    '.....H..H...H...'] } };

/* A ponytail (gathered at the back of the head with a leather band, hidden behind the head in front and
   falling down the back behind, over anything slung there) and a low bun (a side-parted fringe swept back across
   the brow, the sides smoothed back behind the ear, every strand drawn down to a braided knot at the nape under a
   band in the job's jewel colour, J; in front the knot peeks out behind the head). The bun keeps tight to the
   head, clear of anything held at the side. */
const PONYTAIL_TAIL_BACK = { x: 14, y: 8, rows: [
  '.LLL.',
  'I.Q..',
  'IQ..H',
  'I.Q.H',
  '.Q...',
  'H.QH.',
  'HQ..H',
  'HHQ.H',
  'HQHHH',
  'HHQH.',
  '.HQH.',
  '.HHQ.',
  '.HH..',
  '..H..'] };
const BUN_FRONT = { x: 9, y: 1, rows: [
  '.....HHHH........',
  '...HHHHHHHH......',
  '..HHHIIIHHHHH....',
  '.HHIIHHHHHHHHH...',
  'HHIHHHHHHQHHHHH..',
  'HHHHHHHHQHHHQHH..',
  'HHHHHHQQHHHQHHH..',
  'HHQQQQHHHHQHHHH..',
  'HQ.....QQHHHHHH..',
  'H........QHHHHHH.',
  '.........H.HIIHQH',
  '...........IHQHHQ',
  '...........HQHHQH',
  '...........HHQQHH',
  '............HHHH.'] };
const BUN_BACK = { x: 9, y: 1, rows: [
  '.....HHHH......',
  '...HHHHHHHH....',
  '..HHIIIIHHHHH..',
  '.HIIHHHHHHHHHH.',
  'HHHHQHHHHHQHHHH',
  'HHHHQHHHHHQHHHH',
  'HHHHHQHHHQHHHHH',
  'HHHHHQHHHQHHHHH',
  'HHHHHHQHQHHHHHH',
  'HHHHHHQHQHHHHHH',
  'HHHHHHHQHHH..HH',
  '.HHHHJJJJJH..H.',
  '..HHHHHHHHH....',
  '....HIIHQH.....',
  '....IHQHHQ.....',
  '....HQHHQH.....',
  '....HHQQHH.....',
  '.....HHHH......'] };
const HAIR_BUN = { front: BUN_FRONT, back: BUN_BACK };
/* A braid: in front the fringe and crown of long hair, the far side tucked behind the ear and the near side
   gathered into a braid over the near shoulder and down the chest; from behind every strand drawn to the nape and
   plaited down the middle of the back. The plait is three pixels of two-row lobes leaning alternately, each lit on
   its upper edge (I) and parted from the next by a strand line, tied off with a ribbon (R) above a tuft. */
const PLAIT = ['IHH', 'HHQ', 'HHI', 'QHH'];
const plait = (pad, n, w) => Array.from({ length: n }, (_, j) => (pad + PLAIT[j % 4]).padEnd(w, '.'));
const HAIR_BRAID = {
  front: { x: 8, y: 1, rows: [
    '......HHHH......',
    '....HHHHHHHH....',
    '...HHHIIIHHHHH..',
    '..HHIIHHHHHHQHH.',
    '.HHIHHHHHQHHHQHH',
    '.HHHHHHHQHHHHHQH',
    '.HHHHQHHHHQHHHQH',
    '.HHHQHHHHQHHHHHH',
    '.HHQ.HHHQ.HHHQHH',
    'HH...HH...HHHQHH',
    'HQ........H.HQHH',
    '.H..........HQHH',
    '............HHQH',
    '...........HHQH.',
    ...plait('...........', 10, 16),
    '...........RRR..',
    '...........HQH..',
    '............H...'] },
  back: { x: 8, y: 1, rows: [
    '......HHHH......',
    '....HHHHHHHH....',
    '...HHIIIIHHHHH..',
    '..HIIHHHHQHHHHH.',
    '.HHHHQHHHQHHHHHH',
    '.HHHHQHHQHHHHHHH',
    '.HHHHHQHQHHHHHHH',
    '.HHHHHQHQHHHHHHH',
    '.HHHHHHQHHHHHHHH',
    '.HHHHHHQHHHHHHHH',
    '.HHHHHHQHHHH.HHH',
    '..HHHHHQHHHH.HH.',
    '....HHHQHHH.....',
    '.....HHHHH......',
    ...plait('......', 10, 16),
    '......RRR.......',
    '......HQH.......',
    '.......H........'] } };
/* a style may add a piece drawn over what is slung on the back (over, for the ponytail falling over a quiver) */
const HAIR_PONYTAIL = { front: HAIR_SHORT.front, back: HAIR_SHORT.back, over: { back: PONYTAIL_TAIL_BACK } };

/* ---------- gear ---------- */
/* a part mirrored in place */
const flipPart = part => ({ ...part, rows: part.rows.map(r => [...r].reverse().join('')) });

/* Weapons are made for the hand that holds them: make({ hand: [x, y], dir, face }) returns a part, where hand is
   the fist's centre, dir the outward side (-1 left, +1 right) and face the head's top-left. So a blade, bow or polearm sits in the fist on any
   build and in any pose, and keeps clear of the body. */
const line = (cells, x0, y0, x1, y1, ch) => {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { cells.push([x0, y0, ch]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
};
const both = make => ({ front: { make }, back: { make } });

/* ---------- weapons in an attack ----------
   In the attack poses (body.js) make is also told attack ('windup' or 'strike') and other, the other fist. A weapon
   then lies along the line body.js attackAxis gives its kind at that step, its hand-drawn head laid along it by
   orient: the grid drawn pointing up (row 0 at the tip, columns across), turned so it points along the axis. Each
   pixel round it samples the grid at its own place, so any angle draws without holes. */
function orient(cells, rows, tip, axis) {
  const [ux, uy] = unit(axis), w = rows[0].length, mid = (w - 1) / 2, R = Math.ceil(Math.hypot(rows.length, w)) + 1;
  for (let y = Math.floor(tip[1]) - R; y <= tip[1] + R; y++) for (let x = Math.floor(tip[0]) - R; x <= tip[0] + R; x++) {
    const dx = x - tip[0], dy = y - tip[1], j = Math.round(-(dx * ux + dy * uy)), i = Math.round(-dx * uy + dy * ux + mid);
    const ch = j >= 0 && j < rows.length && i >= 0 && i < w ? rows[j][i] : '.';
    if (ch !== '.') cells.push([x, y, ch]);
  }
}
/* how far along the unit vector u a point can go from p and stay in the frame, a column and a row clear of its edges
   for the outline */
function room([px, py], [ux, uy]) {
  const lim = (p, u, lo, hi) => (u > 1e-6 ? (hi - p) / u : u < -1e-6 ? (lo - p) / u : Infinity);
  return Math.max(0, Math.min(lim(px, ux, 1, W - 2), lim(py, uy, 1, BASE)));
}
const along = ([px, py], [ux, uy], d) => [px + ux * d, py + uy * d];
/* a held weapon in an attack, laid from the fist along the axis: build(r) is given the room in front of the fist (how
   far the frame lets it reach) and returns { rows, reach }, its grid (pointing up) and how far out its tip stands, so
   a blade can come shorter where the frame is tight. A polearm carries a wooden shaft from its head back through the
   fist, butt pixels beyond it. */
function wield(cells, build, hand, axis, butt = 0) {
  const u = unit(axis), inside = ([x, y]) => x >= 1 && x <= W - 2 && y >= 1 && y <= BASE;
  /* a head wider than its shaft can still overhang the frame's edge at the tip: then it comes in a pixel at a time */
  for (let r = Math.floor(room(hand, u)); ; r--) {
    const { rows, reach } = build(r), tip = along(hand, u, reach), out = [];
    if (butt) {
      const b = Math.min(butt, Math.floor(room(hand, [-u[0], -u[1]]))), [x0, y0] = along(tip, u, -rows.length).map(Math.round), [x1, y1] = along(hand, u, -b).map(Math.round);
      line(out, x0, y0, x1, y1, 'T');
    }
    orient(out, rows, tip, axis);
    if (out.every(inside) || r <= 0) { cells.push(...out); return; }
  }
}

/* a sword held point-down: a crossguard under the fist and a long blade angling out from the body a pixel every
   three rows, two pixels wide to a point. A dagger is the same in miniature, with a short guard. In an attack it is
   raised over the head, point up, then brought down forward (swing). */
function blade(len, guard) {
  const w = 2 * guard + 1, up = n => ['.'.repeat(guard) + 'Y' + '.'.repeat(guard), ...Array(n).fill('.'.repeat(guard - 1) + 'YY' + '.'.repeat(guard)), 'G'.repeat(w)];
  return { attack: 'swing', ...both(({ hand: [hx, hy], dir, attack }) => {
    const cells = [];
    if (attack) {
      wield(cells, r => { const n = Math.max(1, Math.min(len, r - 3)); return { rows: up(n), reach: n + 3 }; }, [hx, hy], attackAxis('swing', dir, attack));
      return cellsToPart(cells);
    }
    const n = Math.min(len, BASE - hy - 5);
    for (let i = -guard; i <= guard; i++) cells.push([hx + i, hy + 2, 'G']);
    let bx = dir < 0 ? hx - 1 : hx;
    for (let j = 0; j < n; j++) { bx = (dir < 0 ? hx - 1 : hx) + dir * Math.floor(j / 3); cells.push([bx, hy + 3 + j, 'Y'], [bx + 1, hy + 3 + j, 'Y']); }
    cells.push([dir < 0 ? bx : bx + 1, hy + 3 + n, 'Y']);
    return cellsToPart(cells);
  }) };
}
const SWORD = blade(10, 2), DAGGER = blade(3, 1);
/* a staff stood beside the fist, its foot on the ground, crowned with a hand-drawn head; it runs through the
   outer knuckles, and on a slim build never closer in than on the standard one so the head clears the headgear.
   Options: lean, rows per pixel the shaft tilts outward above the fist (and inward below it), so a long spear's
   head rises clear of the hair and helm; behind, drawn in the hand like any weapon instead of held forward over a
   hood (the mages' staves are held forward so their heads show past hoods and brims); attack, how it is used (body.js):
   a staff held forward casts, one held behind is a spear that thrusts, unless it says otherwise (the orc's axe chops).
   Casting, the staff is lifted off the ground with glints (+) round its head, then swept forward, its head leaning
   toward the facing in a burst of light. A spear or axe is laid along the attack's line instead (wield). */
/* where the glints stand round a staff's head, in half its size plus a pixel: four at the corners as it is raised,
   eight rays as it casts */
const GLINT = [[-1, -1], [1, -1], [-1, 1], [1, 1]], BURST = [[0, -1.5], [-1.5, 0], [1.5, 0], [0, 1.5], ...GLINT];
function staff(head, rise, { lean = 0, behind = false, attack = behind ? 'thrust' : 'cast' } = {}) {
  const w = head[0].length;
  return { grounded: true, forward: !behind, attack, ...both(({ hand: [hx, hy], dir, face, sx = 0, attack: phase }) => {
    const cells = [];
    if (phase && attack !== 'cast') {
      /* a thrust drives the head a little beyond the fist; a chop swings it on a haft at arm's length */
      const reach = attack === 'chop' ? head.length + 6 : head.length + 3;
      wield(cells, r => ({ rows: head, reach: Math.max(head.length - 1, Math.min(reach, r)) }), [hx, hy], attackAxis(attack, dir, phase), attack === 'chop' ? 4 : 10);
      return cellsToPart(cells);
    }
    const x0 = dir < 0 ? Math.min(hx - 1, 8 + sx) : Math.max(hx + 1, 23 + sx);
    /* a head that would reach across the face (a staff drawn in front, on a narrow build) rides above the brow */
    let top = hy - rise; if (!behind && face && dir < 0 && x0 - (w >> 1) + w - 1 >= face[0] + 1) top = Math.min(top, face[1] + 6 - head.length);
    /* lifted to cast, it keeps its length but leaves the ground, its head never past the top of the frame */
    const foot = phase ? Math.min(BASE, Math.max(1, top) + rise + 18) : BASE; if (phase) top = Math.max(phase === 'windup' ? 2 : 3, top);
    /* swept forward to cast, it leans a pixel every three rows, or stands straighter where the frame is too narrow */
    const lx = t => x0 + (t ? dir * Math.trunc((hy - top - head.length + 1) / t) : 0) - (w >> 1);
    let tilt = phase === 'strike' ? 3 : phase ? 0 : lean;
    while (phase === 'strike' && (lx(tilt) < 1 || lx(tilt) + w > W - 2)) tilt++;
    const at = y => x0 + (tilt ? dir * Math.trunc((hy - y) / tilt) : 0), cx = at(top + head.length - 1);
    head.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') cells.push([cx - (w >> 1) + i, top + j, ch]); }));
    for (let y = top + head.length; y <= foot; y++) cells.push([at(y), y, 'T']);
    if (phase) {
      const mx = cx - (w >> 1) + (w - 1) / 2, my = top + (head.length - 1) / 2, ox = (w + 1) / 2, oy = (head.length + 1) / 2;
      for (const [gx, gy] of phase === 'windup' ? GLINT : BURST) {
        const x = Math.round(mx + gx * ox), y = Math.round(my + gy * oy); if (x >= 1 && x <= W - 2 && y >= 1) cells.push([x, y, '+']);
      }
    }
    return cellsToPart(cells);
  }) };
}
/* A dragoon's lance carried at the ready: the shaft through the fist, its point at the top of the frame and its
   head leaning forward and out of the body, as far as the frame allows (a pixel every four rows at most), its
   butt trailing toward the ground behind the legs. From the point down: a long blade of bright steel with a ridge
   down its middle, narrowing at its neck; two barbed wings swept back from its base on a gold socket; a tuft of
   horsehair in the job's accent splaying out beneath; a leather grip wound about the shaft either side of the fist; and a steel
   spike at the butt behind a gold ferrule. */
const LANCE_HEAD = [
  '..Y..',
  '..Y..',
  '.YyY.',
  '.YyY.',
  '.YyY.',
  '.YyY.',
  '..Y..',
  'SSGSS',
  'S.G.S',
  'S.G.S',
  '.RRR.',
  'RR.RR',
  'R...R'];
/* In an attack the lance is drawn back in both hands and driven forward along the line to the next tile, its blade
   and wings leading and the shaft running back past the fist. */
const LANCE = { attack: 'thrust', ...both(({ hand: [hx, hy], dir, attack }) => {
  if (attack) {
    const cells = [], head = LANCE_HEAD.slice(0, 10);
    wield(cells, r => ({ rows: head, reach: Math.max(head.length - 1, Math.min(head.length + 2, r)) }), [hx, hy], attackAxis('thrust', dir, attack), 10);
    return cellsToPart(cells);
  }
  const cells = [], half = LANCE_HEAD[0].length >> 1, n = LANCE_HEAD.length, tip = 0;
  const room = dir < 0 ? hx - half - 1 : W - 2 - half - hx, slope = Math.max(4, Math.ceil((hy - tip) / Math.max(1, room)));     /* a column spare for the outline */
  const at = y => hx + Math.round(dir * (hy - y) / slope), foot = Math.min(BASE - 1, hy + 12);
  line(cells, at(foot - 3), foot - 3, at(tip + n - 3), tip + n - 3, 'T');
  LANCE_HEAD.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') cells.push([at(tip + j) + i - half, tip + j, ch]); }));
  /* a leather grip wound about the shaft above and below the fist */
  for (const y of [hy - 4, hy - 3, hy - 2, hy + 2, hy + 3, hy + 4]) cells.push([at(y), y, (y - hy) % 2 ? 'L' : 'l']);
  /* the butt: a gold ferrule and a steel spike */
  cells.push([at(foot - 2), foot - 2, 'G'], [at(foot - 1), foot - 1, 'S'], [at(foot), foot, 'S']);
  return cellsToPart(cells);
}) };
/* a longbow held by its grip in the fist, carried at the side with its limbs sweeping outward to recurved tips
   and the string stretched straight between them, all clear of the body. Swung out near the frame's edge it
   turns toward the viewer, so its sweep narrows to fit. In an attack it is held out toward the facing: drawn, its
   limbs bend back toward the archer and the string runs from each tip to the hand at the jaw (other), an arrow on it
   (a steel head, fletched in the accent) reaching past the grip; loosed, the limbs ease and the string springs
   straight between them. */
const BOW = { attack: 'shoot', ...both(({ hand: [hx, hy], dir, attack, other }) => {
  if (attack) {
    const cells = [], R = 9, drawn = attack === 'windup', reach = drawn ? 3 : 2, tx = hx - dir * reach, bend = r => Math.round(reach * (r / R) ** 2);
    if (drawn) for (const ty of [hy - R - 1, hy + R + 1]) line(cells, tx, ty, other[0], other[1], 'F');
    else for (let r = -R; r <= R; r++) cells.push([tx, hy + r, 'F']);
    for (let r = -R; r <= R; r++) cells.push([hx - dir * bend(r), hy + r, Math.abs(r) <= 1 ? 'L' : 'T']);
    for (const r of [-R - 1, R + 1]) cells.push([tx, hy + r, 'T']);
    if (drawn) {
      const [px, py] = other, ex = hx + dir * 3, ey = Math.round(py + ((hy - py) * (ex - px)) / (hx - px)), shaft = [];
      line(shaft, px, py, ex, ey, 'T');
      shaft.forEach((c, i) => { if (i < 2) c[2] = 'R'; });
      cells.push(...shaft, [ex, ey, 'S'], [ex - dir, ey - 1, 'S'], [ex - dir, ey + 1, 'S']);
    }
    return cellsToPart(cells);
  }
  const cells = [], R = 9, reach = Math.max(2, Math.min(4, dir < 0 ? hx - 1 : W - 2 - hx)), bend = r => Math.round((reach - 1) * (r / R) ** 2);
  for (let r = -R + 1; r <= R - 1; r++) cells.push([hx + dir * reach, hy + r, 'F']);
  for (let r = -R; r <= R; r++) cells.push([hx + dir * bend(r), hy + r, Math.abs(r) <= 1 ? 'L' : 'T']);
  for (const r of [-R - 1, R + 1]) cells.push([hx + dir * reach, hy + r, 'T']);
  return cellsToPart(cells);
}) };
/* a kite shield on the near arm; from behind, its rim shows past the body */
const KITE = {
  front: { x: 18, y: 20, rows: [
    '.GGGGG.',
    'GUUUUUG',
    'GUUCUUG',
    'GUCCCUG',
    'GUUCUUG',
    'GUUCUUG',
    '.GUUUG.',
    '.GUUUG.',
    '..GUG..',
    '...G...'] },
  back: { x: 6, y: 20, rows: ['.G', 'GL', 'GL', 'GL', 'GL', 'GL', '.G', '.G'] } };
const BUCKLER = {
  front: { x: 18, y: 21, rows: [
    '..GGG..',
    '.GUUUG.',
    'GUUUUUG',
    'GUUCUUG',
    'GUUUUUG',
    '.GUUUG.',
    '..GGG..'] },
  back: { x: 6, y: 21, rows: ['.G', 'GL', 'GL', 'GL', 'GL', '.G'] } };

/* ---------- helpers ---------- */
/* a part with some letters swapped, e.g. sleeves of steel: recolor(ARM_NEAR, { A: 'S' }); creases stay creases */
function recolor(part, map) {
  const sw = ch => { const up = ch.toUpperCase(), to = map[up]; return to ? (ch === up ? to : to.toLowerCase()) : ch; };
  return { ...part, rows: part.rows.map(r => [...r].map(sw).join('')) };
}
export { BOW, BUCKLER, DAGGER, HAIR_BRAID, HAIR_BUN, HAIR_LONG, HAIR_PONYTAIL, HAIR_SHORT, HAIR_TOUSLED, HEAD_BACK, HEAD_FRONT, KITE, LANCE, SKIN, SWORD, TAN, flipPart, orient, recolor, staff, wield };
