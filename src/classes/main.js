import '../styles/main.css';
import './classes.css';
import '../data/unit-files.js';
import '../data/skill-files.js';
import { onSkillsChange } from '../data/skills.ts';
import { DEFAULT_CLASS, DEFAULT_OUTFIT, FIELDS, MAX_ABILITIES, PATTERNS, SECTIONS, classPath, classText, listClasses, normalizeClass, onClassesChange, validateClass } from '../data/classes.ts';
import { listUnits, onUnitsChange } from '../data/units.ts';
import { DEF_SCALE, MP_REGEN, abilityOf, damageOf, healOf, hitChance, listAbilities } from '../battle/abilities.ts';
import { characterById, list as customCharacters, onChange as onLibraryChange } from '../characters/library.js';
import { APPLIES, CHOICES, COLOURS, OUTFIT_COLOURS, OUTFIT_KEYS, cleanSpec, fromSpec } from '../characters/custom.js';
import { FRAMES, VIEWS, frame } from '../characters/roster.js';
import { goFromDataPage, mountRail } from '../ui/rail.js';
import { $, MENU_LABEL, PATTERN_NOTE, WRITABLE, abilityLabel, downloadText, esc, namesOf, patternGrid, patternLabel, patternOptions, request, same, stageHtml, startPreview, stopPreview, thumb, toast } from './common.js';

/* ================= the class editor =================
   Every class in data/classes/ (src/data/classes.ts) to read and change: a list down the side, a card per class with
   its outfit walking on a body, the outfit's clothes, hat, gear and colours (the character maker's choices), its
   HP, MP, Attack, Defense, Accuracy, Evasion, Range, Move and Jump, a picture of its attack pattern, its abilities
   and what its blows come to against the other side, who plays it (playable characters, which wear the outfit, and
   NPCs, which keep their own look), and a table of every class for balancing numbers side by side. A playable
   character picks its class in the character maker. Changes are drafts until saved. On the dev
   server Save writes the files through the Hexwright bridge (tools/vite-hexwright.js), and the tactical view in any
   open tab picks the new numbers up at once; a built copy of the site can read the classes and download a class's
   file, but not save. */
mountRail(goFromDataPage('classes'), 'classes');
const SAVE_URL = id => `/__hexwright/classes/${id}`;

/* id -> { draft, saved }: saved is null for a class not yet written */
const E = new Map();
const V = { sel: null, view: 'cards', filter: '', sort: { key: 'name', dir: 1 }, body: 'plain' };

/* ---------- who plays each class ---------- */
const usersOf = id => listUnits().filter(u => u.class === id);
/* the list's groups: the side a class's units fight on, or unused */
const SIDES = [['allies', 'Ally classes'], ['enemies', 'Enemy classes'], ['unused', 'Unused']];
const sideOf = id => { const us = usersOf(id); return !us.length ? 'unused' : us.some(u => u.group === 'allies') ? 'allies' : 'enemies'; };

/* ---------- drafts ---------- */
const isDirty = e => !e.saved || !same(normalizeClass(e.draft), e.saved);
const dirtyList = () => [...E.values()].filter(isDirty);
function syncFromRegistry() {
  const seen = new Set();
  for (const c of listClasses()) {
    seen.add(c.id); const saved = normalizeClass(c.toJSON()), e = E.get(c.id);
    if (!e) E.set(c.id, { draft: structuredClone(saved), saved });
    else if (!isDirty(e)) Object.assign(e, { draft: structuredClone(saved), saved });
    else e.saved = saved;
  }
  /* gone from disk: drop it unless it has unsaved changes, which then count as a new class */
  for (const [id, e] of E) if (!seen.has(id) && e.saved) { if (isDirty(e)) e.saved = null; else E.delete(id); }
  if (!V.sel || !E.has(V.sel)) V.sel = ordered()[0]?.id || null;
}
const nameOf = e => e.draft.name || e.draft.id;
const ordered = () => [...E.entries()].map(([id, e]) => ({ id, e, side: sideOf(id) })).sort((a, b) => SIDES.findIndex(s => s[0] === a.side) - SIDES.findIndex(s => s[0] === b.side) || nameOf(a.e).localeCompare(nameOf(b.e)));
const visible = () => { const f = V.filter.trim().toLowerCase(); return ordered().filter(({ id, e }) => !f || id.includes(f) || nameOf(e).toLowerCase().includes(f)); };
/* the largest value of a field across every class, for the comparison bars */
const rosterMax = (sec, k) => Math.max(1, ...[...E.values()].map(e => e.draft[sec]?.[k] ?? 0));

