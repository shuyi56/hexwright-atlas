import { TERRAIN_BY_ID } from '../tiles/terrain.js';
import { $ } from '../ui/state.js';
import { APPLIES, BODY_COLOURS, CHOICES, COLOURS, OUTFIT_KEYS, SWATCHES, cleanSpec, describe, fromSpec, newId } from './custom.js';
import { getClass, listClasses, onClassesChange } from '../data/classes.ts';
import { BASE } from './body.js';
import * as library from './library.js';
import { H, W, hexRgb } from './pixels.js';
import { ATTACK, FRAMES, VIEWS, WALK, attackOf, frame, render } from './roster.js';
import { ATTACK_BEATS } from './sheet.js';
import { TOWNSFOLK } from './townsfolk.js';

/* ================= character sprites: the character maker =================
   A screen over the tile editor for making the playable characters, in this style. Each one is a spec (custom.js):
   a choice for each of build, clothes, sleeves, hair, hat, beard, what is held, shield, cape and satchel, and a
   colour for each material it shows. A character can take a class (data/classes.ts): it then wears the class's
   outfit (clothes, hat, gear and their colours, set in the class editor) over its own build, hair, ears, beard and
   skin, which are all the maker shows, and fights with the class's numbers. Choices are chips; colours are rows (only those the character uses), set from the tile set's
   swatches or any colour. A character can start from any of the townsfolk. The preview shows it in all four
   facings on grass, standing, walking or attacking (winding up and striking with whatever it holds, over and over),
   exactly as the map draws it. Every change saves to the character library (library.js) at once, with its own undo. */
const root = $('charMaker'), cv = $('cmPreview'), g = cv.getContext('2d'), panel = $('cmChoices'), statusEl = $('cmStatus');
const GROUPS = [['Body', ['build', 'clothes', 'sleeves', 'cut', 'neckline', 'rope']], ['Head', ['hair', 'ears', 'hat', 'beard']], ['Gear', ['held', 'shield', 'cape', 'satchel']]];
const LABEL = { build: 'build', clothes: 'clothes', sleeves: 'sleeves', cut: 'sleeve cut', neckline: 'neckline', rope: 'belt', hair: 'hair', ears: 'ears', hat: 'hat', beard: 'beard', held: 'in hand', shield: 'shield', cape: 'cape', satchel: 'satchel' };
const FACINGS = [['front', false], ['front', true], ['back', false], ['back', true]];
/* each animation: its poses in order and how long each is held, in milliseconds (the attack's as on the sheet) */
const ANIMS = { stand: { beats: [0], ms: 0 }, walk: { beats: WALK, ms: 170 }, attack: { beats: ATTACK_BEATS, ms: 120 } };
/* what each kind of attack looks like, for the status line */
const BLOW = {
  swing: 'raises the blade over the head and brings it down', chop: 'lifts the axe in both hands and brings it down',
  thrust: 'draws the spear back in both hands and drives it forward', cast: 'lifts the staff in a glint of light and sweeps it forward',
  shoot: 'draws the bow to the jaw and looses', punch: 'cocks a fist at the shoulder and throws it',
  bite: 'crouches and lunges, jaws wide', pounce: 'squashes flat and pounces' };
/* the maker's state: the spec being made, its history, how the editor gets it back, and the preview */
const MK = { spec: null, undo: [], redo: [], back: null, canDelete: null, colour: 'cloth', anim: 'walk', beat: 0, timer: 0, frames: null, crisp: new Map(), open: false, editing: false };

/* ---------- the spec, its history and saving ---------- */
const clone = s => JSON.parse(JSON.stringify(s));
function commit(next) {
  MK.undo.push(clone(MK.spec)); if (MK.undo.length > 80) MK.undo.shift(); MK.redo.length = 0;
  set(next);
}
/* show a spec and save it; the panel follows the choices that apply */
function set(next, rebuildPanel = true) {
  MK.spec = cleanSpec(next); library.save(MK.spec); MK.frames = null; MK.crisp.clear();
  if (rebuildPanel) build(); syncBar(); draw();
}
function undo() { if (!MK.undo.length) return; MK.redo.push(clone(MK.spec)); set(MK.undo.pop()); say('Undone.'); }
function redo() { if (!MK.redo.length) return; MK.undo.push(clone(MK.spec)); set(MK.redo.pop()); say('Redone.'); }
const say = t => { statusEl.textContent = t; };
function syncBar() {
  $('cmUndo').disabled = !MK.undo.length; $('cmRedo').disabled = !MK.redo.length;
  if (document.activeElement !== $('cmName')) $('cmName').value = MK.spec.name;
}

