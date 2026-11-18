// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/app-not-shown.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * "Why is this surface not in my app?" — the reasons, named once.
 *
 * Two readers ask that question and must give the same answers:
 *
 * - the dashboard, BEFORE the app runs: `AppVisibilityChecklist` reads the form
 *   and what the app reported (`apps/web/lib/channels/app-visibility.ts`), and
 * - the SDK, WHILE it runs: `Selwise.explain()` returns, per surface on the
 *   current screen, the reason the decision that kept it off the screen
 *   recorded (`packages/react-native/src/core/not-shown.ts`).
 *
 * A reason the two share is one word in both (`screens`, `slot`, `test`…), so a
 * merchant who reads "not on this screen" in the panel and the same code in the
 * device's log is reading one fact. A reason only one of them can know is marked
 * so: the form cannot know a visitor's segment, and the device cannot know the
 * campaign is a draft (the API never sends it).
 *
 * ## What `explain` cannot say, by design
 *
 * The API decides a campaign's SCHEDULE (`deliverableCampaignWhere`) and whether
 * delivery is switched on before anything reaches the device: a campaign outside
 * its window is not in the response, so no device-side code exists for it. The
 * dashboard says it (the campaign's status line); the SDK is silent about what it
 * was never sent.
 *
 * Pure data and one predicate. No imports, so the SDK can vendor it.
 */

/**
 * Where a reason can be known: `form` (the dashboard before the app runs),
 * `runtime` (the SDK deciding on a screen), `both`.
 */
export type AppNotShownOrigin = 'form' | 'runtime' | 'both';

export const APP_NOT_SHOWN_REASONS = {
  // ---- known to both ----
  /** The surface's page targeting does not include this screen (or excludes it). */
  screens: 'both',
  /** The channel cannot draw this type: no renderer for it in the app. */
  type: 'both',
  /** A campaign placed in a point the app does not mount on this screen: drawn there or nowhere. */
  campaignSlot: 'both',
  /** Test mode and the device disagree: a test surface on a device not in test mode, or the reverse. */
  test: 'both',

  // ---- the form's only: the SDK never sees what the API did not send ----
  /** The app has not reported to the dashboard yet. */
  reported: 'form',
  /** The record's status is not live. */
  status: 'form',
  /**
   * A strip's chosen point is not one the app reported mounting. The device does not
   * judge it: a strip is loaded by the point that mounts, so a point nobody mounts
   * asks for nothing and has nothing to say.
   */
  slot: 'form',
  /** A screen the surface names that the app has not shown in a month. */
  seen: 'form',
  /** A screen is both included and excluded. */
  excluded: 'form',

  // ---- the SDK's only: they depend on the visitor ----
  /** Targeting on the device's kind did not match. */
  device: 'runtime',
  /** Targeting on the visitor's country did not match. */
  country: 'runtime',
  /** A rule on what the visitor did (basket value, visits…) did not match. */
  behavior: 'runtime',
  /** The visitor closed it, and the surface's after-close rule keeps it away. */
  dismissed: 'runtime',
  /** The visitor is in the channel's control group: no campaign anywhere. */
  control_group: 'runtime',
  /** The experiment's arm for this visitor draws something else (or nothing) here. */
  experiment_arm: 'runtime',
  /** The visitor is in the experiment's holdout: nothing is drawn, on purpose. */
  experiment_holdout: 'runtime',
  /** The visitor is outside the segment the surface is for (or inside the one it excludes). */
  segment: 'runtime',
  /** The visitor's consent answer does not allow the read this surface needs (their segments). */
  consent: 'runtime',
  /** Nothing the surface could say right now (a state that hides it, an unfillable value, no markup, an expired countdown, a goal bar with nothing to show). */
  content: 'runtime',
  /** Another surface won its dock or window (priority or conflict rule). */
  conflict: 'runtime',
  /** The surface reached its frequency cap. */
  frequency_cap: 'runtime',
  /** A strip with no products to show. */
  empty: 'runtime',
  /** A counter is under its threshold: never "0 kişi". */
  below_min_count: 'runtime',
  /** A counter's number could not be read: a failed read is not a measurement. */
  count_unavailable: 'runtime',
  /** A counter's product is unknown: the screen named none and the counter names none. */
  product_unresolved: 'runtime',
  /** A popup, slide-in or window is waiting for its trigger: armed is not shown, and not a failure. */
  trigger_armed: 'runtime',

  // ---- enrichment: a product block has no screen rule of its own, only a slot name ----
  // (2026-11-18: until now an empty slot printed nothing at all, on the device or in the log.)
  /** The slot name the screen mounts is not among the placement keys the channel's live rules carry. */
  unknown_slot: 'runtime',
  /** The app handed the SDK no WebView, so a block of the merchant's own markup cannot be drawn. */
  no_webview: 'runtime',
  /** The block was loaded but its document never reported a height, so the slot stayed collapsed. */
  no_height: 'runtime',
} as const satisfies Record<string, AppNotShownOrigin>;

export type AppNotShownReason = keyof typeof APP_NOT_SHOWN_REASONS;

type ReasonsOf<O extends AppNotShownOrigin> = {
  [K in AppNotShownReason]: (typeof APP_NOT_SHOWN_REASONS)[K] extends O ? K : never;
}[AppNotShownReason];

const reasonsOf = <O extends AppNotShownOrigin>(origins: readonly O[]): Array<ReasonsOf<O>> =>
  (Object.keys(APP_NOT_SHOWN_REASONS) as AppNotShownReason[]).filter((reason) =>
    (origins as readonly AppNotShownOrigin[]).includes(APP_NOT_SHOWN_REASONS[reason]),
  ) as Array<ReasonsOf<O>>;

/** Every line the dashboard's checklist can print (`channels.visibility.<id>.<level>`). */
export type AppVisibilityCheckId = ReasonsOf<'form' | 'both'>;
export const APP_VISIBILITY_CHECK_IDS: readonly AppVisibilityCheckId[] = reasonsOf<'form' | 'both'>(['form', 'both']);

/** Every code `Selwise.explain()` can return. */
export type AppExplainReason = ReasonsOf<'runtime' | 'both'>;
export const APP_EXPLAIN_REASONS: readonly AppExplainReason[] = reasonsOf<'runtime' | 'both'>(['runtime', 'both']);

/**
 * A reason that is a wait, not a failure: the surface is armed and will show.
 * `explain` says "waiting" for it, and a debug log does not warn.
 */
export const APP_WAITING_REASONS: readonly AppNotShownReason[] = ['trigger_armed'];

export function isWaitingReason(reason: AppNotShownReason): boolean {
  return APP_WAITING_REASONS.includes(reason);
}
