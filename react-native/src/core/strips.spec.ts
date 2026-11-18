import { Selwise } from '../client.js';
import { MemoryStorage } from './storage.js';
import { CART_REFRESH_DEBOUNCE_MS } from './recommendation-widget.js';
import {
  filterByPlacement,
  normalizeContext,
  SHARED_LOAD_MS,
  StripService,
  stripFrequencyCap,
  type Strip,
  type StripClient,
} from './strips.js';
import { createImpressionLedger, impressionBatch } from '../ui/strip-impressions.js';
import { stripHeading } from '../ui/strip-heading.js';
import type { RecommendationWidgetSummary, SelwiseProduct } from '../types.js';

/**
 * The strips of a screen against the real client: which strip an A/B arm draws,
 * what it is asked for, what it reports, and how a screen's points share their
 * requests. The React layer only holds what the service hands it; every
 * decision below is the one it draws from.
 */

const STRIP: RecommendationWidgetSummary = {
  id: 'strip-1',
  name: 'Kargo bedavaya tamamla',
  strategy: 'free_shipping_complement',
  eligibilityFlags: { liveCartRequired: true },
};
const BEST: RecommendationWidgetSummary = {
  id: 'best-1',
  name: 'PDP — Çok satanlar',
  title: 'Çok satanlar',
  strategy: 'bestsellers',
  eligibilityFlags: { isActive: true, liveCartRequired: false },
};
const OTHER: RecommendationWidgetSummary = {
  id: 'other-1',
  name: 'PDP — Benzerleri',
  title: 'Benzer ürünler',
  strategy: 'similar_products',
  eligibilityFlags: { isActive: true, liveCartRequired: false },
};
const ARM_STRIP: RecommendationWidgetSummary = {
  id: 'strip-arm',
  name: 'Kol B',
  title: 'Yeni gelenler',
  strategy: 'new_arrivals',
  eligibilityFlags: { isActive: false, liveCartRequired: false },
};
const CART_ARM: RecommendationWidgetSummary = {
  ...ARM_STRIP,
  title: 'Kargo bedavaya tamamla',
  strategy: 'free_shipping_complement',
  eligibilityFlags: { isActive: false, liveCartRequired: true },
};

type Assignments = Record<string, unknown>;

function swapArm(moduleData: RecommendationWidgetSummary, extra?: Record<string, unknown>): Assignments {
  return {
    'exp-1': {
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
      ...(extra ?? {}),
    },
  };
}

function overrideArm(config: unknown, extra?: Record<string, unknown>): Assignments {
  return {
    'exp-2': {
      experimentId: 'exp-2',
      variantId: 'arm-title',
      experimentMode: 'config_override',
      targetType: 'recommendation',
      targetId: 'best-1',
      controlTargetId: 'best-1',
      effectiveTargetId: 'best-1',
      excludedTargetIds: [],
      config,
      ...(extra ?? {}),
    },
  };
}

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}

let assignments: Assignments = {};
let listed: RecommendationWidgetSummary[] = [BEST, OTHER];
let answers: Record<string, unknown> = {};
let calls: Call[] = [];

function installFetch() {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    const body = init && init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url: href, body });
    let payload: unknown = {};
    if (href.includes('/experiments/assign')) {
      payload = assignments;
    } else if (href.includes('/products')) {
      const id = href.split('/recommendations/')[1]!.split('/')[0]!;
      payload = answers[id] || { products: [] };
    } else if (href.includes('/recommendations')) {
      payload = { widgets: listed, reasonCodes: [], eligibilityFlags: {} };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

const productCalls = (id: string) => calls.filter((call) => call.url.includes('/recommendations/' + id + '/products'));
const widgetListCalls = () =>
  calls.filter((call) => /\/recommendations(\?|$)/.test(call.url) && !call.url.includes('/products'));
const experimentPosts = () => calls.filter((call) => call.url.includes('/public/experiments/track')).map((call) => call.body);
const exposures = () => experimentPosts().filter((body) => (body as { eventType?: string }).eventType === 'exposure');
/** A tap on a tested strip is the arm's click goal (`eventType: 'click'`). */
const experimentClicks = () => experimentPosts().filter((body) => (body as { eventType?: string }).eventType === 'click');
const events = () =>
  calls
    .filter((call) => call.url.includes('/events/batch'))
    .flatMap((call) => (call.body as { events: Array<{ name: string; entityId: string }> }).events);
const product = (code: string): SelwiseProduct =>
  ({ id: code, itemCode: code, title: code, price: 400, currency: 'TRY' }) as SelwiseProduct;
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const live: Selwise[] = [];
async function setup(): Promise<Selwise> {
  installFetch();
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
  });
  return selwise;
}

