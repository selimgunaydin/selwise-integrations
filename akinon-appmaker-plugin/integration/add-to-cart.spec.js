'use strict';

/**
 * A custom widget's add, through the app's own basket action: counted once,
 * reported truthfully, and shown where the shopper is.
 */

const mockStore = { getState: jest.fn(), dispatch: jest.fn() };
const mockBasketActions = { addToCart: jest.fn((product, quantity, options) => ({ type: 'ADD', product, quantity, options })) };

jest.mock('@core/store', () => ({ default: mockStore }), { virtual: true });
jest.mock(
  '@services/container',
  () => ({ default: { get: () => ({ basket: { actions: mockBasketActions } }) } }),
  { virtual: true },
);

const { SelwisePlugin } = require('./index.js');
const { mapEvent } = require('./analytics/mapper.js');

const cartChanges = (state, prev) => mapEvent('cartChanges', state, prev);
const { consumeSurfaceAdd, markSurfaceAdd, WINDOW_MS, CLAIM_GRACE_MS } = require('./surface-add.js');

const basketState = (totalQuantity) => ({ basket: { basket: { totalQuantity, products: [] } } });

function plugin(config) {
  const instance = new SelwisePlugin();
  instance.config = config || null;
  instance.selwise = { trackAddToCart: jest.fn() };
  return instance;
}

