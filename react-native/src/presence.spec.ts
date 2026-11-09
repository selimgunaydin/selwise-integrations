import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';
import { normalizeRemoteConfig } from './core/remote-config.js';

interface FetchCall {
  url: string;
  init: RequestInit;
}

const MINUTE = 60_000;

function installFetch(presence: { intervalMs: number } | null, presenceStatus = 200) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    let status = 200;
    let body: unknown = {};
    if (call.url.includes('/config')) {
      body = { tracking: presence ? { presence } : {}, channel: { type: 'app' } };
    } else if (call.url.endsWith('/presence')) {
      status = presenceStatus;
      body = { accepted: true, live: true, intervalMs: MINUTE };
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  return calls;
}

const presenceCalls = (calls: FetchCall[]) => calls.filter((call) => call.url.endsWith('/presence'));

async function start(consent = { granted: true, categories: { analytics: true } }) {
  const selwise = new Selwise();
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    consent,
  });
  // `/config` is loaded in the background by init().
  await jest.advanceTimersByTimeAsync(0);
  return selwise;
}

describe('the live heartbeat in the app', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('beats when /config switches it on, with the visitor and the consent', async () => {
    const calls = installFetch({ intervalMs: MINUTE });
    const selwise = await start();
    selwise.setScreen('app://product/ceket');
    await jest.advanceTimersByTimeAsync(MINUTE);

    const beats = presenceCalls(calls);
    expect(beats).toHaveLength(1);
    expect(beats[0]!.url).toBe('https://api.test/api/v1/public/sites/site-key/presence');
    const body = JSON.parse(String(beats[0]!.init.body));
    expect(Object.keys(body).sort()).toEqual(['consentSnapshot', 'sessionId', 'visitorId']);
    expect(body).toMatchObject({
      consentSnapshot: { granted: true, categories: { analytics: true } },
      visitorId: expect.any(String),
      sessionId: expect.any(String),
    });
    await selwise.destroy();
  });

  it('sends none when the API does not ask for it (an older API, or switched off)', async () => {
    const calls = installFetch(null);
    const selwise = await start();
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(presenceCalls(calls)).toHaveLength(0);
    await selwise.destroy();
  });

  it('sends none without analytics consent', async () => {
    const calls = installFetch({ intervalMs: MINUTE });
    const selwise = await start({ granted: true, categories: { analytics: false } });
    await jest.advanceTimersByTimeAsync(3 * MINUTE);
    expect(presenceCalls(calls)).toHaveLength(0);
    await selwise.destroy();
  });

  it('follows setAppState: silent in the background, one beat on coming back', async () => {
    const calls = installFetch({ intervalMs: MINUTE });
    const selwise = await start();
    selwise.setAppState('background');
    await jest.advanceTimersByTimeAsync(3 * MINUTE);
    expect(presenceCalls(calls)).toHaveLength(0);

    selwise.setAppState('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(presenceCalls(calls)).toHaveLength(1);
    await selwise.destroy();
  });

  it('flushes the queue when the app leaves the foreground', async () => {
    const calls = installFetch({ intervalMs: MINUTE });
    const selwise = await start();
    selwise.track('page_view', { entityType: 'page' });
    selwise.setAppState('inactive');
    await jest.advanceTimersByTimeAsync(0);
    expect(calls.some((call) => call.url.endsWith('/events/batch'))).toBe(true);
    await selwise.destroy();
  });

  it('stops beating on a rejected channel key', async () => {
    const calls = installFetch({ intervalMs: MINUTE }, 404);
    const selwise = await start();
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(presenceCalls(calls)).toHaveLength(1);
    await selwise.destroy();
  });

  it('skips the beat an accepted event batch already covered', async () => {
    const calls = installFetch({ intervalMs: MINUTE });
    const selwise = await start();
    await jest.advanceTimersByTimeAsync(MINUTE / 2);
    selwise.track('page_view', { entityType: 'page' });
    await selwise.flush();
    await jest.advanceTimersByTimeAsync(MINUTE / 2);
    expect(presenceCalls(calls)).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(presenceCalls(calls)).toHaveLength(1);
    await selwise.destroy();
  });

  it('stops on destroy', async () => {
    const calls = installFetch({ intervalMs: MINUTE });
    const selwise = await start();
    await selwise.destroy();
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(presenceCalls(calls)).toHaveLength(0);
  });
});

describe('normalizeRemoteConfig → tracking.presence', () => {
  it('reads the setting, and leaves it out when the API sends none', () => {
    expect(normalizeRemoteConfig({ tracking: { presence: { intervalMs: 90000 } } }).tracking.presence).toEqual({
      intervalMs: 90000,
    });
    expect(normalizeRemoteConfig({ tracking: { presence: {} } }).tracking.presence).toEqual({});
    expect(normalizeRemoteConfig({ tracking: {} }).tracking.presence).toBeUndefined();
  });
});
