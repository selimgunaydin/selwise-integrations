import { createElement as h, useEffect, useMemo, useRef, useState, type ElementRef, type ReactElement } from 'react';
import { AppState, Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSelwise, useSelwiseHost } from '../react/context.js';
import { useConfigVersion, useSelwiseReady, useThemeVersion } from '../react/use-selwise-state.js';
import type { EnrichmentItem } from '../core/enrichment.js';
import {
  buildEnrichmentDocument,
  parseEnrichmentMessage,
  type EnrichmentDocumentOptions,
} from './enrichment-document.js';
import { sayOnce, useBrandTheme, useNavigate } from './host-hooks.js';

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
 * others. The WebView is the app's (`host.WebView`).
 *
 * ## Placement is a NAME, and that is what makes it dynamic
 *
 * A web rule is placed by CSS selector. A screen has no DOM, so it declares a
 * slot NAME and the merchant writes the same name on the rule. Nothing about
 * the app changes when they add, remove or rewrite a rule — no release, no
 * config, no deploy. `client.getEnrichmentSlots()` lists the names they have
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

export interface SelwiseEnrichmentProps {
  /** The product's item code. */
  code: string;
  /** The placement name the merchant wrote on the rule. */
  slot: string;
  style?: StyleProp<ViewStyle>;
  /** Base typography for the document; defaults to the host's `enrichment` and the brand theme. */
  theme?: EnrichmentDocumentOptions;
  /** Opens a link a block points at, instead of `host.navigate`. The click is already reported. */
  onNavigate?: (url: string, item: EnrichmentItem | null) => void;
  /**
   * Draw only this rule (its `assignmentId`) of the slot, not every rule that
   * stacks there. A screen experiment's arm draws ONE rule at a point, whatever
   * name the rule is placed under.
   */
  only?: string;
  /** A tap on the block, after it was reported — a screen experiment records its click goal here. */
  onPress?: () => void;
  /**
   * Asked speculatively, by a `<SelwiseSlot>` that draws whatever enrichment carries
   * its name: an empty answer is ordinary there and `explain()` does not list it.
   */
  probe?: boolean;
}

function tallestReservation(items: readonly EnrichmentItem[]): number {
  let tallest = 0;
  for (const item of items) {
    const value = Number(item?.reservedHeightPx);
    if (Number.isFinite(value) && value > tallest) tallest = value;
  }
  return tallest;
}

// The browser widget's definition: an embedded block is viewed once half of it
// is on screen, or it fills half the screen, and the app is in the foreground.
const VIEWABLE_FRACTION = 0.5;

// Until the document measures itself: the host is this tall, the WebView inside it
// is laid out at the provisional height (a real box to measure the content in).
const COLLAPSED_HEIGHT = 1;
const PROVISIONAL_LAYOUT_HEIGHT = 480;
// How long a loaded document may stay silent before the slot is reported as unmeasured.
const HEIGHT_REPORT_DEADLINE_MS = 4000;

