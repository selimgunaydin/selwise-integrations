import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';
import {
  CART_REFRESH_DEBOUNCE_MS,
  RecommendationWidgetLoader,
  type RecommendationWidgetState,
} from './core/recommendation-widget.js';

/**
 * A/B experiments on a recommendation strip, in an app.
 *
 * Before this, the products request went to the widget the host named, so an
 * app visitor saw the CONTROL strip whatever arm they were in and was never
 * counted: a recommendation experiment measured the web alone. The SDK now
 * resolves the visitor's arm for every strip — the module a
 * `different_module` arm draws in the control's place, a `config_override`
 * arm's title — and records the arm's exposure once, with the strip's first
 * impression, as the browser widget does.
 */

interface FetchCall {
  url: string;
  body: any;
}

/** The listed strip: a bestsellers strip, flagged by the API as not reading the cart. */
const BEST = {
  id: 'best-1',
  name: 'Çok satanlar',
  title: 'Çok satanlar',
  strategy: 'bestsellers',
  displayType: 'slider',
  eligibilityFlags: { isActive: true, liveCartRequired: false },
};

/** A `different_module` arm's strip, as `presentRecommendationWidget` sends it: inactive on its own. */
const ARM_STRIP = {
  id: 'strip-arm',
  name: 'Kol B — yeni gelenler',
  title: 'Yeni gelenler',
  strategy: 'new_arrivals',
  displayType: 'grid',
  eligibilityFlags: { isActive: false, liveCartRequired: false },
};

function swapArm(overrides: Record<string, unknown> = {}) {
  return {
    'exp-1': {
      experimentId: 'exp-1',
      variantId: 'arm-b',
      variantName: 'B',
      experimentMode: 'different_module',
      targetType: 'recommendation',
      targetId: 'best-1',
      controlTargetId: 'best-1',
      effectiveTargetId: 'strip-arm',
      excludedTargetIds: ['best-1'],
      config: null,
      moduleData: ARM_STRIP,
      ...overrides,
    },
  };
}

function controlArm() {
  return {
    'exp-1': {
      experimentId: 'exp-1',
      variantId: 'arm-a',
      variantName: 'Kontrol',
      experimentMode: 'different_module',
      targetType: 'recommendation',
      targetId: 'best-1',
      controlTargetId: 'best-1',
      effectiveTargetId: 'best-1',
      excludedTargetIds: ['strip-arm'],
      config: null,
      moduleData: BEST,
    },
  };
}

function overrideArm(config: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    'exp-2': {
      experimentId: 'exp-2',
      variantId: 'arm-title',
      variantName: 'Başlık',
      experimentMode: 'config_override',
      targetType: 'recommendation',
      targetId: 'best-1',
      controlTargetId: 'best-1',
      effectiveTargetId: 'best-1',
      excludedTargetIds: [],
      config,
      ...overrides,
    },
  };
}

let assignments: Record<string, unknown> = {};
let answers: Record<string, unknown> = {};
/** Resolves the assignment request when set — to prove nothing races past it. */
let assignGate: Promise<void> | null = null;

function installFetch(widgets: unknown[] = [BEST]) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: any) => {
    const call = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    let body: unknown = {};
    if (call.url.includes('/experiments/assign')) {
      if (assignGate) await assignGate;
      body = assignments;
    } else if (call.url.includes('/products')) {
      body = answers[call.url.split('/recommendations/')[1]!.split('/')[0]!] ?? { products: [] };
    } else if (call.url.includes('/recommendations')) {
      body = { widgets, reasonCodes: [], eligibilityFlags: {} };
    } else if (call.url.includes('/config')) {
      body = { campaigns: [], widgets: [] };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

const live: Selwise[] = [];

async function init(overrides: Partial<Parameters<Selwise['init']>[0]> = {}) {
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    ...overrides,
  });
  return selwise;
}

const product = (code: string) => ({ itemCode: code, title: code, price: 400 });
const productCalls = (calls: FetchCall[], id?: string) =>
  calls.filter((call) =>
    id ? call.url.includes(`/recommendations/${id}/products`) : call.url.includes('/products')
  );
