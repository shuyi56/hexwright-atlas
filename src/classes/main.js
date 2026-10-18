import '../styles/main.css';
import './classes.css';
import '../data/unit-files.js';
import '../data/skill-files.js';
import { onSkillsChange } from '../data/skills.ts';
import { DEFAULT_CLASS, FIELDS, MAX_ABILITIES, PATTERNS, SECTIONS, classPath, classText, listClasses, normalizeClass, onClassesChange, validateClass } from '../data/classes.ts';
import { GROUPS, listUnits, normalizeUnit, onUnitsChange, unitPath, unitText, validateUnit } from '../data/units.ts';
import { DEF_SCALE, MP_REGEN, abilityOf, damageOf, healOf, hitChance, listAbilities } from '../battle/abilities.ts';
import { characterById, list as customCharacters, onChange as onLibraryChange } from '../characters/library.js';
import { APPLIES, CHOICES, COLOURS, OUTFIT_COLOURS, OUTFIT_KEYS, cleanSpec, fromSpec } from '../characters/custom.js';
import { FRAMES, VIEWS, frame } from '../characters/roster.js';
import { goFromDataPage, mountRail } from '../ui/rail.js';
import { $, MENU_LABEL, PATTERN_NOTE, WRITABLE, abilityLabel, downloadText, esc, namesOf, patternGrid, patternLabel, patternOptions, request, same, stageHtml, startPreview, stopPreview, thumb, toast } from './common.js';

/* ================= the class editor =================
   Every class in data/classes/ (src/data/classes.ts) and every NPC in data/npcs/ (src/data/units.ts) to read and
   change: a list down the side, a card for each with its figure walking, and a table of them all for balancing
   numbers side by side. A class's card has its outfit, which the playable characters of that class wear over
   their own body, with the clothes, hat, gear and colours of the character maker, and who plays it. An NPC keeps
   its own hand-drawn look; its card has the side it fights on. Both have HP, MP, Attack, Defense, Accuracy,
   Evasion, Range, Move and Jump, a picture of the attack pattern, the abilities and what their blows come to
   against the other side. A playable character picks its class in the character maker. Changes are drafts until
   saved. On the dev server Save writes the files through the Hexwright bridge (tools/vite-hexwright.js), and the
   tactical view in any open tab picks the new numbers up at once; a built copy of the site can read them and
   download a file, but not save. */
mountRail(goFromDataPage('classes'), 'classes');
const CLASS_URL = id => `/__hexwright/classes/${id}`;
const NPC_URL = (group, id) => `/__hexwright/npcs/${group}/${id}`;

/* key -> { kind, draft, saved }: kind is class or npc, the key is c:<id> or n:<id> since an NPC can share an id with a
   class (the Knight NPC and the Knight class); an NPC's draft carries its group too. saved is null for one not yet
   written */
const E = new Map();
const V = { sel: null, view: 'cards', filter: '', sort: { key: 'name', dir: 1 }, body: 'plain' };
const keyOf = (kind, id) => `${kind === 'class' ? 'c' : 'n'}:${id}`;

/* ---------- who plays each class ---------- */
const usersOf = id => listUnits().filter(u => u.playable && u.class === id);
/* the list's groups: the classes, then the NPCs by the side they fight on */
const SIDES = [['classes', 'Classes'], ['allies', 'NPC allies'], ['enemies', 'NPC enemies']];
const sideOf = e => (e.kind === 'class' ? 'classes' : e.draft.group);
const GROUP_NOUN = { allies: 'ally', enemies: 'enemy' };

