import type { ExperimentAssignment } from './eligibility.js';
import { readSearchConfig, searchArmOverride, searchArmPatch, searchCardOf, searchSettingsOf, searchText } from './search-config.js';

/**
 * The settings document as an app reads it: the contract's tolerant reader, the
 * phone's layer over the desktop's, an experiment arm over that, and the words
 * the API already put in the visitor's language.
 */
describe('readSearchConfig', () => {
  it('is null for a channel whose search is off or was never set up', () => {
    expect(readSearchConfig({ enabled: false })).toBeNull();
  });

  it('carries the product cards the API presents beside the settings, and the phone’s comes first', () => {
    const channel = { mode: 'schema', renderVersion: 3 };
    const phone = { mode: 'schema', renderVersion: 3, name: 'phone' };
    const both = readSearchConfig({ enabled: true, settings: {}, productCard: channel, mobileProductCard: phone })!;
    expect(both.productCard).toEqual(channel);
    expect(searchCardOf(both)).toEqual(phone);

    const only = readSearchConfig({ enabled: true, settings: {}, productCard: channel, mobileProductCard: null })!;
    expect(searchCardOf(only)).toEqual(channel);

    // No card, or something that is not one: rows, never a broken grid.
    const none = readSearchConfig({ enabled: true, settings: {}, productCard: 'x' })!;
    expect(none.productCard).toBeNull();
    expect(searchCardOf(none)).toBeNull();
  });

  it('refuses a body that is not a configuration, so it is asked again rather than taken for "off"', () => {
    expect(() => readSearchConfig(null)).toThrow();
    expect(() => readSearchConfig('<html>')).toThrow();
  });

  it('reads the document tolerantly: a value out of range is held to its bound, an unknown key is dropped', () => {
    const config = readSearchConfig({
      enabled: true,
      mode: 'live',
      settings: { behavior: { minChars: 3, debounceMs: 99999, maxResults: 9 }, somethingNew: true },
    })!;
    expect(config.base.behavior).toMatchObject({ minChars: 3, maxResults: 9 });
    // Out of its bounds: held to the bound, not taken as it came.
    expect(config.base.behavior.debounceMs).toBe(2000);
    expect(config.base).not.toHaveProperty('somethingNew');
  });

  it('knows test mode and the audience, and treats an audience with no segments as everyone', () => {
    expect(readSearchConfig({ enabled: true, mode: 'test', settings: {} })!.mode).toBe('test');
    expect(readSearchConfig({ enabled: true, settings: {}, audience: { mode: 'include', segmentIds: ['a', 'a', ' ', 7] } })!.audience).toEqual({
      mode: 'include',
      segmentIds: ['a'],
    });
    expect(readSearchConfig({ enabled: true, settings: {}, audience: { mode: 'include', segmentIds: [] } })!.audience.mode).toBe('all');
  });
});

describe('searchSettingsOf', () => {
  const config = readSearchConfig({
    enabled: true,
    settings: {
      behavior: { maxResults: 12 },
      results: { layout: 'grid' },
      appearance: { grid: { columns: '4' } },
      devices: { mobile: { results: { layout: 'list' } } },
    },
  })!;

  it('is the phone’s document: its layer over the desktop’s', () => {
    expect(searchSettingsOf(config, null).results.layout).toBe('list');
  });

  it('caps a fixed column count a phone did not choose', () => {
    expect(searchSettingsOf(config, null).appearance.grid.columns).toBe('2');
  });

  it('lays an experiment arm over it, and only the paths an arm may change', () => {
    const arm = searchArmPatch({ settings: { behavior: { maxResults: 20 }, placement: { desktop: { surface: 'modal' } }, cart: { script: 'x' } } });
    expect(arm).toEqual({ behavior: { maxResults: 20 }, placement: { desktop: { surface: 'modal' } } });
    const settings = searchSettingsOf(config, arm);
    expect(settings.behavior.maxResults).toBe(20);
    // `cart.script` is not an arm's to change.
    expect(settings.cart.script).toBe('');
  });

  it('lays the arm’s own phone layer over the phone’s', () => {
    const arm = searchArmPatch({ devices: { mobile: { results: { layout: 'compact' } } } });
    expect(searchSettingsOf(config, arm).results.layout).toBe('compact');
  });
});

describe('searchArmOverride', () => {
  const assignment = (extra: Partial<ExperimentAssignment>): ExperimentAssignment => ({
    experimentId: 'e',
    variantId: 'v',
    targetType: 'search_config',
    ...extra,
  });

  it('is the arm’s override, under either name it arrives in', () => {
    expect(searchArmOverride(assignment({ config: { a: 1 } }))).toEqual({ a: 1 });
    expect(searchArmOverride(assignment({ variantConfig: { b: 2 }, config: { a: 1 } }))).toEqual({ b: 2 });
  });

  it('is nothing for a different_module arm: a channel has one search', () => {
    expect(searchArmOverride(assignment({ experimentMode: 'different_module', config: { a: 1 } }))).toBeNull();
  });

  it('is nothing for no arm at all', () => {
    expect(searchArmOverride(null)).toBeNull();
    expect(searchArmPatch(null)).toBeNull();
    expect(searchArmPatch({ cart: { script: 'x' } })).toBeNull();
  });
});

describe('searchText', () => {
  const settings = { texts: { empty: 'Sonuç yok', showing: '{shown} / {total} ürün', clear: '  ', recentSearches: { $i18n: { tr: 'Son aramalar', en: 'Recent' } } } };

  it('says the merchant’s words, with the tokens filled in', () => {
    expect(searchText(settings, 'empty')).toBe('Sonuç yok');
    expect(searchText(settings, 'showing', { shown: 12, total: 40 })).toBe('12 / 40 ürün');
  });

  it('leaves a token it was not given, rather than printing "undefined"', () => {
    expect(searchText(settings, 'showing', { shown: 12 })).toBe('12 / {total} ürün');
  });

  it('reads a text the API did not resolve to one language', () => {
    expect(searchText(settings, 'recentSearches')).toBe('Son aramalar');
  });

  it('is empty when there is no text at all, never a made-up sentence', () => {
    expect(searchText(settings, 'placeholder')).toBe('');
    expect(searchText(settings, 'clear')).toBe('');
    expect(searchText(null, 'empty')).toBe('');
  });
});
