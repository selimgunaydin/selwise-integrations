'use strict';

const { KIND, mapEvent, foldLines, diffLine, userIdOf } = require('./mapper.js');

/** The shapes below are App Maker's own, read out of the live rn-env store. */
const productDetailState = {
  app: { currentPage: 'ProductDetail' },
  productDetail: {
    product: {
      sku: 'KM000000660425B',
      pk: 1234,
      name: 'Ruj - Smart Fusion Lipstick - 425 Deep Violet',
      price: '189,90',
      brand: 'Ardisa',
      stock: 7
    }
  }
};

function basketState(products, totalQuantity, currentPage) {
  return {
    app: { currentPage: currentPage || 'Basket' },
    basket: { basket: { pk: 987, products, totalQuantity } }
  };
}

describe('navigationChange', () => {
  it('turns a screen name into the synthetic url Selwise targets on', () => {
    expect(mapEvent('navigationChange', {}, {}, { currentPage: 'HomePage' })).toEqual([
      { kind: KIND.SCREEN, pageUrl: 'app://home', screenName: 'HomePage' }
    ]);
  });

  it('falls back to the state when the event carries no page', () => {
    const result = mapEvent('navigationChange', { app: { currentPage: 'Basket' } }, {}, {});
    expect(result[0].pageUrl).toBe('app://basket');
  });

  it('emits nothing when there is no screen at all', () => {
    expect(mapEvent('navigationChange', {}, {}, {})).toEqual([]);
  });
});

describe('productImpression', () => {
  it('sends the sku as the product identity, never the numeric pk', () => {
    const [event] = mapEvent('productImpression', productDetailState, {}, {});
    expect(event.kind).toBe(KIND.TRACK);
    expect(event.name).toBe('product_view');
    expect(event.productItemCode).toBe('KM000000660425B');
    expect(JSON.stringify(event)).not.toContain('1234');
  });

  it('parses a Turkish decimal comma into a number', () => {
    const [event] = mapEvent('productImpression', productDetailState, {}, {});
    expect(event.metadata.price).toBe(189.9);
  });

  it('emits nothing for a product with no sku', () => {
    expect(mapEvent('productImpression', { productDetail: { product: { pk: 5 } } }, {}, {})).toEqual([]);
  });
});

describe('cartChanges', () => {
  it('names the line that was added', () => {
    const before = basketState([{ sku: 'A', quantity: 1, totalAmount: 100 }], 1);
    const after = basketState(
      [
        { sku: 'A', quantity: 1, totalAmount: 100 },
        { sku: 'B', quantity: 2, totalAmount: 300 }
      ],
      3
    );

    const [event] = mapEvent('cartChanges', after, before, {});
    expect(event.name).toBe('add_to_cart');
    expect(event.productItemCode).toBe('B');
    expect(event.metadata.quantity).toBe(2);
    // 300 for two units is 150 each.
    expect(event.metadata.price).toBe(150);
  });

  it('names the line whose quantity only increased', () => {
    const before = basketState([{ sku: 'A', quantity: 1, totalAmount: 100 }], 1);
    const after = basketState([{ sku: 'A', quantity: 3, totalAmount: 300 }], 3);

    const [event] = mapEvent('cartChanges', after, before, {});
    expect(event.name).toBe('add_to_cart');
    expect(event.productItemCode).toBe('A');
    expect(event.metadata.quantity).toBe(2);
  });

  it('reads a removal as a removal and names the removed line', () => {
    const before = basketState(
      [
        { sku: 'A', quantity: 1, totalAmount: 100 },
        { sku: 'B', quantity: 1, totalAmount: 150 }
      ],
      2
    );
    const after = basketState([{ sku: 'A', quantity: 1, totalAmount: 100 }], 1);

    const [event] = mapEvent('cartChanges', after, before, {});
    expect(event.name).toBe('remove_from_cart');
    expect(event.productItemCode).toBe('B');
  });

  // The app republishes basket state on every fetch, not only on a change.
  it('stays silent when the quantity did not move', () => {
    const state = basketState([{ sku: 'A', quantity: 1, totalAmount: 100 }], 1);
    expect(mapEvent('cartChanges', state, state, {})).toEqual([]);
  });
});

