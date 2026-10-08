import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { encodeAPNG, encodePNG } from '../../tools/png.mjs';
import { INK } from '../render/palette.js';
import { BASE, BODY_TYPES, measure, profile } from './body.js';
import { GLYPH_H, GLYPH_W, glyph } from './font.js';
import * as parts from './parts.js';
import { H, OUTLINE, PAPER, W, finish, frameBuf, hexRgb, ramp, rgbLch, scale2xOutline, stamp, wash } from './pixels.js';
import { BODIES, JOBS, POSES, ROSTER, VIEWS, WALK, byId, frame, palette, render } from './roster.js';
import { APPLIES, CHOICES, COLOURS, cleanSpec, fromSpec } from './custom.js';
import * as hats from './hats.js';
import { TOWNSFOLK } from './townsfolk.js';
import { buildSheet, buildWalk } from './sheet.js';

const lum = hex => { const [r, g, b] = hexRgb(hex); return r * 0.3 + g * 0.59 + b * 0.11; };

test('every shared part is a rectangle of rows', () => {
  const each = (v, name) => {
    if (v && Array.isArray(v.rows)) assert.equal(new Set(v.rows.map(r => r.length)).size, 1, name);
    else if (Array.isArray(v)) v.forEach((p, i) => each(p, `${name}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, p] of Object.entries(v)) each(p, `${name}.${k}`);
  };
  for (const [name, v] of Object.entries({ ...parts, ...hats })) if (typeof v !== 'function') each(v, name);
});
test('every job in every build draws all its frames inside the frame, in colours it defines', () => {
  assert.equal(JOBS.length, 9); assert.equal(TOWNSFOLK.length, 7); assert.equal(ROSTER.length, 16);
  assert.equal(new Set(ROSTER.map(j => j.id)).size, ROSTER.length); for (const j of ROSTER) assert.equal(byId(j.id), j);
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
test('in a stride the arms swing against each other and against the legs, the leading hand forward and up', () => {
  for (const b of BODIES) for (const v of VIEWS) {
    const stand = measure(b, v, 0).at, dir = v === 'front' ? -1 : 1;
    for (const k of [1, 2]) {
      const m = measure(b, v, k).at, dn = m.handNear[0] - stand.handNear[0], df = m.handFar[0] - stand.handFar[0];
      assert.ok(dn && df && Math.sign(dn) === -Math.sign(df), `${b} ${v} ${k}: the hands swing opposite ways (${dn}, ${df})`);
      /* the near arm leads in the first stride, when the far leg steps forward, and the far arm in the second */
      const lead = k === 1 ? 'handNear' : 'handFar', trail = k === 1 ? 'handFar' : 'handNear';
      assert.ok(Math.sign(m[lead][0] - stand[lead][0]) === dir, `${b} ${v} ${k}: the leading hand reaches toward the facing`);
      assert.ok(m[lead][1] < stand[lead][1], `${b} ${v} ${k}: the leading hand rises though the body drops`);
      assert.ok(m[trail][1] <= stand[trail][1], `${b} ${v} ${k}: the trailing hand rises a row with the body's drop`);
    }
    const travel = Math.abs(measure(b, v, 1).at.handNear[0] - measure(b, v, 2).at.handNear[0]);
    assert.ok(travel >= 4, `${b} ${v}: the near hand travels ${travel} pixels between the strides`);
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
test('the black mage wears a robe to the floor, with bell sleeves and a high collar', () => {
  const bm = ROSTER.find(j => j.id === 'blackmage'), wide = rows => rows.map(r => r.replace(/\./g, '').length);
  for (const b of BODIES) for (const v of VIEWS) for (let k = 0; k < POSES; k++) {
    const bt = BODY_TYPES[b], m = measure(b, v, k, bm.outfit), f = frame(bm, v, k, b).mat, at = `${b} ${v} ${k}`;
    /* no trousers and no belt: one garment from the shoulders to the hem */
    assert.ok(!f.includes('P') && !f.includes('L'), `${at}: no trousers or belt`);
    /* the skirt flares as it falls, its hem trimmed and wider than the chest */
    const skirt = wide(m.parts.legs.rows.slice(0, -1));
    assert.ok(skirt[skirt.length - 1] >= bt.chest + 4 && skirt[skirt.length - 1] > skirt[0], `${at}: the robe flares to the hem`);
    assert.ok(f.slice((BASE - 1) * W, BASE * W).filter(c => c === 'C').length >= bt.chest, `${at}: a trimmed hem just off the ground`);
    /* beneath the hem only the toes show: a little of one shoe in a stride, of both standing */
    const toes = f.slice(BASE * W, (BASE + 1) * W).filter(c => c === 'O').length;
    assert.ok(toes >= 2 && toes <= (k ? 3 : 6), `${at}: ${toes} pixels of toe`);
    /* bell sleeves: each arm is two pixels wider at its trimmed mouth than at the upper arm */
    for (const arm of [m.parts.armNear, m.parts.armFar]) {
      const w = wide(arm.rows), mouth = arm.rows.findIndex(r => r.includes('C'));
      assert.ok(w[mouth] >= w[1] + 2, `${at}: a bell sleeve`);
    }
  }
  /* the collar stands over the chin, so less of the shadowed face shows than on the bare head */
  const face = j => frame(j, 'front', 0).mat.filter(c => c === 'Z').length, bare = { ...bm, parts: { ...bm.parts, front: { ...bm.parts.front, mantle: null } } };
  assert.ok(face(bm) < face(bare) - 6);
  assert.equal(frame(bm, 'front', 0).mat.filter(c => c === 'N').length, 4, 'both eyes, two pixels each, still glow above it');
});
test('the townsfolk keep what made each of them recognisable, on every build', () => {
  for (const b of BODIES) {
    const at = id => { const c = byId(id), m = measure(b, 'front', 0, c.outfit), front = frame(c, 'front', 0, b).mat, back = frame(c, 'back', 0, b).mat;
      const below = ch => front.some((x, u) => x === ch && ((u / W) | 0) >= m.at.head[1] + 14), above = ch => front.some((x, u) => x === ch && ((u / W) | 0) < m.at.head[1]);
      return { front, back, below, above, has: ch => front.includes(ch), torso: ch => m.parts.torso.rows.some(r => r.includes(ch)) }; };
    const villager = at('villager'), farmer = at('farmer'), guard = at('guard'), merchant = at('merchant'), monk = at('monk'), healer = at('healer'), noble = at('noble');
    assert.ok(villager.torso('D'), `${b}: the villager's vest`);
    assert.ok(farmer.above('X') && farmer.has('R') && farmer.torso('D'), `${b}: the farmer's straw hat, its band and the overalls`);
    assert.equal(byId('farmer').pal.P, byId('farmer').pal.D, 'the overalls run down the legs');
    assert.ok(guard.above('S') && guard.back.includes('V') && byId('guard').weapon.grounded, `${b}: the guard's kettle helm, cape and spear`);
    assert.ok(merchant.below('H') && merchant.has('U') && merchant.torso('L'), `${b}: the merchant's beard and satchel`);
    assert.ok(monk.above('X') && !monk.back.some(x => x === 'H') && monk.torso('L'), `${b}: the monk's cowl hides his hair, and his rope belt hangs`);
    assert.ok(healer.has('U') && healer.has('R') && healer.below('H'), `${b}: the healer's satchel with its cross, and her long hair`);
    assert.ok(noble.below('H') && noble.has('J') && noble.torso('K') && !noble.has('P'), `${b}: the lady's braid, circlet jewel, neckline and gown`);
  }
});
test('every choice the character maker offers draws inside the frame on every build, alone and mixed', () => {
  const check = (spec, what) => {
    const c = fromSpec(spec), pal = palette(c);
    for (const b of BODIES) for (const v of VIEWS) for (let k = 0; k < POSES; k++) {
      const buf = frame(c, v, k, b); assert.equal(buf.clipped, 0, `${what} ${b} ${v} ${k} runs off the frame`);
      for (const m of new Set(buf.mat.filter(Boolean))) assert.ok(pal[m], `${what} uses "${m}" without a colour`);
    }
  };
  for (const [key, opts] of Object.entries(CHOICES)) for (const [v] of opts) check({ [key]: v, ...(key === 'neckline' || key === 'rope' ? { clothes: 'gown' } : {}) }, `${key} ${v}`);
  /* and sixty characters with every choice at random */
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 60; i++) { const spec = Object.fromEntries(Object.entries(CHOICES).map(([k, o]) => [k, o[rnd(o.length)][0]])); check(spec, JSON.stringify(spec)); }
});
test('a spec cleans whatever it is given, and survives JSON', () => {
  const s = cleanSpec({ id: 'Bad Id!', name: '  ', clothes: 'armour', hat: 'kettle', colours: { cloth: 'red', hair: '#ABCDEF' } });
  assert.match(s.id, /^custom-/); assert.equal(s.name, 'New character'); assert.equal(s.clothes, CHOICES.clothes[0][0]); assert.equal(s.hat, 'kettle');
  assert.equal(s.colours.hair, '#abcdef'); assert.match(s.colours.cloth, /^#[0-9a-f]{6}$/); assert.deepEqual(Object.keys(s.colours), COLOURS.map(c => c[0]));
  assert.deepEqual(cleanSpec(JSON.parse(JSON.stringify(s))), s);
  /* choices that only mean something with some clothes leave the others alone */
  assert.equal(fromSpec({ clothes: 'tunic', neckline: 'square', rope: 'rope' }).outfit.neckline, undefined);
  assert.ok(!APPLIES.shield({ held: 'daggers' }));
  /* the townsfolk are specs too, so the maker can start from any of them */
  for (const t of TOWNSFOLK) { assert.ok(t.spec); assert.equal(fromSpec(t.spec).look, t.look); }
});
test('the monk wears a robe to the floor, tied with a rope, like the black mage\'s', () => {
  const monk = byId('monk');
  for (const b of BODIES) for (let k = 0; k < POSES; k++) {
    const f = frame(monk, 'front', k, b).mat, m = measure(b, 'front', k, monk.outfit);
    assert.ok(!f.includes('P'), `${b} ${k}: no trousers`);
    assert.ok(f.slice((BASE - 1) * W, BASE * W).filter(c => c === 'C').length >= BODY_TYPES[b].chest, `${b} ${k}: a hem just off the ground`);
    assert.ok(m.parts.torso.rows.some(r => /^\.*L+G?L+\.*$/.test(r)), `${b} ${k}: a rope girdle round the waist`);
  }
});
test('the dragoon is armoured in crimson, spiked all over, and carries a winged lance', () => {
  const dragoon = ROSTER.find(j => j.id === 'dragoon');
  /* no violet anywhere in its colours: the plate is a warm crimson */
  for (const [m, c] of Object.entries(dragoon.pal)) {
    const [, C, h] = rgbLch(hexRgb(c));
    assert.ok(C < 0.03 || h < 270 || h > 340, `${m} ${c} is violet`);
  }
  assert.ok(rgbLch(hexRgb(dragoon.pal.S))[2] < 50, 'crimson plate');
  /* the spikiest silhouette in the roster: more points (a pixel with at most one filled neighbour) than any
     other job, in both views */
  const points = mat => mat.filter((m, u) => {
    if (!m) return false;
    const x = u % W, y = (u / W) | 0;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([i, j]) => x + i >= 0 && x + i < W && y + j >= 0 && y + j < H && mat[(y + j) * W + x + i]).length <= 1;
  }).length;
  for (const v of VIEWS) {
    const mine = points(frame(dragoon, v, 0).mat);
    for (const job of ROSTER.filter(j => j !== dragoon)) assert.ok(mine > points(frame(job, v, 0).mat), `${v}: ${job.id} is spikier`);
  }
  /* the lance: its point at the top of the frame, a ridged blade, barbed wings either side of a gold socket, a
     tuft beneath, and a steel spike at the butt */
  for (const b of BODIES) for (const v of VIEWS) {
    const [hx, hy] = measure(b, v, 0, dragoon.outfit).at[v === 'front' ? 'handFar' : 'handNear'];
    const lance = dragoon.weapon[v].make({ hand: [hx, hy], dir: hx < 16 ? -1 : 1 }), rows = lance.rows, last = rows[rows.length - 1];
    assert.equal(lance.y, 0, `${b} ${v}: the point at the top`);
    assert.ok(rows.some(r => r.includes('y')) && rows.some(r => /S\.*G\.*S/.test(r)) && rows.some(r => r.includes('R')), `${b} ${v}: blade, wings, tuft`);
    assert.ok(last.replace(/\./g, '') === 'S', `${b} ${v}: a butt spike`);
    assert.ok(lance.x >= 1 && lance.x + rows[0].length <= W - 1, `${b} ${v}: a column spare for the outline`);
  }
});
test('the figures sit in the tile set\'s palette: washed toward its paper and inked in its umber', () => {
  assert.equal(OUTLINE, INK);
  /* a wash takes away chroma and moves toward the paper's lightness */
  for (const c of ['#4f66a6', '#c0473a', '#1e1a2a']) {
    const [L0, C0] = rgbLch(hexRgb(c)), [L1, C1] = rgbLch(hexRgb(wash(c))), Lp = rgbLch(hexRgb(PAPER))[0];
    assert.ok(C1 < C0 * 0.8 && Math.abs(Lp - L1) < Math.abs(Lp - L0), c);
  }
  /* no pixel of any figure is more saturated than the tiles' gold, and on the whole they are softer still */
  const tileGold = rgbLch(hexRgb('#c9a24f'))[1];
  for (const job of ROSTER) {
    let max = 0, sum = 0, n = 0;
    for (const v of VIEWS) for (let k = 0; k < POSES; k++) {
      const px = render(job)[v][k], mat = frame(job, v, k).mat;
      for (let u = 0; u < W * H; u++) if (mat[u]) { const C = rgbLch([px[u * 4], px[u * 4 + 1], px[u * 4 + 2]])[1]; max = Math.max(max, C); sum += C; n++; }
    }
    assert.ok(max <= tileGold, `${job.id}: chroma ${max.toFixed(3)} beyond the tiles' gold`);
    assert.ok(sum / n < 0.06, `${job.id}: mean chroma ${(sum / n).toFixed(3)}`);
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
  for (const hair of [parts.HAIR_SHORT, parts.HAIR_LONG, parts.HAIR_BUN, parts.HAIR_PONYTAIL, parts.HAIR_BRAID]) for (const v of VIEWS) {
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
test('the walk steps stride, upright, stride, upright, and encodes as a looping animated PNG', () => {
  assert.deepEqual(WALK, [1, 0, 2, 0]);
  const walk = buildWalk(ROSTER.slice(0, 2), 2), same = (a, b) => a.every((v, i) => v === b[i]);
  assert.equal(walk.frames.length, 4);
  for (const f of walk.frames) assert.equal(f.length, walk.width * walk.height * 4);
  assert.ok(!same(walk.frames[0], walk.frames[1]) && !same(walk.frames[0], walk.frames[2]) && same(walk.frames[1], walk.frames[3]));
  const png = encodeAPNG(walk.width, walk.height, walk.frames, 170), count = t => png.toString('latin1').split(t).length - 1;
  assert.equal(png.readUInt32BE(16), walk.width); assert.equal(count('acTL'), 1); assert.equal(count('fcTL'), 4); assert.equal(count('fdAT'), 3);
  const actl = png.indexOf('acTL') + 4; assert.equal(png.readUInt32BE(actl), 4); assert.equal(png.readUInt32BE(actl + 4), 0, 'loops forever');
});
test('the sheet is a valid PNG of the expected size', () => {
  const s = buildSheet(ROSTER.slice(0, 2), 2); assert.equal(s.rgba.length, s.width * s.height * 4);
  const png = encodePNG(s.width, s.height, s.rgba);
  assert.deepEqual([...png.subarray(1, 4)], [80, 78, 71]); assert.equal(png.readUInt32BE(16), s.width); assert.equal(png.readUInt32BE(20), s.height);
  const start = png.indexOf('IDAT') + 4, len = png.readUInt32BE(start - 8);
  assert.equal(inflateSync(png.subarray(start, start + len)).length, (s.width * 4 + 1) * s.height);
});

test('scale2xOutline rounds the silhouette off and leaves the inside as drawn', () => {
  const ink = [43, 33, 22, 255], tan = [200, 170, 120, 255], clear = [0, 0, 0, 0];
  const img = rows => new Uint8ClampedArray(rows.flat().flat()), px = (a, w, x, y) => [...a.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
  /* a 2×2 stair: ink on the diagonal from bottom left */
  const stair = scale2xOutline(img([[clear, ink], [ink, ink]]), 2, 2);
  assert.equal(stair.length, 4 * 4 * 4);
  assert.deepEqual(px(stair, 4, 1, 1), ink, 'the inner corner of the clear pixel fills in along the diagonal');
  assert.deepEqual(px(stair, 4, 0, 0), clear, 'the outer corner stays clear');
  /* a lone pixel comes back as a plain 2×2 block */
  const lone = scale2xOutline(img([[clear, clear, clear], [clear, ink, clear], [clear, clear, clear]]), 3, 3);
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) assert.deepEqual(px(lone, 6, x, y), ink);
  assert.equal([...lone].filter((v, i) => i % 4 === 3 && v).length, 4);
  /* a diagonal colour step inside a solid figure is not smoothed: every pixel is a plain 2×2 block */
  const inside = [[ink, ink, ink], [ink, tan, ink], [tan, tan, ink]], wob = scale2xOutline(img(inside), 3, 3);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) assert.deepEqual(px(wob, 6, x, y), inside[y >> 1][x >> 1]);
});
