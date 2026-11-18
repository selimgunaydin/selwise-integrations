// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/interrupting-types.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * The campaign types that INTERRUPT: they come over what the shopper is doing
 * and are armed by a modal trigger (exit intent, a delay, scroll depth, an
 * event), instead of sitting in the page like a bar or a card.
 *
 * Why one list: the app SDK held its own (`MODAL_TYPES`, to hold such a surface
 * back until its trigger fires) and the dashboard and widget each knew the same
 * three types through `OPTIONAL_TRIGGER_TYPES` and a literal `exit_intent_popup`
 * check. A welcome modal made from a template re-opened every time the shopper
 * came back to the home screen on 2026-11-18 (web and app alike) because a
 * campaign of ANY type starts with no frequency cap; what an interrupting type
 * should start with is decided here, once, beside what an interrupting type IS.
 *
 * Pure and dependency-free: the SDK vendors this file
 * (`scripts/sync-vendored-page-targeting.js`), so it must import nothing.
 */

/**
 * The interrupting members of `WidgetType`. `slide_in` and `newsletter` take the
 * popup's trigger fields too but do not default to one (`OPTIONAL_TRIGGER_TYPES`
 * in `validators.ts`): they are in this list because they still arrive on top of
 * the page, and a newsletter card placed at a selector draws inline — the cap
 * default is a starting value the merchant sees and can switch off.
 */
export const INTERRUPTING_CAMPAIGN_TYPES = ['exit_intent_popup', 'slide_in', 'newsletter'] as const;

/**
 * Spellings an app screen's surface may carry for a popup that are not
 * `WidgetType` members (they never reach the dashboard or the widget; an app
 * host's own surface list used them). Interrupting like the types above.
 */
export const LEGACY_INTERRUPTING_TYPE_ALIASES = ['popup', 'modal'] as const;

const INTERRUPTING = new Set<string>([...INTERRUPTING_CAMPAIGN_TYPES, ...LEGACY_INTERRUPTING_TYPE_ALIASES]);

/** True for a type that covers the page and waits for a modal trigger. Accepts anything: a missing type is not one. */
export function isInterruptingCampaignType(type: unknown): boolean {
  return typeof type === 'string' && INTERRUPTING.has(type);
}

/** The cap an interrupting campaign starts with: once per session. */
export const DEFAULT_INTERRUPTING_FREQUENCY_CAP = { perSession: 1 } as const;

/**
 * One interrupting surface at a time.
 *
 * Conflict resolution is per PLACE (a position, a selector, a point): a
 * newsletter centred on the screen and a slide-in from the bottom corner are two
 * places, so on its own nothing makes them compete, and both could open at once
 * with the slide-in's transparent layer covering the newsletter's close button.
 * What interrupts the shopper is not a place, it is
 * their attention: at most ONE interrupting surface is open on a page (web) or a
 * screen (app) at any moment.
 *
 * The rule, the same on both sides:
 *
 * - a surface that is open stays open until it closes — a better candidate that
 *   becomes ready later never replaces what the shopper is already looking at;
 * - when nothing is open, the candidate the conflict rules prefer opens: the
 *   highest `priority`, the id as the stable tie-break (the same order
 *   `ConflictResolver` and the app's `resolveConflicts` use);
 * - the others WAIT (they are not skipped): they stay armed and open, in this
 *   same order, as soon as the open one closes. Waiting is not showing, so a
 *   waiting surface has no impression and spends no frequency-cap allowance.
 *
 * A conflict behaviour of `all` does not lift this: it lets bars share a dock;
 * two overlays on top of each other is the defect, not a layout choice.
 *
 * Pure. The widget asks it from `modules/renderer/utils/interrupting-gate.ts`
 * (a trigger fired, a surface closed), the app from `ui/interrupting.ts` (the
 * surfaces whose trigger has fired, on every render).
 */
export interface InterruptingContender {
  id: string;
  priority?: number | null;
}

export interface InterruptingTurn<T extends InterruptingContender> {
  /** The one that may be open now, or null when nothing is ready. */
  open: T | null;
  /** The ones that wait, in the order they will open. */
  waiting: T[];
}

export function settleInterrupting<T extends InterruptingContender>(
  ready: readonly T[],
  openId?: string | null,
): InterruptingTurn<T> {
  const order = [...ready].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const holder = openId ? order.find((entry) => entry.id === openId) : undefined;
  const open = holder ?? order[0] ?? null;
  return { open, waiting: order.filter((entry) => entry !== open) };
}
