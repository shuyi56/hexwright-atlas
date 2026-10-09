import '../styles/main.css';
import './units.css';
import '../data/unit-files.js';
import { DEFAULT_UNIT, FIELDS, GROUPS, GROUP_LABEL, SECTIONS, listUnits, normalizeUnit, onUnitsChange, unitPath, unitText, validateUnit } from '../data/units.js';
import { characterById, list as customCharacters } from '../characters/library.js';
import { ROSTER, WALK, render } from '../characters/roster.js';
import { figureThumb } from '../characters/draw.js';
import { BASE } from '../characters/body.js';
import { H as FH, W as FW } from '../characters/pixels.js';

/* ================= the unit data page =================
   Every unit in data/units/ (src/data/units.js) to read and change: a list down the side, a card per unit with its
   sprite walking, its HP and Attack, its movement and notes, and a table of everyone for balancing numbers side by
   side. Changes are drafts until saved. On the dev server Save writes the files through the Hexwright bridge
   (tools/vite-hexwright.js), and the tactical view in any open tab picks the new numbers up at once; a built copy
   of the site can read the units and download a unit's file, but not save. */
const $ = id => document.getElementById(id);
const WRITABLE = import.meta.env.DEV;
const SAVE_URL = (group, id) => `/__hexwright/units/${group}/${id}`;
const SECTION_LABEL = { stats: 'Stats', movement: 'Movement' };

/* id -> { group, draft, saved, savedGroup }: saved is null for a unit not yet written */
const E = new Map();
const V = { sel: null, view: 'cards', filter: '', sort: { key: 'group', dir: 1 }, face: 0, playing: true };

/* ---------- drafts ---------- */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isDirty = e => !e.saved || e.group !== e.savedGroup || !same(normalizeUnit(e.draft, e.group), e.saved);
const dirtyList = () => [...E.values()].filter(isDirty);
function syncFromRegistry() {
  const seen = new Set();
  for (const u of listUnits()) {
    seen.add(u.id); const { group, ...unit } = u, saved = normalizeUnit(unit, group), e = E.get(u.id);
    if (!e) E.set(u.id, { group, draft: structuredClone(saved), saved, savedGroup: group });
    else if (!isDirty(e)) Object.assign(e, { group, draft: structuredClone(saved), saved, savedGroup: group });
    else Object.assign(e, { saved, savedGroup: group });
  }
  /* gone from disk: drop it unless it has unsaved changes, which then count as a new unit */
  for (const [id, e] of E) if (!seen.has(id) && e.saved) { if (isDirty(e)) { e.saved = null; e.savedGroup = null; } else E.delete(id); }
  if (!V.sel || !E.has(V.sel)) V.sel = ordered()[0]?.id || null;
}
const ordered = () => [...E.entries()].map(([id, e]) => ({ id, e })).sort((a, b) => GROUPS.indexOf(a.e.group) - GROUPS.indexOf(b.e.group) || nameOf(a.e).localeCompare(nameOf(b.e)));
const nameOf = e => e.draft.name || e.draft.id;
const spriteOf = id => characterById(id);
const visible = () => { const f = V.filter.trim().toLowerCase(); return ordered().filter(({ id, e }) => !f || id.includes(f) || nameOf(e).toLowerCase().includes(f)); };
/* the largest value of a field across every unit, for the comparison bars */
const rosterMax = (sec, k) => Math.max(1, ...[...E.values()].map(e => e.draft[sec]?.[k] ?? 0));

