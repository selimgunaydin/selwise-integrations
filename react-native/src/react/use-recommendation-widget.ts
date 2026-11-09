import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelwise } from './context.js';
import type {
  RecommendationExperiment,
  RecommendationWidgetSummary,
  SelwiseProduct,
} from '../types.js';
import {
  EMPTY_RECOMMENDATION_WIDGET_STATE,
  RecommendationWidgetLoader,
  type RecommendationWidgetState,
} from '../core/recommendation-widget.js';

export interface UseRecommendationWidgetOptions {
  /** Product code of the product on screen, for `similar_products` / `bought_together`. */
  currentProductId?: string;
  /** Set false to hold the request (e.g. until the product code resolves). Default true. */
  enabled?: boolean;
}

export interface UseRecommendationWidgetResult {
  products: SelwiseProduct[];
  productCard: Record<string, unknown> | null;
  loading: boolean;
  error: Error | null;
  /**
   * The strip answers the shopper's live cart ("complete to free shipping")
   * and re-asks by itself whenever `setCart` reports a different basket.
   */
  followsCart: boolean;
  /**
   * The strip as this visitor gets it: an A/B arm's module, or the widget
   * with the arm's title, subtitle and display type. Draw the heading from
   * it (`widget?.title`). Null until the first answer, and for a widget the
   * SDK never saw listed that no arm changes.
   */
  widget: RecommendationWidgetSummary | null;
  /** The A/B arm covering the strip, or null. */
  experiment: RecommendationExperiment | null;
  /** Ask again now. Not needed for the basket: a strip that reads it follows `onCartChange` itself. */
  reload: () => void;
  /** Call when the widget becomes visible. Idempotent per mount. */
  trackImpression: () => void;
  /** Call on product tap. Required for click attribution. */
  trackClick: (itemCode: string, position?: number) => void;
}

/**
 * Loads one recommendation widget's products and exposes the two tracking calls
 * attribution depends on.
 *
 * The request is aborted on unmount and on every dependency change, which
 * matters more here than on the web: a fast scroll through a product list can
 * mount and unmount the same widget several times, and without the abort those
 * responses race to set state on a gone component.
 *
 * A strip that answers the live cart (`free_shipping_complement`) is asked
 * again on every basket change the host reports with `setCart` — debounced,
 * without `loading` (the strip stays on screen until the new cards replace
 * it) and without a second impression — and it empties once the basket passes
 * the threshold or is no longer measured. See `core/recommendation-widget.ts`.
 *
 * An A/B experiment on the strip is applied by the SDK: in a
 * `different_module` arm the products are the arm's strip's, a
 * `config_override` arm's title arrives on `widget`, and the impression is
 * recorded under the strip actually drawn, with the arm's exposure riding on
 * it once. `widgetId` stays the one the screen knows.
 */
export function useRecommendationWidget(
  widgetId: string,
  options: UseRecommendationWidgetOptions = {}
): UseRecommendationWidgetResult {
  const selwise = useSelwise();
  const { currentProductId, enabled = true } = options;

  const [state, setState] = useState<RecommendationWidgetState>(EMPTY_RECOMMENDATION_WIDGET_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const { products, productCard, loading, error, followsCart, appearance, widget, experiment, drawnWidgetId } =
    state;
  // Reported under the strip actually drawn (an arm's strip in a
  // `different_module` arm), so the SDK records each call against the answer
  // it belongs to.
  const reportedId = drawnWidgetId || widgetId;

  // What is on screen now, so a dependency change keeps it until the new
  // answer arrives (as this hook always did) instead of blanking it.
  const shown = useRef(state);
  shown.current = state;

  const impressionSent = useRef(false);

  useEffect(() => {
    if (!enabled || !widgetId) {
      setState((current) => ({ ...current, products: [], loading: false, followsCart: false }));
      return undefined;
    }

    const loader = new RecommendationWidgetLoader(
      selwise,
      widgetId,
      currentProductId === undefined ? {} : { currentProductId },
      setState,
      // Whether THIS strip follows the basket is for its own answer to say.
      { ...shown.current, followsCart: false }
    );
    loader.load();
    return () => loader.stop();
  }, [selwise, widgetId, currentProductId, enabled, reloadToken]);

  // A new product means a new set of recommendations, so the next visibility
  // is a genuinely new impression. A basket refresh is not: it is the same
  // strip answering the same question for a moved basket. A strip that
  // emptied and was brought back by the basket IS a new display — the
  // loader's `appearance` says when (see `core/recommendation-widget.ts`).
  useEffect(() => {
    impressionSent.current = false;
  }, [widgetId, currentProductId, appearance]);

  const trackImpression = useCallback(() => {
    if (impressionSent.current || products.length === 0) return;
    impressionSent.current = true;
    selwise.trackRecommendationImpression(
      reportedId,
      products.map((product) => product.itemCode)
    );
  }, [selwise, reportedId, products]);

  const trackClick = useCallback(
    (itemCode: string, position?: number) => {
      selwise.trackRecommendationClick(reportedId, itemCode, position);
    },
    [selwise, reportedId]
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return useMemo(
    () => ({
      products,
      productCard,
      loading,
      error,
      followsCart,
      widget,
      experiment,
      reload,
      trackImpression,
      trackClick,
    }),
    [products, productCard, loading, error, followsCart, widget, experiment, reload, trackImpression, trackClick]
  );
}
