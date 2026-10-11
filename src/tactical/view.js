import { characterById } from '../characters/library.js';
import { FACES } from '../characters/draw.js';
import { WALK } from '../characters/roster.js';
import { ED, LEVEL_NAME, mutate, undo } from '../editor/editor.js';
import { MAX_LEVEL, levelOf } from '../editor/model.js';
import { walkChar } from '../editor/walk.js';
import { ASSET_BY_ID, TERRAIN } from '../tiles/index.js';
import { $, state } from '../ui/state.js';
import { moveRange, placeId, routeTo } from './move.js';
import '../data/unit-files.js';
import { PATTERNS, onUnitsChange, unitFor } from '../data/units.js';
import { attackReach } from './attack.js';
import { planTurn } from '../battle/ai.js';
import * as battle from '../battle/state.js';
import { drawScene, figureHeight, figureHit, portrait } from './render.js';
import { P, bounds, buildScene, pickTile, viewOf, viewPoint } from './scene.js';

/* ================= tactical view: the screen =================
   The editor's map seen through a tactics game's camera: zoomed in close, whole-pixel scaling, the camera gliding
   after the cursor and the unit on the move. Pick a unit (click it, Enter on it, or Tab through them) and its move
   range lights up in blue; the route to the tile under the cursor is traced in gold; click a lit tile (or Enter)
   and it walks there, hopping up and down ledges, while the camera follows. Moves are edits of the map, on the
   editor's undo stack. Once it has arrived (or been picked again to stay where it is) its actions window opens
   beside it, as in the tactics games: Move, Attack (its pattern and range light up in red; pick a unit of the
   other side there to strike it for its Attack) and Wait. Esc or a right-click steps back: from the attack to the
   window, from the window to the move (taking the move back if it walked), from the move to no unit, and with no
   unit picked it takes back the last Wait, until anything else is done. Esc never leaves the view (← Editor does). A unit
   struck shows its health bar over its head for a moment, draining. The fight is kept by battle/state.js: a turn is
   the player's phase and then the enemy's, each unit of the side in play moves once and acts once, and the phase
   passes when every one of them is done or End turn (T) is pressed, with a banner for each new phase. In the enemy
   phase the computer plays each enemy in turn (battle/ai.js), showing its range, walking and striking, while the
   controls wait. Hit points are the battle's, not the map's: they start full each time the view opens, and a unit
   brought to 0 stays where it fell, faded; the last enemy falling wins the battle, the last of yours loses it. Arrow keys or WASD move the cursor a tile at a time along the grid, Q and E turn the view,
   + and - zoom, PgUp / PgDn change storey, Esc steps back. */
const root = $('tactical'), cv = $('tcCanvas'), g = cv.getContext('2d');
/* TC.debug: drawing options passed straight to drawScene (e.g. { depth: false } or { xray: false }), for checking
   what an overlay changes */
const TC = { open: false, sc: null, rot: 0, top: 0, zoom: 3, cam: { x: 0, y: 0 }, goal: null, cursor: null, sel: -1, mode: null, menu: false, from: null, range: null, reach: null, battle: null, ai: null, banner: null, rewind: null, start: null, armed: 0, pop: null, note: '', walk: null, fast: false, cw: 0, ch: 0, dirty: true, drag: null, lastT: 0, tick: 0 };
/* WALK_SPEED tiles a second (doubled while TC.fast, the 2× chip or F); STRIDES beats of the walk (WALK: stride, upright, stride, upright) to a tile, so a step
   covers one tile, as it would on foot, and the arms swing at the pace the figure moves */
const ZOOMS = [1, 2, 3, 4, 5, 6], WALK_SPEED = 4.2, STRIDES = 2, POP_TIME = 1.6;
/* how long a phase's banner shows, and the computer's pauses between showing an enemy's range, walking, aiming and
   striking (all halved by the 2× chip) */
const MENU_FONT = 12, MENU_SCALE = [0.75, 2], RESTART_ARM = 3;
const BANNER_TIME = 1.5, AI_PAUSE = { pick: 0.45, aim: 0.5, after: 1.1, stay: 0.3 };

/* ---------- the scene and where things are ---------- */
function rebuild() { TC.sc = buildScene(ED.M, { rot: TC.rot, top: TC.top }); TC.bounds = bounds(TC.sc); TC.dirty = true; }
const S = () => ED.M.S;
const toViewU = (x, y) => viewOf(S(), TC.rot)(y * S() + x);
const toModel = u => TC.sc.back[u];
/* a model tile's top on level L, in art pixels: [x, y] of its centre */
function tileArt(x, y, L) { const u = toViewU(x, y), X = u % S(), Y = (u / S()) | 0; return P(X + 0.5, Y + 0.5, TC.sc.zAt(u, L)); }
const zAt = (x, y, L) => TC.sc.zAt(toViewU(x, y), L);
const ptOf = (x, y, L) => ({ x: x + 0.5, y: y + 0.5, z: zAt(x, y, L), L });

