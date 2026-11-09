'use strict';

const SelwiseRecommendation = require('../integration/recommendation/index.js');
const { createImpressionLedger, impressionBatch } = require('./strip-impressions.js');
const { stripHeading } = require('./strip-heading.js');
const { loadSdkModule } = require('../test/sdk-source.js');

// The real SDK, from its source: which strip an A/B arm draws, what it is
// asked for and what it reports are the SDK's answers, and `<RecommendationStrips />`
// is tested against them.
const { Selwise } = loadSdkModule('client.ts');
const { MemoryStorage } = loadSdkModule('core/storage.ts');
const { RecommendationWidgetLoader, CART_REFRESH_DEBOUNCE_MS } = loadSdkModule(
  'core/recommendation-widget.ts'
);

/**
 * `<RecommendationStrips />` in a recommendation A/B experiment. Before the
 * SDK applied arms to strips every app visitor got the CONTROL strip and was
 * never counted. Now each strip is the one the visitor's arm draws: the
 * module a `different_module` arm swaps in (its id, its heading, its
 * products), a `config_override` arm's heading, or no strip at all — and the
 * arm's exposure rides with the strip's first impression, once.
 */

const BEST = {
  id: 'best-1',
  name: 'PDP — Çok satanlar',
  title: 'Çok satanlar',
  strategy: 'bestsellers',
  eligibilityFlags: { isActive: true, liveCartRequired: false },
};
const OTHER = {
  id: 'other-1',
  name: 'PDP — Benzerleri',
  title: 'Benzer ürünler',
  strategy: 'similar_products',
  eligibilityFlags: { isActive: true, liveCartRequired: false },
};
const ARM_STRIP = {
  id: 'strip-arm',
  name: 'Kol B',
  title: 'Yeni gelenler',
  strategy: 'new_arrivals',
  eligibilityFlags: { isActive: false, liveCartRequired: false },
};
const CART_ARM = {
  ...ARM_STRIP,
  title: 'Kargo bedavaya tamamla',
  strategy: 'free_shipping_complement',
  eligibilityFlags: { isActive: false, liveCartRequired: true },
};

function swapArm(moduleData, extra) {
  return {
    'exp-1': Object.assign(
      {
        experimentId: 'exp-1',
        variantId: 'arm-b',
        experimentMode: 'different_module',
        targetType: 'recommendation',
        targetId: 'best-1',
        controlTargetId: 'best-1',
        effectiveTargetId: moduleData.id,
        excludedTargetIds: ['best-1'],
        config: null,
        moduleData,
      },
      extra || {}
    ),
  };
}

function overrideArm(config, extra) {
  return {
    'exp-2': Object.assign(
      {
        experimentId: 'exp-2',
        variantId: 'arm-title',
        experimentMode: 'config_override',
        targetType: 'recommendation',
        targetId: 'best-1',
        controlTargetId: 'best-1',
        effectiveTargetId: 'best-1',
        excludedTargetIds: [],
        config,
      },
      extra || {}
    ),
  };
}

let assignments = {};
let answers = {};
let calls = [];

function installFetch() {
  calls = [];
  global.fetch = jest.fn(async (url, init) => {
    const href = String(url);
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: href, body });
    let payload = {};
    if (href.includes('/experiments/assign')) {
      payload = assignments;
    } else if (href.includes('/products')) {
      const id = href.split('/recommendations/')[1].split('/')[0];
      payload = answers[id] || { products: [] };
    } else if (href.includes('/recommendations')) {
      payload = { widgets: [BEST, OTHER], reasonCodes: [], eligibilityFlags: {} };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  });
}

const productCalls = (id) => calls.filter((call) => call.url.includes('/recommendations/' + id + '/products'));
const exposures = () => calls.filter((call) => call.url.includes('/public/experiments/track')).map((call) => call.body);
const events = () =>
  calls.filter((call) => call.url.includes('/events/batch')).flatMap((call) => call.body.events);
const product = (code) => ({ itemCode: code, title: code, price: 400 });
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const live = [];
async function setup(config) {
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
  return { selwise, recommendation: new SelwiseRecommendation({ selwise, config: config || {} }) };
}

beforeEach(() => {
  assignments = {};
  answers = {};
});

afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete global.fetch;
});