describe('addToCartFromSurface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // `clearAllMocks` keeps implementations and queued return values: a test's
    // dispatch assertion must not leak into the next.
    mockStore.getState.mockReset();
    mockStore.dispatch.mockReset();
    consumeSurfaceAdd();
  });

  it('adds through the app basket with a snackbar, never the product-screen modal', async () => {
    mockStore.getState.mockReturnValueOnce(basketState(1)).mockReturnValueOnce(basketState(2));
    const instance = plugin({ addedText: 'Sepete girdi' });

    await expect(instance.addToCartFromSurface({ id: 's1' }, '7142', 1)).resolves.toBe(true);

    const options = mockBasketActions.addToCart.mock.calls[0][2];
    expect(options).toEqual({ snackbar: { text: 'Sepete girdi', type: 'success' } });
    expect(options.modal).toBeUndefined();
    expect(mockBasketActions.addToCart.mock.calls[0][0]).toEqual({ pk: '7142' });
  });

  it('the mapper writes the ONE add_to_cart, with the surface as its source, and the surface stays silent', async () => {
    mockStore.getState.mockReturnValueOnce(basketState(1)).mockReturnValueOnce(basketState(2));
    const instance = plugin();
    let heardByMapper;
    mockStore.dispatch.mockImplementation(() => {
      // The app publishes `cartChanges` from inside the dispatch.
      heardByMapper = cartChanges(basketState(2), basketState(1));
    });

    await expect(instance.addToCartFromSurface({ id: 'hero' }, '7142', 2)).resolves.toBe(true);

    expect(heardByMapper).toEqual([
      expect.objectContaining({
        name: 'add_to_cart',
        metadata: expect.objectContaining({ source: 'custom_widget', surfaceId: 'hero' }),
      }),
    ]);
    expect(instance.selwise.trackAddToCart).not.toHaveBeenCalled();
  });

  it('when the app published no cartChanges, the surface writes the add itself, once, after the grace period', async () => {
    jest.useFakeTimers();
    try {
      mockStore.getState.mockReturnValueOnce(basketState(1)).mockReturnValueOnce(basketState(2));
      const instance = plugin();

      await instance.addToCartFromSurface({ id: 'hero' }, '7142', 2);
      expect(instance.selwise.trackAddToCart).not.toHaveBeenCalled();

      jest.advanceTimersByTime(CLAIM_GRACE_MS);
      expect(instance.selwise.trackAddToCart).toHaveBeenCalledTimes(1);
    expect(instance.selwise.trackAddToCart).toHaveBeenCalledWith('7142', {
        quantity: 2,
        source: 'custom_widget',
        surfaceId: 'hero',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('an app that publishes cartChanges AFTER its action settles still gets ONE event, the mapper\'s', async () => {
    jest.useFakeTimers();
    try {
      mockStore.getState.mockReturnValueOnce(basketState(1)).mockReturnValueOnce(basketState(2));
      const instance = plugin();

      await expect(instance.addToCartFromSurface({ id: 'hero' }, '7142', 1)).resolves.toBe(true);
      // The app's analytics hands the mapper `cartChanges` a moment later.
      const heardByMapper = cartChanges(basketState(2), basketState(1));
      jest.advanceTimersByTime(CLAIM_GRACE_MS);

      expect(heardByMapper[0].metadata).toEqual(expect.objectContaining({ source: 'custom_widget', surfaceId: 'hero' }));
      expect(instance.selwise.trackAddToCart).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('an action that throws AFTER the line went in is an add: the basket count is the verdict', async () => {
    jest.useFakeTimers();
    try {
      mockStore.getState.mockReturnValueOnce(basketState(1)).mockReturnValueOnce(basketState(2));
      mockStore.dispatch.mockRejectedValueOnce(new TypeError("Cannot read property 'data' of undefined"));
      const instance = plugin();

      await expect(instance.addToCartDetailed({ id: 'hero' }, '7142', 1)).resolves.toEqual({ success: true });
      jest.advanceTimersByTime(CLAIM_GRACE_MS);
      expect(instance.selwise.trackAddToCart).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a second surface add during the grace period keeps its own attribution', async () => {
    jest.useFakeTimers();
    try {
      const instance = plugin();
      mockStore.getState.mockReturnValueOnce(basketState(1)).mockReturnValueOnce(basketState(2));
      await instance.addToCartFromSurface({ id: 'first' }, '1', 1);
      mockStore.getState.mockReturnValueOnce(basketState(2)).mockReturnValueOnce(basketState(3));
      await instance.addToCartFromSurface({ id: 'second' }, '2', 1);

      jest.advanceTimersByTime(CLAIM_GRACE_MS);
      // The first add's mark was replaced (the app's mapper would have claimed
      // it); it never takes the second one's attribution.
      expect(instance.selwise.trackAddToCart.mock.calls).toEqual([['2', { quantity: 1, source: 'custom_widget', surfaceId: 'second' }]]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('writes nothing while the dispatch is still running', async () => {
    mockStore.getState.mockReturnValueOnce(basketState(1)).mockReturnValueOnce(basketState(2));
    const instance = plugin();
    let writtenInsideDispatch;
    mockStore.dispatch.mockImplementation(() => {
      writtenInsideDispatch = instance.selwise.trackAddToCart.mock.calls.length;
    });
    await instance.addToCartFromSurface({ id: 'hero' }, '7142', 1);
    expect(writtenInsideDispatch).toBe(0);
  });

  it('does not report success when the framework swallowed a refusal: the basket did not change', async () => {
    mockStore.getState.mockReturnValueOnce(basketState(3)).mockReturnValueOnce(basketState(3));
    const instance = plugin();

    await expect(instance.addToCartFromSurface({ id: 's' }, '7142', 1)).resolves.toBe(false);

    expect(instance.selwise.trackAddToCart).not.toHaveBeenCalled();
    // And the withdrawn mark does not hand the visitor's own next add this surface's attribution.
    expect(cartChanges(basketState(4), basketState(3))[0].metadata.source).toBeUndefined();
  });

  it('a dispatch that throws is a failed add and writes nothing', async () => {
    mockStore.getState.mockReturnValue(basketState(1));
    mockStore.dispatch.mockRejectedValueOnce(new Error('network'));
    const instance = plugin();

    await expect(instance.addToCartFromSurface({ id: 's' }, '7142', 1)).resolves.toBe(false);
    expect(instance.selwise.trackAddToCart).not.toHaveBeenCalled();
  });

  it('takes the add at its word when the basket count cannot be read', async () => {
    mockStore.getState.mockReturnValue({});
    await expect(plugin().addToCartFromSurface({ id: 's' }, '7142', 1)).resolves.toBe(true);
  });

  it('refuses an empty code without touching the basket', async () => {
    await expect(plugin().addToCartFromSurface({ id: 's' }, '  ', 1)).resolves.toBe(false);
    expect(mockBasketActions.addToCart).not.toHaveBeenCalled();
  });
});

describe('surface add mark', () => {
  const attribution = { source: 'custom_widget', surfaceId: 'hero' };

  it('is consumed once, with its attribution, and only inside its window', () => {
    markSurfaceAdd(attribution, 1000);
    expect(consumeSurfaceAdd(1000 + WINDOW_MS)).toEqual(attribution);
    expect(consumeSurfaceAdd(1000 + WINDOW_MS)).toBeNull();

    markSurfaceAdd(attribution, 1000);
    expect(consumeSurfaceAdd(1000 + WINDOW_MS + 1)).toBeNull();
  });

  it('a visitor\'s own add, with no mark, carries no attribution', () => {
    consumeSurfaceAdd();
    const event = cartChanges(basketState(4), basketState(3))[0];
    expect(event.name).toBe('add_to_cart');
    expect(event.metadata.source).toBeUndefined();
  });

  describe('addToCartDetailed: the reason a refusal gives', () => {
    const refusedState = (apiError) => ({ basket: { basket: { totalQuantity: 3, products: [] }, error: { apiError } } });
    // The basket records a refusal DURING the add: a new error object replaces
    // whatever it held before the dispatch.
    const refuseOnDispatch = (apiError, before = basketState(3)) => {
      let state = before;
      mockStore.getState.mockImplementation(() => state);
      mockStore.dispatch.mockImplementation(async () => {
        state = refusedState(apiError);
      });
    };

    it('carries the storefront’s own sentence when the basket did not change (nonFieldErrors, a list)', async () => {
      refuseOnDispatch({ nonFieldErrors: ['Bu ürün 0 adetten fazla satın alınamaz.'] });
      const instance = plugin();

      await expect(instance.addToCartDetailed({ id: 's' }, '5380', 1)).resolves.toEqual({
        success: false,
        message: 'Bu ürün 0 adetten fazla satın alınamaz.',
      });
      // The boolean API a custom widget calls is unchanged.
      await expect(instance.addToCartFromSurface({ id: 's' }, '5380', 1)).resolves.toBe(false);
    });

    it('reads a string, nonFieldMessage and snake_case spellings, and skips empty entries', async () => {
      refuseOnDispatch({ nonFieldErrors: 'Stokta yok' });
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toMatchObject({ message: 'Stokta yok' });

      refuseOnDispatch({ nonFieldMessage: ['', '  Limit aşıldı '] });
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toMatchObject({ message: 'Limit aşıldı' });

      refuseOnDispatch({ non_field_errors: ['Out of stock'] });
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toMatchObject({ message: 'Out of stock' });
    });

    it('answers with no message when the store says nothing, or says it in a shape it does not know', async () => {
      mockStore.getState.mockReturnValue({ basket: { basket: { totalQuantity: 3 } } });
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toEqual({ success: false });

      refuseOnDispatch({ nonFieldErrors: [{ code: 1 }, 42] });
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toEqual({ success: false });

      refuseOnDispatch('a bare string');
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toEqual({ success: false });
    });

    it('a dispatch that throws still reports the basket’s recorded reason, never the thrown text', async () => {
      refuseOnDispatch({ nonFieldErrors: ['Bu ürün tükendi'] });
      const record = mockStore.dispatch.getMockImplementation();
      mockStore.dispatch.mockImplementationOnce(async () => {
        await record();
        throw new Error('TypeError: x is undefined');
      });

      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toEqual({
        success: false,
        message: 'Bu ürün tükendi',
      });
    });

    it('never repeats a sentence an EARLIER failure left in the basket', async () => {
      // The basket still holds yesterday's refusal and this add recorded none.
      mockStore.getState.mockReturnValue(refusedState({ nonFieldErrors: ['Eski hata'] }));
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toEqual({ success: false });

      // A new refusal replaces it, and only that one is read.
      refuseOnDispatch({ nonFieldErrors: ['Yeni hata'] }, refusedState({ nonFieldErrors: ['Eski hata'] }));
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toEqual({ success: false, message: 'Yeni hata' });
    });

    it('a successful add carries no message', async () => {
      mockStore.getState.mockReturnValueOnce(basketState(1)).mockReturnValueOnce(basketState(2));
      await expect(plugin().addToCartDetailed({ id: 's' }, '1', 1)).resolves.toEqual({ success: true });
    });
  });
});