/* ---------- walking ---------- */
function walkerPos(w) {
  let d = w.d;
  for (let i = 0; i + 1 < w.pts.length; i++) {
    const a = w.pts[i], b = w.pts[i + 1];
    if (d <= 1 || i + 2 === w.pts.length) {
      const f = Math.min(1, d), face = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 1 : 3) : (b.y > a.y ? 0 : 2);
      /* a step up or down a ledge is a hop: the height changes in the middle of the step, with a little arc */
      let z = a.z + (b.z - a.z) * f;
      if (a.L === b.L && a.z !== b.z) { const t = Math.max(0, Math.min(1, (f - 0.3) / 0.4)); z = a.z + (b.z - a.z) * t * t * (3 - 2 * t) + Math.sin(f * Math.PI) * 5; }
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z, rail: a.z + (b.z - a.z) * f, ground: a.z + (b.z - a.z) * (f < 0.5 ? 0 : 1), L: f < 0.5 ? a.L : b.L, face, seg: [a, b] };
    }
    d -= 1;
  }
  const e = w.pts[w.pts.length - 1]; return Object.assign({ face: 0, ground: e.z, rail: e.z }, e);
}
function startWalk(k, path) {
  const M = ED.M, c = M.chars[k], start = ptOf(c.x, c.y, levelOf(c));
  const jump = unitFor(c.sprite).movement.jump, r = mutate(M2 => { const w = walkChar(M2, k, path, jump); return { changed: w.ok && path.length ? 1 : 0, ok: w.ok }; });
  if (!r || !r.ok) return false;
  TC.walk = { k, pts: [start, ...path.map(([x, y, L]) => ptOf(x, y, L || 0))], d: 0 }; TC.locked = false; TC.free = false; TC.rewind = null;
  /* the map as it was before the walk, for taking the move back from the actions window */
  TC.from = { k, snap: ED.undo[ED.undo.length - 1] };
  TC.range = null; rebuild();
  return true;
}

/* ---------- figures for the scene ---------- */
function figures() {
  const M = ED.M, out = [], sz = S();
  (M.chars || []).forEach((c, k) => {
    const w = TC.walk && TC.walk.k === k ? TC.walk : null, p = w ? walkerPos(w) : Object.assign(ptOf(c.x, c.y, levelOf(c)), { face: c.face, ground: zAt(c.x, c.y, levelOf(c)) });
    const L = w ? p.L : levelOf(c); if (L > TC.top) return;
    const [X, Y] = viewPoint(sz, TC.rot, p.x, p.y);
    /* the nearer of the two tiles it is stepping between decides when it is drawn */
    const keyOf = q => { const [a, b] = viewPoint(sz, TC.rot, Math.floor(q.x) + 0.5, Math.floor(q.y) + 0.5); return a + b; };
    const key = w && p.seg ? Math.max(keyOf(p.seg[0]), keyOf(p.seg[1])) : keyOf(p);
    out.push({ key, lv: L, pri: 2, X, Y, z: p.z, ground: p.ground ?? p.z, c: characterById(c.sprite) || characterById('villager'), k, face: FACES[(p.face + 3 * TC.rot) % 4], pose: w ? WALK[Math.floor(w.d * STRIDES) % WALK.length] : 0, ghost: !alive(k) });
  });
  return out;
}

/* ---------- camera ---------- */
const scale = () => Math.max(1, Math.round(TC.zoom * state.dpr));
function size() {
  const r = root.getBoundingClientRect(); TC.cw = r.width; TC.ch = r.height;
  cv.width = Math.round(r.width * state.dpr); cv.height = Math.round(r.height * state.dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; TC.dirty = true;
}
/* The camera glides to a new place over a fixed time (about half a second to nine tenths with the distance),
   easing gently in and out along a half sine, rather than slowing toward it for ever: on whole pixels an endless slow-down moves by uneven steps and ends in a long crawl of single-pixel hops.
   A goal that moves a little while the glide is under way (a walker, the cursor at the edge) is followed by the
   same glide; one that jumps somewhere new starts a fresh glide from where the camera is. */
const ease = t => (1 - Math.cos(Math.PI * t)) / 2;
function lookAt(x, y, now) {
  TC.dirty = true;
  if (now) { TC.cam.x = x; TC.cam.y = y; TC.goal = null; TC.glide = null; return; }
  if (TC.goal && TC.glide && Math.hypot(x - TC.goal[0], y - TC.goal[1]) < 48) { TC.goal = [x, y]; return; }
  const d = Math.hypot(x - TC.cam.x, y - TC.cam.y);
  if (d < 0.5) { TC.cam.x = x; TC.cam.y = y; TC.goal = null; TC.glide = null; return; }
  TC.goal = [x, y]; TC.glide = { from: [TC.cam.x, TC.cam.y], t: 0, dur: Math.min(0.55, 0.28 + d / 1600) };
}
/* keep the cursor inside the middle of the screen, as the games do, rather than chasing every step */
function keepInView(x, y) {
  const k = scale() / state.dpr, hw = TC.cw / k / 2 * 0.55, hh = TC.ch / k / 2 * 0.5, [cx, cy] = TC.goal || [TC.cam.x, TC.cam.y];
  lookAt(Math.max(x - hw, Math.min(x + hw, cx)), Math.max(y - hh, Math.min(y + hh, cy)));
}
function setFast(on) { TC.fast = on; $('tcFast').setAttribute('aria-pressed', String(on)); }
function setZoom(z) { TC.zoom = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z)); $('tcZoom').textContent = `×${TC.zoom}`; TC.dirty = true; }

/* ---------- the cursor, the unit and its range ---------- */
function setCursor(x, y, L, follow) {
  const M = ED.M; x = Math.max(0, Math.min(M.S - 1, x)); y = Math.max(0, Math.min(M.S - 1, y));
  /* a storey with no floor there falls through to the floor or ground below */
  while (L > 0 && !(M.floors && M.floors[L - 1] && M.floors[L - 1][y * M.S + x])) L--;
  TC.cursor = { x, y, L }; if (follow) { const [ax, ay] = tileArt(x, y, L); keepInView(ax, ay - 16); }
  TC.dirty = true; panels();
}
/* pick unit k (-1 for none): a unit yet to move shows its move range, with the actions window shut until it has
   moved; one that has moved but not acted opens its actions window */
