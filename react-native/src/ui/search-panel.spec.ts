import { createElement as h, type ElementType, type ReactElement, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Selwise } from '../client.js';
import { MemoryStorage } from '../core/storage.js';
import { SelwiseProvider } from '../react/context.js';
import type { SelwiseCartItem, SelwiseHost, SelwiseNavigationTarget } from '../react/host.js';
import { useSelwiseSearch, type UseSelwiseSearchResult } from '../react/use-selwise-search.js';
import type { SelwiseProduct } from '../types.js';
import { controls } from './test/react-native.mock.js';
import { pickId } from './pick-ids.js';
import { SelwiseSearchPanel, type SelwiseSearchPanelProps } from './SelwiseSearchPanel.js';

/**
 * The search screen, drawn against a light `react-native` stand-in: the
 * suggestions of the empty box, the results in the layout and with the fields
 * the merchant chose, the categories, the add to the basket, the redirect and
 * the off state — and the hook they are drawn from. The client under them is the
 * real one; only the network is faked.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}

let calls: Call[] = [];
let searchConfig: Record<string, unknown> = {};
let suggestionsBody: unknown = {};
/** The answer to a search, by query: the first matching key wins. */
let searchAnswers: Record<string, Record<string, unknown>> = {};

function installFetch() {
  calls = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
    const href = String(url);
    calls.push({ url: href, body: init && init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
    let payload: unknown = {};
    if (href.includes('/search-config')) payload = searchConfig;
    else if (href.includes('/search/suggestions')) payload = suggestionsBody;
    else if (/\/search\?/.test(href)) {
      const params = new URL(href).searchParams;
      const key = `${params.get('q') ?? ''}|${params.get('offset') ?? '0'}`;
      payload = searchAnswers[key] ?? searchAnswers[params.get('q') ?? ''] ?? { hits: [], total: 0 };
    } else if (href.includes('/config')) payload = { theme: { '--selwise-brand': '#d3145a' } };
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as unknown as Response;
  });
}

const el = (name: string) => name as unknown as ElementType;
const live: Selwise[] = [];
const renderers: ReactTestRenderer[] = [];

async function startClient(): Promise<Selwise> {
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

interface Recorded {
  host: SelwiseHost;
  navigated: SelwiseNavigationTarget[];
  added: SelwiseCartItem[];
}

function recordingHost(extra: SelwiseHost = {}): Recorded {
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
      ...extra,
    },
  };
}

async function mount(client: Selwise, host: SelwiseHost, ...children: ReactNode[]): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(h(SelwiseProvider, { client, host }, ...children) as ReactElement);
  });
  renderers.push(renderer);
  return renderer;
}

