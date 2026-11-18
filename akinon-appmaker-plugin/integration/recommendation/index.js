'use strict';

const { screenUrl } = require('../screens.js');

/**
 * Recommendation reads for an App Maker screen, by the route's own name.
 *
 * ## What this is
 *
 * The SDK's strip service (`Selwise.strips`) is where a screen's strips are
 * loaded and shared; this only translates what an App Maker screen knows — its
 * route name, `ProductDetail` — into the screen's address (`app://product`) the
 * service is keyed by. The ready-made components (`ui/`) draw from the service
 * directly; this is for a screen that draws its own cards.
 *
 * ## Placements
 *
 * `getWidgets(screen)` asks the server for the widgets targeted at that
 * screen's synthetic URL. When a merchant's widgets are configured to show on
 * all pages — which is the norm, because on web the anchor element is the page
 * condition — the server returns all of them and the app must choose. The
 * optional `recommendation.placements` config does that choosing by widget
 * name or id (the plugin hands it to the service once, at start), so the same
 * Selwise account can drive both surfaces without a second set of widgets.
 */
class SelwiseRecommendation {
  constructor(params) {
    this.selwise = params.selwise;
    this.config = params.config || {};
  }

  /** The SDK's strip service, or null before the SDK exists (or on one that predates it). */
  service() {
    return (this.selwise && this.selwise.strips) || null;
  }

  /** Widgets for a screen, in the order the merchant placed them. */
  async getWidgets(screenName) {
    const strips = this.service();
    return strips ? strips.widgets(screenUrl(screenName, this.config.screenRoutes)) : [];
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
    const strips = this.service();
    if (!strips || !widgetId) return { widgetId, products: [] };
    return strips.products(widgetId, context);
  }

  /**
   * The strip a listed widget is drawn as for this visitor: its A/B arm applied
   * — the module a `different_module` arm draws in its place, a
   * `config_override` arm's title, or nothing at all (`hidden`). Asks for no
   * products.
   */
  async resolveWidget(widget) {
    const strips = this.service();
    if (!strips) return { widget, hidden: false, experiment: null, liveCartRequired: undefined };
    return strips.resolveWidget(widget);
  }

  /**
   * One call per screen: the widgets plus their products — `[{ listed, widget,
   * products, productCard, experiment? }]`, each the strip the visitor's A/B arm
   * draws. `listed` is the widget the server LISTED for the screen: a strip's
   * PLACE (which slot of the screen) is the listed widget's, even when the arm
   * draws another module in it.
   *
   * `options.followCart` is for a caller that keeps a "complete to free
   * shipping" strip in step with the basket (`followStrip`): such a strip is
   * returned WITHOUT products and with `followsCart: true`, and the follower asks
   * for it itself.
   */
  async getStrip(screenName, context, options) {
    const strips = this.service();
    return strips ? strips.strips(screenUrl(screenName, this.config.screenRoutes), context, options || {}) : [];
  }

  /**
   * Keep one strip that answers the basket in step with it: asked when the strip
   * mounts, again 300 ms after the basket last moved, swapped in place, empty
   * once the basket passes the threshold, and not asked at all while the basket
   * is unknown. `onStrip` receives the strip to draw, with `appearance` — the
   * count of times it came back on screen, which is what earns an impression.
   * Returns the stop function.
   */
  followStrip(strip, context, onStrip) {
    const strips = this.service();
    return strips ? strips.follow(strip, context, onStrip) : () => {};
  }

  /**
   * Impression and click.
   *
   * Both are what attribution reads: without the click there is no touchpoint,
   * so a recommendation-driven order is credited to nothing and the widget's
   * revenue panel stays empty while the widget is working.
   *
   * Pass `strip.widget.id` — the strip drawn. The SDK records an A/B arm's
   * exposure with the strip's first impression, once.
   */
  trackImpression(widgetId, products, options) {
    const strips = this.service();
    if (strips) strips.trackImpression(widgetId, products, options);
  }

  trackClick(widgetId, itemCode, position) {
    const strips = this.service();
    if (strips) strips.trackClick(widgetId, itemCode, position);
  }
}

module.exports = SelwiseRecommendation;
