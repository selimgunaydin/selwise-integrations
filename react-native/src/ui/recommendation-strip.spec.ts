import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import { controls } from './test/react-native.mock.js';
import { RecommendationStrip } from './RecommendationStrip.js';
import { DefaultCard } from './card/DefaultCard.js';
import { resetSaid } from './host-hooks.js';
import {
  cardTree,
  el,
  eventsOf,
  flat,
  mount,
  press,
  pressableContaining,
  product,
  recordingHost,
  resetHarness,
  startClient,
  strip,
  teardownHarness,
  textOf,
  texts,
} from './test/strip-harness.js';

/**
 * The strip frame and its display types, drawn: what the merchant designs for a
 * recommendation is what the phone shows. The client under it is the real one;
 * only the network is faked.
 */

beforeEach(() => {
  resetHarness();
  resetSaid();
});
afterEach(teardownHarness);

const products = (n: number) => Array.from({ length: n }, (_unused, at) => product(String.fromCharCode(65 + at)));
const WIDGET = {
  id: 'w-1',
  title: 'Bunları da sevebilirsiniz',
  subtitle: 'Sizin için seçtik',
  titleStyles: { enabled: true, fontSize: 20, fontWeight: 'bold', color: 'var(--selwise-brand, #111111)', textAlign: 'center', marginBottom: 8 },
  subtitleStyles: { enabled: true, color: '#777777' },
  containerStyles: { backgroundColor: '#fafafa', padding: '10px', borderRadius: 12, margin: '0px' },
  dotStyles: { enabled: true, style: 'bar', size: 8, color: '#cccccc', activeColor: '#111111', gap: 4, offset: 6 },
  slidesPerViewMobile: 2,
  slideGap: 10,
  ctaMode: 'add_to_cart',
};

async function drawn(widget: Record<string, unknown>, list = products(5), card: Record<string, unknown> | null = null, host = recordingHost()) {
  const client = await startClient();
  const renderer = await mount(client, host.host, h(RecommendationStrip, { strip: strip(widget, list, card) }));
  return { client, renderer, ...host };
}

describe('the default card', () => {
  it('is handed the brand font the card with a tree is: both read one environment', async () => {
    const { renderer } = await drawn(WIDGET, products(2), null, recordingHost({ fontFamily: { inter: 'Inter-Regular' } }));

    const cards = renderer.root.findAllByType(DefaultCard);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.props.env.card.rootText).toMatchObject({ fontFamily: 'Inter-Regular' });
      // No tree to walk: the stand-in root, but the same selection, cart and context as a tree's.
      expect(card.props.env.card.tree.root).toMatchObject({ id: 'root', type: 'root' });
    }
  });
});

describe('the frame', () => {
  it('draws the heading and subtitle with the merchant’s styles, the brand resolved, inside the container', async () => {
    const { renderer } = await drawn(WIDGET);
    const heading = renderer.root.findAllByType(el('Text')).find((node) => textOf(node) === WIDGET.title)!;
    expect(flat(heading.props.style)).toMatchObject({ fontSize: 20, fontWeight: '700', color: '#d3145a', textAlign: 'center', marginBottom: 8 });
    const sub = renderer.root.findAllByType(el('Text')).find((node) => textOf(node) === WIDGET.subtitle)!;
    expect(flat(sub.props.style)).toMatchObject({ color: '#777777', fontSize: 14 });
    const container = renderer.root.findAllByType(el('View'))[0]!;
    expect(flat(container.props.style)).toMatchObject({ backgroundColor: '#fafafa', padding: 10, borderRadius: 12 });
  });

  it('draws the arm’s override: its subtitle, its display type and its container styles', async () => {
    const arm = {
      ...WIDGET,
      subtitle: 'Kol B alt başlığı',
      displayType: 'list',
      containerStyles: { ...WIDGET.containerStyles, backgroundColor: '#00ff00' },
    };
    const { renderer } = await drawn(arm);
    expect(texts(renderer)).toContain('Kol B alt başlığı');
    expect(flat(renderer.root.findAllByType(el('View'))[0]!.props.style)).toMatchObject({ backgroundColor: '#00ff00' });
    expect(renderer.root.findAllByType(el('FlatList'))).toHaveLength(0);
  });
});

