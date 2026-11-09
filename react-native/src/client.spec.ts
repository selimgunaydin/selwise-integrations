import { Selwise, SDK_VERSION } from './client.js';
import { MemoryStorage } from './core/storage.js';
import { SelwiseApiError } from './types.js';

interface FetchCall {
  url: string;
  init: RequestInit;
}

function installFetch(
  handler: (call: FetchCall) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>
) {
  const calls: FetchCall[] = [];
  const mock = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    const { status = 200, body = {} } = await handler(call);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    } as unknown as Response;
  });
  (globalThis as { fetch?: unknown }).fetch = mock;
  return { calls, mock };
}

function parseBody(call: FetchCall): any {
  return JSON.parse(String(call.init.body));
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

describe('Selwise.init', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  it('rejects a missing channel key', async () => {
    await expect(new Selwise().init({ siteKey: '', apiKey: 'k' })).rejects.toThrow(/channelKey/);
  });

  it('accepts channelKey as an alias of siteKey', async () => {
    // The dashboard calls this value a channel key; `siteKey` is the published
    // option name and stays supported. Both must reach the same request path,
    // or an app written against the new name silently talks to no channel.
    const { calls } = installFetch(() => ({ body: {} }));
    const client = new Selwise();
    await client.init({
      channelKey: 'channel-key',
      apiKey: 'k',
      apiUrl: 'https://api.test/api/v1',
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
    });

    await client.getRecommendationWidgets();

    expect(calls[0]?.url).toContain('/public/sites/channel-key/');
  });

  it('rejects a missing apiKey and explains why mobile needs one', async () => {
    await expect(new Selwise().init({ siteKey: 's', apiKey: '' })).rejects.toThrow(
      /mobile_read and mobile_write/
    );
  });

  it('throws when used before init', () => {
    expect(() => new Selwise().getConsent()).toThrow(/call init\(\)/);
  });
});

describe('Selwise languages', () => {
  it('asks every read in the app language and none of the writes', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init({ locale: 'en-GB' });

    await selwise.getSurfaces('app://home');
    selwise.track('product_view', { entityType: 'product' });
    await selwise.flush();

    const config = calls.find((call) => call.url.includes('/config')) as FetchCall;
    expect(new URL(config.url).searchParams.get('lang')).toBe('en-GB');
    const batch = calls.find((call) => call.url.includes('/events/batch')) as FetchCall;
    expect(new URL(batch.url).searchParams.has('lang')).toBe(false);
  });

  it('asks a recommendation strip in the app language although it is a POST', async () => {
    const { calls } = installFetch(() => ({ body: { products: [] } }));
    const selwise = await init({ locale: 'en' });

    await selwise.getRecommendationProducts('widget-1');

    const call = calls.find((entry) => entry.url.includes('/recommendations/widget-1/products')) as FetchCall;
    expect(call.init.method).toBe('POST');
    expect(new URL(call.url).searchParams.get('lang')).toBe('en');
  });

  it('drops the cached config when the language changes, and asks in the new one', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init();

    await selwise.getSurfaces('app://home');
    selwise.setLocale('tr');
    expect(selwise.getLocale()).toBe('tr');
    await selwise.getSurfaces('app://home');

    const configs = calls.filter((call) => call.url.includes('/config'));
    expect(configs).toHaveLength(2);
    expect(new URL(configs[0]!.url).searchParams.has('lang')).toBe(false);
    expect(new URL(configs[1]!.url).searchParams.get('lang')).toBe('tr');
  });
});

describe('Selwise.track / flush', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('sends a batch with the required consent snapshot', async () => {
    const { calls } = installFetch(() => ({ body: { ok: true } }));
    const selwise = await init();

    selwise.trackProductView('SKU-1');
    await selwise.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch'));
    expect(batch).toBeDefined();

    const body = parseBody(batch as FetchCall);
    expect(body.consentSnapshot).toEqual(
      expect.objectContaining({ granted: true, categories: expect.objectContaining({ necessary: true }) })
    );
    expect(body.sessionId).toBeTruthy();
    expect(body.visitorId).toBeTruthy();
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toEqual(
      expect.objectContaining({ name: 'product_view', entityType: 'product', productItemCode: 'SKU-1' })
    );
  });

  it('marks a test-mode batch, so a test-mode scenario can admit the tester', async () => {
    // The web widget sends `testMode` from `selwise_test_mode`; the SDK sent
    // nothing, and a test-mode scenario refuses every visitor who is not in
    // test mode — so no app event could ever enter one.
    const { calls } = installFetch(() => ({ body: { ok: true } }));
    const tester = await init({ testMode: true });
    tester.track('custom_event');
    await tester.flush();
    const testBatch = calls.filter((call) => call.url.includes('/events/batch')).map(parseBody)[0];
    expect(testBatch.testMode).toBe(true);

    const shopper = await init();
    shopper.track('custom_event');
    await shopper.flush();
    const realBatch = calls.filter((call) => call.url.includes('/events/batch')).map(parseBody)[1];
    expect(realBatch).not.toHaveProperty('testMode');
  });

  it('does not send the api key to the ungated ingest route', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init();

    selwise.track('custom_event');
    await selwise.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch')) as FetchCall;
    const headers = batch.init.headers as Record<string, string>;
    expect(headers['x-selwise-api-key']).toBeUndefined();
    expect(headers['x-selwise-client-platform']).toBe('react-native');
  });

  it('sends the api key to guarded routes', async () => {
    const { calls } = installFetch(() => ({ body: { products: [] } }));
    const selwise = await init();

    await selwise.getRecommendationProducts('widget-1');

    const call = calls.find((entry) => entry.url.includes('/recommendations/widget-1/products')) as FetchCall;
    expect((call.init.headers as Record<string, string>)['x-selwise-api-key']).toBe('api-key');
    expect(call.init.method).toBe('POST');
  });

  it('holds events while consent is not granted, then sends them once it is', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init({ consent: { granted: false } });

    selwise.track('product_view', { entityType: 'product' });
    await selwise.flush();
    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(0);

    await selwise.setConsent({ granted: true, categories: { analytics: true } });
    await selwise.flush();

    const batches = calls.filter((call) => call.url.includes('/events/batch'));
    expect(batches).toHaveLength(1);
    expect(parseBody(batches[0] as FetchCall).events).toHaveLength(1);
  });

  describe('a channel that waits for the consent decision', () => {
    const waitingConfig = {
      tracking: {
        dataLayerConfig: { cookieConsent: { enabled: true, waitForConsent: true, defaultConsent: false } },
      },
    };
    const routed = (call: FetchCall) => ({ body: call.url.includes('/config') ? waitingConfig : {} });

    it('sends nothing until the host decides, then sends what the answer allows', async () => {
      const { calls } = installFetch(routed);
      const selwise = await init();

      selwise.track('product_view', { entityType: 'product' });
      await selwise.flush();
      expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(0);
      expect(selwise.getConsent()).toEqual(expect.objectContaining({ granted: false, source: 'awaiting_decision' }));

      await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: false } });
      await selwise.flush();
      const batch = calls.find((call) => call.url.includes('/events/batch'));
      expect(batch).toBeDefined();
      expect(parseBody(batch as FetchCall).consentSnapshot).toEqual(expect.objectContaining({ granted: true }));
    });

    it('remembers the policy when /config cannot be read on a later launch', async () => {
      const storage = new MemoryStorage();
      installFetch(routed);
      const first = await init({ storage });
      first.track('product_view', { entityType: 'product' });
      await first.flush();

      const { calls } = installFetch((call) => (call.url.includes('/config') ? { status: 500, body: {} } : { body: {} }));
      const second = await init({ storage });
      second.track('product_view', { entityType: 'product' });
      await second.flush();
      expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(0);
    });

    it('keeps the app_managed default on a channel that does not wait', async () => {
      const { calls } = installFetch(() => ({ body: {} }));
      const selwise = await init();
      selwise.track('product_view', { entityType: 'product' });
      await selwise.flush();
      expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(1);
    });
  });

  it('says an app that never set consent manages it itself', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init();

    selwise.track('product_view', { entityType: 'product' });
    await selwise.flush();

    const body = parseBody(calls.find((call) => call.url.includes('/events/batch')) as FetchCall);
    expect(body.consentSnapshot).toEqual(
      expect.objectContaining({
        granted: true,
        source: 'app_managed',
        categories: expect.objectContaining({ analytics: true, marketing: true }),
      })
    );
  });

  it('sends only the categories the answer allows, and drops the rest', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init({ consent: { granted: false } });

    selwise.track('product_view', { entityType: 'product' });
    selwise.track('impression', { entityType: 'campaign', entityId: 'c-1' });
    await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: false } });
    await selwise.flush();

    const batches = calls.filter((call) => call.url.includes('/events/batch')).map(parseBody);
    expect(batches.flatMap((batch) => batch.events.map((event: { name: string }) => event.name))).toEqual([
      'product_view',
    ]);

    // A later grant does not bring back what was refused.
    await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: true } });
    await selwise.flush();
    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(1);
  });

  it('holds identify until consent allows it, and records the order without the visitor before', async () => {
    const { calls } = installFetch(() => ({ body: { success: true, created: true } }));
    const selwise = await init({ consent: { granted: true, categories: { analytics: false } } });

    await selwise.identify('member-7');
    expect(calls.filter((call) => call.url.includes('/users/identify'))).toHaveLength(0);

    await selwise.trackOrder({ orderId: 'ORD-9', total: 50, currency: 'TRY', items: [] } as any);
    const order = parseBody(calls.find((call) => call.url.includes('/orders')) as FetchCall);
    expect(order.orderId).toBe('ORD-9');
    expect(order).not.toHaveProperty('visitorId');
    expect(order).not.toHaveProperty('siteUserId');
    expect(order).not.toHaveProperty('sessionId');

    await selwise.setConsent({ granted: true, categories: { analytics: true } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const identify = calls.filter((call) => call.url.includes('/users/identify'));
    expect(identify).toHaveLength(1);
    expect(parseBody(identify[0] as FetchCall).externalId).toBe('member-7');
  });

  it('requeues events after a 500 so the next flush re-sends them', async () => {
    const failing = installFetch(() => ({ status: 500, body: { error: 'boom' } }));
    const selwise = await init();

    selwise.track('survivor');
    await selwise.flush();
    expect(failing.calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(1);

    const recovered = installFetch(() => ({ body: {} }));
    await selwise.flush();

    const batch = recovered.calls.find((call) => call.url.includes('/events/batch'));
    expect(batch).toBeDefined();

    const events = parseBody(batch as FetchCall).events;
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('survivor');
    // The requeue bumped the attempt counter rather than resetting it.
    expect(events[0].retryCount).toBe(1);
  });

  it('drops a batch the server rejects with 400 instead of retrying forever', async () => {
    const { calls } = installFetch(() => ({ status: 400, body: { message: 'bad' } }));
    const selwise = await init();

    selwise.track('a');
    await selwise.flush();
    await selwise.flush();

    // One attempt only: a 400 is not retried.
    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(1);
  });

  it('still retries a 429', async () => {
    const { calls } = installFetch(() => ({ status: 429, body: {} }));
    const selwise = await init();

    selwise.track('a');
    await selwise.flush();
    await selwise.flush();

    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(2);
  });

  it('flushes automatically once the batch size is reached', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init({ batchSize: 2 });

    selwise.track('a');
    selwise.track('b');
    // The size trigger fires without an explicit flush.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(1);
  });

  it('clamps batchSize to the server hard cap', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init({ batchSize: 5000 });

    for (let i = 0; i < 250; i += 1) {
      selwise.track(`e${i}`);
    }
    await selwise.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch')) as FetchCall;
    expect(parseBody(batch).events.length).toBeLessThanOrEqual(200);
  });

  it('ignores track() before init instead of throwing in a render', () => {
    const selwise = new Selwise();
    expect(() => selwise.track('too_early')).not.toThrow();
  });

  it('shares one in-flight flush between concurrent callers', async () => {
    const { calls } = installFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { body: {} };
    });
    const selwise = await init();

    selwise.track('a');
    await Promise.all([selwise.flush(), selwise.flush(), selwise.flush()]);

    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(1);
  });
});

