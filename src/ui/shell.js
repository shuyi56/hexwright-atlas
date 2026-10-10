import { ED, closeEditor, openCharacterMaker, openEditor } from '../editor/editor.js';
import { closeTactical, openTactical } from '../tactical/view.js';
import { closeTown, openTown } from '../town/view.js';
import { makerOpen } from '../characters/maker.js';
import { fromJSON } from '../editor/model.js';
import { layout, renderTiles } from '../editor/render.js';
import { MODULE_IDS, mountRail } from './rail.js';
import { $ } from './state.js';

/* ================= the app shell =================
   The atlas page holds every module as a layer over the realm map: the map editor, and over it the tactical view,
   the town view and the character maker. The rail (ui/rail.js) moves between them: picking one closes the layers
   above the editor and opens the one asked for, and the module showing is kept in the address (#editor,
   #tactical…), so a reload or a link from the unit data page lands on it. The back buttons inside each module
   still step down one layer, and the rail follows. The Scenes layer lists the bundled maps (scenes/ and the
   editor's test fixture) and opens each in the view it was laid out for, with the editor under it. */

const scenesEl = $('scenes'), grid = $('scGrid');
const ON_SCENE_PAGE = !!window.__HEXWRIGHT_SCENE__;

/* ---------- which module is showing: the topmost open layer ---------- */
function showing() {
  if (makerOpen()) return 'characters';
  if (!$('tactical').hidden) return 'tactical';
  if (!$('town').hidden) return 'town';
  if (ED.open) return 'editor';
  if (!scenesEl.hidden) return 'scenes';
  return 'atlas';
}

/* close everything over the editor; keepEditor false closes the editor too */
function closeAbove(keepEditor) {
  if (makerOpen()) $('cmBack').click();
  closeTactical(); closeTown();
  if (!keepEditor) closeEditor();
}
/* the editor, opened on its own map when it is not open already (and then nothing is left under it but the atlas) */
function ensureEditor() {
  if (ED.open) return;
  scenesEl.hidden = true; openEditor();
}

function go(id) {
  if (id === 'units') { location.href = './units.html'; return; }
  if (!MODULE_IDS.includes(id) || id === showing()) return;
  if (id === 'atlas') { closeAbove(false); scenesEl.hidden = true; $('map').focus({ preventScroll: true }); }
  else if (id === 'scenes') { closeAbove(false); showScenes(); }
  else {
    closeAbove(true); ensureEditor();
    if (id === 'tactical') openTactical();
    else if (id === 'town') openTown();
    else if (id === 'characters') openCharacterMaker();
  }
}

const setActive = mountRail(go, 'atlas', { skip: ON_SCENE_PAGE ? ['units'] : [] });
function sync() {
  const id = showing(); setActive(id);
  if (ON_SCENE_PAGE) return;
  const want = id === 'atlas' ? '' : `#${id}`;
  if (location.hash !== want) history.replaceState(null, '', want || location.pathname + location.search);
}
const watch = new MutationObserver(sync);
for (const el of [scenesEl, $('editor'), $('tactical'), $('town'), $('charMaker')]) watch.observe(el, { attributes: true, attributeFilter: ['hidden'] });
window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'atlas'));

/* ---------- scenes ---------- */
const MAPS = import.meta.glob(['/scenes/*/*.json', '/src/editor/fixtures/*.json'], { eager: true, import: 'default' });
const SCENES = Object.entries(MAPS)
  .filter(([path, J]) => J && J.format === 'hexwright-tiles' && !/\.(scene|checks)\.json$/.test(path))
  .map(([path, map]) => {
    const base = path.replace(/\.json$/, ''), meta = MAPS[`${base}.scene.json`] || MAPS[`${base}.checks.json`] || {};
    const [name, sub] = String(meta.title || map.name || 'Untitled').split(/:\s+/, 2);
    return { path, map, meta, name, sub: sub || '', view: meta.view || 'editor' };
  })
  /* the views to play first, then the editor's walking test */
  .sort((a, b) => ['tactical', 'town', 'editor'].indexOf(a.view) - ['tactical', 'town', 'editor'].indexOf(b.view) || a.name.localeCompare(b.name));
