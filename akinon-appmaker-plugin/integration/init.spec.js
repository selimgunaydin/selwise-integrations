'use strict';

/**
 * What the plugin tells the SDK when it starts, and what it answers for the app
 * afterwards: the language, the consent answer, and the two switches that must
 * never be on in a release by accident.
 */
const mockConfig = { current: {} };
const mockClients = [];
const mockLanguage = { current: null, getCurrent: jest.fn() };

class MockSelwise {
  constructor() {
    this.initOptions = null;
    this.setLocale = jest.fn();
    this.setPushPermission = jest.fn();
    this.setConsent = jest.fn(async () => undefined);
    this.isConsentRequired = jest.fn(async () => true);
    this.setCart = jest.fn();
    this.setProduct = jest.fn();
    this.getScreen = () => ({ pageUrl: 'app://home', screenName: 'HomePage', pageType: 'home' });
    this.on = () => () => undefined;
    this.strips = { setPlacements: jest.fn() };
    mockClients.push(this);
  }

  async init(options) {
    this.initOptions = options;
  }
}

jest.mock('_akinonConfig', () => ({ version: '3.4.1', plugins: { 'selwise-akinon-appmaker': { get config() { return mockConfig.current; } } } }), {
  virtual: true,
});
jest.mock('@selwise/react-native', () => ({ Selwise: MockSelwise }), { virtual: true });
jest.mock('@services/analytics/service', () => ({ subscribe: jest.fn() }), { virtual: true });
jest.mock('@services/language', () => mockLanguage, { virtual: true });
jest.mock('@core/store', () => ({ getState: () => ({}), subscribe: () => () => undefined }), { virtual: true });
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { getInitialURL: () => Promise.resolve(null), addEventListener: () => ({ remove() {} }) }, AppState: { addEventListener: () => ({ remove() {} }) } }), {
  virtual: true,
});

const { SelwisePlugin } = require('./index.js');

const KEYS = { channelKey: 'sk_test', apiKey: 'swpk_test_key' };

async function started(config) {
  mockConfig.current = { ...KEYS, ...config };
  const plugin = new SelwisePlugin();
  plugin.init();
  expect(await plugin.ready).toBe(true);
  return { plugin, client: plugin.selwise };
}

beforeEach(() => {
  mockClients.length = 0;
  mockLanguage.getCurrent.mockReset();
  mockLanguage.getCurrent.mockResolvedValue({ code: 'tr', key: 'tr', region: 'tr' });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  console.log.mockRestore();
});

describe('the language', () => {
  it('is the config’s, when it names one', async () => {
    const { client } = await started({ locale: ' en-US ' });
    expect(client.initOptions.locale).toBe('en-US');
    expect(mockLanguage.getCurrent).not.toHaveBeenCalled();
  });

  it('is the app’s own current language otherwise, so the merchant’s text comes in what the app shows', async () => {
    mockLanguage.getCurrent.mockResolvedValue({ code: 'en', key: 'en-us' });
    const { client } = await started({});
    expect(client.initOptions.locale).toBe('en');
  });

  it('falls back to the language key when the language has no code', async () => {
    mockLanguage.getCurrent.mockResolvedValue({ key: 'tr' });
    const { client } = await started({});
    expect(client.initOptions.locale).toBe('tr');
  });

  it('is left out — the account’s default applies — when the app has no language service or it fails', async () => {
    mockLanguage.getCurrent.mockRejectedValue(new Error('no storage'));
    const { client } = await started({});
    expect('locale' in client.initOptions).toBe(false);
  });

  it('does not hold the launch for a language service that never answers', async () => {
    jest.useFakeTimers();
    mockLanguage.getCurrent.mockReturnValue(new Promise(() => undefined));
    mockConfig.current = { ...KEYS };
    const plugin = new SelwisePlugin();
    plugin.init();
    await jest.advanceTimersByTimeAsync(2000);
    expect(await plugin.ready).toBe(true);
    expect('locale' in plugin.selwise.initOptions).toBe(false);
    jest.useRealTimers();
  });

  it('is changed with setLocale, once the SDK is ready', async () => {
    const { plugin, client } = await started({});

    await plugin.setLocale('en');
    await plugin.setLocale('');

    expect(client.setLocale.mock.calls).toEqual([['en'], [undefined]]);
  });
});

