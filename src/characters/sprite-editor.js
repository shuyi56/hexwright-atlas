import { $ } from '../ui/state.js';
import { renderFrame, spriteThumb } from './draw.js';
import * as library from './library.js';
import { FACES, FACE_LABEL, FRAMES, MAX_PAL, SIZE, blankSprite, cloneSprite, fillFrame, flipFrame, setPixel, shiftFrame, spriteFromJSON, spriteToJSON } from './sprite.js';

/* ================= character sprite editor =================
   A 16×16 pixel workbench. Each character has four facings with two frames each (standing and
   mid-stride); the tile editor plays them as the character walks. Every finished stroke is saved to
   the library at once, so there is no save button to forget. */
const root = $('spriteEditor'), cv = $('spCanvas'), cx = cv.getContext('2d'), pv = $('spPreview'), pvx = pv.getContext('2d');
const TOOLS = [['pencil', 'Pencil', 'B'], ['eraser', 'Eraser', 'E'], ['fill', 'Fill', 'G'], ['pick', 'Pick', 'I']];
const MIRROR = { sw: 'se', se: 'sw', ne: 'nw', nw: 'ne' };
const HIST = 80;
const SP = { open: false, s: null, face: 'se', frame: 0, tool: 'pencil', color: 1, sym: false, onion: true, undo: [], redo: [], stroke: null, back: null, tick: 0, timer: 0, saveT: 0 };
const frameOf = () => SP.s.frames[SP.face][SP.frame];

/* ---------- history and saving ---------- */
const snap = () => JSON.stringify(spriteToJSON(SP.s));
const restore = j => { const keep = SP.s.rev; SP.s = spriteFromJSON(JSON.parse(j)); SP.s.rev = keep; };
function checkpoint() { SP.undo.push(snap()); if (SP.undo.length > HIST) SP.undo.shift(); SP.redo.length = 0; }
function undo() { if (!SP.undo.length) return; SP.redo.push(snap()); restore(SP.undo.pop()); commit(); }
function redo() { if (!SP.redo.length) return; SP.undo.push(snap()); restore(SP.redo.pop()); commit(); }
/* write the working sprite to the library and refresh everything that shows it */
function commit() { SP.s.rev = library.save(SP.s).rev; sync(); refreshPick(); paint(); }
function edited() { clearTimeout(SP.saveT); SP.saveT = setTimeout(() => { if (SP.s) commit(); }, 250); sync(); paint(); }
function sync() { $('spUndo').disabled = !SP.undo.length; $('spRedo').disabled = !SP.redo.length; }

/* ---------- drawing area ---------- */
function paint() {
  const W = cv.width, cell = W / SIZE; cx.clearRect(0, 0, W, W);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { cx.fillStyle = (x + y) % 2 ? '#2a3436' : '#243032'; cx.fillRect(x * cell, y * cell, cell, cell); }
  cx.imageSmoothingEnabled = false;
  if (SP.onion && FRAMES > 1) { cx.globalAlpha = 0.28; cx.drawImage(renderFrame(SP.s, SP.face, 1 - SP.frame), 0, 0, W, W); cx.globalAlpha = 1; }
  cx.drawImage(renderFrame(SP.s, SP.face, SP.frame), 0, 0, W, W);
  cx.strokeStyle = 'rgba(255,240,200,0.13)'; cx.lineWidth = 1; cx.beginPath();
  for (let i = 1; i < SIZE; i++) { cx.moveTo(i * cell, 0); cx.lineTo(i * cell, W); cx.moveTo(0, i * cell); cx.lineTo(W, i * cell); }
  cx.stroke();
  cx.strokeStyle = 'rgba(228,198,132,0.35)'; cx.beginPath(); cx.moveTo(W / 2, 0); cx.lineTo(W / 2, W); cx.stroke();
  drawPreview();
}
function drawPreview() {
  const px = pv.width / (SIZE * FACES.length), k = SP.tick % FRAMES; pvx.clearRect(0, 0, pv.width, pv.height); pvx.imageSmoothingEnabled = false;
  FACES.forEach((f, i) => pvx.drawImage(renderFrame(SP.s, f, k), i * SIZE * px, pv.height - SIZE * px, SIZE * px, SIZE * px));
}
const cellAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * SIZE), Math.floor((e.clientY - r.top) / r.height * SIZE)]; };

