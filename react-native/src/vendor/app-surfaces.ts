// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/app-surfaces.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * Where on an APP screen a strip is drawn.
 *
 * ## What this is for
 *
 * On a website a recommendation strip's place is a CSS selector. A native
 * screen has nothing to match one against, so the app mounts named points
 * (`<SelwiseSlot screenName="ProductDetail" slot="pdp-under-info" />`,
 * `@selwise/akinon-appmaker-plugin`) and the merchant picks one in the
 * dashboard. The pick is stored where the web stores its selector — the
 * strip's `containerSelector`, written as `[data-selwise-slot="pdp-under-info"]`
 * (the same attribute form the web demos already use) — so nothing about the
 * API, the public payload or the SDK changed to carry it.
 *
 * Which SCREEN a strip is on stays page targeting: an include rule
 * `app://product`, exactly as a campaign.
 *
 * ## One table, one generated copy
 *
 * The React Native SDK is published on its own and cannot import this package,
 * so it carries a generated copy (`scripts/sync-vendored-page-targeting.js`,
 * checked by `pnpm targeting:check`): the points an app can mount are read from
 * the table the dashboard offers, so a name the dashboard offers that no app
 * mounts — a strip that silently draws somewhere else — cannot happen.
 *
 * NOT re-exported from the barrel: only the dashboard needs it, and the barrel
 * lands in the widget's initial chunk. Import the subpath:
 *   import { APP_SCREEN_SLOTS } from '@selwise/widget-contract/app-surfaces'
 */

import type { PageType } from './page-targeting.js';

export interface AppScreen {
  /** The synthetic screen address page targeting matches (`app://product`). */
  readonly url: string;
  /** Stable key for the screen's label in the dashboard dictionary. */
  readonly key: string;
  /** The page type the plugin labels this screen with. */
  readonly pageType: PageType;
  /** Mountable points, top to bottom. The LAST is the screen's default. Empty: a screen with no point to place a strip at. */
  readonly slots: readonly string[];
  /**
   * Whether a link can open this screen on its own — a button pointing at
   * `app://basket`. A screen that shows ONE thing (a product, a collection, an
   * order, a list of one category, a finished checkout) cannot be opened by
   * its address alone: there is no "which" in the link, so it is not a link
   * target. Absent: linkable.
   */
  readonly linkable?: false;
}

/** A screen that has at least one mountable point. */
export type AppScreenSlots = AppScreen;

/**
 * EVERY screen the App Maker plugin names (`integration/screens.js`), with the
 * page type it labels it with — what a campaign can be targeted at, what an
 * analytics row means and what a screen chip is called. A screen is here when
 * the plugin maps a route to its address, so a merchant never has to know
 * (or type) `app://checkout` to put a surface on the payment screen.
 *
 * `app://other` is the plugin's fallback for a route it does not know and is
 * deliberately not a choice: there is nothing to say about "an unknown screen".
 */
export const APP_SCREENS: readonly AppScreen[] = [
  { url: 'app://home', key: 'home', pageType: 'home', slots: ['home-top', 'home-bottom'] },
  {
    url: 'app://product',
    key: 'product',
    pageType: 'product',
    slots: ['pdp-under-cart', 'pdp-under-info', 'pdp-bottom'],
    linkable: false,
  },
  { url: 'app://list', key: 'list', pageType: 'category', slots: ['plp-top', 'plp-bottom'], linkable: false },
  { url: 'app://category', key: 'category', pageType: 'category', slots: ['category-bottom'] },
  { url: 'app://collections', key: 'collections', pageType: 'category', slots: [] },
  { url: 'app://collection', key: 'collection', pageType: 'category', slots: [], linkable: false },
  { url: 'app://search', key: 'search', pageType: 'search', slots: ['search-bottom'] },
  {
    url: 'app://basket',
    key: 'basket',
    pageType: 'cart',
    slots: ['basket-under-items', 'basket-bottom'],
  },
  { url: 'app://checkout', key: 'checkout', pageType: 'checkout', slots: [], linkable: false },
  {
    url: 'app://checkout/success',
    key: 'checkoutSuccess',
    pageType: 'checkout',
    slots: ['order-success-bottom'],
    linkable: false,
  },
  { url: 'app://favourites', key: 'favourites', pageType: 'account', slots: ['favourites-bottom'] },
  { url: 'app://account', key: 'account', pageType: 'account', slots: [] },
  { url: 'app://account/profile', key: 'accountProfile', pageType: 'account', slots: [] },
  { url: 'app://account/orders', key: 'accountOrders', pageType: 'account', slots: [] },
  { url: 'app://account/order', key: 'accountOrder', pageType: 'account', slots: [], linkable: false },
  { url: 'app://auth/login', key: 'authLogin', pageType: 'account', slots: [] },
  { url: 'app://auth/register', key: 'authRegister', pageType: 'account', slots: [] },
  { url: 'app://notifications', key: 'notifications', pageType: 'other', slots: [] },
  { url: 'app://contact', key: 'contact', pageType: 'other', slots: [] },
];

/** The screens a button or a notification can open by address alone (`linkable`). */
export const APP_LINKABLE_SCREENS: readonly AppScreen[] = APP_SCREENS.filter((screen) => screen.linkable !== false);

/** The screens a strip or an enrichment rule can be placed ON (the ones with points). */
export const APP_SCREEN_SLOTS: readonly AppScreenSlots[] = APP_SCREENS.filter(
  (screen) => screen.slots.length > 0
);

/**
 * The catalogue's screen for a stored address (`app://product`), or null for
 * one it does not list (a screen the merchant typed, or `app://other`). Matches
 * the whole address, case-insensitively — page targeting's include rule matches
 * a SUBSTRING, which is a separate question.
 */
