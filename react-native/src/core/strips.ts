import type { DynamicCart } from '../vendor/dynamic-content.js';
import type {
  RecommendationContext,
  RecommendationExperiment,
  RecommendationProductsResult,
  RecommendationWidgetSummary,
  ResolvedRecommendationWidget,
  SelwiseProduct,
  TrackOptions,
} from '../types.js';
import {
  RecommendationWidgetLoader,
  type RecommendationWidgetSource,
} from './recommendation-widget.js';
import type { FrequencyCapConfig } from './eligibility.js';
import { normalizeFrequencyCap } from './surfaces.js';
import type { NotShownLedger } from './not-shown.js';

/**
 * The recommendation strips of a screen: which ones this visitor gets, and what
 * is in them.
 *
 * ## What is here and why it is shared
 *
 * A screen asks for its strips in two steps. The LIST — which widgets target
 * the screen, with the visitor's A/B arm applied (`entries`) — is one request
 * that every point on the screen needs. The PRODUCTS of a strip (`strip`) are
 * one request each. An app that mounts three named points on a screen used to
 * ask the list and every strip's products once per point; here the list is
 * asked once and shared while a screen is being drawn, and a point asks for the
 * products of ITS strips only.
 *
 * Both steps are held for a few seconds (`SHARED_LOAD_MS`) and share a request
 * already in flight: long enough for every point of one render pass to ride on
 * one answer, short enough that coming back to the screen asks again.
 *
 * ## The A/B arm
 *
 * Each strip is the one the visitor's experiment arm DRAWS
 * (`resolveRecommendationWidget`): the module a `different_module` arm swaps in,
 * a `config_override` arm's title, or nothing at all. `listed` stays the widget
 * the server listed, because a strip's PLACE is the place of the widget it
 * stands in for.
 */

/** How long a screen's list, and a strip's products, are shared between its points. */
export const SHARED_LOAD_MS = 4000;

/** What a screen knows about itself, for the strips that need it. */
export type StripContext = RecommendationContext & { [key: string]: unknown };

/** A strip the visitor's arm draws, before its products are asked for. */
export interface StripEntry {
  /** The widget the server LISTED for the screen. */
  listed: RecommendationWidgetSummary;
  /** The widget drawn: `listed`, another module, or `listed` with the arm's title. */
  widget: RecommendationWidgetSummary;
  experiment?: RecommendationExperiment;
  /** The drawn strip answers the live basket (`free_shipping_complement`). */
  follows: boolean;
  /** The screen the list was asked for — what `Selwise.explain()` files the strip's reasons under. */
  screen?: string;
}

/** A strip ready to draw. */
export interface Strip {
  listed: RecommendationWidgetSummary;
  widget: RecommendationWidgetSummary;
  products: SelwiseProduct[];
  productCard: Record<string, unknown> | null;
  /** The strip follows the basket: ask for it with `follow`, which fills `products`. */
  followsCart?: boolean;
  /** How many times a basket-following strip came back on screen (`follow` sets it). */
  appearance?: number;
  experiment?: RecommendationExperiment;
  /**
   * The strip's frequency cap (`triggerConfig.frequencyCap`), when it has one:
   * a strip over its cap is not returned, and one SHOWN spends its allowance
   * (`recordShown`).
   */
  frequencyCap?: FrequencyCapConfig | null;
}

export interface StripOptions {
  /**
   * For a caller that keeps a "complete to free shipping" strip in step with the
   * basket (`follow`). Such a strip is returned WITHOUT products and with
   * `followsCart: true`: its answer is about a basket that moves, so the follower
   * asks for it itself — asking here too would be a second request for the same
   * answer. Without the option a cart strip is asked once, like any other, and an
   * empty answer (an unmeasured basket) leaves it out.
   */
  followCart?: boolean;
}