/* ---------- tools ---------- */
function applyAt(x, y) {
  const fr = frameOf(), v = SP.tool === 'eraser' ? 0 : SP.color; let n = 0;
  if (SP.tool === 'pencil' || SP.tool === 'eraser') { n += setPixel(fr, x, y, v); if (SP.sym) n += setPixel(fr, SIZE - 1 - x, y, v); }
  else if (SP.tool === 'fill') n += fillFrame(fr, x, y, SP.color) + (SP.sym ? 0 : 0);
  else if (SP.tool === 'pick') { const p = fr[y * SIZE + x]; if (p) { SP.color = p; setTool('pencil'); buildSwatches(); } else setTool('eraser'); }
  if (n) edited();
}
function setTool(t) { SP.tool = t; for (const b of root.querySelectorAll('[data-sptool]')) b.setAttribute('aria-pressed', String(b.dataset.sptool === t)); }
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const [x, y] = cellAt(e); if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  checkpoint(); SP.stroke = { last: `${x},${y}`, before: SP.undo[SP.undo.length - 1] }; applyAt(x, y);
});
cv.addEventListener('pointermove', e => {
  if (!SP.stroke) return; const [x, y] = cellAt(e), k = `${x},${y}`; if (k === SP.stroke.last) return; SP.stroke.last = k;
  if (SP.tool === 'pencil' || SP.tool === 'eraser') applyAt(x, y);
});
const endStroke = () => { if (!SP.stroke) return; if (SP.stroke.before === snap()) SP.undo.pop(); SP.stroke = null; sync(); };
cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);

/* ---------- whole-frame actions ---------- */
function act(fn) { checkpoint(); const before = snap(); fn(); if (snap() === before) { SP.undo.pop(); sync(); return; } edited(); }
const mirrorToOpposite = () => act(() => { const to = MIRROR[SP.face]; for (let k = 0; k < FRAMES; k++) SP.s.frames[to][k] = flipFrame(SP.s.frames[SP.face][k].slice()); setFace(to); });
const copyFrame = () => act(() => { SP.s.frames[SP.face][1 - SP.frame] = frameOf().slice(); });

/* ---------- palette ---------- */
function buildSwatches() {
  const box = $('spSwatches'); box.textContent = '';
  const mk = (v, color, title) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-swatch' + (v === 0 ? ' clear' : ''); b.title = title; b.setAttribute('aria-pressed', String(SP.color === v && SP.tool !== 'eraser'));
    if (v) b.style.background = color; b.addEventListener('click', () => { if (v === 0) setTool('eraser'); else { SP.color = v; if (SP.tool === 'eraser' || SP.tool === 'pick') setTool('pencil'); } buildSwatches(); }); box.appendChild(b);
  };
  mk(0, '', 'Clear'); SP.s.pal.forEach((c, k) => mk(k + 1, c, c));
  $('spColor').value = SP.s.pal[SP.color - 1] || '#000000'; $('spAddColor').disabled = SP.s.pal.length >= MAX_PAL;
}
$('spColor').addEventListener('input', () => { if (SP.color < 1) return; checkpoint(); SP.s.pal[SP.color - 1] = $('spColor').value; edited(); buildSwatches(); });
$('spAddColor').addEventListener('click', () => { if (SP.s.pal.length >= MAX_PAL) return; checkpoint(); SP.s.pal.push($('spColor').value); SP.color = SP.s.pal.length; setTool('pencil'); edited(); buildSwatches(); });

/* ---------- faces and frames ---------- */
function setFace(f) { SP.face = f; for (const b of root.querySelectorAll('[data-spface]')) b.setAttribute('aria-selected', String(b.dataset.spface === f)); paint(); }
function setFrame(k) { SP.frame = k; for (const b of root.querySelectorAll('[data-spframe]')) b.setAttribute('aria-selected', String(+b.dataset.spframe === k)); paint(); }

/* ---------- the library list ---------- */
function refreshPick() {
  const sel = $('spPick'); sel.textContent = '';
  for (const s of library.list()) { const o = new Option(s.name, s.id); sel.add(o); }
  sel.value = SP.s.id;
}
function load(s) {
  clearTimeout(SP.saveT); SP.s = cloneSprite(s); SP.undo = []; SP.redo = []; SP.color = Math.min(SP.color, SP.s.pal.length) || 1;
  $('spName').value = s.name; refreshPick(); buildSwatches(); sync(); paint();
}
function newSprite() { const s = blankSprite(`Character ${library.list().length + 1}`); library.save(s); load(library.get(s.id)); }

