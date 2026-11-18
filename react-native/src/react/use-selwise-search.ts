import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelwise } from './context.js';
import { useLocale, useSelwiseReady } from './use-selwise-state.js';
import { searchText, type SearchTextVars } from '../core/search-config.js';
import { formatCategoryName } from '../core/search-format.js';
import { primaryTopCategory } from '../vendor/category-list.js';
import type { SearchSettings, SearchTextKey } from '../vendor/search-settings.js';
import type {
  SearchCategoryFacet,
  SearchOpenTrigger,
  SearchOptions,
  SearchResult,
  SearchSort,
  SearchSuggestionKind,
  SearchSuggestionSections,
  SelwiseProduct,
} from '../types.js';

type SearchStatus = NonNullable<SearchResult['status']>;

export interface UseSelwiseSearchOptions extends Omit<SearchOptions, 'offset' | 'refinement'> {
  /**
   * Debounce before firing. Default: the channel's own setting (Search →
   * Configuration → Behaviour), 250 ms until it is read.
   */
  debounceMs?: number;
  /**
   * Below this length the query is treated as empty. Default: the channel's
   * own setting, 2 until it is read.
   */
  minChars?: number;
}

/** What the hook uses before the channel's behaviour arrives (the contract's defaults). */
const FALLBACK_DEBOUNCE_MS = 250;
const FALLBACK_MIN_CHARS = 2;
/** The API reads at most this many results of one search. */
const SEARCH_DEPTH = 500;

const NO_SUGGESTIONS: SearchSuggestionSections = {
  recent: [],
  popularSearches: [],
  popularCategories: [],
  popularProducts: [],
  order: [],
};

/** A category of the result list, ready to draw: `name` filters, `label` is what the shopper reads. */
export interface SearchCategoryChip extends SearchCategoryFacet {
  label: string;
}

export interface UseSelwiseSearchResult {
  query: string;
  setQuery: (query: string) => void;
  /** The results shown, every page loaded so far. */
  results: SelwiseProduct[];
  /** The same list, under the name the hook has always had. */
  hits: SelwiseProduct[];
  /** Every match of the search, of which `results` holds the pages loaded. */
  total: number;
  /** Loads the next page and adds it to `results`. Does nothing while one is loading or when there is no more. */
  loadMore: () => void;
  hasMore: boolean;
  /** The first page is on its way (typing included: the debounce counts). */
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  /**
   * The address the channel sends this search to (a redirect the merchant set
   * for the term), or null. Check it before drawing results: a redirected term
   * returns no hits, and it is not a zero-result search.
   */
  redirect: string | null;
  /**
   * `ready` once the channel's search ran; `off` when search is switched off for
   * the channel or this visitor is outside it (audience, an experiment's holdout)
   * and `test` while it is in test mode and this client was not started with
   * `testMode`. The list is empty in both, and neither is a zero-result search:
   * draw nothing (or your own search) rather than "no results".
   */
  status: SearchStatus;
  /** True once a search has run and returned nothing — drive the zero-results UI from this. A redirected term, an `off` channel and a `test` channel are not one. */
  isZeroResults: boolean;
  /** Other terms to try, when nothing matched. */
  didYouMean: string[];
  /** The categories of the results, to filter by (kept while one is chosen). */
  categories: SearchCategoryChip[];
  selectedCategory: string | null;
  /** A category narrows the results; `null` clears it. With an empty query it browses the category. */
  setCategory: (category: string | null) => void;
  sort: SearchSort;
  setSort: (sort: SearchSort) => void;
  /** What the empty box offers (recent, popular searches, categories, products). */
  suggestions: SearchSuggestionSections;
  /** This device's recent searches — `suggestions.recent`. */
  recent: string[];
  clearRecent: () => void;
  removeRecent: (term: string) => void;
  /**
   * A suggestion was tapped: reports it and, for a term, searches it, for a
   * category, browses it. A product is only reported — open it yourself.
   */
  pickSuggestion: (kind: SearchSuggestionKind, value: string | SelwiseProduct) => void;
  /** The channel's settings as this visitor draws them, or null until read and when search is off. */
  settings: SearchSettings | null;
  /**
   * The product card the merchant chose for the results grid (Search → Results →
   * Product card), as the API delivers it — the phone's own, else the channel's —
   * or null before it is read, when search is off and when the channel has none.
   * `<SelwiseSearchPanel>` draws a grid result with it; an app that draws its own
   * screen can hand it to the strips' card the same way.
   */
  productCard: Record<string, unknown> | null;
  /** A word the search says, in the visitor's language: `t('empty')`, `t('showing', { shown, total })`. */
  t: (key: SearchTextKey, vars?: SearchTextVars) => string;
  /** The search screen opened (reports it, and the exposure of the visitor's experiment arm). Call it once, when the screen shows. */
  open: (trigger?: SearchOpenTrigger) => void;
  /** The search screen closed. Also reported when the component unmounts while open. */
  close: () => void;
  /** Call on result tap. Required for search click-through reporting. */
  trackClick: (itemCode: string, position?: number) => void;
  /** Call when a result was added to the basket: the add is attributed to the search. */
  trackAddToCart: (product: SelwiseProduct) => void;
  clear: () => void;
}