/** What the service needs from the SDK client — `Selwise` itself. */
export interface StripClient extends RecommendationWidgetSource {
  getRecommendationWidgets(pageUrl?: string): Promise<RecommendationWidgetSummary[]>;
  resolveRecommendationWidget(
    widget: string | RecommendationWidgetSummary
  ): Promise<ResolvedRecommendationWidget>;
  trackRecommendationImpression(
    widgetId: string,
    productItemCodes?: string[],
    options?: { basis?: 'visible' }
  ): void;
  trackRecommendationClick(widgetId: string, itemCode: string, position?: number): void;
  trackRecommendationAddToCart(widgetId: string, itemCode: string, metadata?: Record<string, string | number | boolean | null>): void;
  trackRecommendationAddAll(
    widgetId: string,
    outcome: { requested: number; added: number; failed: number; needsSize: number }
  ): void;
  recommendationCapBlock(widgetId: string, cap: FrequencyCapConfig | null | undefined): keyof FrequencyCapConfig | null;
  recordRecommendationShown(widgetId: string, cap: FrequencyCapConfig | null | undefined): Promise<void>;
  getLocale(): string | undefined;
  /** Queues one event; what `trackWishlist` is written with. */
  track(name: string, options?: TrackOptions): void;
}

/**
 * The endpoint's field for "the product being looked at" is `currentProductId`.
 *
 * Every other surface of this platform calls that value an item code, so
 * `productItemCode` / `itemCode` / `sku` are what a caller reaches for — and
 * sending one of those is accepted with a 200 and silently ignored, so
 * `similar_products` recommends the product you are already looking at and
 * `bought_together` returns the generic fallback. The aliases are translated
 * rather than rejected: a broken strip on a merchant's product screen is a worse
 * outcome than a quietly corrected key.
 */
const CURRENT_PRODUCT_ALIASES = ['productItemCode', 'itemCode', 'sku', 'productCode'] as const;

export function normalizeContext(context: unknown): StripContext {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {};

  const out: StripContext = { ...(context as StripContext) };
  if (!out.currentProductId) {
    for (const alias of CURRENT_PRODUCT_ALIASES) {
      const value = out[alias];
      if (value) {
        out.currentProductId = String(value);
        break;
      }
    }
  }
  for (const alias of CURRENT_PRODUCT_ALIASES) delete out[alias];
  return out;
}

/**
 * A strip's frequency cap: the keys the ledger enforces, from the strip's
 * `triggerConfig.frequencyCap`. Null when it has none.
 */
export function stripFrequencyCap(widget: RecommendationWidgetSummary | null | undefined): FrequencyCapConfig | null {
  const trigger = widget?.['triggerConfig'];
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) return null;
  return normalizeFrequencyCap((trigger as Record<string, unknown>)['frequencyCap']);
}

/** The widget list flags a strip that answers the live cart (`free_shipping_complement`). */
export function readsLiveCart(widget: RecommendationWidgetSummary | null | undefined): boolean {
  const flags = widget?.['eligibilityFlags'] as { liveCartRequired?: unknown } | undefined;
  return flags?.liveCartRequired === true;
}

/**
 * Keep the widgets a placement names, in the placement's order.
 *
 * Matching accepts an id or a name: an id is stable but unreadable in a config
 * file, and a name is what a merchant actually knows their widget by. A name
 * that matches nothing is skipped, never "everything".
 */
export function filterByPlacement(
  widgets: unknown,
  placement: readonly unknown[] | undefined | null
): RecommendationWidgetSummary[] {
  const list = Array.isArray(widgets) ? (widgets as RecommendationWidgetSummary[]) : [];
  if (!Array.isArray(placement) || placement.length === 0) return list;

  const wanted = placement.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
  const picked: RecommendationWidgetSummary[] = [];

  for (const key of wanted) {
    const match = list.find(
      (widget) =>
        String(widget.id || '').toLowerCase() === key ||
        String(widget.name || '').trim().toLowerCase() === key
    );
    if (match && !picked.includes(match)) picked.push(match);
  }

  return picked;
}

/** A request shared while it is in flight and for `SHARED_LOAD_MS` after. */
class SharedLoads<T> {
  private readonly entries = new Map<string, { at: number; promise: Promise<T> }>();

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && now - hit.at < SHARED_LOAD_MS) return hit.promise;
    // Expired keys would otherwise sit here for the life of the app.
    for (const [other, entry] of this.entries) {
      if (now - entry.at >= SHARED_LOAD_MS) this.entries.delete(other);
    }
    const promise = load();
    this.entries.set(key, { at: now, promise });
    return promise;
  }

  clear(): void {
    this.entries.clear();
  }
}

