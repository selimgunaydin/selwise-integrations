'use strict';

/**
 * The plugin's three push calls: the app hands the FCM token over (App Maker's
 * own messaging plugin keeps it to itself), tells the OS permission, and
 * reports a tapped notification — and every one is a pass-through that never
 * throws at the app.
 */
const mockClients = [];

class MockSelwise {
  constructor() {
    this.initOptions = null;
    this.setPushPermission = jest.fn();
    this.registerPushToken = jest.fn(async () => true);
    this.unregisterPushToken = jest.fn(async () => true);
    this.trackPushOpen = jest.fn(() => 'app://basket?sw_sc=abc');
    this.setLocale = jest.fn();
    this.setConsent = jest.fn(async () => undefined);
    this.isConsentRequired = jest.fn(async () => false);
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

jest.mock('_akinonConfig', () => ({ version: '3.4.1', plugins: { 'selwise-akinon-appmaker': { config: { channelKey: 'sk', apiKey: 'swpk_test' } } } }), {
  virtual: true,
});
jest.mock('@selwise/react-native', () => ({ Selwise: MockSelwise }), { virtual: true });
jest.mock('@services/analytics/service', () => ({ subscribe: jest.fn() }), { virtual: true });
jest.mock('@services/language', () => ({ getCurrent: jest.fn(async () => ({ code: 'tr' })) }), { virtual: true });
jest.mock('@core/store', () => ({ getState: () => ({}), subscribe: () => () => undefined }), { virtual: true });
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, Linking: { getInitialURL: () => Promise.resolve(null), addEventListener: () => ({ remove() {} }) }, AppState: { addEventListener: () => ({ remove() {} }) } }), {
  virtual: true,
});

const { SelwisePlugin } = require('./index.js');

async function started() {
  const plugin = new SelwisePlugin();
  plugin.init();
  expect(await plugin.ready).toBe(true);
  return { plugin, client: plugin.selwise };
}

beforeEach(() => {
  mockClients.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  console.log.mockRestore();
});

describe('registerPushToken', () => {
  it('hands the token to the SDK with the OS the app runs on', async () => {
    const { plugin, client } = await started();
    expect(await plugin.registerPushToken({ token: 't'.repeat(40), provider: 'fcm' })).toBe(true);
    expect(client.registerPushToken).toHaveBeenCalledWith({ token: 't'.repeat(40), provider: 'fcm', platform: 'ios' });
  });

  it('keeps a platform the call names', async () => {
    const { plugin, client } = await started();
    await plugin.registerPushToken({ token: 't'.repeat(40), provider: 'expo', platform: 'android' });
    expect(client.registerPushToken.mock.calls[0][0].platform).toBe('android');
  });

  it('answers false, and never throws, when the SDK refuses the call', async () => {
    const { plugin, client } = await started();
    client.registerPushToken.mockRejectedValueOnce(new Error('bad token'));
    await expect(plugin.registerPushToken({ token: 'x', provider: 'fcm' })).resolves.toBe(false);
  });

  it('answers false on an SDK that has no app push (an older one)', async () => {
    const { plugin, client } = await started();
    client.registerPushToken = undefined;
    await expect(plugin.registerPushToken({ token: 't'.repeat(40), provider: 'fcm' })).resolves.toBe(false);
  });
});

describe('the rest of the push calls', () => {
  it('passes the permission, the unregistration and the tapped notification through', async () => {
    const { plugin, client } = await started();

    await plugin.setPushPermission('granted');
    expect(client.setPushPermission).toHaveBeenCalledWith('granted');

    expect(await plugin.unregisterPushToken()).toBe(true);
    expect(client.unregisterPushToken).toHaveBeenCalled();

    const message = { data: { sw_link: 'app://basket?sw_sc=abc' } };
    expect(plugin.trackPushOpen(message)).toBe('app://basket?sw_sc=abc');
    expect(client.trackPushOpen).toHaveBeenCalledWith(message);
  });

  it('answers null for a tapped notification before the SDK is up', () => {
    const plugin = new SelwisePlugin();
    expect(plugin.trackPushOpen({ data: {} })).toBeNull();
  });
});
