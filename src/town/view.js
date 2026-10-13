import { characterById } from '../characters/library.js';
import { lookOf } from '../characters/draw.js';
import { BASE } from '../characters/body.js';
import { H, W } from '../characters/pixels.js';
import { WALK, renderScaled } from '../characters/roster.js';
import { unitFor } from '../data/units.js';
import { ED, rootModel } from '../editor/editor.js';
import { arrival, doorAcross, doorways } from '../editor/interiors.js';
import { MAX_LEVEL, STOREY, cloneModel, floorAt, levelOf, objAt } from '../editor/model.js';
import { FACE_DELTA, findPath, neighbours, stairsAt, walkGoal } from '../editor/walk.js';
import { ASSET_BY_ID, TERRAIN, footprint, wallLinks } from '../tiles/index.js';
import { $ } from '../ui/state.js';
import { CHUNK, INFO, LIFT, TILE, cellAt, fieldOf, h2, heightAt, isWater, renderChunk } from './ground.js';
import { hits, shapesOf } from './collide.js';
import { FIRE, FLIGHT_L, FLIGHT_W, fitTo, pieceSprite } from './pieces.js';
import { lineFor, sightFor } from './talk.js';
import { portrait } from '../tactical/render.js';
import GroundWorker from './ground-worker.js?worker&inline';

/* ================= town view: the screen =================
   The editor's map walked the way the old town RPGs are: looked down on from the south, square tiles, the ground
   painted solid (town/ground.js), houses, trees and furniture standing up from it (town/pieces.js). One character
   is the hero: the arrow keys or WASD walk them a tile at a time (Shift runs), and they turn to face a way
   that is blocked; a click walks them to any tile they can reach, up and down stairs. Space or Enter talks to
   whoever they face, or looks at the piece or ground in front of them. Tab hands the hero's part to the next
   character. Everyone else strolls about near where they were put.
   One storey is shown at a time, as in the editor: the ground, or an upper floor on its own. Stairs change it the
   way a door does: stepping onto a flight to climb it fades up to the floor above, the hero on the landing at its
   top, and walking into the stairwell up there (drawn as steps going down) fades back down to the flight's foot.
   On a touch screen a finger dragged anywhere is a stick that walks the hero that way (pulled far, they run); a tap
   walks them to the spot or up to whoever is there and talks, a tap on the hero talks to whoever they face, the Talk
   button does the same, and two fingers pinch the zoom.
   The ground is drawn in CHUNK-square pieces as they come into view, each with a depth buffer (which row of ground
   every pixel shows); a piece or figure is cut away wherever the ground shown there lies in front of where it
   stands, so a rise or cliff hides what is behind it. Chunks are painted by workers (town/ground-worker.js), nearest
   the camera first, so a piece coming into view is ready before it does; where no worker runs, or one is late, the
   chunk is painted on the spot.
   The canvas has one pixel for every device pixel and the art is drawn a whole number of device pixels to the art
   pixel, so the pixel art stays sharp; the camera and the walkers are placed to the nearest device pixel, so they
   glide instead of stepping an art pixel at a time.
   Buildings given an interior in the editor (editor/interiors.js) can be gone into: walking into the front door,
   clicking the building, or Space facing it takes the hero inside, and the view walks the room's own map until they
   go out through a doorway in its outer wall (or Esc), when they come out on the doorstep. TW.stack holds the map
   outside meanwhile; each room is kept as it was left until the view closes.
   Walking here is a stroll, not an edit: the map is left as it was, and opening the view again starts afresh. */
const root = $('town'), cv = $('twCanvas'), g = cv.getContext('2d');
/* figures at three quarters of their sprite, as in the tactical view: about 30 pixels tall, so a one-tile cottage
   still stands over them */
const FIGURE_SCALE = 0.75;
/* The hero walks HERO_SPEED art pixels a second (about three of their own heights; RUN times that with Shift) and
   takes a stride every STRIDE pixels, so the feet plant on the ground instead of gliding over it. The others stroll
   NPC_SPEED tiles a second, STRIDES strides to a tile. A walker's feet are a circle FOOT_R across. */
const HERO_SPEED = 90, RUN = 1.85, STRIDE = 7, NPC_SPEED = 0.8, STRIDES = 8, FOOT_R = 5;
const T = TILE, ZOOMS = [1, 2, 3, 4, 5, 6], FOOT = T / 2 + 6;
const TW = { open: false, M: null, hero: 0, top: 0, zoom: 3, cam: { x: 0, y: 0 }, steps: new Map(), path: [], held: [], run: false, stick: null, F: null, gen: 0, chunks: new Map(), clipped: new Map(), sprites: new Map(), say: null, talkTo: -1, lastT: 0, tick: 0, dirty: true, cw: 0, ch: 0, dpr: 1, homes: [], rest: [], stack: [], inside: new Map() };
/* at most this many chunks are kept (about 40 MB), the furthest from the camera let go first; the workers paint
   ahead out to FILL chunks from the middle of the screen */
const KEEP = 420, FILL = 9;

/* ---------- caches: the painted ground, cliffs, pieces and figures as canvases ---------- */
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
function toCanvas(w, h, px) { const c = canvasOf(w, h), cg = c.getContext('2d'), d = cg.createImageData(w, h); d.data.set(px); cg.putImageData(d, 0, 0); return c; }
/* the surface for the storeys shown, and its chunks: { can, depth, empty } keyed by chunk column and row */
const keyOf = (cx, cy) => (cy + 512) * 1024 + cx;
function buildField() {
  for (const c of TW.chunks.values()) if (c.can.close) c.can.close();
  TW.F = fieldOf(TW.M, TW.top, true); TW.wells = wellsOf(TW.M, TW.top);
  /* the floor runs on round a stairwell (only its flight-sized well is open), in the landing's floor */
  for (const w of TW.wells) { const u = w.y * TW.M.S + w.x; if (TW.F.terr[u] < 0) TW.F.terr[u] = TW.M.floors[TW.top - 1][w.up[1] * TW.M.S + w.up[0]] - 1; }
  TW.gen++; TW.chunks.clear(); TW.clipped.clear(); lastKey = NaN; lastChunk = null; TW.dirty = true;
  const { S: n, top, terr, hgt, lev, maxH, slope, axis } = TW.F;
  for (const p of painters) p.w.postMessage({ gen: TW.gen, field: { S: n, top, terr, hgt, lev, maxH, slope, axis } });
}
function keep(cx, cy, c) {
  TW.chunks.set(keyOf(cx, cy), Object.assign(c, { cx, cy }));
  if (TW.chunks.size <= KEEP) return;
  /* let go of the chunk furthest from the camera */
  const mx = TW.cam.x / CHUNK, my = TW.cam.y / CHUNK; let far = null, fd = -1;
  for (const [k, o] of TW.chunks) { const d = Math.hypot(o.cx + 0.5 - mx, o.cy + 0.5 - my); if (d > fd) { fd = d; far = k; } }
  const o = TW.chunks.get(far); if (o.can.close) o.can.close(); TW.chunks.delete(far); if (far === lastKey) { lastKey = NaN; lastChunk = null; }
}
/* the chunk, painted here and now if no worker has brought it yet */
function chunk(cx, cy) {
  let c = TW.chunks.get(keyOf(cx, cy));
  if (!c) { const r = renderChunk(TW.F, cx * CHUNK, cy * CHUNK); c = { can: toCanvas(CHUNK, CHUNK, r.px), depth: r.depth, empty: !r.depth.some(v => v) }; keep(cx, cy, c); }
  return c;
}
/* 1 + the row of ground shown at art pixel (X, Y), 0 for none; the last chunk looked in is kept to hand, as a sprite's
   pixels are looked up one after another */
let lastKey = NaN, lastChunk = null;
function depthAt(X, Y) {
  X = Math.floor(X); Y = Math.floor(Y); if (X < 0 || X >= S() * T || noGround(Y)) return 0;
  const cx = Math.floor(X / CHUNK), cy = Math.floor(Y / CHUNK), key = keyOf(cx, cy);
  if (key !== lastKey) { lastChunk = chunk(cx, cy); lastKey = key; }
  return lastChunk.depth[(Y - cy * CHUNK) * CHUNK + X - cx * CHUNK];
}
/* rows no ground reaches: above the highest ground raised to its height, or below the map */
const noGround = Y => Y < -Math.ceil(TW.F.maxH * LIFT) || Y >= S() * T;
/* are the chunks under the box of art pixels (X, Y, w, h) painted (those that can hold ground)? */
function groundReady(X, Y, w, h) {
  const n = Math.ceil(S() * T / CHUNK), cy0 = Math.floor(-TW.F.maxH * LIFT / CHUNK);
  for (let cy = Math.max(cy0, Math.floor(Y / CHUNK)); cy * CHUNK < Y + h && cy < n; cy++) for (let cx = Math.max(0, Math.floor(X / CHUNK)); cx * CHUNK < X + w && cx < n; cx++) if (!TW.chunks.has(keyOf(cx, cy))) return false;
  return true;
}
/* is any ground shown in the box of whole art pixels (X, Y, w, h) further south than row base? */
function hidden(X, Y, w, h, base) {
  const lim = base + 1, n = S() * T;
  for (let cy = Math.floor(Math.max(Y, -Math.ceil(TW.F.maxH * LIFT)) / CHUNK); cy * CHUNK < Math.min(Y + h, n); cy++) for (let cx = Math.floor(Math.max(0, X) / CHUNK); cx * CHUNK < Math.min(X + w, n); cx++) {
    const d = chunk(cx, cy).depth, x0 = Math.max(X, cx * CHUNK), x1 = Math.min(X + w, (cx + 1) * CHUNK, n), y0 = Math.max(Y, cy * CHUNK), y1 = Math.min(Y + h, (cy + 1) * CHUNK);
    for (let y = y0; y < y1; y++) { const o = (y - cy * CHUNK) * CHUNK - cx * CHUNK; for (let x = x0; x < x1; x++) if (d[o + x] > lim) return true; }
  }
  return false;
}