const exposures = (calls: FetchCall[]) =>
  calls.filter((call) => call.url.includes('/public/experiments/track')).map((call) => call.body);
const sentEvents = (calls: FetchCall[]) =>
  calls.filter((call) => call.url.includes('/events/batch')).flatMap((call) => call.body.events);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  assignments = {};
  answers = {};
  assignGate = null;
});

afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('a different_module arm', () => {
  it('asks for the arm’s strip, never the control, and says which strip it is', async () => {
    assignments = swapArm();
    answers['strip-arm'] = { products: [product('N1'), product('N2')] };
    const calls = installFetch();
    const selwise = await init();
    await selwise.getRecommendationWidgets('app://home');

    const result = await selwise.getRecommendationProducts('best-1');

    expect(productCalls(calls, 'strip-arm')).toHaveLength(1);
    expect(productCalls(calls, 'best-1')).toHaveLength(0);
    // The arm's strip runs its own saved strategy: no arm id rides with it.
    expect(productCalls(calls, 'strip-arm')[0]!.body).not.toHaveProperty('experimentVariantId');
    expect(result.widgetId).toBe('strip-arm');
    expect(result.sourceWidgetId).toBe('best-1');
    expect(result.widget).toEqual(expect.objectContaining({ id: 'strip-arm', title: 'Yeni gelenler', displayType: 'grid' }));
    expect(result.experiment).toEqual({ experimentId: 'exp-1', variantId: 'arm-b' });
    expect(result.products.map((p) => p.itemCode)).toEqual(['N1', 'N2']);
  });

  it('reports the impression and the click under the arm’s strip, with one exposure', async () => {
    assignments = swapArm();
    answers['strip-arm'] = { products: [product('N1')] };
    const calls = installFetch();
    const selwise = await init();
    await selwise.getRecommendationProducts('best-1');

    // The host keeps the id it knows; the SDK maps it to the strip drawn.
    selwise.trackRecommendationImpression('best-1', ['N1']);
    selwise.trackRecommendationImpression('best-1', ['N1']);
    selwise.trackRecommendationClick('best-1', 'N1', 0);
    await selwise.flush();
    await settle();

    const events = sentEvents(calls);
    expect(events.map((event: any) => [event.name, event.entityId])).toEqual([
      ['widget_impression', 'strip-arm'],
      ['widget_impression', 'strip-arm'],
      ['product_click', 'strip-arm'],
    ]);
    expect(events[2].metadata).toEqual({ widgetId: 'strip-arm', position: 0 });

    const sent = exposures(calls);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(
      expect.objectContaining({ experimentId: 'exp-1', variantId: 'arm-b', eventType: 'exposure' })
    );
  });

  it('records no exposure before the strip is on screen — resolving is not showing', async () => {
    assignments = swapArm();
    answers['strip-arm'] = { products: [product('N1')] };
    const calls = installFetch();
    const selwise = await init();

    await selwise.getRecommendationProducts('best-1');
    await settle();

    expect(exposures(calls)).toHaveLength(0);
  });

  it('records the CONTROL arm at the same moment, and keeps the arm’s strip from it', async () => {
    assignments = controlArm();
    answers['best-1'] = { products: [product('B1')] };
    answers['strip-arm'] = { products: [product('N1')] };
    const calls = installFetch();
    const selwise = await init();
    await selwise.getRecommendationWidgets('app://home');

    const control = await selwise.getRecommendationProducts('best-1');
    expect(productCalls(calls, 'best-1')[0]!.body).not.toHaveProperty('experimentVariantId');
    expect(control.widgetId).toBe('best-1');
    expect(control).not.toHaveProperty('sourceWidgetId');
    expect(control.widget?.title).toBe('Çok satanlar');
    expect(control.experiment).toEqual({ experimentId: 'exp-1', variantId: 'arm-a' });

    // A host that somehow asks for the other arm's strip gets nothing for it.
    const other = await selwise.getRecommendationProducts('strip-arm');
    expect(other.hidden).toBe(true);
    expect(other.products).toEqual([]);
    expect(productCalls(calls, 'strip-arm')).toHaveLength(0);

    selwise.trackRecommendationImpression('best-1', ['B1']);
    await settle();
    expect(exposures(calls).map((body) => body.variantId)).toEqual(['arm-a']);
  });

  it('draws nothing when the arm’s module did not arrive', async () => {
    assignments = swapArm({ moduleData: undefined });
    const calls = installFetch();
    const selwise = await init();

    const result = await selwise.getRecommendationProducts('best-1');

    expect(result.hidden).toBe(true);
    expect(productCalls(calls)).toHaveLength(0);
  });
});

