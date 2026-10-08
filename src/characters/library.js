import { cleanSpec, fromSpec, newId } from './custom.js';
import { byId } from './roster.js';

/* ================= character sprites: the custom character library =================
   The characters made in the character maker, kept in the browser as specs (custom.js) and shared by the maker,
   the tile editor and the automation API. A map carries the specs of the custom characters standing on it
   (editor/model.js), so a saved map opens anywhere. Without storage (Node, or storage blocked) the library lives
   in memory. Custom ids always start with 'custom-', so they never shadow anyone in the roster. */
const KEY = 'hexwright.characters.v1', LIB = new Map(), listeners = new Set();
let ready = false;
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
function persist() { try { store()?.setItem(KEY, JSON.stringify([...LIB.values()].map(c => c.spec))); } catch { /* storage unavailable: kept in memory */ } }
/* a custom character from a spec */
function make(J) { const s = cleanSpec(J); if (!s.id.startsWith('custom-')) s.id = newId(); return fromSpec(s); }
function init() {
  if (ready) return; ready = true;
  let raw = null; try { raw = store()?.getItem(KEY); } catch { /* storage unavailable */ }
  try { if (raw) for (const J of JSON.parse(raw)) { const c = make(J); LIB.set(c.id, c); } } catch { /* unreadable: start empty */ }
}
const notify = () => { for (const f of listeners) f(); };
const onChange = f => { listeners.add(f); return () => listeners.delete(f); };
const list = () => { init(); return [...LIB.values()]; };
const get = id => { init(); return LIB.get(id) || null; };
/* store a spec (a new character, or a change to one with the same id) and return its character */
function save(spec) { init(); const c = make(spec); LIB.set(c.id, c); persist(); notify(); return c; }
function remove(id) { init(); const had = LIB.delete(id); if (had) { persist(); notify(); } return had; }
/* add specs that came with a map, keeping any the library already has under the same id */
function merge(specs) {
  init(); let n = 0;
  for (const J of specs || []) { if (!J || typeof J.id !== 'string' || !J.id.startsWith('custom-') || LIB.has(J.id)) continue; const c = make(J); LIB.set(c.id, c); n++; }
  if (n) { persist(); notify(); }
  return n;
}
/* anyone who can stand on a map: the roster, then the library */
const characterById = id => byId(id) || get(id);

export { characterById, get, list, merge, onChange, remove, save };