function select(k) {
  if (k !== TC.sel) TC.from = null;
  TC.sel = k; TC.mode = null; TC.menu = false; TC.range = null; TC.reach = null; TC.dirty = true;
  if (k >= 0) {
    const c = ED.M.chars[k]; TC.note = '';
    if (battle.canMove(TC.battle, k)) setMode('move'); else if (battle.canAct(TC.battle, k)) openMenu();
    if (levelOf(c) > TC.top) setTop(levelOf(c));
    setCursor(c.x, c.y, levelOf(c)); const [ax, ay] = tileArt(c.x, c.y, levelOf(c)); lookAt(ax, ay - 20);
  }
  panels();
}
/* the picked unit's action: 'move' lights its move range, 'attack' what its attack reaches, null neither; choosing
   one shuts the actions window */
function setMode(m) {
  const k = TC.sel;
  if (k < 0 || (m === 'move' && !battle.canMove(TC.battle, k)) || (m === 'attack' && !battle.canAct(TC.battle, k))) m = null;
  if (m) TC.menu = false;
  TC.mode = m; TC.range = m === 'move' ? rangeOf(k) : null; TC.reach = m === 'attack' ? reachOf(k) : null; TC.dirty = true;
  panels();
}
/* open the picked unit's actions window, with nothing lit until an action is chosen */
function openMenu() { if (TC.sel < 0 || !battle.ready(TC.battle, TC.sel)) return; TC.menu = true; setMode(null); }
/* the walk unit k just made can still be taken back: nothing else has been done to the map since */
const canUndoMove = k => !!TC.from && TC.from.k === k && turnOf(k).moved && !turnOf(k).acted && ED.undo[ED.undo.length - 1] === TC.from.snap;
/* put the picked unit back where it stood before its walk, ready to move again */
function undoMove() {
  const k = TC.sel; if (!canUndoMove(k)) return false;
  undo(); TC.from = null; battle.unspend(TC.battle, k, 'moved'); rebuild();
  select(k); return true;
}
/* Esc or a right-click: one step back */
function back() {
  if (busy()) return true;
  const k = TC.sel; if (k < 0) return rewindWait();
  if (TC.mode === 'attack') openMenu();
  else if (TC.menu && !turnOf(k).moved) { TC.menu = false; setMode('move'); }
  else if (!(TC.menu && undoMove())) select(-1);
  return true;
}
/* how far unit k moves and climbs, and how far and in what pattern it strikes, come from its data (data/units/), looked up by its sprite */
function rangeOf(k) { const { move, jump } = unitFor(ED.M.chars[k].sprite).movement; return moveRange(ED.M, k, move, jump); }
function reachOf(k) { const { range, pattern } = statsOf(k); return attackReach(ED.M, k, range, pattern, j => battle.foes(TC.battle, k, j)); }
/* new numbers for the units (a save from the unit data page) redraw the picked unit's range and the panels */
onUnitsChange(() => {
  if (!TC.open) return;
  if (TC.battle) battle.refresh(TC.battle, rosterOf());
  if (TC.sel >= 0 && !busy()) setMode(TC.mode); panels();
});
const unitAt = (x, y, L) => (ED.M.chars || []).findIndex(c => c.x === x && c.y === y && levelOf(c) === L);

/* ---------- the battle (battle/state.js): sides, hit points, the turn and whose phase it is ---------- */
const statsOf = k => unitFor(ED.M.chars[k].sprite).stats;
const nameOf = k => { const c = ED.M.chars[k]; return characterById(c.sprite)?.name || c.sprite; };
/* every unit as the battle takes it: the side its group in the unit data fights on (characters against enemies),
   and its full hit points */
const rosterOf = () => (ED.M.chars || []).map(c => { const u = unitFor(c.sprite); return { side: battle.sideOfGroup(u.group), hp: u.stats.hp }; });
const hpOf = k => TC.battle.units[k].hp;
const alive = k => battle.alive(TC.battle, k);
const turnOf = k => TC.battle.units[k] || { moved: false, acted: false };
const done = k => battle.done(TC.battle, k);
/* the computer plays the enemy when there is a side of the player's for it to fight; on a map of enemies only, they
   are the player's to move */
const aiPlays = side => side === 'enemy' && TC.battle.sides.includes('player');
/* a walk or the computer's phase is under way: the controls wait */
const busy = () => !!TC.walk || !!TC.ai;
/* the banner across the top of the screen: a new phase for a moment, or the battle's end for good */
function banner(title, sub, kind, stay) {
  const el = $('tcPhase'); el.firstElementChild.textContent = title; el.lastElementChild.textContent = sub;
  el.dataset.kind = kind; el.hidden = false; TC.banner = { t: 0, stay };
}
/* after unit k's action: pick it again for what it has left, or put it down and pass play on once every unit of its
   side still standing is done. The computer's phase runs itself (aiStep). */
function finish(k) {
  if (TC.ai) return;
  if (!done(k)) { select(k); return; }
  select(-1);
  if (battle.phaseOver(TC.battle)) nextPhase();
}
/* pass play to the other side: a banner, and the computer takes over if the side is its own */
function nextPhase() {
  const r = battle.endPhase(TC.battle); if (!r) return;
  select(-1); TC.from = null; TC.rewind = null; TC.note = '';
  banner(`Turn ${r.turn}`, battle.SIDE_LABEL[r.phase], r.phase);
  if (aiPlays(r.phase)) TC.ai = { queue: battle.standing(TC.battle, r.phase), k: -1, step: null, plan: null, target: -1, t: BANNER_TIME * 0.8 };
  panels();
}
/* Restart (R): every unit back where it stood when the view opened, at full hit points, from the player's turn 1.
   The return to those places is one map edit, on the editor's undo stack like the walks. Mid-battle it asks first:
   the first press arms it ("Restart?") for RESTART_ARM seconds and a second press restarts; once the battle is won or
   lost one press does. */