/* ---------- drafts ---------- */
/* a draft in canonical form, the way its file will hold it (an NPC with its group) */
const normalize = (kind, d) => (kind === 'class' ? normalizeClass(d) : { ...normalizeUnit(d), group: GROUPS.includes(d.group) ? d.group : 'allies' });
const validate = e => (e.kind === 'class' ? validateClass(e.draft) : validateUnit(e.draft, e.draft.group));
const pathOf = e => (e.kind === 'class' ? classPath(e.draft.id) : unitPath(e.draft.group, e.draft.id));
const isDirty = e => !e.saved || !same(normalize(e.kind, e.draft), e.saved);
const dirtyList = () => [...E.values()].filter(isDirty);
function syncFromRegistry() {
  const seen = new Set();
  const take = (kind, raw) => {
    const saved = normalize(kind, raw), key = keyOf(kind, saved.id), e = E.get(key); seen.add(key);
    if (!e) E.set(key, { kind, draft: structuredClone(saved), saved });
    else if (!isDirty(e)) Object.assign(e, { draft: structuredClone(saved), saved });
    else e.saved = saved;
  };
  for (const c of listClasses()) take('class', c.toJSON());
  for (const u of listUnits()) if (!u.playable) take('npc', { ...u.toJSON(), group: u.group });
  /* gone from disk: drop it unless it has unsaved changes, which then count as a new one */
  for (const [key, e] of E) if (!seen.has(key) && e.saved) { if (isDirty(e)) e.saved = null; else E.delete(key); }
  if (!V.sel || !E.has(V.sel)) V.sel = ordered()[0]?.key || null;
}
const nameOf = e => e.draft.name || e.draft.id;
const kindLabel = e => (e.kind === 'class' ? 'class' : `NPC ${GROUP_NOUN[e.draft.group]}`);
const ordered = () => [...E.entries()].map(([key, e]) => ({ key, e, side: sideOf(e) })).sort((a, b) => SIDES.findIndex(s => s[0] === a.side) - SIDES.findIndex(s => s[0] === b.side) || nameOf(a.e).localeCompare(nameOf(b.e)));
const visible = () => { const f = V.filter.trim().toLowerCase(); return ordered().filter(({ e }) => !f || e.draft.id.includes(f) || nameOf(e).toLowerCase().includes(f)); };
/* the largest value of a field across every class and NPC, for the comparison bars */
const rosterMax = (sec, k) => Math.max(1, ...[...E.values()].map(e => e.draft[sec]?.[k] ?? 0));

function updateBar() {
  const n = dirtyList().length;
  $('saveAll').textContent = n ? `Save ${n}` : 'Save'; $('saveAll').disabled = !WRITABLE || !n; $('revertAll').disabled = !n;
  $('mode').textContent = WRITABLE ? (n ? `${n} unsaved` : 'saved to data/') : 'read-only: run npm run dev to save';
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
    for (const { key, e } of rows) {
      const b = document.createElement('button'); b.className = 'ub-row'; b.dataset.key = key; b.setAttribute('aria-current', String(key === V.sel));
      b.append(thumb(lookOf(e)));
      const d = e.draft, n = e.kind === 'class' ? usersOf(d.id).length : 0, info = document.createElement('span'); info.className = 'ub-row-text';
      info.innerHTML = `<b>${esc(nameOf(e))}${isDirty(e) ? '<i class="ub-dot" title="unsaved changes"></i>' : ''}</b><span>HP ${d.stats.hp} · Atk ${d.stats.attack} · Def ${d.stats.defense} · ${patternLabel(d.stats.pattern)}${e.kind === 'class' ? ` · ${n ? `${n} playing` : 'no one yet'}` : ''}</span>`;
      b.append(info); b.addEventListener('click', () => { V.sel = key; renderAll(); if (V.view === 'table') setView('cards'); });
      box.append(b);
    }
  }
  if (!vis.length) box.innerHTML = '<p class="ub-dim ub-empty">Nothing matches.</p>';
}

/* ---------- the card ---------- */
/* one number as a row of the list: its label, the value to edit, and a bar against the largest across them all */
function tile(sec, [k, label, lo, hi], e) {
  const v = e.draft[sec][k], saved = e.saved?.[sec]?.[k], changed = e.saved && saved !== v;
  return `<label class="ub-value${changed ? ' changed' : ''}"${changed ? ` title="saved: ${saved}"` : ''}>
    <span class="ub-value-name">${esc(label)}</span>
    <input type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${v}" data-sec="${sec}" data-k="${k}" aria-label="${esc(label)}">
    <span class="ub-meter" aria-hidden="true"><i style="width:${Math.round(100 * Math.min(1, v / rosterMax(sec, k)))}%"></i></span>
  </label>`;
}
/* the attack pattern, a section of its own: a picture of each to pick from, and the chosen one at its range */
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
/* the skills in data/skills/ it does not have yet, to add */
const addOptions = have => `<option value="">Add an ability…</option>${listAbilities().filter(a => !have.includes(a.id)).map(a => `<option value="${esc(a.id)}">${esc(a.label)} (${MENU_LABEL[a.menu]})</option>`).join('')}`;
/* the abilities, a section of their own: each one it has with the battle menu it is listed in, what it costs and
   does and how many uses its MP holds, one to add, and how its blows play against the other side on average (an
   attack's damage and chance to hit) */
