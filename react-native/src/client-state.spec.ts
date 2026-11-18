import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * What the components draw from: the screen, the product, the theme, the
 * consent answer and the language, with a subscription for each — so a host sets
 * them once and the components follow, instead of each host wiring its own.
 */

interface Call {
  url: string;
  body: unknown;
}

let calls: Call[] = [];
let config: Record<string, unknown> = {};
let searchConfig: Record<string, unknown> = {};

function installFetch() {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    calls.push({ url: href, body: init && init.body ? JSON.parse(String(init.body)) : null });
    let payload: unknown = {};
    if (href.includes('/search-config')) payload = searchConfig;
    else if (href.includes('/config')) payload = config;
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

const live: Selwise[] = [];
function create(): Selwise {
  const selwise = new Selwise();
  live.push(selwise);
  return selwise;
}

async function init(selwise: Selwise, extra: Record<string, unknown> = {}) {
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
    ...extra,
  });
}

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

beforeEach(() => {
  config = {};
  searchConfig = {};
  installFetch();
});

afterEach(async () => {
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('the screen', () => {
  it('is known before init() resolves — the host names it as soon as the app does', () => {
    const selwise = create();
    expect(selwise.getScreen()).toEqual({ pageUrl: null, screenName: null, pageType: null });

    expect(() => selwise.setScreen('app://home', { screenName: 'HomePage', pageType: 'home' })).not.toThrow();

    expect(selwise.getScreen()).toEqual({ pageUrl: 'app://home', screenName: 'HomePage', pageType: 'home' });
  });

  it('tells a subscriber about a CHANGE, once, and stops when it unsubscribes', async () => {
    const selwise = create();
    await init(selwise);
    const seen: Array<string | null> = [];
    const stop = selwise.on('screen', (screen) => seen.push(screen.pageUrl));

    selwise.setScreen('app://home', { screenName: 'HomePage' });
    // The same screen again — a repeated navigation event — is not news.
    selwise.setScreen('app://home', { screenName: 'HomePage' });
    selwise.setScreen('app://product', { screenName: 'ProductDetail', pageType: 'product' });
    stop();
    selwise.setScreen('app://basket');

    expect(seen).toEqual(['app://home', 'app://product']);
  });

  it('is set by trackScreenView too, with what the host knows of the screen', async () => {
    const selwise = create();
    await init(selwise);

    selwise.trackScreenView('app://product', { screen: 'ProductDetail' }, { screenName: 'ProductDetail', pageType: 'product' });

    expect(selwise.getScreen()).toEqual({ pageUrl: 'app://product', screenName: 'ProductDetail', pageType: 'product' });
  });

  it('is not lost when a listener throws', async () => {
    const selwise = create();
    await init(selwise);
    const seen: string[] = [];
    selwise.on('screen', () => {
      throw new Error('broken subscriber');
    });
    selwise.on('screen', (screen) => seen.push(String(screen.pageUrl)));

    selwise.setScreen('app://home');

    expect(seen).toEqual(['app://home']);
  });
});

describe('the product on screen', () => {
  it('starts as none, and is reported when it changes — loaded, pending, swapped, gone', async () => {
    const selwise = create();
    await init(selwise);
    expect(selwise.getProduct()).toBeNull();
    const seen: unknown[] = [];
    selwise.on('product', (product) => seen.push(product));

    selwise.setProduct({ title: 'Ruj', price: 899 });
    selwise.setProduct({ title: 'Ruj', price: 899 }); // the same facts: no news
    selwise.setProduct({ pending: true });
    selwise.setProduct({ title: 'Allık', price: 450 });
    selwise.setProduct(null);

    expect(seen).toEqual([{ title: 'Ruj', price: 899 }, { pending: true }, { title: 'Allık', price: 450 }, null]);
    expect(selwise.getProduct()).toBeNull();
  });

  it('counts the same facts under another key as another product', async () => {
    const selwise = create();
    await init(selwise);
    const seen: unknown[] = [];
    selwise.on('product', (product) => seen.push(product));

    selwise.setProduct({ title: 'Ruj', price: 899 }, 'KM1|fetch-1');
    selwise.setProduct({ title: 'Ruj', price: 899 }, 'KM1|fetch-2');

    expect(seen).toHaveLength(2);
  });
});

describe('ready', () => {
  it('is announced when init() resolves and when destroy() runs', async () => {
    const selwise = create();
    const seen: boolean[] = [];
    selwise.on('ready', (ready) => seen.push(ready));
    expect(selwise.isInitialized).toBe(false);

    await init(selwise);
    await selwise.destroy();

    expect(seen).toEqual([true, false]);
  });
});

describe('the cart', () => {
  it('is subscribed to through on(), the same call as onCartChange', async () => {
    const selwise = create();
    await init(selwise);
    const seen: number[] = [];
    selwise.on('cart', (cart) => seen.push(cart.total));

    selwise.setCart({ total: 120, itemCount: 1, currency: 'TRY' });

    expect(seen).toEqual([120]);
  });
});

describe('the theme', () => {
  it('is announced when /config brings tokens, and not when it brings the same ones again', async () => {
    config = { theme: { '--selwise-brand': '#d3145a' } };
    const selwise = create();
    await init(selwise);
    const seen: Array<Record<string, string>> = [];
    selwise.on('theme', (theme) => seen.push(theme));

    await selwise.getSurfaces('app://home');
    await settle();
    selwise.invalidateSurfaces();
    await selwise.getSurfaces('app://home');

    expect(seen).toEqual([{ '--selwise-brand': '#d3145a' }]);
    expect(selwise.getTheme()).toEqual({ '--selwise-brand': '#d3145a' });
  });
});

describe('consent', () => {
  it('announces the answer when the host sets it', async () => {
    const selwise = create();
    await init(selwise);
    const seen: boolean[] = [];
    selwise.on('consent', (consent) => seen.push(consent.granted));

    await selwise.setConsent({ granted: false });
    await selwise.setConsent({ granted: true, categories: { analytics: true } });

    expect(seen).toEqual([false, true]);
  });

  // The dashboard's "ask for consent before tracking": until the app answers,
  // every event is held and every number stays at zero.
  it('says when the channel waits for the app to decide, and when it has been told', async () => {
    config = { tracking: { dataLayerConfig: { cookieConsent: { enabled: true, waitForConsent: true } } } };
    const selwise = create();
    await init(selwise);

    await expect(selwise.isConsentRequired()).resolves.toBe(true);
    expect(selwise.isAwaitingConsent()).toBe(true);

    await selwise.setConsent({ granted: true, categories: { analytics: true } });
    expect(selwise.isAwaitingConsent()).toBe(false);
    await expect(selwise.isConsentRequired()).resolves.toBe(true);
  });

  it('is not required for a channel whose policy lets silence stand for consent', async () => {
    config = { tracking: { dataLayerConfig: { cookieConsent: { enabled: true, waitForConsent: false } } } };
    const selwise = create();
    await init(selwise);

    await expect(selwise.isConsentRequired()).resolves.toBe(false);
    expect(selwise.isAwaitingConsent()).toBe(false);
  });
});

describe('the language', () => {
  it('is announced when it changes, and not when it is set to what it already is', async () => {
    const selwise = create();
    await init(selwise, { locale: 'tr' });
    const seen: Array<string | undefined> = [];
    selwise.on('locale', (locale) => seen.push(locale));

    selwise.setLocale('tr');
    selwise.setLocale('en');

    expect(seen).toEqual(['en']);
    expect(selwise.getLocale()).toBe('en');
  });

  it('reads the channel’s search behaviour again in the new language', async () => {
    searchConfig = { enabled: true, settings: { behavior: { minChars: 3, debounceMs: 120 } } };
    const selwise = create();
    await init(selwise, { locale: 'tr' });
    const searchConfigCalls = () => calls.filter((call) => call.url.includes('/search-config')).length;

    await expect(selwise.getSearchBehavior()).resolves.toMatchObject({ minChars: 3, debounceMs: 120 });
    await selwise.getSearchBehavior();
    expect(searchConfigCalls()).toBe(1);

    selwise.setLocale('en');
    searchConfig = { enabled: true, settings: { behavior: { minChars: 4, debounceMs: 200 } } };
    await expect(selwise.getSearchBehavior()).resolves.toMatchObject({ minChars: 4, debounceMs: 200 });
    expect(searchConfigCalls()).toBe(2);
  });
});