function restart() {
  if (!TC.start) return;
  if (!TC.battle.outcome && !TC.armed) { TC.armed = setTimeout(disarm, RESTART_ARM * 1000); panels(); return; }
  disarm();
  TC.ai = null; TC.walk = null; TC.locked = false; TC.free = false; TC.pop = null; TC.from = null; TC.rewind = null; TC.note = '';
  const chars = structuredClone(TC.start);
  mutate(M => { const same = JSON.stringify(M.chars || []) === JSON.stringify(chars); M.chars = chars; return { changed: same ? 0 : 1 }; });
  rebuild(); TC.battle = battle.createBattle(rosterOf()); select(-1);
  if (TC.battle.sides.length) banner('Turn 1', battle.SIDE_LABEL[TC.battle.phase], TC.battle.phase); else { TC.banner = null; $('tcPhase').hidden = true; }
  panels();
}
function disarm() { if (TC.armed) clearTimeout(TC.armed); TC.armed = 0; if (TC.open && TC.battle) panels(); }
/* End turn (T): the player's side gives up whatever its units have left this phase */
function endTurn() { if (busy() || !TC.battle || TC.battle.outcome || !TC.battle.sides.length) return; nextPhase(); }
function attack(a, d) {
  const r = battle.strike(TC.battle, a, d, statsOf(a).attack); if (!r) return;
  TC.from = null; TC.rewind = null; TC.pop = { k: d, text: String(r.dmg), t: 0, from: r.from / r.max, to: r.to / r.max };
  const note = `${nameOf(a)} hits ${nameOf(d)} for ${r.dmg}${r.fell ? `. ${nameOf(d)} falls` : ''}`;
  const end = TC.battle.outcome;
  if (end) { TC.ai = null; select(-1); banner(battle.OUTCOME_LABEL[end], end === 'victory' ? 'Every enemy has fallen' : 'Every one of your units has fallen', end, true); }
  else finish(a);
  TC.note = note; panels();
}
/* Wait: the picked unit ends its part in the phase where it stands. Until anything else happens it can be taken back
   (Esc), with its walk still open to taking back too. */
function wait() {
  const k = TC.sel; if (k < 0 || busy()) return;
  const moved = turnOf(k).moved, from = TC.from; if (!battle.wait(TC.battle, k)) return;
  TC.rewind = { k, moved, from }; TC.from = null; finish(k);
  if (TC.rewind) { TC.note = `${nameOf(k)} waits · Esc to take it back`; panels(); }
}
/* Esc with no unit picked: take back the last Wait, opening that unit's actions window again */
function rewindWait() {
  const r = TC.rewind; TC.rewind = null;
  if (!r || !alive(r.k) || turnOf(r.k).side !== TC.battle.phase || TC.battle.outcome) return false;
  battle.unspend(TC.battle, r.k, 'acted'); if (!r.moved) battle.unspend(TC.battle, r.k, 'moved');
  select(r.k); TC.from = r.from; panels(); return true;
}
/* one step of the computer's phase, from the frame loop: each enemy in turn is picked (its move range showing), walks
   by its plan (battle/ai.js), aims (the red tiles showing) and strikes, or waits where it stands. When none is left
   play passes back to the player. */
function aiStep(dt) {
  const A = TC.ai; if (!A || TC.walk) return;
  A.t -= dt * (TC.fast ? 2 : 1); if (A.t > 0) return;
  const B = TC.battle, k = A.k;
  if (A.step === 'pick') {
    setMode(null); battle.spend(B, k, 'moved');
    if (A.plan.path.length) startWalk(k, A.plan.path);
    TC.from = null; A.step = 'arrive'; A.t = 0; return;
  }
  if (A.step === 'arrive') {
    /* strike the foe it planned for, or any other its attack now reaches */
    const targets = reachOf(k).targets, d = targets.includes(A.plan.target) ? A.plan.target : targets.length ? targets[0] : -1;
    if (d < 0) { battle.wait(B, k); TC.note = `${nameOf(k)} waits`; select(-1); A.step = null; A.t = AI_PAUSE.stay; panels(); return; }
    setMode('attack'); const c = ED.M.chars[d]; setCursor(c.x, c.y, levelOf(c));
    A.target = d; A.step = 'aim'; A.t = AI_PAUSE.aim; return;
  }
  if (A.step === 'aim') { const a = k, d = A.target; A.step = null; A.t = AI_PAUSE.after; select(-1); attack(a, d); return; }
  /* the next enemy still standing */
  let next; do next = A.queue.shift(); while (next !== undefined && !battle.ready(B, next));
  if (next === undefined) { TC.ai = null; nextPhase(); return; }
  const u = unitFor(ED.M.chars[next].sprite);
  A.k = next; A.step = 'pick'; A.t = AI_PAUSE.pick;
  A.plan = planTurn(ED.M, next, { ...u.movement, range: u.stats.range, pattern: u.stats.pattern, isFoe: j => battle.foes(B, next, j), hpOf });
  select(next);
}
/* Enter or a click on (x, y, L): strike the unit there if the picked unit is attacking and reaches it, pick up the
   unit there, send the picked unit there if it can reach it, or open its actions window where it stands if it is
   picked again */
function act(x, y, L) {
  if (busy()) return;
  let u = unitAt(x, y, L);
  if (TC.sel >= 0 && TC.reach && TC.reach.targets.includes(u)) { attack(TC.sel, u); return; }
  if (u >= 0 && !alive(u)) u = -1;
  if (u >= 0 && u !== TC.sel) { select(u); return; }
  if (TC.sel < 0) return;
  const k = TC.sel;
  if (TC.mode === 'move') {
    if (u === k) { openMenu(); return; }
    const path = routeTo(TC.range, placeId(ED.M, x, y, L));
    if (path && path.length) { if (startWalk(k, path)) battle.spend(TC.battle, k, 'moved'); } else select(-1);
  }
  /* off the red tiles, back to the actions window; with the window open a stray click leaves it be */
  else if (TC.mode === 'attack') openMenu();
  else if (!TC.menu) select(-1);
}
function setTop(L) { L = Math.max(0, Math.min(MAX_LEVEL, L)); if (L === TC.top) return; TC.top = L; rebuild(); if (TC.cursor) setCursor(TC.cursor.x, TC.cursor.y, Math.min(TC.cursor.L, L)); panels(); }
function turn(d) {
  const keep = TC.cursor; TC.rot = (TC.rot + d + 4) % 4; rebuild();
  if (keep) { const [ax, ay] = tileArt(keep.x, keep.y, keep.L); lookAt(ax, ay - 16, true); }
}

