import { Selwise } from './client.js';
import { MemoryStorage } from './core/storage.js';

/**
 * A segment's membership is true, false or UNKNOWN. A campaign that hides
 * "Employees" (`exclude`) must not reach an employee because the segment was
 * switched off or the evaluate request failed — "could not be asked" is not
 * "not a member". A visitor who has not allowed personalization is the one
 * deliberate exception: in no segment, so an exclude campaign reaches them.
 */

const EXCLUDE = {
  id: 'sale',
  type: 'announcement_bar',
  contentJson: { text: 'sale' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'exclude',
  segmentIds: ['employees'],
};
const INCLUDE = { ...EXCLUDE, id: 'vip', segmentTargetingMode: 'include', segmentIds: ['employees'] };

type Evaluate = { status?: number; results?: Record<string, boolean | null> };

function install(evaluate: Evaluate) {
  const evaluations: string[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown) => {
    const href = String(url);
    let body: unknown = {};
    let status = 200;
    if (href.includes('/segments/evaluate')) {
      evaluations.push(href);
      status = evaluate.status ?? 200;
      body = { results: evaluate.results ?? {} };
    } else if (href.includes('/config')) body = { campaigns: [EXCLUDE, INCLUDE], widgets: [] };
    return { ok: status < 400, status, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return evaluations;
}

const live: Selwise[] = [];
async function start(consent?: Record<string, unknown>) {
  const selwise = new Selwise();
  live.push(selwise);
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
    ...(consent ? { consent } : {}),
  } as never);
  return selwise;
}

const ids = async (selwise: Selwise) => (await selwise.getSurfaces('app://home')).map((item) => item.id).sort();

afterEach(async () => {
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('segment membership that cannot be answered', () => {
  it('shows an exclude campaign to a known non-member', async () => {
    install({ results: { employees: false } });
    expect(await ids(await start())).toEqual(['sale']);
  });

  it('hides both when the segment is switched off (the API answers null)', async () => {
    install({ results: { employees: null } });
    expect(await ids(await start())).toEqual([]);
  });

  it('hides both when the evaluate request fails', async () => {
    install({ status: 500 });
    expect(await ids(await start())).toEqual([]);
  });

  it('hides both when the answer does not mention the segment', async () => {
    install({ results: {} });
    expect(await ids(await start())).toEqual([]);
  });

  it('a member sees the include campaign and not the exclude one', async () => {
    install({ results: { employees: true } });
    expect(await ids(await start())).toEqual(['vip']);
  });

  it('without personalization consent the visitor is in no segment: the exclude campaign shows, with no request', async () => {
    const evaluations = install({ results: { employees: true } });
    const selwise = await start({ granted: true, categories: { analytics: true, marketing: false } });

    expect(await ids(selwise)).toEqual(['sale']);
    expect(evaluations).toHaveLength(0);
  });
});