function updateBar() {
  const n = dirtyList().length;
  $('saveAll').textContent = n ? `Save ${n}` : 'Save'; $('saveAll').disabled = !WRITABLE || !n; $('revertAll').disabled = !n;
  $('mode').textContent = WRITABLE ? (n ? `${n} unsaved` : 'saved to data/classes/') : 'read-only: run npm run dev to save';
  $('mode').classList.toggle('warn', !WRITABLE || n > 0);
  $('download').disabled = !V.sel;
}

/* ---------- the list ---------- */
function renderList() {
  const box = $('rows'); box.textContent = '';
  const vis = visible();
  for (const [side, label] of SIDES) {
    const rows = vis.filter(r => r.side === side); if (!rows.length) continue;
    const h = document.createElement('h3'); h.className = 'ub-group'; h.textContent = `${label} · ${rows.length}`; box.append(h);
    for (const { id, e } of rows) {
      const b = document.createElement('button'); b.className = 'ub-row'; b.dataset.id = id; b.setAttribute('aria-current', String(id === V.sel));
      b.append(thumb(lookOf(e.draft)));
      const d = e.draft, n = usersOf(id).length, info = document.createElement('span'); info.className = 'ub-row-text';
      info.innerHTML = `<b>${esc(nameOf(e))}${isDirty(e) ? '<i class="ub-dot" title="unsaved changes"></i>' : ''}</b><span>HP ${d.stats.hp} · Atk ${d.stats.attack} · Def ${d.stats.defense} · ${patternLabel(d.stats.pattern)} · ${n ? `${n} playing` : 'unused'}</span>`;
      b.append(info); b.addEventListener('click', () => { V.sel = id; renderAll(); if (V.view === 'table') setView('cards'); });
      box.append(b);
    }
  }
  if (!vis.length) box.innerHTML = '<p class="ub-dim ub-empty">No class matches.</p>';
}

/* ---------- the card ---------- */
/* one number as a row of the list: its label, the value to edit, and a bar against the largest across every class */
function tile(sec, [k, label, lo, hi], e) {
  const v = e.draft[sec][k], saved = e.saved?.[sec]?.[k], changed = e.saved && saved !== v;
  return `<label class="ub-value${changed ? ' changed' : ''}"${changed ? ` title="saved: ${saved}"` : ''}>
    <span class="ub-value-name">${esc(label)}</span>
    <input type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${v}" data-sec="${sec}" data-k="${k}" aria-label="${esc(label)}">
    <span class="ub-meter" aria-hidden="true"><i style="width:${Math.round(100 * Math.min(1, v / rosterMax(sec, k)))}%"></i></span>
  </label>`;
}
/* the attack pattern, a section of its own: a picture of each to pick from, and the chosen one at the class's range */
function patternSection(e) {
  const { pattern: v, range } = e.draft.stats, saved = e.saved?.stats?.pattern, changed = e.saved && saved !== v;
  return `<section class="ub-pattern${changed ? ' changed' : ''}" aria-label="Attack pattern">
    <h3 class="ub-section">Attack pattern${changed ? ` <span class="ub-tag" title="saved: ${patternLabel(saved)}">changed</span>` : ''}</h3>
    <div class="ub-pattern-body">
      <div class="ub-pattern-picks" role="radiogroup" aria-label="Attack pattern">${PATTERNS.map(([id, label]) => `<button role="radio" aria-checked="${id === v}" data-pattern="${id}">${patternGrid(id, range, 'ub-grid-sm')}<span>${label}</span></button>`).join('')}</div>
      <figure class="ub-pattern-big">${patternGrid(v, range, 'ub-grid')}<figcaption><b>${patternLabel(v)}${v === 'melee' ? '' : ` · Range ${range}`}</b><span>${PATTERN_NOTE[v]}</span></figcaption></figure>
    </div>
  </section>`;
}
/* the skills in data/skills/ the class does not have yet, to add */
const addOptions = have => `<option value="">Add an ability…</option>${listAbilities().filter(a => !have.includes(a.id)).map(a => `<option value="${esc(a.id)}">${esc(a.label)} (${MENU_LABEL[a.menu]})</option>`).join('')}`;
/* the abilities, a section of their own: each one it has with the battle menu it is listed in, what it costs and
   does and how many uses its MP holds, one to add, and how its blows play against the other side on average (an
   attack's damage and chance to hit) */
