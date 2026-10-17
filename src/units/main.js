import '../styles/main.css';
import './units.css';
import '../data/unit-files.js';
import '../data/skill-files.js';
import { onSkillsChange } from '../data/skills.ts';
import { getClass, listClasses } from '../data/classes.ts';
import { FIELDS, GROUPS, GROUP_LABEL, MAX_ABILITIES, PATTERNS, SECTIONS, listUnits, normalizeUnit, onUnitsChange, overrides, resolve, unitPath, unitText, validateUnit } from '../data/units.ts';
import { MP_REGEN, abilityOf, listAbilities } from '../battle/abilities.ts';
import { list as customCharacters } from '../characters/library.js';
import { ROSTER } from '../characters/roster.js';
import { goFromDataPage, mountRail } from '../ui/rail.js';
import { $, MENU_LABEL, PATTERN_NOTE, WRITABLE, abilityLabel, downloadText, esc, namesOf, patternGrid, patternLabel, request, same, spriteOf, stageHtml, startPreview, stopPreview, thumb, toast } from './common.js';

/* ================= the unit page =================
   Every character and enemy in data/units/ (src/data/units.ts): a list down the side, and a card per unit with its
   sprite walking, its name, its side, the class it plays as (data/classes/, edited in the class editor,
   classes.html), and the numbers it plays with. A number follows its class until it is changed here, which makes
   it the unit's own (an override in its file); Use class puts it back. The table shows everyone's numbers side by
   side, its own ones marked. Changes are drafts until saved. On the dev server Save writes the files through the
   Hexwright bridge (tools/vite-hexwright.js), and the tactical view in any open tab picks the change up at once; a
   built copy of the site can read the units and download a unit's file, but not save. */
mountRail(goFromDataPage('units'), 'units');
const SAVE_URL = (group, id) => `/__hexwright/units/${group}/${id}`;

/* id -> { group, draft, saved, savedGroup }: saved is null for a unit not yet written */
const E = new Map();
const V = { sel: null, view: 'cards', filter: '', sort: { key: 'group', dir: 1 } };

