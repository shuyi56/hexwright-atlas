import { characterById } from '../characters/library.js';
import { lookOf } from '../characters/draw.js';
import { BASE } from '../characters/body.js';
import { H, W } from '../characters/pixels.js';
import { WALK, renderScaled } from '../characters/roster.js';
import { unitFor } from '../data/units.js';
import { ED } from '../editor/editor.js';
import { MAX_LEVEL, STOREY, cloneModel, floorAt, levelOf } from '../editor/model.js';
import { FACE_DELTA, findPath, neighbours, stairsAt } from '../editor/walk.js';
import { ASSET_BY_ID, TERRAIN, footprint, wallLinks } from '../tiles/index.js';
import { $, state } from '../ui/state.js';
import { CHUNK, INFO, LIFT, TILE, cellAt, fieldOf, h2, heightAt, isWater, renderChunk } from './ground.js';
import { hits, shapesOf } from './collide.js';
import { pieceSprite } from './pieces.js';
import { lineFor, sightFor } from './talk.js';

/* ================= town view: the screen =================
   The editor's map walked the way the old town RPGs are: looked down on from the south, square tiles, the ground
   painted solid (town/ground.js), houses, trees and furniture standing up from it (town/pieces.js). One character
   is the hero: the arrow keys or WASD walk them a tile at a time (Shift runs), and they turn to face a way
   that is blocked; a click walks them to any tile they can reach, up and down stairs. Space or Enter talks to
   whoever they face, or looks at the piece or ground in front of them. Tab hands the hero's part to the next
   character. Everyone else strolls about near where they were put. Only the floors up to the hero's own are shown.
   The ground is drawn in CHUNK-square pieces as they come into view, each with a depth buffer (which row of ground
   every pixel shows); a piece or figure is cut away wherever the ground shown there lies in front of where it
   stands, so a rise or cliff hides what is behind it.
   Walking here is a stroll, not an edit: the map is left as it was, and opening the view again starts afresh. */
const root = $('town'), cv = $('twCanvas'), g = cv.getContext('2d');
/* figures at three quarters of their sprite, as in the tactical view: about 30 pixels tall, so a one-tile cottage
   still stands over them */
const FIGURE_SCALE = 0.75;
/* The hero walks HERO_SPEED art pixels a second (about three of their own heights; RUN times that with Shift) and
   takes a stride every STRIDE pixels, so the feet plant on the ground instead of gliding over it. The others stroll
   NPC_SPEED tiles a second, STRIDES strides to a tile. A walker's feet are a circle FOOT_R across. */
const HERO_SPEED = 84, RUN = 1.85, STRIDE = 7, NPC_SPEED = 0.8, STRIDES = 8, FOOT_R = 5;
const T = TILE, ZOOMS = [1, 2, 3, 4, 5, 6], FOOT = T / 2 + 6;
const TW = { open: false, M: null, hero: 0, top: 0, zoom: 3, cam: { x: 0, y: 0 }, steps: new Map(), path: [], held: [], run: false, F: null, chunks: new Map(), clipped: new Map(), sprites: new Map(), say: null, talkTo: -1, lastT: 0, tick: 0, dirty: true, cw: 0, ch: 0, homes: [], rest: [], pending: [], banner: 0 };

