import { Selwise } from './client.js';
import { MemoryStorage, STORAGE_KEYS } from './core/storage.js';
import { pushLinkOf } from './core/push-device.js';

/**
 * The app's phone registered for notifications: the token the host hands over,
 * the permission, the customer, and the consent that gates all three.
 */

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

const TOKEN = 'fcm-token-abcdefghijklmnopqrstuvwxyz:APA91b0123456789';

function install() {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const href = String(url);
    const raw = (init as RequestInit | undefined)?.body;
    calls.push({ url: href, body: typeof raw === 'string' ? JSON.parse(raw) : {} });
    let body: unknown = {};
    if (href.includes('/push-devices')) body = { success: true };
    else if (href.includes('/users/identify')) body = { success: true };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

async function init(extra: Record<string, unknown> = {}, storage = new MemoryStorage()) {
  const selwise = new Selwise();
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage,
    flushIntervalMs: 0,
    platform: 'android',
    appVersion: '2.0.0',
    locale: 'tr',
    ...extra,
  });
  return { selwise, storage };
}

const devices = (calls: FetchCall[]) => calls.filter((call) => /\/push-devices(\/revoke)?$/.test(call.url));
const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('registerPushToken', () => {
  it('sends the token with its family, the platform, the permission, the release and the language', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');

    expect(await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).toBe(true);

    const call = devices(calls).pop()!;
    expect(call.url).toMatch(/\/public\/sites\/site-key\/push-devices$/);
    expect(call.body).toEqual(
      expect.objectContaining({
        token: TOKEN,
        provider: 'fcm',
        platform: 'android',
        permission: 'granted',
        appVersion: '2.0.0',
        locale: 'tr',
        siteUserId: null,
        // The server needs this to bring back a phone revoked for consent.
        marketingConsent: true,
      }),
    );
    expect(typeof call.body.visitorId).toBe('string');
  });

  it('registers a token while the permission is unknown as undetermined, never as granted', async () => {
    const calls = install();
    const { selwise } = await init();

    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });

    expect(devices(calls).pop()!.body.permission).toBe('undetermined');
  });

  it('an APNs token is iOS whatever the app says, and a platform is required for the other families', async () => {
    const calls = install();
    const { selwise } = await init({ platform: undefined });
    const apns = '0123456789abcdef'.repeat(4);

    await selwise.registerPushToken({ token: apns, provider: 'apns' });
    expect(devices(calls).pop()!.body.platform).toBe('ios');

    await expect(selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).rejects.toThrow(/platform/);
    await expect(selwise.registerPushToken({ token: apns, provider: 'apns', platform: 'android' })).rejects.toThrow(
      /iOS/,
    );
  });

  it('refuses a call that cannot be right instead of sending it', async () => {
    const calls = install();
    const { selwise } = await init();

    await expect(selwise.registerPushToken({ token: '', provider: 'fcm' })).rejects.toThrow(/token/);
    await expect(selwise.registerPushToken({ token: TOKEN, provider: 'onesignal' as never })).rejects.toThrow(/provider/);
    expect(devices(calls)).toHaveLength(0);
  });

  it('sends the permission again when it changes, and nothing when it does not', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });
    const before = devices(calls).length;

    selwise.setPushPermission('granted');
    await flush();
    expect(devices(calls)).toHaveLength(before);

    selwise.setPushPermission('denied');
    await flush();
    expect(devices(calls)).toHaveLength(before + 1);
    expect(devices(calls).pop()!.body.permission).toBe('denied');
  });

  it('survives a failing request: it logs and answers false', async () => {
    install();
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    const { selwise } = await init();

    await expect(selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).resolves.toBe(false);
  });
});

