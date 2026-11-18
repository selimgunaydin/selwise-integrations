'use strict';

// A link a surface, a strip or a push points at opens the way the app would:
// one of the app's own screens through its router, anything else through the
// storefront deep-link map.
describe('openLink', () => {
  function load(navigate) {
    jest.resetModules();
    jest.doMock('@core/navigation', () => ({ navigate }), { virtual: true });
    const { SelwisePlugin } = require('./index.js');
    const plugin = new SelwisePlugin();
    plugin.config = { screenRoutes: { 'app://search': 'PrimeSearch' } };
    plugin.openStorefrontPath = jest.fn(async () => true);
    return plugin;
  }

  it('opens a screen address as the App Maker route, the app’s own routes first', async () => {
    const navigate = jest.fn();
    const plugin = load(navigate);

    await expect(plugin.openLink('app://basket')).resolves.toBe(true);
    await expect(plugin.openLink('app://search')).resolves.toBe(true);
    expect(navigate.mock.calls).toEqual([['Basket'], ['PrimeSearch']]);
    expect(plugin.openStorefrontPath).not.toHaveBeenCalled();
  });

  it('opens nothing for a screen that needs to know which one', async () => {
    const navigate = jest.fn();
    const plugin = load(navigate);

    await expect(plugin.openLink('app://product')).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('hands a storefront path or url to the deep-link map', async () => {
    const plugin = load(jest.fn());

    await plugin.openLink('/baskets/basket/');
    expect(plugin.openStorefrontPath).toHaveBeenCalledWith('/baskets/basket/');
  });
});
