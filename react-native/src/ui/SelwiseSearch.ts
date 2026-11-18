import { createElement as h, useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSelwiseSearch } from '../react/use-selwise-search.js';
import type { SelwiseProduct } from '../types.js';
import { SelwiseImage, SelwiseText as Text, useBrandTheme, useNavigate } from './host-hooks.js';
import { formatPrice } from './RecommendationStrip.js';

/**
 * Selwise search on a screen.
 *
 * ## Why this exists next to the app's own search
 *
 * An app already searches — through its storefront's own endpoint. Selwise
 * search is a different thing: it reads the synced catalogue, applies the
 * merchant's synonyms, redirects and zero-result rules, and reports what people
 * looked for. A merchant switching to it wants those rules to apply; a merchant
 * evaluating it wants both side by side.
 *
 * So this is a drop-in results view rather than a replacement screen: the app
 * keeps its own input and layout and hands the query over.
 *
 * ## Who logs what
 *
 * `client.search()` already emits `search_query`, or `search_zero_results` when
 * nothing came back — so this component must NOT log the query itself. Doing
 * both is not a harmless duplicate: it doubles every number in the merchant's
 * search report and doubles the zero-result count they use to decide which
 * synonyms to add.
 *
 * The click is the one event the client cannot send on its own, because only the
 * view knows which row was tapped and where it sat. Without it click-through is
 * zero and a working search looks like a search nobody uses.
 */

export function ResultRow(props: { product: SelwiseProduct; onPress: () => void }): ReactElement {
  const { product, onPress } = props;
  const image = product.imageUrl || (product as { image?: string }).image;

  return h(
    Pressable,
    { onPress: onPress, style: sheet.row, accessibilityRole: 'button' },
    image
      ? h(SelwiseImage, { uri: String(image), style: sheet.thumb, resizeMode: 'contain' })
      : h(View, { style: sheet.thumb }),
    h(
      View,
      { style: sheet.rowText },
      h(Text, { style: sheet.rowTitle, numberOfLines: 2 }, String(product.title || '')),
      h(Text, { style: sheet.rowPrice }, formatPrice(product))
    )
  );
}

export interface SelwiseSearchProps {
  /** What the shopper typed — the app keeps its own input. */
  query: string;
  /** Results per page. Default: the channel's own (Search → Behaviour). */
  limit?: number;
  /** Below this length nothing is searched. Default: the channel's own. */
  minChars?: number;
  /** Wait after typing, in ms. Default: the channel's own. */
  debounceMs?: number;
  renderItem?: (info: { product: SelwiseProduct; index: number; onPress: () => void }) => ReactElement | null;
  /** A result was tapped. The click is already reported. Without it the product's link opens through `host.navigate`. */
  onProductPress?: (product: SelwiseProduct) => void;
  renderEmpty?: (query: string) => ReactNode;
}

/**
 * The simple results list: the app keeps its input and the screen around it, and
 * this draws what the query found — a row per product, more as the list is
 * scrolled, the merchant's own "no results" sentence, and nothing while search is
 * off for the visitor or a redirect sends them elsewhere. For the whole screen
 * (suggestions, categories, the add to the basket) use `<SelwiseSearchPanel>`.
 */
export function SelwiseSearch(props: SelwiseSearchProps): ReactElement | null {
  const { query, limit, minChars, debounceMs, renderItem, onProductPress, renderEmpty } = props;
  useBrandTheme();
  const navigate = useNavigate();
  const search = useSelwiseSearch({
    ...(limit !== undefined ? { limit } : {}),
    ...(minChars !== undefined ? { minChars } : {}),
    ...(debounceMs !== undefined ? { debounceMs } : {}),
  });
  const { setQuery, open, redirect, status } = search;

  useEffect(() => {
    setQuery(String(query || ''));
  }, [query, setQuery]);

  // The list is on screen: that is the search being open.
  useEffect(() => {
    open('typing');
  }, [open]);

  const redirected = useRef<string | null>(null);
  useEffect(() => {
    // A merchant redirect ("kargo" -> the shipping page) REPLACES the result
    // list: the visitor is sent there, and "no results" is never drawn for it.
    if (!redirect || redirected.current === redirect) return;
    redirected.current = redirect;
    void navigate({ url: redirect, source: 'search' });
  }, [redirect, navigate]);

  const press = (product: SelwiseProduct, index: number) => {
    search.trackClick(product.itemCode, index);
    if (typeof onProductPress === 'function') {
      onProductPress(product);
    } else if (product.url) {
      void navigate({ url: product.url, source: 'search' });
    }
  };

  // Search switched off or in test mode for a client that is not, or a redirect
  // in flight: nothing to draw, and no "no results" sentence either.
  if (status !== 'ready' || redirect) return null;

  if (search.loading && search.results.length === 0) {
    return h(View, { style: sheet.centre }, h(ActivityIndicator, { accessibilityLabel: search.t('loading') }));
  }

  if (search.isZeroResults) {
    const term = search.query.trim();
    return typeof renderEmpty === 'function'
      ? (renderEmpty(term) as ReactElement | null)
      : h(View, { style: sheet.centre }, h(Text, { style: sheet.emptyText }, search.t('empty')));
  }

  return h(FlatList<SelwiseProduct>, {
    data: search.results,
    keyExtractor: (product, index) => String(product.itemCode || index),
    keyboardShouldPersistTaps: 'handled',
    onEndReachedThreshold: 0.5,
    onEndReached: search.hasMore ? search.loadMore : undefined,
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
