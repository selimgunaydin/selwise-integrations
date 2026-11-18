import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';
import type { SelwiseProduct } from './types.js';

/**
 * The app's search: the settings as this visitor gets them, the empty box's
 * suggestions, the search and the events that report what the visitor did with
 * it. The client is the real one; only the network is faked.
 */

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}

let calls: Call[] = [];
let config: Record<string, unknown> = {};
let searchConfig: unknown = {};
let suggestionsBody: unknown = {};
let searchBody: Record<string, unknown> = { hits: [], total: 0 };
let assignments: Record<string, unknown> = {};
let segmentResults: Record<string, boolean> = {};
let failSearchConfig = false;

function installFetch() {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    calls.push({ url: href, body: init && init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
    let payload: unknown = {};
    if (href.includes('/search-config')) {
      if (failSearchConfig) throw new Error('offline');
      payload = searchConfig;
    } else if (href.includes('/search/suggestions')) payload = suggestionsBody;
    else if (/\/search\?/.test(href)) payload = searchBody;
    else if (href.includes('/experiments/assign')) payload = assignments;
    else if (href.includes('/segments/evaluate')) payload = { results: segmentResults };
    else if (href.includes('/config')) payload = config;
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

const live: Selwise[] = [];
async function start(extra: Record<string, unknown> = {}): Promise<Selwise> {
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
    ...extra,
  });
  return selwise;
}

const urlsOf = (part: string) => calls.filter((call) => call.url.includes(part)).map((call) => new URL(call.url));
const searchRequests = () => calls.filter((call) => /\/search\?/.test(call.url)).map((call) => new URL(call.url));
const eventsOf = async (selwise: Selwise, name?: string) => {
  await selwise.flush();
  return calls
    .filter((call) => call.url.includes('/events/batch'))
    .flatMap((call) => (call.body as { events: Array<Record<string, any>> }).events)
    .filter((event) => !name || event['name'] === name);
};
const exposures = () => calls.filter((call) => call.url.includes('/experiments/track'));

const product = (code: string, extra: Record<string, unknown> = {}): SelwiseProduct =>
  ({ id: code, itemCode: code, title: 'Ürün ' + code, price: 100, currency: 'TRY', ...extra }) as SelwiseProduct;

/** A search configuration as `/search-config` answers it, with the platform's words already filled in. */
function searchDocument(settings: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) {
  return { v: 2, enabled: true, mode: 'live', settings, audience: { mode: 'all', segmentIds: [] }, ...rest };
}

const ARM = (overrides: Record<string, unknown> = {}) => ({
  'exp-search': {
    experimentId: 'exp-search',
    variantId: 'arm-b',
    variantName: 'B',
    experimentMode: 'config_override',
    targetType: 'search_config',
    targetId: 'search',
    excludedTargetIds: [],
    config: { settings: { behavior: { maxResults: 20 }, results: { layout: 'compact' } } },
    ...overrides,
  },
});

beforeEach(() => {
  config = {};
  searchConfig = searchDocument({ behavior: { minChars: 2, debounceMs: 100, maxResults: 8, keepOpen: false } });
  suggestionsBody = {};
  searchBody = { hits: [], total: 0 };
  assignments = {};
  segmentResults = {};
  failSearchConfig = false;
  installFetch();
});

afterEach(async () => {
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('getSearchSettings', () => {
  it('is the document the dashboard saved, as a phone draws it, in the app’s language', async () => {
    searchConfig = searchDocument({
      results: { layout: 'grid' },
      texts: { empty: 'Sonuç bulunamadı' },
      devices: { mobile: { results: { layout: 'list' } } },
    });
    const selwise = await start({ locale: 'tr' });

    const settings = await selwise.getSearchSettings();

    expect(settings?.results.layout).toBe('list');
    expect(settings?.texts.empty).toBe('Sonuç bulunamadı');
    expect(urlsOf('/search-config')[0]!.searchParams.get('lang')).toBe('tr');
  });

  it('is read once per language, and again after the language changes', async () => {
    const selwise = await start({ locale: 'tr' });
    await selwise.getSearchSettings();
    await selwise.getSearchSettings();
    expect(urlsOf('/search-config')).toHaveLength(1);

    selwise.setLocale('en');
    await selwise.getSearchSettings();
    expect(urlsOf('/search-config')).toHaveLength(2);
    expect(urlsOf('/search-config')[1]!.searchParams.get('lang')).toBe('en');
  });

  it('is read again after the configuration is refreshed', async () => {
    const selwise = await start();
    await selwise.getSearchSettings();

    selwise.invalidateSurfaces();
    await selwise.getSearchSettings();

    expect(urlsOf('/search-config')).toHaveLength(2);
  });

  it('is null when the channel’s search is off, and says why', async () => {
    searchConfig = { enabled: false };
    const selwise = await start();

    expect(await selwise.getSearchSettings()).toBeNull();
    expect((await selwise.getSearchState()).state).toBe('off');
  });

  it('is null in test mode for a client that was not started with it', async () => {
    searchConfig = searchDocument({}, { mode: 'test' });
    const shopper = await start();
    expect((await shopper.getSearchState()).state).toBe('test');

    const tester = await start({ testMode: true });
    expect((await tester.getSearchState()).state).toBe('ready');
  });

  it('is null for a visitor outside the search’s audience', async () => {
    searchConfig = searchDocument({}, { audience: { mode: 'include', segmentIds: ['vip'] } });
    segmentResults = { vip: false };
    const outside = await start();
    expect((await outside.getSearchState()).state).toBe('off');

    segmentResults = { vip: true };
    const inside = await start();
    expect((await inside.getSearchState()).state).toBe('ready');
  });

  it('is not known, and asked again, when the configuration could not be read', async () => {
    failSearchConfig = true;
    const selwise = await start();
    expect((await selwise.getSearchState()).state).toBe('unknown');

    failSearchConfig = false;
    expect((await selwise.getSearchState()).state).toBe('ready');
  });

  it('keeps the hook’s behaviour numbers readable as before', async () => {
    const selwise = await start();
    await expect(selwise.getSearchBehavior()).resolves.toMatchObject({ minChars: 2, debounceMs: 100, maxResults: 8 });
  });
});

describe('search experiments', () => {
  it('lays the visitor’s arm over the settings', async () => {
    assignments = ARM();
    const selwise = await start();

    const settings = await selwise.getSearchSettings();

    expect(settings?.behavior.maxResults).toBe(20);
    expect(settings?.results.layout).toBe('compact');
  });

  it('applies nothing for a control arm, which carries no override', async () => {
    assignments = ARM({ config: null });
    const selwise = await start();

    expect((await selwise.getSearchSettings())?.behavior.maxResults).toBe(8);
  });

  it('applies no arm of a different_module experiment: a channel has one search', async () => {
    assignments = ARM({ experimentMode: 'different_module' });
    const selwise = await start();

    expect((await selwise.getSearchSettings())?.behavior.maxResults).toBe(8);
  });

  it('records the exposure when the search is first opened, not when the settings are read', async () => {
    assignments = ARM();
    const selwise = await start();
    await selwise.getSearchSettings();
    await selwise.search('ceket');
    expect(exposures()).toHaveLength(0);

    selwise.trackSearchOpen();
    await selwise.flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(exposures()).toHaveLength(1);
    expect(exposures()[0]!.body).toMatchObject({ experimentId: 'exp-search', variantId: 'arm-b', eventType: 'exposure' });

    // Once: another opening in the same launch is the same exposure.
    selwise.trackSearchClose();
    selwise.trackSearchOpen();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(exposures()).toHaveLength(1);
  });

  it('records no exposure for a visitor outside the test mode that keeps them out', async () => {
    assignments = ARM();
    searchConfig = searchDocument({}, { mode: 'test' });
    const selwise = await start();

    selwise.trackSearchOpen();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(exposures()).toHaveLength(0);
  });

  it('draws nothing for the holdout arm, and counts the visitor when the search is opened', async () => {
    assignments = ARM({ holdout: true, config: null });
    const selwise = await start();

    expect((await selwise.getSearchState()).state).toBe('off');
    expect((await selwise.search('ceket')).status).toBe('off');
    expect(searchRequests()).toHaveLength(0);

    selwise.trackSearchOpen();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(exposures()).toHaveLength(1);
    // A search that was not drawn was not opened.
    expect(await eventsOf(selwise, 'search_instant_open')).toHaveLength(0);
  });
});

describe('search', () => {
  it('asks for the channel’s own number of results, in the phone’s settings and the app’s language', async () => {
    const selwise = await start({ locale: 'tr' });

    await selwise.search('ceket');

    const request = searchRequests()[0]!;
    expect(request.searchParams.get('q')).toBe('ceket');
    expect(request.searchParams.get('limit')).toBe('8');
    expect(request.searchParams.get('device')).toBe('mobile');
    expect(request.searchParams.get('lang')).toBe('tr');
  });

  it('sends the page, the order and the category', async () => {
    const selwise = await start();

    await selwise.search('ceket', { limit: 5, offset: 10, sort: 'price_asc', category: 'Kadın', refinement: true });

    const request = searchRequests()[0]!;
    expect(request.searchParams.get('limit')).toBe('5');
    expect(request.searchParams.get('offset')).toBe('10');
    expect(request.searchParams.get('sort')).toBe('price_asc');
    expect(request.searchParams.get('category')).toBe('Kadın');
  });

  it('asks for nothing without a term or a category: that is a listing screen’s job', async () => {
    const selwise = await start();

    const result = await selwise.search('   ');

    expect(searchRequests()).toHaveLength(0);
    expect(result).toMatchObject({ hits: [], total: 0, status: 'ready' });
  });

  it('browses a category with no query', async () => {
    searchBody = { hits: [product('A')], total: 1 };
    const selwise = await start();

    const result = await selwise.search('', { category: 'Kadın' });

    expect(result.hits).toHaveLength(1);
    const request = searchRequests()[0]!;
    expect(request.searchParams.has('q')).toBe(false);
    expect(request.searchParams.get('category')).toBe('Kadın');
    // A browse is not a search the shopper phrased: nothing is reported.
    expect(await eventsOf(selwise)).toHaveLength(0);
  });

  it('answers with the total, the page’s offset, the categories and the other terms to try', async () => {
    searchBody = {
      hits: [product('A', { categories: 'Kadın > Ceket' }), product('B', { categories: 'Erkek > Ceket' })],
      total: 40,
      offset: 8,
      categories: [{ name: 'Kadın', count: 25 }],
    };
    const selwise = await start();
    const result = await selwise.search('ceket', { offset: 8, refinement: true });
    expect(result).toMatchObject({ total: 40, offset: 8, categories: [{ name: 'Kadın', count: 25 }], status: 'ready' });

    searchBody = { hits: [], total: 0, suggestions: ['ceket', 'mont'] };
    expect((await selwise.search('cekt')).suggestions).toEqual(['ceket', 'mont']);
  });

  it('works the categories out of the hits when the API sent none', async () => {
    searchBody = { hits: [product('A', { categories: 'Kadın > Ceket' }), product('B', { categories: 'Kadın > Mont' })], total: 2 };
    const selwise = await start();

    expect((await selwise.search('ceket')).categories).toEqual([{ name: 'Kadın', count: 2 }]);
  });

  it('is an empty list with a status, not an error, outside the audience', async () => {
    searchConfig = searchDocument({}, { audience: { mode: 'include', segmentIds: ['vip'] } });
    segmentResults = { vip: false };
    const selwise = await start();

    expect(await selwise.search('ceket')).toMatchObject({ hits: [], status: 'off' });
    expect(searchRequests()).toHaveLength(0);
  });

  it('is an error, and nothing is reported, when the engine could not answer', async () => {
    searchBody = { hits: [], total: 0, strategy: 'service_unavailable' };
    const selwise = await start();

    await expect(selwise.search('ceket')).rejects.toThrow(/unavailable/);
    expect(await eventsOf(selwise)).toHaveLength(0);
  });

  it('still searches when the configuration cannot be read', async () => {
    failSearchConfig = true;
    searchBody = { hits: [product('A')], total: 1 };
    const selwise = await start();

    expect((await selwise.search('ceket')).hits).toHaveLength(1);
    expect(searchRequests()[0]!.searchParams.has('limit')).toBe(false);
  });
});

describe('what a search reports', () => {
  it('reports the search once, with the count the report reads', async () => {
    searchBody = { hits: [product('A')], total: 31 };
    const selwise = await start();

    await selwise.search('ceket');

    const events = await eventsOf(selwise, 'search_query');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entityType: 'search', entityId: 'ceket', metadata: { query: 'ceket', resultsCount: 31 } });
  });

  it('reports a search that found nothing as one that found nothing', async () => {
    const selwise = await start();

    await selwise.search('zzzz');

    expect(await eventsOf(selwise, 'search_zero_results')).toHaveLength(1);
    expect(await eventsOf(selwise, 'search_query')).toHaveLength(0);
  });

  it('reports a merchant’s redirect as an answer, not as a search that found nothing', async () => {
    searchBody = { hits: [], total: 0, redirect: '/kargo' };
    const selwise = await start();

    await selwise.search('kargo');

    expect(await eventsOf(selwise, 'search_zero_results')).toHaveLength(0);
    expect((await eventsOf(selwise, 'search_query'))[0]).toMatchObject({ metadata: { redirect: '/kargo' } });
  });

  it('reports the first page only: a later page, a category and an order are the same search', async () => {
    searchBody = { hits: [product('A')], total: 40 };
    const selwise = await start();

    await selwise.search('ceket');
    await selwise.search('ceket', { offset: 8 });
    await selwise.search('ceket', { category: 'Kadın', refinement: true });
    await selwise.search('ceket', { sort: 'newest', refinement: true });

    expect(await eventsOf(selwise, 'search_query')).toHaveLength(1);
  });

  it('does not report a term shorter than the channel searches from', async () => {
    searchBody = { hits: [product('A')], total: 1 };
    const selwise = await start();

    await selwise.search('c');

    expect(await eventsOf(selwise, 'search_query')).toHaveLength(0);
  });

  it('never calls the browser widget’s two ledgers: the API writes them from these events', async () => {
    searchBody = { hits: [product('A')], total: 1 };
    const selwise = await start();

    await selwise.search('ceket');
    selwise.trackSearchClick('ceket', 'A', 0, 'Kadın');
    selwise.trackSuggestionClick('popularProduct', product('B'));
    await selwise.flush();

    expect(calls.filter((call) => /\/search\/(log|click|zero-results)/.test(call.url))).toHaveLength(0);
  });
});

describe('what the visitor does with the search', () => {
  it('reports the opening with what opened it, and the closing with the time it was open', async () => {
    searchBody = { hits: [product('A')], total: 3 };
    const selwise = await start();

    selwise.trackSearchOpen('focus');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await selwise.search('ceket');
    selwise.trackSearchClose();

    const opened = await eventsOf(selwise, 'search_instant_open');
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ entityType: 'search', metadata: { trigger: 'focus' } });
    const closed = await eventsOf(selwise, 'search_close');
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ entityType: 'search', metadata: { query: 'ceket', resultCount: 3 } });
    expect(typeof closed[0]!.metadata.dwellTimeMs).toBe('number');
  });

  it('reports a closing the host describes itself, and none for a search that was never opened', async () => {
    const selwise = await start();
    selwise.trackSearchClose({ query: 'x', resultCount: 1 });
    expect(await eventsOf(selwise, 'search_close')).toHaveLength(0);

    selwise.trackSearchOpen();
    await new Promise((resolve) => setTimeout(resolve, 5));
    selwise.trackSearchClose({ query: 'pantolon', resultCount: 12 });
    expect((await eventsOf(selwise, 'search_close'))[0]).toMatchObject({ metadata: { query: 'pantolon', resultCount: 12 } });
  });

  it('reports each kind of suggestion the shopper taps, under the names the storefront’s search uses', async () => {
    const selwise = await start();

    selwise.trackSuggestionClick('recent', 'ceket');
    selwise.trackSuggestionClick('popularSearch', 'mont');
    selwise.trackSuggestionClick('popularCategory', 'Kadın');
    selwise.trackSuggestionClick('popularProduct', product('P1', { categories: 'Kadın > Ceket' }));

    expect((await eventsOf(selwise, 'recent_search_click'))[0]).toMatchObject({ entityType: 'search', metadata: { query: 'ceket' } });
    expect((await eventsOf(selwise, 'popular_search_click'))[0]).toMatchObject({ metadata: { query: 'mont' } });
    expect((await eventsOf(selwise, 'popular_category_click'))[0]).toMatchObject({ metadata: { categoryName: 'Kadın' } });
    expect((await eventsOf(selwise, 'popular_product_click'))[0]).toMatchObject({
      entityId: 'P1',
      productItemCode: 'P1',
      metadata: { productItemCode: 'P1' },
    });
    // A popular product is also a click out of the search: what the popular lists are counted from.
    expect((await eventsOf(selwise, 'product_click'))[0]).toMatchObject({
      entityType: 'search',
      productItemCode: 'P1',
      metadata: { query: '', category: 'Kadın' },
    });
  });

  it('reports the tapped result with the term and the category the API’s search log reads', async () => {
    const selwise = await start();

    selwise.trackSearchClick('ceket', 'A', 2, 'Kadın');
    selwise.trackSearchClick('ceket', 'B');

    const clicks = await eventsOf(selwise, 'product_click');
    expect(clicks[0]).toMatchObject({
      entityType: 'search',
      entityId: 'ceket',
      productItemCode: 'A',
      metadata: { query: 'ceket', position: 2, category: 'Kadın' },
    });
    expect(clicks[1]!.metadata).toEqual({ query: 'ceket' });
  });

  it('attributes an add to the basket to the search', async () => {
    const selwise = await start();

    selwise.trackSearchAddToCart(product('A', { price: 250 }), { query: 'ceket' });

    expect((await eventsOf(selwise, 'add_to_cart'))[0]).toMatchObject({
      entityType: 'search',
      entityId: 'A',
      productItemCode: 'A',
      metadata: { query: 'ceket', quantity: 1, price: 250, currency: 'TRY', productName: 'Ürün A' },
    });
  });
});

