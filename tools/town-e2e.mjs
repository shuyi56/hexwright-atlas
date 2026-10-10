import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright-core';
import { preview } from 'vite';

/* ================= town view end to end: a walk round Saltmere on several screens =================
   Builds nothing itself: run `npm run build` first, then `npm run test:town`. Serves dist/, opens
   scenes/town/saltmere-harbour.json in the town view in headless Chromium as each of several devices (phones
   at 2.625×, 3× and 4.5×, a tablet, desktops at 1× and 2×) and walks the hero round the town: along routes
   picked as a tap or click would, then with the touch stick (on a touch screen) or the arrow keys, walking and
   running. The townsfolk stand still, so every figure on screen can be checked. Each device walks the tour
   twice.

   The first walk checks frames and the camera, from the town view's per-frame trace (state.trace):
   - frames: the main thread's work per frame (moving, thinking, drawing) stays in budget, and no chunk of
     ground is painted on the main thread while walking (the workers paint ahead of the camera);
   - the canvas: one backing pixel per device pixel, and a whole number of device pixels per art pixel;
   - the camera: it never jumps further in a frame than the hero can run, and the hero stays put on screen
     (within a device pixel of where the camera's settings put them) wherever the camera is not held at the
     map's edge;
   - the walk: a hero on the move steps through their walk cycle, and stands in their standing pose when still.
   The second walk checks the figures themselves: every few frames, every figure wholly on screen is read back
   from the canvas, device pixel by device pixel, and compared with its own character's frame drawn afresh
   (scaled by a whole number, mirrored when facing east, cut away where the ground hides it, and leaving out
   whatever was drawn over it afterwards). A smeared, shifted or wrong figure (one showing another
   character's frame) fails. The readback is kept out of the first walk, as it slows the canvas.

   TOWN_DEVICES=a,b picks the devices (Playwright's names); TOWN_E2E_OUT=file.json writes the numbers; in GitHub
   Actions they also go to the job summary. Budgets: TOWN_WORK_P95_MS, TOWN_WORK_MAX_MS. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEVICES = (process.env.TOWN_DEVICES || 'iPhone 14 Pro,Pixel 7,Pixel 7 landscape,Galaxy S9+,iPad Mini,Desktop Chrome,Desktop Chrome HiDPI').split(',').map(s => s.trim());
const WORK_P95 = +(process.env.TOWN_WORK_P95_MS || 12), WORK_MAX = +(process.env.TOWN_WORK_MAX_MS || 50);
/* the share of a figure's device pixels that may differ from its frame (none should) */
const SPRITE_TOLERANCE = 0.002;

function findChrome() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(process.env.HOME || '', '.cache', 'ms-playwright'), '/opt/pw-browsers'].filter(Boolean);
  for (const r of roots) {
    let dirs; try { dirs = readdirSync(r).filter(d => /^chromium-\d+$/.test(d)).sort().reverse(); } catch { continue; }
    for (const d of dirs) for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) { const p = join(r, d, sub); if (existsSync(p)) return p; }
  }
  return undefined;
}
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!existsSync(join(root, 'dist', 'index.html'))) { console.error('dist/ is missing: run `npm run build` first'); process.exit(2); }
for (const d of DEVICES) if (!devices[d]) { console.error(`unknown device "${d}"`); process.exit(2); }
const MAP = JSON.parse(readFileSync(join(root, 'scenes/town/saltmere-harbour.json'), 'utf8'));
const TOWN = JSON.parse(readFileSync(join(root, 'scenes/town/saltmere-harbour.scene.json'), 'utf8')).town || {};