/* ---------- caches: the painted ground, cliffs, pieces and figures as canvases ---------- */
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
function toCanvas(w, h, px) { const c = canvasOf(w, h), cg = c.getContext('2d'), d = cg.createImageData(w, h); d.data.set(px); cg.putImageData(d, 0, 0); return c; }
/* the surface for the storeys shown, and its chunks: { can, depth } keyed by chunk column and row */
function buildField() { TW.F = fieldOf(TW.M, TW.top); TW.chunks.clear(); TW.clipped.clear(); TW.pending = []; TW.filled = false; TW.dirty = true; }
function chunk(cx, cy) {
  const key = cx + ',' + cy; let c = TW.chunks.get(key);
  if (!c) {
    if (TW.chunks.size > 600) TW.chunks.delete(TW.chunks.keys().next().value);
    const r = renderChunk(TW.F, cx * CHUNK, cy * CHUNK);
    c = { can: toCanvas(CHUNK, CHUNK, r.px), depth: r.depth, empty: !r.depth.some(v => v) }; TW.chunks.set(key, c);
  }
  return c;
}
/* 1 + the row of ground shown at art pixel (X, Y), 0 for none */
function depthAt(X, Y) {
  X = Math.floor(X); Y = Math.floor(Y); const cx = Math.floor(X / CHUNK), cy = Math.floor(Y / CHUNK);
  if (X < 0 || X >= S() * T) return 0;
  return chunk(cx, cy).depth[(Y - cy * CHUNK) * CHUNK + X - cx * CHUNK];
}
/* rgba with every pixel cut away where the ground at screen (X + i, Y + j) is further south than row base */
function clip(px, w, h, X, Y, base, flip = false) {
  const out = new Uint8ClampedArray(px);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const o = (j * w + i) * 4; if (!out[o + 3]) continue; const d = depthAt(X + (flip ? w - 1 - i : i), Y + j); if (d - 1 > base) out[o + 3] = 0; }
  return out;
}
function spriteOf(o) {
  const key = `${o.id}|${o.face || 0}|${Math.round((o.v ?? 0.5) * 20)}|${o.links ? o.links.join('') : ''}`; let s = TW.sprites.get(key);
  if (!s) { const im = pieceSprite(o); s = { can: toCanvas(im.w, im.h, im.px), px: im.px, ox: im.ox, oy: im.oy, w: im.w, h: im.h }; TW.sprites.set(key, s); }
  return s;
}
const scaled = new Map();
const framesOf = c => { let f = scaled.get(lookOf(c)); if (!f) { if (scaled.size > 64) scaled.clear(); f = renderScaled(c, FIGURE_SCALE); scaled.set(lookOf(c), f); } return f; };
/* ---------- where things are ---------- */
const S = () => TW.M.S;
/* how high the surface stands at map pixel (gx, gy), in art pixels */
const lift = (gx, gy) => heightAt(TW.F, Math.round(gx), Math.round(gy)) * LIFT;
function charPos(k) {
  if (k === TW.hero && TW.me) { const m = TW.me; return { fx: m.x, fy: m.y - heightOn(m.L, m.x, m.y) * LIFT, gy: Math.round(m.y), L: m.L, face: m.face, moving: m.moving, dist: m.dist }; }
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
/* the height the hero stands at on storey L, at map pixel (x, y), in levels: the ground (or the floor), raised
   along a flight of stairs from its foot to its top; null where storey L has no floor */
function heightOn(L, x, y) {
  const M = TW.M, n = M.S, tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 0 || ty < 0 || tx >= n || ty >= n) return null;
  const u = ty * n + tx; let h;
  if (L) { if (!floorAt(M, L, u)) return null; h = M.elev[u] + STOREY * L; } else h = heightAt(TW.G0, Math.round(x), Math.round(y));
  const st = stairsAt(M, tx, ty, L);
  if (st) { const dx = st.up[0] - tx, dy = st.up[1] - ty, lx = x / T - tx, ly = y / T - ty; h += STOREY * (dx > 0 ? lx : dx < 0 ? 1 - lx : dy > 0 ? ly : 1 - ly); }
  return h;
}
const dry = (L, x, y) => { if (L) return true; const k = cellAt(TW.G0, Math.round(x), Math.round(y)); return k >= 0 && !INFO[k].water && INFO[k].face !== 'lava'; };
/* the storey a step from (ax, ay) to (bx, by) on storey L lands on: up or down a flight, else the same */
function storeyAfter(L, ax, ay, bx, by) {
  const M = TW.M, A = [Math.floor(ax / T), Math.floor(ay / T)], B = [Math.floor(bx / T), Math.floor(by / T)];
  if (A[0] === B[0] && A[1] === B[1]) return L;
  const st = stairsAt(M, A[0], A[1], L); if (st && L < MAX_LEVEL && st.up[0] === B[0] && st.up[1] === B[1]) return L + 1;
  if (L > 0) { const dn = stairsAt(M, B[0], B[1], L - 1); if (dn && dn.up[0] === A[0] && dn.up[1] === A[1]) return L - 1; }
  return L;
}
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
      const nx = m.x + ex, ny = m.y + ey, L = storeyAfter(m.L, m.x, m.y, nx, ny);
      if (standable(L, nx, ny, h)) { m.x = nx; m.y = ny; gone += Math.hypot(ex, ey); moved = true; if (L !== m.L) { m.L = L; setTop(L); } break; }
    }
    if (!moved) break;
  }
  /* the hero's tile, so the others step round it and talk finds them */
  const c = TW.M.chars[TW.hero]; c.x = Math.floor(m.x / T); c.y = Math.floor(m.y / T); c.face = m.face; if (m.L) c.level = m.L; else delete c.level;
  return gone;
}
const FACE_OF = (vx, vy) => (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 1 : 3) : (vy > 0 ? 0 : 2));
function heroTick(dt) {
  const m = TW.me; if (!m) return;
  let vx = 0, vy = 0;
  for (const d of TW.held) { vx += FACE_DELTA[d][0]; vy += FACE_DELTA[d][1]; }
  if (vx || vy) TW.path = [];
  else if (TW.path.length) {
    /* following a route: toward the next point, dropping it once there or once stuck on it */
    const [px, py] = TW.path[0], ex = px - m.x, ey = py - m.y, d = Math.hypot(ex, ey);
    if (d < 1.5) { TW.path.shift(); TW.stuck = 0; } else { vx = ex / d; vy = ey / d; }
  }
  if (vx || vy) {
    const len = Math.hypot(vx, vy), sp = HERO_SPEED * (TW.run ? RUN : 1) * dt;
    m.face = FACE_OF(vx, vy);
    const gone = moveHero(vx / len * sp, vy / len * sp);
    m.dist += gone; m.moving = gone > 0.05;
    if (!m.moving && TW.path.length) { TW.stuck = (TW.stuck || 0) + dt; if (TW.stuck > 0.4) TW.path = []; }
    TW.dirty = true;
  } else if (m.moving) { m.moving = false; TW.dirty = true; place(); }
  /* walked up to someone to talk to them */
  if (TW.talkTo >= 0) {
    const q = charPos(TW.talkTo), d = Math.hypot(q.fx - m.x, q.gy - m.y);
    if (q.L === m.L && (d < 24 || (!TW.path.length && d < T + 10))) { const j = TW.talkTo; m.face = FACE_OF(q.fx - m.x, q.gy - m.y); TW.path = []; TW.talkTo = -1; TW.chase = 0; m.moving = false; talk(j); }
    /* they strolled off: follow a little way, then give up */
    else if (!TW.path.length) { if (q.L === m.L && d < 4 * T && (TW.chase = (TW.chase || 0) + 1) < 4) TW.path = routeTo(q.fx, q.gy + (m.y > q.gy ? 14 : -14), q.L); else { TW.talkTo = -1; TW.chase = 0; } }
  }
}
/* a route for the hero to (x, y) in map pixels on storey L: through the middles of the tiles on the editor's
   walking route, then to the point itself; or straight there if there is no route */
