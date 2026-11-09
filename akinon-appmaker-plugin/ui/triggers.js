'use strict';

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
 * which on a phone is the app going to the background or a back press on the
 * screen the popup targets. `resolveTrigger` says which runtime signal each
 * strategy waits for, and the renderer subscribes to that signal — it does not
 * guess.
 *
 * `scroll` is the one that degrades: an overlay mounted at the app root does
 * not know the host screen's scroll offset, and no App Maker screen reports it.
 * It is treated as `immediate` and `degraded` is set, so the reason is visible
 * rather than looking like a bug.
 */

const SIGNAL = {
  IMMEDIATE: 'immediate',
  TIMER: 'timer',
  APP_BACKGROUND: 'appBackground',
  EVENT: 'event',
};

/**
 * @returns {{signal: string, delayMs: number, eventName: string|null, degraded: string|null}}
 */
function resolveTrigger(placement) {
  const p = placement || {};
  const strategy = p.triggerStrategy || 'immediate';
  const delayMs = Math.max(0, Number(p.triggerDelaySeconds) || 0) * 1000;

  if (strategy === 'delay') {
    return { signal: delayMs > 0 ? SIGNAL.TIMER : SIGNAL.IMMEDIATE, delayMs, eventName: null, degraded: null };
  }

  if (strategy === 'event') {
    const eventName = typeof p.triggerEventName === 'string' && p.triggerEventName.trim()
      ? p.triggerEventName.trim()
      : null;
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
      degraded: 'scroll depth is not reported by App Maker screens',
    };
  }

  return { signal: SIGNAL.IMMEDIATE, delayMs: 0, eventName: null, degraded: null };
}

/**
 * Types that take over the screen.
 *
 * They are held back until their trigger fires; everything else is furniture
 * and renders as soon as it targets the screen. A merchant who sets no trigger
 * on a popup still expects to see it, so `immediate` is a real answer here, not
 * a missing one.
 */
const MODAL_TYPES = ['exit_intent_popup', 'slide_in', 'popup', 'modal', 'newsletter'];

function isModal(type) {
  return MODAL_TYPES.includes(String(type || ''));
}

module.exports = { SIGNAL, resolveTrigger, isModal, MODAL_TYPES };
