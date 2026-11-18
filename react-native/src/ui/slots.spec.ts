import { APP_SCREENS } from '../vendor/app-surfaces.js';
import { SCREEN_SLOTS, slotNameOf, slotsOf, defaultSlotOf, slotOfWidget } from './slots.js';

const widget = (containerSelector: string | null) => ({ containerSelector });

describe('slotNameOf', () => {
  it('reads the attribute selector the dashboard writes, in any quoting', () => {
    expect(slotNameOf(widget('[data-selwise-slot="pdp-under-info"]'))).toBe('pdp-under-info');
    expect(slotNameOf(widget("[data-selwise-slot='pdp-under-cart']"))).toBe('pdp-under-cart');
    expect(slotNameOf(widget('[data-selwise-slot=pdp-bottom]'))).toBe('pdp-bottom');
  });

  it('accepts a bare name, folded to lower case', () => {
    expect(slotNameOf(widget('home-top'))).toBe('home-top');
    expect(slotNameOf(widget('HOME-TOP'))).toBe('home-top');
  });

  it('names no slot for an empty or web-only selector', () => {
    expect(slotNameOf(widget(''))).toBeNull();
    expect(slotNameOf(widget(null))).toBeNull();
    expect(slotNameOf(widget('#recommendations-container'))).toBeNull();
    expect(slotNameOf(widget('.pdp .price'))).toBeNull();
    expect(slotNameOf(null)).toBeNull();
  });
});

describe('slotOfWidget', () => {
  it('takes the named slot when the screen mounts it', () => {
    expect(slotOfWidget(widget('pdp-under-info'), 'app://product')).toBe('pdp-under-info');
  });

  it('falls back to the screen default for no name or a custom name no screen has', () => {
    expect(slotOfWidget(widget(''), 'app://product')).toBe('pdp-bottom');
    expect(slotOfWidget(widget('nope'), 'app://list')).toBe('plp-bottom');
  });

  it("is not drawn on a screen when its named point belongs to another screen's catalogue entry", () => {
    expect(slotOfWidget(widget('home-top'), 'app://product')).toBeNull();
    expect(slotOfWidget(widget('basket-under-items'), 'app://product')).toBeNull();
    expect(slotOfWidget(widget('basket-under-items'), 'app://basket')).toBe('basket-under-items');
  });

  it('has no slot on a screen it does not know', () => {
    expect(slotOfWidget(widget('x'), 'app://some-custom-screen')).toBeNull();
  });

  it('reads a screen by its address whatever the case, and a screen with no points has no default', () => {
    expect(slotsOf('APP://Search')).toEqual(slotsOf('app://search'));
    expect(defaultSlotOf('app://search')).toBe('search-bottom');
    expect(defaultSlotOf('app://account')).toBeNull();
    expect(slotsOf(null)).toEqual([]);
  });
});

describe('the catalogue', () => {
  it('is keyed by screens the contract names, each with a unique, lower-case, hyphenated name', () => {
    const named = new Set(APP_SCREENS.map((screen) => screen.url));
    const seen = new Set<string>();
    for (const [url, slots] of Object.entries(SCREEN_SLOTS)) {
      expect(named.has(url)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
      for (const name of slots) {
        expect(name).toMatch(/^[a-z0-9-]+$/);
        expect(seen.has(name)).toBe(false);
        seen.add(name);
      }
    }
  });
});