function routeTo(x, y, L) {
  const M = TW.M, k = TW.hero, tx = Math.floor(x / T), ty = Math.floor(y / T), tiles = findPath(M, k, tx, ty, L);
  const pts = (tiles || []).slice(0, -1).map(([a, b]) => [a * T + T / 2, b * T + FOOT]);
  pts.push([x, y]); return pts;
}
/* the others stroll: now and then one takes a step, staying within two tiles of where it was put */
function stroll(dt) {
  const M = TW.M;
  M.chars.forEach((c, k) => {
    if (k === TW.hero || TW.steps.has(k) || (TW.say && TW.say.k === k) || unitFor(c.sprite).group === 'enemies') return;
    TW.rest[k] = (TW.rest[k] ?? 1 + Math.random() * 3) - dt; if (TW.rest[k] > 0) return;
    TW.rest[k] = 1.5 + Math.random() * 4;
    const home = TW.homes[k], dir = Math.floor(Math.random() * 4), to = stepToward(k, dir);
    if (Math.random() < 0.35 || !to || to[2] !== levelOf(c) || Math.abs(to[0] - home[0]) + Math.abs(to[1] - home[1]) > 2) { c.face = dir; TW.dirty = true; return; }
    beginStep(k, to);
  });
}

/* ---------- talking and looking ---------- */
/* talk to `to` (someone the hero walked up to), else whoever stands just in front of the hero, else look at the piece
   or ground there */
