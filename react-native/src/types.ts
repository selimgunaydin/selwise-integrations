/**
 * Public types for the Selwise React Native SDK.
 *
 * Everything here is DOM-free on purpose: this package runs in Hermes/JSC where
 * `window`, `document` and `localStorage` do not exist. The browser widget
 * (`@selwise/widget`) is not usable in a native app — the Akinon Appmaker apps
 * render their own screens, so this SDK delivers *data* and leaves rendering to
 * the app's existing themed components.
 */

/** Minimal async key/value contract. `@react-native-async-storage/async-storage` satisfies it as-is. */
export interface SelwiseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences';

export interface ConsentSnapshot {
  granted: boolean;
  categories?: Partial<Record<ConsentCategory, boolean>>;
  timestamp?: number;
  source?: string;
}

export interface SelwiseInitOptions {
  /**
   * The channel key, from Channels → the channel's card in the dashboard.
   *
   * NAMED `siteKey`, PERMANENTLY. The dashboard calls this a "channel key"
   * because a mobile app is one KIND of channel now (the other is a website),
   * but the option keeps its old name: it is in every app already shipping
   * against a published version of this package, and in the public HTTP path
   * (`/public/sites/:siteKey/...`). Renaming it would be a breaking change to
   * a public API in exchange for a word.
   *
   * `channelKey` is accepted as an alias for new code — pass either one.
   */
  siteKey?: string;
  /**
   * Alias of {@link siteKey}, matching what the dashboard calls this value.
   * Exactly one of the two is required; if both are given they must agree
   * (`channelKey` wins, and the SDK does not warn — two spellings of one value
   * is not an error worth a runtime log).
   */
  channelKey?: string;
  /**
   * Public API key (`x-selwise-api-key`).
   *
   * Required for every guarded endpoint, because a native `fetch` sends no
   * Origin/Referer and `PublicSiteGuard` then falls back to key + scope auth.
   *
   * The key MUST carry BOTH `mobile_read` and `mobile_write`: the recommendation
   * *products* endpoint is a POST (it takes a context body), and the guard
   * derives the required scope from the HTTP method, so a read-only key is
   * rejected there.
   */
  apiKey: string;
  /** Defaults to `https://api.selwise.com/api/v1`. */
  apiUrl?: string;
  /**
   * Persistent storage. Pass AsyncStorage. Without it the SDK still works but
   * visitor id, session and the offline queue live only for this app launch,
   * so returning-visitor recommendations and offline events are lost.
   */
  storage?: SelwiseStorage;
  /**
   * Initial consent. Omitted means the APP manages consent (`app_managed`,
   * every category allowed) — the ingest endpoint requires a snapshot and
   * drops each event its categories do not allow. Pass `{ granted: false }` to
   * hold everything until `setConsent()` is called with your CMP's answer.
   */
  consent?: ConsentSnapshot;
  /** Logged-in merchant user id, if known at init. Also settable via `identify()`. */
  siteUserId?: string;
  /** Events per flush. Default 20, hard server cap 200. */
  batchSize?: number;
  /** Auto-flush interval in ms. Default 5000. `0` disables the timer (flush manually). */
  flushIntervalMs?: number;
  /** Per-request timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Max events kept while offline. Default 500; oldest are dropped first. */
  maxQueueSize?: number;
  /** Print SDK diagnostics with `console.log`. Default false. */
  debug?: boolean;
  /**
   * Show only test-mode campaigns and widgets, and nothing else.
   *
   * The mirror of `localStorage.selwise_test_mode` on the web. It is a GATE,
   * not an extra: a test-mode entity is invisible to a real visitor and the
   * only thing a tester sees, so a merchant's unfinished campaign cannot reach
   * everyone by accident.
   *
   * Also sent with every event batch and scenario-inbox request, as the web
   * widget does: a test-mode scenario admits only a test-mode visitor, and its
   * on-site claims are handed only to one.
   */
  testMode?: boolean;
  /**
   * The app's language (`'en'`, `'tr-TR'` …), for the merchant's text — a
   * campaign, a recommendation title, an enrichment block, a search label —
   * when the account writes it in more than one language. The API answers in
   * the closest language the account has, and in its default when none is
   * passed or the account lacks it. Change it later with `setLocale`.
   */
  locale?: string;
  /** Reported as `x-selwise-client-platform`. Default `react-native`. */
  clientPlatform?: string;
  /** Reported as `x-selwise-client-version`. Default the SDK version. */
  clientVersion?: string;
}

