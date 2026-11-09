'use strict';

const { productFacts, productKey } = require('./product.js');

/**
 * App Maker's product detail after `FETCH_PRODUCT_DETAIL_FULFILLED`: the
 * `ProductDetail` model rn-framework-shop builds from the Akinon product —
 * `retailPrice` is `retail_price`, `stock` the selected variant's.
 */
function fetchedDetail(overrides, detailOverrides) {
  return {
    productDetail: Object.assign(
      {
        pending: false,
        initialSuccessAt: 1760000000000,
        product: Object.assign(
          { sku: 'KM1', name: 'Kırmızı ruj', price: '899.00', retailPrice: '1200.00', stock: 3, currency: 'try' },
          overrides || {}
        ),
      },
      detailOverrides || {}
    ),
  };
}

describe('productFacts', () => {
  it('reads the product a fetched detail shows', () => {
    expect(productFacts(fetchedDetail())).toEqual({
      title: 'Kırmızı ruj',
      price: 899,
      originalPrice: 1200,
      stock: 3,
      currency: 'TRY',
    });
  });

  // The previous product is still in the reducer while the next one loads:
  // never its facts — "still loading", so the SDK holds what needs the product.
  it('says the product is loading, not the previous one, while a new product is fetched', () => {
    expect(productFacts(fetchedDetail({}, { pending: true }))).toEqual({ pending: true });
    expect(productFacts({ productDetail: { pending: true, initialSuccessAt: 0, product: {} } })).toEqual({ pending: true });
  });

  it('says nothing when no product was fetched and none is loading', () => {
    expect(productFacts(fetchedDetail({}, { initialSuccessAt: 0 }))).toBeNull();
    expect(productFacts({})).toBeNull();
  });

  it('leaves out what the app does not know rather than guessing', () => {
    expect(productFacts(fetchedDetail({ retailPrice: undefined, stock: null, currency: '' }))).toEqual({
      title: 'Kırmızı ruj',
      price: 899,
    });
  });
});

describe('productKey', () => {
  it('changes with the product and with a new fetch of the same one', () => {
    const first = fetchedDetail();
    const again = fetchedDetail({}, { initialSuccessAt: 1760000099999 });
    const other = fetchedDetail({ sku: 'KM2' });
    const key = productKey(first, productFacts(first));
    expect(productKey(first, productFacts(first))).toBe(key);
    expect(productKey(again, productFacts(again))).not.toBe(key);
    expect(productKey(other, productFacts(other))).not.toBe(key);
    expect(productKey(first, null)).toBe('');
    // Loading and loaded are two keys, so the screen is asked again when it lands.
    const loading = fetchedDetail({}, { pending: true });
    expect(productKey(loading, productFacts(loading))).toBe('pending');
    expect(productKey(loading, productFacts(loading))).not.toBe(key);
  });
});
