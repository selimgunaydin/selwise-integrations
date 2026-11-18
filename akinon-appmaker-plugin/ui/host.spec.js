'use strict';

/**
 * The plugin as the SDK components' host: links through App Maker's deep-link
 * map, adds through the app's own basket, and the app's WebView, safe area and
 * navigation focus when it has them. `react` is a minimal stand-in: nothing here
 * draws, and the plugin does not depend on React itself.
 */
jest.mock(
  'react',
  () => ({
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: 'Fragment',
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
  }),
  { virtual: true }
);

function pluginStub() {
  return {
    config: {},
    selwise: null,
    storefrontUrl: () => 'https://shop.example.com',
    openStorefrontPath: jest.fn(async () => true),
    openScreen: jest.fn(() => true),
    addToCartDetailed: jest.fn(async () => ({ success: true })),
  };
}

const missing = () => {
  throw new Error('Cannot find module');
};

/** `host.js` loaded with the app's optional modules present (the factories given) or absent (the rest). */
function load(modules) {
  jest.resetModules();
  const present = modules || {};
  for (const name of ['react-native-webview', 'react-native-safe-area-context', '@react-navigation/native']) {
    jest.doMock(name, present[name] || missing, { virtual: true });
  }
  return require('./host.js');
}

describe('the host', () => {
  it('opens a storefront path or an https link through the app’s own deep-link map', async () => {
    const { buildHost } = load();
    const plugin = pluginStub();
    const host = buildHost(plugin);

    await expect(host.navigate({ kind: 'path', url: '/baskets/basket/', source: 'campaign' })).resolves.toBe(true);
    await host.navigate({ kind: 'https', url: 'https://shop.example.com/list/', source: 'recommendation' });

    expect(plugin.openStorefrontPath.mock.calls).toEqual([['/baskets/basket/'], ['https://shop.example.com/list/']]);
  });

  // A screen address is not a storefront path: joined onto the shop's origin it
  // would be a link to nowhere. The plugin opens the App Maker route instead.
  it('opens a screen address through the plugin’s own screen map', () => {
    const { buildHost } = load();
    const plugin = pluginStub();

    expect(buildHost(plugin).navigate({ kind: 'screen', url: 'app://basket', source: 'campaign' })).toBe(true);
    expect(plugin.openScreen).toHaveBeenCalledWith('app://basket');
    expect(plugin.openStorefrontPath).not.toHaveBeenCalled();
  });

  it('adds through the app’s basket, naming what asked', async () => {
    const { buildHost } = load();
    const plugin = pluginStub();

    const result = await buildHost(plugin).addToCart({ code: '7142', quantity: 2, source: 'recommendation', surfaceId: 'w-1' });

    expect(result).toEqual({ success: true });
    expect(plugin.addToCartDetailed).toHaveBeenCalledWith({ id: 'w-1' }, '7142', 2, 'recommendation');
  });

  it('reports a refused add as not successful', async () => {
    const { buildHost } = load();
    const plugin = pluginStub();
    plugin.addToCartDetailed.mockResolvedValue({ success: false });

    await expect(buildHost(plugin).addToCart({ code: '7142', quantity: 1, source: 'custom_widget' })).resolves.toEqual({ success: false });
  });

  it('hands the storefront’s own reason for a refusal to the SDK', async () => {
    const { buildHost } = load();
    const plugin = pluginStub();
    plugin.addToCartDetailed.mockResolvedValue({ success: false, message: 'Bu ürün 0 adetten fazla satın alınamaz.' });

    await expect(buildHost(plugin).addToCart({ code: '5380', quantity: 1, source: 'search' })).resolves.toEqual({
      success: false,
      message: 'Bu ürün 0 adetten fazla satın alınamaz.',
    });
  });

  it('hands over the app’s WebView, safe area and navigation focus when it has them', () => {
    const WebView = () => null;
    const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
    const { buildHost } = load({
      'react-native-webview': () => ({ WebView }),
      'react-native-safe-area-context': () => ({ useSafeAreaInsets }),
      '@react-navigation/native': () => ({ useNavigation: () => ({ isFocused: () => false }) }),
    });

    const host = buildHost(pluginStub());

    expect(host.WebView).toBe(WebView);
    expect(host.safeAreaInsets).toBe(useSafeAreaInsets);
    // The hook returns the function that is asked: the screen is not focused.
    expect(host.useIsFocused()()).toBe(false);
  });

  it('is plain without them — the plugin installs without touching the native projects', () => {
    const { buildHost } = load();

    const host = buildHost(pluginStub());

    expect(host).not.toHaveProperty('WebView');
    expect(host).not.toHaveProperty('safeAreaInsets');
    expect(host).not.toHaveProperty('useIsFocused');
  });

  it('counts a strip as focused outside a navigator', () => {
    const { buildHost } = load({
      '@react-navigation/native': () => ({
        useNavigation: () => {
          throw new Error("Couldn't find a navigation object");
        },
      }),
    });

    expect(buildHost(pluginStub()).useIsFocused()()).toBe(true);
  });

  it('knows the shop’s origin and the merchant’s enrichment typography', () => {
    const { buildHost } = load();
    const plugin = pluginStub();
    plugin.config = { enrichment: { fontSize: '15px' } };

    expect(buildHost(plugin)).toMatchObject({ storefrontUrl: 'https://shop.example.com', enrichment: { fontSize: '15px' } });
  });

  describe('the card’s favourite heart', () => {
    function withFavourites(user) {
      const favourite = {
        _addToFavourite: jest.fn(async () => ({ data: { pk: 9 } })),
        _removeFromFavourite: jest.fn(async () => ({})),
      };
      const navigate = jest.fn();
      const loaded = load();
      jest.doMock(
        '@services/container',
        () => ({ default: { get: (key) => (key === 'dataContainers' ? { favourite: { actions: favourite } } : { urls: { LOGIN: '/users/login/' } }) } }),
        { virtual: true }
      );
      jest.doMock(
        '@core/store',
        () => ({ default: { getState: () => ({ auth: { auth: { user } }, favouriteList: {} }), dispatch: jest.fn(), subscribe: () => () => undefined } }),
        { virtual: true }
      );
      jest.doMock('@core/navigation', () => ({ navigate }), { virtual: true });
      return { ...loaded, favourite, navigate };
    }

    it('is handed over when the app has a favourites container, and asks the app’s own request', async () => {
      const { buildHost, favourite } = withFavourites({ pk: 1 });
      const host = buildHost(pluginStub());

      await expect(host.toggleWishlist({ product: { itemCode: 'SKU1', cartCode: '12' }, wished: true, source: 'recommendation' })).resolves.toEqual({
        success: true,
        wished: true,
      });
      expect(favourite._addToFavourite).toHaveBeenCalledWith('12');
      expect(host.isWishlisted('SKU1', { itemCode: 'SKU1', cartCode: '12' })).toBe(true);
      expect(typeof host.subscribeWishlist).toBe('function');
    });

    it('sends a guest to the app’s sign-in screen', async () => {
      const { buildHost, navigate, favourite } = withFavourites(null);
      const host = buildHost(pluginStub());

      await expect(host.toggleWishlist({ product: { itemCode: 'SKU1', cartCode: '12' }, wished: true, source: 'recommendation' })).resolves.toEqual({ success: false });
      expect(navigate).toHaveBeenCalledWith('SignIn');
      expect(favourite._addToFavourite).not.toHaveBeenCalled();
    });

    it('is left out when the app has no favourites container, so a card draws no heart', () => {
      const { buildHost } = load();
      jest.doMock('@services/container', missing, { virtual: true });
      const host = buildHost(pluginStub());

      expect(host).not.toHaveProperty('toggleWishlist');
    });
  });

  it('is built once per plugin, so the components never redraw for it', () => {
    const { hostOf } = load();
    const plugin = pluginStub();

    expect(hostOf(plugin)).toBe(hostOf(plugin));
  });
});