/* ---------- small helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastTimer = 0;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 2600); }
function updateBar() {
  const n = dirtyList().length;
  $('saveAll').textContent = n ? `Save ${n}` : 'Save'; $('saveAll').disabled = !WRITABLE || !n; $('revertAll').disabled = !n;
  $('mode').textContent = WRITABLE ? (n ? `${n} unsaved` : 'saved to data/units/') : 'read-only: run npm run dev to save';
  $('mode').classList.toggle('warn', !WRITABLE || n > 0);
  $('download').disabled = !V.sel;
}

/* ---------- the list ---------- */
const thumbs = new Map();
function thumb(id) {
  const c = spriteOf(id); if (!c) return null;
  let t = thumbs.get(c.look || c.id); if (!t) { t = figureThumb(c, 40); thumbs.set(c.look || c.id, t); }
  const out = document.createElement('canvas'); out.width = t.width; out.height = t.height; out.getContext('2d').drawImage(t, 0, 0); return out;
}
function renderList() {
  const box = $('rows'); box.textContent = '';
  const vis = visible();
  for (const g of GROUPS) {
    const rows = vis.filter(r => r.e.group === g); if (!rows.length) continue;
    const h = document.createElement('h3'); h.className = 'ub-group'; h.textContent = `${GROUP_LABEL[g]} · ${rows.length}`; box.append(h);
    for (const { id, e } of rows) {
      const b = document.createElement('button'); b.className = 'ub-row'; b.dataset.id = id; b.setAttribute('aria-current', String(id === V.sel));
      const t = thumb(id); if (t) { t.className = 'ub-thumb'; b.append(t); } else { const s = document.createElement('span'); s.className = 'ub-thumb ub-nosprite'; s.textContent = '?'; b.append(s); }
      const d = e.draft, info = document.createElement('span'); info.className = 'ub-row-text';
      info.innerHTML = `<b>${esc(nameOf(e))}${isDirty(e) ? '<i class="ub-dot" title="unsaved changes"></i>' : ''}</b><span>HP ${d.stats.hp} · Atk ${d.stats.attack} · Move ${d.movement.move} · Jump ${d.movement.jump}</span>`;
      b.append(info); b.addEventListener('click', () => { V.sel = id; renderAll(); if (V.view === 'table') setView('cards'); });
      box.append(b);
    }
  }
  if (!vis.length) box.innerHTML = '<p class="ub-dim ub-empty">No unit matches.</p>';
}

