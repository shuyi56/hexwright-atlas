import assert from 'node:assert/strict';
import test from 'node:test';
import { blankModel } from '../editor/model.ts';
import { placeChar } from '../editor/walk.js';
import { planTurn } from './ai.js';
import { MP_REGEN, critOf, damageOf, hitChance } from './abilities.ts';
import { actionOf, canAct, canAfford, canMove, canTarget, canUse, cooldownLeft, createBattle, endPhase, forecast, phaseOver, ready, refresh, sideOfGroup, spend, standing, strike, unspend, wait } from './state.ts';

const P = 'player', E = 'enemy';

test('the player moves first, each unit once a phase, and only its side', () => {
  const B = createBattle([{ side: P, hp: 30 }, { side: E, hp: 20 }, { side: P, hp: 25 }]);
  assert.equal(B.turn, 1); assert.equal(B.phase, P); assert.deepEqual(B.sides, [P, E]);
  assert.ok(canMove(B, 0) && canAct(B, 0)); assert.ok(!ready(B, 1), 'the enemy waits for its phase');
  assert.ok(spend(B, 0, 'moved')); assert.ok(!spend(B, 0, 'moved'), 'no second move'); assert.ok(canAct(B, 0));
  unspend(B, 0, 'moved'); assert.ok(canMove(B, 0), 'a move taken back can be made again');
  assert.ok(!spend(B, 1, 'moved'), 'not the enemy\'s phase');
  assert.ok(wait(B, 0)); assert.ok(!ready(B, 0)); assert.ok(!phaseOver(B), 'unit 2 has not gone');
  assert.ok(wait(B, 2)); assert.ok(phaseOver(B));
});

test('play passes to the enemy and back, a new turn each time it comes round to the player', () => {
  const B = createBattle([{ side: P, hp: 30 }, { side: E, hp: 20 }]);
  wait(B, 0);
  assert.deepEqual(endPhase(B), { turn: 1, phase: E, newTurn: false });
  assert.ok(ready(B, 1) && !ready(B, 0)); assert.ok(B.units[0].moved, 'the player\'s units keep their marks until their phase');
  wait(B, 1);
  assert.deepEqual(endPhase(B), { turn: 2, phase: P, newTurn: true });
  assert.ok(canMove(B, 0) && canAct(B, 0), 'fresh for the new turn'); assert.ok(!ready(B, 1));
  /* the phase can be ended early, with units still to go */
  assert.equal(endPhase(B).phase, E);
});

test('a side with no units has its phase skipped', () => {
  const B = createBattle([{ side: P, hp: 10 }, { side: P, hp: 10 }]);
  assert.deepEqual(B.sides, [P]);
  wait(B, 0); wait(B, 1);
  assert.deepEqual(endPhase(B), { turn: 2, phase: P, newTurn: true });
  assert.ok(ready(B, 0) && ready(B, 1));
  const F = createBattle([{ side: E, hp: 10 }]);
  assert.equal(F.phase, E, 'a map of enemies only starts with theirs');
  assert.deepEqual(endPhase(F), { turn: 2, phase: E, newTurn: true });
});

test('a forecast shows what a strike would do without striking', () => {
  const B = createBattle([{ side: P, hp: 30, attack: 8 }, { side: E, hp: 12 }, { side: P, hp: 30 }, { side: P, hp: 30, attack: 20 }]);
  assert.deepEqual(forecast(B, 0, 1), { act: 'attack', heal: false, amount: 8, chance: 100, crit: 0, critAmount: 12, critTo: 0, cost: 0, from: 12, to: 4, max: 12, fell: false });
  assert.equal(B.units[1].hp, 12, 'nothing is struck'); assert.ok(canAct(B, 0), 'nor is the action spent');
  assert.deepEqual([forecast(B, 3, 1).to, forecast(B, 3, 1).fell], [0, true]);
  assert.equal(forecast(B, 0, 2), null, 'not one\'s own side');
  assert.deepEqual(strike(B, 0, 1), { ...forecast(createBattle([{ side: P, hp: 30, attack: 8 }, { side: E, hp: 12 }]), 0, 1), landed: true, critical: false }, 'the strike lands as forecast');
});

