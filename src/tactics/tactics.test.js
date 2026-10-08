import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { encodePNG } from '../../tools/png.mjs';
import { BASE, BODY_TYPES, measure, profile } from './body.js';
import { GLYPH_H, GLYPH_W, glyph } from './font.js';
import * as parts from './parts.js';
import { H, W, finish, frameBuf, hexRgb, ramp, stamp } from './pixels.js';
import { BODIES, POSES, ROSTER, VIEWS, frame, palette, render } from './roster.js';
import { buildSheet } from './sheet.js';

const lum = hex => { const [r, g, b] = hexRgb(hex); return r * 0.3 + g * 0.59 + b * 0.11; };

test('every shared part is a rectangle of rows', () => {
  const each = (v, name) => {
    if (v && Array.isArray(v.rows)) assert.equal(new Set(v.rows.map(r => r.length)).size, 1, name);
    else if (Array.isArray(v)) v.forEach((p, i) => each(p, `${name}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, p] of Object.entries(v)) each(p, `${name}.${k}`);
  };
  for (const [name, v] of Object.entries(parts)) if (typeof v !== 'function') each(v, name);
});
test('every job in every build draws all its frames inside the frame, in colours it defines', () => {
  assert.equal(ROSTER.length, 9); assert.equal(new Set(ROSTER.map(j => j.id)).size, ROSTER.length);
  for (const job of ROSTER) {
    const pal = palette(job); assert.ok(BODY_TYPES[job.body], `${job.id} has a build`);
    for (const b of BODIES) for (const v of VIEWS) for (let k = 0; k < POSES; k++) {
      const buf = frame(job, v, k, b), used = new Set(buf.mat.filter(Boolean));
      assert.equal(buf.clipped, 0, `${job.id} ${b} ${v} ${k} runs off the frame`);
      for (const m of used) assert.ok(pal[m], `${job.id} uses "${m}" without a colour`);
      assert.ok(used.size > 5, `${job.id} ${b} ${v} ${k}`);
    }
  }
});
/* the opaque extent of a frame: [left, right, top, bottom] */
const extent = buf => { let l = W, r = -1, t = 99, b = -1; buf.mat.forEach((m, u) => { if (!m) return; const x = u % W, y = (u / W) | 0; l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }); return [l, r, t, b]; };
test('the builds differ in height and breadth and all stand on the same ground', () => {
  const plain = ROSTER.find(j => j.id === 'squire'), size = b => extent(frame(plain, 'front', 0, b));
  const [sl, st, sk, tl] = ['slim', 'standard', 'stocky', 'tall'].map(size);
  for (const e of [sl, st, sk, tl]) assert.equal(e[3], BASE);
  assert.ok(tl[2] < st[2] && st[2] < sk[2], 'tall stands highest, stocky lowest');
  const torso = b => { const [l, r] = profile(BODY_TYPES[b]).rows[2]; return r - l + 1; };
  assert.ok(torso('slim') < torso('standard') && torso('standard') < torso('stocky'));
});
test('arms hang clear of the body, end in a hand, and swing from the shoulder in a stride', () => {
  for (const b of BODIES) for (const v of VIEWS) {
    const bt = BODY_TYPES[b], { rows } = profile(bt), m = measure(b, v, 0);
    const [hl, hr] = rows[bt.torso - 3];                                         /* the torso beside the hands */
    assert.ok(m.at.handNear[0] > hr, `${b} ${v}: near hand clear of the body`);
    assert.ok(m.at.handFar[0] < hl, `${b} ${v}: far hand clear of the body`);
    assert.ok(m.parts.armNear.rows.some(r => r.includes('K')), `${b} ${v}: a hand`);
    const [a1, a2] = [1, 2].map(k => measure(b, v, k).at.handNear);
    assert.notEqual(a1[0], a2[0], `${b} ${v}: the near arm swings`);
    assert.equal(measure(b, v, 1).top, m.top + 1, `${b} ${v}: the shoulder rides with the body`);
  }
});
test('every weapon stays in view in its fist on every build, in both views and every pose', () => {
  const shown = (j, v, k, b) => frame(j, v, k, b).mat;
  for (const job of ROSTER.filter(j => j.weapon)) for (const b of BODIES) for (const v of VIEWS) for (let k = 0; k < POSES; k++) {
    const a = shown(job, v, k, b), c = shown({ ...job, weapon: null }, v, k, b);
    const seen = a.filter((m, u) => m !== c[u]).length;
    assert.ok(seen >= 6, `${job.id} ${b} ${v} ${k}: only ${seen} pixels of its weapon show`);
    const [hx, hy] = measure(b, v, k, job.outfit).at[v === 'front' ? 'handFar' : 'handNear'], made = job.weapon[v].make({ hand: [hx, hy], dir: hx < 16 ? -1 : 1 });
    const near = made.rows.some((r, j) => [...r].some((ch, i) => ch !== '.' && Math.abs(made.x + i - hx) <= 2 && Math.abs(made.y + j - hy) <= 3));
    assert.ok(near, `${job.id} ${b} ${v} ${k}: the weapon is held in the fist`);
  }
});
test('no weapon shows through hair, and the valkyrie\'s spear keeps clear of her helm', () => {
  const hair = m => m === 'H' || m === 'Q' || m === 'I';
  for (const job of ROSTER.filter(j => j.weapon)) for (const b of BODIES) for (const v of VIEWS) for (let k = 0; k < POSES; k++) {
    const f = frame(job, v, k, b).mat, g = frame({ ...job, weapon: null }, v, k, b).mat;
    for (let u = 0; u < W * H; u++) {
      if (!f[u] || f[u] === g[u]) continue;                                     /* a pixel of the weapon that shows */
      const x = u % W;
      assert.ok(!(x > 0 && x < W - 1 && hair(f[u - 1]) && hair(f[u + 1])), `${job.id} ${b} ${v} ${k}: weapon between strands at ${x},${(u / W) | 0}`);
      if (job.id === 'valkyrie') for (const d of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) assert.notEqual(f[u + d], 'F', `${b} ${v} ${k}: the spear touches a wing`);
    }
  }
});
test('a staff or polearm is carried steady, and a staff stands on the ground', () => {
  for (const job of ROSTER.filter(j => j.outfit.steady)) for (const b of BODIES) {
    const hands = [0, 1, 2].map(k => measure(b, 'front', k, job.outfit).at.handFar[0]);
    assert.equal(new Set(hands).size, 1, `${job.id} ${b}: the staff hand does not swing`);
    if (!job.weapon.grounded) continue;
    const ground = j => frame(j, 'front', 0, b).mat.slice(BASE * W, (BASE + 1) * W).filter(Boolean).length;
    assert.ok(ground(job) > ground({ ...job, weapon: null }), `${job.id} ${b}: the staff reaches the ground`);
  }
});
test('the strides move the figure and the views differ', () => {
  for (const job of ROSTER) {
    const f = render(job), same = (a, b) => a.every((v, i) => v === b[i]);
    assert.ok(!same(f.front[0], f.front[1]) && !same(f.front[1], f.front[2]) && !same(f.front[0], f.back[0]), job.id);
  }
});
test('a ramp runs from highlight to deep shadow around its base colour', () => {
  for (const c of ['#e8b890', '#4f66a6', '#c3cad0', '#6d915c']) {
    const r = ramp(c); assert.equal(r.length, 5); assert.equal(r[2], c);
    for (let i = 1; i < 5; i++) assert.ok(lum(r[i]) < lum(r[i - 1]), `${c} step ${i}`);
  }
});
test('creases shade darker and every figure gets an outline', () => {
  const buf = frameBuf(); stamp(buf, ['AAAA', 'AaAA', 'AAAA'], 10, 10, 0);
  const px = finish(buf, { A: '#a08060' }), at = (x, y) => [...px.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
  assert.ok(at(11, 11)[0] < at(12, 11)[0]); assert.equal(at(9, 11)[3], 255); assert.equal(at(8, 11)[3], 0); assert.equal(at(9, 9)[3], 0);
});
test('the outline is solid ink all round every figure', () => {
  for (const job of ROSTER) for (const v of VIEWS) {
    const buf = frame(job, v, 0), px = render(job)[v][0];
    for (let u = 0; u < W * H; u++) {
      if (buf.mat[u] !== null || !px[u * 4 + 3]) continue;
      const l = px[u * 4] * 0.3 + px[u * 4 + 1] * 0.59 + px[u * 4 + 2] * 0.11;
      assert.ok(l < 75, `${job.id} ${v}: outline pixel ${u % W},${(u / W) | 0} is too light (${l | 0})`);
    }
  }
});
test('faces are solid shapes: one lit tone and one shadow tone of skin', () => {
  for (const job of ROSTER) for (const v of VIEWS) {
    const buf = frame(job, v, 0), px = render(job)[v][0], top = measure(job.body, v, 0, job.outfit).at.head[1], tones = new Set();
    for (let u = 0; u < W * H; u++) { const y = (u / W) | 0; if (buf.mat[u] === 'K' && y >= top && y < top + 14) tones.add(px.slice(u * 4, u * 4 + 3).join()); }
    assert.ok(tones.size <= 3, `${job.id} ${v}: ${tones.size} skin tones in the face`);       /* lit, shadow, and ink where a part crosses it */
    if (job.id === 'squire' && v === 'front') assert.equal(tones.size, 2);
  }
});
test('every face shows both whole eyes, whatever hair, headgear or weapon is beside it', () => {
  for (const job of ROSTER.filter(j => !j.head)) for (const b of BODIES) for (let k = 0; k < POSES; k++) {
    const m = frame(job, 'front', k, b).mat, n = c => m.filter(x => x === c).length;
    assert.deepEqual([n('E'), n('W')], [6, 2], `${job.id} ${b} ${k}: lids and pupils, and whites`);
  }
});
test('hair is drawn in locks with strand lines and a sheen, front and back', () => {
  for (const hair of [parts.HAIR_SHORT, parts.HAIR_LONG, parts.HAIR_BUN, parts.HAIR_PONYTAIL]) for (const v of VIEWS) {
    const all = hair[v].rows.join('');
    assert.ok((all.match(/Q/g) || []).length >= 10 && (all.match(/I/g) || []).length >= 4, v);
  }
});
test('the archer and valkyrie wear different hairstyles: a ponytail and a low bun', () => {
  const job = id => ROSTER.find(j => j.id === id), archer = job('archer'), valkyrie = job('valkyrie');
  assert.equal(archer.hair, parts.HAIR_PONYTAIL); assert.equal(valkyrie.hair, parts.HAIR_BUN);
  /* the ponytail stays behind the head in front, nothing sticking out to the side, and falls over the quiver
     behind */
  const shown = (j, v) => frame(j, v, 0).mat.filter(m => m === 'H').length, bare = j => ({ ...j, hair: { ...j.hair, over: null } });
  assert.equal(shown(archer, 'front'), shown({ ...archer, hair: parts.HAIR_SHORT }, 'front'));
  assert.ok(shown(archer, 'back') > shown(bare(archer), 'back'));
  /* the bun keeps tight to the head on every build: no hair beyond the head's edge on the spear's side, and from
     behind its band and knot show at the nape */
  for (const b of BODIES) for (const v of VIEWS) {
    const f = frame(valkyrie, v, 0, b).mat, [hx] = measure(b, v, 0, valkyrie.outfit).at.head, spear = v === 'front' ? -1 : 1;
    f.forEach((m, u) => { if (m === 'H' || m === 'Q' || m === 'I') assert.ok(spear < 0 ? u % W >= hx - 1 : u % W <= hx + 14, `${b} ${v}: hair out toward the spear at ${u % W}`); });
    if (v === 'back') assert.ok(f.filter(m => m === 'J').length >= 3);
  }
});
test('the font has a full 5×7 glyph for each label character', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-·') { const g = glyph(ch); assert.ok(g.length > 0, ch); for (const [x, y] of g) assert.ok(x < GLYPH_W && y < GLYPH_H); }
});
test('the sheet is a valid PNG of the expected size', () => {
  const s = buildSheet(ROSTER.slice(0, 2), 2); assert.equal(s.rgba.length, s.width * s.height * 4);
  const png = encodePNG(s.width, s.height, s.rgba);
  assert.deepEqual([...png.subarray(1, 4)], [80, 78, 71]); assert.equal(png.readUInt32BE(16), s.width); assert.equal(png.readUInt32BE(20), s.height);
  const start = png.indexOf('IDAT') + 4, len = png.readUInt32BE(start - 8);
  assert.equal(inflateSync(png.subarray(start, start + len)).length, (s.width * 4 + 1) * s.height);
});
