/* ================= battle: the state of a fight in the tactical view =================
   Who fights on which side, their hit points and MP, the numbers they fight with, the turn and whose phase it is,
   and what each unit has done in it.

   A turn has a phase for each side, the player's first and then the enemy's. The player's side is the unit data's
   characters, the enemy's its enemies (data/units/, src/data/units.ts). In a phase every unit of that side still
   standing moves once and acts once (attacks, uses one of its abilities, or waits, which spends both), in either order; the phase ends when
   every one of them is done, or when its side ends it early, and play passes to the other side with its units
   fresh. When the enemy phase ends, the next turn begins with the player's. A side with no units at all (a map of
   villagers only, say) has its phase skipped.

   A blow (battle/actions.ts) is an Attack or one of the unit's abilities: it may miss (Accuracy against the target's
   Evasion), the target's Defense cuts its damage, one that lands may be critical (the attacker's Crit) for more
   (its Crit Damage), and an ability spends MP, which comes back a little each phase, and then rests for its
   cooldown: a cooldown of 1 means not next turn but the one after. The chances are rolled when the
   blow is struck; a forecast shows the odds and what a hit and a critical hit would do.

   The battle is won when the last enemy falls and lost when the last of the player's units does; after that no one
   moves or acts. Hit points and MP belong to the battle, not the map: a new battle starts everyone full.

   Units are kept by their index in the map's chars, as the view knows them. Pure (no DOM, no map), so tests and the
   view share it. */
import { ATTACK, MP_REGEN, abilityOf } from './abilities.ts';
import type { Action, Blow } from './actions.ts';
import type { EffectContext, SpecialEffect, StrikeContext } from './effects.ts';
import type { CombatStats, Side } from '../data/units.ts';

type Outcome = 'victory' | 'defeat';
type Mark = 'moved' | 'acted';
/* a unit as the view hands it in: its side and full hit points, and any of the rest of its numbers */
/* (abilities, the skill ids it may use; or one as ability) */
interface UnitEntry extends Partial<CombatStats> { side: Side; hp: number; mp?: number; abilities?: readonly string[]; ability?: string | null }
/* a unit in the battle: its hit points and MP against its full ones, the numbers it fights with, its abilities, and
   whether it has moved and acted this phase; readyOn the turn each ability that has been used can be used again, and marks what its
   special effects keep between their hooks (battle/effects.ts) */
interface BattleUnit { side: Side; hp: number; max: number; mp: number; mpMax: number; stats: CombatStats; abilities: string[]; readyOn: Record<string, number>; marks: Record<string, number>; moved: boolean; acted: boolean }
interface Battle { turn: number; phase: Side; outcome: Outcome | null; units: BattleUnit[]; sides: Side[] }
/* what a blow would come to (see forecast) */
interface Forecast extends Blow { act: string; heal: boolean; critTo: number; cost: number; from: number; to: number; max: number; fell: boolean }
/* and what it came to */
interface StrikeResult extends Forecast { landed: boolean; critical: boolean }
interface PhaseChange { turn: number; phase: Side; newTurn: boolean }

const SIDES: readonly Side[] = ['player', 'enemy'];
const SIDE_LABEL: Readonly<Record<Side, string>> = { player: 'Player turn', enemy: 'Enemy turn' };
const OUTCOME_LABEL: Readonly<Record<Outcome, string>> = { victory: 'Victory', defeat: 'Defeat' };
/* the side a unit data group fights on */
const sideOfGroup = (group: string): Side => (group === 'enemies' ? 'enemy' : 'player');

/* the abilities a unit comes in with */
const abilitiesOf = (u: UnitEntry): string[] => [...(u.abilities ?? (u.ability ? [u.ability] : []))];
/* the numbers a unit fights with, from what the view hands in, filled where it leaves them out */
const statsOf = (u: UnitEntry): CombatStats => ({ attack: u.attack ?? 0, defense: u.defense ?? 0, accuracy: u.accuracy ?? 100, evasion: u.evasion ?? 0, crit: u.crit ?? 0, critDamage: u.critDamage ?? 150 });
/* a new battle for these units, by index: [{ side, hp, mp, attack, defense, accuracy, evasion, crit, critDamage,
   abilities }] with hp and mp their full hit points and MP (the unit data's stats; any left out count as none,
   Accuracy as 100 and Crit Damage as 150) */