const server = await preview({ root, logLevel: 'silent', preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.HEXWRIGHT_CHROME || findChrome(), args: process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
const results = [];
try {
  for (const name of DEVICES) results.push(await device(name));
} finally { await browser.close(); await server.close(); }

/* ---------- one device ---------- */
async function device(name) {
  const desc = devices[name], { defaultBrowserType, ...opts } = desc; void defaultBrowserType;
  const ctx = await browser.newContext(opts), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const fails = [], fail = m => { if (fails.length < 12) fails.push(m); };
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.hexwright && window.__town, null, { timeout: 30000 });
    await page.evaluate(async map => { await window.hexwright.call('open'); await window.hexwright.call('setMap', { map }); }, MAP);

    /* ---- the first walk: frames and the camera ---- */
    await open(page);
    const canvas = await page.evaluate(() => { const c = document.getElementById('twCanvas'), r = c.getBoundingClientRect(), T = window.__town.state; return { w: c.width, h: c.height, cssW: r.width, cssH: r.height, dpr: devicePixelRatio, zoom: T.zoom }; });
    if (Math.abs(canvas.w - canvas.cssW * canvas.dpr) > 1 || Math.abs(canvas.h - canvas.cssH * canvas.dpr) > 1) fail(`canvas ${canvas.w}×${canvas.h} for ${canvas.cssW}×${canvas.cssH} CSS pixels at ${canvas.dpr}×: not one pixel per device pixel`);
    await page.evaluate(() => { const T = window.__town.state; T.trace = []; T.stats.syncChunks = 0; });
    await tour(page, cdp, !!desc.hasTouch);
    const { trace, sync, speed } = await page.evaluate(() => { const T = window.__town.state, out = { trace: T.trace, sync: T.stats.syncChunks, speed: window.__town.figure.speed }; T.trace = null; return out; });
    const frames = checkFrames(trace, sync, speed, canvas, fail);

    /* ---- the second walk: every figure, read back from the canvas ---- */
    await open(page);
    await page.evaluate(SPRITE_CHECK, [SPRITE_TOLERANCE, TOWN.hero || 0]);
    await tour(page, cdp, !!desc.hasTouch);
    const sprites = await page.evaluate(() => { const T = window.__town.state, r = window.__spriteCheck; T.trace = null; T.onFrame = null; return r; });
    if (!sprites.figures) fail('no figure was checked');
    if (!sprites.heroes) fail('the hero was never checked');
    for (const b of sprites.bad) fail(`frame ${b.frame}: ${b.id} (${b.view} ${b.pose}${b.flip ? ' mirrored' : ''}${b.cut ? ' cut' : ''}) differs in ${(b.ratio * 100).toFixed(1)}% of ${b.n} pixels${b.like ? `, looks like ${b.like}` : ''}`);
    if (errors.length) fail('page errors: ' + errors.join('; '));
    return { name, dpr: canvas.dpr, canvas: `${canvas.w}×${canvas.h}`, sc: frames.sc, ...frames.stats, figures: sprites.figures, cut: sprites.cut, worst: sprites.worst, fails };
  } catch (e) {
    fail(e.message); return { name, fails };
  } finally { await ctx.close(); }
}

/* open the town view afresh on the hero, the others standing still, and wait for the painters to finish */
async function open(page) {
  await page.evaluate(town => { const t = window.__town; if (t.isOpen()) t.close(); t.open(town); const T = t.state; T.rest = T.M.chars.map(() => 1e9); }, TOWN);
  await page.waitForFunction(() => !window.__town.painting(), null, { timeout: 30000, polling: 100 });
  await sleep(400);
  await page.waitForFunction(() => !window.__town.painting(), null, { timeout: 30000, polling: 100 });
}

/* ---------- the walk ---------- */
/* Routes to tiles, as a tap or click asks for; then free walking: with the stick on a touch screen (a finger
   dragged from the middle of the screen), else the arrow keys; a pull past the run line or Shift runs. */
async function tour(page, cdp, touch) {
  const route = async (x, y) => {
    await page.evaluate(([x, y]) => window.__town.walkTo(x, y), [x, y]);
    await page.waitForFunction(() => { const T = window.__town.state; return !T.path.length && !T.me.moving; }, null, { timeout: 15000, polling: 50 }).catch(() => {});
  };
  const free = async (dx, dy, ms, run = false) => {
    if (touch) {
      const box = await page.evaluate(() => { const r = document.getElementById('twCanvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.45]; });
      const pull = run ? 80 : 44, pt = k => [{ x: box[0] + dx * pull * k, y: box[1] + dy * pull * k, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(0) });
      for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(k / 6) }); await sleep(16); }
      await sleep(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      const key = dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp';
      await page.focus('#town');
      if (run) await page.keyboard.down('Shift');
      await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key);
      if (run) await page.keyboard.up('Shift');
    }
    await sleep(250);
  };
  await route(20, 18);
  await free(1, 0, 1100);
  await free(-1, 0, 900, true);
  await route(24, 17);
  await route(20, 12);
  await free(0, 1, 900);
  await free(0, -1, 700, true);
  await route(16, 17);
}