/* ---------- the panel: a row of chips for each choice that applies, then the colours it shows ---------- */
function chips(key) {
  const row = document.createElement('div'); row.className = 'cm-choice';
  const l = document.createElement('span'); l.className = 'ed-lbl'; l.textContent = LABEL[key]; row.appendChild(l);
  const box = document.createElement('div'); box.className = 'cm-chips'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', LABEL[key]);
  for (const [v, text] of CHOICES[key]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = text; b.setAttribute('aria-pressed', String(MK.spec[key] === v));
    b.addEventListener('click', () => { if (MK.spec[key] !== v) { commit({ ...MK.spec, [key]: v }); say(`${text}.`); } });
    box.appendChild(b);
  }
  row.appendChild(box); return row;
}
/* the class whose outfit the character wears, if it has one that has an outfit */
const wearing = () => { const c = MK.spec.class ? getClass(MK.spec.class) : null; return c && c.outfit ? c : null; };
/* the class: none (the character's own outfit), or any class with an outfit, as chips */
function classRow() {
  const row = document.createElement('div'); row.className = 'cm-choice';
  const box = document.createElement('div'); box.className = 'cm-chips'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Class');
  const missing = MK.spec.class && !wearing() ? [[MK.spec.class, `${MK.spec.class} (no outfit)`]] : [];
  for (const [v, text] of [['', 'None'], ...listClasses().map(c => [c.id, c.name]), ...missing]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = text; b.setAttribute('aria-pressed', String(MK.spec.class === v));
    b.addEventListener('click', () => { if (MK.spec.class !== v) { commit({ ...MK.spec, class: v }); say(v ? `A ${text.toLowerCase()}: wears the class's outfit and fights with its numbers.` : 'No class: wears an outfit of its own, and fights with the default numbers.'); } });
    box.appendChild(b);
  }
  row.appendChild(box); return row;
}
/* the colours a character shows: those of the materials in its frames, its attack's too (an arrow's head and
   fletching); in a class's outfit, only its own skin and hair */
function usedColours() {
  const c = fromSpec(MK.spec), seen = new Set(), cls = wearing();
  for (const v of VIEWS) for (let k = 0; k < FRAMES; k++) for (const m of frame(c, v, k).mat) if (m) seen.add(m);
  if (seen.has('P') && MK.spec.clothes === 'overalls') seen.delete('P');           /* the overalls' colour runs down the legs */
  return COLOURS.filter(([key, letter]) => seen.has(letter) && (!cls || BODY_COLOURS.includes(key)));
}
function build() {
  const top = panel.scrollTop; panel.textContent = '';
  const ch = document.createElement('h3'); ch.className = 'ed-group'; ch.textContent = 'Class'; panel.appendChild(ch);
  panel.appendChild(classRow());
  const cls = wearing();
  if (cls) {
    const p = document.createElement('p'); p.className = 'cm-note';
    p.innerHTML = 'Wears the <b></b> outfit. <a href="">Change it in the class editor</a>.';
    p.querySelector('b').textContent = cls.name; p.querySelector('a').href = `./classes.html?class=${encodeURIComponent(cls.id)}`;
    panel.appendChild(p);
  }
  for (const [name, keys] of GROUPS) {
    const shown = keys.filter(k => (!cls || !OUTFIT_KEYS.includes(k)) && (!APPLIES[k] || APPLIES[k](MK.spec)));
    if (!shown.length) continue;
    const h = document.createElement('h3'); h.className = 'ed-group'; h.textContent = name; panel.appendChild(h);
    for (const k of shown) panel.appendChild(chips(k));
  }
  const h = document.createElement('h3'); h.className = 'ed-group'; h.textContent = 'Colours'; panel.appendChild(h);
  const used = usedColours(); if (!used.some(([k]) => k === MK.colour)) MK.colour = (used.find(([k]) => k === 'cloth') || used[0] || ['cloth'])[0];
  for (const [key, , text] of used) {
    const row = document.createElement('div'); row.className = 'cm-colour'; row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-pressed', String(key === MK.colour)); row.dataset.colour = key;
    const input = document.createElement('input'); input.type = 'color'; input.value = MK.spec.colours[key]; input.setAttribute('aria-label', text);
    const t = document.createElement('span'); t.textContent = text;
    row.append(input, t);
    const pick = () => { MK.colour = key; for (const r of panel.querySelectorAll('.cm-colour')) r.setAttribute('aria-pressed', String(r.dataset.colour === key)); };
    row.addEventListener('click', e => { if (e.target !== input) pick(); });
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    /* dragging the colour picker updates the preview; letting go makes it one step to undo */
    input.addEventListener('focus', pick);
    input.addEventListener('input', () => { if (!MK.editing) { MK.editing = true; MK.undo.push(clone(MK.spec)); MK.redo.length = 0; } set({ ...MK.spec, colours: { ...MK.spec.colours, [key]: input.value } }, false); });
    input.addEventListener('change', () => { MK.editing = false; build(); });
    panel.appendChild(row);
  }
  const sw = document.createElement('div'); sw.className = 'cm-swatches'; sw.setAttribute('aria-label', 'Swatches for the chosen colour');
  for (const hex of SWATCHES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cm-swatch'; b.style.background = hex; b.title = hex; b.setAttribute('aria-label', `Use ${hex}`);
    b.addEventListener('click', () => { if (MK.spec.colours[MK.colour] !== hex) commit({ ...MK.spec, colours: { ...MK.spec.colours, [MK.colour]: hex } }); });
    sw.appendChild(b);
  }
  panel.appendChild(sw);
  panel.scrollTop = top;
}

