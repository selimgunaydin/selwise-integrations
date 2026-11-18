import { Selwise } from './client.js';
import { MemoryStorage, STORAGE_KEYS } from './core/storage.js';

/**
 * A behaviour rule on a clock or session signal is judged on the SDK's own
 * values — the host reports nothing — and the host's own `behavior` still wins
 * (`withOwnSignals`).
 */

let campaigns: unknown[] = [];

function installFetch() {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown) => {
    const href = String(url);
    const payload = href.includes('/config') ? { campaigns, widgets: [] } : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

const live: Selwise[] = [];
async function start(): Promise<Selwise> {
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

const rule = (signal: string, op: string, value: number | boolean | string) => ({
  id: 'c',
  type: 'announcement_bar',
  contentJson: { text: 'x' },
  placementConfigJson: { position: 'top' },
  pageTargetingJson: { showOnAllPages: true, behavior: { match: 'all', rules: [{ signal, op, value }] } },
  segmentTargetingMode: 'all',
  segmentIds: [],
});

beforeEach(() => {
  campaigns = [];
  installFetch();
});
afterEach(async () => {
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.useRealTimers();
});

const shown = async (client: Selwise) => (await client.getSurfaces('app://home')).length === 1;

describe('the signals the SDK fills itself', () => {
  it('judges the clock: the hour, the day and the weekend', async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 14, 21, 0) }); // a Saturday evening
    campaigns = [rule('hourOfDay', 'gte', 18)];
    expect(await shown(await start())).toBe(true);

    campaigns = [rule('isWeekend', 'eq', true)];
    expect(await shown(await start())).toBe(true);

    campaigns = [rule('dayOfWeek', 'eq', 1)];
    expect(await shown(await start())).toBe(false);
  });

  it('judges the visits: a first launch is not a returning visitor', async () => {
    campaigns = [rule('isReturningVisitor', 'eq', true)];
    expect(await shown(await start())).toBe(false);

    campaigns = [rule('visitCount', 'eq', 1)];
    expect(await shown(await start())).toBe(true);
    campaigns = [rule('sessionCount', 'gte', 1)];
    expect(await shown(await start())).toBe(true);
  });

  it('writes the session counters when the app leaves the foreground, without waiting for the window', async () => {
    const storage = new MemoryStorage();
    const client = new Selwise();
    live.push(client);
    await client.init({
      siteKey: 'site-key',
      apiKey: 'api-key',
      apiUrl: 'https://api.test/api/v1',
      storage,
      flushIntervalMs: 0,
      reportIntegration: false,
    });

    client.trackScreenView('app://home');
    client.trackProductView('P1');
    // Coalesced: nothing is on the device yet.
    expect(await storage.getItem(STORAGE_KEYS.VISITS)).toBeNull();

    client.setAppState('background');
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(JSON.parse((await storage.getItem(STORAGE_KEYS.VISITS))!)).toMatchObject({ pageViews: 1, productsViewed: 1 });
  });

  it('judges the session: screens seen, products viewed, searches and add-to-carts', async () => {
    // The channel's campaigns are read when the client starts: set the rule first.
    campaigns = [rule('pageViewsThisSession', 'gte', 2)];
    const views = await start();
    expect(await shown(views)).toBe(false);
    views.trackScreenView('app://home');
    views.trackScreenView('app://list');
    expect(await shown(views)).toBe(true);

    campaigns = [rule('productsViewedThisSession', 'gte', 1)];
    const products = await start();
    expect(await shown(products)).toBe(false);
    products.trackProductView('P1');
    expect(await shown(products)).toBe(true);

    campaigns = [rule('cartAddsThisSession', 'gte', 1)];
    const adds = await start();
    expect(await shown(adds)).toBe(false);
    adds.trackAddToCart('P1');
    expect(await shown(adds)).toBe(true);

    campaigns = [rule('searchesThisSession', 'gte', 1)];
    const searches = await start();
    expect(await shown(searches)).toBe(false);
    searches.track('search', { metadata: { query: 'ayakkabı' } });
    expect(await shown(searches)).toBe(true);
  });

  it('lets the host’s own behavior win over the SDK’s', async () => {
    campaigns = [rule('visitCount', 'gte', 5)];
    const client = await start();
    expect((await client.getSurfaces('app://home')).length).toBe(0);
    expect((await client.getSurfaces('app://home', { behavior: { visitCount: 9 } })).length).toBe(1);
  });
});
