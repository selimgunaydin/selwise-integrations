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
