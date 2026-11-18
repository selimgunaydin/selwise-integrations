import { MemoryStorage } from './storage.js';
import { RECENT_SEARCH_LIMIT, RecentSearches } from './search-history.js';

/**
 * The search box's history: kept on the device only while the visitor's consent
 * allows remembering what they searched, in memory for the launch otherwise.
 */
const KEY = 'selwise_recent_searches_site';

function create(allowed: { value: boolean } = { value: true }, storage = new MemoryStorage()) {
  return { storage, allowed, recent: new RecentSearches(storage, KEY, () => allowed.value) };
}

describe('RecentSearches', () => {
  it('lists the newest first, once each, whatever the case', async () => {
    const { recent } = create();
    await recent.add('ceket');
    await recent.add('pantolon');
    await recent.add('CEKET');

    expect(await recent.list(10)).toEqual(['CEKET', 'pantolon']);
  });

  it('replaces the newest entry with its continuation, and leaves an older one alone', async () => {
    const { recent } = create();
    await recent.add('aya');
    await recent.add('ayakkabı');
    expect(await recent.list(10)).toEqual(['ayakkabı']);

    await recent.add('çanta');
    await recent.add('ayakkabı siyah');
    expect(await recent.list(10)).toEqual(['ayakkabı siyah', 'çanta', 'ayakkabı']);
  });

  it('cuts the list to the number asked for, and keeps a bounded number', async () => {
    const { recent } = create();
    for (let i = 0; i < RECENT_SEARCH_LIMIT + 5; i += 1) await recent.add(`terim ${i}`);

    expect(await recent.list(3)).toEqual(['terim 24', 'terim 23', 'terim 22']);
    expect(await recent.list(100)).toHaveLength(RECENT_SEARCH_LIMIT);
  });

  it('ignores a blank term', async () => {
    const { recent } = create();
    await recent.add('   ');
    expect(await recent.list(5)).toEqual([]);
  });

  it('removes one term, and clears them all', async () => {
    const { recent, storage } = create();
    await recent.add('a b');
    await recent.add('c d');
    await recent.remove('A B');
    expect(await recent.list(5)).toEqual(['c d']);

    await recent.clear();
    expect(await recent.list(5)).toEqual([]);
    expect(await storage.getItem(KEY)).toBeNull();
  });

  describe('with consent to remember', () => {
    it('survives a launch: a new list reads what the last one wrote', async () => {
      const { recent, storage } = create();
      await recent.add('ceket');

      const next = new RecentSearches(storage, KEY, () => true);
      expect(await next.list(5)).toEqual(['ceket']);
    });

    it('starts again from a stored value it cannot read', async () => {
      const storage = new MemoryStorage();
      await storage.setItem(KEY, '{not json');
      const { recent } = create({ value: true }, storage);
      expect(await recent.list(5)).toEqual([]);
    });
  });

  describe('without consent to remember', () => {
    it('keeps the list in memory for this launch and writes nothing to the device', async () => {
      const { recent, storage } = create({ value: false });
      await recent.add('ceket');

      expect(await recent.list(5)).toEqual(['ceket']);
      expect(await storage.getItem(KEY)).toBeNull();
    });

    it('removes what an earlier consent left on the device, and does not show it', async () => {
      const storage = new MemoryStorage();
      await storage.setItem(KEY, JSON.stringify(['eski arama']));
      const { recent } = create({ value: false }, storage);

      expect(await recent.list(5)).toEqual([]);
      expect(await storage.getItem(KEY)).toBeNull();
    });

    it('removes the stored list when consent is withdrawn after it was loaded', async () => {
      const allowed = { value: true };
      const { recent, storage } = create(allowed);
      await recent.add('ceket');
      expect(await storage.getItem(KEY)).not.toBeNull();

      allowed.value = false;
      await recent.add('pantolon');
      expect(await storage.getItem(KEY)).toBeNull();
      // This launch still has them.
      expect(await recent.list(5)).toEqual(['pantolon', 'ceket']);
    });

    it('starts writing once consent is given', async () => {
      const allowed = { value: false };
      const { recent, storage } = create(allowed);
      await recent.add('ceket');
      allowed.value = true;
      await recent.add('pantolon');

      expect(JSON.parse((await storage.getItem(KEY))!)).toEqual(['pantolon', 'ceket']);
    });
  });
});
