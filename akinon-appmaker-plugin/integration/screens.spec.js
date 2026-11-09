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
