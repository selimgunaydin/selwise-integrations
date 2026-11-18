/**
 * A link that puts THIS install into test mode and into chosen experiment arms —
 * the app's `?selwise_test_mode` and `?selwise_variant=` (apps/client/src/core/
 * experiments.ts), for a merchant who has to see arm B on a phone.
 *
 *     myapp://anything?selwise_test=1&selwise_variant=<experimentId>:<variantId>
 *     myapp://anything?selwise_test=off
 *
 * ## Why it is opt-in
 *
 * A link can be sent by anybody, and what it changes is what the shopper sees:
 * test mode HIDES every live campaign and shows only the ones marked for testing.
 * So it is read only by a client started with `qaLinks: true` (a development or
 * internal build), never by a release a shopper installs.
 *
 * ## What it does NOT do
 *
 * It persists nothing: the override lives for this app session, so a QA link
 * cannot outlive the person who tapped it. A forced arm skips the hash and the
 * traffic gate on the server and the SDK counts no exposure for it (test mode is
 * on), so QA never enters an experiment's numbers.
 */

import { UUID, decode } from './deep-link.js';

/** Same cap as the API's `parseForcedVariants`. */
export const QA_VARIANTS_MAX = 10;

export interface QaOverride {
  /** `true` / `false` when the link said so; `undefined` when it did not mention test mode. */
  testMode?: boolean;
  /** experimentId → variantId. */
  variants: Record<string, string>;
}

/** The QA instruction a link carries, or null when it carries none. */
export function readQaLink(url: string): QaOverride | null {
  const queryAt = typeof url === 'string' ? url.indexOf('?') : -1;
  if (queryAt < 0) return null;
  const query = url.slice(queryAt + 1).replace(/#.*$/, '');

  let testMode: boolean | undefined;
  const variants: Record<string, string> = {};
  let found = false;

  for (const pair of query.split('&')) {
    const equals = pair.indexOf('=');
    const key = decode(equals < 0 ? pair : pair.slice(0, equals)).toLowerCase();
    const value = decode(equals < 0 ? '' : pair.slice(equals + 1)).trim();

    if (key === 'selwise_test') {
      const lowered = value.toLowerCase();
      if (['1', 'true', 'on'].includes(lowered)) testMode = true;
      else if (['0', 'false', 'off'].includes(lowered)) testMode = false;
      else continue;
      found = true;
    } else if (key === 'selwise_variant') {
      const separator = value.indexOf(':');
      if (separator <= 0 || separator === value.length - 1) continue;
      const experimentId = value.slice(0, separator).trim();
      const variantId = value.slice(separator + 1).trim();
      if (!UUID.test(experimentId) || !UUID.test(variantId)) continue;
      if (Object.keys(variants).length >= QA_VARIANTS_MAX && !(experimentId in variants)) continue;
      variants[experimentId.toLowerCase()] = variantId.toLowerCase();
      found = true;
    }
  }

  if (!found) return null;
  // Choosing an arm is QA: test mode goes with it unless the link says otherwise.
  if (testMode === undefined && Object.keys(variants).length > 0) testMode = true;
  return { ...(testMode !== undefined ? { testMode } : {}), variants };
}