function createBattle(units: UnitEntry[]): Battle {
  const B: Battle = { turn: 1, phase: SIDES[0], outcome: null, units: units.map(u => ({ side: u.side, hp: Math.max(0, u.hp), max: Math.max(1, u.hp), mp: Math.max(0, u.mp ?? 0), mpMax: Math.max(0, u.mp ?? 0), stats: statsOf(u), abilities: abilitiesOf(u), readyOn: {}, marks: {}, moved: false, acted: false })), sides: [] };
  /* the sides that took the field, in turn order */
  B.sides = SIDES.filter(s => B.units.some(u => u.side === s));
  if (B.sides.length) B.phase = B.sides[0];
  if (B.sides.length) {
    settle(B, () => {
      everyone(B, (e, self) => e.onBattleStart?.({ battle: B, self }));
      everyone(B, (e, self) => e.onTurnStart?.({ battle: B, self, side: B.phase, turn: B.turn }));
      everyone(B, (e, self) => e.onPhaseStart?.({ battle: B, self, side: B.phase, turn: B.turn }), B.phase);
    });
  }
  return B;
}

/* ---------- the special effects' hooks (battle/effects.ts) ---------- */
/* the effects unit k carries: its abilities', each once */
const carried = (B: Battle, k: number): readonly SpecialEffect[] => (B.units[k] ? [...new Set(B.units[k].abilities.flatMap(id => abilityOf(id)?.effects || []))] : []);
/* run f over every effect unit k carries, if it stands */
function each(B: Battle, k: number, f: (e: SpecialEffect, self: number) => void): void {
  if (alive(B, k)) for (const e of carried(B, k)) f(e, k);
}
/* over every standing unit's effects, or one side's */
function everyone(B: Battle, f: (e: SpecialEffect, self: number) => void, side?: Side): void {
  B.units.forEach((u, k) => { if (!side || u.side === side) each(B, k, f); });
}
/* run some hooks, then settle what they did: anyone they felled falls (onFall), and the battle may be over
   (onBattleEnd, to every unit, standing or not) */
function settle(B: Battle, hooks: () => void, before = B.units.map(u => u.hp)): void {
  hooks();
  B.units.forEach((u, k) => { if (before[k] > 0 && u.hp <= 0) for (const e of carried(B, k)) e.onFall?.({ battle: B, self: k }); });
  const was = B.outcome; B.outcome = outcomeOf(B);
  if (B.outcome && !was) { const outcome = B.outcome; B.units.forEach((u, k) => { for (const e of carried(B, k)) e.onBattleEnd?.({ battle: B, self: k, outcome }); }); }
}

/* ---------- asking about a unit ---------- */
const alive = (B: Battle, k: number): boolean => !!B.units[k] && B.units[k].hp > 0;
const done = (B: Battle, k: number): boolean => !!B.units[k] && B.units[k].moved && B.units[k].acted;
/* unit k is in play: standing, on the side whose phase it is, with something left to do, and the battle not over */
const ready = (B: Battle, k: number): boolean => !B.outcome && alive(B, k) && B.units[k].side === B.phase && !done(B, k);
const canMove = (B: Battle, k: number): boolean => ready(B, k) && !B.units[k].moved;
const canAct = (B: Battle, k: number): boolean => ready(B, k) && !B.units[k].acted;
/* the indices of a side's units still standing */
const standing = (B: Battle, side: Side): number[] => B.units.flatMap((u, k) => (u.side === side && u.hp > 0 ? [k] : []));
const foes = (B: Battle, a: number, d: number): boolean => alive(B, d) && B.units[a].side !== B.units[d].side;
/* d is another unit of a's side still standing (who a heal can reach) */
const allies = (B: Battle, a: number, d: number): boolean => a !== d && alive(B, d) && B.units[a].side === B.units[d].side;
/* the action a unit takes by this id: 'attack', or one of its own abilities; null if it has no such ability */
const actionOf = (B: Battle, a: number, id = 'attack'): Action | null => (id === 'attack' ? ATTACK : B.units[a] && B.units[a].abilities.includes(id) ? abilityOf(id) : null);
/* the actions unit a has, the attack first, then each ability the skill list knows, in its order */
const actionsOf = (B: Battle, a: number): Action[] => (B.units[a] ? [ATTACK, ...B.units[a].abilities.map(id => abilityOf(id)).filter((x): x is Action => !!x)] : []);
/* who an action of unit a's can be aimed at: a foe, or an ally for a heal */
const canTarget = (B: Battle, a: number, d: number, id = 'attack'): boolean => { const act = actionOf(B, a, id); return !!act && (act.heal ? allies(B, a, d) : foes(B, a, d)); };
/* unit a has the MP for its ability */
const canAfford = (B: Battle, a: number, id: string): boolean => { const act = actionOf(B, a, id); return !!act && B.units[a].mp >= act.cost; };
/* the turns until unit k's ability `id` is off its cooldown; 0 when it is ready */
const cooldownLeft = (B: Battle, k: number, id: string): number => (B.units[k] ? Math.max(0, (B.units[k].readyOn[id] ?? 0) - B.turn) : 0);
/* unit a can use this action now: it has the MP, and an ability is off its cooldown */
const canUse = (B: Battle, a: number, id = 'attack'): boolean => canAfford(B, a, id) && (id === 'attack' || !cooldownLeft(B, a, id));
/* every unit of the side in play has done all it can */
const phaseOver = (B: Battle): boolean => !B.outcome && standing(B, B.phase).every(k => done(B, k));

