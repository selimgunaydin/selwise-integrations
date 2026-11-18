import { APP_STYLE_TABLE } from '../../vendor/app-style.js';
import { boxStyleOf, inheritFrom, isSized, ownTextOf, phoneStyleOf, readCardTree, resizeModeOf, rootTextOf, textStyleOf, wrapsPrices, type CardNodeLike } from './card-tree.js';

/**
 * The card tree as the app reads it. Every card style key the dashboard offers on
 * an app channel is proved drawn below (the `card` surface of the style table):
 * the proof the pending list is held to.
 */

const ctx = { tokens: { '--selwise-text': '#222222' }, viewport: { width: 390, height: 844 } };
const node = (style: Record<string, unknown>, extra?: Partial<CardNodeLike>): CardNodeLike => ({ id: 'n', type: 'stack', style, ...extra });

describe('which cards are drawn from a tree', () => {
  const tree = { version: 3, root: { id: 'root', type: 'root', children: [] }, variantChooser: { shape: 'pill' } };

  it('reads a v3 card, with the chooser and window settings it carries', () => {
    const view = readCardTree({ mode: 'schema', renderVersion: 3, cardTree: { ...tree, variantModal: { width: 'lg' } } });
    expect(view?.root.type).toBe('root');
    expect(view?.variantChooser).toEqual({ shape: 'pill' });
    expect(view?.variantModal).toEqual({ width: 'lg' });
  });

  it('draws nothing from a card the storefront would draw from markup or from the field list', () => {
    expect(readCardTree({ mode: 'advanced_code', customHTML: '<b>x</b>', renderVersion: 3, cardTree: tree })).toBeNull();
    expect(readCardTree({ mode: 'schema', renderVersion: 2, cardTree: tree })).toBeNull();
    expect(readCardTree({ mode: 'schema', renderVersion: 3 })).toBeNull();
    expect(readCardTree(null)).toBeNull();
    // A root that is not a root is no tree.
    expect(readCardTree({ mode: 'schema', renderVersion: 3, cardTree: { version: 3, root: { id: 'x', type: 'stack' } } })).toBeNull();
  });
});

