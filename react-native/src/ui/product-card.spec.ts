import { createElement as h } from 'react';
import { act } from 'react-test-renderer';
import type { SelwiseHost } from '../react/host.js';
import { RecommendationStrip } from './RecommendationStrip.js';
import { resetSaid } from './host-hooks.js';
import {
  cardTree,
  el,
  eventsOf,
  flat,
  mount,
  press,
  pressableContaining,
  pressableWith,
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
 * The product card the merchant designs, drawn natively: every node type, the
 * add-to-cart through the host, the colour row, the option sheet, and the card
 * the strip falls back to when there is no tree.
 */

beforeEach(() => {
  resetHarness();
  resetSaid();
});
afterEach(teardownHarness);

const WIDGET = { id: 'w-1', title: 'Önerilenler', titleStyles: { enabled: true }, slidesPerViewMobile: 2, slideGap: 8, ctaMode: 'add_to_cart', displayType: 'grid' };

const node = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, style: {}, props: {}, ...extra });

/** A realistic tile: photo with a discount badge over it, title, prices, stars, shades, a basket button. */
const TILE = [
  node('media', 'media', {
    style: { aspectRatio: '3 / 4', borderRadius: '8px' },
    children: [
      node('img', 'image', { props: { source: 'primary', linkToProduct: true } }),
      node('sale', 'badge', {
        props: { source: 'discount' },
        style: { insetTop: '6px', insetLeft: '6px', background: 'var(--selwise-sale, #cc0000)', color: '#ffffff', padding: '2px 6px' },
      }),
    ],
  }),
  node('title', 'text', { props: { field: 'title', linkToProduct: true }, style: { fontSize: '13px', fontWeight: '600', maxLines: 2 } }),
  node('prices', 'stack', {
    style: { flexDirection: 'row', gap: '6px', alignItems: 'center' },
    children: [
      node('price', 'price', { props: { variant: 'current' }, style: { fontWeight: '700' } }),
      node('old', 'price', { props: { variant: 'original' }, style: { textDecoration: 'line-through', color: '#999999' } }),
    ],
  }),
  node('stars', 'rating', { props: { max: 5, showCount: true } }),
  node('shades', 'swatches', { props: { max: 6, fill: 'auto', size: 'md', shape: 'circle' }, style: { gap: '6px' } }),
  node('add', 'button', {
    props: { action: 'add_to_cart', label: 'Sepete ekle', labelLoading: 'Ekleniyor…', labelSuccess: 'Tamam', labelError: 'Olmadı' },
    style: { background: 'var(--selwise-brand, #111111)', color: '#ffffff', padding: '8px 12px', borderRadius: '6px' },
  }),
];

const SALE = product('SALE', {
  price: 80,
  originalPrice: 100,
  rating: 4,
  reviewCount: 12,
  imageUrl: 'https://img.test/sale.jpg',
  swatches: [
    { itemCode: 'SALE', color: 'Kırmızı', imageUrl: 'https://img.test/sale-red.jpg', url: '/p/SALE' },
    { itemCode: 'SALE-B', color: 'Mavi', imageUrl: 'https://img.test/sale-blue.jpg', url: '/p/SALE-B' },
    { itemCode: 'SALE-G', color: 'Zebra', imageUrl: 'https://img.test/sale-zebra.jpg', url: '/p/SALE-G' },
  ],
});

async function drawn(
  card: Record<string, unknown> | null,
  list = [SALE],
  widget: Record<string, unknown> = WIDGET,
  host = recordingHost()
) {
  const client = await startClient();
  const renderer = await mount(client, host.host, h(RecommendationStrip, { strip: strip(widget, list, card) }));
  return { client, renderer, ...host };
}

