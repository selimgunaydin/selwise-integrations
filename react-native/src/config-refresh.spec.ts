import { Selwise, CONFIG_REFRESH_AFTER_MS } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * A campaign published while the app is open: `/config` is read again, in the
 * background, when the app returns to the foreground or the screen changes and
 * the copy in hand is older than the server's own cache (five minutes).
 */

let config: Record<string, unknown> = {};
let configCalls = 0;
let configFails = false;
let now = 1_000_000;

const campaign = (id: string) => ({
  id,
  type: 'announcement_bar',
  contentJson: { text: id },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'all',
  segmentIds: [],
});

function installFetch() {
  configCalls = 0;
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown) => {
    const href = String(url);
    if (/\/config(\?|$)/.test(href)) {
      configCalls += 1;
      if (configFails) throw new Error('offline');
    }
    const payload = /\/config(\?|$)/.test(href) ? config : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

const settle = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

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
  await selwise.getSurfaces('app://home');
  await settle();
  return selwise;
}

beforeEach(() => {
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  config = { campaigns: [campaign('first')] };
  configFails = false;
  installFetch();
});

afterEach(async () => {
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('re-reading /config while the app is open', () => {
  it('reads it again on return to the foreground once the copy is older than five minutes', async () => {
    const selwise = await start();
    expect(configCalls).toBe(1);

    now += CONFIG_REFRESH_AFTER_MS + 1;
    selwise.setAppState('active');
    await settle();

    expect(configCalls).toBe(2);
  });

  it('does not read it again while the copy is fresh', async () => {
    const selwise = await start();

    now += CONFIG_REFRESH_AFTER_MS - 1000;
    selwise.setAppState('active');
    selwise.setScreen('app://product');
    await settle();

    expect(configCalls).toBe(1);
  });

  it('is triggered by a screen change too, and asks once however many triggers arrive', async () => {
    const selwise = await start();

    now += CONFIG_REFRESH_AFTER_MS + 1;
    selwise.setScreen('app://product');
    selwise.setAppState('active');
    selwise.setScreen('app://basket');
    await settle();

    expect(configCalls).toBe(2);
    // The copy is fresh again: the next trigger does not ask.
    selwise.setScreen('app://home');
    await settle();
    expect(configCalls).toBe(2);
  });

  it('tells listeners and serves the new list when the config changed', async () => {
    const selwise = await start();
    expect((await selwise.getSurfaces('app://home')).map((surface) => surface.id)).toEqual(['first']);
    const heard: number[] = [];
    selwise.on('config', (version) => heard.push(version));

    config = { campaigns: [campaign('second')] };
    now += CONFIG_REFRESH_AFTER_MS + 1;
    selwise.setAppState('active');
    await settle();

    expect(heard).toEqual([1]);
    expect((await selwise.getSurfaces('app://home')).map((surface) => surface.id)).toEqual(['second']);
    // The new list came from the re-read, not from a request of its own.
    expect(configCalls).toBe(2);
  });

  it('stays silent when the answer is the same', async () => {
    const selwise = await start();
    const heard: number[] = [];
    selwise.on('config', (version) => heard.push(version));

    now += CONFIG_REFRESH_AFTER_MS + 1;
    selwise.setAppState('active');
    await settle();

    expect(configCalls).toBe(2);
    expect(heard).toEqual([]);
  });

  it('keeps what it has when the re-read fails, and waits before trying again', async () => {
    const selwise = await start();
    const heard: number[] = [];
    selwise.on('config', (version) => heard.push(version));

    configFails = true;
    now += CONFIG_REFRESH_AFTER_MS + 1;
    selwise.setAppState('active');
    await settle();
    expect(configCalls).toBeGreaterThan(1);
    const afterFailure = configCalls;

    selwise.setScreen('app://product');
    await settle();
    expect(configCalls).toBe(afterFailure);
    expect(heard).toEqual([]);
    expect((await selwise.getSurfaces('app://home')).map((surface) => surface.id)).toEqual(['first']);
  });

  it('does nothing when the app goes to the background', async () => {
    const selwise = await start();
    now += CONFIG_REFRESH_AFTER_MS + 1;
    selwise.setAppState('background');
    await settle();
    expect(configCalls).toBe(1);
  });
});
