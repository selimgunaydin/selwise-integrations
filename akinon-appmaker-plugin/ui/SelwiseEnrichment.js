'use strict';

/**
 * The merchant's own content for a product, in one named slot.
 *
 * ## What this is for
 *
 * Product enrichment is the module a merchant touches most: a spec table, a
 * care guide, a size note, a shipping promise — their markup, their styling,
 * filled in per product from the catalogue feed. It is also completely
 * free-form, which is why it renders in a WebView rather than being translated
 * into native components: there is no native equivalent of arbitrary CSS, and
 * a translated subset would render some merchants' blocks and quietly mangle
 * others.
 *
 * ## Placement is a NAME, and that is what makes it dynamic
 *
 * A web rule is placed by CSS selector. A screen has no DOM, so it declares a
 * slot NAME and the merchant writes the same name on the rule. Nothing about
 * the app changes when they add, remove or rewrite a rule — no release, no
 * config, no deploy. `plugin.enrichmentSlots()` lists the names they have
 * actually used, so the two sides do not have to guess at a convention.
 *
 * ```js
 * <SelwiseEnrichment code={product.sku} slot="pdp-specs" />
 * ```
 *
 * ## Reserved height
 *
 * A block can declare one, and it is used until the document measures itself.
 * Without it the screen renders at zero height and then jumps — which on a
 * product screen means the visitor's thumb lands on something that moved.
 */

const React = require('react');
const { StyleSheet, View } = require('react-native');

const {
  buildEnrichmentDocument,
  parseEnrichmentMessage,
} = require('./enrichment-document.js');

const h = React.createElement;

let WebView = null;
let webViewMissingReason = null;
try {
  // eslint-disable-next-line global-require
  const module_ = require('react-native-webview');
  WebView = (module_ && (module_.WebView || module_.default)) || null;
  if (!WebView) webViewMissingReason = 'react-native-webview exported no WebView';
} catch (error) {
  webViewMissingReason = 'react-native-webview is not installed';
}

function tallestReservation(items) {
  let tallest = 0;
  for (const item of items) {
    const value = Number(item && item.reservedHeightPx);
    if (Number.isFinite(value) && value > tallest) tallest = value;
  }
  return tallest;
}

function SelwiseEnrichment(props) {
  const { plugin, code, slot, style, theme, onNavigate } = props;

  const [items, setItems] = React.useState([]);
  const [height, setHeight] = React.useState(0);
  const seen = React.useRef(new Set());

  const productCode = String(code || '').trim();
  const slotName = String(slot || '').trim();

  React.useEffect(() => {
    let cancelled = false;
    // A new product means the previous product's content must go immediately,
    // not when the next fetch lands — showing one product's spec table under
    // another's title is worse than showing nothing.
    setItems([]);
    setHeight(0);
    seen.current = new Set();

    if (!plugin || !plugin.selwise || !productCode || !slotName) return undefined;

    const load = () => {
      plugin.selwise
        .getEnrichment(productCode, [slotName])
        .then((result) => {
          if (cancelled) return;
          const forSlot = plugin.selwise.enrichmentForSlot(result, slotName);
          setItems(forSlot);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    };

    if (plugin.ready) plugin.ready.then(load);
    else load();

    return () => {
      cancelled = true;
    };
  }, [plugin, productCode, slotName]);

  const document_ = React.useMemo(
    () => buildEnrichmentDocument(items, theme || (plugin && plugin.enrichmentTheme())),
    [items, theme, plugin]
  );

  // The impression belongs to the moment content became visible, and one per
  // RULE however many blocks it stacks — the server puts a rule's blocks into
  // one root for exactly that reason.
  React.useEffect(() => {
    if (!plugin || !plugin.selwise || !document_) return;
    for (const item of items) {
      if (seen.current.has(item.assignmentId)) continue;
      seen.current.add(item.assignmentId);
      plugin.selwise.trackEnrichmentView(item);
    }
  }, [plugin, document_, items.map((item) => item.assignmentId).join(',')]);

  if (!document_) return null;

  if (!WebView) {
    // Said once, with the reason. A merchant whose spec table does not appear
    // needs to know it is a missing dependency and not their markup.
    if (!SelwiseEnrichment.warned) {
      SelwiseEnrichment.warned = true;
      // eslint-disable-next-line no-console
      console.log('[Selwise] enrichment slot "' + slotName + '" skipped: ' + webViewMissingReason);
    }
    return null;
  }

  const press = (url, assignmentId) => {
    const item =
      items.find((entry) => entry.assignmentId === assignmentId) || items[0] || null;
    if (item) {
      plugin.selwise.trackEnrichmentClick(item, url ? { linkUrl: url } : undefined);
    }
    if (!url) return;
    if (typeof onNavigate === 'function') onNavigate(url, item);
    else plugin.openStorefrontPath(url);
  };

  const onMessage = (event) => {
    const message = parseEnrichmentMessage(event && event.nativeEvent && event.nativeEvent.data);
    if (!message) return;

    if (message.type === 'height') {
      setHeight(message.height);
      return;
    }
    press(message.url, message.assignmentId);
  };

  // The reservation holds the space until the document reports its real
  // height. Zero would collapse and then jump.
  const measured = height > 0 ? height : tallestReservation(items);

  return h(
    View,
    { style: [sheet.host, measured > 0 ? { height: measured } : sheet.collapsed, style] },
    h(WebView, {
      originWhitelist: ['about:*'],
      source: { html: document_.html, baseUrl: '' },
      onMessage: onMessage,
      style: sheet.web,
      backgroundColor: 'transparent',
      scrollEnabled: false,
      nestedScrollEnabled: false,
      // A link inside a block must open the app's own screen. Left alone it
      // navigates INSIDE a short WebView, which looks like a crash.
      onShouldStartLoadWithRequest: (request) => {
        if (!request || !request.url || request.url === 'about:blank') return true;
        if (request.url.startsWith('data:')) return true;
        // The click listener already reported this with its rule id, so this
        // only has to stop the navigation — reporting again would double-count.
        if (typeof onNavigate === 'function') onNavigate(request.url, null);
        else plugin.openStorefrontPath(request.url);
        return false;
      },
      scalesPageToFit: false,
      bounces: false,
      showsVerticalScrollIndicator: false,
      automaticallyAdjustContentInsets: false,
      javaScriptEnabled: true,
      domStorageEnabled: false,
      allowFileAccess: false,
      allowUniversalAccessFromFileURLs: false,
      thirdPartyCookiesEnabled: false,
      androidLayerType: 'hardware',
    })
  );
}

SelwiseEnrichment.warned = false;

const sheet = StyleSheet.create({
  host: { width: '100%', backgroundColor: 'transparent' },
  collapsed: { height: 0 },
  web: { flex: 1, backgroundColor: 'transparent' },
});

module.exports = SelwiseEnrichment;
module.exports.isWebViewAvailable = () => !!WebView;
