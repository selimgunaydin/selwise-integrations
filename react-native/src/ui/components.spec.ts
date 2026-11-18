import { createElement as h, type ElementType, type ReactElement, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Selwise } from '../client.js';
import { MemoryStorage } from '../core/storage.js';
import type { Strip } from '../core/strips.js';
import { SelwiseProvider } from '../react/context.js';
import type { SelwiseCartItem, SelwiseHost, SelwiseNavigationTarget } from '../react/host.js';
import type { SelwiseProduct } from '../types.js';
import { controls } from './test/react-native.mock.js';
import { SelwiseSurfaces } from './SelwiseSurfaces.js';
import { RecommendationStrip, RecommendationStrips } from './RecommendationStrip.js';
import { SelwiseSlot } from './SelwiseSlot.js';
import { SelwiseSearch } from './SelwiseSearch.js';
import { SelwiseEnrichment } from './SelwiseEnrichment.js';
import { resetSaid } from './host-hooks.js';
import { CustomWidget } from './surfaces/CustomWidget.js';
import type { Surface } from '../core/surfaces.js';
import { normalizeSurface } from '../core/surfaces.js';

/**
 * The components, drawn against a light `react-native` stand-in with
 * `react-test-renderer`: the right renderer for each type, a strip that counts
 * what was seen, a point that draws only its own strips, a search that follows
 * its redirects. The client under them is the real one; only the network is
 * faked.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}

let calls: Call[] = [];
let campaigns: unknown[] = [];
let listed: unknown[] = [];
let answers: Record<string, unknown> = {};
let searchAnswer: unknown = { hits: [] };
let searchConfigAnswer: unknown = {};
let enrichmentItems: unknown[] = [];

function installFetch() {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    calls.push({ url: href, body: init && init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
    let payload: unknown = {};
    if (href.includes('/experiments/assign')) payload = {};
    else if (href.includes('/app/enrichments')) {
      payload = { v: 'stamp.1', code: 'KM1', resolved: true, slots: ['pdp-specs'], items: enrichmentItems };
    } else if (href.includes('/search-config')) payload = searchConfigAnswer;
    else if (href.includes('/search')) payload = searchAnswer;
    else if (href.includes('/products')) {
      const id = href.split('/recommendations/')[1]!.split('/')[0]!;
      payload = answers[id] || { products: [] };
    } else if (/\/recommendations(\?|$)/.test(href)) payload = { widgets: listed };
    else if (href.includes('/config')) {
      payload = {
        campaigns,
        widgets: [],
        enrichment: { enabled: false, v: 'stamp.1', slots: [], keys: ['pdp-specs'] },
        theme: { '--selwise-brand': '#d3145a', '--selwise-font': '"Inter", sans-serif' },
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

/** A host element of the `react-native` stand-in, by name (`View`, `Pressable`, …). */
const el = (name: string) => name as unknown as ElementType;

const eventsOf = (name?: string) =>
  calls
    .filter((call) => call.url.includes('/events/batch'))
    .flatMap((call) => (call.body as { events: Array<Record<string, unknown>> }).events)
    .filter((event) => !name || event['name'] === name);
const productCalls = (id: string) => calls.filter((call) => call.url.includes('/recommendations/' + id + '/products'));
const widgetListCalls = () => calls.filter((call) => /\/recommendations(\?|$)/.test(call.url));

const product = (code: string, extra?: Record<string, unknown>): SelwiseProduct =>
  ({ id: code, itemCode: code, title: 'Ürün ' + code, price: 100, currency: 'TRY', url: '/p/' + code, ...(extra ?? {}) }) as SelwiseProduct;

const live: Selwise[] = [];
const renderers: ReactTestRenderer[] = [];

async function startClient(initialise = true): Promise<Selwise> {
  const selwise = new Selwise();
  live.push(selwise);
  if (initialise) await initClient(selwise);
  return selwise;
}

