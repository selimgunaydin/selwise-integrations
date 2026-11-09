import { Selwise } from './client.js';
import { CartStore, normalizeCartCodes } from './core/cart.js';
import { MemoryStorage } from './core/storage.js';

/**
 * A "complete to free shipping" strip (`free_shipping_complement`) answers the
 * basket the host MEASURED with `setCart`. The SDK sends it with that strip's
 * products request — and only a measured one.
 */

interface FetchCall {
  url: string;
  init: RequestInit;
}

function installFetch(widgets: unknown[] = []) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    const body = call.url.includes('/products')
      ? { products: [] }
      : call.url.includes('/recommendations')
        ? { widgets, reasonCodes: [], eligibilityFlags: {} }
        : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

const live: Selwise[] = [];

async function init() {
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

const productsBody = (calls: FetchCall[]) =>
  JSON.parse(String(calls.filter((call) => call.url.includes('/products')).slice(-1)[0]?.init.body));

describe('CartStore line codes', () => {
  it('keeps the measured basket’s codes, replaced by the next basket and gone with an unknown one', () => {
    const store = new CartStore();
    store.set({ total: 349.5, itemCount: 2, codes: ['4055', 4056, ' 4055 ', ''] });
    expect(store.getCodes()).toEqual(['4055', '4056']);
    store.set({ total: 349.5, itemCount: 2 });
    expect(store.getCodes()).toEqual([]);
    store.set({ total: 349.5, itemCount: 2, codes: ['A'] });
    store.set(null);
    expect(store.getCodes()).toEqual([]);
  });

  it('caps and cleans what a host hands over', () => {
    expect(normalizeCartCodes(Array.from({ length: 150 }, (_, i) => `c${i}`))).toHaveLength(100);
    expect(normalizeCartCodes('A')).toEqual([]);
  });
});

describe('Selwise.getRecommendationProducts — the cart', () => {
  afterEach(async () => {
    await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  it('sends the measured basket with a strip that reads it', async () => {
    const calls = installFetch([
      { id: 'strip-1', strategy: 'free_shipping_complement', eligibilityFlags: { liveCartRequired: true } },
    ]);
    const selwise = await init();
    await selwise.getRecommendationWidgets();
    selwise.setCart({ total: 349.5, itemCount: 2, currency: 'TRY', codes: ['4055'] });

    await selwise.getRecommendationProducts('strip-1');

    expect(productsBody(calls).cart).toEqual({ known: true, total: 349.5, currency: 'TRY', codes: ['4055'] });
  });

  it('sends no cart before the host measured one — the strip is then empty, not wrong', async () => {
    const calls = installFetch();
    const selwise = await init();
    await selwise.getRecommendationProducts('strip-1');
    expect(productsBody(calls)).not.toHaveProperty('cart');
  });

  it('keeps the basket off every strip whose strategy does not read it', async () => {
    const calls = installFetch([
      { id: 'best-1', strategy: 'bestsellers', eligibilityFlags: { liveCartRequired: false } },
    ]);
    const selwise = await init();
    await selwise.getRecommendationWidgets();
    selwise.setCart({ total: 349.5, itemCount: 2 });
    await selwise.getRecommendationProducts('best-1');
    expect(productsBody(calls)).not.toHaveProperty('cart');
  });

  it('lets the host pass its own basket, or none', async () => {
    const calls = installFetch();
    const selwise = await init();
    selwise.setCart({ total: 100, itemCount: 1 });
    await selwise.getRecommendationProducts('strip-1', {
      cart: { known: true, total: 500, currency: 'TRY', codes: ['X'] },
    });
    expect(productsBody(calls).cart).toEqual({ known: true, total: 500, currency: 'TRY', codes: ['X'] });

    await selwise.getRecommendationProducts('strip-1', { cart: null });
    expect(productsBody(calls)).not.toHaveProperty('cart');
  });
});