/* ---------- the card ---------- */
function field(sec, [k, label, lo, hi, , what], e) {
  const v = sec ? e.draft[sec][k] : e.draft[k], max = sec ? rosterMax(sec, k) : 0, saved = e.saved && (sec ? e.saved[sec]?.[k] : e.saved[k]);
  const changed = e.saved && saved !== v;
  return `<label class="ub-stat${changed ? ' changed' : ''}" title="${esc(what)}">
    <span class="ub-stat-name">${esc(label)}</span>
    <input type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${v}" data-sec="${sec}" data-k="${k}" aria-label="${esc(label)}">
    ${sec ? `<span class="ub-meter" aria-hidden="true"><i style="width:${Math.round(100 * Math.min(1, v / max))}%"></i></span>` : ''}
    <span class="ub-stat-what">${esc(what)}${changed ? ` <em>was ${saved}</em>` : ''}</span>
  </label>`;
}
function renderDetail() {
  const box = $('detail'); stopPreview();
  const e = E.get(V.sel);
  if (!e) { box.innerHTML = '<p class="ub-dim ub-empty">No units yet. Make one with New unit.</p>'; return; }
  const d = e.draft, sprite = spriteOf(d.id), errs = validateUnit(d, e.group);
  box.innerHTML = `
    <div class="ub-hero">
      <div class="ub-stage">
        <canvas id="preview" width="${FW * 4}" height="${(BASE + 6) * 4}" aria-label="${esc(nameOf(e))} walking"></canvas>
        <div class="ub-stage-chips">
          <button class="chip" id="faceL" title="Turn left">⟲</button>
          <button class="chip" id="play" aria-pressed="${V.playing}">Walk</button>
          <button class="chip" id="faceR" title="Turn right">⟳</button>
        </div>
      </div>
      <div class="ub-head">
        <input class="ub-name" id="name" value="${esc(d.name)}" maxlength="40" spellcheck="false" aria-label="Name">
        <div class="ub-meta">
          <label class="ub-field"><span>group</span><select id="group">${GROUPS.map(g => `<option value="${g}"${g === e.group ? ' selected' : ''}>${GROUP_LABEL[g]}</option>`).join('')}</select></label>
        </div>
        <p class="ub-file"><code>${esc(unitPath(e.group, d.id))}</code>${!e.saved ? ' <span class="ub-tag">new</span>' : isDirty(e) ? ' <span class="ub-tag">unsaved</span>' : ''}</p>
        <p class="ub-dim">${sprite ? `Plays as the ${esc(sprite.name)} sprite${sprite.blurb ? `: ${esc(sprite.blurb)}` : '.'}` : `No sprite called “${esc(d.id)}” is in the roster or the character library, so nothing on a map uses these numbers yet.`}</p>
        ${errs.length ? `<p class="ub-errors">${errs.map(esc).join('<br>')}</p>` : ''}
      </div>
    </div>
    ${SECTIONS.map(sec => `
      <section class="ub-sec"><h2>${SECTION_LABEL[sec]}</h2>
        ${sec === 'movement' ? `<div class="ub-move"><div class="ub-stats">${FIELDS[sec].map(f => field(sec, f, e)).join('')}</div><canvas id="reach" width="264" height="160" aria-label="Tiles reachable on flat ground"></canvas></div>`
    : `<div class="ub-stats">${FIELDS[sec].map(f => field(sec, f, e)).join('')}</div>`}
      </section>`).join('')}
    <section class="ub-sec"><h2>Notes</h2><textarea id="notes" rows="3" maxlength="2000" placeholder="Tactics, weaknesses, where it turns up…">${esc(d.notes)}</textarea></section>
    <div class="ub-card-actions">
      <details class="ub-json"><summary>File contents</summary><pre id="json">${esc(unitText(d, e.group))}</pre></details>
      <span class="ub-spacer"></span>
      <button class="btn" id="revertOne"${isDirty(e) && e.saved ? '' : ' disabled'}>Revert</button>
      <button class="btn ub-danger" id="deleteOne">Delete</button>
    </div>`;
  box.querySelectorAll('input[type=number]').forEach(inp => inp.addEventListener('change', () => {
    const sec = inp.dataset.sec, k = inp.dataset.k, n = Math.round(Number(inp.value));
    if (sec) e.draft[sec][k] = n; else e.draft[k] = n;
    commit(e);
  }));
  $('name').addEventListener('change', () => { e.draft.name = $('name').value; commit(e); });
  $('notes').addEventListener('change', () => { e.draft.notes = $('notes').value; commit(e); });
  $('group').addEventListener('change', () => { e.group = $('group').value; commit(e); });
  $('faceL').addEventListener('click', () => { V.face = (V.face + 3) % 4; });
  $('faceR').addEventListener('click', () => { V.face = (V.face + 1) % 4; });
  $('play').addEventListener('click', () => { V.playing = !V.playing; $('play').setAttribute('aria-pressed', String(V.playing)); });
  $('revertOne').addEventListener('click', () => revert(e));
  $('deleteOne').addEventListener('click', () => remove(V.sel));
  if (sprite) startPreview(sprite); else $('preview').classList.add('ub-blank');
  if ($('reach')) drawReach($('reach'), d.movement.move);
}
/* clamp what was typed into range, then redraw everything that shows it */
function commit(e) { e.draft = normalizeUnit(e.draft); renderAll(); }