/* ---------- the painters: workers painting chunks ahead of the camera ---------- */
const painters = [];
let noWorkers = false;
function startPainters() {
  if (painters.length || noWorkers) return;
  try {
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const p = { w: new GroundWorker(), busy: NaN };
      p.w.onmessage = e => painted(p, e.data);
      p.w.onerror = () => { noWorkers = true; for (const q of painters) q.w.terminate(); painters.length = 0; };
      painters.push(p);
    }
  } catch { noWorkers = true; painters.length = 0; }
}
function painted(p, d) {
  p.busy = NaN;
  if (!d.stale && d.gen === TW.gen && TW.open && !TW.chunks.has(keyOf(d.cx, d.cy))) {
    keep(d.cx, d.cy, { can: d.bitmap || toCanvas(CHUNK, CHUNK, d.px), depth: d.depth, empty: d.empty });
    /* only a chunk on screen needs the screen painted again */
    const sc = scale(), hw = cv.width / sc / 2, hh = cv.height / sc / 2, x = d.cx * CHUNK, y = d.cy * CHUNK;
    if (x < TW.cam.x + hw && x + CHUNK > TW.cam.x - hw && y < TW.cam.y + hh && y + CHUNK > TW.cam.y - hh) TW.dirty = true;
  }
  pump();
}
/* hand each idle painter the nearest chunk not yet painted, out to FILL chunks from the camera */
function pump() {
  if (!TW.open || !TW.F) return;
  const n = Math.ceil(S() * T / CHUNK), cy0 = Math.floor(-TW.F.maxH * LIFT / CHUNK), mx = TW.cam.x / CHUNK - 0.5, my = TW.cam.y / CHUNK - 0.5;
  for (const p of painters) {
    if (!Number.isNaN(p.busy)) continue;
    let best = null, bd = FILL;
    for (let cy = Math.max(cy0, Math.floor(my - FILL)); cy <= Math.min(n - 1, Math.ceil(my + FILL)); cy++) for (let cx = Math.max(0, Math.floor(mx - FILL)); cx <= Math.min(n - 1, Math.ceil(mx + FILL)); cx++) {
      const k = keyOf(cx, cy); if (TW.chunks.has(k) || painters.some(q => q.busy === k)) continue;
      const d = Math.hypot(cx - mx, (cy - my) * 1.2); if (d < bd) { bd = d; best = [cx, cy, k]; }
    }
    if (!best) return;
    p.busy = best[2]; p.w.postMessage({ gen: TW.gen, cx: best[0], cy: best[1] });
  }
}
/* rgba with every pixel cut away where the ground at screen (X + i, Y + j) is further south than row base */
function clip(px, w, h, X, Y, base, flip = false) {
  const out = new Uint8ClampedArray(px);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const o = (j * w + i) * 4; if (!out[o + 3]) continue; const d = depthAt(X + (flip ? w - 1 - i : i), Y + j); if (d - 1 > base) out[o + 3] = 0; }
  return out;
}
function spriteOf(o) {
  const key = `${o.id}|${o.face || 0}|${Math.round((o.v ?? 0.5) * 20)}|${o.links ? o.links.join('') : ''}|${o.box ? o.box.join() : ''}|${o.snug ? 1 : 0}|${o.shift ? o.shift.join() : ''}|${o.ends ? o.ends.join('') : ''}`; let s = TW.sprites.get(key);
  if (!s) { const im = pieceSprite(o); s = { can: toCanvas(im.w, im.h, im.px), px: im.px, ox: im.ox, oy: im.oy, w: im.w, h: im.h }; TW.sprites.set(key, s); }
  return s;
}
const scaled = new Map(), figs = new Map();
const framesOf = c => { let f = scaled.get(lookOf(c)); if (!f) { if (scaled.size > 64) { scaled.clear(); figs.clear(); } f = renderScaled(c, FIGURE_SCALE); scaled.set(lookOf(c), f); } return f; };
/* one frame of a figure, as its pixels and a canvas made once, so a walker in the open is drawn without a fresh upload */
function figure(ch, view, pose) {
  const key = `${lookOf(ch)}|${view}|${pose}`; let f = figs.get(key);
  if (!f) { const px = framesOf(ch)[view][pose]; f = { px, can: toCanvas(W, H, px) }; figs.set(key, f); }
  return f;
}
/* ---------- where things are ---------- */
const S = () => TW.M.S;
/* how high the surface stands at map pixel (gx, gy), in art pixels */
const lift = (gx, gy) => heightAt(TW.F, Math.round(gx), Math.round(gy)) * LIFT;
function charPos(k) {
  if (k === TW.hero && TW.me) { const m = TW.me; return { fx: m.x, fy: m.y - m.z, gy: Math.round(m.y), L: m.L, face: m.face, moving: m.moving, dist: m.dist }; }
  const c = TW.M.chars[k], st = TW.steps.get(k);
  if (!st) { const gx = c.x * T + T / 2, gy = c.y * T + FOOT; return { fx: gx, fy: gy - lift(gx, gy), gy, L: levelOf(c), face: c.face, moving: false, d: 0 }; }
  const f = Math.min(1, st.t), ax = st.from[0] * T + T / 2, ay = st.from[1] * T + FOOT, bx = st.to[0] * T + T / 2, by = st.to[1] * T + FOOT, gx = ax + (bx - ax) * f, gy = ay + (by - ay) * f;
  /* on one storey the feet follow the ground; up or down a flight they climb evenly from one end to the other */
  const z = st.from[2] === st.to[2] ? lift(gx, gy) : lift(ax, ay) + (lift(bx, by) - lift(ax, ay)) * f;
  return { fx: gx, fy: gy - z, gy: Math.round(gy), L: f < 0.5 ? st.from[2] : st.to[2], face: c.face, moving: true, d: st.d + f };
}

/* ---------- walking ---------- */
/* start character k stepping to `to` ([x, y, L], one of its neighbours) */
function beginStep(k, to) {
  const c = TW.M.chars[k], from = [c.x, c.y, levelOf(c)], prev = TW.steps.get(k);
  const dx = Math.sign(to[0] - from[0]), dy = Math.sign(to[1] - from[1]), f = FACE_DELTA.findIndex(([a, b]) => a === dx && b === dy); if (f >= 0) c.face = f;
  c.x = to[0]; c.y = to[1]; if (to[2]) c.level = to[2]; else delete c.level;
  TW.steps.set(k, { from, to, t: 0, d: prev ? prev.d + 1 : 0 });
  if (k === TW.hero && to[2] !== TW.top) setTop(to[2]);
}
/* the step a direction key asks of character k: onto the tile that way, up or down a flight if there is one */
function stepToward(k, dir) {
  const c = TW.M.chars[k], L = levelOf(c), [dx, dy] = FACE_DELTA[dir], nx = c.x + dx, ny = c.y + dy;
  const ok = neighbours(TW.M, c.x, c.y, L, k).filter(n => n[0] === nx && n[1] === ny);
  return ok.find(n => n[2] !== L) || ok[0] || null;
}
const DIRS = { ArrowDown: 0, s: 0, ArrowRight: 1, d: 1, ArrowUp: 2, w: 2, ArrowLeft: 3, a: 3 };
/* ---------- the hero walks freely ----------
   The hero has a position in map pixels (x east, y south, at their feet) and a storey. A move is taken in small
   steps; each must land on dry ground of the hero's storey, no more than a few pixels up or down from where they
   stand (so slopes climb and cliffs stop them), clear of every piece's shape and every other walker. Blocked
   along one axis, the hero slides along the other, so they skirt a trunk or a wall instead of sticking to it.
   Stairs carry them up or down a storey: crossing from a flight onto the tile behind its top goes up, and back
   down the same way. */
/* the height the hero stands at on storey L, at map pixel (x, y), in levels: the ground, or the floor; null where
   storey L has no floor. A flight of stairs lies flat: the storey changes all at once at its steps (stairsAhead). */
function heightOn(L, x, y) {
  const M = TW.M, n = M.S, tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 0 || ty < 0 || tx >= n || ty >= n) return null;
  const u = ty * n + tx;
  /* round a stairwell on the floor shown there is floor too; only its well is open (stairsAhead takes the hero down) */
  if (L) return floorAt(M, L, u) || (L === TW.top && (TW.wells || []).some(w => w.x === tx && w.y === ty)) ? M.elev[u] + STOREY * L : null;
  return heightAt(TW.G0, x, y);
}
const dry = (L, x, y) => { if (L) return true; const k = cellAt(TW.G0, Math.round(x), Math.round(y)); return k >= 0 && !INFO[k].water && INFO[k].face !== 'lava'; };
/* can the hero stand at (x, y) on storey L, coming from a spot h levels high? */
function standable(L, x, y, h) {
  const n = TW.M.S * T; if (x < FOOT_R || y < FOOT_R || x > n - FOOT_R || y > n - FOOT_R) return false;
  for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) if (!dry(L, x + dx, y + dy)) return false;
  /* a cliff jumps two levels or more; anything under one level is a slope or a seam a foot steps over */
  const nh = heightOn(L, x, y); if (nh == null || Math.abs(nh - h) > 0.9) return false;
  if (hits(TW.shapes.get(L), x, y, FOOT_R)) return false;
  for (let k = 0; k < TW.M.chars.length; k++) { if (k === TW.hero) continue; const q = charPos(k); if (q.L === L && Math.hypot(q.fx - x, q.gy - y) < FOOT_R + 6) return false; }
  return true;
}
/* move the hero by (dx, dy), a pixel or so at a time, sliding along whatever stops them; returns the distance gone */
function moveHero(dx, dy) {
  const m = TW.me, steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 1.2)), sx = dx / steps, sy = dy / steps; let gone = 0;
  for (let i = 0; i < steps; i++) {
    const h = heightOn(m.L, m.x, m.y);
    let moved = false;
    /* straight on; else each axis alone; else turned a little either way, to ease round a trunk or a corner */
    const c1 = Math.cos(0.7), s1 = Math.sin(0.7), c2 = Math.cos(1.2), s2 = Math.sin(1.2);
    for (const [ex, ey] of [[sx, sy], [sx, 0], [0, sy], [sx * c1 - sy * s1, sx * s1 + sy * c1], [sx * c1 + sy * s1, -sx * s1 + sy * c1], [sx * c2 - sy * s2, sx * s2 + sy * c2], [sx * c2 + sy * s2, -sx * s2 + sy * c2]]) {
      if (!ex && !ey) continue;
      /* the storey changes only by stairs (see stairsAhead), never in the walk itself */
      const nx = m.x + ex, ny = m.y + ey;
      if (standable(m.L, nx, ny, h)) { m.x = nx; m.y = ny; gone += Math.hypot(ex, ey); moved = true; break; }
    }
    if (!moved) break;
  }
  /* the hero's tile, so the others step round it and talk finds them */
  const c = TW.M.chars[TW.hero]; c.x = Math.floor(m.x / T); c.y = Math.floor(m.y / T); c.face = m.face; if (m.L) c.level = m.L; else delete c.level;
  return gone;
}
const FACE_OF = (vx, vy) => (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 1 : 3) : (vy > 0 ? 0 : 2));
/* The hero's drawn height follows the ground through a short smoothing, so the small seams where tiles meet on a
   ramp read as one even climb; the camera follows the hero's place on the ground and, more slowly still, their
   height, so a climb never shakes the view. */
