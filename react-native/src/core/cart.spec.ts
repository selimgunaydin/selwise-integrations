import { CartStore, normalizeCartInput, withCartSignals } from './cart.js';

describe('normalizeCartInput', () => {
  it('reads a basket the host measured', () => {
    expect(normalizeCartInput({ total: 349.9, itemCount: 2, currency: 'try' })).toEqual({
      known: true,
      total: 349.9,
      itemCount: 2,
      currency: 'TRY',
    });
  });

  // Akinon serialises decimals as strings, and App Maker hands them on as-is.
  it('accepts numeric strings', () => {
    expect(normalizeCartInput({ total: '379.80', itemCount: '3' })).toEqual({
      known: true,
      total: 379.8,
      itemCount: 3,
      currency: null,
    });
  });

  it('is not a basket without both numbers', () => {
    expect(normalizeCartInput({ total: 10 })).toBeNull();
    expect(normalizeCartInput({ itemCount: 1 })).toBeNull();
    expect(normalizeCartInput({ total: '', itemCount: 1 })).toBeNull();
    expect(normalizeCartInput({ total: -1, itemCount: 1 })).toBeNull();
    expect(normalizeCartInput({ total: Number.NaN, itemCount: 1 })).toBeNull();
    expect(normalizeCartInput({ total: Infinity, itemCount: 1 })).toBeNull();
    expect(normalizeCartInput(null)).toBeNull();
    expect(normalizeCartInput('100')).toBeNull();
  });

  // The channel's currency stands in; a guessed one would be a wrong amount.
  it('drops a currency that is not ISO 4217 instead of rejecting the basket', () => {
    expect(normalizeCartInput({ total: 1, itemCount: 1, currency: 'TL' })?.currency).toBeNull();
    expect(normalizeCartInput({ total: 1, itemCount: 1, currency: '₺' })?.currency).toBeNull();
  });

  it('floors a fractional count', () => {
    expect(normalizeCartInput({ total: 1, itemCount: 2.7 })?.itemCount).toBe(2);
  });
});

describe('CartStore', () => {
  // K3: an unmeasured cart is not an empty one.
  it('starts unknown', () => {
    expect(new CartStore().get()).toEqual({ known: false, total: 0, itemCount: 0, currency: null });
  });

  it('notifies on a change, and only on a change', () => {
    const store = new CartStore();
    const seen: unknown[] = [];
    store.subscribe((cart) => seen.push(cart));

    store.set({ total: 100, itemCount: 1 });
    store.set({ total: 100, itemCount: 1 });
    store.set({ total: 150, itemCount: 2 });

    expect(seen).toEqual([
      { known: true, total: 100, itemCount: 1, currency: null },
      { known: true, total: 150, itemCount: 2, currency: null },
    ]);
  });

  // A "complete to free shipping" strip leaves the basket's own lines out, so a
  // line swapped at the same amount must reach it; a reordered re-read must not.
  it('notifies when the lines move at the same amount, not when they are reordered', () => {
    const store = new CartStore();
    const seen: unknown[] = [];
    store.subscribe((cart) => seen.push(cart));

    store.set({ total: 100, itemCount: 2, codes: ['A', 'B'] });
    store.set({ total: 100, itemCount: 2, codes: ['B', 'A'] });
    store.set({ total: 100, itemCount: 2, codes: ['A', 'C'] });

    expect(seen).toHaveLength(2);
    expect(store.getCodes()).toEqual(['A', 'C']);
  });

  // The previous amount is stale once the host reports something that is not
  // a basket; printing it would be a guess.
  it('becomes unknown on an input that is not a basket', () => {
    const store = new CartStore();
    store.set({ total: 100, itemCount: 1 });
    expect(store.set({ total: -5, itemCount: 1 })).toBe(false);
    expect(store.get().known).toBe(false);
  });

  it('becomes unknown on null', () => {
    const store = new CartStore();
    store.set({ total: 100, itemCount: 1 });
    expect(store.set(null)).toBe(true);
    expect(store.get().known).toBe(false);
  });

  it('hands out copies', () => {
    const store = new CartStore();
    store.set({ total: 100, itemCount: 1 });
    const copy = store.get();
    copy.total = 9999;
    expect(store.get().total).toBe(100);
  });

  it('unsubscribes, and survives a throwing listener', () => {
    const errors: unknown[] = [];
    const store = new CartStore((error) => errors.push(error));
    const calls: number[] = [];
    store.subscribe(() => {
      throw new Error('host bug');
    });
    const stop = store.subscribe((cart) => calls.push(cart.total));

    store.set({ total: 1, itemCount: 1 });
    stop();
    store.set({ total: 2, itemCount: 1 });

    expect(calls).toEqual([1]);
    expect(errors).toHaveLength(2);
  });
});

describe('withCartSignals', () => {
  const known = { known: true, total: 640, itemCount: 3, currency: 'TRY' };

  it('fills both cart signals when the host passes no behaviour', () => {
    expect(withCartSignals(undefined, known)).toEqual({ cartValue: 640, cartItemCount: 3 });
  });

  // The host knows its basket better than a cart it set a moment ago.
  it('fills only the cart signals the host did not set', () => {
    expect(withCartSignals({ cartValue: 10, isLoggedIn: true }, known)).toEqual({
      cartValue: 10,
      cartItemCount: 3,
      isLoggedIn: true,
    });
  });

  it('adds nothing from an unknown cart', () => {
    const behavior = { visitCount: 2 };
    expect(withCartSignals(behavior, { known: false, total: 0, itemCount: 0 })).toBe(behavior);
    expect(withCartSignals(undefined, { known: false, total: 0, itemCount: 0 })).toBeUndefined();
  });
});
