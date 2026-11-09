'use strict';

/**
 * `webViewBridge()` hands the SDK's `WebViewBridge` the client itself. It
 * passed `{ selwise }`, so the bridge called `trackOrder` on a plain object and
 * every order completed in the checkout WebView was lost.
 */

jest.mock(
  '@selwise/react-native',
  () => ({
    WebViewBridge: class {
      constructor(selwise, options) {
        this.selwise = selwise;
        this.options = options;
      }
    },
  }),
  { virtual: true }
);

const { SelwisePlugin } = require('./index.js');

describe('SelwisePlugin.webViewBridge', () => {
  it('constructs the bridge over the client, not an options bag', () => {
    const plugin = new SelwisePlugin();
    const client = { trackOrder: jest.fn() };
    plugin.selwise = client;

    const bridge = plugin.webViewBridge();

    expect(bridge.selwise).toBe(client);
  });

  it('returns null before the client exists', () => {
    const plugin = new SelwisePlugin();
    plugin.selwise = null;
    expect(plugin.webViewBridge()).toBeNull();
  });
});