/* ---------- what units do ---------- */
/* mark unit k as having moved or acted ('moved' / 'acted'); false (and nothing changed) if it could not. A move
   fires onMove with the path walked (the tiles, as the view routes them). */
function spend(B: Battle, k: number, what: Mark, path: readonly unknown[] = []): boolean {
  if (!(what === 'moved' ? canMove : canAct)(B, k)) return false;
  B.units[k][what] = true;
  if (what === 'moved') settle(B, () => each(B, k, e => e.onMove?.({ battle: B, self: k, path })));
  return true;
}
/* take a move back (the view's undo of a walk before acting) */
function unspend(B: Battle, k: number, what: Mark): void {
  if (!(B.units[k] && alive(B, k) && B.units[k].side === B.phase)) return;
  const was = B.units[k][what]; B.units[k][what] = false;
  if (what === 'moved' && was) each(B, k, e => e.onMoveUndone?.({ battle: B, self: k }));
}
/* unit k stays where it is and ends its part in the phase */
function wait(B: Battle, k: number): boolean {
  if (!ready(B, k)) return false;
  B.units[k].moved = B.units[k].acted = true;
  settle(B, () => each(B, k, e => e.onWait?.({ battle: B, self: k })));
  return true;
}
/* unit a uses action `act` ('attack' or the id of one of its abilities) on unit d: a's action for the phase, and the ability's MP.
   roll() gives a number from 0 up to 1, called once for whether the blow lands (it does when the number falls under
   the hit chance; a sure blow spends no roll on it) and, if it does, once for whether it is critical (under the Crit chance). Returns the forecast
   with landed and critical (what came of the rolls), and amount, to and fell as it came out (a miss leaves d's hit
   points as they were), or null if a cannot act, has not the MP, its ability is cooling down, or d is not one it can aim at.
   After the blow come its action's effects (apply), then the hooks of the units' own: onAbility, onHit or onMiss and
   onCrit for a; onHurt, onHealed or onDodge for d; onKill for a if d fell; then onFall for anyone who did. */
function strike(B: Battle, a: number, d: number, act = 'attack', roll: () => number = Math.random): StrikeResult | null {
  if (!canAct(B, a)) return null;
  const r = forecast(B, a, d, act); if (!r) return null;
  const landed = r.chance >= 100 || roll() * 100 < r.chance, critical = landed && r.crit > 0 && roll() * 100 < r.crit;
  B.units[a].mp -= r.cost; B.units[a].acted = true;
  const A = actionOf(B, a, act) as Action; if (A.cooldown > 0) B.units[a].readyOn[A.id] = B.turn + A.cooldown + 1;
  const to = !landed ? r.from : critical ? r.critTo : r.to;
  const before = B.units.map(u => u.hp);
  B.units[d].hp = to;
  const result = { ...r, landed, critical, amount: critical ? r.critAmount : r.amount, to, fell: landed && to === 0 };
  const ctx = (self: number): StrikeContext => ({ battle: B, self, attacker: a, target: d, action: A, result });
  settle(B, () => {
    /* its special effects, on the battle as the blow left it */
    for (const e of A.effects) e.apply?.(result, { battle: B, user: a, target: d });
    each(B, a, e => {
      if (act !== 'attack') e.onAbility?.(ctx(a));
      if (landed) e.onHit?.(ctx(a)); else e.onMiss?.(ctx(a));
      if (critical) e.onCrit?.(ctx(a));
    });
    /* the target's hooks run even as it falls, so it can answer the blow that felled it */
    for (const e of carried(B, d)) { if (!landed) e.onDodge?.(ctx(d)); else if (A.heal) e.onHealed?.(ctx(d)); else e.onHurt?.(ctx(d)); }
    if (result.fell) each(B, a, e => e.onKill?.(ctx(a)));
  }, before);
  return result;
}
/* what unit a using action `act` on unit d would come to, without doing it: { act, heal, amount, chance, crit,
   critAmount, critTo, cost, from, to, max, fell }, amount the hit points it takes (or restores) if it lands, chance
   the percent it does, crit the percent of hits that are critical and critAmount and critTo what one takes and
   leaves, cost its MP, from and to d's hit points before and after a plain hit, fell whether a plain hit fells it;
   or null if a has no such action, not the MP or an ability still cooling down, or d is not one it can aim at. The view's preview shows it before
   the blow is struck. */
