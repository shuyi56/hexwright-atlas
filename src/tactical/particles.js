/* ================= tactical view: particles for the abilities =================
   A small particle system and an effect for each ability (battle/abilities.js), played over the scene in art pixels
   so every mote is a whole pixel square like the sprites around it.

   A particle has a place and a speed (art pixels, and art pixels a second), a pull (gravity, ay; negative rises) and a
   drag (the share of its speed it keeps each second), a life in seconds and an age, a delay before it shows, a size
   in pixels and a ramp of colours it runs through as it ages, and a shape: a dot, a plus (a little cross, for heals
   and glints) or a streak (a line along its speed, for sparks and shards). It fades over the last third of its life.

   Each ability has two beats, after the attack's own (tactical/blow.js): charge, played on the user as it winds up,
   and impact, played where the blow lands (fizzle instead, smaller, when it misses):
     Power Strike  embers drawn in to the attacker's chest; a shockwave ring of orange sparks and grit thrown up
                   that falls back under gravity
     True Strike   gold glints converging on the attacker; a thin line of motes along the shot, a star where it lands
     Pierce        a cold blue thread pulled taut; shards bursting out of the target's far side, carrying on along
                   the line of the blow
     Spell         motes in the caster's colour circling up round it; a burst in that colour with embers rising
     Heal          green motes rising round the healer; a spiral of green motes and little crosses winding up the
                   ally, and a soft ring at its feet
   Pure (no DOM): emit and step are plain arithmetic, the drawing is the view's. Effects take a random source so tests
   can seed them. */

const TAU = Math.PI * 2;
/* a seeded random source (mulberry32), for tests and for effects that should look the same each time */
function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const createFx = () => ({ parts: [] });
/* a particle with every field filled */
const particle = p => ({ vx: 0, vy: 0, ay: 0, drag: 1, delay: 0, age: 0, life: 0.6, size: 1, shape: 'dot', colors: ['#ffffff'], ...p });
function emit(fx, parts) { for (const p of parts) fx.parts.push(particle(p)); return fx; }
/* move every particle on by dt seconds and drop those whose life is over */
function stepFx(fx, dt) {
  const out = [];
  for (const p of fx.parts) {
    let d = dt;
    if (p.delay > 0) { p.delay -= d; if (p.delay > 0) { out.push(p); continue; } d = -p.delay; p.delay = 0; }
    p.age += d; if (p.age >= p.life) continue;
    const keep = Math.pow(p.drag, d);
    p.vx *= keep; p.vy = p.vy * keep + p.ay * d;
    p.x += p.vx * d; p.y += p.vy * d;
    out.push(p);
  }
  fx.parts = out;
  return fx;
}
/* how a live particle looks now: { colour, alpha }, or null while it waits out its delay */
function lookOf(p) {
  if (p.delay > 0) return null;
  const f = Math.min(0.999, p.age / p.life), colour = p.colors[Math.floor(f * p.colors.length)];
  return { colour, alpha: f < 2 / 3 ? 1 : 1 - (f - 2 / 3) * 3 };
}

/* ---------- the effects: lists of particles for emit ---------- */
const FIRE = ['#fff4d0', '#ffd27a', '#ff9a3c', '#d9553f', '#6a261b'];
const GOLD = ['#ffffff', '#fff4d0', '#ffe27a', '#e4b04a'];
const ICE = ['#ffffff', '#dff4ff', '#9fd2f0', '#5d8fd0'];
const LEAF = ['#ffffff', '#e6ffd8', '#8fe39a', '#3fb85a'];
/* a colour ramp from white through a spell's tint */
const tinted = tint => ['#ffffff', '#fffaf0', tint, tint];
/* motes arriving at (x, y) from all round, over `dur` seconds */
function converge(rnd, [x, y], n, r, dur, colors, extra = {}) {
  return Array.from({ length: n }, (_, i) => {
    const ang = rnd() * TAU, d = r * (0.6 + 0.4 * rnd()), life = 0.3 + 0.15 * rnd();
    return { x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d * 0.7, vx: -Math.cos(ang) * d / life, vy: -Math.sin(ang) * d * 0.7 / life, life, delay: (i / n) * dur, size: rnd() < 0.3 ? 2 : 1, colors, ...extra };
  });
}
/* motes rising round (x, y) from a ring at its feet */
function rise(rnd, [x, y], n, dur, colors, shape = 'dot') {
  return Array.from({ length: n }, (_, i) => ({ x: x + (rnd() - 0.5) * 14, y: y + 6 + rnd() * 4, vx: (rnd() - 0.5) * 6, vy: -14 - 12 * rnd(), ay: -10, drag: 0.6, life: 0.5 + 0.3 * rnd(), delay: (i / n) * dur, size: rnd() < 0.3 ? 2 : 1, colors, shape: i % 3 === 2 ? shape : 'dot' }));
}
/* a ring of sparks flying out of (x, y) */
function ring(rnd, [x, y], n, speed, colors, extra = {}) {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * TAU + rnd() * 0.3, s = speed * (0.7 + 0.5 * rnd());
    return { x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s * 0.7, drag: 0.04, life: 0.35 + 0.2 * rnd(), size: rnd() < 0.4 ? 2 : 1, colors, shape: 'streak', ...extra };
  });
}