describe('the slider', () => {
  it('measures a view that fills its container, whatever the container does with its children', async () => {
    // `margin: 0 auto` (the web default) centres the container; the measured view must not shrink with its content.
    const centred = { ...WIDGET, displayType: 'slider', containerStyles: { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' } };
    const { renderer } = await drawn(centred);
    const container = renderer.root.findAllByType(el('View'))[0]!;
    expect(flat(container.props.style)).toMatchObject({ alignSelf: 'center', width: '100%', maxWidth: 1200 });
    const measured = renderer.root.findAll((node) => (node.type as unknown) === 'View' && typeof node.props.onLayout === 'function')[0]!;
    expect(flat(measured.props.style)).toMatchObject({ alignSelf: 'stretch', width: '100%' });
  });


  it('lays slidesPerViewMobile cards across the width with the gap between, and snaps by page', async () => {
    const { renderer } = await drawn({ ...WIDGET, displayType: 'slider' });
    const list = renderer.root.findByType(el('FlatList'));
    expect(list.props.horizontal).toBe(true);
    // Not yet measured: the window’s own width (390), two cards, a 10px gap.
    const slide = Math.floor((390 - 10) / 2);
    expect(list.props.snapToInterval).toBe(2 * (slide + 10));
    const slides = renderer.root.findAll((node) => (node.type as unknown) === 'View' && flat(node.props.style)['width'] === slide);
    expect(slides.length).toBeGreaterThanOrEqual(5);
  });

  it('draws one dot per page in the merchant’s shape and colours, the first active, and turns to a tapped one', async () => {
    const { renderer } = await drawn({ ...WIDGET, displayType: 'slider' });
    const dots = renderer.root.findByProps({ testID: 'selwise-dots' });
    const row = dots.findAllByType(el('Pressable'));
    expect(row).toHaveLength(3);
    expect(flat(row[0]!.props.style)).toMatchObject({ width: 16, height: 8, borderRadius: 4, backgroundColor: '#111111' });
    expect(flat(row[1]!.props.style)).toMatchObject({ backgroundColor: '#cccccc' });
    controls.scrolls.length = 0;
    await press(row[2]!);
    expect(controls.scrolls).toEqual([2 * 2 * (Math.floor((390 - 10) / 2) + 10)]);
    expect(flat(renderer.root.findByProps({ testID: 'selwise-dots' }).findAllByType(el('Pressable'))[2]!.props.style)).toMatchObject({ backgroundColor: '#111111' });
  });

  it('draws no dots a strip did not ask for', async () => {
    const { renderer } = await drawn({ ...WIDGET, dotStyles: { enabled: false } });
    expect(renderer.root.findAllByProps({ testID: 'selwise-dots' })).toHaveLength(0);
  });

  it('turns a page on its own while the strip is on screen, stops at the end, and wraps with loop', async () => {
    jest.useFakeTimers();
    const { renderer } = await drawn({ ...WIDGET, autoplay: true, autoplaySpeed: 1000, loop: false });
    const pageOffset = 2 * (Math.floor((390 - 10) / 2) + 10);
    controls.scrolls.length = 0;
    await act(async () => {
      jest.advanceTimersByTime(1500); // the strip has been on screen for its second
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    // Three pages: it goes to the second, the third, then stays.
    expect(controls.scrolls.slice(0, 2)).toEqual([pageOffset, 2 * pageOffset]);
    expect(controls.scrolls.every((offset) => offset === 2 * pageOffset || offset === pageOffset)).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('wraps back to the first page with loop', async () => {
    jest.useFakeTimers();
    await drawn({ ...WIDGET, autoplay: true, autoplaySpeed: 1000, loop: true });
    controls.scrolls.length = 0;
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(controls.scrolls).toContain(0);
  });

  it('does not turn while a finger is on it (pause on touch)', async () => {
    jest.useFakeTimers();
    const { renderer } = await drawn({ ...WIDGET, autoplay: true, autoplaySpeed: 1000 });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    controls.scrolls.length = 0;
    const list = renderer.root.findByType(el('FlatList'));
    await act(async () => {
      (list.props as { onScrollBeginDrag: () => void }).onScrollBeginDrag();
      jest.advanceTimersByTime(4000);
    });
    expect(controls.scrolls).toEqual([]);
  });

  it('counts the cards that come on screen once the strip has dwelled, as before', async () => {
    jest.useFakeTimers();
    const { renderer, client } = await drawn({ ...WIDGET, displayType: 'slider' });
    await act(async () => {
      (renderer.root.findByType(el('FlatList')).props as { onViewableItemsChanged: (info: unknown) => void }).onViewableItemsChanged({
        viewableItems: [{ item: product('A') }],
      });
      jest.advanceTimersByTime(1500);
    });
    await client.flush();
    expect(eventsOf('widget_impression')[0]).toMatchObject({ entityId: 'w-1', metadata: { productCount: 1, impressionBasis: 'visible' } });
  });
});

describe('grid and list', () => {
  it('fills rows of the phone’s column count, every card one width', async () => {
    const { renderer } = await drawn({ ...WIDGET, displayType: 'grid', slidesPerViewMobile: 3, slideGap: 10 });
    const width = Math.floor((390 - 20) / 3);
    const cells = renderer.root.findAll((node) => (node.type as unknown) === 'View' && flat(node.props.style)['width'] === width);
    expect(cells).toHaveLength(5);
    const rows = renderer.root.findAll((node) => (node.type as unknown) === 'View' && flat(node.props.style)['flexDirection'] === 'row' && flat(node.props.style)['gap'] === 10);
    expect(rows).toHaveLength(2);
    expect(renderer.root.findAllByType(el('FlatList'))).toHaveLength(0);
  });

  it('draws a list as full-width cards, one under another, a gap apart', async () => {
    const { renderer } = await drawn({ ...WIDGET, displayType: 'list', slideGap: 14 });
    expect(texts(renderer).filter((text) => text.startsWith('Ürün '))).toHaveLength(5);
    expect(renderer.root.findAll((node) => (node.type as unknown) === 'View' && flat(node.props.style)['gap'] === 14)).not.toHaveLength(0);
  });

  it('counts what a grid shows once the strip is on screen', async () => {
    jest.useFakeTimers();
    const { client } = await drawn({ ...WIDGET, displayType: 'grid' });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await client.flush();
    expect(eventsOf('widget_impression')[0]).toMatchObject({ metadata: { productCount: 5, impressionBasis: 'visible' } });
  });

  it('draws a masonry strip, which a phone does not have, as the storefront’s default grid', async () => {
    const { renderer } = await drawn({ ...WIDGET, displayType: 'masonry' });
    expect(renderer.root.findAllByType(el('FlatList'))).toHaveLength(0);
    expect(texts(renderer).filter((text) => text.startsWith('Ürün '))).toHaveLength(5);
  });
});

const ROLE = (key: string, tr: string, slotTr?: string) => ({
  role: key,
  relation: 'complement',
  label: { tr, en: key },
  slot: slotTr ? key : null,
  slotLabel: slotTr ? { tr: slotTr, en: key } : null,
});
const OUTFIT = [
  product('TOP', { price: 250, complement: ROLE('top', 'Tişört', 'Üst giyim') }),
  product('JEAN', { price: 400, complement: ROLE('bottom', 'Jean', 'Alt giyim') }),
  product('SHOE', { price: 750, complement: ROLE('footwear', 'Spor ayakkabı', 'Ayakkabı') }),
];

describe('role tabs', () => {
  it('draws a tab per role from the payload and the products of the chosen one', async () => {
    const { renderer } = await drawn({ ...WIDGET, displayType: 'role_tabs' }, [...OUTFIT, product('JEAN2', { complement: ROLE('bottom', 'Jean') })]);
    const tabs = renderer.root.findAllByProps({ accessibilityRole: 'tab' });
    expect(tabs.map(textOf)).toEqual(['Tişört', 'Jean', 'Spor ayakkabı']);
    expect(texts(renderer).filter((text) => text.startsWith('Ürün '))).toEqual(['Ürün TOP']);
    await press(tabs[1]!);
    expect(texts(renderer).filter((text) => text.startsWith('Ürün '))).toEqual(['Ürün JEAN', 'Ürün JEAN2']);
  });

  it('draws the plain grid for a strip with no roles, never an empty view', async () => {
    const { renderer } = await drawn({ ...WIDGET, displayType: 'role_tabs' });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'tab' })).toHaveLength(0);
    expect(texts(renderer).filter((text) => text.startsWith('Ürün '))).toHaveLength(5);
  });
});

describe('a look', () => {
  const LOOK = {
    caption: 'slot',
    hiddenSlots: [],
    showTotal: true,
    showAddAll: true,
    totalLabel: '',
    addAllLabel: '',
    totalAlign: 'start',
    totalSize: 'md',
    totalWeight: 'semibold',
    totalLayout: 'inline',
    totalColor: '',
    totalBackground: '',
    addAllAlign: 'start',
    addAllSize: 'md',
    addAllShape: 'rounded',
    addAllVariant: 'solid',
    addAllColor: '',
    addAllTextColor: '',
  };
  const look = (settings: Record<string, unknown> = {}) => ({ ...WIDGET, displayType: 'look', look: { ...LOOK, ...settings } });

  it('captions each card with its slot, or its role, or nothing', async () => {
    expect(texts((await drawn(look(), OUTFIT)).renderer)).toEqual(expect.arrayContaining(['Üst giyim', 'Alt giyim', 'Ayakkabı']));
    expect(texts((await drawn(look({ caption: 'role' }), OUTFIT)).renderer)).toEqual(expect.arrayContaining(['Tişört', 'Jean', 'Spor ayakkabı']));
    expect(texts((await drawn(look({ caption: 'none' }), OUTFIT)).renderer)).not.toContain('Üst giyim');
  });

  it('prints the total in the shopper’s language, inline with a colon, in the merchant’s design', async () => {
    const { renderer } = await drawn(look({ totalSize: 'lg', totalWeight: 'bold', totalColor: '#ff0000', totalBackground: '#eeeeee', totalAlign: 'center' }), OUTFIT);
    const total = renderer.root.findByProps({ testID: 'selwise-look-total' });
    expect(textOf(total)).toContain('Kombin toplamı:');
    expect(textOf(total)).toMatch(/1[.,]400/);
    const label = total.findAllByType(el('Text'))[0]!;
    expect(flat(label.props.style)).toMatchObject({ fontSize: 20, fontWeight: '700', color: '#ff0000' });
    expect(flat(total.props.style)).toMatchObject({ backgroundColor: '#eeeeee', alignSelf: 'center' });
  });

  it('prints a stacked total with no colon and a split one across the width', async () => {
    const stacked = await drawn(look({ totalLayout: 'stacked', totalLabel: 'Toplam' }), OUTFIT);
    const stackedTotal = stacked.renderer.root.findByProps({ testID: 'selwise-look-total' });
    expect(textOf(stackedTotal)).toContain('Toplam');
    expect(textOf(stackedTotal)).not.toContain('Toplam:');
    expect(flat(stackedTotal.props.style)['flexDirection']).toBe('column');
    const split = await drawn(look({ totalLayout: 'split' }), OUTFIT);
    expect(flat(split.renderer.root.findByProps({ testID: 'selwise-look-total' }).props.style)).toMatchObject({ justifyContent: 'space-between', alignSelf: 'stretch' });
  });

  it('draws no total for a card with no price, a second currency, or when the merchant turned it off', async () => {
    const unpriced = [...OUTFIT.slice(0, 2), product('X', { price: 0, complement: ROLE('footwear', 'Ayakkabı') })];
    expect((await drawn(look(), unpriced)).renderer.root.findAllByProps({ testID: 'selwise-look-total' })).toHaveLength(0);
    const mixed = [...OUTFIT.slice(0, 2), product('X', { currency: 'USD', complement: ROLE('footwear', 'Ayakkabı') })];
    expect((await drawn(look(), mixed)).renderer.root.findAllByProps({ testID: 'selwise-look-total' })).toHaveLength(0);
    expect((await drawn(look({ showTotal: false }), OUTFIT)).renderer.root.findAllByProps({ testID: 'selwise-look-total' })).toHaveLength(0);
  });

  it('draws the add-all button as designed: its words, variant, shape, size, alignment and colours', async () => {
    const { renderer } = await drawn(
      look({ addAllLabel: 'Kombini al', addAllVariant: 'outline', addAllShape: 'pill', addAllSize: 'lg', addAllAlign: 'stretch', addAllColor: '#0000ff', addAllTextColor: '#00aa00' }),
      OUTFIT
    );
    const button = renderer.root.findByProps({ testID: 'selwise-look-add-all' });
    expect(textOf(button)).toBe('Kombini al');
    expect(flat(button.props.style)).toMatchObject({ borderRadius: 999, borderColor: '#0000ff', backgroundColor: 'transparent', alignSelf: 'stretch', paddingVertical: 14 });
    expect(flat(button.findByType(el('Text')).props.style)).toMatchObject({ color: '#00aa00', fontSize: 15 });
    const solid = (await drawn(look(), OUTFIT)).renderer.root.findByProps({ testID: 'selwise-look-add-all' });
    expect(flat(solid.props.style)).toMatchObject({ backgroundColor: '#d3145a', borderRadius: 8 });
    expect(textOf(solid)).toBe('Hepsini sepete ekle');
  });

  it('draws no add-all button with the switch off, with one card, or where the host has no basket', async () => {
    expect((await drawn(look({ showAddAll: false }), OUTFIT)).renderer.root.findAllByProps({ testID: 'selwise-look-add-all' })).toHaveLength(0);
    expect((await drawn(look(), [OUTFIT[0]!])).renderer.root.findAllByProps({ testID: 'selwise-look-add-all' })).toHaveLength(0);
    const bare = recordingHost();
    delete (bare.host as { addToCart?: unknown }).addToCart;
    expect((await drawn(look(), OUTFIT, null, bare)).renderer.root.findAllByProps({ testID: 'selwise-look-add-all' })).toHaveLength(0);
  });

  it('adds every card through the host in order, reports the press, and says what it came to', async () => {
    const { renderer, added, client } = await drawn(look(), OUTFIT);
    await press(renderer.root.findByProps({ testID: 'selwise-look-add-all' }));
    await client.flush();
    expect(added.map((item) => [item.code, item.source, item.surfaceId])).toEqual([
      ['TOP', 'recommendation', 'w-1'],
      ['JEAN', 'recommendation', 'w-1'],
      ['SHOE', 'recommendation', 'w-1'],
    ]);
    expect(texts(renderer)).toContain('3/3 ürün sepete eklendi');
    expect(eventsOf('cart_add_all')[0]).toMatchObject({ entityId: 'w-1', metadata: { requested: 3, added: 3, failed: 0, needsSize: 0 } });
    // Each line is an add of its own, credited to the strip.
    expect(eventsOf('add_to_cart').map((event) => event['productItemCode'])).toEqual(['TOP', 'JEAN', 'SHOE']);
  });

  it('never guesses a size: a product that needs one is reported, the rest are added', async () => {
    const sizedShoe = { ...OUTFIT[2]!, variants: [{ variantCode: 'S-40', size: '40', inStock: true }, { variantCode: 'S-41', size: '41', inStock: true }] };
    const card = { variantSelection: 'modal' };
    const { renderer, added } = await drawn(look(), [OUTFIT[0]!, OUTFIT[1]!, sizedShoe], card);
    await press(renderer.root.findByProps({ testID: 'selwise-look-add-all' }));
    expect(added.map((item) => item.code)).toEqual(['TOP', 'JEAN']);
    expect(texts(renderer)).toContain('2/3 ürün sepete eklendi · 1 ürün için beden seçin');
  });

  it('counts a refused add as failed', async () => {
    const refusing = recordingHost(undefined, { success: false });
    const { renderer } = await drawn(look(), OUTFIT, null, refusing);
    await press(renderer.root.findByProps({ testID: 'selwise-look-add-all' }));
    expect(texts(renderer)).toContain('0/3 ürün sepete eklendi · 3 ürün eklenemedi');
  });

  it('draws the plain grid for a strip that is not a look', async () => {
    const { renderer } = await drawn(look(), products(3));
    expect(renderer.root.findAllByProps({ testID: 'selwise-look-add-all' })).toHaveLength(0);
  });
});

describe('the strip’s frequency cap', () => {
  it('spends an allowance when the strip is seen, and a capped strip is not returned the next time', async () => {
    jest.useFakeTimers();
    const client = await startClient();
    const widget = { ...WIDGET, displayType: 'grid', triggerConfig: { frequencyCap: { perSession: 1 } } };
    expect(client.recommendationCapBlock('w-1', { perSession: 1 })).toBeNull();
    const { host } = recordingHost();
    await mount(client, host, h(RecommendationStrip, { strip: { ...strip(widget, products(2)), frequencyCap: { perSession: 1 } } }));
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });
    expect(client.recommendationCapBlock('w-1', { perSession: 1 })).toBe('perSession');
  });
});

describe('what is not drawn', () => {
  it('draws nothing for a strip with no products', async () => {
    const { renderer } = await drawn(WIDGET, []);
    expect(renderer.toJSON()).toBeNull();
  });

  it('opens a card through the app’s router with the product’s page', async () => {
    const { renderer, navigated } = await drawn({ ...WIDGET, displayType: 'grid' });
    await press(pressableContaining(renderer, 'Ürün A'));
    expect(navigated[0]).toMatchObject({ url: '/p/A', source: 'recommendation', entityId: 'w-1' });
  });
});


describe('what a re-render redraws', () => {
  const node = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, style: {}, props: {}, ...extra });
  const card = cardTree([
    node('media', 'media', { children: [node('img', 'image', { props: { source: 'primary' } })] }),
    node('add', 'button', { props: { action: 'add_to_cart', label: 'Sepete ekle' } }),
  ]);

  it('leaves the cards alone when only the strip’s toast changes', async () => {
    const images: string[] = [];
    const host = recordingHost({
      renderImage: ({ uri }) => {
        images.push(uri);
        return h('HostImage', { uri });
      },
    });
    const widget = { ...WIDGET, displayType: 'grid', addToCartConfig: { afterAdd: 'toast' } };
    const list = [product('A', { imageUrl: 'https://img.test/a.jpg' }), product('B', { imageUrl: 'https://img.test/b.jpg' })];
    const { renderer } = await drawn(widget, list, card, host);
    expect(images.length).toBeGreaterThanOrEqual(2);

    const before = images.length;
    await press(pressableContaining(renderer, 'Sepete ekle'));
    // The toast is on screen: the strip re-rendered, the cards did not.
    expect(renderer.root.findAllByProps({ testID: 'selwise-add-toast' })).toHaveLength(1);
    expect(images.length).toBe(before);
  });

  it('keeps the list’s item renderer across a re-render of the slider', async () => {
    const { renderer } = await drawn({ ...WIDGET, displayType: 'slider' });
    const first = renderer.root.findByType(el('FlatList')).props.renderItem;
    const dots = renderer.root.findByProps({ testID: 'selwise-dots' }).findAllByType(el('Pressable'));
    await press(dots[1]!);
    expect(renderer.root.findByType(el('FlatList')).props.renderItem).toBe(first);
  });
});