/* ---------- the sprite, walking ---------- */
const FACING = [['front', false], ['front', true], ['back', false], ['back', true]];
let anim = 0;
function startPreview(c) {
  const can = $('preview'), g = can.getContext('2d'), frames = render(c), px = 4, one = document.createElement('canvas'), og = one.getContext('2d');
  one.width = FW; one.height = FH;
  const step = now => {
    anim = requestAnimationFrame(step);
    const [view, flip] = FACING[V.face], pose = V.playing ? WALK[Math.floor(now / 160) % WALK.length] : 0, im = og.createImageData(FW, FH);
    im.data.set(frames[view][pose]); og.putImageData(im, 0, 0);
    g.clearRect(0, 0, can.width, can.height); g.imageSmoothingEnabled = false;
    /* a shadow under the feet, then the figure with its soles two pixels above the canvas foot */
    const fy = (BASE + 4) * px; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(can.width / 2, fy - px, 9 * px, 2.4 * px, 0, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(can.width / 2, 0); if (flip) g.scale(-1, 1); g.drawImage(one, -FW / 2 * px, fy - (BASE + 1) * px, FW * px, FH * px); g.restore();
  };
  anim = requestAnimationFrame(step);
}
function stopPreview() { if (anim) cancelAnimationFrame(anim); anim = 0; }
/* the tiles a move reaches on open flat ground: a diamond of tiles within that many steps, drawn as the map does */
function drawReach(can, move) {
  const g = can.getContext('2d'), R = Math.max(4, move + 1), tw = (can.width - 8) / (2 * R + 1), th = tw / 2, cx = can.width / 2, cy = (can.height - 16) / 2;
  g.clearRect(0, 0, can.width, can.height);
  const tile = (i, j, fill, stroke) => {
    const x = cx + (i - j) * tw / 2, y = cy + (i + j) * th / 2;
    g.beginPath(); g.moveTo(x, y - th / 2); g.lineTo(x + tw / 2, y); g.lineTo(x, y + th / 2); g.lineTo(x - tw / 2, y); g.closePath();
    g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = 1; g.stroke();
  };
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const d = Math.abs(i) + Math.abs(j); if (d > R) continue;
    tile(i, j, d === 0 ? '#e4c684' : d <= move ? 'rgba(93,143,208,.55)' : 'rgba(44,58,58,.5)', d <= move ? '#cfe2ff55' : '#2c3a3a');
  }
  g.fillStyle = '#a39b86'; g.font = '500 12px "Alegreya Sans", system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText(`${move} tile${move === 1 ? '' : 's'} each way on flat ground`, can.width / 2, can.height - 3);
}