describe('basketImpression', () => {
  it('only fires on the basket screen', () => {
    const onBasket = basketState([{ sku: 'A', quantity: 1, totalAmount: 100 }], 1, 'Basket');
    const elsewhere = basketState([{ sku: 'A', quantity: 1, totalAmount: 100 }], 1, 'HomePage');

    expect(mapEvent('basketImpression', onBasket, {}, {})[0].name).toBe('cart_view');
    expect(mapEvent('basketImpression', elsewhere, {}, {})).toEqual([]);
  });
});

describe('measuringPurchases', () => {
  const orderState = {
    webCheckout: {
      // App Maker's own misspelling.
      sucess: {
        order: {
          order: {
            number: 'KM-2026-0001',
            amount: '449,80',
            currency: 'try',
            items: [
              { sku: 'A', price: 100 },
              { sku: 'A', price: 100 },
              { sku: 'B', price: 249.8 }
            ]
          }
        }
      }
    }
  };

  it('sends an order, not a tracking event', () => {
    const [order, flush] = mapEvent('measuringPurchases', orderState, {}, {});
    expect(order.kind).toBe(KIND.ORDER);
    expect(order.order.orderId).toBe('KM-2026-0001');
    expect(flush.kind).toBe(KIND.FLUSH);
  });

  it('folds repeated skus into one line with a quantity', () => {
    const [order] = mapEvent('measuringPurchases', orderState, {}, {});
    // Field names are the SDK's OrderItemInput. The order route has no class
    // DTO and therefore no validation, so a wrong name here is accepted with a
    // 201 and the order lands with empty product codes.
    expect(order.order.items).toEqual([
      { productItemCode: 'A', quantity: 2, unitPrice: 100 },
      { productItemCode: 'B', quantity: 1, unitPrice: 249.8 }
    ]);
  });

  it('normalises the currency App Maker stores lowercase', () => {
    const [order] = mapEvent('measuringPurchases', orderState, {}, {});
    expect(order.order.currency).toBe('TRY');
    expect(order.order.total).toBe(449.8);
  });

  // The coupon segment signals read `metadata.couponCode` on the ORDER.
  it('carries the voucher of the basket it was placed from', () => {
    const prev = { basket: { basket: { voucherCode: 'KASIM50' } } };
    const [order] = mapEvent('measuringPurchases', orderState, prev, {});
    expect(order.order.metadata).toEqual({ couponCode: 'KASIM50' });
    expect(mapEvent('measuringPurchases', orderState, {}, {})[0].order.metadata).toBeUndefined();
  });

  it('emits nothing when checkout carries no order', () => {
    expect(mapEvent('measuringPurchases', { webCheckout: {} }, {}, {})).toEqual([]);
  });

  it('also reads the correctly spelled key, in case App Maker fixes it', () => {
    const fixed = { webCheckout: { success: { order: { order: { number: 'X', items: [{ sku: 'A', price: 1 }] } } } } };
    expect(mapEvent('measuringPurchases', fixed, {}, {})[0].order.orderId).toBe('X');
  });
});

describe('productsImpressions', () => {
  it('logs a search with its result count', () => {
    const [event] = mapEvent('productsImpressions', {}, {}, {
      search_text: 'ruj',
      pagination: { total_count: 163 }
    });
    expect(event.name).toBe('search_query');
    expect(event.metadata).toEqual({ query: 'ruj', resultCount: 163 });
  });

  it('ignores a plain category listing', () => {
    expect(mapEvent('productsImpressions', {}, {}, { pagination: { total_count: 20 } })).toEqual([]);
  });
});

