'use strict';

const { basketCart, cartKey } = require('./cart.js');

/**
 * App Maker's basket after `FETCH_BASKET_FULFILLED`: the `Basket` model built
 * by rn-framework-shop's `BasketMappers` — `amounts` is an `Amounts` instance
 * whose fields are the Akinon basket's own strings, `totalQuantity` its
 * `total_quantity`, each line's `currency` its `product.currency_type`, `pk`
 * its `product.pk` (the code the basket accepts) and `sku` its `product.sku`.
 */
function fetchedBasket(overrides) {
  return {
    app: { currentPage: 'Basket' },
    basket: {
      pending: false,
      basket: Object.assign(
        {
          pk: 991,
          totalQuantity: 3,
          amounts: {
            totalAmount: '379.80',
            totalProductAmount: '429.80',
            totalDiscountAmount: '50.00',
          },
          products: [
            { pk: 4055, sku: 'KM1', quantity: 2, totalAmount: '279.90', currency: 'try' },
            { pk: 4056, sku: 'KM2', quantity: 1, totalAmount: '99.90', currency: 'try' },
          ],
        },
        overrides || {}
      ),
    },
  };
}

describe('basketCart', () => {
  // `totalAmount` is after the basket's discounts and before shipping — what a
  // free-shipping rule is written against. The pre-discount subtotal would
  // move the bar 50 TL further than the store does.
  it('reads the discounted total and the unit count', () => {
    expect(basketCart(fetchedBasket())).toMatchObject({ total: 379.8, itemCount: 3, currency: 'TRY' });
  });

  // So a "complete to free shipping" strip does not offer back what is already
  // in the basket: the pk the basket accepts and the merchant's sku, per line.
  it('carries every line’s pk and sku', () => {
    expect(basketCart(fetchedBasket()).codes).toEqual(['4055', 'KM1', '4056', 'KM2']);
  });

  it('carries what a line has, and no codes for a basket with none', () => {
    expect(
      basketCart(fetchedBasket({ products: [{ sku: 'KM1', quantity: 3, currency: 'try' }] })).codes
    ).toEqual(['KM1']);
    expect(
      basketCart(fetchedBasket({ totalQuantity: 0, amounts: { totalAmount: '0.00' }, products: [] }))
    ).not.toHaveProperty('codes');
  });

  it('measures an empty basket the app fetched as empty', () => {
    expect(
      basketCart(fetchedBasket({ totalQuantity: 0, amounts: { totalAmount: '0.00' }, products: [] }))
    ).toEqual({ total: 0, itemCount: 0 });
  });

  // The reducer starts as `basket: {}` and returns to it on CLEAN_BASKET. That
  // is not an empty cart — it is no measurement at all.
  it('is unknown before the basket is fetched and after it is cleaned', () => {
    expect(basketCart({ basket: { pending: true, basket: {} } })).toBeNull();
    expect(basketCart({})).toBeNull();
    expect(basketCart(null)).toBeNull();
    expect(basketCart(fetchedBasket({ amounts: { totalAmount: '' } }))).toBeNull();
    expect(basketCart(fetchedBasket({ totalQuantity: undefined }))).toBeNull();
  });

  it('leaves the currency to the channel when no line carries a code', () => {
    const cart = basketCart(fetchedBasket({ products: [{ sku: 'KM1', quantity: 3, currency: 'TL' }] }));
    expect(cart).toEqual({ total: 379.8, itemCount: 3, codes: ['KM1'] });
  });
});

describe('cartKey', () => {
  it('changes only when the basket does', () => {
    expect(cartKey(basketCart(fetchedBasket()))).toBe(cartKey(basketCart(fetchedBasket())));
    expect(cartKey(basketCart(fetchedBasket({ totalQuantity: 4 })))).not.toBe(
      cartKey(basketCart(fetchedBasket()))
    );
    expect(cartKey(null)).toBe('');
  });

  it('changes when a line is swapped at the same amount, not when lines are reordered', () => {
    const swapped = fetchedBasket({
      products: [
        { pk: 4055, sku: 'KM1', quantity: 2, totalAmount: '279.90', currency: 'try' },
        { pk: 4099, sku: 'KM9', quantity: 1, totalAmount: '99.90', currency: 'try' },
      ],
    });
    const reordered = fetchedBasket({
      products: fetchedBasket().basket.basket.products.slice().reverse(),
    });
    expect(cartKey(basketCart(swapped))).not.toBe(cartKey(basketCart(fetchedBasket())));
    expect(cartKey(basketCart(reordered))).toBe(cartKey(basketCart(fetchedBasket())));
  });
});

/**
 * The feed end to end, with the REAL SDK client (transpiled from its source)
 * and a store shaped like App Maker's: every basket change reaches `setCart`,
 * and nothing else does.
 */
describe('plugin.startCartFeed', () => {
  const mockStore = {
    state: {},
    listeners: [],
    getState() {
      return this.state;
    },
    subscribe(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter((entry) => entry !== listener);
      };
    },
    dispatch(state) {
      this.state = state;
      for (const listener of this.listeners) listener();
    },
  };

  jest.mock('@core/store', () => mockStore, { virtual: true });

  const { loadSdkModule } = require('../test/sdk-source.js');
  const { Selwise } = loadSdkModule('client.ts');
  const SelwisePlugin = require('./index.js');

  function pluginWithClient() {
    const plugin = Object.create(SelwisePlugin.constructor.prototype);
    plugin.selwise = new Selwise();
    plugin.stopCartFeed = null;
    return plugin;
  }

  beforeEach(() => {
    mockStore.state = {};
    mockStore.listeners = [];
  });

  it('hands the basket to the SDK on every change', () => {
    const plugin = pluginWithClient();
    const changes = [];
    plugin.selwise.onCartChange((cart) => changes.push(cart));

    plugin.startCartFeed();
    // Not fetched yet: the SDK's cart stays unknown.
    expect(plugin.selwise.getCart().known).toBe(false);

    mockStore.dispatch(fetchedBasket());
    expect(plugin.selwise.getCart()).toEqual({ known: true, total: 379.8, itemCount: 3, currency: 'TRY' });
    // The lines reach the SDK too, for the strip that completes the basket.
    expect(plugin.selwise.cart.getCodes()).toEqual(['4055', 'KM1', '4056', 'KM2']);

    // An unrelated action is not a basket change.
    mockStore.dispatch(Object.assign({}, mockStore.state, { app: { currentPage: 'HomePage' } }));

    mockStore.dispatch(
      fetchedBasket({ totalQuantity: 4, amounts: { totalAmount: '479.70' } })
    );
    // The order went through and the app cleaned its basket: unknown again.
    mockStore.dispatch({ basket: { basket: {} } });

    expect(changes.map((cart) => (cart.known ? cart.total : 'unknown'))).toEqual([
      379.8,
      479.7,
      'unknown',
    ]);
  });

  it('subscribes once', () => {
    const plugin = pluginWithClient();
    plugin.startCartFeed();
    plugin.startCartFeed();
    expect(mockStore.listeners).toHaveLength(1);
  });

  it('does nothing on an SDK without setCart', () => {
    const plugin = Object.create(SelwisePlugin.constructor.prototype);
    plugin.selwise = {};
    plugin.stopCartFeed = null;
    plugin.startCartFeed();
    expect(mockStore.listeners).toHaveLength(0);
  });
});
