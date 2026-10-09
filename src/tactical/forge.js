import { OUTLINE, hexRgb, ramp } from '../characters/pixels.js';

/* ================= tactical view: the pixel forge =================
   A tiny renderer for pieces drawn as pixel art at the tactical camera's scale, with no DOM, so Node draws the
   sheet and tests can check it. A piece is modelled in its footprint's own coordinates (x, y in tiles, 0..w and
   0..d; z in art pixels above the ground) out of triangles, quads and screen-space blobs. Every pixel goes
   through a depth test and a material shader that picks a colour from a five-step ramp (characters/pixels.js),
   dithered on a Bayer grid where light falls between two steps. Finishing adds the line work the figures and
   tiles have: an ink outline round the silhouette (lighter where the light falls), a dark contour where one part
   stands in front of another, and a dithered contact shadow on the footprint.

   The projection is the scene's: P(x, y, z) = [ox + (x - y) * 16, oy + (x + y) * 8 - z], with (ox, oy) the
   footprint's top corner in the image. Depth grows toward the viewer. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (i, j) => BAYER[(j & 3) * 4 + (i & 3)];
/* light from the upper left and in front, in a metric where a tile is TILE pixels wide */
const TILE = 20, LIGHT = (() => { const v = [0.32, 0.62, 1]; const n = Math.hypot(...v); return v.map(c => c / n); })();
const ink = OUTLINE ? hexRgb(OUTLINE) : [43, 33, 22];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ramps = new Map();
/* a colour's five steps as rgb triplets, brightest first, plus [5] the deepest pushed toward ink (for crevices) */
function R(hex) { let r = ramps.get(hex); if (!r) { r = ramp(hex).map(hexRgb); r.push(mix(r[4], ink, 0.45)); ramps.set(hex, r); } return r; }
/* a ramp step for a fractional tone, dithered */
const tone = (r, t, i, j) => r[Math.max(0, Math.min(4, Math.floor(t + bayer(i, j))))];
/* how much light a surface with world normal n (z in pixels, x and y in tiles) catches: 0 dark .. 1 bright */
function lum(nx, ny, nz) { const a = nx * TILE, b = ny * TILE, c = nz, l = Math.hypot(a, b, c) || 1; return Math.max(0, (a * LIGHT[0] + b * LIGHT[1] + c * LIGHT[2]) / l); }
/* the fractional tone a surface takes from its light: tops about 1, the lit wall 2, the shaded wall 3 */
const toneOf = l => 0.35 + (1 - l) * 3.1;
const hash = (a, b = 0, c = 0) => { let h = Math.imul((a | 0) + 0x9e37, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x1656, 0x27d4eb2f); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };

