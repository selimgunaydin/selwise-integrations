'use strict';

/**
 * The heading a recommendation strip is drawn with.
 *
 * Plain Node, like `strip-impressions.js`, so it is tested without React
 * Native; `RecommendationStrip` calls it.
 *
 * The screen's own `title` prop wins. Then the widget's `title` — the
 * shopper-facing heading the merchant writes in the dashboard, and the field a
 * `config_override` experiment arm changes (the SDK applies it to
 * `strip.widget`). The widget's `name` is the merchant's INTERNAL label
 * ("PDP — Benzer Ürünler"); it is the last resort for a widget saved without
 * a title. Reading `name` first, as this did, printed the internal label to
 * shoppers and made a title experiment draw two identical arms.
 */
function stripHeading(widget, title) {
  for (const candidate of [title, widget && widget.title, widget && widget.name]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return '';
}

module.exports = { stripHeading };