async function initClient(selwise: Selwise) {
  await selwise.init({
    siteKey: 'site-key',
    apiKey: 'api-key',
    apiUrl: 'https://api.test/api/v1',
    storage: new MemoryStorage(),
    flushIntervalMs: 0,
    reportIntegration: false,
  });
}

interface Recorded {
  host: SelwiseHost;
  navigated: SelwiseNavigationTarget[];
  added: SelwiseCartItem[];
}

function recordingHost(extra?: SelwiseHost): Recorded {
  const navigated: SelwiseNavigationTarget[] = [];
  const added: SelwiseCartItem[] = [];
  return {
    navigated,
    added,
    host: {
      navigate: (target) => {
        navigated.push(target);
        return true;
      },
      addToCart: (item) => {
        added.push(item);
        return { success: true };
      },
      ...(extra ?? {}),
    },
  };
}

async function mount(client: Selwise, host: SelwiseHost, ...children: ReactNode[]): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(h(SelwiseProvider, { client, host }, ...children) as ReactElement, {
      createNodeMock: () => ({
        measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
          callback(0, 100, 390, 200),
      }),
    });
  });
  renderers.push(renderer);
  return renderer;
}

/** The host names a screen: the components follow it. */
const goTo = (client: Selwise, url: string, info?: { screenName?: string; pageType?: string }) =>
  act(async () => {
    client.setScreen(url, info);
  });

