import assert from 'node:assert/strict';
import test from 'node:test';
import { blankModel } from '../editor/model.js';
import { placeChar } from '../editor/walk.js';
import { planTurn } from './ai.js';
import { canAct, canMove, createBattle, endPhase, phaseOver, ready, refresh, sideOfGroup, spend, standing, strike, unspend, wait } from './state.js';

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

test('strikes take hit points, the fallen are out, and the last to fall decides the battle', () => {
  const B = createBattle([{ side: P, hp: 30 }, { side: E, hp: 12 }, { side: E, hp: 12 }, { side: P, hp: 30 }]);
  assert.equal(strike(B, 0, 3, 5), null, 'not one\'s own side');
  assert.deepEqual(strike(B, 0, 1, 8), { dmg: 8, from: 12, to: 4, max: 12, fell: false });
  assert.ok(!canAct(B, 0) && canMove(B, 0), 'struck: it can still move');
  assert.equal(strike(B, 0, 1, 8), null, 'one action a phase');
  assert.deepEqual(strike(B, 3, 1, 8), { dmg: 8, from: 4, to: 0, max: 12, fell: true });
  assert.deepEqual(standing(B, E), [2]); assert.equal(strike(B, 3, 1, 1), null, 'the fallen are not struck again');
  assert.equal(B.outcome, null);
  endPhase(B); assert.ok(!ready(B, 1), 'the fallen do not take a phase');
  assert.ok(strike(B, 2, 0, 30).fell);
  assert.equal(B.outcome, null, 'one of the player\'s is still standing');
  endPhase(B); strike(B, 3, 2, 50);
  assert.equal(B.outcome, 'victory');
  assert.ok(!ready(B, 3) && !phaseOver(B)); assert.equal(endPhase(B), null, 'nothing more once it is over');
  const L = createBattle([{ side: P, hp: 5 }, { side: E, hp: 5 }]); endPhase(L); strike(L, 1, 0, 9);
  assert.equal(L.outcome, 'defeat');
});

test('new unit data keeps the damage taken, against the new full hit points', () => {
  const B = createBattle([{ side: P, hp: 30 }, { side: E, hp: 20 }]);
  strike(B, 0, 1, 5);
  refresh(B, [{ side: P, hp: 40 }, { side: E, hp: 10 }]);
  assert.deepEqual([B.units[0].hp, B.units[0].max], [40, 40]);
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