describe('the card tree’s nodes', () => {
  it('names every element it draws by the id the designer gave it, so a click can be traced back to its layer', async () => {
    const { renderer } = await drawn(cardTree(TILE));
    const ids = (testId: string) => renderer.root.findAll((node_) => node_.props?.testID === testId);
    for (const id of ['media', 'img', 'sale', 'title', 'prices', 'price', 'old', 'stars', 'shades', 'add']) {
      expect({ id, drawn: ids(`selwise-node:${id}`).length > 0 }).toEqual({ id, drawn: true });
    }
    // the title text and the basket button are the ones carrying their own id
    expect(textOf(ids('selwise-node:title').find((node_) => typeof node_.type === 'string')!)).toBe('Ürün SALE');
    const add = ids('selwise-node:add').find((node_) => typeof node_.type === 'string')!;
    expect(add.findAll((node_) => (node_.type as unknown) === 'Pressable' && node_.props.accessibilityRole === 'button').length).toBeGreaterThan(0);
  });

  it('draws the media area with its image, an overlay badge pinned to the corner, and the discount as the storefront computes it', async () => {
    const { renderer } = await drawn(cardTree(TILE));
    const images = renderer.root.findAllByType(el('Image'));
    expect(images[0]!.props.source).toEqual({ uri: 'https://img.test/sale.jpg' });
    const badge = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === '-20%')!;
    expect(badge).toBeDefined();
    const badgeBox = badge.parent!;
    expect(flat(badgeBox.props.style)).toMatchObject({ position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, backgroundColor: '#cc0000' });
    const media = renderer.root.findAll((node_) => (node_.type as unknown) === 'View' && flat(node_.props.style)['aspectRatio'] === 0.75)[0]!;
    expect(flat(media.props.style)).toMatchObject({ overflow: 'hidden', borderRadius: 8 });
  });

  it('prints the title clamped to its lines, and prices in the channel’s currency and the shopper’s language, never a typed symbol', async () => {
    const { renderer } = await drawn(cardTree(TILE));
    const title = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === 'Ürün SALE')!;
    expect(title.props.numberOfLines).toBe(2);
    expect(flat(title.props.style)).toMatchObject({ fontSize: 13, fontWeight: '600', color: '#222222' });
    const all = texts(renderer);
    const expectedCurrent = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TRY' }).format(80);
    const expectedOriginal = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TRY' }).format(100);
    expect(all).toContain(expectedCurrent);
    expect(all).toContain(expectedOriginal);
    const original = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === expectedOriginal)!;
    expect(flat(original.props.style)).toMatchObject({ textDecorationLine: 'line-through', color: '#999999' });
  });

  it('draws a price on one line in a box that keeps its text’s width, in a row that wraps whole prices', async () => {
    const { renderer } = await drawn(cardTree(TILE));
    const expectedCurrent = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TRY' }).format(80);
    const current = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === expectedCurrent)!;
    expect(current.props.numberOfLines).toBe(1);
    const priceBox = renderer.root.findAll((node_) => node_.props?.testID === 'selwise-node:price' && (node_.type as unknown) === 'View')[0]!;
    expect(flat(priceBox.props.style)).toMatchObject({ flexShrink: 0 });
    const row = renderer.root.findAll((node_) => node_.props?.testID === 'selwise-node:prices' && (node_.type as unknown) === 'View')[0]!;
    expect(flat(row.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', gap: 6 });
  });

  it('keeps a button’s label on one line unless the merchant chose its lines', async () => {
    const { renderer } = await drawn(cardTree(TILE));
    const label = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === 'Sepete ekle')!;
    expect(label.props.numberOfLines).toBe(1);
    const two = cardTree([node('add', 'button', { props: { action: 'add_to_cart', label: 'Sepete ekle' }, style: { maxLines: 2 } })]);
    const { renderer: wide } = await drawn(two);
    expect(wide.root.findAllByType(el('Text')).find((node_) => textOf(node_) === 'Sepete ekle')!.props.numberOfLines).toBe(2);
  });

  it('draws no original price on a full-price product, and no node whose value is empty', async () => {
    const { renderer } = await drawn(cardTree(TILE), [product('FULL', { price: 100 })]);
    const full = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TRY' }).format(100);
    expect(texts(renderer).filter((text) => text === full)).toHaveLength(1);
    expect(texts(renderer).some((text) => text.startsWith('-'))).toBe(false);
  });

  it('draws the stars and the review count', async () => {
    const { renderer } = await drawn(cardTree(TILE));
    expect(texts(renderer).find((text) => text.startsWith('★'))).toBe('★★★★☆ (12)');
  });

  it('draws price readings: saving and discount rate', async () => {
    const tree = cardTree([node('s', 'price', { props: { variant: 'saving' } }), node('d', 'price', { props: { variant: 'discount' } })]);
    const { renderer } = await drawn(tree);
    const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TRY' }).format(20);
    expect(texts(renderer)).toEqual(expect.arrayContaining([money, '-20%']));
  });

  it('draws a text node’s prefix, suffix and fallback, and a feed attribute', async () => {
    const tree = cardTree([
      node('brand', 'text', { props: { field: 'brand', prefix: 'Marka: ', fallback: 'Markasız' } }),
      node('attr', 'text', { props: { field: 'attr.material', suffix: ' kumaş' } }),
    ]);
    const { renderer } = await drawn(tree, [product('A', { attributes: { material: 'Pamuk' } })]);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Marka: Markasız', 'Pamuk kumaş']));
  });

  it('hides a node whose condition fails, and one the designer switched off', async () => {
    const tree = cardTree([
      node('sale', 'badge', { props: { source: 'static', label: 'İNDİRİM' }, visibleWhen: [{ field: 'isOnSale', op: 'isTrue' }] }),
      node('off', 'badge', { props: { source: 'static', label: 'GİZLİ' }, hidden: true }),
      node('stock', 'badge', { props: { source: 'static', label: 'TÜKENDİ' }, visibleWhen: [{ field: 'isOutOfStock', op: 'isTrue' }] }),
    ]);
    const onSale = await drawn(tree, [SALE]);
    expect(texts(onSale.renderer)).toContain('İNDİRİM');
    expect(texts(onSale.renderer)).not.toContain('GİZLİ');
    expect(texts(onSale.renderer)).not.toContain('TÜKENDİ');
    const out = await drawn(tree, [product('O', { inStock: false })]);
    expect(texts(out.renderer)).toContain('TÜKENDİ');
    expect(texts(out.renderer)).not.toContain('İNDİRİM');
  });

  it('draws the divider and the spacer, and lays children in the stack’s direction with its gap', async () => {
    const tree = cardTree([
      node('row', 'stack', { style: { flexDirection: 'row', gap: '12px', justifyContent: 'space-between' }, children: [node('a', 'text', { props: { field: 'title' } }), node('b', 'text', { props: { field: 'brand', fallback: 'X' } })] }),
      node('line', 'divider'),
      node('gap', 'spacer', { style: { height: '14px' } }),
    ]);
    const { renderer } = await drawn(tree);
    const row = renderer.root.findAll((node_) => (node_.type as unknown) === 'View' && flat(node_.props.style)['gap'] === 12)[0]!;
    expect(flat(row.props.style)).toMatchObject({ gap: 12, justifyContent: 'space-between' });
    expect(renderer.root.findAll((node_) => (node_.type as unknown) === 'View' && flat(node_.props.style)['height'] === 14)).toHaveLength(1);
  });

  it('applies the tablet then the phone rules over the node’s own', async () => {
    const tree = cardTree([node('t', 'text', { props: { field: 'title' }, style: { fontSize: '20px' }, responsive: { tablet: { fontSize: '16px' }, mobile: { fontSize: '12px' } } })]);
    const { renderer } = await drawn(tree);
    const title = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === 'Ürün SALE')!;
    expect(flat(title.props.style)['fontSize']).toBe(12);
  });

  it('draws in the app’s font for the brand’s, and the brand’s text colour', async () => {
    const { renderer } = await drawn(cardTree([node('t', 'text', { props: { field: 'title' } })]), [SALE], WIDGET, recordingHost({ fontFamily: { inter: 'Inter-Regular' } }));
    const title = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === 'Ürün SALE')!;
    expect(flat(title.props.style)).toMatchObject({ fontFamily: 'Inter-Regular', color: '#222222' });
  });

  it('does not draw what a phone cannot: html markup, a second photo, and a heart the app has no list for', async () => {
    const tree = cardTree([
      node('html', 'html', { props: { content: '<b>merchant markup</b>' } }),
      node('second', 'image', { props: { source: 'secondary' } }),
      node('heart', 'button', { props: { action: 'wishlist', label: 'Favori' } }),
      node('title', 'text', { props: { field: 'title' } }),
    ]);
    const { renderer } = await drawn(tree, [product('A', { secondaryImageUrl: 'https://img.test/second.jpg', imageUrl: 'https://img.test/a.jpg' })]);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Ürün A']));
    expect(texts(renderer)).not.toContain('merchant markup');
    expect(texts(renderer)).not.toContain('Favori');
    expect(renderer.root.findAllByType(el('Image'))).toHaveLength(0);
  });
});

