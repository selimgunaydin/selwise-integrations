// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/page-targeting.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

// ---------------------------------------------------------------------------
// Targeting contract — the single copy.
//
// This lived in two places (apps/client and apps/api), each carrying a comment
// telling the next person to keep them in sync. They had already drifted: the
// API grew a `PageTargetingPatch` the client never had, and the two renamed the
// same locals differently. A third consumer (the React Native SDK, which has
// to decide the same thing for `app://` screens) is what made the copying
// indefensible.
//
// Deliberately dependency-free so every surface can import it: the browser
// widget is on a 50KB budget, the SDK ships to a phone, and the API runs it per
// request.
//
// The patch/merge helpers the dashboard write path uses now live here too, and
// apps/api/src/common/page-targeting.ts is a re-export of this file. That was
// the last remaining copy; adding a page-TYPE dimension to a second hand-
// maintained implementation is exactly the drift this consolidation was for.
// ---------------------------------------------------------------------------

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type GeoMode = 'include' | 'exclude';
export type BehaviorMatch = 'all' | 'any';

export const BEHAVIOR_SIGNALS = [
  /**
   * Has this visitor been identified — i.e. did the storefront call
   * `identify()`?
   *
   * The ONLY identity question answerable without a round trip, and that is
   * exactly why it is a signal rather than a segment. The widget reads
   * `getSiteUserId()`, a synchronous storage read, so a rule like "show this
   * header only to signed-in shoppers" is decided on the SYNCHRONOUS path and
   * KEEPS anti-flicker. A segment answers richer questions (order history,
   * CLV) but resolves in the policies chunk, which means the original content
   * paints first — on a header, the most visible place a flash can happen.
   *
   * Everything beyond "is there an id" still belongs to segments: this file
   * has no network and must not grow one.
   */
  'isLoggedIn',
  /**
   * Order history, kept by the widget itself.
   *
   * `trackOrder` is the one purchase signal every integration already sends —
   * the merchant's thank-you page calls it, and every cart platform adapter
   * routes through it. Recording four numbers from it locally turns "has this
   * shopper bought before" into a SYNCHRONOUS question, which is what keeps a
   * rule built on it eligible for anti-flicker.
   *
   * Deliberately NOT the server's order table: that is a segment's job, needs a
   * round trip, and would make a header rule flash. What lives here is only
   * what this browser has seen, and the panel says so.
   */
  'hasOrdered',
  'orderCount',
  'daysSinceLastOrder',
  'lifetimeValue',
  /**
   * Session activity the TRACKER sees, not the data layer.
   *
   * `cartItemCount` and `productsViewedThisSession` are fed by the data-layer
   * chunk alone, so on a storefront with the data layer off they never move and
   * a rule on them silently never matches. These two are fed from
   * `Tracker.track`, which every integration path funnels through.
   */
  'searchesThisSession',
  'cartAddsThisSession',
  /**
   * Derived at snapshot time from the clock and the URL. No storage, no
   * tracking, and true on the very first page view of a brand-new visitor —
   * which is exactly when a returning-visitor signal knows nothing.
   *
   * `dayOfWeek` is 0 = Sunday, matching `Date.getDay()`; the panel offers named
   * days so nobody has to remember that.
   */
  'hourOfDay',
  'dayOfWeek',
  'isWeekend',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'isReturningVisitor',
  'visitCount',
  'sessionCount',
  'daysSinceFirstVisit',
  'daysSinceLastVisit',
  'pageViewsThisSession',
  'productsViewedThisSession',
  'cartItemCount',
  'cartValue',
  'referrerType',
  /**
   * The product on screen (October 2026, Selwise's planning notes §17) —
   * the same facts `{product.*}` says, so a sentence can be chosen by the
   * product it is about: "Son {product.stock} ürün" only while the stock is
   * low, a discount line only above a rate worth saying.
   *
   * - `productPrice` — what the shopper pays now, in the channel's currency.
   * - `productOnSale` — the original price is above the price.
   * - `productDiscountRate` — whole percent off, rounded DOWN; 0 when not on sale.
   * - `productStock` — units in stock, when the catalogue counts them.
   *
   * Unlike every signal above, a product signal has NO default. Anywhere there
   * is no product to speak of — not a product page, a code the catalogue does
   * not carry, a request that failed — it is absent, and a rule on an absent
   * product signal is false under every operator, `neq` included: "stock below
   * 5" must not match a page whose stock nobody measured, which a default of 0
   * would. The values are filled by whoever holds the product
   * (`withProductSignals` in `./dynamic-content`), never stored.
   */
  'productPrice',
  'productOnSale',
  'productDiscountRate',
  'productStock',
  /**
   * The visitor's cookie consent (October 2026) — one boolean per optional
   * category, the same categories the banner asks and the events need
   * (`@selwise/tracking-contract/consent-categories`). "Show this page
   * experiment only to visitors who accepted marketing cookies" is a legal
   * requirement for content chosen from a visitor's profile, and until now no
   * rule could say it.
   *
   * Answered from the consent store in the browser — synchronously, so a rule
   * on it keeps anti-flicker — and `true` for every category on a channel with
   * no consent check configured (the widget then treats everything as allowed,
   * so a rule must agree with it). Absent means NOT given: the default below
   * is `false`, so "consentMarketing is true" never matches a client that
   * cannot say. An older client that does not know these names would drop the
   * rule and show the content to everyone, which is why a rule on them needs
   * `/config` protocol 5 (`CONFIG_PROTOCOL_CONSENT_CONDITIONS`).
   */
  'consentAnalytics',
  'consentMarketing',
  'consentPreferences',
] as const;
export type BehaviorSignal = (typeof BEHAVIOR_SIGNALS)[number];

