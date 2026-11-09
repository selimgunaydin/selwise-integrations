import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * `getRecommendationWidgets()` applies the browser widget's two gates: a strip
 * in test mode reaches only a test-mode client, and a segment-targeted strip
 * only the visitors its segments admit. The list came back as the API sent it,
 * so a draft and a "VIP only" strip reached every shopper in the app.
 */

const STRIPS = [
  { id: 'live', segmentTargetingMode: 'all', segmentIds: [] },
  { id: 'draft', isTestMode: true, segmentTargetingMode: 'all', segmentIds: [] },
  { id: 'vip', segmentTargetingMode: 'include', segmentIds: ['seg-vip'] },
  { id: 'not-vip', segmentTargetingMode: 'exclude', segmentIds: ['seg-vip'] },
];

function installFetch(isVip: boolean) {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown) => {
    const path = String(url);
    let body: unknown = {};
    if (path.includes('/segments/evaluate')) body = { results: { 'seg-vip': isVip } };
    else if (path.includes('/config')) body = { campaigns: [], widgets: [] };
    else if (path.includes('/recommendations')) body = { widgets: STRIPS };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
}

async function init(overrides: Record<string, unknown> = {}) {
  const selwise = new Selwise();
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    ...overrides,
  } as any);
  return selwise;
}

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('recommendation strip gates (app)', () => {
  it('keeps a test-mode strip from a real shopper', async () => {
    installFetch(false);
    const selwise = await init();
    const ids = (await selwise.getRecommendationWidgets()).map((widget) => widget.id);
    expect(ids).toEqual(['live', 'not-vip']);
    await selwise.destroy();
  });

  it('shows it to a test-mode client, beside the live ones', async () => {
    installFetch(false);
    const selwise = await init({ testMode: true });
    const ids = (await selwise.getRecommendationWidgets()).map((widget) => widget.id);
    expect(ids).toEqual(['live', 'draft', 'not-vip']);
    await selwise.destroy();
  });

  it('admits a segment-targeted strip only for a member', async () => {
    installFetch(true);
    const selwise = await init();
    const ids = (await selwise.getRecommendationWidgets()).map((widget) => widget.id);
    expect(ids).toEqual(['live', 'vip']);
    await selwise.destroy();
  });
});
