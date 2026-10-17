import { PATTERNS } from '../data/classes.ts';
import { patternOffsets } from '../tactical/attack.js';
import { abilityOf } from '../battle/abilities.ts';
import { characterById } from '../characters/library.js';
import { WALK, render } from '../characters/roster.js';
import { figureThumb } from '../characters/draw.js';
import { BASE } from '../characters/body.js';
import { H as FH, W as FW } from '../characters/pixels.js';

/* ================= the class editor's parts =================
   The toast, the bridge requests, a sprite's thumbnail and its walking preview, the attack pattern drawn from above,
   and how abilities are named, for the class editor; the skill editor is built from the same ub- parts
   (classes.css). */
const $ = id => document.getElementById(id);
const WRITABLE = import.meta.env.DEV;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer = 0;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 2600); }
async function request(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ ok: false, error: { message: `the server answered ${r.status}` } }));
  if (!j.ok) throw new Error(j.error?.message || `the server answered ${r.status}`);
  return j;
}
function downloadText(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- sprites ---------- */
const spriteOf = id => (id ? characterById(id) : null);
const thumbs = new Map();
/* a 40-pixel thumbnail of a character (or of the sprite with this id), or a dashed box with a question mark when
   there is none */
function thumb(who) {
  const c = typeof who === 'string' ? spriteOf(who) : who;
  if (!c) { const s = document.createElement('span'); s.className = 'ub-thumb ub-nosprite'; s.textContent = '?'; return s; }
  let t = thumbs.get(c.look || c.id); if (!t) { t = figureThumb(c, 40); thumbs.set(c.look || c.id, t); }
  const out = document.createElement('canvas'); out.width = t.width; out.height = t.height; out.className = 'ub-thumb'; out.getContext('2d').drawImage(t, 0, 0); return out;
}
/* the stage beside a card: the sprite walking, with chips to turn it and stop it */
const P = { face: 0, playing: true };
const stageHtml = label => `<div class="ub-stage">
    <canvas id="preview" width="${FW * 8}" height="${(BASE + 6) * 8}" aria-label="${esc(label)}"></canvas>
    <div class="ub-stage-chips">
      <button class="chip" id="faceL" title="Turn left">⟲</button>
      <button class="chip" id="play" aria-pressed="${P.playing}">Walk</button>
      <button class="chip" id="faceR" title="Turn right">⟳</button>
    </div>
  </div>`;
const FACING = [['front', false], ['front', true], ['back', false], ['back', true]];
let anim = 0;
/* again: the stage is already showing and its chips already work, so only the figure changes */
function startPreview(c, again = false) {
  if (!again) bindStage();
  if (!c) { $('preview').classList.add('ub-blank'); return; }
  const can = $('preview'), g = can.getContext('2d'), frames = render(c), px = 8, one = document.createElement('canvas'), og = one.getContext('2d');
  one.width = FW; one.height = FH;
  const step = now => {
    anim = requestAnimationFrame(step);
    const [view, flip] = FACING[P.face], pose = P.playing ? WALK[Math.floor(now / 160) % WALK.length] : 0, im = og.createImageData(FW, FH);
    im.data.set(frames[view][pose]); og.putImageData(im, 0, 0);
    g.clearRect(0, 0, can.width, can.height); g.imageSmoothingEnabled = false;
    /* a shadow under the feet, then the figure with its soles two pixels above the canvas foot */
    const fy = (BASE + 4) * px; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(can.width / 2, fy - px, 9 * px, 2.4 * px, 0, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(can.width / 2, 0); if (flip) g.scale(-1, 1); g.drawImage(one, -FW / 2 * px, fy - (BASE + 1) * px, FW * px, FH * px); g.restore();
  };
  anim = requestAnimationFrame(step);
}
function bindStage() {
  $('faceL').addEventListener('click', () => { P.face = (P.face + 3) % 4; });
  $('faceR').addEventListener('click', () => { P.face = (P.face + 1) % 4; });
  $('play').addEventListener('click', () => { P.playing = !P.playing; $('play').setAttribute('aria-pressed', String(P.playing)); });
}
function stopPreview() { if (anim) cancelAnimationFrame(anim); anim = 0; }

/* ---------- patterns and abilities ---------- */
const patternLabel = id => (PATTERNS.find(([p]) => p === id) || PATTERNS[0])[1];
const patternOptions = v => PATTERNS.map(([id, label]) => `<option value="${id}"${id === v ? ' selected' : ''}>${label}</option>`).join('');
const PATTERN_NOTE = { melee: 'The four tiles beside it, no diagonals. Range does not change it.', line: 'Straight out in the four directions, up to Range tiles.', ranged: 'Any tile up to Range steps away along the grid.' };
/* a pattern seen from above on the map's grid: the unit in the middle, the tiles it strikes lit. The grid is at
   least five tiles across, so melee shows the corners it does not reach. */
function patternGrid(pattern, range, cls) {
  const R = Math.max(2, range), N = 2 * R + 1, hit = new Set(patternOffsets(pattern, range).map(([x, y]) => `${x},${y}`));
  let cells = '';
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) cells += `<rect x="${x + R}" y="${y + R}" width="1" height="1" class="${!x && !y ? 'me' : hit.has(`${x},${y}`) ? 'hit' : ''}"/>`;
  return `<svg class="${cls}" viewBox="-0.1 -0.1 ${N + 0.2} ${N + 0.2}" aria-hidden="true">${cells}<circle cx="${R + 0.5}" cy="${R + 0.5}" r="0.28"/></svg>`;
}
const abilityLabel = id => abilityOf(id)?.label || `${id} (no such skill)`;
const namesOf = list => (list || []).map(abilityLabel).join(', ');
const MENU_LABEL = { actions: 'Actions', spells: 'Spells' };

export { $, MENU_LABEL, PATTERN_NOTE, WRITABLE, abilityLabel, downloadText, esc, namesOf, patternGrid, patternLabel, patternOptions, request, same, spriteOf, stageHtml, startPreview, stopPreview, thumb, toast };