function abilitySection(e, side) {
  const st = e.draft.stats, have = st.abilities, saved = e.saved?.stats?.abilities, changed = e.saved && !same(saved, have);
  const foe = side === 'enemies' ? 'allies' : 'enemies', others = listUnits().filter(u => u.group === foe).map(u => u.stats);
  const avg = f => (others.length ? Math.round(others.reduce((n, o) => n + f(o), 0) / others.length) : null);
  const dmg = avg(o => damageOf(st.attack, o.defense)), hit = avg(o => hitChance(st.accuracy, o.evasion)), taken = avg(o => damageOf(o.attack, st.defense)), dodge = avg(o => 100 - hitChance(o.accuracy, st.evasion));
  const row = (id, i) => {
    const a = abilityOf(id), uses = a && a.cost ? Math.floor(st.mp / a.cost) : null;
    const what = !a ? `There is no skill called “${id}” in data/skills/, so it is left out of the menus.` : a.heal ? `Restores ${healOf(st.attack, a)} HP to an ally in reach.` : `${a.note[0].toUpperCase()}${a.note.slice(1)}${a.sure ? '' : ', at the attack\'s chance to hit'}.`;
    return `<li class="ub-ability-row">
      <div class="ub-ability-pick"><b>${esc(abilityLabel(id))}</b>${a ? `<span class="ub-tag">${MENU_LABEL[a.menu]}</span><span class="ub-cost">${a.cost} MP${a.cooldown ? ` · ${a.cooldown}-turn cooldown` : ''}</span><a class="ub-link" href="./skills.html?skill=${encodeURIComponent(a.id)}">Edit skill</a>` : ''}
        <button class="chip" data-drop="${i}" aria-label="Take ${esc(abilityLabel(id))} away">Remove</button></div>
      <p>${esc(what)}${a ? ` ${uses == null ? 'Free to use' : uses ? `${uses} use${uses === 1 ? '' : 's'} from full MP` : '<b class="ub-warn">Not enough MP to use it</b>'}.` : ''}</p>
    </li>`;
  };
  return `<section class="ub-ability${changed ? ' changed' : ''}" aria-label="Abilities">
    <h3 class="ub-section">Abilities${changed ? ` <span class="ub-tag" title="saved: ${esc(namesOf(saved) || 'none')}">changed</span>` : ''}</h3>
    <div class="ub-ability-body">
      ${have.length ? `<ul class="ub-ability-list">${have.map(row).join('')}</ul>` : '<p>No abilities: it only attacks.</p>'}
      ${have.length < MAX_ABILITIES ? `<label class="ub-ability-pick"><select id="ability" aria-label="Add an ability">${addOptions(have)}</select></label>` : ''}
      <p class="ub-dim">In battle each one is listed under Actions or Spells, as its skill says, and every unit gets ${MP_REGEN} MP back each turn.</p>
      ${others.length ? `<p class="ub-dim">Against the ${foe} on average: deals ${dmg} a hit, lands ${hit}% of the time; takes ${taken} a hit, dodges ${dodge}%. Every ${DEF_SCALE} Defense halves the damage taken.</p>` : ''}
    </div>
  </section>`;
}
/* who plays this class: the playable characters, which wear its outfit, and the NPCs, which keep their own look */
function usersSection(id) {
  const us = usersOf(id), kind = u => (u.playable ? 'playable, wears the outfit' : `NPC, ${u.group === 'enemies' ? 'enemy' : 'ally'}, its own look`);
  return `<section class="ub-users" aria-label="Who plays this class">
    <h3 class="ub-section">Played by</h3>
    ${us.length ? `<ul class="ub-user-list">${us.map(u => `<li><b>${esc(u.name)}</b> <span class="ub-dim">${kind(u)}</span></li>`).join('')}</ul>` : '<p class="ub-dim">No one plays this class yet. Give it to a playable character in the character maker.</p>'}
  </section>`;
}

