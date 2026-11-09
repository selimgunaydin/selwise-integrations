'use strict';

/**
 * A recommendation widget's products, as a horizontal strip.
 *
 * ## The card is the app's, not ours
 *
 * On the web the merchant's product card is an HTML template they author in the
 * dashboard, and the widget renders it. That cannot carry over: there is no DOM
 * to put it in, and an app that already has a themed product card would end up
 * with two that look different on the same screen.
 *
 * So `renderItem` is the real integration point — the app passes its own card
 * and Selwise passes it a product. The built-in card below exists for the first
 * five minutes of an integration, and to make the demo show something; it is
 * deliberately plain so nobody ships it by accident thinking it is themed.
 *
 * ## Impression and click are not optional
 *
 * Without them the widget's report shows zero impressions and the revenue it
 * drove is attributed to nothing, so the merchant concludes recommendations do
 * not work. `onViewableItemsChanged` reports what was actually on screen rather
 * than what was fetched.
 */

const React = require('react');
const { FlatList, Image, Pressable, StyleSheet, Text, View } = require('react-native');
const { createImpressionLedger, impressionBatch } = require('./strip-impressions.js');
const { stripHeading } = require('./strip-heading.js');

const h = React.createElement;

function formatPrice(product) {
  const formatted = product.formattedPrice || product.priceFormatted;
  if (formatted) return String(formatted);

  const price = Number(product.price);
  if (!Number.isFinite(price)) return '';
  // No currency guessing: the feed's own currency, or nothing. A hardcoded
  // symbol files a Polish merchant's prices as lira.
  const currency = product.currency ? ' ' + String(product.currency) : '';
  return price.toFixed(2).replace('.', ',') + currency;
}

function DefaultCard(props) {
  const { product, onPress } = props;
  const image = product.imageUrl || product.image;
  const original = Number(product.originalPrice);
  const price = Number(product.price);
  const discounted = Number.isFinite(original) && Number.isFinite(price) && original > price;

  return h(
    Pressable,
    { onPress: onPress, style: sheet.card, accessibilityRole: 'button' },
    image
      ? h(Image, { source: { uri: String(image) }, style: sheet.image, resizeMode: 'contain' })
      : h(View, { style: sheet.image }),
    h(Text, { style: sheet.title, numberOfLines: 2 }, String(product.title || product.name || '')),
    h(
      View,
      { style: sheet.priceRow },
      h(Text, { style: sheet.price }, formatPrice(product)),
      discounted
        ? h(
            Text,
            { style: sheet.originalPrice },
            original.toFixed(2).replace('.', ',')
          )
        : null
    )
  );
}

function RecommendationStrip(props) {
  const { plugin, strip, onProductPress, renderItem, title } = props;

  // Hooks before the empty return: a strip that follows the basket goes from
  // products to none and back on the same mount, and a hook skipped on one
  // render is a React error on the next.
  const ledger = React.useRef(createImpressionLedger());
  const current = React.useRef(strip);
  current.current = strip;
  const widgetId = strip && strip.widget ? strip.widget.id : '';

  // Read through refs: a FlatList refuses a new `onViewableItemsChanged` after
  // mount, and the strip it reports on changes as the basket moves.
  const onViewable = React.useCallback(
    (info) => {
      if (!plugin || !plugin.selwise) return;
      const items = (info.viewableItems || []).map((entry) => entry.item);
      const fresh = impressionBatch(ledger.current, items, current.current);
      if (fresh.length === 0) return;
      plugin.recommendation().trackImpression(widgetId, fresh);
    },
    [plugin, widgetId]
  );

  if (!strip || !strip.products || strip.products.length === 0) return null;
  const widget = strip.widget;

  const press = (product, index) => {
    if (plugin) plugin.recommendation().trackClick(widget.id, product.itemCode, index);
    if (typeof onProductPress === 'function') onProductPress(product, strip);
  };

  return h(
    View,
    { style: sheet.strip },
    h(Text, { style: sheet.heading }, stripHeading(widget, title)),
    h(FlatList, {
      data: strip.products,
      horizontal: true,
      showsHorizontalScrollIndicator: false,
      keyExtractor: (product, index) => String(product.itemCode || index),
      contentContainerStyle: sheet.list,
      // 60% visible before it counts: a card peeking in from the edge of the
      // viewport has not been seen.
      viewabilityConfig: { itemVisiblePercentThreshold: 60 },
      onViewableItemsChanged: onViewable,
      renderItem: (entry) =>
        typeof renderItem === 'function'
          ? renderItem({
              product: entry.item,
              index: entry.index,
              onPress: () => press(entry.item, entry.index),
              widget: widget,
            })
          : h(DefaultCard, {
              product: entry.item,
              onPress: () => press(entry.item, entry.index),
            }),
    })
  );
}