async function settle() {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');
const texts = (renderer: ReactTestRenderer) => renderer.root.findAllByType(el('Text')).map(textOf);
const press = async (node: ReactTestInstance) => {
  await act(async () => {
    (node.props as { onPress: () => void }).onPress();
  });
};

beforeEach(() => {
  campaigns = [];
  listed = [];
  answers = {};
  searchAnswer = { hits: [] };
  searchConfigAnswer = {};
  enrichmentItems = [];
  controls.reset();
  resetSaid();
  installFetch();
});

afterEach(async () => {
  jest.useRealTimers();
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

const BAR = {
  id: 'bar-1',
  type: 'announcement_bar',
  contentJson: { text: 'Kargo bedava', buttonText: 'Alışverişe başla', buttonUrl: '/list/' },
  stylesJson: { backgroundColor: 'var(--selwise-brand, #111111)', textColor: '#ffffff' },
  placementConfigJson: { position: 'top', placementType: 'fixed' },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'all',
  segmentIds: [],
};
const POPUP = {
  id: 'pop-1',
  type: 'exit_intent_popup',
  contentJson: { title: 'Gitme!', text: '%10 indirim', buttonText: 'Kullan', buttonUrl: 'https://shop.example.com/kupon' },
  stylesJson: {},
  placementConfigJson: { position: 'center', triggerStrategy: 'delay', triggerDelaySeconds: 2 },
  pageTargetingJson: { showOnAllPages: true },
  segmentTargetingMode: 'all',
  segmentIds: [],
};

describe('SelwiseSurfaces', () => {
  it('waits for the client, then draws what targets the screen the host named', async () => {
    campaigns = [BAR];
    const client = await startClient(false);
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSurfaces));
    await goTo(client, 'app://home', { screenName: 'HomePage', pageType: 'home' });
    await settle();
    // Not initialised yet: nothing is drawn, and nothing throws.
    expect(renderer.toJSON()).toBeNull();

    await act(async () => initClient(client));
    await settle();

    expect(texts(renderer)).toContain('Kargo bedava');
    expect(texts(renderer)).toContain('Alışverişe başla');
  });

  it('resolves the brand colour the widget style defaults name, before the first paint', async () => {
    campaigns = [BAR];
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSurfaces));
    await goTo(client, 'app://home');
    await settle();

    const bar = renderer.root.findAllByType(el('View')).find((node) => {
      const style = ([] as unknown[]).concat(node.props.style).flat(Infinity) as Array<Record<string, unknown> | null>;
      return style.some((entry) => entry && entry['backgroundColor'] === '#d3145a');
    });
    expect(bar).toBeDefined();
  });

  it('reports the impression once it is on screen, and a tap as a click that opens the link through the host', async () => {
    campaigns = [BAR];
    const client = await startClient();
    const { host, navigated } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSurfaces));
    await goTo(client, 'app://home');
    await settle();

    const button = renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Alışverişe başla')!;
    await press(button);
    await client.flush();

    expect(eventsOf('impression')).toHaveLength(1);
    expect(eventsOf('impression')[0]).toMatchObject({ entityId: 'bar-1', entityType: 'campaign' });
    expect(eventsOf('click')[0]).toMatchObject({ entityId: 'bar-1', metadata: { linkUrl: '/list/' } });
    expect(navigated).toEqual([{ kind: 'path', url: '/list/', source: 'campaign', entityId: 'bar-1' }]);
  });

  it('falls back to the OS for an https link when the host opens nothing, and leaves a path alone', async () => {
    campaigns = [{ ...BAR, contentJson: { ...BAR.contentJson, buttonUrl: 'https://shop.example.com/x' } }];
    const client = await startClient();
    const renderer = await mount(client, {}, h(SelwiseSurfaces));
    await goTo(client, 'app://home');
    await settle();

    await press(renderer.root.findAllByType(el('Pressable')).find((node) => textOf(node) === 'Alışverişe başla')!);

    expect(controls.linkingOpened).toEqual(['https://shop.example.com/x']);
  });

  it('holds a popup until its trigger fires, and reports it only then', async () => {
    jest.useFakeTimers();
    campaigns = [POPUP];
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSurfaces));
    await goTo(client, 'app://home');
    await settle();

    // Armed is not shown.
    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(0);
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await settle();

    expect(renderer.root.findAllByType(el('Modal'))).toHaveLength(1);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Gitme!', '%10 indirim', 'Kullan']));
    await client.flush();
    expect(eventsOf('impression')).toHaveLength(1);
  });

  it('draws a type with the app’s own component when it passes one', async () => {
    campaigns = [BAR];
    const client = await startClient();
    const { host } = recordingHost();
    const MyBar = ({ surface }: { surface: Surface }) => h('MyBar', { id: surface.id });
    const renderer = await mount(client, host, h(SelwiseSurfaces, { renderers: { announcement_bar: MyBar } }));
    await goTo(client, 'app://home');
    await settle();

    expect(renderer.root.findAllByType(el('MyBar'))).toHaveLength(1);
    expect(texts(renderer)).not.toContain('Kargo bedava');
  });

  it('removes a surface the shopper closes, and remembers it', async () => {
    campaigns = [BAR];
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSurfaces));
    await goTo(client, 'app://home');
    await settle();

    await press(renderer.root.findAllByType(el('Pressable')).find((node) => node.props.accessibilityLabel === 'Kapat')!);
    await settle();
    await client.flush();

    expect(texts(renderer)).not.toContain('Kargo bedava');
    expect(eventsOf('close')).toHaveLength(1);
  });

  it('docks inside the safe area the host reports', async () => {
    campaigns = [BAR];
    const client = await startClient();
    const { host } = recordingHost({ safeAreaInsets: () => ({ top: 31, bottom: 17, left: 0, right: 0 }) });
    const renderer = await mount(client, host, h(SelwiseSurfaces));
    await goTo(client, 'app://home');
    await settle();

    const dock = renderer.root.findAllByType(el('View')).find((node) => node.props.pointerEvents === 'box-none')!;
    expect(([] as unknown[]).concat(dock.props.style).flat(Infinity)).toContainEqual({ paddingTop: 31 });
  });

  it('asks again for the surfaces of the next screen', async () => {
    campaigns = [BAR, { ...BAR, id: 'bar-2', type: 'sticky_footer', placementConfigJson: { position: 'bottom' }, contentJson: { text: 'Sepet kampanyası' }, pageTargetingJson: { showOnAllPages: false, includeUrls: ['app://basket'], excludeUrls: [] } }];
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSurfaces));

    await goTo(client, 'app://home');
    await settle();
    expect(texts(renderer)).not.toContain('Sepet kampanyası');

    await goTo(client, 'app://basket', { pageType: 'cart' });
    await settle();
    expect(texts(renderer)).toContain('Sepet kampanyası');
  });
});