/* ---------- the first walk's checks ---------- */
function checkFrames(trace, sync, speed, canvas, fail) {
  const moving = trace.filter(f => f.hero && f.hero.moving);
  if (moving.length < 60) fail(`only ${moving.length} frames of walking were drawn`);
  const work = trace.map(f => f.work), sc = trace.length ? trace[0].sc : 0;
  if (sc !== Math.max(1, Math.round(canvas.zoom * canvas.dpr))) fail(`${sc} device pixels to the art pixel at ×${canvas.zoom} on a ${canvas.dpr}× screen`);
  if (pct(work, 0.95) > WORK_P95) fail(`frame work p95 ${pct(work, 0.95).toFixed(1)} ms, budget ${WORK_P95} ms`);
  if (Math.max(0, ...work) > WORK_MAX) fail(`slowest frame's work ${Math.max(...work).toFixed(1)} ms, budget ${WORK_MAX} ms`);
  if (sync) fail(`${sync} chunk(s) of ground painted on the main thread while walking`);
  let jumps = 0, drift = 0, worstDrift = 0, frozen = 0, still = 0, run = [];
  for (let i = 0; i < trace.length; i++) {
    const f = trace[i], p = trace[i - 1], h = f.hero, me = f.drawn.find(d => d.k === 0);
    if (!h || !me) continue;
    if (!Number.isInteger(f.tx) || !Number.isInteger(f.ty)) fail(`frame ${i}: the camera is off the device pixel grid`);
    /* the camera never moves further in a frame than the hero can run, plus the slow follow of their height */
    if (p && p.hero && p.sc === f.sc) {
      const dt = Math.min(0.1, (f.t - p.t) / 1000), reach = speed * dt + 1;
      const ox = Math.abs(f.tx - p.tx) - (reach * f.sc + 2), oy = Math.abs(f.ty - p.ty) - ((reach + Math.abs(h.camZ - p.hero.camZ)) * f.sc + 2);
      if (ox > 0 || oy > 0) { jumps++; if (jumps <= 3) fail(`frame ${i}: the camera jumped ${f.tx - p.tx}, ${f.ty - p.ty} device pixels in ${(dt * 1000).toFixed(0)} ms`); }
    }
    /* the hero stays where the camera puts them: centred across, and down by the height the camera has yet to
       catch up with */
    const W = 32, BASE = 46, cx = f.tx + (me.X + W / 2) * f.sc, fy = f.ty + (me.Y + BASE + 1) * f.sc;
    const dx = f.clamp[0] ? 0 : Math.abs(cx - f.w / 2), dy = f.clamp[1] ? 0 : Math.abs(fy - (f.h / 2 + (h.camZ + 16 - h.z) * f.sc));
    if (Math.max(dx, dy) > 1.5) { drift++; worstDrift = Math.max(worstDrift, dx, dy); }
    /* the walk cycle: through at least three poses on any stretch of walking, the standing pose when still */
    if (me.moving) run.push(me.pose); else { if (me.pose !== 0) still++; if (run.length >= 30 && new Set(run).size < 3) frozen++; run = []; }
  }
  if (run.length >= 30 && new Set(run).size < 3) frozen++;
  if (drift) fail(`the hero drifted on screen in ${drift} frames (up to ${worstDrift.toFixed(1)} device pixels)`);
  if (frozen) fail(`${frozen} stretch(es) of walking without a walk cycle`);
  if (still) fail(`${still} frames of the hero standing still in a walking pose`);
  const gaps = trace.slice(1).map((f, i) => f.t - trace[i].t);
  return { sc, stats: { frames: trace.length, walking: moving.length, 'work p95': +pct(work, 0.95).toFixed(1), 'work max': +Math.max(0, ...work).toFixed(1), 'frame p50': +pct(gaps, 0.5).toFixed(1), 'frame p95': +pct(gaps, 0.95).toFixed(1), 'sync chunks': sync, jumps, drift } };
}