describe('a config_override arm', () => {
  it('carries the arm’s title, subtitle and display type over the listed strip', async () => {
    assignments = overrideArm({
      content: { title: 'Sizin için seçtiklerimiz', text: 'Bugün popüler' },
      recommendation: { displayType: 'grid' },
    });
    answers['best-1'] = { products: [product('B1'), product('B2'), product('B3')] };
    const calls = installFetch();
    const selwise = await init();
    await selwise.getRecommendationWidgets('app://home');

    const result = await selwise.getRecommendationProducts('best-1');

    expect(productCalls(calls, 'best-1')).toHaveLength(1);
    expect(result.widget).toEqual(
      expect.objectContaining({
        id: 'best-1',
        name: 'Çok satanlar',
        title: 'Sizin için seçtiklerimiz',
        subtitle: 'Bugün popüler',
        displayType: 'grid',
      })
    );
    expect(result.experiment).toEqual({ experimentId: 'exp-2', variantId: 'arm-title' });
  });

  it('names the arm in the products request and leaves the strategy and count to the API', async () => {
    assignments = overrideArm({ recommendation: { strategy: 'trending', maxProducts: 1 } });
    answers['best-1'] = { products: [product('B1'), product('B2')] };
    const calls = installFetch();
    const selwise = await init();

    const result = await selwise.getRecommendationProducts('best-1');

    // An id, never a strategy: the API reads the override from the stored arm
    // (the browser widget's `experimentVariantId`).
    const body = productCalls(calls, 'best-1')[0]!.body;
    expect(body.experimentVariantId).toBe('arm-title');
    expect(body).not.toHaveProperty('strategy');
    expect(body).not.toHaveProperty('maxProducts');
    // Not trimmed to fake the count: the cards are the API's answer.
    expect(result.products).toHaveLength(2);
  });

  it('describes a strip the host never listed by what the arm changes', async () => {
    assignments = overrideArm({ content: { title: 'Kol başlığı' } });
    installFetch();
    const selwise = await init();

    const resolved = await selwise.resolveRecommendationWidget('best-1');

    expect(resolved).toEqual({
      widgetId: 'best-1',
      sourceWidgetId: 'best-1',
      widget: expect.objectContaining({ id: 'best-1', title: 'Kol başlığı' }),
      experiment: { experimentId: 'exp-2', variantId: 'arm-title' },
      hidden: false,
    });
  });

  it('sends the measured basket when the arm overrides the strategy', async () => {
    assignments = overrideArm({ recommendation: { strategy: 'free_shipping_complement' } });
    const calls = installFetch();
    const selwise = await init();
    await selwise.getRecommendationWidgets('app://home');
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055'] });

    await selwise.getRecommendationProducts('best-1');

    expect(productCalls(calls, 'best-1')[0]!.body.cart).toEqual({
      known: true,
      total: 349.5,
      currency: 'TRY',
      codes: ['4055'],
    });
  });

  it('keeps the basket off it when the arm leaves the strategy alone', async () => {
    assignments = overrideArm({ content: { title: 'Kol başlığı' } });
    const calls = installFetch();
    const selwise = await init();
    await selwise.getRecommendationWidgets('app://home');
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY' });

    await selwise.getRecommendationProducts('best-1');

    expect(productCalls(calls, 'best-1')[0]!.body).not.toHaveProperty('cart');
  });
});