describe('identity', () => {
  const authState = {
    auth: { auth: { user: { pk: 44219, email: 'ayse@example.com', first_name: 'Ayşe' } } }
  };

  it('identifies on the merchant user id, with email as a trait', () => {
    const [identify] = mapEvent('userLogin', authState, {}, {});
    expect(identify).toEqual({
      kind: KIND.IDENTIFY,
      userId: '44219',
      traits: { email: 'ayse@example.com', firstName: 'Ayşe' }
    });
  });

  it('emits a login event after the identify, in that order', () => {
    const result = mapEvent('userLogin', authState, {}, {});
    expect(result.map((entry) => entry.kind)).toEqual([KIND.IDENTIFY, KIND.TRACK]);
  });

  // `signup` is not a canonical name and nothing aliases it: the server filed
  // every app registration as a nameless custom event.
  it('sends login and registration under their canonical names', () => {
    expect(mapEvent('userLogin', authState, {}, {})[1]).toMatchObject({ name: 'user_login', entityType: 'user' });
    expect(mapEvent('userRegister', authState, {}, {})[1]).toMatchObject({ name: 'user_signup', entityType: 'user' });
  });

  // App Maker keeps an auth.user object for anonymous sessions with pk: false.
  // `String(false)` is 'false', so every anonymous app visitor was identified
  // as the user "false" — one shared site_users row for everyone.
  it('does not identify an anonymous session whose pk is false', () => {
    const anonymous = { auth: { auth: { user: { pk: false, email: '' } } } };
    expect(mapEvent('currentUser', anonymous, {}, {})).toEqual([]);
    expect(mapEvent('userLogin', anonymous, {}, {})).toEqual([]);
  });

  it('accepts only a non-empty string or a finite number as the user id', () => {
    expect(userIdOf({ pk: 44219 })).toBe('44219');
    expect(userIdOf({ pk: 'u-44219' })).toBe('u-44219');
    expect(userIdOf({ id: 7 })).toBe('7');
    expect(userIdOf({ pk: false })).toBe('');
    expect(userIdOf({ pk: true })).toBe('');
    expect(userIdOf({ pk: null, id: null })).toBe('');
    expect(userIdOf({ pk: NaN })).toBe('');
    expect(userIdOf({ pk: '   ' })).toBe('');
    expect(userIdOf({ pk: {} })).toBe('');
    expect(userIdOf(undefined)).toBe('');
  });

  it('does nothing for an anonymous visitor', () => {
    expect(mapEvent('userLogin', { auth: { auth: {} } }, {}, {})).toEqual([]);
    expect(mapEvent('currentUser', {}, {}, {})).toEqual([]);
  });

  it('resets on logout', () => {
    expect(mapEvent('userLogout', {}, {}, {})).toEqual([{ kind: KIND.RESET }]);
  });
});

describe('robustness', () => {
  it('returns an error instruction rather than throwing on malformed state', () => {
    const exploding = { get basket() { throw new Error('store torn down'); } };
    const [result] = mapEvent('cartChanges', exploding, {}, {});
    expect(result.kind).toBe('error');
    expect(result.eventName).toBe('cartChanges');
  });

  it('ignores an event it does not handle', () => {
    expect(mapEvent('someFutureEvent', {}, {}, {})).toEqual([]);
  });
});

describe('foldLines', () => {
  it('drops lines with no sku instead of sending an empty code', () => {
    expect(foldLines([{ quantity: 1 }, { sku: '  ', quantity: 1 }, { sku: 'A', quantity: 1 }])).toEqual([
      { productItemCode: 'A', quantity: 1, unitPrice: null }
    ]);
  });

  it('tolerates a non-array', () => {
    expect(foldLines(undefined)).toEqual([]);
  });
});

