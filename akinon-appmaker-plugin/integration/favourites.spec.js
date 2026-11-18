'use strict';

/**
 * The favourites a product card's heart writes: through the request actions
 * (never the product screen's thunk, whose state belongs to the product being
 * viewed), a guest sent to sign in, and the answers an add or a removal can get.
 */

const { createFavourites } = require('./favourites.js');

const product = (itemCode, cartCode) => ({ itemCode, ...(cartCode ? { cartCode } : {}) });

function setup(over) {
  const options = over || {};
  const state = {
    auth: { auth: { user: options.guest ? null : { pk: 1 } } },
    favouriteList: options.list || { initialSuccess: false, favourites: [] },
  };
  const subscribers = [];
  const store = {
    getState: () => state,
    dispatch: jest.fn(async (action) => action),
    subscribe: (listener) => {
      subscribers.push(listener);
      return () => subscribers.splice(subscribers.indexOf(listener), 1);
    },
  };
  const favourite = {
    _addToFavourite: jest.fn(async () => ({ data: { pk: 900 } })),
    _removeFromFavourite: jest.fn(async () => ({})),
    _fetchFavouriteStatus: jest.fn(async () => ({ data: { favourites: [{ pk: 777 }] } })),
    ...(options.favourite || {}),
  };
  const getInitialFavourites = jest.fn(() => ({ type: 'REFRESH' }));
  const requestLogin = jest.fn(async () => true);
  const favourites = createFavourites({
    actions: () => ({ favourite: { actions: favourite }, favouriteList: { actions: { getInitialFavourites } } }),
    store: () => store,
    requestLogin,
  });
  return { favourites, favourite, store, state, subscribers, requestLogin, getInitialFavourites };
}

describe('toggle', () => {
  it('adds through the favourites request with the product pk, remembers it, and refreshes the list', async () => {
    const { favourites, favourite, store, getInitialFavourites } = setup();
    const listener = jest.fn();
    favourites.subscribe(listener);

    await expect(favourites.toggle({ product: product('SKU1', '123'), wished: true })).resolves.toEqual({ success: true, wished: true });

    expect(favourite._addToFavourite).toHaveBeenCalledWith('123');
    expect(favourites.isWishlisted('SKU1', product('SKU1', '123'))).toBe(true);
    expect(getInitialFavourites).toHaveBeenCalled();
    await Promise.resolve();
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'REFRESH' });
    expect(listener).toHaveBeenCalled();
  });

  it('removes the row it added, by the pk the add answered', async () => {
    const { favourites, favourite } = setup();
    await favourites.toggle({ product: product('SKU1', '123'), wished: true });
    await expect(favourites.toggle({ product: product('SKU1', '123'), wished: false })).resolves.toEqual({ success: true, wished: false });

    expect(favourite._removeFromFavourite).toHaveBeenCalledWith('900');
    expect(favourites.isWishlisted('SKU1', product('SKU1', '123'))).toBe(false);
  });

  it('finds the row of a product it did not add — the loaded list first, then the status request', async () => {
    const loaded = setup({ list: { initialSuccess: true, favourites: [{ pk: 55, product: { pk: 123 } }] } });
    await loaded.favourites.toggle({ product: product('SKU1', '123'), wished: false });
    expect(loaded.favourite._removeFromFavourite).toHaveBeenCalledWith('55');
    expect(loaded.favourite._fetchFavouriteStatus).not.toHaveBeenCalled();

    const asked = setup();
    await asked.favourites.toggle({ product: product('SKU2', '456'), wished: false });
    expect(asked.favourite._fetchFavouriteStatus).toHaveBeenCalledWith('product_id=456&', 1);
    expect(asked.favourite._removeFromFavourite).toHaveBeenCalledWith('777');
  });

  it('takes "already a favourite" and "already gone" as the state that was asked for', async () => {
    const already = setup({ favourite: { _addToFavourite: jest.fn(async () => Promise.reject({ response: { status: 406 } })) } });
    await expect(already.favourites.toggle({ product: product('A', '1'), wished: true })).resolves.toEqual({ success: true, wished: true });
    expect(already.favourites.isWishlisted('A', product('A', '1'))).toBe(true);

    const gone = setup({ favourite: { _removeFromFavourite: jest.fn(async () => Promise.reject({ response: { status: 404 } })) } });
    await expect(gone.favourites.toggle({ product: product('B', '2'), wished: false })).resolves.toEqual({ success: true, wished: false });
  });

  it('sends a guest to sign in, and a 401 as well, and changes nothing', async () => {
    const guest = setup({ guest: true });
    await expect(guest.favourites.toggle({ product: product('A', '1'), wished: true })).resolves.toEqual({ success: false });
    expect(guest.requestLogin).toHaveBeenCalledTimes(1);
    expect(guest.favourite._addToFavourite).not.toHaveBeenCalled();

    const expired = setup({ favourite: { _addToFavourite: jest.fn(async () => Promise.reject({ response: { status: 401 } })) } });
    await expect(expired.favourites.toggle({ product: product('A', '1'), wished: true })).resolves.toEqual({ success: false });
    expect(expired.requestLogin).toHaveBeenCalledTimes(1);
    expect(expired.favourites.isWishlisted('A', product('A', '1'))).toBe(false);
  });

  it('refuses what it cannot do — no basket code, no favourites container, a failed request — and says so', async () => {
    const { favourites } = setup();
    await expect(favourites.toggle({ product: product('A'), wished: true })).resolves.toEqual({ success: false });

    const failing = setup({ favourite: { _addToFavourite: jest.fn(async () => Promise.reject(new Error('network'))) } });
    await expect(failing.favourites.toggle({ product: product('A', '1'), wished: true })).resolves.toEqual({ success: false });
    expect(failing.favourites.isWishlisted('A', product('A', '1'))).toBe(false);

    const none = createFavourites({ actions: () => null, store: () => null, requestLogin: () => true });
    expect(none.available()).toBe(false);
    await expect(none.toggle({ product: product('A', '1'), wished: true })).resolves.toEqual({ success: false });
  });
});