/** The consent signals — see their entry in `BEHAVIOR_SIGNALS`. */
export const CONSENT_BEHAVIOR_SIGNALS: readonly BehaviorSignal[] = [
  'consentAnalytics',
  'consentMarketing',
  'consentPreferences',
];

export function isConsentBehaviorSignal(signal: unknown): boolean {
  return typeof signal === 'string' && (CONSENT_BEHAVIOR_SIGNALS as readonly string[]).includes(signal);
}

/**
 * The signals that describe the product on screen. Absent — never defaulted —
 * where there is no known product, and the reason a client needs `/config`
 * protocol 4 (`CONFIG_PROTOCOL_PRODUCT_CONDITIONS` in `./dynamic-content`): an
 * older client drops a rule on a signal it does not know, which WIDENS the
 * rule set it belongs to.
 */
export const PRODUCT_BEHAVIOR_SIGNALS: readonly BehaviorSignal[] = [
  'productPrice',
  'productOnSale',
  'productDiscountRate',
  'productStock',
];

export function isProductBehaviorSignal(signal: unknown): boolean {
  return typeof signal === 'string' && (PRODUCT_BEHAVIOR_SIGNALS as readonly string[]).includes(signal);
}

export const BEHAVIOR_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;
export type BehaviorOperator = (typeof BEHAVIOR_OPERATORS)[number];

export interface BehaviorRule {
  signal: BehaviorSignal;
  op: BehaviorOperator;
  value: number | string | boolean;
}

export interface DeviceTargeting {
  types: DeviceType[];
}

export interface GeoTargeting {
  mode: GeoMode;
  countries: string[];
}

export interface BehaviorTargeting {
  match: BehaviorMatch;
  rules: BehaviorRule[];
}

/**
 * The kinds of page a storefront has, and the vocabulary a rule targets on.
 *
 * ## Why this list lives HERE, in a file that imports nothing
 *
 * It is also what the detector in `./page-type` produces and what the tracking
 * module labels a `page_view` with — three readers, one list, or "product" and
 * "products" become two different answers to the same question. This file is
 * the one of the three that is vendored verbatim into the published SDK
 * (`scripts/sync-vendored-page-targeting.js`), so it cannot import the others;
 * they import it.
 *
 * `other` is a real member, not a null: a rule may legitimately say "everywhere
 * that is not one of the pages I named".
 */
