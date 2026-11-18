/**
 * Selwise — cart bridge for Omnife Next (`@akinon/next`): the part with no
 * dependencies.
 *
 * ## The problem it solves
 *
 * A Selwise surface that adds to the basket (a recommendation strip, search)
 * posts the basket API itself. The basket changes on the server; the THEME does
 * not know, because on Omnife Next the basket lives in an RTK Query cache inside
 * the theme's own Redux store, which is not reachable from outside the bundle.
 * Nothing the widget can broadcast reaches it unless the theme listens.
 *
 * This is the listener. It answers Selwise's `selwise:cart:added` event by
 * refreshing the theme's OWN basket queries (so the header count and the mini
 * basket redraw from the server's basket, the same data a native add leaves
 * behind), and optionally opens the mini basket the way a native add does.
 *
 * ## What it does, in order
 *
 *   1. invalidate the basket tags — every mounted `useGetBasketQuery` /
 *      `useGetMiniBasketQuery` refetches;
 *   2. open the mini basket and highlight the added line (`openMiniBasket`,
 *      `highlight`), unless `options.openMiniBasket` is false or the event says
 *      `openCart: false` (the strip chose a Selwise message or nothing);
 *   3. call `options.onAdded(detail)` — the project's own toast, if any.
 *
 * A refused add (`selwise:cart:error`) only calls `options.onError(detail)`:
 * `detail.code` says why (`out_of_stock`, `limit`, …) and `detail.message` is
 * the store's own sentence when it gave one.
 *
 * Only an add the basket CONFIRMED (`status: 'added'`) refreshes anything. An
 * add handed to the storefront's own button (`delegated`) was already handled
 * by the theme.
 *
 * The store never leaves the theme: this file receives three functions and
 * nothing else, so it can be read and tested without Redux. The React wiring is
 * `pz-next/SelwiseCartBridge.tsx`.
 */
(function () {
  var ADDED_EVENT = 'selwise:cart:added';
  var ERROR_EVENT = 'selwise:cart:error';

  /** What a native add invalidates, plus the multi-basket tag some themes read. */
  var DEFAULT_TAGS = ['Basket', 'MiniBasket', 'MultiBasket'];

  /** How long the theme itself keeps a line highlighted after an add. */
  var HIGHLIGHT_MS = 3000;

  /**
   * @param {{
   *   invalidate: (tags: string[]) => void,
   *   openMiniBasket?: () => void,
   *   highlight?: (pk: number | null) => void,
   * }} deps  the three store actions, already bound to the theme's dispatch
   * @param {{
   *   openMiniBasket?: boolean,
   *   tags?: string[],
   *   onAdded?: (detail: object) => void,
   *   onError?: (detail: object) => void,
   * }} [options]
   */
  function createCartBridge(deps, options) {
    var opts = options || {};
    var tags = Array.isArray(opts.tags) && opts.tags.length > 0 ? opts.tags : DEFAULT_TAGS;
    var clearTimer = null;

    /** A basket code is the numeric pk the theme highlights by; anything else is not highlighted. */
    function pkOf(detail) {
      var code = detail && detail.product ? detail.product.cartCode : undefined;
      return typeof code === 'string' && /^\d+$/.test(code) ? Number(code) : null;
    }

    function safely(label, fn) {
      try {
        fn();
      } catch (error) {
        // error-surface: a theme action that throws must not break the add that
        // already succeeded, nor the steps after it; the next page load shows
        // the basket.
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[Selwise] cart bridge: ' + label + ' failed', error);
        }
      }
    }

    function onAdded(event) {
      var detail = event && event.detail;
      if (!detail || detail.status !== 'added') return;

      safely('refresh', function () {
        deps.invalidate(tags);
      });

      // `openCart: false`: the merchant chose their own message over the
      // storefront's cart window, so the mini basket stays shut (the counts
      // above are still refreshed). The event says WHETHER to open, not which
      // mode was chosen: a copied kit does not have to follow the mode names.
      var keepShut = detail.openCart === false;
      if (opts.openMiniBasket !== false && !keepShut) {
        if (typeof deps.openMiniBasket === 'function') {
          safely('open', function () {
            deps.openMiniBasket();
          });
        }
        var pk = pkOf(detail);
        if (pk !== null && typeof deps.highlight === 'function') {
          safely('highlight', function () {
            deps.highlight(pk);
          });
          if (clearTimer) clearTimeout(clearTimer);
          clearTimer = setTimeout(function () {
            clearTimer = null;
            safely('unhighlight', function () {
              deps.highlight(null);
            });
          }, HIGHLIGHT_MS);
        }
      }

      if (typeof opts.onAdded === 'function') {
        safely('onAdded', function () {
          opts.onAdded(detail);
        });
      }
    }

    function onError(event) {
      var detail = event && event.detail;
      if (!detail || typeof opts.onError !== 'function') return;
      safely('onError', function () {
        opts.onError(detail);
      });
    }

    /**
     * Start listening on `doc` and mark the page so Selwise knows a bridge is
     * here. Returns the function that stops listening and removes the mark.
     */
    function attach(doc) {
      doc.addEventListener(ADDED_EVENT, onAdded);
      doc.addEventListener(ERROR_EVENT, onError);
      if (doc.documentElement && typeof doc.documentElement.setAttribute === 'function') {
        doc.documentElement.setAttribute('data-selwise-cart-bridge', 'next');
      }
      return function detach() {
        doc.removeEventListener(ADDED_EVENT, onAdded);
        doc.removeEventListener(ERROR_EVENT, onError);
        if (clearTimer) {
          clearTimeout(clearTimer);
          clearTimer = null;
        }
        if (doc.documentElement && typeof doc.documentElement.removeAttribute === 'function') {
          doc.documentElement.removeAttribute('data-selwise-cart-bridge');
        }
      };
    }

    return { attach: attach, onAdded: onAdded, onError: onError };
  }

  // CommonJS for the unit tests in this kit and for a bundler; harmless in a browser.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createCartBridge: createCartBridge,
      DEFAULT_TAGS: DEFAULT_TAGS,
      ADDED_EVENT: ADDED_EVENT,
      ERROR_EVENT: ERROR_EVENT,
      HIGHLIGHT_MS: HIGHLIGHT_MS,
    };
  }
})();
