import { mergeScenarioSurfaces, dockOf } from './scenario-surfaces.js';

interface TestSurface {
  id: string;
  type: string;
  placement: { position?: string };
}

const bar = (id: string, position: string): TestSurface => ({ id, type: 'announcement_bar', placement: { position } });
const popup = (id: string): TestSurface => ({ id, type: 'exit_intent_popup', placement: { position: 'center' } });
const claim = (surface: TestSurface) => ({ deliveryId: 'd-' + surface.id, surface });

describe('dockOf', () => {
  it('groups the way the overlay lays things out', () => {
    expect(dockOf(bar('a', 'top'))).toBe('top');
    expect(dockOf(bar('a', 'bottom'))).toBe('bottom');
    expect(dockOf({ id: 's', type: 'sticky_footer', placement: {} })).toBe('bottom');
    expect(dockOf({ id: 'f', type: 'floating_button', placement: {} })).toBe('floating');
    expect(dockOf(popup('p'))).toBe('modal');
  });
});

describe('mergeScenarioSurfaces', () => {
  it('is the screen\'s own list when there is no claim', () => {
    const own = [bar('a', 'top')];
    expect(mergeScenarioSurfaces(own, [])).toBe(own);
    expect(mergeScenarioSurfaces(own, null)).toBe(own);
    expect(mergeScenarioSurfaces(undefined, [])).toEqual([]);
  });

  it('lets the scenario take its dock and keeps the others', () => {
    const merged = mergeScenarioSurfaces(
      [bar('top-own', 'top'), bar('bottom-own', 'bottom'), popup('popup-own')],
      [claim(popup('scenario-popup'))]
    );
    expect(merged.map((s) => s.id)).toEqual(['top-own', 'bottom-own', 'scenario-popup']);
  });

  it('draws one scenario surface per dock and leaves the rest waiting', () => {
    const merged = mergeScenarioSurfaces([], [claim(popup('first')), claim(popup('second')), claim(bar('b', 'top'))]);
    expect(merged.map((s) => s.id)).toEqual(['first', 'b']);
  });

  it('ignores a malformed claim', () => {
    expect(mergeScenarioSurfaces([], [null, {}, claim(bar('ok', 'top'))]).map((s) => s.id)).toEqual(['ok']);
  });
});
