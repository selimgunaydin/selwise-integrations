import { Selwise } from '../client.js';
import { MemoryStorage } from './storage.js';
import {
  CART_REFRESH_DEBOUNCE_MS,
  RecommendationWidgetLoader,
  type RecommendationWidgetState,
} from './recommendation-widget.js';

/**
 * What `useRecommendationWidget` renders, with the real SDK client and a
 * captured `fetch`: a "complete to free shipping" strip follows the basket the
 * host reports with `setCart` — debounced, in place, empty once there is
 * nothing to complete — and every other strip is asked once.
 */

interface FetchCall {
  url: string;
  body: any;
}

let answers: Record<string, unknown> = {};

function installFetch() {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: any) => {
    const call = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const body = call.url.includes('/products') ? answers[call.url.split('/recommendations/')[1]!.split('/')[0]!] : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(body ?? {}) } as unknown as Response;
  });
  return calls;
}

const product = (code: string) => ({ itemCode: code, title: code, price: 400 });
const live: Selwise[] = [];

async function client() {
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
  });
  return selwise;
}

/**
 * Let the request promise chain run (fake timers do not touch microtasks).
 * A ceiling, not a count: the chain before the request grows whenever the SDK
 * awaits something more first (the visitor's experiment arms, the screen's
 * audience), and 10 rounds had no headroom left.
 */
const settle = async () => {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
};

function loaderFor(selwise: Selwise, widgetId: string) {
  const states: RecommendationWidgetState[] = [];
  const loader = new RecommendationWidgetLoader(selwise, widgetId, {}, (state) => states.push(state));
  return { loader, states, last: () => states[states.length - 1]! };
}

const productCalls = (calls: FetchCall[]) => calls.filter((call) => call.url.includes('/products'));

beforeEach(() => {
  jest.useFakeTimers();
  answers = {};
});

afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('RecommendationWidgetLoader — a strip that answers the basket', () => {
  it('re-asks on a basket change, debounced, without loading, and empties past the threshold', async () => {
    const calls = installFetch();
    const selwise = await client();
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055'] });
    answers['strip-1'] = { products: [product('A'), product('B')], liveCartRequired: true };

    const { loader, states, last } = loaderFor(selwise, 'strip-1');
    loader.load();
    await settle();
    expect(last()).toMatchObject({ followsCart: true, loading: false });
    expect(last().products.map((p) => p.itemCode)).toEqual(['A', 'B']);
    expect(productCalls(calls)).toHaveLength(1);

    // A quantity stepper: three changes, one question.
    answers['strip-1'] = { products: [product('C')], liveCartRequired: true };
    selwise.setCart({ total: 449.5, itemCount: 3, currency: 'TRY', codes: ['4055', '4056'] });
    selwise.setCart({ total: 549.5, itemCount: 4, currency: 'TRY', codes: ['4055', '4056'] });
    selwise.setCart({ total: 598, itemCount: 4, currency: 'TRY', codes: ['4055', '4056'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS - 1);
    expect(productCalls(calls)).toHaveLength(1);
    const before = states.length;
    jest.advanceTimersByTime(1);
    await settle();

    expect(productCalls(calls)).toHaveLength(2);
    expect(productCalls(calls)[1]!.body.cart).toEqual({
      known: true,
      total: 598,
      currency: 'TRY',
      codes: ['4055', '4056'],
    });
    // In place: the strip never went to `loading`, so it was never unmounted.
    expect(states.slice(before).every((state) => state.loading === false)).toBe(true);
    expect(last().products.map((p) => p.itemCode)).toEqual(['C']);

    // Over the threshold: the server has nothing, and the strip shows nothing.
    answers['strip-1'] = { products: [], liveCartRequired: true, meta: { reason: 'threshold_reached' } };
    selwise.setCart({ total: 1047, itemCount: 5, currency: 'TRY', codes: ['4055', '4056', '4057'] });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(last().products).toEqual([]);

    loader.stop();
  });

  it('is not asked about a basket nobody measures any more', async () => {
    const calls = installFetch();
    const selwise = await client();
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY' });
    answers['strip-1'] = { products: [product('A')], liveCartRequired: true };

    const { loader, last } = loaderFor(selwise, 'strip-1');
    loader.load();
    await settle();

    selwise.setCart(null);
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();

    expect(productCalls(calls)).toHaveLength(1);
    expect(last().products).toEqual([]);
    loader.stop();
  });

  it('is drawn when a measurement first arrives after an empty first answer', async () => {
    const calls = installFetch();
    const selwise = await client();
    // Launch: the basket is not measured yet, so the strip has nothing to say.
    answers['strip-1'] = { products: [], liveCartRequired: true, meta: { reason: 'cart_not_measured' } };

    const { loader, last } = loaderFor(selwise, 'strip-1');
    loader.load();
    await settle();
    expect(last()).toMatchObject({ products: [], followsCart: true });
    expect(productCalls(calls)[0]!.body).not.toHaveProperty('cart');

    answers['strip-1'] = { products: [product('A')], liveCartRequired: true };
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY' });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(last().products.map((p) => p.itemCode)).toEqual(['A']);
    loader.stop();
  });

  it('stops following once stopped (unmount)', async () => {
    const calls = installFetch();
    const selwise = await client();
    selwise.setCart({ total: 100, itemCount: 1 });
    answers['strip-1'] = { products: [product('A')], liveCartRequired: true };
    const { loader } = loaderFor(selwise, 'strip-1');
    loader.load();
    await settle();
    loader.stop();

    selwise.setCart({ total: 200, itemCount: 2 });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(productCalls(calls)).toHaveLength(1);
  });
});

describe('RecommendationWidgetLoader — appearances and impressions', () => {
  /**
   * The rule both the hook and the App Maker strips reset their impression on:
   * a swap in place is the same display; a strip that emptied (the basket
   * passed the threshold) and was brought back by the basket is a new one.
   */
  it('keeps the appearance across a swap in place, and counts a new one after the strip emptied', async () => {
    installFetch();
    const selwise = await client();
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY' });
    answers['strip-1'] = { products: [product('A')], liveCartRequired: true };
    const { loader, last } = loaderFor(selwise, 'strip-1');
    loader.load();
    await settle();
    expect(last().appearance).toBe(1);

    // Swapped in place: the same display.
    answers['strip-1'] = { products: [product('B')], liveCartRequired: true };
    selwise.setCart({ total: 449.5, itemCount: 3, currency: 'TRY' });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(last().products.map((p) => p.itemCode)).toEqual(['B']);
    expect(last().appearance).toBe(1);

    // Past the threshold: gone.
    answers['strip-1'] = { products: [], liveCartRequired: true };
    selwise.setCart({ total: 1047, itemCount: 5, currency: 'TRY' });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(last().products).toEqual([]);
    expect(last().appearance).toBe(1);

    // A line removed, under the threshold again: back on screen — a new display.
    answers['strip-1'] = { products: [product('C')], liveCartRequired: true };
    selwise.setCart({ total: 598, itemCount: 4, currency: 'TRY' });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(last().appearance).toBe(2);
    loader.stop();
  });

  it('asks again for a basket set while the first question was in flight', async () => {
    const calls = installFetch();
    const selwise = await client();
    answers['strip-1'] = { products: [], liveCartRequired: true, meta: { reason: 'cart_not_measured' } };
    const { loader, last } = loaderFor(selwise, 'strip-1');
    loader.load();
    // The app's basket arrives before the strip's first answer does.
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY' });
    answers['strip-1'] = { products: [product('A')], liveCartRequired: true };
    await settle();
    expect(productCalls(calls)).toHaveLength(1);

    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(productCalls(calls)).toHaveLength(2);
    expect(productCalls(calls)[1]!.body.cart.total).toBe(349.5);
    expect(last().products.map((p) => p.itemCode)).toEqual(['A']);
    loader.stop();
  });
});

describe('RecommendationWidgetLoader — every other strip', () => {
  it('is asked once, and a basket change does not touch it', async () => {
    const calls = installFetch();
    const selwise = await client();
    answers['best-1'] = { products: [product('A')], liveCartRequired: false };
    const { loader, states, last } = loaderFor(selwise, 'best-1');
    loader.load();
    expect(states[0]!.loading).toBe(true);
    await settle();
    expect(last()).toMatchObject({ followsCart: false, loading: false });

    selwise.setCart({ total: 100, itemCount: 1 });
    jest.advanceTimersByTime(CART_REFRESH_DEBOUNCE_MS);
    await settle();
    expect(productCalls(calls)).toHaveLength(1);
    expect(productCalls(calls)[0]!.body).not.toHaveProperty('cart');
    loader.stop();
  });

  it('falls back to the widget list when an older API does not say', async () => {
    const calls = installFetch();
    const selwise = await client();
    (globalThis as any).fetch = jest.fn(async (url: unknown) => {
      const href = String(url);
      calls.push({ url: href, body: null });
      const body = href.includes('/products')
        ? { products: [product('A')] }
        : { widgets: [{ id: 'strip-1', eligibilityFlags: { liveCartRequired: true } }] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
    });
    await selwise.getRecommendationWidgets();

    const result = await selwise.getRecommendationProducts('strip-1');
    expect(result.liveCartRequired).toBe(true);
  });
});