describe('the favourite heart', () => {
  const HEART = [
    node('img', 'image', { props: { source: 'primary' } }),
    node('heart', 'button', { props: { action: 'wishlist', iconOnly: true } }),
  ];
  const heartOf = (renderer: Awaited<ReturnType<typeof drawn>>['renderer']) =>
    renderer.root.findAll(
      (node_) => (node_.type as unknown) === 'Pressable' && ['Favorilere ekle', 'Add to wishlist'].includes(String(node_.props.accessibilityLabel))
    )[0]!;

  const withList = (extra: Partial<SelwiseHost> = {}) => {
    const asked: Array<{ code: string; wished: boolean; source: string; surfaceId?: string }> = [];
    const recorded = recordingHost({
      toggleWishlist: ({ product: asked_, wished, source, surfaceId }) => {
        asked.push({ code: asked_.itemCode, wished, source, ...(surfaceId ? { surfaceId } : {}) });
        return { success: true };
      },
      ...extra,
    });
    return { asked, recorded };
  };

  it('is drawn when the app hands over its favourites, empty first, and asks the app to add on a press', async () => {
    const { asked, recorded } = withList();
    const { renderer } = await drawn(cardTree(HEART), [product('A')], WIDGET, recorded);
    expect(texts(renderer)).toContain('\u2661');
    await press(heartOf(renderer));
    expect(asked).toEqual([{ code: 'A', wished: true, source: 'recommendation', surfaceId: 'w-1' }]);
    expect(texts(renderer)).toContain('\u2665');
    await press(heartOf(renderer));
    expect(asked[1]).toMatchObject({ code: 'A', wished: false });
    expect(texts(renderer)).toContain('\u2661');
  });

  it('shows what the app already has as a favourite, and follows its list when it changes', async () => {
    const have = new Set<string>(['A']);
    let notify: () => void = () => undefined;
    const { recorded } = withList({
      isWishlisted: (code) => have.has(code),
      subscribeWishlist: (listener) => {
        notify = listener;
        return () => undefined;
      },
    });
    const { renderer } = await drawn(cardTree(HEART), [product('A'), product('B')], WIDGET, recorded);
    expect(texts(renderer).filter((text) => text === '\u2665')).toHaveLength(1);
    have.add('B');
    await act(async () => notify());
    expect(texts(renderer).filter((text) => text === '\u2665')).toHaveLength(2);
  });

  it('puts the heart back when the app refuses (a guest sent to log in), and reports nothing', async () => {
    const { recorded } = withList({ toggleWishlist: () => ({ success: false }) });
    const { renderer } = await drawn(cardTree(HEART), [product('A')], WIDGET, recorded);
    await press(heartOf(renderer));
    expect(texts(renderer)).toContain('\u2661');
    expect(eventsOf('wishlist')).toHaveLength(0);
  });

  it('reports a `wishlist` event for an add, with the strip beside it, and none for a removal', async () => {
    const { recorded } = withList();
    const { client, renderer } = await drawn(cardTree(HEART), [product('A')], WIDGET, recorded);
    await press(heartOf(renderer));
    await press(heartOf(renderer));
    await client.flush();
    const events = eventsOf('wishlist');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entityType: 'product', entityId: 'A', productItemCode: 'A', metadata: { widgetId: 'w-1' } });
  });

  it('draws the words beside the heart unless the node is icon only, in the shopper’s language', async () => {
    const { recorded } = withList();
    const tree = cardTree([node('heart', 'button', { props: { action: 'wishlist', label: 'Favori' } })]);
    const { renderer } = await drawn(tree, [product('A')], WIDGET, recorded);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['\u2661', 'Favori']));
  });
});