/**
 * `tracking_events.entity_type`. Mirrors what the browser widget sends, so a
 * campaign reported from the app and from the web add up in one report.
 *
 * `enrichment` was MISSING until September 2026 and that absence was the bug:
 * `trackEnrichmentView` had no legal value to send, so it sent `widget` while
 * its own comment claimed parity with the browser — every app enrichment
 * impression and click landed in the campaign funnel and the enrichment report
 * undercounted by exactly the app's traffic.
 *
 * `widget` is retained because stored rows carry it (widgets and campaigns
 * merged that same month) but nothing in this SDK writes it any more.
 */
export type EntityType =
  | 'campaign'
  | 'widget'
  | 'enrichment'
  | 'recommendation'
  | 'search'
  | 'script'
  | 'page'
  | 'product'
  | 'basket'
  | 'checkout'
  | 'user'
  /** A Selwise message link that opened the app (`trackDeepLink`), keyed by its scenario. */
  | 'messaging'
  | 'custom';

export interface TrackOptions {
  entityType?: EntityType;
  entityId?: string;
  /** Product code. MUST match `item_code` in the product feed. */
  productItemCode?: string;
  metadata?: Record<string, string | number | boolean | null>;
  timestamp?: number;
  correlationId?: string;
  parentEventId?: string;
}

export interface SelwiseProduct {
  id: string;
  itemCode: string;
  title: string;
  description?: string | null;
  shortDescription?: string | null;
  price: number;
  currency: string;
  originalPrice?: number | null;
  discountRate?: number | null;
  imageUrl?: string | null;
  url?: string | null;
  categories?: string | null;
  brand?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  isNew?: boolean;
  isBestseller?: boolean;
  inStock?: boolean;
  stock?: number | null;
  sku?: string | null;
  productType?: string | null;
  categoryHierarchy?: string | null;
  explainability?: Record<string, unknown> | null;
  /**
   * `complementary` strips only: the approved role pair that put the
   * product here — group by `role` for a tab per role, caption with
   * `label` (both panel languages) for a look. Null for every other strategy.
   */
  complement?: {
    role: string;
    relation: string;
    label: { tr: string; en: string };
  } | null;
}

export interface RecommendationWidgetSummary {
  id: string;
  name?: string;
  title?: string;
  subtitle?: string | null;
  strategy?: string;
  displayType?: string;
  containerSelector?: string | null;
  [key: string]: unknown;
}

/** The A/B arm covering a strip — the same pair `surface.experiment` carries. */
export interface RecommendationExperiment {
  experimentId: string;
  variantId: string;
}

/**
 * A recommendation strip as THIS visitor gets it: the listed widget with the
 * visitor's experiment arm applied. `resolveRecommendationWidget()` returns it
 * without asking for products; `getRecommendationProducts()` applies the same
 * answer before it asks.
 */
export interface ResolvedRecommendationWidget {
  /**
   * The strip to request, draw and report under. The widget asked about, or —
   * in a `different_module` arm — the module the arm draws in its place.
   */
  widgetId: string;
  /** The widget asked about. */
  sourceWidgetId: string;
  /**
   * The strip as drawn: the arm's module, or the listed widget with the arm's
   * title, subtitle, display type and styles. Null when the SDK has seen the
   * strip neither in `getRecommendationWidgets()` nor in an arm, and no arm
   * changes how it reads.
   */
  widget: RecommendationWidgetSummary | null;
  /** The arm covering the strip; null outside every experiment. */
  experiment: RecommendationExperiment | null;
  /**
   * Draw nothing, and ask for nothing: the visitor's arm replaced this strip
   * with nothing (its module did not arrive), or held it out.
   */
  hidden: boolean;
  /** The DRAWN strip answers the live cart, when the SDK knows. */
  liveCartRequired?: boolean;
}