beforeEach(() => {
  assignments = {};
  listed = [BEST, OTHER];
  answers = {};
});

afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('filterByPlacement', () => {
  const WIDGETS = [
    { id: 'w-1', name: 'PDP — Benzer Ürünler', strategy: 'similar_products' },
    { id: 'w-2', name: 'PDP — Birlikte Alınanlar', strategy: 'bought_together' },
    { id: 'w-3', name: 'Ana Sayfa — Çok Satanlar', strategy: 'bestsellers' },
  ];

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
  // The first end-to-end run of the plugin sent `productItemCode` and got a
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
      limit: 8,
    });
  });

  it('tolerates nothing at all', () => {
    expect(normalizeContext(undefined)).toEqual({});
    expect(normalizeContext('nope')).toEqual({});
  });
});

describe('StripService on a fake client', () => {
  const WIDGETS = [
    { id: 'w-1', name: 'PDP — Benzer Ürünler', strategy: 'similar_products' },
    { id: 'w-2', name: 'PDP — Birlikte Alınanlar', strategy: 'bought_together' },
    { id: 'w-3', name: 'Ana Sayfa — Çok Satanlar', strategy: 'bestsellers' },
  ];

  function fakeClient(overrides?: Partial<StripClient>): StripClient {
    return {
      getRecommendationWidgets: async () => WIDGETS,
      resolveRecommendationWidget: async (widget) => ({
        widgetId: typeof widget === 'string' ? widget : widget.id,
        sourceWidgetId: typeof widget === 'string' ? widget : widget.id,
        widget: typeof widget === 'string' ? null : widget,
        experiment: null,
        hidden: false,
      }),
      getRecommendationProducts: async (widgetId) => ({
        widgetId,
        products: [product('KM1'), product('KM2')],
        productCard: null,
        meta: null,
      }),
      trackRecommendationImpression: () => undefined,
      trackRecommendationClick: () => undefined,
      trackRecommendationAddToCart: () => undefined,
      trackRecommendationAddAll: () => undefined,
      track: () => undefined,
      recommendationCapBlock: () => null,
      recordRecommendationShown: async () => undefined,
      getCart: () => ({ known: false, total: 0, itemCount: 0 }),
      onCartChange: () => () => undefined,
      getLocale: () => undefined,
      ...(overrides ?? {}),
    };
  }

  it('asks the server for the screen its address', async () => {
    let askedFor: string | undefined;
    const service = new StripService(
      fakeClient({
        getRecommendationWidgets: async (pageUrl) => {
          askedFor = pageUrl;
          return WIDGETS;
        },
      })
    );

    await service.widgets('app://product');
    expect(askedFor).toBe('app://product');
  });

  it('applies the configured placement for that screen', async () => {
    const service = new StripService(fakeClient());
    service.setPlacements({ 'app://product': ['w-2'] });

    const widgets = await service.widgets('app://product');
    expect(widgets.map((widget) => widget.id)).toEqual(['w-2']);
  });

  it('drops widgets that returned no products, so no screen renders an empty strip', async () => {
    const service = new StripService(
      fakeClient({
        getRecommendationProducts: async (widgetId) => ({
          widgetId,
          products: widgetId === 'w-2' ? [product('KM1')] : [],
        }),
      })
    );

    const strips = await service.strips('app://product', {});
    expect(strips.map((strip) => strip.widget.id)).toEqual(['w-2']);
  });

  // A screen must render whatever else it has when Selwise is unreachable.
  it('resolves to empty when the network fails instead of rejecting', async () => {
    const service = new StripService(
      fakeClient({
        getRecommendationWidgets: async () => {
          throw new Error('offline');
        },
      })
    );

    await expect(service.widgets('app://home')).resolves.toEqual([]);
  });

  it('says where a failure was, though it never throws', async () => {
    const said: string[] = [];
    const service = new StripService(
      fakeClient({
        getRecommendationWidgets: async () => {
          throw new Error('offline');
        },
      }),
      (message) => said.push(message)
    );

    await service.widgets('app://home');
    expect(said).toEqual(['recommendation getWidgets(app://home) failed']);
  });

  it('sends only real item codes on an impression', () => {
    const sent: Array<{ widgetId: string; codes: string[] | undefined }> = [];
    const service = new StripService(
      fakeClient({ trackRecommendationImpression: (widgetId, codes) => sent.push({ widgetId, codes }) })
    );

    service.trackImpression('w-1', [{ itemCode: 'KM1' }, { code: 'KM2' }, {}]);

    expect(sent).toEqual([{ widgetId: 'w-1', codes: ['KM1', 'KM2'] }]);
  });

  it('forwards the basis the caller counted on, so the dashboard can tell visibility from a draw', () => {
    const sent: Array<{ options: unknown }> = [];
    const service = new StripService(
      fakeClient({ trackRecommendationImpression: (_widgetId, _codes, options) => sent.push({ options }) })
    );

    service.trackImpression('w-1', [{ itemCode: 'KM1' }], { basis: 'visible' });

    expect(sent).toEqual([{ options: { basis: 'visible' } }]);
  });

  it('reports nothing for a strip or a product it was not given', () => {
    const sent: unknown[] = [];
    const service = new StripService(
      fakeClient({
        trackRecommendationImpression: (...args) => sent.push(args),
        trackRecommendationClick: (...args) => sent.push(args),
      })
    );
    service.trackImpression('', [{ itemCode: 'KM1' }]);
    service.trackClick('w-1', '', 0);
    expect(sent).toEqual([]);
  });
});