describe('Selwise.trackOrder', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('posts the order with identity and mobile device type', async () => {
    const { calls } = installFetch(() => ({ body: { success: true, created: true } }));
    const selwise = await init();
    await selwise.identify('user-9');

    await selwise.trackOrder({
      orderId: 'ORDER-1',
      total: 100,
      currency: 'TRY',
      items: [{ productItemCode: 'SKU-1', quantity: 1, unitPrice: 100 }],
    });

    const call = calls.find((entry) => entry.url.endsWith('/orders')) as FetchCall;
    const body = parseBody(call);
    expect(body).toEqual(
      expect.objectContaining({
        orderId: 'ORDER-1',
        total: 100,
        currency: 'TRY',
        siteUserId: 'user-9',
        deviceType: 'mobile_app',
      })
    );
    expect((call.init.headers as Record<string, string>)['x-selwise-api-key']).toBe('api-key');
  });

  it('surfaces an auth failure as an identifiable error', async () => {
    installFetch(() => ({ status: 403, body: { message: 'Invalid API key or insufficient scope' } }));
    const selwise = await init();

    await expect(
      selwise.trackOrder({ orderId: 'ORDER-2', total: 1, currency: 'TRY' })
    ).rejects.toMatchObject({ name: 'SelwiseApiError', status: 403 });

    try {
      await selwise.trackOrder({ orderId: 'ORDER-3', total: 1, currency: 'TRY' });
    } catch (error) {
      expect((error as SelwiseApiError).isAuthError).toBe(true);
    }
  });
});

describe('Selwise.search', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('normalises a products-shaped response to hits and tracks the query', async () => {
    const { calls } = installFetch((call) =>
      call.url.includes('/search?')
        ? { body: { products: [{ itemCode: 'SKU-1', title: 'Gömlek' }] } }
        : { body: {} }
    );
    const selwise = await init();

    const result = await selwise.search('gomlek', { limit: 5 });
    expect(result.hits).toHaveLength(1);

    await selwise.flush();
    const batch = calls.find((call) => call.url.includes('/events/batch')) as FetchCall;
    expect(parseBody(batch).events[0].name).toBe('search_query');
  });

  it('tracks search_zero_results when nothing came back', async () => {
    const { calls } = installFetch((call) =>
      call.url.includes('/search?') ? { body: { hits: [] } } : { body: {} }
    );
    const selwise = await init();

    await selwise.search('zzzz');
    await selwise.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch')) as FetchCall;
    expect(parseBody(batch).events[0].name).toBe('search_zero_results');
  });

  it('encodes the query rather than concatenating it into the url', async () => {
    const { calls } = installFetch(() => ({ body: { hits: [] } }));
    const selwise = await init();

    await selwise.search('kadın & çocuk');

    const call = calls.find((entry) => entry.url.includes('/search?')) as FetchCall;
    expect(call.url).toContain('q=kad%C4%B1n%20%26%20%C3%A7ocuk');
  });
});

describe('Selwise session lifecycle', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('replays a queue left over from a previous launch', async () => {
    const storage = new MemoryStorage();
    const first = await init({ storage });
    installFetch(() => ({ status: 500, body: {} }));
    first.track('left_over');
    await first.flush();
    await first.destroy().catch(() => undefined);

    const { calls } = installFetch(() => ({ body: {} }));
    const second = new Selwise();
    await second.init({
      siteKey: 'site-key',
      apiKey: 'api-key',
      apiUrl: 'https://api.test/api/v1',
      storage,
      flushIntervalMs: 0,
    });
    await second.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch'));
    expect(batch).toBeDefined();
    expect(parseBody(batch as FetchCall).events[0].name).toBe('left_over');
  });

  it('logout keeps the visitor id, drops the user and rotates the session', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init();
    await selwise.identify('user-1');

    selwise.track('before');
    await selwise.flush();

    await selwise.logout();

    selwise.track('after');
    await selwise.flush();

    const batches = calls.filter((call) => call.url.includes('/events/batch')).map(parseBody);
    expect(batches).toHaveLength(2);

    const [before, after] = batches;
    // Same device, so the visitor is the same person's phone...
    expect(after.visitorId).toBe(before.visitorId);
    // ...but the two users' behaviour must not land in one session,
    // and the logged-in id must be gone.
    expect(after.sessionId).not.toBe(before.sessionId);
    expect(before.siteUserId).toBe('user-1');
    expect(after.siteUserId).toBeUndefined();
  });

  it('setScreen attaches the synthetic page url to the batch', async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init();

    selwise.trackScreenView('app://product');
    await selwise.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch')) as FetchCall;
    expect(parseBody(batch).pageUrl).toBe('app://product');
  });

  it("stamps a screen view with cartSource 'host' once the app has told us its cart", async () => {
    const { calls } = installFetch(() => ({ body: {} }));
    const selwise = await init();

    selwise.trackScreenView('app://home');
    selwise.setCart({ total: 349, itemCount: 1, currency: 'TRY' });
    selwise.trackScreenView('app://basket');
    await selwise.flush();

    const events = calls
      .filter((call) => call.url.includes('/events/batch'))
      .flatMap((call) => (parseBody(call).events as Array<{ name: string; metadata?: Record<string, unknown> }>) ?? []);
    const views = events.filter((event) => event.name === 'page_view');
    expect(views.map((event) => event.metadata?.cartSource)).toEqual([undefined, 'host']);
  });
});

