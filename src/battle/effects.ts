/* ================= battle: special effects =================
   What an action does beyond its numbers, worked out from the state of the battle at the moment it is used. A skill
   names its effects by id in its file (effects, see data/skills.ts) and its action carries them (Action.effects).
   An effect can do either or both of:
     modify   reshape the blow before it is rolled, from who is where and how they stand: the forecast shows it,
              so what the player sees is what they get
     apply    change the battle after the blow is struck: the user's or anyone's hit points or MP
   Both read the battle as it is (battle/state.ts); modify returns a new blow and leaves the battle alone, apply
   changes it in place. A new effect is one entry in EFFECTS.

   Pure (no DOM), so the battle state, the skill editor, the tests and the view share it. */
import type { Blow } from './actions.ts';
import type { Battle, StrikeResult } from './state.ts';
import type { SkillKind } from '../data/skills.ts';

/* who uses the action on whom, in which battle */
interface EffectContext { battle: Battle; user: number; target: number }
interface SpecialEffect {
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

const EFFECTS: readonly SpecialEffect[] = [
  { id: 'execute', label: 'Execute', note: 'half as hard again on a foe below half its HP', kinds: ['damage'],
    modify: (b, { battle, target }) => { const t = battle.units[target]; return t.hp * 2 < t.max ? scaled(b, 1.5) : b; } },
  { id: 'last-stand', label: 'Last stand', note: 'harder the more HP the user has lost, up to twice as hard', kinds: ['damage'],
    modify: (b, { battle, user }) => { const u = battle.units[user]; return scaled(b, 2 - u.hp / u.max); } },
  { id: 'rally', label: 'Rally', note: 'a tenth harder for each other ally standing', kinds: ['damage'],
    modify: (b, { battle, user }) => { const u = battle.units[user], n = battle.units.filter((o, k) => k !== user && o.side === u.side && o.hp > 0).length; return n ? scaled(b, 1 + n / 10) : b; } },
  { id: 'drain', label: 'Drain', note: 'the user gets back half the damage it deals', kinds: ['damage'],
    apply: (r, { battle, user }) => { const u = battle.units[user]; if (r.landed && u.hp > 0) u.hp = Math.min(u.max, u.hp + Math.floor((r.from - r.to) / 2)); } },
  { id: 'refresh', label: 'Refresh', note: 'the ally gets 4 MP back as well', kinds: ['heal'],
    apply: (r, { battle, target }) => { const t = battle.units[target]; t.mp = Math.min(t.mpMax, t.mp + 4); } }];
const EFFECT_BY_ID: ReadonlyMap<string, SpecialEffect> = new Map(EFFECTS.map(e => [e.id, e]));
const effectOf = (id: string): SpecialEffect | null => EFFECT_BY_ID.get(id) || null;

export { EFFECTS, effectOf };
export type { EffectContext, SpecialEffect };