describe('RecommendationStrip', () => {
  const STRIP: Strip = {
    listed: { id: 'w-1' },
    widget: { id: 'w-1', title: 'Bunlar da hoşuna gidebilir' },
    products: [product('A'), product('B')],
    productCard: null,
  };

  it('draws the heading and a card per product, in the app’s font when the host maps one', async () => {
    const client = await startClient();
    await goTo(client, 'app://home');
    const { host } = recordingHost({ fontFamily: { inter: 'Inter-Regular' } });
    // The brand font arrives with `/config`.
    await client.getSurfaces('app://home');

    const renderer = await mount(client, host, h(RecommendationStrip, { strip: STRIP }));

    expect(texts(renderer)).toEqual(expect.arrayContaining(['Bunlar da hoşuna gidebilir', 'Ürün A', 'Ürün B']));
    const heading = renderer.root.findAllByType(el('Text')).find((node) => textOf(node) === 'Bunlar da hoşuna gidebilir')!;
    expect(([] as unknown[]).concat(heading.props.style).flat(Infinity)).toContainEqual({ fontFamily: 'Inter-Regular' });
  });

  it('counts a card only once the strip has been on screen for a second, and says so', async () => {
    jest.useFakeTimers();
    const client = await startClient();
    await goTo(client, 'app://home');
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(RecommendationStrip, { strip: STRIP }));
    const list = renderer.root.findByType(el('FlatList'));

    // The cards are visible along the strip, but the strip has not dwelled yet.
    await act(async () => {
      (list.props as { onViewableItemsChanged: (info: unknown) => void }).onViewableItemsChanged({
        viewableItems: [{ item: STRIP.products[0] }],
      });
    });
    await client.flush();
    expect(eventsOf('widget_impression')).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await client.flush();

    expect(eventsOf('widget_impression')).toHaveLength(1);
    expect(eventsOf('widget_impression')[0]).toMatchObject({
      entityId: 'w-1',
      metadata: { productCount: 1, impressionBasis: 'visible' },
    });
  });

  it('counts nothing while another screen covers the strip', async () => {
    jest.useFakeTimers();
    const client = await startClient();
    await goTo(client, 'app://home');
    const { host } = recordingHost({ isFocused: () => false });
    const renderer = await mount(client, host, h(RecommendationStrip, { strip: STRIP }));
    await act(async () => {
      (renderer.root.findByType(el('FlatList')).props as { onViewableItemsChanged: (info: unknown) => void }).onViewableItemsChanged({
        viewableItems: [{ item: STRIP.products[0] }],
      });
      jest.advanceTimersByTime(3000);
    });
    await client.flush();

    expect(eventsOf('widget_impression')).toHaveLength(0);
  });

  it('reports a tap as a click and opens the product through the host', async () => {
    const client = await startClient();
    await goTo(client, 'app://home');
    const { host, navigated } = recordingHost();
    const renderer = await mount(client, host, h(RecommendationStrip, { strip: STRIP }));

    await press(renderer.root.findAllByType(el('Pressable'))[1]!);
    await client.flush();

    expect(eventsOf('product_click')[0]).toMatchObject({ entityId: 'w-1', productItemCode: 'B' });
    expect(navigated).toEqual([{ kind: 'path', url: '/p/B', source: 'recommendation', entityId: 'w-1' }]);
  });

  it('draws the app’s own card and hands it the tap', async () => {
    const client = await startClient();
    await goTo(client, 'app://home');
    const { host } = recordingHost();
    const taps: string[] = [];
    const renderer = await mount(
      client,
      host,
      h(RecommendationStrip, {
        strip: STRIP,
        renderItem: ({ product: item, onPress }) => h('MyCard', { key: item.itemCode, code: item.itemCode, onPress }),
        onProductPress: (item) => taps.push(item.itemCode),
      })
    );

    await press(renderer.root.findAllByType(el('MyCard'))[0]!);

    expect(renderer.root.findAllByType(el('MyCard'))).toHaveLength(2);
    expect(taps).toEqual(['A']);
  });

  it('draws nothing for a strip with no products', async () => {
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(RecommendationStrip, { strip: { ...STRIP, products: [] } }));
    expect(renderer.toJSON()).toBeNull();
  });
});

