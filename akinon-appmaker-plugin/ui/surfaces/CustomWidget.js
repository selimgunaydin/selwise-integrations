'use strict';

/**
 * A `custom` widget: the merchant's own HTML, CSS and JavaScript.
 *
 * ## Why this one is a WebView and the other nine are not
 *
 * The other types are structured — a title, a button, some colours — so they
 * translate to native components and look like the app. A `custom` widget is
 * not structured: it is whatever the merchant wrote. There is no native
 * equivalent of arbitrary CSS, and arbitrary JavaScript has nowhere to run.
 * Translating a subset would render some merchants' widgets and quietly mangle
 * others, which is worse than declining.
 *
 * So it runs in a real browser context, isolated from the app, reachable only
 * through the four verbs `custom-widget-document.js` injects.
 *
 * ## react-native-webview is optional, on purpose
 *
 * The whole plugin installs without touching the iOS or Android project, which
 * is what lets a merchant add Selwise without a native release. A WebView is a
 * native module, so requiring it would take that away from every merchant to
 * serve the ones using custom widgets. It is loaded lazily instead: apps that
 * have it (most App Maker apps do — checkout uses one) get custom widgets, and
 * apps that do not get a log saying exactly what is missing rather than an
 * empty space.
 */

const React = require('react');
const { StyleSheet, View } = require('react-native');

const { buildDocument, parseMessage } = require('../custom-widget-document.js');

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

function CustomWidget(props) {
  const { surface, plugin, onDismiss, onPress } = props;
  const document_ = React.useMemo(() => buildDocument(surface), [surface]);
  const [height, setHeight] = React.useState(0);

  if (!document_) return null;

  if (!WebView) {
    // Said once, with the reason. A merchant whose custom widget does not
    // appear needs to know it is a missing dependency and not their markup.
    if (!CustomWidget.warned) {
      CustomWidget.warned = true;
      // eslint-disable-next-line no-console
      console.log(
        '[Selwise] custom widget "' + surface.id + '" skipped: ' + webViewMissingReason
      );
    }
    return null;
  }

  const onMessage = (event) => {
    const message = parseMessage(event && event.nativeEvent && event.nativeEvent.data);
    if (!message) return;

    if (message.type === 'height') {
      setHeight(message.height);
      return;
    }

    if (message.type === 'track') {
      // Sent as the canonical `custom_event` with the merchant's own name in
      // metadata — NOT under their name directly.
      //
      // The ingest pipeline keeps only the names in CANONICAL_EVENTS and drops
      // everything else without an error anywhere. A merchant's
      // `selwise.track('kupon_kullanildi')` therefore vanished: the widget
      // worked, the report was empty, and nothing said why. Wrapping is
      // predictable in a way that guessing is not — the alternative was
      // restating all 59 canonical names here, where they would drift.
      plugin.selwise.track('custom_event', {
        entityType: 'widget',
        entityId: surface.id,
        metadata: {
          eventName: message.name,
          surfaceType: 'custom',
          ...(message.metadata || {}),
        },
      });
      return;
    }

    if (message.type === 'addToCart') {
      // Through the app's own basket, not a fetch from inside the WebView:
      // the WebView has no storefront session, so an item added there would
      // land in a basket the visitor never sees.
      plugin.addToCartFromSurface(surface, message.code, message.quantity);
      return;
    }

    if (message.type === 'navigate') {
      plugin.selwise.trackSurfaceClick(surface, { linkUrl: message.url });
      if (typeof onPress === 'function') onPress(message.url);
      return;
    }

    if (message.type === 'close' && typeof onDismiss === 'function') onDismiss();
  };

  return h(
    View,
    { style: [sheet.host, height > 0 ? { height: height } : sheet.collapsed] },
    h(WebView, {
      originWhitelist: ['about:*'],
      source: { html: document_.html, baseUrl: '' },
      onMessage: onMessage,
      style: sheet.web,
      // The merchant's markup paints its own ground; a white WebView would
      // arrive as a white block behind a floating pill.
      backgroundColor: 'transparent',
      scrollEnabled: false,
      nestedScrollEnabled: false,
      // A link inside the widget must open the app's screen. Left alone it
      // navigates INSIDE a 50-pixel-tall WebView, which looks like a crash.
      onShouldStartLoadWithRequest: (request) => {
        if (!request || !request.url || request.url === 'about:blank') return true;
        if (request.url.startsWith('data:')) return true;
        plugin.selwise.trackSurfaceClick(surface, { linkUrl: request.url });
        if (typeof onPress === 'function') onPress(request.url);
        return false;
      },
      // Not a browser: no zoom, no text selection, no bounce.
      scalesPageToFit: false,
      bounces: false,
      showsVerticalScrollIndicator: false,
      automaticallyAdjustContentInsets: false,
      javaScriptEnabled: true,
      domStorageEnabled: false,
      // The document is inline HTML with no origin, so there is nothing for a
      // third-party cookie or a file:// read to reach.
      allowFileAccess: false,
      allowUniversalAccessFromFileURLs: false,
      thirdPartyCookiesEnabled: false,
      androidLayerType: 'hardware',
    })
  );
}

CustomWidget.warned = false;

const sheet = StyleSheet.create({
  host: { width: '100%', backgroundColor: 'transparent' },
  // Zero until the content measures itself: a guessed height either clips the
  // widget or leaves a gap under it.
  collapsed: { height: 0 },
  web: { flex: 1, backgroundColor: 'transparent' },
});

module.exports = CustomWidget;
module.exports.isWebViewAvailable = () => !!WebView;
