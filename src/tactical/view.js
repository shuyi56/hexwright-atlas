import { characterById } from '../characters/library.js';
import { FACES } from '../characters/draw.js';
import { WALK, attackOf } from '../characters/roster.js';
import { ED, LEVEL_NAME, mutate, undo } from '../editor/editor.js';
import { MAX_LEVEL, levelOf } from '../editor/model.ts';
import { walkChar } from '../editor/walk.js';
import { ASSET_BY_ID, TERRAIN } from '../tiles/index.js';
import { $, state } from '../ui/state.js';
import { moveRange, placeId, routeTo } from './move.js';
import '../data/unit-files.js';
import '../data/skill-files.js';
import { onSkillsChange } from '../data/skills.ts';
import { PATTERNS, onUnitsChange, unitFor } from '../data/units.ts';
import { attackReach } from './attack.js';
import { blowAt, blowPlan, faceToward } from './blow.js';
import { abilityFx, createFx, drawFx, emit, stepFx } from './particles.js';
import { planTurn } from '../battle/ai.js';
import { abilityOf } from '../battle/abilities.ts';
import * as battle from '../battle/state.ts';
import { drawScene, figureHeight, figureHit, portrait } from './render.js';
import { P, bounds, buildScene, pickTile, viewOf, viewPoint } from './scene.js';

/* ================= tactical view: the screen =================
   The editor's map seen through a tactics game's camera: zoomed in close, whole-pixel scaling, the camera gliding
   after the cursor and the unit on the move. Pick a unit (click it, Enter on it, or Tab through them) and its move
   range lights up in blue; the route to the tile under the cursor is traced in gold; click a lit tile (or Enter)
   and it walks there, hopping up and down ledges, while the camera follows. Moves are edits of the map, on the
   editor's undo stack. Once it has arrived (or been picked again to stay where it is) its actions window opens on
   top of its portrait, as in the tactics games: Move, Attack (its pattern and range light up in red; pick a unit of
   the other side there for an attack preview, its portrait, the chance the blow lands and the hit points it would
   take flashing on its health bar, then pick it again, press Enter or Strike to strike it), its ability if it has
   one (battle/abilities.ts: spending MP, aimed as an attack is, or at one of its own side in green for a heal) and
   Wait. The portrait window shows only the unit's name, its HP and MP bars and the six numbers it fights with; the
   preview, the target's HP bar as the blow would leave it, the numbers that bear on the blow, and tags for the
   damage, the chance to hit and the chance of a critical hit. Esc or a right-click
   steps back: from a target picked to the red tiles, from the red tiles to the window, from the window to the move
   (taking the move back if it walked), from the move to no unit, and with no
   unit picked it takes back the last Wait, until anything else is done. Esc never leaves the view (← Editor does). An
   attack plays out (tactical/blow.js): the attacker turns to its target, winds up and strikes in its own frames
   (characters/roster.js), lunging in for a blow, loosing an arrow or casting a spell, and the target flashes and
   reels when it lands, then shows its health bar over its head for a moment, draining; a unit felled fades to a
   ghost; a blow that misses shows Miss, and the target sways out of its way; a critical hit's damage rises larger,
   in gold. An ability brings its own particles (tactical/particles.js): they gather on the user as it winds up and
   burst over the target as the blow lands. Units keep facing the way they last struck until they walk again. The fight is kept by battle/state.ts: a turn is
   the player's phase and then the enemy's, each unit of the side in play moves once and acts once, and the phase
   passes when every one of them is done or End turn (T) is pressed, with a banner for each new phase. In the enemy
   phase the computer plays each enemy in turn (battle/ai.js), showing its range, walking and striking, while the
   controls wait. Hit points are the battle's, not the map's: they start full each time the view opens, and a unit
   brought to 0 stays where it fell, faded; the last enemy falling wins the battle, the last of yours loses it. Arrow keys or WASD move the cursor a tile at a time along the grid, Q and E turn the view,
   + and - zoom, PgUp / PgDn change storey, Esc steps back. */
const root = $('tactical'), cv = $('tcCanvas'), g = cv.getContext('2d');
/* TC.debug: drawing options passed straight to drawScene (e.g. { depth: false } or { xray: false }), for checking
   what an overlay changes */
const TC = { open: false, sc: null, rot: 0, top: 0, zoom: 3, cam: { x: 0, y: 0 }, goal: null, cursor: null, sel: -1, mode: null, menu: false, aim: -1, from: null, range: null, reach: null, battle: null, ai: null, banner: null, rewind: null, start: null, armed: 0, pop: null, fx: createFx(), note: '', walk: null, blow: null, turned: new Map(), fast: false, cw: 0, ch: 0, dirty: true, drag: null, lastT: 0, tick: 0 };
/* WALK_SPEED tiles a second (doubled while TC.fast, the 2× chip or F); STRIDES beats of the walk (WALK: stride, upright, stride, upright) to a tile, so a step
   covers one tile, as it would on foot, and the arms swing at the pace the figure moves */
const ZOOMS = [1, 2, 3, 4, 5, 6], WALK_SPEED = 4.2, STRIDES = 2, POP_TIME = 1.6;
/* the colours of the number over a struck unit, top and bottom: damage, healing, a miss, a critical hit */
const POP_INK = { hurt: ['#fff1e8', '#ff7a52'], heal: ['#f0fff0', '#4fcf6e'], miss: ['#f0ece0', '#9c9686'], crit: ['#fffbe0', '#ffaa1c'] };
/* how long a phase's banner shows, and the computer's pauses between showing an enemy's range, walking, aiming and
   striking (all halved by the 2× chip); after a strike it pauses once the blow has played out, while the damage still
   shows */