function settle(dt) {
  const m = TW.me; if (!m) return;
  const z = (heightOn(m.L, m.x, m.y) ?? 0) * LIFT;
  if (m.z == null || Math.abs(z - m.z) > 3 * LIFT) { m.z = z; TW.camZ = z; return; }
  const a = 1 - Math.exp(-dt * 16), b = 1 - Math.exp(-dt * 5), before = m.z, cam = TW.camZ;
  m.z += (z - m.z) * a; TW.camZ += (m.z - TW.camZ) * b;
  if (Math.abs(m.z - before) > 0.01 || Math.abs(TW.camZ - cam) > 0.01) TW.dirty = true;
}
function heroTick(dt) {
  const m = TW.me; if (!m) return;
  settle(dt);
  let vx = 0, vy = 0, pace = TW.run ? RUN : 1;
  for (const d of TW.held) { vx += FACE_DELTA[d][0]; vy += FACE_DELTA[d][1]; }
  /* the touch stick: a slow walk for a small pull, a walk for a full one, a run beyond */
  const st = TW.stick, pull = st ? Math.hypot(st.x, st.y) : 0;
  if (!vx && !vy && pull > 0.2) { vx = st.x; vy = st.y; pace = pull > 1.3 ? RUN : Math.max(0.45, Math.min(1, pull)); }
  if (vx || vy) TW.path = [];
  else if (TW.path.length) {
    /* following a route: toward the next point, dropping it once there or once stuck on it */
    const [px, py] = TW.path[0], ex = px - m.x, ey = py - m.y, d = Math.hypot(ex, ey);
    if (d < 1.5) { TW.path.shift(); TW.stuck = 0; } else { vx = ex / d; vy = ey / d; }
  }
  if (vx || vy) {
    const len = Math.hypot(vx, vy), sp = HERO_SPEED * pace * dt;
    m.face = FACE_OF(vx, vy);
    const gone = moveHero(vx / len * sp, vy / len * sp);
    m.dist += gone; m.moving = gone > 0.05;
    /* held up on a route: whoever stands in the way steps aside; with no one to blame, the route is given up */
    if (!m.moving && TW.path.length) { TW.stuck = (TW.stuck || 0) + dt; if (TW.stuck > 0.4) { if (makeWay()) TW.stuck = 0; else TW.path = []; } }
    TW.dirty = true;
    /* walking into a door goes through it */
    if (!TW.say && throughDoor(m.face)) return;
  } else if (m.moving) { m.moving = false; TW.dirty = true; place(); }
  /* walked up to someone to talk to them */
  if (TW.talkTo >= 0) {
    const q = charPos(TW.talkTo), d = Math.hypot(q.fx - m.x, q.gy - m.y);
    if (q.L === m.L && (d < 24 || (!TW.path.length && d < T + 10))) { const j = TW.talkTo; m.face = FACE_OF(q.fx - m.x, q.gy - m.y); TW.path = []; TW.talkTo = -1; TW.chase = 0; m.moving = false; talk(j); }
    /* they strolled off: follow a little way, then give up */
    else if (!TW.path.length) { if (q.L === m.L && d < 4 * T && (TW.chase = (TW.chase || 0) + 1) < 4) TW.path = routeTo(q.fx, q.gy + (m.y > q.gy ? 14 : -14), q.L); else { TW.talkTo = -1; TW.chase = 0; } }
  }
}
/* ---------- going in and out of buildings ---------- */
/* the building with an interior whose front door the hero at (x, y) stands at, on the ground outside */
function doorAt(x, y) {
  if (TW.stack.length) return null;
  for (const o of TW.M.objs) {
    if (!o.interior || levelOf(o)) continue;
    const [w, d] = footprint(o), front = (o.y + d) * T;
    if (y < front - 3 || y > front + FOOT_R + 6 || Math.abs(x - (o.x + w * doorAcross(o)) * T) > 13) continue;
    return o;
  }
  return null;
}
/* the doorway in the room's outer wall the hero at (x, y) stands in, pressing out of the map the way it faces */
function wayOut(x, y, face, reach = 14) {
  if (!TW.stack.length || TW.me.L) return false;
  const n = TW.M.S * T, tx = Math.floor(x / T), ty = Math.floor(y / T);
  return doorways(TW.M).some(([dx, dy, side]) => dx === tx && dy === ty && side === face && (side === 0 ? y > n - reach : side === 1 ? x > n - reach : side === 2 ? y < reach : x < reach));
}
/* the hero, walking the way `face` points, goes through a door if there is one: in at a front door (pressing north),
   out through a doorway on the room's edge */
function throughDoor(face) {
  const m = TW.me; if (!m) return false;
  if (stairsAhead(face)) return true;
  if (wayOut(m.x, m.y, face)) { goOut(); return true; }
  const o = face === 2 && !m.L ? doorAt(m.x, m.y) : null;
  return o ? goIn(o) : false;
}
/* ---------- stairs: a new floor, as in the editor ---------- */
/* ---------- where a flight stands ----------
   A flight is drawn at the figures' scale and set in a corner, against the walls beside it: across it, against a
   room wall on either side (on the east if there is none or both); along it, its foot against a wall it rises from,
   else its top toward its landing. Room walls stand in the middle of their tiles, so a flight against one reaches into
   that tile's near half. The box is in its tile's pixels, [x0, y0, x1, y1], and may run past the tile's edges. */