test('Defense cuts the damage, and Accuracy against Evasion decides whether a blow lands', () => {
  assert.equal(damageOf(10, 0), 10); assert.equal(damageOf(10, 20), 5, 'every 20 Defense halves it'); assert.equal(damageOf(13, 2), 12);
  assert.equal(damageOf(3, 99), 1, 'never less than 1');
  assert.deepEqual([hitChance(90, 15), hitChance(40, 90), hitChance(150, 0)], [75, 5, 100], 'kept between 5 and 100 percent');
  const B = createBattle([{ side: P, hp: 30, attack: 12, accuracy: 90 }, { side: E, hp: 30, defense: 20, evasion: 15 }, { side: P, hp: 30, attack: 12, accuracy: 90 }]);
  const f = forecast(B, 0, 1); assert.deepEqual([f.amount, f.chance], [6, 75]);
  /* a roll at or over the chance misses: the action is spent, the hit points stay */
  const miss = strike(B, 0, 1, 'attack', () => 0.75);
  assert.deepEqual([miss.landed, miss.to, miss.fell, B.units[1].hp], [false, 30, false, 30]); assert.ok(!canAct(B, 0), 'a miss spends the action');
  const hit = strike(B, 2, 1, 'attack', () => 0.74);
  assert.deepEqual([hit.landed, hit.to, B.units[1].hp], [true, 24, 24]);
});

test('a blow that lands may be critical, for the attacker\'s Crit Damage percent of the damage', () => {
  assert.equal(critOf(10, 150), 15); assert.equal(critOf(7, 175), 12); assert.equal(critOf(1, 100), 1);
  const B = createBattle([{ side: P, hp: 30, attack: 10, crit: 25, critDamage: 200 }, { side: E, hp: 30 }, { side: P, hp: 30, attack: 10, crit: 25, critDamage: 200 }, { side: P, hp: 20, mp: 6, attack: 3, crit: 100, ability: 'heal' }]);
  const f = forecast(B, 0, 1); assert.deepEqual([f.amount, f.crit, f.critAmount, f.critTo], [10, 25, 20, 10]);
  /* a sure hit spends no roll on landing: the one roll, under the Crit chance, makes it critical */
  const rolls = [0.2], c = strike(B, 0, 1, 'attack', () => rolls.shift());
  assert.deepEqual([c.landed, c.critical, c.amount, c.to, B.units[1].hp], [true, true, 20, 10, 10]);
  const plain = [0.25], p = strike(B, 2, 1, 'attack', () => plain.shift());
  assert.deepEqual([p.critical, p.amount, B.units[1].hp], [false, 10, 0]); assert.ok(p.fell);
  assert.equal(forecast(B, 3, 0, 'heal').crit, 0, 'a heal is never critical');
});

test('an ability rests for its cooldown after it is used, and the plain attack never does', () => {
  /* Spell has a cooldown of 2: used on turn 1, it is back on turn 4 */
  const B = createBattle([{ side: P, hp: 30, mp: 40, attack: 10, accuracy: 100, ability: 'spell' }, { side: E, hp: 999 }]);
  const round = () => { endPhase(B); wait(B, 1); endPhase(B); };
  assert.ok(canUse(B, 0, 'spell')); assert.ok(strike(B, 0, 1, 'spell', () => 0)); assert.equal(cooldownLeft(B, 0), 3, 'back on turn 4');
  round(); assert.equal(B.turn, 2); assert.equal(cooldownLeft(B, 0), 2);
  assert.ok(!canUse(B, 0, 'spell') && canAfford(B, 0, 'spell'), 'it has the MP but is resting'); assert.equal(forecast(B, 0, 1, 'spell'), null); assert.equal(strike(B, 0, 1, 'spell'), null);
  assert.ok(canUse(B, 0) && forecast(B, 0, 1), 'the attack is always there'); wait(B, 0);
  round(); assert.equal(B.turn, 3); assert.equal(cooldownLeft(B, 0), 1); wait(B, 0);
  round(); assert.equal(B.turn, 4); assert.equal(cooldownLeft(B, 0), 0); assert.ok(canUse(B, 0, 'spell'));
});

