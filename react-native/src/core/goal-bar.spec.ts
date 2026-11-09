import { MemoryStorage, STORAGE_KEYS } from './storage.js';
import { GoalReachedStore, goalStepsCrossed, normalizeGoalReachedDetail } from './goal-bar.js';
import type { GoalBarView } from '../vendor/dynamic-content.js';

function view(visible: boolean, reachedCount: number | null): GoalBarView {
  return {
    state: visible ? 'progress' : 'empty',
    visible,
    text: visible ? 'x' : '',
    buttonText: '',
    buttonUrl: '',
    progress:
      reachedCount === null
        ? null
        : {
            value: 0,
            target: 0,
            remaining: 0,
            percent: 0,
            reachedCount,
            label: '',
            reachedLabel: '',
            complete: false,
            markers: [],
          },
  };
}

describe('goalStepsCrossed', () => {
  it('reports every step passed while the bar was visible', () => {
    expect(goalStepsCrossed(view(true, 0), view(true, 2))).toEqual([0, 1]);
  });

  // Completing a goal with no reward sentence hides the bar; that crossing
  // still happened in front of the shopper.
  it('counts a crossing that hides the bar', () => {
    expect(goalStepsCrossed(view(true, 1), view(false, 2))).toEqual([1]);
  });

  it('does not count a step crossed while the bar was hidden', () => {
    expect(goalStepsCrossed(view(false, 0), view(true, 1))).toEqual([]);
  });

  // A step behind the shopper when the bar first appeared was not reached on screen.
  it('does not count anything on the first view', () => {
    expect(goalStepsCrossed(null, view(true, 2))).toEqual([]);
  });

  it('does not count going backwards, or an unknown cart', () => {
    expect(goalStepsCrossed(view(true, 2), view(true, 1))).toEqual([]);
    expect(goalStepsCrossed(view(true, 0), view(false, null))).toEqual([]);
  });
});

describe('normalizeGoalReachedDetail', () => {
  it('keeps a real step', () => {
    expect(normalizeGoalReachedDetail({ step: 0, threshold: 750, metric: 'cart_total' })).toEqual({
      step: 0,
      threshold: 750,
      metric: 'cart_total',
    });
  });

  it('rejects what does not describe a step', () => {
    expect(normalizeGoalReachedDetail({ step: -1, threshold: 750, metric: 'cart_total' })).toBeNull();
    expect(normalizeGoalReachedDetail({ step: 0.5, threshold: 750, metric: 'cart_total' })).toBeNull();
    expect(normalizeGoalReachedDetail({ step: 0, threshold: 0, metric: 'cart_total' })).toBeNull();
    expect(normalizeGoalReachedDetail({ step: 0, threshold: 750, metric: 'cart.total' })).toBeNull();
    expect(normalizeGoalReachedDetail(null)).toBeNull();
  });
});

describe('GoalReachedStore', () => {
  it('claims a key once per session', () => {
    const store = new GoalReachedStore(new MemoryStorage());
    expect(store.claim('s1', 'camp:0')).toBe(true);
    expect(store.claim('s1', 'camp:0')).toBe(false);
    expect(store.claim('s1', 'camp:1')).toBe(true);
    // A new session starts clean without anyone clearing it.
    expect(store.claim('s2', 'camp:0')).toBe(true);
  });

  // A relaunch inside the same session must not report the same step again.
  it('survives a relaunch inside the same session', async () => {
    const storage = new MemoryStorage();
    const first = new GoalReachedStore(storage);
    await first.hydrate();
    first.claim('s1', 'camp:0');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const second = new GoalReachedStore(storage);
    await second.hydrate();
    expect(second.claim('s1', 'camp:0')).toBe(false);
    expect(second.claim('s2', 'camp:0')).toBe(true);
  });

  it('drops a corrupt record', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(STORAGE_KEYS.GOAL_REACHED, '{not json');
    const store = new GoalReachedStore(storage);
    await store.hydrate();
    expect(await storage.getItem(STORAGE_KEYS.GOAL_REACHED)).toBeNull();
    expect(store.claim('s1', 'camp:0')).toBe(true);
  });
});
