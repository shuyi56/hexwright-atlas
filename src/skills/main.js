import '../styles/main.css';
import '../units/units.css';
import './skills.css';
import '../data/unit-files.js';
import '../data/skill-files.js';
import { DEFAULT_SKILL, FIELDS, FX_FIELDS, FX_PRESETS, ID_RE, KINDS, listSkills, normalizeSkill, onSkillsChange, skillFrom, skillPath, skillText, validateSkill } from '../data/skills.ts';
import { listUnits, onUnitsChange } from '../data/units.ts';
import { ATTACK, DEF_SCALE, MP_REGEN, blowOf, describe, healOf } from '../battle/abilities.ts';
import { abilityFx, createFx, drawFx, emit, stepFx, tintRamp } from '../tactical/particles.js';
import { characterById } from '../characters/library.js';
import { attackOf, render } from '../characters/roster.js';
import { H as FH, W as FW } from '../characters/pixels.js';
import { mountRail } from '../ui/rail.js';

/* ================= the skill editor =================
   Every skill in data/skills/ (src/data/skills.ts) to read and change: a list down the side, and a card per skill
   with its name and kind, its MP cost and numbers (power and how much Defense it ignores for a blow, the base and
   the share of Attack for a heal, whether it never misses), its particles (the effect, its colour, size and count)
   playing between two figures, and who in the unit data has it with what it comes to for them. Changes are drafts
   until saved, as on the unit data page: on the dev server Save writes the files through the Hexwright bridge
   (tools/vite-hexwright.js), and the tactical view and unit data page in any open tab pick the new numbers up at
   once; a built copy of the site can read the skills and download a skill's file, but not save. */
const $ = id => document.getElementById(id);
const WRITABLE = import.meta.env.DEV;
/* the module rail: the unit data page is a page of its own, every other module lives on the atlas page */
mountRail(id => { if (id === 'units') location.href = './units.html'; else if (id !== 'skills') location.href = id === 'atlas' ? './index.html' : `./index.html#${id}`; }, 'skills');
const SAVE_URL = id => `/__hexwright/skills/${id}`;

/* id -> { draft, saved }: saved is null for a skill not yet written */
const E = new Map();
const V = { sel: null, filter: '', missed: false };

/* ---------- drafts ---------- */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isDirty = e => !e.saved || !same(normalizeSkill(e.draft), e.saved);
const dirtyList = () => [...E.values()].filter(isDirty);
function syncFromRegistry() {
  const seen = new Set();
  for (const s of listSkills()) {
    seen.add(s.id); const saved = normalizeSkill(s), e = E.get(s.id);
    if (!e) E.set(s.id, { draft: structuredClone(saved), saved });
    else if (!isDirty(e)) Object.assign(e, { draft: structuredClone(saved), saved });
    else e.saved = saved;
  }
  /* gone from disk: drop it unless it has unsaved changes, which then count as a new skill */
  for (const [id, e] of E) if (!seen.has(id) && e.saved) { if (isDirty(e)) e.saved = null; else E.delete(id); }
  if (!V.sel || !E.has(V.sel)) V.sel = ordered()[0]?.id || null;
}
/* the skills in the registry's order, then any new ones by name */
const ordered = () => { const order = listSkills().map(s => s.id), at = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; }; return [...E.entries()].map(([id, e]) => ({ id, e })).sort((a, b) => at(a.id) - at(b.id) || nameOf(a.e).localeCompare(nameOf(b.e))); };
const nameOf = e => e.draft.label || e.draft.id;
const visible = () => { const f = V.filter.trim().toLowerCase(); return ordered().filter(({ id, e }) => !f || id.includes(f) || nameOf(e).toLowerCase().includes(f)); };
/* the skill as the battle would play it, draft numbers and all */
const asAbility = d => skillFrom(d).toAction();
/* the units whose data names this skill */
const usersOf = id => listUnits().filter(u => u.stats.ability === id);
/* the colour a skill shows as in the list: its tint, or the middle of its effect's own colours */
const PRESET_COLOUR = { power: '#ff9a3c', true: '#ffe27a', pierce: '#9fd2f0', spell: '#b896f0', heal: '#8fe39a', none: '#6d7676' };
const colourOf = d => d.fx.tint || PRESET_COLOUR[d.fx.preset];

