import { MemoryStorage } from './storage.js';
import {
  deepMerge,
  ExperimentGate,
  FrequencyCapStore,
  normalizeSegmentIds,
  SegmentGate,
  type ExperimentAssignment,
} from './eligibility.js';

describe('SegmentGate', () => {
  it('asks again when the signed-in shopper changes, instead of serving the old answer', async () => {
    // Keyed on the segment alone, a shopper who signed in kept the anonymous
    // answer for five minutes — and on a shared device, the next person got
    // the previous one's.
    let user: string | undefined;
    const evaluate = jest.fn(async () => ({ 'seg-1': user === 'vip' }));
    const gate = new SegmentGate(evaluate, 60_000, Date.now, () => user);

    await expect(gate.shouldShow('include', ['seg-1'])).resolves.toBe(false);
    user = 'vip';
    await expect(gate.shouldShow('include', ['seg-1'])).resolves.toBe(true);
    user = undefined;
    await expect(gate.shouldShow('include', ['seg-1'])).resolves.toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('shows to everyone in "all" mode without calling the evaluator', async () => {
    const evaluate = jest.fn();
    const gate = new SegmentGate(evaluate);

    await expect(gate.shouldShow('all', ['seg-1'])).resolves.toBe(true);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('shows in include mode only when the visitor is in a listed segment', async () => {
    const gate = new SegmentGate(async () => ({ 'seg-1': false, 'seg-2': true }));

    await expect(gate.shouldShow('include', ['seg-1', 'seg-2'])).resolves.toBe(true);
  });

  it('hides in include mode when the visitor is in none of them', async () => {
    const gate = new SegmentGate(async () => ({ 'seg-1': false }));

    await expect(gate.shouldShow('include', ['seg-1'])).resolves.toBe(false);
  });

  it('hides in exclude mode when the visitor IS a member', async () => {
    const gate = new SegmentGate(async () => ({ 'seg-1': true }));

    await expect(gate.shouldShow('exclude', ['seg-1'])).resolves.toBe(false);
  });

  // The failure directions are the whole point: an unreachable evaluator means
  // "member of nothing", so include hides and exclude shows. Inverting either
  // one shows a campaign to the wrong audience rather than to none.
  it('fails closed for include and open for exclude', async () => {
    const gate = new SegmentGate(async () => {
      throw new Error('offline');
    });

    await expect(gate.shouldShow('include', ['seg-1'])).resolves.toBe(false);
    await expect(gate.shouldShow('exclude', ['seg-1'])).resolves.toBe(true);
  });

  it('asks once per segment inside the cache window', async () => {
    const evaluate = jest.fn(async () => ({ 'seg-1': true }));
    const gate = new SegmentGate(evaluate);

    await gate.shouldShow('include', ['seg-1']);
    await gate.shouldShow('include', ['seg-1']);

    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('re-asks once the cache window has passed', async () => {
    const evaluate = jest.fn(async () => ({ 'seg-1': true }));
    let clock = 1_000;
    const gate = new SegmentGate(evaluate, 60_000, () => clock);

    await gate.shouldShow('include', ['seg-1']);
    clock += 59_000;
    await gate.shouldShow('include', ['seg-1']);
    expect(evaluate).toHaveBeenCalledTimes(1);

    clock += 2_000;
    await gate.shouldShow('include', ['seg-1']);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed lookup', async () => {
    let fail = true;
    const evaluate = jest.fn(async () => {
      if (fail) throw new Error('offline');
      return { 'seg-1': true };
    });
    const gate = new SegmentGate(evaluate);

    await expect(gate.shouldShow('include', ['seg-1'])).resolves.toBe(false);
    fail = false;
    await expect(gate.shouldShow('include', ['seg-1'])).resolves.toBe(true);
  });
});

describe('normalizeSegmentIds', () => {
  // The route validates every id as a UUID and rejects the whole body on one
  // bad entry, so a duplicate is wasted payload and the order is a cache key.
  it('dedupes, trims and sorts', () => {
    expect(normalizeSegmentIds([' b ', 'a', 'b', '', null, 7])).toEqual(['a', 'b']);
  });

  it('returns nothing for a non-array', () => {
    expect(normalizeSegmentIds('seg-1')).toEqual([]);
    expect(normalizeSegmentIds(undefined)).toEqual([]);
  });
});

const DIFFERENT_MODULE: ExperimentAssignment = {
  experimentId: 'exp-1',
  variantId: 'var-b',
  experimentMode: 'different_module',
  targetType: 'widget',
  targetId: 'widget-control',
  effectiveTargetId: 'widget-variant',
  controlTargetId: 'widget-control',
  excludedTargetIds: ['widget-control'],
  moduleData: { id: 'widget-variant', type: 'announcement_bar', contentJson: { text: 'B' } },
};

describe('ExperimentGate', () => {
  it('excludes a control the variant replaced', async () => {
    const gate = new ExperimentGate();
    await gate.load(async () => ({ 'exp-1': DIFFERENT_MODULE }));

    expect(gate.shouldRenderTarget('widget-control')).toBe(false);
    expect(gate.shouldRenderTarget('widget-variant')).toBe(true);
  });

  it('offers the substituted module so the variant arm has something to render', async () => {
    const gate = new ExperimentGate();
    await gate.load(async () => ({ 'exp-1': DIFFERENT_MODULE }));

    const modules = gate.variantModules();
    expect(modules).toHaveLength(1);
    expect((modules[0]!.moduleData as { id: string }).id).toBe('widget-variant');
  });

  it('finds the assignment by any of the three target ids', async () => {
    const gate = new ExperimentGate();
    await gate.load(async () => ({ 'exp-1': DIFFERENT_MODULE }));

    expect(gate.forTarget('widget-variant')?.variantId).toBe('var-b');
    expect(gate.forTarget('widget-control')?.variantId).toBe('var-b');
    expect(gate.forTarget('someone-else')).toBeNull();
  });

  // `config` is what the server sends; `variantConfig` is the alias the browser
  // widget prefers. Reading only one name is how an override silently no-ops.
  it('reads the override under either name, preferring variantConfig', async () => {
    const gate = new ExperimentGate();
    await gate.load(async () => ({
      a: { experimentId: 'a', variantId: '1', targetId: 't1', config: { content: { title: 'X' } } },
      b: {
        experimentId: 'b',
        variantId: '1',
        targetId: 't2',
        config: { content: { title: 'from config' } },
        variantConfig: { content: { title: 'from variantConfig' } },
      },
    }));

    expect(gate.configFor('t1')).toEqual({ content: { title: 'X' } });
    expect(gate.configFor('t2')).toEqual({ content: { title: 'from variantConfig' } });
    expect(gate.configFor('t3')).toBeNull();
  });

  it('fetches once per launch', async () => {
    const fetchAssignments = jest.fn(async () => ({}));
    const gate = new ExperimentGate();

    await gate.load(fetchAssignments);
    await gate.load(fetchAssignments);

    expect(fetchAssignments).toHaveBeenCalledTimes(1);
  });

  // No assignments is the same state as a visitor outside every experiment:
  // the control renders. Failing the other way would blank the app.
  it('renders every target when the fetch fails', async () => {
    const gate = new ExperimentGate();
    await gate.load(async () => {
      throw new Error('offline');
    });

    expect(gate.shouldRenderTarget('anything')).toBe(true);
    expect(gate.list()).toEqual([]);
  });
});

describe('FrequencyCapStore', () => {
  const build = async () => {
    const storage = new MemoryStorage();
    const store = new FrequencyCapStore(storage);
    await store.hydrate();
    return { storage, store };
  };

  it('allows anything with no cap configured', async () => {
    const { store } = await build();

    expect(store.blockedBy('s1', undefined, 'session-1')).toBeNull();
    expect(store.blockedBy('s1', {}, 'session-1')).toBeNull();
  });

  it('blocks a second show in the same session', async () => {
    const { store } = await build();

    expect(store.blockedBy('s1', { perSession: 1 }, 'session-1')).toBeNull();
    await store.recordShown('s1', 'session-1');
    expect(store.blockedBy('s1', { perSession: 1 }, 'session-1')).toBe('perSession');
  });

  it('rolls the session counter for a new session but keeps the daily one', async () => {
    const { store } = await build();
    await store.recordShown('s1', 'session-1');

    expect(store.blockedBy('s1', { perSession: 1 }, 'session-2')).toBeNull();
    expect(store.blockedBy('s1', { perDay: 1 }, 'session-2')).toBe('perDay');
  });

  it('rolls the daily counter on the next day', async () => {
    const { store } = await build();
    const monday = Date.parse('2026-09-07T10:00:00Z');
    await store.recordShown('s1', 'session-1', monday);

    expect(store.blockedBy('s1', { perDay: 1 }, 'session-1', monday)).toBe('perDay');
    const tuesday = monday + 24 * 60 * 60 * 1000;
    expect(store.blockedBy('s1', { perDay: 1 }, 'session-1', tuesday)).toBeNull();
  });

  // The shopper's calendar, as the panel says: midnight and Monday where the
  // phone is — not 00:00 UTC and not a Thursday (weeks since the epoch).
  it('rolls the day at local midnight and the week on Monday', async () => {
    const { store } = await build();
    const tuesdayLate = new Date(2026, 9, 20, 23, 30).getTime();
    await store.recordShown('s1', 'session-1', tuesdayLate);

    const wednesdayEarly = new Date(2026, 9, 21, 0, 30).getTime();
    expect(store.blockedBy('s1', { perDay: 1 }, 'session-1', wednesdayEarly)).toBeNull();

    const thursday = new Date(2026, 9, 22, 12).getTime();
    expect(store.blockedBy('s1', { perWeek: 1 }, 'session-1', thursday)).toBe('perWeek');
    const sunday = new Date(2026, 9, 25, 23, 59).getTime();
    expect(store.blockedBy('s1', { perWeek: 1 }, 'session-1', sunday)).toBe('perWeek');
    const monday = new Date(2026, 9, 26, 0, 1).getTime();
    expect(store.blockedBy('s1', { perWeek: 1 }, 'session-1', monday)).toBeNull();
  });

  it('keeps one week across 1 January', async () => {
    const { store } = await build();
    await store.recordShown('s1', 'session-1', new Date(2026, 11, 29, 12).getTime());

    expect(
      store.blockedBy('s1', { perWeek: 1 }, 'session-1', new Date(2027, 0, 1, 12).getTime()),
    ).toBe('perWeek');
  });

  it('never rolls the total', async () => {
    const { store } = await build();
    const monday = Date.parse('2026-09-07T10:00:00Z');
    await store.recordShown('s1', 'session-1', monday);

    const nextMonth = monday + 31 * 24 * 60 * 60 * 1000;
    expect(store.blockedBy('s1', { total: 1 }, 'session-9', nextMonth)).toBe('total');
  });

  it('honours minInterval', async () => {
    const { store } = await build();
    const now = Date.parse('2026-09-07T10:00:00Z');
    await store.recordShown('s1', 'session-1', now);

    expect(store.blockedBy('s1', { minInterval: '30m' }, 'session-1', now + 60_000)).toBe(
      'minInterval'
    );
    expect(
      store.blockedBy('s1', { minInterval: '30m' }, 'session-1', now + 31 * 60_000)
    ).toBeNull();
  });

  it('counts each surface separately', async () => {
    const { store } = await build();
    await store.recordShown('s1', 'session-1');

    expect(store.blockedBy('s2', { perSession: 1 }, 'session-1')).toBeNull();
  });

  // The app process outlives the screen — an uncapped relaunch is exactly the
  // bug this exists to prevent.
  it('survives a relaunch', async () => {
    const { storage, store } = await build();
    await store.recordShown('s1', 'session-1');

    const next = new FrequencyCapStore(storage);
    await next.hydrate();
    expect(next.blockedBy('s1', { perDay: 1 }, 'session-2')).toBe('perDay');
  });

  it('starts clean rather than throwing on corrupt storage', async () => {
    const storage = new MemoryStorage();
    await storage.setItem('selwise_frequency_caps', '{not json');

    const store = new FrequencyCapStore(storage);
    await store.hydrate();
    expect(store.blockedBy('s1', { perDay: 1 }, 'session-1')).toBeNull();
  });
});

describe('deepMerge', () => {
  it('merges nested objects instead of replacing the block', () => {
    expect(deepMerge({ styles: { color: 'red', fontSize: 12 } }, { styles: { color: 'blue' } }))
      .toEqual({ styles: { color: 'blue', fontSize: 12 } });
  });

  // A variant's three slides must not become six.
  it('replaces arrays', () => {
    expect(deepMerge({ slides: [1, 2, 3] }, { slides: [9] })).toEqual({ slides: [9] });
  });

  it('skips undefined so a partial override cannot blank a field', () => {
    expect(deepMerge({ title: 'keep' }, { title: undefined })).toEqual({ title: 'keep' });
  });

  it('leaves the base untouched', () => {
    const base = { styles: { color: 'red' } };
    deepMerge(base, { styles: { color: 'blue' } });
    expect(base.styles.color).toBe('red');
  });

  it('returns a copy of the base for a missing override', () => {
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
  });
});