describe('the app events that used to go unmapped', () => {
  // <SelwiseSearch /> is not mounted in most apps — the app has its own search
  // UI. Without this, every real search in the app was invisible and the
  // search report showed only queries that went through SDK.search().
  describe('searched', () => {
    it('maps the app own search screen to search_query', () => {
      const out = mapEvent('searched', { app: { currentPage: 'Search' } }, {}, {
        searchText: 'ruj',
      });

      expect(out).toEqual([
        {
          kind: 'track',
          name: 'search_query',
          entityType: 'search',
          entityId: 'ruj',
          metadata: { query: 'ruj', source: 'app_search', screenName: 'Search' },
        },
      ]);
    });

    it('reads the query under any of the names App Maker uses', () => {
      for (const data of [{ searchText: 'ruj' }, { query: 'ruj' }, { term: 'ruj' }]) {
        expect(mapEvent('searched', {}, {}, data)[0].entityId).toBe('ruj');
      }
    });

    it('ignores an empty query rather than logging a blank search', () => {
      expect(mapEvent('searched', {}, {}, { searchText: '   ' })).toEqual([]);
      expect(mapEvent('searched', {}, {}, {})).toEqual([]);
    });

    // Zero results cannot be known here: App Maker publishes the query before
    // the results land. Guessing would put fabricated rows in the merchant's
    // zero-results report.
    it('never claims a zero-result search', () => {
      expect(mapEvent('searched', {}, {}, { searchText: 'xyzzy' })[0].name).toBe('search_query');
    });

    it('marks a barcode search as one', () => {
      const out = mapEvent('barcodeSearched', {}, {}, { searchText: '8025272' });
      expect(out[0].name).toBe('search_query');
      expect(out[0].metadata.source).toBe('app_barcode');
    });
  });

  // The funnel reads checkout_begin / checkout_progress / checkout_option.
  // Mapping none of them made every app visitor look like they went from
  // add_to_cart straight to purchase.
  describe('checkoutImpression', () => {
    const BASKET = {
      basket: {
        basket: {
          totalQuantity: 3,
          voucherCode: 'ARDISA10',
          amounts: { totalAmount: '379.80' },
          // An App Maker basket line carries `sku` on the line itself, not
          // nested under a product — the same shape `foldLines` reads.
          products: [
            { sku: 'KM1', quantity: 2, totalAmount: 379.8 },
            { sku: 'KM2', quantity: 1, totalAmount: 99.9 },
          ],
        },
      },
    };

    it('maps a checkout start', () => {
      const [event] = mapEvent('checkoutImpression', BASKET, {}, {});

      expect(event.name).toBe('checkout_begin');
      expect(event.entityType).toBe('checkout');
      expect(event.metadata.value).toBe(379.8);
      expect(event.metadata.coupon).toBe('ARDISA10');
      expect(event.metadata.itemCodes).toEqual(['KM1', 'KM2']);
    });

    it('sends nothing for an empty basket', () => {
      expect(
        mapEvent('checkoutImpression', { basket: { basket: { products: [] } } }, {}, {})
      ).toEqual([]);
    });
  });

  describe('checkout choices', () => {
    // App Maker's own key is misspelled `sucess`; correcting it reads nothing.
    const order = (extra) => ({
      webCheckout: { sucess: { order: { order: { amount: '379.80', ...extra } } } },
    });

    it('maps a shipping choice to checkout_option', () => {
      const [event] = mapEvent('addShippingInfo', order({ cargoCompany: 'Yurtiçi' }), {}, {});

      expect(event.name).toBe('checkout_option');
      expect(event.metadata).toEqual({
        option: 'shipping',
        value: 'Yurtiçi',
        orderValue: 379.8,
      });
    });

    it('maps a payment choice to checkout_option', () => {
      const [event] = mapEvent(
        'addPaymentInfo',
        order({ paymentOption: { payment_type: 'credit_card' } }),
        {},
        {}
      );

      expect(event.metadata.option).toBe('payment');
      expect(event.metadata.value).toBe('credit_card');
    });

    it('sends nothing when the choice is not made yet', () => {
      expect(mapEvent('addShippingInfo', order({}), {}, {})).toEqual([]);
      expect(mapEvent('addPaymentInfo', {}, {}, {})).toEqual([]);
    });
  });

  // `wishlist` is a recommendation signal as well as a report row, so an
  // unmapped favourite costs a personalisation input too.
  describe('addToFav', () => {
    it('maps a favourite to wishlist', () => {
      const [event] = mapEvent('addToFav', {}, {}, { product: { sku: 'KM1' } });

      expect(event).toEqual({
        kind: 'track',
        name: 'wishlist',
        entityType: 'product',
        productItemCode: 'KM1',
        metadata: { action: 'add' },
      });
    });

    it('reads a bare payload as well as a nested product', () => {
      expect(mapEvent('addToFav', {}, {}, { sku: 'KM9' })[0].productItemCode).toBe('KM9');
    });

    it('is also reachable from the basket screen', () => {
      expect(mapEvent('addToFavOnBasket', {}, {}, { sku: 'KM9' })[0].name).toBe('wishlist');
    });

    it('sends nothing without a product code', () => {
      expect(mapEvent('addToFav', {}, {}, {})).toEqual([]);
    });

    it('answers the documented product-screen and list names, the screen falling back to its product', () => {
      const onPd = mapEvent('addToFavOnPd', { productDetail: { product: { sku: 'PD1' } } }, {}, {});
      expect(onPd[0]).toMatchObject({ name: 'wishlist', productItemCode: 'PD1' });
      expect(mapEvent('addToFavOnPl', {}, {}, { product: { sku: 'PL1' } })[0].productItemCode).toBe('PL1');
    });

    // `productDetail` keeps the last product page seen: off the product
    // screen it is a different product.
    it('never falls back to the last product page off the product screen', () => {
      const state = { productDetail: { product: { sku: 'LAST-PD' } } };
      expect(mapEvent('addToFavOnPl', state, {}, {})).toEqual([]);
      expect(mapEvent('addToFavOnBasket', state, {}, {})).toEqual([]);
      expect(mapEvent('removeFromFavOnPl', state, {}, {})).toEqual([]);
      expect(mapEvent('removeFromFavOnPd', state, {}, {})[0].productItemCode).toBe('LAST-PD');
    });
  });

  // A removal under `wishlist` would fire "you saved this" reminders for a
  // product the shopper just dropped.
  describe('removeFromFav', () => {
    it('is a custom event, never a wishlist', () => {
      for (const name of ['removeFromFav', 'removeFromFavOnPd', 'removeFromFavOnPl']) {
        const [event] = mapEvent(name, {}, {}, { sku: 'KM1' });
        expect(event).toEqual({
          kind: 'track',
          name: 'custom_event',
          entityType: 'product',
          productItemCode: 'KM1',
          metadata: { action: 'wishlist_remove' },
        });
      }
    });
  });

  describe('couponUsed', () => {
    it('records the coupon as a checkout step', () => {
      const [event] = mapEvent('couponUsed', {}, {}, { voucherCode: ' KASIM50 ' });
      expect(event).toEqual({
        kind: 'track',
        name: 'checkout_progress',
        entityType: 'checkout',
        entityId: 'coupon',
        metadata: { step: 'coupon', coupon: 'KASIM50' },
      });
    });

    it('falls back to the basket voucher, and sends nothing without one', () => {
      const state = { basket: { basket: { voucherCode: 'B10' } } };
      expect(mapEvent('couponUsed', state, {}, {})[0].metadata.coupon).toBe('B10');
      expect(mapEvent('couponUsed', {}, {}, {})).toEqual([]);
    });
  });

  // A cancel REQUEST: the order's status is the order system's to report.
  describe('cancelOrder', () => {
    it('records the request and flushes, and never touches the order', () => {
      const result = mapEvent('cancelOrder', {}, {}, { order: { number: '1000123', reason: 'Vazgeçtim' } });
      expect(result).toEqual([
        {
          kind: 'track',
          name: 'custom_event',
          entityType: 'custom',
          entityId: '1000123',
          metadata: { action: 'order_cancel_request', orderId: '1000123', reason: 'Vazgeçtim' },
        },
        { kind: KIND.FLUSH },
      ]);
      expect(result.some((entry) => entry.kind === KIND.ORDER)).toBe(false);
    });

    it('sends nothing without an order number', () => {
      expect(mapEvent('cancelOrder', {}, {}, {})).toEqual([]);
    });
  });
});

