import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * The HOLDOUT arm in an app: the SDK hands the host nothing for it, and the
 * visitor is counted at the moment the surface would have been handed over.
 */

interface FetchCall {
  url: string;
  init: RequestInit;
}

const CAMPAIGN = {
  id: 'goal-bar',
  type: 'announcement_bar',
  contentJson: { text: 'Ücretsiz kargoya az kaldı' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'all',
  segmentIds: [],
};

function assignment(overrides: Record<string, unknown>) {
  return {
    'exp-1': {
      experimentId: 'exp-1',
      experimentMode: 'config_override',
      targetType: 'campaign',
      targetId: 'goal-bar',
      effectiveTargetId: 'goal-bar',
      excludedTargetIds: [],
      config: null,
      hasHoldout: true,
      ...overrides,
    },
  };
}

function installConfig(options: { campaigns: unknown[]; assignments: Record<string, unknown> }) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    let body: unknown = {};
    if (call.url.includes('/experiments/assign')) body = options.assignments;
    else if (call.url.includes('/config')) body = { campaigns: options.campaigns, widgets: [] };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  return calls;
}

async function init(overrides: Partial<Parameters<Selwise['init']>[0]> = {}) {
  const selwise = new Selwise();
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

const exposures = (calls: FetchCall[]) =>
  calls
    .filter((call) => call.url.includes('/public/experiments/track'))
    .map((call) => JSON.parse(String(call.init.body)));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('getSurfaces: the holdout arm', () => {
  it('declares the holdout capability when it asks for assignments', async () => {
    const calls = installConfig({ campaigns: [], assignments: {} });
    const client = await init();
    await client.getSurfaces('app://home');

    const assign = calls.find((call) => call.url.includes('/experiments/assign'))!;
    expect(assign.url).toContain('capabilities=holdout');
  });

  it('drops a held-out surface and records its exposure once', async () => {
    const calls = installConfig({
      campaigns: [CAMPAIGN],
      assignments: assignment({ variantId: 'arm-holdout', holdout: true }),
    });
    const client = await init();

    expect(await client.getSurfaces('app://home')).toEqual([]);
    expect(await client.getSurfaces('app://cart')).toEqual([]);
    await settle();

    const sent = exposures(calls);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(
      expect.objectContaining({ experimentId: 'exp-1', variantId: 'arm-holdout', eventType: 'exposure' })
    );
    expect(typeof sent[0].visitorId).toBe('string');
    // No campaign impression is ever made for it: the host never received it.
    const batches = calls.filter((call) => call.url.includes('/events/batch'));
    expect(batches).toHaveLength(0);
  });

  it('keeps the slot EMPTY: the surface it beat for the dock stays beaten', async () => {
    installConfig({
      campaigns: [
        { ...CAMPAIGN, priority: 99, placementConfigJson: { position: 'top', conflictResolution: { priority: 99 } } },
        {
          ...CAMPAIGN,
          id: 'other-bar',
          placementConfigJson: { position: 'top', conflictResolution: { priority: 1 } },
        },
      ],
      assignments: assignment({ variantId: 'arm-holdout', holdout: true }),
    });
    const client = await init();

    expect(await client.getSurfaces('app://home')).toEqual([]);
  });

  it('records the shown arm`s exposure at the same moment, and hands it over', async () => {
    const calls = installConfig({
      campaigns: [CAMPAIGN],
      assignments: assignment({ variantId: 'arm-shown' }),
    });
    const client = await init();

    const surfaces = await client.getSurfaces('app://home');
    await settle();

    expect(surfaces.map((surface) => surface.id)).toEqual(['goal-bar']);
    expect(exposures(calls).map((body) => body.variantId)).toEqual(['arm-shown']);
  });

  it('reports nothing in test mode', async () => {
    const calls = installConfig({
      campaigns: [{ ...CAMPAIGN }],
      assignments: assignment({ variantId: 'arm-holdout', holdout: true }),
    });
    const client = await init({ testMode: true });

    await client.getSurfaces('app://home');
    await settle();

    expect(exposures(calls)).toHaveLength(0);
  });

  it('charges a would-be display to the holdout`s own cap key, never the surface`s', async () => {
    installConfig({
      campaigns: [
        {
          ...CAMPAIGN,
          placementConfigJson: { position: 'top', frequencyCap: { perSession: 1 } },
        },
      ],
      assignments: assignment({ variantId: 'arm-holdout', holdout: true }),
    });
    const storage = new MemoryStorage();
    const client = await init({ storage });

    expect(await client.getSurfaces('app://home')).toEqual([]);
    await settle();

    const caps = JSON.parse((await storage.getItem('selwise_frequency_caps')) ?? '{}');
    expect(Object.keys(caps)).toEqual(['holdout:goal-bar']);
    // Capped like the shown arm's surface would be: the next screen asks the
    // holdout's own ledger, which is spent, so the dock behaves exactly as a
    // capped-out shown surface leaves it.
    expect(await client.getSurfaces('app://home')).toEqual([]);
  });
});