const RESTART_ARM = 3;
const BANNER_TIME = 1.5, AI_PAUSE = { pick: 0.45, aim: 0.5, after: 0.6, stay: 0.3 };

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
  TC.walk = { k, pts: [start, ...path.map(([x, y, L]) => ptOf(x, y, L || 0))], d: 0 }; TC.locked = false; TC.free = false; TC.rewind = null; TC.turned.delete(k);
  /* the map as it was before the walk, for taking the move back from the actions window */
  TC.from = { k, snap: ED.undo[ED.undo.length - 1] };
  TC.range = null; rebuild();
  return true;
}

/* ---------- figures for the scene ---------- */
function figures() {
  const M = ED.M, out = [], sz = S(), b = TC.blow, now = b && blowAt(b.plan, b.t);
  /* the way from the attacker to its target on screen, in view tiles, for the lunge and the knockback */
  const toward = b && (() => { const [ax, ay] = viewPoint(sz, TC.rot, M.chars[b.a].x + 0.5, M.chars[b.a].y + 0.5), [dx, dy] = viewPoint(sz, TC.rot, M.chars[b.d].x + 0.5, M.chars[b.d].y + 0.5), n = Math.hypot(dx - ax, dy - ay) || 1; return [(dx - ax) / n, (dy - ay) / n]; })();
  (M.chars || []).forEach((c, k) => {
    const w = TC.walk && TC.walk.k === k ? TC.walk : null, p = w ? walkerPos(w) : Object.assign(ptOf(c.x, c.y, levelOf(c)), { face: TC.turned.get(k) ?? c.face, ground: zAt(c.x, c.y, levelOf(c)) });
    const L = w ? p.L : levelOf(c); if (L > TC.top) return;
    let [X, Y] = viewPoint(sz, TC.rot, p.x, p.y);
    /* the nearer of the two tiles it is stepping between decides when it is drawn */
    const keyOf = q => { const [a, b] = viewPoint(sz, TC.rot, Math.floor(q.x) + 0.5, Math.floor(q.y) + 0.5); return a + b; };
    const key = w && p.seg ? Math.max(keyOf(p.seg[0]), keyOf(p.seg[1])) : keyOf(p);
    const f = { key, lv: L, pri: 2, X, Y, z: p.z, ground: p.ground ?? p.z, c: characterById(c.sprite) || characterById('villager'), k, face: FACES[(p.face + 3 * TC.rot) % 4], pose: w ? WALK[Math.floor(w.d * STRIDES) % WALK.length] : 0, ghost: !alive(k) };
    /* in an attack, the attacker in its frames lunging at the target, and the target reeling, flashing and fading */
    if (b && k === b.a) { f.pose = now.pose; X += toward[0] * now.lunge; Y += toward[1] * now.lunge; }
    if (b && k === b.d && !b.r.heal) { X += toward[0] * now.knock; Y += toward[1] * now.knock; f.flash = now.flash; f.ghost = false; if (b.plan.fell) f.alpha = now.alpha; }
    if (b && k === b.d && b.r.heal) f.flash = now.flash;
    f.X = X; f.Y = Y; out.push(f);
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
/* the picked unit's action: 'move' lights its move range, 'attack' what its attack reaches, 'ability' what its
   ability reaches (if it has one and the MP for it), null none; choosing one shuts the actions window */
function setMode(m) {
  const k = TC.sel;
  if (k < 0 || (m === 'move' && !battle.canMove(TC.battle, k)) || (m === 'attack' && !battle.canAct(TC.battle, k))
    || (m === 'ability' && !(battle.canAct(TC.battle, k) && abilityIdOf(k) && battle.canAfford(TC.battle, k, abilityIdOf(k))))) m = null;
  if (m) TC.menu = false;
  TC.mode = m; TC.aim = -1; TC.range = m === 'move' ? rangeOf(k) : null; TC.reach = m === 'attack' || m === 'ability' ? reachOf(k, actIdOf(k)) : null; TC.dirty = true;
  panels();
}
/* the action the picked unit is aiming: its ability in the 'ability' mode, else its attack */
const actIdOf = k => (TC.mode === 'ability' && k === TC.sel && abilityIdOf(k)) || 'attack';
const actOf = k => battle.actionOf(TC.battle, k, actIdOf(k)) || battle.actionOf(TC.battle, k);
const aiming = () => TC.mode === 'attack' || TC.mode === 'ability';
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
  if (aiming() && TC.aim >= 0) { TC.aim = -1; panels(); }
  else if (aiming()) openMenu();
  else if (TC.menu && !turnOf(k).moved) { TC.menu = false; setMode('move'); }
  else if (!(TC.menu && undoMove())) select(-1);
  return true;
}
/* how far unit k moves and climbs, and how far and in what pattern it strikes, come from its data (data/units/), looked up by its sprite */
function rangeOf(k) { const { move, jump } = unitFor(ED.M.chars[k].sprite).movement; return moveRange(ED.M, k, move, jump); }
function reachOf(k, act = 'attack') { const { range, pattern } = statsOf(k); return attackReach(ED.M, k, range, pattern, j => battle.canTarget(TC.battle, k, j, act)); }
/* new numbers for the units (a save from the unit data page) redraw the picked unit's range and the panels */
function retune() {
  if (!TC.open) return;
  if (TC.battle) battle.refresh(TC.battle, rosterOf());
  if (TC.sel >= 0 && !busy()) setMode(TC.mode); panels();
}
onUnitsChange(retune);
/* and new numbers for a skill (a save from the skill editor) the same way: the battle looks abilities up as it goes */
onSkillsChange(retune);
const unitAt = (x, y, L) => (ED.M.chars || []).findIndex(c => c.x === x && c.y === y && levelOf(c) === L);

/* ---------- the battle (battle/state.ts): sides, hit points, the turn and whose phase it is ---------- */
const statsOf = k => unitFor(ED.M.chars[k].sprite).stats;
const nameOf = k => { const c = ED.M.chars[k]; return characterById(c.sprite)?.name || c.sprite; };
/* every unit as the battle takes it: the side its group in the unit data fights on (characters against enemies),
   its full hit points and MP, the numbers it fights with and its ability */
const rosterOf = () => (ED.M.chars || []).map(c => {
  const u = unitFor(c.sprite), { hp, mp, attack, defense, accuracy, evasion, crit, critDamage, ability } = u.stats;
  return { side: u.side, hp, mp, attack, defense, accuracy, evasion, crit, critDamage, ability: abilityOf(ability) ? ability : null };
});
/* unit k's ability id, null for none */
const abilityIdOf = k => (TC.battle.units[k] && TC.battle.units[k].ability) || null;
const hpOf = k => TC.battle.units[k].hp;
/* the hit points a unit shows: the battle has them already lowered by a blow still on its way */
const shownHp = k => (TC.blow && !TC.blow.hit && TC.blow.d === k ? TC.blow.r.from : hpOf(k));
const alive = k => battle.alive(TC.battle, k);
const turnOf = k => TC.battle.units[k] || { moved: false, acted: false };
const done = k => battle.done(TC.battle, k);
/* the computer plays the enemy when there is a side of the player's for it to fight; on a map of enemies only, they
   are the player's to move */
const aiPlays = side => side === 'enemy' && TC.battle.sides.includes('player');
/* a walk, an attack or the computer's phase is under way: the controls wait */
const busy = () => !!TC.walk || !!TC.blow || !!TC.ai;
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
  TC.ai = null; TC.walk = null; TC.blow = null; TC.fx = createFx(); TC.turned.clear(); TC.locked = false; TC.free = false; TC.pop = null; TC.from = null; TC.rewind = null; TC.note = '';
  const chars = structuredClone(TC.start);
  mutate(M => { const same = JSON.stringify(M.chars || []) === JSON.stringify(chars); M.chars = chars; return { changed: same ? 0 : 1 }; });
  rebuild(); TC.battle = battle.createBattle(rosterOf()); select(-1);
  if (TC.battle.sides.length) banner('Turn 1', battle.SIDE_LABEL[TC.battle.phase], TC.battle.phase); else { TC.banner = null; $('tcPhase').hidden = true; }
  panels();
}
function disarm() { if (TC.armed) clearTimeout(TC.armed); TC.armed = 0; if (TC.open && TC.battle) panels(); }
/* End turn (T): the player's side gives up whatever its units have left this phase */
function endTurn() { if (busy() || !TC.battle || TC.battle.outcome || !TC.battle.sides.length) return; nextPhase(); }
/* Unit a strikes unit d with action `act` (its attack or its ability). The battle takes the blow at once, rolling
   whether it lands; the screen plays it (tactical/blow.js): a turns to face d and attacks in its own way (a heal is
   cast as a spell in green, whatever the healer holds), and the damage, the healing or the miss shows when the blow
   lands (land). Once it has played out (settle) play goes on as after any action. */
const HEAL_TINT = '#8fe39a';
function attack(a, d, act = 'attack') {
  const r = battle.strike(TC.battle, a, d, act); if (!r) return;
  const A = ED.M.chars[a], D = ED.M.chars[d], own = attackOf(characterById(A.sprite) || characterById('villager'));
  const ab = battle.actionOf(TC.battle, a, act), base = r.heal ? { ...own, kind: 'cast', ranged: 'spell', tint: HEAL_TINT } : own;
  /* a skill with a colour of its own (data/skills/) lends it to the blow as well as to its particles */
  const how = ab.fx.tint ? { ...base, tint: ab.fx.tint } : base, name = ab.label;
  TC.from = null; TC.rewind = null; TC.pop = null; TC.menu = false; TC.note = act === 'attack' ? `${nameOf(a)} attacks ${nameOf(d)}` : `${nameOf(a)} uses ${name} on ${nameOf(d)}`; setMode(null);
  TC.turned.set(a, faceToward([A.x, A.y], [D.x, D.y]));
  TC.blow = { a, d, r, how, act, fx: ab.fx, plan: blowPlan(how, Math.hypot(D.x - A.x, D.y - A.y), r.fell, !r.landed), t: 0, hit: false };
  /* an ability gathers itself on the user as it winds up (tactical/particles.js) */
  if (act !== 'attack') { const ends = fxEnds(a, d); if (ends) { TC.blow.ends = ends; emit(TC.fx, abilityFx(ab.fx, 'charge', ends[0], ends[1], { tint: how.tint })); } }
  /* both in sight: the camera eases over to take in the target as well */
  const [ax, ay] = tileArt(A.x, A.y, levelOf(A)), [dx, dy] = tileArt(D.x, D.y, levelOf(D)); keepInView((ax + dx) / 2, (ay + dy) / 2 - 16);
  panels();
}
/* the chests of units a and d in art pixels, where an ability's particles start and land; null if either is not
   drawn */
function fxEnds(a, d) {
  const fa = (TC.figs || []).find(f => f.k === a), fd = (TC.figs || []).find(f => f.k === d); if (!fa || !fd) return null;
  const chest = f => { const [x, y] = P(f.X, f.Y, f.z); return [x, y - 13]; };
  return [chest(fa), chest(fd)];
}
/* the blow lands: the damage rises over the target and its health bar drains, the healing rises in green and the
   bar fills, or Miss rises and the bar stays; an ability bursts over the target (or fizzles, missing) */
function land(b) {
  const { a, d, r } = b; b.hit = true;
  if (b.ends) emit(TC.fx, abilityFx(b.fx, r.landed ? 'impact' : 'fizzle', b.ends[0], b.ends[1], { tint: b.how.tint }));
  TC.pop = { k: d, text: !r.landed ? 'Miss' : r.heal ? `+${r.amount}` : r.critical ? `${r.amount}!` : String(r.amount), kind: !r.landed ? 'miss' : r.heal ? 'heal' : r.critical ? 'crit' : 'hurt', share: r.landed ? r.amount / r.max : 0, t: 0, from: r.from / r.max, to: r.to / r.max };
  TC.note = !r.landed ? `${nameOf(a)} misses ${nameOf(d)}` : r.heal ? `${nameOf(a)} heals ${nameOf(d)} for ${r.amount}`
    : `${r.critical ? 'Critical! ' : ''}${nameOf(a)} hits ${nameOf(d)} for ${r.amount}${r.fell ? `. ${nameOf(d)} falls` : ''}`;
  panels();
}
/* the attack has played out: the battle's end, or play goes on */
function settle(b) {
  TC.blow = null;
  const end = TC.battle.outcome, note = TC.note;
  if (end) { TC.ai = null; select(-1); banner(battle.OUTCOME_LABEL[end], end === 'victory' ? 'Every enemy has fallen' : 'Every one of your units has fallen', end, true); }
  else finish(b.a);
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
  const A = TC.ai; if (!A || TC.walk || TC.blow) return;
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
    /* its ability when it does harm and it has the MP for it, else a plain attack */
    const ab = abilityOf(abilityIdOf(k)); A.act = ab && !ab.heal && battle.canAfford(B, k, ab.id) ? ab.id : 'attack';
    setMode(A.act === 'attack' ? 'attack' : 'ability'); TC.aim = d; const c = ED.M.chars[d]; setCursor(c.x, c.y, levelOf(c));
    A.target = d; A.step = 'aim'; A.t = AI_PAUSE.aim; return;
  }
  if (A.step === 'aim') { const a = k, d = A.target; A.step = null; A.t = AI_PAUSE.after; select(-1); attack(a, d, A.act); return; }
  /* the next enemy still standing */
  let next; do next = A.queue.shift(); while (next !== undefined && !battle.ready(B, next));
  if (next === undefined) { TC.ai = null; nextPhase(); return; }
  const u = unitFor(ED.M.chars[next].sprite);
  A.k = next; A.step = 'pick'; A.t = AI_PAUSE.pick;
  A.plan = planTurn(ED.M, next, { ...u.movement, range: u.stats.range, pattern: u.stats.pattern, isFoe: j => battle.foes(B, next, j), hpOf });
  select(next);
}
/* in the attack, a pick of unit d on the red tiles: the first opens the attack preview on it, a second strikes */
function aimAt(d) {
  if (TC.aim === d) { attack(TC.sel, d, actIdOf(TC.sel)); return; }
  TC.aim = d; TC.dirty = true; panels();
}
/* Enter or a click on (x, y, L): preview a strike on the unit there (striking it if it was already previewed) if the picked unit is attacking and reaches it, pick up the
   unit there, send the picked unit there if it can reach it, or open its actions window where it stands if it is
   picked again */