/* ---------- the outfit ---------- */
/* the body the outfit is shown on: a plain one, or one of the playable characters of this class */
const PLAIN_BODY = cleanSpec({ id: 'plain', name: 'Plain body' });
const bodiesOf = id => [PLAIN_BODY, ...customCharacters().filter(c => c.spec.class === id).map(c => c.spec)];
const bodyFor = d => bodiesOf(d.id).find(b => b.id === V.body) || PLAIN_BODY;
/* how a class looks: its outfit on a body, or for a class only NPCs play, the first NPC of it in its own look */
function lookOf(d, body = PLAIN_BODY) {
  if (d.outfit) return fromSpec({ ...body, class: '', ...d.outfit, colours: { ...body.colours, ...d.outfit.colours } }, { id: `class-${d.id}` });
  const npc = usersOf(d.id).find(u => !u.playable); return npc ? characterById(npc.id) : null;
}
const CHOICE_LABEL = { clothes: 'clothes', sleeves: 'sleeves', cut: 'sleeve cut', neckline: 'neckline', rope: 'belt', hat: 'hat', cape: 'cape', satchel: 'satchel', held: 'in hand', shield: 'shield' };
/* the outfit materials the outfit shows (an arrow's head and fletching too), as the character maker finds them */
function usedOutfitColours(d) {
  const c = lookOf(d), seen = new Set();
  for (const v of VIEWS) for (let k = 0; k < FRAMES; k++) for (const m of frame(c, v, k).mat) if (m) seen.add(m);
  return COLOURS.filter(([key, letter]) => OUTFIT_COLOURS.includes(key) && seen.has(letter) && !(key === 'legs' && d.outfit.clothes === 'overalls'));
}
/* the outfit, a section of its own: a row of chips for each choice that applies, then the colours it shows; or for
   a class with none, the way to give it one */
