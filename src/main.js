import './styles/main.css';
import './ui/input.js';
import './editor/api.js';
import './editor/bridge.js';
import { state } from './ui/state.js';
import { CX, CY, worldH } from './core/geometry.js';
import { renderBase } from './render/base.js';
import { $, S, veil, wrap } from './ui/state.js';
import { buildLabels, requestDraw } from './ui/draw.js';
import { clampPan, clampZ, fit, resize } from './ui/view.js';
import { buildKey, buildPlaces, select } from './ui/ledger.js';
import { closeCity } from './ui/city-view.js';
import { generate } from './world/generate.js';

/* ================= boot ================= */
const SEED_WORDS = ['ember', 'thorn', 'gloam', 'rime', 'wyrm', 'lark', 'cinder', 'hallow', 'briar', 'shale', 'raven', 'mist'];
function randomSeed() { const r = Math.random; return SEED_WORDS[Math.floor(r() * SEED_WORDS.length)] + '-' + Math.floor(r() * 9000 + 1000); }
function rebuildBase() {
  if (!state.map) return; veil.hidden = false; veil.textContent = 'Inking the map…';
  setTimeout(() => { state.baseImg = renderBase(state.map, S, state.showGrid); veil.hidden = true; requestDraw(); }, 30);
}
function load(seed) {
  if (typeof closeCity === 'function') closeCity();
  veil.hidden = false; veil.textContent = 'Surveying the realm…'; $('seedInput').value = seed;
  setTimeout(() => {
    state.map = generate(seed);
    $('realmKind').textContent = `the ${state.map.realm.kind.toLowerCase()} of`;
    $('realmName').textContent = state.map.realm.name;
    state.baseImg = renderBase(state.map, S, state.showGrid);
    buildLabels(); buildPlaces(); buildKey();
    const cap = state.map.settle.find(s => s.kind === 'capital');
    state.sel = -1; state.hover = -1; if (cap) select(cap.i, true);
    fit();
    if (cap && state.cw < 700) { state.z = clampZ(Math.max(state.fitZ * 1.6, (state.ch / worldH) * 1.05)); state.ox = state.cw / 2 - CX[cap.i] * state.z; state.oy = state.ch / 2 - CY[cap.i] * state.z; clampPan(); }
    veil.hidden = true; requestDraw();
  }, 30);
}
$('seedForm').addEventListener('submit', e => { e.preventDefault(); const v = $('seedInput').value.trim(); load(v || randomSeed()); });
$('newRealm').addEventListener('click', () => load(randomSeed()));
new ResizeObserver(resize).observe(wrap);
resize();
const fontsReady = Promise.race([
  Promise.all(['16px "IM Fell English SC"', '16px "IM Fell English"', 'italic 16px "IM Fell English"'].map(f => document.fonts.load(f))),
  new Promise(r => setTimeout(r, 2500))
]).catch(() => {});
fontsReady.then(() => load('ember-1147'));

export { rebuildBase };