describe('product list events', () => {
  /** App Maker keeps the live list under the name `activeRouteName` gives. */
  const listState = (list) => ({
    app: { currentPage: 'ProductList' },
    productList: { activeRouteName: 'pl', pl: list },
  });

  describe('selectItemImpression', () => {
    // product_click was reachable only through the recommendation and search
    // helpers, so a tap on a category row — the ordinary way a visitor opens a
    // product — was unmeasured. It also feeds user_behaviors, so the miss cost
    // recommendation quality too.
    it('maps a list tap to product_click with its position', () => {
      const state = listState({
        products: [{ sku: 'KM1' }, { sku: 'KM2' }, { sku: 'KM3' }],
        currentFilters: [],
      });

      const [event] = mapEvent('selectItemImpression', state, {}, {
        product: { sku: 'KM2', name: 'Ruj', price: '189.90' },
      });

      expect(event.name).toBe('product_click');
      expect(event.productItemCode).toBe('KM2');
      expect(event.metadata.position).toBe(2);
      expect(event.metadata.source).toBe('list');
    });

    // baseCode is the GROUP key; Selwise matches products.item_code. Sending
    // the group code would match nothing — the three-codes trap.
    it('never falls back to baseCode', () => {
      const out = mapEvent('selectItemImpression', listState({}), {}, {
        product: { baseCode: 'KM000000660425' },
      });
      expect(out).toEqual([]);
    });

    it('marks a tap on a search result as one', () => {
      const state = listState({
        products: [{ sku: 'KM1' }],
        currentFilters: [{ search_text: 'ruj' }],
      });

      const [event] = mapEvent('selectItemImpression', state, {}, { product: { sku: 'KM1' } });
      expect(event.metadata.source).toBe('search');
    });

    it('omits the position rather than guessing when the product is not in the list', () => {
      const [event] = mapEvent('selectItemImpression', listState({ products: [{ sku: 'X' }] }), {}, {
        product: { sku: 'KM1' },
      });
      expect(event.metadata.position).toBeUndefined();
    });
  });

  describe('categoryImpression', () => {
    it('maps a category screen to category_view', () => {
      const [event] = mapEvent('categoryImpression', {}, {}, {
        type: 'mainCategory',
        categoryName: 'Makyaj',
        categoryId: '42',
      });

      expect(event.name).toBe('category_view');
      expect(event.entityId).toBe('42');
      expect(event.metadata).toEqual({
        categoryName: 'Makyaj',
        categoryId: '42',
        level: 'mainCategory',
      });
    });

    it('sends nothing when the category is unnamed', () => {
      expect(mapEvent('categoryImpression', {}, {}, { type: 'mainCategory' })).toEqual([]);
    });
  });

  describe('setFilter', () => {
    // The same split the web makes: search_filter on a search result,
    // category_filter on a category list. App Maker uses one list shape for
    // both, so `search_text` in the filters is what tells them apart.
    it('reports a category filter', () => {
      const [event] = mapEvent(
        'setFilter',
        listState({ currentFilters: [{ color: 'kırmızı' }, { size: '38' }] }),
        {},
        {}
      );

      expect(event.name).toBe('category_filter');
      expect(event.metadata.filters).toEqual(['color', 'size']);
    });

    it('reports a search filter when the list came from a search', () => {
      const [event] = mapEvent(
        'setFilter',
        listState({ currentFilters: [{ search_text: 'ruj' }, { color: 'kırmızı' }] }),
        {},
        {}
      );

      expect(event.name).toBe('search_filter');
      // The query itself is not a filter the visitor applied.
      expect(event.metadata.filters).toEqual(['color']);
    });

    it('sends nothing when the only "filter" is the query', () => {
      expect(
        mapEvent('setFilter', listState({ currentFilters: [{ search_text: 'ruj' }] }), {}, {})
      ).toEqual([]);
    });

    it('sends nothing when no filter is applied', () => {
      expect(mapEvent('setFilter', listState({ currentFilters: [] }), {}, {})).toEqual([]);
    });
  });

  describe('setSorter', () => {
    // App Maker publishes the sorter VALUE; the label lives in the list's own
    // `sorts` array. A row reading `price_asc` is not as useful as one reading
    // "Artan fiyat".
    it('resolves the sorter label from the list', () => {
      const state = listState({
        sorts: [
          { value: 'price_asc', label: 'Artan fiyat' },
          { value: 'newest', label: 'En yeni' },
        ],
      });

      const [event] = mapEvent('setSorter', state, {}, [{ sorter: 'price_asc' }]);

      expect(event.name).toBe('search_sort');
      expect(event.metadata).toEqual({ sorter: 'price_asc', label: 'Artan fiyat' });
    });

    it('still reports the sorter when no label matches', () => {
      const [event] = mapEvent('setSorter', listState({ sorts: [] }), {}, [{ sorter: 'newest' }]);
      expect(event.metadata).toEqual({ sorter: 'newest' });
    });

    it('sends nothing without a sorter', () => {
      expect(mapEvent('setSorter', listState({}), {}, [])).toEqual([]);
      expect(mapEvent('setSorter', listState({}), {}, undefined)).toEqual([]);
    });
  });
});