const ROOM_WALLS = new Set(['iwall', 'iwindow', 'hearth', 'post', 'wallshelf', 'wallantlers', 'wallshield', 'wallsconce', 'wallbar']);
function flightRect(M, o) {
  const f = o.face || 0, L = levelOf(o), [fx, fy] = FACE_DELTA[f], [A, B] = [FLIGHT_W, FLIGHT_L];
  const wall = (dx, dy) => { const k = objAt(M, o.x + dx, o.y + dy, L); return k >= 0 && ROOM_WALLS.has(M.objs[k].id); };
  /* how far each side may go: flush against the wall there (its face, or for a wall in front the foot of its face), or
     to the tile's own edge */
  const E = wall(1, 0) ? T + T / 2 - 6 : T - 2, Wx = wall(-1, 0) ? -T / 2 + 10 : 2, N = wall(0, -1) ? -T / 2 + 5 : 2, Sy = wall(0, 1) ? T + T / 2 - 29 : T - 2;
  if (f % 2 === 0) {
    const x0 = wall(1, 0) || !wall(-1, 0) ? E - A : Wx, footWall = fy > 0 ? wall(0, 1) : wall(0, -1);
    const y0 = fy > 0 ? (footWall ? Sy - B : N) : (footWall ? N : Sy - B);
    return [x0, y0, x0 + A, y0 + B];
  }
  const y0 = wall(0, -1) || !wall(0, 1) ? N : Sy - A, footWall = fx > 0 ? wall(1, 0) : wall(-1, 0);
  const x0 = fx > 0 ? (footWall ? E - B : Wx) : (footWall ? Wx : E - B);
  return [x0, y0, x0 + B, y0 + A];
}
/* the flight's box for piece o of the map walked (worked out once a map) */
function flightOf(o) { let r = TW.flightRects.get(o); if (!r) { r = flightRect(TW.M, o); TW.flightRects.set(o, r); } return r; }
/* the box in map pixels, and whether (x, y) lies in it */
const flightMap = o => { const [x0, y0, x1, y1] = flightOf(o); return [o.x * T + x0, o.y * T + y0, o.x * T + x1, o.y * T + y1]; };
const inBox = (r, x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
/* the hero, walking the way `face` points, takes the stairs when their feet reach the steps: a flight climbing that
   way takes them up to its landing, the well of a stairwell (going down, away from its landing) down to its foot */
function stairsAhead(face) {
  const m = TW.me, M = TW.M, [dx, dy] = FACE_DELTA[face];
  for (const o of M.objs) {
    if (o.id !== 'stairs') continue;
    const L = levelOf(o), st = stairsAt(M, o.x, o.y, L); if (!st) continue;
    if (L === m.L && L < MAX_LEVEL && dx === st.up[0] - o.x && dy === st.up[1] - o.y && inBox(flightMap(o), m.x, m.y)) return changeFloor(L + 1, st.up[0], st.up[1], face, [o.x, o.y], topSpot(o));
    if (L !== m.L - 1 || !(TW.wells || []).some(w => w.x === o.x && w.y === o.y)) continue;
    /* heading down it: away from the landing */
    if (dx !== o.x - st.up[0] || dy !== o.y - st.up[1] || !inBox(flightMap(o), m.x, m.y)) continue;
    return changeFloor(L, o.x, o.y, o.face, [o.x, o.y], footSpot(o));
  }
  return false;
}
/* where someone coming up a flight steps off it on the floor above: just beyond its top, in line with it, so the way
   back down is straight back the way they came */
function topSpot(o) {
  const L = levelOf(o) + 1, [fx, fy] = FACE_DELTA[o.face || 0], r = flightMap(o), cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
  const hl = (fx ? r[2] - r[0] : r[3] - r[1]) / 2 + 12, x = cx - fx * hl, y = cy - fy * hl, h = heightOn(L, x, y);
  return h != null && standable(L, x, y, h) ? [x, y] : null;
}
/* where someone coming down a flight steps off it: just beyond its foot, or where a wall stands there, beside its
   foot on the open side */
function footSpot(o) {
  const M = TW.M, L = levelOf(o), [fx, fy] = FACE_DELTA[o.face || 0], r = flightMap(o), cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
  const hl = fx ? (r[2] - r[0]) / 2 : (r[3] - r[1]) / 2, ha = fx ? (r[3] - r[1]) / 2 : (r[2] - r[0]) / 2;
  const k = objAt(M, o.x + fx, o.y + fy, L), walled = k >= 0 && ROOM_WALLS.has(M.objs[k].id);
  const spots = walled ? [-1, 1].map(s => (fx ? [cx + fx * (hl - 12), cy + s * (ha + 10)] : [cx + s * (ha + 10), cy + fy * (hl - 12)])) : [[cx + fx * (hl + 10), cy + fy * (hl + 10)]];
  return spots.find(([x, y]) => { const h = heightOn(L, x, y); return h != null && standable(L, x, y, h); }) || null;
}
/* the hero onto storey L at tile (x, y) (or the exact spot given), facing `face`, having come by the flight at tile
   `via`: behind the veil (transition), and a route being followed goes on from the far end of the flight */
function changeFloor(L, x, y, face, via, spot = null) {
  const m = TW.me, cx = x * T + T / 2, cy = y * T + FOOT, at = spot && standable(L, spot[0], spot[1], heightOn(L, spot[0], spot[1]) ?? 0) ? spot : standSpot(cx, cy, L, via);
  if (!at) return false;
  return transition(() => {
    m.x = at[0]; m.y = at[1]; m.L = L; m.face = face; m.z = null; m.moving = false;
    const c = TW.M.chars[TW.hero]; c.x = Math.floor(m.x / T); c.y = Math.floor(m.y / T); c.face = face; if (L) c.level = L; else delete c.level;
    while (TW.path.length && (TW.path[0][2] != null && TW.path[0][2] !== L || (Math.floor(TW.path[0][0] / T) === via[0] && Math.floor(TW.path[0][1] / T) === via[1]))) TW.path.shift();
    if (TW.say) closeSay();
    setTop(L); settle(0);
  }, { name: L ? `Floor ${L}` : 'Ground floor', view: L > m.L ? 'back' : 'front' });
}
/* walk map M as character `hero`: everything the view keeps about the map made afresh for it */
function useMap(M, hero, homes = null) {
  TW.M = M; M.chars = M.chars || []; M.floors = M.floors || [];
  TW.steps.clear(); TW.path = []; TW.talkTo = -1; TW.rest = []; TW.stuck = 0;
  TW.homes = homes || M.chars.map(c => [c.x, c.y]); TW.links = wallLinks(M.objs); TW.flightRects = new Map(); cuts.length = 0;
  TW.hero = hero; TW.G0 = fieldOf(M, 0); TW.shapes = shapesOf(M.objs, TW.links); TW.fit = fitTo(M.objs); takeHero();
  TW.top = TW.me ? TW.me.L : 0; buildField();
}
/* into building o's interior, behind the veil. from: the index of someone already inside to walk as, else the hero
   goes in */
function goIn(o, from = -1) {
  if (from < 0 && !TW.M.chars[TW.hero]) return false;
  return transition(() => enter(o, from), { name: (TW.inside.get(o) || o.interior).name, view: 'back' });
}
function enter(o, from = -1) {
  let I = TW.inside.get(o);
  if (!I) { I = cloneModel(o.interior); I.chars = I.chars || []; TW.inside.set(o, I); }
  const ctx = { M: TW.M, hero: TW.hero, homes: TW.homes, piece: o }; let k = from;
  if (k < 0) {
    const c = TW.M.chars[TW.hero]; if (!c) return false;
    const [x, y, face] = arrival(I) || [0, 0, 2]; I.chars.push({ sprite: c.sprite, x, y, face }); k = I.chars.length - 1;
  } else ctx.hero = -1;
  if (TW.say) closeSay();
  TW.stack.push(ctx); useMap(I, k); arrived(); return true;
}
/* back out onto the doorstep of the building the hero is in, behind the veil */
function goOut() {
  if (!TW.stack.length) return false;
  return transition(exit, { name: TW.stack[TW.stack.length - 1].M.name, view: 'front' });
}
function exit() {
  const ctx = TW.stack.pop(); if (!ctx) return false;
  const I = TW.M, c = I.chars[TW.hero], O = ctx.M, o = ctx.piece, [w, d] = footprint(o);
  if (c) I.chars.splice(TW.hero, 1);
  let k = ctx.hero;
  if (!O.chars[k]) {
    if (!c) { useMap(O, Math.max(0, k), ctx.homes); arrived(); return true; }
    O.chars.push({ sprite: c.sprite, x: 0, y: 0, face: 0 }); k = O.chars.length - 1; ctx.homes[k] = [0, 0];
  }
  const x = (o.x + w * doorAcross(o)) * T, y = (o.y + d) * T + FOOT_R + 4, h = O.chars[k], cl = v => Math.max(0, Math.min(O.S - 1, v));
  h.x = cl(Math.floor(x / T)); h.y = cl(Math.floor(y / T)); h.face = 0; delete h.level;
  if (TW.say) closeSay();
  useMap(O, k, ctx.homes);
  /* on the doorstep, or the nearest spot to it where they can stand */
  const at = standSpot(x, y, 0); if (at) { TW.me.x = at[0]; TW.me.y = at[1]; } TW.me.face = 0; TW.me.z = null; settle(0); moveHero(0, 0);
  arrived(); return true;
}
/* the nearest spot to (x, y) on storey L where the hero can stand, if any within a tile; never on the tile `not` (the
   flight they came by, which would send them straight back) */
function standSpot(x, y, L = 0, not = null) {
  for (let r = 0; r <= T; r += 6) for (let a = 0; a < (r ? 12 : 1); a++) {
    const px = x + Math.cos(a / 12 * Math.PI * 2 + Math.PI / 2) * r, py = y + Math.sin(a / 12 * Math.PI * 2 + Math.PI / 2) * r, h = heightOn(L, px, py);
    if (not && Math.floor(px / T) === not[0] && Math.floor(py / T) === not[1]) continue;
    if (h != null && standable(L, px, py, h)) return [px, py];
  }
  return null;
}
/* the top bar and the panel brought up to date for the place just come into */
function arrived() { syncInside(); place(); TW.dirty = true; }

/* ---------- transitions ----------
   Going through a door, taking the stairs, or opening the view: the screen fades to dark, the new place is swapped
   in behind it, and it fades back up only once the ground in sight is painted. The workers paint it a piece at a time
   while the frames keep coming, so nothing stalls and the place being left never shows through (painting it all at
   once held the page for a third of a second, while the fade ran on over the old picture). Meanwhile the hero walks
   in place over the name of where they are going: from behind going in or up, from the front coming out or down. */
const veil = $('twVeil'), loadFig = $('twLoadFig'), lfg = loadFig.getContext('2d');
/* the fade out (ms), the shortest time the veil is up (so it reads as a step, not a blink), and how long to wait on
   the painters before painting what is left here and now */
const FADE = 170, LEAST = 420, PATIENCE = 4000;
function transition(swap, { name = '', view = 'back', instant = false } = {}) {
  if (TW.busy) return false;
  const b = TW.busy = { t0: performance.now(), name, view, swapped: 0 };
  $('twLoadName').textContent = name;
  veil.classList.toggle('instant', instant); veil.classList.add('on', 'loading'); $('twBanner').classList.remove('show');
  const go = () => { if (!TW.open || TW.busy !== b) return; swap(); b.swapped = performance.now(); req(); };
  if (instant) go(); else setTimeout(go, FADE);
  req(); return true;
}
/* the chunks of ground the screen will show, within the map: [cx, cy] */
function inSight() {
  follow();
  const sc = scale(), [tx, ty] = offset(sc), n = Math.ceil(S() * T / CHUNK), cy0 = Math.floor(-TW.F.maxH * LIFT / CHUNK), out = [];
  const vx0 = -tx / sc, vy0 = -ty / sc, vx1 = (cv.width - tx) / sc, vy1 = (cv.height - ty) / sc;
  for (let cy = Math.max(cy0, Math.floor(vy0 / CHUNK)); cy * CHUNK < vy1 && cy < n; cy++) for (let cx = Math.max(0, Math.floor(vx0 / CHUNK)); cx * CHUNK < vx1 && cx < n; cx++) out.push([cx, cy]);
  return out;
}
/* fit the pieces of the storey shown that stand in sight to the ground (pieceOn), until `budget` ms are spent;
   true once every one is ready */
function warm(budget = 8) {
  let ready = true; const t = performance.now(), sc = scale(), [tx, ty] = offset(sc), vx0 = -tx / sc, vy0 = -ty / sc, vx1 = (cv.width - tx) / sc, vy1 = (cv.height - ty) / sc;
  for (const [i, p] of TW.M.objs.entries()) {
    if (levelOf(p) !== TW.top) continue;
    const [w, d] = footprint(p), it = { key: (p.y + d) * T - 1, i, p, w, d };
    /* its sprite and place first (an empty view asks for nothing more), then, once the ground under it is painted, the fit */
    let c = TW.clipped.get(i); if (!c) { pieceOn(it, 1, 1, 0, 0); c = TW.clipped.get(i); }
    if (c.can || c.X > vx1 || c.Y > vy1 || c.X + c.w < vx0 || c.Y + c.h < vy0) continue;
    if (!groundReady(c.X, c.Y, c.w, c.h)) { ready = false; continue; }
    pieceOn(it, vx0, vy0, vx1, vy1);
    if (performance.now() - t > budget) return false;
  }
  return ready;
}
/* each frame the veil is up: walk the figure, and once the place is swapped in and its ground in sight painted, lift
   the veil */
function veiled(now) {
  const b = TW.busy, c = TW.M.chars[TW.hero], ch = c && (characterById(c.sprite) || characterById('villager'));
  if (ch) { lfg.clearRect(0, 0, loadFig.width, loadFig.height); lfg.drawImage(figure(ch, b.view, WALK[Math.floor(now / 140) % WALK.length]).can, 0, 0); }
  if (!b.swapped) return;
  const need = inSight().filter(([cx, cy]) => !TW.chunks.has(keyOf(cx, cy)));
  /* with no workers the ground is painted here, a piece a frame, so the figure keeps walking */
  if (need.length && !painters.length) { chunk(...need[0]); return; }
  const late = now - b.swapped > PATIENCE;
  if (need.length && !late) return;
  /* then the pieces in sight, fitted to the new ground a few a frame, so the frame that lifts the veil is light */
  if (!late && !warm()) return;
  if (now - b.t0 < LEAST) return;
  TW.busy = null; paint(); veil.classList.remove('on', 'loading', 'instant');
  banner(b.name); place();
}
function banner(text) { const b = $('twBanner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function syncInside() {
  const inside = TW.stack.length > 0;
  $('twName').textContent = inside ? `${TW.stack[0].M.name} › ${TW.M.name}` : TW.M.name;
  $('twLeave').hidden = !inside; $('twNext').hidden = inside;
}

/* a route for the hero to (x, y) in map pixels on storey L: through the middles of the tiles on the editor's
   walking route, then to the point itself; or straight there if there is no route */
function routeTo(x, y, L) {
  /* the others are left out of the reckoning: whoever stands on the way steps aside when the hero comes (makeWay) */
  const M = TW.M, k = TW.hero, tx = Math.floor(x / T), ty = Math.floor(y / T), tiles = findPath(Object.assign({}, M, { chars: [M.chars[k]] }), 0, tx, ty, L);
  /* through the middles of the tiles, but by a flight of stairs through the flight itself (it may stand off the middle of
     its tile, in a corner): going up, to its foot if that is open and on into it; coming down, into its well */
  const list = tiles || [], c = M.chars[k], pts = [];
  for (let i = 0; i < list.length - 1; i++) {
    const [a, b, l = 0] = list[i], st = stairsAt(M, a, b, l), prev = i ? list[i - 1] : [c.x, c.y, levelOf(c)], nx = list[i + 1];
    if (st) {
      const o = M.objs[st.k], r = flightMap(o), cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
      if (nx[2] === l + 1) {
        /* (not when a wall stands at its foot: that ground is behind the wall's face) */
        const [fx, fy] = FACE_DELTA[o.face || 0], hl = (fx ? r[2] - r[0] : r[3] - r[1]) / 2 + 10, px = cx + fx * hl, py = cy + fy * hl, h = heightOn(l, px, py), fk = objAt(M, a + fx, b + fy, l);
        if (!(fk >= 0 && ROOM_WALLS.has(M.objs[fk].id)) && h != null && standable(l, px, py, h)) pts.push([px, py, l]);
        pts.push([cx, cy, l]); continue;
      }
      if ((prev[2] || 0) === l + 1) { pts.push([cx, cy, l + 1]); continue; }
    }
    pts.push([a * T + T / 2, b * T + FOOT, l]);
  }
  pts.push([x, y, L || 0]); return pts;
}
/* the others stroll: now and then one takes a step, staying within two tiles of where it was put */
function stroll(dt) {
  const M = TW.M;
  M.chars.forEach((c, k) => {
    if (k === TW.hero || TW.steps.has(k) || (TW.say && TW.say.k === k) || unitFor(c.sprite).group === 'enemies') return;
    TW.rest[k] = (TW.rest[k] ?? 1 + Math.random() * 3) - dt; if (TW.rest[k] > 0) return;
    TW.rest[k] = 1.5 + Math.random() * 4;
    const home = TW.homes[k], dir = Math.floor(Math.random() * 4), to = stepToward(k, dir);
    /* they keep near home, on their own storey, and out of doorways and off stairs, where they would stand in the way */
    if (Math.random() < 0.35 || !to || to[2] !== levelOf(c) || Math.abs(to[0] - home[0]) + Math.abs(to[1] - home[1]) > 2 || inTheWay(to)) { c.face = dir; TW.dirty = true; return; }
    beginStep(k, to);
  });
}
/* a doorway, a flight of stairs or anything else made to walk through, or (in a room) the tile just inside a way
   out: [x, y, L] */
const inTheWay = ([x, y, L]) => {
  const k = objAt(TW.M, x, y, L); if (k >= 0 && ASSET_BY_ID[TW.M.objs[k].id].walk) return true;
  return !L && TW.stack.length > 0 && doorways(TW.M).some(([dx, dy, side]) => dx - FACE_DELTA[side][0] === x && dy - FACE_DELTA[side][1] === y);
};
/* someone standing on the hero's way (where they stand or the next point of their route) steps off it, onto a free
   tile beside them that is not on the route, the hero's, or in the way; true if someone did */
function makeWay() {
  const m = TW.me, M = TW.M, next = TW.path[0]; if (!next) return false;
  const on = new Set(TW.path.map(([x, y]) => Math.floor(x / T) + ',' + Math.floor(y / T)));
  on.add(Math.floor(m.x / T) + ',' + Math.floor(m.y / T));
  for (let k = 0; k < M.chars.length; k++) {
    if (k === TW.hero || TW.steps.has(k)) continue;
    const q = charPos(k); if (q.L !== m.L) continue;
    const near = Math.hypot(q.fx - m.x, q.gy - m.y) < FOOT_R * 2 + 18 || Math.hypot(q.fx - next[0], q.gy - next[1]) < FOOT_R * 2 + 18;
    if (!near) continue;
    const c = M.chars[k], steps = [0, 1, 2, 3].map(d => stepToward(k, d)).filter(to => to && to[2] === levelOf(c));
    let away = steps.filter(to => !on.has(to[0] + ',' + to[1]) && !inTheWay(to));
    /* hemmed in (a narrow passage): on along the route, away from the hero, to where there is room to stand aside */
    if (!away.length) { const idx = to => TW.path.findIndex(([x, y]) => Math.floor(x / T) === to[0] && Math.floor(y / T) === to[1]), here = idx([c.x, c.y]); away = steps.filter(to => idx(to) > here && idx(to) > 0); }
    if (!away.length) continue;
    beginStep(k, away[Math.floor(Math.random() * away.length)]); TW.homes[k] = [c.x, c.y]; return true;
  }
  return false;
}

/* ---------- talking and looking ---------- */
/* talk to `to` (someone the hero walked up to), else whoever stands just in front of the hero, else look at the piece
   or ground there */
function talk(to = -1) {
  if (TW.busy) return;
  if (TW.say) { closeSay(); return; }
  const M = TW.M, k = TW.hero, m = TW.me; if (!m) return;
  const [fx, fy] = FACE_DELTA[m.face], px = m.x + fx * 18, py = m.y + fy * 18, L = m.L;
  let j = to, best = 20;
  if (j < 0) M.chars.forEach((o, i) => { if (i === k) return; const q = charPos(i), d = Math.hypot(q.fx - px, q.gy - py); if (q.L === L && d < best) { best = d; j = i; } });
  if (j >= 0) {
    const o = M.chars[j], ch = characterById(o.sprite);
    if (!TW.steps.has(j)) o.face = (m.face + 2) % 4;
    TW.say = { k: j, who: ch ? ch.name : o.sprite, line: lineFor(o.sprite, unitFor(o.sprite).group, M.name, (TW.talks = (TW.talks || 0) + 1)) };
  } else {
    /* standing in a doorway of the room's outer wall, facing out: out they go */
    if (wayOut(m.x, m.y, m.face, T)) { goOut(); return; }
    const x = Math.floor(px / T), y = Math.floor(py / T); if (x < 0 || y < 0 || x >= M.S || y >= M.S) return;
    const piece = M.objs.find(o => (o.level || 0) === L && x >= o.x && y >= o.y && x < o.x + footprint(o)[0] && y < o.y + footprint(o)[1]);
    /* facing a building's door: in they go */
    if (piece && piece.interior && !L && m.face === 2 && !TW.stack.length) { goIn(piece); return; }
    const ground = L ? (M.floors[L - 1] && M.floors[L - 1][y * M.S + x] ? TERRAIN[M.floors[L - 1][y * M.S + x] - 1] : null) : TERRAIN[cellAt(TW.G0, Math.round(px), Math.round(py))];
    const line = sightFor(piece ? ASSET_BY_ID[piece.id] : null, ground, M.name); if (!line) return;
    TW.say = { k: -1, who: '', line };
  }
  /* the speaker's face, as the tactical view shows a unit's; looking at something shows none */
  const face = $('twFace'), who = TW.say.k >= 0 ? characterById(M.chars[TW.say.k].sprite) : null; face.hidden = !who;
  if (who) { const fg = face.getContext('2d'); fg.clearRect(0, 0, face.width, face.height); fg.imageSmoothingEnabled = false; fg.drawImage(portrait(who), 0, 0, face.width, face.height); }
  $('twWho').textContent = TW.say.who; $('twWho').hidden = !TW.say.who; $('twLine').textContent = TW.say.line; $('twSay').hidden = false; root.classList.add('saying'); TW.dirty = true; place();
}
function closeSay() { TW.say = null; $('twSay').hidden = true; root.classList.remove('saying'); TW.dirty = true; if (TW.M) place(); }

/* ---------- the camera ---------- */
/* device pixels to the art pixel: always a whole number, so every art pixel is the same size on screen */
const scale = () => Math.max(1, Math.round(TW.zoom * TW.dpr));
/* where the art's origin lands on the canvas, to the nearest device pixel */
const offset = sc => [Math.round(cv.width / 2 - TW.cam.x * sc), Math.round(cv.height / 2 - TW.cam.y * sc)];
/* the canvas's backing store, one pixel to each device pixel: the exact count where the browser gives it (box, from a
   ResizeObserver's device-pixel-content-box), else the CSS size times the device pixel ratio. A store that missed by
   even a little would be stretched to fit, smearing the art and making it shimmer as it scrolls. */
function size(box) {
  const r = cv.getBoundingClientRect(); TW.cw = r.width; TW.ch = r.height; TW.dpr = Math.min(4, window.devicePixelRatio || 1);
  /* (a box that disagrees with the CSS size by more than rounding is not believed: an emulated screen reports CSS pixels) */
  const good = box && Math.abs(box.inlineSize - r.width * TW.dpr) < 1.5 && Math.abs(box.blockSize - r.height * TW.dpr) < 1.5;
  const w = good ? box.inlineSize : Math.round(r.width * TW.dpr), h = good ? box.blockSize : Math.round(r.height * TW.dpr);
  if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  TW.dirty = true;
}
function setZoom(z) { TW.zoom = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z)); $('twZoom').textContent = `×${TW.zoom}`; TW.dirty = true; }
/* on the hero, kept inside the map where the map is bigger than the screen */
function follow() {
  const k = TW.hero, c = TW.M.chars[k]; let x = S() * T / 2, y = S() * T / 2;
  if (c) { const p = charPos(k); x = p.fx; y = k === TW.hero && TW.me ? TW.me.y - (TW.camZ ?? TW.me.z ?? 0) - 16 : p.fy - 16; }
  const sc = scale(), hw = cv.width / sc / 2, hh = cv.height / sc / 2, top = -TW.F.maxH * LIFT, w = S() * T, h = S() * T;
  TW.cam.x = w <= hw * 2 ? w / 2 : Math.max(hw, Math.min(w - hw, x));
  TW.cam.y = h - top <= hh * 2 ? (top + h) / 2 : Math.max(top + hh, Math.min(h - hh, y));
}
function setTop(L) { L = Math.max(0, Math.min(MAX_LEVEL, L)); if (L !== TW.top) { TW.top = L; buildField(); } place(); }