export const PAGE_TYPES = [
  'home',
  'product',
  'category',
  'search',
  'checkout',
  'cart',
  'account',
  'other',
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

/**
 * "Show only on product pages."
 *
 * ## Why a page TYPE and not another URL pattern
 *
 * URL targeting cannot express this on a large share of real storefronts. A
 * merchant whose product pages are `example.com/kirmizi-ruj` — no `/product`
 * segment, no id suffix, the slug straight off the root — has no pattern to
 * write: anything that matches their products matches their category pages and
 * their home page too. Akinon is the shape that forced it, where product and
 * category pretty URLs are configured per store in Omnitron and rewritten
 * server-side, so no regex covers them (see the page-type note in
 * Selwise's planning notes).
 *
 * The platform already knew the answer — the tracking module has labelled every
 * `page_view` with a page type since it shipped, resolving it from the URL and
 * then from the DOM. Targeting simply could not ask.
 */
export interface PageTypeTargeting {
  types: PageType[];
}

export interface PageTargetingConfig {
  showOnAllPages: boolean;
  includeUrls: string[];
  excludeUrls: string[];
  pageTypes?: PageTypeTargeting;
  device?: DeviceTargeting;
  geo?: GeoTargeting;
  behavior?: BehaviorTargeting;
}

/**
 * A partial update of a stored config: only the dimensions the caller named.
 *
 * `undefined` means "leave this alone" and is why the dashboard can save the
 * targeting tab without resending the device rules from another tab. It lives
 * here rather than in the API because it was the last reason the API kept a
 * SECOND copy of this whole file — a copy that had already drifted once and
 * would have had to grow page-type support by hand.
 *
 * The browser widget and the vendored SDK carry `mergePageTargeting` and
 * `hasPageTargetingPatch` without calling them. Measured with an A/B build,
 * that is 80 bytes gzipped in `client.js` — a cheaper bill than a second
 * implementation of what a targeting rule means.
 */
export interface PageTargetingPatch {
  showOnAllPages?: boolean;
  includeUrls?: string[];
  excludeUrls?: string[];
  pageTypes?: unknown;
  device?: unknown;
  geo?: unknown;
  behavior?: unknown;
}

export type BehaviorSnapshot = Partial<Record<BehaviorSignal, number | string | boolean>>;

export interface TargetingContext {
  pageUrl: string;
  /**
   * What KIND of page this is, resolved by the caller.
   *
   * Supplied rather than derived, for the same reason `deviceType` and
   * `country` are: this file has no DOM and no tracking config, and the
   * browser widget, the API and the app SDK each know the answer by a
   * different route. `detectPageType` in `./page-type` is what the two browser
   * callers use, so their answer is the one tracking already reports.
   *
   * Undefined means "not resolved", which fails OPEN — see
   * `evaluatePageTypeTargeting`.
   */
  pageType?: PageType | string;
  deviceType?: DeviceType;
  country?: string;
  behavior?: BehaviorSnapshot;
}

const DEVICE_TYPES: DeviceType[] = ['mobile', 'tablet', 'desktop'];
const MAX_REGEX_PATTERN_LENGTH = 500;
const MAX_GEO_COUNTRIES = 250;
const MAX_BEHAVIOR_RULES = 25;

const DEFAULT_PAGE_TARGETING: PageTargetingConfig = {
  showOnAllPages: true,
  includeUrls: [],
  excludeUrls: [],
};

function normalizePatternList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const pattern = raw.trim();
    if (!pattern) continue;
    if (seen.has(pattern)) continue;
    seen.add(pattern);
    normalized.push(pattern);
  }

  return normalized;
}

function normalizeDeviceTargeting(value: unknown): DeviceTargeting | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const types = (value as Record<string, unknown>).types;
  if (!Array.isArray(types)) return undefined;

  const seen = new Set<DeviceType>();
  for (const raw of types) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().toLowerCase() as DeviceType;
    if (DEVICE_TYPES.includes(t)) seen.add(t);
  }

  if (seen.size === 0) return undefined;
  return { types: Array.from(seen) };
}

/**
 * Unknown members are DROPPED, not kept.
 *
 * A type this build does not know can never be produced by the detector, so
 * keeping it would make a rule that silently matches nothing — and dropping
 * every member turns the dimension off, which is the fail-open state. That is
 * the right failure for a rule written by a newer dashboard than the widget
 * reading it: show it everywhere, rather than nowhere.
 */
function normalizePageTypeTargeting(value: unknown): PageTypeTargeting | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const types = (value as Record<string, unknown>).types;
  if (!Array.isArray(types)) return undefined;

  const seen = new Set<PageType>();
  for (const raw of types) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().toLowerCase() as PageType;
    if ((PAGE_TYPES as readonly string[]).includes(t)) seen.add(t);
  }

  if (seen.size === 0) return undefined;
  return { types: Array.from(seen) };
}

