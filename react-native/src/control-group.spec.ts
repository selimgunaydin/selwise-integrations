import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';
import { isInControlGroup } from './vendor/control-group.js';

/**
 * The channel's global CONTROL GROUP in an app: a held-out visitor is handed
 * no surface — and is still tracked, because the comparison is made on their
 * events and orders. Same rule as the web widget and the API's SQL.
 */

const CHANNEL = 'f3c7316a-f6e8-4c96-a017-b0330a8a80e3';
const PERCENT = 20;

interface FetchCall {
  url: string;
  init: RequestInit;
}

function visitorId(held: boolean): string {
  for (let i = 0; i < 10_000; i += 1) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    if (isInControlGroup(CHANNEL, id, PERCENT) === held) return id;
  }
  throw new Error('no visitor id found');
}

const CAMPAIGN = {
  id: 'banner',
  type: 'announcement_bar',
  contentJson: { text: 'Merhaba' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'all',
  segmentIds: [],
};

function installFetch(controlGroup: unknown) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    let body: unknown = {};
    if (call.url.includes('/experiments/assign')) body = {};
    else if (call.url.includes('/config')) {
      body = {
        controlGroup,
        campaigns: [CAMPAIGN],
        widgets: [],
        scenarios: { enabled: true },
        enrichment: { keys: ['pdp-specs'], v: 'v1' },
      };
    } else if (call.url.includes('/recommendations')) body = { widgets: [{ id: 'strip' }], products: [] };
    else if (call.url.includes('/scenarios/inbox')) body = { deliveries: [] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

async function init(held: boolean, overrides: Record<string, unknown> = {}) {
  const storage = new MemoryStorage();
  await storage.setItem('selwise_vid', visitorId(held));
  const selwise = new Selwise();
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage,
    flushIntervalMs: 0,
    ...overrides,
  } as any);
  return selwise;
}

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('control group (app)', () => {
  it('hands a held-out visitor no surface, and asks the server for none', async () => {
    const calls = installFetch({ percent: PERCENT, channelId: CHANNEL });
    const selwise = await init(true);

    expect(await selwise.getSurfaces('Home')).toEqual([]);
    expect(await selwise.getRecommendationWidgets()).toEqual([]);
    const products = await selwise.getRecommendationProducts('strip');
    expect(products.hidden).toBe(true);
    expect(products.products).toEqual([]);
    expect((await selwise.resolveRecommendationWidget('strip')).hidden).toBe(true);
    expect((await selwise.getEnrichment('SKU-1', ['pdp-specs'])).items ?? []).toEqual([]);
    expect(await selwise.getScenarioInbox()).toEqual([]);

    const asked = calls.map((call) => call.url);
    expect(asked.some((url) => url.includes('/recommendations'))).toBe(false);
    expect(asked.some((url) => url.includes('/app/enrichments'))).toBe(false);
    expect(asked.some((url) => url.includes('/scenarios/inbox'))).toBe(false);
    await selwise.destroy();
  });

  it('still tracks a held-out visitor, with the flag on the event', async () => {
    const calls = installFetch({ percent: PERCENT, channelId: CHANNEL });
    const selwise = await init(true);
    await selwise.getSurfaces('Home'); // the bootstrap has landed
    selwise.track('page_view', { entityType: 'page', metadata: { a: 1 } });
    await selwise.flush();
    const batch = calls.find((call) => call.url.includes('/events/batch'));
    expect(batch).toBeDefined();
    const events = JSON.parse(String(batch!.init.body)).events;
    expect(events.find((event: any) => event.name === 'page_view').metadata).toEqual({ a: 1, controlGroup: true });
    await selwise.destroy();
  });

  it('gives a visitor outside the group everything', async () => {
    installFetch({ percent: PERCENT, channelId: CHANNEL });
    const selwise = await init(false);
    expect((await selwise.getSurfaces('Home')).map((surface) => surface.id)).toEqual(['banner']);
    await selwise.destroy();
  });

  it('holds out nobody when the channel has no control group, or in test mode', async () => {
    installFetch(null);
    const off = await init(true);
    expect((await off.getSurfaces('Home')).length).toBe(1);
    await off.destroy();

    installFetch({ percent: PERCENT, channelId: CHANNEL });
    const testing = await init(true, { testMode: true });
    expect(await testing.getRecommendationWidgets()).not.toEqual([]);
    await testing.destroy();
  });
});