describe('getSearchSuggestions', () => {
  const POPULAR = {
    recentSearches: { enabled: true, maxCount: 6 },
    popularSearches: { enabled: true, items: ['mont', 'ceket', 'pantolon', 'kazak'] },
    popularCategories: { enabled: true, items: [{ name: 'Kadın', imageUrl: 'https://img/k.png' }, { name: 'Erkek' }] },
    popularProducts: { enabled: true, items: [product('P1'), product('P2'), product('P3')] },
  };

  it('is cut to the channel’s limits and arranged in the order the merchant chose', async () => {
    searchConfig = searchDocument({
      suggestions: {
        order: ['popularProducts', 'recent', 'popularSearches', 'popularCategories'],
        popularSearches: { max: 2 },
        popularProducts: { max: 1 },
        popularCategories: { max: 5 },
      },
    });
    suggestionsBody = POPULAR;
    const selwise = await start();

    const sections = await selwise.getSearchSuggestions();

    expect(sections.popularSearches).toEqual(['mont', 'ceket']);
    expect(sections.popularProducts.map((item) => item.itemCode)).toEqual(['P1']);
    expect(sections.popularCategories).toEqual([{ name: 'Kadın', imageUrl: 'https://img/k.png' }, { name: 'Erkek' }]);
    // Recent is empty: nothing was searched. A section with nothing is not in the order.
    expect(sections.order).toEqual(['popularProducts', 'popularSearches', 'popularCategories']);
  });

  it('asks as a phone, in the app’s language', async () => {
    suggestionsBody = POPULAR;
    const selwise = await start({ locale: 'tr' });

    await selwise.getSearchSuggestions();

    const request = urlsOf('/search/suggestions')[0]!;
    expect(request.searchParams.get('device')).toBe('mobile');
    expect(request.searchParams.get('lang')).toBe('tr');
  });

  it('leaves out a section the merchant switched off, and one the server says is off', async () => {
    searchConfig = searchDocument({ suggestions: { popularSearches: { enabled: false } } });
    suggestionsBody = { ...POPULAR, popularCategories: { enabled: false, items: [] } };
    const selwise = await start();

    const sections = await selwise.getSearchSuggestions();

    expect(sections.popularSearches).toEqual([]);
    expect(sections.popularCategories).toEqual([]);
    expect(sections.popularProducts).toHaveLength(3);
  });

  it('narrows the two lists of terms to those holding the query, whatever the accents', async () => {
    suggestionsBody = POPULAR;
    const selwise = await start();
    searchBody = { hits: [product('A')], total: 1 };
    await selwise.search('Çanta çekme');
    await selwise.search('pantolon');

    const sections = await selwise.getSearchSuggestions({ query: 'PANT' });

    expect(sections.popularSearches).toEqual(['pantolon']);
    expect(sections.recent).toEqual(['pantolon']);
  });

  it('is empty, and asked again later, when the popular lists could not be read', async () => {
    suggestionsBody = POPULAR;
    const selwise = await start();
    const real = globalThis.fetch;
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: unknown) => {
      if (String(url).includes('/search/suggestions')) throw new Error('offline');
      return (real as unknown as (u: unknown, i?: unknown) => Promise<Response>)(url, init);
    });
    expect((await selwise.getSearchSuggestions()).popularSearches).toEqual([]);

    (globalThis as { fetch?: unknown }).fetch = real;
    expect((await selwise.getSearchSuggestions()).popularSearches).toHaveLength(4);
  });

  it('is empty while search is off for the visitor', async () => {
    searchConfig = { enabled: false };
    suggestionsBody = POPULAR;
    const selwise = await start();

    expect((await selwise.getSearchSuggestions()).order).toEqual([]);
    expect(urlsOf('/search/suggestions')).toHaveLength(0);
  });
});