describe('Selwise.trackDeepLink', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  const SCENARIO = '0b6f0d7e-1c2a-4e5b-9d8c-7a6b5c4d3e2f';

  it('records the landing and the message click on the reduced link, once per session', async () => {
    const { calls } = installFetch(() => ({ status: 201, body: { success: true } }));
    const selwise = await init();
    selwise.trackScreenView('app://home');

    const link = `myshop://basket?sw_sc=${SCENARIO}&utm_source=selwise&utm_medium=email&token=secret`;
    expect(selwise.trackDeepLink(link)?.scenarioId).toBe(SCENARIO);
    selwise.trackDeepLink(link);
    await selwise.flush();

    const landing = `myshop://basket?sw_sc=${SCENARIO}&utm_source=selwise&utm_medium=email`;
    const batches = calls.filter((call) => call.url.includes('/events/batch')).map(parseBody);
    const onLanding = batches.filter((batch) => batch.pageUrl === landing).flatMap((batch) => batch.events);
    expect(onLanding.map((event: { name: string }) => event.name)).toEqual(['page_view', 'click']);
    expect(onLanding[0].metadata).toEqual({
      landing: 'deep_link',
      referrer: '',
      utm_source: 'selwise',
      utm_medium: 'email',
    });
    expect(onLanding[1]).toMatchObject({
      entityType: 'messaging',
      entityId: SCENARIO,
      metadata: { source: 'message_link', medium: 'email' },
    });
    expect(JSON.stringify(batches)).not.toContain('secret');
  });

  it('keeps the cold-start link that arrives before init() and records it when init() finishes', async () => {
    const { calls } = installFetch(() => ({ status: 201, body: { success: true } }));
    const selwise = new Selwise();
    const link = `myshop://home?sw_sc=${SCENARIO}&utm_medium=push`;
    expect(selwise.trackDeepLink(link)?.scenarioId).toBe(SCENARIO);
    await selwise.init({
      siteKey: 'site-key',
      apiKey: 'api-key',
      apiUrl: 'https://api.test/api/v1',
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
    });
    await selwise.flush();
    const events = calls
      .filter((call) => call.url.includes('/events/batch'))
      .flatMap((call) => parseBody(call).events as Array<{ name: string; entityType: string }>);
    expect(events.map((event) => `${event.name}:${event.entityType}`)).toEqual(['page_view:page', 'click:messaging']);
  });

  it('records nothing for a link that says nothing about its source', async () => {
    const { calls } = installFetch(() => ({ status: 201, body: { success: true } }));
    const selwise = await init();
    expect(selwise.trackDeepLink('myshop://product/42')).toBeNull();
    await selwise.flush();
    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(0);
  });
});

describe('screen changes and batch attribution', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  // `POST /events/batch` carries one pageUrl for the WHOLE batch and its
  // per-event DTO has no such field, so a batch that mixed screens attributed
  // every event to wherever the visitor happened to be at flush time. On web a
  // page load ends the batch; in an app the queue outlives the screen.
  it('splits a batch at a screen change so each carries its own url', async () => {
    const { calls } = installFetch(() => ({ status: 201, body: { success: true } }));
    const selwise = await init();

    selwise.trackScreenView('app://home');
    selwise.track('product_view', { entityType: 'product', productItemCode: 'A' });
    selwise.trackScreenView('app://product');
    selwise.track('add_to_cart', { entityType: 'product', productItemCode: 'B' });
    selwise.trackScreenView('app://basket');
    await selwise.flush();

    const batches = calls.filter((call) => call.url.includes('/events/batch')).map(parseBody);
    const byUrl = new Map(batches.map((batch) => [batch.pageUrl, batch]));

    expect([...byUrl.keys()].sort()).toEqual(['app://basket', 'app://home', 'app://product']);
    // Each product event stayed on the screen it happened on.
    expect(
      byUrl.get('app://home').events.some((event: { productItemCode?: string }) => event.productItemCode === 'A')
    ).toBe(true);
    expect(
      byUrl.get('app://product').events.some((event: { productItemCode?: string }) => event.productItemCode === 'B')
    ).toBe(true);
  });

  // The ingest DTO runs forbidNonWhitelisted: an internal field left on an
  // event is a hard 400 for the whole batch.
  it('never sends the internal per-event pageUrl', async () => {
    const { calls } = installFetch(() => ({ status: 201, body: { success: true } }));
    const selwise = await init();

    selwise.trackScreenView('app://home');
    await selwise.flush();

    const batch = calls.filter((call) => call.url.includes('/events/batch')).map(parseBody)[0];
    expect(batch.pageUrl).toBe('app://home');
    for (const event of batch.events) {
      expect(event).not.toHaveProperty('pageUrl');
    }
  });

  it('keeps one batch when the screen never changed', async () => {
    const { calls } = installFetch(() => ({ status: 201, body: { success: true } }));
    const selwise = await init();

    selwise.trackScreenView('app://home');
    selwise.track('product_view', { entityType: 'product', productItemCode: 'A' });
    selwise.track('add_to_cart', { entityType: 'product', productItemCode: 'B' });
    await selwise.flush();

    const batches = calls.filter((call) => call.url.includes('/events/batch'));
    expect(batches.length).toBe(1);
  });
});

describe('identify', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  // Setting the id locally is not enough: without the server call no
  // `site_users` row exists, so the person appears in no segment and on no
  // customer profile while every event still carries their id.
  it('tells the server, merging the anonymous visitor into the user', async () => {
    const { calls } = installFetch(() => ({ status: 200, body: { success: true } }));
    const selwise = await init();

    await selwise.identify('44219', { email: 'a@b.c', firstName: 'Ayşe' });

    const identify = calls.find((call) => call.url.includes('/users/identify'));
    expect(identify).toBeDefined();
    const body = parseBody(identify as never);
    expect(body.externalId).toBe('44219');
    expect(body.email).toBe('a@b.c');
    // Everything that is not a column goes in traits.
    expect(body.traits).toEqual({ firstName: 'Ayşe' });
    expect(body.visitorId).toBeTruthy();
  });

  it('sends the signed-identity proof the app got from its backend, never as a trait', async () => {
    const { calls } = installFetch(() => ({ status: 200, body: { success: true, verified: true } }));
    const selwise = await init();
    const userHash = 'ef'.repeat(32);

    await selwise.identify('44219', { firstName: 'Ayşe' }, { userHash, userHashTs: 1792700000 });
    await selwise.identify('44220', undefined, { userHash: 'not-a-hash' });

    const bodies = calls.filter((call) => call.url.includes('/users/identify')).map((call) => parseBody(call as never));
    expect(bodies[0]).toMatchObject({ userHash, userHashTs: 1792700000, traits: { firstName: 'Ayşe' } });
    expect(bodies[1].userHash).toBeUndefined();
  });

  it('sends the api key: the identify route checks it in place of an Origin', async () => {
    const { calls } = installFetch(() => ({ status: 200, body: { success: true } }));
    const selwise = await init();

    await selwise.identify('44219');
    const identify = calls.find((call) => call.url.includes('/users/identify'));
    expect((identify?.init.headers as Record<string, string>)['x-selwise-api-key']).toBe('api-key');
  });

  // Called from a login handler, so it must never reject into a render path.
  it('keeps the local id and resolves even when the call fails', async () => {
    installFetch(() => ({ status: 500, body: { error: 'boom' } }));
    const selwise = await init();

    await expect(selwise.identify('44219')).resolves.toBeUndefined();

    const { calls } = installFetch(() => ({ status: 201, body: { success: true } }));
    selwise.track('product_view', { entityType: 'product', productItemCode: 'A' });
    await selwise.flush();
    const batch = calls.filter((call) => call.url.includes('/events/batch')).map(parseBody)[0];
    expect(batch.siteUserId).toBe('44219');
  });

  // The web widget writes an `identify` event and a scenario's "identified"
  // starter listens for it. The server's identify route writes none, so the
  // app has to — otherwise an app login never starts that journey.
  it('writes an identify event the first time a user is identified', async () => {
    const { calls } = installFetch(() => ({ status: 200, body: { success: true } }));
    const selwise = await init();

    await selwise.identify('44219', { email: 'a@b.c', firstName: 'Ayşe' });
    await selwise.flush();

    const events = calls
      .filter((call) => call.url.includes('/events/batch'))
      .flatMap((call) => (parseBody(call).events ?? []) as Array<Record<string, unknown>>);
    const identified = events.filter((event) => event.name === 'identify' || event.eventName === 'identify');
    expect(identified).toHaveLength(1);
    expect(identified[0]?.entityId).toBe('44219');
    // The address and the traits belong to the identity, never to the event.
    expect(JSON.stringify(identified[0])).not.toContain('a@b.c');
    expect(JSON.stringify(identified[0])).not.toContain('Ayşe');
  });

  it('does not write a second identify event for the person already known', async () => {
    const { calls } = installFetch(() => ({ status: 200, body: { success: true } }));
    const selwise = await init();

    await selwise.identify('44219');
    await selwise.identify('44219');
    await selwise.flush();

    const events = calls
      .filter((call) => call.url.includes('/events/batch'))
      .flatMap((call) => (parseBody(call).events ?? []) as Array<Record<string, unknown>>);
    expect(events.filter((event) => event.name === 'identify' || event.eventName === 'identify')).toHaveLength(1);
  });

  it('still writes the identify event when the server call fails', async () => {
    installFetch(() => ({ status: 500, body: { error: 'boom' } }));
    const selwise = await init();
    await selwise.identify('44219');

    const { calls } = installFetch(() => ({ status: 201, body: { success: true } }));
    await selwise.flush();
    const events = calls
      .filter((call) => call.url.includes('/events/batch'))
      .flatMap((call) => (parseBody(call).events ?? []) as Array<Record<string, unknown>>);
    expect(events.filter((event) => event.name === 'identify' || event.eventName === 'identify')).toHaveLength(1);
  });

  it('omits traits entirely when there are none', async () => {
    const { calls } = installFetch(() => ({ status: 200, body: { success: true } }));
    const selwise = await init();

    await selwise.identify('44219');
    const body = parseBody(calls.find((call) => call.url.includes('/users/identify')) as never);
    expect(body.traits).toBeUndefined();
    expect(body.email).toBeUndefined();
  });
});

