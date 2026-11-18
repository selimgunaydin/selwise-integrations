import { stripHeading } from './strip-heading.js';

const BEST = { id: 'best-1', name: 'PDP — Çok satanlar', title: 'Çok satanlar' };

describe('stripHeading', () => {
  it('prefers the screen’s title, then the widget’s shopper-facing title, then its internal name', () => {
    expect(stripHeading(BEST, 'Ekran başlığı')).toBe('Ekran başlığı');
    expect(stripHeading(BEST)).toBe('Çok satanlar');
    expect(stripHeading({ name: 'PDP — İç ad', title: '' })).toBe('PDP — İç ad');
    expect(stripHeading(null)).toBe('');
  });
});