/** Past the debounce's timer and the requests behind it: the screen answers in several turns. */
async function settle() {
  for (let turn = 0; turn < 5; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');
const texts = (renderer: ReactTestRenderer) => renderer.root.findAllByType(el('Text')).map(textOf);
const buttonLabelled = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityLabel === label)[0];
const press = async (node: ReactTestInstance | undefined) => {
  expect(node).toBeDefined();
  await act(async () => {
    (node!.props as { onPress: () => void }).onPress();
  });
  await settle();
};
const type = async (renderer: ReactTestRenderer, text: string) => {
  await act(async () => {
    (renderer.root.findByType(el('TextInput')).props as { onChangeText: (text: string) => void }).onChangeText(text);
  });
  await settle();
};
const eventsOf = async (selwise: Selwise, name: string) => {
  await selwise.flush();
  return calls
    .filter((call) => call.url.includes('/events/batch'))
    .flatMap((call) => (call.body as { events: Array<Record<string, any>> }).events)
    .filter((event) => event['name'] === name);
};
const searchRequests = () => calls.filter((call) => /\/search\?/.test(call.url)).map((call) => new URL(call.url));

const product = (code: string, extra: Record<string, unknown> = {}): SelwiseProduct =>
  ({
    id: code,
    itemCode: code,
    title: 'Kırmızı Ceket ' + code,
    price: 100,
    currency: 'TRY',
    imageUrl: `https://img/${code}.png`,
    url: '/p/' + code,
    ...extra,
  }) as SelwiseProduct;

const TEXTS = {
  placeholder: 'Ürün ara',
  empty: 'Sonuç bulunamadı',
  didYouMean: 'Bunu mu demek istediniz?',
  recentSearches: 'Son aramalar',
  clearRecent: 'Temizle',
  clear: 'Sil',
  close: 'Kapat',
  popularSearches: 'Popüler aramalar',
  popularCategories: 'Popüler kategoriler',
  popularProducts: 'Popüler ürünler',
  showing: '{total} üründen {shown} tanesi',
  footer: '{total} ürün',
  all: 'Tümü',
  categoryRemove: 'Kategori filtresini kaldır',
  viewAll: 'Tümünü gör',
  loading: 'Yükleniyor',
  error: 'Bir hata oluştu',
  inStock: 'Stokta',
  outOfStock: 'Tükendi',
  cartAdd: 'Sepete ekle',
  cartAdding: 'Ekleniyor',
  cartAdded: 'Eklendi',
  cartError: 'Eklenemedi',
};

function configure(settings: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) {
  searchConfig = {
    v: 2,
    enabled: true,
    mode: 'live',
    settings: { behavior: { minChars: 2, debounceMs: 0, maxResults: 2, keepOpen: false }, texts: TEXTS, ...settings },
    audience: { mode: 'all', segmentIds: [] },
    ...rest,
  };
}

beforeEach(() => {
  controls.reset();
  suggestionsBody = {};
  searchAnswers = {};
  configure();
  installFetch();
});

afterEach(async () => {
  for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
  await Promise.all(live.splice(0).map((selwise) => selwise.destroy().catch(() => undefined)));
  delete (globalThis as { fetch?: unknown }).fetch;
});

async function panel(props: SelwiseSearchPanelProps = {}, host: Recorded = recordingHost()) {
  const client = await startClient();
  const renderer = await mount(client, host.host, h(SelwiseSearchPanel, props));
  await settle();
  return { client, renderer, ...host };
}

describe('SelwiseSearchPanel: the empty box', () => {
  const POPULAR = {
    recentSearches: { enabled: true, maxCount: 6 },
    popularSearches: { enabled: true, items: ['mont', 'kazak'] },
    popularCategories: { enabled: true, items: [{ name: 'Kadın > Giyim' }, { name: 'Erkek' }] },
    popularProducts: { enabled: true, items: [product('P1'), product('P2')] },
  };

  it('draws the merchant’s own input, with their placeholder', async () => {
    const { renderer } = await panel();
    const input = renderer.root.findByType(el('TextInput'));
    expect(input.props.placeholder).toBe('Ürün ara');
    expect(input.props.accessibilityLabel).toBe('Ürün ara');
  });

  it('offers the popular searches, categories and products in the order the merchant chose', async () => {
    configure({ suggestions: { order: ['popularProducts', 'popularCategories', 'popularSearches', 'recent'] } });
    suggestionsBody = POPULAR;
    const { renderer } = await panel();

    const all = texts(renderer);
    expect(all.indexOf('Popüler ürünler')).toBeLessThan(all.indexOf('Popüler kategoriler'));
    expect(all.indexOf('Popüler kategoriler')).toBeLessThan(all.indexOf('Popüler aramalar'));
    expect(all).toEqual(expect.arrayContaining(['mont', 'kazak', 'Giyim', 'Erkek', 'Kırmızı Ceket P1']));
  });

  it('draws a section as chips or as a list, as the merchant chose', async () => {
    configure({ suggestions: { popularSearches: { display: 'list' } } });
    suggestionsBody = POPULAR;
    const { renderer } = await panel();

    const row = buttonLabelled(renderer, 'mont')!;
    // A list row is not a bordered chip.
    expect((row.props.style as Record<string, unknown>).minHeight).toBe(40);
  });

  it('searches a popular term that is tapped, and reports the tap', async () => {
    suggestionsBody = POPULAR;
    searchAnswers = { mont: { hits: [product('M1')], total: 1 } };
    const { renderer, client } = await panel();

    await press(buttonLabelled(renderer, 'mont'));

    expect(searchRequests()[0]!.searchParams.get('q')).toBe('mont');
    expect(renderer.root.findByType(el('TextInput')).props.value).toBe('mont');
    expect(await eventsOf(client, 'popular_search_click')).toHaveLength(1);
  });

  it('browses a popular category with no query, and reports the tap', async () => {
    suggestionsBody = POPULAR;
    searchAnswers = { '': { hits: [product('K1')], total: 1 } };
    const { renderer, client } = await panel();

    await press(buttonLabelled(renderer, 'Giyim'));

    const request = searchRequests()[0]!;
    expect(request.searchParams.get('category')).toBe('Kadın > Giyim');
    expect(request.searchParams.has('q')).toBe(false);
    expect(await eventsOf(client, 'popular_category_click')).toHaveLength(1);
  });

  it('names the browsed category as a lit chip that takes it off, and goes back to the suggestions with no term', async () => {
    suggestionsBody = POPULAR;
    // What a browse answers: the SUB-categories of the category asked for, never the category itself.
    searchAnswers = {
      '': {
        hits: [product('K1')],
        total: 9,
        categories: [{ name: 'Kadın > Giyim > Ceket', count: 5 }, { name: 'Kadın > Giyim > Kazak', count: 4 }],
      },
    };
    const { renderer } = await panel();

    await press(buttonLabelled(renderer, 'Giyim'));

    // The input is empty and no sub-category is lit: the scope is what says where the visitor is.
    const scope = buttonLabelled(renderer, 'Kategori filtresini kaldır: Giyim')!;
    expect(scope).toBeDefined();
    expect(scope.props.accessibilityState).toEqual({ selected: true });
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Giyim', '×', 'Ceket', 'Kazak']));
    // Stands where "All" stood: nothing offers to widen to the whole catalogue beside a lit parent.
    expect(buttonLabelled(renderer, 'Tümü')).toBeUndefined();
    expect(buttonLabelled(renderer, 'Ceket')!.props.accessibilityState).toEqual({ selected: false });
    // First in the row.
    const row = renderer.root.findByType(el('ScrollView'));
    expect(row.findAll((node) => node.props.accessibilityRole === 'button')[0]!.props.accessibilityLabel).toBe(
      'Kategori filtresini kaldır: Giyim'
    );

    await press(scope);

    // No term and no category: the suggestions screen, not a blank results list.
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Popüler kategoriler']));
    expect(buttonLabelled(renderer, 'Kategori filtresini kaldır: Giyim')).toBeUndefined();
  });

  it('re-runs the term without the category when the scope of a term search is taken off', async () => {
    suggestionsBody = POPULAR;
    searchAnswers = {
      '': { hits: [product('K1')], total: 9, categories: [{ name: 'Kadın > Giyim > Ceket', count: 5 }] },
      ceket: { hits: [product('A')], total: 2, categories: [{ name: 'Kadın > Giyim > Ceket', count: 2 }] },
    };
    const { renderer } = await panel();
    await press(buttonLabelled(renderer, 'Giyim'));

    // Typing keeps the browsed category: it is still what narrows the answer, and still named.
    await type(renderer, 'ceket');
    expect(searchRequests().at(-1)!.searchParams.get('category')).toBe('Kadın > Giyim');
    const scope = buttonLabelled(renderer, 'Kategori filtresini kaldır: Giyim')!;
    expect(scope.props.accessibilityState).toEqual({ selected: true });

    await press(scope);

    const request = searchRequests().at(-1)!;
    expect(request.searchParams.get('q')).toBe('ceket');
    expect(request.searchParams.has('category')).toBe(false);
    expect(buttonLabelled(renderer, 'Kategori filtresini kaldır: Giyim')).toBeUndefined();
    expect(buttonLabelled(renderer, 'Tümü')!.props.accessibilityState).toEqual({ selected: true });
  });

  it('keeps the browsed category named when it holds nothing, with a way out', async () => {
    suggestionsBody = POPULAR;
    searchAnswers = { '': { hits: [], total: 0, categories: [] } };
    const { renderer } = await panel();

    await press(buttonLabelled(renderer, 'Giyim'));

    expect(texts(renderer)).toEqual(expect.arrayContaining(['Sonuç bulunamadı', 'Giyim']));
    await press(buttonLabelled(renderer, 'Kategori filtresini kaldır: Giyim'));
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Popüler kategoriler']));
  });

  it('opens a popular product like a result, and reports it as a popular product and a click', async () => {
    suggestionsBody = POPULAR;
    const opened: string[] = [];
    const { renderer, client } = await panel({ onProductPress: (item) => opened.push(item.itemCode) });

    await press(buttonLabelled(renderer, 'Kırmızı Ceket P2'));

    expect(opened).toEqual(['P2']);
    expect(await eventsOf(client, 'popular_product_click')).toHaveLength(1);
    expect(await eventsOf(client, 'product_click')).toHaveLength(1);
  });

  describe('recent searches', () => {
    it('are offered after a search that found something, and can be cleared', async () => {
      searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
      const { renderer } = await panel();
      await type(renderer, 'ceket');
      await type(renderer, '');

      expect(texts(renderer)).toEqual(expect.arrayContaining(['Son aramalar', 'ceket']));

      await press(buttonLabelled(renderer, 'Temizle'));
      expect(texts(renderer)).not.toContain('Son aramalar');
    });

    it('can be taken away one term at a time, and tapped to search again', async () => {
      searchAnswers = {
        ceket: { hits: [product('A')], total: 1 },
        mont: { hits: [product('B')], total: 1 },
      };
      const { renderer, client } = await panel();
      await type(renderer, 'ceket');
      await type(renderer, 'mont');
      await type(renderer, '');

      await press(buttonLabelled(renderer, 'Sil: ceket'));
      expect(buttonLabelled(renderer, 'ceket')).toBeUndefined();

      await press(buttonLabelled(renderer, 'mont'));
      expect(renderer.root.findByType(el('TextInput')).props.value).toBe('mont');
      expect(await eventsOf(client, 'recent_search_click')).toHaveLength(1);
    });

    it('are not offered when the merchant switched them off', async () => {
      configure({ suggestions: { recent: { enabled: false } } });
      searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
      const { renderer } = await panel();
      await type(renderer, 'ceket');
      await type(renderer, '');

      expect(texts(renderer)).not.toContain('Son aramalar');
    });
  });
});

/** The matched part of a title: bold, in the highlight colour (the brand, where the merchant chose none). */
const isMarked = (node: ReactTestInstance) => {
  const style = node.props.style as { fontWeight?: string; color?: string } | undefined;
  return style?.fontWeight === '700' && style.color === '#d3145a';
};

describe('SelwiseSearchPanel: the results', () => {
  const HITS = {
    ceket: {
      hits: [
        product('A', { originalPrice: 200, discountRate: 50, description: 'Sıcak tutar', categories: 'Kadın > Ceket', inStock: true }),
        product('B', { inStock: false }),
      ],
      total: 2,
    },
  };

  it('draws a row per product with the image, as the list layout says', async () => {
    configure({ results: { layout: 'list' } });
    searchAnswers = HITS;
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    expect(renderer.root.findAllByType(el('Image'))).toHaveLength(2);
    expect(renderer.root.findByType(el('FlatList')).props.numColumns).toBe(1);
  });

  it('draws the compact layout without the image', async () => {
    configure({ results: { layout: 'compact' } });
    searchAnswers = HITS;
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    expect(renderer.root.findAllByType(el('Image'))).toHaveLength(0);
    expect(texts(renderer).join(' ')).toContain('Kırmızı Ceket A');
  });

  it('draws the grid in the columns the merchant chose, and a phone’s two by default', async () => {
    configure({ results: { layout: 'grid' }, appearance: { grid: { columns: '3' } }, devices: { mobile: { appearance: { grid: { columns: '3' } } } } });
    searchAnswers = HITS;
    const { renderer } = await panel();
    await type(renderer, 'ceket');
    expect(renderer.root.findByType(el('FlatList')).props.numColumns).toBe(3);
  });

  it('draws two columns when nobody chose', async () => {
    configure({ results: { layout: 'grid' } });
    searchAnswers = HITS;
    const { renderer } = await panel();
    await type(renderer, 'ceket');
    expect(renderer.root.findByType(el('FlatList')).props.numColumns).toBe(2);
  });

  it('draws exactly the fields the merchant switched on', async () => {
    configure({
      results: {
        layout: 'list',
        fields: { image: false, price: true, oldPrice: true, discount: true, stock: true, category: true, description: true },
      },
    });
    searchAnswers = HITS;
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    const all = texts(renderer);
    expect(renderer.root.findAllByType(el('Image'))).toHaveLength(0);
    expect(all).toEqual(expect.arrayContaining(['Sıcak tutar', 'Ceket', 'Stokta', 'Tükendi', '-50%']));
    expect(all.some((text) => text.includes('100'))).toBe(true);
    expect(all.some((text) => text.includes('200'))).toBe(true);
  });

  it('leaves out what the merchant switched off', async () => {
    configure({
      results: {
        layout: 'list',
        fields: { image: true, price: false, oldPrice: false, discount: false, stock: false, category: false, description: false },
      },
    });
    searchAnswers = HITS;
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    const all = texts(renderer);
    expect(all).not.toContain('Sıcak tutar');
    expect(all).not.toContain('Stokta');
    expect(all).not.toContain('-50%');
    expect(all.some((text) => /\d{3}/.test(text) && !text.includes('ürün'))).toBe(false);
  });

  it('marks the part of the title the shopper typed', async () => {
    configure({ results: { highlight: true } });
    searchAnswers = HITS;
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    const marked = renderer.root
      .findAllByType(el('Text'))
      .filter(isMarked)
      .map(textOf);
    expect(marked).toEqual(['Ceket', 'Ceket']);
  });

  it('marks nothing when the merchant switched the highlight off', async () => {
    configure({ results: { highlight: false } });
    searchAnswers = HITS;
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    const marked = renderer.root
      .findAllByType(el('Text'))
      .filter(isMarked);
    expect(marked).toHaveLength(0);
  });

  it('says how many were found, in the merchant’s words', async () => {
    searchAnswers = { ceket: { ...HITS.ceket, total: 40 } };
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    expect(texts(renderer)).toContain('40 üründen 2 tanesi');
  });

  it('opens a result that is tapped, and reports it with the term and the category', async () => {
    searchAnswers = HITS;
    const opened: string[] = [];
    const { renderer, client } = await panel({ onProductPress: (item) => opened.push(item.itemCode) });
    await type(renderer, 'ceket');

    await press(buttonLabelled(renderer, 'Kırmızı Ceket A'));

    expect(opened).toEqual(['A']);
    expect((await eventsOf(client, 'product_click'))[0]).toMatchObject({
      entityType: 'search',
      productItemCode: 'A',
      metadata: { query: 'ceket', position: 0, category: 'Kadın' },
    });
  });

  it('opens the product’s link through the host when the app passed no handler', async () => {
    searchAnswers = HITS;
    const { renderer, navigated } = await panel();
    await type(renderer, 'ceket');

    await press(buttonLabelled(renderer, 'Kırmızı Ceket A'));

    expect(navigated).toEqual([{ kind: 'path', url: '/p/A', source: 'search' }]);
  });

  it('asks for the next page when the list is scrolled to its end, and adds it', async () => {
    searchAnswers = {
      'ceket|0': { hits: [product('A'), product('B')], total: 3 },
      'ceket|2': { hits: [product('B'), product('C')], total: 3 },
    };
    const { renderer, client } = await panel();
    await type(renderer, 'ceket');

    await act(async () => {
      (renderer.root.findByType(el('FlatList')).props as { onEndReached: () => void }).onEndReached();
    });
    await settle();

    const requests = searchRequests();
    expect(requests).toHaveLength(2);
    expect(requests[1]!.searchParams.get('offset')).toBe('2');
    // The page repeated B: it is not drawn twice.
    expect(renderer.root.findByType(el('FlatList')).props.data.map((item: SelwiseProduct) => item.itemCode)).toEqual(['A', 'B', 'C']);
    // A page is not another search.
    expect(await eventsOf(client, 'search_query')).toHaveLength(1);
    // Everything found is on screen: no more pages are asked for.
    expect(renderer.root.findByType(el('FlatList')).props.onEndReached).toBeUndefined();
  });

  it('shows the categories of the results as chips, and narrows to the one tapped, keeping the others', async () => {
    searchAnswers = {
      ceket: { ...HITS.ceket, categories: [{ name: 'Kadın', count: 1 }, { name: 'Erkek', count: 1 }] },
    };
    const { renderer, client } = await panel();
    await type(renderer, 'ceket');
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Tümü', 'Kadın', 'Erkek']));

    searchAnswers = { ceket: { hits: [HITS.ceket.hits[0]], total: 1, categories: [{ name: 'Kadın', count: 1 }] } };
    await press(buttonLabelled(renderer, 'Kadın'));

    expect(searchRequests().at(-1)!.searchParams.get('category')).toBe('Kadın');
    // The chip of the other category is still there to switch to.
    expect(buttonLabelled(renderer, 'Erkek')).toBeDefined();
    expect(buttonLabelled(renderer, 'Kadın')!.props.accessibilityState).toEqual({ selected: true });
    // Narrowing the same search is not a second search.
    expect(await eventsOf(client, 'search_query')).toHaveLength(1);

    await press(buttonLabelled(renderer, 'Tümü'));
    expect(searchRequests().at(-1)!.searchParams.has('category')).toBe(false);
  });

  it('draws no chips when the merchant chose none', async () => {
    configure({ results: { categories: { display: 'none' } } });
    searchAnswers = { ceket: { ...HITS.ceket, categories: [{ name: 'Kadın', count: 1 }] } };
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    expect(buttonLabelled(renderer, 'Kadın')).toBeUndefined();
  });

  it('names a category as the merchant chose', async () => {
    configure({ results: { categories: { display: 'chips', naming: 'full_path' } } });
    searchAnswers = { ceket: { ...HITS.ceket, categories: [{ name: 'Kadın > Ceket', count: 2 }] } };
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    expect(texts(renderer)).toContain('Kadın › Ceket');
  });

  it('draws a "view all" that hands the query to the app, when the merchant switched it on', async () => {
    configure({ results: { viewAll: { enabled: true } } });
    searchAnswers = HITS;
    const viewed: string[] = [];
    const { renderer } = await panel({ onViewAll: (query) => viewed.push(query) });
    await type(renderer, 'ceket');

    await press(buttonLabelled(renderer, 'Tümünü gör'));

    expect(viewed).toEqual(['ceket']);
  });

  it('draws no "view all" the app cannot answer, or when it is off', async () => {
    configure({ results: { viewAll: { enabled: true } } });
    searchAnswers = HITS;
    const first = await panel();
    await type(first.renderer, 'ceket');
    expect(buttonLabelled(first.renderer, 'Tümünü gör')).toBeUndefined();

    configure({ results: { viewAll: { enabled: false } } });
    const second = await panel({ onViewAll: () => undefined });
    await type(second.renderer, 'ceket');
    expect(buttonLabelled(second.renderer, 'Tümünü gör')).toBeUndefined();
  });

  describe('when nothing matched', () => {
    it('says so in the merchant’s words, with the terms to try instead', async () => {
      searchAnswers = { cekt: { hits: [], total: 0, suggestions: ['ceket'] } };
      const { renderer } = await panel();
      await type(renderer, 'cekt');

      expect(texts(renderer)).toEqual(expect.arrayContaining(['Sonuç bulunamadı', 'Bunu mu demek istediniz?', 'ceket']));

      searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
      await press(buttonLabelled(renderer, 'ceket'));
      expect(renderer.root.findByType(el('TextInput')).props.value).toBe('ceket');
      expect(texts(renderer)).not.toContain('Sonuç bulunamadı');
    });

    it('lets the app draw it', async () => {
      searchAnswers = { cekt: { hits: [], total: 0 } };
      const { renderer } = await panel({ renderEmpty: ({ query, text }) => h('Empty', { query, text }) });
      await type(renderer, 'cekt');

      expect(renderer.root.findByType(el('Empty')).props).toEqual({ query: 'cekt', text: 'Sonuç bulunamadı' });
    });
  });

  it('says the merchant’s error sentence when the search failed', async () => {
    searchAnswers = { ceket: { hits: [], total: 0, strategy: 'service_unavailable' } };
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    expect(texts(renderer)).toContain('Bir hata oluştu');
  });
});

describe('SelwiseSearchPanel: the basket', () => {
  const ONE = { ceket: { hits: [product('A', { cartCode: 'CART-A' })], total: 1 } };

  it('adds to the app’s basket with the code it accepts, and reports the add as the search’s', async () => {
    searchAnswers = ONE;
    const { renderer, client, added } = await panel({ addToCartLabel: 'Sepete ekle' });
    await type(renderer, 'ceket');

    await press(buttonLabelled(renderer, 'Sepete ekle'));

    expect(added).toEqual([expect.objectContaining({ code: 'CART-A', quantity: 1, source: 'search' })]);
    expect(texts(renderer)).toContain('Eklendi');
    expect((await eventsOf(client, 'add_to_cart'))[0]).toMatchObject({
      entityType: 'search',
      productItemCode: 'A',
      metadata: { query: 'ceket', quantity: 1, price: 100 },
    });
  });

  it('names the idle button with the merchant’s word, unless the app brings its own', async () => {
    searchAnswers = ONE;
    configure({ texts: { cartAdd: 'Sepete at' } });
    const merchants = await panel();
    await type(merchants.renderer, 'ceket');
    expect(buttonLabelled(merchants.renderer, 'Sepete at')).toBeDefined();

    const apps = await panel({ addToCartLabel: 'Add to bag' });
    await type(apps.renderer, 'ceket');
    expect(buttonLabelled(apps.renderer, 'Add to bag')).toBeDefined();
    expect(buttonLabelled(apps.renderer, 'Sepete at')).toBeUndefined();
  });

  it('says the merchant’s words while it adds, and when the basket refused', async () => {
    searchAnswers = ONE;
    let release!: (result: { success: boolean }) => void;
    const host = recordingHost({ addToCart: () => new Promise((resolve) => (release = resolve)) });
    const { renderer, client } = await panel({ addToCartLabel: 'Sepete ekle' }, host);
    await type(renderer, 'ceket');

    await act(async () => {
      (buttonLabelled(renderer, 'Sepete ekle')!.props as { onPress: () => void }).onPress();
    });
    expect(texts(renderer)).toContain('Ekleniyor');

    await act(async () => release({ success: false }));
    expect(texts(renderer)).toContain('Eklenemedi');
    expect(await eventsOf(client, 'add_to_cart')).toHaveLength(0);
  });

  it('draws no button when the merchant switched the basket off, or the app has none', async () => {
    searchAnswers = ONE;
    configure({ cart: { enabled: false } });
    const off = await panel({ addToCartLabel: 'Sepete ekle' });
    await type(off.renderer, 'ceket');
    expect(buttonLabelled(off.renderer, 'Sepete ekle')).toBeUndefined();

    configure({ cart: { enabled: true } });
    const none = await panel({ addToCartLabel: 'Sepete ekle' }, { host: {}, navigated: [], added: [] });
    await type(none.renderer, 'ceket');
    expect(buttonLabelled(none.renderer, 'Sepete ekle')).toBeUndefined();
  });
});

describe('SelwiseSearchPanel: a refused or sold-out add says why', () => {
  it('shows the platform’s own sentence under the button when the basket refused with a message', async () => {
    searchAnswers = { ceket: { hits: [product('A', { cartCode: 'CART-A' })], total: 1 } };
    const host = recordingHost({
      addToCart: () => ({ success: false, message: 'Bu ürün 0 adetten fazla satın alınamaz.' }),
    });
    const { renderer, client } = await panel({ addToCartLabel: 'Sepete ekle' }, host);
    await type(renderer, 'ceket');

    await press(buttonLabelled(renderer, 'Sepete ekle'));

    expect(texts(renderer)).toContain('Eklenemedi');
    expect(texts(renderer)).toContain('Bu ürün 0 adetten fazla satın alınamaz.');
    expect(await eventsOf(client, 'add_to_cart')).toHaveLength(0);
  });

  it('keeps the generic error label alone when the basket gave no message', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    const host = recordingHost({ addToCart: () => ({ success: false }) });
    const { renderer } = await panel({ addToCartLabel: 'Sepete ekle' }, host);
    await type(renderer, 'ceket');

    await press(buttonLabelled(renderer, 'Sepete ekle'));

    expect(texts(renderer)).toContain('Eklenemedi');
    expect(
      renderer.root.findAll((node) => node.props?.testID === 'selwise-search-cart-message')
    ).toHaveLength(0);
  });

  it('draws a sold-out hit’s button disabled with the sold-out word, and never calls the basket', async () => {
    searchAnswers = { ceket: { hits: [product('A', { cartCode: 'CART-A', inStock: false })], total: 1 } };
    const host = recordingHost();
    const { renderer } = await panel({ addToCartLabel: 'Sepete ekle' }, host);
    await type(renderer, 'ceket');

    expect(buttonLabelled(renderer, 'Sepete ekle')).toBeUndefined();
    const button = buttonLabelled(renderer, 'Tükendi');
    expect(button).toBeDefined();
    expect(button!.props.disabled).toBe(true);
    expect(button!.props.accessibilityState).toMatchObject({ disabled: true });

    await act(async () => {
      (button!.props as { onPress?: () => void }).onPress?.();
    });
    expect(host.added).toHaveLength(0);
  });

  describe('the button goes back to idle on its own timer, per product', () => {
    const TWO = {
      ceket: { hits: [product('A', { cartCode: 'CART-A' }), product('B', { cartCode: 'CART-B' })], total: 2 },
    };
    const tick = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    };
    const pressNow = async (node: ReactTestInstance | undefined) => {
      expect(node).toBeDefined();
      await act(async () => {
        (node!.props as { onPress: () => void }).onPress();
      });
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('a newer settle replaces the older one\'s timer, so the old reset cannot cut it short', async () => {
      searchAnswers = TWO;
      const answers = [{ success: false, message: 'Stok yok.' }, { success: true }];
      const host = recordingHost({ addToCart: () => answers.shift() ?? { success: true } });
      const { renderer } = await panel({ addToCartLabel: 'Sepete ekle' }, host);
      await type(renderer, 'ceket');

      jest.useFakeTimers();
      const buttons = () => renderer.root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityLabel === 'Sepete ekle');
      await pressNow(buttons()[0]);
      expect(texts(renderer)).toContain('Stok yok.');

      // The refusal stays up for its own, longer time; a second press on the
      // same product settles as "added" and owns the timer from then on.
      await tick(5000);
      expect(texts(renderer)).toContain('Stok yok.');
      await pressNow(buttonLabelled(renderer, 'Eklenemedi'));
      expect(texts(renderer)).toContain('Eklendi');
      expect(texts(renderer)).not.toContain('Stok yok.');

      // 6.5 s after the first settle: its 6 s timer would have reset the row by now.
      await tick(1500);
      expect(texts(renderer)).toContain('Eklendi');
      await tick(600);
      expect(texts(renderer)).not.toContain('Eklendi');
      expect(buttons()).toHaveLength(2);
    });

    it('keeps one product\'s state apart from the other\'s', async () => {
      searchAnswers = TWO;
      const answers = [{ success: false, message: 'Stok yok.' }, { success: true }];
      const host = recordingHost({ addToCart: () => answers.shift() ?? { success: true } });
      const { renderer } = await panel({ addToCartLabel: 'Sepete ekle' }, host);
      await type(renderer, 'ceket');

      jest.useFakeTimers();
      const idle = () => renderer.root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityLabel === 'Sepete ekle');
      await pressNow(idle()[0]);
      await pressNow(idle()[0]);
      expect(texts(renderer)).toContain('Stok yok.');
      expect(texts(renderer)).toContain('Eklendi');

      // The shorter "added" timer ends first and leaves the refusal alone.
      await tick(2100);
      expect(texts(renderer)).not.toContain('Eklendi');
      expect(texts(renderer)).toContain('Stok yok.');
      await tick(4000);
      expect(texts(renderer)).not.toContain('Stok yok.');
    });

    it('leaves no timer behind when the screen closes', async () => {
      searchAnswers = TWO;
      const { renderer } = await panel({ addToCartLabel: 'Sepete ekle' });
      await type(renderer, 'ceket');

      jest.useFakeTimers();
      const before = jest.getTimerCount();
      await pressNow(buttonLabelled(renderer, 'Sepete ekle'));
      expect(jest.getTimerCount()).toBeGreaterThan(before);
      await act(async () => renderer.unmount());
      expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
    });
  });

  it('still offers the button to a group whose own row says sold out but has an in-stock size', async () => {
    searchAnswers = {
      ceket: {
        hits: [
          product('A', {
            cartCode: 'CART-A',
            inStock: false,
            variants: [
              { variantCode: 'A-S', size: 'S', inStock: false },
              { variantCode: 'A-M', size: 'M', inStock: true },
            ],
          }),
        ],
        total: 1,
      },
    };
    const { renderer } = await panel({ addToCartLabel: 'Sepete ekle' });
    await type(renderer, 'ceket');

    expect(buttonLabelled(renderer, 'Sepete ekle')).toBeDefined();
  });
});

