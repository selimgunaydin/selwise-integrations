'use strict';

const { screenUrl } = require('../screens.js');

/**
 * Recommendation reads for an App Maker screen.
 *
 * ## No UI here, deliberately
 *
 * The App Maker app already owns themed product cards, sliders and list rows
 * under `src/components` and `src/themeConfigs`. A Selwise-drawn card would
 * look foreign beside them and would have to re-implement the merchant's whole
 * theme. This returns data; the screen renders it with the components it has.
 *
 * ## Placements
 *
 * `getWidgets(screen)` asks the server for the widgets targeted at that
 * screen's synthetic URL. When a merchant's widgets are configured to show on
 * all pages — which is the norm, because on web the anchor element is the page
 * condition — the server returns all of them and the app must choose. The
 * optional `recommendation.placements` config does that choosing by widget
 * name or id, so the same Selwise account can drive both surfaces without a
 * second set of widgets.
 */
class SelwiseRecommendation {
  constructor(params) {
    this.selwise = params.selwise;
    this.config = params.config || {};
    this.placements = (this.config.recommendation && this.config.recommendation.placements) || {};
    this.debug = !!this.config.debug;
  }

  /**
   * Swallowing a failure is right for a screen — it must render what it has —
   * but swallowing it SILENTLY is not. A wrong `apiUrl` returns 404 on every
   * call and looked exactly like an empty catalogue until this line existed.
   */
  onError(where, error) {
    if (!this.debug) return;
    // eslint-disable-next-line no-console
    console.log('[Selwise] recommendation ' + where + ' failed: ' + ((error && error.message) || error));
  }

  /** Widgets for a screen, in the order the merchant placed them. */
  async getWidgets(screenName) {
    if (!this.selwise) return [];

    const pageUrl = screenUrl(screenName);
    const widgets = await this.selwise.getRecommendationWidgets(pageUrl).catch((error) => {
      this.onError('getWidgets(' + pageUrl + ')', error);
      return [];
    });
    return filterByPlacement(widgets, this.placements[pageUrl]);
  }

  /**
   * Products for one widget.
   *
   * `context` carries what the screen knows: the product being viewed, the
   * category, the basket contents. Strategies that need it (`similar_products`,
   * `bought_together`) return nothing without it, which looks like an empty
   * catalogue rather than a missing argument.
   */
  async getProducts(widgetId, context) {
    if (!this.selwise || !widgetId) return { widgetId, products: [] };

    return this.selwise.getRecommendationProducts(widgetId, normalizeContext(context)).catch((error) => {
      this.onError('getProducts(' + widgetId + ')', error);
      return { widgetId, products: [], productCard: null, meta: null };
    });
  }

  /**
   * The strip a listed widget is drawn as for this visitor: its A/B arm
   * applied by the SDK (`resolveRecommendationWidget`, 0.11.0+) — the module a
   * `different_module` arm draws in its place, a `config_override` arm's
   * title, or nothing at all (`hidden`). Asks for no products.
   *
   * On an older SDK strips have no arms: the listed widget is drawn as it is,
   * which is what every strip was before.
   */
  async resolveWidget(widget) {
    const asListed = { widget, hidden: false, experiment: null, liveCartRequired: undefined };
    if (!this.selwise || typeof this.selwise.resolveRecommendationWidget !== 'function') return asListed;

    const resolved = await this.selwise.resolveRecommendationWidget(widget).catch((error) => {
      this.onError('resolveWidget(' + (widget && widget.id) + ')', error);
      return null;
    });
    if (!resolved) return asListed;
    return {
      widget: resolved.widget || widget,
      hidden: resolved.hidden === true,
      experiment: resolved.experiment || null,
      liveCartRequired: resolved.liveCartRequired,
    };
  }

  /**
   * One call per screen: the widgets plus their products.
   *
   * `options.followCart` is for a caller that keeps a "complete to free
   * shipping" strip (`eligibilityFlags.liveCartRequired`) in step with the
   * basket (`followStrip`, `<RecommendationStrips />`). Such a strip is
   * returned WITHOUT products and with `followsCart: true`: its answer is
   * about a basket that moves, so the follower asks for it itself — asking
   * here too would be a second request for the same answer. Without the
   * option a cart strip is asked once, like any other, and an empty answer
   * (an unmeasured basket) leaves it out.
   *
   * Each strip is the one the visitor's A/B arm DRAWS (`resolveWidget`):
   * `strip.widget` is the arm's module in a `different_module` arm — its id,
   * its title, its products — or the listed widget with a `config_override`
   * arm's title, and a strip the arm draws nothing for is left out. Whether a
   * strip follows the basket is decided on the drawn strip too: an arm can
   * put a "complete to free shipping" strip in the slot of one that never
   * reads the basket. The placement config matched the LISTED widget, by the
   * name the merchant knows it by, before any of this.
   */
  async getStrip(screenName, context, options) {
    const followCart = Boolean(options && options.followCart);
    const widgets = await this.getWidgets(screenName);
    const strips = [];

    for (const listed of widgets) {
      const drawn = await this.resolveWidget(listed);
      if (drawn.hidden) continue;
      const widget = drawn.widget;
      const experiment = drawn.experiment ? { experiment: drawn.experiment } : {};
      const follows =
        typeof drawn.liveCartRequired === 'boolean' ? drawn.liveCartRequired : readsLiveCart(widget);

      if (followCart && follows) {
        strips.push({ widget, products: [], productCard: null, followsCart: true, ...experiment });
        continue;
      }
      const result = await this.getProducts(widget.id, context);
      const answered = result.widget || widget;
      // Only the answer knew this strip reads the basket (a list without the
      // flag). With a follower it is handed over unasked-for: the follower's
      // first answer replaces this one, and drawing both would be two
      // displays — two impressions — of one strip.
      if (followCart && result.liveCartRequired === true) {
        strips.push({ widget: answered, products: [], productCard: null, followsCart: true, ...experiment });
        continue;
      }
      if (result.products.length === 0) continue;
      strips.push({
        widget: answered,
        products: result.products,
        productCard: result.productCard || null,
        ...experiment,
      });
    }

    return strips;
  }

