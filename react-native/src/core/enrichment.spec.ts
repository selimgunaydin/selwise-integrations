import {
  EnrichmentCache,
  itemsForSlot,
  normalizeEnrichment,
  normalizeEnrichmentItem,
  normalizePlacementKey,
  normalizePlacementKeys,
  selectByTestMode,
  type EnrichmentItem,
} from './enrichment.js';

/** One `app/enrichments` item, exactly as the API returns it. */
const ITEM = {
  assignmentId: 'rule-1',
  placementKey: 'pdp-specs',
  order: 0,
  html: '<div data-selwise-enrichment-root="true"><p>Garanti: 24 ay</p></div>',
  css: '[data-selwise-enrichment="block-1"] p { color: #d3145a }',
  reservedHeightPx: 120,
};

describe('normalizePlacementKey', () => {
  // The server folds on the way in, so the SDK has to send the folded form or
  // the request asks for a slot that cannot exist.
  it('folds what a screen typed the way the server folds it', () => {
    expect(normalizePlacementKey('PDP Specs')).toBe('pdp-specs');
    expect(normalizePlacementKey('  pdp_below_description ')).toBe('pdp-below-description');
    expect(normalizePlacementKey('pdp--specs')).toBe('pdp-specs');
    expect(normalizePlacementKey('-pdp-specs-')).toBe('pdp-specs');
  });

  it('refuses what cannot become a key rather than mangling it', () => {
    expect(normalizePlacementKey('???')).toBeNull();
    expect(normalizePlacementKey('')).toBeNull();
    expect(normalizePlacementKey('   ')).toBeNull();
    expect(normalizePlacementKey(null)).toBeNull();
    expect(normalizePlacementKey(42)).toBeNull();
    expect(normalizePlacementKey('a'.repeat(65))).toBeNull();
  });

  it('dedupes a list and drops what does not survive', () => {
    expect(normalizePlacementKeys(['PDP Specs', 'pdp-specs', '???', 'pdp-faq'])).toEqual([
      'pdp-specs',
      'pdp-faq',
    ]);
  });
});

describe('normalizeEnrichmentItem', () => {
  it('keeps the markup, styles and reservation a host renders', () => {
    const item = normalizeEnrichmentItem(ITEM) as EnrichmentItem;

    expect(item.assignmentId).toBe('rule-1');
    expect(item.placementKey).toBe('pdp-specs');
    expect(item.html).toContain('Garanti: 24 ay');
    expect(item.css).toContain('#d3145a');
    expect(item.reservedHeightPx).toBe(120);
  });

  // An item with no body would still count an impression for a blank space.
  it('drops an item with no markup', () => {
    expect(normalizeEnrichmentItem({ ...ITEM, html: '' })).toBeNull();
    expect(normalizeEnrichmentItem({ ...ITEM, html: '   ' })).toBeNull();
  });

  it('drops an item with no rule id or no placement', () => {
    expect(normalizeEnrichmentItem({ ...ITEM, assignmentId: '' })).toBeNull();
    expect(normalizeEnrichmentItem({ ...ITEM, placementKey: '???' })).toBeNull();
  });

  it('carries the targeting fields the SDK gates on', () => {
    const item = normalizeEnrichmentItem({
      ...ITEM,
      segmentTargetingMode: 'include',
      segmentIds: ['seg-1', '', null],
      isTestMode: true,
    }) as EnrichmentItem;

    expect(item.segmentTargetingMode).toBe('include');
    expect(item.segmentIds).toEqual(['seg-1']);
    expect(item.isTestMode).toBe(true);
  });

  it('omits a reservation that is absent or nonsense', () => {
    expect(normalizeEnrichmentItem({ ...ITEM, reservedHeightPx: 0 })?.reservedHeightPx)
      .toBeUndefined();
    expect(normalizeEnrichmentItem({ ...ITEM, reservedHeightPx: 'tall' })?.reservedHeightPx)
      .toBeUndefined();
  });

  it('survives a malformed entry instead of throwing in a render', () => {
    expect(normalizeEnrichmentItem(null)).toBeNull();
    expect(normalizeEnrichmentItem('nope')).toBeNull();
    expect(normalizeEnrichmentItem([])).toBeNull();
  });
});

describe('normalizeEnrichment', () => {
  it('reads the response and sorts the rules into stacking order', () => {
    const result = normalizeEnrichment({
      v: 'stamp.3',
      code: 'KM1',
      resolved: true,
      slots: ['pdp-specs'],
      items: [
        { ...ITEM, assignmentId: 'b', order: 2 },
        { ...ITEM, assignmentId: 'a', order: 1 },
      ],
    });

    expect(result.v).toBe('stamp.3');
    expect(result.resolved).toBe(true);
    expect(result.items.map((item) => item.assignmentId)).toEqual(['a', 'b']);
  });

  it('returns an empty result for a failed or malformed fetch', () => {
    for (const input of [null, undefined, {}, 'nope', []]) {
      const result = normalizeEnrichment(input as never);
      expect(result.items).toEqual([]);
      expect(result.resolved).toBe(false);
      expect(result.v).toBe('');
    }
  });
});