function forge(w, d, top, margin = 26) {
  const W = (w + d) * 16 + margin * 2, ox = d * 16 + margin, oy = Math.ceil(top) + margin, H = oy + (w + d) * 8 + 12;
  const rgb = new Uint8ClampedArray(W * H * 3), dep = new Float32Array(W * H).fill(-Infinity), part = new Int16Array(W * H).fill(-1), lit = new Uint8Array(W * H);
  const P = (x, y, z) => [ox + (x - y) * 16, oy + (x + y) * 8 - z], depth = (x, y, z) => (x + y) * 16 + z;
  let clipped = 0;
  const F = {
    w, d, W, H, ox, oy, P, depth,
    put(i, j, z, c, p) {
      if (i < 0 || j < 0 || i >= W || j >= H) { clipped++; return; }
      const u = j * W + i; if (z < dep[u]) return;
      dep[u] = z; part[u] = p; rgb[u * 3] = c[0]; rgb[u * 3 + 1] = c[1]; rgb[u * 3 + 2] = c[2]; lit[u] = c.glow ? 1 : 0;
    },
    /* a triangle of world points with a parameter pair per corner (default (0,0) (1,0) (1,1)); shade(p, a, b, i, j)
       returns an rgb triplet or null for a hole */
    tri(A, B, C, shade, p, pa = [0, 0], pb = [1, 0], pc = [1, 1]) {
      const a = P(...A), b = P(...B), c = P(...C), area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-9) return;
      const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x1 = Math.ceil(Math.max(a[0], b[0], c[0])), y0 = Math.floor(Math.min(a[1], b[1], c[1])), y1 = Math.ceil(Math.max(a[1], b[1], c[1]));
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
        const px = i + 0.5, py = j + 0.5;
        const wa = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area, wb = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area, wc = 1 - wa - wb;
        if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
        const q = [A[0] * wa + B[0] * wb + C[0] * wc, A[1] * wa + B[1] * wb + C[1] * wc, A[2] * wa + B[2] * wb + C[2] * wc];
        const col = shade(q, pa[0] * wa + pb[0] * wb + pc[0] * wc, pa[1] * wa + pb[1] * wb + pc[1] * wc, i, j); if (col) F.put(i, j, depth(...q), col, p);
      }
    },
    /* a planar quad A B C D (in order round it), parameters a along A->B and b along A->D */
    quad(A, B, C, D, shade, p) { F.tri(A, B, C, shade, p, [0, 0], [1, 0], [1, 1]); F.tri(A, C, D, shade, p, [0, 0], [1, 1], [0, 1]); },
    /* a box's three visible faces; sh = { x: (p, a, b, i, j), y, top } shaders, a along the face, b up it */
    box(x0, y0, x1, y1, z0, z1, sh, p) {
      if (sh.y) F.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], sh.y, p);
      if (sh.x) F.quad([x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], sh.x, p);
      if (sh.top) F.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sh.top, p);
    },
    /* a surface of revolution about (cx, cy): radius r(t) tiles at height z(t) px for t 0..1, seg facets round.
       shade(p, ang (0..1 round), t, i, j, n) gets the smooth normal n */
    lathe(cx, cy, prof, shade, p, seg = 28) {
      const S = 12, pt = (k, s) => { const [r, z] = prof(s / S), a = (k / seg) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]; };
      for (let s = 0; s < S; s++) for (let k = 0; k < seg; k++) {
        /* only the facets that can face the viewer */
        const am = ((k + 0.5) / seg) * Math.PI * 2; if (Math.cos(am) + Math.sin(am) < -0.35) continue;
        const sh = (q, a, b, i, j) => {
          const ang = (k + a) / seg, t = (s + b) / S, [r0, z0] = prof(Math.max(0, t - 0.02)), [r1, z1] = prof(Math.min(1, t + 0.02)), th = ang * Math.PI * 2;
          /* the outward normal of the profile, from its tangent (dr tiles, dz px) */
          const dz = z1 - z0, dr = r1 - r0, nh = dz / TILE;
          return shade(q, ang, t, i, j, [Math.cos(th) * nh, Math.sin(th) * nh, -dr * TILE]);
        };
        F.quad(pt(k, s), pt(k + 1, s), pt(k + 1, s + 1), pt(k, s + 1), sh, p);
      }
    },
    /* a rounded mass in screen space: an ellipse rx × ry px about P(x, y, z), bulging toward the viewer. edge(ang)
       scales the radius round its rim (for leafy or ragged outlines). shade(n, i, j, dx, dy) gets n in screen
       terms (x right, y down, z toward the viewer). */
    blob(x, y, z, rx, ry, shade, p, edge = null, bulge = 1) {
      const [sx, sy] = P(x, y, z), d0 = depth(x, y, z);
      for (let j = Math.floor(sy - ry * 1.3); j <= Math.ceil(sy + ry * 1.3); j++) for (let i = Math.floor(sx - rx * 1.3); i <= Math.ceil(sx + rx * 1.3); i++) {
        let nx = (i + 0.5 - sx) / rx, ny = (j + 0.5 - sy) / ry; const k = edge ? edge(Math.atan2(ny, nx)) : 1, r2 = (nx * nx + ny * ny) / (k * k);
        if (r2 > 1) continue;
        nx /= k; ny /= k; const nz = Math.sqrt(Math.max(0, 1 - r2)), col = shade([nx, ny, nz], i, j, i + 0.5 - sx, j + 0.5 - sy);
        if (col) F.put(i, j, d0 + nz * rx * bulge, col, p);
      }
    },
    /* a single pixel at a world point, nudged toward the viewer so it sits on what it decorates */
    dot(x, y, z, c, p, dz = 0.5, di = 0, dj = 0) { const [sx, sy] = P(x, y, z); F.put(Math.floor(sx) + di, Math.floor(sy) + dj, depth(x, y, z) + dz, c, p); },
    /* a line of pixels in screen space from world point A to B, thickness 1, drawn in front */
    line(A, B, c, p, dz = 0.5) {
      const a = P(...A), b = P(...B), n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))) || 1;
      for (let k = 0; k <= n; k++) { const t = k / n; F.put(Math.floor(a[0] + (b[0] - a[0]) * t), Math.floor(a[1] + (b[1] - a[1]) * t), depth(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t) + dz, typeof c === 'function' ? c(t) : c, p); }
    },
    /* the finished sprite: { w, h, px (RGBA), ox, oy, clipped } */
    finish({ shadow = true, inset = 0.06 } = {}) {
      const px = new Uint8ClampedArray(W * H * 4), solid = u => part[u] >= 0;
      for (let u = 0; u < W * H; u++) if (solid(u)) { px.set([rgb[u * 3], rgb[u * 3 + 1], rgb[u * 3 + 2], 255], u * 4); }
      /* contours: a pixel with a nearer part right beside it (or a big step in depth) is inked */
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const u = j * W + i; if (!solid(u) || lit[u]) continue;
        for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
          const v = jj * W + ii; if (!solid(v)) continue;
          const step = dep[v] - dep[u];
          if ((part[v] !== part[u] && step > 3) || step > 14) { const c = mix([rgb[u * 3], rgb[u * 3 + 1], rgb[u * 3 + 2]], ink, 0.62); px.set([c[0], c[1], c[2]], u * 4); break; }
        }
      }
      /* the outline outside the silhouette, lighter where it faces the light (above and to the left) */
      const out = [];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const u = j * W + i; if (solid(u)) continue;
        const nb = [[i + 1, j, 1], [i, j + 1, 1], [i - 1, j, 0], [i, j - 1, 0]].filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H && solid(b * W + a));
        if (!nb.length) continue;
        const [a, b] = nb[0], v = b * W + a, base = [rgb[v * 3], rgb[v * 3 + 1], rgb[v * 3 + 2]], litSide = nb.every(n => n[2] === 1);
        out.push([u, mix(mix(base, [0, 0, 0], 0.25), ink, litSide ? 0.72 : 0.86)]);
      }
      for (const [u, c] of out) px.set([c[0], c[1], c[2], 255], u * 4);
      if (shadow) for (let j = 0; j < (w + d) * 8; j++) for (let i = -d * 16; i < w * 16; i++) {
        const fx = (i / 16 + j / 8) / 2, fy = (j / 8 - i / 16) / 2; if (fx < inset || fy < inset || fx > w - inset || fy > d - inset || (i + j) % 2) continue;
        const u = ((oy + j) * W + ox + i) * 4; if (px[u + 3]) continue; px.set([43, 30, 16, 72], u);
      }
      return { w: W, h: H, px, ox, oy, clipped };
    }
  };
  return F;
}

export { LIGHT, R, TILE, bayer, forge, hash, lum, mix, tone, toneOf };
