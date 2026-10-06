#!/usr/bin/env node
/* ================= scene to a single HTML file =================
   node tools/scene-html.mjs <map.json> [out.html]

   Builds the app with Vite and writes one self-contained page: the whole app inlined (scripts and styles,
   no server needed, it opens from disk), with a tile map preloaded in the tile editor. When the map has a
   checks file beside it (<name>.checks.json), the page also runs those walking checks on load and shows a
   results panel: each check walks a character through the automation API and audits the route (one tile per
   step, at most one height level of climb, storeys changing only on stairs). Results land in
   window.__sceneResults for scripted browsers. Clicking a check replays that walk on screen.

   Checks file: { title, about, checks: [{ name, who: sprite id, start?: {x, y, level}, edits?: [batch ops],
   to: {x, y, level}, expect: 'reach' | 'blocked', storeys?: ['0->1', ...], heights?: '0123', minSteps?, via?: [[x, y]] }] } */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [mapPath, outArg] = process.argv.slice(2);
if (!mapPath) { console.error('usage: node tools/scene-html.mjs <map.json> [out.html]'); process.exit(1); }
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
if (map.format !== 'hexwright-tiles') { console.error(`${mapPath} is not a hexwright-tiles map`); process.exit(1); }
const checksPath = mapPath.replace(/\.json$/, '.checks.json');
const suite = existsSync(checksPath) ? JSON.parse(readFileSync(checksPath, 'utf8')) : { checks: [] };
const out = resolve(outArg || join(root, 'scenes', basename(mapPath).replace(/\.json$/, '.html')));

/* build into a scratch folder, then inline the stylesheet and the script into the page */
const dist = mkdtempSync(join(tmpdir(), 'hexwright-scene-'));
await build({ root, logLevel: 'warn', build: { outDir: dist, emptyOutDir: true, modulePreload: { polyfill: false }, assetsInlineLimit: 1e9, cssCodeSplit: false } });
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
/* a closing script tag inside inlined code would end the element early */
const safe = s => s.replace(/<\/script/gi, '<\\/script');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+\.css)"[^>]*>/g, (m, f) => `<style>\n${readFileSync(join(dist, 'assets', f), 'utf8')}\n</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/assets\/([^"]+\.js)"[^>]*><\/script>/g, (m, f) => `<script type="module">\n${safe(readFileSync(join(dist, 'assets', f), 'utf8'))}\n</script>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
const left = assets.filter(f => html.includes(`./assets/${f}`));
if (left.length) { console.error(`could not inline: ${left.join(', ')}`); process.exit(1); }
rmSync(dist, { recursive: true, force: true });

/* the scene and the runner, after the app */
const title = suite.title || map.name || 'Hexwright scene';
html = html.replace(/<title>[^<]*<\/title>/, `<title>${title.replace(/</g, '&lt;')} · Hexwright</title>`);
const data = safe(JSON.stringify({ title, about: suite.about || '', map, checks: suite.checks || [] }));
html = html.replace('</body>', `<script>window.__HEXWRIGHT_SCENE__ = ${data};</script>\n<script type="module">\n${safe(RUNNER())}\n</script>\n</body>`);
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB, ${(suite.checks || []).length} checks)`);

function RUNNER() {
  return String.raw`
const S = window.__HEXWRIGHT_SCENE__;
const ready = () => new Promise(r => { const f = () => (window.hexwright ? r(window.hexwright) : setTimeout(f, 40)); f(); });
const h = await ready();

/* ---------- the panel ---------- */
const css = document.createElement('style');
css.textContent = '.scene-panel{position:fixed;z-index:60;top:72px;right:16px;width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 100px);overflow:auto;background:rgba(18,24,25,.94);color:#efe6cf;border:1px solid #4a4a3c;border-radius:6px;font:13px/1.4 "Alegreya Sans",system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4)}'
  + '.scene-panel header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #3a3a30;position:sticky;top:0;background:rgba(18,24,25,.98)}'
  + '.scene-panel h2{margin:0;font:600 14px "Alegreya Sans SC",system-ui,sans-serif;letter-spacing:.06em;color:#e4c684;flex:1}'
  + '.scene-panel button{font:inherit;font-size:12px;color:#efe6cf;background:#2a2e2a;border:1px solid #4a4a3c;border-radius:12px;padding:3px 10px;cursor:pointer}.scene-panel button:hover{border-color:#e4c684}'
  + '.scene-panel .sum{padding:8px 12px 4px;color:#cfc4a8}.scene-panel .sum b{color:#efe6cf}.scene-panel .about{padding:0 12px 8px;color:#a59c86;font-size:12px}'
  + '.scene-panel ol{list-style:none;margin:0;padding:0 6px 8px}.scene-panel li{padding:7px 8px;border-radius:4px;cursor:pointer;display:grid;grid-template-columns:18px 1fr;gap:2px 6px}.scene-panel li:hover{background:#262b28}'
  + '.scene-panel .mark{font-weight:700}.scene-panel .ok .mark{color:#9fc27a}.scene-panel .bad .mark{color:#e07a5f}.scene-panel .run .mark{color:#a59c86}'
  + '.scene-panel .detail{grid-column:2;color:#a59c86;font-size:12px}.scene-panel .bad .detail{color:#e0a08a}.scene-panel.min ol,.scene-panel.min .about{display:none}';
