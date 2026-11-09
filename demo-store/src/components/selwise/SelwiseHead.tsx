import { QUEUED_METHODS, selwiseConfig } from '@/lib/selwise/config';

/**
 * The install snippet, rendered into the server HTML.
 *
 * It must be in the raw HTML of `/` and not injected later: Selwise verifies a
 * web channel by fetching the home page and looking for
 * `data-site-key="<key>"` in the bytes. It is the same snippet the dashboard
 * hands a merchant (Channels → the channel → Install) — the
 * queue stub included, without which calls made before client.js arrives are
 * lost.
 */
export function SelwiseHead() {
  const cfg = selwiseConfig();
  if (!cfg.siteKey) return null;
  const widgetOrigin = new URL(cfg.widgetUrl).origin;
  const apiOrigin = new URL(cfg.apiUrl).origin;
  const stub = `window.Selwise=window.Selwise||{};window.Selwise.q=window.Selwise.q||[];${JSON.stringify(QUEUED_METHODS)}.forEach(function(m){if(!window.Selwise[m])window.Selwise[m]=function(){window.Selwise.q.push([m,arguments])}});window.selwiseLayer=window.selwiseLayer||[];`;
  return (
    <>
      <link rel="preconnect" href={widgetOrigin} crossOrigin="" />
      <link rel="preconnect" href={apiOrigin} crossOrigin="" />
      <script dangerouslySetInnerHTML={{ __html: stub }} />
      <script async src={cfg.widgetUrl} data-site-key={cfg.siteKey} />
    </>
  );
}