/* ---------- drawing ---------- */
function paint() {
  follow();
  const sc = scale(), Wd = cv.width, Hd = cv.height, [tx, ty] = offset(sc);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#141b1c'; g.fillRect(0, 0, Wd, Hd);
  g.setTransform(sc, 0, 0, sc, tx, ty); g.imageSmoothingEnabled = false;
  const vx0 = -tx / sc, vy0 = -ty / sc, vx1 = (Wd - tx) / sc, vy1 = (Hd - ty) / sc, M = TW.M, n = S();
  /* the ground, chunk by chunk */
  for (let cy = Math.floor(vy0 / CHUNK); cy * CHUNK < vy1; cy++) for (let cx = Math.max(0, Math.floor(vx0 / CHUNK)); cx * CHUNK < Math.min(vx1, n * T); cx++) { const c = chunk(cx, cy); if (!c.empty) g.drawImage(c.can, cx * CHUNK, cy * CHUNK); }
  ripples(vx0, vy0, vx1, vy1);
  /* then everything standing on it, back to front by where it meets the ground */
  const items = [];
  /* only the storey shown: its pieces and people, and the stairwells going down from it */
  stairwells(vx0, vy0, vx1, vy1);
  for (const [i, p] of M.objs.entries()) {
    const L = levelOf(p); if (L !== TW.top) continue;
    const [w, d] = footprint(p);
    items.push({ key: (p.y + d) * T - 1, L, o: 1, i, p, w, d });
  }
  M.chars.forEach((c, k) => { const q = charPos(k); if (q.L !== TW.top) return; items.push({ key: q.gy, L: q.L, o: 2, k, q }); });
  items.sort((a, b) => a.key - b.key || a.L - b.L || a.o - b.o);
  const hero = items.find(it => it.o === 2 && it.k === TW.hero), hb = hero ? [hero.q.fx - 8, hero.q.fy - 30, hero.q.fx + 8, hero.q.fy] : null;
  for (const it of items) {
    if (it.o === 2) { drawChar(it.k, it.q, vx0, vy0, vx1, vy1, sc); continue; }
    const s = pieceOn(it, vx0, vy0, vx1, vy1); if (!s) continue;
    /* a piece standing in front of the hero fades, so they are never lost behind it */
    const fade = hb && it.key > hero.key && s.X < hb[2] && s.X + s.w > hb[0] && s.Y < hb[3] && s.Y + s.h > hb[1] && covers(s, s.X, s.Y, hb);
    if (fade) g.globalAlpha = 0.5;
    g.drawImage(s.can, s.X, s.Y);
    if (it.p.id === 'hearth') flicker(it.p, s);
    g.globalAlpha = 1;
  }
}
/* piece it as it stands on the surface: its sprite placed at the height of the ground at the middle of its front,
   and cut away where the ground in front of it rises over it (made once each time the storeys shown change) */