function act(x, y, L) {
  if (busy()) return;
  let u = unitAt(x, y, L);
  if (TC.sel >= 0 && TC.reach && TC.reach.targets.includes(u)) { aimAt(u); return; }
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
  else if (aiming()) openMenu();
  else if (!TC.menu) select(-1);
}
function setTop(L) { L = Math.max(0, Math.min(MAX_LEVEL, L)); if (L === TC.top) return; TC.top = L; rebuild(); if (TC.cursor) setCursor(TC.cursor.x, TC.cursor.y, Math.min(TC.cursor.L, L)); panels(); }
function turn(d) {
  const keep = TC.cursor; TC.rot = (TC.rot + d + 4) % 4; rebuild();
  if (keep) { const [ax, ay] = tileArt(keep.x, keep.y, keep.L); lookAt(ax, ay - 16, true); }
}

/* ---------- status windows ---------- */
/* a bar (an HP or MP meter: a span holding an i) filled to v of max, an HP bar turning amber then red as it runs low */
function meter(el, v, max, hp) {
  const frac = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0, bar = el.firstElementChild;
  bar.style.width = (100 * frac).toFixed(1) + '%'; bar.className = !hp || frac > 0.5 ? '' : frac > 0.25 ? 'mid' : 'low';
}
/* the numbers a unit fights with, as labelled cells (all six, or just those in keys) */
const STAT_CELLS = [['attack', 'Atk', 'Attack: the damage its blows deal'], ['defense', 'Def', 'Defense: every 20 halves the damage it takes'], ['accuracy', 'Acc', 'Accuracy: its chance to hit, less the target\'s Evasion'],
  ['evasion', 'Eva', 'Evasion: taken off the attacker\'s Accuracy'], ['crit', 'Crt', 'Crit: the percent of its hits that are critical'], ['critDamage', 'C.Dmg', 'Crit Damage: what a critical hit deals, as a percent of a plain one']];
