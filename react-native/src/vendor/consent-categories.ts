// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/tracking-contract/src/consent-categories.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/tracking-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Which consent category each tracked event needs — the one list.
 *
 * ## Why this file exists
 *
 * Until 2026-10-26 the list lived in the widget's `constants.ts` and nowhere
 * else, and it named 19 events out of the ~60 the widget actually sends. An
 * event in NO category was treated as `necessary` and always allowed, so a
 * visitor who refused everything still sent `search_query`, `product_click`,
 * `identify`, `user_login` and every experiment `exposure`; the server checked
 * only whether the visitor had ANSWERED, never what they answered; and the app
 * SDK checked nothing. Three readers, one of them partial, none fail-closed.
 *
 * Now the widget's batcher, the ingest endpoint and the app SDK all ask
 * `consentCategoryOfEvent`, and an event this list does not name is
 * `analytics` — an unknown name can no longer pass as necessary.
 *
 * ## What each category holds
 *
 * - `necessary` — only what carries no behaviour: the widget's own technical
 *   health (`script_injected` / `script_error`). A page view is NOT necessary:
 *   the storefront works without our knowing it happened (KVKK Çerez Rehberi,
 *   ePrivacy art. 5(3) — "strictly necessary" means necessary for the service
 *   the visitor asked for).
 * - `analytics` — measurement of what the visitor did on the store: views,
 *   cart, checkout, purchase, search, identity.
 * - `marketing` — what a Selwise SURFACE did to the visitor and how they
 *   answered it: impressions, clicks, closes, experiment exposures. These are
 *   attribution touchpoints and targeting inputs, which is why they are the
 *   marketing half and not the analytics half.
 * - `preferences` — settings the visitor chose.
 *
 * Deliberately dependency-free and published as its own subpath
 * (`@selwise/tracking-contract/consent-categories`): the widget's entry must
 * not import this package's barrel (validators alone are 30KB of source), and
 * the app SDK vendors this file verbatim.
 */

export type ConsentCategoryKey = 'necessary' | 'analytics' | 'marketing' | 'preferences';

export const CONSENT_CATEGORY_KEYS: readonly ConsentCategoryKey[] = [
  'necessary',
  'analytics',
  'marketing',
  'preferences',
];

export const CONSENT_EVENT_CATEGORIES = {
  necessary: ['script_injected', 'script_error'],

  analytics: [
    'page_view',
    'virtual_page_view',
    'category_view',
    'product_view',
    'product_viewed',
    'product_dwell_time',
    'view_content',
    'add_to_cart',
    'remove_from_cart',
    'update_cart',
    'cart_view',
    'cart_abandon',
    'cart_restore',
    'checkout',
    'checkout_begin',
    'checkout_progress',
    'checkout_option',
    'purchase',
    'search',
    'search_instant_open',
    'search_query',
    'search_filter',
    'search_sort',
    'search_page',
    'search_results',
    'search_zero_results',
    'search_close',
    'recent_search_click',
    'popular_search_click',
    'popular_category_click',
    'popular_product_click',
    'category_filter',
    'hover',
    'scroll',
    'form_submit',
    'button_click',
    'wishlist',
    'identify',
    'user_signup',
    'user_login',
    'user_logout',
    'user_update',
    'custom_event',
  ],

  marketing: [
    'impression',
    'click',
    'close',
    'view',
    'widget_view',
    'widget_impression',
    'product_impression',
    'product_click',
    'slider_navigate',
    'slider_swipe',
    'cart_add_all',
    'banner_click',
    'campaign_view',
    // The interaction half of a surface's impression: a Tab Talk writes
    // `impression` when the tab speaks and `tab_return` when the visitor comes
    // back; the goal bar `goal_reached`. Both halves need the same category,
    // or a refusal would withhold one and record the other.
    'tab_return',
    'goal_reached',
    // `/public/experiments/track` event types: an arm shown, a goal reached.
    'exposure',
    'conversion',
    'goal',
  ],

  preferences: ['theme_change', 'language_change', 'currency_change'],
} as const;

