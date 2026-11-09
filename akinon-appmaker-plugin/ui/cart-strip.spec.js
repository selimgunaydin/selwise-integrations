'use strict';

const SelwiseRecommendation = require('../integration/recommendation/index.js');
const { createImpressionLedger, impressionBatch } = require('./strip-impressions.js');
const { loadSdkModule } = require('../test/sdk-source.js');

// The real SDK, from its source: when a strip is asked again, what it asks
// with and what it shows are the SDK loader's answers — the object
// `useRecommendationWidget` runs on — and the plugin is tested against them.
const { Selwise } = loadSdkModule('client.ts');
const { MemoryStorage } = loadSdkModule('core/storage.ts');
const { RecommendationWidgetLoader, CART_REFRESH_DEBOUNCE_MS } = loadSdkModule(
  'core/recommendation-widget.ts'
);

/**
 * `<RecommendationStrips />` with a "complete to free shipping" strip: it
 * follows the basket the plugin feeds with `setCart` — asked when it mounts and
 * again 300 ms after the basket last moved, swapped in place with no second
 * impression, empty past the threshold, and not asked while the basket is
 * unknown. The React layer only holds the strip `followStrip` hands it; every
 * decision below is the one it draws from.
 */

const STRIP = {
  id: 'strip-1',
  name: 'Kargo bedavaya tamamla',
  strategy: 'free_shipping_complement',
  eligibilityFlags: { liveCartRequired: true },
};
const BEST = { id: 'best-1', name: 'Çok satanlar', strategy: 'bestsellers', eligibilityFlags: { liveCartRequired: false } };

let answers = {};
let calls = [];

function installFetch() {
  calls = [];
  global.fetch = jest.fn(async (url, init) => {
    const href = String(url);
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: href, body });
    let payload = {};
    if (href.includes('/products')) {
      const id = href.split('/recommendations/')[1].split('/')[0];
      payload = answers[id] || { products: [] };
    } else if (href.includes('/recommendations')) {
      payload = { widgets: [STRIP, BEST], reasonCodes: [], eligibilityFlags: {} };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  });
}

const productCalls = (id) => calls.filter((call) => call.url.includes('/recommendations/' + id + '/products'));
const product = (code) => ({ itemCode: code, title: code, price: 400 });
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const live = [];
async function setup() {
  installFetch();
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
  });
  return { selwise, recommendation: new SelwiseRecommendation({ selwise, config: {} }) };
}

beforeEach(() => {
  jest.useFakeTimers();
  answers = {};
});

afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete global.fetch;
});

describe('getStrip with followCart', () => {
  it('hands a cart strip over unasked, and asks every other strip as before', async () => {
    const { recommendation } = await setup();
    answers['best-1'] = { products: [product('X')] };

    const strips = await recommendation.getStrip('BasketPage', {}, { followCart: true });

    expect(strips.map((strip) => [strip.widget.id, strip.products.length, strip.followsCart === true])).toEqual([
      ['strip-1', 0, true],
      ['best-1', 1, false],
    ]);
    expect(productCalls('strip-1')).toHaveLength(0);
  });

  it('without it, leaves an unanswered cart strip out, as it always did', async () => {
    const { recommendation } = await setup();
    answers['best-1'] = { products: [product('X')] };

    const strips = await recommendation.getStrip('BasketPage', {});

    expect(strips.map((strip) => strip.widget.id)).toEqual(['best-1']);
  });
});