/* ---------- drafts ---------- */
const isDirty = e => !e.saved || e.group !== e.savedGroup || !same(normalizeUnit(e.draft), e.saved);
const dirtyList = () => [...E.values()].filter(isDirty);
function syncFromRegistry() {
  const seen = new Set();
  for (const u of listUnits()) {
    seen.add(u.id); const group = u.group, saved = u.toJSON(), e = E.get(u.id);
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
const visible = () => { const f = V.filter.trim().toLowerCase(); return ordered().filter(({ id, e }) => !f || id.includes(f) || nameOf(e).toLowerCase().includes(f) || className(e.draft.class).toLowerCase().includes(f)); };
/* what a draft plays with: its class as saved, with its overrides on top */
const playOf = d => resolve(d, getClass(d.class));
const className = id => getClass(id)?.name || id;
/* the largest value of a field across every unit, for the comparison bars */
const rosterMax = (sec, k) => Math.max(1, ...[...E.values()].map(e => playOf(e.draft)[sec][k] ?? 0));
/* set or clear one override of a draft; an empty section, and then empty overrides, are dropped by normalizeUnit */
function setOwn(e, sec, k, v) {
  const o = structuredClone(e.draft.overrides || {}); o[sec] = { ...o[sec] };
  if (v === undefined) delete o[sec][k]; else o[sec][k] = v;
  e.draft.overrides = o; commit(e);
}

function updateBar() {
  const n = dirtyList().length;
  $('saveAll').textContent = n ? `Save ${n}` : 'Save'; $('saveAll').disabled = !WRITABLE || !n; $('revertAll').disabled = !n;
  $('mode').textContent = WRITABLE ? (n ? `${n} unsaved` : 'saved to data/units/') : 'read-only: run npm run dev to save';
  $('mode').classList.toggle('warn', !WRITABLE || n > 0);
  $('download').disabled = !V.sel;
}

/* ---------- the list ---------- */
function renderList() {
  const box = $('rows'); box.textContent = '';
  const vis = visible();
  for (const g of GROUPS) {
    const rows = vis.filter(r => r.e.group === g); if (!rows.length) continue;
    const h = document.createElement('h3'); h.className = 'ub-group'; h.textContent = `${GROUP_LABEL[g]} · ${rows.length}`; box.append(h);
    for (const { id, e } of rows) {
      const b = document.createElement('button'); b.className = 'ub-row'; b.dataset.id = id; b.setAttribute('aria-current', String(id === V.sel));
      b.append(thumb(id));
      const st = playOf(e.draft).stats, own = SECTIONS.reduce((n, s) => n + Object.keys(e.draft.overrides?.[s] || {}).length, 0), info = document.createElement('span'); info.className = 'ub-row-text';
      info.innerHTML = `<b>${esc(nameOf(e))}${isDirty(e) ? '<i class="ub-dot" title="unsaved changes"></i>' : ''}</b><span>${esc(className(e.draft.class))}${own ? ` · ${own} own` : ''} · HP ${st.hp} · Atk ${st.attack} · Def ${st.defense}</span>`;
      b.append(info); b.addEventListener('click', () => { V.sel = id; renderAll(); if (V.view === 'table') setView('cards'); });
      box.append(b);
    }
  }
  if (!vis.length) box.innerHTML = '<p class="ub-dim ub-empty">No unit matches.</p>';
}

/* ---------- the card ---------- */
/* one number as a row: its label, the value it plays with, a bar against the largest across every unit, and
   whether it is the class's or its own (with the way back to the class's) */
function tile(sec, [k, label, lo, hi], e, play, cls) {
  const v = play[sec][k], own = overrides(e.draft, sec, k), base = cls ? cls[sec][k] : null;
  const saved = e.saved ? e.saved.overrides?.[sec]?.[k] : undefined, changed = e.saved && saved !== e.draft.overrides?.[sec]?.[k];
  return `<div class="ub-value${own ? ' own' : ''}${changed ? ' changed' : ''}">
    <label class="ub-value-name" for="v-${sec}-${k}">${esc(label)}</label>
    <input id="v-${sec}-${k}" type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${v}" data-sec="${sec}" data-k="${k}" aria-label="${esc(label)}">
    <span class="ub-meter" aria-hidden="true"><i style="width:${Math.round(100 * Math.min(1, v / rosterMax(sec, k)))}%"></i></span>
    ${own ? `<button class="chip ub-own" data-clear="${sec}.${k}" title="Use the class's ${esc(label)}${base == null ? '' : ` (${base})`}">Own · use class${base == null ? '' : ` ${base}`}</button>` : '<span class="ub-from">class</span>'}
  </div>`;
}
/* the attack pattern: the class's, or one of its own */
function patternSection(e, play, cls) {
  const own = overrides(e.draft, 'stats', 'pattern'), { pattern: v, range } = play.stats;
  return `<section class="ub-pattern${own ? ' own' : ''}" aria-label="Attack pattern">
    <h3 class="ub-section">Attack pattern${own ? ' <span class="ub-tag">own</span>' : ''}</h3>
    <div class="ub-pattern-body">
      <label class="ub-ability-pick"><select id="pattern" aria-label="Attack pattern"><option value=""${own ? '' : ' selected'}>Class's: ${esc(patternLabel(cls ? cls.stats.pattern : 'melee'))}</option>${PATTERNS.map(([id, label]) => `<option value="${id}"${own && id === v ? ' selected' : ''}>Own: ${label}</option>`).join('')}</select></label>
      <figure class="ub-pattern-big">${patternGrid(v, range, 'ub-grid')}<figcaption><b>${patternLabel(v)}${v === 'melee' ? '' : ` · Range ${range}`}</b><span>${PATTERN_NOTE[v]}</span></figcaption></figure>
    </div>
  </section>`;
}
/* the abilities: the class's, or a list of its own to add to and take from */
function abilitySection(e, play, cls) {
  const own = overrides(e.draft, 'stats', 'abilities'), have = play.stats.abilities;
  const row = (id, i) => {
    const a = abilityOf(id);
    return `<li class="ub-ability-row"><div class="ub-ability-pick"><b>${esc(abilityLabel(id))}</b>${a ? `<span class="ub-tag">${MENU_LABEL[a.menu]}</span><span class="ub-cost">${a.cost} MP${a.cooldown ? ` · ${a.cooldown}-turn cooldown` : ''}</span><a class="ub-link" href="./skills.html?skill=${encodeURIComponent(a.id)}">Edit skill</a>` : ''}
      ${own ? `<button class="chip" data-drop="${i}" aria-label="Take ${esc(abilityLabel(id))} away">Remove</button>` : ''}</div></li>`;
  };
  return `<section class="ub-ability${own ? ' own' : ''}" aria-label="Abilities">
    <h3 class="ub-section">Abilities${own ? ' <span class="ub-tag">own</span>' : ''}</h3>
    <div class="ub-ability-body">
      ${have.length ? `<ul class="ub-ability-list">${have.map(row).join('')}</ul>` : '<p>No abilities: it only attacks.</p>'}
      ${own && have.length < MAX_ABILITIES ? `<label class="ub-ability-pick"><select id="ability" aria-label="Add an ability"><option value="">Add an ability…</option>${listAbilities().filter(a => !have.includes(a.id)).map(a => `<option value="${esc(a.id)}">${esc(a.label)} (${MENU_LABEL[a.menu]})</option>`).join('')}</select></label>` : ''}
      <label class="ub-check"><input type="checkbox" id="ownAbilities"${own ? ' checked' : ''}> Its own abilities, in place of the class's${cls ? ` (${esc(namesOf(cls.stats.abilities) || 'none')})` : ''}</label>
      <p class="ub-dim">In battle each one is listed under Actions or Spells, as its skill says, and every unit gets ${MP_REGEN} MP back each turn.</p>
    </div>
  </section>`;
}
const classOptions = v => `${getClass(v) ? '' : `<option value="${esc(v)}" selected>${esc(v || 'none')} (no such class)</option>`}${listClasses().map(c => `<option value="${esc(c.id)}"${c.id === v ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;
function renderDetail() {
  const box = $('detail'); stopPreview();
  const e = E.get(V.sel);
  if (!e) { box.innerHTML = '<p class="ub-dim ub-empty">No units yet. Make one with New unit.</p>'; return; }
  const d = e.draft, sprite = spriteOf(d.id), cls = getClass(d.class), play = playOf(d), errs = validateUnit(d, e.group);
  const ownCount = SECTIONS.reduce((n, s) => n + Object.keys(d.overrides?.[s] || {}).length, 0);
  box.innerHTML = `
    <div class="ub-card">
      <div class="ub-body">
        <div class="ub-head">
          <input class="ub-name" id="name" value="${esc(d.name)}" maxlength="40" spellcheck="false" aria-label="Name">
          <select id="group" aria-label="Side">${GROUPS.map(g => `<option value="${g}"${g === e.group ? ' selected' : ''}>${GROUP_LABEL[g]}</option>`).join('')}</select>
        </div>
        <div class="ub-class">
          <label class="ub-field"><span>plays as</span><select id="cls" aria-label="Class">${classOptions(d.class)}</select></label>
          ${cls ? `<a class="ub-link" href="./classes.html?class=${encodeURIComponent(cls.id)}">Edit class</a>` : ''}
          ${ownCount ? '<button class="chip" id="clearAll">Use the class for everything</button>' : ''}
        </div>
        <p class="ub-file"><code>${esc(unitPath(e.group, d.id))}</code>${!e.saved ? ' <span class="ub-tag">new</span>' : isDirty(e) ? ' <span class="ub-tag">unsaved</span>' : ''}${sprite ? '' : ` <span class="ub-dim">no sprite called “${esc(d.id)}”</span>`}</p>
        ${cls ? '' : `<p class="ub-errors">There is no class called “${esc(d.class)}” in data/classes/, so it plays with the default numbers. Pick a class above.</p>`}
        ${errs.length ? `<p class="ub-errors">${errs.map(esc).join('<br>')}</p>` : ''}
        <div class="ub-values">${SECTIONS.flatMap(sec => FIELDS[sec].map(f => tile(sec, f, e, play, cls))).join('')}</div>
        ${patternSection(e, play, cls)}
        ${abilitySection(e, play, cls)}
        <div class="ub-card-actions">
          <button class="btn" id="revertOne"${isDirty(e) && e.saved ? '' : ' disabled'}>Revert</button>
          <button class="btn ub-danger" id="deleteOne">Delete</button>
        </div>
      </div>
      ${stageHtml(`${nameOf(e)} walking`)}
    </div>`;
  /* a number typed in becomes the unit's own, unless it is what the class has */
  box.querySelectorAll('input[type=number]').forEach(inp => inp.addEventListener('change', () => {
    const sec = inp.dataset.sec, k = inp.dataset.k, n = Math.round(Number(inp.value));
    setOwn(e, sec, k, cls && cls[sec][k] === n ? undefined : n);
  }));
  box.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => { const [sec, k] = b.dataset.clear.split('.'); setOwn(e, sec, k, undefined); }));
  $('pattern').addEventListener('change', () => setOwn(e, 'stats', 'pattern', $('pattern').value || undefined));
  $('ownAbilities').addEventListener('change', () => setOwn(e, 'stats', 'abilities', $('ownAbilities').checked ? [...play.stats.abilities] : undefined));
  $('ability')?.addEventListener('change', () => { const id = $('ability').value; if (id) setOwn(e, 'stats', 'abilities', [...play.stats.abilities, id]); });
  box.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => setOwn(e, 'stats', 'abilities', play.stats.abilities.filter((x, i) => i !== +b.dataset.drop))));
  $('name').addEventListener('change', () => { e.draft.name = $('name').value; commit(e); });
  $('group').addEventListener('change', () => { e.group = $('group').value; commit(e); });
  $('cls').addEventListener('change', () => { e.draft.class = $('cls').value; commit(e); });
  $('clearAll')?.addEventListener('click', () => { delete e.draft.overrides; commit(e); });
  $('revertOne').addEventListener('click', () => revert(e));
  $('deleteOne').addEventListener('click', () => remove(V.sel));
  startPreview(sprite);
}
/* clamp what was typed into range, then redraw everything that shows it */
function commit(e) { e.draft = normalizeUnit(e.draft); renderAll(); }