describe('a node’s style on a phone', () => {
  it('lays the tablet rules, then the phone rules, over the node’s own', () => {
    const n = node({ gap: '4px', padding: '1px' }, { responsive: { tablet: { gap: '8px' }, mobile: { padding: '2px' } } });
    expect(phoneStyleOf(n)).toEqual({ gap: '8px', padding: '2px' });
  });

  it('shrinks like a CSS flex item and refuses a border with no style', () => {
    expect(boxStyleOf(node({}), ctx).style).toMatchObject({ flexShrink: 1 });
    const bare = boxStyleOf(node({ borderWidth: '2px', borderColor: '#f00' }), ctx).style;
    expect(bare).not.toHaveProperty('borderWidth');
    const drawn = boxStyleOf(node({ borderWidth: '2px', borderColor: '#f00', borderStyle: 'solid' }), ctx).style;
    expect(drawn).toMatchObject({ borderWidth: 2, borderColor: '#f00', borderStyle: 'solid' });
    expect(boxStyleOf(node({ borderStyle: 'none', borderWidth: '2px' }), ctx).style).not.toHaveProperty('borderStyle');
  });

  it('never shrinks a price below its text, and wraps the row that holds prices whole (a number is not split in two)', () => {
    // 2026-11-18: in a ~170pt card the row of selling price, struck price and chip
    // squeezed the last one until "₺1.149,00" broke into "₺1.14" / "9,00".
    const price = (style: Record<string, unknown> = {}) => node(style, { id: 'p', type: 'price', props: { variant: 'current' } });
    expect(boxStyleOf(price(), ctx).style).toMatchObject({ flexShrink: 0 });
    // every other node keeps the shrinking default: a long title must not push the card wider
    expect(boxStyleOf(node({}, { type: 'text' }), ctx).style).toMatchObject({ flexShrink: 1 });
    const row = node({ flexDirection: 'row', gap: '6px' }, { children: [price(), price()] });
    expect(wrapsPrices(row)).toBe(true);
    expect(boxStyleOf(row, ctx).style).toMatchObject({ flexWrap: 'wrap', gap: 6 });
    // a column of prices has nothing to wrap (and a fixed-height one would start a second column)
    expect(wrapsPrices(node({ flexDirection: 'column' }, { children: [price()] }))).toBe(false);
    expect(wrapsPrices(node({}, { children: [price()] }))).toBe(false);
    // the card itself, when it lays its prices in a row; a phone rule counts
    expect(wrapsPrices({ id: 'root', type: 'root', style: { flexDirection: 'row' }, children: [price()] })).toBe(true);
    expect(wrapsPrices(node({}, { children: [price()], responsive: { mobile: { flexDirection: 'row' } } }))).toBe(true);
    // a stack with no price in it is left as the merchant drew it
    expect(wrapsPrices(node({}, { children: [node({}, { type: 'text' })] }))).toBe(false);
    expect(boxStyleOf(node({}, { children: [node({}, { type: 'text' })] }), ctx).style).not.toHaveProperty('flexWrap');
    // and the merchant's own choice wins
    const chosen = node({ flexDirection: 'row', flexWrap: 'nowrap' }, { children: [price()] });
    expect(boxStyleOf(chosen, ctx).style).toMatchObject({ flexWrap: 'nowrap' });
  });

  it('removes a node whose display is none, and takes an overlay out of the flow', () => {
    expect(boxStyleOf(node({ display: 'none' }), ctx).none).toBe(true);
    expect(boxStyleOf(node({ display: 'flex' }), ctx).none).toBe(false);
    expect(boxStyleOf(node({ insetTop: '4px', insetLeft: '6px' }), ctx, { overlay: true }).style).toMatchObject({ position: 'absolute', top: 4, left: 6 });
    expect(isSized({ aspectRatio: 1 })).toBe(true);
    expect(isSized({})).toBe(false);
  });

  it('lets text inherit from its ancestors as CSS does, and sets its own over them', () => {
    const root = rootTextOf(ctx);
    expect(root).toEqual({ color: '#222222', fontSize: 14, lineHeight: 1.4 });
    const parent = node({ color: '#aa0000', fontSize: '20px', fontWeight: '600' });
    const inherited = inheritFrom(root, parent, ctx);
    const leaf = textStyleOf(node({ fontSize: '10px' }, { type: 'text' }), inherited, ctx).style;
    expect(leaf).toMatchObject({ color: '#aa0000', fontSize: 10, fontWeight: '600', lineHeight: 14 });
    // Decoration is not inherited.
    const decorated = inheritFrom(root, node({ textDecoration: 'underline' }), ctx);
    expect(textStyleOf(node({}, { type: 'text' }), decorated, ctx).style).not.toHaveProperty('textDecorationLine');
  });

  it('clamps text to its lines', () => {
    expect(textStyleOf(node({ maxLines: 2 }, { type: 'text' }), rootTextOf(ctx), ctx).lines).toBe(2);
  });

  it('reads an image’s fit, cover by default', () => {
    expect(resizeModeOf(node({ objectFit: 'contain' }, { type: 'image' }), ctx)).toBe('contain');
    expect(resizeModeOf(node({ objectFit: 'fill' }, { type: 'image' }), ctx)).toBe('stretch');
    expect(resizeModeOf(node({}, { type: 'image' }), ctx)).toBe('cover');
  });
});