function pieceOn(it, vx0, vy0, vx1, vy1) {
  let c = TW.clipped.get(it.i);
  if (!c) {
    const p = it.p, sp = spriteOf(Object.assign({}, p, { links: TW.links.get(p) || null, box: p.id === 'stairs' ? flightOf(p) : null, ...TW.fit(p) })), z = lift((p.x + it.w / 2) * T, (p.y + it.d) * T - 4);
    c = { sp, w: sp.w, h: sp.h, X: p.x * T - sp.ox, Y: Math.round(p.y * T - z) - sp.oy, can: null }; TW.clipped.set(it.i, c);
  }
  if (c.X > vx1 || c.Y > vy1 || c.X + c.w < vx0 || c.Y + c.h < vy0) return null;
  if (!c.can) { c.px = clip(c.sp.px, c.w, c.h, c.X, c.Y, it.key); c.can = toCanvas(c.w, c.h, c.px); }
  return c;
}
/* the stairwells on storey L: each flight on the storey below whose top lands on L's floor, as { x, y, up, face } */
function wellsOf(M, L) {
  const out = []; if (!L) return out;
  for (const o of M.objs) {
    if (o.id !== 'stairs' || levelOf(o) !== L - 1) continue;
    const st = stairsAt(M, o.x, o.y, L - 1), [ux, uy] = st ? st.up : [-1, -1];
    if (ux < 0 || uy < 0 || ux >= M.S || uy >= M.S || !floorAt(M, L, uy * M.S + ux)) continue;
    out.push({ x: o.x, y: o.y, up: [ux, uy], face: o.face });
  }
  return out;
}
/* The way down from the floor shown: over each flight below, a well the flight's own size cut in the floor, its
   steps dropping away from the landing, each a shade deeper in the wood's own browns, edged in timber. Each keeps its box on screen for a click. */
function stairwells(vx0, vy0, vx1, vy1) {
  const M = TW.M, L = TW.top;
  for (const w of TW.wells || []) {
    const o = M.objs[stairsAt(M, w.x, w.y, L - 1).k], z = Math.round((M.elev[w.up[1] * M.S + w.up[0]] + STOREY * L) * LIFT), [bx0, by0, bx1, by1] = flightOf(o);
    const X = w.x * T + bx0, Y = w.y * T - z + by0, BW = bx1 - bx0, BH = by1 - by0; w.box = [X, Y, X + BW, Y + BH];
    if (X > vx1 || Y > vy1 || X + BW < vx0 || Y + BH < vy0) continue;
    /* steps run from the landing's edge (lit, near the floor's colour) down into shadow */
    const ux = w.up[0] - w.x, uy = w.up[1] - w.y, n = 8, along = uy ? BH : BW;
    g.fillStyle = '#4e3622'; g.fillRect(X - 2, Y - 2, BW + 4, BH + 4);
    for (let k = 0; k < n; k++) {
      /* from near the floor's own wood at the top step to a mid brown at the foot: lower, not lost in the dark */
      const t = 1 - k / (n - 1), shade = `rgb(${Math.round(112 + 64 * t)},${Math.round(82 + 52 * t)},${Math.round(52 + 36 * t)})`;
      const lo = Math.round(along * k / n), hi = Math.round(along * (k + 1) / n);
      /* k counts from the landing side */
      const [x0, y0, x1, y1] = uy < 0 ? [3, lo, BW - 3, hi] : uy > 0 ? [3, BH - hi, BW - 3, BH - lo] : ux < 0 ? [lo, 3, hi, BH - 3] : [BW - hi, 3, BW - lo, BH - 3];
      g.fillStyle = shade; g.fillRect(X + x0, Y + y0, x1 - x0, y1 - y0);
      g.fillStyle = 'rgba(43,33,22,0.42)'; if (uy) g.fillRect(X + x0, Y + (uy < 0 ? y1 - 1 : y0), x1 - x0, 1); else g.fillRect(X + (ux < 0 ? x1 - 1 : x0), Y + y0, 1, y1 - y0);
    }
    /* a timber rim round the well, open on the landing's side */
    g.fillStyle = '#5a3f28';
    if (uy >= 0) g.fillRect(X - 2, Y - 2, BW + 4, 3); if (uy <= 0) g.fillRect(X - 2, Y + BH - 1, BW + 4, 3);
    if (ux >= 0) g.fillRect(X - 2, Y - 2, 3, BH + 4); if (ux <= 0) g.fillRect(X + BW - 1, Y - 2, 3, BH + 4);
    /* and a banister round it on the sides away from the landing, as the flight below has: a rail standing RH above the
       rim on balusters, newel posts at its corners, a soft shadow east of it */
    const RH = 9, posts = [], rails = [];
    if (uy) { rails.push([X - 1, Y - 1, X - 1, Y + BH], [X + BW, Y - 1, X + BW, Y + BH]); const far = uy < 0 ? Y + BH : Y - 1; rails.push([X - 1, far, X + BW, far]); posts.push([X - 1, far], [X + BW, far], [X - 1, uy < 0 ? Y - 1 : Y + BH], [X + BW, uy < 0 ? Y - 1 : Y + BH]); }
    else { rails.push([X - 1, Y - 1, X + BW, Y - 1], [X - 1, Y + BH, X + BW, Y + BH]); const far = ux < 0 ? X + BW : X - 1; rails.push([far, Y - 1, far, Y + BH]); posts.push([far, Y - 1], [far, Y + BH], [ux < 0 ? X - 1 : X + BW, Y - 1], [ux < 0 ? X - 1 : X + BW, Y + BH]); }
    g.fillStyle = 'rgba(43,33,22,0.25)'; g.fillRect(X + BW + 2, Y - 2, 3, BH + 5);
    for (const [ax, ay, bx, by] of rails) {
      if (ay === by) { g.fillStyle = '#4e3622'; for (let x = ax + 2; x < bx - 1; x += 5) g.fillRect(x, ay - RH + 1, 1, RH - 1); g.fillStyle = '#c4a072'; g.fillRect(ax, ay - RH - 1, bx - ax + 1, 1); g.fillStyle = '#6b4c32'; g.fillRect(ax, ay - RH, bx - ax + 1, 1); }
      else { g.fillStyle = '#c4a072'; g.fillRect(ax - 1, ay - RH, 1, by - ay + 1); g.fillStyle = '#6b4c32'; g.fillRect(ax, ay - RH, 1, by - ay + 1); }
    }
    for (const [px, py] of posts) { g.fillStyle = '#6b4c32'; g.fillRect(px - 1, py - RH - 2, 3, RH + 3); g.fillStyle = '#c4a072'; g.fillRect(px - 1, py - RH - 3, 3, 1); g.fillStyle = '#4e3622'; g.fillRect(px + 1, py - RH - 2, 1, RH + 3); }
  }
}
/* a fireplace's fire, flickering: tongues of flame redrawn over the sprite's own each tick, their heights wandering */
function flicker(p, s) {
  const F = FIRE(p); if (!F) return;
  const x = s.X + s.sp.ox + F.x, y = s.Y + s.sp.oy + F.y, t = TW.tick;
  for (let i = -F.w; i <= F.w; i++) {
    const q = 1 - Math.abs(i) / (F.w + 1), hh = Math.max(1, Math.round(F.h * q * (0.45 + 0.55 * h2(i + 40, t, 43))));
    for (let k = 0; k < hh; k++) { const f = k / hh; g.fillStyle = f > 0.72 ? '#c8502a' : f > 0.42 || Math.abs(i) > F.w * 0.6 ? '#f08a2a' : q > 0.6 && f < 0.25 ? '#fff4c0' : '#f6d36a'; g.fillRect(x + i, y - k, 1, 1); }
  }
  /* now and then a spark above it */
  if (h2(t, 5, 44) < 0.5) { g.fillStyle = '#f6d36a'; g.fillRect(x + Math.round((h2(t, 6, 45) - 0.5) * F.w * 1.5), y - F.h - 2 - Math.round(h2(t, 7, 46) * 4), 1, 1); }
}
/* the water's ripples: short lit dashes drifting to and fro, wherever the water is in sight */
function ripples(vx0, vy0, vx1, vy1) {
  const F = TW.F, n = S(); g.fillStyle = 'rgba(240,246,240,0.75)';
  for (let ty = Math.max(0, Math.floor(vy0 / T)); ty < n && ty * T < vy1 + F.maxH * LIFT; ty++) for (let tx = Math.max(0, Math.floor(vx0 / T)); tx < n && tx * T < vx1; tx++) {
    const u = ty * n + tx; if (!isWater(F, u)) continue;
    for (let k = 0; k < 3; k++) {
      const ph = (TW.tick + k * 3 + Math.floor(h2(tx, ty, k) * 8)) % 8, gx = tx * T + 4 + Math.floor(h2(tx, ty, k + 10) * (T - 12)) + (ph < 4 ? ph : 8 - ph), gy = ty * T + 4 + Math.floor(h2(tx, ty, k + 20) * (T - 8)), len = [2, 3, 4, 3, 2, 0, 0, 0][ph];
      if (!len) continue;
      const Y = Math.round(gy - F.hgt[u] * LIFT); if (Math.abs(depthAt(gx, Y) - 1 - gy) > 2) continue;
      g.fillRect(gx, Y, len, 1);
    }
  }
}
/* does the sprite's body (not its shadow) cover any of a few points on the figure in box b? */
function covers(s, X, Y, b) {
  for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.15, 0.5, 0.85]) {
    const x = Math.floor(b[0] + (b[2] - b[0]) * fx - X), y = Math.floor(b[1] + (b[3] - b[1]) * fy - Y);
    if (x >= 0 && y >= 0 && x < s.w && y < s.h && s.px[(y * s.w + x) * 4 + 3] === 255) return true;
  }
  return false;
}
/* A figure that ground hides in part is cut away into a canvas of its own character's, never one shared: a phone's
   browser may read a canvas drawn from only when the frame is shown, so one canvas rewritten for each walker in turn
   showed every walker as whichever was cut last. */