export class StripService {
  private placements: Record<string, readonly string[]> = {};
  private readonly lists = new SharedLoads<StripEntry[]>();
  private readonly answers = new SharedLoads<RecommendationProductsResult>();

  constructor(
    private readonly client: StripClient,
    /** Where a failure is said. A screen renders what it has, so a failure never throws — but it is not silent. */
    private readonly onError: (message: string, error: unknown) => void = () => undefined,
    /** Where a strip left out says why (`Selwise.explain()`): this service writes the arm, cap and emptiness reasons, the client the segment and test-mode ones. */
    private readonly notShown?: NotShownLedger
  ) {}

  /**
   * Which widgets belong on which screen, by widget name or id, keyed by the
   * screen's address (`app://product`). Leave it empty when the dashboard decides
   * (a screen by page targeting, a point by the strip's container selector).
   */
  setPlacements(placements: Record<string, readonly string[]> | null | undefined): void {
    this.placements = placements && typeof placements === 'object' ? { ...placements } : {};
    this.invalidate();
  }

  /** Forget what is shared — the visitor's arms or language changed. */
  invalidate(): void {
    this.lists.clear();
    this.answers.clear();
  }

  /** The widgets targeting a screen, in the order the merchant placed them. */
  async widgets(pageUrl: string): Promise<RecommendationWidgetSummary[]> {
    const widgets = await this.client.getRecommendationWidgets(pageUrl).catch((error: unknown) => {
      this.onError(`recommendation getWidgets(${pageUrl}) failed`, error);
      return [] as RecommendationWidgetSummary[];
    });
    return filterByPlacement(widgets, this.placements[pageUrl]);
  }

  /**
   * Products for one widget.
   *
   * `context` carries what the screen knows: the product being viewed, the
   * category, the basket contents. Strategies that need it (`similar_products`,
   * `bought_together`) return nothing without it, which looks like an empty
   * catalogue rather than a missing argument.
   */
  async products(widgetId: string, context?: unknown): Promise<RecommendationProductsResult> {
    if (!widgetId) return { widgetId, products: [] };
    return this.client.getRecommendationProducts(widgetId, normalizeContext(context)).catch((error: unknown) => {
      this.onError(`recommendation getProducts(${widgetId}) failed`, error);
      return { widgetId, products: [], productCard: null, meta: null } as RecommendationProductsResult;
    });
  }

  /**
   * The strip a listed widget is drawn as for this visitor: its A/B arm applied
   * — the module a `different_module` arm draws in its place, a
   * `config_override` arm's title, or nothing at all (`hidden`). Asks for no
   * products.
   */
  async resolveWidget(widget: RecommendationWidgetSummary): Promise<{
    widget: RecommendationWidgetSummary;
    hidden: boolean;
    experiment: RecommendationExperiment | null;
    liveCartRequired: boolean | undefined;
  }> {
    const asListed = { widget, hidden: false, experiment: null, liveCartRequired: undefined };
    const resolved = await this.client.resolveRecommendationWidget(widget).catch((error: unknown) => {
      this.onError(`recommendation resolveWidget(${widget?.id}) failed`, error);
      return null;
    });
    if (!resolved) return asListed;
    return {
      widget: resolved.widget || widget,
      hidden: resolved.hidden === true,
      experiment: resolved.experiment || null,
      liveCartRequired: resolved.liveCartRequired,
    };
  }

  /**
   * The strips a screen has, arms applied, without their products — one request
   * for every point of the screen to share.
   *
   * Whether a strip follows the basket is decided on the DRAWN strip: an arm can
   * put a "complete to free shipping" strip in the slot of one that never reads
   * the basket. The placement config matched the LISTED widget, by the name the
   * merchant knows it by, before any of this.
   */
  entries(pageUrl: string): Promise<StripEntry[]> {
    const key = [pageUrl, this.client.getLocale() ?? '', JSON.stringify(this.placements[pageUrl] ?? null)].join('|');
    return this.lists.get(key, () => this.loadEntries(pageUrl));
  }