/* ---------- status windows ---------- */
function panels() {
  const M = ED.M, cur = TC.cursor;
  if (cur) {
    const u = cur.y * M.S + cur.x, T = cur.L ? TERRAIN[M.floors[cur.L - 1][u] - 1] : TERRAIN[M.terr[u]], piece = M.objs.find(o => (o.level || 0) === cur.L && cur.x >= o.x && cur.y >= o.y && cur.x < o.x + (o.face % 2 ? ASSET_BY_ID[o.id].d : ASSET_BY_ID[o.id].w) && cur.y < o.y + (o.face % 2 ? ASSET_BY_ID[o.id].w : ASSET_BY_ID[o.id].d));
    $('tcTile').innerHTML = `<b>${T.label}</b><span>${piece ? ASSET_BY_ID[piece.id].label + ' · ' : ''}h ${M.elev[u]}${cur.L ? ' · ' + LEVEL_NAME(cur.L) : ''}</span><span class="tc-xy">${cur.x}, ${cur.y}</span>`;
  }
  const k = TC.sel >= 0 ? TC.sel : cur ? unitAt(cur.x, cur.y, cur.L) : -1, box = $('tcUnit');
  box.hidden = k < 0;
  if (k >= 0) {
    const c = M.chars[k], s = characterById(c.sprite), f = $('tcFace'), fg = f.getContext('2d');
    fg.clearRect(0, 0, f.width, f.height); fg.imageSmoothingEnabled = false; if (s) fg.drawImage(portrait(s), 0, 0, f.width, f.height);
    $('tcUnitName').textContent = s ? s.name : c.sprite;
    const u = unitFor(c.sprite), st = u.stats, mv = u.movement;
    const pat = (PATTERNS.find(([id]) => id === st.pattern) || PATTERNS[0])[1], t = turnOf(k);
    const bar = $('tcUnitHp').firstElementChild, frac = hpOf(k) / Math.max(1, st.hp);
    bar.style.width = Math.round(100 * frac) + '%'; bar.className = frac > 0.5 ? '' : frac > 0.25 ? 'mid' : 'low';
    $('tcUnitInfo').textContent = `HP ${hpOf(k)}/${st.hp} · Attack ${st.attack} · ${st.pattern === 'melee' ? pat : `${pat} ${st.range}`}`;
    const off = t.side !== TC.battle.phase;
    $('tcUnitMove').textContent = `Move ${mv.move} · Jump ${mv.jump}${!alive(k) ? ' · fallen' : off ? '' : done(k) ? ' · done' : t.moved ? ' · moved' : t.acted ? ' · acted' : TC.sel === k ? ' · ready' : ''}`;
    box.dataset.side = t.side;
  }
  /* the actions window for the picked unit */
  const menu = $('tcMenu'), t = TC.sel >= 0 ? turnOf(TC.sel) : null;
  menu.hidden = !t || !TC.menu || busy();
  if (t) {
    $('tcActMove').disabled = !battle.canMove(TC.battle, TC.sel); $('tcActAttack').disabled = !battle.canAct(TC.battle, TC.sel);
    $('tcActMove').setAttribute('aria-pressed', String(TC.mode === 'move')); $('tcActAttack').setAttribute('aria-pressed', String(TC.mode === 'attack'));
  }
  /* the turn and whose phase it is, and End turn while the player can give it up */
  const B = TC.battle, sel = TC.sel, side = sel >= 0 ? turnOf(sel).side : null;
  $('tcTurn').hidden = !B.sides.length; $('tcTurn').dataset.kind = B.outcome || B.phase;
  $('tcTurnNo').textContent = `Turn ${B.turn}`; $('tcTurnSide').textContent = B.outcome ? battle.OUTCOME_LABEL[B.outcome] : battle.SIDE_LABEL[B.phase];
  $('tcEnd').disabled = busy() || !!B.outcome || !B.sides.length;
  $('tcRestart').disabled = !B.sides.length; $('tcRestart').textContent = TC.armed ? 'Restart?' : 'Restart'; $('tcRestart').setAttribute('aria-pressed', String(!!TC.armed));
  $('tcHint').textContent = TC.ai ? (TC.note || 'The enemy is on the move…')
    : TC.armed ? 'Press Restart (R) again to start the battle over'
    : B.outcome ? `${TC.note ? `${TC.note} · ${battle.OUTCOME_LABEL[B.outcome]}` : `${battle.OUTCOME_LABEL[B.outcome]}: the battle is over`} · R to restart`
    : TC.walk ? 'On the move…'
    : TC.mode === 'move' ? 'Pick a blue tile to move there, or the unit to stay put · Esc to cancel'
    : TC.mode === 'attack' ? (TC.reach.targets.length ? 'Pick a unit on a red tile to attack it · Esc to go back' : 'No one in reach · Esc to go back')
    : TC.menu ? (canUndoMove(TC.sel) ? 'Choose an action · Esc to take the move back' : 'Choose an action · Esc to go back')
    : sel >= 0 && alive(sel) && side !== B.phase ? (side === 'enemy' ? 'An enemy: it moves in the enemy phase' : 'One of yours: it moves in your phase')
    : sel >= 0 && done(sel) ? 'This unit is done for the turn · T to end the turn'
    : TC.note ? TC.note
    : (M.chars || []).length ? 'Click a unit or press Tab to pick one' : 'No one stands on this map: place characters in the editor first';
}