test('abilities spend MP, which comes back a little each phase', () => {
  const B = createBattle([
    { side: P, hp: 30, mp: 10, attack: 10, accuracy: 50, ability: 'power' },
    { side: E, hp: 60, defense: 20, evasion: 50 },
    { side: P, hp: 30, mp: 6, attack: 10, accuracy: 50, ability: 'pierce' },
    { side: P, hp: 20, mp: 12, attack: 3, ability: 'heal' },
    { side: P, hp: 30, mp: 9, attack: 10, accuracy: 50, ability: 'true' }]);
  assert.equal(actionOf(B, 0, 'heal'), null, 'only its own ability'); assert.equal(forecast(B, 0, 1, 'heal'), null);
  const p = forecast(B, 0, 1, 'power'); assert.deepEqual([p.amount, p.chance, p.cost], [8, 5, 6], '1.5× the Attack, through the Defense');
  assert.equal(forecast(B, 2, 1, 'pierce').amount, 10, 'Pierce ignores Defense');
  assert.equal(forecast(B, 4, 1, 'true').chance, 100, 'True Strike never misses');
  const r = strike(B, 0, 1, 'power', () => 0); assert.ok(r.landed); assert.equal(B.units[0].mp, 4);
  assert.ok(!canAfford(B, 0, 'power'), '4 MP left, 6 needed');
  /* a heal reaches only another of its side, never past full HP, and always lands */
  assert.equal(forecast(B, 3, 1, 'heal'), null, 'not a foe'); assert.equal(forecast(B, 3, 3, 'heal'), null, 'not itself');
  assert.equal(canTarget(B, 3, 0, 'heal'), true);
  B.units[0].hp = 20; const h = strike(B, 3, 0, 'heal', () => 0.99);
  assert.deepEqual([h.heal, h.amount, h.chance, h.to, B.units[0].hp, B.units[3].mp], [true, 10, 100, 30, 30, 6], 'heals 8 + 2 × Attack, up to full');
  B.units[0].hp = 25; assert.equal(forecast(createBattle([{ side: P, hp: 20, mp: 6, attack: 3, ability: 'heal' }, { side: P, hp: 30 }]), 0, 1, 'heal').amount, 0, 'nothing to heal at full HP');
  /* the enemy's phase and back: the player's units get MP_REGEN back, up to their full MP */
  endPhase(B); endPhase(B);
  assert.deepEqual([B.units[0].mp, B.units[2].mp, B.units[3].mp], [4 + MP_REGEN, 6, 6 + MP_REGEN]);
  assert.ok(canAfford(B, 0, 'power'));
});

test('strikes take hit points, the fallen are out, and the last to fall decides the battle', () => {
  const B = createBattle([{ side: P, hp: 30, attack: 8 }, { side: E, hp: 12, attack: 30 }, { side: E, hp: 12 }, { side: P, hp: 30, attack: 12 }]);
  assert.equal(strike(B, 0, 3), null, 'not one\'s own side');
  assert.deepEqual(strike(B, 0, 1), { act: 'attack', heal: false, amount: 8, chance: 100, crit: 0, critAmount: 12, critTo: 0, cost: 0, from: 12, to: 4, max: 12, fell: false, landed: true, critical: false });
  assert.ok(!canAct(B, 0) && canMove(B, 0), 'struck: it can still move');
  assert.equal(strike(B, 0, 1), null, 'one action a phase');
  assert.deepEqual([strike(B, 3, 1).to, B.units[1].hp, B.units[1].hp > 0], [0, 0, false]);
  assert.deepEqual(standing(B, E), [2]); assert.equal(forecast(B, 0, 1), null, 'the fallen are not struck again');
  assert.equal(B.outcome, null);
  endPhase(B); assert.ok(!ready(B, 1), 'the fallen do not take a phase');
  B.units[2].stats.attack = 30; assert.ok(strike(B, 2, 0).fell);
  assert.equal(B.outcome, null, 'one of the player\'s is still standing');
  endPhase(B); strike(B, 3, 2);
  assert.equal(B.outcome, 'victory');
  assert.ok(!ready(B, 3) && !phaseOver(B)); assert.equal(endPhase(B), null, 'nothing more once it is over');
  const L = createBattle([{ side: P, hp: 5 }, { side: E, hp: 5, attack: 9 }]); endPhase(L); strike(L, 1, 0);
  assert.equal(L.outcome, 'defeat');
});

