import { createElement as h, type ElementType } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Selwise } from '../client.js';
import { MemoryStorage } from '../core/storage.js';
import { SelwiseProvider } from '../react/context.js';
import type { SelwiseHost } from '../react/host.js';
import { controls } from './test/react-native.mock.js';
import { SelwiseSlot } from './SelwiseSlot.js';
import { SelwiseEnrichment, enrichmentAppliesOn } from './SelwiseEnrichment.js';
import { planSlots, conflictOf, type StripEntry } from '../core/strips.js';
import { stripFrameOf, STRIP_PHONE_PADDING } from './strip-frame.js';
import { styleContext } from './styles.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let listed: Array<Record<string, unknown>> = [];
let productsOf: Record<string, unknown[]> = {};
let cardOf: Record<string, unknown> | null = null;
let enrichmentKeys: string[] = [];
let calls: string[] = [];
const el = (name: string) => name as unknown as ElementType;
const live: Selwise[] = [];
const renderers: ReactTestRenderer[] = [];

function installFetch() {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown) => {
    const href = String(url);
    calls.push(href);
    let payload: unknown = {};
    const products = /\/recommendations\/([^/]+)\/products/.exec(href);
    if (products) payload = { products: productsOf[decodeURIComponent(products[1]!)] ?? [], productCard: cardOf };
    else if (/\/recommendations(\?|$)/.test(href)) payload = { widgets: listed };
    else if (href.includes('/app/enrichments')) payload = { v: 's', code: 'KM1', resolved: true, slots: enrichmentKeys, items: [] };
    else if (href.includes('/config')) payload = { campaigns: [], widgets: [], enrichment: { enabled: enrichmentKeys.length > 0, v: 's', slots: enrichmentKeys, keys: enrichmentKeys }, theme: {} };
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

async function startClient(): Promise<Selwise> {
  const client = new Selwise();
  live.push(client);
  await client.init({ siteKey: 'site-key', apiKey: 'api-key', apiUrl: 'https://api.test/api/v1', storage: new MemoryStorage(), flushIntervalMs: 0, reportIntegration: false });
  return client;
}

async function mount(client: Selwise, host: SelwiseHost, ...children: unknown[]): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(h(SelwiseProvider, { client, host }, ...(children as never[])) as never, {
      createNodeMock: () => ({ measureInWindow: (cb: (x: number, y: number, w: number, hh: number) => void) => cb(0, 100, 390, 200) }),
    });
  });
  renderers.push(renderer);
  return renderer;
}
async function settle() {
  await act(async () => {
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
  });
}
const textOf = (node: { children: unknown[] }): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c as { children: unknown[] }))).join('');
const texts = (r: ReactTestRenderer) => r.root.findAllByType(el('Text')).map(textOf);

const prod = (code: string) => ({ id: code, itemCode: code, title: 'Ürün ' + code, price: 100, currency: 'TRY', url: '/p/' + code });
const strip = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, title: 'Şerit ' + id, containerSelector: '[data-selwise-slot="home-top"]', priority: 0,
  ctaMode: 'add_to_cart', addToCartEnabled: true, displayType: 'grid', slidesPerViewMobile: 2, slideGap: 8,
  titleStyles: { enabled: true }, ...extra,
});

