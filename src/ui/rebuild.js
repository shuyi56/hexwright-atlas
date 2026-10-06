import { renderBase } from '../render/base.js';
import { S, state, veil } from './state.js';
import { requestDraw } from './draw.js';

/* ================= redraw the inked base map (the grid toggle) =================
   Lives apart from main.js on purpose: nothing should import the entry module, because if the dev server
   ever serves it under two URLs both copies run, registering every listener twice (New realm generated twice). */
function rebuildBase() {
  if (!state.map) return; veil.hidden = false; veil.textContent = 'Inking the map…';
  setTimeout(() => { state.baseImg = renderBase(state.map, S, state.showGrid); veil.hidden = true; requestDraw(); }, 30);
}

export { rebuildBase };