/* ---------- the preview: the four facings on grass, each sprite pixel a square ---------- */
function crisp(view, pose) {
  const key = view + pose; let c = MK.crisp.get(key);
  if (!c) {
    if (!MK.frames) MK.frames = render(fromSpec(MK.spec));
    c = document.createElement('canvas'); c.width = W; c.height = H;
    const cg = c.getContext('2d'), im = cg.createImageData(W, H); im.data.set(MK.frames[view][pose]); cg.putImageData(im, 0, 0); MK.crisp.set(key, c);
  }
  return c;
}
/* a pixel grass tile under the feet, in the tile set's colours, as on the sprite sheet: a 2:1 diamond 32 wide
   centred on the soles, its two soil faces below, and a soft shadow */
const TILE_BOTTOM = (() => { const b = new Array(W).fill(0); for (let j = 0; j < 16; j++) { const hw = 2 + 2 * Math.min(j, 15 - j); for (let x = 16 - hw; x < 16 + hw; x++) b[x] = j; } return b; })();
function tile(x, y, k) {
  const T = TERRAIN_BY_ID.grass, top = BASE - 7, rgb = h => `rgb(${hexRgb(h)})`;
  g.fillStyle = rgb(T.top);
  for (let j = 0; j < 16; j++) { const hw = 2 + 2 * Math.min(j, 15 - j); g.fillRect(x + (16 - hw) * k, y + (top + j) * k, 2 * hw * k, k); }
  for (let i = 0; i < W; i++) { g.fillStyle = rgb(T.side[i < 16 ? 0 : 1]); g.fillRect(x + i * k, y + (top + TILE_BOTTOM[i] + 1) * k, k, 4 * k); }
  g.fillStyle = 'rgba(74,52,26,0.3)'; g.beginPath(); g.ellipse(x + 16 * k, y + (BASE + 0.5) * k, 8 * k, 2 * k, 0, 0, Math.PI * 2); g.fill();
}
function draw() {
  if (!MK.open || !MK.spec) return;
  const stage = cv.parentElement, dpr = Math.min(2, window.devicePixelRatio || 1), sw = stage.clientWidth - 24, sh = stage.clientHeight - 70;
  const k = Math.max(1, Math.floor(Math.min(sw * dpr / (FACINGS.length * (W + 6)), sh * dpr / (H + 14)))), cellW = (W + 6) * k;
  cv.width = FACINGS.length * cellW; cv.height = (H + 14) * k; cv.style.width = `${cv.width / dpr}px`; cv.style.height = `${cv.height / dpr}px`;
  g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const { beats } = ANIMS[MK.anim], pose = beats[MK.beat % beats.length], { shift } = attackOf(fromSpec(MK.spec));
  FACINGS.forEach(([view, flip], f) => {
    /* an attack's frames stand the figure back for the blow: drawn moved forward again, the feet stay on the tile */
    const x = f * cellW + 3 * k, y = k, back = pose >= ATTACK[0] ? shift * (view === 'front' ? -1 : 1) * (flip ? -1 : 1) * k : 0;
    tile(x, y, k);
    g.save(); if (flip) { g.translate(x + back + W * k, 0); g.scale(-1, 1); g.drawImage(crisp(view, pose), 0, y, W * k, H * k); } else g.drawImage(crisp(view, pose), x + back, y, W * k, H * k); g.restore();
  });
}
function tick() { MK.beat++; draw(); }
function animate() { clearInterval(MK.timer); const { ms } = ANIMS[MK.anim]; MK.beat = 0; MK.timer = ms && MK.open ? setInterval(tick, ms) : 0; }
/* pick the animation the preview plays */
function play(anim) {
  MK.anim = anim; for (const b of document.querySelectorAll('.cm-anim .chip')) b.setAttribute('aria-pressed', String(b.dataset.anim === anim));
  animate(); draw();
  if (anim === 'attack' && MK.spec) say(`${MK.spec.name} ${BLOW[attackOf(fromSpec(MK.spec)).kind]}.`);
}