describe('the colour row', () => {
  const swatchRow = (renderer: Awaited<ReturnType<typeof drawn>>['renderer']) =>
    renderer.root.findAllByProps({ accessibilityRole: 'button' }).filter((node_) => ['Kırmızı', 'Mavi', 'Zebra'].includes(String(node_.props.accessibilityLabel)));

  it('paints a known shade, and falls back to the photo for one the palette does not know', async () => {
    const { renderer } = await drawn(cardTree(TILE));
    const chips = swatchRow(renderer);
    expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual(['Kırmızı', 'Mavi', 'Zebra']);
    const fill = (chip: (typeof chips)[number]) => chip.findAll((node_) => (node_.type as unknown) === 'View' && typeof flat(node_.props.style)['borderRadius'] === 'number' && flat(node_.props.style)['width'] === 18)[0]!;
    expect(flat(fill(chips[0]!).props.style)['backgroundColor']).toMatch(/^#/);
    expect(fill(chips[2]!).findAllByType(el('Image'))).toHaveLength(1);
    // The product’s own shade is the one ringed.
    expect(chips[0]!.props.accessibilityState).toEqual({ selected: true });
    expect(chips[1]!.props.accessibilityState).toEqual({ selected: false });
  });

  it('shows another shade on the card when it is tapped: its photo, its page; tapping it again goes back', async () => {
    const { renderer, navigated, client } = await drawn(cardTree(TILE));
    await press(swatchRow(renderer)[1]!);
    expect(renderer.root.findAllByType(el('Image'))[0]!.props.source).toEqual({ uri: 'https://img.test/sale-blue.jpg' });
    expect(swatchRow(renderer)[1]!.props.accessibilityState).toEqual({ selected: true });
    expect(swatchRow(renderer)[0]!.props.accessibilityState).toEqual({ selected: false });
    // The card’s links follow the shade on screen.
    await press(renderer.root.findAllByProps({ accessibilityRole: 'link' })[0]!);
    await client.flush();
    expect(navigated[0]).toMatchObject({ url: '/p/SALE-B' });
    await press(swatchRow(renderer)[1]!);
    expect(renderer.root.findAllByType(el('Image'))[0]!.props.source).toEqual({ uri: 'https://img.test/sale.jpg' });
  });

  it('opens the shade’s own page instead of adding, because its basket code is not known here', async () => {
    const { renderer, added, navigated } = await drawn(cardTree(TILE));
    await press(swatchRow(renderer)[1]!);
    await press(pressableContaining(renderer, 'Sepete ekle'));
    expect(added).toEqual([]);
    expect(navigated[0]).toMatchObject({ url: '/p/SALE-B', source: 'recommendation' });
  });

  it('draws nothing for a product with one shade, and the "+N" of the cut-off ones', async () => {
    const one = await drawn(cardTree(TILE), [product('ONE', { swatches: [{ itemCode: 'ONE', color: 'Siyah' }] })]);
    expect(swatchRow(one.renderer)).toHaveLength(0);
    const many = Array.from({ length: 8 }, (_unused, at) => ({ itemCode: `M${at}`, color: `Renk${at}` }));
    const capped = await drawn(cardTree([node('s', 'swatches', { props: { max: 3, fill: 'auto', size: 'md', shape: 'circle' } })]), [product('M0', { swatches: many })]);
    expect(texts(capped.renderer)).toContain('+5');
  });
});

describe('add to cart', () => {
  it('adds the product’s basket code through the host, says so on the button, and reports it to the strip', async () => {
    const { renderer, added, client } = await drawn(cardTree(TILE), [product('P', { cartCode: '9001' })]);
    await press(pressableContaining(renderer, 'Sepete ekle'));
    await client.flush();
    expect(added).toEqual([{ code: '9001', quantity: 1, source: 'recommendation', surfaceId: 'w-1', product: expect.objectContaining({ itemCode: 'P' }) }]);
    expect(texts(renderer)).toContain('Tamam');
    expect(eventsOf('add_to_cart')[0]).toMatchObject({ entityType: 'recommendation', entityId: 'w-1', productItemCode: 'P', metadata: { quantity: 1, currency: 'TRY' } });
  });

  it('says what it is doing, then what came of it, then goes back to its own words', async () => {
    jest.useFakeTimers();
    let release!: (value: { success: boolean }) => void;
    const host = recordingHost();
    host.host.addToCart = () => new Promise((resolve) => { release = resolve; });
    const { renderer } = await drawn(cardTree(TILE), [product('P')], WIDGET, host);
    let pending!: Promise<void>;
    await act(async () => {
      pending = (pressableContaining(renderer, 'Sepete ekle').props as { onPress: () => Promise<void> }).onPress();
    });
    expect(texts(renderer)).toContain('Ekleniyor…');
    await act(async () => {
      release({ success: true });
      await pending;
    });
    expect(texts(renderer)).toContain('Tamam');
    await act(async () => {
      jest.advanceTimersByTime(2100);
    });
    expect(texts(renderer)).toContain('Sepete ekle');
  });

  it('says the error when the basket refuses, and reports nothing to the strip', async () => {
    const { renderer, client } = await drawn(cardTree(TILE), [product('P')], WIDGET, recordingHost(undefined, { success: false }));
    await press(pressableContaining(renderer, 'Sepete ekle'));
    await client.flush();
    expect(texts(renderer)).toContain('Olmadı');
    expect(eventsOf('add_to_cart')).toHaveLength(0);
  });

  it('uses the strip’s words for the states when the card names none, then the widget’s own phrase', async () => {
    const bare = cardTree([node('add', 'button', { props: { action: 'add_to_cart' } })]);
    const withStrip = { ...WIDGET, addToCartConfig: { successText: 'Sepetinizde!' } };
    const a = await drawn(bare, [product('P')], withStrip);
    await press(pressableContaining(a.renderer, 'Sepete Ekle'));
    expect(texts(a.renderer)).toContain('Sepetinizde!');
    const b = await drawn(bare, [product('P')]);
    await press(pressableContaining(b.renderer, 'Sepete Ekle'));
    expect(texts(b.renderer)).toContain('Eklendi!');
  });

  it('opens the product when the strip says "go to product", with the strip’s review text', async () => {
    const { renderer, added, navigated } = await drawn(cardTree(TILE), [product('P')], { ...WIDGET, ctaMode: 'review', reviewButtonText: 'İncele' });
    await press(pressableContaining(renderer, 'İncele'));
    expect(added).toEqual([]);
    expect(navigated[0]).toMatchObject({ url: '/p/P' });
  });

  it('opens the product when add to cart is off, or the host has no basket', async () => {
    const off = await drawn(cardTree(TILE), [product('P')], { ...WIDGET, addToCartEnabled: false, reviewButtonText: 'İncele' });
    expect(texts(off.renderer)).toContain('İncele');
    await press(pressableContaining(off.renderer, 'İncele').findAllByType(el('Pressable')).slice(-1)[0]!);
    expect(off.added).toEqual([]);
    expect(off.navigated[0]).toMatchObject({ url: '/p/P' });
    const bare = recordingHost();
    delete (bare.host as { addToCart?: unknown }).addToCart;
    const noHost = await drawn(cardTree(TILE), [product('P')], WIDGET, bare);
    await press(pressableWith(noHost.renderer, 'Sepete ekle'));
    expect(noHost.navigated[0]).toMatchObject({ url: '/p/P' });
  });

  it('opens the product screen for a sized product on a card with no chooser, rather than guess a size', async () => {
    const sized = product('P', { variants: [{ variantCode: 'P-S', size: 'S' }, { variantCode: 'P-M', size: 'M' }] });
    const { renderer, added, navigated } = await drawn(cardTree(TILE), [sized]);
    await press(pressableContaining(renderer, 'Sepete ekle'));
    expect(added).toEqual([]);
    expect(navigated[0]).toMatchObject({ url: '/p/P' });
  });

  describe('the option sheet', () => {
    const SIZED = product('P', {
      imageUrl: 'https://img.test/p.jpg',
      variants: [
        { variantCode: 'P-S', size: 'S', inStock: true, price: 90 },
        { variantCode: 'P-M', size: 'M', inStock: true },
        { variantCode: 'P-L', size: 'L', inStock: false },
      ],
    });
    const modal = (settings?: Record<string, unknown>, chooser?: Record<string, unknown>) =>
      cardTree(TILE, { variantModal: settings ?? {}, variantChooser: chooser ?? {} });
    const withSelection = (selection: string, tree = modal()) => ({ ...tree, variantSelection: selection });

    it('opens one native sheet for chips, dropdown and modal alike, with the sizes, the sold-out one unselectable', async () => {
      for (const selection of ['chips', 'dropdown', 'modal']) {
        const { renderer } = await drawn(withSelection(selection), [SIZED]);
        await press(pressableContaining(renderer, 'Sepete ekle'));
        const sheet = renderer.root.findByProps({ testID: 'selwise-variant-sheet' });
        const chips = sheet.findAllByProps({ accessibilityRole: 'radio' });
        expect(chips.map(textOf)).toEqual(['S', 'M', 'L']);
        expect(chips[2]!.props.disabled).toBe(true);
        expect(textOf(sheet)).toContain('Seçenek seçiniz');
      }
    });

    it('adds the chosen size’s code through the host, and nothing when the sheet is dismissed', async () => {
      const { renderer, added } = await drawn(withSelection('modal'), [SIZED]);
      await press(pressableContaining(renderer, 'Sepete ekle'));
      const sheet = () => renderer.root.findByProps({ testID: 'selwise-variant-sheet' });
      // The button waits for a choice.
      const confirm = sheet().findAllByType(el('Pressable')).find((node_) => textOf(node_) === 'Sepete ekle')!;
      expect(confirm.props.disabled).toBe(true);
      await press(sheet().findAllByProps({ accessibilityRole: 'radio' })[1]!);
      await press(sheet().findAllByType(el('Pressable')).find((node_) => textOf(node_) === 'Sepete ekle')!);
      expect(added.map((item) => item.code)).toEqual(['P-M']);
      expect(renderer.root.findAllByProps({ testID: 'selwise-variant-sheet' })).toHaveLength(0);

      // The button still says it was added; pressing it again asks again.
      await press(pressableContaining(renderer, 'Tamam'));
      await press(renderer.root.findByProps({ testID: 'selwise-variant-sheet' }).findAllByProps({ accessibilityRole: 'button', accessibilityLabel: 'Kapat' })[0]!);
      expect(added).toHaveLength(1);
      expect(renderer.root.findAllByProps({ testID: 'selwise-variant-sheet' })).toHaveLength(0);
    });

    it('adds at once when an option is chosen, with the window’s "add on select" and no button', async () => {
      const { renderer, added } = await drawn(withSelection('modal', modal({ addOnSelect: true })), [SIZED]);
      await press(pressableContaining(renderer, 'Sepete ekle'));
      const sheet = renderer.root.findByProps({ testID: 'selwise-variant-sheet' });
      expect(sheet.findAllByType(el('Pressable')).some((node_) => textOf(node_) === 'Sepete ekle')).toBe(false);
      await press(sheet.findAllByProps({ accessibilityRole: 'radio' })[0]!);
      expect(added.map((item) => item.code)).toEqual(['P-S']);
    });

    it('draws the card’s window and chooser settings: picture, price that follows the option, corners, colours, shape', async () => {
      const { renderer } = await drawn(
        withSelection(
          'modal',
          modal(
            { placement: 'center', showPrice: true, image: 'lg', shape: 'soft', background: '#101010', textColor: '#fafafa', buttonBackground: '#ff0066', buttonTextColor: '#000000', prompt: 'Bedenini seç', overlay: 'dark' },
            { shape: 'pill', size: 'lg', selectedBackground: '#00aa00', selectedTextColor: '#ffffff', border: 'thick', borderColor: '#555555' }
          )
        ),
        [SIZED]
      );
      await press(pressableContaining(renderer, 'Sepete ekle'));
      const sheet = renderer.root.findByProps({ testID: 'selwise-variant-sheet' });
      expect(flat(sheet.props.style)).toMatchObject({ backgroundColor: '#101010', borderRadius: 16 });
      expect(textOf(sheet)).toContain('Bedenini seç');
      const image = sheet.findByType(el('Image'));
      expect(flat(image.props.style)).toMatchObject({ width: 180, height: 180 });
      const chips = sheet.findAllByProps({ accessibilityRole: 'radio' });
      expect(flat(chips[0]!.props.style)).toMatchObject({ borderRadius: 999, borderWidth: 2, borderColor: '#555555', paddingVertical: 8 });
      const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TRY' }).format(amount);
      expect(textOf(sheet)).toContain(money(100));
      // The price follows the option that has one of its own.
      await press(chips[0]!);
      const sheetNow = renderer.root.findByProps({ testID: 'selwise-variant-sheet' });
      expect(textOf(sheetNow)).toContain(money(90));
      expect(flat(sheetNow.findAllByProps({ accessibilityRole: 'radio' })[0]!.props.style)).toMatchObject({ backgroundColor: '#00aa00', borderColor: '#00aa00' });
      const modalHost = renderer.root.findByType(el('Modal'));
      expect(modalHost.props.animationType).toBe('fade');
    });

    it('rises from the bottom edge by default, as a phone’s sheet does', async () => {
      const { renderer } = await drawn(withSelection('modal'), [SIZED]);
      await press(pressableContaining(renderer, 'Sepete ekle'));
      expect(renderer.root.findByType(el('Modal')).props.animationType).toBe('slide');
      expect(flat(renderer.root.findByProps({ testID: 'selwise-variant-sheet' }).props.style)).toMatchObject({ borderBottomLeftRadius: 0 });
    });

    it('adds the one option there is, and a no-axis group, without asking', async () => {
      const one = await drawn(withSelection('modal'), [product('P', { variants: [{ variantCode: 'P-1', size: 'M', inStock: true }] })]);
      await press(pressableContaining(one.renderer, 'Sepete ekle'));
      expect(one.added.map((item) => item.code)).toEqual(['P-1']);
      expect(one.renderer.root.findAllByProps({ testID: 'selwise-variant-sheet' })).toHaveLength(0);
    });

    it('refuses a sold-out only option instead of sending it to the basket', async () => {
      const { renderer, added } = await drawn(withSelection('modal'), [product('P', { variants: [{ variantCode: 'P-1', size: 'M', inStock: false }] })]);
      await press(pressableContaining(renderer, 'Sepete ekle'));
      expect(added).toEqual([]);
      expect(texts(renderer)).toContain('Olmadı');
    });
  });
});

describe('after adding', () => {
  const toastWidget = (config: Record<string, unknown>) => ({ ...WIDGET, addToCartConfig: config });
  const toast = (renderer: Awaited<ReturnType<typeof drawn>>['renderer']) => renderer.root.findAllByProps({ testID: 'selwise-add-toast' });

  it('says nothing of its own by default and with "quiet": the app’s basket has its own feedback', async () => {
    for (const config of [{}, { afterAdd: 'host' }, { afterAdd: 'quiet' }]) {
      const { renderer } = await drawn(cardTree(TILE), [product('P')], toastWidget(config));
      await press(pressableContaining(renderer, 'Sepete ekle'));
      expect(toast(renderer)).toHaveLength(0);
    }
  });

  it('shows the merchant’s message at the strip’s bottom edge for the seconds they chose, with the product’s name', async () => {
    jest.useFakeTimers();
    const { renderer } = await drawn(cardTree(TILE), [product('P')], toastWidget({ afterAdd: 'toast', afterAddMessage: '{product} sepetinizde', afterAddSeconds: 4 }));
    await press(pressableContaining(renderer, 'Sepete ekle'));
    expect(textOf(toast(renderer)[0]!)).toBe('Ürün P sepetinizde');
    expect(flat(toast(renderer)[0]!.props.style)).toMatchObject({ position: 'absolute', bottom: 8 });
    await act(async () => {
      jest.advanceTimersByTime(3900);
    });
    expect(toast(renderer)).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(toast(renderer)).toHaveLength(0);
  });

  it('puts the message at the top edge when the merchant says so, and falls back to the widget’s phrase', async () => {
    const { renderer } = await drawn(cardTree(TILE), [product('P')], toastWidget({ afterAdd: 'toast', afterAddPosition: 'top' }));
    await press(pressableContaining(renderer, 'Sepete ekle'));
    expect(flat(toast(renderer)[0]!.props.style)).toMatchObject({ top: 8 });
    expect(textOf(toast(renderer)[0]!)).toBe('Sepetinize eklendi');
  });

  it('says a refusal, and an out-of-stock option, in the shopper’s language', async () => {
    const refused = await drawn(cardTree(TILE), [product('P')], toastWidget({ afterAdd: 'toast' }), recordingHost(undefined, { success: false }));
    await press(pressableContaining(refused.renderer, 'Sepete ekle'));
    expect(textOf(toast(refused.renderer)[0]!)).toBe('Sepetinize eklenemedi');
    const sold = await drawn({ ...cardTree(TILE), variantSelection: 'modal' }, [product('P', { variants: [{ variantCode: 'P-1', size: 'M', inStock: false }] })], toastWidget({ afterAdd: 'toast' }));
    await press(pressableContaining(sold.renderer, 'Sepete ekle'));
    expect(textOf(toast(sold.renderer)[0]!)).toBe('Bu seçenek tükendi');
  });
});

describe('a sold-out product and a refusal that says why', () => {
  const toast = (renderer: Awaited<ReturnType<typeof drawn>>['renderer']) => renderer.root.findAllByProps({ testID: 'selwise-add-toast' });
  const toastWidget = (config: Record<string, unknown>) => ({ ...WIDGET, addToCartConfig: config });

  it('draws the add button disabled with the sold-out word on a product the catalogue calls sold out, and never calls the basket', async () => {
    const { renderer, added } = await drawn(cardTree(TILE), [product('P', { inStock: false })]);
    expect(texts(renderer)).not.toContain('Sepete ekle');
    const button = pressableContaining(renderer, 'Tükendi');
    expect(button!.props.disabled).toBe(true);
    expect(button!.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      (button!.props as { onPress: () => void }).onPress();
    });
    expect(added).toEqual([]);
  });

  it('keeps the button live for a group whose own row says sold out but still has a size in stock', async () => {
    const { renderer } = await drawn({ ...cardTree(TILE), variantSelection: 'modal' }, [
      product('P', { inStock: false, variants: [{ variantCode: 'P-S', size: 'S', inStock: false }, { variantCode: 'P-M', size: 'M', inStock: true }] }),
    ]);
    expect(pressableContaining(renderer, 'Sepete ekle')).toBeDefined();
  });

  it('shows the platform’s own sentence for a refusal, even when the strip leaves the saying to the app (host)', async () => {
    const refusal = { success: false, message: 'Bu ürün 0 adetten fazla satın alınamaz.' };
    for (const config of [{}, { afterAdd: 'host' }, { afterAdd: 'toast' }]) {
      const { renderer } = await drawn(cardTree(TILE), [product('P')], toastWidget(config), recordingHost(undefined, refusal));
      await press(pressableContaining(renderer, 'Sepete ekle'));
      expect(textOf(toast(renderer)[0]!)).toBe('Bu ürün 0 adetten fazla satın alınamaz.');
    }
  });

  it('stays silent about a refusal under "quiet", and without a message says nothing of its own under host', async () => {
    const quiet = await drawn(cardTree(TILE), [product('P')], toastWidget({ afterAdd: 'quiet' }), recordingHost(undefined, { success: false, message: 'Stokta yok' }));
    await press(pressableContaining(quiet.renderer, 'Sepete ekle'));
    expect(toast(quiet.renderer)).toHaveLength(0);

    const bare = await drawn(cardTree(TILE), [product('P')], toastWidget({}), recordingHost(undefined, { success: false }));
    await press(pressableContaining(bare.renderer, 'Sepete ekle'));
    expect(toast(bare.renderer)).toHaveLength(0);
  });
});

