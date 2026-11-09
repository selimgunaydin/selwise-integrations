'use strict';

/**
 * The plugin follows the app's product detail and hands the CURRENT screen's
 * product to `<SelwiseSurfaces />` — never on another screen, never the
 * previous product while the next one loads.
 */
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
  set(state) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  },
};
jest.mock('@core/store', () => mockStore, { virtual: true });

const { SelwisePlugin } = require('./index.js');

function detail(sku, extra) {
  return {
    productDetail: Object.assign(
      {
        pending: false,
        initialSuccessAt: 1,
        product: { sku, name: 'Ruj ' + sku, price: 899, retailPrice: 1200, stock: 3, currency: 'try' },
      },
      extra || {}
    ),
  };
}

beforeEach(() => {
  mockStore.state = {};
  mockStore.listeners = [];
});

describe('plugin product feed', () => {
  it('hands over the product only on a ProductDetail screen', () => {
    const plugin = new SelwisePlugin();
    plugin.startProductFeed();
    mockStore.set(detail('KM1'));

    plugin.setScreen('app://home', 'HomePage');
    expect(plugin.getProduct()).toBeNull();

    plugin.setScreen('app://product', 'ProductDetail');
    expect(plugin.getProduct()).toEqual({ title: 'Ruj KM1', price: 899, originalPrice: 1200, stock: 3, currency: 'TRY' });
  });

  it('tells listeners when the product changes, and says "loading" — not the old product — while the next one loads', () => {
    const plugin = new SelwisePlugin();
    plugin.startProductFeed();
    plugin.setScreen('app://product', 'ProductDetail');
    const seen = [];
    plugin.onProductChange((product) => seen.push(product && (product.pending ? 'pending' : product.title)));

    mockStore.set(detail('KM1'));
    mockStore.set(detail('KM1')); // an unrelated action: same product, no news
    mockStore.set(detail('KM1', { pending: true }));
    // The SDK holds a surface that needs the product until it lands.
    expect(plugin.getProduct()).toEqual({ pending: true });
    mockStore.set(detail('KM2', { initialSuccessAt: 2 }));

    expect(seen).toEqual(['Ruj KM1', 'pending', 'Ruj KM2']);
  });
});
