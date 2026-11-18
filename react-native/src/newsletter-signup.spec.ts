import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/** The newsletter form's SMS opt-in: a number goes out only with the shopper's own tick. */

function installFetch() {
  const bodies: Array<Record<string, unknown>> = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    if (String(url).endsWith('/newsletter')) {
      bodies.push(JSON.parse(String((init as RequestInit).body)));
    }
    return { ok: true, status: 200, text: async () => '{"success":true}' } as unknown as Response;
  });
  return bodies;
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

describe('subscribeNewsletter', () => {
  it('sends the number and the SMS channel when the shopper ticked the consent line', async () => {
    const bodies = installFetch();
    const selwise = await init();
    await selwise.subscribeNewsletter('a@b.co', { phone: ' +905551112233 ', smsConsent: true });
    expect(bodies[0]).toMatchObject({ email: 'a@b.co', phone: '+905551112233', channels: ['email', 'sms'] });
  });

  it('does not text anyone who only typed a number', async () => {
    const bodies = installFetch();
    const selwise = await init();
    await selwise.subscribeNewsletter('a@b.co', { phone: '+905551112233', smsConsent: false });
    expect(bodies[0]).not.toHaveProperty('phone');
    expect(bodies[0]).not.toHaveProperty('channels');
  });

  it('sends an email-only body, byte for byte, when no SMS is asked for', async () => {
    const bodies = installFetch();
    const selwise = await init();
    await selwise.subscribeNewsletter('a@b.co');
    expect(Object.keys(bodies[0]!).sort()).toEqual(['email', 'visitorId']);
  });
});
