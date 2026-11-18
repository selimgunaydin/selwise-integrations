import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';
import { NotShownLedger, describeNotShown } from './core/not-shown.js';
import { APP_EXPLAIN_REASONS } from './vendor/app-not-shown.js';
import { renderVerdict, shouldRender } from './ui/visibility.js';

/**
 * `explain()`: why a campaign or a strip the API sent is not on the screen. Every
 * reason is written by the code that decides it — these tests drive that code
 * (`getSurfaces`, the strips) and read the answer back.
 */

const base = {
  type: 'announcement_bar',
  contentJson: { text: 'Merhaba' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'all',
  segmentIds: [],
};

interface Setup {
  campaigns?: unknown[];
  assignments?: Record<string, unknown>;
  segments?: Record<string, boolean>;
  widgets?: unknown[];
  products?: unknown[];
}

function install(setup: Setup) {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown) => {
    const href = String(url);
    let body: unknown = {};
    if (href.includes('/experiments/assign')) body = setup.assignments ?? {};
    else if (href.includes('/segments/evaluate')) body = { results: setup.segments ?? {} };
    else if (href.includes('/recommendations') && href.includes('/products')) {
      body = { widgetId: 'strip-1', products: setup.products ?? [] };
    } else if (href.includes('/recommendations')) body = { widgets: setup.widgets ?? [] };
    else if (href.includes('/config')) body = { campaigns: setup.campaigns ?? [], widgets: [] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
}

const live: Selwise[] = [];
async function start(options: Record<string, unknown> = {}): Promise<Selwise> {
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
    ...options,
  } as Parameters<Selwise['init']>[0]);
  return selwise;
}

