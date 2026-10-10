/* ================= the module rail =================
   One strip down the left edge (along the bottom on phones) that every page shares: it names each part of the
   app and moves between them. The atlas page (ui/shell.js) and the unit data page (units/main.js) mount it and
   say what a click does: the atlas page opens the module in place, the unit data page goes back to the atlas
   page with the module in the address (index.html#editor). */

/* [id, label, longer title, group, glyph] */
const MODULES = [
  ['atlas', 'Atlas', 'Realm atlas: the hex map of the realm and its cities', 'view', '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 8.2l3.3 1.9v3.8L12 15.8l-3.3-1.9v-3.8z"/>'],
  ['scenes', 'Scenes', 'Scenes: the bundled maps, ready to walk or play', 'view', '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 16l5-5 4 4 3-3 5 5"/><circle cx="16" cy="9" r="1.4"/>'],
  ['tactical', 'Tactical', 'Tactical view: move and fight on the editor’s map', 'view', '<path d="M5 19L19 5"/><path d="M15 5h4v4"/><path d="M5 5l14 14"/><path d="M5 15v4h4"/>'],
  ['town', 'Town', 'Town view: walk the editor’s map from above', 'view', '<path d="M4 20V11l5-4 5 4v9"/><path d="M14 20v-6l3-2.5 3 2.5v6"/><path d="M8 20v-4h2v4"/><path d="M3 20h18"/>'],
  ['editor', 'Map editor', 'Map editor: paint ground, place buildings and characters', 'make', '<path d="M4 20l1.2-4.4L15.6 5.2a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.4 18.8z"/><path d="M13.5 7.3l3.2 3.2"/>'],
  ['characters', 'Characters', 'Character maker: build a figure from clothes, hair and gear', 'make', '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.6-4 3.4-6.5 7-6.5s6.4 2.5 7 6.5"/>'],
  ['units', 'Unit data', 'Unit data: stats for every character and enemy', 'data', '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 14.5h16M10 4v16"/>'],
];
const GROUPS = { view: 'view', make: 'make', data: 'data' };

/* Build the rail into the page. go(id) runs when a module is picked; returns setActive(id) to mark the one showing. */
function mountRail(go, active = 'atlas', { skip = [] } = {}) {
  const nav = document.createElement('nav'); nav.className = 'rail'; nav.id = 'rail'; nav.setAttribute('aria-label', 'Modules');
  const mark = document.createElement('a'); mark.className = 'rail-mark'; mark.href = './index.html'; mark.title = 'Hexwright Atlas'; mark.setAttribute('aria-label', 'Hexwright Atlas');
  mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M12 7v10M7.7 9.5l8.6 5M16.3 9.5l-8.6 5"/></svg>';
  mark.addEventListener('click', e => { e.preventDefault(); go('atlas'); });
  nav.appendChild(mark);
  const list = document.createElement('div'); list.className = 'rail-list'; nav.appendChild(list);
  let group = '', n = 0;
  for (const [id, label, title, g, glyph] of MODULES) {
    if (skip.includes(id)) continue;
    if (g !== group) { group = g; const h = document.createElement('span'); h.className = 'rail-group'; h.textContent = GROUPS[g]; h.setAttribute('aria-hidden', 'true'); list.appendChild(h); }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rail-item'; b.dataset.module = id;
    n++; b.title = `${title} (Alt+${n})`; b.setAttribute('aria-keyshortcuts', `Alt+${n}`);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${glyph}</svg><span>${label}</span>`;
    b.addEventListener('click', () => go(id));
    list.appendChild(b);
  }
  document.body.prepend(nav); document.body.classList.add('has-rail');
  /* Alt+1…7 jumps to a module from anywhere, even mid-edit (the tools' own keys never use Alt) */
  const items = [...list.querySelectorAll('.rail-item')];
  document.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const k = /^Digit([1-9])$/.exec(e.code); const b = k && items[+k[1] - 1]; if (!b) return;
    e.preventDefault(); go(b.dataset.module);
  });
  const setActive = id => { for (const b of items) { const on = b.dataset.module === id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); } };
  setActive(active);
  return setActive;
}

const MODULE_IDS = MODULES.map(m => m[0]);
export { MODULE_IDS, mountRail };