describe('every card style key the dashboard offers on an app channel is drawn', () => {
  // A value for each key, and where the card reads it from.
  const FULL = { borderStyle: 'solid', borderWidth: '1px' };
  const BOX: Record<string, { value: unknown; read: (style: Record<string, unknown>) => unknown }> = {
    display: { value: 'none', read: () => 'handled by `none`' },
    flexDirection: { value: 'row', read: (s) => s['flexDirection'] },
    justifyContent: { value: 'space-between', read: (s) => s['justifyContent'] },
    alignItems: { value: 'center', read: (s) => s['alignItems'] },
    flexWrap: { value: 'wrap', read: (s) => s['flexWrap'] },
    gap: { value: '6px', read: (s) => s['gap'] },
    flexGrow: { value: 1, read: (s) => s['flexGrow'] },
    width: { value: '50%', read: (s) => s['width'] },
    height: { value: '40px', read: (s) => s['height'] },
    minHeight: { value: '30px', read: (s) => s['minHeight'] },
    maxWidth: { value: '200px', read: (s) => s['maxWidth'] },
    overflow: { value: 'hidden', read: (s) => s['overflow'] },
    background: { value: '#eeeeee', read: (s) => s['backgroundColor'] },
    opacity: { value: 0.5, read: (s) => s['opacity'] },
    padding: { value: '4px 8px', read: (s) => s['paddingHorizontal'] },
    margin: { value: '2px 3px', read: (s) => s['marginHorizontal'] },
    borderRadius: { value: '9px', read: (s) => s['borderRadius'] },
    borderWidth: { value: '3px', read: (s) => s['borderWidth'] },
    borderStyle: { value: 'dashed', read: (s) => s['borderStyle'] },
    borderColor: { value: '#00ff00', read: (s) => s['borderColor'] },
    boxShadow: { value: '0 2px 8px rgba(0,0,0,.2)', read: (s) => s['shadowRadius'] },
    insetTop: { value: '5px', read: (s) => s['top'] },
    insetRight: { value: '5px', read: (s) => s['right'] },
    insetBottom: { value: '5px', read: (s) => s['bottom'] },
    insetLeft: { value: '5px', read: (s) => s['left'] },
    zIndex: { value: 3, read: (s) => s['zIndex'] },
    aspectRatio: { value: '4 / 3', read: (s) => s['aspectRatio'] },
  };
  const TEXT: Record<string, unknown> = {
    fontSize: '19px',
    fontWeight: '700',
    fontStyle: 'italic',
    lineHeight: 2,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    textAlign: 'center',
    textDecoration: 'underline',
    maxLines: 3,
    color: '#0000ff',
  };
  const TEXT_READS: Record<string, (r: ReturnType<typeof textStyleOf>) => unknown> = {
    fontSize: (r) => r.style['fontSize'],
    fontWeight: (r) => r.style['fontWeight'],
    fontStyle: (r) => r.style['fontStyle'],
    lineHeight: (r) => r.style['lineHeight'],
    letterSpacing: (r) => r.style['letterSpacing'],
    textTransform: (r) => r.style['textTransform'],
    textAlign: (r) => r.style['textAlign'],
    textDecoration: (r) => r.style['textDecorationLine'],
    maxLines: (r) => r.lines,
    color: (r) => r.style['color'],
  };

  it('has a proof for every translated key', () => {
    const proved = new Set([...Object.keys(BOX), ...Object.keys(TEXT), 'fontFamily', 'objectFit']);
    expect([...proved].sort()).toEqual(Object.keys(APP_STYLE_TABLE.card).sort());
  });

  for (const [key, sample] of Object.entries(BOX)) {
    it(`${key} reaches the box`, () => {
      if (key === 'display') {
        expect(boxStyleOf(node({ display: 'none' }), ctx).none).toBe(true);
        return;
      }
      const extra = key === 'borderWidth' || key === 'borderColor' ? FULL : {};
      const before = sample.read(boxStyleOf(node({ ...extra }), ctx).style);
      const after = sample.read(boxStyleOf(node({ ...extra, [key]: sample.value }), ctx, { sizeForPercent: 100 }).style);
      expect(after).not.toEqual(before);
      expect(after).not.toBeUndefined();
    });
  }

  for (const [key, value] of Object.entries(TEXT)) {
    it(`${key} reaches the text`, () => {
      const read = TEXT_READS[key]!;
      const base = textStyleOf(node({}, { type: 'text' }), rootTextOf(ctx), ctx);
      const after = textStyleOf(node({ [key]: value }, { type: 'text' }), rootTextOf(ctx), ctx);
      expect(read(after)).not.toEqual(read(base));
      expect(read(after)).not.toBeUndefined();
    });
  }

  it('fontFamily reaches the text through the host’s fonts', () => {
    const withFonts = { ...ctx, fontFamilyMap: { inter: 'Inter-Regular' } };
    expect(ownTextOf(node({ fontFamily: '"Inter", sans-serif' }), withFonts).style['fontFamily']).toBe('Inter-Regular');
    // A font the host did not map keeps the app’s own.
    expect(ownTextOf(node({ fontFamily: '"Inter", sans-serif' }), ctx).style).not.toHaveProperty('fontFamily');
  });

  it('objectFit reaches the image', () => {
    expect(resizeModeOf(node({ objectFit: 'contain' }, { type: 'image' }), ctx)).toBe('contain');
  });
});