/** A designer card as the API ships it (v3): the title opens the product, the price, a basket button. */
function gridCard(label = 'Sepete ekle'): Record<string, unknown> {
  const node = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, style: {}, props: {}, ...extra });
  return {
    mode: 'schema',
    renderVersion: 3,
    variantSelection: 'none',
    cardTree: {
      version: 3,
      root: {
        id: 'root',
        type: 'root',
        style: {},
        children: [
          node('title', 'text', { props: { field: 'title', linkToProduct: true } }),
          node('price', 'price', { props: { variant: 'current' } }),
          node('add', 'button', { props: { action: 'add_to_cart', label } }),
        ],
      },
      entrance: 'none',
      hover: 'none',
      transitionMs: 200,
    },
  };
}

describe('SelwiseSearchPanel: the grid draws the merchant’s product card', () => {
  const HIT = { ceket: { hits: [product('A', { cartCode: 'CART-A' }), product('B', { cartCode: 'CART-B' })], total: 2 } };
  const rowsOf = (renderer: ReactTestRenderer) => renderer.root.findAll((node) => node.props?.testID === pickId('card', 'results'));
  const cardsOf = (renderer: ReactTestRenderer) => renderer.root.findAll((node) => String(node.props?.testID ?? '').startsWith('selwise-card-'));

  it('draws each hit with the card component of the strips, not a row', async () => {
    configure({ results: { layout: 'grid' } }, { productCard: gridCard() });
    searchAnswers = HIT;
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    expect(cardsOf(renderer).map((node) => node.props.testID)).toEqual(['selwise-card-A', 'selwise-card-B']);
    expect(rowsOf(renderer)).toHaveLength(0);
    expect(buttonLabelled(renderer, 'Sepete ekle')).toBeDefined();
    expect(renderer.root.findByType(el('FlatList')).props.numColumns).toBe(2);
  });

  it('prefers the phone’s own card, then the channel’s', async () => {
    searchAnswers = HIT;
    configure({ results: { layout: 'grid' } }, { productCard: gridCard('Sepete ekle'), mobileProductCard: gridCard('Çantaya at') });
    const phone = await panel();
    await type(phone.renderer, 'ceket');
    expect(buttonLabelled(phone.renderer, 'Çantaya at')).toBeDefined();
    expect(buttonLabelled(phone.renderer, 'Sepete ekle')).toBeUndefined();
  });

  it('keeps rows in the list and compact layouts, whatever card the channel has', async () => {
    searchAnswers = HIT;
    for (const layout of ['list', 'compact']) {
      configure({ results: { layout } }, { productCard: gridCard() });
      const { renderer } = await panel();
      await type(renderer, 'ceket');
      expect(cardsOf(renderer)).toHaveLength(0);
      expect(rowsOf(renderer)).toHaveLength(2);
    }
  });

  it('draws rows in the grid when the channel has no card, and when the card is not the designer’s tree', async () => {
    searchAnswers = HIT;
    configure({ results: { layout: 'grid' } });
    const none = await panel();
    await type(none.renderer, 'ceket');
    expect(rowsOf(none.renderer)).toHaveLength(2);
    expect(cardsOf(none.renderer)).toHaveLength(0);

    // A card the app cannot draw from a tree falls back to the strips' default card, never to nothing.
    configure({ results: { layout: 'grid' } }, { productCard: { mode: 'html' } });
    const markup = await panel();
    await type(markup.renderer, 'ceket');
    expect(rowsOf(markup.renderer)).toHaveLength(0);
    expect(texts(markup.renderer).join(' ')).toContain('Kırmızı Ceket A');
  });

  it('lets the app’s own renderItem win over the card', async () => {
    configure({ results: { layout: 'grid' } }, { productCard: gridCard() });
    searchAnswers = HIT;
    const { renderer } = await panel({ renderItem: (info) => h('MyCard', { code: info.product.itemCode }) });
    await type(renderer, 'ceket');

    expect(renderer.root.findAllByType(el('MyCard'))).toHaveLength(2);
    expect(cardsOf(renderer)).toHaveLength(0);
  });

  it('adds to the app’s basket as the search’s add, with the code it accepts, and reports it as the search’s', async () => {
    configure({ results: { layout: 'grid' } }, { productCard: gridCard() });
    searchAnswers = HIT;
    const { renderer, client, added } = await panel();
    await type(renderer, 'ceket');

    await press(buttonLabelled(renderer, 'Sepete ekle'));

    expect(added).toEqual([expect.objectContaining({ code: 'CART-A', quantity: 1, source: 'search' })]);
    expect(added[0]).not.toHaveProperty('surfaceId');
    expect((await eventsOf(client, 'add_to_cart'))[0]).toMatchObject({
      entityType: 'search',
      productItemCode: 'A',
      metadata: { query: 'ceket', quantity: 1, price: 100 },
    });
  });

  it('says the platform’s own sentence when the basket refused, and reports nothing', async () => {
    configure({ results: { layout: 'grid' } }, { productCard: gridCard() });
    searchAnswers = HIT;
    const host = recordingHost({ addToCart: () => ({ success: false, message: 'Bu ürün 0 adetten fazla satın alınamaz.' }) });
    const { renderer, client } = await panel({}, host);
    await type(renderer, 'ceket');

    await press(buttonLabelled(renderer, 'Sepete ekle'));

    const message = renderer.root.findAll((node) => node.props?.testID === 'selwise-add-toast');
    expect(message).toHaveLength(1);
    expect(texts(renderer)).toContain('Bu ürün 0 adetten fazla satın alınamaz.');
    expect(await eventsOf(client, 'add_to_cart')).toHaveLength(0);
  });

  it('draws a sold-out hit’s button disabled and never calls the basket', async () => {
    configure({ results: { layout: 'grid' } }, { productCard: gridCard() });
    searchAnswers = { ceket: { hits: [product('A', { cartCode: 'CART-A', inStock: false })], total: 1 } };
    const { renderer, added } = await panel();
    await type(renderer, 'ceket');

    const button = renderer.root.findAll((node) => (node.type as unknown) === 'Pressable' && node.props.accessibilityState?.disabled === true)[0];
    expect(button).toBeDefined();
    await press(button);
    expect(added).toHaveLength(0);
  });

  it('opens the product with the search’s click, through the app’s handler or the host', async () => {
    configure({ results: { layout: 'grid' } }, { productCard: gridCard() });
    searchAnswers = HIT;
    const opened: string[] = [];
    const { renderer, client } = await panel({ onProductPress: (product) => opened.push(product.itemCode) });
    await type(renderer, 'ceket');

    await press(renderer.root.findAll((node) => (node.type as unknown) === 'Pressable' && textOf(node) === 'Kırmızı Ceket B')[0]);

    expect(opened).toEqual(['B']);
    expect((await eventsOf(client, 'product_click'))[0]).toMatchObject({ productItemCode: 'B', metadata: { query: 'ceket', position: 1 } });

    const viaHost = await panel({});
    await type(viaHost.renderer, 'ceket');
    await press(viaHost.renderer.root.findAll((node) => (node.type as unknown) === 'Pressable' && textOf(node) === 'Kırmızı Ceket A')[0]);
    expect(viaHost.navigated).toEqual([expect.objectContaining({ url: '/p/A', source: 'search' })]);
  });

  it('exposes the card to an app that draws its own screen', async () => {
    configure({ results: { layout: 'grid' } }, { productCard: gridCard() });
    let seen: UseSelwiseSearchResult | null = null;
    const Probe = () => {
      seen = useSelwiseSearch();
      return null;
    };
    const client = await startClient();
    await mount(client, recordingHost().host, h(Probe));
    await settle();
    expect(seen!.productCard).toMatchObject({ mode: 'schema', renderVersion: 3 });
  });
});