describe('an unchanged registration', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('is not sent again by a second call, and still answers that the server has it', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');

    expect(await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).toBe(true);
    expect(await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).toBe(true);

    expect(devices(calls)).toHaveLength(1);
  });

  it('is not sent again by the next launch inside the day, and is sent once a day has passed', async () => {
    const storage = new MemoryStorage();
    const calls = install();
    const first = await init({}, storage);
    first.selwise.setPushPermission('granted');
    await first.selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });
    expect(devices(calls)).toHaveLength(1);
    // The same install: the visitor id is the one the first launch kept.
    const at = Date.now();

    const second = await init({}, storage);
    second.selwise.setPushPermission('granted');
    jest.spyOn(Date, 'now').mockReturnValue(at + DAY - 60_000);
    expect(await second.selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).toBe(true);
    expect(devices(calls)).toHaveLength(1);

    jest.spyOn(Date, 'now').mockReturnValue(at + DAY + 60_000);
    expect(await second.selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).toBe(true);
    expect(devices(calls)).toHaveLength(2);
  });

  it('is sent again when the token, the release or the language changed', async () => {
    const calls = install();
    const storage = new MemoryStorage();
    const first = await init({}, storage);
    first.selwise.setPushPermission('granted');
    await first.selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });

    const refreshed = TOKEN + 'x';
    await first.selwise.registerPushToken({ token: refreshed, provider: 'fcm' });
    expect(devices(calls)).toHaveLength(2);
    expect(devices(calls).pop()!.body.token).toBe(refreshed);

    const upgraded = await init({ appVersion: '2.1.0' }, storage);
    upgraded.selwise.setPushPermission('granted');
    await upgraded.selwise.registerPushToken({ token: refreshed, provider: 'fcm' });
    expect(devices(calls)).toHaveLength(3);
    expect(devices(calls).pop()!.body.appVersion).toBe('2.1.0');

    const translated = await init({ appVersion: '2.1.0', locale: 'en' }, storage);
    translated.selwise.setPushPermission('granted');
    await translated.selwise.registerPushToken({ token: refreshed, provider: 'fcm' });
    expect(devices(calls)).toHaveLength(4);
    expect(devices(calls).pop()!.body.locale).toBe('en');
  });

  it('is not sent again by an identify that names the customer already linked', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });

    await selwise.identify('customer-7');
    await flush();
    expect(devices(calls)).toHaveLength(2);

    await selwise.identify('customer-7');
    await flush();
    expect(devices(calls)).toHaveLength(2);
  });

  it('is not counted as sent when the request failed', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');
    const working = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    expect(await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).toBe(false);

    (globalThis as { fetch?: unknown }).fetch = working;
    expect(await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).toBe(true);
    expect(devices(calls)).toHaveLength(1);
  });

  it('is sent again after the token was unregistered, and after consent was withdrawn and given back', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });

    await selwise.unregisterPushToken();
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });
    expect(devices(calls).filter((call) => call.url.endsWith('/push-devices'))).toHaveLength(2);

    await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: false } });
    await flush();
    await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: true } });
    await flush();
    expect(devices(calls).filter((call) => call.url.endsWith('/push-devices'))).toHaveLength(3);
  });
});

describe('the customer follows the login', () => {
  it('links the phone on identify and unlinks it on logout', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });

    await selwise.identify('customer-7');
    await flush();
    expect(devices(calls).pop()!.body.siteUserId).toBe('customer-7');

    await selwise.logout();
    await flush();
    expect(devices(calls).pop()!.body.siteUserId).toBeNull();
  });
});

