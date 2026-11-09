// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/control-group.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * The channel's GLOBAL CONTROL GROUP: which visitors Selwise shows nothing to,
 * so that what it shows everybody else can be measured against them.
 *
 * ## Why it exists (October 2026)
 *
 * Every revenue figure the panel printed until now is ATTRIBUTED: an order is
 * credited to the surface the same visitor interacted with last within 168
 * hours (`ModuleConversionService`). That is a correlation. A shopper who
 * clicked a recommendation on the way to a basket they had already decided on
 * is credited in full, and the home page said "Selwise earned X" about it. The
 * only honest answer to "what did Selwise ADD" is a group of shoppers who were
 * eligible for every surface and got none, compared with everyone else — the
 * shape of Dynamic Yield's "Personalization Impact" and Insider's Architect
 * control group.
 *
 * ## The rule, and why it is computable everywhere
 *
 *   bucket = fnv1a32(`${channelId}:${visitorId}`) mod 10 000
 *   in the control group  ⇔  bucket < percent × 100
 *
 * Deterministic from two ids nobody has to store, which is the whole design:
 *
 *  - the WIDGET decides from its own `selwise_vid` before any chunk loads
 *    (the widget's performance rules), with nothing but `percent` and the
 *    channel id from `/config`;
 *  - the React Native SDK decides the same way from its stored visitor id
 *    (this file is vendored into it, see `sync-vendored-page-targeting.js`);
 *  - the API classifies any `visitor_id` in `orders` or `tracking_events`
 *    WITHOUT the client having said anything — the SQL function
 *    `selwise_fnv1a_32` (migration `20261010040000_channel_control_group`)
 *    is this function, and `control-group-hash.postgres.spec.ts` holds the
 *    two equal over thousands of ids. A flag on the events (`controlGroup:
 *    true`) is written for debugging only and nothing reads it for a figure:
 *    a cached old `client.js` that never wrote it would otherwise move its
 *    visitors into the wrong group.
 *
 * The channel id is in the seed so a visitor who shops on two channels of one
 * account is not held out of both by construction; the percent is not, so
 * raising 5 → 10 keeps every visitor of the 5% where they were and adds the
 * next 5%. Groups still SHIFT on any change, which is why the API resets the
 * measurement start (`controlGroupStartedAt`) whenever the percent moves: a
 * comparison never spans two percents.
 *
 * ## Why FNV-1a, and why its own copy
 *
 * The storefront entry is measured against a 50KB gzip budget and the SQL side
 * has to be a few lines of PL/pgSQL; FNV-1a is both, and 10 000 buckets over
 * random visitor ids are uniform well within what a 1–20% split needs
 * (`control-group.spec.ts` measures it). It is the same hash as
 * `@selwise/experiment-contract/onsite-assign` but deliberately NOT imported
 * from there: this file is vendored into the published React Native SDK, which
 * cannot depend on a private workspace package, so it imports nothing at all.
 *
 * The input is hashed as UTF-16 code units (`charCodeAt`), exactly like
 * `onsiteBucket`. Visitor ids are uuids in practice; the SQL function handles
 * a non-ASCII id by splitting astral characters into their surrogate pair so
 * the two sides still agree.
 *
 * NOT re-exported from the barrel — subpath only, because the widget entry
 * imports it:
 *   import { … } from '@selwise/widget-contract/control-group'
 */

/** 10 000 buckets, so a percentage is `percent × 100` buckets with no rounding. */
export const CONTROL_GROUP_BUCKET_COUNT = 10_000;

/** The percent a merchant may choose. Above 20 the store gives up too much to measure. */
export const CONTROL_GROUP_PERCENT_MIN = 1;
export const CONTROL_GROUP_PERCENT_MAX = 20;
/** What the settings form suggests when a merchant switches it on. */
export const CONTROL_GROUP_PERCENT_DEFAULT = 5;

/**
 * Below these the comparison is printed but NOT read as a result.
 *
 * The holdout is the small group, so it is the one that runs out: at 5% a
 * channel with 2 000 visitors a month has ~100 held-out visitors, and a
 * revenue-per-visitor difference over a handful of buyers swings by more than
 * the effect being measured. The figures are still returned (an unmeasured
 * number is a dash, a small one is not), with `lowSample` set so the panel
 * says "not yet readable" instead of drawing a confident lift.
 */
export const CONTROL_GROUP_MIN_HOLDOUT_VISITORS = 100;
export const CONTROL_GROUP_MIN_HOLDOUT_BUYERS = 30;

/** FNV-1a 32-bit offset basis. */
export const FNV1A_32_OFFSET_BASIS = 0x811c9dc5;

/**
 * FNV-1a, 32-bit, unsigned, continued from `basis`.
 *
 * `basis` lets a caller hash a fixed prefix once and continue from its state:
 * the API hashes `${channelId}:` in JavaScript and hands the state to SQL, so
 * Postgres hashes only the visitor id of every row (half the work).
 */
export function fnv1a32(input: string, basis: number = FNV1A_32_OFFSET_BASIS): number {
  let hash = basis >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // `Math.imul` keeps the multiply in 32-bit integer space; a plain `*`
    // loses the low bits once the product passes 2^53.
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned: `% n` of a negative number is negative in JavaScript.
  return hash >>> 0;
}

/** The FNV state after `${channelId}:` — what the SQL side continues from. */
export function controlGroupSeedBasis(channelId: string): number {
  return fnv1a32(`${channelId}:`);
}

/** The visitor's bucket on this channel, 0–9999. */
export function controlGroupBucket(channelId: string, visitorId: string): number {
  return fnv1a32(visitorId, controlGroupSeedBasis(channelId)) % CONTROL_GROUP_BUCKET_COUNT;
}

/**
 * The stored percent as the rule reads it: an integer 1–20, or null (= off).
 *
 * Every reader goes through this, so a hand-written 0, a 35 or a "5" never
 * holds out a share of traffic the form could not have saved.
 */
export function normalizeControlGroupPercent(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) return null;
  if (parsed < CONTROL_GROUP_PERCENT_MIN || parsed > CONTROL_GROUP_PERCENT_MAX) return null;
  return parsed;
}

