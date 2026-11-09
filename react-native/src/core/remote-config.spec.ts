import { normalizeRemoteConfig } from './remote-config.js';

/** `/config` exactly as the API returns it for an app channel. */
const PAYLOAD = {
  channel: { type: 'app', sharedCatalog: true },
  campaigns: [],
  widgets: [],
  tracking: {
    batchingEnabled: true,
    batchSize: 5,
    flushInterval: 30,
    offlinePersistence: false,
    sendBeaconOnUnload: true,
    maxRetries: 2,
    maxQueueSize: 100,
    maxStorageEvents: 50,
    debugMode: true,
    dataLayerConfig: { platform: 'akinon' },
    // Where the API puts the request's country (public-config.controller.ts).
    // This fixture used to carry it at the TOP level, which is where the SDK
    // looked and where the API never wrote it — so the test passed while
    // country targeting never matched in a real app.
    geo: { country: 'TR' },
  },
  search: { enabled: true, isTestMode: false },
  // The digest, as `/config` carries it. `enabled` is a WEB question — are
  // there selectors to watch — and false for an app channel by construction;
  // `keys` is the list of slots a screen can ask for.
  enrichment: { enabled: false, v: 'stamp.3', slots: [], keys: ['pdp-specs', 'pdp-faq'] },
  // The API names these WITHOUT the leading `--`; the widget adds it when
  // writing them onto the document root.
  theme: { 'selwise-brand': '#d3145a', 'selwise-brand-text': '#ffffff' },
};

describe('normalizeRemoteConfig', () => {
  // `flushInterval` is SECONDS on the wire and milliseconds in this SDK. Taken
  // verbatim, a 30-second interval becomes 30ms — a request per event.
  it('converts the flush interval from seconds to milliseconds', () => {
    expect(normalizeRemoteConfig(PAYLOAD).tracking.flushIntervalMs).toBe(30_000);
  });

  it('reads the tracking knobs the SDK can act on', () => {
    expect(normalizeRemoteConfig(PAYLOAD).tracking).toEqual({
      batchSize: 5,
      flushIntervalMs: 30_000,
      maxQueueSize: 100,
      maxRetries: 2,
      offlinePersistence: false,
      debug: true,
    });
  });

  it('reads the country the server resolved', () => {
    expect(normalizeRemoteConfig(PAYLOAD).country).toBe('TR');
  });

  it('reports the channel kind and shared catalogue', () => {
    const remote = normalizeRemoteConfig(PAYLOAD);
    expect(remote.channelType).toBe('app');
    expect(remote.sharedCatalog).toBe(true);
  });

  // The goal bar's "₺120 more" and `{cart.total}` fall back to it when the
  // host's basket carries no currency of its own.
  it("reads the channel's currency, and only an ISO code", () => {
    expect(normalizeRemoteConfig({ channel: { currency: 'try' } }).currency).toBe('TRY');
    expect(normalizeRemoteConfig({ channel: { currency: 'TL' } }).currency).toBeUndefined();
    expect(normalizeRemoteConfig({ channel: { currency: null } }).currency).toBeUndefined();
    expect(normalizeRemoteConfig({}).currency).toBeUndefined();
  });

  // Consumers resolve `var(--selwise-brand, …)`. Without the prefix every
  // lookup missed and every themed value fell back to its literal, which looks
  // exactly like no theme at all.
  it('adds the leading -- the payload omits', () => {
    expect(normalizeRemoteConfig(PAYLOAD).theme).toEqual({
      '--selwise-brand': '#d3145a',
      '--selwise-brand-text': '#ffffff',
    });
  });

  it('does not double the prefix if a payload already carries it', () => {
    const remote = normalizeRemoteConfig({ theme: { '--selwise-brand': '#000' } });
    expect(remote.theme).toEqual({ '--selwise-brand': '#000' });
  });

  it('reads the enrichment slots a screen may ask for', () => {
    const remote = normalizeRemoteConfig(PAYLOAD);
    expect(remote.hasEnrichment).toBe(true);
    expect(remote.enrichmentSlots).toEqual(['pdp-specs', 'pdp-faq']);
    expect(remote.enrichmentVersion).toBe('stamp.3');
  });

  it('reports no enrichment when the channel has none', () => {
    const remote = normalizeRemoteConfig({ ...PAYLOAD, enrichment: {} });
    expect(remote.hasEnrichment).toBe(false);
    expect(remote.enrichmentSlots).toEqual([]);
  });

  // Rules exist but none is addressable by name — ordinary on a web channel,
  // and in an app the whole reason a merchant's content would not appear.
  it('still reports enrichment when rules exist with no placement key', () => {
    const remote = normalizeRemoteConfig({
      ...PAYLOAD,
      enrichment: { enabled: true, v: 'stamp.4', slots: [{ s: '.desc', p: 'after' }], keys: [] },
    });
    expect(remote.hasEnrichment).toBe(true);
    expect(remote.enrichmentSlots).toEqual([]);
  });

  // An absent knob must stay absent, not become a zero. A `batchSize: 0` would
  // be clamped to 1 downstream and flush on every single event.
  it('omits a knob rather than inventing a value for it', () => {
    const remote = normalizeRemoteConfig({
      tracking: { batchSize: 0, flushInterval: -1, maxRetries: 'x', debugMode: 'yes' },
    });
    expect(remote.tracking).toEqual({});
  });

  it('survives an empty or malformed payload', () => {
    for (const input of [null, undefined, {}, [], 'nope']) {
      const remote = normalizeRemoteConfig(input as never);
      expect(remote.tracking).toEqual({});
      expect(remote.theme).toEqual({});
      expect(remote.sharedCatalog).toBe(false);
      expect(remote.searchEnabled).toBe(false);
    }
  });

  it('keeps offlinePersistence true when the merchant left it on', () => {
    const remote = normalizeRemoteConfig({ tracking: { offlinePersistence: true } });
    expect(remote.tracking.offlinePersistence).toBe(true);
  });

  it("reads the account's languages and the one the config was answered in", () => {
    expect(
      normalizeRemoteConfig({ locale: { default: 'tr', available: ['tr', 'en'], resolved: 'en' } }).locale,
    ).toEqual({ defaultLocale: 'tr', locales: ['tr', 'en'], resolved: 'en' });
    // An API older than languages says nothing, and nothing is invented.
    expect(normalizeRemoteConfig({}).locale).toBeUndefined();
  });
});
