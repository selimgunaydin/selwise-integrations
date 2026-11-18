import { COUNTER_ICON_GLYPHS, countAt, counterIconName, counterParts, counterTemplate, countDuration, easeOutQuart, formatCount } from './counter.js';

describe('formatCount', () => {
  it('prints what the web prints', () => {
    expect(formatCount(7)).toBe('7');
    expect(formatCount(999, 'dot')).toBe('999');
    expect(formatCount(1500)).toBe('1.5K');
    expect(formatCount(2000)).toBe('2K');
    expect(formatCount(2_500_000)).toBe('2.5M');
  });
});

describe('the count-up', () => {
  it('runs from zero to the count along an ease-out', () => {
    expect(countAt(100, 0, 1000)).toBe(0);
    expect(countAt(100, 1000, 1000)).toBe(100);
    expect(countAt(100, 5000, 1000)).toBe(100);
    expect(countAt(100, 500, 1000)).toBeGreaterThan(50);
    expect(easeOutQuart(0.5)).toBeCloseTo(0.9375);
  });

  it('reads the merchant’s duration, a number or a numeric string, else a second', () => {
    expect(countDuration('1500')).toBe(1500);
    expect(countDuration(500)).toBe(500);
    expect(countDuration(undefined)).toBe(1000);
    expect(countDuration('fast')).toBe(1000);
  });
});

describe('counterTemplate', () => {
  it('prefers the custom text, then the template, then the platform’s sentence in the viewer’s language', () => {
    expect(counterTemplate('cart_count', { customText: 'A', template: 'B' }, 'tr')).toBe('A');
    expect(counterTemplate('cart_count', { template: 'B' }, 'tr')).toBe('B');
    expect(counterTemplate('cart_count', {}, 'tr')).toBe('{count} kişi sepete ekledi');
    expect(counterTemplate('product_view_count', {}, 'en')).toBe('{count} people viewed this product');
    expect(counterTemplate('product_view_count', {}, null)).toBe('{count} kişi bu ürünü görüntüledi');
  });

  it('fills the time period, 24h when none was chosen', () => {
    expect(counterTemplate('product_view_count', { template: 'Son {timePeriod}: {count}', timePeriod: '7d' }, 'tr')).toBe('Son 7d: {count}');
    expect(counterTemplate('product_view_count', { template: 'Son {timePeriod}' }, 'tr')).toBe('Son 24h');
  });
});

describe('counterParts', () => {
  it('splits around the number, and ends a template with none on it', () => {
    expect(counterParts('{count} kişi')).toEqual([null, ' kişi']);
    expect(counterParts('Son {count} günde {count}')).toEqual(['Son ', null, ' günde ', null]);
    expect(counterParts('Popüler!')).toEqual(['Popüler!', ' ', null]);
  });
});

describe('the icons', () => {
  it('has a glyph for every icon the dashboard offers on the two counters', () => {
    for (const name of ['eye', 'users', 'trending-up', 'flame', 'shopping-cart', 'shopping-bag', 'fire']) {
      expect(COUNTER_ICON_GLYPHS[name]).toBeTruthy();
    }
  });

  it('draws the type’s default for a pick the dashboard does not offer', () => {
    expect(counterIconName('cart_count', 'flame')).toBe('flame');
    expect(counterIconName('cart_count', 'nope')).toBe('shopping-cart');
    expect(counterIconName('product_view_count', undefined)).toBe('eye');
  });
});