export function SelwiseEnrichment(props: SelwiseEnrichmentProps): ReactElement | null {
  const { code, slot, style, theme, onNavigate, only, onPress, probe } = props;
  const client = useSelwise();
  const host = useSelwiseHost();
  const WebView = host.WebView;
  const navigate = useNavigate();
  useBrandTheme();
  const themeVersion = useThemeVersion();
  const ready = useSelwiseReady();
  // A rule published while the app is open (`on('config')`).
  const configVersion = useConfigVersion();
  const hostRef = useRef<ElementRef<typeof View>>(null);
  const [viewable, setViewable] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');

  const [items, setItems] = useState<EnrichmentItem[]>([]);
  const [height, setHeight] = useState(0);
  const seen = useRef(new Set<string>());

  const productCode = String(code || '').trim();
  const slotName = String(slot || '').trim();
  // The reservation holds the space until the document reports its real height.
  const measured = height > 0 ? height : tallestReservation(items);

  // A mounted point is reported to the dashboard like a `<SelwiseSlot>` is, so
  // an enrichment rule placed here shows as "connected in your app" and not as
  // a point the app never mounted. Once per session; safe before `init()`.
  useEffect(() => {
    if (!slotName) return;
    try {
      client.registerSlot(slotName);
    } catch {
      // A report is a courtesy.
    }
  }, [client, slotName]);

  useEffect(() => {
    let cancelled = false;
    // A new product means the previous product's content must go immediately,
    // not when the next fetch lands — showing one product's spec table under
    // another's title is worse than showing nothing.
    setItems([]);
    setHeight(0);
    setViewable(false);
    seen.current = new Set();

    if (!ready || !productCode || !slotName) return undefined;

    client
      .getEnrichment(productCode, [slotName], undefined, { probe: probe === true })
      .then((result) => {
        if (cancelled) return;
        const forSlot = client.enrichmentForSlot(result, slotName);
        setItems(only ? forSlot.filter((item) => item.assignmentId === only) : forSlot);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [client, ready, productCode, slotName, only, configVersion]);

  // The base typography: what the host set, else the brand theme's, so a block
  // with no styling of its own looks like it belongs to the app.
  const baseTheme = useMemo<EnrichmentDocumentOptions>(() => {
    const tokens = client.getTheme();
    const configured = host.enrichment || {};
    return {
      background: configured.background || 'transparent',
      textColor: configured.textColor || tokens['--selwise-text'] || '',
      fontFamily: configured.fontFamily || tokens['--selwise-font'] || '',
      fontSize: configured.fontSize || '14px',
      // Unset stays unset: the document then pads a block that sets none itself.
      padding: configured.padding || '',
      // So a relative image (`/media/size-chart.png`) in a block resolves against the shop.
      baseUrl: host.storefrontUrl || '',
      // The brand's tokens, as the page's `:root` — a block written against `var(--selwise-*)` paints the brand.
      tokens,
    };
  }, [client, host, themeVersion]);

  const document_ = useMemo(
    () => buildEnrichmentDocument(items, theme ? { tokens: baseTheme.tokens, ...theme } : baseTheme),
    [items, theme, baseTheme]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state !== 'background'));
    return () => {
      if (subscription && subscription.remove) subscription.remove();
    };
  }, []);

  // Until the block is half on screen the check repeats; a scroll view gives no
  // callback to a child, so a short poll is the cost of the same definition.
  useEffect(() => {
    // An unmeasured block is one pixel high: it is not "half on screen" yet.
    if (viewable || !document_ || !foreground || !(measured > 0)) return undefined;
    const check = () => {
      const node = hostRef.current;
      if (!node || typeof node.measureInWindow !== 'function') return;
      node.measureInWindow((_x, y, _w, blockHeight) => {
        if (!(blockHeight > 0)) return;
        const windowHeight = Dimensions.get('window').height;
        const shown = Math.min(y + blockHeight, windowHeight) - Math.max(y, 0);
        if (shown >= Math.min(blockHeight, windowHeight) * VIEWABLE_FRACTION) setViewable(true);
      });
    };
    check();
    const timer = setInterval(check, 500);
    return () => clearInterval(timer);
  }, [viewable, document_, foreground, height, measured]);

  // A document that never says how tall it is stays one pixel high for good: the
  // block is "loaded" and nowhere on the screen. Said in `explain()` and in the
  // debug log, and cleared the moment a height arrives.
  const hasDocument = document_ !== null;
  useEffect(() => {
    if (!hasDocument || !slotName) return undefined;
    if (height > 0) {
      client.noteEnrichment(slotName, null);
      return undefined;
    }
    const timer = setTimeout(() => client.noteEnrichment(slotName, 'no_height'), HEIGHT_REPORT_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [client, hasDocument, height, slotName]);

  // The impression belongs to the moment content became visible, and one per
  // RULE however many blocks it stacks — the server puts a rule's blocks into
  // one root for exactly that reason.
  useEffect(() => {
    if (!document_ || !viewable || !foreground) return;
    for (const item of items) {
      if (seen.current.has(item.assignmentId)) continue;
      seen.current.add(item.assignmentId);
      client.trackEnrichmentView(item);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, document_, viewable, foreground, items.map((item) => item.assignmentId).join(',')]);

  if (!document_) return null;

  if (!WebView) {
    // Said once, with the reason. A merchant whose spec table does not appear
    // needs to know it is a missing dependency and not their markup.
    sayOnce(
      'enrichment-webview',
      `enrichment slot "${slotName}" skipped: no WebView was passed to <SelwiseProvider host={{ WebView }}>`
    );
    client.noteEnrichment(slotName, 'no_webview');
    return null;
  }

  const open = (url: string, item: EnrichmentItem | null) => {
    if (typeof onNavigate === 'function') onNavigate(url, item);
    else void navigate({ url, source: 'enrichment', ...(item ? { entityId: item.assignmentId } : {}) });
  };

  const press = (url: string, assignmentId: string) => {
    const item = items.find((entry) => entry.assignmentId === assignmentId) || items[0] || null;
    if (item) {
      client.trackEnrichmentClick(item, url ? { linkUrl: url } : undefined);
      if (typeof onPress === 'function') onPress();
    }
    if (!url) return;
    open(url, item);
  };

  const onMessage = (event: { nativeEvent?: { data?: unknown } }) => {
    const message = parseEnrichmentMessage(event && event.nativeEvent && event.nativeEvent.data);
    if (!message) return;

    if (message.type === 'height') {
      setHeight(message.height);
      return;
    }
    press(message.url, message.assignmentId);
  };

  // Zero would collapse and then jump, so the host keeps the reservation until the
  // document reports its height. With none declared it is ONE pixel, not zero: a
  // WebView laid out at zero height is not given a layout pass by every platform,
  // so it never measures itself and never says it is there. The WebView therefore
  // always has a real box of its own (`web`, absolutely placed and clipped by the
  // host), whatever height the host shows.
  const webHeight = height > 0 ? height : PROVISIONAL_LAYOUT_HEIGHT;

  return h(
    View,
    {
      ref: hostRef,
      collapsable: false,
      style: [sheet.host, { height: measured > 0 ? measured : COLLAPSED_HEIGHT }, style],
    },
    h(WebView, {
      originWhitelist: ['about:*'],
      source: { html: document_.html, baseUrl: '' },
      onMessage: onMessage,
      style: [sheet.web, { height: webHeight }],
      backgroundColor: 'transparent',
      scrollEnabled: false,
      nestedScrollEnabled: false,
      // A link inside a block must open the app's own screen. Left alone it
      // navigates INSIDE a short WebView, which looks like a crash.
      onShouldStartLoadWithRequest: (request: { url?: string }) => {
        if (!request || !request.url || request.url === 'about:blank') return true;
        if (request.url.startsWith('data:')) return true;
        // The click listener already reported this with its rule id, so this
        // only has to stop the navigation — reporting again would double-count.
        open(request.url, null);
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

const sheet = StyleSheet.create({
  host: { width: '100%', backgroundColor: 'transparent', overflow: 'hidden' },
  web: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'transparent' },
});