describe('consent', () => {
  it('hands the app’s answer to the SDK, and says whether it was stored', async () => {
    const { plugin, client } = await started({});
    const answer = { granted: true, categories: { analytics: true, marketing: false } };

    await expect(plugin.setConsent(answer)).resolves.toBe(true);

    expect(client.setConsent).toHaveBeenCalledWith(answer);
  });

  it('says false when the SDK refuses, rather than throwing into the app’s consent dialog', async () => {
    const { plugin, client } = await started({});
    client.setConsent.mockRejectedValue(new Error('storage full'));

    await expect(plugin.setConsent({ granted: true })).resolves.toBe(false);
  });

  it('says whether the dashboard waits for the app’s answer', async () => {
    const { plugin, client } = await started({});

    await expect(plugin.consentRequired()).resolves.toBe(true);
    client.isConsentRequired.mockResolvedValue(false);
    await expect(plugin.consentRequired()).resolves.toBe(false);
  });

  it('keeps the config’s consent as the answer a cold start begins with', async () => {
    const consent = { granted: false };
    const { client } = await started({ consent });
    expect(client.initOptions.consent).toEqual(consent);
  });

  it('answers false for an idle plugin — no config, nothing to ask', async () => {
    mockConfig.current = null;
    const plugin = new SelwisePlugin();
    plugin.init();

    await expect(plugin.consentRequired()).resolves.toBe(false);
    await expect(plugin.setConsent({ granted: true })).resolves.toBe(false);
  });
});

describe('release safety', () => {
  it('leaves debug, test mode and QA links off unless the build says exactly true', async () => {
    const { client } = await started({});
    expect(client.initOptions).not.toHaveProperty('debug');
    expect(client.initOptions).not.toHaveProperty('qaLinks');
    expect(client.initOptions).not.toHaveProperty('testMode');
  });

  it('does not take a truthy string for a switch', async () => {
    const { client } = await started({ debug: 'true', qaLinks: 'yes', testMode: 1 });
    expect(client.initOptions).not.toHaveProperty('debug');
    expect(client.initOptions).not.toHaveProperty('qaLinks');
    expect(client.initOptions).not.toHaveProperty('testMode');
  });

  it('turns them on for a build that asks', async () => {
    const { client } = await started({ debug: true, qaLinks: true, testMode: true });
    expect(client.initOptions).toMatchObject({ debug: true, qaLinks: true, testMode: true });
    delete global.Selwise;
  });

  it('does not put a handle onto the visitor’s identity on the global unless debugging', async () => {
    delete global.Selwise;
    await started({});
    expect(global.Selwise).toBeUndefined();
  });

  it('is idle without both keys, and says so', () => {
    mockConfig.current = { channelKey: 'sk_test' };
    const plugin = new SelwisePlugin();
    plugin.init();
    expect(plugin.selwise).toBeNull();
  });
});

describe('strip placements', () => {
  it('are handed to the SDK once, so the components and recommendation() agree', async () => {
    const placements = { 'app://product': ['PDP — Benzer Ürünler'] };
    const { client } = await started({ recommendation: { placements } });
    expect(client.strips.setPlacements).toHaveBeenCalledTimes(1);
    expect(client.strips.setPlacements).toHaveBeenCalledWith(placements);
  });

  it('are not set when the dashboard decides', async () => {
    const { client } = await started({ recommendation: { active: true } });
    expect(client.strips.setPlacements).not.toHaveBeenCalled();
  });
});

describe('what a segment is built on', () => {
  it('tells the SDK the OS and the app release', async () => {
    const { client } = await started({});
    expect(client.initOptions.platform).toBe('android');
    expect(client.initOptions.appVersion).toBe('3.4.1');
  });

  it('passes the notification permission on, once the SDK is up', async () => {
    const { plugin, client } = await started({});
    await plugin.setPushPermission('denied');
    expect(client.setPushPermission).toHaveBeenCalledWith('denied');
  });
});

describe('signed identity', () => {
  it('hands the analytics layer the provider the app registered, read at every sign-in', async () => {
    const { plugin } = await started({});
    expect(plugin.analytics.getUserHashProvider()).toBeNull();
    const provider = jest.fn();
    plugin.setUserHashProvider(provider);
    expect(plugin.analytics.getUserHashProvider()).toBe(provider);
    plugin.setUserHashProvider('not a function');
    expect(plugin.analytics.getUserHashProvider()).toBeNull();
  });
});
