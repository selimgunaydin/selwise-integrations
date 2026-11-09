// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/tracking-contract/src/traffic-source.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/tracking-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Where a visit came from — the ONE classifier.
 *
 * It used to be written twice: the widget's `classifyReferrer` (what the
 * anonymous audience ping and the targeting signals carry) and the visit
 * projection's `trafficSourceSql` (what Reports and `visit_daily` store). The
 * live layer needed a third, server-side reading of the same rule; instead
 * the lists live here and every reader builds on them:
 *
 * - the widget calls {@link trafficSourceOf} with `location.href` and
 *   `document.referrer`;
 * - the API's live layer calls it with the page view's `pageUrl` and
 *   `metadata.referrer`;
 * - `trafficSourceSql` builds its patterns from the same constants.
 *
 * Only the CLASS is ever kept; the referring address is never stored.
 * Dependency-free and its own subpath: the widget's entry imports it.
 */

export const TRAFFIC_SOURCES = ['direct', 'search', 'social', 'paid', 'referral', 'unknown'] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

/** Ad-click ids whose presence on the landing URL makes a visit paid. */
export const PAID_CLICK_PARAMS: readonly string[] = ['gclid', 'fbclid', 'msclkid'];

/** `utm_medium` values that make a visit paid (compared lower case). */
export const PAID_UTM_MEDIUMS: readonly string[] = ['cpc', 'ppc', 'paid'];

/** Host name stems of search engines (`google.` matches google.com.tr). */
export const SEARCH_HOST_STEMS: readonly string[] = ['google', 'bing', 'yahoo', 'duckduckgo', 'yandex', 'baidu', 'ecosia'];

/** Host name stems of social networks (escaped for a regular expression). */
export const SOCIAL_HOST_STEMS: readonly string[] = [
  'facebook',
  'instagram',
  'twitter',
  'x\\.com',
  't\\.co',
  'linkedin',
  'pinterest',
  'tiktok',
  'reddit',
  'youtube',
];

/** The host pattern of a stem list, as the widget and Postgres both read it: `(a|b|c)\.`. */
export function hostStemPattern(stems: readonly string[]): string {
  return `(${stems.join('|')})\\.`;
}

// Built once: the widget classifies every page and the API every landing page view.
const PAID_CLICK_RE = new RegExp(`[?&](${PAID_CLICK_PARAMS.join('|')})=`, 'i');
const UTM_MEDIUM_RE = /[?&]utm_medium=([^&#]*)/;
const SEARCH_HOST_RE = new RegExp(hostStemPattern(SEARCH_HOST_STEMS));
const SOCIAL_HOST_RE = new RegExp(hostStemPattern(SOCIAL_HOST_STEMS));

function hostOf(url: string): string | null {
  const match = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/:?#]+)/.exec(url);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * The class of a visit from its landing page and referrer.
 *
 * `referrer` undefined means NOT MEASURED (a page view whose metadata had no
 * referrer key — the 2 KB budget dropped it, or another sender): `unknown`,
 * because an unmeasured source is not a direct visit. An empty string is a
 * measured absence of referrer: `direct`.
 */
export function trafficSourceOf(input: { pageUrl: string | null | undefined; referrer: string | null | undefined }): TrafficSource {
  const url = input.pageUrl ?? '';
  if (PAID_CLICK_RE.test(url)) return 'paid';
  const medium = (UTM_MEDIUM_RE.exec(url)?.[1] ?? '').toLowerCase();
  if (PAID_UTM_MEDIUMS.includes(medium)) return 'paid';

  if (input.referrer === undefined || input.referrer === null) return 'unknown';
  const referrer = input.referrer;
  if (referrer === '') return 'direct';
  const host = hostOf(referrer);
  if (!host) return 'referral';
  if (host === hostOf(url)) return 'direct';
  if (SEARCH_HOST_RE.test(host)) return 'search';
  if (SOCIAL_HOST_RE.test(host)) return 'social';
  return 'referral';
}