describe('a screen shared between its points', () => {
  it('asks the list once for every point, and the products of a strip once', async () => {
    const selwise = await setup();
    answers['best-1'] = { products: [product('B1')] };
    answers['other-1'] = { products: [product('S1')] };

    const [first, second] = await Promise.all([
      selwise.strips.strips('app://product', { currentProductId: 'KM1' }),
      selwise.strips.strips('app://product', { currentProductId: 'KM1' }),
    ]);

    expect(widgetListCalls()).toHaveLength(1);
    expect(productCalls('best-1')).toHaveLength(1);
    expect(productCalls('other-1')).toHaveLength(1);
    expect(first.map((strip) => strip.widget.id)).toEqual(second.map((strip) => strip.widget.id));
  });

  it('asks for the products of the strips a point wants and no other', async () => {
    const selwise = await setup();
    answers['best-1'] = { products: [product('B1')] };
    answers['other-1'] = { products: [product('S1')] };

    const strips = await selwise.strips.strips('app://product', {}, { only: (entry) => entry.listed.id === 'other-1' });

    expect(strips.map((strip) => strip.widget.id)).toEqual(['other-1']);
    expect(productCalls('best-1')).toHaveLength(0);
    // The list is the screen's: another point asking for its strip does not ask it again.
    await selwise.strips.strips('app://product', {}, { only: (entry) => entry.listed.id === 'best-1' });
    expect(widgetListCalls()).toHaveLength(1);
    expect(productCalls('best-1')).toHaveLength(1);
  });

  it('asks again for another product on the same screen, and again once the share has expired', async () => {
    jest.useFakeTimers();
    const selwise = await setup();
    answers['best-1'] = { products: [product('B1')] };

    await selwise.strips.strips('app://product', { currentProductId: 'A' });
    await selwise.strips.strips('app://product', { currentProductId: 'B' });
    expect(productCalls('best-1')).toHaveLength(2);

    jest.setSystemTime(Date.now() + SHARED_LOAD_MS + 1);
    await selwise.strips.strips('app://product', { currentProductId: 'B' });
    expect(productCalls('best-1')).toHaveLength(3);
    expect(widgetListCalls()).toHaveLength(2);
  });

  it('asks the list again in another language', async () => {
    const selwise = await setup();
    answers['best-1'] = { products: [product('B1')] };

    await selwise.strips.strips('app://home', {});
    selwise.setLocale('en');
    await selwise.strips.strips('app://home', {});

    expect(widgetListCalls()).toHaveLength(2);
  });
});