function forecast(B: Battle, a: number, d: number, act = 'attack'): Forecast | null {
  const A = actionOf(B, a, act); if (!A || !canTarget(B, a, d, act) || !canUse(B, a, act)) return null;
  const ctx: EffectContext = { battle: B, user: a, target: d };
  const blow = { battle: B, attacker: a, target: d, action: A };
  let b = A.effects.reduce((b: Blow, e) => (e.modify ? e.modify(b, ctx) : b), A.blow(B.units[a].stats, B.units[d].stats));
  b = carried(B, a).reduce((b: Blow, e) => (e.onAttack ? e.onAttack(b, { ...blow, self: a }) : b), b);
  b = carried(B, d).reduce((b: Blow, e) => (e.onDefend ? e.onDefend(b, { ...blow, self: d }) : b), b);
  const t = B.units[d], from = t.hp, { amount, chance, crit, critAmount } = b;
  const to = A.heal ? Math.min(t.max, from + amount) : Math.max(0, from - amount), critTo = A.heal ? to : Math.max(0, from - critAmount);
  return { act, heal: A.heal, amount: A.heal ? to - from : amount, chance, crit, critAmount: A.heal ? to - from : critAmount, critTo, cost: A.cost, from, to, max: t.max, fell: to === 0 };
}
/* 'victory' once every enemy that took the field has fallen, 'defeat' once every unit of the player's has, else null */
function outcomeOf(B: Battle): Outcome | null {
  if (B.sides.includes('player') && !standing(B, 'player').length) return 'defeat';
  if (B.sides.includes('enemy') && !standing(B, 'enemy').length) return 'victory';
  return null;
}

/* ---------- the phases ---------- */
/* pass play to the next side with units standing, its units fresh; past the last side a new turn begins. Returns
   { turn, phase, newTurn }, or null once the battle is over. Fires onPhaseEnd for the side whose phase it was, then
   onTurnEnd and onTurnStart for everyone if a new turn begins, then onPhaseStart for the side whose phase it is now;
   an effect that ends the battle on the way stops it there. */
function endPhase(B: Battle): PhaseChange | null {
  if (B.outcome) return null;
  const i = SIDES.indexOf(B.phase), turn = (side: Side) => ({ battle: B, side, turn: B.turn }); let newTurn = false;
  settle(B, () => everyone(B, (e, self) => e.onPhaseEnd?.({ ...turn(B.phase), self }), B.phase));
  for (let s = 1; s <= SIDES.length && !B.outcome; s++) {
    const side = SIDES[(i + s) % SIDES.length];
    if (i + s >= SIDES.length && !newTurn) {
      newTurn = true;
      settle(B, () => everyone(B, (e, self) => e.onTurnEnd?.({ ...turn(B.phase), self })));
      B.turn++;
      settle(B, () => everyone(B, (e, self) => e.onTurnStart?.({ ...turn(B.phase), self })));
      if (B.outcome) break;
    }
    if (!standing(B, side).length) continue;
    B.phase = side;
    for (const u of B.units) if (u.side === side) { u.moved = u.acted = false; if (u.hp > 0) u.mp = Math.min(u.mpMax, u.mp + MP_REGEN); }
    settle(B, () => everyone(B, (e, self) => e.onPhaseStart?.({ ...turn(side), self }), side));
    return { turn: B.turn, phase: side, newTurn };
  }
  return { turn: B.turn, phase: B.phase, newTurn };
}

/* new numbers for the units (the unit data page saved): each keeps the damage it has taken and the MP it has spent
   against its new full hit points and MP, takes its new numbers and abilities, and moves to the side its group now
   fights on. units as for createBattle. */
function refresh(B: Battle, units: UnitEntry[]): void {
  units.forEach((n, k) => {
    const u = B.units[k]; if (!u) return;
    const max = Math.max(1, n.hp), lost = u.max - u.hp, mpMax = Math.max(0, n.mp ?? 0), spent = u.mpMax - u.mp;
    u.hp = u.hp > 0 ? Math.max(1, max - lost) : 0; u.max = max; u.side = n.side;
    u.mp = Math.max(0, mpMax - spent); u.mpMax = mpMax; u.stats = statsOf(n); u.abilities = abilitiesOf(n);
  });
  B.sides = SIDES.filter(s => B.units.some(u => u.side === s));
  B.outcome = outcomeOf(B);
}

export { OUTCOME_LABEL, SIDES, SIDE_LABEL, actionOf, actionsOf, alive, allies, canAct, canAfford, canMove, canTarget, canUse, cooldownLeft, createBattle, done, endPhase, foes, forecast, outcomeOf, phaseOver, ready, refresh, sideOfGroup, spend, standing, strike, unspend, wait };
export type { Battle, BattleUnit, Forecast, Mark, Outcome, PhaseChange, StrikeResult, UnitEntry };