/* ---------- the table ---------- */
const COLS = [['name', 'Name'], ['group', 'Side'], ['class', 'Class'], ...SECTIONS.flatMap(sec => [...FIELDS[sec].map(([k, l]) => [`${sec}.${k}`, l]), ...(sec === 'stats' ? [['stats.pattern', 'Pattern'], ['stats.abilities', 'Abilities']] : [])])];
const TEXT_COLS = ['name', 'group', 'class', 'stats.pattern', 'stats.abilities'];
const LIMITS = Object.fromEntries(SECTIONS.flatMap(sec => FIELDS[sec].map(([k, , lo, hi]) => [`${sec}.${k}`, [lo, hi]])));
const cellOf = (e, key) => {
  if (key === 'group') return e.group; if (key === 'name') return nameOf(e); if (key === 'class') return className(e.draft.class);
  const [a, b] = key.split('.'), v = playOf(e.draft)[a][b];
  return key === 'stats.abilities' ? namesOf(v) : key === 'stats.pattern' ? patternLabel(v) : v;
};
function renderTable() {
  const box = $('table');
  const rows = visible().sort((a, b) => {
    const { key, dir } = V.sort, x = cellOf(a.e, key), y = cellOf(b.e, key);
    const c = key === 'group' ? GROUPS.indexOf(x) - GROUPS.indexOf(y) || nameOf(a.e).localeCompare(nameOf(b.e)) : typeof x === 'string' ? x.localeCompare(y) : (x ?? -1) - (y ?? -1);
    return c * dir;
  });
  const head = COLS.map(([k, l]) => `<th scope="col"${TEXT_COLS.includes(k) ? ' class="txt"' : ''}><button data-sort="${k}" aria-sort="${V.sort.key === k ? (V.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(l)}${V.sort.key === k ? (V.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const body = rows.map(({ id, e }) => `<tr data-id="${id}"${id === V.sel ? ' class="sel"' : ''}>${COLS.map(([k]) => {
    const v = cellOf(e, k), [a, b] = k.split('.'), own = b && overrides(e.draft, a, b) ? ' own' : '';
    if (k === 'name') return `<th scope="row" class="txt"><button class="ub-open" data-open="${id}">${esc(v)}</button>${isDirty(e) ? '<i class="ub-dot"></i>' : ''}</th>`;
    if (k === 'group') return `<td class="txt"><select data-k="group" aria-label="Side of ${esc(nameOf(e))}">${GROUPS.map(g => `<option value="${g}"${g === v ? ' selected' : ''}>${GROUP_LABEL[g]}</option>`).join('')}</select></td>`;
    if (k === 'class') return `<td class="txt"><select data-k="class" aria-label="Class of ${esc(nameOf(e))}">${classOptions(e.draft.class)}</select></td>`;
    if (k === 'stats.pattern' || k === 'stats.abilities') return `<td class="txt${own}"><button class="ub-open" data-open="${id}" title="Edit on the card">${esc(v || 'none')}</button></td>`;
    const [lo, hi] = LIMITS[k];
    return `<td class="${own.trim()}"${own ? ' title="its own, not the class\'s"' : ''}><input type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${v}" data-k="${k}" aria-label="${esc(k)} of ${esc(nameOf(e))}"></td>`;
  }).join('')}</tr>`).join('');
  box.innerHTML = `<div class="ub-table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="ub-dim ub-table-note">Marked numbers are a unit's own; the rest follow its class. A number changed here becomes the unit's own.</p>`;
  box.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; V.sort = V.sort.key === k ? { key: k, dir: -V.sort.dir } : { key: k, dir: 1 }; renderTable(); }));
  box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { V.sel = b.dataset.open; setView('cards'); }));
  box.querySelectorAll('tbody input, tbody select').forEach(inp => inp.addEventListener('change', () => {
    const e = E.get(inp.closest('tr').dataset.id), k = inp.dataset.k;
    if (k === 'group') { e.group = inp.value; commit(e); return; }
    if (k === 'class') { e.draft.class = inp.value; commit(e); return; }
    const [sec, key] = k.split('.'), n = Math.round(Number(inp.value)), cls = getClass(e.draft.class);
    setOwn(e, sec, key, cls && cls[sec][key] === n ? undefined : n);
  }));
}

