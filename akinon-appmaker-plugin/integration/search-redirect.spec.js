'use strict';

const SelwisePlugin = require('./index.js');

/**
 * A merchant search redirect is an ANSWER, not a failed search.
 *
 * "kargo" sends the visitor to the shipping page and usually returns zero
 * hits. The browser widget navigates and renders nothing; the app ignored the
 * field entirely and showed an empty result list for a rule the merchant wrote
 * on purpose.
 */
function pluginWith(searchResult) {
  const plugin = Object.create(SelwisePlugin.constructor.prototype);
  plugin.ready = Promise.resolve(true);
  plugin.selwise = { search: async () => searchResult };
  plugin.opened = [];
  plugin.openStorefrontPath = async (url) => {
    plugin.opened.push(url);
    return true;
  };
  return plugin;
}

describe('plugin.search', () => {
  it('navigates to a redirect instead of returning a list', async () => {
    const plugin = pluginWith({ query: 'kargo', hits: [], redirect: '/kargo-bilgileri' });

    const result = await plugin.search('kargo');

    expect(plugin.opened).toEqual(['/kargo-bilgileri']);
    expect(result.redirected).toBe(true);
    expect(result.redirect).toBe('/kargo-bilgileri');
  });

  it('trims a padded redirect rather than opening whitespace', async () => {
    const plugin = pluginWith({ query: 'kargo', hits: [], redirect: '  /kargo  ' });

    await plugin.search('kargo');

    expect(plugin.opened).toEqual(['/kargo']);
  });

  it('leaves a normal search untouched', async () => {
    const plugin = pluginWith({ query: 'ruj', hits: [{ itemCode: 'KM1' }], total: 1 });

    const result = await plugin.search('ruj');

    expect(plugin.opened).toEqual([]);
    expect(result.hits).toHaveLength(1);
    expect(result.redirected).toBeUndefined();
  });

  it('ignores an empty redirect field', async () => {
    const plugin = pluginWith({ query: 'ruj', hits: [], redirect: '   ' });

    const result = await plugin.search('ruj');

    expect(plugin.opened).toEqual([]);
    expect(result.redirected).toBeUndefined();
  });

  // Navigation can fail (no deep-link map, no storefront origin). The result
  // still carries the redirect so the caller knows the list is not the answer.
  it('reports a redirect it could not open', async () => {
    const plugin = pluginWith({ query: 'kargo', hits: [], redirect: '/kargo' });
    plugin.openStorefrontPath = async () => {
      throw new Error('no deep link map');
    };

    const result = await plugin.search('kargo');

    expect(result.redirected).toBe(false);
    expect(result.redirect).toBe('/kargo');
  });

  it('returns an empty result rather than throwing when the SDK fails', async () => {
    const plugin = pluginWith(null);
    plugin.selwise = {
      search: async () => {
        throw new Error('offline');
      },
    };

    const result = await plugin.search('ruj');

    expect(result).toEqual({ query: 'ruj', hits: [] });
  });
});
