import type { DynamicCart } from '../vendor/dynamic-content.js';
import type {
  RecommendationContext,
  RecommendationExperiment,
  RecommendationProductsResult,
  RecommendationWidgetSummary,
  SelwiseProduct,
} from '../types.js';

/**
 * One recommendation strip's products, kept current — what
 * `useRecommendationWidget` renders, with no React in it so it is tested
 * without a renderer (this package has none).
 *
 * ## A strip that answers the basket follows it
 *
 * A "complete to free shipping" strip (`free_shipping_complement`) is a
 * question about the MEASURED basket, so its answer is stale the moment the
 * basket moves. The products answer says whether a strip is one
 * (`liveCartRequired`); such a strip is asked again on every `onCartChange`,
 * debounced like the browser widget (a quantity stepper fires a burst). It is
 * the SAME strip being re-answered, the way the web swaps its cards in place:
 * no `loading` flash that would unmount it, and no reason for a second
 * impression. Once the basket passes the threshold the server answers nothing
 * and the strip has nothing to show; once the basket is no longer measured
 * (`setCart(null)`) it is not asked at all — the web's rule, and the honest
 * answer to "how much is left" for a basket nobody measured.
 *
 * Every other strip is loaded once per dependency change, as before.
 *
 * ## An appearance is what earns an impression
 *
 * `appearance` counts the times the strip went from no products to some. A
 * swap in place keeps it — the strip never left the screen — and a strip that
 * emptied (the basket passed the threshold, or stopped being measured) and is
 * brought back by the basket gets a new one: a new display, as on the web,
 * where the strip is drawn again with its impression. The hook and the App
 * Maker strips reset their impression bookkeeping on it.
 *
 * ## The strip is the one the visitor's arm draws
 *
 * The SDK applies the visitor's A/B arm to every products request
 * (`core/recommendation-arms.ts`), so the strip asked about may be answered
 * by the module a `different_module` arm draws in its place, or carry a
 * `config_override` arm's title. `widget` and `experiment` are that answer's,
 * so a host draws the arm's heading; if the arm's strip reads the basket,
 * the answer says so and it is followed like any other — the slot's own
 * strategy does not decide.
 */

/** A burst of basket changes is waited out this long — the browser widget's figure. */
export const CART_REFRESH_DEBOUNCE_MS = 300;

export interface RecommendationWidgetState {
  products: SelwiseProduct[];
  productCard: Record<string, unknown> | null;
  /** A load the host asked for is in flight. A basket refresh never sets it. */
  loading: boolean;
  error: Error | null;
  /** The strip answers the live cart and is kept in step with it. */
  followsCart: boolean;
  /**
   * Bumped each time the strip goes from no products to some — a new display,
   * which earns an impression. A swap in place keeps it.
   */
  appearance: number;
  /**
   * The strip as this visitor gets it, from the last answer — an A/B arm's
   * module or title applied (`RecommendationProductsResult.widget`). Null
   * until an answer says.
   */
  widget: RecommendationWidgetSummary | null;
  /** The A/B arm covering the strip, from the last answer; null outside every experiment. */
  experiment: RecommendationExperiment | null;
  /**
   * The strip the last answer is for — the arm's strip in a
   * `different_module` arm. Report impressions and clicks under it: the SDK
   * records them against the verdict that answer was given under.
   */
  drawnWidgetId: string | null;
}

export const EMPTY_RECOMMENDATION_WIDGET_STATE: RecommendationWidgetState = {
  products: [],
  productCard: null,
  loading: false,
  error: null,
  followsCart: false,
  appearance: 0,
  widget: null,
  experiment: null,
  drawnWidgetId: null,
};

/** What the loader needs from the SDK client — `Selwise` itself in the hook. */
export interface RecommendationWidgetSource {
  getRecommendationProducts(
    widgetId: string,
    context?: RecommendationContext,
    signal?: AbortSignal
  ): Promise<RecommendationProductsResult>;
  getCart(): DynamicCart;
  onCartChange(listener: (cart: DynamicCart) => void): () => void;
}

export class RecommendationWidgetLoader {
  private state: RecommendationWidgetState;
  private controller: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Basket changes heard so far, and how many there had been when the last question was asked. */
  private cartVersion = 0;
  private askedVersion = 0;

  constructor(
    private readonly source: RecommendationWidgetSource,
    private readonly widgetId: string,
    private readonly context: RecommendationContext,
    private readonly onState: (state: RecommendationWidgetState) => void,
    /** Where the strip starts: the hook passes what it shows now, so a dependency change does not blank it. */
    initial: RecommendationWidgetState = EMPTY_RECOMMENDATION_WIDGET_STATE,
    private readonly debounceMs: number = CART_REFRESH_DEBOUNCE_MS
  ) {
    this.state = { ...initial };
  }

  /** The first load, and the host's `reload`: reported as loading. */
  load(): void {
    // Heard from the first question on: a basket the host sets while that
    // question is in flight must not be missed — its answer would be for the
    // basket before, and nothing would ask again until the next change.
    this.listen();
    this.fetch('load');
  }

  /** Abort what is in flight and stop following the basket. Idempotent. */
  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    this.controller = null;
    this.unlisten();
  }

  private fetch(kind: 'load' | 'cart'): void {
    if (this.stopped) return;
    this.controller?.abort();
    this.controller = null;

    // A basket nobody measured is not asked about: the strip steps aside.
    if (kind === 'cart' && !this.source.getCart().known) {
      this.emit({ products: [], loading: false, error: null });
      return;
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    this.controller = controller;
    this.askedVersion = this.cartVersion;
    if (kind === 'load') this.emit({ loading: true, error: null });

    this.source
      .getRecommendationProducts(this.widgetId, this.context, controller?.signal)
      .then((result) => {
        if (this.stopped || this.controller !== controller) return;
        const followsCart = result.liveCartRequired === true;
        this.emit({
          products: result.products,
          productCard: result.productCard ?? null,
          loading: false,
          error: null,
          followsCart,
          widget: result.widget ?? null,
          experiment: result.experiment ?? null,
          drawnWidgetId: result.widgetId || null,
        });
        if (!followsCart) {
          this.unlisten();
          return;
        }
        // The basket moved while this was being answered: ask about the one
        // there is now.
        if (this.cartVersion !== this.askedVersion) this.schedule();
      })
      .catch((caught: unknown) => {
        if (this.stopped || this.controller !== controller) return;
        // An abort is the expected outcome of a newer question, not a failure.
        if (isAbortError(caught)) return;
        // No stale answer is left on screen: a failed refresh would otherwise
        // keep offering what the PREVIOUS basket needed.
        this.emit({
          products: [],
          loading: false,
          error: caught instanceof Error ? caught : new Error(String(caught)),
        });
        if (!this.state.followsCart) this.unlisten();
      });
  }

  /** Count every basket change; act on it once the strip is known to follow the basket. */
  private listen(): void {
    if (this.unsubscribe || this.stopped) return;
    this.unsubscribe = this.source.onCartChange(() => {
      this.cartVersion += 1;
      if (this.state.followsCart) this.schedule();
    });
  }

  private unlisten(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** One question per burst of basket changes. */
  private schedule(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fetch('cart');
    }, this.debounceMs);
  }

  private emit(patch: Partial<RecommendationWidgetState>): void {
    const next = { ...this.state, ...patch };
    // From nothing on screen to something: a new appearance.
    if (patch.products && patch.products.length > 0 && this.state.products.length === 0) {
      next.appearance = this.state.appearance + 1;
    }
    this.state = next;
    this.onState(this.state);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}
