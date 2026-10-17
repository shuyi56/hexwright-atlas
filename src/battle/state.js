/* ================= battle: the state of a fight in the tactical view =================
   Who fights on which side, their hit points and MP, the numbers they fight with, the turn and whose phase it is,
   and what each unit has done in it.

   A turn has a phase for each side, the player's first and then the enemy's. The player's side is the unit data's
   characters, the enemy's its enemies (data/units/, src/data/units.js). In a phase every unit of that side still
   standing moves once and acts once (attacks, uses its ability, or waits, which spends both), in either order; the phase ends when
   every one of them is done, or when its side ends it early, and play passes to the other side with its units
   fresh. When the enemy phase ends, the next turn begins with the player's. A side with no units at all (a map of
   villagers only, say) has its phase skipped.

   A blow (battle/abilities.js) is an Attack or the unit's ability: it may miss (Accuracy against the target's
   Evasion), the target's Defense cuts its damage, one that lands may be critical (the attacker's Crit) for more
   (its Crit Damage), and an ability spends MP, which comes back a little each phase. The chances are rolled when the
   blow is struck; a forecast shows the odds and what a hit and a critical hit would do.

   The battle is won when the last enemy falls and lost when the last of the player's units does; after that no one
   moves or acts. Hit points and MP belong to the battle, not the map: a new battle starts everyone full.

   Units are kept by their index in the map's chars, as the view knows them. Pure (no DOM, no map), so tests and the
   view share it. */
import { ATTACK, MP_REGEN, abilityOf, blowOf } from './abilities.js';

const SIDES = ['player', 'enemy'];
const SIDE_LABEL = { player: 'Player turn', enemy: 'Enemy turn' };
const OUTCOME_LABEL = { victory: 'Victory', defeat: 'Defeat' };
/* the side a unit data group fights on */
const sideOfGroup = group => (group === 'enemies' ? 'enemy' : 'player');

/* the numbers a unit fights with, from what the view hands in, filled where it leaves them out */
const statsOf = u => ({ attack: u.attack ?? 0, defense: u.defense ?? 0, accuracy: u.accuracy ?? 100, evasion: u.evasion ?? 0, crit: u.crit ?? 0, critDamage: u.critDamage ?? 150 });
/* a new battle for these units, by index: [{ side, hp, mp, attack, defense, accuracy, evasion, crit, critDamage,
   ability }] with hp and mp their full hit points and MP (the unit data's stats; any left out count as none,
   Accuracy as 100 and Crit Damage as 150) */
function createBattle(units) {
  const B = { turn: 1, phase: SIDES[0], outcome: null, units: units.map(u => ({ side: u.side, hp: Math.max(0, u.hp), max: Math.max(1, u.hp), mp: Math.max(0, u.mp ?? 0), mpMax: Math.max(0, u.mp ?? 0), stats: statsOf(u), ability: u.ability || null, moved: false, acted: false })) };
  /* the sides that took the field, in turn order */
  B.sides = SIDES.filter(s => B.units.some(u => u.side === s));
  if (B.sides.length) B.phase = B.sides[0];
  return B;
}

/* ---------- asking about a unit ---------- */
const alive = (B, k) => !!B.units[k] && B.units[k].hp > 0;
const done = (B, k) => !!B.units[k] && B.units[k].moved && B.units[k].acted;
/* unit k is in play: standing, on the side whose phase it is, with something left to do, and the battle not over */
const ready = (B, k) => !B.outcome && alive(B, k) && B.units[k].side === B.phase && !done(B, k);
const canMove = (B, k) => ready(B, k) && !B.units[k].moved;
const canAct = (B, k) => ready(B, k) && !B.units[k].acted;
/* the indices of a side's units still standing */
const standing = (B, side) => B.units.flatMap((u, k) => (u.side === side && u.hp > 0 ? [k] : []));
const foes = (B, a, d) => alive(B, d) && B.units[a].side !== B.units[d].side;
/* d is another unit of a's side still standing (who a heal can reach) */
const allies = (B, a, d) => a !== d && alive(B, d) && B.units[a].side === B.units[d].side;
/* the action a unit takes by this id: 'attack', or its own ability; null if it has no such ability */
const actionOf = (B, a, id = 'attack') => (id === 'attack' ? ATTACK : B.units[a] && B.units[a].ability === id ? abilityOf(id) : null);
/* who an action of unit a's can be aimed at: a foe, or an ally for a heal */
const canTarget = (B, a, d, id = 'attack') => { const act = actionOf(B, a, id); return !!act && (act.heal ? allies(B, a, d) : foes(B, a, d)); };
/* unit a has the MP for its ability */
const canAfford = (B, a, id) => { const act = actionOf(B, a, id); return !!act && B.units[a].mp >= act.cost; };
/* every unit of the side in play has done all it can */
const phaseOver = B => !B.outcome && standing(B, B.phase).every(k => done(B, k));