  private async loadEntries(pageUrl: string): Promise<StripEntry[]> {
    const listed = await this.widgets(pageUrl);
    const drawn = await Promise.all(listed.map((widget) => this.resolveWidget(widget)));
    const entries: StripEntry[] = [];
    listed.forEach((widget, index) => {
      const arm = drawn[index];
      if (arm?.hidden) {
        // An arm that draws nothing, or (no experiment named) the channel's control group.
        this.notShown?.note('decision', pageUrl, {
          id: widget.id,
          kind: 'strip',
          reason: arm.experiment ? 'experiment_arm' : 'control_group',
          ...(arm.experiment
            ? { detail: { experimentId: arm.experiment.experimentId, variantId: arm.experiment.variantId } }
            : {}),
        });
      }
      if (!arm || arm.hidden) return;
      entries.push({
        listed: widget,
        widget: arm.widget,
        ...(arm.experiment ? { experiment: arm.experiment } : {}),
        follows: typeof arm.liveCartRequired === 'boolean' ? arm.liveCartRequired : readsLiveCart(arm.widget),
        screen: pageUrl,
      });
    });
    return entries;
  }

  /**
   * One strip with its products — or `null` when it has nothing to show.
   *
   * The answer is shared with whoever asks for the same strip, with the same
   * context, in the next few seconds. A strip that reads the basket is also
   * keyed by it, so a changed basket asks again.
   */
  async strip(entry: StripEntry, context?: unknown, options: StripOptions = {}): Promise<Strip | null> {
    // A strip over its frequency cap is not drawn, and nothing is asked for it.
    const cap = stripFrequencyCap(entry.widget);
    const blocked = cap ? this.client.recommendationCapBlock(entry.widget.id, cap) : null;
    if (blocked) {
      this.notShown?.note('decision', entry.screen ?? '', {
        id: entry.widget.id,
        kind: 'strip',
        reason: 'frequency_cap',
        detail: { window: blocked },
      });
      return null;
    }
    const experiment = {
      ...(entry.experiment ? { experiment: entry.experiment } : {}),
      ...(cap ? { frequencyCap: cap } : {}),
    };
    if (options.followCart && entry.follows) {
      return { listed: entry.listed, widget: entry.widget, products: [], productCard: null, followsCart: true, ...experiment };
    }

    const normalized = normalizeContext(context);
    const cart = entry.follows ? cartKeyOf(this.client.getCart()) : '';
    const key = [entry.widget.id, JSON.stringify(normalized), cart].join('|');
    const result = await this.answers.get(key, () => this.products(entry.widget.id, normalized));

    const answered = result.widget || entry.widget;
    // Only the answer knew this strip reads the basket (a list without the flag).
    // With a follower it is handed over unasked-for: the follower's first answer
    // replaces this one, and drawing both would be two displays — two
    // impressions — of one strip.
    if (options.followCart && result.liveCartRequired === true) {
      return { listed: entry.listed, widget: answered, products: [], productCard: null, followsCart: true, ...experiment };
    }
    if (result.products.length === 0) {
      this.notShown?.note('decision', entry.screen ?? '', { id: entry.widget.id, kind: 'strip', reason: 'empty' });
      return null;
    }
    this.notShown?.clear('strip', entry.widget.id);
    return {
      listed: entry.listed,
      widget: answered,
      products: result.products,
      productCard: result.productCard || null,
      ...experiment,
    };
  }

  /**
   * Every strip a screen has, with products: the list, then each strip's
   * products. `only` narrows the list BEFORE any products are asked for — a
   * named point asks for the products of its own strips and no other.
   */
  async strips(
    pageUrl: string,
    context?: unknown,
    options: StripOptions & { only?: (entry: StripEntry) => boolean } = {}
  ): Promise<Strip[]> {
    const entries = (await this.entries(pageUrl)).filter((entry) => (options.only ? options.only(entry) : true));
    const strips = await Promise.all(entries.map((entry) => this.strip(entry, context, options)));
    return strips.filter((strip): strip is Strip => strip !== null);
  }

