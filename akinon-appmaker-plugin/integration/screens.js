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
const SCREEN_URLS = {
  HomePage: 'app://home',
  ProductDetail: 'app://product',
  ProductList: 'app://list',
  Category: 'app://category',
  CollectionList: 'app://collections',
  CollectionDetail: 'app://collection',
  Search: 'app://search',
  PrimeSearch: 'app://search',
  Basket: 'app://basket',
  Checkout: 'app://checkout',
  CheckoutSuccess: 'app://checkout/success',
  Favourite: 'app://favourites',
  Account: 'app://account',
  Profile: 'app://account/profile',
  Orders: 'app://account/orders',
  OrderDetail: 'app://account/order',
  SignIn: 'app://auth/login',
  SignUp: 'app://auth/register',
  Notifications: 'app://notifications',
  Contact: 'app://contact'
};

/** Screens whose URL a merchant is most likely to target a widget at. */
const DEFAULT_SCREEN_URL = 'app://other';

function screenUrl(screenName) {
  if (!screenName) return DEFAULT_SCREEN_URL;
  return SCREEN_URLS[screenName] || 'app://' + String(screenName).toLowerCase();
}

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
const SCREEN_PAGE_TYPES = {
  HomePage: 'home',
  ProductDetail: 'product',
  ProductList: 'category',
  Category: 'category',
  CollectionList: 'category',
  CollectionDetail: 'category',
  Search: 'search',
  PrimeSearch: 'search',
  Basket: 'cart',
  Checkout: 'checkout',
  CheckoutSuccess: 'checkout',
  Favourite: 'account',
  Account: 'account',
  Profile: 'account',
  Orders: 'account',
  OrderDetail: 'account',
  SignIn: 'account',
  SignUp: 'account',
  Notifications: 'other',
  Contact: 'other'
};

function screenPageType(screenName) {
  return (screenName && SCREEN_PAGE_TYPES[screenName]) || undefined;
}

module.exports = { SCREEN_URLS, DEFAULT_SCREEN_URL, SCREEN_PAGE_TYPES, screenUrl, screenPageType };