describe('recent searches', () => {
  const searchOnce = async (selwise: Selwise, term: string) => {
    searchBody = { hits: [product('A')], total: 1 };
    await selwise.search(term);
    await new Promise((resolve) => setTimeout(resolve, 5));
  };

  it('keeps the terms that found something, newest first, once each', async () => {
    const selwise = await start();
    await searchOnce(selwise, 'ceket');
    await searchOnce(selwise, 'mont');
    await searchOnce(selwise, 'CEKET');
    searchBody = { hits: [], total: 0 };
    await selwise.search('zzzz');
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect((await selwise.getSearchSuggestions()).recent).toEqual(['CEKET', 'mont']);
  });

  it('does not keep a page, a category or an order of a search as another search', async () => {
    const selwise = await start();
    await searchOnce(selwise, 'ceket');
    await selwise.search('ceket', { offset: 8 });
    await selwise.search('ceket', { category: 'Kadın', refinement: true });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(await selwise.getRecentSearches()).toEqual(['ceket']);
  });

  it('is kept on the device while the visitor’s consent allows remembering what they searched', async () => {
    const storage = new MemoryStorage();
    const selwise = await start({ storage, consent: { granted: true, categories: { necessary: true, analytics: true, preferences: true } } });
    await searchOnce(selwise, 'ceket');

    expect(JSON.parse((await storage.getItem('selwise_recent_searches_site-key'))!)).toEqual(['ceket']);
  });

  it('lives in memory for the launch, and never reaches the device, without that consent', async () => {
    const storage = new MemoryStorage();
    const selwise = await start({ storage, consent: { granted: true, categories: { necessary: true, analytics: true, preferences: false } } });
    await searchOnce(selwise, 'ceket');

    expect(await selwise.getRecentSearches()).toEqual(['ceket']);
    expect(await storage.getItem('selwise_recent_searches_site-key')).toBeNull();
  });

  it('can be cleared, or taken away one term at a time', async () => {
    const selwise = await start();
    await searchOnce(selwise, 'ceket');
    await searchOnce(selwise, 'mont');

    await selwise.removeRecentSearch('ceket');
    expect(await selwise.getRecentSearches()).toEqual(['mont']);

    await selwise.clearRecentSearches();
    expect(await selwise.getRecentSearches()).toEqual([]);
  });
});