function normalizeGeoTargeting(value: unknown): GeoTargeting | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as Record<string, unknown>;
  const mode: GeoMode = payload.mode === 'exclude' ? 'exclude' : 'include';

  const rawCountries = Array.isArray(payload.countries) ? payload.countries : [];
  const seen = new Set<string>();
  for (const raw of rawCountries) {
    if (typeof raw !== 'string') continue;
    const code = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) seen.add(code);
    if (seen.size >= MAX_GEO_COUNTRIES) break;
  }

  if (seen.size === 0) return undefined;
  return { mode, countries: Array.from(seen) };
}

/**
 * A behaviour rule set, cleaned: known signals and operators only, scalar
 * values, at most `MAX_BEHAVIOR_RULES`. Exported for the other reader of the
 * same rule shape — a campaign's content STATES (`./dynamic-content`) choose
 * their sentence with exactly these rules, so they are cleaned by exactly this.
 */
export function normalizeBehaviorTargeting(value: unknown): BehaviorTargeting | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as Record<string, unknown>;
  const match: BehaviorMatch = payload.match === 'any' ? 'any' : 'all';

  const rawRules = Array.isArray(payload.rules) ? payload.rules : [];
  const rules: BehaviorRule[] = [];
  for (const raw of rawRules) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const signal = r.signal as BehaviorSignal;
    const op = r.op as BehaviorOperator;
    if (!BEHAVIOR_SIGNALS.includes(signal)) continue;
    if (!BEHAVIOR_OPERATORS.includes(op)) continue;
    const ruleValue = r.value;
    if (
      typeof ruleValue !== 'number' &&
      typeof ruleValue !== 'string' &&
      typeof ruleValue !== 'boolean'
    ) {
      continue;
    }
    rules.push({ signal, op, value: ruleValue });
    if (rules.length >= MAX_BEHAVIOR_RULES) break;
  }

  if (rules.length === 0) return undefined;
  return { match, rules };
}

export function normalizePageTargeting(input: unknown): PageTargetingConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_PAGE_TARGETING };
  }

  const payload = input as Record<string, unknown>;

  const config: PageTargetingConfig = {
    showOnAllPages: Boolean(payload.showOnAllPages ?? DEFAULT_PAGE_TARGETING.showOnAllPages),
    includeUrls: normalizePatternList(payload.includeUrls),
    excludeUrls: normalizePatternList(payload.excludeUrls),
  };

  const pageTypes = normalizePageTypeTargeting(payload.pageTypes);
  if (pageTypes) config.pageTypes = pageTypes;
  const device = normalizeDeviceTargeting(payload.device);
  if (device) config.device = device;
  const geo = normalizeGeoTargeting(payload.geo);
  if (geo) config.geo = geo;
  const behavior = normalizeBehaviorTargeting(payload.behavior);
  if (behavior) config.behavior = behavior;

  return config;
}

export function mergePageTargeting(
  current: unknown,
  patch: PageTargetingPatch
): PageTargetingConfig {
  const base = normalizePageTargeting(current);

  return normalizePageTargeting({
    showOnAllPages:
      patch.showOnAllPages !== undefined ? patch.showOnAllPages : base.showOnAllPages,
    includeUrls: patch.includeUrls !== undefined ? patch.includeUrls : base.includeUrls,
    excludeUrls: patch.excludeUrls !== undefined ? patch.excludeUrls : base.excludeUrls,
    pageTypes: patch.pageTypes !== undefined ? patch.pageTypes : base.pageTypes,
    device: patch.device !== undefined ? patch.device : base.device,
    geo: patch.geo !== undefined ? patch.geo : base.geo,
    behavior: patch.behavior !== undefined ? patch.behavior : base.behavior,
  });
}

export function hasPageTargetingPatch(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }

  const payload = input as Record<string, unknown>;
  return (
    payload.showOnAllPages !== undefined ||
    payload.includeUrls !== undefined ||
    payload.excludeUrls !== undefined ||
    payload.pageTypes !== undefined ||
    payload.device !== undefined ||
    payload.geo !== undefined ||
    payload.behavior !== undefined
  );
}