describe('consent gates the registration', () => {
  it('sends nothing while marketing consent is missing and the token once it is given', async () => {
    const calls = install();
    const { selwise } = await init({ consent: { granted: true, categories: { analytics: true, marketing: false } } });
    selwise.setPushPermission('granted');

    expect(await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' })).toBe(false);
    expect(devices(calls)).toHaveLength(0);

    await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: true } });
    await flush();
    expect(devices(calls)).toHaveLength(1);
    expect(devices(calls)[0]?.body.token).toBe(TOKEN);
    expect(devices(calls)[0]?.body.marketingConsent).toBe(true);
  });

  it('sends the consent signal again on the registration that follows a withdrawal and a new grant', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });
    await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: false } });
    await flush();
    expect(devices(calls).pop()!.url).toMatch(/\/revoke$/);

    await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: true } });
    await flush();
    const again = devices(calls).pop()!;
    expect(again.url).toMatch(/\/push-devices$/);
    expect(again.body).toEqual(expect.objectContaining({ token: TOKEN, marketingConsent: true }));
  });

  it('never sends a registration while marketing consent is withdrawn, even on a permission or identity change', async () => {
    const calls = install();
    const { selwise } = await init({ consent: { granted: true, categories: { analytics: true, marketing: false } } });
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });
    selwise.setPushPermission('granted');
    await flush();
    expect(devices(calls)).toHaveLength(0);
  });

  it('revokes the registered token when marketing consent is withdrawn', async () => {
    const calls = install();
    const { selwise } = await init();
    selwise.setPushPermission('granted');
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });

    await selwise.setConsent({ granted: true, categories: { analytics: true, marketing: false } });
    await flush();

    const revoke = devices(calls).pop()!;
    expect(revoke.url).toMatch(/\/push-devices\/revoke$/);
    expect(revoke.body).toEqual(expect.objectContaining({ token: TOKEN, provider: 'fcm', reason: 'consent_withdrawn' }));
  });

  it('revokes at the next launch when consent was withdrawn while the app was closed', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(
      STORAGE_KEYS.PUSH_DEVICE,
      JSON.stringify({ token: TOKEN, provider: 'fcm', platform: 'android' }),
    );
    const calls = install();

    await init({ consent: { granted: true, categories: { analytics: true, marketing: false } } }, storage);
    await flush();
    await flush();

    expect(devices(calls).pop()!.body).toEqual(
      expect.objectContaining({ token: TOKEN, reason: 'consent_withdrawn' }),
    );
  });
});

describe('unregisterPushToken', () => {
  it('revokes the token, forgets it and sends no later change for it', async () => {
    const calls = install();
    const { selwise, storage } = await init();
    selwise.setPushPermission('granted');
    await selwise.registerPushToken({ token: TOKEN, provider: 'fcm' });

    expect(await selwise.unregisterPushToken()).toBe(true);
    expect(devices(calls).pop()!.body).toEqual(expect.objectContaining({ reason: 'app_unregistered' }));
    expect(await storage.getItem(STORAGE_KEYS.PUSH_DEVICE)).toBeNull();

    const sent = devices(calls).length;
    selwise.setPushPermission('denied');
    await flush();
    expect(devices(calls)).toHaveLength(sent);
  });
});

describe('trackPushOpen', () => {
  const SCENARIO = '0f6f2a53-6a0f-4a2e-9a55-1f7a4f6d2b11';

  it('returns the link and records a messaging click for the scenario in it', async () => {
    const calls = install();
    const { selwise } = await init();
    const link = `app://basket?sw_sc=${SCENARIO}&utm_medium=app_push`;

    expect(selwise.trackPushOpen({ data: { sw_link: link } })).toBe(link);
    await selwise.flush();

    const events = calls.flatMap((call) => (Array.isArray(call.body.events) ? (call.body.events as Array<Record<string, unknown>>) : []));
    expect(events.find((event) => event.name === 'click')).toMatchObject({
      entityType: 'messaging',
      entityId: SCENARIO,
      metadata: { source: 'message_link', medium: 'app_push' },
    });
  });

  it('reads the link from every shape a push library hands over, and null for a notification that is not ours', () => {
    const link = `app://product?sw_sc=${SCENARIO}`;
    expect(pushLinkOf(link)).toBe(link);
    expect(pushLinkOf({ sw_link: link })).toBe(link);
    expect(pushLinkOf({ data: { sw_link: link } })).toBe(link);
    expect(pushLinkOf({ notification: { request: { content: { data: { sw_link: link } } } } })).toBe(link);
    expect(pushLinkOf({ data: { other: 'x' } })).toBeNull();
    expect(pushLinkOf(null)).toBeNull();
    expect(pushLinkOf('  ')).toBeNull();
  });
});