  /**
   * Keep one strip that answers the basket in step with it, through the
   * SDK's `RecommendationWidgetLoader` (`Loader`, from
   * `Selwise.recommendationLoader()`): asked when the strip mounts, again 300
   * ms after the basket last moved, swapped in place, empty once the basket
   * passes the threshold, and not asked at all while the basket is unknown.
   * `onStrip` receives the strip to draw, with `appearance` — the loader's
   * count of times it came back on screen, which is what earns an impression
   * (`impressionBatch`). Returns the stop function.
   */
  followStrip(strip, context, onStrip, Loader) {
    if (!this.selwise || typeof Loader !== 'function' || !strip || !strip.widget) return () => {};
    const loader = new Loader(this.selwise, strip.widget.id, normalizeContext(context), (state) => {
      const experiment = state.experiment || strip.experiment;
      onStrip({
        // The answer's description of the strip once there is one: the arm's
        // module or title, as the SDK applied it to this request.
        widget: state.widget || strip.widget,
        products: state.products,
        productCard: state.productCard || strip.productCard || null,
        followsCart: state.followsCart,
        appearance: state.appearance,
        ...(experiment ? { experiment } : {}),
      });
    });
    loader.load();
    return () => loader.stop();
  }

  /**
   * Impression and click.
   *
   * Both are what attribution reads: without the click there is no touchpoint,
   * so a recommendation-driven order is credited to nothing and the widget's
   * revenue panel stays empty while the widget is working.
   *
   * Pass `strip.widget.id` — the strip drawn. The SDK records an A/B arm's
   * exposure with the strip's first impression, once, and maps a listed id
   * to the arm's strip if it is handed one.
   */
  trackImpression(widgetId, products) {
    if (!this.selwise || !widgetId) return;
    const codes = (products || []).map((product) => product.itemCode || product.code).filter(Boolean);
    this.selwise.trackRecommendationImpression(widgetId, codes);
  }

  trackClick(widgetId, itemCode, position) {
    if (!this.selwise || !widgetId || !itemCode) return;
    this.selwise.trackRecommendationClick(widgetId, itemCode, position);
  }
}

/**
 * The endpoint's field for "the product being looked at" is `currentProductId`.
 *
 * Every other surface of this platform calls that value an item code, so
 * `productItemCode` / `itemCode` / `sku` are what a caller reaches for — and
 * sending one of those is accepted with a 200 and silently ignored, so
 * `similar_products` recommends the product you are already looking at and
 * `bought_together` returns the generic fallback. The aliases are translated
 * rather than rejected: a broken strip on a merchant's PDP is a worse outcome
 * than a quietly corrected key.
 */
const CURRENT_PRODUCT_ALIASES = ['productItemCode', 'itemCode', 'sku', 'productCode'];

function normalizeContext(context) {
  if (!context || typeof context !== 'object') return {};

  const out = { ...context };
  if (!out.currentProductId) {
    for (const alias of CURRENT_PRODUCT_ALIASES) {
      if (out[alias]) {
        out.currentProductId = out[alias];
        break;
      }
    }
  }
  for (const alias of CURRENT_PRODUCT_ALIASES) delete out[alias];
  return out;
}

/** The widget list flags a strip that answers the live cart (`free_shipping_complement`). */
function readsLiveCart(widget) {
  return Boolean(
    widget && widget.eligibilityFlags && widget.eligibilityFlags.liveCartRequired === true
  );
}

/**
 * Keep the widgets a placement names, in the placement's order.
 *
 * Matching accepts an id or a name: an id is stable but unreadable in a config
 * file, and a name is what a merchant actually knows their widget by.
 */
function filterByPlacement(widgets, placement) {
  const list = Array.isArray(widgets) ? widgets : [];
  if (!Array.isArray(placement) || placement.length === 0) return list;

  const wanted = placement.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
  const picked = [];

  for (const key of wanted) {
    const match = list.find(
      (widget) =>
        String(widget.id || '').toLowerCase() === key ||
        String(widget.name || '').trim().toLowerCase() === key
    );
    if (match && !picked.includes(match)) picked.push(match);
  }

  return picked;
}

module.exports = SelwiseRecommendation;
module.exports.filterByPlacement = filterByPlacement;
module.exports.normalizeContext = normalizeContext;
module.exports.readsLiveCart = readsLiveCart;
