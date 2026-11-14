import { selwiseConfig } from '@/lib/selwise/config';
import { HEAD_BOOTSTRAP_VERSION, headBootstrap } from '@/lib/selwise/head-bootstrap';

/**
 * The install snippet, rendered into the server HTML.
 *
 * It must be in the raw HTML of `/` and not injected later: Selwise verifies a
 * web channel by fetching the home page and looking for
 * `data-site-key="<key>"` in the bytes. It is the same snippet the dashboard
 * hands a merchant (Channels → the channel → Install): the head bootstrap
 * first — the command queue, without which calls made before client.js arrives
 * are lost, and the code that hides what a page experiment is about to change
 * before the page paints — then the async script. Both belong in <head>, as
 * high as possible: below the first paint the bootstrap can only follow a
 * flash, not prevent one.
 */
export function SelwiseHead() {
  const cfg = selwiseConfig();
  if (!cfg.siteKey) return null;
  const widgetOrigin = new URL(cfg.widgetUrl).origin;
  const apiOrigin = new URL(cfg.apiUrl).origin;
  // The store's own data layer array, created beside the bootstrap.
  const bootstrap = `${headBootstrap(cfg.siteKey)}window.selwiseLayer=window.selwiseLayer||[];`;
  return (
    <>
      <script data-selwise-boot={HEAD_BOOTSTRAP_VERSION} dangerouslySetInnerHTML={{ __html: bootstrap }} />
      <link rel="preconnect" href={widgetOrigin} crossOrigin="" />
      <link rel="preconnect" href={apiOrigin} crossOrigin="" />
      <script async src={cfg.widgetUrl} data-site-key={cfg.siteKey} />
    </>
  );
}