describe('SDK_VERSION', () => {
  // It is sent as `clientVersion` on every event and order, so a stale value
  // mislabels the traffic of every merchant on the release. It was already one
  // patch behind package.json when this test was written.
  it('matches the package version', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json') as { version: string };
    expect(SDK_VERSION).toBe(pkg.version);
  });
});

describe('getSurfaces: the gates the app was missing', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  const CAMPAIGN = {
    id: 'camp-1',
    type: 'announcement_bar',
    contentJson: { text: 'Sezon sonu' },
    placementConfigJson: { position: 'top', placementType: 'fixed' },
    pageTargetingJson: { showOnAllPages: true },
    segmentTargetingMode: 'all',
    segmentIds: [],
  };

  /**
   * One route handler for the whole pipeline, so a test only states the parts
   * it cares about. Anything unasked answers empty, which is also what a real
   * channel with no experiments returns.
   */
  function installConfig(options: {
    campaigns?: unknown[];
    widgets?: unknown[];
    segments?: Record<string, boolean>;
    assignments?: Record<string, unknown>;
  } = {}) {
    return installFetch((call) => {
      if (call.url.includes('/segments/evaluate')) {
        return { body: { results: options.segments ?? {} } };
      }
      if (call.url.includes('/experiments/assign')) {
        return { body: options.assignments ?? {} };
      }
      if (call.url.includes('/config')) {
        return {
          body: { campaigns: options.campaigns ?? [], widgets: options.widgets ?? [] },
        };
      }
      return { body: {} };
    });
  }

  it('shows an untargeted campaign', async () => {
    installConfig({ campaigns: [CAMPAIGN] });
    const client = await init();

    const surfaces = await client.getSurfaces('app://home');
    expect(surfaces.map((s) => s.id)).toEqual(['camp-1']);
  });

  // A campaign aimed at cart abandoners used to reach every app visitor. Not a
  // missing feature — a wrong audience.
  it('hides an include-targeted campaign from a non-member', async () => {
    installConfig({
      campaigns: [
        { ...CAMPAIGN, segmentTargetingMode: 'include', segmentIds: ['seg-1'] },
      ],
      segments: { 'seg-1': false },
    });
    const client = await init();

    expect(await client.getSurfaces('app://home')).toEqual([]);
  });

  it('shows it to a member', async () => {
    installConfig({
      campaigns: [
        { ...CAMPAIGN, segmentTargetingMode: 'include', segmentIds: ['seg-1'] },
      ],
      segments: { 'seg-1': true },
    });
    const client = await init();

    expect((await client.getSurfaces('app://home')).map((s) => s.id)).toEqual(['camp-1']);
  });

  it('sends a deviceType the segment route accepts', async () => {
    const { calls } = installConfig({
      campaigns: [
        { ...CAMPAIGN, segmentTargetingMode: 'include', segmentIds: ['seg-1'] },
      ],
      segments: { 'seg-1': true },
    });
    const client = await init();
    await client.getSurfaces('app://home');

    const evaluate = calls.find((call) => call.url.includes('/segments/evaluate'))!;
    // @IsIn(['desktop','mobile','tablet']) — anything else is a 400 for the
    // whole body, which the include gate reads as "member of nothing".
    expect(parseBody(evaluate).deviceType).toBe('mobile');
    expect(parseBody(evaluate).pageUrl).toBe('app://home');
  });

  it('carries the channel in the query string for the cross-site routes', async () => {
    const { calls } = installConfig({
      campaigns: [
        { ...CAMPAIGN, segmentTargetingMode: 'include', segmentIds: ['seg-1'] },
      ],
    });
    const client = await init();
    await client.getSurfaces('app://home');

    const evaluate = calls.find((call) => call.url.includes('/segments/evaluate'))!;
    expect(evaluate.url).toBe('https://api.test/api/v1/public/segments/evaluate?siteKey=site-key');
    const assign = calls.find((call) => call.url.includes('/experiments/assign'))!;
    expect(assign.url).toContain('/public/experiments/assign?siteKey=site-key&visitorId=');
  });

  it('excludes a control that a different_module variant replaced', async () => {
    installConfig({
      campaigns: [CAMPAIGN, { ...CAMPAIGN, id: 'camp-2' }],
      assignments: {
        'exp-1': {
          experimentId: 'exp-1',
          variantId: 'var-b',
          experimentMode: 'different_module',
          targetType: 'campaign',
          effectiveTargetId: 'camp-2',
          excludedTargetIds: ['camp-1'],
        },
      },
    });
    const client = await init();

    expect((await client.getSurfaces('app://home')).map((s) => s.id)).toEqual(['camp-2']);
  });

  // The substitute is usually NOT in /config — the experiment is what activates
  // it. Without this the variant arm saw nothing while being counted into it.
  it('renders a variant module that /config never listed', async () => {
    installConfig({
      campaigns: [CAMPAIGN],
      assignments: {
        'exp-1': {
          experimentId: 'exp-1',
          variantId: 'var-b',
          experimentMode: 'different_module',
          targetType: 'campaign',
          effectiveTargetId: 'camp-variant',
          excludedTargetIds: ['camp-1'],
          moduleData: {
            id: 'camp-variant',
            type: 'announcement_bar',
            contentJson: { text: 'Varyant B' },
            placementConfigJson: { position: 'top' },
            pageTargetingJson: { showOnAllPages: true },
          },
        },
      },
    });
    const client = await init();

    const surfaces = await client.getSurfaces('app://home');
    expect(surfaces.map((s) => s.id)).toEqual(['camp-variant']);
    expect(surfaces[0]!.content.text).toBe('Varyant B');
  });

  it('still page-targets a variant module', async () => {
    installConfig({
      campaigns: [],
      assignments: {
        'exp-1': {
          experimentId: 'exp-1',
          variantId: 'var-b',
          experimentMode: 'different_module',
          targetType: 'campaign',
          effectiveTargetId: 'camp-variant',
          moduleData: {
            id: 'camp-variant',
            type: 'announcement_bar',
            contentJson: { text: 'Sadece sepette' },
            placementConfigJson: { position: 'top' },
            pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'] },
          },
        },
      },
    });
    const client = await init();

    expect(await client.getSurfaces('app://home')).toEqual([]);
    expect((await client.getSurfaces('app://basket')).map((s) => s.id)).toEqual(['camp-variant']);
  });

  // Rendering the control while REPORTING the assignment is the worst of the
  // three outcomes: the experiment looks like it ran and its numbers are noise.
  it('applies a config_override variant instead of the control content', async () => {
    installConfig({
      campaigns: [CAMPAIGN],
      assignments: {
        'exp-1': {
          experimentId: 'exp-1',
          variantId: 'var-b',
          experimentMode: 'config_override',
          targetType: 'campaign',
          targetId: 'camp-1',
          effectiveTargetId: 'camp-1',
          excludedTargetIds: [],
          config: { content: { text: 'Varyant metni' }, placement: { position: 'bottom' } },
        },
      },
    });
    const client = await init();

    const [surface] = await client.getSurfaces('app://home');
    expect(surface!.content.text).toBe('Varyant metni');
    expect(surface!.placement.position).toBe('bottom');
    expect(surface!.experiment).toEqual({ experimentId: 'exp-1', variantId: 'var-b' });
  });

  it('asks for assignments once, not once per screen', async () => {
    const { calls } = installConfig({ campaigns: [CAMPAIGN] });
    const client = await init();

    await client.getSurfaces('app://home');
    await client.getSurfaces('app://product');

    expect(calls.filter((call) => call.url.includes('/experiments/assign'))).toHaveLength(1);
  });

  // In an app the process outlives the screen, so an uncapped popup reappears
  // on every navigation.
  it('stops showing a capped surface once its allowance is spent', async () => {
    installConfig({
      campaigns: [
        {
          ...CAMPAIGN,
          placementConfigJson: { position: 'top', frequencyCap: { perSession: 1 } },
        },
      ],
    });
    const client = await init();

    const [first] = await client.getSurfaces('app://home');
    expect(first!.id).toBe('camp-1');

    await client.recordSurfaceShown(first!);
    expect(await client.getSurfaces('app://product')).toEqual([]);
  });

  it('does not spend the allowance for a surface that never drew', async () => {
    installConfig({
      campaigns: [
        {
          ...CAMPAIGN,
          placementConfigJson: { position: 'top', frequencyCap: { perSession: 1 } },
        },
      ],
    });
    const client = await init();

    await client.getSurfaces('app://home');
    expect((await client.getSurfaces('app://product')).map((s) => s.id)).toEqual(['camp-1']);
  });

  it('keeps one surface per dock rather than overlapping two bars', async () => {
    installConfig({
      campaigns: [
        { ...CAMPAIGN, placementConfigJson: { position: 'top', conflictResolution: { priority: 1 } } },
        { ...CAMPAIGN, id: 'camp-2', placementConfigJson: { position: 'top', conflictResolution: { priority: 9 } } },
      ],
    });
    const client = await init();

    expect((await client.getSurfaces('app://home')).map((s) => s.id)).toEqual(['camp-2']);
  });

  it('hands the host the merchant custom code for a custom campaign', async () => {
    installConfig({
      campaigns: [
        {
          id: 'campaign-custom',
          type: 'custom',
          contentJson: {},
          customCss: '.selwise-x{color:#d3145a}',
          customJs: 'window.selwise.track("seen")',
          placementConfigJson: { placementType: 'selector', selector: '#x' },
          pageTargetingJson: { showOnAllPages: true },
        },
      ],
    });
    const client = await init();

    const [surface] = await client.getSurfaces('app://home');
    // Empty contentJson is normally "skip this, the merchant configured
    // nothing" — but for a `custom` type the code IS the content, and gating
    // on contentJson alone hid every custom surface written in those fields.
    expect(surface!.customCss).toBe('.selwise-x{color:#d3145a}');
    expect(surface!.customJs).toBe('window.selwise.track("seen")');
  });

  it('skips an entity with no content and no custom code', async () => {
    installConfig({ campaigns: [{ ...CAMPAIGN, contentJson: {} }] });
    const client = await init();

    expect(await client.getSurfaces('app://home')).toEqual([]);
  });

  it('renders the control when the assignment fetch fails', async () => {
    installFetch((call) => {
      if (call.url.includes('/experiments/assign')) return { status: 500, body: {} };
      if (call.url.includes('/config')) return { body: { campaigns: [CAMPAIGN], widgets: [] } };
      return { body: {} };
    });
    const client = await init();

    expect((await client.getSurfaces('app://home')).map((s) => s.id)).toEqual(['camp-1']);
  });
});