function talk(to = -1) {
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
    const x = Math.floor(px / T), y = Math.floor(py / T); if (x < 0 || y < 0 || x >= M.S || y >= M.S) return;
    const piece = M.objs.find(o => (o.level || 0) === L && x >= o.x && y >= o.y && x < o.x + footprint(o)[0] && y < o.y + footprint(o)[1]);
    const ground = L ? (M.floors[L - 1] && M.floors[L - 1][y * M.S + x] ? TERRAIN[M.floors[L - 1][y * M.S + x] - 1] : null) : TERRAIN[cellAt(TW.G0, Math.round(px), Math.round(py))];
    const line = sightFor(piece ? ASSET_BY_ID[piece.id] : null, ground, M.name); if (!line) return;
    TW.say = { k: -1, who: '', line };
  }
  $('twWho').textContent = TW.say.who; $('twWho').hidden = !TW.say.who; $('twLine').textContent = TW.say.line; $('twSay').hidden = false; TW.dirty = true;
}
function closeSay() { TW.say = null; $('twSay').hidden = true; TW.dirty = true; }

/* ---------- the camera ---------- */
const scale = () => Math.max(1, Math.round(TW.zoom * state.dpr));
function size() { const r = root.getBoundingClientRect(); TW.cw = r.width; TW.ch = r.height; cv.width = Math.round(r.width * state.dpr); cv.height = Math.round(r.height * state.dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; TW.dirty = true; }
function setZoom(z) { TW.zoom = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z)); $('twZoom').textContent = `×${TW.zoom}`; TW.dirty = true; }
/* on the hero, kept inside the map where the map is bigger than the screen */
function follow() {
  const k = TW.hero, c = TW.M.chars[k]; let x = S() * T / 2, y = S() * T / 2;
  if (c) { const p = charPos(k); x = p.fx; y = p.fy - 16; }
  const sc = scale(), hw = cv.width / sc / 2, hh = cv.height / sc / 2, top = -TW.F.maxH * LIFT, w = S() * T, h = S() * T;
  TW.cam.x = w <= hw * 2 ? w / 2 : Math.max(hw, Math.min(w - hw, x));
  TW.cam.y = h - top <= hh * 2 ? (top + h) / 2 : Math.max(top + hh, Math.min(h - hh, y));
}
function setTop(L) { L = Math.max(0, Math.min(MAX_LEVEL, L)); if (L !== TW.top) { TW.top = L; buildField(); } place(); }

/* ---------- drawing ---------- */
function paint() {
  follow();
  const sc = scale(), Wd = cv.width, Hd = cv.height, tx = Math.round(Wd / 2 - Math.round(TW.cam.x) * sc), ty = Math.round(Hd / 2 - Math.round(TW.cam.y) * sc);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#141b1c'; g.fillRect(0, 0, Wd, Hd);
  g.setTransform(sc, 0, 0, sc, tx, ty); g.imageSmoothingEnabled = false;
  const vx0 = -tx / sc, vy0 = -ty / sc, vx1 = (Wd - tx) / sc, vy1 = (Hd - ty) / sc, M = TW.M, F = TW.F, n = S();
  /* the ground, chunk by chunk */
  for (let cy = Math.floor(vy0 / CHUNK); cy * CHUNK < vy1; cy++) for (let cx = Math.max(0, Math.floor(vx0 / CHUNK)); cx * CHUNK < Math.min(vx1, n * T); cx++) { const c = chunk(cx, cy); if (!c.empty) g.drawImage(c.can, cx * CHUNK, cy * CHUNK); }
  ripples(vx0, vy0, vx1, vy1);
  /* then everything standing on it, back to front by where it meets the ground */
  const items = [];
  /* what stands under a floor that is shown is hidden by it */
  const roofed = (x, y, L) => F.lev[y * n + x] > L;
  for (const [i, p] of M.objs.entries()) {
    const L = levelOf(p); if (L > TW.top) continue;
    const [w, d] = footprint(p); if (L < TW.top && roofed(p.x, p.y, L) && roofed(p.x + w - 1, p.y + d - 1, L)) continue;
    items.push({ key: (p.y + d) * T - 1, L, o: 1, i, p, w, d });
  }
  M.chars.forEach((c, k) => { const q = charPos(k); if (q.L > TW.top || (q.L < TW.top && roofed(c.x, c.y, q.L))) return; items.push({ key: q.gy, L: q.L, o: 2, k, q }); });
  items.sort((a, b) => a.key - b.key || a.L - b.L || a.o - b.o);
  const hero = items.find(it => it.o === 2 && it.k === TW.hero), hb = hero ? [hero.q.fx - 8, hero.q.fy - 30, hero.q.fx + 8, hero.q.fy] : null;
  for (const it of items) {
    if (it.o === 2) { drawChar(it.k, it.q, vx0, vy0, vx1, vy1); continue; }
    const s = pieceOn(it, vx0, vy0, vx1, vy1); if (!s) continue;
    /* a piece standing in front of the hero fades, so they are never lost behind it */
    const fade = hb && it.key > hero.key && s.X < hb[2] && s.X + s.w > hb[0] && s.Y < hb[3] && s.Y + s.h > hb[1] && covers(s, s.X, s.Y, hb);
    if (fade) g.globalAlpha = 0.5;
    g.drawImage(s.can, s.X, s.Y); g.globalAlpha = 1;
  }
}
/* piece it as it stands on the surface: its sprite placed at the height of the ground at the middle of its front,
   and cut away where the ground in front of it rises over it (made once each time the storeys shown change) */