/* ---------- opening and closing ---------- */
/* the templates a character can start from: the townsfolk, and a plain one */
function templates() {
  const sel = $('cmFrom'); sel.textContent = '';
  const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
  add('', '—'); for (const t of TOWNSFOLK) add(t.id, t.name); add('plain', 'A plain villager');
}
/* Open the maker on a character: the id of one in the library, 'new' for a new one, or the id of one of the
   townsfolk to start a new character from them. back(id) is called with the character's id on the way out, and
   canDelete(id) gives a reason it cannot be deleted (it stands on the map), or nothing. */
function openMaker(what, { back, canDelete, label = 'Tile editor' } = {}) {
  const town = TOWNSFOLK.find(t => t.id === what), mine = library.get(what);
  const spec = mine ? mine.spec : town ? { ...clone(town.spec), id: newId(), name: `${town.name} (mine)` } : { id: newId(), name: 'New character' };
  MK.back = back; MK.canDelete = canDelete; MK.undo = []; MK.redo = []; MK.colour = 'cloth'; MK.open = true;
  $('cmBack').textContent = `← ${label}`; root.hidden = false; templates();
  set(spec); say(mine ? 'Changes save to your character library as you go.' : 'A new character, saved to your character library. Changes save as you go.');
  animate(); root.focus({ preventScroll: true });
}
function close() {
  if (!MK.open) return;
  MK.open = false; animate(); root.hidden = true;
  const id = MK.spec && library.get(MK.spec.id) ? MK.spec.id : null;
  if (MK.back) MK.back(id);
}
const makerOpen = () => MK.open;

$('cmBack').addEventListener('click', close);
$('cmDone').addEventListener('click', close);
$('cmUndo').addEventListener('click', undo);
$('cmRedo').addEventListener('click', redo);
$('cmName').addEventListener('focus', () => { MK.undo.push(clone(MK.spec)); MK.redo.length = 0; });
$('cmName').addEventListener('input', () => { MK.spec = { ...MK.spec, name: $('cmName').value }; library.save(cleanSpec(MK.spec)); syncBar(); });
$('cmName').addEventListener('change', () => set(MK.spec, false));
$('cmFrom').addEventListener('change', () => {
  const v = $('cmFrom').value, t = TOWNSFOLK.find(x => x.id === v); $('cmFrom').value = ''; if (!v) return;
  const base = t ? clone(t.spec) : cleanSpec({});
  commit({ ...base, id: MK.spec.id, name: MK.spec.name }); say(`Started from ${t ? t.name.toLowerCase() : 'a plain villager'}: ${describe(MK.spec).toLowerCase()}`);
});
$('cmCopy').addEventListener('click', () => {
  const copy = { ...clone(MK.spec), id: newId(), name: `${MK.spec.name} (copy)`.slice(0, 40) };
  MK.undo = []; MK.redo = []; set(copy); say(`Duplicated as ${copy.name}.`);
});
$('cmDelete').addEventListener('click', () => {
  const why = MK.canDelete && MK.canDelete(MK.spec.id); if (why) { say(why); return; }
  if (!window.confirm(`Delete ${MK.spec.name} from your character library?`)) return;
  library.remove(MK.spec.id); MK.spec = null; close();
});
for (const b of document.querySelectorAll('.cm-anim .chip')) b.addEventListener('click', () => play(b.dataset.anim));
root.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'color') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if (e.key === 'Escape') close();
});
new ResizeObserver(() => draw()).observe(cv.parentElement);
/* a class saved in the class editor: the outfit on show changes, and so do the classes to pick from */
onClassesChange(() => { if (MK.open && MK.spec) { MK.frames = null; MK.crisp.clear(); build(); draw(); } });

export { makerOpen, openMaker };