export function appScreenOfUrl(url: string | null | undefined): AppScreen | null {
  const text = String(url ?? '').trim().toLowerCase();
  if (!text) return null;
  return APP_SCREENS.find((screen) => screen.url === text) ?? null;
}

const SLOT_ATTRIBUTE = /data-selwise-slot\s*=\s*["']?([a-z0-9-]+)["']?/i;
const BARE_NAME = /^[a-z0-9-]+$/i;

/** The selector the dashboard stores for a slot. */
export function appSlotSelector(slot: string): string {
  return `[data-selwise-slot="${slot}"]`;
}

/**
 * The slot a stored container selector names; null for none. Reads the
 * attribute form and a bare name, as the plugin does.
 */
export function appSlotOfSelector(selector: string | null | undefined): string | null {
  const text = String(selector ?? '').trim();
  if (!text) return null;
  const attribute = text.match(SLOT_ATTRIBUTE)?.[1];
  if (attribute) return attribute.toLowerCase();
  return BARE_NAME.test(text) ? text.toLowerCase() : null;
}

/**
 * The screen a named point is mounted on, by the point's name; null for a name
 * the catalogue does not have. A point belongs to exactly ONE screen (the
 * catalogue's spec holds it), which is what makes "a campaign in this point" a
 * statement about a screen too.
 */
export function appScreenOfSlot(slot: string | null | undefined): AppScreenSlots | null {
  const name = String(slot ?? '').trim().toLowerCase();
  if (!name) return null;
  return APP_SCREEN_SLOTS.find((screen) => screen.slots.includes(name)) ?? null;
}

/** The page targeting a surface that sits in a point has: that point's screen, nothing else. */
export interface AppPointPageTargeting {
  showOnAllPages: false;
  includeUrls: [string];
  excludeUrls: [];
  pageTypes: [];
}

/**
 * Where a CAMPAIGN placed in the point `slot` can appear: only the screen that
 * mounts the point (`<SelwiseSlot screen slot>`), so a targeting that names
 * other screens, "all screens", or a kind of screen says something the point
 * cannot do. The dashboard shows this as fixed and the API stores it, so the
 * record and the runtime say the same thing. Null for a name with no screen.
 */
export function appPointPageTargeting(slot: string | null | undefined): AppPointPageTargeting | null {
  const screen = appScreenOfSlot(slot);
  return screen ? { showOnAllPages: false, includeUrls: [screen.url], excludeUrls: [], pageTypes: [] } : null;
}

/** The screens a rule's include list names (`app://product`), in catalogue order. */
export function appScreensForUrls(urls: readonly string[]): readonly AppScreenSlots[] {
  const named = new Set(urls.map((url) => url.trim().toLowerCase()));
  return APP_SCREEN_SLOTS.filter((screen) => named.has(screen.url));
}

/**
 * The slots a strip can be sent to given where it is shown: the named
 * screens', or every screen's when it is shown everywhere or names none of
 * the catalogue's.
 */
export function appSlotChoices(
  showOnAllPages: boolean,
  includeUrls: readonly string[]
): readonly AppScreenSlots[] {
  if (showOnAllPages) return APP_SCREEN_SLOTS;
  const named = appScreensForUrls(includeUrls);
  return named.length > 0 ? named : APP_SCREEN_SLOTS;
}

/** The default slot of a screen: where a strip with no slot is drawn. */
export function appDefaultSlot(screen: AppScreenSlots): string {
  return screen.slots[screen.slots.length - 1] ?? '';
}

/** The screens that carry one of these page types, in catalogue order. */
export function appScreensOfPageTypes(pageTypes: readonly string[]): readonly AppScreen[] {
  return APP_SCREENS.filter((screen) => pageTypes.includes(screen.pageType));
}

/** The first path segments of a storefront link that name a screen an app has, by screen. */
const STOREFRONT_SEGMENT_SCREENS: Readonly<Record<string, string>> = {
  cart: 'app://basket',
  basket: 'app://basket',
  sepet: 'app://basket',
  // The payment screen is not a link target (`linkable: false`): the basket is where it starts.
  checkout: 'app://basket',
  search: 'app://search',
  arama: 'app://search',
  account: 'app://account',
  hesabim: 'app://account',
  favourites: 'app://favourites',
  favorites: 'app://favourites',
  favoriler: 'app://favourites',
  wishlist: 'app://favourites',
  contact: 'app://contact',
  iletisim: 'app://contact',
};

/**
 * The app screen a STOREFRONT link means.
 *
 * A campaign template ships web paths (`/checkout`, `/collections/new`): on a
 * website they open a page, in an app nothing maps them unless the host does.
 * Applying a template to an app channel writes the screen the path stands for
 * instead — `/` the home, the basket's paths the basket, `/search` search,
 * `/account…` the account, a wish list the favourites, and any other path a
 * category screen (`app://category`; a product or a list is not a link target,
 * see `APP_LINKABLE_SCREENS`). Everything that is not a plain site path — an
 * https page, an `app://` screen, a deep link, `mailto:`, `tel:`, an anchor, a
 * `${…}` token, an empty value — is returned as it was.
 */
export function appLinkOfStorefrontLink(link: string): string {
  const text = link.trim();
  if (!text.startsWith('/') || text.startsWith('//')) return link;
  const path = (text.split(/[?#]/, 1)[0] ?? '').toLowerCase();
  const first = path.split('/').filter(Boolean)[0];
  if (!first) return 'app://home';
  return STOREFRONT_SEGMENT_SCREENS[first] ?? 'app://category';
}