function pieceOn(it, vx0, vy0, vx1, vy1) {
  let c = TW.clipped.get(it.i);
  if (!c) {
    const p = it.p, sp = spriteOf(Object.assign({}, p, { links: TW.links.get(p) || null })), z = lift((p.x + it.w / 2) * T, (p.y + it.d) * T - 4);
    c = { sp, w: sp.w, h: sp.h, X: p.x * T - sp.ox, Y: Math.round(p.y * T - z) - sp.oy, can: null }; TW.clipped.set(it.i, c);
  }
  if (c.X > vx1 || c.Y > vy1 || c.X + c.w < vx0 || c.Y + c.h < vy0) return null;
  if (!c.can) { c.px = clip(c.sp.px, c.w, c.h, c.X, c.Y, it.key); c.can = toCanvas(c.w, c.h, c.px); }
  return c;
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
const figCan = canvasOf(W, H), figG = figCan.getContext('2d');
function drawChar(k, q, vx0, vy0, vx1, vy1) {
  const c = TW.M.chars[k], ch = characterById(c.sprite) || characterById('villager'), pose = !q.moving ? 0 : q.dist != null ? WALK[Math.floor(q.dist / STRIDE) % WALK.length] : WALK[Math.floor(q.d * STRIDES) % WALK.length];
  const view = q.face === 2 ? 'back' : 'front', flip = q.face === 1, x = Math.round(q.fx), y = Math.round(q.fy), X = x - W / 2, Y = y - BASE - 1;
  if (X > vx1 || Y > vy1 || X + W < vx0 || Y + H < vy0) return;
  /* the figure and its shadow, cut away wherever the ground shown lies in front of where it stands */
  g.fillStyle = 'rgba(43,33,22,0.32)'; g.beginPath(); g.ellipse(x + 1, y, 7, 2.5, 0, 0, Math.PI * 2); g.fill();
  const im = figG.createImageData(W, H); im.data.set(clip(framesOf(ch)[view][pose], W, H, X, Y, q.gy, flip)); figG.putImageData(im, 0, 0);
  if (flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(figCan, -W / 2, Y); g.restore(); } else g.drawImage(figCan, X, Y);
  /* the hero wears a small gold marker overhead until they first move */
  if (k === TW.hero && !TW.moved) { g.fillStyle = '#c9a24f'; const ty = y - 40 - (TW.tick % 2); g.beginPath(); g.moveTo(x - 4, ty); g.lineTo(x + 4, ty); g.lineTo(x, ty + 5); g.closePath(); g.fill(); g.strokeStyle = '#2b2116'; g.lineWidth = 1; g.stroke(); }
}

/* ---------- the place panel ---------- */
function place() {
  const M = TW.M, c = M.chars[TW.hero];
  if (!c) { $('twHint').textContent = 'No one stands on this map: place characters in the editor, then come back to walk about'; $('twPlace').hidden = true; return; }
  const ch = characterById(c.sprite), L = levelOf(c), u = c.y * M.S + c.x, Tn = L ? TERRAIN[M.floors[L - 1][u] - 1] : TERRAIN[M.terr[u]];
  $('twPlace').hidden = false; $('twHero').textContent = ch ? ch.name : c.sprite; $('twWhere').textContent = `${Tn ? Tn.label : ''}${L ? ` · floor ${L}` : ''}`;
  $('twHint').textContent = TW.say ? 'Space to close' : 'Walk with the arrow keys · Space to talk';
}

/* ---------- the frame ---------- */
let raf = 0;
function loop(now) {
  raf = 0; if (!TW.open) return;
  const dt = Math.min(0.1, (now - (TW.lastT || now)) / 1000); TW.lastT = now;
  for (const [k, st] of TW.steps) { st.t += dt * NPC_SPEED; if (st.t >= 1) TW.steps.delete(k); TW.dirty = true; }
  heroTick(dt);
  stroll(dt);
  /* the ripples, the fire and the hero's marker tick over a few times a second */
  const tick = Math.floor(now / 260); if (tick !== TW.tick) { TW.tick = tick; TW.dirty = true; }
  if (TW.dirty) { TW.dirty = false; paint(); }
  /* paint the rest of the ground while idle, a few tiles a frame */
  if (!TW.pending.length && !TW.filled) { TW.filled = true; const n = Math.ceil(S() * T / CHUNK); for (let cy = Math.floor(-TW.F.maxH * LIFT / CHUNK); cy * CHUNK < S() * T; cy++) for (let cx = 0; cx < n; cx++) TW.pending.push([cx, cy]); }
  if (TW.pending.length && TW.chunks.size < 560) { const [cx, cy] = TW.pending.pop(); chunk(cx, cy); }
  raf = requestAnimationFrame(loop);
}
const req = () => { TW.dirty = true; if (!raf && TW.open) raf = requestAnimationFrame(loop); };

/* ---------- input ---------- */
function tileAt(e) {
  const r = cv.getBoundingClientRect(), sc = scale(), tx = Math.round(cv.width / 2 - Math.round(TW.cam.x) * sc), ty = Math.round(cv.height / 2 - Math.round(TW.cam.y) * sc);
  const wx = ((e.clientX - r.left) * state.dpr - tx) / sc, wy = ((e.clientY - r.top) * state.dpr - ty) / sc, d = depthAt(wx, wy);
  /* the ground under the point is the row its pixel shows */
  if (!d) return null;
  const x = Math.floor(wx / T), y = Math.floor((d - 1) / T); return [x, y, TW.F.lev[y * S() + x], wx, d - 1];
}
cv.addEventListener('pointerdown', e => {
  const t = tileAt(e), M = TW.M, k = TW.hero; if (!t || !M.chars[k] || !TW.me) return;
  if (TW.say) closeSay();
  TW.moved = true; TW.stuck = 0;
  /* a click on someone walks up to them and talks; anywhere else walks there */
  const j = M.chars.findIndex((o, i) => i !== k && o.x === t[0] && o.y === t[1] && levelOf(o) === t[2]);
  if (j >= 0) { const q = charPos(j); TW.path = routeTo(q.fx, q.gy + (TW.me.y > q.gy ? 14 : -14), t[2]); TW.talkTo = j; }
  else { TW.path = routeTo(t[3], t[4], t[2]); TW.talkTo = -1; }
  req();
});
cv.addEventListener('wheel', e => { e.preventDefault(); const i = ZOOMS.indexOf(TW.zoom); setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1)))]); req(); }, { passive: false });
root.addEventListener('keydown', e => {
  if (!TW.open) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k in DIRS) { if (!e.repeat) { TW.held = TW.held.filter(d => d !== DIRS[k]); TW.held.push(DIRS[k]); TW.moved = true; if (TW.say) closeSay(); } }
  else if (k === 'Shift') TW.run = true;
  else if (k === ' ' || k === 'Enter') { if (!e.repeat) talk(); }
  else if (k === 'Tab') { nextHero(e.shiftKey ? -1 : 1); }
  else if (k === '+' || k === '=') setZoom(TW.zoom + 1); else if (k === '-' || k === '_') setZoom(TW.zoom - 1);
  else if (k === 'Escape') { if (TW.say) closeSay(); else closeTown(); }
  else return;
  e.preventDefault(); req();
});
root.addEventListener('keyup', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (k in DIRS) TW.held = TW.held.filter(d => d !== DIRS[k]); else if (k === 'Shift') TW.run = false; });
root.addEventListener('blur', () => { TW.held = []; TW.run = false; });
function nextHero(d = 1) {
  const n = TW.M.chars.length; if (n < 2) return;
  TW.hero = (TW.hero + d + n) % n; TW.path = []; TW.talkTo = -1; if (TW.say) closeSay();
  takeHero(); setTop(TW.me.L); place(); req();
}