describe('SelwiseSlot', () => {
  beforeEach(() => {
    listed = [
      { id: 'top-1', name: 'Üst', title: 'Üstteki şerit', containerSelector: '[data-selwise-slot="home-top"]' },
      { id: 'bottom-1', name: 'Alt', title: 'Alttaki şerit', containerSelector: '[data-selwise-slot="home-bottom"]' },
      // Shares `home-bottom` with `bottom-1` and asks to be drawn beside it
      // (`all`): strips at one point compete as on the web (core/strips).
      {
        id: 'plain-1',
        name: 'Seçicisiz',
        title: 'Varsayılan şerit',
        containerSelector: '',
        triggerConfig: { conflictResolution: { behavior: 'all' } },
      },
    ];
    answers = {
      'top-1': { products: [product('T1')] },
      'bottom-1': { products: [product('B1')] },
      'plain-1': { products: [product('P1')] },
    };
  });

  it('draws only the strips sent to its point, and asks for the products of those and no others', async () => {
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSlot, { screen: 'app://home', slot: 'home-top' }));
    await settle();

    expect(texts(renderer)).toContain('Üstteki şerit');
    expect(texts(renderer)).not.toContain('Alttaki şerit');
    // A strip with no point is the screen's last point's.
    expect(texts(renderer)).not.toContain('Varsayılan şerit');
    expect(productCalls('top-1')).toHaveLength(1);
    expect(productCalls('bottom-1')).toHaveLength(0);
    expect(productCalls('plain-1')).toHaveLength(0);
  });

  it('draws a strip with no point at the screen’s last one', async () => {
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSlot, { screen: 'app://home', slot: 'home-bottom' }));
    await settle();

    expect(texts(renderer)).toEqual(expect.arrayContaining(['Alttaki şerit', 'Varsayılan şerit']));
    expect(texts(renderer)).not.toContain('Üstteki şerit');
  });

  it('shares one request for the list between the points of a screen', async () => {
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(
      client,
      host,
      h(SelwiseSlot, { screen: 'app://home', slot: 'home-top' }),
      h(SelwiseSlot, { screen: 'app://home', slot: 'home-bottom' })
    );
    await settle();

    expect(texts(renderer)).toEqual(expect.arrayContaining(['Üstteki şerit', 'Alttaki şerit']));
    expect(widgetListCalls()).toHaveLength(1);
    expect(productCalls('top-1')).toHaveLength(1);
    expect(productCalls('bottom-1')).toHaveLength(1);
  });

  it('draws nothing, and asks for nothing, on a product screen until the product is known', async () => {
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSlot, { screen: 'app://product', slot: 'pdp-bottom' }));
    await settle();
    expect(widgetListCalls()).toHaveLength(0);
    expect(renderer.toJSON()).toBeNull();

    await act(async () => {
      renderer.update(
        h(SelwiseProvider, { client, host }, h(SelwiseSlot, { screen: 'app://product', slot: 'pdp-bottom', context: { currentProductId: 'KM1' } }))
      );
    });
    await settle();
    expect(widgetListCalls()).toHaveLength(1);
    expect(productCalls('plain-1')[0]!.body).toMatchObject({ currentProductId: 'KM1' });
  });

  it('tells the client the point exists, so the dashboard can show it as connected', async () => {
    const client = await startClient();
    const registered: string[] = [];
    const original = client.registerSlot.bind(client);
    client.registerSlot = (slot: string) => {
      registered.push(slot);
      original(slot);
    };
    const { host } = recordingHost();
    await mount(client, host, h(SelwiseSlot, { screen: 'app://home', slot: 'home-top' }));
    expect(registered).toEqual(['home-top']);
  });

  it('keeps a render error inside the point', async () => {
    // React reports the error it handed to the boundary; this one is on purpose.
    const reported = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(
      client,
      host,
      h(SelwiseSlot, {
        screen: 'app://home',
        slot: 'home-top',
        renderHeading: () => {
          throw new Error('app card exploded');
        },
      }),
      h('Sibling', null)
    );
    await settle();

    // The strip failed; its sibling — the screen — is still there.
    expect(renderer.root.findAllByType(el('Sibling'))).toHaveLength(1);
    reported.mockRestore();
  });

  it('lets the strips of one point compete: the higher priority is drawn alone', async () => {
    listed = [
      { id: 'bottom-1', name: 'Alt', title: 'Alttaki şerit', containerSelector: '[data-selwise-slot="home-bottom"]', priority: 1 },
      { id: 'plain-1', name: 'Seçicisiz', title: 'Varsayılan şerit', containerSelector: '', priority: 5 },
    ];
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSlot, { screen: 'app://home', slot: 'home-bottom' }));
    await settle();

    expect(texts(renderer)).toContain('Varsayılan şerit');
    expect(texts(renderer)).not.toContain('Alttaki şerit');
  });

  it('is the one place RecommendationStrips draws everything a screen has', async () => {
    const client = await startClient();
    await goTo(client, 'app://home');
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(RecommendationStrips, { screen: 'app://home' }));
    await settle();

    expect(texts(renderer)).toEqual(expect.arrayContaining(['Üstteki şerit', 'Alttaki şerit', 'Varsayılan şerit']));
  });
});