/**
 * Debounced product search against the site's Selwise catalogue, with the
 * channel's own settings, suggestions, categories, order and pages.
 *
 * Note what this searches: the Selwise product feed, not Akinon's own product
 * index. `<SelwiseSearchPanel>` (`@selwise/react-native/ui`) draws all of this;
 * an app that draws its own screen reads it here.
 *
 * Reported for you: the search (`search_query` / `search_zero_results`, once per
 * term), the open and close of the screen (`open`, `close`), a tapped
 * suggestion (`pickSuggestion`), the click (`trackClick`) and the add to the
 * basket (`trackAddToCart`). Never report them again yourself.
 */
export function useSelwiseSearch(options: UseSelwiseSearchOptions = {}): UseSelwiseSearchResult {
  const selwise = useSelwise();
  const ready = useSelwiseReady();
  const locale = useLocale();
  const { debounceMs: debounceOption, minChars: minCharsOption, sort: sortOption, category: categoryOption, ...searchOptions } = options;

  // ---- the channel's settings ----
  const [settings, setSettings] = useState<SearchSettings | null>(null);
  const [productCard, setProductCard] = useState<Record<string, unknown> | null>(null);
  const [state, setState] = useState<SearchStatus>('ready');
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    selwise
      .getSearchState()
      .then((resolution) => {
        if (!active) return;
        setSettings(resolution.settings);
        setProductCard(resolution.state === 'ready' ? resolution.card : null);
        setState(resolution.state === 'off' || resolution.state === 'test' ? resolution.state : 'ready');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selwise, ready, locale]);

  const debounceMs = debounceOption ?? settings?.behavior.debounceMs ?? FALLBACK_DEBOUNCE_MS;
  const minChars = minCharsOption ?? settings?.behavior.minChars ?? FALLBACK_MIN_CHARS;

  // ---- what the shopper asked ----
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategoryState] = useState<string | null>(categoryOption ?? null);
  const [sort, setSort] = useState<SearchSort>(sortOption ?? 'relevance');
  const term = query.trim();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), term ? debounceMs : 0);
    return () => clearTimeout(timer);
  }, [term, debounceMs]);

  // The request: a term long enough, or a category to browse.
  const wanted = state === 'ready' && ready && (debounced.length >= minChars || category !== null);
  const requestTerm = debounced.length >= minChars ? debounced : '';
  const pending = state === 'ready' && term !== debounced && (term.length >= minChars || term === '');

  // ---- the answer ----
  const [hits, setHits] = useState<SelwiseProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingFirst, setLoadingFirst] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [redirect, setRedirect] = useState<string | null>(null);
  const [facets, setFacets] = useState<SearchCategoryFacet[]>([]);
  const [didYouMean, setDidYouMean] = useState<string[]>([]);

  // Held in refs so a page is asked for with what the first page was asked with.
  const optionsRef = useRef(searchOptions);
  optionsRef.current = searchOptions;
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  const totalRef = useRef(total);
  totalRef.current = total;
  const generation = useRef(0);
  const lastTerm = useRef<string | null>(null);
  const moreInFlight = useRef(false);
  const categoryRef = useRef(category);
  categoryRef.current = category;

  useEffect(() => {
    generation.current += 1;
    moreInFlight.current = false;
    setLoadingMore(false);

    if (!wanted) {
      lastTerm.current = null;
      setHits([]);
      setTotal(0);
      setRedirect(null);
      setDidYouMean([]);
      setFacets([]);
      setError(null);
      setLoadingFirst(false);
      setHasSearched(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    // The same term asked again narrowed or ordered another way is not a new search.
    const refinement = lastTerm.current === requestTerm;
    setLoadingFirst(true);
    selwise
      .search(requestTerm, { ...optionsRef.current, sort, ...(category ? { category } : {}), refinement }, controller.signal)
      .then((result) => {
        if (!active) return;
        lastTerm.current = requestTerm;
        setHits(result.hits);
        setTotal(typeof result.total === 'number' ? result.total : result.hits.length);
        setRedirect(typeof result.redirect === 'string' && result.redirect ? result.redirect : null);
        setDidYouMean(result.hits.length === 0 && Array.isArray(result.suggestions) ? result.suggestions : []);
        // The categories of the unfiltered results stay while one is chosen, or
        // the chips would collapse to the one picked.
        setFacets((previous) => (category && previous.length > 0 ? previous : result.categories ?? []));
        if (result.status === 'off' || result.status === 'test') setState(result.status);
        setError(null);
        setHasSearched(true);
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
        setHits([]);
        setTotal(0);
        setRedirect(null);
        setHasSearched(true);
      })
      .finally(() => {
        if (active) setLoadingFirst(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selwise, wanted, requestTerm, category, sort, locale]);

  const hasMore = hits.length > 0 && hits.length < total && hits.length < SEARCH_DEPTH;

  const loadMore = useCallback(() => {
    const held = hitsRef.current;
    if (moreInFlight.current || held.length === 0 || held.length >= totalRef.current || held.length >= SEARCH_DEPTH) return;
    moreInFlight.current = true;
    setLoadingMore(true);
    const mine = generation.current;
    selwise
      .search(
        lastTerm.current ?? '',
        {
          ...optionsRef.current,
          sort,
          ...(categoryRef.current ? { category: categoryRef.current } : {}),
          offset: held.length,
          refinement: true,
        }
      )
      .then((result) => {
        if (mine !== generation.current) return;
        const known = new Set(hitsRef.current.map((hit) => hit.itemCode));
        const fresh = result.hits.filter((hit) => !known.has(hit.itemCode));
        // A page that adds nothing is the end, whatever the total said.
        if (fresh.length === 0) setTotal(hitsRef.current.length);
        else setHits([...hitsRef.current, ...fresh]);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mine !== generation.current) return;
        moreInFlight.current = false;
        setLoadingMore(false);
      });
  }, [selwise, sort]);

  // ---- suggestions ----
  const [suggestions, setSuggestions] = useState<SearchSuggestionSections>(NO_SUGGESTIONS);
  const showingSuggestions = state === 'ready' && term.length < minChars && category === null;
  const [suggestionsVersion, setSuggestionsVersion] = useState(0);
  useEffect(() => {
    if (!ready || !settings || !showingSuggestions) return undefined;
    let active = true;
    selwise
      .getSearchSuggestions()
      .then((sections) => {
        if (active) setSuggestions(sections);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selwise, ready, settings, showingSuggestions, locale, suggestionsVersion]);

  const clearRecent = useCallback(() => {
    void selwise
      .clearRecentSearches()
      .catch(() => undefined)
      .then(() => setSuggestionsVersion((version) => version + 1));
  }, [selwise]);

  const removeRecent = useCallback(
    (recentTerm: string) => {
      void selwise
        .removeRecentSearch(recentTerm)
        .catch(() => undefined)
        .then(() => setSuggestionsVersion((version) => version + 1));
    },
    [selwise]
  );

  // ---- reporting ----
  const opened = useRef(false);
  const wantsOpen = useRef<SearchOpenTrigger | null>(null);
  const latest = useRef({ query: '', total: 0 });
  latest.current = { query: requestTerm, total };

  const reportOpen = useCallback(() => {
    if (opened.current || wantsOpen.current === null) return;
    opened.current = true;
    selwise.trackSearchOpen(wantsOpen.current);
  }, [selwise]);

  const open = useCallback(
    (trigger: SearchOpenTrigger = 'click') => {
      wantsOpen.current = trigger;
      // Before `init()` finished there is nothing to report to: the effect below does it then.
      if (selwise.isInitialized) reportOpen();
    },
    [selwise, reportOpen]
  );

  useEffect(() => {
    if (ready) reportOpen();
  }, [ready, reportOpen]);

  const close = useCallback(() => {
    wantsOpen.current = null;
    if (!opened.current) return;
    opened.current = false;
    selwise.trackSearchClose({ query: latest.current.query, resultCount: latest.current.total });
  }, [selwise]);

  // A screen that goes away open is closed.
  useEffect(() => close, [close]);

  const trackClick = useCallback(
    (itemCode: string, position?: number) => {
      const hit = hitsRef.current.find((candidate) => candidate.itemCode === itemCode);
      const clicked = categoryRef.current ?? primaryTopCategory(hit?.categories) ?? undefined;
      selwise.trackSearchClick(lastTerm.current ?? '', itemCode, position, clicked);
    },
    [selwise]
  );

  const trackAddToCart = useCallback(
    (product: SelwiseProduct) => selwise.trackSearchAddToCart(product, { query: lastTerm.current ?? '' }),
    [selwise]
  );

  const pickSuggestion = useCallback(
    (kind: SearchSuggestionKind, value: string | SelwiseProduct) => {
      if (kind === 'popularProduct' && typeof value !== 'string') selwise.trackSuggestionClick('popularProduct', value);
      else if (typeof value === 'string' && kind !== 'popularProduct') selwise.trackSuggestionClick(kind, value);
      if (typeof value !== 'string') return;
      if (kind === 'popularCategory') {
        setQuery('');
        setCategoryState(value);
      } else if (kind === 'recent' || kind === 'popularSearch') {
        setQuery(value);
      }
    },
    [selwise]
  );

  const setCategory = useCallback((next: string | null) => setCategoryState(next), []);

  const clear = useCallback(() => {
    setQuery('');
    setCategoryState(null);
    setSort('relevance');
  }, []);

  const t = useCallback((key: SearchTextKey, vars?: SearchTextVars) => searchText(settings, key, vars), [settings]);

  const naming = settings?.results.categories.naming;
  const categories = useMemo<SearchCategoryChip[]>(
    () => facets.map((facet) => ({ ...facet, label: formatCategoryName(facet.label || facet.name, naming) })),
    [facets, naming]
  );

  return {
    query,
    setQuery,
    results: hits,
    hits,
    total,
    loadMore,
    hasMore,
    loading: loadingFirst || pending,
    loadingMore,
    error,
    redirect,
    status: state,
    isZeroResults:
      hasSearched &&
      !loadingFirst &&
      !pending &&
      hits.length === 0 &&
      error === null &&
      redirect === null &&
      state === 'ready',
    didYouMean,
    categories,
    selectedCategory: category,
    setCategory,
    sort,
    setSort,
    suggestions,
    recent: suggestions.recent,
    clearRecent,
    removeRecent,
    pickSuggestion,
    settings,
    productCard,
    t,
    open,
    close,
    trackClick,
    trackAddToCart,
    clear,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}