function outfitSection(e) {
  const o = e.draft.outfit, changed = e.saved && !same(e.saved.outfit, o);
  const head = `<h3 class="ub-section">Outfit${changed ? ' <span class="ub-tag">changed</span>' : ''}</h3>`;
  if (!o) return `<section class="ub-outfit" aria-label="Outfit">${head}
    <p class="ub-dim">No outfit: only NPCs play this class, each in its own look. Give it one to let playable characters take it.</p>
    <div><button class="chip" id="addOutfit">Give it an outfit</button></div></section>`;
  const rows = OUTFIT_KEYS.filter(k => !APPLIES[k] || APPLIES[k](o)).map(k => `<div class="ub-choice"><span class="ub-value-name">${CHOICE_LABEL[k]}</span><div class="ub-chips" role="group" aria-label="${CHOICE_LABEL[k]}">${CHOICES[k].map(([v, t]) => `<button class="chip" data-choice="${k}" data-v="${v}" aria-pressed="${o[k] === v}">${esc(t)}</button>`).join('')}</div></div>`).join('');
  const colours = usedOutfitColours(e.draft).map(([key, , text]) => `<label class="ub-colour"><input type="color" value="${o.colours[key]}" data-colour="${key}" aria-label="${esc(text)}"><span>${esc(text)}</span></label>`).join('');
  return `<section class="ub-outfit${changed ? ' changed' : ''}" aria-label="Outfit">${head}
    <p class="ub-dim">Playable characters of this class wear it over their own build, hair and skin. NPCs keep their own look.</p>
    ${rows}<div class="ub-colours">${colours}</div>
    <div><button class="chip" id="dropOutfit" title="Only NPCs will be able to play it">No outfit</button></div>
  </section>`;
}
function renderDetail() {
  const box = $('detail'); stopPreview();
  const e = E.get(V.sel);
  if (!e) { box.innerHTML = '<p class="ub-dim ub-empty">No classes yet. Make one with New class.</p>'; return; }
  const d = e.draft, errs = validateClass(d);
  box.innerHTML = `
    <div class="ub-card">
      <div class="ub-body">
        <div class="ub-head">
          <input class="ub-name" id="name" value="${esc(d.name)}" maxlength="40" spellcheck="false" aria-label="Name">
          ${d.outfit ? `<label class="ub-field"><span>shown on</span><select id="body" aria-label="Shown on">${bodiesOf(d.id).map(b => `<option value="${esc(b.id)}"${b.id === bodyFor(d).id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>` : ''}
        </div>
        <p class="ub-file"><code>${esc(classPath(d.id))}</code>${!e.saved ? ' <span class="ub-tag">new</span>' : isDirty(e) ? ' <span class="ub-tag">unsaved</span>' : ''}</p>
        ${errs.length ? `<p class="ub-errors">${errs.map(esc).join('<br>')}</p>` : ''}
        ${outfitSection(e)}
        <div class="ub-values">${SECTIONS.flatMap(sec => FIELDS[sec].map(f => tile(sec, f, e))).join('')}</div>
        ${patternSection(e)}
        ${abilitySection(e, sideOf(d.id))}
        ${usersSection(d.id)}
        <div class="ub-card-actions">
          <button class="btn" id="revertOne"${isDirty(e) && e.saved ? '' : ' disabled'}>Revert</button>
          <button class="btn ub-danger" id="deleteOne">Delete</button>
        </div>
      </div>
      ${stageHtml(`${nameOf(e)} walking`)}
    </div>`;
  box.querySelectorAll('input[type=number]').forEach(inp => inp.addEventListener('change', () => { e.draft[inp.dataset.sec][inp.dataset.k] = Math.round(Number(inp.value)); commit(e); }));
  box.querySelectorAll('[data-pattern]').forEach(b => b.addEventListener('click', () => { e.draft.stats.pattern = b.dataset.pattern; commit(e); }));
  $('ability')?.addEventListener('change', () => { const id = $('ability').value; if (id) { e.draft.stats.abilities = [...e.draft.stats.abilities, id]; commit(e); } });
  box.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => { e.draft.stats.abilities = e.draft.stats.abilities.filter((x, i) => i !== +b.dataset.drop); commit(e); }));
  $('name').addEventListener('change', () => { e.draft.name = $('name').value; commit(e); });
  $('body')?.addEventListener('change', () => { V.body = $('body').value; renderDetail(); });
  $('addOutfit')?.addEventListener('click', () => { e.draft.outfit = DEFAULT_OUTFIT(); commit(e); });
  $('dropOutfit')?.addEventListener('click', () => { e.draft.outfit = null; commit(e); });
  box.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => { e.draft.outfit = { ...e.draft.outfit, [b.dataset.choice]: b.dataset.v }; commit(e); }));
  /* dragging a colour picker redraws the walking figure only; letting go redraws the card */
  box.querySelectorAll('[data-colour]').forEach(inp => {
    const set = () => { e.draft.outfit = { ...e.draft.outfit, colours: { ...e.draft.outfit.colours, [inp.dataset.colour]: inp.value } }; };
    inp.addEventListener('input', () => { set(); stopPreview(); startPreview(lookOf(e.draft, bodyFor(e.draft)), true); });
    inp.addEventListener('change', () => { set(); commit(e); });
  });
  $('revertOne').addEventListener('click', () => revert(e));
  $('deleteOne').addEventListener('click', () => remove(V.sel));
  startPreview(lookOf(d, bodyFor(d)));
}
/* clamp what was typed into range, then redraw everything that shows it */
function commit(e) { e.draft = normalizeClass(e.draft); renderAll(); }

/* ---------- the table ---------- */
const COLS = [['name', 'Name'], ['users', 'Played by'], ...SECTIONS.flatMap(sec => [...FIELDS[sec].map(([k, l]) => [`${sec}.${k}`, l]), ...(sec === 'stats' ? [['stats.pattern', 'Pattern'], ['stats.abilities', 'Abilities']] : [])])];
const TEXT_COLS = ['name', 'stats.pattern', 'stats.abilities'];
const LIMITS = Object.fromEntries(SECTIONS.flatMap(sec => FIELDS[sec].map(([k, , lo, hi]) => [`${sec}.${k}`, [lo, hi]])));
const read = (rec, key) => { if (key === 'name') return rec.name || rec.id; if (key === 'stats.abilities') return namesOf(rec.stats.abilities); const [a, b] = key.split('.'); return rec[a]?.[b]; };
const cellOf = (id, e, key) => (key === 'users' ? usersOf(id).length : read(e.draft, key));
const savedCell = (e, key) => (!e.saved || key === 'users' ? undefined : read(e.saved, key));
function renderTable() {
  const box = $('table');
  const rows = visible().sort((a, b) => {
    const { key, dir } = V.sort, x = cellOf(a.id, a.e, key), y = cellOf(b.id, b.e, key);
    return (typeof x === 'string' ? x.localeCompare(y) : (x ?? -1) - (y ?? -1)) * dir;
  });
  const head = COLS.map(([k, l]) => `<th scope="col"${TEXT_COLS.includes(k) ? ' class="txt"' : ''}><button data-sort="${k}" aria-sort="${V.sort.key === k ? (V.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(l)}${V.sort.key === k ? (V.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const body = rows.map(({ id, e }) => `<tr data-id="${id}"${id === V.sel ? ' class="sel"' : ''}>${COLS.map(([k]) => {
    const v = cellOf(id, e, k), changed = e.saved && k !== 'users' && savedCell(e, k) !== v ? ' changed' : '';
    if (k === 'name') return `<th scope="row" class="txt${changed}"><button class="ub-open" data-open="${id}">${esc(v)}</button>${isDirty(e) ? '<i class="ub-dot"></i>' : ''}</th>`;
    if (k === 'users') return `<td>${v}</td>`;
    if (k === 'stats.pattern') return `<td class="txt${changed}"><select data-k="${k}" aria-label="Attack pattern of ${esc(nameOf(e))}">${patternOptions(v)}</select></td>`;
    if (k === 'stats.abilities') return `<td class="txt${changed}"><button class="ub-open" data-open="${id}" title="Edit on the card">${esc(v || 'none')}</button></td>`;
    const [lo, hi] = LIMITS[k];
    return `<td class="${changed.trim()}"><input type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${v}" data-k="${k}" aria-label="${esc(k)} of ${esc(nameOf(e))}"></td>`;
  }).join('')}</tr>`).join('');
  box.innerHTML = `<div class="ub-table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  box.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; V.sort = V.sort.key === k ? { key: k, dir: -V.sort.dir } : { key: k, dir: 1 }; renderTable(); }));
  box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { V.sel = b.dataset.open; setView('cards'); }));
  box.querySelectorAll('tbody input, tbody select').forEach(inp => inp.addEventListener('change', () => {
    const e = E.get(inp.closest('tr').dataset.id), k = inp.dataset.k, [a, b] = k.split('.');
    e.draft[a][b] = k === 'stats.pattern' ? inp.value : Math.round(Number(inp.value));
    commit(e);
  }));
}

