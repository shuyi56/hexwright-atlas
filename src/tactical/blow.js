import { STRIKE, WINDUP } from '../characters/body.js';

/* ================= tactical view: an attack as it plays =================
   What happens on screen when one unit strikes another, beat by beat, as the tactics games play it: the attacker
   winds up (its WINDUP frame, drawing back a little), lunges in and strikes (STRIKE), holds the blow and steps back to
   stand. The target is hit at the impact: it flashes white twice and is knocked back a little, and if the blow
   felled it, it fades to the ghost the fallen stand as; if the blow missed, it does not flash but sways back out of
   the way and steps in again. A melee blow lands as the lunge reaches the target; an arrow
   (shoot) is loosed at the strike and lands when it has flown the distance; a spell (cast) bursts over the target a
   moment after the staff sweeps forward.

   blowPlan gives the times of the beats for an attack (characters/roster.js attackOf) over a distance in tiles, and
   blowAt where everything is at a time t: the attacker's pose and how far it has lunged toward the target, the
   arrow's or the spell's progress, and the target's flash, knockback and fading. Times are seconds at 1× (the view's
   2× chip runs them at double speed); distances are in tiles along the line from attacker to target. Pure (no DOM),
   so tests and the view share it. */
/* how far each kind lunges at its target, in tiles, and how far it draws back first */
const LUNGE = { punch: 0.26, swing: 0.3, chop: 0.3, thrust: 0.34, bite: 0.42, pounce: 0.42, shoot: 0, cast: 0.06 }, PULL = 0.06;
/* tiles an arrow flies a second */
const ARROW_SPEED = 11;
/* how far the target is knocked back, how long it reels, and the ghost a fallen unit fades to */
const KNOCK = 0.1, REEL = 0.3, GHOST = 0.55, DODGE = 0.16;
const FLASH = [[0, 0.06], [0.11, 0.17]];
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/* the beats of an attack of the given kind ({ kind, ranged }) over dist tiles: wind-up from 0, the strike, the
   impact, the step back to standing, and the end, by which the target has finished reeling (and fading, if fell) */
function blowPlan({ kind, ranged }, dist = 1, fell = false, missed = false) {
  let p;
  if (ranged === 'arrow') { const strike = 0.4, impact = strike + Math.max(0.08, dist / ARROW_SPEED); p = { strike, impact, recover: Math.max(0.72, strike + 0.3) }; }
  else if (ranged === 'spell') p = { strike: 0.45, impact: 0.64, recover: 0.9, burst: [0.5, 0.95] };
  else p = { strike: 0.24, impact: 0.3, recover: 0.62 };
  if (ranged === 'arrow') p.flight = [p.strike, p.impact];
  p.kind = kind; p.ranged = ranged || null; p.lunge = LUNGE[kind] ?? LUNGE.swing; p.dist = dist; p.fell = fell && !missed; p.missed = missed;
  p.end = Math.max(p.recover + 0.2, p.impact + (fell ? 0.75 : REEL + 0.05), p.burst ? p.burst[1] : 0);
  return p;
}

/* where everything is at time t: { pose, lunge, missile, burst, spark, hit, flash, knock, alpha, done }. pose is the
   attacker's frame (WINDUP, STRIKE, or 0 standing again); lunge, in tiles toward the target (a little negative as it
   draws back); missile, how far along its flight an arrow is (0 to 1, null when none is in the air); burst, how far
   a spell's burst over the target has played (0 to 1, or null); spark, how far a melee blow's spark at the point of
   contact has played; hit, whether the blow has landed; flash, whether the target shows white; knock, how far it is
   pushed back, in tiles (on a miss, how far it has swayed out of the way); alpha, how solid it stands (fading to the ghost if the blow felled it); done, the attack is
   over. */
function blowAt(p, t) {
  const pose = t < p.strike ? WINDUP : t < p.recover ? STRIKE : 0;
  /* the lunge: drawn back PULL through the wind-up (if it lunges at all), driven forward from the strike to the
     impact, held, then eased home */
  const pull = p.lunge ? PULL : 0;
  const lunge = t < p.strike ? -pull * smooth(t / p.strike)
    : t < p.recover ? -pull + (p.lunge + pull) * smooth((t - p.strike) / Math.max(0.01, p.impact - p.strike))
    : p.lunge * (1 - smooth((t - p.recover) / 0.18));
  const hit = t >= p.impact, since = t - p.impact;
  const missile = p.flight && t >= p.flight[0] && t < p.flight[1] ? (t - p.flight[0]) / (p.flight[1] - p.flight[0]) : null;
  const burst = p.burst && t >= p.burst[0] && t < p.burst[1] ? (t - p.burst[0]) / (p.burst[1] - p.burst[0]) : null;
  const spark = !p.ranged && !p.missed && hit && since < 0.16 ? since / 0.16 : null;
  const flash = !p.missed && hit && FLASH.some(([a, b]) => since >= a && since < b);
  /* a miss: the target sways back as the blow arrives, a little ahead of it, and settles again */
  const knock = p.missed ? (t >= p.impact - 0.08 && t < p.impact - 0.08 + REEL ? DODGE * Math.sin(Math.PI * (t - p.impact + 0.08) / REEL) : 0)
    : hit && since < REEL ? KNOCK * Math.sin(Math.PI * Math.min(1, since / REEL)) * (1 - since / REEL / 2) : 0;
  const alpha = p.fell && hit ? 1 - (1 - GHOST) * smooth((since - 0.25) / 0.45) : 1;
  return { pose, lunge, missile, burst, spark, hit, flash, knock, alpha, done: t >= p.end };
}

/* the facing (as a character's face: 0 +y, 1 +x, 2 -y, 3 -x) that looks from model tile a toward b */
function faceToward([ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 0 : 2);
}

export { ARROW_SPEED, GHOST, KNOCK, LUNGE, blowAt, blowPlan, faceToward };