describe('the arms are known before a strip is asked for', () => {
  it('waits for them, and shares one request with getSurfaces', async () => {
    assignments = swapArm();
    answers['strip-arm'] = { products: [product('N1')] };
    let open: () => void = () => undefined;
    assignGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const calls = installFetch();
    const selwise = await init();

    // getSurfaces asks first; the strip asks while that request is in flight —
    // the second caller is the one a launch-wide flag used to let through.
    const surfaces = selwise.getSurfaces('app://home');
    await settle();
    expect(calls.filter((call) => call.url.includes('/experiments/assign'))).toHaveLength(1);
    const strip = selwise.getRecommendationProducts('best-1');
    await settle();
    // Nothing was asked for while the arms were on their way.
    expect(productCalls(calls)).toHaveLength(0);

    open();
    await Promise.all([surfaces, strip]);
    expect(calls.filter((call) => call.url.includes('/experiments/assign'))).toHaveLength(1);
    expect(productCalls(calls, 'strip-arm')).toHaveLength(1);
    expect(productCalls(calls, 'best-1')).toHaveLength(0);
  });

  it('asks for the listed strip when the arms cannot be had', async () => {
    const calls = installFetch();
    (globalThis as unknown as { fetch: jest.Mock }).fetch.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    answers['best-1'] = { products: [product('B1')] };
    const selwise = await init();

    const result = await selwise.getRecommendationProducts('best-1');

    expect(result.widgetId).toBe('best-1');
    expect(result).not.toHaveProperty('experiment');
    expect(productCalls(calls, 'best-1')).toHaveLength(1);
  });
});

describe('an experiment with an Audience', () => {
  // Only the product screen enters the experiment; elsewhere the visitor gets
  // the live strip and is not counted — judged on the screen the strip is
  // asked for on, then KEPT for that strip's impression and clicks.
  const productScreensOnly = { targeting: { showOnAllPages: false, includeUrls: ['app://product/*'] } };

  it('admits the strip on a screen the audience matches', async () => {
    assignments = swapArm({ audience: productScreensOnly });
    answers['strip-arm'] = { products: [product('N1')] };
    const calls = installFetch();
    const selwise = await init();
    selwise.setScreen('app://product/KM1');

    const result = await selwise.getRecommendationProducts('best-1');
    selwise.trackRecommendationImpression(result.widgetId, ['N1']);
    await settle();

    expect(result.widgetId).toBe('strip-arm');
    expect(productCalls(calls, 'best-1')).toHaveLength(0);
    expect(exposures(calls).map((body) => body.variantId)).toEqual(['arm-b']);
  });

  it('keeps it out elsewhere: the listed strip, nothing counted', async () => {
    assignments = swapArm({ audience: productScreensOnly });
    answers['best-1'] = { products: [product('B1')] };
    const calls = installFetch();
    const selwise = await init();
    selwise.setScreen('app://home');

    const result = await selwise.getRecommendationProducts('best-1');
    selwise.trackRecommendationImpression(result.widgetId, ['B1']);
    await selwise.flush();
    await settle();

    expect(result.widgetId).toBe('best-1');
    expect(result).not.toHaveProperty('experiment');
    expect(productCalls(calls, 'strip-arm')).toHaveLength(0);
    expect(exposures(calls)).toHaveLength(0);
    expect(sentEvents(calls).map((event: any) => event.entityId)).toEqual(['best-1']);
  });

  it('keeps strips out of an audience on the page kind: a strip is never told one', async () => {
    assignments = swapArm({ audience: { targeting: { pageTypes: { types: ['product'] } } } });
    answers['best-1'] = { products: [product('B1')] };
    const calls = installFetch();
    const selwise = await init();
    selwise.setScreen('app://product/KM1');

    const result = await selwise.getRecommendationProducts('best-1');
    selwise.trackRecommendationImpression(result.widgetId, ['B1']);
    await settle();

    expect(result.widgetId).toBe('best-1');
    expect(productCalls(calls, 'strip-arm')).toHaveLength(0);
    expect(exposures(calls)).toHaveLength(0);
  });

  it('records a click against the answer on screen, not the screen the shopper moved to', async () => {
    assignments = swapArm({ audience: productScreensOnly });
    answers['strip-arm'] = { products: [product('N1')] };
    const calls = installFetch();
    const selwise = await init();
    selwise.setScreen('app://product/KM1');
    const result = await selwise.getRecommendationProducts('best-1');

    // The shopper navigated on; the strip they tap is still the arm's.
    selwise.setScreen('app://home');
    selwise.trackRecommendationClick(result.widgetId, 'N1', 0);
    await selwise.flush();
    await settle();

    expect(sentEvents(calls).map((event: any) => [event.name, event.entityId])).toEqual([
      ['product_click', 'strip-arm'],
    ]);
    expect(exposures(calls).map((body) => body.variantId)).toEqual(['arm-b']);
  });
});

