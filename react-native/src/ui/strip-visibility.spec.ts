import { visibleRatio, createVisibilityGate } from './strip-visibility.js';

const viewport = { width: 400, height: 800 };
const strip = (y: number) => ({ x: 0, y, width: 400, height: 200 });

describe('visibleRatio', () => {
  it('is 1 inside, 0 outside, and the overlap at an edge', () => {
    expect(visibleRatio(strip(100), viewport)).toBe(1);
    expect(visibleRatio(strip(900), viewport)).toBe(0);
    expect(visibleRatio(strip(-100), viewport)).toBe(0.5);
    expect(visibleRatio(strip(700), viewport)).toBe(0.5);
  });

  it('counts the horizontal axis too, for a strip in a pager', () => {
    expect(visibleRatio({ x: 200, y: 0, width: 400, height: 200 }, viewport)).toBe(0.5);
    expect(visibleRatio({ x: 500, y: 0, width: 400, height: 200 }, viewport)).toBe(0);
  });

  it('is 0 for what cannot be measured', () => {
    expect(visibleRatio(null, viewport)).toBe(0);
    expect(visibleRatio({ x: 0, y: 0, width: 0, height: 0 }, viewport)).toBe(0);
  });
});

describe('createVisibilityGate', () => {
  it('opens only after the dwell, not on first sight', () => {
    const gate = createVisibilityGate();
    expect(gate.sample(strip(100), viewport, 1000)).toBe(false);
    expect(gate.sample(strip(100), viewport, 1600)).toBe(false);
    expect(gate.sample(strip(100), viewport, 2000)).toBe(true);
    expect(gate.open).toBe(true);
  });

  it('a strip below the fold never opens it', () => {
    const gate = createVisibilityGate();
    for (let now = 0; now < 5000; now += 300) {
      expect(gate.sample(strip(1500), viewport, now)).toBe(false);
    }
  });

  it('closes the moment the strip leaves, and the dwell starts over on return', () => {
    const gate = createVisibilityGate();
    gate.sample(strip(100), viewport, 0);
    expect(gate.sample(strip(100), viewport, 1200)).toBe(true);
    expect(gate.sample(strip(1500), viewport, 1500)).toBe(false);
    expect(gate.sample(strip(100), viewport, 1800)).toBe(false);
    expect(gate.sample(strip(100), viewport, 2900)).toBe(true);
  });

  it('a null rectangle (covered screen, background app) closes it', () => {
    const gate = createVisibilityGate();
    gate.sample(strip(100), viewport, 0);
    expect(gate.sample(strip(100), viewport, 1500)).toBe(true);
    expect(gate.sample(null, viewport, 1600)).toBe(false);
  });
});