describe('SelwiseSearchPanel: the app’s own box, the other states and the app’s own drawing', () => {
  it('draws no input of its own when the app’s box drives it, and searches what that holds', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSearchPanel, { query: 'ceket' }));
    await settle();

    expect(renderer.root.findAllByType(el('TextInput'))).toHaveLength(0);
    expect(texts(renderer).join(' ')).toContain('Kırmızı Ceket A');
  });

  it('lets the app draw the input', async () => {
    const seen: unknown[] = [];
    await panel({
      renderInput: (props) => {
        seen.push(props);
        return h('MyInput', null);
      },
    });

    expect(seen[0]).toMatchObject({ value: '', placeholder: 'Ürün ara', clearLabel: 'Sil', autoFocus: true });
  });

  it('draws nothing while search is off for the visitor, and says so', async () => {
    searchConfig = { enabled: false };
    const states: string[] = [];
    const { renderer } = await panel({ onUnavailable: (status) => states.push(status) });

    expect(renderer.toJSON()).toBeNull();
    expect(states).toEqual(['off']);
  });

  it('follows a merchant’s redirect instead of drawing "no results"', async () => {
    searchAnswers = { kargo: { hits: [], total: 0, redirect: '/kargo-bilgileri' } };
    const { renderer, navigated } = await panel();
    await type(renderer, 'kargo');

    expect(navigated).toEqual([{ kind: 'path', url: '/kargo-bilgileri', source: 'search' }]);
    expect(renderer.toJSON()).toBeNull();
  });

  it('lets the app draw a result, and hands it what it needs', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    const infos: Array<Record<string, unknown>> = [];
    const { renderer } = await panel({
      renderItem: (info) => {
        infos.push(info as unknown as Record<string, unknown>);
        return h('MyCard', { code: info.product.itemCode });
      },
    });
    await type(renderer, 'ceket');

    expect(renderer.root.findByType(el('MyCard')).props.code).toBe('A');
    expect(infos[0]).toMatchObject({ index: 0, layout: 'grid', cartState: 'idle' });
    expect(typeof infos[0]!.onPress).toBe('function');
    expect(typeof infos[0]!.onAddToCart).toBe('function');
  });

  it('lets the app draw a suggestion', async () => {
    suggestionsBody = { popularSearches: { enabled: true, items: ['mont'] } };
    const { renderer } = await panel({ renderSuggestion: ({ kind, value }) => h('MyChip', { kind, value }) });

    expect(renderer.root.findByType(el('MyChip')).props).toEqual({ kind: 'popularSearch', value: 'mont' });
  });

  it('draws the app’s header under the input', async () => {
    const { renderer } = await panel({ renderHeader: () => h('MyHeader', null) });
    expect(renderer.root.findAllByType(el('MyHeader'))).toHaveLength(1);
  });

  it('draws the structure and no style at all when unstyled', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    suggestionsBody = { popularSearches: { enabled: true, items: ['mont'] } };
    const { renderer } = await panel({ unstyled: true });
    const styled = (node: ReactTestInstance) => node.props.style !== undefined;

    expect(renderer.root.findAllByType(el('Pressable')).some(styled)).toBe(false);
    expect(renderer.root.findAllByType(el('Text')).some(styled)).toBe(false);

    await type(renderer, 'ceket');
    expect(renderer.root.findAllByType(el('Pressable')).some(styled)).toBe(false);
    expect(renderer.root.findAllByType(el('Text')).some(styled)).toBe(false);
  });

  it('labels every button, for a screen reader', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1, categories: [{ name: 'Kadın', count: 1 }] } };
    const { renderer } = await panel({ onClose: () => undefined, addToCartLabel: 'Sepete ekle' });
    await type(renderer, 'ceket');

    const unlabelled = renderer.root
      .findAllByType(el('Pressable'))
      .filter((node) => !node.props.accessibilityLabel);
    expect(unlabelled).toHaveLength(0);
  });

  it('draws the merchant’s colours, corners and input over the brand', async () => {
    configure({
      appearance: { colors: { accent: '#00aa00', background: '#fafafa' }, input: { height: 52, radius: 4, icon: false } },
    });
    const { renderer } = await panel();

    const box = renderer.root.findByType(el('TextInput')).parent!;
    expect(box.props.style).toMatchObject({ height: 52, borderRadius: 4 });
    expect(renderer.toJSON()).toMatchObject({ props: { style: expect.arrayContaining([expect.objectContaining({ backgroundColor: '#fafafa' })]) } });
  });

  it('follows the brand where the merchant chose no colour', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1, categories: [{ name: 'Kadın', count: 1 }] } };
    const { renderer } = await panel();
    await type(renderer, 'ceket');

    // The "all" chip is the active one: drawn in the brand (`--selwise-brand`).
    expect(buttonLabelled(renderer, 'Tümü')!.props.style).toMatchObject({ backgroundColor: '#d3145a' });
  });

  it('reports the opening of the screen and its closing', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    const { renderer, client } = await panel();
    await type(renderer, 'ceket');
    expect(await eventsOf(client, 'search_instant_open')).toHaveLength(1);

    await act(async () => renderer.unmount());
    renderers.pop();
    expect((await eventsOf(client, 'search_close'))[0]).toMatchObject({ metadata: { query: 'ceket', resultCount: 1 } });
  });
});

