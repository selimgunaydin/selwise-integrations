/**
 * The numbers behind the two social-proof counters (`product_view_count`,
 * `cart_count`): how many people viewed a product in a period, how many have it
 * in a basket.
 *
 * A merchant's app cannot know either, so the SDK asks the same two public routes
 * the browser widget does. Plain TypeScript with no `react-native` import.
 *
 * - One question per (counter kind, product, period): a counter on every screen
 *   of a session, or two counters for one product, share one answer.
 * - An answer lives `PRODUCT_COUNT_TTL_MS` (the API itself caches two minutes for
 *   views and one for baskets): a count read a minute ago is not read again, and
 *   a shopper who moves between screens costs no request.
 * - A request in flight is shared, not repeated.
 * - A failure is `null` — "the count could not be read", never a zero — and is
 *   not kept: the next ask tries again, as the widget's does.
 */
import { SingleFlight } from './single-flight.js';

export const PRODUCT_COUNT_TTL_MS = 60_000;

/** The periods the view-count route accepts (`ViewCountQueryDto`); anything else asks for the default. */
export const PRODUCT_COUNT_PERIODS: readonly string[] = ['1h', '24h', '7d', '30d'];
export const DEFAULT_PRODUCT_COUNT_PERIOD = '24h';
/** The one basket metric the cart-count route accepts (`CartCountQueryDto`). */
export const DEFAULT_CART_METRIC = 'active_carts';

export type ProductCountQuestion =
  | { kind: 'product_view_count'; product: string; period: string }
  | { kind: 'cart_count'; product: string; metric: string };

/** The question a counter surface asks, from its content: the merchant's period or metric, else the defaults. */
export function productCountQuestion(
  kind: 'product_view_count' | 'cart_count',
  product: string,
  content: Record<string, unknown>
): ProductCountQuestion {
  if (kind === 'cart_count') {
    // The route accepts `active_carts` only; any other stored value asks for it.
    return { kind, product, metric: DEFAULT_CART_METRIC };
  }
  const period = typeof content['timePeriod'] === 'string' ? content['timePeriod'].trim() : '';
  return { kind, product, period: PRODUCT_COUNT_PERIODS.includes(period) ? period : DEFAULT_PRODUCT_COUNT_PERIOD };
}

/**
 * The product a counter counts: the merchant's explicit `productId`, else the
 * product the screen shows (`itemCode`, set with `setProduct`); null when neither
 * is known — then the counter is not drawn.
 */
export function counterProductCode(content: Record<string, unknown>, screenProduct: { itemCode?: string | null } | null | undefined): string | null {
  const explicit = content['productId'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const shown = screenProduct?.itemCode;
  return typeof shown === 'string' && shown.trim() ? shown.trim() : null;
}

/** How many answers the cache keeps: a long session browses far more products than it returns to. */
const MAX_CACHED_COUNTS = 200;

const keyOf = (question: ProductCountQuestion): string =>
  `${question.kind}|${question.product}|${question.kind === 'cart_count' ? question.metric : question.period}`;

export class ProductCountCache {
  private readonly answers = new Map<string, { at: number; count: number }>();
  private readonly flights = new SingleFlight<string, number | null>();

  constructor(
    private readonly read: (question: ProductCountQuestion) => Promise<number | null>,
    private readonly now: () => number = Date.now
  ) {}

  /** The count, from the cache, the request already in flight, or one new request; null when it could not be read. */
  ask(question: ProductCountQuestion): Promise<number | null> {
    const key = keyOf(question);
    const held = this.answers.get(key);
    if (held && this.now() - held.at < PRODUCT_COUNT_TTL_MS) return Promise.resolve(held.count);
    return this.flights.run(key, () =>
      this.read(question)
        .then((count) => {
          if (count !== null) {
            // Re-inserted at the end, so the first key is always the oldest answer.
            this.answers.delete(key);
            if (this.answers.size >= MAX_CACHED_COUNTS) {
              const oldest = this.answers.keys().next().value;
              if (oldest !== undefined) this.answers.delete(oldest);
            }
            this.answers.set(key, { at: this.now(), count });
          }
          return count;
        })
        .catch(() => null)
    );
  }

  clear(): void {
    this.answers.clear();
    this.flights.clear();
  }
}