/* ---------- the table ---------- */
const COLS = [['name', 'Name'], ['group', 'Group'], ...SECTIONS.flatMap(sec => FIELDS[sec].map(([k, l]) => [`${sec}.${k}`, l]))];
const LIMITS = Object.fromEntries(SECTIONS.flatMap(sec => FIELDS[sec].map(([k, , lo, hi]) => [`${sec}.${k}`, [lo, hi]])));
const cellOf = (e, key) => { if (key === 'group') return e.group; if (key === 'name') return nameOf(e); const [a, b] = key.split('.'); return b ? e.draft[a]?.[b] : e.draft[a]; };
const savedCell = (e, key) => { if (!e.saved) return undefined; if (key === 'group') return e.savedGroup; if (key === 'name') return e.saved.name; const [a, b] = key.split('.'); return b ? e.saved[a]?.[b] : e.saved[a]; };
function renderTable() {
  const box = $('table');
  const rows = visible().sort((a, b) => {
    const { key, dir } = V.sort, x = cellOf(a.e, key), y = cellOf(b.e, key);
    const c = key === 'group' ? GROUPS.indexOf(x) - GROUPS.indexOf(y) || nameOf(a.e).localeCompare(nameOf(b.e)) : typeof x === 'string' ? x.localeCompare(y) : (x ?? -1) - (y ?? -1);
    return c * dir;
  });
  const head = COLS.map(([k, l]) => `<th scope="col"${['name', 'group'].includes(k) ? ' class="txt"' : ''}><button data-sort="${k}" aria-sort="${V.sort.key === k ? (V.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(l)}${V.sort.key === k ? (V.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const body = rows.map(({ id, e }) => `<tr data-id="${id}"${id === V.sel ? ' class="sel"' : ''}>${COLS.map(([k]) => {
    const v = cellOf(e, k), changed = e.saved && savedCell(e, k) !== v ? ' changed' : '';
    if (k === 'name') return `<th scope="row" class="txt${changed}"><button class="ub-open" data-open="${id}">${esc(v)}</button>${isDirty(e) ? '<i class="ub-dot"></i>' : ''}</th>`;
    if (k === 'group') return `<td class="txt${changed}"><select data-k="group" aria-label="Group of ${esc(nameOf(e))}">${GROUPS.map(g => `<option value="${g}"${g === v ? ' selected' : ''}>${GROUP_LABEL[g]}</option>`).join('')}</select></td>`;
    if (v === undefined) return '<td class="na">·</td>';
    const [lo, hi] = LIMITS[k];
    return `<td class="${changed.trim()}"><input type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${v}" data-k="${k}" aria-label="${esc(k)} of ${esc(nameOf(e))}"></td>`;
  }).join('')}</tr>`).join('');
  box.innerHTML = `<div class="ub-table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="ub-dim ub-table-hint">Click a column to sort, a name to open its card. Brass cells differ from the saved file.</p>`;
  box.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; V.sort = V.sort.key === k ? { key: k, dir: -V.sort.dir } : { key: k, dir: 1 }; renderTable(); }));
  box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { V.sel = b.dataset.open; setView('cards'); }));
  box.querySelectorAll('tbody input, tbody select').forEach(inp => inp.addEventListener('change', () => {
    const e = E.get(inp.closest('tr').dataset.id), k = inp.dataset.k;
    if (k === 'group') e.group = inp.value;
    else { const [a, b] = k.split('.'), n = Math.round(Number(inp.value)); if (b) e.draft[a][b] = n; else e.draft[a] = n; }
    commit(e);
  }));
}