document.head.appendChild(css);
const panel = document.createElement('section'); panel.className = 'scene-panel'; panel.setAttribute('aria-label', 'Scene checks');
panel.innerHTML = '<header><h2></h2><button data-a="rerun" title="Run every check again">Re-run</button><button data-a="min" title="Fold the list">–</button></header><div class="sum"></div><div class="about"></div><ol></ol>';
panel.querySelector('h2').textContent = S.title; panel.querySelector('.about').textContent = S.about + (S.checks.length ? ' Click a check to watch that walk.' : '');
document.body.appendChild(panel);
const list = panel.querySelector('ol'), sum = panel.querySelector('.sum');
panel.querySelector('[data-a=min]').onclick = () => panel.classList.toggle('min');
panel.querySelector('[data-a=rerun]').onclick = () => runAll();

/* ---------- running a check ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
function sceneFor(c) {
  const m = clone(S.map);
  if (c.start) { const ch = m.characters.find(x => x.sprite === c.who); Object.assign(ch, { x: c.start.x, y: c.start.y }); if (c.start.level) ch.level = c.start.level; else delete ch.level; }
  return m;
}
/* every step one tile and at most one height level; storeys change only on or off a flight of stairs */
function audit(m, start, route) {
  const N = m.size, el = (x, y) => m.elevation[y * N + x], stairs = new Set(m.objects.filter(o => o.id === 'stairs').map(o => o.x + ',' + o.y + ',' + (o.level || 0)));
  let prev = start; const bad = [], storeys = [];
  for (const p of route) {
    if (Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) !== 1) bad.push('jumped ' + prev + ' -> ' + p);
    const climb = Math.abs(el(p[0], p[1]) - el(prev[0], prev[1])); if (climb > 1) bad.push('climbed ' + climb + ' levels at ' + prev + ' -> ' + p);
    if (p[2] !== prev[2]) { storeys.push(prev[2] + '->' + p[2]); const foot = p[2] > prev[2] ? prev : p; if (!stairs.has(foot.join(','))) bad.push('changed storey off the stairs at ' + prev + ' -> ' + p); }
    prev = p;
  }
  return { bad, storeys, heights: [start, ...route].map(p => el(p[0], p[1])).join('') };
}
async function runOne(c) {
  await h.call('setMap', { map: sceneFor(c) });
  if (c.edits) await h.call('batch', { ops: c.edits });
  const m = await h.call('getMap'), list = (await h.call('listCharacters')).characters, who = list.find(x => x.sprite === c.who);
  if (!who) return { pass: false, detail: 'no character ' + c.who + ' in the scene' };
  const start = [who.x, who.y, who.level], r = await h.call('walkCharacter', { index: who.index, to: c.to });
  if (c.expect === 'blocked') return r.walked ? { pass: false, detail: 'expected no route, but walked ' + r.steps + ' steps' } : { pass: true, detail: r.reason };
  if (!r.walked) return { pass: false, detail: 'expected a route: ' + r.reason };
  const a = audit(m, start, r.route), fails = [...a.bad];
  if (c.storeys && a.storeys.join(' ') !== c.storeys.join(' ')) fails.push('storeys ' + (a.storeys.join(', ') || 'none') + ', expected ' + c.storeys.join(', '));
  if (c.heights && a.heights !== c.heights) fails.push('heights ' + a.heights + ', expected ' + c.heights);
  if (c.minSteps && r.steps < c.minSteps) fails.push(r.steps + ' steps, expected at least ' + c.minSteps);
  for (const [x, y] of c.via || []) if (!r.route.some(p => p[0] === x && p[1] === y)) fails.push('did not pass ' + x + ',' + y);
  const route = r.steps + ' steps · heights ' + a.heights + (a.storeys.length ? ' · storeys ' + a.storeys.join(', ') : '');
  return fails.length ? { pass: false, detail: fails.join('; ') + ' (' + route + ')' } : { pass: true, detail: route };
}
async function runAll() {
  list.textContent = ''; sum.textContent = 'Running…';
  const results = [];
  for (const c of S.checks) {
    let r; try { r = await runOne(c); } catch (e) { r = { pass: false, detail: 'error: ' + e.message }; }
    results.push({ name: c.name, ...r });
    const li = document.createElement('li'); li.className = r.pass ? 'ok' : 'bad'; li.title = 'Watch this walk';
    li.innerHTML = '<span class="mark"></span><span class="name"></span><span class="detail"></span>';
    li.querySelector('.mark').textContent = r.pass ? '✓' : '✗'; li.querySelector('.name').textContent = c.name; li.querySelector('.detail').textContent = r.detail;
    li.onclick = () => watch(c); list.appendChild(li);
  }
  const passed = results.filter(r => r.pass).length;
  sum.innerHTML = ''; const b = document.createElement('b'); b.textContent = passed + ' of ' + results.length + ' checks passed'; sum.appendChild(b);
  window.__sceneResults = { passed, total: results.length, results };
  await show(S.map);
  return window.__sceneResults;
}
/* back to the scene as saved, the editor open on it */
async function show(m, level = 0) {
  await h.call('open'); await h.call('setMap', { map: clone(m) });
  await h.call('setView', { level, fit: true, grid: false });
}
/* replay one check on screen: the view follows to the storey the walk ends on */
async function watch(c) {
  const m = sceneFor(c); await show(m, c.start ? c.start.level || 0 : 0);
  if (c.edits) await h.call('batch', { ops: c.edits });
  const who = (await h.call('listCharacters')).characters.find(x => x.sprite === c.who); if (!who) return;
  await h.call('setView', { level: Math.max(c.to.level || 0, who.level || 0) });
  await h.call('walkCharacter', { index: who.index, to: c.to });
}
window.__sceneRun = runAll;
if (S.checks.length) await runAll(); else { sum.textContent = 'No checks for this scene.'; await show(S.map); }
`;
}