export function matchUrlPattern(url: string, pattern: string): boolean {
  const normalizedUrl = String(url || '');
  const rawPattern = String(pattern || '').trim();

  if (!rawPattern) return false;

  // Explicit regex pattern: `regex:<expr>` (case-sensitive, matched against full URL).
  if (rawPattern.toLowerCase().startsWith('regex:')) {
    const expr = rawPattern.slice(6).trim();
    if (!expr || expr.length > MAX_REGEX_PATTERN_LENGTH) return false;
    try {
      return new RegExp(expr).test(normalizedUrl);
    } catch {
      return false;
    }
  }

  const lowerUrl = normalizedUrl.toLowerCase();
  const lowerPattern = rawPattern.toLowerCase();

  if (lowerPattern.includes('*')) {
    const regexPattern = lowerPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(lowerUrl);
  }

  return lowerUrl === lowerPattern || lowerUrl.includes(lowerPattern);
}

/**
 * Does the page KIND satisfy this rule.
 *
 * Fails open on two distinct "we do not know" cases, and they are different
 * enough to name:
 *
 *  - **No rule.** The merchant did not target on page type, so every page
 *    passes. Same as an empty device or geo list.
 *  - **No resolved type.** The caller could not work out what page this is —
 *    an app screen the host did not label, a server-side evaluation with no
 *    DOM, a widget built before the detector shipped. Suppressing the surface
 *    there would silently stop campaigns that ran yesterday, for a reason the
 *    merchant cannot see anywhere. A surface shown one page too wide is a
 *    worse-targeted campaign; a surface hidden everywhere is a broken one.
 *
 * `other` is matched literally, so "only on pages that are none of these" is
 * expressible — it is not a synonym for unknown.
 */
export function evaluatePageTypeTargeting(
  pageTypes: PageTypeTargeting | undefined,
  pageType?: PageType | string
): boolean {
  if (!pageTypes || pageTypes.types.length === 0) return true;
  if (!pageType) return true;
  return (pageTypes.types as readonly string[]).includes(String(pageType).toLowerCase());
}

export function evaluatePageTargeting(
  targetingInput: unknown,
  currentUrl: string,
  pageType?: PageType | string
): boolean {
  const targeting = normalizePageTargeting(targetingInput);
  const normalizedCurrentUrl = String(currentUrl || '');

  if (!evaluatePageTypeTargeting(targeting.pageTypes, pageType)) return false;

  if (targeting.excludeUrls.length > 0) {
    const excluded = targeting.excludeUrls.some((pattern) =>
      matchUrlPattern(normalizedCurrentUrl, pattern)
    );
    if (excluded) return false;
  }

  if (targeting.showOnAllPages === false) {
    if (targeting.includeUrls.length === 0) return false;
    if (!normalizedCurrentUrl) return false;

    const included = targeting.includeUrls.some((pattern) =>
      matchUrlPattern(normalizedCurrentUrl, pattern)
    );
    if (!included) return false;
  }

  return true;
}

function evaluateDeviceTargeting(device: DeviceTargeting | undefined, deviceType?: DeviceType): boolean {
  if (!device || device.types.length === 0) return true;
  if (!deviceType) return true;
  return device.types.includes(deviceType);
}

function evaluateGeoTargeting(geo: GeoTargeting | undefined, country?: string): boolean {
  if (!geo || geo.countries.length === 0) return true;
  if (!country) return true;
  const code = country.trim().toUpperCase();
  const inList = geo.countries.includes(code);
  return geo.mode === 'exclude' ? !inList : inList;
}

/**
 * Equality that survives the wire.
 *
 * A rule's value is typed by the dashboard control that wrote it, but the API
 * stores whatever JSON it is handed and the signal is typed by the widget: a
 * rule saved as `"3"` by a script, or `"true"` by an older editor, compared
 * with `===` against the number `3` or the boolean `true` never matched, and
 * nothing on any screen said why. Numbers compare as numbers, booleans as
 * booleans, text case-insensitively (the widget lowercases what it reads off
 * the URL, and a merchant typing `Instagram` meant `instagram`).
 */
function looselyEqual(actual: number | string | boolean, expected: number | string | boolean): boolean {
  if (typeof actual === 'boolean' || typeof expected === 'boolean') {
    const toBool = (value: number | string | boolean): boolean | null =>
      typeof value === 'boolean'
        ? value
        : value === 'true' || value === 1 || value === '1'
          ? true
          : value === 'false' || value === 0 || value === '0'
            ? false
            : null;
    const a = toBool(actual);
    const b = toBool(expected);
    return a !== null && a === b;
  }
  if (typeof actual === 'number' || typeof expected === 'number') {
    const a = Number(actual);
    const b = Number(expected);
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }
  return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();
}