/* the hero's free position, from the tile the character stands on */
function takeHero() {
  const c = TW.M.chars[TW.hero]; TW.steps.delete(TW.hero);
  TW.me = c ? { x: c.x * T + T / 2, y: c.y * T + FOOT, L: levelOf(c), face: c.face | 0, dist: 0, moving: false } : null;
}

/* ---------- open and close ---------- */
/* opts: hero, the index of the character to walk as (default the one picked in the editor, else the first); zoom */
function openTown(opts = {}) {
  if (!ED.M) return;
  TW.M = cloneModel(ED.M); TW.M.chars = TW.M.chars || []; TW.M.floors = TW.M.floors || [];
  TW.open = true; root.hidden = false; TW.steps.clear(); TW.path = []; TW.held = []; TW.talkTo = -1; TW.moved = false; TW.lastT = 0; TW.rest = [];
  TW.homes = TW.M.chars.map(c => [c.x, c.y]); TW.links = wallLinks(TW.M.objs);
  TW.hero = opts.hero ?? (ED.sel >= 0 && ED.M.chars[ED.sel] ? ED.sel : 0);
  TW.G0 = fieldOf(TW.M, 0); TW.shapes = shapesOf(TW.M.objs, TW.links); takeHero();
  TW.top = TW.me ? TW.me.L : 0;
  buildField(); size();
  setZoom(opts.zoom || Math.max(2, Math.min(5, Math.round(TW.cw / (15 * T)))));
  $('twName').textContent = TW.M.name;
  closeSay(); place();
  /* the place's name shows for a moment, as a town's does on entering it */
  const b = $('twBanner'); b.textContent = TW.M.name; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  root.focus({ preventScroll: true }); req();
}
function closeTown() { if (!TW.open) return; TW.open = false; root.hidden = true; if (raf) cancelAnimationFrame(raf); raf = 0; TW.steps.clear(); $('edCanvas').focus({ preventScroll: true }); }

$('twBack').addEventListener('click', closeTown);
$('twNext').addEventListener('click', () => { nextHero(1); root.focus({ preventScroll: true }); });
$('twIn').addEventListener('click', () => { setZoom(TW.zoom + 1); req(); }); $('twOut').addEventListener('click', () => { setZoom(TW.zoom - 1); req(); });
$('edTown').addEventListener('click', () => openTown());
$('editor').addEventListener('keydown', e => { if (ED.open && !TW.open && (e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { e.preventDefault(); openTown(); } });
new ResizeObserver(() => { if (TW.open) { size(); req(); } }).observe(root);
/* test hook */
window.__town = { state: TW, open: openTown, close: closeTown, isOpen: () => TW.open, talk, nextHero, walkTo: (x, y, L = 0) => { const ok = !!findPath(TW.M, TW.hero, x, y, L); TW.path = routeTo(x * T + T / 2, y * T + FOOT, L); TW.moved = true; req(); return ok; }, standable: (L, x, y) => standable(L, x, y, heightOn(L, x, y) ?? 0), heightOn, probe: (L, x, y) => ({ h: heightOn(L, x, y), dry: dry(L, x, y), hit: hits(TW.shapes.get(L), x, y, FOOT_R) }) };

export { closeTown, openTown };