function abilitySection(e, side) {
  const st = e.draft.stats, have = st.abilities, saved = e.saved?.stats?.abilities, changed = e.saved && !same(saved, have);
  const foe = side === 'enemies' ? 'allies' : 'enemies', foeLabel = foe === 'allies' ? 'player\'s side' : 'enemies', others = listUnits().filter(u => u.group === foe).map(u => u.stats);
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
      ${others.length ? `<p class="ub-dim">Against the ${foeLabel} on average: deals ${dmg} a hit, lands ${hit}% of the time; takes ${taken} a hit, dodges ${dodge}%. Every ${DEF_SCALE} Defense halves the damage taken.</p>` : ''}
    </div>
  </section>`;
}
/* who plays this class: the playable characters, which wear its outfit */
function usersSection(id) {
  const us = usersOf(id);
  return `<section class="ub-users" aria-label="Who plays this class">
    <h3 class="ub-section">Played by</h3>
    ${us.length ? `<ul class="ub-user-list">${us.map(u => `<li><b>${esc(u.name)}</b> <span class="ub-dim">playable</span></li>`).join('')}</ul>` : '<p class="ub-dim">No one plays this class yet. Give it to a playable character in the character maker.</p>'}
  </section>`;
}
/* the side an NPC fights on, which is the folder its file lives in */
function sideSection(e) {
  const g = e.draft.group, changed = e.saved && e.saved.group !== g;
  return `<section class="ub-users" aria-label="Side">
    <h3 class="ub-section">Fights for${changed ? ' <span class="ub-tag">changed</span>' : ''}</h3>
    <div class="ub-chips" role="radiogroup" aria-label="Side">${GROUPS.map(k => `<button class="chip" role="radio" data-group="${k}" aria-checked="${k === g}" aria-pressed="${k === g}">${k === 'allies' ? 'The player' : 'The enemy'}</button>`).join('')}</div>
    <p class="ub-dim">An NPC keeps its own hand-drawn look and its own numbers; it takes no class.</p>
  </section>`;
}

/* ---------- the outfit ---------- */
/* the body the outfit is shown on: a plain one, or one of the playable characters of this class */
const PLAIN_BODY = cleanSpec({ id: 'plain', name: 'Plain body' });
const bodiesOf = id => [PLAIN_BODY, ...customCharacters().filter(c => c.spec.class === id).map(c => c.spec)];
const bodyFor = d => bodiesOf(d.id).find(b => b.id === V.body) || PLAIN_BODY;
/* how one looks: a class's outfit on a body, or an NPC's own sprite */
function lookOf(e, body = PLAIN_BODY) {
  const d = e.draft; if (e.kind !== 'class') return characterById(d.id);
  return fromSpec({ ...body, class: '', ...d.outfit, colours: { ...body.colours, ...d.outfit.colours } }, { id: `class-${d.id}` });
}
const CHOICE_LABEL = { clothes: 'clothes', sleeves: 'sleeves', cut: 'sleeve cut', neckline: 'neckline', rope: 'belt', hat: 'hat', cape: 'cape', satchel: 'satchel', held: 'in hand', shield: 'shield' };
/* the outfit materials the outfit shows (an arrow's head and fletching too), as the character maker finds them */
function usedOutfitColours(d) {
  const c = lookOf({ kind: 'class', draft: d }), seen = new Set();
  for (const v of VIEWS) for (let k = 0; k < FRAMES; k++) for (const m of frame(c, v, k).mat) if (m) seen.add(m);
  return COLOURS.filter(([key, letter]) => OUTFIT_COLOURS.includes(key) && seen.has(letter) && !(key === 'legs' && d.outfit.clothes === 'overalls'));
}
/* the outfit, a section of its own: a row of chips for each choice that applies, then the colours it shows */
function outfitSection(e) {
  const o = e.draft.outfit, changed = e.saved && !same(e.saved.outfit, o);
  const rows = OUTFIT_KEYS.filter(k => !APPLIES[k] || APPLIES[k](o)).map(k => `<div class="ub-choice"><span class="ub-value-name">${CHOICE_LABEL[k]}</span><div class="ub-chips" role="group" aria-label="${CHOICE_LABEL[k]}">${CHOICES[k].map(([v, t]) => `<button class="chip" data-choice="${k}" data-v="${v}" aria-pressed="${o[k] === v}">${esc(t)}</button>`).join('')}</div></div>`).join('');
  const colours = usedOutfitColours(e.draft).map(([key, , text]) => `<label class="ub-colour"><input type="color" value="${o.colours[key]}" data-colour="${key}" aria-label="${esc(text)}"><span>${esc(text)}</span></label>`).join('');
  return `<section class="ub-outfit${changed ? ' changed' : ''}" aria-label="Outfit">
    <h3 class="ub-section">Outfit${changed ? ' <span class="ub-tag">changed</span>' : ''}</h3>
    <p class="ub-dim">Playable characters of this class wear it over their own build, hair and skin.</p>
    ${rows}<div class="ub-colours">${colours}</div>
  </section>`;
}
function renderDetail() {
  const box = $('detail'); stopPreview();
  const e = E.get(V.sel);
  if (!e) { box.innerHTML = '<p class="ub-dim ub-empty">No classes yet. Make one with New class.</p>'; return; }
  const d = e.draft, errs = validate(e), cls = e.kind === 'class';
  box.innerHTML = `
    <div class="ub-card">
      <div class="ub-body">
        <div class="ub-head">
          <input class="ub-name" id="name" value="${esc(d.name)}" maxlength="40" spellcheck="false" aria-label="Name">
          <span class="ub-tag">${kindLabel(e)}</span>
          ${cls ? `<label class="ub-field"><span>shown on</span><select id="body" aria-label="Shown on">${bodiesOf(d.id).map(b => `<option value="${esc(b.id)}"${b.id === bodyFor(d).id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>` : ''}
        </div>
        <p class="ub-file"><code>${esc(pathOf(e))}</code>${!e.saved ? ' <span class="ub-tag">new</span>' : isDirty(e) ? ' <span class="ub-tag">unsaved</span>' : ''}</p>
        ${errs.length ? `<p class="ub-errors">${errs.map(esc).join('<br>')}</p>` : ''}
        ${cls ? outfitSection(e) : sideSection(e)}
        <div class="ub-values">${SECTIONS.flatMap(sec => FIELDS[sec].map(f => tile(sec, f, e))).join('')}</div>
        ${patternSection(e)}
        ${abilitySection(e, cls ? 'allies' : d.group)}
        ${cls ? usersSection(d.id) : ''}
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
  box.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => { e.draft.group = b.dataset.group; commit(e); }));
  box.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => { e.draft.outfit = { ...e.draft.outfit, [b.dataset.choice]: b.dataset.v }; commit(e); }));
  /* dragging a colour picker redraws the walking figure only; letting go redraws the card */
  box.querySelectorAll('[data-colour]').forEach(inp => {
    const set = () => { e.draft.outfit = { ...e.draft.outfit, colours: { ...e.draft.outfit.colours, [inp.dataset.colour]: inp.value } }; };
    inp.addEventListener('input', () => { set(); stopPreview(); startPreview(lookOf(e, bodyFor(e.draft)), true); });
    inp.addEventListener('change', () => { set(); commit(e); });
  });
  $('revertOne').addEventListener('click', () => revert(e));
  $('deleteOne').addEventListener('click', () => remove(V.sel));
  startPreview(lookOf(e, bodyFor(d)));
}
/* clamp what was typed into range, then redraw everything that shows it */
function commit(e) { e.draft = normalize(e.kind, e.draft); renderAll(); }

/* ---------- the table ---------- */
const COLS = [['name', 'Name'], ['kind', 'Kind'], ...SECTIONS.flatMap(sec => [...FIELDS[sec].map(([k, l]) => [`${sec}.${k}`, l]), ...(sec === 'stats' ? [['stats.pattern', 'Pattern'], ['stats.abilities', 'Abilities']] : [])])];
const TEXT_COLS = ['name', 'kind', 'stats.pattern', 'stats.abilities'];
const LIMITS = Object.fromEntries(SECTIONS.flatMap(sec => FIELDS[sec].map(([k, , lo, hi]) => [`${sec}.${k}`, [lo, hi]])));
const read = (rec, key) => { if (key === 'name') return rec.name || rec.id; if (key === 'stats.abilities') return namesOf(rec.stats.abilities); const [a, b] = key.split('.'); return rec[a]?.[b]; };
const cellOf = (e, key) => (key === 'kind' ? kindLabel(e) : read(e.draft, key));
const savedCell = (e, key) => (!e.saved || key === 'kind' ? undefined : read(e.saved, key));
function renderTable() {
  const box = $('table');
  const rows = visible().sort((a, b) => {
    const { key, dir } = V.sort, x = cellOf(a.e, key), y = cellOf(b.e, key);
    return (typeof x === 'string' ? x.localeCompare(y) : (x ?? -1) - (y ?? -1)) * dir;
  });
  const head = COLS.map(([k, l]) => `<th scope="col"${TEXT_COLS.includes(k) ? ' class="txt"' : ''}><button data-sort="${k}" aria-sort="${V.sort.key === k ? (V.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(l)}${V.sort.key === k ? (V.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const body = rows.map(({ key, e }) => `<tr data-key="${key}"${key === V.sel ? ' class="sel"' : ''}>${COLS.map(([k]) => {
    const v = cellOf(e, k), changed = e.saved && k !== 'kind' && savedCell(e, k) !== v ? ' changed' : '';
    if (k === 'name') return `<th scope="row" class="txt${changed}"><button class="ub-open" data-open="${key}">${esc(v)}</button>${isDirty(e) ? '<i class="ub-dot"></i>' : ''}</th>`;
    if (k === 'kind') return `<td class="txt">${esc(v)}</td>`;
    if (k === 'stats.pattern') return `<td class="txt${changed}"><select data-k="${k}" aria-label="Attack pattern of ${esc(nameOf(e))}">${patternOptions(v)}</select></td>`;
    if (k === 'stats.abilities') return `<td class="txt${changed}"><button class="ub-open" data-open="${key}" title="Edit on the card">${esc(v || 'none')}</button></td>`;
    const [lo, hi] = LIMITS[k];
    return `<td class="${changed.trim()}"><input type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${v}" data-k="${k}" aria-label="${esc(k)} of ${esc(nameOf(e))}"></td>`;
  }).join('')}</tr>`).join('');
  box.innerHTML = `<div class="ub-table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  box.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; V.sort = V.sort.key === k ? { key: k, dir: -V.sort.dir } : { key: k, dir: 1 }; renderTable(); }));
  box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { V.sel = b.dataset.open; setView('cards'); }));
  box.querySelectorAll('tbody input, tbody select').forEach(inp => inp.addEventListener('change', () => {
    const e = E.get(inp.closest('tr').dataset.key), k = inp.dataset.k, [a, b] = k.split('.');
    e.draft[a][b] = k === 'stats.pattern' ? inp.value : Math.round(Number(inp.value));
    commit(e);
  }));
}