afterEach(async () => {
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

const reasons = (selwise: Selwise) => selwise.explain().map((report) => `${report.id}:${report.reason}`).sort();

describe('explain(): campaigns', () => {
  it('says nothing about a surface that is delivered', async () => {
    install({ campaigns: [{ ...base, id: 'c1' }] });
    const selwise = await start();
    selwise.setScreen('app://home');

    expect((await selwise.getSurfaces('app://home')).map((surface) => surface.id)).toEqual(['c1']);
    expect(selwise.explain()).toEqual([]);
  });

  it('names the screen that is not targeted, and files it under the screen it was judged on', async () => {
    install({
      campaigns: [{ ...base, id: 'c1', pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'] } }],
    });
    const selwise = await start();
    selwise.setScreen('app://home');
    await selwise.getSurfaces('app://home');

    expect(selwise.explain()).toEqual([
      expect.objectContaining({
        id: 'c1',
        kind: 'campaign',
        type: 'announcement_bar',
        screen: 'app://home',
        reason: 'screens',
        waiting: false,
      }),
    ]);

    // Another screen: the answer is about THAT screen, and c1 is delivered there.
    selwise.setScreen('app://basket');
    await selwise.getSurfaces('app://basket');
    expect(selwise.explain()).toEqual([]);
  });

  it('separates the test-mode gate, the visitor\'s close, a behavior rule and a country rule', async () => {
    install({
      campaigns: [
        { ...base, id: 'draft', isTestMode: true },
        { ...base, id: 'rich', pageTargetingJson: { showOnAllPages: true, behavior: { match: 'all', rules: [{ signal: 'cartValue', op: 'gte', value: 9999 }] } } },
        { ...base, id: 'abroad', pageTargetingJson: { showOnAllPages: true, geo: { mode: 'include', countries: ['DE'] } } },
      ],
    });
    const selwise = await start();
    selwise.setScreen('app://home');
    // A country is known only when the server said it or the host passes it.
    await selwise.getSurfaces('app://home', { country: 'TR' });

    expect(reasons(selwise)).toEqual(['abroad:country', 'draft:test', 'rich:behavior']);
  });

  it('says a visitor\'s close is why, after they closed it', async () => {
    install({ campaigns: [{ ...base, id: 'c1' }] });
    const selwise = await start();
    selwise.setScreen('app://home');
    const [surface] = await selwise.getSurfaces('app://home');
    await selwise.dismissSurface(surface!);
    await selwise.getSurfaces('app://home');

    expect(reasons(selwise)).toEqual(['c1:dismissed']);
  });

  it('says segment, and says consent when the answer forbids reading segments at all', async () => {
    const campaign = { ...base, id: 'vip', segmentTargetingMode: 'include', segmentIds: ['seg-1'] };
    install({ campaigns: [campaign], segments: { 'seg-1': false } });
    const selwise = await start();
    selwise.setScreen('app://home');
    await selwise.getSurfaces('app://home');
    expect(reasons(selwise)).toEqual(['vip:segment']);

    install({ campaigns: [campaign], segments: { 'seg-1': true } });
    const noConsent = await start({ consent: { granted: true, categories: { analytics: true, marketing: false } } });
    noConsent.setScreen('app://home');
    await noConsent.getSurfaces('app://home');
    expect(noConsent.explain()).toEqual([
      expect.objectContaining({ id: 'vip', reason: 'consent', detail: expect.objectContaining({ channel: 'personalization' }) }),
    ]);
  });

  it('says what the experiment did: an arm that draws another module, and a holdout', async () => {
    install({
      campaigns: [{ ...base, id: 'control' }, { ...base, id: 'held' }],
      assignments: {
        'exp-1': {
          experimentId: 'exp-1',
          variantId: 'arm-1',
          experimentMode: 'different_module',
          targetType: 'campaign',
          targetId: 'control',
          effectiveTargetId: 'other',
          controlTargetId: 'control',
          excludedTargetIds: ['control'],
          moduleData: { ...base, id: 'other' },
          config: null,
        },
        'exp-2': {
          experimentId: 'exp-2',
          variantId: 'arm-h',
          experimentMode: 'config_override',
          targetType: 'campaign',
          targetId: 'held',
          effectiveTargetId: 'held',
          excludedTargetIds: [],
          config: null,
          hasHoldout: true,
          holdout: true,
        },
      },
    });
    const selwise = await start();
    selwise.setScreen('app://home');
    await selwise.getSurfaces('app://home');

    expect(selwise.explain().map((report) => [report.id, report.reason])).toEqual(
      expect.arrayContaining([
        ['control', 'experiment_arm'],
        ['held', 'experiment_holdout'],
      ])
    );
    expect(selwise.explain('held')[0]!.detail).toEqual({ experimentId: 'exp-2' });
  });

  it('says frequency_cap with the window that blocked it, and conflict for the loser of a dock', async () => {
    install({
      campaigns: [
        { ...base, id: 'low', placementConfigJson: { position: 'top', conflictResolution: { priority: 1 } } },
        { ...base, id: 'high', placementConfigJson: { position: 'top', conflictResolution: { priority: 9 } } },
      ],
    });
    const selwise = await start();
    selwise.setScreen('app://home');
    await selwise.getSurfaces('app://home');
    expect(reasons(selwise)).toEqual(['low:conflict']);

    install({
      campaigns: [{ ...base, id: 'capped', placementConfigJson: { position: 'top', frequencyCap: { perSession: 1 } } }],
    });
    const capped = await start();
    capped.setScreen('app://home');
    const [shown] = await capped.getSurfaces('app://home');
    await capped.recordSurfaceShown(shown!);
    await capped.getSurfaces('app://product');
    capped.setScreen('app://product');
    expect(capped.explain()).toEqual([
      expect.objectContaining({ id: 'capped', reason: 'frequency_cap', detail: { window: 'perSession' } }),
    ]);
  });

  it('says content for a surface with nothing to say', async () => {
    install({ campaigns: [{ ...base, id: 'blank', contentJson: {} }] });
    const selwise = await start();
    selwise.setScreen('app://home');
    await selwise.getSurfaces('app://home');

    expect(selwise.explain()).toEqual([expect.objectContaining({ id: 'blank', reason: 'content', detail: { cause: 'empty' } })]);
  });

  it('returns only the current screen\'s, and one entity\'s when asked', async () => {
    install({
      campaigns: [
        { ...base, id: 'a', pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'] } },
        { ...base, id: 'b', pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'] } },
      ],
    });
    const selwise = await start();
    selwise.setScreen('app://home');
    await selwise.getSurfaces('app://home');
    selwise.setScreen('app://product');

    expect(selwise.explain()).toEqual([]);
    selwise.setScreen('app://home');
    expect(selwise.explain().map((report) => report.id).sort()).toEqual(['a', 'b']);
    expect(selwise.explain('b').map((report) => report.id)).toEqual(['b']);
  });

  it('logs each report once in debug mode', async () => {
    install({ campaigns: [{ ...base, id: 'c1', pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'] } }] });
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const selwise = await start({ debug: true });
    selwise.setScreen('app://home');
    await selwise.getSurfaces('app://home');
    await selwise.getSurfaces('app://home');

    const said = log.mock.calls.map((call) => call.join(' ')).filter((line) => line.includes('not shown on app://home: screens'));
    expect(said).toHaveLength(1);
  });

  it('every reason it returns is one of the shared codes', async () => {
    install({ campaigns: [{ ...base, id: 'draft', isTestMode: true }, { ...base, id: 'blank', contentJson: {} }] });
    const selwise = await start();
    selwise.setScreen('app://home');
    await selwise.getSurfaces('app://home');
    for (const report of selwise.explain()) expect(APP_EXPLAIN_REASONS as readonly string[]).toContain(report.reason);
  });
});

describe('explain(): strips', () => {
  const widget = { id: 'strip-1', name: 'Benzer' };

  it('says test for a draft strip and segment for a strip outside its segment', async () => {
    install({
      widgets: [
        { id: 'draft', isTestMode: true },
        { id: 'vip', segmentTargetingMode: 'include', segmentIds: ['seg-1'] },
      ],
      segments: { 'seg-1': false },
    });
    const selwise = await start();
    selwise.setScreen('app://home');
    await selwise.getRecommendationWidgets('app://home');

    expect(selwise.explain().map((report) => [report.id, report.kind, report.reason]).sort()).toEqual([
      ['draft', 'strip', 'test'],
      ['vip', 'strip', 'segment'],
    ]);
  });

  it('says empty when a strip had no products, and nothing once it has some', async () => {
    install({ widgets: [widget], products: [] });
    const selwise = await start();
    selwise.setScreen('app://home');
    expect(await selwise.strips.strips('app://home')).toEqual([]);
    expect(selwise.explain()).toEqual([expect.objectContaining({ id: 'strip-1', kind: 'strip', reason: 'empty' })]);

    install({ widgets: [widget], products: [{ itemCode: 'p1', title: 'Ürün' }] });
    const again = await start();
    again.setScreen('app://home');
    expect((await again.strips.strips('app://home')).length).toBe(1);
    expect(again.explain()).toEqual([]);
  });
});

describe('NotShownLedger', () => {
  it('replaces one owner\'s reports as a whole and never touches the other\'s', () => {
    const ledger = new NotShownLedger(() => undefined, () => 1);
    ledger.replace('decision', 'campaign', 'app://home', [{ id: 'a', kind: 'campaign', reason: 'segment' }]);
    ledger.replace('draw', 'campaign', 'app://home', [{ id: 'b', kind: 'campaign', reason: 'trigger_armed' }]);
    ledger.replace('decision', 'campaign', 'app://home', [{ id: 'c', kind: 'campaign', reason: 'test' }]);

    expect(ledger.list({ screen: 'app://home' }).map((report) => report.id).sort()).toEqual(['b', 'c']);
    expect(ledger.list({ screen: 'app://home', id: 'b' })[0]!.waiting).toBe(true);
    expect(ledger.list({ screen: 'app://home', id: 'c' })[0]!.waiting).toBe(false);
  });

  it('prints a waiting surface as a wait, not a failure', () => {
    const ledger = new NotShownLedger(() => undefined, () => 1);
    ledger.replace('draw', 'campaign', 'app://home', [
      { id: 'a', kind: 'campaign', type: 'exit_intent_popup', reason: 'trigger_armed', detail: { trigger: 'exit_intent' } },
    ]);
    expect(describeNotShown(ledger.list()[0]!)).toBe(
      'campaign a (exit_intent_popup) is waiting on app://home: trigger_armed {"trigger":"exit_intent"}'
    );
  });
});

describe('renderVerdict', () => {
  const counter = (minCount: number) => ({ type: 'product_view_count', content: { minCount } });

  it('names why a counter is not drawn, and agrees with shouldRender', () => {
    expect(renderVerdict(counter(5), { count: 3 })).toEqual({ reason: 'below_min_count', detail: { count: 3, min: 5 } });
    expect(renderVerdict(counter(5), { count: null })).toEqual({ reason: 'count_unavailable', detail: { pending: false } });
    expect(renderVerdict(counter(5), { count: undefined })).toEqual({ reason: 'count_unavailable', detail: { pending: true } });
    expect(renderVerdict(counter(5), { count: 9, productKnown: false })).toEqual({ reason: 'product_unresolved' });
    expect(renderVerdict(counter(5), { count: 9 })).toBeNull();
    for (const reading of [{ count: 3 }, { count: null }, { count: 9 }, { count: 9, productKnown: false }]) {
      expect(shouldRender(counter(5), reading)).toBe(renderVerdict(counter(5), reading) === null);
    }
  });

  it('names a type with no renderer, and an expired countdown', () => {
    expect(renderVerdict({ type: 'inline_banner', content: {} })).toEqual({ reason: 'type', detail: { type: 'inline_banner' } });
    expect(renderVerdict({ type: 'inline_banner', content: {} }, null, { canDraw: () => true })).toBeNull();
    const past = new Date(Date.now() - 1000).toISOString();
    expect(renderVerdict({ type: 'countdown_timer', content: { endDate: past } })).toEqual({
      reason: 'content',
      detail: { cause: 'countdown_over' },
    });
  });
});