/* ---------- saving, reverting, deleting, new units ---------- */
async function saveAll() {
  if (!WRITABLE) return;
  const list = dirtyList(); if (!list.length) return;
  const bad = list.map(e => [e, validateUnit(e.draft, e.group)]).filter(([, errs]) => errs.length);
  if (bad.length) { toast(`${nameOf(bad[0][0])}: ${bad[0][1][0]}`, true); return; }
  let n = 0;
  for (const e of list) {
    try {
      /* moving between groups: the server writes the new file and removes the old one */
      const j = await request('PUT', SAVE_URL(e.group, e.draft.id), normalizeUnit(e.draft));
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
function download() { const e = E.get(V.sel); if (e) downloadText(`${e.draft.id}.json`, unitText(e.draft)); }
/* every sprite that can stand on a map but has no unit: the roster, then the character library */
const freeSprites = () => [...ROSTER, ...customCharacters()].filter(c => !E.has(c.id));
function openNew() {
  const free = freeSprites();
  if (!free.length) { toast('Every sprite already has a unit. Make a new character in the character maker first.'); return; }
  if (!listClasses().length) { toast('There are no classes yet. Make one in the class editor first.', true); return; }
  $('newSprite').innerHTML = free.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.id.startsWith('custom-') ? ' (custom)' : ''}</option>`).join('');
  const pick = () => {
    const c = spriteOf($('newSprite').value);
    $('newGroup').value = c?.enemy ? 'enemies' : 'characters';
    $('newClass').innerHTML = classOptions(getClass($('newSprite').value) ? $('newSprite').value : listClasses()[0].id);
  };
  $('newSprite').onchange = pick; pick();
  $('newDialog').showModal();
}
$('newDialog').addEventListener('close', () => {
  if ($('newDialog').returnValue !== 'ok') return;
  const id = $('newSprite').value, c = spriteOf(id);
  E.set(id, { group: $('newGroup').value, draft: normalizeUnit({ id, name: c?.name || id, class: $('newClass').value }), saved: null, savedGroup: null }); V.sel = id; setView('cards');
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
/* a save from here, another tab or a hand edit of a file, or a class saved in the class editor: take the change for
   every unit not being changed, and redraw the numbers its class gives it */
onUnitsChange(() => { syncFromRegistry(); renderAll(); });
/* a skill saved in the skill editor: its name, cost and numbers change on every card */
onSkillsChange(() => renderAll());
/* ?unit=<id> opens that unit's card */
const asked = new URLSearchParams(location.search).get('unit');
syncFromRegistry(); if (asked && E.has(asked)) V.sel = asked;
renderAll();
