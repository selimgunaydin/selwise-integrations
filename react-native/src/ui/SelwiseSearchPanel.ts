import { createElement as h, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { pickId } from './pick-ids.js';
import { useSelwiseHost } from '../react/context.js';
import { useLocale } from '../react/use-selwise-state.js';
import { useSelwiseSearch, type SearchCategoryChip } from '../react/use-selwise-search.js';
import type { SearchSuggestionKind, SelwiseProduct } from '../types.js';
import { isSoldOut } from '../vendor/product-card-variant-logic.js';
import { defaultSearchSettings, type SearchCategoryNaming, type SearchSettings, type SearchTextKey } from '../vendor/search-settings.js';
import { categoryChipModel, type CategoryChip } from '../vendor/search-category-scope.js';
import { formatCategoryName } from '../core/search-format.js';
import type { SearchTextVars } from '../core/search-config.js';
import { useBrandTheme, useNavigate, useSafeAreaInsets } from './host-hooks.js';
import { SearchResultItem, type SearchCartState } from './search-result-item.js';
import { useSearchCard, type SearchCard } from './search-card.js';
import { SearchSuggestionsView, type RenderSuggestionInfo } from './search-suggestions-view.js';
import { searchTheme, styler, type SearchTheme } from './search-styles.js';
import { SearchFont, SearchText as Text } from './search-text-view.js';

/**
 * Selwise search, as a whole screen, drawn from what the merchant set in
 * Search: the placeholder and every sentence, the suggestions of the empty box
 * in their order, the results in their layout with exactly the fields chosen,
 * the category chips, the add to the basket and the look (colours, corners,
 * density, the input, the grid).
 *
 * ```tsx
 * <SelwiseSearchPanel
 *   onProductPress={(product) => router.push(`/product/${product.itemCode}`)}
 *   onViewAll={(query) => router.push({ pathname: '/search', params: { q: query } })}
 *   onClose={() => router.back()}
 * />
 * ```
 *
 * Without `query` the panel draws its own input; with it, the app's own box
 * drives the panel and none is drawn. It draws nothing while search is off for
 * the visitor (`onUnavailable` says so, to show the app's own search) and while
 * a merchant's redirect sends them elsewhere — except a bar with the back button
 * when `onBack` is given, so a screen made of the panel never leaves the visitor
 * without a way out.
 *
 * As a route of its own, `onBack`, `initialQuery` and `safeArea` make it a whole
 * screen: a back arrow before the input, a term to start from (a link to
 * "search for X"), and the status bar and home indicator kept clear.
 *
 * Reported for you, once each: the search, the open and close of the screen,
 * a tapped suggestion, the tapped result and the add to the basket. Draw with
 * `renderItem` to use the app's own card; `unstyled` keeps the structure and
 * draws no style at all.
 */

export interface SearchInputRenderProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  placeholder: string;
  clearLabel: string;
  autoFocus: boolean;
}

export interface RenderSearchItemInfo {
  product: SelwiseProduct;
  index: number;
  layout: 'grid' | 'list' | 'compact';
  /** Taps the result: reports the click and opens it. */
  onPress: () => void;
  /** Adds it to the basket and reports the add — undefined when the basket cannot be reached. */
  onAddToCart?: () => void;
  cartState: SearchCartState;
  /** The catalogue calls it sold out (`isSoldOut`): draw the button disabled, or none. `onAddToCart` ignores a press. */
  soldOut: boolean;
  /** Why the basket refused, in the platform's own words, while `cartState` is `error`; absent when it gave none. */
  cartMessage?: string;
}

export interface RenderSearchEmptyInfo {
  query: string;
  /** Other terms to try. */
  didYouMean: string[];
  /** Searches another term. */
  onPickTerm: (term: string) => void;
  /** The sentence the merchant wrote for "no results". */
  text: string;
  /** The category the search was narrowed to (the name it filters by), or null. A narrowed search with no results is not an empty catalogue: say so. */
  category: string | null;
  /** Takes the category off and searches again (with no term, back to the suggestions). */
  onClearCategory: () => void;
}

