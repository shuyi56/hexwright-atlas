/* ================= battle: the state of a fight in the tactical view =================
   Who fights on which side, their hit points, the turn and whose phase it is, and what each unit has done in it.

   A turn has a phase for each side, the player's first and then the enemy's. The player's side is the unit data's
   characters, the enemy's its enemies (data/units/, src/data/units.js). In a phase every unit of that side still
   standing moves once and acts once (attacks, or waits, which spends both), in either order; the phase ends when
   every one of them is done, or when its side ends it early, and play passes to the other side with its units
   fresh. When the enemy phase ends, the next turn begins with the player's. A side with no units at all (a map of
   villagers only, say) has its phase skipped.

   The battle is won when the last enemy falls and lost when the last of the player's units does; after that no one
   moves or acts. Hit points belong to the battle, not the map: a new battle starts everyone full.

   Units are kept by their index in the map's chars, as the view knows them. Pure (no DOM, no map), so tests and the
   view share it. */
const SIDES = ['player', 'enemy'];
const SIDE_LABEL = { player: 'Player turn', enemy: 'Enemy turn' };
const OUTCOME_LABEL = { victory: 'Victory', defeat: 'Defeat' };
/* the side a unit data group fights on */
const sideOfGroup = group => (group === 'enemies' ? 'enemy' : 'player');

/* a new battle for these units, by index: [{ side, hp }] with hp their full hit points */
function createBattle(units) {
  const B = { turn: 1, phase: SIDES[0], outcome: null, units: units.map(u => ({ side: u.side, hp: Math.max(0, u.hp), max: Math.max(1, u.hp), moved: false, acted: false })) };
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
/* unit a strikes unit d for dmg: a's action for the phase. Returns { dmg, from, to, max, fell } (from and to its hit
   points before and after), or null if a cannot act or d is not a foe standing. */
function strike(B, a, d, dmg) {
  if (!canAct(B, a) || !foes(B, a, d)) return null;
  const t = B.units[d], from = t.hp; dmg = Math.max(0, Math.round(dmg));
  t.hp = Math.max(0, from - dmg); B.units[a].acted = true;
  B.outcome = outcomeOf(B);
  return { dmg, from, to: t.hp, max: t.max, fell: t.hp === 0 };
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
    for (const u of B.units) if (u.side === side) u.moved = u.acted = false;
    return { turn: B.turn, phase: side, newTurn };
  }
  return { turn: B.turn, phase: B.phase, newTurn };
}

/* new numbers for the units (the unit data page saved): each keeps the damage it has taken against its new full hit
   points, and moves to the side its group now fights on. units as for createBattle. */
function refresh(B, units) {
  units.forEach((n, k) => {
    const u = B.units[k]; if (!u) return;
    const max = Math.max(1, n.hp), lost = u.max - u.hp;
    u.hp = u.hp > 0 ? Math.max(1, max - lost) : 0; u.max = max; u.side = n.side;
  });
  B.sides = SIDES.filter(s => B.units.some(u => u.side === s));
  B.outcome = outcomeOf(B);
}

export { OUTCOME_LABEL, SIDES, SIDE_LABEL, alive, canAct, canMove, createBattle, done, endPhase, foes, outcomeOf, phaseOver, ready, refresh, sideOfGroup, spend, standing, strike, unspend, wait };
