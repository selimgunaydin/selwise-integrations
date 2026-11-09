/**
 * Selwise loader for PZ Next (`@akinon/next`).
 *
 * ## When you need this file
 *
 * You usually do NOT. The preferred install needs no code at all: PZ Next's
 * root layout already prints the raw `head`/`body` HTML of an Omnitron CMS
 * widget called `external-gtm`, so the plain script tag can be pasted there and
 * shipped without a deploy.
 *
 *   pz_next_project/src/app/[commerce]/[locale]/[currency]/layout.tsx
 *     const data = await getWidgetData({ slug: 'external-gtm' });
 *
 * Use this component when the project wants Selwise in source control instead —
 * or when the market→site-key mapping below is easier to review as code than as
 * a CMS blob.
 *
 * ## Install
 *
 * Copy into `src/components/selwise-script.tsx`, fill in SITE_KEYS, then render
 * it inside `<head>` of the root layout, next to the GTM `<Script>`:
 *
 *   import SelwiseScript from '@theme/components/selwise-script';
 *   ...
 *   <head>
 *     <SelwiseScript />
 *   </head>
 *
 * `next/script` with `afterInteractive` keeps it off the critical path; the
 * Selwise entry bundle is 19.9 KB gzip and every heavy module is a lazy chunk,
 * so this does not move LCP or CLS.
 */
import Script from 'next/script';
import { headers } from 'next/headers';

/**
 * Production hostname → Selwise site key.
 *
 * One entry per market. A Selwise site carries one domain, one currency and one
 * product feed, so a multi-market deployment needs one site per market — and
 * `external-gtm` is fetched without locale/currency, so the snippet itself
 * cannot vary. Resolving by host is what makes a single snippet correct for
 * `pz_next_project`'s 7 markets.
 *
 * A host that is not listed loads nothing. That is deliberate: falling back to
 * a default key would file a staging visit as production revenue.
 */
const SITE_KEYS: Record<string, string> = {
  // 'brand.pl': 'SITE_KEY_PL',
  // 'brand.kz': 'SITE_KEY_KZ',
  // 'brand.com.ua': 'SITE_KEY_UA',
};

const WIDGET_ORIGIN = 'https://widget.selwise.com';
const API_ORIGIN = 'https://api.selwise.com';
const WIDGET_URL = `${WIDGET_ORIGIN}/client.js`;

/**
 * Kept as a literal rather than imported from `@selwise/widget-contract`: this
 * file is COPIED into a merchant's Next project, which has no Selwise
 * dependency at all. `pnpm install:snippet:check` compares it against the
 * canonical list so the copy cannot drift.
 */
const SELWISE_COMMAND_QUEUE_STUB =
  "window.Selwise=window.Selwise||{};window.Selwise.q=window.Selwise.q||[];" +
  "['track','trackOrder','identify','setTraits','pushDataLayer','grantConsent'," +
  "'revokeConsent','showConsentPreferences','withdrawConsent','endJourney']" +
  ".forEach(function(m){if(!window.Selwise[m])" +
  "window.Selwise[m]=function(){window.Selwise.q.push([m,arguments])}});";

function resolveSiteKey(host: string | null): string | null {
  const hostname = (host ?? '').toLowerCase().split(':')[0]?.replace(/\.$/, '');
  if (!hostname) return null;

  const exact = SITE_KEYS[hostname];
  if (exact) return exact;

  // Longest suffix match, so `www.brand.pl` inherits `brand.pl` while
  // `staging.brand.pl` can still override it with its own entry.
  let best: string | null = null;
  let bestLength = -1;
  for (const [configured, key] of Object.entries(SITE_KEYS)) {
    const candidate = configured.toLowerCase();
    if (hostname === candidate || hostname.endsWith(`.${candidate}`)) {
      if (candidate.length > bestLength) {
        best = key;
        bestLength = candidate.length;
      }
    }
  }
  return best;
}

export default function SelwiseScript() {
  // `pz-url` is set by @akinon/next's middleware; `host` is the fallback for
  // requests that bypass it.
  const requestHeaders = headers();
  const host = requestHeaders.get('host');
  const siteKey = resolveSiteKey(host);

  if (!siteKey) return null;

  return (
    <>
      {/* DNS + TLS to both hosts, started before anything needs them. Measured
          on a live storefront, the first API call did not begin until 1,782ms,
          most of it connection setup. */}
      <link rel="preconnect" href={WIDGET_ORIGIN} crossOrigin="" />
      <link rel="preconnect" href={API_ORIGIN} crossOrigin="" />

      {/* The command queue, and it is NOT optional here.
          `strategy="afterInteractive"` injects the bundle asynchronously, so a
          PDP or order-confirmation component calling
          `window.Selwise?.trackOrder(...)` during hydration finds nothing and
          the `?.` drops the call in silence. `beforeInteractive` is the wrong
          answer to that — it is render-blocking, which is the problem we are
          fixing. The stub buffers; the widget replays on boot. */}
      <Script id="selwise-queue" strategy="beforeInteractive">
        {SELWISE_COMMAND_QUEUE_STUB}
      </Script>

      <Script
        id="selwise-widget"
        src={WIDGET_URL}
        data-site-key={siteKey}
        strategy="afterInteractive"
      />
    </>
  );
}

export { resolveSiteKey, SITE_KEYS };
