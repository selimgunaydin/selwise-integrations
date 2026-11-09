import type { Selwise } from '../client.js';
import type { EntityType, TrackOptions } from '../types.js';

/**
 * Bridge for storefront content rendered inside the app's WebView.
 *
 * Why this exists: Akinon storefronts detect the in-app WebView and divert
 * their analytics away from the page. `pz_classic_project`'s `dataLayerUtils.js` calls
 * `window.ReactNativeWebView.postMessage(JSON.stringify({ event, ecommerce }))`
 * and then RETURNS — `window.dataLayer` is never written. Any browser-side
 * listener, Selwise's included, sees nothing inside the app.
 *
 * So the native side has to pick those messages up. Wire `handleMessage` to the
 * WebView's `onMessage` and the checkout/PDP flows that only exist in the
 * WebView become visible to Selwise:
 *
 * ```tsx
 * const bridge = new WebViewBridge(selwise);
 *
 * <WebView
 *   source={{ uri: checkoutUrl }}
 *   onMessage={(e) => bridge.handleMessage(e.nativeEvent.data)}
 * />
 * ```
 *
 * Messages are untrusted input from a web page: every field is validated and
 * anything unrecognised is ignored rather than forwarded.
 */
export class WebViewBridge {
  private readonly selwise: Selwise;
  private readonly onUnhandled: ((event: string, payload: unknown) => void) | undefined;
  private readonly debug: boolean;
  /** Purchases already forwarded this session, so a WebView reload cannot double-send. */
  private readonly seenOrderIds = new Set<string>();

  constructor(
    selwise: Selwise,
    options: {
      /** Called for messages the bridge could not map. Useful while onboarding a project. */
      onUnhandled?: (event: string, payload: unknown) => void;
      debug?: boolean;
    } = {}
  ) {
    this.selwise = selwise;
    this.onUnhandled = options.onUnhandled;
    this.debug = options.debug === true;
  }

  /**
   * Feed one `onMessage` payload in. Accepts the JSON string RN delivers, or an
   * already-parsed object. Returns true when the message produced an event.
   */
  handleMessage(raw: unknown): boolean {
    const message = this.parse(raw);
    if (!message) return false;

    const eventName = typeof message['event'] === 'string' ? message['event'] : null;
    if (!eventName) return false;

    const mapped = GA4_TO_SELWISE[eventName];
    if (!mapped) {
      this.log(`Unmapped WebView event: ${eventName}`);
      this.onUnhandled?.(eventName, message);
      return false;
    }

    const ecommerce = extractEcommerce(message);

    if (mapped === 'purchase') {
      return this.forwardPurchase(ecommerce, eventName);
    }

    const items = ecommerce.items;
    const primary = items[0];

    const metadata: NonNullable<TrackOptions['metadata']> = { source: 'webview', webviewEvent: eventName };
    if (ecommerce.currency) metadata['currency'] = ecommerce.currency;
    if (ecommerce.value !== undefined) metadata['value'] = ecommerce.value;
    if (items.length > 0) metadata['itemCount'] = items.length;

    const entityType = ENTITY_TYPE_BY_EVENT[mapped] ?? 'custom';
    const options: TrackOptions = { entityType, metadata };

    if (primary?.itemCode) {
      options.entityId = primary.itemCode;
      options.productItemCode = primary.itemCode;
    }

    this.selwise.track(mapped, options);
    this.log(`Forwarded ${eventName} → ${mapped}`);
    return true;
  }

  private forwardPurchase(ecommerce: ExtractedEcommerce, eventName: string): boolean {
    const orderId = ecommerce.transactionId;
    if (!orderId) {
      // Without an order id there is no idempotency key, and a WebView reload
      // on the thank-you page would create a second order.
      this.log(`Ignored ${eventName}: no transaction_id in the payload`);
      this.onUnhandled?.(eventName, ecommerce.raw);
      return false;
    }

    if (this.seenOrderIds.has(orderId)) {
      this.log(`Ignored duplicate purchase for order ${orderId}`);
      return false;
    }
    this.seenOrderIds.add(orderId);

    void this.selwise
      .trackOrder({
        orderId,
        total: ecommerce.value ?? 0,
        // Forwarded ONLY when the page sent one. Defaulting to a literal here
        // would record a Polish order as TRY on a multi-market storefront;
        // omitting it lets the server resolve the site's configured currency,
        // which is the value that is actually right.
        ...(ecommerce.currency ? { currency: ecommerce.currency } : {}),
        items: ecommerce.items
          .filter((item) => Boolean(item.itemCode))
          .map((item) => ({
            productItemCode: item.itemCode as string,
            ...(item.name !== undefined ? { name: item.name } : {}),
            ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
            ...(item.price !== undefined ? { unitPrice: item.price } : {}),
          })),
        metadata: { source: 'webview', webviewEvent: eventName },
      })
      .catch((error) => {
        // Allow a retry on the next message: the order never landed.
        this.seenOrderIds.delete(orderId);
        this.log(`trackOrder failed for ${orderId}`, error);
      });

    this.log(`Forwarded ${eventName} → order ${orderId}`);
    return true;
  }