/* ---------- saving, reverting, deleting, new classes ---------- */
/* write one to its file; an NPC moved to the other side is written there and its old file goes */
async function put(e) {
  const d = normalize(e.kind, e.draft);
  if (e.kind === 'class') { const j = await request('PUT', CLASS_URL(d.id), d); return j.cls; }
  const { group, ...unit } = d, j = await request('PUT', NPC_URL(group, d.id), unit); return { ...j.unit, group };
}
async function saveAll() {
  if (!WRITABLE) return;
  const list = dirtyList(); if (!list.length) return;
  const bad = list.map(e => [e, validate(e)]).filter(([, errs]) => errs.length);
  if (bad.length) { toast(`${nameOf(bad[0][0])}: ${bad[0][1][0]}`, true); return; }
  let n = 0;
  for (const e of list) {
    try { const saved = await put(e); Object.assign(e, { saved, draft: structuredClone(saved) }); n++; }
    catch (err) { toast(`Could not save ${nameOf(e)}: ${err.message}`, true); renderAll(); return; }
  }
  toast(`Saved ${n} file${n === 1 ? '' : 's'} to data/`);
  renderAll();
}
function revert(e) { if (!e.saved) return; e.draft = structuredClone(e.saved); renderAll(); }
function revertAll() {
  const list = dirtyList(); if (!list.length) return;
  if (!confirm(`Throw away changes to ${list.length} file${list.length === 1 ? '' : 's'}?`)) return;
  for (const e of list) { if (e.saved) revert(e); else E.delete(keyOf(e.kind, e.draft.id)); }
  if (!E.has(V.sel)) V.sel = ordered()[0]?.key || null;
  renderAll();
}
async function remove(key) {
  const e = E.get(key); if (!e) return;
  if (!e.saved) { E.delete(key); V.sel = ordered()[0]?.key || null; renderAll(); return; }
  if (!WRITABLE) { toast('This copy of the site is read-only: run npm run dev to delete files', true); return; }
  const n = e.kind === 'class' ? usersOf(e.draft.id).length : 0, file = e.kind === 'class' ? classPath(e.saved.id) : unitPath(e.saved.group, e.saved.id);
  const after = e.kind === 'class' ? (n ? ` ${n} playable character${n === 1 ? ' plays' : 's play'} it and will fight with the default numbers until given another class.` : '') : ' It will fight with the default numbers.';
  if (!confirm(`Delete ${file}?${after}`)) return;
  try { await request('DELETE', e.kind === 'class' ? CLASS_URL(e.saved.id) : NPC_URL(e.saved.group, e.saved.id)); E.delete(key); V.sel = ordered()[0]?.key || null; toast(`Deleted ${nameOf(e)}`); renderAll(); }
  catch (err) { toast(`Could not delete: ${err.message}`, true); }
}
function download() { const e = E.get(V.sel); if (e) downloadText(`${e.draft.id}.json`, e.kind === 'class' ? classText(e.draft) : unitText(e.draft)); }
function openNew() {
  $('newId').value = ''; $('newName').value = '';
  $('newFrom').innerHTML = `<option value="">Default numbers</option>${ordered().map(({ key, e }) => `<option value="${key}">${esc(nameOf(e))} (${kindLabel(e)})</option>`).join('')}`;
  $('newDialog').showModal();
}
/* the id typed for a new class, or one made from its name */
const idFrom = s => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
$('newForm').addEventListener('submit', ev => {
  const id = idFrom($('newId').value || $('newName').value);
  if (ev.submitter?.value === 'ok' && (!id || E.has(keyOf('class', id)))) { ev.preventDefault(); toast(id ? `There is a class called “${id}” already` : 'Give the class a name', true); }
});
$('newDialog').addEventListener('close', () => {
  if ($('newDialog').returnValue !== 'ok') return;
  const id = idFrom($('newId').value || $('newName').value), from = E.get($('newFrom').value);
  const base = structuredClone(from ? from.draft : DEFAULT_CLASS);
  const draft = normalizeClass({ ...base, id, name: $('newName').value || id, outfit: from?.kind === 'class' ? base.outfit : DEFAULT_CLASS.outfit });
  E.set(keyOf('class', id), { kind: 'class', draft, saved: null }); V.sel = keyOf('class', id); setView('cards');
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
/* a save from here, another tab or a hand edit of a file: take the new numbers for every class and NPC not being
   changed */
onClassesChange(() => { syncFromRegistry(); renderAll(); });
onUnitsChange(() => { syncFromRegistry(); renderAll(); });
/* a playable character made or changed in the character maker: who plays each class, and the bodies to show it on */
onLibraryChange(() => renderAll());
/* a skill saved in the skill editor: its name, cost and numbers change on every card */
onSkillsChange(() => renderAll());
/* ?class=<id> opens that class's card, ?npc=<id> that NPC's */
const Q = new URLSearchParams(location.search), asked = Q.get('class') ? keyOf('class', Q.get('class')) : Q.get('npc') ? keyOf('npc', Q.get('npc')) : null;
syncFromRegistry(); if (asked && E.has(asked)) V.sel = asked;
renderAll();
