/**
 * When a surface should appear.
 *
 * ## The honest mapping
 *
 * Four of the five trigger strategies were designed for a browser and three of
 * them carry over unchanged. `exit_intent` does not: there is no pointer to
 * leave the viewport. Pretending otherwise — firing it on a timer, say — would
 * make an "are you leaving?" popup interrupt someone who is still shopping,
 * which is worse than not showing it.
 *
 * So it is mapped to the app's real equivalent: the moment the visitor leaves,
 * which on a phone is the app going to the background (`AppState` `background`
 * — NOT `inactive`: iOS reports `inactive` for the control centre, a permission
 * dialog or the app switcher peek, none of which is the visitor leaving, and an
 * "are you leaving?" popup that fires on a system dialog is the wrong popup at
 * the wrong time; `leavesApp` is the one place that says which states count).
 * `resolveTrigger` says which runtime signal each strategy waits for, and the
 * renderer subscribes to that signal — it does not guess.
 *
 * `scroll` is the one that degrades: an overlay mounted at the app root does
 * not know the host screen's scroll offset. It is treated as `immediate` and
 * `degraded` is set, so the reason is visible rather than looking like a bug.
 */

import {
  INTERRUPTING_CAMPAIGN_TYPES,
  LEGACY_INTERRUPTING_TYPE_ALIASES,
  isInterruptingCampaignType,
} from '../vendor/interrupting-types.js';

export const SIGNAL = {
  IMMEDIATE: 'immediate',
  TIMER: 'timer',
  APP_BACKGROUND: 'appBackground',
  EVENT: 'event',
} as const;

export type TriggerSignal = (typeof SIGNAL)[keyof typeof SIGNAL];

/**
 * Does this `AppState` mean the visitor left the app? Only `background` does:
 * `inactive` is iOS's transient state (control centre, a system dialog, the
 * switcher) and the app is still in front of them.
 */
export function leavesApp(state: string): boolean {
  return state === 'background';
}

export interface ResolvedTrigger {
  signal: TriggerSignal;
  delayMs: number;
  eventName: string | null;
  degraded: string | null;
}

/** What a trigger is read from: a surface's placement, or anything shaped like one. */
export interface TriggerPlacement {
  triggerStrategy?: string;
  triggerDelaySeconds?: number;
  triggerScrollPercent?: number;
  triggerEventName?: string | null;
}

export function resolveTrigger(placement?: TriggerPlacement | null): ResolvedTrigger {
  const p: TriggerPlacement = placement || {};
  const strategy = p.triggerStrategy || 'immediate';
  const delayMs = Math.max(0, Number(p.triggerDelaySeconds) || 0) * 1000;

  if (strategy === 'delay') {
    return { signal: delayMs > 0 ? SIGNAL.TIMER : SIGNAL.IMMEDIATE, delayMs, eventName: null, degraded: null };
  }

  if (strategy === 'event') {
    const eventName =
      typeof p.triggerEventName === 'string' && p.triggerEventName.trim() ? p.triggerEventName.trim() : null;
    return eventName
      ? { signal: SIGNAL.EVENT, delayMs: 0, eventName, degraded: null }
      : {
          signal: SIGNAL.IMMEDIATE,
          delayMs: 0,
          eventName: null,
          degraded: 'event strategy with no event name',
        };
  }

  if (strategy === 'exit_intent') {
    // The app's real "leaving" signal. A timer would interrupt someone who is
    // still shopping, which is worse than not showing the popup at all.
    return { signal: SIGNAL.APP_BACKGROUND, delayMs: 0, eventName: null, degraded: null };
  }

  if (strategy === 'scroll') {
    return {
      signal: SIGNAL.IMMEDIATE,
      delayMs: 0,
      eventName: null,
      degraded: "scroll depth is not reported: an overlay mounted at the app root does not know a screen's scroll offset",
    };
  }

  return { signal: SIGNAL.IMMEDIATE, delayMs: 0, eventName: null, degraded: null };
}

/**
 * Types that take over the screen: the contract's interrupting types
 * (`interrupting-types`, the dashboard's and the widget's list) and the two
 * spellings an app's own surface list used for a popup.
 *
 * They are held back until their trigger fires; everything else is furniture
 * and renders as soon as it targets the screen. A merchant who sets no trigger
 * on a popup still expects to see it, so `immediate` is a real answer here, not
 * a missing one.
 */
export const MODAL_TYPES: readonly string[] = [...INTERRUPTING_CAMPAIGN_TYPES, ...LEGACY_INTERRUPTING_TYPE_ALIASES];

export function isModal(type: unknown): boolean {
  return isInterruptingCampaignType(type);
}