  private parse(raw: unknown): Record<string, unknown> | null {
    if (typeof raw === 'object' && raw !== null) {
      return raw as Record<string, unknown>;
    }
    if (typeof raw !== 'string' || raw.length === 0) return null;
    // A WebView can post arbitrary strings; a non-JSON message is not an error.
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private log(message: string, detail?: unknown): void {
    if (!this.debug) return;
    if (detail === undefined) {
      console.log(`[Selwise/WebView] ${message}`);
    } else {
      console.log(`[Selwise/WebView] ${message}`, detail);
    }
  }
}

/**
 * The `--iOS/Android bridge--` half of the contract, as a string to inject into
 * the WebView with `injectedJavaScriptBeforeContentLoaded`.
 *
 * Two jobs:
 *  - set `window.isMobileApp`, which is what Akinon's `isInAppWebView()` reads
 *    to decide to divert its dataLayer to the bridge in the first place;
 *  - mirror any `window.dataLayer.push` to `postMessage` as well, so projects
 *    that do NOT implement the diversion are covered by the same listener.
 *
 * Safe to inject on a page that already diverts: the bridge de-duplicates
 * purchases by order id, and other events are idempotent per push.
 */
export const WEBVIEW_BRIDGE_SCRIPT = `(function(){
  try {
    window.isMobileApp = true;
    var post = function(payload){
      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
    };
    window.dataLayer = window.dataLayer || [];
    var nativePush = window.dataLayer.push.bind(window.dataLayer);
    window.dataLayer.push = function(){
      for (var i = 0; i < arguments.length; i++) {
        var item = arguments[i];
        if (item && typeof item === 'object' && typeof item.event === 'string') { post(item); }
      }
      return nativePush.apply(null, arguments);
    };
  } catch (e) {}
  true;
})();`;

interface ExtractedItem {
  itemCode?: string;
  name?: string;
  price?: number;
  quantity?: number;
}

interface ExtractedEcommerce {
  items: ExtractedItem[];
  currency?: string;
  value?: number;
  transactionId?: string;
  raw: unknown;
}

/**
 * Reads both payload shapes Akinon projects emit:
 *  - GA4:  `ecommerce.items[]` with `item_id`
 *  - UA/EE: `ecommerce.<action>.products[]` with `id`, plus `actionField`
 */
function extractEcommerce(message: Record<string, unknown>): ExtractedEcommerce {
  const ecommerce = asRecord(message['ecommerce']) ?? {};

  const rawItems =
    asArray(ecommerce['items']) ??
    asArray(asRecord(ecommerce['purchase'])?.['products']) ??
    asArray(asRecord(ecommerce['add'])?.['products']) ??
    asArray(asRecord(ecommerce['remove'])?.['products']) ??
    asArray(asRecord(ecommerce['detail'])?.['products']) ??
    asArray(asRecord(ecommerce['checkout'])?.['products']) ??
    asArray(asRecord(ecommerce['click'])?.['products']) ??
    asArray(ecommerce['impressions']) ??
    [];

  const purchaseActionField = asRecord(asRecord(ecommerce['purchase'])?.['actionField']);

  return {
    items: rawItems.map(toExtractedItem).filter((item) => Object.keys(item).length > 0),
    currency:
      asString(ecommerce['currency']) ??
      asString(purchaseActionField?.['currency']) ??
      asString(message['currency']),
    value:
      asNumber(ecommerce['value']) ??
      asNumber(purchaseActionField?.['revenue']) ??
      asNumber(message['value']),
    transactionId:
      asString(ecommerce['transaction_id']) ??
      asString(ecommerce['transactionId']) ??
      asString(purchaseActionField?.['id']) ??
      asString(message['transaction_id']) ??
      asString(message['orderId']),
    raw: message,
  };
}

function toExtractedItem(value: unknown): ExtractedItem {
  const record = asRecord(value);
  if (!record) return {};

  const item: ExtractedItem = {};
  // `item_id` first: it is what the merchant's own GA4 layer uses, and product
  // analytics resolves against exactly that value in the feed.
  const itemCode =
    asString(record['item_id']) ??
    asString(record['id']) ??
    asString(record['sku']) ??
    asString(record['item_code']);
  if (itemCode) item.itemCode = itemCode;

  const name = asString(record['item_name']) ?? asString(record['name']);
  if (name) item.name = name;

  const price = asNumber(record['price']);
  if (price !== undefined) item.price = price;

  const quantity = asNumber(record['quantity']);
  if (quantity !== undefined) item.quantity = quantity;

  return item;
}

/**
 * GA4 / UA / Turkish event names → Selwise canonical events.
 *
 * `eeEvent` and `eeCart` are deliberately ABSENT: PZ classic's stock GTM
 * adapter uses one `eeEvent` name for product detail, click and impressions
 * alike, so the name alone cannot say which Selwise event is meant. Mapping it
 * here would attribute clicks as views. Those projects need the composite
 * `event + ecommerce action` mapping on the web bridge instead.
 */
const GA4_TO_SELWISE: Record<string, string> = {
  page_view: 'page_view',
  view_item: 'product_view',
  view_item_list: 'product_impression',
  select_item: 'product_click',
  add_to_cart: 'add_to_cart',
  addToCart: 'add_to_cart',
  sepete_ekle: 'add_to_cart',
  remove_from_cart: 'remove_from_cart',
  view_cart: 'cart_view',
  sepet_goruntule: 'cart_view',
  begin_checkout: 'checkout_begin',
  odemeye_basla: 'checkout_begin',
  add_shipping_info: 'checkout_progress',
  add_payment_info: 'checkout_progress',
  purchase: 'purchase',
  siparis_ver: 'purchase',
  add_to_wishlist: 'wishlist',
  login: 'user_login',
  sign_up: 'user_signup',
  search: 'search_query',
};

const ENTITY_TYPE_BY_EVENT: Record<string, EntityType> = {
  page_view: 'page',
  product_view: 'product',
  product_impression: 'product',
  product_click: 'product',
  add_to_cart: 'product',
  remove_from_cart: 'product',
  cart_view: 'basket',
  checkout_begin: 'checkout',
  checkout_progress: 'checkout',
  wishlist: 'product',
  user_login: 'user',
  user_signup: 'user',
  search_query: 'search',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
