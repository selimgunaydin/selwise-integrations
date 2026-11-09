'use strict';

/**
 * Links that open the app reach the SDK's `trackDeepLink` — from React
 * Native's Linking (cold start and while running) and App Maker's
 * DeepLinkService — and only once the SDK is ready.
 */
const mockLinking = {
  initial: null,
  listeners: [],
  getInitialURL() {
    return Promise.resolve(this.initial);
  },
  addEventListener(type, listener) {
    this.listeners.push(listener);
    return { remove: () => (this.listeners = this.listeners.filter((entry) => entry !== listener)) };
  },
  emit(url) {
    this.listeners.forEach((listener) => listener({ url }));
  },
};
const mockDeepLinkService = { handlers: [], subscribe: jest.fn((name, handler) => mockDeepLinkService.handlers.push(handler)) };
jest.mock('react-native', () => ({ Linking: mockLinking }), { virtual: true });
jest.mock('@services/deepLink', () => mockDeepLinkService, { virtual: true });
jest.mock('@core/store', () => ({ getState: () => ({}), subscribe: () => () => undefined }), { virtual: true });

const { SelwisePlugin, subscribeDeepLinks } = require('./index.js');

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockLinking.initial = null;
  mockLinking.listeners = [];
  mockDeepLinkService.handlers = [];
  mockDeepLinkService.subscribe.mockClear();
});

describe('subscribeDeepLinks', () => {
  it('delivers the cold-start link, later links and DeepLinkService opens, and unsubscribes', async () => {
    mockLinking.initial = 'myshop://home?sw_sc=x';
    const seen = [];
    const stop = subscribeDeepLinks((url) => seen.push(url));
    await flushPromises();

    mockLinking.emit('myshop://basket?utm_source=a');
    mockDeepLinkService.handlers[0]({ url: 'myshop://product/1?utm_medium=push' });
    mockDeepLinkService.handlers[0]('');

    expect(seen).toEqual(['myshop://home?sw_sc=x', 'myshop://basket?utm_source=a', 'myshop://product/1?utm_medium=push']);
    expect(mockDeepLinkService.subscribe).toHaveBeenCalledWith('selwise-akinon-appmaker', expect.any(Function));

    stop();
    expect(mockLinking.listeners).toHaveLength(0);
  });
});

describe('plugin.recordDeepLink', () => {
  it('waits for the SDK, then hands it the link', async () => {
    const plugin = new SelwisePlugin();
    const trackDeepLink = jest.fn().mockReturnValue({ scenarioId: 's-1' });
    let resolveReady;
    plugin.ready = new Promise((resolve) => (resolveReady = resolve));
    plugin.selwise = { trackDeepLink };

    plugin.recordDeepLink('myshop://home?sw_sc=x');
    await flushPromises();
    expect(trackDeepLink).not.toHaveBeenCalled();

    resolveReady(true);
    await flushPromises();
    expect(trackDeepLink).toHaveBeenCalledWith('myshop://home?sw_sc=x');
  });

  it('sends nothing when init failed or the SDK predates trackDeepLink', async () => {
    const failed = new SelwisePlugin();
    failed.ready = Promise.resolve(false);
    failed.selwise = { trackDeepLink: jest.fn() };
    failed.recordDeepLink('myshop://x?utm_source=a');

    const old = new SelwisePlugin();
    old.ready = Promise.resolve(true);
    old.selwise = {};
    expect(() => old.recordDeepLink('myshop://x?utm_source=a')).not.toThrow();

    await flushPromises();
    expect(failed.selwise.trackDeepLink).not.toHaveBeenCalled();
  });
});
