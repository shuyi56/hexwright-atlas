/* ================= battle: special effects =================
   What an action or a unit does beyond its numbers, worked out from the state of the battle. A skill names its
   effects by id in its file (effects, see data/skills.ts); its action carries them (Action.effects), and so does
   every unit whose ability it is, all battle long. An effect is a set of hooks, each optional:

   when its own action is used (user and target in the context)
     modify          reshape the blow before it is rolled; the forecast counts it, so the preview is what happens
     apply           change the battle after the blow is struck

   through the battle's lifecycle, for the unit carrying it (self in the context), while it stands
     onBattleStart   the battle begins
     onTurnStart     a turn begins (every unit), and onTurnEnd as it ends
     onPhaseStart    its side's phase begins, after the MP comes back, and onPhaseEnd as it ends
     onMove          it walks (path, the tiles it walks over), and onMoveUndone when the walk is taken back
     onWait          it waits out the phase
     onAttack        it strikes with any action: reshape the blow going out (counted by the forecast)
     onDefend        it is struck or healed: reshape the blow coming in (counted by the forecast)
     onAbility       it has used its ability
     onHit, onMiss, onCrit     its blow landed, missed, or was critical
     onHurt, onHealed, onDodge it was hit, healed, or a blow missed it
     onKill          its blow felled the target
     onFall          it fell, to a blow or to an effect (even after it stops standing)
     onBattleEnd     the battle is won or lost (every unit, standing or not)
   A hook that reshapes a blow returns a new one and leaves the battle alone; every other hook may change the battle
   in place (hit points, MP, its marks). A unit's marks are a small store for its effects to keep counts between
   hooks. The battle (battle/state.ts) fires every hook and settles who has fallen and whether the battle is over
   after them. A new effect is one entry in EFFECTS.

   Pure (no DOM), so the battle state, the skill editor, the tests and the view share it. */
import type { Action, Blow } from './actions.ts';
import type { Battle, Outcome, StrikeResult } from './state.ts';
import type { Side } from '../data/units.ts';
import type { SkillKind } from '../data/skills.ts';

/* who uses the action on whom, in which battle */
interface EffectContext { battle: Battle; user: number; target: number }
/* the unit a lifecycle hook is for, in which battle */
interface HookContext { battle: Battle; self: number }
interface PhaseContext extends HookContext { side: Side; turn: number }
interface MoveContext extends HookContext { path: readonly unknown[] }
interface BlowContext extends HookContext { attacker: number; target: number; action: Action }
interface StrikeContext extends BlowContext { result: StrikeResult }
interface EndContext extends HookContext { outcome: Outcome }

interface LifecycleHooks {
  onBattleStart?(ctx: HookContext): void;
  onTurnStart?(ctx: PhaseContext): void;
  onTurnEnd?(ctx: PhaseContext): void;
  onPhaseStart?(ctx: PhaseContext): void;
  onPhaseEnd?(ctx: PhaseContext): void;
  onMove?(ctx: MoveContext): void;
  onMoveUndone?(ctx: HookContext): void;
  onWait?(ctx: HookContext): void;
  onAttack?(blow: Blow, ctx: BlowContext): Blow;
  onDefend?(blow: Blow, ctx: BlowContext): Blow;
  onAbility?(ctx: StrikeContext): void;
  onHit?(ctx: StrikeContext): void;
  onMiss?(ctx: StrikeContext): void;
  onCrit?(ctx: StrikeContext): void;
  onHurt?(ctx: StrikeContext): void;
  onHealed?(ctx: StrikeContext): void;
  onDodge?(ctx: StrikeContext): void;
  onKill?(ctx: StrikeContext): void;
  onFall?(ctx: HookContext): void;
  onBattleEnd?(ctx: EndContext): void;
}
type HookName = keyof LifecycleHooks;
interface SpecialEffect extends LifecycleHooks {
  id: string;
  label: string;
  /* a few words on what it does, for the editors and the action's note */
  note: string;
  /* the kinds of skill it makes sense on */
  kinds: readonly SkillKind[];
  modify?(blow: Blow, ctx: EffectContext): Blow;
  apply?(result: StrikeResult, ctx: EffectContext): void;
}

