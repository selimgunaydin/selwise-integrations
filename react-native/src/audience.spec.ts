import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * An entity experiment's own Audience through `getSurfaces()`: a screen it
 * does not admit gets the live campaign and counts nothing; a screen it admits
 * gets the arm and records the exposure.
 */

interface FetchCall {
  url: string;
  init: RequestInit;
}

const CAMPAIGN = {
  id: 'banner',
  type: 'announcement_bar',
  contentJson: { text: 'Canlı metin' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'all',
  segmentIds: [],
};

function assignments(audience: Record<string, unknown>) {
  return {
    'exp-1': {
      experimentId: 'exp-1',
      variantId: 'arm-b',
      experimentMode: 'config_override',
      targetType: 'campaign',
      targetId: 'banner',
      effectiveTargetId: 'banner',
      excludedTargetIds: [],
      config: { content: { text: 'B kolu' } },
      audience,
    },
  };
}

function install(options: { assignments: Record<string, unknown>; segments?: Record<string, boolean> }) {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    let body: unknown = {};
    if (call.url.includes('/experiments/assign')) body = options.assignments;
    else if (call.url.includes('/segments/evaluate')) body = { results: options.segments ?? {} };
    else if (call.url.includes('/config')) body = { campaigns: [CAMPAIGN], widgets: [] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

async function init() {
  const selwise = new Selwise();
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
  });
  return selwise;
}

const exposures = (calls: FetchCall[]) =>
  calls
    .filter((call) => call.url.includes('/public/experiments/track'))
    .map((call) => JSON.parse(String(call.init.body)));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const textOf = (surfaces: Array<{ content: Record<string, unknown> }>) => surfaces.map((s) => s.content.text);

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('getSurfaces: the experiment`s own audience', () => {
  it('declares the audience capability when it asks for assignments', async () => {
    const calls = install({ assignments: {} });
    const client = await init();
    await client.getSurfaces('app://home');
    const assign = calls.find((call) => call.url.includes('/experiments/assign'))!;
    expect(decodeURIComponent(assign.url)).toContain('capabilities=holdout,audience');
  });

  it('gives a screen outside the audience the live campaign, uncounted', async () => {
    const calls = install({ assignments: assignments({ targeting: { device: { types: ['tablet'] } } }) });
    const client = await init();

    const surfaces = await client.getSurfaces('app://home');
    await settle();

    expect(textOf(surfaces)).toEqual(['Canlı metin']);
    expect(surfaces[0]?.experiment ?? null).toBeNull();
    expect(exposures(calls)).toEqual([]);
  });

  it('gives a screen inside it the arm, and counts the visitor once', async () => {
    const calls = install({
      assignments: assignments({ targeting: { showOnAllPages: false, includeUrls: ['app://product/*'] } }),
    });
    const client = await init();

    expect(textOf(await client.getSurfaces('app://home'))).toEqual(['Canlı metin']);
    expect(textOf(await client.getSurfaces('app://product/42'))).toEqual(['B kolu']);
    expect(textOf(await client.getSurfaces('app://product/43'))).toEqual(['B kolu']);
    await settle();

    const sent = exposures(calls);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(expect.objectContaining({ experimentId: 'exp-1', variantId: 'arm-b', eventType: 'exposure' }));
  });

  it('asks segment membership for a segment audience', async () => {
    const outside = install({
      assignments: assignments({ segments: { mode: 'include', ids: ['11111111-1111-4111-8111-111111111111'] } }),
      segments: {},
    });
    const first = await init();
    expect(textOf(await first.getSurfaces('app://home'))).toEqual(['Canlı metin']);
    expect(outside.some((call) => call.url.includes('/segments/evaluate'))).toBe(true);

    install({
      assignments: assignments({ segments: { mode: 'include', ids: ['11111111-1111-4111-8111-111111111111'] } }),
      segments: { '11111111-1111-4111-8111-111111111111': true },
    });
    const second = await init();
    expect(textOf(await second.getSurfaces('app://home'))).toEqual(['B kolu']);
  });
});
