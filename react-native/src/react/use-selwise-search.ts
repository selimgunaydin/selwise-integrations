import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelwise } from './context.js';
import type { SearchOptions, SelwiseProduct } from '../types.js';

export interface UseSelwiseSearchOptions extends SearchOptions {
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

export interface UseSelwiseSearchResult {
  query: string;
  setQuery: (query: string) => void;
  hits: SelwiseProduct[];
  loading: boolean;
  error: Error | null;
  /**
   * The address the channel sends this search to (a redirect the merchant set
   * for the term), or null. Check it before drawing results: a redirected term
   * returns no hits, and it is not a zero-result search.
   */
  redirect: string | null;
  /** True once a search has run and returned nothing — drive the zero-results UI from this. A redirected term is not one. */
  isZeroResults: boolean;
  /** Call on result tap. Required for search click-through reporting. */
  trackClick: (itemCode: string, position?: number) => void;
  clear: () => void;
}

/**
 * Debounced product search against the site's Selwise catalogue.
 *
 * Note what this searches: the Selwise product feed, not Akinon's own product
 * index. It therefore has no facets or sorters, and the app should keep its
 * existing `/list/` screen for "see all results" — see the SDK README.
 */
export function useSelwiseSearch(options: UseSelwiseSearchOptions = {}): UseSelwiseSearchResult {
  const selwise = useSelwise();
  const { debounceMs: debounceOption, minChars: minCharsOption, ...searchOptions } = options;
  const [channel, setChannel] = useState<{ minChars: number; debounceMs: number } | null>(null);
  // The channel's own numbers, unless the app passed its own: the storefront
  // and the app then search on the same keystrokes.
  useEffect(() => {
    if (debounceOption !== undefined && minCharsOption !== undefined) return undefined;
    let active = true;
    // `?.`: a host-supplied stand-in for the client may predate the method.
    Promise.resolve(selwise.getSearchBehavior?.() ?? null)
      .then((behavior) => {
        if (active) setChannel(behavior);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selwise, debounceOption, minCharsOption]);
  const debounceMs = debounceOption ?? channel?.debounceMs ?? FALLBACK_DEBOUNCE_MS;
  const minChars = minCharsOption ?? channel?.minChars ?? FALLBACK_MIN_CHARS;

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SelwiseProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [redirect, setRedirect] = useState<string | null>(null);

  // Held in a ref so changing a filter does not re-create the debounce timer.
  const optionsRef = useRef(searchOptions);
  optionsRef.current = searchOptions;

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < minChars) {
      setHits([]);
      setRedirect(null);
      setLoading(false);
      setHasSearched(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    const timer = setTimeout(() => {
      selwise
        .search(trimmed, optionsRef.current, controller.signal)
        .then((result) => {
          if (!active) return;
          setHits(result.hits);
          setRedirect(typeof result.redirect === 'string' && result.redirect ? result.redirect : null);
          setError(null);
          setHasSearched(true);
        })
        .catch((caught: unknown) => {
          if (!active || isAbortError(caught)) return;
          setError(caught instanceof Error ? caught : new Error(String(caught)));
          setHits([]);
          setRedirect(null);
          setHasSearched(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, debounceMs);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [selwise, query, debounceMs, minChars]);

  const trackClick = useCallback(
    (itemCode: string, position?: number) => {
      selwise.trackSearchClick(query.trim(), itemCode, position);
    },
    [selwise, query]
  );

  const clear = useCallback(() => {
    setQuery('');
    setHits([]);
    setRedirect(null);
    setError(null);
    setHasSearched(false);
  }, []);

  return {
    query,
    setQuery,
    hits,
    loading,
    error,
    redirect,
    isZeroResults: hasSearched && !loading && hits.length === 0 && error === null && redirect === null,
    trackClick,
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