describe('getStrip in a different_module experiment', () => {
  it('hands over the arm’s strip in the control’s slot — its id, its heading, its products', async () => {
    assignments = swapArm(ARM_STRIP);
    answers['strip-arm'] = { products: [product('N1'), product('N2')] };
    answers['other-1'] = { products: [product('S1')] };
    const { recommendation } = await setup();

    const strips = await recommendation.getStrip('ProductDetail', {});

    expect(strips.map((strip) => strip.widget.id)).toEqual(['strip-arm', 'other-1']);
    expect(stripHeading(strips[0].widget)).toBe('Yeni gelenler');
    expect(strips[0].products.map((p) => p.itemCode)).toEqual(['N1', 'N2']);
    expect(strips[0].experiment).toEqual({ experimentId: 'exp-1', variantId: 'arm-b' });
    expect(strips[1]).not.toHaveProperty('experiment');
    expect(productCalls('best-1')).toHaveLength(0);
  });

  it('matches the placement config against the LISTED widget, by the name the merchant knows', async () => {
    assignments = swapArm(ARM_STRIP);
    answers['strip-arm'] = { products: [product('N1')] };
    const { recommendation } = await setup({
      recommendation: { placements: { 'app://product': ['PDP — Çok satanlar'] } },
    });

    const strips = await recommendation.getStrip('ProductDetail', {});

    expect(strips.map((strip) => strip.widget.id)).toEqual(['strip-arm']);
  });

  it('reports the strip drawn, with the arm’s exposure once', async () => {
    assignments = swapArm(ARM_STRIP);
    answers['strip-arm'] = { products: [product('N1'), product('N2')] };
    const { selwise, recommendation } = await setup();
    const [strip] = await recommendation.getStrip('ProductDetail', {});

    // What `RecommendationStrip` does: the visible cards through the ledger,
    // reported under `strip.widget.id`; a tap reported the same way.
    const ledger = createImpressionLedger();
    recommendation.trackImpression(strip.widget.id, impressionBatch(ledger, [strip.products[0]], strip));
    recommendation.trackImpression(strip.widget.id, impressionBatch(ledger, strip.products, strip));
    recommendation.trackClick(strip.widget.id, 'N2', 1);
    await selwise.flush();
    await settle();

    expect(events().map((event) => [event.name, event.entityId])).toEqual([
      ['widget_impression', 'strip-arm'],
      ['widget_impression', 'strip-arm'],
      ['product_click', 'strip-arm'],
    ]);
    expect(exposures()).toEqual([
      expect.objectContaining({ experimentId: 'exp-1', variantId: 'arm-b', eventType: 'exposure' }),
    ]);
  });

  it('leaves the slot out when the visitor’s arm draws nothing there', async () => {
    assignments = overrideArm(null, { variantId: 'arm-holdout', holdout: true });
    answers['other-1'] = { products: [product('S1')] };
    const { recommendation } = await setup();

    const strips = await recommendation.getStrip('ProductDetail', {});

    expect(strips.map((strip) => strip.widget.id)).toEqual(['other-1']);
    expect(productCalls('best-1')).toHaveLength(0);
  });
});

describe('getStrip in a config_override experiment', () => {
  it('draws the listed strip under the arm’s heading', async () => {
    assignments = overrideArm({ content: { title: 'Sizin için seçtiklerimiz' } });
    answers['best-1'] = { products: [product('B1')] };
    const { recommendation } = await setup();

    const strips = await recommendation.getStrip('ProductDetail', {});

    expect(strips[0].widget.id).toBe('best-1');
    expect(strips[0].widget.name).toBe('PDP — Çok satanlar');
    expect(stripHeading(strips[0].widget)).toBe('Sizin için seçtiklerimiz');
    expect(strips[0].experiment).toEqual({ experimentId: 'exp-2', variantId: 'arm-title' });
  });
});

describe('an arm that swaps in a strip which answers the basket', () => {
  it('is followed: handed over unasked, then asked for the arm’s strip with the basket, in place', async () => {
    jest.useFakeTimers();
    assignments = swapArm(CART_ARM, { liveCartRequired: true });
    answers['other-1'] = { products: [product('S1')] };
    const { selwise, recommendation } = await setup();

    const strips = await recommendation.getStrip('BasketPage', {}, { followCart: true });
    expect(strips.map((strip) => [strip.widget.id, strip.products.length, strip.followsCart === true])).toEqual([
      ['strip-arm', 0, true],
      ['other-1', 1, false],
    ]);
    expect(productCalls('strip-arm')).toHaveLength(0);

    const shown = [];
    answers['strip-arm'] = { products: [], liveCartRequired: true };
    const stop = recommendation.followStrip(strips[0], {}, (next) => shown.push(next), RecommendationWidgetLoader);
    await settle();
    expect(productCalls('strip-arm')).toHaveLength(1);
    expect(shown[shown.length - 1].products).toEqual([]);

    answers['strip-arm'] = { products: [product('K1')], liveCartRequired: true };
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();

    expect(productCalls('strip-arm')).toHaveLength(2);
    expect(productCalls('strip-arm')[1].body.cart.total).toBe(349.5);
    expect(productCalls('best-1')).toHaveLength(0);
    const last = shown[shown.length - 1];
    expect(last.widget.id).toBe('strip-arm');
    expect(stripHeading(last.widget)).toBe('Kargo bedavaya tamamla');
    expect(last.products.map((p) => p.itemCode)).toEqual(['K1']);
    expect(last.experiment).toEqual({ experimentId: 'exp-1', variantId: 'arm-b' });
    stop();
  });
});

describe('an SDK without arms for strips (before 0.11.0)', () => {
  it('draws the listed strips as they are', async () => {
    const asked = [];
    const selwise = {
      getRecommendationWidgets: async () => [BEST],
      getRecommendationProducts: async (widgetId) => {
        asked.push(widgetId);
        return { widgetId, products: [product('B1')] };
      },
    };
    const recommendation = new SelwiseRecommendation({ selwise, config: {} });

    const strips = await recommendation.getStrip('ProductDetail', {});

    expect(asked).toEqual(['best-1']);
    expect(strips[0].widget).toBe(BEST);
    expect(strips[0]).not.toHaveProperty('experiment');
  });
});

describe('stripHeading', () => {
  it('prefers the screen’s title, then the widget’s shopper-facing title, then its internal name', () => {
    expect(stripHeading(BEST, 'Ekran başlığı')).toBe('Ekran başlığı');
    expect(stripHeading(BEST)).toBe('Çok satanlar');
    expect(stripHeading({ id: 'x', name: 'PDP — İç ad', title: '' })).toBe('PDP — İç ad');
    expect(stripHeading(null)).toBe('');
  });
});
