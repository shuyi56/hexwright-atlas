import { FACES, SIZE } from './sprite.js';

/* ================= character sprites: canvas drawing ================= */
/* one frame as a SIZE×SIZE canvas; clear pixels stay transparent */
function renderFrame(s, face, k) {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d'), im = g.createImageData(SIZE, SIZE), fr = s.frames[face][k];
  for (let u = 0; u < fr.length; u++) {
    const v = fr[u]; if (!v || !s.pal[v - 1]) continue; const h = s.pal[v - 1];
    im.data[u * 4] = parseInt(h.slice(1, 3), 16); im.data[u * 4 + 1] = parseInt(h.slice(3, 5), 16); im.data[u * 4 + 2] = parseInt(h.slice(5, 7), 16); im.data[u * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}
/* frames of library sprites are cached by id and revision, which the library bumps on every save */
const cache = new Map();
function frameCanvas(s, face, k) {
  const key = `${s.id}|${s.rev}|${FACES.indexOf(face)}|${k}`; let c = cache.get(key);
  if (!c) { if (cache.size > 400) cache.clear(); c = renderFrame(s, face, k); cache.set(key, c); }
  return c;
}
/* draw a frame with its bottom centre at (x, y), each sprite pixel being px drawing units wide */
function drawFrame(g, can, x, y, px) {
  g.save(); g.imageSmoothingEnabled = false; g.drawImage(can, x - SIZE * px / 2, y - SIZE * px, SIZE * px, SIZE * px); g.restore();
}
/* square preview of a sprite for palettes and lists */
function spriteThumb(s, size = 60, face = 'se', k = 0) {
  const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = size * dpr;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(renderFrame(s, face, k), 0, 0, size * dpr, size * dpr); return c;
}

export { drawFrame, frameCanvas, renderFrame, spriteThumb };
