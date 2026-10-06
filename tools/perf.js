import { appendFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

/* Tile editor interaction budget. Builds nothing itself: run `npm run build` first, then `npm run perf`.
   Serves dist/, drives the editor with real mouse clicks in headless Chromium and reads the browser's
   own Event Timing entries, the same numbers Interaction to Next Paint (INP) is computed from.
   Fails when an interaction's p75 latency goes over its budget (or any single run over twice it),
   or when the map image the editor patched in place after all those edits differs from a full
   render. PERF_OUT=file.json writes the numbers; in GitHub Actions they also go to the job summary. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = +(process.env.PERF_BUDGET_MS || 200), SIZE = +(process.env.PERF_SIZE || 48), CLICKS = 8;
/* PERF_CPU_THROTTLE=4 or so approximates a slow phone */
const CPU = +(process.env.PERF_CPU_THROTTLE || 1);
const ROTATE_BUDGET = +(process.env.PERF_ROTATE_BUDGET_MS || 1500), HOVER_BUDGET = +(process.env.PERF_HOVER_BUDGET_MS || 50);

function findChrome() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(process.env.HOME || '', '.cache', 'ms-playwright'), '/opt/pw-browsers'].filter(Boolean);
  for (const r of roots) {
    let dirs; try { dirs = readdirSync(r).filter(d => /^chromium-\d+$/.test(d)).sort().reverse(); } catch { continue; }
    for (const d of dirs) for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) { const p = join(r, d, sub); if (existsSync(p)) return p; }
  }
  return undefined;
}

if (!existsSync(join(root, 'dist', 'index.html'))) { console.error('dist/ is missing: run `npm run build` first'); process.exit(2); }
const server = await preview({ root, logLevel: 'silent', preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.HEXWRIGHT_CHROME || findChrome(), args: process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
const results = []; let check;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (CPU > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.goto(url);
  await page.click('#openEditor');
  const call = (method, params = {}) => page.evaluate(([m, p]) => window.hexwright.call(m, p), [method, params]);
  await call('generate', { seed: 'perf', size: SIZE, biome: 'vale' });
  await call('setView', { fit: true });
  /* the browser reports every interaction slower than 16 ms with its full input-to-paint duration */
  await page.evaluate(() => {
    window.__ev = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) window.__ev.push({ id: e.interactionId, name: e.name, dur: e.duration }); }).observe({ type: 'event', durationThreshold: 16, buffered: false });
  });
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));

  /* pick dry, flat-ish tiles spread over the map so placements fit and nothing overlaps */
  const spots = [];
  for (let k = 0; spots.length < CLICKS && k < SIZE * SIZE; k++) {
    const x = 3 + (k * 7) % (SIZE - 6), y = 3 + ((k * 7 / (SIZE - 6)) | 0) * 4 % (SIZE - 6);
    const t = await call('getTile', { x, y });
    if (!t.piece && !/water|sea|lake|river|marsh/.test(t.terrain)) spots.push([x, y]);
  }
  /* the browser's interaction latency: the slowest event (pointerdown, pointerup, click...) of each */
  const latencies = async () => {
    const ev = await page.evaluate(() => window.__ev.splice(0));
    const byId = new Map(); for (const e of ev) byId.set(e.id, Math.max(byId.get(e.id) || 0, e.dur));
    return [...byId.values()];
  };
  const record = (name, lat, budget = BUDGET) => {
    lat.sort((a, b) => a - b);
    results.push({ name, slow: lat.length, p75: lat.length ? lat[Math.floor(lat.length * 0.75)] : 0, worst: lat.length ? lat[lat.length - 1] : 0, budget });
  };
  const clickTiles = async (name, setup) => {
    await call('setSelection', setup); await settle(); await latencies();
    for (const [x, y] of spots) {
      const s = await call('tileToScreen', { x, y });
      await page.mouse.move(s.client.x, s.client.y); await settle(); await page.mouse.down(); await page.mouse.up(); await settle();
    }
    record(name, await latencies());
  };
  const clickButtons = async (name, selectors, budget) => {
    await settle(); await latencies();
    for (const sel of selectors) { await page.click(sel); await settle(); }
    record(name, await latencies(), budget);
  };

  await clickTiles('paint', { tool: 'paint', terrain: 'sand', brush: 1 });
  await clickTiles('paint 3x3', { tool: 'paint', terrain: 'dirt', brush: 3 });
  await clickTiles('raise', { tool: 'raise', brush: 2 });
  await clickTiles('lower', { tool: 'lower', brush: 1 });
  await clickTiles('place', { tool: 'place', asset: 'cottage' });
  await clickTiles('place 2x2', { tool: 'place', asset: 'keep' });
  await clickTiles('erase', { tool: 'erase' });
  await clickButtons('undo / redo', ['#edUndo', '#edUndo', '#edUndo', '#edRedo', '#edRedo', '#edUndo']);
  await clickButtons('tool buttons', ['[data-tool="paint"]', '[data-tool="place"]', '[data-tool="erase"]', '[data-tool="raise"]']);
  await clickButtons('palette', ['[data-tab="Terrain"]', '.ed-item[data-kind="terrain"]', '[data-tab="Nature"]', '.ed-item[data-kind="asset"]']);
  /* turning the view redraws the whole map; tracked so it cannot quietly get worse */
  await clickButtons('rotate view', ['#edRotR', '#edRotL'], ROTATE_BUDGET);

  /* hovering is not a discrete interaction, so time the frame each pointer move causes; in place
     mode, the costliest, since every move also redraws the piece ghost */
  await call('setSelection', { tool: 'place', asset: 'keep' });
  const hover = await page.evaluate(async () => {
    const cv = document.getElementById('edCanvas'), r = cv.getBoundingClientRect(), out = [];
    for (let k = 0; k < 24; k++) {
      const t0 = performance.now();
      cv.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * (0.3 + k * 0.017), clientY: r.top + r.height * 0.5, bubbles: true, pointerType: 'mouse' }));
      await new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
      out.push(performance.now() - t0);
    }
    return out;
  });
  record('hover frame', hover, HOVER_BUDGET);

  /* every edit above was drawn by patching the map image; it must match drawing it from scratch */
  check = await page.evaluate(() => window.hexwright.debug.renderCheck());
  if (errors.length) throw new Error('page errors: ' + errors.join('; '));
} finally { await browser.close(); await server.close(); }