describe('a holdout arm on a strip', () => {
  // The contract refuses one (`HOLDOUT_TARGET_SUPPORT.recommendation`); one
  // that arrives anyway is never drawn, never requested and never counted.
  it('asks for nothing, draws nothing and records nothing', async () => {
    assignments = overrideArm(null as unknown as Record<string, unknown>, {
      variantId: 'arm-holdout',
      holdout: true,
      hasHoldout: true,
    });
    const calls = installFetch();
    const selwise = await init();

    const result = await selwise.getRecommendationProducts('best-1');
    expect(result.hidden).toBe(true);
    expect(result.products).toEqual([]);

    selwise.trackRecommendationImpression('best-1', ['B1']);
    selwise.trackRecommendationClick('best-1', 'B1', 0);
    await selwise.flush();
    await settle();

    expect(productCalls(calls)).toHaveLength(0);
    expect(sentEvents(calls)).toHaveLength(0);
    expect(exposures(calls)).toHaveLength(0);
  });
});

describe('test mode', () => {
  it('draws the arm but records no exposure', async () => {
    assignments = swapArm();
    answers['strip-arm'] = { products: [product('N1')] };
    const calls = installFetch();
    const selwise = await init({ testMode: true });

    const result = await selwise.getRecommendationProducts('best-1');
    selwise.trackRecommendationImpression('best-1', ['N1']);
    await settle();

    expect(result.widgetId).toBe('strip-arm');
    expect(exposures(calls)).toHaveLength(0);
  });
});

describe('an arm whose strip answers the basket', () => {
  const CART_ARM = {
    ...ARM_STRIP,
    strategy: 'free_shipping_complement',
    eligibilityFlags: { isActive: false, liveCartRequired: true },
  };

  it('sends the basket with the arm’s strip although the control never reads one', async () => {
    assignments = swapArm({ moduleData: CART_ARM, liveCartRequired: true });
    const calls = installFetch();
    const selwise = await init();
    await selwise.getRecommendationWidgets('app://basket');
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055'] });

    const resolved = await selwise.resolveRecommendationWidget(BEST);
    expect(resolved.liveCartRequired).toBe(true);
    await selwise.getRecommendationProducts('best-1');

    expect(productCalls(calls, 'strip-arm')[0]!.body.cart.total).toBe(349.5);
  });

  it('is followed by the loader: held while the basket is unknown, drawn and kept in step once it is', async () => {
    jest.useFakeTimers();
    assignments = swapArm({ moduleData: CART_ARM, liveCartRequired: true });
    answers['strip-arm'] = { products: [], liveCartRequired: true, meta: { reason: 'cart_not_measured' } };
    const calls = installFetch();
    const selwise = await init();
    const states: RecommendationWidgetState[] = [];
    const loader = new RecommendationWidgetLoader(selwise, 'best-1', {}, (state) => states.push(state));
    const last = () => states[states.length - 1]!;
    const flushPromises = async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    };

    loader.load();
    await flushPromises();
    expect(productCalls(calls, 'strip-arm')).toHaveLength(1);
    expect(productCalls(calls, 'strip-arm')[0]!.body).not.toHaveProperty('cart');
    expect(last().followsCart).toBe(true);
    expect(last().products).toEqual([]);
    expect(last().widget?.id).toBe('strip-arm');

    answers['strip-arm'] = { products: [product('K1')], liveCartRequired: true };
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await flushPromises();

    expect(productCalls(calls, 'strip-arm')).toHaveLength(2);
    expect(productCalls(calls, 'best-1')).toHaveLength(0);
    expect(last().products.map((p) => p.itemCode)).toEqual(['K1']);
    expect(last().widget?.title).toBe('Yeni gelenler');
    expect(last().experiment).toEqual({ experimentId: 'exp-1', variantId: 'arm-b' });
    expect(last().appearance).toBe(1);
    loader.stop();
  });
});
