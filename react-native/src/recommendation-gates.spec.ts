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
const PAGE_TYPED = [
  { id: 'any' },
  { id: 'basket-only', pageTypes: ['cart'] },
  { id: 'product-or-home', pageTypes: ['product', 'home'] },
];
let listed: unknown[] = STRIPS;

function installFetch(isVip: boolean) {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown) => {
    const path = String(url);
    let body: unknown = {};
    if (path.includes('/segments/evaluate')) body = { results: { 'seg-vip': isVip } };
    else if (path.includes('/config')) body = { campaigns: [], widgets: [] };
    else if (path.includes('/recommendations')) body = { widgets: listed };
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

beforeEach(() => {
  listed = STRIPS;
});

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

describe('recommendation strip page types (app)', () => {
  beforeEach(() => {
    listed = PAGE_TYPED;
  });

  const idsOn = async (screen: string, info?: { pageType?: string }) => {
    installFetch(false);
    const selwise = await init();
    selwise.setScreen(screen, info);
    const ids = (await selwise.getRecommendationWidgets(screen)).map((widget) => widget.id);
    const reasons = selwise.explain().map((report) => [report.id, report.reason]);
    await selwise.destroy();
    return { ids, reasons };
  };

  it("drops a basket strip on the product screen and says it is the screen's page type", async () => {
    const { ids, reasons } = await idsOn('app://product');
    expect(ids).toEqual(['any', 'product-or-home']);
    expect(reasons).toEqual([['basket-only', 'screens']]);
  });

  it('keeps it on the basket screen, by the catalogue type of the address', async () => {
    const { ids } = await idsOn('app://basket');
    expect(ids).toEqual(['any', 'basket-only']);
  });

  it('prefers the page type the host passed for the current screen', async () => {
    const { ids } = await idsOn('app://product', { pageType: 'cart' });
    expect(ids).toEqual(['any', 'basket-only']);
  });

  it('still shows a strip on a screen whose type is unknown', async () => {
    const { ids } = await idsOn('app://some-custom-screen');
    expect(ids).toEqual(['any', 'basket-only', 'product-or-home']);
  });
});
