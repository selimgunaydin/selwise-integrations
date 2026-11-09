'use strict';

const fs = require('fs');
const path = require('path');

const SelwiseAnalytics = require('./index.js');
const { PRODUCT_EVENT_HELPERS } = require('./index.js');

/**
 * Every `selwise.<method>(` this module actually calls.
 *
 * Comments are stripped first: the doc comment above `PRODUCT_EVENT_HELPERS`
 * names `selwise.reset()` as the mistake this table exists to prevent, and a
 * scanner that reads comments would report that example as a live call.
 */
function calledSdkMethods() {
  const source = fs
    .readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const direct = [...source.matchAll(/selwise\.([a-zA-Z]+)\(/g)].map((match) => match[1]);
  return [...new Set([...direct, ...Object.values(PRODUCT_EVENT_HELPERS)])];
}

/** The SDK client's public methods, read from its source. */
function sdkClientMethods() {
  const clientPath = path.join(__dirname, '../../../react-native/src/client.ts');
  const source = fs.readFileSync(clientPath, 'utf8');
  return new Set(
    [...source.matchAll(/^ {2}(?:async )?([a-zA-Z]+)\(/gm)].map((match) => match[1])
  );
}

function fakeSelwise() {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push({ name, args });
    return Promise.resolve();
  };
  const client = { calls };
  for (const name of sdkClientMethods()) client[name] = record(name);
  return client;
}

describe('SDK contract', () => {
  // This is the test that would have caught `selwise.reset()`: it does not
  // exist (the method is `logout()`), the call sat inside a try/catch, and
  // every logout would have silently done nothing.
  it('only calls methods that exist on the SDK client', () => {
    const available = sdkClientMethods();
    const missing = calledSdkMethods().filter((name) => !available.has(name));
    expect(missing).toEqual([]);
  });

  it('binds a method for every event it claims to handle', () => {
    const analytics = new SelwiseAnalytics({ selwise: null });
    const missing = SelwiseAnalytics.HANDLED_EVENTS.filter(
      (event) => typeof analytics[event] !== 'function'
    );
    expect(missing).toEqual([]);
  });
});

describe('execution', () => {
  it('routes a product view through the SDK helper, which sets entityId too', () => {
    const selwise = fakeSelwise();
    const analytics = new SelwiseAnalytics({ selwise });

    analytics.productImpression(
      { productDetail: { product: { sku: 'KM1', name: 'Ruj', price: 10 } } },
      {},
      {}
    );

    expect(selwise.calls.map((call) => call.name)).toEqual(['trackProductView']);
    expect(selwise.calls[0].args[0]).toBe('KM1');
  });

  it('sends an order through trackOrder and then drains the queue', () => {
    const selwise = fakeSelwise();
    const analytics = new SelwiseAnalytics({ selwise });

    analytics.measuringPurchases(
      {
        webCheckout: {
          sucess: { order: { order: { number: 'O-1', items: [{ sku: 'A', price: 5 }] } } }
        }
      },
      {},
      {}
    );

    expect(selwise.calls.map((call) => call.name)).toEqual(['trackOrder', 'flush']);
    expect(selwise.calls[0].args[0].orderId).toBe('O-1');
  });

  it('logs out rather than dropping the visitor id', () => {
    const selwise = fakeSelwise();
    new SelwiseAnalytics({ selwise }).userLogout({}, {}, {});
    expect(selwise.calls.map((call) => call.name)).toEqual(['logout']);
  });

  it('identifies before it tracks the login', () => {
    const selwise = fakeSelwise();
    new SelwiseAnalytics({ selwise }).userLogin(
      { auth: { auth: { user: { pk: 7, email: 'a@b.c' } } } },
      {},
      {}
    );
    expect(selwise.calls.map((call) => call.name)).toEqual(['identify', 'track']);
    expect(selwise.calls[0].args[0]).toBe('7');
  });

  // The app dispatches to every subscriber in one synchronous loop with no
  // per-subscriber guard, so a throw here would stop the plugins after us.
  it('never lets an SDK failure escape into the app', () => {
    const selwise = fakeSelwise();
    selwise.trackProductView = () => {
      throw new Error('network down');
    };
    const analytics = new SelwiseAnalytics({ selwise });

    expect(() =>
      analytics.productImpression({ productDetail: { product: { sku: 'KM1' } } }, {}, {})
    ).not.toThrow();
  });

  it('does nothing at all before the SDK is ready', () => {
    const analytics = new SelwiseAnalytics({ selwise: null });
    expect(() =>
      analytics.productImpression({ productDetail: { product: { sku: 'KM1' } } }, {}, {})
    ).not.toThrow();
  });
});