describe('SelwiseSearchPanel: as a screen of its own', () => {
  it('draws a back arrow before the input and calls onBack when it is tapped', async () => {
    const back: string[] = [];
    const { renderer } = await panel({ onBack: () => back.push('back') });

    // No label of its own: the merchant's "close" word names it.
    await press(buttonLabelled(renderer, 'Kapat'));
    expect(back).toEqual(['back']);
    expect(renderer.root.findAllByType(el('TextInput'))).toHaveLength(1);
  });

  it('names the back arrow with the app’s own word when it gives one', async () => {
    const { renderer } = await panel({ onBack: () => undefined, backLabel: 'Geri' });
    expect(buttonLabelled(renderer, 'Geri')).toBeDefined();
    expect(buttonLabelled(renderer, 'Kapat')).toBeUndefined();
  });

  it('draws no back arrow without onBack', async () => {
    const { renderer } = await panel();
    expect(buttonLabelled(renderer, 'Kapat')).toBeUndefined();
  });

  it('starts from initialQuery: the own input holds it and the search runs', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    const { renderer } = await panel({ initialQuery: '  ceket ' });

    expect(renderer.root.findByType(el('TextInput')).props.value).toBe('ceket');
    expect(searchRequests()[0]!.searchParams.get('q')).toBe('ceket');
    expect(texts(renderer).join(' ')).toContain('Kırmızı Ceket A');
  });

  it('leaves the visitor free to change what initialQuery started', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 }, mont: { hits: [product('B')], total: 1 } };
    const { renderer } = await panel({ initialQuery: 'ceket' });
    await type(renderer, 'mont');

    expect(renderer.root.findByType(el('TextInput')).props.value).toBe('mont');
    expect(texts(renderer).join(' ')).toContain('Kırmızı Ceket B');
  });

  it('ignores initialQuery when the app’s own box drives the panel', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    const client = await startClient();
    const { host } = recordingHost();
    const renderer = await mount(client, host, h(SelwiseSearchPanel, { query: 'ceket', initialQuery: 'mont' }));
    await settle();

    expect(searchRequests().map((request) => request.searchParams.get('q'))).toEqual(['ceket']);
    expect(renderer.root.findAllByType(el('TextInput'))).toHaveLength(0);
  });

  it('keeps clear of the status bar and the home indicator with safeArea', async () => {
    const { renderer } = await panel({ safeArea: true }, recordingHost({ safeAreaInsets: { top: 51, bottom: 30, left: 0, right: 0 } }));

    expect(renderer.toJSON()).toMatchObject({
      props: { style: expect.arrayContaining([expect.objectContaining({ paddingTop: 51, paddingBottom: 30 })]) },
    });
  });

  it('adds no padding without safeArea', async () => {
    const { renderer } = await panel({}, recordingHost({ safeAreaInsets: { top: 51, bottom: 30, left: 0, right: 0 } }));

    const style = (renderer.toJSON() as unknown as { props: { style: unknown[] } }).props.style;
    expect(style.some((part) => part && typeof part === 'object' && 'paddingTop' in (part as object))).toBe(false);
  });

  it('draws the back arrow alone while search is off, so the visitor can leave', async () => {
    searchConfig = { enabled: false };
    const back: string[] = [];
    const states: string[] = [];
    const { renderer } = await panel({ onBack: () => back.push('back'), onUnavailable: (status) => states.push(status) });

    expect(states).toEqual(['off']);
    expect(renderer.root.findAllByType(el('TextInput'))).toHaveLength(0);
    const [arrow, ...others] = renderer.root.findAllByType(el('Pressable'));
    expect(others).toHaveLength(0);
    // Off, the merchant's words are not read: a plain word names it.
    expect(arrow!.props.accessibilityLabel).toBe('Back');
    await press(arrow);
    expect(back).toEqual(['back']);
  });

  it('draws the back arrow while a redirect leaves, and still nothing without onBack', async () => {
    searchAnswers = { kargo: { hits: [], total: 0, redirect: '/kargo-bilgileri' } };
    const { renderer } = await panel({ onBack: () => undefined });
    await type(renderer, 'kargo');

    expect(renderer.root.findAllByType(el('TextInput'))).toHaveLength(0);
    expect(renderer.root.findAllByType(el('Pressable'))).toHaveLength(1);
  });
});

