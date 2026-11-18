'use strict';

const fs = require('fs');
const path = require('path');
const { loadSdkModule } = require('../test/sdk-source.js');

const { Selwise } = loadSdkModule('client.ts');

/**
 * The plugin reaches the SDK through a client instance and through
 * `require('@selwise/react-native')`, neither of which a type checker sees. A
 * misspelt method would sit behind a `typeof … === 'function'` guard and
 * silently do nothing — the `selwise.reset()` class of defect
 * `analytics/index.spec.js` guards for the event mapping.
 */
describe('SDK contract for the plugin', () => {
  function calledClientMethods(file) {
    const source = fs
      .readFileSync(path.join(__dirname, '..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    return [...source.matchAll(/(?:client|selwise)\.([a-zA-Z]+)\(/g)].map((match) => match[1]);
  }

  it('calls only methods the SDK client has', () => {
    const available = new Set(Object.getOwnPropertyNames(Selwise.prototype));
    const called = calledClientMethods('integration/index.js');
    expect(called).toEqual(
      expect.arrayContaining(['setCart', 'setProduct', 'setScreen', 'getScreen', 'on', 'setConsent', 'isConsentRequired', 'setLocale'])
    );
    expect([...new Set(called)].filter((name) => !available.has(name))).toEqual([]);
  });

  it('uses only the strip service’s methods that exist', () => {
    const { StripService } = loadSdkModule('core/strips.ts');
    const source = fs
      .readFileSync(path.join(__dirname, 'recommendation/index.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const called = [...source.matchAll(/strips\.([a-zA-Z]+)\(/g)].map((match) => match[1]);
    const available = new Set(Object.getOwnPropertyNames(StripService.prototype));
    expect(called.length).toBeGreaterThan(0);
    expect([...new Set(called)].filter((name) => !available.has(name))).toEqual([]);
  });

  it('exposes the strip service on the client, which the plugin hands its placements to', () => {
    expect(Object.getOwnPropertyDescriptor(Selwise.prototype, 'strips')).toBeDefined();
  });

  it('uses only functions the SDK package exports', () => {
    const sdk = loadSdkModule('index.ts');
    expect(typeof sdk.WebViewBridge).toBe('function');
    expect(typeof sdk.StripService).toBe('function');
  });
});
