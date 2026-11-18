'use strict';

const { SCREEN_URLS, screenPageType } = require('./screens.js');

// The page types the dashboard offers (`PAGE_TYPES` in @selwise/react-native's
// vendored targeting). A label outside it would match no campaign at all.
const PAGE_TYPES = ['home', 'product', 'category', 'search', 'checkout', 'cart', 'account', 'other'];

describe('screenPageType', () => {
  it('labels the product screen, so "only on product pages" holds in the app', () => {
    expect(screenPageType('ProductDetail')).toBe('product');
    expect(screenPageType('Basket')).toBe('cart');
    expect(screenPageType('HomePage')).toBe('home');
  });

  it('knows the route SelwiseSearchScreen is registered under as the search page', () => {
    expect(SCREEN_URLS.SelwiseSearch).toBe('app://search');
    expect(screenPageType('SelwiseSearch')).toBe('search');
  });

  it('maps the native checkout steps to the checkout page', () => {
    for (const screen of ['Checkout', 'NativeCheckout', 'AkifastCheckout']) {
      expect(SCREEN_URLS[screen]).toBe('app://checkout');
      expect(screenPageType(screen)).toBe('checkout');
    }
  });

  it('labels every mapped screen with a page type the dashboard offers', () => {
    for (const screen of Object.keys(SCREEN_URLS)) {
      expect(PAGE_TYPES).toContain(screenPageType(screen));
    }
  });

  // An unknown screen may be a custom product screen; calling it `other` would
  // hide the merchant's product-page campaigns there.
  it('leaves a screen it does not know unlabelled', () => {
    expect(screenPageType('MerchantCustomScreen')).toBeUndefined();
    expect(screenPageType(null)).toBeUndefined();
  });
});

describe('the app’s screenRoutes, read in both directions', () => {
  const { screenUrl, screenRouteOf, SCREENS } = require('./screens.js');
  const routes = { 'app://search': 'ShopSearch', 'app://basket/': 'Sepetim', 'app://wishlist': 'Istek' };

  it('reads a route registered for app://search, under any name, as the search page', () => {
    expect(screenUrl('ShopSearch', routes)).toBe('app://search');
    expect(screenPageType('ShopSearch', routes)).toBe('search');
    // Without the config it is an unknown screen: its own address, no label.
    expect(screenUrl('ShopSearch')).toBe('app://shopsearch');
    expect(screenPageType('ShopSearch')).toBeUndefined();
  });

  it('keeps SelwiseSearch and the standard routes working without any config', () => {
    expect(screenUrl('SelwiseSearch')).toBe('app://search');
    expect(screenPageType('SelwiseSearch')).toBe('search');
    expect(screenUrl('Basket', routes)).toBe('app://basket');
    expect(screenPageType('Basket', routes)).toBe('cart');
  });

  it('labels a renamed route by its address, and leaves a custom address unlabelled', () => {
    expect(screenUrl('Sepetim', routes)).toBe('app://basket');
    expect(screenPageType('Sepetim', routes)).toBe('cart');
    expect(screenUrl('Istek', routes)).toBe('app://wishlist');
    expect(screenPageType('Istek', routes)).toBeUndefined();
  });

  it('is the same table as the opening direction', () => {
    expect(screenRouteOf('app://search', routes)).toBe('ShopSearch');
    for (const entry of SCREENS) {
      expect(screenUrl(entry.route)).toBe(entry.url);
      expect(screenPageType(entry.route)).toBe(entry.pageType);
    }
  });

  it('ignores a config that is not a map of addresses to route names', () => {
    for (const bad of [null, 'x', 4, { 'https://x': 'Y', 'app://a': 3, 'app://b': '' }]) {
      expect(screenUrl('Y', bad)).toBe('app://y');
      expect(screenPageType('Y', bad)).toBeUndefined();
    }
  });
});

describe('screenRouteOf', () => {
  const { screenRouteOf, UNLINKABLE_SCREEN_URLS } = require('./screens.js');

  it('opens the standard route an address is mapped from', () => {
    expect(screenRouteOf('app://basket')).toBe('Basket');
    expect(screenRouteOf('app://home/')).toBe('HomePage');
    expect(screenRouteOf('app://favourites')).toBe('Favourite');
  });

  it("lets the app's own routes win", () => {
    expect(screenRouteOf('app://search', { 'app://search': 'PrimeSearch' })).toBe('PrimeSearch');
  });

  it('opens a route the app registered for the search screen, and the standard one without it', () => {
    expect(screenRouteOf('app://search', { 'app://search': 'SelwiseSearch' })).toBe('SelwiseSearch');
    expect(screenRouteOf('app://search')).toBe('Search');
  });

  it('opens nothing for a screen that needs to know which one, or a non-screen link', () => {
    for (const url of UNLINKABLE_SCREEN_URLS) expect(screenRouteOf(url)).toBeNull();
    expect(screenRouteOf('https://shop.example/basket')).toBeNull();
    expect(screenRouteOf('app://nowhere')).toBeNull();
  });
});