/* ---------- saving, reverting, deleting, new units ---------- */
async function request(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ ok: false, error: { message: `the server answered ${r.status}` } }));
  if (!j.ok) throw new Error(j.error?.message || `the server answered ${r.status}`);
  return j;
}
async function saveAll() {
  if (!WRITABLE) return;
  const list = dirtyList(); if (!list.length) return;
  const bad = list.map(e => [e, validateUnit(e.draft, e.group)]).filter(([, errs]) => errs.length);
  if (bad.length) { toast(`${nameOf(bad[0][0])}: ${bad[0][1][0]}`, true); return; }
  let n = 0;
  for (const e of list) {
    try {
      /* moving between groups: the server writes the new file and removes the old one */
      const j = await request('PUT', SAVE_URL(e.group, e.draft.id), normalizeUnit(e.draft, e.group));
      Object.assign(e, { saved: j.unit, savedGroup: e.group, draft: structuredClone(j.unit) }); n++;
    } catch (err) { toast(`Could not save ${nameOf(e)}: ${err.message}`, true); renderAll(); return; }
  }
  toast(`Saved ${n} unit${n === 1 ? '' : 's'} to data/units/`);
  renderAll();
}
function revert(e) { if (!e.saved) return; Object.assign(e, { group: e.savedGroup, draft: structuredClone(e.saved) }); renderAll(); }
function revertAll() {
  const list = dirtyList(); if (!list.length) return;
  if (!confirm(`Throw away changes to ${list.length} unit${list.length === 1 ? '' : 's'}?`)) return;
  for (const e of list) { if (e.saved) revert(e); else E.delete(e.draft.id); }
  if (!E.has(V.sel)) V.sel = ordered()[0]?.id || null;
  renderAll();
}
async function remove(id) {
  const e = E.get(id); if (!e) return;
  if (!e.saved) { E.delete(id); V.sel = ordered()[0]?.id || null; renderAll(); return; }
  if (!WRITABLE) { toast('This copy of the site is read-only: run npm run dev to delete files', true); return; }
  if (!confirm(`Delete ${unitPath(e.savedGroup, id)}? Its sprite will play with the default numbers.`)) return;
  try { await request('DELETE', SAVE_URL(e.savedGroup, id)); E.delete(id); V.sel = ordered()[0]?.id || null; toast(`Deleted ${nameOf(e)}`); renderAll(); }
  catch (err) { toast(`Could not delete: ${err.message}`, true); }
}
function download() {
  const e = E.get(V.sel); if (!e) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([unitText(e.draft, e.group)], { type: 'application/json' }));
  a.download = `${e.draft.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/* every sprite that can stand on a map but has no unit: the roster, then the character library */
const freeSprites = () => [...ROSTER, ...customCharacters()].filter(c => !E.has(c.id));
function openNew() {
  const free = freeSprites();
  if (!free.length) { toast('Every sprite already has a unit. Make a new character in the character maker first.'); return; }
  $('newSprite').innerHTML = free.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.id.startsWith('custom-') ? ' (custom)' : ''}</option>`).join('');
  $('newFrom').innerHTML = `<option value="">Default numbers</option>${ordered().map(({ id, e }) => `<option value="${id}">${esc(nameOf(e))}</option>`).join('')}`;
  const pickGroup = () => { $('newGroup').value = spriteOf($('newSprite').value)?.enemy ? 'enemies' : 'characters'; };
  $('newSprite').onchange = pickGroup; pickGroup();
  $('newDialog').showModal();
}
$('newDialog').addEventListener('close', () => {
  if ($('newDialog').returnValue !== 'ok') return;
  const id = $('newSprite').value, group = $('newGroup').value, from = E.get($('newFrom').value), c = spriteOf(id);
  const base = from ? structuredClone(from.draft) : structuredClone({ ...DEFAULT_UNIT, stats: { ...DEFAULT_UNIT.stats }, movement: { ...DEFAULT_UNIT.movement } });
  const draft = { ...normalizeUnit({ ...base, id, name: c?.name || id, notes: from ? base.notes : '' }, group) };
  E.set(id, { group, draft, saved: null, savedGroup: null }); V.sel = id; setView('cards');
});

/* ---------- views ---------- */
function setView(v) {
  V.view = v;
  for (const [id, name] of [['viewCards', 'cards'], ['viewTable', 'table']]) { $(id).setAttribute('aria-pressed', String(v === name)); $(id).setAttribute('aria-selected', String(v === name)); }
  $('main').classList.toggle('tabled', v === 'table'); $('detail').hidden = v === 'table'; $('table').hidden = v !== 'table';
  renderAll();
}
function renderAll() {
  renderList();
  if (V.view === 'table') { stopPreview(); renderTable(); } else renderDetail();
  updateBar();
}

$('viewCards').addEventListener('click', () => setView('cards'));
$('viewTable').addEventListener('click', () => setView('table'));
$('search').addEventListener('input', () => { V.filter = $('search').value; renderList(); if (V.view === 'table') renderTable(); });
$('saveAll').addEventListener('click', saveAll);
$('revertAll').addEventListener('click', revertAll);
$('newUnit').addEventListener('click', openNew);
$('download').addEventListener('click', download);
addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); document.activeElement?.blur?.(); saveAll(); } });
addEventListener('beforeunload', ev => { if (dirtyList().length) { ev.preventDefault(); ev.returnValue = ''; } });
/* a save from here, another tab or a hand edit of a file: take the new numbers for every unit not being changed */
onUnitsChange(() => { syncFromRegistry(); renderAll(); });
/* ?unit=<id> opens that unit's card */
const asked = new URLSearchParams(location.search).get('unit');
syncFromRegistry(); if (asked && E.has(asked)) V.sel = asked;
renderAll();