const cuts = [];
const cutFor = k => cuts[k] || (cuts[k] = (c => ({ can: c, g: c.getContext('2d') }))(canvasOf(W, H)));
function drawChar(k, q, vx0, vy0, vx1, vy1, sc) {
  const c = TW.M.chars[k], ch = characterById(c.sprite) || characterById('villager'), pose = !q.moving ? 0 : q.dist != null ? WALK[Math.floor(q.dist / STRIDE) % WALK.length] : WALK[Math.floor(q.d * STRIDES) % WALK.length];
  /* placed to the nearest device pixel, so a walker glides with the camera; what hides it is worked out on the art
     pixel it is nearest */
  const view = q.face === 2 ? 'back' : 'front', flip = q.face === 1, x = Math.round(q.fx * sc) / sc, y = Math.round(q.fy * sc) / sc, X = x - W / 2, Y = y - BASE - 1;
  /* the hero's pose as last drawn, for tests to see the walk cycle turn */
  if (k === TW.hero) TW.heroPose = view + pose;
  if (X > vx1 || Y > vy1 || X + W < vx0 || Y + H < vy0) return;
  /* the figure and its shadow, cut away wherever the ground shown lies in front of where it stands */
  g.fillStyle = 'rgba(43,33,22,0.32)'; g.beginPath(); g.ellipse(x + 1, y, 7, 2.5, 0, 0, Math.PI * 2); g.fill();
  const f = figure(ch, view, pose), ax = Math.round(X), ay = Math.round(Y); let can = f.can;
  if (hidden(ax, ay, W, H, q.gy)) { const cut = cutFor(k), im = cut.g.createImageData(W, H); im.data.set(clip(f.px, W, H, ax, ay, q.gy, flip)); cut.g.putImageData(im, 0, 0); can = cut.can; }
  if (flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(can, -W / 2, Y); g.restore(); } else g.drawImage(can, X, Y);
  /* the hero wears a small gold marker overhead until they first move */
  if (k === TW.hero && !TW.moved) { g.fillStyle = '#c9a24f'; const ty = y - 40 - (TW.tick % 2); g.beginPath(); g.moveTo(x - 4, ty); g.lineTo(x + 4, ty); g.lineTo(x, ty + 5); g.closePath(); g.fill(); g.strokeStyle = '#2b2116'; g.lineWidth = 1; g.stroke(); }
}

/* ---------- the place panel ---------- */
function place() {
  const M = TW.M, c = M.chars[TW.hero];
  if (!c) { $('twHint').textContent = 'No one stands on this map: place characters in the editor, then come back to walk about'; $('twPlace').hidden = true; return; }
  const ch = characterById(c.sprite), L = levelOf(c), u = c.y * M.S + c.x, Tn = L ? TERRAIN[M.floors[L - 1][u] - 1] : TERRAIN[M.terr[u]];
  $('twPlace').hidden = false; $('twHero').textContent = ch ? ch.name : c.sprite; $('twWhere').textContent = `${Tn ? Tn.label : ''}${L ? ` · floor ${L}` : ''}`;
  $('twHint').textContent = touchy() ? (TW.say ? 'Tap to close' : TW.stack.length ? 'Tap the doorway to go out' : 'Drag to walk · tap a spot to go there') : TW.say ? 'Space to close' : TW.stack.length ? 'Walk out through the doorway, or Esc, to go outside' : 'Walk with the arrow keys · Space to talk';
}
/* is this a touch screen, with no mouse to point with? */
const touchy = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/* ---------- the frame ---------- */
let raf = 0;
function loop(now) {
  raf = 0; if (!TW.open) return;
  const dt = Math.min(0.1, (now - (TW.lastT || now)) / 1000); TW.lastT = now;
  if (TW.busy) { veiled(now); if (painters.length) pump(); next(); return; }
  for (const [k, st] of TW.steps) { st.t += dt * NPC_SPEED; if (st.t >= 1) TW.steps.delete(k); TW.dirty = true; }
  heroTick(dt);
  stroll(dt);
  /* the ripples, the fire and the hero's marker tick over a few times a second */
  const tick = Math.floor(now / 260); if (tick !== TW.tick) { TW.tick = tick; TW.dirty = true; }
  if (TW.dirty) { TW.dirty = false; paint(); }
  /* the painters work ahead of the camera; with none, the ground just off screen is painted here, one chunk a frame,
     only while the hero stands still so a walk never waits on it */
  if (painters.length) pump(); else if (!(TW.me && TW.me.moving)) fillOne();
  next();
}
/* One frame is asked for at a time. Something done during a frame may already have asked for the next (a transition
   does); asking again would run two loops a frame, the second seeing no time pass and so drawing the hero stood still
   in mid-stride, a little more of it after each transition. */
const next = () => { if (!raf && TW.open) raf = requestAnimationFrame(loop); };
const req = () => { TW.dirty = true; if (!raf && TW.open) raf = requestAnimationFrame(loop); };
function fillOne() {
  const n = Math.ceil(S() * T / CHUNK), mx = Math.floor(TW.cam.x / CHUNK), my = Math.floor(TW.cam.y / CHUNK);
  for (let r = 0; r <= 2; r++) for (let cy = my - r; cy <= my + r; cy++) for (let cx = Math.max(0, mx - r); cx <= Math.min(n - 1, mx + r); cx++) {
    if (cy * CHUNK >= S() * T || TW.chunks.has(keyOf(cx, cy))) continue;
    chunk(cx, cy); return;
  }
}

/* ---------- input ---------- */
/* the art pixel under a point on the screen, and the tile whose ground it shows: [x, y, storey, art x, ground row,
   art y] */
function artAt(e) {
  const r = cv.getBoundingClientRect(), sc = scale(), [tx, ty] = offset(sc), k = r.width ? cv.width / r.width : TW.dpr;
  return [((e.clientX - r.left) * k - tx) / sc, ((e.clientY - r.top) * k - ty) / sc];
}
function tileAt(e) {
  const [wx, wy] = artAt(e), d = depthAt(wx, wy);
  /* the ground under the point is the row its pixel shows */
  if (!d) return null;
  const x = Math.floor(wx / T), y = Math.floor((d - 1) / T); return [x, y, TW.F.lev[y * S() + x], wx, d - 1, wy];
}
/* a click or a tap: on the hero, talk to whoever they face; on someone else, walk up to them and talk; anywhere
   else, walk there */
function tapAt(e) {
  if (TW.busy) return;
  const t = tileAt(e), M = TW.M, k = TW.hero; if (!M.chars[k] || !TW.me) return;
  /* a stairwell (over the dark, so before the ground is asked): to its landing and on down */
  const [ax, ay] = artAt(e), well = TW.top ? (TW.wells || []).find(w => w.box && ax >= w.box[0] - 4 && ax < w.box[2] + 4 && ay >= w.box[1] - 4 && ay < w.box[3] + 4) : null;
  if (well) { TW.moved = true; TW.stuck = 0; if (TW.say) closeSay(); const lx = well.up[0] * T + T / 2, ly = well.up[1] * T + FOOT; TW.path = routeTo(lx, ly, TW.top); TW.path.push([well.x * T + T / 2, well.y * T + FOOT, TW.top]); TW.talkTo = -1; req(); return; }
  if (!t) return;
  TW.moved = true; TW.stuck = 0;
  const h = charPos(k);
  if (Math.abs(t[3] - h.fx) < 9 && t[5] > h.fy - 32 && t[5] < h.fy + 3) { TW.path = []; TW.talkTo = -1; talk(); req(); return; }
  if (TW.say) closeSay();
  /* a building with an interior: walk to its door and on in, by pressing on into it */
  const b = !TW.stack.length && buildingAtPoint(...artAt(e));
  if (b) { const [w, d] = footprint(b), x = (b.x + w * doorAcross(b)) * T, y = (b.y + d) * T; TW.path = routeTo(x, y + FOOT_R + 2, 0); TW.path.push([x, y - 12]); TW.talkTo = -1; req(); return; }
  /* a doorway in the room's outer wall: walk to it and on out */
  const out = TW.stack.length && !t[2] && doorways(M).find(([x, y]) => x === t[0] && y === t[1]);
  if (out) { const [x, y, side] = out, [fx, fy] = FACE_DELTA[side], cx = x * T + T / 2, cy = y * T + T / 2; TW.path = routeTo(cx, cy, 0); TW.path.push([cx + fx * T, cy + fy * T]); TW.talkTo = -1; req(); return; }
  const j = M.chars.findIndex((o, i) => i !== k && o.x === t[0] && o.y === t[1] && levelOf(o) === t[2]);
  if (j >= 0) { const q = charPos(j); TW.path = routeTo(q.fx, q.gy + (TW.me.y > q.gy ? 14 : -14), t[2]); TW.talkTo = j; }
  else {
    /* a flight of stairs: up it, to the landing on the floor above (the editor's walking rule) */
    const [gx, gy, gL] = walkGoal(M, k, t[0], t[1], t[2]);
    TW.path = gL !== t[2] ? routeTo(gx * T + T / 2, gy * T + FOOT, gL) : routeTo(t[3], t[4], t[2]); TW.talkTo = -1;
  }
  req();
}
/* the building with an interior drawn at art pixel (x, y), the one in front where they overlap */
function buildingAtPoint(x, y) {
  let best = null, key = -Infinity;
  TW.M.objs.forEach((o, i) => {
    const c = TW.clipped.get(i); if (!o.interior || levelOf(o) || !c || !c.px) return;
    const px = Math.floor(x - c.X), py = Math.floor(y - c.Y); if (px < 0 || py < 0 || px >= c.w || py >= c.h || c.px[(py * c.w + px) * 4 + 3] < 128) return;
    const k = o.y + footprint(o)[1]; if (k > key) { key = k; best = o; }
  });
  return best;
}
/* A mouse acts as it is pressed. A finger (or pen) waits to see what it does: lifted where it went down, it taps
   (and a tap while someone is speaking closes what they said); dragged, it becomes a stick the hero walks by, its
   pull measured from where it went down (STICK CSS pixels for a full walk, the start dragged along behind a finger
   pulled further than a run); a second finger pinches the zoom a step at a time. */