describe('SelwiseSearch', () => {
  const HITS = [product('S1'), product('S2')];
  const TEXTS = { empty: 'Sonuç bulunamadı', loading: 'Yükleniyor' };

  /** Past the debounce's timer and the requests behind it: the list answers in several turns. */
  const settleSearch = async () => {
    for (let turn = 0; turn < 4; turn += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    }
  };

  beforeEach(() => {
    searchConfigAnswer = { enabled: true, mode: 'live', settings: { texts: TEXTS } };
  });

  it('draws the results, and reports the tap as the one search event the client cannot send alone', async () => {
    searchAnswer = { hits: HITS, total: 2 };
    const client = await startClient();
    const { host, navigated } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSearch, { query: 'ruj', debounceMs: 0 }));
    await settleSearch();

    expect(texts(renderer)).toEqual(expect.arrayContaining(['Ürün S1', 'Ürün S2']));
    await press(renderer.root.findAllByType(el('Pressable'))[1]!);
    await client.flush();

    // The query is logged by the client alone — once.
    expect(eventsOf('search_query')).toHaveLength(1);
    expect(eventsOf('product_click')[0]).toMatchObject({ entityId: 'ruj', productItemCode: 'S2', metadata: { query: 'ruj', position: 1 } });
    expect(navigated).toEqual([{ kind: 'path', url: '/p/S2', source: 'search' }]);
  });

  it('takes its minimum length and page size from the channel, not from the component', async () => {
    searchConfigAnswer = { enabled: true, mode: 'live', settings: { texts: TEXTS, behavior: { minChars: 4, debounceMs: 0, maxResults: 5, keepOpen: false } } };
    searchAnswer = { hits: HITS, total: 2 };
    const client = await startClient();
    const { host } = recordingHost();
    await mount(client, host, h(SelwiseSearch, { query: 'ruj', debounceMs: 0 }));
    await settleSearch();
    expect(calls.filter((call) => /\/search\?/.test(call.url))).toHaveLength(0);

    await mount(client, host, h(SelwiseSearch, { query: 'rujl', debounceMs: 0 }));
    await settleSearch();
    const request = calls.find((call) => /\/search\?/.test(call.url))!;
    expect(new URL(request.url).searchParams.get('limit')).toBe('5');
  });

  it('searches nothing below the minimum length', async () => {
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSearch, { query: 'r', debounceMs: 0 }));
    await settleSearch();

    expect(calls.filter((call) => /\/search\?/.test(call.url))).toHaveLength(0);
    expect(renderer.root.findAllByType(el('Pressable'))).toHaveLength(0);
  });

  // A redirect is an ANSWER: "kargo" goes to the shipping page and shows no list.
  it('follows a merchant redirect for a submitted term instead of drawing "no results"', async () => {
    searchAnswer = { hits: [], redirect: '  /kargo-bilgileri ' };
    const client = await startClient();
    const { host, navigated } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSearch, { query: 'kargo', submitted: true, debounceMs: 0 }));
    await settleSearch();

    expect(navigated).toEqual([{ kind: 'path', url: '/kargo-bilgileri', source: 'search' }]);
    expect(renderer.toJSON()).toBeNull();
  });

  it('never follows a redirect for a term the shopper is still typing', async () => {
    searchAnswer = { hits: [], redirect: '/kargo-bilgileri' };
    const client = await startClient();
    const { host, navigated } = recordingHost();
    await mount(client, host, h(SelwiseSearch, { query: 'kargo', debounceMs: 0 }));
    await settleSearch();

    expect(navigated).toEqual([]);
  });

  it('says there is nothing for a query that matched nothing', async () => {
    searchAnswer = { hits: [], total: 0 };
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSearch, { query: 'xyz', debounceMs: 0 }));
    await settleSearch();

    // The merchant's own sentence — the component says nothing of its own.
    expect(texts(renderer)).toEqual(['Sonuç bulunamadı']);
  });

  it('draws nothing, not "no results", when search is switched off for the channel', async () => {
    searchConfigAnswer = { enabled: false };
    searchAnswer = { enabled: false, hits: [] };
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSearch, { query: 'ruj', debounceMs: 0 }));
    await settleSearch();

    expect(renderer.toJSON()).toBeNull();
  });
});