const CATEGORY_BY_EVENT: ReadonlyMap<string, ConsentCategoryKey> = new Map(
  (Object.keys(CONSENT_EVENT_CATEGORIES) as ConsentCategoryKey[]).reduce<
    Array<[string, ConsentCategoryKey]>
  >((pairs, category) => {
    for (const name of CONSENT_EVENT_CATEGORIES[category]) pairs.push([name, category]);
    return pairs;
  }, []),
);

/** The category an event needs. An event this list does not name needs `analytics`. */
export function consentCategoryOfEvent(eventName: string): ConsentCategoryKey {
  return CATEGORY_BY_EVENT.get(eventName) ?? 'analytics';
}

/**
 * The category each side channel needs — the requests that do not go through
 * `/events/batch` but carry the same visitor.
 *
 * - `identify` / `traits` link a browser to the merchant's customer: analytics.
 * - `orderAttribution` is who placed an order and what led them there (the
 *   visitor, the visit, the touches, the arms). The order itself is the
 *   merchant's record and always goes; this is the part that measures the
 *   visitor: analytics.
 * - the recommendation and search feedback endpoints (`track/event`,
 *   `track/behavior`, `search/click`, `search/log`, `search/zero-results`) are
 *   measurement of a surface: the same split as their batch events.
 * - `personalization` is reading the visitor's PROFILE to choose content:
 *   segment memberships, a personalised recommendation, the scenario inbox.
 *   Profiling for targeting is the marketing purpose (KVKK Çerez Rehberi
 *   "hedefleme/reklam"); without it the visitor still gets every surface, just
 *   not one chosen from their history.
 * - `presence` is the live heartbeat (`POST /presence`): "this visitor still
 *   has the page open" — measurement of the visit, so analytics, the same as
 *   the page views it keeps alive.
 */
export const CONSENT_CHANNEL_CATEGORIES = {
  identify: 'analytics',
  presence: 'analytics',
  traits: 'analytics',
  orderAttribution: 'analytics',
  searchFeedback: 'analytics',
  recommendationFeedback: 'marketing',
  experimentEvents: 'marketing',
  personalization: 'marketing',
  /**
   * The search box's history (`selwise_recent_searches_<siteKey>`): the
   * visitor's own past terms kept in their browser to offer them back — a
   * remembered setting, so `preferences`. Neither written nor shown without it.
   */
  searchHistory: 'preferences',
} as const satisfies Record<string, ConsentCategoryKey>;

export type ConsentChannel = keyof typeof CONSENT_CHANNEL_CATEGORIES;

/**
 * Does a consent snapshot allow this category?
 *
 * `necessary` always. Otherwise the visitor must have ANSWERED (`granted` is
 * "answered", true for a decline too — see the widget's `consent-state.ts`)
 * and the category must be explicitly true. A snapshot that names no
 * categories at all allows nothing beyond necessary.
 */
export function consentSnapshotAllows(
  snapshot: { granted?: unknown; categories?: unknown } | null | undefined,
  category: ConsentCategoryKey,
): boolean {
  if (category === 'necessary') return true;
  if (!snapshot || snapshot.granted !== true) return false;
  const categories =
    snapshot.categories && typeof snapshot.categories === 'object'
      ? (snapshot.categories as Record<string, unknown>)
      : {};
  return categories[category] === true;
}

/** The policy fields both clients read to decide what an unanswered banner means. */
export interface ConsentPolicyFlags {
  enabled?: unknown;
  waitForConsent?: unknown;
  defaultConsent?: unknown;
  strictStorage?: unknown;
}

/**
 * The channel waits for the visitor's answer, and silence is not one: until
 * the visitor (or the app) decides, nothing that measures them is sent. The
 * web widget and the app SDK both ask this — one rule, so a field added to the
 * policy cannot make them disagree.
 */
export function consentDecisionRequired(policy: ConsentPolicyFlags | null | undefined): boolean {
  return policy?.enabled === true && policy.waitForConsent === true && policy.defaultConsent !== true;
}

/**
 * Strict storage is in force: the visitor's ids stay in memory until analytics
 * consent (`cookieConsent.strictStorage`). Only meaningful while a decision is
 * required — when silence counts as consent there is nothing to wait for.
 */
export function strictStorageActive(policy: ConsentPolicyFlags | null | undefined): boolean {
  return consentDecisionRequired(policy) && policy?.strictStorage === true;
}