describe('the dashboard settings the app used to ignore', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  function installWithTracking(
    tracking: Record<string, unknown>,
    extra: Record<string, unknown> = {}
  ) {
    return installFetch((call) => {
      if (call.url.includes('/config')) return { body: { tracking, ...extra } };
      return { body: {} };
    });
  }

  // A merchant who set a batch size of 5 to watch events arrive during a demo
  // got the SDK's local default of 20 and concluded nothing was landing.
  it('applies the dashboard batch size', async () => {
    const { calls } = installWithTracking({ batchSize: 2 });
    const selwise = await init();
    await selwise.getSurfaces('app://home');

    selwise.track('a');
    selwise.track('b');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(1);
  });

  it('lets an explicitly passed option win over the dashboard', async () => {
    const { calls } = installWithTracking({ batchSize: 2 });
    const selwise = await init({ batchSize: 50 });
    await selwise.getSurfaces('app://home');

    selwise.track('a');
    selwise.track('b');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls.filter((call) => call.url.includes('/events/batch'))).toHaveLength(0);
  });

  it('reads flushInterval as seconds, not milliseconds', async () => {
    installWithTracking({ flushInterval: 30 });
    const selwise = await init();
    await selwise.getSurfaces('app://home');

    // Taken verbatim, 30 would be 30ms and put a request behind every event.
    selwise.track('a');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((globalThis.fetch as jest.Mock).mock.calls.filter(
      ([url]) => String(url).includes('/events/batch')
    )).toHaveLength(0);
  });

  it('turns debug on when the dashboard asks, and never off', async () => {
    installWithTracking({ debugMode: false });
    const logs: unknown[] = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args));

    const selwise = await init({ debug: true });
    await selwise.getSurfaces('app://home');
    selwise.track('a');

    expect(logs.length).toBeGreaterThan(0);
  });

  // The server resolves the country from the request ip; an app cannot know it,
  // so a country-targeted campaign matched nothing until this default existed.
  it('uses the server-resolved country for targeting', async () => {
    const targeted = {
      id: 'camp-tr',
      type: 'announcement_bar',
      contentJson: { text: 'Türkiye' },
      placementConfigJson: { position: 'top' },
      pageTargetingJson: { showOnAllPages: true, geo: { mode: 'include', countries: ['TR'] } },
    };
    installFetch((call) => {
      if (call.url.includes('/config')) {
        return { body: { campaigns: [targeted], widgets: [], geo: { country: 'TR' } } };
      }
      return { body: {} };
    });
    const selwise = await init();

    expect((await selwise.getSurfaces('app://home')).map((s) => s.id)).toEqual(['camp-tr']);
  });

  it('lets the host override the resolved country', async () => {
    const targeted = {
      id: 'camp-tr',
      type: 'announcement_bar',
      contentJson: { text: 'Türkiye' },
      placementConfigJson: { position: 'top' },
      pageTargetingJson: { showOnAllPages: true, geo: { mode: 'include', countries: ['TR'] } },
    };
    installFetch((call) => {
      if (call.url.includes('/config')) {
        return { body: { campaigns: [targeted], widgets: [], geo: { country: 'TR' } } };
      }
      return { body: {} };
    });
    const selwise = await init();

    expect(await selwise.getSurfaces('app://home', { country: 'DE' })).toEqual([]);
  });

  // A web channel's key in an app is a 403 on every write with nothing in the
  // response that says why.
  it('says so when a web channel key is used in an app', async () => {
    installWithTracking({}, { channel: { type: 'web' } });
    const logs: string[] = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));

    const selwise = await init({ debug: true });
    await selwise.getSurfaces('app://home');

    expect(logs.join('\n')).toMatch(/WEB channel key/);
  });

  it('exposes the brand theme and search status to the host', async () => {
    installWithTracking({}, {
      theme: { '--selwise-brand': '#d3145a' },
      search: { enabled: true, isTestMode: true },
    });
    const selwise = await init();
    await selwise.getSurfaces('app://home');

    expect(selwise.getTheme()).toEqual({ '--selwise-brand': '#d3145a' });
    expect(selwise.getSearchStatus()).toEqual({ enabled: true, testMode: true });
  });

  it('searches only for a test-mode client while search is in test mode', async () => {
    const { calls } = installWithTracking({}, { search: { enabled: true, isTestMode: true } });
    const shopper = await init();
    expect((await shopper.search('gomlek')).hits).toEqual([]);
    expect(calls.some((call) => call.url.includes('/search?'))).toBe(false);
    await shopper.destroy();

    const tester = await init({ testMode: true });
    await tester.search('gomlek');
    expect(calls.some((call) => call.url.includes('/search?'))).toBe(true);
    await tester.destroy();
  });

  it('fetches /config once even when surfaces and settings both need it', async () => {
    const { calls } = installWithTracking({ batchSize: 5 });
    const selwise = await init();

    await Promise.all([
      selwise.getSurfaces('app://home'),
      selwise.getSurfaces('app://product'),
    ]);

    expect(calls.filter((call) => call.url.includes('/config'))).toHaveLength(1);
  });

  it('retries /config on a later screen when the launch started offline', async () => {
    let fail = true;
    const { calls } = installFetch((call) => {
      if (call.url.includes('/config')) {
        return fail ? { status: 500, body: {} } : { body: { campaigns: [], widgets: [] } };
      }
      return { body: {} };
    });
    const selwise = await init();

    expect(await selwise.getSurfaces('app://home')).toEqual([]);
    fail = false;
    await selwise.getSurfaces('app://product');

    expect(calls.filter((call) => call.url.includes('/config')).length).toBeGreaterThan(1);
  });
});