describe('strips with followCart', () => {
  it('hands a cart strip over unasked, and asks every other strip as before', async () => {
    listed = [STRIP, BEST];
    const selwise = await setup();
    answers['best-1'] = { products: [product('X')] };

    const strips = await selwise.strips.strips('app://basket', {}, { followCart: true });

    expect(strips.map((strip) => [strip.widget.id, strip.products.length, strip.followsCart === true])).toEqual([
      ['strip-1', 0, true],
      ['best-1', 1, false],
    ]);
    expect(productCalls('strip-1')).toHaveLength(0);
  });

  it('without it, leaves an unanswered cart strip out, as it always did', async () => {
    listed = [STRIP, BEST];
    const selwise = await setup();
    answers['best-1'] = { products: [product('X')] };

    const strips = await selwise.strips.strips('app://basket', {});

    expect(strips.map((strip) => strip.widget.id)).toEqual(['best-1']);
  });
});

describe('follow', () => {
  it('follows the basket: in place, one impression per appearance, gone past the threshold', async () => {
    jest.useFakeTimers();
    listed = [STRIP, BEST];
    const selwise = await setup();
    const [strip] = await selwise.strips.strips('app://basket', {}, { followCart: true });
    const shown: Strip[] = [];
    const ledger = createImpressionLedger();
    const impressions: string[][] = [];
    // What `RecommendationStrip` does with each strip it is handed: every
    // card on screen, through the ledger.
    const draw = (next: Strip) => {
      shown.push(next);
      const fresh = impressionBatch(ledger, next.products, next);
      if (fresh.length > 0) impressions.push(fresh.map((p) => p.itemCode));
    };
    const last = () => shown[shown.length - 1]!;

    // Mounted before the app's basket is known: asked once, nothing to show.
    answers['strip-1'] = { products: [], liveCartRequired: true, meta: { reason: 'cart_not_measured' } };
    const stop = selwise.strips.follow(strip!, { sku: 'KM1' }, draw);
    await settle();
    expect(productCalls('strip-1')).toHaveLength(1);
    expect(productCalls('strip-1')[0]!.body).not.toHaveProperty('cart');
    // The item-code aliases are translated here too.
    expect(productCalls('strip-1')[0]!.body!.currentProductId).toBe('KM1');
    expect(last().products).toEqual([]);

    // The basket arrives — a burst of three changes is one question.
    answers['strip-1'] = { products: [product('A'), product('B')], liveCartRequired: true };
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055', 'KM1'] });
    selwise.setCart({ total: 449.5, itemCount: 3, currency: 'TRY', codes: ['4055', 'KM1'] });
    selwise.setCart({ total: 598, itemCount: 4, currency: 'TRY', codes: ['4055', 'KM1'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(productCalls('strip-1')).toHaveLength(2);
    expect(productCalls('strip-1')[1]!.body!.cart).toEqual({
      known: true,
      total: 598,
      currency: 'TRY',
      codes: ['4055', 'KM1'],
    });
    expect(last().products.map((p) => p.itemCode)).toEqual(['A', 'B']);
    expect(impressions).toEqual([['A', 'B']]);

    // Swapped in place: new cards, the same display, no second impression.
    answers['strip-1'] = { products: [product('C')], liveCartRequired: true };
    selwise.setCart({ total: 649, itemCount: 5, currency: 'TRY', codes: ['4055', 'KM1', '4060'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(last().products.map((p) => p.itemCode)).toEqual(['C']);
    expect(impressions).toHaveLength(1);

    // Past the threshold: nothing to show.
    answers['strip-1'] = { products: [], liveCartRequired: true, meta: { reason: 'threshold_reached' } };
    selwise.setCart({ total: 1047, itemCount: 6, currency: 'TRY', codes: ['4055', 'KM1', '4060'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(last().products).toEqual([]);

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
    expect(last().products).toEqual([]);

    // Unmounted: the basket no longer reaches it.
    stop();
    selwise.setCart({ total: 100, itemCount: 1, currency: 'TRY' });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(productCalls('strip-1')).toHaveLength(asked);
  });
});

describe('strips in a different_module experiment', () => {
  it('hands over the arm’s strip in the control’s slot — its id, its heading, its products', async () => {
    assignments = swapArm(ARM_STRIP);
    answers['strip-arm'] = { products: [product('N1'), product('N2')] };
    answers['other-1'] = { products: [product('S1')] };
    const selwise = await setup();

    const strips = await selwise.strips.strips('app://product', {});

    expect(strips.map((strip) => strip.widget.id)).toEqual(['strip-arm', 'other-1']);
    expect(stripHeading(strips[0]!.widget)).toBe('Yeni gelenler');
    expect(strips[0]!.products.map((p) => p.itemCode)).toEqual(['N1', 'N2']);
    expect(strips[0]!.experiment).toEqual({ experimentId: 'exp-1', variantId: 'arm-b' });
    expect(strips[1]).not.toHaveProperty('experiment');
    expect(productCalls('best-1')).toHaveLength(0);
  });

  it('carries the LISTED widget on every strip, so the arm keeps the control’s slot', async () => {
    assignments = swapArm(ARM_STRIP);
    answers['strip-arm'] = { products: [product('N1')] };
    answers['other-1'] = { products: [product('S1')] };
    const selwise = await setup();

    const strips = await selwise.strips.strips('app://product', {});

    // The arm's strip stands in the control's place: `listed` is the control.
    expect(strips.map((strip) => [strip.widget.id, strip.listed.id])).toEqual([
      ['strip-arm', 'best-1'],
      ['other-1', 'other-1'],
    ]);
  });

  it('matches the placement config against the LISTED widget, by the name the merchant knows', async () => {
    assignments = swapArm(ARM_STRIP);
    answers['strip-arm'] = { products: [product('N1')] };
    const selwise = await setup();
    selwise.strips.setPlacements({ 'app://product': ['PDP — Çok satanlar'] });

    const strips = await selwise.strips.strips('app://product', {});

    expect(strips.map((strip) => strip.widget.id)).toEqual(['strip-arm']);
  });

  it('reports the strip drawn, with the arm’s exposure once', async () => {
    assignments = swapArm(ARM_STRIP);
    answers['strip-arm'] = { products: [product('N1'), product('N2')] };
    const selwise = await setup();
    const [strip] = await selwise.strips.strips('app://product', {});

    // What `RecommendationStrip` does: the visible cards through the ledger,
    // reported under `strip.widget.id`; a tap reported the same way.
    const ledger = createImpressionLedger();
    selwise.strips.trackImpression(strip!.widget.id, impressionBatch(ledger, [strip!.products[0]], strip));
    selwise.strips.trackImpression(strip!.widget.id, impressionBatch(ledger, strip!.products, strip));
    selwise.strips.trackClick(strip!.widget.id, 'N2', 1);
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
    // The tap is also the arm's click goal.
    expect(experimentClicks()).toEqual([
      expect.objectContaining({ experimentId: 'exp-1', variantId: 'arm-b', eventType: 'click' }),
    ]);
  });

  it('leaves the slot out when the visitor’s arm draws nothing there', async () => {
    assignments = overrideArm(null, { variantId: 'arm-holdout', holdout: true });
    answers['other-1'] = { products: [product('S1')] };
    const selwise = await setup();

    const strips = await selwise.strips.strips('app://product', {});

    expect(strips.map((strip) => strip.widget.id)).toEqual(['other-1']);
    expect(productCalls('best-1')).toHaveLength(0);
  });
});

describe('strips in a config_override experiment', () => {
  it('draws the listed strip under the arm’s heading', async () => {
    assignments = overrideArm({ content: { title: 'Sizin için seçtiklerimiz' } });
    answers['best-1'] = { products: [product('B1')] };
    const selwise = await setup();

    const strips = await selwise.strips.strips('app://product', {});

    expect(strips[0]!.widget.id).toBe('best-1');
    expect(strips[0]!.widget.name).toBe('PDP — Çok satanlar');
    expect(stripHeading(strips[0]!.widget)).toBe('Sizin için seçtiklerimiz');
    expect(strips[0]!.experiment).toEqual({ experimentId: 'exp-2', variantId: 'arm-title' });
  });
});

describe('an arm that swaps in a strip which answers the basket', () => {
  it('is followed: handed over unasked, then asked for the arm’s strip with the basket, in place', async () => {
    jest.useFakeTimers();
    assignments = swapArm(CART_ARM, { liveCartRequired: true });
    answers['other-1'] = { products: [product('S1')] };
    const selwise = await setup();

    const strips = await selwise.strips.strips('app://basket', {}, { followCart: true });
    expect(strips.map((strip) => [strip.widget.id, strip.products.length, strip.followsCart === true])).toEqual([
      ['strip-arm', 0, true],
      ['other-1', 1, false],
    ]);
    expect(productCalls('strip-arm')).toHaveLength(0);

    const shown: Strip[] = [];
    answers['strip-arm'] = { products: [], liveCartRequired: true };
    const stop = selwise.strips.follow(strips[0]!, {}, (next) => shown.push(next));
    await settle();
    expect(productCalls('strip-arm')).toHaveLength(1);
    expect(shown[shown.length - 1]!.products).toEqual([]);

    answers['strip-arm'] = { products: [product('K1')], liveCartRequired: true };
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();

    expect(productCalls('strip-arm')).toHaveLength(2);
    expect((productCalls('strip-arm')[1]!.body!.cart as { total: number }).total).toBe(349.5);
    expect(productCalls('best-1')).toHaveLength(0);
    const last = shown[shown.length - 1]!;
    expect(last.widget.id).toBe('strip-arm');
    expect(stripHeading(last.widget)).toBe('Kargo bedavaya tamamla');
    expect(last.products.map((p) => p.itemCode)).toEqual(['K1']);
    expect(last.experiment).toEqual({ experimentId: 'exp-1', variantId: 'arm-b' });
    stop();
  });
});

describe('a strip’s frequency cap', () => {
  const CAPPED = {
    id: 'w-cap',
    name: 'Sınırlı',
    strategy: 'bestsellers',
    triggerConfig: { frequencyCap: { perSession: 1, perDay: 'bogus', minInterval: '30m', unknown: 5 } },
  };
  const client = (blocked: string | null, shown: string[] = []) =>
    ({
      getRecommendationWidgets: async () => [CAPPED],
      resolveRecommendationWidget: async (widget: RecommendationWidgetSummary) => ({
        widgetId: widget.id,
        sourceWidgetId: widget.id,
        widget,
        experiment: null,
        hidden: false,
      }),
      getRecommendationProducts: async (widgetId: string) => ({ widgetId, products: [product('KM1')], productCard: null, meta: null }),
      trackRecommendationImpression: () => undefined,
      trackRecommendationClick: () => undefined,
      trackRecommendationAddToCart: () => undefined,
      trackRecommendationAddAll: () => undefined,
      recommendationCapBlock: () => blocked,
      recordRecommendationShown: async (id: string) => {
        shown.push(id);
      },
      getCart: () => ({ known: false, total: 0, itemCount: 0 }),
      onCartChange: () => () => undefined,
      getLocale: () => undefined,
    }) as unknown as StripClient;

  it('reads only the keys the ledger enforces', () => {
    expect(stripFrequencyCap(CAPPED as RecommendationWidgetSummary)).toEqual({ perSession: 1, minInterval: '30m' });
    expect(stripFrequencyCap({ id: 'x' })).toBeNull();
  });

  it('draws a strip under its cap and keeps one over it away, asking for nothing', async () => {
    const asked: string[] = [];
    const open = new StripService(client(null));
    const strips = await open.strips('app://home');
    expect(strips).toHaveLength(1);
    expect(strips[0]!.frequencyCap).toEqual({ perSession: 1, minInterval: '30m' });

    const base = client('perSession');
    const closed = new StripService({
      ...base,
      getRecommendationProducts: async (id: string) => {
        asked.push(id);
        return { widgetId: id, products: [product('KM1')], productCard: null, meta: null };
      },
    } as StripClient);
    expect(await closed.strips('app://home')).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('spends the allowance of a capped strip that was shown, and of no other', async () => {
    const shown: string[] = [];
    const service = new StripService(client(null, shown));
    const [capped] = await service.strips('app://home');
    service.recordShown(capped!);
    service.recordShown({ widget: { id: 'free' }, frequencyCap: null });
    await Promise.resolve();
    expect(shown).toEqual(['w-cap']);
  });
});