describe('isWishlisted and subscribe', () => {
  it('reads the loaded list by the product pk, and an unknown product is an empty heart', () => {
    const { favourites } = setup({ list: { initialSuccess: true, favourites: [{ pk: 1, product: { pk: 123 } }] } });
    expect(favourites.isWishlisted('SKU1', product('SKU1', '123'))).toBe(true);
    expect(favourites.isWishlisted('SKU2', product('SKU2', '999'))).toBe(false);
    expect(favourites.isWishlisted('SKU3')).toBe(false);
  });

  it('tells the card when the loaded list changes, and drops an assumed add a complete list does not hold', async () => {
    const { favourites, state, subscribers } = setup();
    await favourites.toggle({ product: product('SKU1', '123'), wished: true });
    const listener = jest.fn();
    const stop = favourites.subscribe(listener);

    // the favourites list re-answers without the product, and has no next page
    state.favouriteList = { initialSuccess: true, favourites: [{ pk: 2, product: { pk: 5 } }], next: null };
    subscribers.forEach((notify) => notify());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(favourites.isWishlisted('SKU1', product('SKU1', '123'))).toBe(false);

    stop();
    expect(subscribers).toHaveLength(0);
  });

  it('keeps an assumed add when the list that re-answered is only a first page', async () => {
    const { favourites, state, subscribers } = setup();
    await favourites.toggle({ product: product('SKU1', '123'), wished: true });
    favourites.subscribe(() => undefined);
    state.favouriteList = { initialSuccess: true, favourites: [{ pk: 2, product: { pk: 5 } }], next: 'page-2' };
    subscribers.forEach((notify) => notify());
    expect(favourites.isWishlisted('SKU1', product('SKU1', '123'))).toBe(true);
  });
});