export interface SelwiseSearchPanelProps {
  /** The app's own box drives the search: pass what it holds. No input is drawn. */
  query?: string;
  /** The panel's own input changed (also called when `query` is not passed). */
  onQueryChange?: (query: string) => void;
  /** Focus the own input when the panel opens. Default true. */
  autoFocus?: boolean;
  /** Shows a close button beside the own input. */
  onClose?: () => void;
  /**
   * Draws a back arrow before the own input (the panel as a screen of its own).
   * Also drawn, alone in a bar, while the panel has nothing else to show — still
   * loading, search off, a redirect that could not open — so the visitor can leave.
   */
  onBack?: () => void;
  /** The back arrow's spoken label. Without it the merchant's "close" word (Search → Texts). */
  backLabel?: string;
  /** The term the own input starts with, searched when the panel opens. Without `query` only; the visitor edits it as their own. */
  initialQuery?: string;
  /** Keeps the panel clear of the status bar and the home indicator (the app's safe-area insets). For a panel that fills a screen. */
  safeArea?: boolean;
  /** A result was tapped. The click is already reported. Without it the product's link opens through `host.navigate`. */
  onProductPress?: (product: SelwiseProduct) => void;
  /** "View all": the app opens its own results screen for `query`. Without it (and with no address the merchant stored) the button is not drawn. */
  onViewAll?: (query: string) => void;
  /** Search is off for this visitor (`off`) or in test mode for this client (`test`): draw the app's own search. */
  onUnavailable?: (status: 'off' | 'test') => void;
  /** The idle add-to-cart button's word when the app wants its own. Without it the merchant's (Search → Texts) is drawn. */
  addToCartLabel?: string;
  renderInput?: (props: SearchInputRenderProps) => ReactNode;
  renderItem?: (info: RenderSearchItemInfo) => ReactNode;
  renderSuggestion?: (info: RenderSuggestionInfo) => ReactNode;
  renderEmpty?: (info: RenderSearchEmptyInfo) => ReactNode;
  /** Above the results (and the suggestions), under the input. */
  renderHeader?: (info: { query: string; total: number }) => ReactNode;
  /** Structure only: no style of the merchant's look is applied. For an app that styles every part itself. */
  unstyled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** What a result's add-to-cart button is doing, and why the basket refused when it did. */
interface SearchCartEntry {
  state: SearchCartState;
  message?: string;
}

const CART_RESET_MS = 2000;
/** A refusal with a reason is read, not glanced at: it stays up longer than a bare "error". */
const CART_MESSAGE_MS = 6000;

/** A magnifier drawn from two views: an icon font is the app's to bring. */
function MagnifierIcon(props: { color: string }): ReactElement {
  return h(
    View,
    { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', style: { width: 18, height: 18 } },
    h(View, { style: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: props.color } }),
    h(View, {
      style: { position: 'absolute', right: 1, bottom: 1, width: 7, height: 2, borderRadius: 1, backgroundColor: props.color, transform: [{ rotate: '45deg' }] },
    })
  );
}

/** A back arrow drawn from text: an icon font is the app's to bring. */
function BackButton(props: { onBack: () => void; label: string; theme: SearchTheme; unstyled: boolean }): ReactElement {
  const s = styler(props.unstyled);
  return h(
    Pressable,
    {
      onPress: props.onBack,
      accessibilityRole: 'button',
      accessibilityLabel: props.label,
      testID: pickId('button', 'texts'),
      hitSlop: 8,
      style: s({ minWidth: 28, height: 40, justifyContent: 'center', alignItems: 'center' }),
    },
    h(Text, { style: s({ fontSize: 30, lineHeight: 32, color: props.theme.colors.text }) }, '\u2039')
  );
}

function SearchInput(props: {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  onClose?: () => void;
  onBack?: () => void;
  backLabel: string;
  placeholder: string;
  clearLabel: string;
  closeLabel: string;
  autoFocus: boolean;
  theme: SearchTheme;
  unstyled: boolean;
}): ReactElement {
  const { value, theme, unstyled } = props;
  const s = styler(unstyled);
  return h(
    View,
    { testID: pickId('container', 'texts'), style: s({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: theme.pad, paddingBottom: theme.gap }) },
    props.onBack ? h(BackButton, { onBack: props.onBack, label: props.backLabel, theme, unstyled }) : null,
    h(
      View,
      {
        style: s({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          height: theme.input.height,
          paddingHorizontal: 12,
          borderRadius: theme.input.radius,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
        }),
      },
      theme.input.icon && !unstyled ? h(MagnifierIcon, { color: theme.colors.muted }) : null,
      h(TextInput, {
        value,
        onChangeText: props.onChangeText,
        onSubmitEditing: props.onSubmit,
        placeholder: props.placeholder,
        placeholderTextColor: unstyled ? undefined : theme.colors.muted,
        accessibilityLabel: props.placeholder,
        autoFocus: props.autoFocus,
        autoCorrect: false,
        autoCapitalize: 'none',
        returnKeyType: 'search',
        style: s({ flex: 1, fontSize: 16, color: theme.colors.text, paddingVertical: 0 }),
      }),
      value
        ? h(
            Pressable,
            { onPress: props.onClear, accessibilityRole: 'button', accessibilityLabel: props.clearLabel, hitSlop: 8 },
            h(Text, { style: s({ fontSize: 18, color: theme.colors.muted }) }, '×')
          )
        : null
    ),
    props.onClose
      ? h(
          Pressable,
          { onPress: props.onClose, accessibilityRole: 'button', accessibilityLabel: props.closeLabel, hitSlop: 8 },
          h(Text, { style: s({ fontSize: 15, color: theme.colors.text }) }, props.closeLabel)
        )
      : null
  );
}

/**
 * Memoised on purpose: it sits in the list header, and a basket press changes
 * the panel's cart state on every settle. Every prop is stable across such a
 * render (the hook's `t`, `setCategory` and `categories`, the memoised theme),
 * so the chip model is not recomputed for a press that did not touch it.
 */
const CategoryChips = memo(function CategoryChips(props: {
  categories: SearchCategoryChip[];
  selected: string | null;
  /** Absent when the row prints no count (a scope row over an empty answer). */
  total?: number;
  maxVisible: number;
  naming: SearchCategoryNaming | undefined;
  onPick: (category: string | null) => void;
  t: (key: SearchTextKey, vars?: SearchTextVars) => string;
  theme: SearchTheme;
  unstyled: boolean;
}): ReactElement | null {
  const { categories, selected, theme, t, unstyled } = props;
  // One rule for which chip is lit (`categoryChipModel`, the storefront's too):
  // the browsed parent has no chip among the sub-categories and is drawn first,
  // lit, with the "×" that takes it off.
  const model = categoryChipModel({
    // The hook's labels are formatted already; formatting a formatted name is a no-op.
    facets: categories,
    selected,
    total: props.total,
    maxVisible: props.maxVisible,
    format: (name) => formatCategoryName(name, props.naming),
    allLabel: t('all'),
  });
  if (categories.length === 0 && !model.scope) return null;
  const s = styler(unstyled);
  const chip = (item: CategoryChip, key: string) => {
    const { active } = item;
    const ink = active ? theme.colors.accentText : theme.colors.text;
    return h(
      Pressable,
      {
        key,
        // A scope takes the category off; every other chip selects its own.
        onPress: () => props.onPick(item.clears ? null : item.value),
        accessibilityRole: 'button',
        accessibilityState: { selected: active },
        accessibilityLabel: item.clears ? `${t('categoryRemove')}: ${item.label}` : item.label,
        style: s({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: 32,
          paddingHorizontal: 12,
          borderRadius: theme.chipRadius,
          borderWidth: 1,
          borderColor: active ? theme.colors.accent : theme.colors.border,
          backgroundColor: active ? theme.colors.accent : theme.colors.background,
        }),
      },
      h(Text, { numberOfLines: 1, style: s({ fontSize: 13, color: ink }) }, item.label),
      item.clears
        ? h(Text, { style: s({ fontSize: 15, lineHeight: 16, color: ink }) }, '×')
        : item.count === null || (item.kind === 'all' && !active)
          ? null
          : h(Text, { style: s({ fontSize: 11, color: active ? theme.colors.accentText : theme.colors.muted }) }, String(item.count))
    );
  };
  return h(
    ScrollView,
    {
      horizontal: true,
      showsHorizontalScrollIndicator: false,
      keyboardShouldPersistTaps: 'handled',
      style: s({ flexGrow: 0 }),
      contentContainerStyle: s({ gap: 8, paddingHorizontal: theme.pad, paddingBottom: theme.gap }),
    },
    // "All" counts what the search found while it is lit; a scope stands where "All" stood.
    ...model.items.map((item) => chip(item, item.kind === 'facet' ? item.value ?? '' : item.kind))
  );
});

/** A scope row with no facets beside it: one constant, so the memoised chips keep their props. */
const NO_FACETS: SearchCategoryChip[] = [];

export function SelwiseSearchPanel(props: SelwiseSearchPanelProps): ReactElement | null {
  const {
    query: controlled,
    onQueryChange,
    autoFocus = true,
    onClose,
    onBack,
    backLabel,
    initialQuery,
    safeArea = false,
    onProductPress,
    onViewAll,
    onUnavailable,
    addToCartLabel,
    renderInput,
    renderItem,
    renderSuggestion,
    renderEmpty,
    renderHeader,
    unstyled = false,
    style,
  } = props;

  useBrandTheme();
  const host = useSelwiseHost();
  const locale = useLocale();
  const navigate = useNavigate();
  const search = useSelwiseSearch();
  const { settings } = search;

  // ---- the app's own box ----
  useEffect(() => {
    if (controlled !== undefined && controlled !== search.query) search.setQuery(controlled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled]);

  // ---- a term to start from ----
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const start = typeof initialQuery === 'string' ? initialQuery.trim() : '';
    if (start && controlled === undefined) search.setQuery(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insets = useSafeAreaInsets();
  const frame: ViewStyle | undefined = safeArea ? { paddingTop: insets.top, paddingBottom: insets.bottom } : undefined;

  // ---- open and close are the screen's ----
  const { open } = search;
  useEffect(() => {
    open('click');
  }, [open]);

  // ---- when it draws nothing ----
  const { status, redirect } = search;
  useEffect(() => {
    if (status === 'off' || status === 'test') onUnavailable?.(status);
  }, [status, onUnavailable]);
  const redirected = useRef<string | null>(null);
  useEffect(() => {
    // A merchant's rule ("kargo" -> the shipping page) replaces the results; the
    // visitor is sent once per address, not once per render.
    if (!redirect || redirected.current === redirect) return;
    redirected.current = redirect;
    void navigate({ url: redirect, source: 'search' });
  }, [redirect, navigate]);

  // ---- the basket ----
  // One entry per product: what its button is doing and, when the basket refused,
  // the platform's own sentence — one `setState` per settle, so the row never
  // draws a state with the wrong (or a stale) message beside it.
  const [cart, setCart] = useState<Record<string, SearchCartEntry>>({});
  const mounted = useRef(true);
  // The timer that puts a product's button back to idle, by product. A new
  // settle (or a new press) for the same product replaces its timer: an older
  // one firing later would reset the newer state early.
  const resetTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = resetTimers.current;
    return () => {
      mounted.current = false;
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);
  const canAddToCart = settings?.cart.enabled === true && typeof host.addToCart === 'function';
  const addToCart = useCallback(
    async (product: SelwiseProduct) => {
      const key = product.itemCode;
      if (!host.addToCart) return;
      // The row draws no live button for a sold-out product; this is the net
      // under a custom `renderItem` that does. The basket would only refuse it.
      if (isSoldOut(product, product.variants ?? undefined)) return;
      const timers = resetTimers.current;
      const settle = (state: SearchCartState, message?: string) => {
        if (!mounted.current) return;
        setCart((previous) => ({ ...previous, [key]: message ? { state, message } : { state } }));
        clearTimeout(timers.get(key));
        timers.set(
          key,
          setTimeout(() => {
            timers.delete(key);
            if (!mounted.current) return;
            // No entry reads as idle, so the map does not grow with every product ever pressed.
            setCart((previous) => {
              if (!(key in previous)) return previous;
              const rest = { ...previous };
              delete rest[key];
              return rest;
            });
          }, message ? CART_MESSAGE_MS : CART_RESET_MS)
        );
      };
      clearTimeout(timers.get(key));
      timers.delete(key);
      setCart((previous) => ({ ...previous, [key]: { state: 'adding' } }));
      try {
        const answer = await host.addToCart({
          code: product.cartCode || product.itemCode,
          quantity: 1,
          source: 'search',
          product,
        });
        if (answer && answer.success === false) {
          // The platform's own sentence, when the host handed one over.
          const reason = typeof answer.message === 'string' ? answer.message.trim() : '';
          settle('error', reason || undefined);
          return;
        }
        search.trackAddToCart(product);
        settle('added');
      } catch {
        settle('error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, search.trackAddToCart]
  );

  const pressProduct = useCallback(
    (product: SelwiseProduct, index: number) => {
      search.trackClick(product.itemCode, index);
      if (typeof onProductPress === 'function') onProductPress(product);
      else if (product.url) void navigate({ url: product.url, source: 'search' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search.trackClick, onProductPress, navigate]
  );

  // The grid's product card (Search → Results → Product card). Its hooks run
  // whether or not a card is drawn: the panel's early returns come after them.
  const searchCard = useSearchCard({ search, pressProduct, addToCartLabel, locale });

  const pickSuggestion = useCallback(
    (kind: SearchSuggestionKind, value: string | SelwiseProduct) => {
      search.pickSuggestion(kind, value);
      // A popular product is not searched: it is opened, like a result.
      if (kind === 'popularProduct' && typeof value !== 'string') {
        if (typeof onProductPress === 'function') onProductPress(value);
        else if (value.url) void navigate({ url: value.url, source: 'search' });
      }
      if (typeof value === 'string' && kind !== 'popularCategory') onQueryChange?.(value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search.pickSuggestion, onProductPress, onQueryChange, navigate]
  );

  if (!settings || status === 'off' || status === 'test' || redirect) {
    if (!onBack) return null;
    const bar = searchTheme((settings ?? defaultSearchSettings()).appearance);
    return h(
      View,
      { style: unstyled ? [frame, style] : [{ backgroundColor: bar.colors.background }, frame, style] },
      h(
        View,
        { style: styler(unstyled)({ flexDirection: 'row', alignItems: 'center', padding: bar.pad }) },
        h(BackButton, { onBack, label: backLabel ?? (search.t('close') || 'Back'), theme: bar, unstyled })
      )
    );
  }
  return h(Ready, {
    search,
    settings,
    locale,
    controlled: controlled !== undefined,
    autoFocus,
    onClose,
    onBack,
    backLabel,
    frame,
    onViewAll,
    onQueryChange,
    addToCartLabel,
    canAddToCart,
    cart,
    addToCart,
    pressProduct,
    searchCard,
    pickSuggestion,
    renderInput,
    renderItem,
    renderSuggestion,
    renderEmpty,
    renderHeader,
    unstyled,
    style,
    navigate: (url: string) => void navigate({ url, source: 'search' }),
  });
}

interface ReadyProps {
  search: ReturnType<typeof useSelwiseSearch>;
  settings: SearchSettings;
  locale: string | undefined;
  controlled: boolean;
  autoFocus: boolean;
  onClose?: () => void;
  onBack?: () => void;
  backLabel?: string;
  frame?: ViewStyle;
  onViewAll?: (query: string) => void;
  onQueryChange?: (query: string) => void;
  addToCartLabel?: string;
  canAddToCart: boolean;
  cart: Record<string, SearchCartEntry>;
  addToCart: (product: SelwiseProduct) => void;
  pressProduct: (product: SelwiseProduct, index: number) => void;
  searchCard: SearchCard;
  pickSuggestion: (kind: SearchSuggestionKind, value: string | SelwiseProduct) => void;
  renderInput?: SelwiseSearchPanelProps['renderInput'];
  renderItem?: SelwiseSearchPanelProps['renderItem'];
  renderSuggestion?: SelwiseSearchPanelProps['renderSuggestion'];
  renderEmpty?: SelwiseSearchPanelProps['renderEmpty'];
  renderHeader?: SelwiseSearchPanelProps['renderHeader'];
  unstyled: boolean;
  style?: StyleProp<ViewStyle>;
  navigate: (url: string) => void;
}

/** The screen once the settings are known. */
function Ready(props: ReadyProps): ReactElement {
  const { search, settings, locale, unstyled } = props;
  const { t } = search;
  // Memoised: the chips below are, and a new object each render would defeat it.
  const theme = useMemo(() => searchTheme(settings.appearance), [settings.appearance]);
  const s = styler(unstyled);
  const results = settings.results;
  const { viewAll, categories } = results;
  const term = search.query.trim();
  const minChars = settings.behavior.minChars;
  const showingSuggestions = term.length < minChars && search.selectedCategory === null;

  const setQuery = (text: string) => {
    search.setQuery(text);
    props.onQueryChange?.(text);
  };
  const clearQuery = () => setQuery('');

  // ---- "view all" ----
  const viewAllAddress = viewAll.url.trim();
  const viewAllShown = viewAll.enabled && (typeof props.onViewAll === 'function' || viewAllAddress.length > 0);
  const openViewAll = () => {
    if (typeof props.onViewAll === 'function') {
      props.onViewAll(term);
      return;
    }
    if (!viewAllAddress) return;
    const encoded = encodeURIComponent(term);
    props.navigate(
      viewAllAddress.includes('{query}')
        ? viewAllAddress.split('{query}').join(encoded)
        : `${viewAllAddress}${viewAllAddress.includes('?') ? '&' : '?'}${encodeURIComponent(viewAll.param || 'q')}=${encoded}`
    );
  };

  const input = props.controlled
    ? null
    : typeof props.renderInput === 'function'
      ? props.renderInput({
          value: search.query,
          onChangeText: setQuery,
          onClear: clearQuery,
          onSubmit: () => (viewAllShown && term ? openViewAll() : undefined),
          placeholder: t('placeholder'),
          clearLabel: t('clear'),
          autoFocus: props.autoFocus,
        })
      : h(SearchInput, {
          value: search.query,
          onChangeText: setQuery,
          onClear: clearQuery,
          onSubmit: () => (viewAllShown && term ? openViewAll() : undefined),
          onClose: props.onClose,
          onBack: props.onBack,
          backLabel: props.backLabel ?? t('close'),
          placeholder: t('placeholder'),
          clearLabel: t('clear'),
          closeLabel: t('close'),
          autoFocus: props.autoFocus,
          theme,
          unstyled,
        });

  const header = typeof props.renderHeader === 'function' ? props.renderHeader({ query: term, total: search.total }) : null;

  // ---- the body ----
  const centred = (children: ReactNode) =>
    h(View, { style: s({ padding: theme.pad * 2, alignItems: 'center', gap: theme.gap }) }, children);

  let body: ReactNode;
  if (showingSuggestions) {
    body = h(SearchSuggestionsView, {
      sections: search.suggestions,
      settings,
      theme,
      locale,
      t,
      onPick: props.pickSuggestion,
      onClearRecent: search.clearRecent,
      onRemoveRecent: search.removeRecent,
      renderSuggestion: props.renderSuggestion,
      unstyled,
    });
  } else if (search.loading && search.results.length === 0) {
    body = centred(
      h(ActivityIndicator, { accessibilityLabel: t('loading'), color: unstyled ? undefined : theme.colors.accent }),
    );
  } else if (search.error) {
    body = centred(h(Text, { accessibilityRole: 'alert', style: s({ fontSize: 14, color: theme.colors.muted, textAlign: 'center' }) }, t('error')));
  } else if (search.isZeroResults) {
    const empty = t('empty');
    // The category a search was narrowed to is the most common reason it found
    // nothing: it is named, lit, and one tap takes it off (the storefront's
    // empty state does the same).
    const scopeRow = search.selectedCategory
      ? h(CategoryChips, {
          categories: NO_FACETS,
          selected: search.selectedCategory,
          maxVisible: categories.maxVisible,
          naming: categories.naming,
          onPick: search.setCategory,
          t,
          theme,
          unstyled,
        })
      : null;
    const emptyBody = centred(
      h(
        View,
        { style: s({ alignItems: 'center', gap: theme.gap }) },
        h(Text, { accessibilityRole: 'alert', style: s({ fontSize: 14, color: theme.colors.muted, textAlign: 'center' }) }, empty),
        search.didYouMean.length > 0
          ? h(
              View,
              { style: s({ alignItems: 'center', gap: 8 }) },
              h(Text, { style: s({ fontSize: 13, color: theme.colors.muted }) }, t('didYouMean')),
              h(
                View,
                { style: s({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }) },
                ...search.didYouMean.map((alternative) =>
                  h(
                    Pressable,
                    {
                      key: alternative,
                      onPress: () => setQuery(alternative),
                      accessibilityRole: 'button',
                      accessibilityLabel: alternative,
                      style: s({
                        minHeight: 32,
                        justifyContent: 'center',
                        paddingHorizontal: 12,
                        borderRadius: theme.chipRadius,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }),
                    },
                    h(Text, { style: s({ fontSize: 13, color: theme.colors.text }) }, alternative)
                  )
                )
              )
            )
          : null
      )
    );
    body =
      typeof props.renderEmpty === 'function'
        ? props.renderEmpty({
            query: term,
            didYouMean: search.didYouMean,
            onPickTerm: setQuery,
            text: empty,
            category: search.selectedCategory,
            onClearCategory: () => search.setCategory(null),
          })
        : h(View, null, scopeRow, emptyBody);
  } else if (search.results.length > 0) {
    const columns = results.layout === 'grid' ? theme.columns : 1;
    // The grid draws each result with the merchant's product card when the
    // channel has one; the list and compact layouts are rows from
    // `results.fields`. The app's own `renderItem` and `unstyled` (no style of
    // the merchant's look at all) keep the rows: a card IS the merchant's look.
    const drawsCard = results.layout === 'grid' && search.productCard !== null && !unstyled && typeof props.renderItem !== 'function';
    const shown = search.results.length;
    const countText = t(shown < search.total ? 'showing' : 'footer', { shown, total: search.total });

    const listHeader = h(
      View,
      { testID: pickId('container', 'results') },
      categories.display !== 'none'
        ? h(CategoryChips, {
            categories: search.categories,
            selected: search.selectedCategory,
            total: search.total,
            maxVisible: categories.maxVisible,
            naming: categories.naming,
            onPick: search.setCategory,
            t,
            theme,
            unstyled,
          })
        : null,
      countText
        ? h(Text, { style: s({ fontSize: 12, color: theme.colors.muted, paddingHorizontal: theme.pad, paddingBottom: theme.gap }) }, countText)
        : null
    );

    const listFooter = h(
      View,
      { style: s({ paddingVertical: theme.gap, alignItems: 'center', gap: theme.gap }) },
      search.loadingMore ? h(ActivityIndicator, { accessibilityLabel: t('loading'), color: unstyled ? undefined : theme.colors.accent }) : null,
      viewAllShown
        ? h(
            Pressable,
            {
              onPress: openViewAll,
              accessibilityRole: 'button',
              accessibilityLabel: t('viewAll'),
              testID: pickId('button', 'results'),
              style: s({
                minHeight: 40,
                justifyContent: 'center',
                paddingHorizontal: 20,
                borderRadius: theme.radius,
                backgroundColor: theme.colors.accent,
              }),
            },
            h(Text, { style: s({ fontSize: 14, fontWeight: '600', color: theme.colors.accentText }) }, t('viewAll'))
          )
        : null
    );

    body = h(FlatList<SelwiseProduct>, {
      // The column count cannot change on a mounted list.
      key: `columns-${columns}`,
      data: search.results,
      numColumns: columns,
      keyExtractor: (product, index) => String(product.itemCode || index),
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'on-drag',
      onEndReachedThreshold: 0.5,
      onEndReached: search.hasMore ? search.loadMore : undefined,
      ListHeaderComponent: listHeader,
      ListFooterComponent: listFooter,
      ItemSeparatorComponent:
        results.layout === 'grid' || unstyled
          ? undefined
          : () => h(View, { style: { height: 1, backgroundColor: theme.colors.border, marginHorizontal: theme.pad } }),
      contentContainerStyle: s({ paddingBottom: theme.pad }),
      renderItem: ({ item, index }) => {
        const entry = props.cart[item.itemCode];
        const cartState = entry?.state ?? 'idle';
        const cartMessage = entry?.message;
        const soldOut = isSoldOut(item, item.variants ?? undefined);
        const onPress = () => props.pressProduct(item, index);
        const onAddToCart = props.canAddToCart ? () => props.addToCart(item) : undefined;
        if (drawsCard) {
          return h(View, { style: s({ width: `${100 / columns}%`, padding: theme.gap / 2, paddingHorizontal: theme.pad / 2 }) }, props.searchCard.renderCard(item, index));
        }
        const cell =
          typeof props.renderItem === 'function'
            ? props.renderItem({ product: item, index, layout: results.layout, onPress, onAddToCart, cartState, soldOut, ...(cartMessage ? { cartMessage } : {}) })
            : h(SearchResultItem, {
                product: item,
                index,
                settings,
                theme,
                query: term,
                locale,
                t,
                onPress,
                onAddToCart,
                cartState,
                soldOut,
                ...(cartMessage ? { cartMessage } : {}),
                addToCartLabel: props.addToCartLabel,
                unstyled,
              });
        return results.layout === 'grid'
          ? h(View, { style: s({ width: `${100 / columns}%`, padding: theme.gap / 2, paddingHorizontal: theme.pad / 2 }) }, cell)
          : h(View, { style: s({ paddingHorizontal: theme.pad }) }, cell);
      },
    });
  } else {
    // Nothing asked yet (a debounce in flight, a category not yet answered).
    body = null;
  }

  return h(
    SearchFont.Provider,
    { value: theme.fontStack },
    h(
      View,
      {
        style: unstyled
          ? props.frame
            ? [props.frame, props.style]
            : props.style
          : [{ flex: 1, backgroundColor: theme.colors.background }, props.frame, props.style],
      },
      input,
      header,
      body,
      props.searchCard.overlay
    )
  );
}
