// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/segment-targeting.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Segment targeting's decision rule — the ONE place "is this visitor shown a
 * surface aimed at these segments" is answered.
 *
 * ## Three answers, not two
 *
 * Membership of a segment is `true` (in it), `false` (not in it) or `null`
 * (UNKNOWN: the segment is gone, switched off or deleted, or the question could
 * not be answered — a failed request, a read that errored). It used to be a
 * boolean, and "not a member" and "could not be asked" were the same `false`.
 * For an `include` rule that is harmless (nobody is shown, which is also the
 * safe direction). For an `exclude` rule it is a leak: a campaign that hides
 * "Employees" from a discount showed it to the employees the moment the segment
 * was switched off or the segment request failed, because "in no segment"
 * means "show".
 *
 * ## The rule
 *
 *  - `all` (or no segments, or an unknown mode): shown.
 *  - `include`: shown when the visitor is in AT LEAST ONE segment (`true`).
 *    An unknown one does not admit anybody.
 *  - `exclude`: shown only when the visitor is in NONE (no `true`) AND no
 *    segment is unknown. An unknown membership might be exactly the one the
 *    merchant meant to keep out, so the surface fails CLOSED.
 *
 * A segment id the answer does not mention is unknown too: asking about three
 * segments and hearing about two is not "not a member of the third".
 *
 * ## What stays `false` on purpose
 *
 * A visitor who has not allowed personalization is "in no segment" — `false`,
 * for every segment, not `null`. That is a decision, not a failure to answer:
 * their profile is not read to choose what they see, so an `exclude` campaign
 * reaches them like everyone else (the audience it hides from is made of people
 * whose membership could be read), and an `include` one does not. The callers
 * that make that decision (the widget's `SegmentManager`, the app's
 * `SegmentGate`) say so where they make it.
 *
 * Pure and dependency-free: the app SDK vendors this file
 * (`scripts/sync-vendored-page-targeting.js`), so it must import nothing. The
 * widget, the SDK and the API's scenario entry all call it — a copy of the
 * rule is how a surface on the web and the same campaign in the app would reach
 * different people.
 */

/** In the segment, not in it, or not known. */
export type SegmentMembership = boolean | null;

export type SegmentTargetingMode = 'all' | 'include' | 'exclude';

/**
 * One segment's answer as a membership. Only a real boolean is an answer;
 * anything else — `null`, a missing key, a string, a number — is unknown, so a
 * malformed response can never read as "not a member".
 */
export function segmentMembershipOf(
  results: Readonly<Record<string, unknown>> | null | undefined,
  segmentId: string
): SegmentMembership {
  if (!results || typeof results !== 'object') return null;
  const answer = results[segmentId];
  return answer === true ? true : answer === false ? false : null;
}

/** Which of `ids` the answer leaves unknown (see {@link segmentMembershipOf}). */
export function unknownSegmentIds(
  ids: readonly string[],
  results: Readonly<Record<string, unknown>> | null | undefined
): string[] {
  return ids.filter((id) => segmentMembershipOf(results, id) === null);
}

/**
 * Whether a surface targeted at `ids` in `mode` is shown, given each segment's
 * membership. See the file header for the rule and its reasons.
 */
export function segmentTargetingVerdict(
  mode: string | null | undefined,
  ids: readonly string[],
  results: Readonly<Record<string, unknown>> | null | undefined
): boolean {
  if ((mode !== 'include' && mode !== 'exclude') || ids.length === 0) return true;

  let member = false;
  let unknown = false;
  for (const id of ids) {
    const membership = segmentMembershipOf(results, id);
    if (membership === true) member = true;
    else if (membership === null) unknown = true;
  }

  return mode === 'include' ? member : !member && !unknown;
}