function compareBehavior(
  actual: number | string | boolean,
  op: BehaviorOperator,
  expected: number | string | boolean
): boolean {
  switch (op) {
    case 'eq':
      return looselyEqual(actual, expected);
    case 'neq':
      return !looselyEqual(actual, expected);
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

function defaultSignalValue(signal: BehaviorSignal): number | string | boolean {
  if (signal === 'isReturningVisitor') return false;
  // Consent nobody reported is consent not given.
  if (isConsentBehaviorSignal(signal)) return false;
  if (signal === 'referrerType') return 'direct';
  return 0;
}

/**
 * One rule: true, false — or null when its signal is still being MEASURED
 * (`pending`), which only a caller that knows a measurement is on its way can
 * say. A product signal that is absent and not pending is simply false.
 */
/**
 * Signals with no value for some shoppers, where the snapshot carries a
 * sentinel instead: `daysSinceLastOrder` is -1 for a shopper who has never
 * ordered. Compared as a number, -1 is "less than 30", so a campaign for
 * "ordered in the last 30 days" was shown to every visitor who never had.
 * Absent satisfies only "is not" — nothing is equal to, above or below it.
 */
const SENTINEL_WHEN_ABSENT: Readonly<Partial<Record<string, number>>> = {
  daysSinceLastOrder: -1,
};

function decideRule(
  rule: BehaviorRule,
  signals: BehaviorSnapshot | undefined,
  pending: ReadonlySet<string> | null | undefined
): boolean | null {
  const actual = signals?.[rule.signal];
  const sentinel = SENTINEL_WHEN_ABSENT[rule.signal];
  if (sentinel !== undefined && (actual === sentinel || actual === undefined)) {
    if (actual === undefined && pending?.has(rule.signal)) return null;
    return rule.op === 'neq';
  }
  if (actual === undefined) {
    if (pending?.has(rule.signal)) return null;
    if (isProductBehaviorSignal(rule.signal)) return false;
    return compareBehavior(defaultSignalValue(rule.signal), rule.op, rule.value);
  }
  return compareBehavior(actual, rule.op, rule.value);
}

/**
 * A rule set's answer in three values: `true`, `false`, or `null` — "cannot
 * say yet", because a rule that could still decide it reads a signal in
 * `pending`. A rule that is already decided either way is honoured: in an
 * `all` set one false rule is false whatever is pending, in an `any` set one
 * true rule is true.
 *
 * A content state asks this while the product's facts are being read, so a
 * state about the product WAITS instead of yielding to the base content and
 * then replacing it (`resolveCampaignContent` in `./dynamic-content`).
 */
export function decideBehaviorTargeting(
  behavior: BehaviorTargeting | undefined,
  signals?: BehaviorSnapshot,
  pending?: ReadonlySet<string> | null
): boolean | null {
  if (!behavior || behavior.rules.length === 0) return true;
  const any = behavior.match === 'any';
  let undecided = false;
  for (const rule of behavior.rules) {
    const verdict = decideRule(rule, signals, pending);
    if (verdict === null) undecided = true;
    else if (verdict === any) return any;
  }
  return undecided ? null : !any;
}

/** Exported for content states, which ask the same question of the same snapshot. */
export function evaluateBehaviorTargeting(
  behavior: BehaviorTargeting | undefined,
  signals?: BehaviorSnapshot
): boolean {
  return decideBehaviorTargeting(behavior, signals) === true;
}

/**
 * Unified targeting evaluation: page (URL and kind) AND device AND geo AND
 * behavior. Each dimension fails open when its config is empty or runtime
 * context is missing.
 */
export function evaluateTargeting(targetingInput: unknown, ctx: TargetingContext): boolean {
  const targeting = normalizePageTargeting(targetingInput);

  if (!evaluatePageTargeting(targeting, ctx.pageUrl, ctx.pageType)) return false;
  if (!evaluateDeviceTargeting(targeting.device, ctx.deviceType)) return false;
  if (!evaluateGeoTargeting(targeting.geo, ctx.country)) return false;
  if (!evaluateBehaviorTargeting(targeting.behavior, ctx.behavior)) return false;

  return true;
}