/* ---------- the frame ---------- */
let raf = 0;
function loop(now) {
  raf = 0; if (!TC.open) return;
  const dt = Math.min(0.1, (now - (TC.lastT || now)) / 1000); TC.lastT = now;
  if (TC.walk) {
    /* The camera rides along the walker's path on the ground, not its hops, and once it has caught up it holds the
       walker exactly where it is on screen: camera and figure land on the same whole pixel every frame, so neither
       shakes against the other. A drag lets go of the walker until the next walk. */
    const w = TC.walk; w.d += dt * WALK_SPEED * (TC.fast ? 2 : 1); const p = walkerPos(w), [X, Y] = viewPoint(S(), TC.rot, p.x, p.y), [ax, ay] = P(X, Y, p.rail);
    if (!TC.free) {
      if (TC.locked) { TC.cam.x = ax; TC.cam.y = ay - 20; TC.goal = null; TC.glide = null; }
      else { lookAt(ax, ay - 20); if (Math.abs(TC.cam.x - ax) < 1.5 && Math.abs(TC.cam.y - (ay - 20)) < 1.5) TC.locked = true; }
    }
    if (w.d >= w.pts.length - 1) { TC.walk = null; TC.locked = false; const k = w.k; TC.cam.x = ax; TC.cam.y = ay - 20; finish(k); }
    TC.dirty = true;
  }
  /* the computer's phase, a step at a time; a phase's banner shows for a moment, the battle's end stays */
  if (TC.ai) { aiStep(dt); TC.dirty = true; }
  if (TC.banner && !TC.banner.stay) { TC.banner.t += dt; if (TC.banner.t >= BANNER_TIME) { TC.banner = null; $('tcPhase').hidden = true; } }
  if (TC.goal && TC.glide) {
    const g = TC.glide, [gx, gy] = TC.goal; g.t += dt; const f = Math.min(1, g.t / g.dur), e = ease(f);
    TC.cam.x = g.from[0] + (gx - g.from[0]) * e; TC.cam.y = g.from[1] + (gy - g.from[1]) * e;
    if (f >= 1) { TC.cam.x = gx; TC.cam.y = gy; TC.goal = null; TC.glide = null; }
    TC.dirty = true;
  }
  /* the damage number over a struck unit rises and fades over a second; its health bar stays a little longer */
  if (TC.pop) { TC.pop.t += dt; if (TC.pop.t >= POP_TIME) TC.pop = null; TC.dirty = true; }
  /* water ripples and the cursor's bob tick over a few times a second */
  const tick = Math.floor(now / 220); if (tick !== TC.tick) { TC.tick = tick; TC.dirty = true; }
  if (TC.dirty) { TC.dirty = false; paint(); }
  raf = requestAnimationFrame(loop);
}
function paint() {
  /* While a unit walks the camera sits on whole art pixels, as every sprite does, so the ground and the figure walking
     across it move together a pixel at a time instead of the figure hopping against a ground that glides. Otherwise
     it moves by single screen pixels, so a glide is as smooth as the screen allows. */
  const k = scale(), W2 = cv.width, H2 = cv.height, snap = v => (TC.walk ? Math.round(v) : v);
  const tx = Math.round(W2 / 2 - snap(TC.cam.x) * k), ty = Math.round(H2 / 2 - snap(TC.cam.y) * k);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const bg = g.createLinearGradient(0, 0, 0, H2); bg.addColorStop(0, '#2c3a3c'); bg.addColorStop(0.55, '#172021'); bg.addColorStop(1, '#0e1414');
  g.fillStyle = bg; g.fillRect(0, 0, W2, H2);
  const view = [-tx / k, -ty / k, (W2 - tx) / k, (H2 - ty) / k], M = ED.M, marks = new Map();
  if (TC.range && !TC.walk) {
    for (const p of TC.range.values()) if (p.d && p.at[2] <= TC.top) marks.set(toViewU(p.at[0], p.at[1]) + ',' + p.at[2], 'move');
    const cur = TC.cursor, path = cur && routeTo(TC.range, placeId(M, cur.x, cur.y, cur.L));
    if (path) for (const [x, y, L] of path) marks.set(toViewU(x, y) + ',' + L, 'route');
  }
  if (TC.reach && !TC.walk) for (const [x, y, L] of TC.reach.cells) if (L <= TC.top) marks.set(toViewU(x, y) + ',' + L, 'target');
  let cursor = null;
  if (TC.cursor && !TC.walk) { const c = TC.cursor, u = toViewU(c.x, c.y); cursor = { u, L: c.L, z: TC.sc.zAt(u, c.L), unit: unitAt(c.x, c.y, c.L) >= 0 }; }
  TC.figs = figures();
  const focus = TC.figs.filter(f => f.k === TC.sel || (TC.walk && f.k === TC.walk.k)).map(f => { const [x, y] = P(f.X, f.Y, f.z); return { x, y, key: f.key }; });
  if (cursor) { const X = cursor.u % S(), Y = (cursor.u / S()) | 0, [x, y] = P(X + 0.5, Y + 0.5, cursor.z); focus.push({ x, y, key: X + Y + 1 }); }
  drawScene(g, TC.sc, k, tx, ty, view, { frame: TC.tick >> 1, tick: TC.tick >> 1, figs: TC.figs, marks, cursor, focus, ...TC.debug });
  TC.view = { k, tx, ty };
  g.setTransform(1, 0, 0, 1, 0, 0);
  placeMenu();
  const pf = TC.pop && TC.figs.find(f => f.k === TC.pop.k);
  if (pf) {
    /* a struck unit's health bar shows only while it is hit: it drains from the old HP to the new, then fades */
    const { t, from, to } = TC.pop, [x, y] = P(pf.X, pf.Y, pf.z), head = y - figureHeight(pf);
    const frac = from + (to - from) * ease(Math.max(0, Math.min(1, (t - 0.15) / 0.5))), w = 12, bx = Math.round(x - w / 2) * k + tx, by = Math.round(head - 4) * k + ty;
    g.globalAlpha = Math.max(0, Math.min(1, (POP_TIME - t) / 0.3));
    g.fillStyle = '#0b1011'; g.fillRect(bx - k, by - k, (w + 2) * k, 3 * k);
    g.fillStyle = '#3a2a24'; g.fillRect(bx, by, w * k, k);
    if (frac > 0) { g.fillStyle = frac > 0.5 ? '#7fc35a' : frac > 0.25 ? '#e4c24a' : '#d9553f'; g.fillRect(bx, by, Math.max(1, Math.round(w * frac)) * k, k); }
    const sx = Math.round(x * k + tx), sy = Math.round((head - 7 - 10 * Math.min(1, t)) * k + ty);
    g.globalAlpha = Math.max(0, Math.min(1, 3 * (1 - t))); g.font = `700 ${Math.round(9 * k)}px "Alegreya Sans", sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round';
    g.lineWidth = Math.max(2, Math.round(1.5 * k)); g.strokeStyle = '#0b1011'; g.strokeText(TC.pop.text, sx, sy); g.fillStyle = '#ffd2c4'; g.fillText(TC.pop.text, sx, sy);
    g.globalAlpha = 1; g.textAlign = 'start';
  }
}
/* the actions window stands beside the picked unit on screen: to its right, or its left near the screen's edge. Its
   type, and everything else in it (sized in em), scales with the zoom as the figures do: MENU_FONT at ×3, kept within
   MENU_SCALE so it stays legible zoomed out and does not swamp the screen zoomed in. */
function placeMenu() {
  const menu = $('tcMenu'), f = !menu.hidden && TC.figs.find(q => q.k === TC.sel); if (!f) return;
  const { k, tx, ty } = TC.view, d = state.dpr;
  menu.style.fontSize = (MENU_FONT * Math.max(MENU_SCALE[0], Math.min(MENU_SCALE[1], k / d / 3))).toFixed(1) + 'px';
  const [x, y] = P(f.X, f.Y, f.z), sx = (x * k + tx) / d, top = ((y - figureHeight(f)) * k + ty) / d, gap = 14 * k / d;
  const w = menu.offsetWidth, h = menu.offsetHeight, left = sx + gap + w + 8 > TC.cw ? sx - gap - w : sx + gap;
  menu.style.left = Math.round(Math.max(8, Math.min(TC.cw - w - 8, left))) + 'px';
  menu.style.top = Math.round(Math.max(64, Math.min(TC.ch - h - 40, top))) + 'px';
}
const req = () => { TC.dirty = true; if (!raf && TC.open) raf = requestAnimationFrame(loop); };

/* ---------- input ---------- */
function artAt(e) { const r = cv.getBoundingClientRect(), { k, tx, ty } = TC.view; return [((e.clientX - r.left) * state.dpr - tx) / k, ((e.clientY - r.top) * state.dpr - ty) / k]; }
/* the place under the pointer: a unit's figure first (front-most), else the tile top */
function placeAt(e) {
  const [wx, wy] = artAt(e);
  for (let i = (TC.figs || []).length - 1; i >= 0; i--) { const f = TC.figs[i]; if (figureHit(f, wx, wy)) { const c = ED.M.chars[f.k]; return [c.x, c.y, levelOf(c)]; } }
  const hit = pickTile(TC.sc, wx, wy); if (!hit) return null;
  const t = toModel(hit.u); return [t % S(), (t / S()) | 0, hit.L];
}
cv.addEventListener('pointerdown', e => { if (e.button !== 0) return; cv.setPointerCapture(e.pointerId); TC.drag = { x: e.clientX, y: e.clientY, cam: [TC.cam.x, TC.cam.y], moved: false }; });
cv.addEventListener('pointermove', e => {
  const d = TC.drag;
  if (d) {
    const k = scale() / state.dpr, dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.moved || Math.hypot(dx, dy) > 5) { d.moved = true; TC.goal = null; TC.glide = null; TC.free = !!TC.walk; TC.locked = false; TC.cam.x = d.cam[0] - dx / k; TC.cam.y = d.cam[1] - dy / k; TC.dirty = true; cv.style.cursor = 'grabbing'; }
    return;
  }
  const p = placeAt(e); if (p && (!TC.cursor || p[0] !== TC.cursor.x || p[1] !== TC.cursor.y || p[2] !== TC.cursor.L)) setCursor(p[0], p[1], p[2], false);
});
cv.addEventListener('pointerup', e => {
  const d = TC.drag; TC.drag = null; cv.style.cursor = ''; if (!d || d.moved) return;
  const p = placeAt(e); if (p) { setCursor(p[0], p[1], p[2], false); act(p[0], p[1], p[2]); }
});
/* a right-click steps back, as Esc does */
cv.addEventListener('contextmenu', e => { e.preventDefault(); if (back()) req(); });
cv.addEventListener('wheel', e => { e.preventDefault(); const i = ZOOMS.indexOf(TC.zoom); setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1)))]); }, { passive: false });
/* the arrow keys step along the grid as it is seen: up is up-right (view -y), right is down-right (view +x) */
const STEPS = { ArrowUp: [0, -1], w: [0, -1], ArrowRight: [1, 0], d: [1, 0], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0] };
function stepCursor([dx, dy]) {
  const c = TC.cursor || { x: 0, y: 0, L: 0 }, sz = S(), u = toViewU(c.x, c.y), X = Math.max(0, Math.min(sz - 1, u % sz + dx)), Y = Math.max(0, Math.min(sz - 1, ((u / sz) | 0) + dy)), t = TC.sc.back[Y * sz + X];
  setCursor(t % sz, (t / sz) | 0, c.L, true);
}
root.addEventListener('keydown', e => {
  if (!TC.open) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (STEPS[k]) stepCursor(STEPS[k]);
  else if (k === 'Enter' || k === ' ') { if (TC.cursor) act(TC.cursor.x, TC.cursor.y, TC.cursor.L); }
  else if (k === 'Tab') {
    /* the next unit still standing with something left to do this round */
    const n = (ED.M.chars || []).length;
    if (!busy()) for (let i = 1; i <= n; i++) { const j = (TC.sel + (e.shiftKey ? n * 2 - i : i) + n) % n; if (battle.ready(TC.battle, j)) { select(j); break; } }
  }
  else if (k === '1') { if (TC.sel >= 0 && !busy()) setMode('move'); }
  else if (k === '2') { if (TC.sel >= 0 && !busy()) setMode('attack'); }
  else if (k === '3') wait();
  else if (k === 't') endTurn();
  else if (k === 'r') restart();
  else if (k === 'Escape') back();
  else if (k === 'q' || k === '[') turn(-1); else if (k === 'e' || k === ']') turn(1);
  else if (k === '+' || k === '=') setZoom(TC.zoom + 1); else if (k === '-' || k === '_') setZoom(TC.zoom - 1);
  else if (k === 'f') setFast(!TC.fast);
  else if (k === 'PageUp') setTop(TC.top + 1); else if (k === 'PageDown') setTop(TC.top - 1);
  else return;
  e.preventDefault(); req();
});

/* ---------- open and close ---------- */
/* opts (for scene pages and scripts): zoom, a whole number of screen pixels to the art pixel; center, a model tile
   [x, y] to look at, or 'map' for the middle of the whole map */
function openTactical(opts = {}) {
  if (!ED.M) return;
  TC.open = true; root.hidden = false; TC.rot = ED.rot; TC.top = ED.level; TC.sel = -1; TC.walk = null; TC.range = null; TC.reach = null; TC.mode = null; TC.lastT = 0;
  TC.start = structuredClone(ED.M.chars || []); if (TC.armed) clearTimeout(TC.armed); TC.armed = 0;
  TC.battle = battle.createBattle(rosterOf()); TC.ai = null; TC.rewind = null; TC.pop = null; TC.note = ''; TC.banner = null; $('tcPhase').hidden = true;
  $('tcName').textContent = ED.M.name;
  size(); rebuild();
  /* a comfortable close-up: about a dozen tiles across */
  setZoom(Math.max(2, Math.min(5, Math.round(TC.cw / (13 * 32)))));
  const k0 = ED.sel >= 0 && ED.M.chars[ED.sel] ? ED.sel : (ED.M.chars || []).length ? 0 : -1;
  if (k0 >= 0) { const c = ED.M.chars[k0]; TC.top = Math.max(TC.top, levelOf(c)); rebuild(); select(k0); select(-1); setCursor(c.x, c.y, levelOf(c)); const [ax, ay] = tileArt(c.x, c.y, levelOf(c)); lookAt(ax, ay - 20, true); }
  else { const b = TC.bounds, m = Math.floor(S() / 2); setCursor(m, m, 0); lookAt((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, true); }
  if (opts.zoom) setZoom(opts.zoom);
  if (opts.center === 'map') { const b = TC.bounds; TC.cursor = null; lookAt((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, true); }
  else if (Array.isArray(opts.center)) { const [x, y] = opts.center; setCursor(x, y, 0); const [ax, ay] = tileArt(x, y, 0); lookAt(ax, ay - 16, true); }
  if (TC.battle.sides.length) banner('Turn 1', battle.SIDE_LABEL[TC.battle.phase], TC.battle.phase);
  panels(); root.focus({ preventScroll: true }); req();
}
function closeTactical() { if (!TC.open) return; TC.open = false; root.hidden = true; if (raf) cancelAnimationFrame(raf); raf = 0; TC.walk = null; TC.ai = null; $('edCanvas').focus({ preventScroll: true }); }

$('tcBack').addEventListener('click', closeTactical);
$('tcRotL').addEventListener('click', () => { turn(-1); req(); }); $('tcRotR').addEventListener('click', () => { turn(1); req(); });
$('tcFast').addEventListener('click', () => setFast(!TC.fast));
$('tcIn').addEventListener('click', () => { setZoom(TC.zoom + 1); req(); }); $('tcOut').addEventListener('click', () => { setZoom(TC.zoom - 1); req(); });
$('tcActMove').addEventListener('click', () => { setMode('move'); req(); root.focus({ preventScroll: true }); });
$('tcActAttack').addEventListener('click', () => { setMode('attack'); req(); root.focus({ preventScroll: true }); });
$('tcActWait').addEventListener('click', () => { wait(); req(); root.focus({ preventScroll: true }); });
$('tcEnd').addEventListener('click', () => { endTurn(); req(); root.focus({ preventScroll: true }); });
$('tcRestart').addEventListener('click', () => { restart(); req(); root.focus({ preventScroll: true }); });
$('editor').addEventListener('keydown', e => { if (ED.open && !TC.open && (e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { e.preventDefault(); openTactical(); } });
new ResizeObserver(() => { if (TC.open) { size(); req(); } }).observe(root);
/* test hook: the camera, cursor and units as the view has them */
window.__tactical = { state: TC, setFast, open: openTactical, close: closeTactical, isOpen: () => TC.open, act, back, endTurn, restart, select, setCursor, setMode, turn, undoMove, wait };

export { closeTactical, openTactical };
