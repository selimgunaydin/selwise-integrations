'use strict';

/**
 * The app's favourites, as the product card's heart reads and writes them
 * (`host.toggleWishlist`, `host.isWishlisted`, `host.subscribeWishlist` of
 * `@selwise/react-native/ui`).
 *
 * ## Which action
 *
 * The app's own heart buttons dispatch the product screen's `addToFavourite`,
 * which writes the answer into the PRODUCT SCREEN's state — and that state holds
 * the favourite of the product being viewed. A heart pressed on a recommended
 * card under the product would have turned the viewed product's own heart on.
 * So this module calls the request actions underneath (`favourite._addToFavourite`,
 * `_removeFromFavourite`, `_fetchFavouriteStatus` — the ones those thunks call),
 * and asks the favourites list to refresh itself afterwards so the Favourites
 * screen and its count follow.
 *
 * The app publishes no `addToFav` event for a request made this way, so the
 * card reports the `wishlist` event itself (once); nothing is counted twice.
 *
 * ## What it knows
 *
 * The favourites list is fetched only when its screen opens, so it is not a
 * complete answer to "is this product a favourite". The module answers from what
 * it has seen: the products it added or removed this session, then the loaded
 * list. A product it knows nothing about shows an empty heart.
 *
 * A product is identified by its basket code (`cartCode`, the product `pk`) —
 * what the favourites API takes — and remembered under its `itemCode`, the code
 * the SDK asks about.
 */

/** @typedef {{ itemCode: string, cartCode?: string }} CardProduct */

const ALREADY_THERE = 406;
const GONE = 404;

function statusOf(error) {
  return error && error.response && typeof error.response.status === 'number' ? error.response.status : 0;
}

function pkOf(favourite) {
  const value = favourite && (favourite.pk !== undefined ? favourite.pk : favourite.favouritePk);
  return value === undefined || value === null || value === '' ? null : String(value);
}

/**
 * @param {{
 *   actions: () => ({ favourite?: object, favouriteList?: object } | null),
 *   store: () => ({ getState: Function, dispatch: Function, subscribe?: Function } | null),
 *   requestLogin: () => (boolean | Promise<boolean>),
 *   log?: (message: string) => void,
 * }} deps
 */
