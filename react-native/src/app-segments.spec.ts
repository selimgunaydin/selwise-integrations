import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';
import { VisitorSignals } from './core/visitor-signals.js';

/**
 * What the SDK tells the server about the person so an APP segment (platform,
 * release, language, push permission, opened screens) can be judged: on every
 * segment request, and with the login for a segment's members.
 */

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

const CAMPAIGN = {
  id: 'banner',
  type: 'announcement_bar',
  contentJson: { text: 'Merhaba' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'include',
  segmentIds: ['seg-1'],
};

function install() {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const href = String(url);
    const raw = (init as RequestInit | undefined)?.body;
    calls.push({ url: href, body: typeof raw === 'string' ? JSON.parse(raw) : {} });
    let body: unknown = {};
    if (href.includes('/segments/evaluate')) body = { results: { 'seg-1': true } };
    else if (href.includes('/config')) body = { campaigns: [CAMPAIGN], widgets: [] };
    else if (href.includes('/users/identify')) body = { success: true };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

async function init(extra: Record<string, unknown> = {}) {
  const selwise = new Selwise();
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    ...extra,
  });
  return selwise;
}

const evaluateCall = (calls: FetchCall[]) => calls.filter((call) => call.url.includes('/segments/evaluate')).pop()!;

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('the segment request carries what the app knows', () => {
  it('sends the OS, the release, the language, the permission and the opened screens', async () => {
    const calls = install();
    const selwise = await init({ platform: 'ios', appVersion: '3.4.1', locale: 'tr-TR' });
    selwise.setPushPermission('denied');
    selwise.trackScreenView('app://basket');
    await selwise.getSurfaces('app://home');

    expect(evaluateCall(calls).body).toEqual(
      expect.objectContaining({
        deviceType: 'mobile',
        platform: 'ios',
        appVersion: '3.4.1',
        appLocale: 'tr-TR',
        pushPermission: 'denied',
        screenDaysAgo: { basket: 0 },
      }),
    );
  });

  it('sends only what the host gave — an unknown is not a default', async () => {
    const calls = install();
    const selwise = await init();
    await selwise.getSurfaces('app://home');

    const body = evaluateCall(calls).body;
    expect(body).not.toHaveProperty('platform');
    expect(body).not.toHaveProperty('appVersion');
    expect(body).not.toHaveProperty('appLocale');
    expect(body).not.toHaveProperty('pushPermission');
    // The screen history is always declared: "none opened" is a measurement.
    expect(body.screenDaysAgo).toEqual({});
  });

  it('drops a value the route would refuse for the whole body', async () => {
    const calls = install();
    const selwise = await init({ platform: 'windows', appVersion: 'x'.repeat(40) });
    selwise.setPushPermission('maybe' as never);
    await selwise.getSurfaces('app://home');

    const body = evaluateCall(calls).body;
    expect(body).not.toHaveProperty('platform');
    expect(body).not.toHaveProperty('appVersion');
    expect(body).not.toHaveProperty('pushPermission');
  });

  it('does not remember a screen the catalogue does not list', async () => {
    const calls = install();
    const selwise = await init();
    selwise.trackScreenView('app://not-a-screen');
    await selwise.getSurfaces('app://home');
    expect(evaluateCall(calls).body.screenDaysAgo).toEqual({});
  });
});

describe('identify carries the app facts for a segment`s members', () => {
  it('sends them as traits beside the merchant`s own', async () => {
    const calls = install();
    const selwise = await init({ platform: 'android', appVersion: '2.0.0', locale: 'en' });
    selwise.setPushPermission('granted');
    await selwise.identify('user-1', { loyalty_tier: 'gold' });

    const identify = calls.find((call) => call.url.includes('/users/identify'))!;
    expect(identify.body.traits).toEqual({
      loyalty_tier: 'gold',
      platform: 'android',
      appVersion: '2.0.0',
      appLocale: 'en',
      pushPermission: 'granted',
    });
  });

  it('never sends a phone number as a trait, and says only that there was one', async () => {
    const calls = install();
    const selwise = await init();
    await selwise.identify('user-2', { email: 'a@b.co', phone: '+905321112233' });

    const identify = calls.find((call) => call.url.includes('/users/identify'))!;
    expect(JSON.stringify(identify.body)).not.toContain('905321112233');
    expect(identify.body.email).toBe('a@b.co');
    expect(identify.body.traits ?? {}).not.toHaveProperty('phone');
  });

  it('tells the server a permission change after the login', async () => {
    const calls = install();
    const selwise = await init();
    await selwise.identify('user-3');
    selwise.setPushPermission('granted');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const traits = calls.find((call) => call.url.endsWith('/users/traits'));
    expect(traits?.body).toEqual(expect.objectContaining({ externalId: 'user-3', traits: { pushPermission: 'granted' } }));
  });

  it('sends nothing for a permission set before anyone is identified', async () => {
    const calls = install();
    const selwise = await init();
    selwise.setPushPermission('granted');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.some((call) => call.url.endsWith('/users/traits'))).toBe(false);
  });
});

describe('the order carries the list price and the checkout`s marketing decision', () => {
  it('keeps a line`s list price in its metadata and passes the consent entries through', async () => {
    const calls = install();
    const selwise = await init();
    await selwise.trackOrder({
      orderId: 'O-1',
      total: 90,
      subtotal: 100,
      discountTotal: 10,
      shippingTotal: 0,
      taxTotal: 15,
      items: [{ productItemCode: 'A', quantity: 1, unitPrice: 90, originalPrice: 100 }],
      marketingConsent: [{ kind: 'email', value: 'a@b.co', optIn: true, note: 'Kampanyalardan haberdar ol' }],
    });

    const order = calls.find((call) => call.url.endsWith('/orders'))!.body;
    expect(order).toEqual(
      expect.objectContaining({ subtotal: 100, discountTotal: 10, shippingTotal: 0, taxTotal: 15 }),
    );
    expect(order.items).toEqual([
      { productItemCode: 'A', quantity: 1, unitPrice: 90, metadata: { originalPrice: 100 } },
    ]);
    expect(order.marketingConsent).toEqual([
      { kind: 'email', value: 'a@b.co', optIn: true, note: 'Kampanyalardan haberdar ol' },
    ]);
  });
});

describe('VisitorSignals.screenDaysAgo', () => {
  it('counts whole days on the device`s own clock and keeps the newest open', () => {
    const day = 24 * 60 * 60 * 1000;
    const signals = new VisitorSignals(new MemoryStorage(), () => 's1');
    const now = 1_800_000_000_000;
    signals.recordPageView(now - 5 * day, 'product');
    signals.recordPageView(now - 2 * day, 'product');
    signals.recordPageView(now - 30 * 60 * 1000, 'basket');
    expect(signals.screenDaysAgo(now)).toEqual({ product: 2, basket: 0 });
  });
});
