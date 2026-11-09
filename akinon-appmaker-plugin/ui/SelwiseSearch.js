'use strict';

/**
 * Selwise search on a screen.
 *
 * ## Why this exists next to the app's own search
 *
 * An App Maker app already searches — through the storefront's
 * `/autocomplete/`. Selwise search is a different thing: it reads the synced
 * catalogue, applies the merchant's synonyms, redirects and zero-result rules,
 * and reports what people looked for. A merchant switching to it wants those
 * rules to apply; a merchant evaluating it wants both side by side.
 *
 * So this is a drop-in results view rather than a replacement screen: the app
 * keeps its own input and layout and hands the query over.
 *
 * ## Who logs what
 *
 * `SDK.search()` already emits `search_query`, or `search_zero_results` when
 * nothing came back — so this component must NOT log the query itself. Doing
 * both is not a harmless duplicate: it doubles every number in the merchant's
 * search report and doubles the zero-result count they use to decide which
 * synonyms to add.
 *
 * The click is the one event the SDK cannot send on its own, because only the
 * view knows which row was tapped and where it sat. Without it click-through is
 * zero and a working search looks like a search nobody uses.
 */

const React = require('react');
const { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } = require('react-native');

const { formatPrice } = require('./RecommendationStrip.js');

const h = React.createElement;

/** Debounce, so a four-letter query is one request rather than four. */
function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function ResultRow(props) {
  const { product, onPress } = props;
  const image = product.imageUrl || product.image;

  return h(
    Pressable,
    { onPress: onPress, style: sheet.row, accessibilityRole: 'button' },
    image
      ? h(Image, { source: { uri: String(image) }, style: sheet.thumb, resizeMode: 'contain' })
      : h(View, { style: sheet.thumb }),
    h(
      View,
      { style: sheet.rowText },
      h(Text, { style: sheet.rowTitle, numberOfLines: 2 }, String(product.title || '')),
      h(Text, { style: sheet.rowPrice }, formatPrice(product))
    )
  );
}

function SelwiseSearch(props) {
  const {
    plugin,
    query,
    limit,
    minChars,
    debounceMs,
    renderItem,
    onProductPress,
    renderEmpty,
  } = props;

  const debouncedQuery = useDebounced(String(query || ''), debounceMs === undefined ? 300 : debounceMs);
  const threshold = minChars === undefined ? 2 : minChars;

  const [state, setState] = React.useState({ status: 'idle', hits: [], total: 0 });

  React.useEffect(() => {
    let cancelled = false;
    const term = debouncedQuery.trim();

    if (term.length < threshold) {
      setState({ status: 'idle', hits: [], total: 0 });
      return undefined;
    }

    setState((prev) => ({ ...prev, status: 'loading' }));

    plugin
      .search(term, { limit: limit || 20 })
      .then((result) => {
        if (cancelled) return;
        // A merchant redirect ("kargo" -> the shipping page) REPLACES the
        // result list, and `plugin.search` has already navigated. Rendering
        // `hits` here would flash "no results found" for a rule the merchant
        // wrote on purpose — the browser widget closes its results UI before
        // navigating for the same reason.
        if (result.redirect) {
          setState({ status: 'redirected', hits: [], total: 0 });
          return;
        }
        const hits = result.hits || [];
        setState({ status: 'done', hits: hits, total: result.total || hits.length });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', hits: [], total: 0 });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, debouncedQuery, threshold, limit]);

  const press = (product, index) => {
    plugin.trackSearchClick(debouncedQuery.trim(), product.itemCode, index);
    if (typeof onProductPress === 'function') onProductPress(product);
  };

  if (state.status === 'loading' && state.hits.length === 0) {
    return h(View, { style: sheet.centre }, h(ActivityIndicator, {}));
  }

  // Nothing to draw: the visitor is on their way to the redirect target.
  if (state.status === 'redirected') return null;

  if (state.status === 'done' && state.hits.length === 0) {
    return typeof renderEmpty === 'function'
      ? renderEmpty(debouncedQuery.trim())
      : h(
          View,
          { style: sheet.centre },
          h(Text, { style: sheet.emptyText }, '"' + debouncedQuery.trim() + '" için sonuç bulunamadı')
        );
  }

  return h(FlatList, {
    data: state.hits,
    keyExtractor: (product, index) => String(product.itemCode || index),
    keyboardShouldPersistTaps: 'handled',
    renderItem: (entry) =>
      typeof renderItem === 'function'
        ? renderItem({
            product: entry.item,
            index: entry.index,
            onPress: () => press(entry.item, entry.index),
          })
        : h(ResultRow, { product: entry.item, onPress: () => press(entry.item, entry.index) }),
  });
}

const sheet = StyleSheet.create({
  centre: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  thumb: { width: 56, height: 56, backgroundColor: '#f4f4f4' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13, color: '#1a1a1a' },
  rowPrice: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
});

module.exports = SelwiseSearch;
module.exports.SelwiseSearch = SelwiseSearch;
module.exports.ResultRow = ResultRow;