function createFavourites(deps) {
  const log = deps.log || (() => undefined);
  /** itemCode -> `{ favouritePk, pk }` (the favourite row's pk may be unknown). Presence means "is a favourite". */
  const known = new Map();
  /** itemCode -> false: removed this session, whatever the loaded list still says. */
  const removed = new Set();
  const listeners = new Set();

  const notify = () => {
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch (error) {
        // error-surface: a listener that throws must not stop the others or the press
      }
    }
  };

  const request = () => {
    const containers = deps.actions();
    return (containers && containers.favourite && containers.favourite.actions) || null;
  };

  const loggedIn = () => {
    const store = deps.store();
    try {
      const state = store && store.getState();
      return !!(state && state.auth && state.auth.auth && state.auth.auth.user);
    } catch (error) {
      return false;
    }
  };

  /** The loaded favourites list's row for a product, by its pk. */
  const listed = (pk) => {
    if (!pk) return null;
    const store = deps.store();
    try {
      const state = store && store.getState();
      const list = state && state.favouriteList;
      if (!list || list.initialSuccess !== true || !Array.isArray(list.favourites)) return null;
      return list.favourites.find((row) => row && row.product && String(row.product.pk) === pk) || null;
    } catch (error) {
      return null;
    }
  };

  /** Keeps the favourites screen and its count in step; a failure to refresh is not the press's. */
  const refreshList = () => {
    const store = deps.store();
    const containers = deps.actions();
    const list = containers && containers.favouriteList && containers.favouriteList.actions;
    if (!store || !list || typeof list.getInitialFavourites !== 'function') return;
    Promise.resolve()
      .then(() => store.dispatch(list.getInitialFavourites()))
      .catch((error) => log('favourites list refresh failed: ' + ((error && error.message) || error)));
  };

  /** The favourite row of a product the module did not add itself. */
  const lookup = async (actions, pk) => {
    if (typeof actions._fetchFavouriteStatus !== 'function') return null;
    const response = await actions._fetchFavouriteStatus('product_id=' + encodeURIComponent(pk) + '&', 1);
    const data = response && response.data;
    const rows = (data && (data.favourites || data.results)) || [];
    return Array.isArray(rows) && rows.length > 0 ? pkOf(rows[0]) : null;
  };

  /**
   * A list that re-answered is the truth again: what this session only assumed
   * is dropped. A removal is always settled by it; an add only when the list is
   * COMPLETE (no next page) and does not hold the product — a first page that
   * lacks it proves nothing.
   */
  const reconcile = (store) => {
    removed.clear();
    let list;
    try {
      list = store.getState().favouriteList;
    } catch (error) {
      return;
    }
    if (!list || list.initialSuccess !== true || !Array.isArray(list.favourites) || list.next) return;
    const present = new Set(list.favourites.filter((row) => row && row.product).map((row) => String(row.product.pk)));
    for (const [code, entry] of Array.from(known)) {
      if (!present.has(entry.pk)) known.delete(code);
    }
  };

  const askLogin = async () => {
    try {
      await deps.requestLogin();
    } catch (error) {
      log('could not open the sign-in screen: ' + ((error && error.message) || error));
    }
    return { success: false };
  };

  return {
    /** `host.toggleWishlist`: the product put among the favourites, or taken out. */
    async toggle(request_) {
      const product = request_ && request_.product;
      const code = product && product.itemCode;
      const pk = product && product.cartCode ? String(product.cartCode) : '';
      const actions = request();
      if (!code || !pk || !actions) {
        log('cannot change favourites: ' + (!actions ? 'the app favourites container is unavailable' : 'the product has no basket code'));
        return { success: false };
      }
      // A guest has no favourites: the app's own heart sends them to sign in.
      if (!loggedIn()) return askLogin();

      try {
        if (request_.wished) {
          let favouritePk = null;
          try {
            const response = await actions._addToFavourite(pk);
            favouritePk = pkOf(response && response.data);
          } catch (error) {
            // Already a favourite: the state asked for already holds.
            if (statusOf(error) !== ALREADY_THERE) throw error;
          }
          known.set(code, { favouritePk, pk });
          removed.delete(code);
        } else {
          let favouritePk = (known.get(code) && known.get(code).favouritePk) || null;
          if (!favouritePk) favouritePk = pkOf(listed(pk)) || (await lookup(actions, pk));
          if (favouritePk) {
            try {
              await actions._removeFromFavourite(favouritePk);
            } catch (error) {
              if (statusOf(error) !== GONE) throw error;
            }
          }
          known.delete(code);
          removed.add(code);
        }
      } catch (error) {
        if (statusOf(error) === 401 || statusOf(error) === 403) return askLogin();
        log('favourites request failed: ' + ((error && error.message) || error));
        return { success: false };
      }
      refreshList();
      notify();
      return { success: true, wished: !!request_.wished };
    },

    /** `host.isWishlisted`. */
    isWishlisted(code, product) {
      if (known.has(code)) return true;
      if (removed.has(code)) return false;
      return listed(product && product.cartCode ? String(product.cartCode) : '') !== null;
    },

    /** `host.subscribeWishlist`: the module's own changes, and the loaded list's. */
    subscribe(listener) {
      listeners.add(listener);
      const store = deps.store();
      let stop = null;
      if (store && typeof store.subscribe === 'function') {
        let last;
        try {
          last = store.getState().favouriteList && store.getState().favouriteList.favourites;
        } catch (error) {
          last = undefined;
        }
        stop = store.subscribe(() => {
          let next;
          try {
            next = store.getState().favouriteList && store.getState().favouriteList.favourites;
          } catch (error) {
            return;
          }
          if (next !== last) {
            last = next;
            reconcile(store);
            listener();
          }
        });
      }
      return () => {
        listeners.delete(listener);
        if (typeof stop === 'function') stop();
      };
    },

    /** Whether the app has a favourites container to call. */
    available() {
      return request() !== null;
    },
  };
}

module.exports = { createFavourites };