/**
 * A strip that follows the basket ("complete to free shipping"): asked when it
 * mounts and again whenever the basket moves, through the SDK's loader
 * (`SelwiseRecommendation.followStrip`). Draws nothing while it has nothing to
 * say — an unmeasured basket, or one already past the threshold.
 */
function CartStrip(props) {
  const { plugin, strip, context, Loader } = props;
  const [shown, setShown] = React.useState(strip);
  const contextKey = JSON.stringify(context || {});

  React.useEffect(
    () => plugin.recommendation().followStrip(strip, context || {}, setShown, Loader),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plugin, strip.widget.id, contextKey, Loader]
  );

  return h(RecommendationStrip, Object.assign({}, props, { strip: shown }));
}

/** Every strip a screen has, in the order the merchant placed them. */
function RecommendationStrips(props) {
  const { plugin, screenName, context, renderItem, onProductPress } = props;
  const [strips, setStrips] = React.useState([]);
  // An SDK before 0.10.0 has no loader: every strip is then asked once.
  const Loader =
    plugin && typeof plugin.recommendationLoader === 'function' ? plugin.recommendationLoader() : null;

  React.useEffect(() => {
    let cancelled = false;
    if (!plugin || !screenName) {
      setStrips([]);
      return undefined;
    }

    plugin
      .recommendation()
      .getStrip(screenName, context || {}, { followCart: Boolean(Loader) })
      .then((result) => {
        if (!cancelled) setStrips(result);
      })
      .catch(() => {
        if (!cancelled) setStrips([]);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, screenName, JSON.stringify(context || {})]);

  if (strips.length === 0) return null;

  return h(
    React.Fragment,
    null,
    strips.map((strip) =>
      strip.followsCart && Loader
        ? h(CartStrip, {
            key: strip.widget.id,
            plugin: plugin,
            strip: strip,
            context: context,
            Loader: Loader,
            renderItem: renderItem,
            onProductPress: onProductPress,
          })
        : h(RecommendationStrip, {
            key: strip.widget.id,
            plugin: plugin,
            strip: strip,
            renderItem: renderItem,
            onProductPress: onProductPress,
          })
    )
  );
}

const sheet = StyleSheet.create({
  strip: { paddingVertical: 12, gap: 8 },
  heading: { fontSize: 15, fontWeight: '600', paddingHorizontal: 16, color: '#1a1a1a' },
  list: { paddingHorizontal: 16, gap: 12 },
  card: { width: 148, gap: 6 },
  image: { width: 148, height: 148, backgroundColor: '#f4f4f4' },
  title: { fontSize: 12, lineHeight: 16, color: '#1a1a1a' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  originalPrice: { fontSize: 11, color: '#9ca3af', textDecorationLine: 'line-through' },
});

module.exports = RecommendationStrip;
module.exports.RecommendationStrip = RecommendationStrip;
module.exports.RecommendationStrips = RecommendationStrips;
module.exports.DefaultCard = DefaultCard;
module.exports.formatPrice = formatPrice;
