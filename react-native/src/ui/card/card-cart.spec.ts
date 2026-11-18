import type { SelwiseProduct } from '../../types.js';
import { addAllSequentially, buttonAction, decideAdd, decideAddAllLine, ownBasketCode, selectionOf } from './card-cart.js';

const sized = (extra?: Record<string, unknown>): SelwiseProduct =>
  ({
    id: 'P',
    itemCode: 'P',
    title: 'Tişört',
    price: 100,
    currency: 'TRY',
    url: '/p/P',
    variants: [
      { variantCode: 'P-S', size: 'S', inStock: true },
      { variantCode: 'P-M', size: 'M', inStock: true },
      { variantCode: 'P-L', size: 'L', inStock: false },
    ],
    ...(extra ?? {}),
  }) as SelwiseProduct;
const plain = (extra?: Record<string, unknown>): SelwiseProduct =>
  ({ id: 'Q', itemCode: 'Q', title: 'Ruj', price: 50, currency: 'TRY', url: '/p/Q', ...(extra ?? {}) }) as SelwiseProduct;

describe('a sold-out product is never sent to the basket', () => {
  it('stops a product whose own stock is false and which has no buyable option, whatever the chooser', () => {
    for (const selection of ['none', 'chips', 'dropdown', 'modal'] as const) {
      expect(decideAdd(plain({ inStock: false, cartCode: '9001' }), selection)).toEqual({
        kind: 'stop',
        reason: 'out_of_stock',
      });
    }
    // Every option sold out too.
    const allGone = sized({
      inStock: false,
      variants: [
        { variantCode: 'P-S', size: 'S', inStock: false },
        { variantCode: 'P-M', size: 'M', inStock: false },
      ],
    });
    expect(decideAdd(allGone, 'modal')).toEqual({ kind: 'stop', reason: 'out_of_stock' });
    // "Add all" counts it as a failed line, never a code.
    expect(decideAddAllLine(plain({ inStock: false }), 'none')).toEqual({ kind: 'failed' });
  });

  it('lets a group through whose own row says sold out while one size is still in stock', () => {
    expect(decideAdd(sized({ inStock: false }), 'modal').kind).toBe('choose');
  });

  it('never stops on stock that is not known', () => {
    expect(decideAdd(plain(), 'none')).toEqual({ kind: 'code', code: 'Q' });
    expect(decideAdd(plain({ inStock: true }), 'none')).toEqual({ kind: 'code', code: 'Q' });
  });
});

describe('which code "add to cart" sends', () => {
  it('sends a product with no options by its basket code: the cart code, else the item code', () => {
    expect(decideAdd(plain({ cartCode: '9001' }), 'none')).toEqual({ kind: 'code', code: '9001' });
    expect(decideAdd(plain(), 'chips')).toEqual({ kind: 'code', code: 'Q' });
    expect(ownBasketCode(plain())).toBe('Q');
  });

  it('opens the product when a card with no chooser has several options and no code of its own', () => {
    expect(decideAdd(sized(), 'none')).toEqual({ kind: 'page' });
    // Its own cart code is one of the sizes (a row per size): addable as itself.
    expect(decideAdd(sized({ cartCode: 'P-M' }), 'none')).toEqual({ kind: 'code', code: 'P-M' });
  });

  it('asks the shopper when a card offers a chooser and the options have an axis', () => {
    const decision = decideAdd(sized(), 'modal');
    expect(decision.kind).toBe('choose');
    // The three ways of offering options are one sheet.
    expect(decideAdd(sized(), 'chips').kind).toBe('choose');
    expect(decideAdd(sized(), 'dropdown').kind).toBe('choose');
  });

  it('adds the option the shopper chose, and never a sold-out one', () => {
    expect(decideAdd(sized(), 'modal', 'P-M')).toEqual({ kind: 'code', code: 'P-M' });
    expect(decideAdd(sized(), 'modal', 'P-L')).toEqual({ kind: 'stop', reason: 'out_of_stock' });
  });

  it('adds the one option there is without asking, and a no-axis group by its cheapest option', () => {
    expect(decideAdd(plain({ variants: [{ variantCode: 'Q-1', size: 'M' }] }), 'chips')).toEqual({ kind: 'code', code: 'Q-1' });
    const shades = plain({ variants: [{ variantCode: 'A', price: 90 }, { variantCode: 'B', price: 70 }] });
    expect(decideAdd(shades, 'modal')).toEqual({ kind: 'code', code: 'B' });
  });

  it('reads the card’s chooser setting, none when it says nothing', () => {
    expect(selectionOf({ variantSelection: 'modal' })).toBe('modal');
    expect(selectionOf({})).toBe('none');
    expect(selectionOf(null)).toBe('none');
  });
});

describe('what a card’s button does', () => {
  const host = { canAdd: true };
  it('adds by default and opens the product when the strip says "go to product" or the host cannot add', () => {
    expect(buttonAction('add_to_cart', plain(), { ...host, ctaMode: 'add_to_cart' })).toBe('add-to-cart');
    expect(buttonAction('add_to_cart', plain(), { ...host, ctaMode: 'review' })).toBe('review');
    expect(buttonAction('add_to_cart', plain(), { ...host, ctaMode: 'add_to_cart', addToCartEnabled: false })).toBe('review');
    expect(buttonAction('add_to_cart', plain(), { canAdd: false, ctaMode: 'add_to_cart' })).toBe('review');
  });

  it('is a link with no page to go to, a link by design, and never a wishlist or a storefront window', () => {
    expect(buttonAction('add_to_cart', plain({ url: null }), { canAdd: false, ctaMode: 'review' })).toBe('link');
    expect(buttonAction('link', plain(), { ...host, ctaMode: 'add_to_cart' })).toBe('link');
    expect(buttonAction('wishlist', plain(), host)).toBe('wishlist');
    // A quick view is the product's own screen in an app.
    expect(buttonAction('quick_view', plain(), { ...host, ctaMode: 'add_to_cart' })).toBe('review');
  });
});

describe('add all', () => {
  it('adds a line with a known code, reports one that needs a size, and counts a sold-out one as failed', () => {
    expect(decideAddAllLine(plain(), 'none')).toEqual({ kind: 'add', code: 'Q' });
    expect(decideAddAllLine(sized(), 'modal')).toEqual({ kind: 'needs_size' });
    expect(decideAddAllLine(sized(), 'none')).toEqual({ kind: 'failed' });
  });

  it('adds one after another, counts a refusal and a throw as failures, and never guesses a size', async () => {
    const order: string[] = [];
    const outcome = await addAllSequentially(
      [plain(), sized(), plain({ itemCode: 'R', id: 'R' }), plain({ itemCode: 'S', id: 'S' })],
      (product) => decideAddAllLine(product, 'modal'),
      async (product, code) => {
        order.push(code);
        if (product.itemCode === 'R') return false;
        if (product.itemCode === 'S') throw new Error('basket down');
        return true;
      }
    );
    expect(order).toEqual(['Q', 'R', 'S']);
    expect(outcome).toEqual({ requested: 4, added: 1, failed: 2, needsSize: 1 });
  });
});
