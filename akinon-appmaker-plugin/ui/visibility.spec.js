'use strict';

const { shouldRender } = require('./visibility.js');

const badge = (type, minCount) => ({ type, content: { minCount } });

describe('shouldRender', () => {
  // The renderer returning null is correct, but the overlay had already
  // reported the impression — so the report counted a badge nobody could see.
  it('keeps a count badge out until it passes the merchant threshold', () => {
    expect(shouldRender(badge('product_view_count', 5), { productView: 3 })).toBe(false);
    expect(shouldRender(badge('product_view_count', 5), { productView: 5 })).toBe(true);
  });

  it('hides a count badge with nothing to count', () => {
    expect(shouldRender(badge('cart_count', 0), { cart: 0 })).toBe(false);
    expect(shouldRender(badge('cart_count', 0), {})).toBe(false);
    expect(shouldRender(badge('cart_count', 0), { cart: 2 })).toBe(true);
  });

  it('reads each badge type from its own count', () => {
    expect(shouldRender(badge('cart_count', 1), { productView: 9 })).toBe(false);
    expect(shouldRender(badge('cart_count', 1), { cart: 1 })).toBe(true);
  });

  // A dash where a countdown should be tells the visitor the offer is live.
  it('hides an expired countdown', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 60000).toISOString();
    expect(shouldRender({ type: 'countdown_timer', content: { endDate: past } })).toBe(false);
    expect(shouldRender({ type: 'countdown_timer', content: { endDate: future } })).toBe(true);
  });

  it('hides a countdown with no end date at all', () => {
    expect(shouldRender({ type: 'countdown_timer', content: {} })).toBe(false);
  });

  // A daily cutoff has no `endDate`; reading only that field kept every
  // daily-cutoff countdown out of the overlay. The target is the SDK's.
  it('asks the countdown target resolver when the overlay has one', () => {
    const daily = { type: 'countdown_timer', content: { countdownMode: 'daily_cutoff', dailyCutoff: '14:00' } };
    const now = Date.UTC(2026, 9, 6, 8, 0, 0);
    expect(shouldRender(daily, {}, { now })).toBe(false);
    expect(shouldRender(daily, {}, { now, countdownTarget: () => now + 60000 })).toBe(true);
    expect(shouldRender(daily, {}, { now, countdownTarget: () => null })).toBe(false);
  });

  it('lets every other type through', () => {
    for (const type of ['announcement_bar', 'sticky_footer', 'floating_button', 'newsletter']) {
      expect(shouldRender({ type, content: {} }, {})).toBe(true);
    }
  });

  it('tolerates nothing', () => {
    expect(shouldRender(null)).toBe(false);
    expect(shouldRender({ type: 'announcement_bar' })).toBe(true);
  });
});

describe('shouldRender: custom widgets', () => {
  it('draws a custom widget that has markup', () => {
    expect(
      shouldRender({ type: 'custom', content: { html: '<p>merhaba</p>' } }, {})
    ).toBe(true);
  });

  // CSS and JS alone style and script nothing: the document builder returns
  // null, so counting an impression would report a widget nobody saw.
  it('does not count an impression for CSS or JS with no markup', () => {
    expect(shouldRender({ type: 'custom', content: {}, customCss: '.a{}' }, {})).toBe(false);
    expect(shouldRender({ type: 'custom', content: {}, customJs: 'void 0' }, {})).toBe(false);
  });

  it('reads markup from the customCode block too', () => {
    expect(
      shouldRender({ type: 'custom', content: { customCode: { html: '<p>x</p>' } } }, {})
    ).toBe(true);
  });
});

/**
 * A cart change re-asks the SDK for the screen's surfaces, because content
 * states and `{cart.total}` are chosen at `getSurfaces()` time. What is
 * already in front of the shopper must not be rewritten or removed by it.
 */
describe('keepShownSurfaces', () => {
  const { keepShownSurfaces } = require('./visibility.js');
  const bar = (text) => ({ id: 'bar', type: 'announcement_bar', content: { text } });
  const popup = (title) => ({ id: 'pop', type: 'exit_intent_popup', content: { title } });
  const footer = { id: 'foot', type: 'sticky_footer', content: { text: 'Sepetin 640 TL' } };

  it('lets a live type take the new words', () => {
    const merged = keepShownSurfaces([bar('Sepetin 349 TL')], [bar('Sepetin 640 TL')], new Set(['bar']));
    expect(merged[0].content.text).toBe('Sepetin 640 TL');
  });

  // A popup rewritten under the reader's eyes is worse than a stale sentence.
  it('keeps a shown modal as it was shown', () => {
    const merged = keepShownSurfaces([popup('Önce')], [popup('Sonra')], new Set(['pop']));
    expect(merged[0].content.title).toBe('Önce');
  });

  it('gives a modal not yet shown the new words', () => {
    const merged = keepShownSurfaces([popup('Önce')], [popup('Sonra')], new Set());
    expect(merged[0].content.title).toBe('Sonra');
  });

  // The reload runs the frequency cap again; the allowance was spent when it appeared.
  it('does not drop a shown surface mid-screen', () => {
    const merged = keepShownSurfaces([bar('x'), popup('y')], [], ['bar', 'pop']);
    expect(merged.map((surface) => surface.id)).toEqual(['bar', 'pop']);
  });

  it('drops a surface that was never shown, and adds one the cart made eligible', () => {
    const merged = keepShownSurfaces([bar('x')], [footer], []);
    expect(merged.map((surface) => surface.id)).toEqual(['foot']);
  });
});
