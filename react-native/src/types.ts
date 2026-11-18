/**
 * Public types for the Selwise React Native SDK.
 *
 * Everything here is DOM-free on purpose: this package runs in Hermes/JSC where
 * `window`, `document` and `localStorage` do not exist. The browser widget
 * (`@selwise/widget`) is not usable in a native app, so this SDK delivers *data*
 * and the components that draw it live in `@selwise/react-native/ui`, which an
 * app that draws everything itself never imports.
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
  /**
   * Print SDK diagnostics with `console.log`, and draw the on-device diagnostics
   * button (`<SelwiseSurfaces />` mounts a small "S" at the bottom-left that
   * opens a sheet: the screen, what was drawn, and why the rest was not). Default
   * false. For a development or internal build only — never a release.
   */
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
  /**
   * The wrapper around this SDK, when there is one (`'1.0.0'` for the App Maker
   * plugin). Shown to the merchant next to the SDK version, so "which plugin is
   * this app running" is a glance and not a support question.
   */
  pluginVersion?: string;
  /** The app's own release (`'3.4.1'`), shown beside the SDK version. A segment can target it (`appVersion lt 3.5`). */
  appVersion?: string;
  /**
   * The OS the app runs on (`Platform.OS` — the SDK itself imports nothing from
   * `react-native`). Lets a segment target `ios` or `android`; without it, a
   * live request does not carry the OS (the audience still reads it from the
   * device's network stack).
   */
  platform?: 'ios' | 'android';
  /**
   * Tell the dashboard which screens and named points this app has shown
   * (`app://product`, `pdp-under-info`) and which SDK it runs. Nothing about a
   * shopper is sent. Default `true`; `false` keeps the dashboard's integration
   * view empty for this app.
   */
  reportIntegration?: boolean;
  /**
   * Honour a QA link — `?selwise_test=1` and `?selwise_variant=<experimentId>:<variantId>`
   * in a link that opens the app — for this app session: test mode on, and the
   * chosen experiment arms forced. Default `false`; turn it on in a development
   * or internal build only. A link can be sent by anybody, and test mode hides
   * every live campaign.
   */
  qaLinks?: boolean;
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
  /** The code the app's basket accepts, when it differs from `itemCode` (`cart_code` in the catalogue). */
  cartCode?: string | null;
  inStock?: boolean;
  stock?: number | null;
  sku?: string | null;
  productType?: string | null;
  categoryHierarchy?: string | null;
  explainability?: Record<string, unknown> | null;
  /** The matched part of the title, with `<mark>` around it, when the search engine marks it. */
  highlights?: { title?: string[] } | null;
  /**
   * `complementary` strips only: the approved role pair that put the
   * product here — group by `role` for a tab per role, caption with
   * `label` (both panel languages) for a look. Null for every other strategy.
   */
  complement?: {
    role: string;
    relation: string;
    label: { tr: string; en: string };
    /** The body slot the role sits in (`top`, `bottom`, `footwear`, …); null for a role with none. */
    slot?: string | null;
    /** The slot's name in both panel languages — a look's caption when the merchant picks "slot". */
    slotLabel?: { tr: string; en: string } | null;
  } | null;
  /** The product's siblings (its colour shades share a group code); never an identity. */
  groupCode?: string | null;
  /** The photo a card can show instead of the first — absent when the feed has one image per row. */
  secondaryImageUrl?: string | null;
  /**
   * The product's colour siblings, for a card's shade row. Absent for a product
   * with a single shade. One feed row is one product: a shade has its own
   * product page (`url`) and item code.
   */
  swatches?: SelwiseProductSwatch[] | null;
  /**
   * The buyable options (sizes), each with the code the basket takes. Absent
   * for a product with none; a card asks for one before it adds a product that has several.
   */
  variants?: SelwiseProductVariant[] | null;
  hasVariants?: boolean;
  /** The feed's custom attributes, read by a card node bound to `attr.<key>`. */
  attributes?: Record<string, unknown> | null;
}

/** One shade of a product's colour row. */
export interface SelwiseProductSwatch {
  itemCode?: string;
  /** The shade's name as the feed writes it. */
  color?: string;
  imageUrl?: string;
  /** The shade's own product page. */
  url?: string;
}

/** One buyable option of a product: a size, a shade, with the code the basket accepts. */
export type SelwiseProductVariant = import('./vendor/product-card-variant-logic.js').CardVariant;

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

/** The order of a result list: the merchant's ranking, or the shopper's own. */
export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest';

