/**
 * Selwise — Akinon Project Zero mini-basket hook
 *
 * ## The problem it solves
 *
 * A Selwise surface that adds to the basket (a recommendation strip, "add all
 * to basket") posts `/baskets/basket/` itself. The basket changes on the
 * server; the THEME does not know. The widget then tells the page in every way
 * a PZ theme is known to listen (apps/client `notifyAkinonBasketUpdated`):
 *
 *   • `refresh-basket` on `document` — current PZ themes re-fetch the basket
 *     into their store, and the header count and mini basket re-render;
 *   • `<pz-mini-basket>` / `.js-mini-basket` — opened with the added product
 *     highlighted, as the native add does;
 *   • `window.akinonBasket.refresh()`, when a theme defines it.
 *
 * An OLDER Django theme draws the header count on the server and listens to
 * none of these: the product is in the basket and the header still says 0
 * until the next page load. This hook is for that theme.
 *
 * ## What it does
 *
 * On the widget's `akinon:basket:updated` (whose `detail.basket` is the
 * basket the add returned):
 *
 *   1. every element marked `data-selwise-basket-count` gets the basket's
 *      quantity — mark the theme's header counter once, in the template;
 *   2. `window.selwiseRefreshMiniBasket(basket)` is called when the theme
 *      defines it — the place for anything theme-specific (re-render the mini
 *      basket fragment, open a drawer).
 *
 * Nothing else is touched, and nothing runs when the theme handles the event
 * itself — a theme that listens to `refresh-basket` needs no mark and no
 * function, and then this hook does nothing.
 */
(function () {
  var COUNT_ATTRIBUTE = 'data-selwise-basket-count';

  /**
   * The basket's item count from whatever the add answered with. PZ answers
   * `{ basket: { total_quantity, basketitem_set } }`; some versions put the
   * basket at the top level.
   */
  function basketQuantity(payload) {
    var basket = payload && payload.basket ? payload.basket : payload;
    if (!basket || typeof basket !== 'object') return null;
    var total = Number(basket.total_quantity !== undefined ? basket.total_quantity : basket.totalQuantity);
    if (isFinite(total) && total >= 0) return Math.floor(total);
    var lines = basket.basketitem_set || basket.basketItems || basket.items;
    if (!Array.isArray(lines)) return null;
    var sum = 0;
    for (var i = 0; i < lines.length; i += 1) {
      var quantity = Number(lines[i] && lines[i].quantity);
      if (isFinite(quantity) && quantity > 0) sum += quantity;
    }
    return sum;
  }

  function onBasketUpdated(event, root) {
    var scope = root || (typeof window !== 'undefined' ? window : {});
    var doc = scope.document;
    var basket = event && event.detail ? event.detail.basket : undefined;
    var quantity = basketQuantity(basket);

    if (quantity !== null && doc && typeof doc.querySelectorAll === 'function') {
      var marked = doc.querySelectorAll('[' + COUNT_ATTRIBUTE + ']');
      for (var i = 0; i < marked.length; i += 1) marked[i].textContent = String(quantity);
    }

    if (typeof scope.selwiseRefreshMiniBasket === 'function') {
      try {
        scope.selwiseRefreshMiniBasket(basket);
      } catch (error) {
        // error-surface: a theme callback that throws must not break the add
        // that already succeeded; the next page load shows the basket.
        if (scope.console && typeof scope.console.debug === 'function') {
          scope.console.debug('[Selwise] selwiseRefreshMiniBasket failed', error);
        }
      }
    }
  }

  function install(root) {
    var scope = root || window;
    if (!scope.document || scope.__selwiseBasketHookInstalled) return;
    scope.__selwiseBasketHookInstalled = true;
    scope.document.addEventListener('akinon:basket:updated', function (event) {
      onBasketUpdated(event, scope);
    });
  }

  if (typeof window !== 'undefined') {
    install(window);
  }

  // Exported for the unit tests in this kit; harmless in production.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      basketQuantity: basketQuantity,
      onBasketUpdated: onBasketUpdated,
      install: install,
      COUNT_ATTRIBUTE: COUNT_ATTRIBUTE,
    };
  }
})();
