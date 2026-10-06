import { cloneSprite, spriteFromJSON, spriteToJSON, starters } from './sprite.js';

/* ================= the character library =================
   Every sprite the user has drawn, kept in the browser and shared by the sprite editor and the tile
   editor. Maps embed the sprites they use (see model.js), so a saved map opens anywhere. */
const KEY = 'hexwright.sprites.v2', OLD_KEY = 'hexwright.sprites.v1', LIB = new Map(), listeners = new Set();
let ready = false;

function persist() { try { localStorage.setItem(KEY, JSON.stringify([...LIB.values()].map(spriteToJSON))); } catch { /* storage unavailable: sprites stay in memory */ } }
function init() {
  if (ready) return; ready = true;
  let raw = null; try { raw = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  /* first run on this version: keep the user's own characters from the pixel-art release, refresh the starters */
  const migrate = raw == null; if (migrate) { try { raw = localStorage.getItem(OLD_KEY); } catch { /* nothing saved */ } }
  if (migrate) for (const s of starters()) LIB.set(s.id, s);
  try { if (raw) for (const J of JSON.parse(raw)) { if (migrate && String(J.id).startsWith('starter-')) continue; try { const s = spriteFromJSON(J); LIB.set(s.id, s); } catch { /* skip a damaged entry */ } } } catch { /* unreadable */ }
  if (!LIB.size) for (const s of starters()) LIB.set(s.id, s);
  if (migrate) persist();
}
const notify = () => { for (const f of listeners) f(); };
const onChange = f => { listeners.add(f); return () => listeners.delete(f); };
const list = () => { init(); return [...LIB.values()]; };
const get = id => { init(); return LIB.get(id) || null; };
/* store a copy; bumping rev tells the drawing cache the pixels changed */
function save(s) { init(); const c = cloneSprite(s); c.rev = (LIB.get(s.id)?.rev || 0) + 1; LIB.set(c.id, c); persist(); notify(); return c; }
function remove(id) { init(); const had = LIB.delete(id); if (had) { persist(); notify(); } return had; }
/* add sprites that came with a map without overwriting ones the user already has under the same id */
function merge(sprites) { init(); let n = 0; for (const s of sprites) if (!LIB.has(s.id)) { LIB.set(s.id, s); n++; } if (n) { persist(); notify(); } return n; }

export { get, list, merge, onChange, remove, save };