beforeEach(() => { enrichmentKeys = []; cardOf = null; listed = []; productsOf = {}; controls.reset(); installFetch(); });
afterEach(async () => {
  for (const r of renderers.splice(0)) await act(async () => r.unmount());
  await Promise.all(live.splice(0).map((s) => s.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});


/**
 * Recommendation strips in the app's points: strips that share a point compete
 * for it as they do in a web container, the strip card honours the strip's call
 * to action, a strip's default frame is a phone's, and product content is only
 * reported on a product screen.
 */

const HOME = 'app://home';
const drawn = (r: ReactTestRenderer) => texts(r).filter((t) => t.startsWith('Şerit '));
const reasonOf = (client: Selwise, id: string) => client.explain(id).map((report) => report.reason);

async function home(host: SelwiseHost = { navigate: () => true, addToCart: () => ({ success: true }) }, slot = 'home-top') {
  const client = await startClient();
  client.setScreen(HOME);
  const renderer = await mount(client, host, h(SelwiseSlot, { screen: HOME, slot }));
  await settle();
  return { client, renderer };
}

describe('strips that share a point', () => {
  it('draws the highest priority one, and says the other lost', async () => {
    listed = [strip('manual', { priority: 1 }), strip('trending', { priority: 5 })];
    productsOf = { manual: [prod('A')], trending: [prod('B')] };
    const { client, renderer } = await home();
    expect(drawn(renderer)).toEqual(['Şerit trending']);
    expect(client.explain('manual')).toEqual([
      expect.objectContaining({ kind: 'strip', reason: 'conflict', screen: HOME, detail: expect.objectContaining({ winner: 'trending', rule: 'highest_priority' }) }),
    ]);
    expect(client.explain('trending')).toEqual([]);
    // The loser's products are never asked for.
    expect(calls.some((url) => url.includes('/recommendations/manual/products'))).toBe(false);
  });

  it('reads the priority from the strip’s conflict rule when it carries none of its own', async () => {
    listed = [
      strip('a', { priority: undefined, triggerConfig: { conflictResolution: { priority: 9 } } }),
      strip('b', { priority: undefined, triggerConfig: { conflictResolution: { priority: 2 } } }),
    ];
    productsOf = { a: [prod('A')], b: [prod('B')] };
    const { renderer } = await home();
    expect(drawn(renderer)).toEqual(['Şerit a']);
  });

  it('hands the point to the next strip when the winner has no products, and says so', async () => {
    listed = [strip('first', { priority: 9 }), strip('second', { priority: 5 }), strip('third', { priority: 1 })];
    productsOf = { first: [], second: [prod('B')], third: [prod('C')] };
    const { client, renderer } = await home();
    expect(drawn(renderer)).toEqual(['Şerit second']);
    expect(client.explain('first')).toEqual([
      expect.objectContaining({ reason: 'empty', detail: { cause: 'no_products', next: 'second' } }),
    ]);
    // The strip that took over is drawn, so nothing is on record against it; the one behind it still lost.
    expect(client.explain('second')).toEqual([]);
    expect(reasonOf(client, 'third')).toEqual(['conflict']);
    // One at a time: the third strip's products were not asked for.
    expect(calls.some((url) => url.includes('/recommendations/third/products'))).toBe(false);
  });

  it('draws nothing when every strip of the point is empty', async () => {
    listed = [strip('first', { priority: 9 }), strip('second', { priority: 5 })];
    productsOf = { first: [], second: [] };
    const { client, renderer } = await home();
    expect(drawn(renderer)).toEqual([]);
    expect(reasonOf(client, 'first')).toEqual(['empty']);
    expect(reasonOf(client, 'second')).toEqual(['empty']);
  });

  it('draws every strip when one of them says all', async () => {
    listed = [
      strip('a', { priority: 1 }),
      strip('b', { priority: 2, triggerConfig: { conflictResolution: { behavior: 'all' } } }),
    ];
    productsOf = { a: [prod('A')], b: [prod('B')] };
    const { client, renderer } = await home();
    expect(drawn(renderer).sort()).toEqual(['Şerit a', 'Şerit b']);
    expect(client.explain()).toEqual([]);
  });

  it('draws one of several random strips, the same one every time for the visitor', async () => {
    const random = { behavior: 'random' };
    listed = ['a', 'b', 'c'].map((id) => strip(id, { triggerConfig: { conflictResolution: random } }));
    productsOf = { a: [prod('A')], b: [prod('B')], c: [prod('C')] };
    const first = await home();
    expect(drawn(first.renderer)).toHaveLength(1);
    const again = await mount(first.client, { navigate: () => true }, h(SelwiseSlot, { screen: HOME, slot: 'home-top' }));
    await settle();
    expect(drawn(again)).toEqual(drawn(first.renderer));
  });

  it('does not make strips of different points compete', async () => {
    listed = [strip('top', { priority: 1 }), strip('bottom', { priority: 9, containerSelector: '[data-selwise-slot="home-bottom"]' })];
    productsOf = { top: [prod('A')], bottom: [prod('B')] };
    const { renderer } = await home();
    expect(drawn(renderer)).toEqual(['Şerit top']);
    const client = await startClient();
    client.setScreen(HOME);
    const other = await mount(client, { navigate: () => true }, h(SelwiseSlot, { screen: HOME, slot: 'home-bottom' }));
    await settle();
    expect(drawn(other)).toEqual(['Şerit bottom']);
    expect(client.explain()).toEqual([]);
  });
});

describe('planSlots', () => {
  const entry = (id: string, extra: Record<string, unknown> = {}): StripEntry => {
    const widget = { id, ...extra };
    return { listed: widget, widget, follows: false };
  };
  const place = () => 'home-top';
  const names = (entries: StripEntry[]) => entries.map((item) => item.listed.id);

  it('orders the fallbacks as it ordered the winner: priority, then id', () => {
    const plans = planSlots([entry('b', { priority: 3 }), entry('a', { priority: 3 }), entry('c', { priority: 7 }), entry('d', { priority: 1 })], place);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.entry.listed.id).toBe('c');
    expect(names(plans[0]!.fallbacks)).toEqual(['a', 'b', 'd']);
  });

  it('keeps strips with no place apart, in the order they were listed', () => {
    const plans = planSlots([entry('x'), entry('y')], undefined);
    expect(plans.map((plan) => plan.entry.listed.id)).toEqual(['x', 'y']);
    expect(plans.every((plan) => plan.fallbacks.length === 0)).toBe(true);
    expect(planSlots([entry('x'), entry('y')], () => null)).toHaveLength(2);
  });

  it('plans every strip of an all place, and reads the rule from triggerConfig', () => {
    const all = { triggerConfig: { conflictResolution: { behavior: 'all' } } };
    expect(planSlots([entry('x', all), entry('y')], place).map((plan) => plan.entry.listed.id)).toEqual(['x', 'y']);
    expect(conflictOf(entry('x', { priority: 4, ...all }).listed)).toEqual({ priority: 4, behavior: 'all' });
    expect(conflictOf({ id: 'x' })).toEqual({ priority: 0, behavior: 'highest_priority' });
  });

  it('picks one of random strips by seed: stable for a seed, spread over seeds', () => {
    const random = { triggerConfig: { conflictResolution: { behavior: 'random' } } };
    const list = ['a', 'b', 'c', 'd'].map((id) => entry(id, random));
    const pick = (seed: string) => planSlots(list, place, seed)[0]!.entry.listed.id;
    expect(pick('visitor-1')).toBe(pick('visitor-1'));
    expect(new Set(Array.from({ length: 40 }, (_unused, at) => pick('visitor-' + at))).size).toBeGreaterThan(1);
  });
});

describe('the strip card’s call to action', () => {
  const addable = { navigate: () => true, addToCart: () => ({ success: true }) };

  it('draws "add to cart" for ctaMode add_to_cart and the strip’s own switch on', async () => {
    listed = [strip('a')];
    productsOf = { a: [prod('A')] };
    const { renderer } = await home(addable);
    expect(texts(renderer)).toContain('Sepete Ekle');
  });

  const treeCard = (children: unknown[]) => ({
    mode: 'schema', renderVersion: 3, variantSelection: 'none',
    cardTree: { version: 3, root: { id: 'root', type: 'root', style: {}, children } },
  });
  const title = { id: 'title', type: 'text', style: {}, props: { field: 'title' } };
  const button = { id: 'add', type: 'button', style: {}, props: { action: 'add_to_cart', label: 'Sepete ekle' } };

  it('draws the button of a designed card, and its overlay on the photo, as the storefront does', async () => {
    cardOf = treeCard([{ id: 'media', type: 'media', style: { aspectRatio: '3 / 4' }, children: [{ id: 'img', type: 'image', style: {}, props: { source: 'primary' } }, { ...button, animation: 'reveal-up', style: { insetBottom: '10px', insetLeft: '10px', insetRight: '10px' } }] }, title]);
    listed = [strip('a')];
    productsOf = { a: [{ ...prod('A'), imageUrl: 'https://img.test/a.jpg' }] };
    const { renderer } = await home(addable);
    expect(texts(renderer)).toContain('Sepete ekle');
  });

  it('draws no button on a designed card that has none: the storefront’s tree renderer draws only the buttons the tree has', async () => {
    cardOf = treeCard([title]);
    listed = [strip('a')];
    productsOf = { a: [prod('A')] };
    const { renderer } = await home(addable);
    expect(texts(renderer)).toEqual(['Şerit a', 'Ürün A']);
  });

  it('opens the product instead when the strip’s add switch is off', async () => {
    listed = [strip('a', { addToCartEnabled: false, reviewButtonText: 'İncele' })];
    productsOf = { a: [prod('A')] };
    const { renderer } = await home(addable);
    expect(texts(renderer)).toContain('İncele');
    expect(texts(renderer)).not.toContain('Sepete Ekle');
  });

  it('draws the review button for "go to product", and none when the product has no page', async () => {
    listed = [strip('a', { ctaMode: 'review', reviewButtonText: 'İncele' })];
    productsOf = { a: [prod('A'), { ...prod('B'), url: null }] };
    const { renderer } = await home(addable);
    expect(texts(renderer).filter((t) => t === 'İncele')).toHaveLength(1);
    expect(texts(renderer)).not.toContain('Sepete Ekle');
  });
});

describe('the strip frame on a phone', () => {
  const ctx = styleContext({});
  const padding = (containerStyles: unknown) =>
    stripFrameOf({ id: 'w', title: 'T', titleStyles: { enabled: true }, containerStyles }, ctx).container;

  it('draws a stored padding exactly as typed, even the value a desktop strip starts from', () => {
    const container = padding({ padding: '40px 20px', margin: '0 auto', maxWidth: '1200px' });
    expect(container).toMatchObject({ paddingVertical: 40, paddingHorizontal: 20 });
    expect(padding({ padding: '  40px   20px ' })).toMatchObject({ paddingVertical: 40, paddingHorizontal: 20 });
    expect(padding({ padding: '16px' })).toMatchObject({ padding: 16 });
    expect(padding({ padding: '24px 12px' })).toMatchObject({ paddingVertical: 24, paddingHorizontal: 12 });
    // The width rules of the same block are untouched.
    expect(container).toMatchObject({ alignSelf: 'center', width: '100%', maxWidth: 1200 });
  });

  it('gives a strip that stores no padding the phone inset', () => {
    expect(STRIP_PHONE_PADDING).toEqual({ vertical: 16, horizontal: 16 });
    for (const containerStyles of [undefined, {}, { padding: '' }, { padding: '  ' }, { maxWidth: '100%' }]) {
      const container = padding(containerStyles);
      expect(container).toMatchObject({ paddingVertical: 16, paddingHorizontal: 16 });
      expect(container).not.toHaveProperty('padding');
    }
  });

  it('is what a strip draws inside a point: the stored padding, or the inset when it stores none', async () => {
    const paddedViews = async (containerStyles: unknown, paddingVertical: number) => {
      listed = [strip('a', containerStyles === undefined ? {} : { containerStyles })];
      productsOf = { a: [prod('A')] };
      const { renderer } = await home();
      const flatStyle = (style: unknown) => Object.assign({}, ...([] as unknown[]).concat(style).flat(Infinity).filter(Boolean));
      return renderer.root.findAll((node) => (node.type as unknown) === 'View' && flatStyle(node.props.style).paddingVertical === paddingVertical);
    };
    expect((await paddedViews({ padding: '40px 20px', margin: '0 auto', maxWidth: '1200px' }, 40)).length).toBeGreaterThan(0);
    expect((await paddedViews({ padding: '16px' }, 40)).length).toBe(0);
    expect((await paddedViews(undefined, 16)).length).toBeGreaterThan(0);
  });
});

describe('product content off a product screen', () => {
  async function enrichmentOn(screen: string, pageType: string | null) {
    enrichmentKeys = ['pdp-specs'];
    const client = await startClient();
    await client.getSurfaces(screen);
    client.setScreen(screen, pageType ? { pageType } : undefined);
    const renderer = await mount(client, { navigate: () => true }, h(SelwiseEnrichment, { code: 'KM1', slot: 'basket-shipping' }));
    await settle();
    return { client, renderer };
  }

  it('says nothing about a slot no rule is placed in on the basket', async () => {
    const { client } = await enrichmentOn('app://basket', 'cart');
    expect(client.explain()).toEqual([]);
  });

  it('says nothing on a screen the catalogue names, even when the host named no type', async () => {
    const { client } = await enrichmentOn('app://home', null);
    expect(client.explain()).toEqual([]);
  });

  it('still says unknown_slot on a product screen with a slot no rule carries', async () => {
    const { client } = await enrichmentOn('app://product', 'product');
    expect(client.explain('basket-shipping')).toEqual([
      expect.objectContaining({ kind: 'enrichment', reason: 'unknown_slot', detail: { known: 'pdp-specs' }, screen: 'app://product' }),
    ]);
  });

  it('judges a screen the app never named as before', () => {
    expect(enrichmentAppliesOn({ pageUrl: null, pageType: null })).toBe(true);
    expect(enrichmentAppliesOn({ pageUrl: 'app://custom-thing', pageType: null })).toBe(true);
    expect(enrichmentAppliesOn({ pageUrl: 'app://product', pageType: null })).toBe(true);
    expect(enrichmentAppliesOn({ pageUrl: 'app://basket', pageType: null })).toBe(false);
    expect(enrichmentAppliesOn({ pageUrl: 'app://basket', pageType: 'product' })).toBe(true);
  });
});
