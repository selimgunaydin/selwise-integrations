'use strict';

const SelwiseRecommendation = require('./index.js');
const { filterByPlacement, normalizeContext } = require('./index.js');

const WIDGETS = [
  { id: 'w-1', name: 'PDP — Benzer Ürünler', strategy: 'similar_products' },
  { id: 'w-2', name: 'PDP — Birlikte Alınanlar', strategy: 'bought_together' },
  { id: 'w-3', name: 'Ana Sayfa — Çok Satanlar', strategy: 'bestsellers' }
];

describe('filterByPlacement', () => {
  // On web the anchor element is the page condition, so merchants leave
  // `showOnAllPages` on and the server returns every widget for any pageUrl.
  it('returns every widget when no placement is configured', () => {
    expect(filterByPlacement(WIDGETS, undefined)).toEqual(WIDGETS);
    expect(filterByPlacement(WIDGETS, [])).toEqual(WIDGETS);
  });

  it('keeps only the named widgets, in the order the placement lists them', () => {
    const result = filterByPlacement(WIDGETS, ['PDP — Birlikte Alınanlar', 'PDP — Benzer Ürünler']);
    expect(result.map((widget) => widget.id)).toEqual(['w-2', 'w-1']);
  });

  it('matches an id as readily as a name', () => {
    expect(filterByPlacement(WIDGETS, ['w-3']).map((w) => w.id)).toEqual(['w-3']);
  });

  it('is case and whitespace insensitive, because a config file is hand-typed', () => {
    expect(filterByPlacement(WIDGETS, ['  ana sayfa — çok satanlar  ']).map((w) => w.id)).toEqual(['w-3']);
  });

  it('silently skips a name that matches nothing rather than returning everything', () => {
    expect(filterByPlacement(WIDGETS, ['Silinmiş Widget'])).toEqual([]);
  });

  it('never repeats a widget named twice', () => {
    expect(filterByPlacement(WIDGETS, ['w-1', 'PDP — Benzer Ürünler']).length).toBe(1);
  });

  it('tolerates a non-array from the server', () => {
    expect(filterByPlacement(null, ['w-1'])).toEqual([]);
  });
});

describe('normalizeContext', () => {
  // The first end-to-end run of this plugin sent `productItemCode` and got a
  // 200 with the viewed product recommended back to itself.
  it('translates the item-code names a caller reaches for', () => {
    expect(normalizeContext({ productItemCode: 'KM1' })).toEqual({ currentProductId: 'KM1' });
    expect(normalizeContext({ itemCode: 'KM1' })).toEqual({ currentProductId: 'KM1' });
    expect(normalizeContext({ sku: 'KM1' })).toEqual({ currentProductId: 'KM1' });
  });

  it('leaves the canonical field alone and drops the alias', () => {
    expect(normalizeContext({ currentProductId: 'KM1', sku: 'KM2' })).toEqual({ currentProductId: 'KM1' });
  });

  it('keeps everything else untouched', () => {
    expect(normalizeContext({ currentProductId: 'KM1', limit: 8 })).toEqual({
      currentProductId: 'KM1',
      limit: 8
    });
  });

  it('tolerates nothing at all', () => {
    expect(normalizeContext(undefined)).toEqual({});
    expect(normalizeContext('nope')).toEqual({});
  });
});

describe('SelwiseRecommendation', () => {
  function fakeSelwise(overrides) {
    return {
      getRecommendationWidgets: async () => WIDGETS,
      getRecommendationProducts: async (widgetId) => ({
        widgetId,
        products: [{ itemCode: 'KM1' }, { itemCode: 'KM2' }],
        productCard: null,
        meta: null
      }),
      trackRecommendationImpression: () => {},
      trackRecommendationClick: () => {},
      ...(overrides || {})
    };
  }

  it('asks the server for the screen its synthetic url', async () => {
    let askedFor = null;
    const selwise = fakeSelwise({
      getRecommendationWidgets: async (pageUrl) => {
        askedFor = pageUrl;
        return WIDGETS;
      }
    });

    await new SelwiseRecommendation({ selwise }).getWidgets('ProductDetail');
    expect(askedFor).toBe('app://product');
  });

  it('applies the configured placement for that screen', async () => {
    const recommendation = new SelwiseRecommendation({
      selwise: fakeSelwise(),
      config: { recommendation: { placements: { 'app://product': ['w-2'] } } }
    });

    const widgets = await recommendation.getWidgets('ProductDetail');
    expect(widgets.map((widget) => widget.id)).toEqual(['w-2']);
  });

  it('drops widgets that returned no products, so no screen renders an empty strip', async () => {
    const selwise = fakeSelwise({
      getRecommendationProducts: async (widgetId) => ({
        widgetId,
        products: widgetId === 'w-2' ? [{ itemCode: 'KM1' }] : []
      })
    });

    const strips = await new SelwiseRecommendation({ selwise }).getStrip('ProductDetail', {});
    expect(strips.map((strip) => strip.widget.id)).toEqual(['w-2']);
  });

  // A screen must render whatever else it has when Selwise is unreachable.
  it('resolves to empty when the network fails instead of rejecting', async () => {
    const selwise = fakeSelwise({
      getRecommendationWidgets: async () => {
        throw new Error('offline');
      }
    });

    await expect(new SelwiseRecommendation({ selwise }).getWidgets('HomePage')).resolves.toEqual([]);
  });

  it('sends only real item codes on an impression', () => {
    const sent = [];
    const selwise = fakeSelwise({
      trackRecommendationImpression: (widgetId, codes) => sent.push({ widgetId, codes })
    });

    new SelwiseRecommendation({ selwise }).trackImpression('w-1', [
      { itemCode: 'KM1' },
      { code: 'KM2' },
      {}
    ]);

    expect(sent).toEqual([{ widgetId: 'w-1', codes: ['KM1', 'KM2'] }]);
  });

  it('does nothing before the SDK exists', async () => {
    const recommendation = new SelwiseRecommendation({ selwise: null });
    await expect(recommendation.getWidgets('HomePage')).resolves.toEqual([]);
    expect(() => recommendation.trackClick('w-1', 'KM1', 0)).not.toThrow();
  });
});
