import { CHUNK, renderChunk } from './ground.js';

/* ================= town view: the ground painter =================
   Paints CHUNK-square pieces of the town view's ground off the main thread, so walking never waits on a piece coming
   into view. It is told the surface (fieldOf, less its cache) each time the storeys shown change, then asked for one
   piece at a time. Each reply carries the surface's number, so a piece of a surface since replaced is dropped, and
   the piece as an ImageBitmap where the worker can make one (else its RGBA), with its depth buffer. */
let F = null, gen = -1;
self.onmessage = async ({ data }) => {
  if (data.field) { F = { ...data.field, cells: new Map() }; gen = data.gen; return; }
  const { cx, cy } = data, g = gen;
  if (data.gen !== g || !F) { self.postMessage({ gen: data.gen, cx, cy, stale: true }); return; }
  const r = renderChunk(F, cx * CHUNK, cy * CHUNK), empty = !r.depth.some(v => v);
  let bitmap = null;
  try { if (!empty && typeof createImageBitmap === 'function') bitmap = await createImageBitmap(new ImageData(r.px, CHUNK, CHUNK)); } catch { bitmap = null; }
  self.postMessage({ gen: g, cx, cy, empty, depth: r.depth, bitmap, px: bitmap ? null : r.px }, [r.depth.buffer, bitmap || r.px.buffer]);
};