/** A WebView stand-in a test can drive: it keeps the props it was drawn with. */
function WebViewStub(props: Record<string, unknown>) {
  return h('WebView', props);
}

describe('the merchant’s own HTML', () => {
  const CUSTOM: Surface = normalizeSurface(
    {
      id: 'custom-1',
      type: 'custom',
      contentJson: { html: '<button id="b">Al</button>' },
      stylesJson: {},
      placementConfigJson: { position: 'top' },
      pageTargetingJson: { showOnAllPages: true },
    },
    'campaign'
  )!;
  const message = (type: string, payload: unknown) => ({ nativeEvent: { data: JSON.stringify({ __selwise: 1, type, payload }) } });

  it('adds to the app’s own basket, naming what asked', async () => {
    const client = await startClient();
    const { host, added } = recordingHost({ WebView: WebViewStub });
    const renderer = await mount(client, host, h(CustomWidget, { surface: CUSTOM }));

    await act(async () => {
      (renderer.root.findByType(el('WebView')).props as { onMessage: (event: unknown) => void }).onMessage(
        message('addToCart', { code: '7142', quantity: 2 })
      );
    });

    expect(added).toEqual([{ code: '7142', quantity: 2, source: 'custom_widget', surfaceId: 'custom-1' }]);
  });

  it('wraps the merchant’s own event name in the canonical custom_event', async () => {
    const client = await startClient();
    const { host } = recordingHost({ WebView: WebViewStub });
    const renderer = await mount(client, host, h(CustomWidget, { surface: CUSTOM }));

    await act(async () => {
      (renderer.root.findByType(el('WebView')).props as { onMessage: (event: unknown) => void }).onMessage(
        message('track', { name: 'kupon_kullanildi', metadata: { kupon: 'X' } })
      );
    });
    await client.flush();

    expect(eventsOf('custom_event')[0]).toMatchObject({
      entityId: 'custom-1',
      metadata: { eventName: 'kupon_kullanildi', surfaceType: 'custom', kupon: 'X' },
    });
  });

  it('says once which capability is missing, and draws nothing', async () => {
    const logged: string[] = [];
    const log = jest.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(line));
    const client = await startClient();
    const renderer = await mount(client, {}, h(CustomWidget, { surface: CUSTOM }), h(CustomWidget, { surface: CUSTOM }));

    expect(renderer.toJSON()).toBeNull();
    expect(logged.filter((line) => line.includes('no WebView was passed'))).toHaveLength(1);
    log.mockRestore();
  });

  it('draws a product enrichment block in the app’s WebView and reports what was seen and tapped', async () => {
    enrichmentItems = [
      {
        assignmentId: 'rule-1',
        placementKey: 'pdp-specs',
        order: 0,
        html: '<div data-selwise-root="true" data-selwise-entity-id="rule-1"><a href="/beden">Beden</a></div>',
        css: '',
        reservedHeightPx: 120,
      },
    ];
    const client = await startClient();
    await client.getSurfaces('app://product');
    const { host, navigated } = recordingHost({ WebView: WebViewStub, storefrontUrl: 'https://shop.example.com' });
    const renderer = await mount(client, host, h(SelwiseEnrichment, { code: 'KM1', slot: 'pdp-specs' }));
    await settle();

    const webView = renderer.root.findByType(el('WebView'));
    expect((webView.props as { source: { html: string } }).source.html).toContain('<base href="https://shop.example.com/">');

    await act(async () => {
      (webView.props as { onMessage: (event: unknown) => void }).onMessage(message('click', { url: '/beden', assignmentId: 'rule-1' }));
    });
    await client.flush();

    expect(eventsOf('click')[0]).toMatchObject({ entityId: 'rule-1', entityType: 'enrichment' });
    expect(navigated).toEqual([{ kind: 'path', url: '/beden', source: 'enrichment', entityId: 'rule-1' }]);
  });

  // A WebView laid out at zero height is not given a layout pass on every platform, so
  // it never measured itself and the block stayed invisible with nothing in the log.
  it('gives the WebView a real box while the host is collapsed, and says if no height ever arrives', async () => {
    jest.useFakeTimers();
    try {
      enrichmentItems = [
        { assignmentId: 'rule-1', placementKey: 'pdp-specs', order: 0, html: '<div data-selwise-root="true"><p>Kargo</p></div>', css: '' },
      ];
      const client = await startClient();
      await client.getSurfaces('app://product');
      client.setScreen('app://product');
      const { host } = recordingHost({ WebView: WebViewStub });
      const renderer = await mount(client, host, h(SelwiseEnrichment, { code: 'KM1', slot: 'pdp-specs' }));
      await settle();

      const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(3).filter(Boolean) as object[]);
      const webView = renderer.root.findByType(el('WebView'));
      const hostView = renderer.root.findAll((node) => (node.props as { collapsable?: boolean }).collapsable === false)[0]!;
      expect(flat(hostView.props.style).height).toBe(1);
      expect(flat((webView.props as { style: unknown }).style).height).toBeGreaterThan(100);

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(client.explain('pdp-specs')).toEqual([expect.objectContaining({ reason: 'no_height' })]);

      await act(async () => {
        (webView.props as { onMessage: (event: unknown) => void }).onMessage(message('height', { height: 88 }));
      });
      expect(flat(renderer.root.findAll((node) => (node.props as { collapsable?: boolean }).collapsable === false)[0]!.props.style).height).toBe(88);
      expect(client.explain('pdp-specs')).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