/* a blow with its damage scaled, a critical hit's too */
const scaled = (b: Blow, f: number): Blow => ({ ...b, amount: Math.max(1, Math.round(b.amount * f)), critAmount: Math.max(1, Math.round(b.critAmount * f)) });
const BOTH: readonly SkillKind[] = ['damage', 'heal'];

const EFFECTS: readonly SpecialEffect[] = [
  /* when the skill is used */
  { id: 'execute', label: 'Execute', note: 'half as hard again on a foe below half its HP', kinds: ['damage'],
    modify: (b, { battle, target }) => { const t = battle.units[target]; return t.hp * 2 < t.max ? scaled(b, 1.5) : b; } },
  { id: 'last-stand', label: 'Last stand', note: 'harder the more HP the user has lost, up to twice as hard', kinds: ['damage'],
    modify: (b, { battle, user }) => { const u = battle.units[user]; return scaled(b, 2 - u.hp / u.max); } },
  { id: 'rally', label: 'Rally', note: 'a tenth harder for each other ally standing', kinds: ['damage'],
    modify: (b, { battle, user }) => { const u = battle.units[user], n = battle.units.filter((o, k) => k !== user && o.side === u.side && o.hp > 0).length; return n ? scaled(b, 1 + n / 10) : b; } },
  { id: 'drain', label: 'Drain', note: 'the user gets back half the damage it deals', kinds: ['damage'],
    apply: (r, { battle, user }) => { const u = battle.units[user]; if (r.landed && u.hp > 0) u.hp = Math.min(u.max, u.hp + Math.floor((r.from - r.to) / 2)); } },
  { id: 'refresh', label: 'Refresh', note: 'the ally gets 4 MP back as well', kinds: ['heal'],
    apply: (r, { battle, target }) => { const t = battle.units[target]; t.mp = Math.min(t.mpMax, t.mp + 4); } },
  /* all battle long, for whoever carries it */
  { id: 'regen', label: 'Regenerate', note: 'its carrier gets 3 HP back as each of its phases begins', kinds: BOTH,
    onPhaseStart: ({ battle, self }) => { const u = battle.units[self]; u.hp = Math.min(u.max, u.hp + 3); } },
  { id: 'momentum', label: 'Momentum', note: 'its carrier strikes a twentieth harder for each tile it walked this phase, up to a third', kinds: ['damage'],
    onMove: ({ battle, self, path }) => { battle.units[self].marks.momentum = path.length; },
    onMoveUndone: ({ battle, self }) => { delete battle.units[self].marks.momentum; },
    onPhaseStart: ({ battle, self }) => { delete battle.units[self].marks.momentum; },
    onAttack: (b, { battle, self, action }) => { const n = battle.units[self].marks.momentum || 0; return n && !action.heal ? scaled(b, 1 + Math.min(n * 0.05, 1 / 3)) : b; } },
  { id: 'thorns', label: 'Thorns', note: 'a foe that hits its carrier takes 2 damage back', kinds: BOTH,
    onHurt: ({ battle, attacker }) => { const a = battle.units[attacker]; a.hp = Math.max(0, a.hp - 2); } },
  { id: 'bloodlust', label: 'Bloodlust', note: 'its carrier gets 4 MP back for each foe it fells', kinds: BOTH,
    onKill: ({ battle, self }) => { const u = battle.units[self]; u.mp = Math.min(u.mpMax, u.mp + 4); } }];
const EFFECT_BY_ID: ReadonlyMap<string, SpecialEffect> = new Map(EFFECTS.map(e => [e.id, e]));
const effectOf = (id: string): SpecialEffect | null => EFFECT_BY_ID.get(id) || null;

export { EFFECTS, effectOf };
export type { BlowContext, EffectContext, EndContext, HookContext, HookName, LifecycleHooks, MoveContext, PhaseContext, SpecialEffect, StrikeContext };