  /**
   * Keep one strip that answers the basket in step with it, through the
   * `RecommendationWidgetLoader` `useRecommendationWidget` runs on: asked when
   * the strip mounts, again 300 ms after the basket last moved, swapped in
   * place, empty once the basket passes the threshold, and not asked at all
   * while the basket is unknown. `onStrip` receives the strip to draw, with
   * `appearance` — the loader's count of times it came back on screen, which is
   * what earns an impression. Returns the stop function.
   */
  follow(strip: Strip, context: unknown, onStrip: (next: Strip) => void): () => void {
    if (!strip || !strip.widget) return () => undefined;
    const loader = new RecommendationWidgetLoader(this.client, strip.widget.id, normalizeContext(context), (state) => {
      const experiment = state.experiment || strip.experiment;
      onStrip({
        listed: strip.listed,
        // The answer's description of the strip once there is one: the arm's
        // module or title, as the SDK applied it to this request.
        widget: state.widget || strip.widget,
        products: state.products,
        productCard: state.productCard || strip.productCard || null,
        followsCart: state.followsCart,
        appearance: state.appearance,
        ...(experiment ? { experiment } : {}),
        ...(strip.frequencyCap ? { frequencyCap: strip.frequencyCap } : {}),
      });
    });
    loader.load();
    return () => loader.stop();
  }

  /**
   * Impression and click.
   *
   * Both are what attribution reads: without the click there is no touchpoint,
   * so a recommendation-driven order is credited to nothing and the widget's
   * revenue panel stays empty while the widget is working. Pass `strip.widget.id`
   * — the strip drawn. The SDK records an A/B arm's exposure with the strip's
   * first impression, once.
   */
  trackImpression(
    widgetId: string,
    products: ReadonlyArray<{ itemCode?: string; code?: string }>,
    options?: { basis?: 'visible' }
  ): void {
    if (!widgetId) return;
    const codes = (products || []).map((product) => product.itemCode || product.code).filter(Boolean) as string[];
    this.client.trackRecommendationImpression(widgetId, codes, options);
  }

  trackClick(widgetId: string, itemCode: string, position?: number): void {
    if (!widgetId || !itemCode) return;
    this.client.trackRecommendationClick(widgetId, itemCode, position);
  }

  /** A product added from the strip, which the basket took. */
  trackAddToCart(widgetId: string, itemCode: string, metadata?: Record<string, string | number | boolean | null>): void {
    if (!widgetId || !itemCode) return;
    this.client.trackRecommendationAddToCart(widgetId, itemCode, metadata);
  }

  /**
   * A product put among the shopper's favourites from a strip's card, which the
   * app took. The browser widget reports the same `wishlist` event; a removal is
   * not reported (it carries no signal the recommendations read).
   */
  trackWishlist(widgetId: string, itemCode: string, metadata?: Record<string, string | number | boolean | null>): void {
    if (!widgetId || !itemCode) return;
    // The event the browser widget writes: about the product, with the strip beside it.
    this.client.track('wishlist', {
      entityType: 'product',
      entityId: itemCode,
      productItemCode: itemCode,
      metadata: { widgetId, ...(metadata ?? {}) },
    });
  }

  /** One press of a look's "add all". */
  trackAddAll(
    widgetId: string,
    outcome: { requested: number; added: number; failed: number; needsSize: number }
  ): void {
    if (!widgetId) return;
    this.client.trackRecommendationAddAll(widgetId, outcome);
  }

  /** The strip was SHOWN (seen): spend its frequency-cap allowance. A strip with no cap costs nothing. */
  recordShown(strip: Pick<Strip, 'widget' | 'frequencyCap'>): void {
    if (!strip.frequencyCap) return;
    void this.client.recordRecommendationShown(strip.widget.id, strip.frequencyCap).catch((error: unknown) => {
      this.onError(`recommendation recordShown(${strip.widget.id}) failed`, error);
    });
  }
}

/** The part of the basket a strip that reads it depends on. */
function cartKeyOf(cart: DynamicCart): string {
  return cart.known ? `${cart.total}:${cart.itemCount}:${cart.currency ?? ''}` : 'unknown';
}