/* ---------- what units do ---------- */
/* mark unit k as having moved or acted ('moved' / 'acted'); false (and nothing changed) if it could not */
function spend(B, k, what) {
  if (!(what === 'moved' ? canMove : canAct)(B, k)) return false;
  B.units[k][what] = true; return true;
}
/* take a move back (the view's undo of a walk before acting) */
function unspend(B, k, what) { if (B.units[k] && alive(B, k) && B.units[k].side === B.phase) B.units[k][what] = false; }
/* unit k stays where it is and ends its part in the phase */
function wait(B, k) {
  if (!ready(B, k)) return false;
  B.units[k].moved = B.units[k].acted = true; return true;
}
/* unit a uses action `act` ('attack' or its ability's id) on unit d: a's action for the phase, and the ability's MP.
   roll() gives a number from 0 up to 1, called once for whether the blow lands (it does when the number falls under
   the hit chance; a sure blow spends no roll on it) and, if it does, once for whether it is critical (under the Crit chance). Returns the forecast
   with landed and critical (what came of the rolls), and amount, to and fell as it came out (a miss leaves d's hit
   points as they were), or null if a cannot act, has not the MP, or d is not one it can aim at. */
function strike(B, a, d, act = 'attack', roll = Math.random) {
  if (!canAct(B, a)) return null;
  const r = forecast(B, a, d, act); if (!r) return null;
  const landed = r.chance >= 100 || roll() * 100 < r.chance, critical = landed && r.crit > 0 && roll() * 100 < r.crit;
  B.units[a].mp -= r.cost; B.units[a].acted = true;
  const to = !landed ? r.from : critical ? r.critTo : r.to;
  B.units[d].hp = to;
  B.outcome = outcomeOf(B);
  return { ...r, landed, critical, amount: critical ? r.critAmount : r.amount, to, fell: landed && to === 0 };
}
/* what unit a using action `act` on unit d would come to, without doing it: { act, heal, amount, chance, crit,
   critAmount, critTo, cost, from, to, max, fell }, amount the hit points it takes (or restores) if it lands, chance
   the percent it does, crit the percent of hits that are critical and critAmount and critTo what one takes and
   leaves, cost its MP, from and to d's hit points before and after a plain hit, fell whether a plain hit fells it;
   or null if a has no such action or not the MP, or d is not one it can aim at. The view's preview shows it before
   the blow is struck. */
function forecast(B, a, d, act = 'attack') {
  const A = actionOf(B, a, act); if (!A || !canTarget(B, a, d, act) || B.units[a].mp < A.cost) return null;
  const t = B.units[d], from = t.hp, { amount, chance, crit, critAmount } = blowOf(A, B.units[a].stats, t.stats);
  const to = A.heal ? Math.min(t.max, from + amount) : Math.max(0, from - amount), critTo = A.heal ? to : Math.max(0, from - critAmount);
  return { act, heal: A.heal, amount: A.heal ? to - from : amount, chance, crit, critAmount: A.heal ? to - from : critAmount, critTo, cost: A.cost, from, to, max: t.max, fell: to === 0 };
}
/* 'victory' once every enemy that took the field has fallen, 'defeat' once every unit of the player's has, else null */
function outcomeOf(B) {
  if (B.sides.includes('player') && !standing(B, 'player').length) return 'defeat';
  if (B.sides.includes('enemy') && !standing(B, 'enemy').length) return 'victory';
  return null;
}

/* ---------- the phases ---------- */
/* pass play to the next side with units standing, its units fresh; past the last side a new turn begins. Returns
   { turn, phase, newTurn }, or null once the battle is over. */
function endPhase(B) {
  if (B.outcome) return null;
  const i = SIDES.indexOf(B.phase); let newTurn = false;
  for (let s = 1; s <= SIDES.length; s++) {
    if (i + s >= SIDES.length && !newTurn) { newTurn = true; B.turn++; }
    const side = SIDES[(i + s) % SIDES.length];
    if (!standing(B, side).length) continue;
    B.phase = side;
    for (const u of B.units) if (u.side === side) { u.moved = u.acted = false; if (u.hp > 0) u.mp = Math.min(u.mpMax, u.mp + MP_REGEN); }
    return { turn: B.turn, phase: side, newTurn };
  }
  return { turn: B.turn, phase: B.phase, newTurn };
}

/* new numbers for the units (the unit data page saved): each keeps the damage it has taken and the MP it has spent
   against its new full hit points and MP, takes its new numbers and ability, and moves to the side its group now
   fights on. units as for createBattle. */
function refresh(B, units) {
  units.forEach((n, k) => {
    const u = B.units[k]; if (!u) return;
    const max = Math.max(1, n.hp), lost = u.max - u.hp, mpMax = Math.max(0, n.mp ?? 0), spent = u.mpMax - u.mp;
    u.hp = u.hp > 0 ? Math.max(1, max - lost) : 0; u.max = max; u.side = n.side;
    u.mp = Math.max(0, mpMax - spent); u.mpMax = mpMax; u.stats = statsOf(n); u.ability = n.ability || null;
  });
  B.sides = SIDES.filter(s => B.units.some(u => u.side === s));
  B.outcome = outcomeOf(B);
}

export { OUTCOME_LABEL, SIDES, SIDE_LABEL, actionOf, alive, allies, canAct, canAfford, canMove, canTarget, createBattle, done, endPhase, foes, forecast, outcomeOf, phaseOver, ready, refresh, sideOfGroup, spend, standing, strike, unspend, wait };