describe('search redirects', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  // A redirect is an ANSWER, not a failed search: "kargo" sends the visitor to
  // the shipping page, usually with zero hits. Counting it as a zero-result
  // fills the merchant's zero-results report with their own rules.
  it('does not report a redirect as a zero-result search', async () => {
    const { calls } = installFetch((call) => {
      if (call.url.includes('/search')) {
        return { body: { hits: [], total: 0, redirect: '/kargo-bilgileri' } };
      }
      return { body: {} };
    });
    const selwise = await init();

    const result = await selwise.search('kargo');
    expect(result.redirect).toBe('/kargo-bilgileri');

    await selwise.flush();
    const batch = calls.find((call) => call.url.includes('/events/batch')) as FetchCall;
    const [event] = parseBody(batch).events;
    expect(event.name).toBe('search_query');
    expect(event.metadata.redirect).toBe('/kargo-bilgileri');
  });

  it('still reports a real zero-result search', async () => {
    const { calls } = installFetch((call) => {
      if (call.url.includes('/search')) return { body: { hits: [], total: 0 } };
      return { body: {} };
    });
    const selwise = await init();

    await selwise.search('yoktur');
    await selwise.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch')) as FetchCall;
    expect(parseBody(batch).events[0].name).toBe('search_zero_results');
  });
});

describe('product enrichment', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  const RULE = {
    assignmentId: 'rule-1',
    placementKey: 'pdp-specs',
    order: 0,
    html: '<div><table><tr><td>Garanti</td><td>24 ay</td></tr></table></div>',
    css: '[data-selwise-enrichment="b1"] table { width: 100% }',
    reservedHeightPx: 120,
  };

  /**
   * `/config` carries the digest, and the digest stamp is what makes caching
   * rendered markup safe — so a harness that omits it is testing the
   * cache-miss path by accident.
   */
  function installEnrichment(options: {
    items?: unknown[];
    keys?: string[];
    version?: string;
    segments?: Record<string, boolean>;
  } = {}) {
    return installFetch((call) => {
      if (call.url.includes('/segments/evaluate')) {
        return { body: { results: options.segments ?? {} } };
      }
      if (call.url.includes('/app/enrichments')) {
        return {
          body: {
            v: options.version ?? 'stamp.3',
            code: 'KM1',
            resolved: true,
            slots: ['pdp-specs'],
            items: options.items ?? [RULE],
          },
        };
      }
      if (call.url.includes('/config')) {
        return {
          body: {
            campaigns: [],
            widgets: [],
            enrichment: {
              enabled: false,
              v: options.version ?? 'stamp.3',
              slots: [],
              keys: options.keys ?? ['pdp-specs'],
            },
          },
        };
      }
      return { body: {} };
    });
  }

  it('returns the merchant markup for a named slot', async () => {
    installEnrichment();
    const client = await init();
    await client.getSurfaces('app://product');

    const result = await client.getEnrichment('KM1', ['pdp-specs']);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.html).toContain('24 ay');
    expect(result.items[0]!.css).toContain('width: 100%');
    expect(result.resolved).toBe(true);
  });

  it('sends the folded slot name and the product code', async () => {
    const { calls } = installEnrichment();
    const client = await init();

    await client.getEnrichment('KM1', ['PDP Specs']);

    const request = calls.find((call) => call.url.includes('/app/enrichments'))!;
    // The server folds on the way in, so an unfolded name would ask for a slot
    // that cannot exist.
    expect(request.url).toContain('slots=pdp-specs');
    expect(request.url).toContain('code=KM1');
  });

  it('asks for nothing without a code or a slot', async () => {
    const { calls } = installEnrichment();
    const client = await init();

    expect((await client.getEnrichment('', ['pdp-specs'])).items).toEqual([]);
    expect((await client.getEnrichment('KM1', [])).items).toEqual([]);
    expect((await client.getEnrichment('KM1', ['???'])).items).toEqual([]);
    expect(calls.filter((call) => call.url.includes('/app/enrichments'))).toHaveLength(0);
  });

  // A product screen re-mounts constantly — a back navigation, a variant
  // switch, a tab change — and the answer for one product does not change.
  it('serves a second look at the same product from cache', async () => {
    const { calls } = installEnrichment();
    const client = await init();
    await client.getSurfaces('app://product');

    await client.getEnrichment('KM1', ['pdp-specs']);
    await client.getEnrichment('KM1', ['pdp-specs']);

    expect(calls.filter((call) => call.url.includes('/app/enrichments'))).toHaveLength(1);
  });

  it('refetches after invalidateEnrichment', async () => {
    const { calls } = installEnrichment();
    const client = await init();
    await client.getSurfaces('app://product');

    await client.getEnrichment('KM1', ['pdp-specs']);
    client.invalidateEnrichment();
    await client.getEnrichment('KM1', ['pdp-specs']);

    expect(calls.filter((call) => call.url.includes('/app/enrichments'))).toHaveLength(2);
  });

  // Enrichment is the module a merchant touches most; segment targeting on it
  // has to behave exactly as it does for campaigns and widgets.
  it('hides a rule the visitor is not segmented into', async () => {
    installEnrichment({
      items: [{ ...RULE, segmentTargetingMode: 'include', segmentIds: ['seg-1'] }],
      segments: { 'seg-1': false },
    });
    const client = await init();

    expect((await client.getEnrichment('KM1', ['pdp-specs'])).items).toEqual([]);
  });

  it('shows it to a member of that segment', async () => {
    installEnrichment({
      items: [{ ...RULE, segmentTargetingMode: 'include', segmentIds: ['seg-1'] }],
      segments: { 'seg-1': true },
    });
    const client = await init();

    expect((await client.getEnrichment('KM1', ['pdp-specs'])).items).toHaveLength(1);
  });

  // A gate, not a filter — the same rule campaigns and widgets follow.
  it('hides a test-mode rule from a real visitor', async () => {
    installEnrichment({ items: [{ ...RULE, isTestMode: true }] });
    const client = await init();

    expect((await client.getEnrichment('KM1', ['pdp-specs'])).items).toEqual([]);
  });

  it('shows a tester the test-mode rule and nothing else', async () => {
    installEnrichment({
      items: [RULE, { ...RULE, assignmentId: 'rule-test', isTestMode: true }],
    });
    const client = await init({ testMode: true });

    const result = await client.getEnrichment('KM1', ['pdp-specs']);
    expect(result.items.map((item) => item.assignmentId)).toEqual(['rule-test']);
  });

  it('asks the server for test-mode rules when in test mode', async () => {
    const { calls } = installEnrichment();
    const client = await init({ testMode: true });

    await client.getEnrichment('KM1', ['pdp-specs']);

    expect(calls.find((call) => call.url.includes('/app/enrichments'))!.url).toContain('test=1');
  });

  it('returns nothing rather than throwing when the fetch fails', async () => {
    installFetch((call) => {
      if (call.url.includes('/app/enrichments')) return { status: 500, body: {} };
      return { body: {} };
    });
    const client = await init();

    const result = await client.getEnrichment('KM1', ['pdp-specs']);
    expect(result.items).toEqual([]);
  });

  // One impression per RULE however many blocks it stacks — the server puts a
  // rule's blocks into one root for exactly this reason.
  it('reports an impression with the browser widget entity pair', async () => {
    const { calls } = installEnrichment();
    const client = await init();

    const [item] = (await client.getEnrichment('KM1', ['pdp-specs'])).items;
    client.trackEnrichmentView(item!);
    await client.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch'))!;
    const [event] = parseBody(batch).events;
    expect(event.name).toBe('impression');
    // `enrichment`, not `widget`: this sent `widget` until September 2026, so
    // every app enrichment impression landed in the campaign funnel and the
    // enrichment report undercounted by exactly the app's traffic.
    expect(event.entityType).toBe('enrichment');
    expect(event.entityId).toBe('rule-1');
    expect(event.metadata.surfaceType).toBe('enrichment');
    expect(event.metadata.placementKey).toBe('pdp-specs');
  });

  it('reports a click on the same pair', async () => {
    const { calls } = installEnrichment();
    const client = await init();

    const [item] = (await client.getEnrichment('KM1', ['pdp-specs'])).items;
    client.trackEnrichmentClick(item!, { linkUrl: '/kargo' });
    await client.flush();

    const batch = calls.find((call) => call.url.includes('/events/batch'))!;
    const [event] = parseBody(batch).events;
    expect(event.name).toBe('click');
    expect(event.metadata.linkUrl).toBe('/kargo');
  });

  it('publishes the slots a merchant configured, so a screen need not guess', async () => {
    installEnrichment({ keys: ['pdp-specs', 'pdp-faq'] });
    const client = await init();
    await client.getSurfaces('app://product');

    expect(client.getEnrichmentSlots()).toEqual(['pdp-specs', 'pdp-faq']);
  });

  it('groups a slot rules in stacking order', async () => {
    installEnrichment({
      items: [
        { ...RULE, assignmentId: 'b', order: 1 },
        { ...RULE, assignmentId: 'a', order: 0 },
        { ...RULE, assignmentId: 'c', placementKey: 'pdp-faq' },
      ],
    });
    const client = await init();

    const result = await client.getEnrichment('KM1', ['pdp-specs', 'pdp-faq']);
    expect(client.enrichmentForSlot(result, 'pdp-specs').map((i) => i.assignmentId)).toEqual([
      'a',
      'b',
    ]);
    expect(client.enrichmentForSlot(result, 'pdp-faq').map((i) => i.assignmentId)).toEqual(['c']);
  });
});

