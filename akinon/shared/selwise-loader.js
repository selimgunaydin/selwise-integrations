/**
 * Selwise — multi-market CDN loader for Akinon storefronts
 *
 * ## The problem it solves
 *
 * A Selwise site is one domain, one currency and one product feed. Some Akinon
 * deployments serve many markets from a single build — `pz_next_project` covers
 * 7 countries, 7 currencies and 9 locales — so each market needs its OWN site
 * key.
 *
 * But the injection point is shared: PZ Next reads the script from the
 * `external-gtm` CMS widget and fetches it WITHOUT locale or currency, so every
 * market receives the same snippet. A hardcoded `data-site-key` would send all
 * seven markets' traffic into one site, mixing currencies and catalogues.
 *
 * This loader resolves the key from `location.hostname` instead, so one snippet
 * serves every market correctly.
 *
 * ## Single-market projects
 *
 * Do not use this. Use the plain snippet — it needs no map. Take it verbatim
 * from docs/integration/widget-installation (or the dashboard's Installation
 * panel); all three of its lines are load-bearing, and the command-queue stub
 * in the middle is what keeps an `async` tag from dropping an inline
 * `window.Selwise?.trackOrder(...)` on the order-confirmation page:
 *
 *   <link rel="preconnect" href="https://widget.selwise.com" crossorigin>
 *   <script>window.Selwise=window.Selwise||{};window.Selwise.q=window.Selwise.q||[]; ... </script>
 *   <script async src="https://widget.selwise.com/client.js" data-site-key="KEY"></script>
 *
 * ## Configuration
 *
 * Fill in SITE_KEYS with one entry per production hostname. Keys are matched
 * exactly first, then as a domain suffix, so `brand.pl` also covers
 * `www.brand.pl`. Staging hosts need their own entries — a host that is not
 * matched loads nothing rather than guessing, because guessing would report a
 * staging visit as production revenue.
 */
(function () {
  'use strict';

  /** hostname → Selwise site key. One entry per market. */
  var SITE_KEYS = {
    // 'brand.pl': 'SITE_KEY_PL',
    // 'brand.kz': 'SITE_KEY_KZ',
    // 'brand.com.ua': 'SITE_KEY_UA',
    // 'staging.brand.pl': 'SITE_KEY_PL_STAGING',
  };

  var SCRIPT_URL = 'https://widget.selwise.com/client.js';

  function resolveSiteKey(hostname) {
    var host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!host) return null;

    if (Object.prototype.hasOwnProperty.call(SITE_KEYS, host)) {
      return SITE_KEYS[host];
    }

    // Suffix match so `www.` and other subdomains inherit their market. Longest
    // configured host wins, so `staging.brand.pl` beats `brand.pl`.
    var best = null;
    var bestLength = -1;
    for (var configured in SITE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(SITE_KEYS, configured)) continue;
      var candidate = configured.toLowerCase();
      if (host === candidate || host.slice(-(candidate.length + 1)) === '.' + candidate) {
        if (candidate.length > bestLength) {
          best = SITE_KEYS[configured];
          bestLength = candidate.length;
        }
      }
    }
    return best;
  }

  function load() {
    var siteKey = resolveSiteKey(window.location && window.location.hostname);

    if (!siteKey) {
      // Deliberately quiet in production but explicit in the console: an
      // unmapped host is a configuration gap, not a runtime error.
      if (window.console && console.warn) {
        console.warn(
          '[Selwise] No site key configured for ' +
            (window.location && window.location.hostname) +
            '. Add it to SITE_KEYS in the Selwise loader.'
        );
      }
      return;
    }

    if (document.querySelector('script[data-selwise-loader]')) return;

    var script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.setAttribute('data-site-key', siteKey);
    script.setAttribute('data-selwise-loader', '1');
    (document.head || document.documentElement).appendChild(script);
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    load();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { resolveSiteKey: resolveSiteKey, SITE_KEYS: SITE_KEYS };
  }
})();
