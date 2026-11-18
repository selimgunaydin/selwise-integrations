/**
 * App Maker screen names to the synthetic URLs Selwise targets on.
 *
 * ## Why synthetic URLs
 *
 * Page targeting, funnels and journeys are all keyed on `pageUrl` on the
 * server. A native app has no URL, so every one of those features would see a
 * single undifferentiated surface. `app://<screen>` gives them the same shape
 * they have on web without inventing a second targeting model.
 *
 * The scheme matters as much as the path: a merchant whose site is
 * `magaza.com.tr` gets `https://` rows from the web and `app://` rows from
 * the app in the same reports, and can tell them apart with one filter.
 *
 * Screen names are the App Maker router's own (`src/router/screens.js`), NOT
 * ours to rename — the value arrives as `data.currentPage` from
 * `navigationChange` and must match exactly.
 */
const SCREENS = [
  { route: 'HomePage', url: 'app://home', pageType: 'home' },
  { route: 'ProductDetail', url: 'app://product', pageType: 'product' },
  { route: 'ProductList', url: 'app://list', pageType: 'category' },
  { route: 'Category', url: 'app://category', pageType: 'category' },
  // The category menu under another name in some App Maker projects.
  { route: 'CategoryList', url: 'app://category', pageType: 'category' },
  { route: 'CollectionList', url: 'app://collections', pageType: 'category' },
  { route: 'CollectionDetail', url: 'app://collection', pageType: 'category' },
  { route: 'Search', url: 'app://search', pageType: 'search' },
  { route: 'PrimeSearch', url: 'app://search', pageType: 'search' },
  // The route a project gives `SelwiseSearchScreen` when it is not replacing its own.
  { route: 'SelwiseSearch', url: 'app://search', pageType: 'search' },
  { route: 'Basket', url: 'app://basket', pageType: 'cart' },
  { route: 'Checkout', url: 'app://checkout', pageType: 'checkout' },
  // The in-app checkout steps are `NativeCheckout` (and `AkifastCheckout` for
  // the express one) in an App Maker router, not `Checkout`: left out, a
  // checkout funnel and a "checkout page" targeting rule matched nothing in
  // an app whose whole checkout is native.
  { route: 'NativeCheckout', url: 'app://checkout', pageType: 'checkout' },
  { route: 'AkifastCheckout', url: 'app://checkout', pageType: 'checkout' },
  { route: 'CheckoutSuccess', url: 'app://checkout/success', pageType: 'checkout' },
  { route: 'Favourite', url: 'app://favourites', pageType: 'account' },
  { route: 'Account', url: 'app://account', pageType: 'account' },
  { route: 'Profile', url: 'app://account/profile', pageType: 'account' },
  { route: 'Orders', url: 'app://account/orders', pageType: 'account' },
  { route: 'OrderDetail', url: 'app://account/order', pageType: 'account' },
  { route: 'SignIn', url: 'app://auth/login', pageType: 'account' },
  { route: 'SignUp', url: 'app://auth/register', pageType: 'account' },
  { route: 'Notifications', url: 'app://notifications', pageType: 'other' },
  { route: 'NotificationPage', url: 'app://notifications', pageType: 'other' },
  { route: 'Contact', url: 'app://contact', pageType: 'other' }
];

/** Route name to screen address, for the standard routes. */
const SCREEN_URLS = Object.fromEntries(SCREENS.map((entry) => [entry.route, entry.url]));

/**
 * App Maker screen names to the dashboard's page types (`PAGE_TYPES` in
 * `@selwise/react-native`'s targeting).
 *
 * A campaign the merchant limited to "product pages" was shown on EVERY app
 * screen: the SDK treats an unlabelled screen as matching every page type (a
 * surface shown too widely beats one hidden everywhere), and this plugin never
 * labelled one. A screen missing here stays unlabelled on purpose — guessing
 * `other` for a custom product screen would hide the merchant's product-page
 * campaigns there instead.
 */
