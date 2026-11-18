import type { Surface } from '../core/surfaces.js';
import { settleInterrupting } from '../vendor/interrupting-types.js';
import { isModalSurface } from './placement.js';

/**
 * One interrupting surface open on a screen at a time — the widget's rule.
 *
 * Conflict resolution (`resolveConflicts`) is per PLACE, so on its own it would
 * let a newsletter centred on the screen and a slide-in from a bottom corner open
 * together, the slide-in's layer covering the newsletter's close button. What is
 * shared is the shopper's attention, and the rule is the contract's (`settleInterrupting`, the very function the widget's
 * gate asks): what is open stays open until it closes; when nothing is, the
 * highest priority opens (id as the tie-break); the others WAIT — armed, no
 * impression, no cap charge — and open in that order as the open one closes.
 *
 * Plain Node, like `placement.ts`, so it is tested without React Native.
 *
 * `ready` is the surfaces the overlay would draw this render. The ones that
 * interrupt (`isModalSurface`: a popup, a slide-in, a newsletter that is not in a
 * point) go through the rule; everything else is returned as it came.
 */
export interface SettledInterrupting {
  /** What may be drawn: every non-interrupting surface, and the one interrupting surface that is open. */
  drawn: Surface[];
  /** The interrupting surfaces that wait for the open one to close, in the order they open. */
  waiting: Surface[];
  /** The one that holds the screen, to remember for the next render; null when none is ready. */
  openId: string | null;
}

export function settleScreenInterrupting(ready: readonly Surface[], openId: string | null): SettledInterrupting {
  const interrupting = ready.filter(isModalSurface);
  if (interrupting.length === 0) return { drawn: [...ready], waiting: [], openId: null };
  const turn = settleInterrupting(
    interrupting.map((surface) => ({ id: surface.id, priority: surface.placement.priority, surface })),
    openId
  );
  const open = turn.open?.surface ?? null;
  return {
    drawn: ready.filter((surface) => !isModalSurface(surface) || surface === open),
    waiting: turn.waiting.map((entry) => entry.surface),
    openId: open?.id ?? null,
  };
}