/* ---------- small helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
let toastTimer = 0;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 2600); }
function updateBar() {
  const n = dirtyList().length;
  $('saveAll').textContent = n ? `Save ${n}` : 'Save'; $('saveAll').disabled = !WRITABLE || !n; $('revertAll').disabled = !n;
  $('mode').textContent = WRITABLE ? (n ? `${n} unsaved` : 'saved to data/skills/') : 'read-only: run npm run dev to save';
  $('mode').classList.toggle('warn', !WRITABLE || n > 0);
  $('download').disabled = !V.sel;
}

/* ---------- the list ---------- */
function renderList() {
  const box = $('rows'); box.textContent = '';
  const vis = visible();
  for (const { id, e } of vis) {
    const d = e.draft, b = document.createElement('button'); b.className = 'ub-row sk-row'; b.dataset.id = id; b.setAttribute('aria-current', String(id === V.sel));
    b.innerHTML = `<span class="sk-swatch" style="--c:${colourOf(d)}" aria-hidden="true"></span><span class="ub-row-text"><b>${esc(nameOf(e))}${isDirty(e) ? '<i class="ub-dot" title="unsaved changes"></i>' : ''}</b><span>${d.cost} MP${d.cooldown ? ` · ${d.cooldown}t cooldown` : ''} · ${esc(describe(d))}</span></span>`;
    b.addEventListener('click', () => { V.sel = id; renderAll(); });
    box.append(b);
  }
  if (!vis.length) box.innerHTML = '<p class="ub-dim ub-empty">No skill matches.</p>';
}