export interface SearchOptions {
  /** Results per page. Default: the channel's own `behavior.maxResults`. */
  limit?: number;
  /**
   * Results to skip, for the next page: pass `hits.length` of what you already
   * hold. The API reads at most the first 500 results of a search.
   */
  offset?: number;
  /** Default `relevance`: the merchant's pins and ranking rules apply to it only. */
  sort?: SearchSort;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  /**
   * Narrows the results to one category. With a category the query may be empty
   * (browsing a category, which is not a search and is not reported as one).
   */
  category?: string;
  /**
   * This request runs the shopper's query again, narrowed or ordered another
   * way (a category chip, a sort): not a new search, so it is not reported
   * again and does not enter the recent searches. A page past the first is one
   * without saying so.
   */
  refinement?: boolean;
}

/** One category of a result list, with how many of the results it holds. */
export interface SearchCategoryFacet {
  /** The catalogue's path: the value to filter by (`options.category`). */
  name: string;
  count: number;
  /** The visitor's language's name for it, when the catalogue has one. */
  label?: string;
}

export interface SearchResult {
  query: string;
  hits: SelwiseProduct[];
  /** Every match, whatever the page: the same on each page of one search. */
  total?: number;
  /** Where this page started (`options.offset`, as the API read it). */
  offset?: number;
  /**
   * The categories of the results, to filter by. Filled from the hits when the
   * API did not send them.
   */
  categories?: SearchCategoryFacet[];
  /** "Did you mean": other terms to try. Only sent when nothing matched. */
  suggestions?: string[];
  /**
   * A merchant search redirect ("kargo" -> the shipping page).
   *
   * When set, it REPLACES the result list — the browser widget navigates and
   * renders nothing. An app that renders `hits` anyway shows an empty list for
   * a rule the merchant configured on purpose, so check this first.
   */
  redirect?: string;
  /**
   * Why the list may be empty for a reason that is not "nothing matched":
   * `off` — search is switched off for this channel, or this visitor is outside
   * its audience, its experiment's holdout or its test mode's reach; `test` —
   * it is in test mode and this client was not started with `testMode`. Absent
   * (or `ready`) when the search ran. An app that draws "no results" for an
   * `off` or `test` list tells a real shopper that nothing exists, so check it
   * before the empty state.
   */
  status?: 'ready' | 'off' | 'test';
  [key: string]: unknown;
}

/** The sections of the empty search box, each already cut to the channel's own limit. */
export interface SearchSuggestionSections {
  /** This device's last searches, newest first. Empty when the visitor's consent does not keep them. */
  recent: string[];
  popularSearches: string[];
  popularCategories: Array<{ name: string; imageUrl?: string }>;
  popularProducts: SelwiseProduct[];
  /**
   * The sections that have something to show, in the order the merchant
   * arranged them (`suggestions.order`).
   */
  order: Array<'recent' | 'popularSearches' | 'popularCategories' | 'popularProducts'>;
}

/** What opened the search: a button, the field taking focus, typing. */
export type SearchOpenTrigger = 'click' | 'focus' | 'typing';

/** The suggestion a shopper tapped. */
export type SearchSuggestionKind = 'recent' | 'popularSearch' | 'popularCategory' | 'popularProduct';

export interface OrderItemInput {
  /** MUST match `item_code` in the product feed. */
  productItemCode: string;
  name?: string;
  quantity?: number;
  /** What the shopper paid per unit. */
  unitPrice?: number;
  /**
   * The unit's LIST price, when the line was sold below it. Kept with the line
   * (`metadata.originalPrice`); price and discount reports compare the paid
   * price with the catalogue's list price.
   */
  originalPrice?: number;
  totalPrice?: number;
  metadata?: Record<string, unknown>;
}

/**
 * A marketing permission the shopper decided at checkout (an "email me about
 * offers" box). Recorded as a contact's consent with the checkout as its
 * source — the only door an order has for an address or a number: it carries
 * no customer e-mail or phone field of its own.
 */
export interface OrderMarketingConsent {
  kind: 'email' | 'phone';
  /** The address or number the decision is for (`+905321112233`). */
  value: string;
  /** `true`: the shopper ticked the box. `false`: they declined, or withdrew. */
  optIn: boolean;
  /** The wording shown beside the box, as evidence. */
  note?: string;
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
  /** What the shopper decided about marketing at checkout. Omit when the checkout asked nothing. */
  marketingConsent?: OrderMarketingConsent[];
}

/** The OS's notification permission for the app, as the host reports it (`setPushPermission`). */
export type PushPermission = 'granted' | 'denied' | 'undetermined';

/**
 * The family a device token belongs to — which of the merchant's providers
 * sends to it: an FCM registration token, an APNs device token (iOS only), or
 * an Expo push token.
 */
export type PushProvider = 'fcm' | 'apns' | 'expo';

/** The phone's operating system, for a token that works on both (FCM, Expo). */
export type PushPlatform = 'ios' | 'android';

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