test('new unit data keeps the damage taken and the MP spent, against the new full hit points and MP', () => {
  const B = createBattle([{ side: P, hp: 30, mp: 10, attack: 5, ability: 'power' }, { side: E, hp: 20 }]);
  strike(B, 0, 1);
  assert.equal(B.units[1].hp, 15); B.units[0].mp = 4;
  refresh(B, [{ side: P, hp: 40, mp: 20, attack: 9, defense: 3, ability: 'spell' }, { side: E, hp: 10 }]);
  assert.deepEqual([B.units[0].hp, B.units[0].max, B.units[0].mp, B.units[0].mpMax, B.units[0].stats.attack, B.units[0].stats.defense, B.units[0].ability], [40, 40, 14, 20, 9, 3, 'spell']);
  assert.deepEqual([B.units[1].hp, B.units[1].max], [5, 10]);
  assert.equal(sideOfGroup('enemies'), E); assert.equal(sideOfGroup('characters'), P);
});

test('the computer strikes what it can reach, the weakest first, and otherwise closes in', () => {
  const M = blankModel(14, 'grass');
  placeChar(M, { sprite: 'goblin', x: 2, y: 2 });   /* 0: the enemy */
  placeChar(M, { sprite: 'knight', x: 6, y: 2 });   /* 1: four tiles off, in reach after a walk */
  placeChar(M, { sprite: 'archer', x: 2, y: 6 });   /* 2: as far, and weaker */
  const hp = [20, 30, 9], opts = { move: 4, jump: 1, range: 1, pattern: 'melee', isFoe: j => j !== 0, hpOf: j => hp[j] };
  const plan = planTurn(M, 0, opts);
  assert.equal(plan.target, 2, 'the weaker foe');
  const [x, y] = plan.path[plan.path.length - 1];
  assert.equal(Math.abs(x - 2) + Math.abs(y - 6), 1, 'beside it, to strike with a melee blow');
  assert.equal(plan.path.length, 3, 'by the shortest walk there');
  /* already beside a foe: strike without moving */
  const N = blankModel(8, 'grass'); placeChar(N, { sprite: 'goblin', x: 3, y: 3 }); placeChar(N, { sprite: 'knight', x: 4, y: 3 });
  assert.deepEqual(planTurn(N, 0, { ...opts, isFoe: j => j === 1 }), { path: [], target: 1 });
  /* out of reach: walk the full move toward the foe, round a wall it cannot climb, though that leads away from it */
  const W = blankModel(16, 'grass');
  for (let y = 0; y < 12; y++) W.elev[y * 16 + 8] = 4;
  placeChar(W, { sprite: 'goblin', x: 7, y: 2 }); placeChar(W, { sprite: 'knight', x: 9, y: 2 });
  const far = planTurn(W, 0, { ...opts, isFoe: j => j === 1 });
  assert.equal(far.target, -1); assert.equal(far.path.length, 4);
  const [fx, fy] = far.path[3];
  assert.equal(fy, 6, `heads down to the end of the wall, not along it (${fx}, ${fy})`);
  /* no one to fight: it stays */
  assert.deepEqual(planTurn(W, 0, { ...opts, isFoe: () => false }), { path: [], target: -1 });
});
