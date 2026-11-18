import { createElement as h, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSelwise, useSelwiseHost } from '../../react/context.js';
import type { Surface } from '../../core/surfaces.js';
import { buildDocument, parseMessage } from '../custom-widget-document.js';
import { sayOnce } from '../host-hooks.js';

/**
 * A `custom` widget: the merchant's own HTML, CSS and JavaScript.
 *
 * ## Why this one is a WebView and the other types are not
 *
 * The other types are structured — a title, a button, some colours — so they
 * translate to native components and look like the app. A `custom` widget is
 * not structured: it is whatever the merchant wrote. There is no native
 * equivalent of arbitrary CSS, and arbitrary JavaScript has nowhere to run.
 * Translating a subset would render some merchants' widgets and quietly mangle
 * others, which is worse than declining.
 *
 * So it runs in a real browser context, isolated from the app, reachable only
 * through the four verbs `custom-widget-document.ts` injects.
 *
 * ## The WebView is the app's
 *
 * `react-native-webview` is a native module, so this package does not depend on
 * it: an app that has one passes it as `host.WebView`, and an app that does not
 * gets a log saying exactly what is missing rather than an empty space.
 */

export interface CustomWidgetProps {
  surface: Surface;
  /** A link the widget asked to open (its own `navigate` verb, or a tapped `<a>`). */
  onPress?: (url?: string) => void;
  onDismiss?: () => void;
}

export function CustomWidget(props: CustomWidgetProps) {
  const { surface, onDismiss, onPress } = props;
  const client = useSelwise();
  const host = useSelwiseHost();
  const WebView = host.WebView;
  const document_ = useMemo(() => buildDocument(surface), [surface]);
  const [height, setHeight] = useState(0);

  if (!document_) return null;

  if (!WebView) {
    // Said once, with the reason. A merchant whose custom widget does not
    // appear needs to know it is a missing dependency and not their markup.
    sayOnce(
      'custom-widget-webview',
      `custom widget "${surface.id}" skipped: no WebView was passed to <SelwiseProvider host={{ WebView }}>`
    );
    return null;
  }

  const onMessage = (event: { nativeEvent?: { data?: unknown } }) => {
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
      // predictable in a way that guessing is not.
      client.track('custom_event', {
        entityType: 'widget',
        entityId: surface.id,
        metadata: {
          eventName: message.name,
          surfaceType: 'custom',
          ...((message.metadata || {}) as Record<string, string | number | boolean | null>),
        },
      });
      return;
    }

    if (message.type === 'addToCart') {
      // Through the app's own basket, not a fetch from inside the WebView:
      // the WebView has no storefront session, so an item added there would
      // land in a basket the visitor never sees.
      if (!host.addToCart) {
        sayOnce(
          'custom-widget-add-to-cart',
          `custom widget "${surface.id}" asked to add to the cart: no addToCart was passed to <SelwiseProvider host={{ addToCart }}>`
        );
        return;
      }
      void Promise.resolve(
        host.addToCart({ code: message.code, quantity: message.quantity, source: 'custom_widget', surfaceId: surface.id })
      ).catch(() => undefined);
      return;
    }

    if (message.type === 'navigate') {
      client.trackSurfaceClick(surface, { linkUrl: message.url });
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
      onShouldStartLoadWithRequest: (request: { url?: string }) => {
        if (!request || !request.url || request.url === 'about:blank') return true;
        if (request.url.startsWith('data:')) return true;
        client.trackSurfaceClick(surface, { linkUrl: request.url });
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

const sheet = StyleSheet.create({
  host: { width: '100%', backgroundColor: 'transparent' },
  // Zero until the content measures itself: a guessed height either clips the
  // widget or leaves a gap under it.
  collapsed: { height: 0 },
  web: { flex: 1, backgroundColor: 'transparent' },
});