/* ---------- the card ---------- */
/* one number as a row: its label, the value to edit, and a bar against its range */
function tile(path, [k, label, lo, hi], value, saved, hint) {
  const changed = saved !== undefined && saved !== value;
  return `<label class="ub-value${changed ? ' changed' : ''}"${changed ? ` title="saved: ${saved}"` : ''}>
    <span class="ub-value-name">${esc(label)}</span>
    <input type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${value}" data-path="${path}" data-k="${k}" aria-label="${esc(label)}">
    <span class="sk-hint">${hint ? esc(hint) : ''}<span class="ub-meter" aria-hidden="true"><i style="width:${Math.round(100 * Math.min(1, (value - lo) / (hi - lo || 1)))}%"></i></span></span>
  </label>`;
}
/* a few words under each number on what it comes to */
function hintOf(k, d) {
  if (k === 'cost') return d.cost ? `${MP_REGEN} MP back each turn` : 'free';
  if (k === 'cooldown') return d.cooldown ? `then rests ${d.cooldown} turn${d.cooldown === 1 ? '' : 's'}` : 'every turn';
  if (k === 'power') return `${+(d.power / 100).toFixed(2)}× the user's Attack`;
  if (k === 'pierce') return d.pierce >= 100 ? 'all of the Defense' : d.pierce ? `${d.pierce}% of the Defense` : 'none of it';
  if (k === 'healBase') return 'HP before Attack counts';
  if (k === 'healScale') return `+${+(d.healScale / 100).toFixed(2)} HP a point of Attack`;
  if (k === 'scale') return d.fx.scale === 100 ? 'as drawn' : `${d.fx.scale > 100 ? 'wider' : 'tighter'} and ${d.fx.scale > 100 ? 'faster' : 'slower'}`;
  if (k === 'density') return d.fx.density ? `${d.fx.density === 100 ? 'as drawn' : d.fx.density > 100 ? 'more' : 'fewer'}` : 'no particles';
  return '';
}
/* the numbers that matter for this kind of skill, and Never misses for a blow */
function valuesSection(e) {
  const d = e.draft, s = e.saved;
  const rows = FIELDS.filter(f => !f[5] || f[5] === d.kind).map(f => tile('', f, d[f[0]], s?.[f[0]], hintOf(f[0], d))).join('');
  const sureChanged = s && s.sure !== d.sure;
  const sure = d.kind === 'damage' ? `<div class="ub-value sk-toggle${sureChanged ? ' changed' : ''}"><span class="ub-value-name">Never misses</span>
    <button class="chip" id="sure" role="switch" aria-checked="${d.sure}" aria-pressed="${d.sure}">${d.sure ? 'On' : 'Off'}</button>
    <span class="sk-hint">${d.sure ? 'always lands, whatever the Evasion' : 'rolls the attack\'s chance to hit'}</span></div>` : '';
  return `<div class="ub-values">${rows}${sure}</div>`;
}
/* the effect: one to pick, its colour (or its own), its size and how many particles */
function fxSection(e) {
  const d = e.draft, f = d.fx, s = e.saved?.fx, changed = s && !same(s, f);
  const own = !f.tint, swatch = f.tint || PRESET_COLOUR[f.preset];
  return `<section class="sk-fx${changed ? ' changed' : ''}" aria-label="Particles">
    <h3 class="ub-section">Particles${changed ? ' <span class="ub-tag">changed</span>' : ''}</h3>
    <div class="sk-presets" role="radiogroup" aria-label="Effect">${FX_PRESETS.map(([id, label, what]) => `<button role="radio" aria-checked="${id === f.preset}" data-preset="${id}" title="${esc(what)}"><span class="sk-ramp" aria-hidden="true">${rampOf(id, f.tint).map(c => `<i style="background:${c}"></i>`).join('')}</span><span>${esc(label)}</span></button>`).join('')}</div>
    <p class="ub-dim">${esc(cap(FX_PRESETS.find(([id]) => id === f.preset)[2]))}.</p>
    <div class="ub-values">
      <div class="ub-value sk-tint"><span class="ub-value-name">Colour</span>
        <input type="color" id="tint" value="${swatch}" aria-label="Colour"${f.preset === 'none' ? ' disabled' : ''}>
        <label class="sk-own"><input type="checkbox" id="ownTint"${own ? ' checked' : ''}${f.preset === 'none' ? ' disabled' : ''}> ${f.preset === 'spell' ? 'the caster\'s own colour' : 'the effect\'s own colours'}</label></div>
      ${FX_FIELDS.map(fl => tile('fx', fl, f[fl[0]], s?.[fl[0]], hintOf(fl[0], d))).join('')}
    </div>
  </section>`;
}
/* the colours an effect runs through, with a tint in place of its own */
const OWN_RAMP = { power: ['#fff4d0', '#ffd27a', '#ff9a3c', '#d9553f', '#6a261b'], true: ['#ffffff', '#fff4d0', '#ffe27a', '#e4b04a'], pierce: ['#ffffff', '#dff4ff', '#9fd2f0', '#5d8fd0'], spell: ['#ffffff', '#fffaf0', '#f2c460', '#f2c460'], heal: ['#ffffff', '#e6ffd8', '#8fe39a', '#3fb85a'], none: [] };
const rampOf = (id, tint) => (id === 'none' ? [] : tint ? tintRamp(tint, OWN_RAMP[id].length) : OWN_RAMP[id]);
/* who has it, and what it comes to for each against the other side on average next to a plain attack */
function usersSection(e) {
  const d = e.draft, a = asAbility(d), users = usersOf(d.id);
  if (!users.length) return `<section class="sk-users"><h3 class="ub-section">Who has it</h3><p class="ub-dim">No unit has it yet. Give it to one on the <a class="ub-link" href="./units.html">unit data page</a>.</p></section>`;
  const all = listUnits(), avg = (list, f) => (list.length ? Math.round(list.reduce((n, o) => n + f(o), 0) / list.length) : 0);
  const rows = users.map(u => {
    const st = u.stats, foes = all.filter(o => o.group !== u.group).map(o => o.stats), uses = d.cost ? Math.floor(st.mp / d.cost) : null;
    const plain = avg(foes, o => blowOf(ATTACK, st, o).amount), with_ = avg(foes, o => blowOf(a, st, o).amount), hit = a.sure ? 100 : avg(foes, o => blowOf(a, st, o).chance);
    const what = a.heal ? `<td colspan="3">heals ${healOf(st.attack, a)}</td>` : `<td>${plain}</td><td><b>${with_}</b></td><td>${hit}%</td>`;
    return `<tr><th scope="row"><a href="./units.html?unit=${encodeURIComponent(u.id)}">${esc(u.name)}</a></th><td>${st.attack}</td><td>${st.mp}</td><td${uses === 0 ? ' class="ub-warn"' : ''}>${uses ?? '∞'}</td>${what}</tr>`;
  }).join('');
  return `<section class="sk-users"><h3 class="ub-section">Who has it</h3>
    <div class="ub-table-scroll"><table class="sk-table"><thead><tr><th scope="col">Unit</th><th scope="col">Atk</th><th scope="col">MP</th><th scope="col">Uses</th>${a.heal ? '<th scope="col" colspan="3">Restores</th>' : '<th scope="col" title="a plain attack against the other side, on average">Attack</th><th scope="col" title="this skill against the other side, on average">Skill</th><th scope="col">Hit</th>'}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="ub-dim">${a.heal ? 'A heal never misses and is never critical.' : `Damage against the other side on average, before critical hits. Every ${DEF_SCALE} Defense halves what gets through.`} Uses from full MP.</p>
  </section>`;
}
function renderDetail() {
  const box = $('detail'); stopPreview();
  const e = E.get(V.sel);
  if (!e) { box.innerHTML = '<p class="ub-dim ub-empty">No skills yet. Make one with New skill.</p>'; return; }
  const d = e.draft, errs = validateSkill(d), kindChanged = e.saved && e.saved.kind !== d.kind;
  box.innerHTML = `
    <div class="ub-card">
      <div class="ub-body">
        <div class="ub-head">
          <input class="ub-name" id="label" value="${esc(d.label)}" maxlength="32" spellcheck="false" aria-label="Name">
          <select id="kind" aria-label="Kind"${kindChanged ? ' class="changed"' : ''}>${KINDS.map(([k, l]) => `<option value="${k}"${k === d.kind ? ' selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <p class="ub-file"><code>${esc(skillPath(d.id))}</code>${!e.saved ? ' <span class="ub-tag">new</span>' : isDirty(e) ? ' <span class="ub-tag">unsaved</span>' : ''}<span class="sk-note">${esc(cap(describe(d)))}</span></p>
        ${errs.length ? `<p class="ub-errors">${errs.map(esc).join('<br>')}</p>` : ''}
        ${valuesSection(e)}
        ${fxSection(e)}
        ${usersSection(e)}
        <div class="ub-card-actions">
          <button class="btn" id="revertOne"${isDirty(e) && e.saved ? '' : ' disabled'}>Revert</button>
          <button class="btn ub-danger" id="deleteOne">Delete</button>
        </div>
      </div>
      <div class="ub-stage sk-stage">
        <canvas id="stage" width="${ART_W * PX}" height="${ART_H * PX}" aria-label="${esc(nameOf(e))} playing"></canvas>
        <div class="ub-stage-chips">
          <button class="chip" id="replay" title="Play it again">Replay</button>
          <button class="chip" id="missed" aria-pressed="${V.missed}" title="Play it missing">Miss</button>
        </div>
      </div>
    </div>`;
  box.querySelectorAll('input[type=number]').forEach(inp => inp.addEventListener('change', () => {
    const n = Math.round(Number(inp.value)); if (inp.dataset.path === 'fx') e.draft.fx[inp.dataset.k] = n; else e.draft[inp.dataset.k] = n;
    commit(e);
  }));
  box.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { e.draft.fx.preset = b.dataset.preset; commit(e); }));
  $('sure')?.addEventListener('click', () => { e.draft.sure = !e.draft.sure; commit(e); });
  /* the colour follows the picker live, and is kept on change */
  $('tint').addEventListener('input', () => { e.draft.fx.tint = $('tint').value; $('ownTint').checked = false; restartPreview(e); });
  $('tint').addEventListener('change', () => { e.draft.fx.tint = $('tint').value; commit(e); });
  $('ownTint').addEventListener('change', () => { e.draft.fx.tint = $('ownTint').checked ? '' : $('tint').value; commit(e); });
  $('label').addEventListener('change', () => { e.draft.label = $('label').value; commit(e); });
  $('kind').addEventListener('change', () => { e.draft.kind = $('kind').value; commit(e); });
  $('replay').addEventListener('click', () => restartPreview(e));
  $('missed').addEventListener('click', () => { V.missed = !V.missed; $('missed').setAttribute('aria-pressed', String(V.missed)); restartPreview(e); });
  $('revertOne').addEventListener('click', () => revert(e));
  $('deleteOne').addEventListener('click', () => remove(V.sel));
  startPreview(e);
}
/* clamp what was typed into range, then redraw everything that shows it */
function commit(e) { e.draft = normalizeSkill(e.draft); renderAll(); }

/* ---------- the preview: the skill played between two figures, over and over ----------
   The user stands on the left facing right, the target on the right: a foe for a blow, an ally for a heal. The user
   gathers the charge, the impact bursts on the target a moment later (or it fizzles, with Miss on) and the target
   flinches, then it plays again. An arcane burst with no colour of its own takes the user's spell colour, as in the
   tactical view. Figures and particles are drawn in art pixels, PX canvas pixels each. */
const ART_W = 112, ART_H = 64, PX = 4, FEET = 54, LOOP = 1.9, LAND = 0.5;
let anim = 0, P = null;
/* the sprites to show: the first unit with the skill (else a knight), and a foe or an ally of its side */
function castOf(d) {
  const units = listUnits(), user = usersOf(d.id)[0] || units.find(u => u.id === 'knight') || units[0];
  const side = user?.group || 'characters', heal = d.kind === 'heal';
  const target = units.find(u => u.id !== user?.id && (heal ? u.group === side : u.group !== side)) || user;
  return [user, target].map(u => characterById(u?.id || 'villager') || characterById('villager'));
}
function figureCanvas(c) {
  if (!c) return null;
  const im = new ImageData(FW, FH), one = document.createElement('canvas'); one.width = FW; one.height = FH;
  im.data.set(render(c).front[0]); one.getContext('2d').putImageData(im, 0, 0); return one;
}
function startPreview(e) {
  const can = $('stage'), g = can.getContext('2d'), [uc, tc] = castOf(e.draft);
  P = { e, fx: createFx(), t: LOOP, last: 0, figs: [figureCanvas(uc), figureCanvas(tc)], at: [[30, FEET], [82, FEET]], flinch: 0, tint: uc ? attackOf(uc).tint : '' };
  const chest = i => [P.at[i][0], P.at[i][1] - 13];
  const step = now => {
    anim = requestAnimationFrame(step);
    const dt = P.last ? Math.min(0.05, (now - P.last) / 1000) : 0; P.last = now;
    const was = P.t; P.t += dt;
    if (P.t >= LOOP) { P.t = 0; P.fx = createFx(); emit(P.fx, abilityFx(P.e.draft.fx, 'charge', chest(0), chest(1), { tint: P.tint })); }
    else if (was < LAND && P.t >= LAND) { emit(P.fx, abilityFx(P.e.draft.fx, V.missed ? 'fizzle' : 'impact', chest(0), chest(1), { tint: P.tint })); if (!V.missed) P.flinch = 0.18; }
    stepFx(P.fx, dt); P.flinch = Math.max(0, P.flinch - dt);
    g.clearRect(0, 0, can.width, can.height); g.imageSmoothingEnabled = false;
    P.figs.forEach((f, i) => {
      const [x, y] = P.at[i], dx = i === 1 && P.flinch ? Math.round(Math.sin(P.flinch * 90)) * (V.missed ? 0 : 1) : 0;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x * PX, (y - 0.5) * PX, 8 * PX, 2 * PX, 0, 0, Math.PI * 2); g.fill();
      if (!f) return;
      /* the user faces right, the target left */
      g.save(); g.translate((x + dx) * PX, 0); if (i === 0) g.scale(-1, 1); g.drawImage(f, -FW / 2 * PX, (y - FH + 2) * PX, FW * PX, FH * PX); g.restore();
    });
    drawFx(g, P.fx, PX, 0, 0);
  };
  anim = requestAnimationFrame(step);
}
function restartPreview(e) { if (!P) return; P.e = e; P.t = LOOP; }
function stopPreview() { if (anim) cancelAnimationFrame(anim); anim = 0; P = null; }

/* ---------- saving, reverting, deleting, new skills ---------- */
async function request(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ ok: false, error: { message: `the server answered ${r.status}` } }));
  if (!j.ok) throw new Error(j.error?.message || `the server answered ${r.status}`);
  return j;
}
async function saveAll() {
  if (!WRITABLE) return;
  const list = dirtyList(); if (!list.length) return;
  const bad = list.map(e => [e, validateSkill(e.draft)]).filter(([, errs]) => errs.length);
  if (bad.length) { toast(`${nameOf(bad[0][0])}: ${bad[0][1][0]}`, true); return; }
  let n = 0;
  for (const e of list) {
    try {
      const j = await request('PUT', SAVE_URL(e.draft.id), normalizeSkill(e.draft));
      Object.assign(e, { saved: j.skill, draft: structuredClone(j.skill) }); n++;
    } catch (err) { toast(`Could not save ${nameOf(e)}: ${err.message}`, true); renderAll(); return; }
  }
  toast(`Saved ${n} skill${n === 1 ? '' : 's'} to data/skills/`);
  renderAll();
}
function revert(e) { if (!e.saved) return; e.draft = structuredClone(e.saved); renderAll(); }
function revertAll() {
  const list = dirtyList(); if (!list.length) return;
  if (!confirm(`Throw away changes to ${list.length} skill${list.length === 1 ? '' : 's'}?`)) return;
  for (const e of list) { if (e.saved) revert(e); else E.delete(e.draft.id); }
  if (!E.has(V.sel)) V.sel = ordered()[0]?.id || null;
  renderAll();
}
async function remove(id) {
  const e = E.get(id); if (!e) return;
  if (!e.saved) { E.delete(id); V.sel = ordered()[0]?.id || null; renderAll(); return; }
  if (!WRITABLE) { toast('This copy of the site is read-only: run npm run dev to delete files', true); return; }
  const users = usersOf(id).map(u => u.name);
  if (!confirm(`Delete ${skillPath(id)}?${users.length ? ` ${users.join(', ')} will only attack until given another skill.` : ''}`)) return;
  try { await request('DELETE', SAVE_URL(id)); E.delete(id); V.sel = ordered()[0]?.id || null; toast(`Deleted ${nameOf(e)}`); renderAll(); }
  catch (err) { toast(`Could not delete: ${err.message}`, true); }
}
function download() {
  const e = E.get(V.sel); if (!e) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([skillText(e.draft)], { type: 'application/json' }));
  a.download = `${e.draft.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function openNew() {
  $('newId').value = ''; $('newLabel').value = '';
  $('newFrom').innerHTML = `<option value="">Default numbers</option>${ordered().map(({ id, e }) => `<option value="${esc(id)}"${id === V.sel ? ' selected' : ''}>${esc(nameOf(e))}</option>`).join('')}`;
  $('newDialog').showModal();
}
/* the id must be free and well formed before Create closes the dialog */
$('newId').addEventListener('input', () => { const id = $('newId').value.trim(); $('newId').setCustomValidity(E.has(id) ? 'There is a skill with that id already' : ['none', 'attack'].includes(id) ? 'That id is kept for the plain attack' : ''); });
$('newDialog').addEventListener('close', () => {
  if ($('newDialog').returnValue !== 'ok') return;
  const id = $('newId').value.trim().toLowerCase(), from = E.get($('newFrom').value);
  if (!ID_RE.test(id) || E.has(id)) return;
  const base = from ? structuredClone(from.draft) : structuredClone({ ...DEFAULT_SKILL, fx: { ...DEFAULT_SKILL.fx } });
  const draft = normalizeSkill({ ...base, id, label: $('newLabel').value.trim() || id });
  E.set(id, { draft, saved: null }); V.sel = id; renderAll();
});

function renderAll() { renderList(); renderDetail(); updateBar(); }

$('search').addEventListener('input', () => { V.filter = $('search').value; renderList(); });
$('saveAll').addEventListener('click', saveAll);
$('revertAll').addEventListener('click', revertAll);
$('newSkill').addEventListener('click', openNew);
$('download').addEventListener('click', download);
addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); document.activeElement?.blur?.(); saveAll(); } });
addEventListener('beforeunload', ev => { if (dirtyList().length) { ev.preventDefault(); ev.returnValue = ''; } });
/* a save from here, another tab or a hand edit of a file: take the new numbers for every skill not being changed */
onSkillsChange(() => { syncFromRegistry(); renderAll(); });
/* new unit data changes who has each skill and what it comes to for them */
onUnitsChange(() => renderAll());
/* ?skill=<id> opens that skill's card */
const asked = new URLSearchParams(location.search).get('skill');
syncFromRegistry(); if (asked && E.has(asked)) V.sel = asked;
renderAll();
