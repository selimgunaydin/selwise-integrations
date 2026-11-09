/**
 * What a link that opened the app says about where the visitor came from —
 * the app's half of what the browser widget reads off `location` on landing.
 *
 * Two things are read, and nothing else:
 *
 * - `sw_sc` — the scenario a Selwise message link carries
 *   (`MESSAGE_ATTRIBUTION_PARAM`, @selwise/messaging-contract). Recorded as a
 *   `click` on entity type `messaging`, keyed by the scenario: the touch the
 *   attribution ledger gives a message (apps/client/src/core/message-landing.ts
 *   is the browser twin and the two must agree).
 * - The campaign parameters — `utm_*` and the ad-click ids — which the
 *   server's traffic-source classifier reads off a visit's first page view
 *   (`trafficSourceSql`, visit-projection-definitions.ts).
 *
 * A deep link can carry anything — a password-reset token, an e-mail in a
 * query string — so the landing URL that is recorded keeps the scheme, host
 * and path and ONLY these parameters. An ad-click id is recorded as present
 * (`gclid=1`), never its value: the classifier asks only whether it is there.
 *
 * Parsed by hand: React Native's `URL` has no `searchParams` on every
 * version an app may run.
 */

/**
 * Restated from @selwise/messaging-contract (private, so not a dependency of
 * this published SDK); `deep-link.spec.ts` fails when the two disagree.
 */
export const MESSAGE_ATTRIBUTION_PARAM = 'sw_sc';

export const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
export type UtmParam = (typeof UTM_PARAMS)[number];

/** Ad-click ids the traffic classifier treats as paid. */
export const CLICK_ID_PARAMS = ['gclid', 'fbclid', 'msclkid'] as const;

/** `MESSAGE_LINK_TRACKING_BOUNDS.valueMax`: no tag value a message link carries is longer (held equal by the spec). */
export const PARAM_VALUE_MAX = 100;
/** The medium kept on the message click, as the browser widget keeps it. */
const MEDIUM_MAX = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeepLinkAttribution {
  /** The link reduced to scheme, host, path and the attribution parameters. */
  landingUrl: string;
  /** The scenario whose message opened the app (lower-case), or null. */
  scenarioId: string | null;
  utm: Partial<Record<UtmParam, string>>;
  /** Which ad-click ids the link carried. */
  clickIds: string[];
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** Null when the link carries nothing about where the visitor came from. */
export function readDeepLinkAttribution(url: string): DeepLinkAttribution | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const withoutFragment = trimmed.split('#')[0] as string;
  const queryAt = withoutFragment.indexOf('?');
  const base = queryAt >= 0 ? withoutFragment.slice(0, queryAt) : withoutFragment;
  const query = queryAt >= 0 ? withoutFragment.slice(queryAt + 1) : '';

  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decode(eq >= 0 ? pair.slice(0, eq) : pair).trim().toLowerCase();
    if (!key || params.has(key)) continue;
    params.set(key, decode(eq >= 0 ? pair.slice(eq + 1) : '').trim());
  }

  const rawScenario = params.get(MESSAGE_ATTRIBUTION_PARAM) ?? '';
  const scenarioId = UUID.test(rawScenario) ? rawScenario.toLowerCase() : null;

  const utm: Partial<Record<UtmParam, string>> = {};
  for (const key of UTM_PARAMS) {
    const value = (params.get(key) ?? '').slice(0, PARAM_VALUE_MAX);
    if (value) utm[key] = value;
  }
  const clickIds = CLICK_ID_PARAMS.filter((key) => Boolean(params.get(key)));

  if (!scenarioId && Object.keys(utm).length === 0 && clickIds.length === 0) return null;

  const kept: string[] = [];
  if (scenarioId) kept.push(`${MESSAGE_ATTRIBUTION_PARAM}=${scenarioId}`);
  for (const key of UTM_PARAMS) {
    if (utm[key]) kept.push(`${key}=${encodeURIComponent(utm[key] as string)}`);
  }
  for (const key of clickIds) kept.push(`${key}=1`);

  return { landingUrl: `${base}?${kept.join('&')}`, scenarioId, utm, clickIds };
}

/** The medium recorded on a message click: lower-case and short, like the browser widget's. */
export function messageMedium(attribution: DeepLinkAttribution): string {
  return (attribution.utm.utm_medium ?? '').toLowerCase().slice(0, MEDIUM_MAX);
}
