import { createImpressionLedger, impressionBatch } from './strip-impressions.js';

const product = (code: string) => ({ itemCode: code, title: code, price: 400 });

describe('impressionBatch', () => {
  it('counts each card once per mount on a strip that does not follow the basket', () => {
    const ledger = createImpressionLedger();
    const strip = { followsCart: false };
    expect(impressionBatch(ledger, [product('A'), product('B')], strip).map((p) => p.itemCode)).toEqual(['A', 'B']);
    // Scrolled: only the card that came on screen.
    expect(impressionBatch(ledger, [product('B'), product('C')], strip).map((p) => p.itemCode)).toEqual(['C']);
    expect(impressionBatch(ledger, [product('A')], strip)).toEqual([]);
  });

  it('counts a basket-following strip once per appearance', () => {
    const ledger = createImpressionLedger();
    expect(impressionBatch(ledger, [product('A')], { followsCart: true, appearance: 1 })).toHaveLength(1);
    // Swapped in place, or scrolled: the same display.
    expect(impressionBatch(ledger, [product('B')], { followsCart: true, appearance: 1 })).toEqual([]);
    // Nothing on screen yet does not spend the appearance.
    expect(impressionBatch(ledger, [], { followsCart: true, appearance: 2 })).toEqual([]);
    expect(impressionBatch(ledger, [product('C')], { followsCart: true, appearance: 2 })).toHaveLength(1);
  });
});