console.log(`tile editor on a ${SIZE}×${SIZE} map, cpu throttle ${CPU}x`);
console.table(results.map(r => ({ interaction: r.name, 'over 16 ms': r.slow, 'p75 ms': Math.round(r.p75), 'worst ms': Math.round(r.worst), 'budget ms': r.budget })));
console.log(`incremental vs full render: ${check.differing} of ${check.pixels} pixels differ (max channel delta ${check.maxDelta})`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map(r => `| ${r.name} | ${Math.round(r.p75)} | ${Math.round(r.worst)} | ${r.budget} | ${r.p75 > r.budget || r.worst > 2 * r.budget ? '❌' : '✅'} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`### Tile editor interaction latency (${SIZE}×${SIZE} map)`, '', '| interaction | p75 ms | worst ms | budget ms | |', '|---|---:|---:|---:|---|', ...rows, '', `Patched map image vs full render: ${check.differing} differing pixels.`, ''].join('\n'));
}
if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify({ size: SIZE, cpu: CPU, results, renderCheck: check }, null, 2));
/* p75 must meet the budget; a single run may be slower (headless rasterising is noisy) but never twice over */
const over = results.filter(r => r.p75 > r.budget || r.worst > 2 * r.budget);
if (over.length) console.error(`over budget: ${over.map(r => `${r.name} p75 ${Math.round(r.p75)} ms / worst ${Math.round(r.worst)} ms, budget ${r.budget} ms`).join(', ')}`);
if (check.differing) console.error('the patched map image does not match a full render');
if (over.length || check.differing) process.exit(1);
console.log('perf ok');
