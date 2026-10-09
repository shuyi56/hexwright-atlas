import { ASSET_BY_ID, footprint } from '../tiles/index.js';
import { DESIGNS as BUILT } from './buildings.js';
import { forge } from './forge.js';
import { DESIGNS as GROWN } from './foliage.js';

/* ================= tactical view: pieces drawn for the close camera =================
   The buildings (tactical/buildings.js) and the trees and plants (tactical/foliage.js) designed as pixel art for
   the tactical view, by asset id. pieceImage draws one placed piece (as the scene holds it: turned with the view,
   walls linked) into { w, h, px, ox, oy }, with (ox, oy) its footprint's top corner. Pieces with no design here
   (the smaller props and the furniture) are drawn by tactical/render.js from the tile set's own drawings. */
const DESIGNS = Object.assign({}, BUILT, GROWN);
const hasDesign = id => !!DESIGNS[id];
/* how far above its footprint a designed piece can reach, in art pixels (for culling and the camera's limits) */
const designTop = id => (DESIGNS[id] ? DESIGNS[id].top + 30 : 0);
/* the piece's variant, bucketed so near-identical variants share one drawing */
const bucket = v => Math.round((v ?? 0.5) * 20) / 20;
function pieceKey(o, clim) { return `${o.id}|${o.face || 0}|${bucket(o.v)}|${o.links ? o.links.join('') : ''}|${clim}`; }
function pieceImage(o, clim = 'temperate') {
  const D = DESIGNS[o.id], a = ASSET_BY_ID[o.id], [w, d] = footprint(o);
  const axis = w > d ? 'x' : w < d ? 'y' : ((o.face || 0) % 2 ? 'y' : 'x');
  const F = forge(w, d, D.top + 30);
  D.draw(F, { id: o.id, w, d, face: o.face || 0, v: bucket(o.v), links: o.links || null, clim, axis, h: a.h });
  return F.finish({ shadow: true, inset: a.group === 'Nature' ? 0.22 : 0.06 });
}

export { DESIGNS, designTop, hasDesign, pieceImage, pieceKey };
