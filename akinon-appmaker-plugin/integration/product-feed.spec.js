'use strict';

/**
 * The plugin follows the app's product detail and tells the SDK client the
 * CURRENT screen's product — never on another screen, never the previous product
 * while the next one loads. The components read it from the client, so this is
 * tested against the client itself (transpiled from its source).
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
const { loadSdkModule } = require('../test/sdk-source.js');

const { Selwise } = loadSdkModule('client.ts');

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

function pluginWithClient() {
  const plugin = new SelwisePlugin();
  plugin.selwise = new Selwise();
  return plugin;
}

beforeEach(() => {
  mockStore.state = {};
  mockStore.listeners = [];
});

describe('plugin product feed', () => {
  it('hands over the product only on a ProductDetail screen', () => {
    const plugin = pluginWithClient();
    plugin.startProductFeed();
    mockStore.set(detail('KM1'));

    plugin.setScreen('app://home', 'HomePage');
    expect(plugin.selwise.getProduct()).toBeNull();

    plugin.setScreen('app://product', 'ProductDetail');
    expect(plugin.selwise.getProduct()).toEqual({ itemCode: 'KM1', title: 'Ruj KM1', price: 899, originalPrice: 1200, stock: 3, currency: 'TRY' });

    // Leaving the screen takes the product away: the reducer still holds it.
    plugin.setScreen('app://basket', 'Basket');
    expect(plugin.selwise.getProduct()).toBeNull();
  });

  it('tells listeners when the product changes, and says "loading" — not the old product — while the next one loads', () => {
    const plugin = pluginWithClient();
    plugin.startProductFeed();
    plugin.setScreen('app://product', 'ProductDetail');
    const seen = [];
    plugin.selwise.on('product', (product) => seen.push(product && (product.pending ? 'pending' : product.title)));

    mockStore.set(detail('KM1'));
    mockStore.set(detail('KM1')); // an unrelated action: same product, no news
    mockStore.set(detail('KM1', { pending: true }));
    // The SDK holds a surface that needs the product until it lands.
    expect(plugin.selwise.getProduct()).toEqual({ pending: true });
    mockStore.set(detail('KM2', { initialSuccessAt: 2 }));

    expect(seen).toEqual(['Ruj KM1', 'pending', 'Ruj KM2']);
  });

  it('labels the screen with the page type the dashboard judges "only on product pages" by', () => {
    const plugin = pluginWithClient();

    plugin.setScreen('app://product', 'ProductDetail');

    expect(plugin.selwise.getScreen()).toEqual({ pageUrl: 'app://product', screenName: 'ProductDetail', pageType: 'product' });
  });

  it('subscribes once, and stops following both the store and the screen', () => {
    const plugin = pluginWithClient();
    plugin.startProductFeed();
    plugin.startProductFeed();
    expect(mockStore.listeners).toHaveLength(1);

    plugin.stopProductFeed();
    expect(mockStore.listeners).toHaveLength(0);
  });

  it('does nothing on an SDK without setProduct', () => {
    const plugin = new SelwisePlugin();
    plugin.selwise = {};
    plugin.startProductFeed();
    expect(mockStore.listeners).toHaveLength(0);
  });
});
