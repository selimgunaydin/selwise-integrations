import type { SelwiseProduct } from '../types.js';
import {
  cardGap,
  cardWidth,
  chunkRows,
  isComplementary,
  lookCaption,
  lookTotal,
  pageAtOffset,
  pageCount,
  phoneColumns,
  roleLanguage,
  roleTabs,
  stepPage,
} from './strip-layout.js';

const p = (code: string, extra?: Record<string, unknown>): SelwiseProduct =>
  ({ id: code, itemCode: code, title: code, price: 100, currency: 'TRY', ...(extra ?? {}) }) as SelwiseProduct;
const role = (key: string, tr: string, slotTr?: string) => ({
  role: key,
  relation: 'complement',
  label: { tr, en: key },
  slot: slotTr ? key : null,
  slotLabel: slotTr ? { tr: slotTr, en: key } : null,
});

describe('how a strip lays its cards out', () => {
  it('reads the phone’s column count and the gap, with the API’s own default', () => {
    expect(phoneColumns({ slidesPerViewMobile: 3 })).toBe(3);
    expect(phoneColumns({})).toBe(2);
    expect(phoneColumns({ slidesPerViewMobile: 0 })).toBe(2);
    expect(cardGap({ slideGap: 12 })).toBe(12);
    expect(cardGap({})).toBe(0);
  });

  it('divides the width among the columns and the gaps between them', () => {
    expect(cardWidth(390, 2, 10)).toBe(190);
    expect(cardWidth(390, 1, 10)).toBe(390);
  });

  it('draws one dot per page and steps between them, wrapping only with loop', () => {
    expect(pageCount(7, 2)).toBe(4);
    expect(pageCount(0, 2)).toBe(1);
    expect(stepPage(3, 4, 'next', false)).toBe(3);
    expect(stepPage(3, 4, 'next', true)).toBe(0);
    expect(stepPage(0, 4, 'prev', false)).toBe(0);
    expect(stepPage(0, 4, 'prev', true)).toBe(3);
    expect(pageAtOffset(400, 200, 4)).toBe(2);
    expect(pageAtOffset(9999, 200, 4)).toBe(3);
  });

  it('cuts rows of the column count, the last one short', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('groups by role, in the order roles first appear, and reads the panel’s language', () => {
    const products = [p('A', { complement: role('jean', 'Kot') }), p('B', { complement: role('shoe', 'Ayakkabı') }), p('C', { complement: role('jean', 'Kot') }), p('D')];
    expect(roleTabs(products, 'tr').map((tab) => [tab.role, tab.label, tab.products.length])).toEqual([
      ['jean', 'Kot', 2],
      ['shoe', 'Ayakkabı', 1],
    ]);
    expect(roleTabs(products, 'en')[0]!.label).toBe('jean');
    expect(roleTabs([p('X')], 'tr')).toEqual([]);
    expect(isComplementary(products)).toBe(true);
    expect(isComplementary([p('X')])).toBe(false);
    expect(roleLanguage(undefined)).toBe('tr');
    expect(roleLanguage('en-GB')).toBe('en');
  });

  it('captions a look as the merchant chose: slot, role or nothing', () => {
    const product = p('A', { complement: role('bottom', 'Jean', 'Alt giyim') });
    expect(lookCaption(product, 'tr', 'slot')).toBe('Alt giyim');
    expect(lookCaption(product, 'tr', 'role')).toBe('Jean');
    expect(lookCaption(product, 'tr', 'none')).toBe('');
    // A role with no slot is its own part of the look.
    expect(lookCaption(p('B', { complement: role('lip', 'Ruj') }), 'tr', 'slot')).toBe('Ruj');
  });

  it('totals a look only when every card is priced and in one currency', () => {
    expect(lookTotal([p('A', { price: 250 }), p('B', { price: 399.5 })])).toEqual({ sum: 649.5, currency: 'TRY' });
    expect(lookTotal([p('A'), p('B', { price: 0 })])).toBeNull();
    expect(lookTotal([p('A'), p('B', { currency: 'USD' })])).toBeNull();
    expect(lookTotal([])).toBeNull();
  });
});