describe('followStrip', () => {
  it('follows the basket: in place, one impression per appearance, gone past the threshold', async () => {
    const { selwise, recommendation } = await setup();
    const [strip] = await recommendation.getStrip('BasketPage', {}, { followCart: true });
    const shown = [];
    const ledger = createImpressionLedger();
    const impressions = [];
    // What `RecommendationStrip` does with each strip it is handed: every
    // card on screen, through the ledger.
    const draw = (next) => {
      shown.push(next);
      const fresh = impressionBatch(ledger, next.products, next);
      if (fresh.length > 0) impressions.push(fresh.map((p) => p.itemCode));
    };

    // Mounted before the app's basket is known: asked once, nothing to show.
    answers['strip-1'] = { products: [], liveCartRequired: true, meta: { reason: 'cart_not_measured' } };
    const stop = recommendation.followStrip(strip, { sku: 'KM1' }, draw, RecommendationWidgetLoader);
    await settle();
    expect(productCalls('strip-1')).toHaveLength(1);
    expect(productCalls('strip-1')[0].body).not.toHaveProperty('cart');
    // The plugin's item-code aliases are translated here too.
    expect(productCalls('strip-1')[0].body.currentProductId).toBe('KM1');
    expect(shown[shown.length - 1].products).toEqual([]);

    // The basket arrives — a burst of three changes is one question.
    answers['strip-1'] = { products: [product('A'), product('B')], liveCartRequired: true };
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055', 'KM1'] });
    selwise.setCart({ total: 449.5, itemCount: 3, currency: 'TRY', codes: ['4055', 'KM1'] });
    selwise.setCart({ total: 598, itemCount: 4, currency: 'TRY', codes: ['4055', 'KM1'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(productCalls('strip-1')).toHaveLength(2);
    expect(productCalls('strip-1')[1].body.cart).toEqual({
      known: true,
      total: 598,
      currency: 'TRY',
      codes: ['4055', 'KM1'],
    });
    expect(shown[shown.length - 1].products.map((p) => p.itemCode)).toEqual(['A', 'B']);
    expect(impressions).toEqual([['A', 'B']]);

    // Swapped in place: new cards, the same display, no second impression.
    answers['strip-1'] = { products: [product('C')], liveCartRequired: true };
    selwise.setCart({ total: 649, itemCount: 5, currency: 'TRY', codes: ['4055', 'KM1', '4060'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(shown[shown.length - 1].products.map((p) => p.itemCode)).toEqual(['C']);
    expect(impressions).toHaveLength(1);

    // Past the threshold: nothing to show.
    answers['strip-1'] = { products: [], liveCartRequired: true, meta: { reason: 'threshold_reached' } };
    selwise.setCart({ total: 1047, itemCount: 6, currency: 'TRY', codes: ['4055', 'KM1', '4060'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(shown[shown.length - 1].products).toEqual([]);

    // A line removed: back under the threshold — a new display, a new impression.
    answers['strip-1'] = { products: [product('D')], liveCartRequired: true };
    selwise.setCart({ total: 698, itemCount: 5, currency: 'TRY', codes: ['4055', 'KM1'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(impressions).toEqual([['A', 'B'], ['D']]);

    // The order went through and the app cleaned its basket: not asked again.
    const asked = productCalls('strip-1').length;
    selwise.setCart(null);
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(productCalls('strip-1')).toHaveLength(asked);
    expect(shown[shown.length - 1].products).toEqual([]);

    // Unmounted: the basket no longer reaches it.
    stop();
    selwise.setCart({ total: 100, itemCount: 1, currency: 'TRY' });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(productCalls('strip-1')).toHaveLength(asked);
  });

  it('does nothing without the SDK loader (an SDK before 0.10.0)', async () => {
    const { recommendation } = await setup();
    const stop = recommendation.followStrip({ widget: STRIP, products: [] }, {}, () => {
      throw new Error('should not draw');
    }, undefined);
    await settle();
    expect(productCalls('strip-1')).toHaveLength(0);
    stop();
  });
});

describe('Selwise.recommendationLoader', () => {
  const SelwisePlugin = require('../integration/index.js');

  it('hands out the app SDK’s loader, or null on an SDK that predates it', () => {
    const plugin = Object.create(SelwisePlugin.constructor.prototype);
    plugin.sdkModuleCache = { Selwise, RecommendationWidgetLoader };
    expect(plugin.recommendationLoader()).toBe(RecommendationWidgetLoader);

    plugin.sdkModuleCache = { Selwise };
    expect(plugin.recommendationLoader()).toBeNull();
    plugin.sdkModuleCache = null;
    expect(plugin.recommendationLoader()).toBeNull();
  });
});

describe('impressionBatch', () => {
  it('counts each card once per mount on a strip that does not follow the basket', () => {
    const ledger = createImpressionLedger();
    const strip = { followsCart: false };
    expect(impressionBatch(ledger, [product('A'), product('B')], strip).map((p) => p.itemCode)).toEqual(['A', 'B']);
    // Scrolled: only the card that came on screen.
    expect(impressionBatch(ledger, [product('B'), product('C')], strip).map((p) => p.itemCode)).toEqual(['C']);
    expect(impressionBatch(ledger, [product('A')], strip)).toEqual([]);
  });

  it('counts a basket-following strip once per appearance', () => {
    const ledger = createImpressionLedger();
    expect(impressionBatch(ledger, [product('A')], { followsCart: true, appearance: 1 })).toHaveLength(1);
    // Swapped in place, or scrolled: the same display.
    expect(impressionBatch(ledger, [product('B')], { followsCart: true, appearance: 1 })).toEqual([]);
    // Nothing on screen yet does not spend the appearance.
    expect(impressionBatch(ledger, [], { followsCart: true, appearance: 2 })).toEqual([]);
    expect(impressionBatch(ledger, [product('C')], { followsCart: true, appearance: 2 })).toHaveLength(1);
  });
});