describe('the default card, and the brand', () => {
  it('is drawn when there is no card, or the card is written as markup, painted from the brand’s tokens', async () => {
    const { renderer } = await drawn({ mode: 'advanced_code', customHTML: '<div>x</div>', renderVersion: 3 }, [SALE]);
    expect(texts(renderer)).toContain('Ürün SALE');
    const title = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === 'Ürün SALE')!;
    expect(flat(title.props.style)['color']).toBe('#222222');
    const discount = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === '-20%')!;
    expect(flat(discount.parent!.props.style)['backgroundColor']).toBe('#dc2626');
    const button = renderer.root.findAllByType(el('Pressable')).find((node_) => textOf(node_) === 'Sepete Ekle')!;
    expect(flat(button.props.style)['backgroundColor']).toBe('#d3145a');
  });

  it('is the web’s plain card on a channel with no brand, with no hard-coded colour of its own', async () => {
    const { state } = await import('./test/strip-harness.js');
    state.theme = {};
    const { renderer } = await drawn(null, [SALE]);
    const title = renderer.root.findAllByType(el('Text')).find((node_) => textOf(node_) === 'Ürün SALE')!;
    expect(flat(title.props.style)['color']).toBe('#111111');
  });

  it('draws the default card’s button as the strip says: add, or "go to product"', async () => {
    const add = await drawn(null, [product('P')]);
    await press(pressableWith(add.renderer, 'Sepete Ekle'));
    expect(add.added.map((item) => item.code)).toEqual(['P']);
    const review = await drawn(null, [product('P')], { ...WIDGET, ctaMode: 'review', reviewButtonText: 'İncele' });
    expect(texts(review.renderer)).toContain('İncele');
  });

  it('hands every card to the app’s own component when it passes one, and the tap is its own', async () => {
    const client = await startClient();
    const { host } = recordingHost();
    const taps: string[] = [];
    const renderer = await mount(
      client,
      host,
      h(RecommendationStrip, {
        strip: strip(WIDGET, [product('A'), product('B')], cardTree(TILE)),
        renderItem: ({ product: item, onPress }) => h('MyCard', { key: item.itemCode, onPress }),
        onProductPress: (item) => taps.push(item.itemCode),
      })
    );
    await press(renderer.root.findAllByType(el('MyCard'))[1]!);
    expect(taps).toEqual(['B']);
  });
});

describe('the product price formatting', () => {
  it('falls back to a plain amount and the currency code when the runtime cannot format a currency', async () => {
    const { formatMoney } = await import('./price-format.js');
    expect(formatMoney(1234.5, 'XXXX')).toBe('1234,50 XXXX');
    expect(formatMoney(5, undefined)).toBe('5,00');
    expect(formatMoney('abc', 'TRY')).toBe('');
  });
});