describe('selectByTestMode', () => {
  const live = normalizeEnrichmentItem(ITEM) as EnrichmentItem;
  const testing = normalizeEnrichmentItem({
    ...ITEM,
    assignmentId: 'rule-test',
    isTestMode: true,
  }) as EnrichmentItem;

  // A gate, not a filter: getting it backwards puts a merchant's unfinished
  // markup on every product screen.
  it('shows a real visitor only the live rules', () => {
    expect(selectByTestMode([live, testing], false).map((i) => i.assignmentId)).toEqual([
      'rule-1',
    ]);
  });

  it('shows a tester only the test-mode rules', () => {
    expect(selectByTestMode([live, testing], true).map((i) => i.assignmentId)).toEqual([
      'rule-test',
    ]);
  });
});

describe('itemsForSlot', () => {
  const items = [
    normalizeEnrichmentItem({ ...ITEM, assignmentId: 'a', order: 1 }),
    normalizeEnrichmentItem({ ...ITEM, assignmentId: 'b', order: 0 }),
    normalizeEnrichmentItem({ ...ITEM, assignmentId: 'c', placementKey: 'pdp-faq' }),
  ].filter((item): item is EnrichmentItem => item !== null);

  it('returns one slot rules in stacking order', () => {
    expect(itemsForSlot(items, 'pdp-specs').map((i) => i.assignmentId)).toEqual(['b', 'a']);
  });

  it('accepts the unfolded name a screen might pass', () => {
    expect(itemsForSlot(items, 'PDP Specs')).toHaveLength(2);
  });

  it('returns nothing for a slot with no rules, or an impossible name', () => {
    expect(itemsForSlot(items, 'pdp-nothing')).toEqual([]);
    expect(itemsForSlot(items, '???')).toEqual([]);
  });
});

describe('EnrichmentCache', () => {
  const result = normalizeEnrichment({
    v: 'stamp.3',
    code: 'KM1',
    resolved: true,
    slots: ['pdp-specs'],
    items: [ITEM],
  });

  it('serves a repeated look at the same product', () => {
    const cache = new EnrichmentCache();
    cache.set('KM1', ['pdp-specs'], result);

    expect(cache.get('KM1', ['pdp-specs'], 'stamp.3')).toBe(result);
  });

  it('does not care what order the screen listed its slots in', () => {
    const cache = new EnrichmentCache();
    cache.set('KM1', ['pdp-specs', 'pdp-faq'], result);

    expect(cache.get('KM1', ['pdp-faq', 'pdp-specs'], 'stamp.3')).toBe(result);
  });

  // The stamp moves on any rule or block change, which is what makes caching
  // rendered markup safe at all.
  it('misses once the merchant has edited a rule', () => {
    const cache = new EnrichmentCache();
    cache.set('KM1', ['pdp-specs'], result);

    expect(cache.get('KM1', ['pdp-specs'], 'stamp.4')).toBeNull();
  });

  it('treats an unknown stamp as a miss rather than a match', () => {
    const cache = new EnrichmentCache();
    cache.set('KM1', ['pdp-specs'], result);

    expect(cache.get('KM1', ['pdp-specs'], '')).toBeNull();
  });

  it('separates products and slot sets', () => {
    const cache = new EnrichmentCache();
    cache.set('KM1', ['pdp-specs'], result);

    expect(cache.get('KM2', ['pdp-specs'], 'stamp.3')).toBeNull();
    expect(cache.get('KM1', ['pdp-faq'], 'stamp.3')).toBeNull();
  });

  // A visitor who browses fifty products must not accumulate fifty documents.
  it('evicts the least recently written past its bound', () => {
    const cache = new EnrichmentCache();
    for (let i = 0; i < 25; i += 1) {
      cache.set(`KM${i}`, ['pdp-specs'], { ...result, code: `KM${i}` });
    }

    expect(cache.size).toBe(20);
    expect(cache.get('KM0', ['pdp-specs'], 'stamp.3')).toBeNull();
    expect(cache.get('KM24', ['pdp-specs'], 'stamp.3')).not.toBeNull();
  });

  it('clears on request, for a merchant testing their own app', () => {
    const cache = new EnrichmentCache();
    cache.set('KM1', ['pdp-specs'], result);
    cache.clear();

    expect(cache.get('KM1', ['pdp-specs'], 'stamp.3')).toBeNull();
  });
});