const SCREEN_PAGE_TYPES = Object.fromEntries(SCREENS.map((entry) => [entry.route, entry.pageType]));

/** Screens whose URL a merchant is most likely to target a widget at. */
const DEFAULT_SCREEN_URL = 'app://other';

/** The page type of an address: the one every standard route of it shares. */
const PAGE_TYPE_OF_URL = {};
for (const entry of SCREENS) PAGE_TYPE_OF_URL[entry.url] = entry.pageType;

function addressOf(url) {
  return typeof url === 'string' ? url.trim().replace(/\/+$/, '') : '';
}

/**
 * The routes the app's own `screenRoutes` config names, route to address
 * (`{ "app://search": "SelwiseSearch" }` → `SelwiseSearch` is `app://search`).
 * This is the ONE reverse lookup: the same config that says which route a link
 * to an address opens (`screenRouteOf`) says which address a route stands for,
 * so a route the merchant registered under any name is a screen Selwise knows.
 * Built once per config object.
 */
const overrideTables = new WeakMap();

function overrideRoutes(overrides) {
  if (!overrides || typeof overrides !== 'object') return null;
  let table = overrideTables.get(overrides);
  if (!table) {
    table = {};
    for (const key of Object.keys(overrides)) {
      const route = overrides[key];
      const address = addressOf(key);
      if (typeof route === 'string' && route && address.startsWith('app://')) table[route] = address;
    }
    overrideTables.set(overrides, table);
  }
  return table;
}

/** The address of a route: the app's `screenRoutes` first, then the standard table, else `app://<route>`. */
function screenUrl(screenName, overrides) {
  if (!screenName) return DEFAULT_SCREEN_URL;
  const own = overrideRoutes(overrides);
  if (own && Object.prototype.hasOwnProperty.call(own, screenName)) return own[screenName];
  return SCREEN_URLS[screenName] || 'app://' + String(screenName).toLowerCase();
}

/**
 * The page type of a route, from its address: a route the merchant registered
 * for `app://search` is a search page whatever it is called. A route no table
 * knows stays unlabelled.
 */
function screenPageType(screenName, overrides) {
  if (!screenName) return undefined;
  const own = overrideRoutes(overrides);
  if (own && Object.prototype.hasOwnProperty.call(own, screenName)) {
    return PAGE_TYPE_OF_URL[own[screenName]] || undefined;
  }
  return SCREEN_PAGE_TYPES[screenName] || undefined;
}

/**
 * The App Maker route a link to a screen address opens (`app://basket` →
 * `Basket`), for a campaign button or a push notification that points at one
 * of the app's own screens.
 *
 * The app's own `screenRoutes` config wins (a project that renamed a route,
 * or opens search as `PrimeSearch`); otherwise the first standard route the
 * address is mapped from. A screen that shows ONE thing — a product, a
 * collection, an order — is not opened by its address alone: there is no
 * "which" in the link, so null and the link does nothing.
 */
const UNLINKABLE_SCREEN_URLS = new Set([
  'app://product',
  'app://list',
  'app://collection',
  'app://checkout',
  'app://checkout/success',
  'app://account/order',
]);

function screenRouteOf(url, overrides) {
  const address = addressOf(url);
  if (!address.startsWith('app://')) return null;
  const own = overrides && typeof overrides === 'object' ? overrides[address] : undefined;
  if (typeof own === 'string' && own) return own;
  if (UNLINKABLE_SCREEN_URLS.has(address)) return null;
  const route = Object.keys(SCREEN_URLS).find((name) => SCREEN_URLS[name] === address);
  return route || null;
}

module.exports = {
  SCREEN_URLS,
  SCREENS,
  DEFAULT_SCREEN_URL,
  SCREEN_PAGE_TYPES,
  UNLINKABLE_SCREEN_URLS,
  screenUrl,
  screenPageType,
  screenRouteOf,
};
