import type { AppExplainReason } from '../vendor/app-not-shown.js';

/**
 * Each reason `Selwise.explain()` can return, in a sentence a developer reads on
 * the device. The codes are the dashboard's (`vendor/app-not-shown.ts`); typing
 * this table over that list means a reason added there does not compile here
 * until it has its sentence.
 *
 * Plain TypeScript with no `react-native` import.
 */
export const DEBUG_REASON_TEXT: Record<AppExplainReason, string> = {
  screens: 'Its page targeting does not include this screen, or excludes it.',
  type: 'This app has no renderer for its type.',
  campaignSlot: 'It is placed in a point this screen does not mount (<SelwiseSlot>).',
  test: 'Test mode and this device disagree: a test surface on a device not in test mode, or the reverse.',
  device: 'Its targeting on the kind of device did not match.',
  country: "Its targeting on the visitor's country did not match.",
  behavior: 'A rule on what the visitor did (basket value, visits...) did not match.',
  dismissed: 'The visitor closed it, and its after-close rule keeps it away.',
  control_group: "This visitor is in the channel's control group: no campaign is shown.",
  experiment_arm: "The experiment's arm for this visitor draws something else (or nothing) here.",
  experiment_holdout: "This visitor is in the experiment's holdout: nothing is drawn, on purpose.",
  segment: 'The visitor is outside the segment it is for, or inside the one it excludes.',
  consent: "The visitor's consent answer does not allow the read this surface needs.",
  content: 'It had nothing to say right now (a state that hides it, an unfillable value, no markup, an ended countdown).',
  conflict: 'Another surface won its dock or window (priority or conflict rule).',
  frequency_cap: 'It reached its frequency cap.',
  empty: 'The strip has no products to show.',
  below_min_count: 'The counter is under its threshold, so it says nothing.',
  count_unavailable: 'The counter number could not be read.',
  product_unresolved: 'The counter has no product: the screen named none and the counter names none.',
  trigger_armed: 'Waiting for its trigger (a delay, an event, leaving the app). It will show.',
  unknown_slot: "No live rule of this channel is placed in this slot name; check the rule's placement key.",
  no_webview: "The app passed no WebView to <SelwiseProvider host>, so a merchant's own markup cannot be drawn.",
  no_height: 'The block loaded but its document never reported a height, so the slot stayed collapsed.',
};

/** The sentence for a reason, or the code itself for one this build predates. */
export function debugReasonText(reason: string): string {
  return (DEBUG_REASON_TEXT as Record<string, string | undefined>)[reason] ?? reason;
}