function statCells(el, st, keys) {
  el.innerHTML = STAT_CELLS.filter(([key]) => !keys || keys.includes(key)).map(([key, label, tip]) => `<div title="${esc(tip)}"><dt>${label}</dt><dd>${st[key]}</dd></div>`).join('');
}
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* a unit's attack pattern and range in words: Melee, Line 2, Ranged 4 */
const reachText = st => { const pat = (PATTERNS.find(([id]) => id === st.pattern) || PATTERNS[0])[1]; return st.pattern === 'melee' ? pat : `${pat} ${st.range}`; };
/* a character's portrait into a window's canvas, in whole pixels */
function drawFace(f, s) { const fg = f.getContext('2d'); fg.clearRect(0, 0, f.width, f.height); fg.imageSmoothingEnabled = false; if (s) fg.drawImage(portrait(s), 0, 0, f.width, f.height); }
function panels() {
  const M = ED.M, cur = TC.cursor;
  if (cur) {
    const u = cur.y * M.S + cur.x, T = cur.L ? TERRAIN[M.floors[cur.L - 1][u] - 1] : TERRAIN[M.terr[u]], piece = M.objs.find(o => (o.level || 0) === cur.L && cur.x >= o.x && cur.y >= o.y && cur.x < o.x + (o.face % 2 ? ASSET_BY_ID[o.id].d : ASSET_BY_ID[o.id].w) && cur.y < o.y + (o.face % 2 ? ASSET_BY_ID[o.id].w : ASSET_BY_ID[o.id].d));
    $('tcTile').innerHTML = `<b>${T.label}</b><span>${piece ? ASSET_BY_ID[piece.id].label + ' · ' : ''}h ${M.elev[u]}${cur.L ? ' · ' + LEVEL_NAME(cur.L) : ''}</span><span class="tc-xy">${cur.x}, ${cur.y}</span>`;
  }
  const k = TC.sel >= 0 ? TC.sel : cur ? unitAt(cur.x, cur.y, cur.L) : -1, box = $('tcUnit');
  box.hidden = k < 0;
  if (k >= 0) {
    const c = M.chars[k], s = characterById(c.sprite), st = unitFor(c.sprite).stats, t = turnOf(k), bu = TC.battle.units[k];
    drawFace($('tcFace'), s);
    $('tcUnitName').textContent = s ? s.name : c.sprite;
    const hp = shownHp(k), max = bu ? bu.max : st.hp, mp = bu ? bu.mp : st.mp, mpMax = bu ? bu.mpMax : st.mp;
    meter($('tcUnitHp'), hp, max, true); $('tcUnitHpText').textContent = `${hp}/${max}`;
    meter($('tcUnitMp'), mp, mpMax); $('tcUnitMpText').textContent = `${mp}/${mpMax}`;
    $('tcUnitMp').parentElement.classList.toggle('none', !mpMax);
    statCells($('tcUnitStats'), st);
    box.dataset.side = t.side;
  }
  /* the actions window for the picked unit */
  const menu = $('tcMenu'), t = TC.sel >= 0 ? turnOf(TC.sel) : null;
  menu.hidden = !t || !TC.menu || busy();
  if (t) {
    const canMove = battle.canMove(TC.battle, TC.sel), canAct = battle.canAct(TC.battle, TC.sel), c = M.chars[TC.sel], s = characterById(c.sprite), u = unitFor(c.sprite), st = u.stats, mv = u.movement;
    const abId = abilityIdOf(TC.sel), ab = abilityOf(abId), afford = !!ab && battle.canAfford(TC.battle, TC.sel, abId);
    $('tcActMove').disabled = !canMove; $('tcActAttack').disabled = !canAct;
    $('tcActAbility').hidden = !ab; $('tcActAbility').disabled = !canAct || !afford;
    $('tcMenuWho').textContent = s ? s.name : c.sprite;
    $('tcActMoveInfo').textContent = canMove ? `Up to ${mv.move} tiles · jump ${mv.jump}` : 'Already moved';
    $('tcActAttackInfo').textContent = canAct ? `${st.attack} power · ${reachText(st)}` : 'Already acted';
    if (ab) {
      $('tcActAbilityName').textContent = ab.label;
      $('tcActAbilityInfo').textContent = !canAct ? 'Already acted' : !afford ? `Needs ${ab.cost} MP · has ${TC.battle.units[TC.sel].mp}` : `${ab.cost} MP · ${ab.note}`;
      $('tcActAbility').dataset.kind = ab.heal ? 'heal' : 'harm';
    }
    $('tcActWaitInfo').textContent = 'End this unit\'s turn';
    $('tcActMove').setAttribute('aria-pressed', String(TC.mode === 'move')); $('tcActAttack').setAttribute('aria-pressed', String(TC.mode === 'attack')); $('tcActAbility').setAttribute('aria-pressed', String(TC.mode === 'ability'));
  }
  /* the preview: the target's portrait, the chance the blow lands, and what it would take off (or put back on) its hit
     points, flashing on its bar */
  const aim = $('tcAim'), d = TC.aim, act = TC.sel >= 0 ? actIdOf(TC.sel) : 'attack', r = d >= 0 && TC.sel >= 0 && !TC.walk && !TC.blow ? battle.forecast(TC.battle, TC.sel, d, act) : null;
  aim.hidden = !r; $('tcDock').classList.toggle('clash', !!r);
  $('tcAimGo').hidden = !r;
  if (r) {
    drawFace($('tcAimFace'), characterById(M.chars[d].sprite));
    $('tcAimName').textContent = nameOf(d); aim.dataset.side = turnOf(d).side; aim.dataset.kind = r.heal ? 'heal' : 'harm';
    $('tcAimDmg').textContent = r.heal ? `+${r.amount}` : `−${r.amount}${r.fell ? ' KO' : ''}`; $('tcAimDmg').title = r.fell ? 'A hit fells it' : '';
    $('tcAimHit').textContent = r.heal ? 'sure' : `${r.chance}%`; $('tcAimHit').title = r.heal ? 'A heal always lands' : `${r.chance}% chance to hit`;
    $('tcAimHit').dataset.odds = r.chance >= 80 ? 'good' : r.chance >= 50 ? 'fair' : 'poor';
    $('tcAimCrit').hidden = !r.crit; $('tcAimCrit').textContent = `✦ ${r.crit}%`;
    $('tcAimCrit').title = `${r.crit}% chance of a critical hit for ${r.critAmount}${r.critTo === 0 && !r.fell ? ', which fells it' : ''}`;
    const bar = $('tcAimHp'), lo = Math.min(r.from, r.to) / r.max, hi = Math.max(r.from, r.to) / r.max, ds = statsOf(d);
    bar.firstElementChild.style.width = (100 * lo).toFixed(1) + '%'; bar.firstElementChild.className = (r.heal ? r.to / r.max : lo) > 0.5 ? '' : (r.heal ? r.to / r.max : lo) > 0.25 ? 'mid' : 'low';
    bar.lastElementChild.style.left = (100 * lo).toFixed(1) + '%'; bar.lastElementChild.style.width = (100 * (hi - lo)).toFixed(1) + '%';
    $('tcAimHpText').innerHTML = `<strong>${r.to}</strong>/${r.max}`;
    statCells($('tcAimStats'), ds, r.heal ? ['attack', 'defense'] : ['defense', 'evasion']);
    $('tcAimGoLabel').textContent = act === 'attack' ? 'Strike' : battle.actionOf(TC.battle, TC.sel, act).label;
    $('tcAimGo').disabled = !!TC.ai;
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
    : TC.blow ? TC.note
    : TC.mode === 'move' ? 'Pick a blue tile to move there, or the unit to stay put · Esc to cancel'
    : TC.mode === 'attack' && TC.aim >= 0 ? `Pick ${nameOf(TC.aim)} again, press Enter or Strike to attack · Esc to choose another`
    : TC.mode === 'attack' ? (TC.reach.targets.length ? 'Pick a unit on a red tile to preview the attack · Esc to go back' : 'No one in reach · Esc to go back')
    : TC.mode === 'ability' && TC.aim >= 0 ? `Pick ${nameOf(TC.aim)} again or press Enter to use ${actOf(TC.sel).label} · Esc to choose another`
    : TC.mode === 'ability' ? (TC.reach.targets.length ? `Pick a unit on a ${actOf(TC.sel).heal ? 'green' : 'red'} tile for ${actOf(TC.sel).label} · Esc to go back` : `No one in reach of ${actOf(TC.sel).label} · Esc to go back`)
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
  /* an attack plays out, landing part way */
  if (TC.blow) {
    const b = TC.blow; b.t += dt * (TC.fast ? 2 : 1);
    if (!b.hit && b.t >= b.plan.impact) land(b);
    if (b.t >= b.plan.end) settle(b);
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
  /* an ability's particles fly on, at the attack's speed */
  if (TC.fx.parts.length) { stepFx(TC.fx, dt * (TC.fast ? 2 : 1)); TC.dirty = true; }
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
  if (TC.reach && !TC.walk) { const m = actOf(TC.sel).heal ? 'heal' : 'target'; for (const [x, y, L] of TC.reach.cells) if (L <= TC.top) marks.set(toViewU(x, y) + ',' + L, m); }
  let cursor = null;
  if (TC.cursor && !TC.walk) { const c = TC.cursor, u = toViewU(c.x, c.y); cursor = { u, L: c.L, z: TC.sc.zAt(u, c.L), unit: unitAt(c.x, c.y, c.L) >= 0 }; }
  TC.figs = figures();
  const focus = TC.figs.filter(f => f.k === TC.sel || (TC.walk && f.k === TC.walk.k)).map(f => { const [x, y] = P(f.X, f.Y, f.z); return { x, y, key: f.key }; });
  if (cursor) { const X = cursor.u % S(), Y = (cursor.u / S()) | 0, [x, y] = P(X + 0.5, Y + 0.5, cursor.z); focus.push({ x, y, key: X + Y + 1 }); }
  drawScene(g, TC.sc, k, tx, ty, view, { frame: TC.tick >> 1, tick: TC.tick >> 1, figs: TC.figs, marks, cursor, focus, ...TC.debug });
  TC.view = { k, tx, ty };
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (TC.blow) drawBlow(TC.blow, k, tx, ty);
  if (TC.fx.parts.length) drawFx(g, TC.fx, k, tx, ty);
  const pf = TC.pop && TC.figs.find(f => f.k === TC.pop.k);
  if (pf) {
    /* a struck unit's health bar shows only while it is hit: it drains from the old HP to the new, then fades */
    const { t, from, to } = TC.pop, [x, y] = P(pf.X, pf.Y, pf.z), head = y - figureHeight(pf);
    const frac = from + (to - from) * ease(Math.max(0, Math.min(1, (t - 0.15) / 0.5))), w = 12, bx = Math.round(x - w / 2) * k + tx, by = Math.round(head - 4) * k + ty;
    g.globalAlpha = Math.max(0, Math.min(1, (POP_TIME - t) / 0.3));
    g.fillStyle = '#0b1011'; g.fillRect(bx - k, by - k, (w + 2) * k, 3 * k);
    g.fillStyle = '#3a2a24'; g.fillRect(bx, by, w * k, k);
    if (frac > 0) { g.fillStyle = frac > 0.5 ? '#7fc35a' : frac > 0.25 ? '#e4c24a' : '#d9553f'; g.fillRect(bx, by, Math.max(1, Math.round(w * frac)) * k, k); }
    g.globalAlpha = 1; drawPop(TC.pop, x, head - 7, k, tx, ty);
  }
}
/* The number over a struck unit, in art pixels above its head, as the tactics games bounce theirs: each digit drops
   in a beat after the one before, overshooting large and hopping twice as it settles, filled top to bottom in its
   colour under a heavy ink rim, then the whole number drifts up and fades. The harder the hit against the unit's full
   HP, the larger it is drawn. A critical hit comes larger still, in gold, shaking as it lands, with CRITICAL over it
   and a ring of sparks flying out; healing floats up gently in green with sparkles rising round it; a miss is small
   and grey and slides aside as it fades. */
function drawPop(pop, x, head, k, tx, ty) {
  const { t, kind } = pop, chars = [...pop.text], [top, bottom] = POP_INK[kind] || POP_INK.hurt;
  const size = kind === 'miss' ? 8 : kind === 'crit' ? 13 + Math.min(3, 6 * pop.share) : 9 + Math.min(4, 8 * pop.share);
  const out = Math.max(0, Math.min(1, (POP_TIME - t) / 0.45));
  const rise = kind === 'heal' ? 12 * ease(Math.min(1, t / 1.3)) : 3 + 5 * Math.max(0, t - 0.5);
  const slide = kind === 'miss' ? 7 * ease(Math.min(1, t / 1.2)) : 0;
  g.save(); g.font = `800 ${Math.round(size * k)}px "Alegreya Sans", sans-serif`; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  const widths = chars.map(c => g.measureText(c).width), gap = -0.5 * k, total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  const baseY = (head - rise) * k + ty;
  let cx = (x + slide) * k + tx - total / 2;
  chars.forEach((c, i) => {
    const ti = t - i * 0.05, w = widths[i]; if (ti < 0) { cx += w + gap; return; }
    /* dropped in from above with two hops, and swollen at first */
    const hop = kind === 'miss' ? 0 : -9 * Math.abs(Math.cos(ti * 8)) * Math.exp(-ti * 7) - 7 * Math.exp(-ti * 22);
    const swell = 1 + (kind === 'crit' ? 0.9 : 0.55) * Math.exp(-ti * 10);
    const shake = kind === 'crit' && ti < 0.4 ? Math.sin(ti * 90) * 1.6 * (1 - ti / 0.4) : 0;
    const px = cx + w / 2 + shake * k, py = baseY + hop * k;
    g.save(); g.translate(px, py); g.scale(swell, swell); g.globalAlpha = out * Math.min(1, ti / 0.06);
    const fill = g.createLinearGradient(0, -size * 0.8 * k, 0, 0); fill.addColorStop(0, top); fill.addColorStop(1, bottom);
    g.lineWidth = Math.max(3, Math.round(2.2 * k)); g.strokeStyle = '#0b1011'; g.strokeText(c, -w / 2, 0);
    g.fillStyle = fill; g.fillText(c, -w / 2, 0);
    g.restore();
    cx += w + gap;
  });
  const dot = (ax, ay, col, a) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(Math.round(ax) * k + tx, Math.round(ay) * k + ty, k, k); };
  if (kind === 'crit') {
    /* CRITICAL over the number, and sparks bursting out from it */
    const lt = Math.min(1, t / 0.12);
    g.globalAlpha = out * lt; g.font = `800 ${Math.round(5.5 * k)}px "Alegreya Sans SC", "Alegreya Sans", sans-serif`; g.textAlign = 'center';
    g.lineWidth = Math.max(2, Math.round(1.4 * k)); g.strokeStyle = '#0b1011'; g.strokeText('CRITICAL', (x + 0.5) * k + tx, baseY - (size + 2) * k);
    g.fillStyle = '#ffe9a0'; g.fillText('CRITICAL', (x + 0.5) * k + tx, baseY - (size + 2) * k);
    if (t < 0.5) for (let n = 0; n < 10; n++) {
      const ang = (n / 10) * Math.PI * 2 + 0.3, r = 4 + 16 * ease(t / 0.5), q = 1 - t / 0.5;
      dot(x + Math.cos(ang) * r, head - rise - size * 0.4 + Math.sin(ang) * r * 0.7, n % 2 ? '#fff4d0' : '#ffb020', q);
    }
  }
  if (kind === 'heal') for (let n = 0; n < 6; n++) {
    const q = (t * 0.9 + n / 6) % 1, sx = x - 9 + (n * 37 % 19), sy = head + 10 - 22 * q;
    dot(sx, sy, n % 2 ? '#e6ffd8' : '#5fd77a', out * Math.sin(Math.PI * q));
  }
  g.restore();
}
/* What an attack sends through the air, drawn over the scene in art pixels: an arrow on its arc from the archer to the
   target, turned along its flight; a spell bursting over the target in the caster's colour, a flash and a ring of
   sparks flying out; and where a blow lands in close, a white star at the point of contact. */
const INK_RGB = '#2b2116', ARROW = ['#dde2e6', '#8a6238', '#8a6238', '#8a6238', '#8a6238', '#8a6238', '#b8483a'];
function drawBlow(b, k, tx, ty) {
  const s = blowAt(b.plan, b.t), fa = TC.figs.find(f => f.k === b.a), fd = TC.figs.find(f => f.k === b.d); if (!fa || !fd) return;
  const chest = f => { const [x, y] = P(f.X, f.Y, f.z); return [x, y - 13]; }, [ax, ay] = chest(fa), [dx, dy] = chest(fd);
  const dot = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(Math.round(x) * k + tx, Math.round(y) * k + ty, k, k); };
  if (s.missile !== null) {
    const q = s.missile, arc = 3 + 2 * b.plan.dist, x = ax + (dx - ax) * q, y = ay + (dy - ay) * q - arc * Math.sin(Math.PI * q);
    const vx = dx - ax, vy = dy - ay - arc * Math.PI * Math.cos(Math.PI * q), n = Math.hypot(vx, vy) || 1, pts = ARROW.map((c, i) => [x - (vx / n) * i, y - (vy / n) * i, c]);
    for (const [px, py] of pts) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(px + ox, py + oy, INK_RGB, 0.55);
    for (const [px, py, c] of pts) dot(px, py, c);
  }
  if (s.burst !== null) {
    const q = s.burst, tint = b.how.tint, fade = 1 - q;
    if (q < 0.4) { const r = 2 + 7 * q, a = 0.85 * (1 - q / 0.4); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (Math.abs(i) + Math.abs(j) <= r) dot(dx + i, dy + j, Math.abs(i) + Math.abs(j) < r * 0.45 ? '#fffaf0' : tint, a); }
    for (let n = 0; n < 8; n++) {
      const ang = (n / 8) * Math.PI * 2 + q * 1.2, r = 3 + 11 * q, x = dx + Math.cos(ang) * r, y = dy + Math.sin(ang) * r * 0.8;
      dot(x, y, '#fffaf0', fade); for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + ox, y + oy, tint, fade * 0.9);
    }
    for (let n = 0; n < 5; n++) dot(dx - 6 + n * 3, dy + 6 - 22 * q - (n % 2) * 4, tint, fade);
  }
  if (s.spark !== null) {
    const q = s.spark, n = Math.hypot(dx - ax, dy - ay) || 1, cx = dx - ((dx - ax) / n) * 5, cy = dy - ((dy - ay) / n) * 3, L = 1 + Math.round(3 * q), a = 1 - q * q;
    dot(cx, cy, '#fffaf0', a);
    for (let i = 1; i <= L; i++) for (const [ox, oy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) dot(cx + ox * i, cy + oy * i, i === L ? '#ffd2a0' : '#fffaf0', a);
    for (let i = 1; i < L; i++) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(cx + ox * (i + 1), cy + oy * (i + 1), '#fffaf0', a * 0.8);
  }
  g.globalAlpha = 1;
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
  else if (k === '3') { if (TC.sel >= 0 && !busy()) setMode('ability'); }
  else if (k === '4') wait();
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
  TC.battle = battle.createBattle(rosterOf()); TC.ai = null; TC.blow = null; TC.fx = createFx(); TC.turned.clear(); TC.rewind = null; TC.pop = null; TC.note = ''; TC.banner = null; $('tcPhase').hidden = true;
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
function closeTactical() { if (!TC.open) return; TC.open = false; root.hidden = true; if (raf) cancelAnimationFrame(raf); raf = 0; TC.walk = null; TC.blow = null; TC.ai = null; $('edCanvas').focus({ preventScroll: true }); }

$('tcBack').addEventListener('click', closeTactical);
$('tcRotL').addEventListener('click', () => { turn(-1); req(); }); $('tcRotR').addEventListener('click', () => { turn(1); req(); });
$('tcFast').addEventListener('click', () => setFast(!TC.fast));
$('tcIn').addEventListener('click', () => { setZoom(TC.zoom + 1); req(); }); $('tcOut').addEventListener('click', () => { setZoom(TC.zoom - 1); req(); });
$('tcActMove').addEventListener('click', () => { setMode('move'); req(); root.focus({ preventScroll: true }); });
$('tcActAttack').addEventListener('click', () => { setMode('attack'); req(); root.focus({ preventScroll: true }); });
$('tcActAbility').addEventListener('click', () => { setMode('ability'); req(); root.focus({ preventScroll: true }); });
$('tcAimGo').addEventListener('click', () => { if (TC.aim >= 0 && !busy()) attack(TC.sel, TC.aim, actIdOf(TC.sel)); req(); root.focus({ preventScroll: true }); });
$('tcActWait').addEventListener('click', () => { wait(); req(); root.focus({ preventScroll: true }); });
$('tcEnd').addEventListener('click', () => { endTurn(); req(); root.focus({ preventScroll: true }); });
$('tcRestart').addEventListener('click', () => { restart(); req(); root.focus({ preventScroll: true }); });
$('editor').addEventListener('keydown', e => { if (ED.open && !TC.open && (e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { e.preventDefault(); openTactical(); } });
new ResizeObserver(() => { if (TC.open) { size(); req(); } }).observe(root);
/* test hook: the camera, cursor and units as the view has them */
window.__tactical = { state: TC, setFast, open: openTactical, close: closeTactical, isOpen: () => TC.open, act, back, endTurn, restart, select, setCursor, setMode, turn, undoMove, wait };

export { closeTactical, openTactical };
