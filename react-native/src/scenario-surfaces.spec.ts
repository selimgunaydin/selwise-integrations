import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * A scenario's "show in the app" claims, judged per screen and handed to the host
 * as surfaces — in the browser widget's order and with its reasons.
 */

interface FetchCall {
  url: string;
  init: RequestInit;
}

const PUBLIC_CAMPAIGN = {
  id: 'public-bar',
  type: 'announcement_bar',
  contentJson: { text: 'Merhaba {tokenless}' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'all',
  segmentIds: [],
};

function claim(overrides: Record<string, unknown> = {}) {
  return {
    deliveryId: 'd-1',
    scenarioId: 'sc-1',
    runId: 'run-1',
    nodeId: 'node-1',
    campaignId: 'public-bar',
    tokens: {},
    respectFrequencyCaps: false,
    expiresAt: '2099-01-01T00:00:00Z',
    available: true,
    scenarioOnly: false,
    ...overrides,
  };
}

function install(entries: unknown[], campaigns: unknown[] = [PUBLIC_CAMPAIGN]) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    let body: unknown = {};
    if (call.url.includes('/scenarios/inbox/ack')) body = { updated: 1 };
    else if (call.url.includes('/scenarios/inbox')) body = { entries };
    else if (call.url.includes('/config')) body = { campaigns, widgets: [], scenarios: { enabled: true } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

async function init() {
  const selwise = new Selwise();
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

const acks = (calls: FetchCall[]) =>
  calls
    .filter((call) => call.url.includes('/scenarios/inbox/ack'))
    .flatMap((call) => (JSON.parse(String(call.init.body)).acknowledgements as Array<Record<string, string>>));

describe('getScenarioSurfaces', () => {
  it('hands a scenario-only claim over as a surface with its merge fields and its ids', async () => {
    const calls = install([
      claim({
        scenarioOnly: true,
        campaignId: 'only-1',
        tokens: { title: 'Sepetin seni bekliyor' },
        campaign: {
          id: 'only-1',
          type: 'exit_intent_popup',
          contentJson: { title: 'varsayılan', text: 'Devam et' },
          placementConfigJson: { position: 'center', placementType: 'fixed' },
          pageTargetingJson: { showOnAllPages: true },
        },
      }),
    ]);
    const selwise = await init();

    const [first, ...rest] = await selwise.getScenarioSurfaces('app://basket');
    const one = first!;

    expect(rest).toEqual([]);
    expect(one.deliveryId).toBe('d-1');
    expect(one.surface.id).toBe('only-1');
    expect(one.surface.content.title).toBe('Sepetin seni bekliyor');
    expect(one.surface.scenario).toEqual({
      scenarioId: 'sc-1',
      runId: 'run-1',
      nodeId: 'node-1',
      deliveryId: 'd-1',
    });
    // Nothing is acknowledged until the host draws it.
    expect(acks(calls)).toEqual([]);
    await selwise.destroy();
  });

  it('puts the scenario on the impression and the click it records', async () => {
    const calls = install([claim()]);
    const selwise = await init();
    const [first] = await selwise.getScenarioSurfaces('app://home');
    const one = first!;

    selwise.trackSurfaceView(one.surface);
    selwise.trackSurfaceClick(one.surface);
    await selwise.flush();

    const sent = calls
      .filter((call) => call.url.includes('/events/batch'))
      .flatMap((call) => JSON.parse(String(call.init.body)).events as Array<Record<string, any>>)
      .filter((event) => event.entityId === 'public-bar');
    expect(sent.length).toBeGreaterThanOrEqual(2);
    for (const event of sent) {
      expect(event.metadata).toMatchObject({ scenarioId: 'sc-1', scenarioRunId: 'run-1', scenarioNodeId: 'node-1' });
    }
    await selwise.destroy();
  });

  it('asks the inbox once when several screens ask at the same moment', async () => {
    const calls = install([claim()]);
    const selwise = await init();
    await Promise.all([
      selwise.getScenarioSurfaces('app://home'),
      selwise.getScenarioSurfaces('app://basket'),
      selwise.getScenarioSurfaces('app://product'),
    ]);
    expect(calls.filter((call) => /\/scenarios\/inbox(\?|$)/.test(call.url))).toHaveLength(1);
  });

  it('closes a claim whose campaign is gone, with that reason', async () => {
    const calls = install([claim({ campaignId: 'deleted', available: true })], [PUBLIC_CAMPAIGN]);
    const selwise = await init();

    expect(await selwise.getScenarioSurfaces('app://home')).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(acks(calls)).toEqual([{ deliveryId: 'd-1', outcome: 'suppressed:entity_missing' }]);
    await selwise.destroy();
  });

  it('leaves a claim OPEN on a screen its rules do not accept, and draws it on one they do', async () => {
    const calls = install(
      [
        claim({
          scenarioOnly: true,
          campaignId: 'only-2',
          campaign: {
            id: 'only-2',
            type: 'announcement_bar',
            contentJson: { text: 'Sepet' },
            placementConfigJson: { position: 'top', placementType: 'fixed' },
            pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'] },
          },
        }),
      ],
      [],
    );
    const selwise = await init();

    expect(await selwise.getScenarioSurfaces('app://home')).toEqual([]);
    expect((await selwise.getScenarioSurfaces('app://basket')).map((s) => s.surface.id)).toEqual(['only-2']);
    // Judged twice, asked once: the inbox is not re-fetched per screen.
    expect(calls.filter((call) => /\/scenarios\/inbox(\?|$)/.test(call.url))).toHaveLength(1);
    expect(acks(calls)).toEqual([]);
    await selwise.destroy();
  });

  it('stops offering a claim once the host has answered it', async () => {
    install([claim()]);
    const selwise = await init();
    const first = await selwise.getScenarioSurfaces('app://home');
    expect(first).toHaveLength(1);

    await selwise.acknowledgeScenarioDeliveries([{ deliveryId: 'd-1', outcome: 'shown' }]);
    expect(await selwise.getScenarioSurfaces('app://home')).toEqual([]);
    await selwise.destroy();
  });
});
