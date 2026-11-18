import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * A QA link on a phone: test mode, and an experiment arm forced for this session.
 * Opt-in (`qaLinks`), because a link can be sent by anybody.
 */

const EXP = '11111111-1111-4111-8111-111111111111';
const ARM = '22222222-2222-4222-8222-222222222222';

function install() {
  const urls: string[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown) => {
    urls.push(String(url));
    const body = String(url).includes('/config') ? { campaigns: [], widgets: [] } : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return urls;
}

async function init(overrides: Partial<Parameters<Selwise['init']>[0]> = {}) {
  const selwise = new Selwise();
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
    ...overrides,
  });
  return selwise;
}

const assignCalls = (urls: string[]) => urls.filter((url) => url.includes('/experiments/assign'));

describe('QA links', () => {
  it('forces the arm and turns test mode on for the session', async () => {
    const urls = install();
    const selwise = await init({ qaLinks: true });

    selwise.trackDeepLink(`myapp://x?selwise_variant=${EXP}:${ARM}`);
    await selwise.getSurfaces('app://home');

    const forced = assignCalls(urls).filter((url) => url.includes('forceVariant='));
    expect(forced).toHaveLength(1);
    expect(decodeURIComponent(forced[0]!)).toContain(`forceVariant=${EXP}:${ARM}`);
    expect(selwise.getSearchStatus().testMode).toBe(false); // the REMOTE search mode, untouched
    await selwise.destroy();
  });

  it('ignores a QA link when the app did not opt in', async () => {
    const urls = install();
    const selwise = await init();

    selwise.trackDeepLink(`myapp://x?selwise_variant=${EXP}:${ARM}`);
    expect(selwise.applyQaLink(`myapp://x?selwise_test=1`)).toBeNull();
    await selwise.getSurfaces('app://home');

    expect(assignCalls(urls).some((url) => url.includes('forceVariant='))).toBe(false);
    await selwise.destroy();
  });

  it('lets test mode off take the forced arms back', async () => {
    const urls = install();
    const selwise = await init({ qaLinks: true });

    selwise.trackDeepLink(`myapp://x?selwise_variant=${EXP}:${ARM}`);
    await selwise.getSurfaces('app://home');
    selwise.trackDeepLink('myapp://x?selwise_test=off');
    await selwise.getSurfaces('app://home');

    const calls = assignCalls(urls);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1]).not.toContain('forceVariant=');
    await selwise.destroy();
  });

  it('keeps a link that arrives before init() and applies it when init finishes', async () => {
    const urls = install();
    const selwise = new Selwise();
    selwise.trackDeepLink(`myapp://x?selwise_variant=${EXP}:${ARM}`);
    await selwise.init({
      siteKey: 'site-key',
      apiKey: 'api-key',
      apiUrl: 'https://api.test/api/v1',
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
      reportIntegration: false,
      qaLinks: true,
    });
    await selwise.getSurfaces('app://home');

    expect(assignCalls(urls).some((url) => url.includes('forceVariant='))).toBe(true);
    await selwise.destroy();
  });
});
