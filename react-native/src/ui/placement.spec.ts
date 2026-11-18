import { normalizeSurface, type Surface } from '../core/surfaces.js';
import { APP_WIDGET_PLACEMENT, APP_WIDGET_TYPES } from '../vendor/app-placement.js';
import { appSlotSelector } from '../vendor/app-surfaces.js';
import { isModalSurface, layoutOf, slidesIn, slotBelongsToScreen } from './placement.js';

const surface = (type: string, placement: Record<string, unknown> = {}): Surface =>
  normalizeSurface({ id: type, type, contentJson: { x: 1 }, placementConfigJson: placement }, 'campaign') as Surface;

describe('layoutOf (K8)', () => {
  it('puts every type in the mode its table row says, at its default position', () => {
    for (const type of APP_WIDGET_TYPES) {
      const row = APP_WIDGET_PLACEMENT[type];
      const layout = layoutOf(surface(type));
      expect(layout.mode).toBe(row.mode);
      if (row.slot === 'required') expect(layout.slot).toBe(row.defaultSlot);
      else expect(layout.position).toBe(row.defaultPosition);
    }
  });

  it('keeps every position a type offers, and reads one it does not as its default', () => {
    for (const type of APP_WIDGET_TYPES) {
      for (const position of APP_WIDGET_PLACEMENT[type].positions) {
        expect(layoutOf(surface(type, { position })).position).toBe(position);
      }
    }
    expect(layoutOf(surface('newsletter', { position: 'bottom-left' })).position).toBe('center');
    expect(layoutOf(surface('sticky_footer', { position: 'top' })).position).toBe('bottom');
    expect(layoutOf(surface('slide_in', { position: 'top' })).position).toBe('right');
  });

  it('reads the website’s plain floating-button spellings as corners', () => {
    expect(layoutOf(surface('floating_button', { position: 'top' })).position).toBe('top-right');
    expect(layoutOf(surface('floating_button', { position: 'left' })).position).toBe('bottom-left');
  });

  it('draws a type that may sit in a point there, and one that may not on its own mode', () => {
    const selector = appSlotSelector('pdp-under-info');
    expect(layoutOf(surface('announcement_bar', { selector }))).toEqual({ mode: 'slot', position: '', slot: 'pdp-under-info' });
    expect(layoutOf(surface('newsletter', { selector })).mode).toBe('slot');
    // A floating button has no point to sit in: the selector is ignored.
    expect(layoutOf(surface('floating_button', { selector })).mode).toBe('floating');
    expect(layoutOf(surface('sticky_footer', { selector })).mode).toBe('dock');
  });

  it('ignores a selector that names no point of the catalogue (a website’s `.price`) instead of hiding the surface', () => {
    expect(layoutOf(surface('announcement_bar', { selector: '.price' })).mode).toBe('dock');
    expect(layoutOf(surface('announcement_bar', { selector: 'main' })).mode).toBe('dock');
    expect(layoutOf(surface('announcement_bar', { selector: appSlotSelector('no-such-point') })).mode).toBe('dock');
  });

  it('gives a counter its default point when the merchant named none, and their own when they did', () => {
    expect(layoutOf(surface('cart_count')).slot).toBe('pdp-under-info');
    expect(layoutOf(surface('cart_count', { selector: appSlotSelector('pdp-bottom') })).slot).toBe('pdp-bottom');
  });

  it('has no more `inline` dock: a surface is in a dock, a corner, a window or a point', () => {
    for (const type of APP_WIDGET_TYPES) expect(['dock', 'floating', 'modal', 'slot']).toContain(layoutOf(surface(type)).mode);
  });
});

describe('what takes the screen', () => {
  it('is a modal-mode surface only: a newsletter in a point is a card with no trigger', () => {
    expect(isModalSurface(surface('exit_intent_popup'))).toBe(true);
    expect(isModalSurface(surface('slide_in'))).toBe(true);
    expect(isModalSurface(surface('newsletter'))).toBe(true);
    expect(isModalSurface(surface('newsletter', { selector: appSlotSelector('home-top') }))).toBe(false);
    expect(isModalSurface(surface('announcement_bar'))).toBe(false);
    expect(slidesIn('slide_in')).toBe(true);
    expect(slidesIn('exit_intent_popup')).toBe(false);
  });

  it('draws a point only on the screen that has it', () => {
    expect(slotBelongsToScreen('pdp-under-info', 'app://product')).toBe(true);
    expect(slotBelongsToScreen('pdp-under-info', 'app://home')).toBe(false);
    expect(slotBelongsToScreen('pdp-under-info', null)).toBe(false);
  });
});