/* ---------- the second walk's check, run in the page on every third frame drawn ---------- */
function SPRITE_CHECK([tolerance, hero]) {
  const T = window.__town, F = T.figure, g = document.getElementById('twCanvas').getContext('2d'), looks = new Map();
  const lookOf = id => { let l = looks.get(id); if (!l) looks.set(id, l = T.look(id)); return l; };
  const R = window.__spriteCheck = { figures: 0, heroes: 0, cut: 0, worst: 0, bad: [] };
  let n = 0;
  /* the share of the figure's visible device pixels that differ from frame px */
  const compare = (f, d, px, img, covered) => {
    const sc = f.sc, wD = F.W * sc; let seen = 0, off = 0;
    for (let j = 0; j < F.H; j++) for (let i = 0; i < F.W; i++) {
      const o = (j * F.W + i) * 4; if (px[o + 3] !== 255) continue;
      const col = d.flip ? F.W - 1 - i : i;
      if (d.cut && T.depthAt(d.ax + col, d.ay + j) - 1 > d.gy) continue;
      for (let v = 0; v < sc; v++) for (let u = 0; u < sc; u++) {
        const x = col * sc + u, y = j * sc + v; if (covered(x, y)) continue;
        const q = (y * wD + x) * 4; seen++;
        if (Math.abs(img[q] - px[o]) > 2 || Math.abs(img[q + 1] - px[o + 1]) > 2 || Math.abs(img[q + 2] - px[o + 2]) > 2) off++;
      }
    }
    return { seen, ratio: seen ? off / seen : 0 };
  };
  T.state.trace = [];
  T.state.onFrame = f => {
    T.state.trace.length = 0;
    if (++n % 3) return;
    const sc = f.sc, dev = b => [f.tx + b[0] * sc, f.ty + b[1] * sc, b[2] * sc, b[3] * sc];
    f.drawn.forEach((d, idx) => {
      if (d.k == null) return;
      /* to the device pixel the figure was drawn at: d.X is a whole number of device pixels over sc, which times sc again
         can fall a hair short (28620.999…), and getImageData would cut that down to the pixel before */
      const X0 = Math.round(f.tx + d.X * sc), Y0 = Math.round(f.ty + d.Y * sc), wD = F.W * sc, hD = F.H * sc;
      if (X0 < 0 || Y0 < 0 || X0 + wD > f.w || Y0 + hD > f.h) return;
      /* whatever was drawn after the figure and over it is left out */
      const over = f.drawn.slice(idx + 1).map(o => dev(o.box)).filter(b => b[0] < X0 + wD && b[0] + b[2] > X0 && b[1] < Y0 + hD && b[1] + b[3] > Y0);
      const covered = (x, y) => over.some(b => X0 + x >= b[0] && X0 + x < b[0] + b[2] && Y0 + y >= b[1] && Y0 + y < b[1] + b[3]);
      const img = g.getImageData(X0, Y0, wD, hD).data, r = compare(f, d, lookOf(d.id)[d.view][d.pose], img, covered);
      if (r.seen < 50 * sc * sc) return;
      R.figures++; if (d.k === hero) R.heroes++; if (d.cut) R.cut++; R.worst = Math.max(R.worst, r.ratio);
      if (r.ratio > tolerance && R.bad.length < 6) {
        /* which of the others it looks like, if any */
        let like = '', best = r.ratio;
        for (const o of new Set(T.state.M.chars.map(c => c.sprite))) { if (o === d.id) continue; const q = compare(f, d, lookOf(o)[d.view][d.pose], img, covered); if (q.ratio < best) { best = q.ratio; like = o; } }
        R.bad.push({ frame: n, id: d.id, view: d.view, pose: d.pose, flip: d.flip, cut: d.cut, n: r.seen, ratio: r.ratio, like });
      }
    });
  };
}

/* ---------- the report ---------- */
const cols = ['frames', 'walking', 'work p95', 'work max', 'frame p50', 'frame p95', 'sync chunks', 'jumps', 'drift', 'figures', 'cut', 'worst'];
console.log(`town view: a walk round Saltmere harbour; budgets: frame work p95 ${WORK_P95} ms, worst ${WORK_MAX} ms`);
console.table(results.map(r => Object.fromEntries([['device', r.name], ['dpr', r.dpr], ['canvas', r.canvas], ['px/art', r.sc], ...cols.map(c => [c, c === 'worst' && r[c] != null ? +(r[c] * 100).toFixed(2) + '%' : r[c]]), ['ok', r.fails.length ? '✗' : '✓']])));
for (const r of results) for (const f of r.fails) console.error(`${r.name}: ${f}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map(r => `| ${r.name} | ${r.dpr ?? ''} | ${r.canvas ?? ''} | ${r.sc ?? ''} | ${r['work p95'] ?? ''} | ${r['work max'] ?? ''} | ${r['frame p95'] ?? ''} | ${r['sync chunks'] ?? ''} | ${r.figures ?? ''} | ${r.worst != null ? (r.worst * 100).toFixed(2) + '%' : ''} | ${r.fails.length ? '❌ ' + r.fails.join('<br>') : '✅'} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### Town view: a walk round Saltmere', '', '| device | dpr | canvas | px/art | work p95 ms | work max ms | frame p95 ms | sync chunks | figures checked | worst figure | |', '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|', ...rows, ''].join('\n') + '\n');
}
if (process.env.TOWN_E2E_OUT) writeFileSync(process.env.TOWN_E2E_OUT, JSON.stringify({ budgets: { workP95: WORK_P95, workMax: WORK_MAX, sprite: SPRITE_TOLERANCE }, results }, null, 2));
if (results.some(r => r.fails.length)) process.exit(1);
console.log('town ok');