describe('useSelwiseSearch', () => {
  let latest: UseSelwiseSearchResult;
  function Probe(props: { options?: Parameters<typeof useSelwiseSearch>[0] }) {
    latest = useSelwiseSearch(props.options);
    return null;
  }
  async function probe(options?: Parameters<typeof useSelwiseSearch>[0]) {
    const client = await startClient();
    const renderer = await mount(client, {}, h(Probe, { options }));
    await settle();
    return { client, renderer };
  }
  const set = async (query: string) => {
    await act(async () => latest.setQuery(query));
    await settle();
  };

  it('takes its debounce, minimum length and page size from the channel’s settings', async () => {
    configure({ behavior: { minChars: 4, debounceMs: 0, maxResults: 3 } });
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    await probe();

    await set('cek');
    expect(searchRequests()).toHaveLength(0);

    await set('ceke');
    expect(searchRequests()[0]!.searchParams.get('limit')).toBe('3');
  });

  it('lets the app’s own numbers win', async () => {
    searchAnswers = { ce: { hits: [product('A')], total: 1 } };
    await probe({ minChars: 1, limit: 7, debounceMs: 0 });

    await set('c');
    expect(searchRequests()[0]!.searchParams.get('limit')).toBe('7');
  });

  it('exposes the settings and a way to say the words in them', async () => {
    await probe();

    expect(latest.settings?.behavior.maxResults).toBe(2);
    expect(latest.t('showing', { total: 9, shown: 3 })).toBe('9 üründen 3 tanesi');
    expect(latest.status).toBe('ready');
  });

  it('pages: more results, whether there are more, and the pages it holds', async () => {
    searchAnswers = {
      'ceket|0': { hits: [product('A'), product('B')], total: 3 },
      'ceket|2': { hits: [product('C')], total: 3 },
    };
    await probe();
    await set('ceket');
    expect(latest.results).toHaveLength(2);
    expect(latest.hits).toBe(latest.results);
    expect(latest.total).toBe(3);
    expect(latest.hasMore).toBe(true);

    await act(async () => latest.loadMore());
    await settle();

    expect(latest.results.map((item) => item.itemCode)).toEqual(['A', 'B', 'C']);
    expect(latest.hasMore).toBe(false);
    expect(searchRequests()[1]!.searchParams.get('offset')).toBe('2');
  });

  it('forgets the pages of an earlier query when the query changes', async () => {
    searchAnswers = {
      ceket: { hits: [product('A'), product('B')], total: 3 },
      mont: { hits: [product('M')], total: 1 },
    };
    await probe();
    await set('ceket');
    await set('mont');

    expect(latest.results.map((item) => item.itemCode)).toEqual(['M']);
    expect(latest.hasMore).toBe(false);
  });

  it('orders the results the shopper’s way, without reporting the search again', async () => {
    searchAnswers = { ceket: { hits: [product('A')], total: 1 } };
    const { client } = await probe();
    await set('ceket');

    await act(async () => latest.setSort('price_asc'));
    await settle();

    expect(searchRequests().at(-1)!.searchParams.get('sort')).toBe('price_asc');
    expect(await eventsOf(client, 'search_query')).toHaveLength(1);
  });

  it('says the terms to try for a search that found nothing, and is a zero-result search', async () => {
    searchAnswers = { cekt: { hits: [], total: 0, suggestions: ['ceket'] } };
    await probe();
    await set('cekt');

    expect(latest.isZeroResults).toBe(true);
    expect(latest.didYouMean).toEqual(['ceket']);
  });

  it('is not a zero-result search when search is off, and says so', async () => {
    searchConfig = { enabled: false };
    await probe();
    await set('ceket');

    expect(latest.status).toBe('off');
    expect(latest.isZeroResults).toBe(false);
    expect(searchRequests()).toHaveLength(0);
  });

  it('reports a tapped result with the category of the result it is', async () => {
    searchAnswers = { ceket: { hits: [product('A', { categories: 'Erkek > Ceket' })], total: 1 } };
    const { client } = await probe();
    await set('ceket');

    latest.trackClick('A', 0);

    expect((await eventsOf(client, 'product_click'))[0]).toMatchObject({ metadata: { query: 'ceket', category: 'Erkek' } });
  });

  it('reports the opening once, whenever it is asked for, and the closing once', async () => {
    const { client } = await probe();

    await act(async () => {
      latest.open();
      latest.open('focus');
    });
    await settle();
    await act(async () => {
      latest.close();
      latest.close();
    });

    expect(await eventsOf(client, 'search_instant_open')).toHaveLength(1);
    expect(await eventsOf(client, 'search_close')).toHaveLength(1);
  });

  it('keeps the same hook working with the fields it has always had', async () => {
    await probe();
    expect(Object.keys(latest)).toEqual(
      expect.arrayContaining(['query', 'setQuery', 'hits', 'loading', 'error', 'redirect', 'status', 'isZeroResults', 'trackClick', 'clear'])
    );
  });
});