export interface RecommendationProductsResult {
  widgetId: string;
  products: SelwiseProduct[];
  productCard?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  /**
   * The strip answers the shopper's live cart (`free_shipping_complement`,
   * "complete to free shipping"): its products change with the basket, so ask
   * again when `onCartChange` fires — `useRecommendationWidget` does that on
   * its own. Absent when neither the API nor the widget list said.
   */
  liveCartRequired?: boolean;
  /**
   * The widget the host asked for, when the visitor's experiment arm draws
   * ANOTHER strip in its place (`different_module`). `widgetId` is then the
   * arm's strip — the one these products are for, and the one to report.
   */
  sourceWidgetId?: string;
  /**
   * The strip as this visitor gets it (see `ResolvedRecommendationWidget`).
   * Draw the heading from it: an arm may change the title.
   */
  widget?: RecommendationWidgetSummary;
  /** Set when an A/B experiment arm covers the strip. */
  experiment?: RecommendationExperiment;
  /** The visitor's arm draws nothing here. No request was made; draw nothing. */
  hidden?: boolean;
}

export interface RecommendationContext {
  /** Product code of the product the user is looking at, for `similar_products` etc. */
  currentProductId?: string;
  /**
   * The basket, for a strip that completes it to free shipping
   * (`free_shipping_complement`). Normally leave it out: the SDK sends the
   * basket `setCart()` measured, and only for such a strip. Pass `null` to
   * send none.
   */
  cart?: RecommendationCartContext | null;
}

/**
 * The basket as a recommendation request carries it — the same shape the
 * browser widget sends. `known` must be true: a basket the app has not
 * measured is not sent, and the strip then has nothing to show.
 */
export interface RecommendationCartContext {
  known: true;
  /** Products after the store's discounts, before shipping (GA4's `value`). */
  total: number;
  /** ISO 4217; null lets the channel's currency stand in. */
  currency?: string | null;
  /** The lines' product codes, to keep the basket's own products out of the strip. */
  codes?: string[];
}

export interface SearchOptions {
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  category?: string;
}

export interface SearchResult {
  query: string;
  hits: SelwiseProduct[];
  total?: number;
  categories?: Array<{ name: string; count: number }>;
  /**
   * A merchant search redirect ("kargo" -> the shipping page).
   *
   * When set, it REPLACES the result list — the browser widget navigates and
   * renders nothing. An app that renders `hits` anyway shows an empty list for
   * a rule the merchant configured on purpose, so check this first.
   */
  redirect?: string;
  [key: string]: unknown;
}

export interface OrderItemInput {
  /** MUST match `item_code` in the product feed. */
  productItemCode: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  metadata?: Record<string, unknown>;
}

export interface OrderInput {
  /** Merchant order number. Idempotency key — re-sending the same id never double-counts. */
  orderId: string;
  total: number;
  /**
   * ISO currency code. Pass it whenever the app knows it.
   *
   * Optional because omitting it is better than guessing: the server falls back
   * to the site's configured currency, and a hardcoded default would file a
   * Polish order as Turkish lira on a multi-market storefront.
   */
  currency?: string;
  subtotal?: number;
  discountTotal?: number;
  shippingTotal?: number;
  taxTotal?: number;
  status?: string;
  placedAt?: string;
  items?: OrderItemInput[];
  metadata?: Record<string, unknown>;
}

/** Thrown for a non-2xx API response. Network faults surface as the underlying error. */
export class SelwiseApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body: string | undefined;

  constructor(message: string, status: number, path: string, body?: string) {
    super(message);
    this.name = 'SelwiseApiError';
    this.status = status;
    this.path = path;
    this.body = body;
  }

  /**
   * True when the guard rejected the key or its scopes. The overwhelmingly
   * common cause is a key missing `mobile_write`, which the recommendation
   * products POST needs.
   */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}
