const { createCartBridge, DEFAULT_TAGS, HIGHLIGHT_MS } = require('./selwise-cart-bridge-core');

const added = (over = {}) => ({
  detail: { surface: 'recommendation', status: 'added', product: { id: 'p1', cartCode: '7142' }, ...over },
});

const deps = () => ({ invalidate: jest.fn(), openMiniBasket: jest.fn(), highlight: jest.fn() });

describe('Omnife Next cart bridge', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('refreshes the theme basket queries, opens the mini basket and highlights the added line', () => {
    const d = deps();
    createCartBridge(d).onAdded(added());

    expect(d.invalidate).toHaveBeenCalledWith(DEFAULT_TAGS);
    expect(d.openMiniBasket).toHaveBeenCalledTimes(1);
    expect(d.highlight).toHaveBeenCalledWith(7142);
  });

  it('takes the highlight off again after the time the theme itself uses', () => {
    const d = deps();
    createCartBridge(d).onAdded(added());
    jest.advanceTimersByTime(HIGHLIGHT_MS - 1);
    expect(d.highlight).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(d.highlight).toHaveBeenLastCalledWith(null);
  });

  it('a second add restarts the highlight clock instead of clearing the new line early', () => {
    const d = deps();
    const bridge = createCartBridge(d);
    bridge.onAdded(added());
    jest.advanceTimersByTime(2000);
    bridge.onAdded(added({ product: { id: 'p2', cartCode: '9001' } }));
    jest.advanceTimersByTime(2000);
    expect(d.highlight).not.toHaveBeenCalledWith(null);
    jest.advanceTimersByTime(1000);
    expect(d.highlight).toHaveBeenLastCalledWith(null);
  });

  it('only refreshes when asked not to open the mini basket', () => {
    const d = deps();
    createCartBridge(d, { openMiniBasket: false }).onAdded(added());
    expect(d.invalidate).toHaveBeenCalledTimes(1);
    expect(d.openMiniBasket).not.toHaveBeenCalled();
    expect(d.highlight).not.toHaveBeenCalled();
  });

  it('keeps the mini basket shut when the event says openCart is false, but still refreshes the counts', () => {
    const d = deps();
    createCartBridge(d).onAdded(added({ openCart: false }));
    expect(d.invalidate).toHaveBeenCalledTimes(1);
    expect(d.openMiniBasket).not.toHaveBeenCalled();
    expect(d.highlight).not.toHaveBeenCalled();
  });

  it('opens it for the default, which is the store\'s own behaviour', () => {
    const d = deps();
    createCartBridge(d).onAdded(added({ openCart: true }));
    expect(d.openMiniBasket).toHaveBeenCalledTimes(1);
  });

  it('does not highlight a code that is not a numeric pk', () => {
    const d = deps();
    createCartBridge(d).onAdded(added({ product: { id: 'p1', cartCode: 'SKU-1' } }));
    expect(d.invalidate).toHaveBeenCalledTimes(1);
    expect(d.highlight).not.toHaveBeenCalled();
  });

  it('does nothing for an add handed to the storefront, or one that failed', () => {
    const d = deps();
    const bridge = createCartBridge(d);
    bridge.onAdded(added({ status: 'delegated' }));
    bridge.onAdded(added({ status: 'failed' }));
    bridge.onAdded({});
    expect(d.invalidate).not.toHaveBeenCalled();
  });

  it('calls the project toast with the detail', () => {
    const onAdded = jest.fn();
    createCartBridge(deps(), { onAdded }).onAdded(added());
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ status: 'added' }));
  });

  it('a refusal only reaches onError, with the code and the store sentence', () => {
    const d = deps();
    const onError = jest.fn();
    const detail = { status: 'failed', code: 'limit', message: 'Sepete en fazla 4 adet ekleyebilirsiniz.' };
    createCartBridge(d, { onError }).onError({ detail });
    expect(onError).toHaveBeenCalledWith(detail);
    expect(d.invalidate).not.toHaveBeenCalled();
  });

  it('a theme action that throws stops neither the next step nor the add', () => {
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const d = deps();
    d.invalidate.mockImplementation(() => {
      throw new Error('store gone');
    });
    const onAdded = jest.fn();
    createCartBridge(d, { onAdded }).onAdded(added());
    expect(d.openMiniBasket).toHaveBeenCalledTimes(1);
    expect(onAdded).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });

  it('marks the page while attached and removes the mark and the listeners on detach', () => {
    const listeners = {};
    const attrs = {};
    const doc = {
      addEventListener: (type, fn) => (listeners[type] = fn),
      removeEventListener: (type) => delete listeners[type],
      documentElement: {
        setAttribute: (k, v) => (attrs[k] = v),
        removeAttribute: (k) => delete attrs[k],
      },
    };
    const detach = createCartBridge(deps()).attach(doc);
    expect(Object.keys(listeners).sort()).toEqual(['selwise:cart:added', 'selwise:cart:error']);
    expect(attrs['data-selwise-cart-bridge']).toBe('next');

    detach();
    expect(listeners).toEqual({});
    expect(attrs).toEqual({});
  });
});