/** Buckets below this are the control group. 0 when the group is off. */
export function controlGroupThreshold(percent: unknown): number {
  const normalized = normalizeControlGroupPercent(percent);
  return normalized === null ? 0 : normalized * (CONTROL_GROUP_BUCKET_COUNT / 100);
}

/**
 * Is this visitor held out on this channel?
 *
 * False whenever anything is missing — no channel id, no visitor id, the group
 * off. A visitor we cannot classify is shown the personalisation: failing
 * CLOSED here would blank a storefront for a reason the merchant cannot see.
 */
export function isInControlGroup(
  channelId: string | null | undefined,
  visitorId: string | null | undefined,
  percent: unknown,
): boolean {
  if (!channelId || !visitorId) return false;
  const threshold = controlGroupThreshold(percent);
  if (threshold <= 0) return false;
  return controlGroupBucket(channelId, visitorId) < threshold;
}

/**
 * What `/config` carries: present only while the group is on.
 *
 * `channelId` rides along because the widget knows its channel only by its
 * public key, and the key is rotatable — seeding the hash with it would
 * reshuffle every visitor on a key rotation.
 */
export interface ControlGroupConfig {
  percent: number;
  channelId: string;
}

/** Read `/config`'s `controlGroup` field; null when absent, malformed or off. */
export function readControlGroupConfig(value: unknown): ControlGroupConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const percent = normalizeControlGroupPercent(record.percent);
  const channelId = typeof record.channelId === 'string' ? record.channelId.trim() : '';
  if (percent === null || !channelId) return null;
  return { percent, channelId };
}