/* ---------- chrome ---------- */
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function build() {
  const tb = $('spTools'); for (const [id, label, key] of TOOLS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ed-tool'; b.dataset.sptool = id; b.title = `${label} (${key})`; b.innerHTML = `<span aria-hidden="true">${{ pencil: '✎', eraser: '✕', fill: '◩', pick: '◉' }[id]}</span>${label}`; b.addEventListener('click', () => { setTool(id); buildSwatches(); }); tb.appendChild(b); }
  const ft = $('spFaces'); for (const f of FACES) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.role = 'tab'; b.dataset.spface = f; b.textContent = FACE_LABEL[f]; b.addEventListener('click', () => setFace(f)); ft.appendChild(b); }
  const fr = $('spFrames'); for (let k = 0; k < FRAMES; k++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.role = 'tab'; b.dataset.spframe = k; b.textContent = k ? 'Stride' : 'Standing'; b.addEventListener('click', () => setFrame(k)); fr.appendChild(b); }
  $('spBack').addEventListener('click', closeSpriteEditor);
  $('spPick').addEventListener('change', () => { const s = library.get($('spPick').value); if (s) load(s); });
  $('spName').addEventListener('change', () => { checkpoint(); SP.s.name = $('spName').value.trim().slice(0, 40) || 'Character'; $('spName').value = SP.s.name; commit(); });
  $('spNew').addEventListener('click', newSprite);
  $('spCopy').addEventListener('click', () => { const c = cloneSprite(SP.s, false); c.name = (c.name + ' copy').slice(0, 40); library.save(c); load(library.get(c.id)); });
  $('spDelete').addEventListener('click', () => {
    if (!confirm(`Delete “${SP.s.name}”? Characters already standing on a map keep their picture only if the map was saved.`)) return;
    library.remove(SP.s.id); const next = library.list()[0]; if (next) load(next); else newSprite();
  });
  $('spUndo').addEventListener('click', undo); $('spRedo').addEventListener('click', redo);
  $('spSym').addEventListener('click', () => { SP.sym = !SP.sym; $('spSym').setAttribute('aria-pressed', String(SP.sym)); });
  $('spOnion').addEventListener('click', () => { SP.onion = !SP.onion; $('spOnion').setAttribute('aria-pressed', String(SP.onion)); paint(); });
  $('spMirror').addEventListener('click', mirrorToOpposite);
  $('spCopyFrame').addEventListener('click', copyFrame);
  $('spFlip').addEventListener('click', () => act(() => flipFrame(frameOf())));
  $('spClear').addEventListener('click', () => act(() => frameOf().fill(0)));
  for (const [id, dx, dy] of [['spLeft', -1, 0], ['spRight', 1, 0], ['spUp', 0, -1], ['spDown', 0, 1]]) $(id).addEventListener('click', () => act(() => shiftFrame(frameOf(), dx, dy)));
  $('spSave').addEventListener('click', () => download((SP.s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'character') + '.character.json', new Blob([JSON.stringify(spriteToJSON(SP.s))], { type: 'application/json' })));
  $('spLoad').addEventListener('click', () => $('spFile').click());
  $('spFile').addEventListener('change', async () => {
    const f = $('spFile').files[0]; $('spFile').value = ''; if (!f) return;
    try { const s = spriteFromJSON(JSON.parse(await f.text())); if (library.get(s.id)) { s.id = cloneSprite(s, false).id; } library.save(s); load(library.get(s.id)); } catch (err) { $('spStatus').textContent = `Could not open ${f.name}: ${err.message}`; }
  });
  root.addEventListener('keydown', e => {
    if (!SP.open || /INPUT|SELECT/.test(e.target.tagName)) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'z' || k === 'Z')) { e.shiftKey ? redo() : undo(); } else if (mod && (k === 'y' || k === 'Y')) redo(); else if (mod) return;
    else if (k === 'Escape') closeSpriteEditor();
    else { const t = TOOLS.find(t2 => t2[2].toLowerCase() === k.toLowerCase()); if (!t) return; setTool(t[0]); buildSwatches(); }
    e.preventDefault();
  });
}

/* open on a library sprite (or the first one, or a fresh one); back names the screen it returns to */
let onClose = null;
function openSpriteEditor(id, back = 'Tile editor', closed = null) {
  const fresh = id === 'new', s = (!fresh && id && library.get(id)) || library.list()[0] || blankSprite('Character 1');
  if (!library.get(s.id)) library.save(s);
  root.hidden = false; SP.open = true; onClose = closed; $('spBack').textContent = `← ${back}`;
  load(library.get(s.id)); if (fresh) newSprite(); setTool('pencil'); setFace('se'); setFrame(0); buildSwatches(); $('spSym').setAttribute('aria-pressed', String(SP.sym)); $('spOnion').setAttribute('aria-pressed', String(SP.onion));
  clearInterval(SP.timer); SP.timer = setInterval(() => { SP.tick++; drawPreview(); }, 320);
  root.focus({ preventScroll: true }); return SP.s.id;
}
function closeSpriteEditor() {
  if (!SP.open) return; clearTimeout(SP.saveT); if (SP.s) { SP.s.rev = library.save(SP.s).rev; }
  clearInterval(SP.timer); SP.open = false; root.hidden = true; const f = onClose; onClose = null; if (f) f(SP.s && SP.s.id);
}

build();
export { SP, closeSpriteEditor, openSpriteEditor, spriteThumb };
