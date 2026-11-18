import { Selwise, SDK_VERSION } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * The app telling the dashboard which screens and named points it has, and which
 * SDK and plugin it runs. A courtesy: batched, once per name per session, never
 * a failure the app sees.
 */

interface FetchCall {
  url: string;
  init: RequestInit;
}

function installFetch(fail = false) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    if (fail && String(url).includes('/client-report')) throw new Error('offline');
    return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
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

const reports = (calls: FetchCall[]) =>
  calls
    .filter((call) => call.url.endsWith('/client-report'))
    .map((call) => JSON.parse(String(call.init.body)) as Record<string, unknown>);

describe('integration report', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends the versions alone shortly after init, then each new screen and point once', async () => {
    const calls = installFetch();
    const selwise = await init({ pluginVersion: '0.12.0', appVersion: '3.4.1' });

    await jest.advanceTimersByTimeAsync(3100);
    expect(reports(calls)).toEqual([
      {
        screens: [],
        slots: [],
        libraryVersion: SDK_VERSION,
        pluginVersion: '0.12.0',
        appVersion: '3.4.1',
        testMode: false,
      },
    ]);

    selwise.setScreen('app://home');
    selwise.registerSlot('home-top');
    selwise.setScreen('app://home');
    selwise.registerSlot('home-top');
    selwise.registerSlot('home-bottom');
    await jest.advanceTimersByTimeAsync(3100);

    const sent = reports(calls);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ screens: ['app://home'], slots: ['home-top', 'home-bottom'] });

    // Already told: nothing more goes for the same names.
    selwise.setScreen('app://home');
    selwise.registerSlot('home-top');
    await jest.advanceTimersByTimeAsync(3100);
    expect(reports(calls)).toHaveLength(2);
    await selwise.destroy();
  });

  it('sends the app\'s test mode with the report', async () => {
    const calls = installFetch();
    const selwise = await init({ testMode: true });
    await jest.advanceTimersByTimeAsync(3100);
    expect(reports(calls)[0]).toMatchObject({ testMode: true });
    await selwise.destroy();
  });

  it('says nothing when the app opted out', async () => {
    const calls = installFetch();
    const selwise = await init({ reportIntegration: false });
    selwise.setScreen('app://home');
    selwise.registerSlot('home-top');
    await jest.advanceTimersByTimeAsync(10_000);
    expect(reports(calls)).toEqual([]);
    await selwise.destroy();
  });

  it('never lets a failed report reach the app', async () => {
    installFetch(true);
    const selwise = await init();
    selwise.setScreen('app://product');
    await expect(jest.advanceTimersByTimeAsync(3100)).resolves.not.toThrow();
    await selwise.destroy();
  });
});
