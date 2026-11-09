'use strict';

/**
 * The plugin hands the app's AppState to the SDK, so the dashboard's Live View
 * counts an App Maker user while the app is on screen — and skips that step on
 * an SDK older than `setAppState` (1.2.0).
 */
const mockAppState = {
  listeners: [],
  addEventListener(type, listener) {
    this.listeners.push(listener);
    return { remove: () => (this.listeners = this.listeners.filter((entry) => entry !== listener)) };
  },
  emit(state) {
    this.listeners.forEach((listener) => listener(state));
  },
};
jest.mock('react-native', () => ({ AppState: mockAppState }), { virtual: true });
jest.mock('@core/store', () => ({ getState: () => ({}), subscribe: () => () => undefined }), {
  virtual: true,
});

const { SelwisePlugin } = require('./index.js');

beforeEach(() => {
  mockAppState.listeners = [];
});

describe('plugin.startAppStateFeed', () => {
  it("forwards every AppState change to the SDK's setAppState, subscribing once", () => {
    const plugin = new SelwisePlugin();
    const setAppState = jest.fn();
    plugin.selwise = { setAppState };

    expect(plugin.startAppStateFeed()).toBe(true);
    expect(plugin.startAppStateFeed()).toBe(true);
    expect(mockAppState.listeners).toHaveLength(1);

    mockAppState.emit('background');
    mockAppState.emit('active');
    expect(setAppState.mock.calls).toEqual([['background'], ['active']]);
  });

  it('subscribes nothing on an SDK without setAppState', () => {
    const plugin = new SelwisePlugin();
    plugin.selwise = { flush: jest.fn() };
    expect(plugin.startAppStateFeed()).toBe(false);
    expect(mockAppState.listeners).toHaveLength(0);
  });
});