/* ---------- saving, reverting, deleting, new classes ---------- */
async function saveAll() {
  if (!WRITABLE) return;
  const list = dirtyList(); if (!list.length) return;
  const bad = list.map(e => [e, validateClass(e.draft)]).filter(([, errs]) => errs.length);
  if (bad.length) { toast(`${nameOf(bad[0][0])}: ${bad[0][1][0]}`, true); return; }
  let n = 0;
  for (const e of list) {
    try { const j = await request('PUT', SAVE_URL(e.draft.id), normalizeClass(e.draft)); Object.assign(e, { saved: j.cls, draft: structuredClone(j.cls) }); n++; }
    catch (err) { toast(`Could not save ${nameOf(e)}: ${err.message}`, true); renderAll(); return; }
  }
  toast(`Saved ${n} class${n === 1 ? '' : 'es'} to data/classes/`);
  renderAll();
}
function revert(e) { if (!e.saved) return; e.draft = structuredClone(e.saved); renderAll(); }
function revertAll() {
  const list = dirtyList(); if (!list.length) return;
  if (!confirm(`Throw away changes to ${list.length} class${list.length === 1 ? '' : 'es'}?`)) return;
  for (const e of list) { if (e.saved) revert(e); else E.delete(e.draft.id); }
  if (!E.has(V.sel)) V.sel = ordered()[0]?.id || null;
  renderAll();
}
async function remove(id) {
  const e = E.get(id); if (!e) return;
  if (!e.saved) { E.delete(id); V.sel = ordered()[0]?.id || null; renderAll(); return; }
  if (!WRITABLE) { toast('This copy of the site is read-only: run npm run dev to delete files', true); return; }
  const n = usersOf(id).length;
  if (!confirm(`Delete ${classPath(id)}?${n ? ` ${n} unit${n === 1 ? ' plays' : 's play'} as it and will fight with the default numbers until given another class.` : ''}`)) return;
  try { await request('DELETE', SAVE_URL(id)); E.delete(id); V.sel = ordered()[0]?.id || null; toast(`Deleted ${nameOf(e)}`); renderAll(); }
  catch (err) { toast(`Could not delete: ${err.message}`, true); }
}
function download() { const e = E.get(V.sel); if (e) downloadText(`${e.draft.id}.json`, classText(e.draft)); }
function openNew() {
  $('newId').value = ''; $('newName').value = '';
  $('newFrom').innerHTML = `<option value="">Default numbers</option>${ordered().map(({ id, e }) => `<option value="${id}">${esc(nameOf(e))}</option>`).join('')}`;
  $('newDialog').showModal();
}
/* the id typed for a new class, or one made from its name */
const idFrom = s => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
$('newForm').addEventListener('submit', ev => {
  const id = idFrom($('newId').value || $('newName').value);
  if (ev.submitter?.value === 'ok' && (!id || E.has(id))) { ev.preventDefault(); toast(id ? `There is a class called “${id}” already` : 'Give the class a name', true); }
});
$('newDialog').addEventListener('close', () => {
  if ($('newDialog').returnValue !== 'ok') return;
  const id = idFrom($('newId').value || $('newName').value), from = E.get($('newFrom').value);
  const base = from ? structuredClone(from.draft) : structuredClone(DEFAULT_CLASS);
  const draft = normalizeClass({ ...base, id, name: $('newName').value || id, outfit: base.outfit || DEFAULT_OUTFIT() });
  E.set(id, { draft, saved: null }); V.sel = id; setView('cards');
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
$('newClass').addEventListener('click', openNew);
$('download').addEventListener('click', download);
addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); document.activeElement?.blur?.(); saveAll(); } });
addEventListener('beforeunload', ev => { if (dirtyList().length) { ev.preventDefault(); ev.returnValue = ''; } });
/* a save from here, another tab or a hand edit of a file: take the new numbers for every class not being changed;
   a unit file changing moves classes between the list's groups */
onClassesChange(() => { syncFromRegistry(); renderAll(); });
onUnitsChange(() => renderAll());
/* a playable character made or changed in the character maker: who plays each class, and the bodies to show it on */
onLibraryChange(() => renderAll());
/* a skill saved in the skill editor: its name, cost and numbers change on every card */
onSkillsChange(() => renderAll());
/* ?class=<id> opens that class's card */
const asked = new URLSearchParams(location.search).get('class');
syncFromRegistry(); if (asked && E.has(asked)) V.sel = asked;
renderAll();
