import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * A screen with several segment-targeted surfaces asks the server for the
 * segments ONCE, and callers that ask at the same time share that request.
 */

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

const surface = (id: string, mode: string, segmentIds: string[], position = 'top') => ({
  id,
  type: 'announcement_bar',
  contentJson: { text: id },
  placementConfigJson: { position, placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: mode,
  segmentIds,
});

const strip = (id: string, mode: string, segmentIds: string[]) => ({
  id,
  title: id,
  displayType: 'slider',
  segmentTargetingMode: mode,
  segmentIds,
});

const CAMPAIGNS = [
  surface('a', 'include', ['seg-1']),
  surface('b', 'include', ['seg-2'], 'bottom'),
  surface('c', 'exclude', ['seg-3']),
  surface('d', 'include', ['seg-1', 'seg-3'], 'bottom'),
];
const WIDGETS = [strip('s1', 'include', ['seg-2']), strip('s2', 'exclude', ['seg-4']), strip('s3', 'include', ['seg-1'])];

function install(options: { answer?: () => Promise<unknown> } = {}) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const href = String(url);
    const raw = (init as RequestInit | undefined)?.body;
    calls.push({ url: href, body: typeof raw === 'string' ? JSON.parse(raw) : {} });
    let body: unknown = {};
    if (href.includes('/segments/evaluate')) {
      body = { results: { 'seg-1': true, 'seg-2': false, 'seg-3': true, 'seg-4': false } };
      if (options.answer) await options.answer();
    } else if (href.includes('/config')) body = { campaigns: CAMPAIGNS, widgets: [] };
    else if (href.includes('/recommendations')) body = { widgets: WIDGETS };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

const live: Selwise[] = [];
async function init() {
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
  });
  return selwise;
}

const evaluations = (calls: FetchCall[]) => calls.filter((call) => call.url.includes('/segments/evaluate'));

afterEach(async () => {
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('segments on a screen', () => {
  it('asks for every segment the surfaces name in one request', async () => {
    const calls = install();
    const selwise = await init();

    const surfaces = await selwise.getSurfaces('app://home');

    expect(evaluations(calls)).toHaveLength(1);
    expect([...(evaluations(calls)[0]!.body.segmentIds as string[])].sort()).toEqual(['seg-1', 'seg-2', 'seg-3']);
    // The verdicts are the same ones a per-surface ask gave: a (seg-1: in), b (seg-2: out), c (excluded: seg-3 in), d (seg-1 or seg-3).
    expect(surfaces.map((item) => item.id).sort()).toEqual(['a', 'd']);
  });

  it('asks for every strip’s segments in one request', async () => {
    const calls = install();
    const selwise = await init();

    const strips = await selwise.getRecommendationWidgets('app://home');

    expect(evaluations(calls)).toHaveLength(1);
    expect([...(evaluations(calls)[0]!.body.segmentIds as string[])].sort()).toEqual(['seg-1', 'seg-2', 'seg-4']);
    expect(strips.map((item) => item.id).sort()).toEqual(['s2', 's3']);
  });

  it('shares one request between the surfaces and the strips of a screen asked for together', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const calls = install({ answer: () => gate });
    const selwise = await init();

    const both = Promise.all([selwise.getSurfaces('app://home'), selwise.getRecommendationWidgets('app://home')]);
    for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setImmediate(resolve));
    release();
    const [surfaces, strips] = await both;

    expect(surfaces.map((item) => item.id).sort()).toEqual(['a', 'd']);
    expect(strips.map((item) => item.id).sort()).toEqual(['s2', 's3']);
    // seg-1 and seg-2 are named by both and asked about once; what only one
    // names (seg-3, seg-4) may ride a second request, never a third.
    expect(evaluations(calls).length).toBeLessThanOrEqual(2);
    const asked = evaluations(calls).flatMap((call) => call.body.segmentIds as string[]);
    expect(new Set(asked).size).toBe(asked.length);
  });
});