const VIEW = { tactical: ['Tactical', 'Play in tactical view'], town: ['Town', 'Walk the town'], editor: ['Editor', 'Open in map editor'] };

function openScene(sc, view) {
  let M; try { M = fromJSON(sc.map); } catch (err) { console.error(err); return; }
  closeAbove(false); scenesEl.hidden = false;
  openEditor(M, 'Scenes');
  if (view === 'tactical') openTactical(sc.meta.tactical || {});
  else if (view === 'town') openTown(sc.meta.town || {});
}

function buildScenes() {
  for (const sc of SCENES) {
    const card = document.createElement('article'); card.className = 'sc-card';
    const figure = document.createElement('div'); figure.className = 'sc-thumb';
    const cv = document.createElement('canvas'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `${sc.name}, seen from above`); figure.appendChild(cv);
    const badge = document.createElement('span'); badge.className = `sc-badge sc-${sc.view}`; badge.textContent = VIEW[sc.view][0]; figure.appendChild(badge);
    card.appendChild(figure);
    const body = document.createElement('div'); body.className = 'sc-body';
    const h = document.createElement('h2'); h.textContent = sc.name; body.appendChild(h);
    if (sc.sub) { const s = document.createElement('p'); s.className = 'sc-sub'; s.textContent = sc.sub; body.appendChild(s); }
    const n = (sc.map.characters || []).length, meta = document.createElement('p'); meta.className = 'sc-meta';
    meta.textContent = `${sc.map.size}×${sc.map.size} tiles · ${n ? `${n} figure${n > 1 ? 's' : ''}` : 'no figures'}${sc.meta.checks && sc.meta.checks.length ? ` · ${sc.meta.checks.length} walking checks` : ''}`;
    body.appendChild(meta);
    if (sc.meta.about) { const a = document.createElement('p'); a.className = 'sc-about'; a.textContent = sc.meta.about; a.title = sc.meta.about; body.appendChild(a); }
    const acts = document.createElement('div'); acts.className = 'sc-actions';
    const main = document.createElement('button'); main.type = 'button'; main.className = 'btn btn-brass'; main.textContent = VIEW[sc.view][1]; main.addEventListener('click', () => openScene(sc, sc.view)); acts.appendChild(main);
    if (sc.view !== 'editor') { const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'btn'; ed.textContent = 'Edit map'; ed.addEventListener('click', () => openScene(sc, 'editor')); acts.appendChild(ed); }
    body.appendChild(acts); card.appendChild(body); grid.appendChild(card);
    sc.canvas = cv;
  }
}
/* thumbnails: the editor's own renderer, one map per frame so the panel opens at once */
function drawThumbs() {
  const todo = SCENES.filter(sc => !sc.drawn);
  const next = () => {
    const sc = todo.shift(); if (!sc) return;
    sc.drawn = true;
    try {
      const M = fromJSON({ ...sc.map, customCharacters: [] }), { W } = layout(M.S), R = renderTiles(M, 0, 560 / W, { grid: false });
      sc.canvas.width = R.can.width; sc.canvas.height = R.can.height; sc.canvas.getContext('2d').drawImage(R.can, 0, 0);
    } catch (err) { console.error(err); }
    requestAnimationFrame(() => setTimeout(next, 0));
  };
  next();
}
function showScenes() {
  if (!grid.childElementCount) buildScenes();
  scenesEl.hidden = false; scenesEl.focus({ preventScroll: true });
  drawThumbs();
}
scenesEl.addEventListener('keydown', e => { if (e.key === 'Escape') go('atlas'); });

/* a link straight to a module (index.html#town) */
if (!ON_SCENE_PAGE) { const h = location.hash.slice(1); if (h && h !== 'atlas') go(h); }
sync();

export { go };
