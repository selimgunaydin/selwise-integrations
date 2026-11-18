'use strict';

const SelwiseRecommendation = require('./index.js');

/**
 * What is the plugin's here is the route name: `ProductDetail` becomes the
 * screen's address, and the SDK's strip service (`Selwise.strips`) does the
 * rest — its own spec covers placements, arms, sharing and the basket.
 */
function fakeStrips(log) {
  const record = (name, result) => (...args) => {
    log.push({ name, args });
    return result;
  };
  return {
    widgets: record('widgets', Promise.resolve([{ id: 'w-1' }])),
    products: record('products', Promise.resolve({ widgetId: 'w-1', products: [{ itemCode: 'KM1' }] })),
    resolveWidget: record('resolveWidget', Promise.resolve({ widget: { id: 'w-1' }, hidden: false })),
    strips: record('strips', Promise.resolve([{ widget: { id: 'w-1' }, products: [{ itemCode: 'KM1' }] }])),
    follow: record('follow', () => 'stopped'),
    trackImpression: record('trackImpression'),
    trackClick: record('trackClick'),
  };
}

function recommendation() {
  const log = [];
  return { log, recommendation: new SelwiseRecommendation({ selwise: { strips: fakeStrips(log) }, config: {} }) };
}

describe('SelwiseRecommendation', () => {
  it('asks the SDK for the screen its synthetic url', async () => {
    const { log, recommendation: reco } = recommendation();

    await reco.getWidgets('ProductDetail');

    expect(log).toEqual([{ name: 'widgets', args: ['app://product'] }]);
  });

  it('shares an address between the routes that mean one screen', async () => {
    const { log, recommendation: reco } = recommendation();

    await reco.getWidgets('Search');
    await reco.getWidgets('PrimeSearch');

    expect(log.map((call) => call.args[0])).toEqual(['app://search', 'app://search']);
  });

  it('asks a screen for its strips with the context and the options it was given', async () => {
    const { log, recommendation: reco } = recommendation();

    const strips = await reco.getStrip('BasketPage', { sku: 'KM1' }, { followCart: true });

    expect(log).toEqual([{ name: 'strips', args: ['app://basketpage', { sku: 'KM1' }, { followCart: true }] }]);
    expect(strips).toHaveLength(1);
  });

  it('hands products, an arm and a follower over to the service as they are', async () => {
    const { log, recommendation: reco } = recommendation();

    await reco.getProducts('w-1', { currentProductId: 'KM1' });
    await reco.resolveWidget({ id: 'w-1' });
    expect(reco.followStrip({ widget: { id: 'w-1' } }, {}, () => {})()).toBe('stopped');

    expect(log.map((call) => call.name)).toEqual(['products', 'resolveWidget', 'follow']);
  });

  it('forwards impressions with the basis the caller counted on, and clicks', () => {
    const { log, recommendation: reco } = recommendation();

    reco.trackImpression('w-1', [{ itemCode: 'KM1' }], { basis: 'visible' });
    reco.trackClick('w-1', 'KM1', 2);

    expect(log).toEqual([
      { name: 'trackImpression', args: ['w-1', [{ itemCode: 'KM1' }], { basis: 'visible' }] },
      { name: 'trackClick', args: ['w-1', 'KM1', 2] },
    ]);
  });

  it('does nothing before the SDK exists', async () => {
    const reco = new SelwiseRecommendation({ selwise: null });

    await expect(reco.getWidgets('HomePage')).resolves.toEqual([]);
    await expect(reco.getProducts('w-1')).resolves.toEqual({ widgetId: 'w-1', products: [] });
    await expect(reco.getStrip('HomePage', {})).resolves.toEqual([]);
    expect(() => reco.trackClick('w-1', 'KM1', 0)).not.toThrow();
    expect(typeof reco.followStrip({}, {}, () => {})).toBe('function');
  });

  it('does nothing on an SDK that has no strip service', async () => {
    const reco = new SelwiseRecommendation({ selwise: {} });

    await expect(reco.getWidgets('HomePage')).resolves.toEqual([]);
  });
});