describe('the basket, content states and the goal bar', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  });

  function installChannel(campaigns: unknown[], channel: Record<string, unknown> = { type: 'app', currency: 'TRY' }) {
    return installFetch((call) => {
      if (call.url.includes('/config')) return { body: { campaigns, widgets: [], channel } };
      return { body: {} };
    });
  }

  const BAR = {
    id: 'camp-bar',
    type: 'announcement_bar',
    contentJson: { text: 'Sezon sonu' },
    placementConfigJson: { position: 'top', placementType: 'fixed' },
    pageTargetingJson: { showOnAllPages: true },
  };

  const GOAL = {
    id: 'camp-goal',
    type: 'goal_bar',
    contentJson: {
      metric: 'cart_total',
      thresholds: [{ at: 750, label: 'Ücretsiz kargo' }, { at: 1500, label: 'Hediye çanta' }],
      text: '{goal.label} için {goal.remaining} kaldı',
      completeText: 'Tebrikler!',
    },
    placementConfigJson: { position: 'bottom', placementType: 'fixed' },
    pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'] },
  };

  // The API withholds a placeholder-using campaign from a client that does not
  // say it can fill them; an older SDK would hand the host raw braces.
  it('announces the placeholder protocol on /config', async () => {
    const { calls } = installChannel([]);
    const client = await init();
    await client.getSurfaces('app://home');
    const config = calls.find((call) => call.url.includes('/config'))!;
    // 5: the cart and product placeholders, the product conditions and the
    // consent conditions.
    expect(new URL(config.url).searchParams.get('p')).toBe('5');
  });

  // A scenario claim whose campaign this SDK cannot draw would be closed as
  // missing; announced, the server leaves it pending instead.
  it('announces the same protocol on the scenario inbox', async () => {
    const { calls } = installFetch((call) => {
      if (call.url.includes('/config')) return { body: { campaigns: [], widgets: [], scenarios: { enabled: true } } };
      return { body: { entries: [] } };
    });
    const client = await init();
    await client.getSurfaces('app://home');
    await client.getScenarioInbox();
    const config = calls.find((call) => call.url.includes('/config'))!;
    const inbox = calls.find((call) => call.url.includes('/scenarios/inbox'))!;
    expect(new URL(inbox.url).searchParams.get('p')).toBe(new URL(config.url).searchParams.get('p'));
  });

  it('starts with an unknown cart, before and after init', async () => {
    const client = new Selwise();
    expect(client.getCart().known).toBe(false);
    // A host's basket subscription may fire before init resolves.
    expect(client.setCart({ total: 120, itemCount: 1 })).toBe(true);
    installChannel([]);
    await client.init({
      siteKey: 'site-key',
      apiKey: 'api-key',
      apiUrl: 'https://api.test/api/v1',
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
    });
    expect(client.getCart()).toEqual({ known: true, total: 120, itemCount: 1, currency: null });

    // A fresh instance — a relaunch — starts unknown again: memory only.
    const relaunched = await init();
    expect(relaunched.getCart().known).toBe(false);
  });

  it('tells listeners about a change and stops when unsubscribed', async () => {
    installChannel([]);
    const client = await init();
    const totals: number[] = [];
    const stop = client.onCartChange((cart) => totals.push(cart.total));
    client.setCart({ total: 100, itemCount: 1 });
    client.setCart({ total: 100, itemCount: 1 });
    stop();
    client.setCart({ total: 300, itemCount: 2 });
    expect(totals).toEqual([100]);
  });

  it('targets on the cart the host set when it passes no behaviour', async () => {
    installChannel([
      {
        ...BAR,
        pageTargetingJson: {
          showOnAllPages: true,
          behavior: { match: 'all', rules: [{ signal: 'cartValue', op: 'gte', value: 500 }] },
        },
      },
    ]);
    const client = await init();

    expect(await client.getSurfaces('app://home')).toEqual([]);
    client.setCart({ total: 640, itemCount: 3 });
    expect((await client.getSurfaces('app://home')).map((s) => s.id)).toEqual(['camp-bar']);
    // The host's own value wins over the SDK's cart.
    expect(await client.getSurfaces('app://home', { behavior: { cartValue: 10 } })).toEqual([]);
  });

  it('applies a content state and names it', async () => {
    installChannel([
      {
        ...BAR,
        contentJson: {
          text: 'Sezon sonu',
          states: [
            {
              id: 'big-basket',
              when: { match: 'all', rules: [{ signal: 'cartItemCount', op: 'gte', value: 2 }] },
              content: { text: 'İkinci ürüne %20' },
            },
          ],
        },
      },
    ]);
    const client = await init();

    const [base] = await client.getSurfaces('app://home');
    expect(base?.content).toEqual({ text: 'Sezon sonu' });
    expect(base?.stateId).toBeNull();

    client.setCart({ total: 300, itemCount: 2 });
    const [state] = await client.getSurfaces('app://home');
    expect(state?.content).toEqual({ text: 'İkinci ürüne %20' });
    expect(state?.stateId).toBe('big-basket');
  });

  // It was not shown: it must not take the dock from one that would have.
  it('drops a campaign its state hides, before conflict resolution', async () => {
    installChannel([
      {
        ...BAR,
        id: 'camp-hidden',
        placementConfigJson: { position: 'top', placementType: 'fixed', priority: 10 },
        contentJson: {
          text: 'Gizlenecek',
          states: [
            {
              id: 'hide-for-buyers',
              when: { match: 'all', rules: [{ signal: 'cartItemCount', op: 'gte', value: 1 }] },
              hide: true,
            },
          ],
        },
      },
      { ...BAR, id: 'camp-low', placementConfigJson: { position: 'top', placementType: 'fixed', priority: 1 } },
    ]);
    const client = await init();
    expect((await client.getSurfaces('app://home')).map((s) => s.id)).toEqual(['camp-hidden']);

    client.setCart({ total: 50, itemCount: 1 });
    expect((await client.getSurfaces('app://home')).map((s) => s.id)).toEqual(['camp-low']);
  });

  it('fills campaign placeholders, in the channel currency, and never hands over braces', async () => {
    installChannel([{ ...BAR, contentJson: { text: 'Sepetin {cart.total} — {cart.itemCount} ürün' } }]);
    const client = await init();

    // An unmeasured cart cannot be said: the campaign waits.
    expect(await client.getSurfaces('app://home')).toEqual([]);

    client.setCart({ total: 640, itemCount: 3 });
    const [surface] = await client.getSurfaces('app://home', { locale: 'tr-TR' });
    expect(surface?.content.text).toMatch(/^Sepetin .*640.* — 3 ürün$/);
    expect(String(surface?.content.text)).not.toContain('{');
  });

  it('fills product placeholders from the product the host passes, and only then', async () => {
    installChannel([{ ...BAR, contentJson: { text: 'Son {product.stock} ürün — {product.title}' } }]);
    const client = await init();

    // No product on this screen: the campaign is not handed over at all.
    expect(await client.getSurfaces('app://product')).toEqual([]);

    const [surface] = await client.getSurfaces('app://product', {
      locale: 'tr-TR',
      product: { title: 'Kırmızı ruj', price: '899.00', originalPrice: '1200.00', stock: 3, currency: 'TRY' },
    });
    expect(surface?.content.text).toBe('Son 3 ürün — Kırmızı ruj');

    // Zero stock says nothing: dropped rather than "Son 0 ürün".
    expect(await client.getSurfaces('app://product', { product: { title: 'x', stock: 0 } })).toEqual([]);
  });

  it('falls back to the base sentence when the product is not on sale', async () => {
    installChannel([
      {
        ...BAR,
        contentJson: {
          text: 'Ücretsiz kargo',
          states: [
            {
              id: 'sale',
              when: { match: 'all', rules: [{ signal: 'cartItemCount', op: 'gte', value: 0 }] },
              content: { text: 'Bu üründe {product.discountAmount} tasarruf' },
            },
          ],
        },
      },
    ]);
    const client = await init();
    const product = { price: 899, originalPrice: 1200, currency: 'TRY' };

    const [onSale] = await client.getSurfaces('app://product', { locale: 'tr-TR', product });
    expect(onSale?.content.text).toBe('Bu üründe ₺301 tasarruf');
    expect(onSale?.stateId).toBe('sale');

    const [fullPrice] = await client.getSurfaces('app://product', {
      locale: 'tr-TR',
      product: { ...product, originalPrice: null },
    });
    expect(fullPrice?.content.text).toBe('Ücretsiz kargo');
    expect(fullPrice?.stateId).toBeNull();
  });

  describe('product conditions', () => {
    const lowStock = { match: 'all', rules: [{ signal: 'productStock', op: 'lt', value: 5 }] };

    it('choose a state by the product the host passes, and yield without one', async () => {
      installChannel([
        {
          ...BAR,
          contentJson: {
            text: 'Ücretsiz kargo',
            states: [{ id: 'low', when: lowStock, content: { text: 'Son {product.stock} ürün' } }],
          },
        },
      ]);
      const client = await init();

      const [low] = await client.getSurfaces('app://product', { product: { price: 10, stock: 3 } });
      expect(low?.content.text).toBe('Son 3 ürün');
      expect(low?.stateId).toBe('low');

      // 1,500 in stock: the low-stock sentence is not said.
      const [plenty] = await client.getSurfaces('app://product', { product: { price: 10, stock: 1500 } });
      expect(plenty?.content.text).toBe('Ücretsiz kargo');

      // No product on this screen: the condition does not match.
      const [home] = await client.getSurfaces('app://home');
      expect(home?.content.text).toBe('Ücretsiz kargo');
    });

    it('hold a state about the product back while the host says it is still loading', async () => {
      installChannel([
        {
          ...BAR,
          contentJson: {
            text: 'Ücretsiz kargo',
            states: [{ id: 'low', when: lowStock, content: { text: 'Son ürünler' } }],
          },
        },
        { ...BAR, id: 'camp-plain', placementConfigJson: { position: 'bottom', placementType: 'fixed' } },
      ]);
      const client = await init();
      const surfaces = await client.getSurfaces('app://product', { product: { pending: true } });
      // The plain bar is unaffected; the one whose state waits on the product is held.
      expect(surfaces.map((surface) => surface.id)).toEqual(['camp-plain']);
    });

    it('target a surface by the product, and never on a screen without one', async () => {
      installChannel([{ ...BAR, pageTargetingJson: { showOnAllPages: true, behavior: lowStock } }]);
      const client = await init();
      expect(await client.getSurfaces('app://home')).toEqual([]);
      expect(await client.getSurfaces('app://product', { product: { price: 10, stock: 1500 } })).toEqual([]);
      expect(await client.getSurfaces('app://product', { product: { price: 10, stock: 2 } })).toHaveLength(1);
    });

    it('announce the protocol on the assignment request too', async () => {
      const { calls } = installChannel([]);
      const client = await init();
      await client.getSurfaces('app://home');
      const assign = calls.find((call) => call.url.includes('/experiments/assign'))!;
      expect(new URL(assign.url).searchParams.get('p')).toBe('5');
    });
  });

  it('drops a money placeholder when neither the basket nor the channel has a currency', async () => {
    installChannel([{ ...BAR, contentJson: { text: '{cart.total} seni bekliyor' } }], { type: 'app' });
    const client = await init();
    client.setCart({ total: 640, itemCount: 3 });
    expect(await client.getSurfaces('app://home')).toEqual([]);

    client.setCart({ total: 640, itemCount: 3, currency: 'EUR' });
    expect(await client.getSurfaces('app://home')).toHaveLength(1);
  });

  describe('resolveGoalBar', () => {
    it('stays hidden until the host has measured the cart', async () => {
      installChannel([GOAL]);
      const client = await init();
      const [bar] = await client.getSurfaces('app://basket');
      expect(bar?.type).toBe('goal_bar');
      // Not filled by getSurfaces: the bar's sentences belong to resolveGoalBar.
      expect(bar?.content.text).toBe('{goal.label} için {goal.remaining} kaldı');

      const view = client.resolveGoalBar(bar!);
      expect(view.visible).toBe(false);
      expect(view.state).toBe('unknown');
    });

    it('says the sentence for the cart, in the channel currency', async () => {
      installChannel([GOAL]);
      const client = await init();
      const [bar] = await client.getSurfaces('app://basket');

      client.setCart({ total: 349, itemCount: 2 });
      const view = client.resolveGoalBar(bar!, { locale: 'tr-TR' });
      expect(view.visible).toBe(true);
      expect(view.state).toBe('progress');
      expect(view.text).toMatch(/^Ücretsiz kargo için .*401.* kaldı$/);
      expect(view.progress?.reachedCount).toBe(0);

      client.setCart({ total: 1600, itemCount: 5 });
      const done = client.resolveGoalBar(bar!);
      expect(done.state).toBe('complete');
      expect(done.text).toBe('Tebrikler!');
    });

    it('answers hidden for anything that is not a goal bar', async () => {
      installChannel([BAR]);
      const client = await init();
      client.setCart({ total: 349, itemCount: 2 });
      const [bar] = await client.getSurfaces('app://home');
      expect(client.resolveGoalBar(bar!).visible).toBe(false);
    });
  });

  describe('trackGoalReached', () => {
    it('sends goal_reached once per session per step, with the web widget metadata', async () => {
      const { calls } = installChannel([]);
      const client = await init();
      const surface = { id: 'camp-goal', type: 'goal_bar' };

      expect(client.trackGoalReached(surface, { step: 0, threshold: 750, metric: 'cart_total' })).toBe(true);
      expect(client.trackGoalReached(surface, { step: 0, threshold: 750, metric: 'cart_total' })).toBe(false);
      expect(client.trackGoalReached(surface, { step: 1, threshold: 1500, metric: 'cart_total' })).toBe(true);
      await client.flush();

      const events = calls
        .filter((call) => call.url.includes('/events/batch'))
        .flatMap((call) => parseBody(call).events);
      expect(events.filter((event: any) => event.name === 'goal_reached')).toEqual([
        expect.objectContaining({
          entityType: 'campaign',
          entityId: 'camp-goal',
          metadata: { step: 0, threshold: 750, metric: 'cart_total' },
        }),
        expect.objectContaining({ metadata: { step: 1, threshold: 1500, metric: 'cart_total' } }),
      ]);
    });

    // The plugin keeps the surface; the bar's own content is the truth about
    // its steps, so `{ step }` is enough.
    it('reads the threshold and metric from the surface content', async () => {
      const { calls } = installChannel([GOAL]);
      const client = await init();
      const [bar] = await client.getSurfaces('app://basket');

      expect(client.trackGoalReached(bar!, { step: 1 })).toBe(true);
      expect(client.trackGoalReached(bar!, { step: 2 })).toBe(false);
      await client.flush();

      const event = calls
        .filter((call) => call.url.includes('/events/batch'))
        .flatMap((call) => parseBody(call).events)
        .find((candidate: any) => candidate.name === 'goal_reached');
      expect(event.metadata).toEqual({ step: 1, threshold: 1500, metric: 'cart_total' });
    });

    it('ignores a step that is not one', async () => {
      installChannel([]);
      const client = await init();
      expect(
        client.trackGoalReached({ id: 'camp-goal', type: 'goal_bar' }, { step: -1, threshold: 750, metric: 'cart_total' })
      ).toBe(false);
      expect(
        client.trackGoalReached(
          { id: 'camp-goal', type: 'goal_bar' },
          { step: 0, threshold: 750, metric: 'revenue' as never }
        )
      ).toBe(false);
    });

    it('does nothing before init', () => {
      expect(
        new Selwise().trackGoalReached({ id: 'x', type: 'goal_bar' }, { step: 0, threshold: 1, metric: 'cart_total' })
      ).toBe(false);
    });
  });
});