/* the particles for ability `id` at beat `beat` ('charge', 'impact' or 'fizzle'), from the user's chest `from` toward
   the target's chest `to` (art pixels, [x, y]); tint, a spell's colour; rnd, a random source */
function abilityFx(id, beat, from, to, { tint = '#f2c460', rnd = Math.random } = {}) {
  const [fx, fy] = from, [tx, ty] = to, len = Math.hypot(tx - fx, ty - fy) || 1, ux = (tx - fx) / len, uy = (ty - fy) / len;
  if (beat === 'fizzle') return ring(rnd, to, 6, 20, ['#e8e2d0', '#9c9686'], { life: 0.3 });
  switch (id) {
    case 'power':
      if (beat === 'charge') return converge(rnd, from, 26, 22, 0.25, FIRE);
      return [...ring(rnd, to, 28, 120, FIRE), ...ring(rnd, to, 14, 60, ['#ffffff', '#fff4d0', '#ffd27a']),
        ...Array.from({ length: 14 }, () => ({ x: tx + (rnd() - 0.5) * 8, y: ty + 10, vx: (rnd() - 0.5) * 60, vy: -60 - 40 * rnd(), ay: 260, drag: 0.5, life: 0.6 + 0.2 * rnd(), size: rnd() < 0.5 ? 2 : 1, colors: ['#8a6238', '#5e4714', '#3a2a24'] }))];
    case 'true':
      if (beat === 'charge') return converge(rnd, from, 16, 18, 0.25, GOLD, { shape: 'plus' });
      return [...Array.from({ length: 28 }, (_, i) => { const q = i / 28; return { x: fx + (tx - fx) * q, y: fy + (ty - fy) * q, vx: ux * 4, vy: uy * 4 - 3, life: 0.25 + 0.3 * q, delay: q * 0.06, colors: GOLD }; }),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ x: tx, y: ty, vx: Math.cos(i * TAU / 8) * (i % 2 ? 50 : 90), vy: Math.sin(i * TAU / 8) * (i % 2 ? 50 : 90), drag: 0.01, life: 0.32, size: i % 2 ? 1 : 2, colors: GOLD, shape: 'streak' })),
        { x: tx, y: ty, life: 0.4, size: 4, colors: GOLD, shape: 'plus' }];
    case 'pierce':
      if (beat === 'charge') return Array.from({ length: 16 }, (_, i) => { const q = i / 16; return { x: fx + ux * (4 + 16 * q), y: fy + uy * (4 + 16 * q), vx: -ux * 20, vy: -uy * 20, life: 0.32, delay: q * 0.18, size: i % 3 ? 1 : 2, colors: ICE, shape: 'streak' }; });
      return Array.from({ length: 26 }, () => {
        const spread = (rnd() - 0.5) * 0.9, c = Math.cos(spread), s = Math.sin(spread), dx = ux * c - uy * s, dy = ux * s + uy * c, v = 90 + 90 * rnd();
        return { x: tx + ux * 3, y: ty + uy * 3, vx: dx * v, vy: dy * v * 0.8, ay: 40, drag: 0.08, life: 0.35 + 0.2 * rnd(), size: rnd() < 0.4 ? 2 : 1, colors: ICE, shape: 'streak' };
      });
    case 'spell':
      if (beat === 'charge') return Array.from({ length: 22 }, (_, i) => { const ang = (i / 22) * TAU * 1.5; return { x: fx + Math.cos(ang) * 11, y: fy + 10 + Math.sin(ang) * 5, vx: -Math.sin(ang) * 24, vy: -22, ay: -14, drag: 0.5, life: 0.5, delay: (i / 22) * 0.3, size: i % 3 ? 1 : 2, colors: tinted(tint) }; });
      return [...ring(rnd, to, 24, 95, tinted(tint)),
        ...Array.from({ length: 16 }, () => ({ x: tx + (rnd() - 0.5) * 12, y: ty + (rnd() - 0.5) * 8, vx: (rnd() - 0.5) * 10, vy: -18 - 14 * rnd(), ay: -14, drag: 0.5, life: 0.7 + 0.3 * rnd(), delay: 0.05 * rnd(), size: rnd() < 0.5 ? 2 : 1, colors: tinted(tint) }))];
    case 'heal':
      if (beat === 'charge') return rise(rnd, from, 18, 0.35, LEAF, 'plus');
      return [...Array.from({ length: 26 }, (_, i) => { const ang = (i / 26) * TAU * 2.5, r = 10; return { x: tx + Math.cos(ang) * r, y: ty + 12 - i * 1, vx: -Math.sin(ang) * 16, size: i % 4 ? 1 : 2, vy: -20, ay: -6, drag: 0.6, life: 0.6 + 0.2 * rnd(), delay: i * 0.025, colors: LEAF, shape: i % 3 ? 'dot' : 'plus' }; }),
        ...ring(rnd, [tx, ty + 12], 18, 50, LEAF, { shape: 'dot', life: 0.45 })];
    default: return [];
  }
}

export { abilityFx, createFx, emit, lookOf, particle, seeded, stepFx };
