'use strict';

/**
 * Links that open the app reach the SDK's `trackDeepLink` — from React
 * Native's Linking (cold start and while running) and from the analytics
 * events App Maker's deep-link handler publishes for a notification open
 * (`handleUrlParams`, `notificationOpened`) — and only once the SDK is ready.
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
// App Maker's AnalyticsService as it is: subscribers are objects, and an event
// calls the method named after it with (nextState, prevState, data).
const mockAnalyticsService = {
  subscribers: {},
  subscribe: jest.fn((name, module) => {
    (mockAnalyticsService.subscribers[name] = mockAnalyticsService.subscribers[name] || []).push(module);
  }),
  publish(event, data) {
    Object.values(mockAnalyticsService.subscribers).forEach((list) =>
      list.forEach((module) => typeof module[event] === 'function' && module[event]({}, {}, data))
    );
  },
};
jest.mock('react-native', () => ({ Linking: mockLinking }), { virtual: true });
jest.mock('@services/analytics/service', () => mockAnalyticsService, { virtual: true });
jest.mock('@core/store', () => ({ getState: () => ({}), subscribe: () => () => undefined }), { virtual: true });

const { SelwisePlugin, subscribeDeepLinks } = require('./index.js');

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockLinking.initial = null;
  mockLinking.listeners = [];
  mockAnalyticsService.subscribers = {};
  mockAnalyticsService.subscribe.mockClear();
});

describe('subscribeDeepLinks', () => {
  it('delivers the cold-start link and later links from Linking, and unsubscribes', async () => {
    mockLinking.initial = 'myshop://home?sw_sc=x';
    const seen = [];
    const stop = subscribeDeepLinks((url) => seen.push(url));
    await flushPromises();

    mockLinking.emit('myshop://basket?utm_source=a');
    expect(seen).toEqual(['myshop://home?sw_sc=x', 'myshop://basket?utm_source=a']);

    stop();
    expect(mockLinking.listeners).toHaveLength(0);
  });

  it("rebuilds a notification open from App Maker's handleUrlParams, query and all", async () => {
    const seen = [];
    subscribeDeepLinks((url) => seen.push(url));
    await flushPromises();

    expect(mockAnalyticsService.subscribe).toHaveBeenCalledWith('selwise-akinon-appmaker-links', expect.any(Object));
    mockAnalyticsService.publish('handleUrlParams', {
      baseUrl: 'https://shop.example',
      url: '/product/12/',
      query: { sw_sc: 'sc 1', utm_source: 'push', tag: ['a', 'b'], empty: null },
    });
    expect(seen).toEqual(['https://shop.example/product/12/?sw_sc=sc%201&utm_source=push&tag=a&tag=b&empty']);
  });

  it('reads the raw payload of notificationOpened, and ignores empty ones', async () => {
    const seen = [];
    subscribeDeepLinks((url) => seen.push(url));
    await flushPromises();

    mockAnalyticsService.publish('notificationOpened', { url: 'app://basket?sw_sc=s2', foreground: true });
    mockAnalyticsService.publish('notificationOpened', {});
    mockAnalyticsService.publish('handleUrlParams', null);
    expect(seen).toEqual(['app://basket?sw_sc=s2']);
  });

  it('goes quiet after stop: App Maker offers no unsubscribe', async () => {
    const seen = [];
    const stop = subscribeDeepLinks((url) => seen.push(url));
    await flushPromises();
    stop();
    mockAnalyticsService.publish('notificationOpened', { url: 'app://home?sw_sc=s3' });
    expect(seen).toEqual([]);
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
