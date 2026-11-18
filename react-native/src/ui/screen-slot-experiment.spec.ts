import { createElement as h, type ElementType } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Selwise } from '../client.js';
import { MemoryStorage } from '../core/storage.js';
import { SelwiseProvider } from '../react/context.js';
import type { SelwiseHost } from '../react/host.js';
import type { SelwiseProduct } from '../types.js';
import { controls } from './test/react-native.mock.js';
import { SelwiseSlot } from './SelwiseSlot.js';

/**
 * A SCREEN experiment owns its point: the visitor's arm is drawn there instead
 * of what the point's own targeting would have drawn, and the exposure is
 * recorded when the point is on screen — the same moment for every arm, the one
 * that shows nothing included.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCREEN = 'app://product';
const SLOT = 'pdp-under-info';
const EXPERIMENT = 'e0000000-0000-4000-8000-000000000001';
const ARM_STRIP = 'e0000000-0000-4000-8000-000000000011';
const ARM_NONE = 'e0000000-0000-4000-8000-000000000010';
const ARM_CAMPAIGN = 'e0000000-0000-4000-8000-000000000012';

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}
let calls: Call[] = [];
let assignments: Record<string, unknown> = {};
let listed: unknown[] = [];
let campaigns: unknown[] = [];
let enrichmentItems: unknown[] = [];

const el = (name: string) => name as unknown as ElementType;
const live: Selwise[] = [];
const renderers: ReactTestRenderer[] = [];

function installFetch() {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    calls.push({ url: href, body: init && init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
    let payload: unknown = {};
    if (href.includes('/experiments/assign')) payload = assignments;
    else if (href.includes('/app/enrichments')) {
      payload = { v: 's', code: 'KM1', resolved: true, slots: ['pdp-specs'], items: enrichmentItems };
    }
    else if (href.includes('/products')) {
      payload = { products: [{ id: 'P1', itemCode: 'P1', title: 'Ürün P1', price: 100, currency: 'TRY', url: '/p/P1' } as SelwiseProduct] };
    } else if (/\/recommendations(\?|$)/.test(href)) payload = { widgets: listed };
    else if (href.includes('/config')) {
      payload = { campaigns, widgets: [], enrichment: { enabled: true, v: 's', slots: [], keys: ['pdp-specs'] }, theme: {} };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

const tracked = (eventType: string) =>
  calls.filter((call) => call.url.includes('/experiments/track') && call.body && call.body['eventType'] === eventType);

async function startClient(): Promise<Selwise> {
  const client = new Selwise();
  live.push(client);
  await client.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
  });
  return client;
}

async function mount(client: Selwise, host: SelwiseHost, ...children: unknown[]): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(h(SelwiseProvider, { client, host }, ...(children as never[])) as never, {
      createNodeMock: () => ({
        measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 100, 390, 200),
      }),
    });
  });
  renderers.push(renderer);
  return renderer;
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

const textOf = (node: { children: unknown[] }): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child as { children: unknown[] }))).join('');
const texts = (renderer: ReactTestRenderer) => renderer.root.findAllByType(el('Text')).map(textOf);

const arm = (variantId: string, name: string, module: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  experimentId: EXPERIMENT,
  variantId,
  variantName: name,
  experimentMode: 'config_override',
  targetType: 'screen_slot',
  config: { screen: SCREEN, slot: SLOT, module },
  excludedTargetIds: [],
  ...extra,
});

const NATIVE_STRIP = { id: 'native-a', name: 'Doğal', title: 'Doğal şerit', containerSelector: `[data-selwise-slot="${SLOT}"]` };

beforeEach(() => {
  assignments = {};
  listed = [NATIVE_STRIP];
  campaigns = [];
  enrichmentItems = [];
  controls.reset();
  installFetch();
});

afterEach(async () => {
  jest.useRealTimers();
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  await Promise.all(live.splice(0).map((client) => client.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

const slot = () => h(SelwiseSlot, { screen: SCREEN, slot: SLOT, context: { currentProductId: 'KM1' } });

describe('SelwiseSlot owned by a screen experiment', () => {
  it('declares the screen_slot capability, or the API keeps the visitor out of the experiment', async () => {
    const client = await startClient();
    await mount(client, {}, slot());
    await settle();
    const assign = calls.find((call) => call.url.includes('/experiments/assign'))!;
    expect(decodeURIComponent(assign.url)).toContain('screen_slot');
  });

  it('draws the arm’s strip instead of the point’s own, and asks for no list at all', async () => {
    assignments = {
      [EXPERIMENT]: arm(ARM_STRIP, 'Şerit B', { kind: 'recommendation', id: 'strip-b' }, { moduleData: { id: 'strip-b', name: 'B', title: 'B şeridi' } }),
    };
    const client = await startClient();
    const renderer = await mount(client, {}, slot());
    await settle();

    expect(texts(renderer)).toContain('B şeridi');
    expect(texts(renderer)).not.toContain('Doğal şerit');
    expect(calls.filter((call) => /\/recommendations(\?|$)/.test(call.url))).toHaveLength(0);
    expect(calls.some((call) => call.url.includes('/recommendations/strip-b/products'))).toBe(true);
    expect(calls.some((call) => call.url.includes('/recommendations/native-a/products'))).toBe(false);
  });

  it('counts the exposure when the point has been on screen for a second, not when it is mounted', async () => {
    jest.useFakeTimers();
    assignments = {
      [EXPERIMENT]: arm(ARM_STRIP, 'Şerit B', { kind: 'recommendation', id: 'strip-b' }, { moduleData: { id: 'strip-b', title: 'B şeridi' } }),
    };
    const client = await startClient();
    await mount(client, {}, slot());
    await settle();
    expect(tracked('exposure')).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(1800);
    });
    await settle();
    expect(tracked('exposure')).toHaveLength(1);
    expect(tracked('exposure')[0]!.body).toMatchObject({ experimentId: EXPERIMENT, variantId: ARM_STRIP });
  });

  it('draws nothing in the arm that shows nothing, and still counts it at the same moment', async () => {
    jest.useFakeTimers();
    assignments = { [EXPERIMENT]: arm(ARM_NONE, 'Boş', { kind: 'none' }, { holdout: true, hasHoldout: true }) };
    const client = await startClient();
    const renderer = await mount(client, {}, slot());
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(1800);
    });
    await settle();

    expect(texts(renderer)).toEqual([]);
    // What the point would have drawn is not drawn, and not even asked for.
    expect(calls.some((call) => call.url.includes('/recommendations/native-a/products'))).toBe(false);
    expect(tracked('exposure')).toHaveLength(1);
    expect(tracked('exposure')[0]!.body).toMatchObject({ variantId: ARM_NONE });
  });

  it('is drawn as it always was for a visitor in no experiment, and counts nothing', async () => {
    jest.useFakeTimers();
    const client = await startClient();
    const renderer = await mount(client, {}, slot());
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(1800);
    });
    await settle();
    expect(texts(renderer)).toContain('Doğal şerit');
    expect(tracked('exposure')).toHaveLength(0);
  });

  it('reads the arm of another point as not its own', async () => {
    assignments = {
      [EXPERIMENT]: {
        ...arm(ARM_STRIP, 'Şerit B', { kind: 'recommendation', id: 'strip-b' }, { moduleData: { id: 'strip-b', title: 'B şeridi' } }),
        config: { screen: SCREEN, slot: 'pdp-bottom', module: { kind: 'recommendation', id: 'strip-b' } },
      },
    };
    const client = await startClient();
    const renderer = await mount(client, {}, slot());
    await settle();
    expect(texts(renderer)).toContain('Doğal şerit');
    expect(texts(renderer)).not.toContain('B şeridi');
  });

  it('counts nothing in test mode: a QA link forces an arm and the merchant is not a sample', async () => {
    jest.useFakeTimers();
    assignments = {
      [EXPERIMENT]: arm(ARM_STRIP, 'Şerit B', { kind: 'recommendation', id: 'strip-b' }, { isForced: true, moduleData: { id: 'strip-b', title: 'B şeridi' } }),
    };
    const client = await new Selwise();
    live.push(client);
    await client.init({
      siteKey: 'site-key',
      apiKey: 'api-key',
      apiUrl: 'https://api.test/api/v1',
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
      reportIntegration: false,
      qaLinks: true,
    });
    client.applyQaLink(`myapp://x?selwise_test=1&selwise_variant=${EXPERIMENT}:${ARM_STRIP}`);
    const renderer = await mount(client, {}, slot());
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(1800);
    });
    await settle();
    expect(texts(renderer)).toContain('B şeridi');
    expect(tracked('exposure')).toHaveLength(0);
    const assign = calls.filter((call) => call.url.includes('/experiments/assign')).pop()!;
    expect(decodeURIComponent(assign.url)).toContain(`forceVariant=${EXPERIMENT}:${ARM_STRIP}`);
  });
});

describe('the click on an arm’s strip', () => {
  it('is the arm’s click goal while the point draws the strip, and nothing once it stops', async () => {
    assignments = {
      [EXPERIMENT]: arm(ARM_STRIP, 'Şerit B', { kind: 'recommendation', id: 'strip-b' }, { moduleData: { id: 'strip-b', title: 'B şeridi' } }),
    };
    const client = await startClient();
    const renderer = await mount(client, {}, slot());
    await settle();

    client.trackRecommendationClick('strip-b', 'P1', 0);
    await settle();
    expect(tracked('click')).toHaveLength(1);
    expect(tracked('click')[0]!.body).toMatchObject({ experimentId: EXPERIMENT, variantId: ARM_STRIP });

    // The same strip drawn natively somewhere else is not the experiment's.
    await act(async () => renderer.unmount());
    renderers.splice(0);
    client.trackRecommendationClick('strip-b', 'P1', 0);
    await settle();
    expect(tracked('click')).toHaveLength(1);
  });
});

describe('the campaigns of a screen the experiment owns a point of', () => {
  const nativeAtPoint = {
    id: 'native-bar',
    type: 'announcement_bar',
    contentJson: { text: 'Doğal çubuk' },
    stylesJson: {},
    placementConfigJson: { position: 'top', selector: `[data-selwise-slot="${SLOT}"]` },
    pageTargetingJson: { showOnAllPages: true },
    segmentTargetingMode: 'all',
    segmentIds: [],
  };
  const elsewhere = { ...nativeAtPoint, id: 'top-bar', contentJson: { text: 'Üst çubuk' }, placementConfigJson: { position: 'top' } };
  // The arm's campaign is sent to ANOTHER screen by its own targeting: the experiment places it here.
  const armCampaign = {
    id: 'arm-bar',
    type: 'announcement_bar',
    contentJson: { text: 'Kampanya kolu' },
    stylesJson: {},
    placementConfigJson: { position: 'top' },
    pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'] },
    segmentTargetingMode: 'all',
    segmentIds: [],
  };

  it('withholds the native campaigns of the point, keeps the rest and adds the arm’s, placed at the point', async () => {
    campaigns = [nativeAtPoint, elsewhere];
    assignments = {
      [EXPERIMENT]: arm(ARM_CAMPAIGN, 'Kampanya', { kind: 'campaign', id: 'arm-bar' }, { moduleData: armCampaign }),
    };
    const client = await startClient();
    const surfaces = await client.getSurfaces(SCREEN);

    expect(surfaces.map((surface) => surface.id).sort()).toEqual(['arm-bar', 'top-bar']);
    const placed = surfaces.find((surface) => surface.id === 'arm-bar')!;
    expect(placed.placement.slot).toBe(SLOT);
    expect(placed.experiment).toEqual({ experimentId: EXPERIMENT, variantId: ARM_CAMPAIGN });
    // No exposure at the moment of the decision: the point being on screen is the moment.
    expect(tracked('exposure')).toHaveLength(0);
  });

  it('leaves every campaign alone for a visitor in the arm that shows nothing — except the point’s own, which is empty', async () => {
    campaigns = [nativeAtPoint, elsewhere];
    assignments = { [EXPERIMENT]: arm(ARM_NONE, 'Boş', { kind: 'none' }, { holdout: true, hasHoldout: true }) };
    const client = await startClient();
    const surfaces = await client.getSurfaces(SCREEN);
    expect(surfaces.map((surface) => surface.id)).toEqual(['top-bar']);
  });

  it('does not touch another screen', async () => {
    campaigns = [nativeAtPoint];
    assignments = { [EXPERIMENT]: arm(ARM_NONE, 'Boş', { kind: 'none' }, { holdout: true, hasHoldout: true }) };
    const client = await startClient();
    // The campaign's own placement names a point of the product screen only; on the home screen it is not placed there.
    const surfaces = await client.getSurfaces('app://home');
    expect(surfaces.map((surface) => surface.id)).toEqual(['native-bar']);
  });
});

describe('an enrichment arm', () => {
  const item = (assignmentId: string, html: string, order: number) => ({
    assignmentId,
    placementKey: 'pdp-specs',
    order,
    html: `<p>${html}</p>`,
    css: '',
  });

  it('asks for the rule by its own placement name and draws that rule alone', async () => {
    enrichmentItems = [item('rule-a', 'Diğer kural', 0), item('rule-z', 'Z kuralı', 1)];
    assignments = {
      [EXPERIMENT]: arm(ARM_STRIP, 'Blok Z', { kind: 'enrichment', id: 'rule-z' }, { moduleData: { id: 'rule-z', name: 'Z', placementKey: 'pdp-specs' } }),
    };
    const client = await startClient();
    const renderer = await mount(
      client,
      { WebView: (props: Record<string, unknown>) => h('WebView', props) } as unknown as SelwiseHost,
      h(SelwiseSlot, { screen: SCREEN, slot: SLOT, sku: 'KM1', context: { currentProductId: 'KM1' } })
    );
    await settle();

    const ask = calls.find((call) => call.url.includes('/app/enrichments'))!;
    expect(ask.url).toContain('slots=pdp-specs');
    const web = renderer.root.findAllByType(el('WebView'));
    expect(web).toHaveLength(1);
    const html = String((web[0]!.props as { source: { html: string } }).source.html);
    expect(html).toContain('Z kuralı');
    expect(html).not.toContain('Diğer kural');
  });
});