const STICK = 44, fingers = new Map(), stickEl = $('twStick'), knob = stickEl.firstElementChild;
let gesture = null;
function showStick(x0, y0, dx, dy) {
  const r = root.getBoundingClientRect(), d = Math.hypot(dx, dy), k = d > STICK ? STICK / d : 1;
  stickEl.style.left = `${x0 - r.left}px`; stickEl.style.top = `${y0 - r.top}px`; stickEl.hidden = false;
  knob.style.transform = `translate(${dx * k}px,${dy * k}px)`; stickEl.classList.toggle('run', d > STICK * 1.3);
}
function dropStick() { if (TW.stick) { TW.stick = null; req(); } stickEl.hidden = true; }
const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
cv.addEventListener('pointerdown', e => {
  if (!TW.open) return;
  if (e.pointerType === 'mouse') { if (e.button === 0) tapAt(e); return; }
  e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (fingers.size === 1) gesture = { kind: 'tap', id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now() };
  else { dropStick(); gesture = fingers.size === 2 ? { kind: 'pinch', d0: spread() } : { kind: 'none' }; }
});
cv.addEventListener('pointermove', e => {
  const f = fingers.get(e.pointerId); if (!f || !gesture) return;
  f.x = e.clientX; f.y = e.clientY;
  if (gesture.kind === 'pinch' && fingers.size === 2) {
    const d = spread(), r = d / gesture.d0;
    if (r > 1.3 || r < 0.77) { setZoom(TW.zoom + (r > 1 ? 1 : -1)); gesture.d0 = d; req(); }
    return;
  }
  if (gesture.id !== e.pointerId) return;
  let dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
  if (gesture.kind === 'tap' && Math.hypot(dx, dy) > 10) { gesture.kind = 'stick'; TW.moved = true; TW.talkTo = -1; if (TW.say) closeSay(); }
  if (gesture.kind !== 'stick') return;
  const d = Math.hypot(dx, dy), far = STICK * 1.6;
  if (d > far) { gesture.x0 += dx * (1 - far / d); gesture.y0 += dy * (1 - far / d); dx = e.clientX - gesture.x0; dy = e.clientY - gesture.y0; }
  TW.stick = { x: dx / STICK, y: dy / STICK }; showStick(gesture.x0, gesture.y0, dx, dy); req();
});
function letGo(e) {
  if (!fingers.delete(e.pointerId) || !gesture) return;
  if (gesture.id === e.pointerId) {
    if (gesture.kind === 'tap' && e.type === 'pointerup' && performance.now() - gesture.t0 < 600) { if (TW.say) { closeSay(); req(); } else tapAt(e); }
    if (gesture.kind === 'stick') dropStick();
  }
  if (!fingers.size) gesture = null; else if (gesture && gesture.kind !== 'none') { dropStick(); gesture = { kind: 'none' }; }
}
cv.addEventListener('pointerup', letGo); cv.addEventListener('pointercancel', letGo); cv.addEventListener('lostpointercapture', letGo);
cv.addEventListener('contextmenu', e => { if (TW.open) e.preventDefault(); });
cv.addEventListener('wheel', e => { e.preventDefault(); const i = ZOOMS.indexOf(TW.zoom); setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1)))]); req(); }, { passive: false });
root.addEventListener('keydown', e => {
  if (!TW.open) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k in DIRS) { if (!e.repeat) { TW.held = TW.held.filter(d => d !== DIRS[k]); TW.held.push(DIRS[k]); TW.moved = true; if (TW.say) closeSay(); } }
  else if (k === 'Shift') TW.run = true;
  else if (k === ' ' || k === 'Enter') { if (!e.repeat) talk(); }
  else if (k === 'Tab') { nextHero(e.shiftKey ? -1 : 1); }
  else if (k === '+' || k === '=') setZoom(TW.zoom + 1); else if (k === '-' || k === '_') setZoom(TW.zoom - 1);
  else if (k === 'Escape') { if (TW.busy) { /* on the way somewhere */ } else if (TW.say) closeSay(); else if (TW.stack.length) goOut(); else closeTown(); }
  else return;
  e.preventDefault(); req();
});
root.addEventListener('keyup', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (k in DIRS) TW.held = TW.held.filter(d => d !== DIRS[k]); else if (k === 'Shift') TW.run = false; });
root.addEventListener('blur', () => { TW.held = []; TW.run = false; });
/* let go of everything held when the page is put away, so the hero is not still walking when it comes back */
document.addEventListener('visibilitychange', () => { if (document.hidden) { TW.held = []; TW.run = false; fingers.clear(); gesture = null; dropStick(); } });
function nextHero(d = 1) {
  /* inside a building the hero stays who went in, so they come out again */
  const n = TW.M.chars.length; if (n < 2 || TW.stack.length) return;
  TW.hero = (TW.hero + d + n) % n; TW.path = []; TW.talkTo = -1; if (TW.say) closeSay();
  takeHero(); setTop(TW.me.L); place(); req();
}

/* the hero's free position, from the tile the character stands on */
function takeHero() {
  const c = TW.M.chars[TW.hero]; TW.steps.delete(TW.hero);
  TW.me = c ? { x: c.x * T + T / 2, y: c.y * T + FOOT, L: levelOf(c), face: c.face | 0, dist: 0, moving: false, z: null } : null;
  if (TW.me && TW.G0) settle(0);
}

/* ---------- open and close ---------- */
/* opts: hero, the index of the character to walk as (default the one picked in the editor, else the first); zoom;
   inside: { x, y }, a tile of a building with an interior to start in, the hero having just come in at its door */
/* The whole map is walked, with its interiors; the editor inside a building starts the walk in there, as whoever is
   picked in the room, else the map's hero walking in at the door. */
function openTown(opts = {}) {
  if (!ED.M) return;
  const room = ED.outer, M = cloneModel(rootModel());
  TW.open = true; root.hidden = false; TW.held = []; TW.moved = false; TW.lastT = 0; TW.stack = []; TW.inside = new Map(); TW.busy = null;
  startPainters();
  useMap(M, opts.hero ?? (!room && ED.sel >= 0 && ED.M.chars[ED.sel] ? ED.sel : 0));
  if (room) { const o = M.objs[room.M.objs.indexOf(room.piece)]; if (o && o.interior) enter(o, ED.sel >= 0 && ED.M.chars[ED.sel] ? ED.sel : M.chars.length ? -1 : 0); }
  /* a scene can start inside a building: opts.inside is any tile it covers */
  else if (opts.inside) { const { x, y } = opts.inside, o = M.objs.find(p => p.interior && !levelOf(p) && x >= p.x && y >= p.y && x < p.x + footprint(p)[0] && y < p.y + footprint(p)[1]); if (o) enter(o); }
  size();
  setZoom(opts.zoom || Math.max(2, Math.min(5, Math.round(TW.cw / (15 * T)))));
  closeSay(); syncInside(); place();
  /* the view opens dark, with the loading figure, and the place's name shows as it comes up, as a town's does on
     entering it */
  transition(() => {}, { name: TW.M.name, view: 'front', instant: true });
  root.focus({ preventScroll: true }); req();
}
function closeTown() {
  if (!TW.open) return; TW.open = false; root.hidden = true; if (raf) cancelAnimationFrame(raf); raf = 0; TW.steps.clear();
  TW.busy = null; veil.classList.remove('on', 'loading', 'instant');
  fingers.clear(); gesture = null; dropStick();
  /* the painted ground is let go with the view; the workers stay, idle, for the next time it opens */
  for (const c of TW.chunks.values()) if (c.can.close) c.can.close();
  TW.chunks.clear(); TW.clipped.clear(); lastKey = NaN; lastChunk = null;
  $('edCanvas').focus({ preventScroll: true });
}

$('twBack').addEventListener('click', closeTown);
$('twNext').addEventListener('click', () => { nextHero(1); root.focus({ preventScroll: true }); });
$('twIn').addEventListener('click', () => { setZoom(TW.zoom + 1); req(); }); $('twOut').addEventListener('click', () => { setZoom(TW.zoom - 1); req(); });
$('twLeave').addEventListener('click', () => { goOut(); root.focus({ preventScroll: true }); req(); });
$('twTalk').addEventListener('click', () => { TW.moved = true; TW.path = []; TW.talkTo = -1; talk(); req(); });
$('editor').addEventListener('keydown', e => { if (ED.open && !TW.open && (e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { e.preventDefault(); openTown(); } });
/* on a resize the canvas is sized and painted again at once, before the browser shows it, so it never flashes blank
   (as it does on a phone each time the address bar slides in or out) */
const resized = new ResizeObserver(([en]) => {
  if (!TW.open) return;
  const box = en && en.devicePixelContentBoxSize && en.devicePixelContentBoxSize[0];
  size(box); if (!TW.busy) { TW.dirty = false; paint(); } req();
});
try { resized.observe(cv, { box: 'device-pixel-content-box' }); } catch { resized.observe(cv); }
/* test hook */
window.__town = { state: TW, open: openTown, close: closeTown, isOpen: () => TW.open, talk, nextHero, flight: (x, y, L = 0) => { const st = stairsAt(TW.M, x, y, L); return st ? flightMap(TW.M.objs[st.k]) : null; }, walkPoint: (x, y, L = 0) => { TW.path = routeTo(x, y, L); TW.moved = true; req(); }, inside: () => TW.stack.length > 0, goIn: (x, y) => { const o = TW.M.objs.find(p => p.interior && !levelOf(p) && x >= p.x && y >= p.y && x < p.x + footprint(p)[0] && y < p.y + footprint(p)[1]); return o ? goIn(o) : false; }, goOut, doorAt, walkTo: (x, y, L = 0) => { const ok = !!findPath(TW.M, TW.hero, x, y, L); TW.path = routeTo(x * T + T / 2, y * T + FOOT, L); TW.moved = true; req(); return ok; }, standable: (L, x, y) => standable(L, x, y, heightOn(L, x, y) ?? 0), heightOn, probe: (L, x, y) => ({ h: heightOn(L, x, y), dry: dry(L, x, y), hit: hits(TW.shapes.get(L), x, y, FOOT_R) }) };

export { closeTown, openTown };
