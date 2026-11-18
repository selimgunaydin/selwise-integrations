import {
  categoriesFromHits,
  decodeEntities,
  foldText,
  formatCategoryName,
  highlightSegments,
  markedSegments,
} from './search-format.js';
import type { SelwiseProduct } from '../types.js';

describe('formatCategoryName', () => {
  it('names a path as the merchant chose', () => {
    expect(formatCategoryName('Kadın > Giyim > Ceket', 'last_part')).toBe('Ceket');
    expect(formatCategoryName('Kadın > Giyim > Ceket', 'first_part')).toBe('Kadın');
    expect(formatCategoryName('Kadın > Giyim > Ceket', 'full_path')).toBe('Kadın › Giyim › Ceket');
  });

  it('leaves a flat name alone, and reads a feed’s escaped separators', () => {
    expect(formatCategoryName('Ceket')).toBe('Ceket');
    expect(formatCategoryName('Kadın &gt; Ceket')).toBe('Ceket');
    expect(decodeEntities('A &amp;gt; B')).toBe('A > B');
  });
});

describe('categoriesFromHits', () => {
  const hit = (categories: string): SelwiseProduct => ({ id: categories, itemCode: categories, title: 't', price: 1, currency: 'TRY', categories });

  it('counts each product once per first-level category, most first', () => {
    const facets = categoriesFromHits([
      hit('Kadın > Ceket | Kadın > Mont'),
      hit('Erkek > Ceket'),
      hit('Kadın > Pantolon'),
    ]);
    expect(facets).toEqual([
      { name: 'Kadın', count: 2 },
      { name: 'Erkek', count: 1 },
    ]);
  });

  it('is empty for products with no category', () => {
    expect(categoriesFromHits([{ id: '1', itemCode: '1', title: 't', price: 1, currency: 'TRY' }])).toEqual([]);
  });
});

describe('highlightSegments', () => {
  it('marks the part the shopper typed, ignoring case', () => {
    expect(highlightSegments('Kırmızı Ceket', 'ceket')).toEqual([
      { text: 'Kırmızı ', marked: false },
      { text: 'Ceket', marked: true },
    ]);
  });

  it('reads Turkish letters as the search does: ı and i alike, accents ignored', () => {
    const marked = highlightSegments('KIRMIZI İPEK', 'kirmizi ipek').filter((segment) => segment.marked);
    expect(marked.map((segment) => segment.text)).toEqual(['KIRMIZI', 'İPEK']);
    expect(highlightSegments('Çanta', 'canta')).toEqual([{ text: 'Çanta', marked: true }]);
  });

  it('marks every word of the query, wherever it is', () => {
    const segments = highlightSegments('Mavi uzun kollu gömlek', 'gömlek mavi');
    expect(segments.filter((segment) => segment.marked).map((segment) => segment.text)).toEqual(['Mavi', 'gömlek']);
  });

  it('is one unmarked segment when nothing matched, and nothing for an empty title', () => {
    expect(highlightSegments('Ceket', 'xyz')).toEqual([{ text: 'Ceket', marked: false }]);
    expect(highlightSegments('Ceket', '')).toEqual([{ text: 'Ceket', marked: false }]);
    expect(highlightSegments('', 'a')).toEqual([]);
  });

  it('puts the text back together unchanged', () => {
    const title = 'Siyah İnce Kemer';
    expect(highlightSegments(title, 'ince').map((segment) => segment.text).join('')).toBe(title);
  });
});

describe('markedSegments', () => {
  it('reads the engine’s own <mark> tags, and strips every other tag', () => {
    expect(markedSegments('Kırmızı <mark>ceket</mark> <b>yeni</b>')).toEqual([
      { text: 'Kırmızı ', marked: false },
      { text: 'ceket', marked: true },
      { text: ' yeni', marked: false },
    ]);
  });

  it('is null when nothing is marked', () => {
    expect(markedSegments('Kırmızı ceket')).toBeNull();
    expect(markedSegments(null)).toBeNull();
  });
});

describe('foldText', () => {
  it('lower-cases and drops accents', () => {
    expect(foldText('ÇAĞRI İpek ıspanak')).toBe('cagri ipek ispanak');
  });
});
