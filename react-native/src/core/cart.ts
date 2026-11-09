import { UNKNOWN_CART, type DynamicCart } from '../vendor/dynamic-content.js';
import type { BehaviorSnapshot } from '../vendor/page-targeting.js';

/**
 * The shopper's basket, as the HOST measured it.
 *
 * ## Why the host hands it over
 *
 * The browser widget reads the store's own cart (or the data layer's whole
 * basket). An app has neither: the basket lives in the app's own state — App
 * Maker's Redux store, a custom app's context — and only the host can read it.
 * So the host calls `setCart({ total, itemCount, currency })` whenever its
 * basket changes, and everything that SAYS an amount reads from here: the
 * goal bar (`resolveGoalBar`), `{cart.total}` placeholders in any campaign,
 * and the `cartValue` / `cartItemCount` targeting signals.
 *
 * ## Memory only, on purpose
 *
 * An unmeasured cart is not an empty cart. A cart persisted from the previous launch would read as measured while
 * the store's real basket may have changed on another device or expired
 * server-side — a bar saying "₺120 to free shipping" to a shopper whose basket
 * is now ₺900 is worse than no bar. So a launch starts `known: false` and
 * stays there until the host reports the basket it actually has.
 */

export interface CartInput {
  /**
   * The basket's value AFTER the store's own discounts and BEFORE shipping and
   * fees (GA4's `value`). A free-shipping rule is written against this number;
   * a grand total counts the shipping fee toward free shipping.
   */
  total: number;
  /** Units in the basket (two of one product count as two). */
  itemCount: number;
  /**
   * ISO 4217, when the basket carries one. Anything else is ignored rather than
   * rejected — the channel's currency (`/config` `channel.currency`) stands in.
   */
  currency?: string | null;
  /**
   * Optional: the product codes of the basket's lines, in whatever code space
   * the app has (Akinon's product pk, a sku, an item code). Sent only with a
   * recommendation strip that completes the basket to free shipping
   * (`free_shipping_complement`), to leave the basket's own products out of
   * it. Never decides whether the cart is measured.
   */
  codes?: ReadonlyArray<string | number> | null;
}

const CURRENCY_CODE = /^[A-Za-z]{3}$/;
const MAX_CART_CODES = 100;

/** Basket line codes as the host gave them: non-empty strings, de-duplicated, capped. */
export function normalizeCartCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const codes = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const code = String(raw).trim();
    if (code && code.length <= 128) codes.add(code);
    if (codes.size >= MAX_CART_CODES) break;
  }
  return Array.from(codes);
}

function toAmount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * A host's cart, validated — or `null` when it cannot be trusted as a
 * measurement. Numeric strings are accepted (Akinon serialises decimals as
 * `"379.80"`); a negative, non-finite or missing amount is not a basket.
 */
export function normalizeCartInput(input: unknown): DynamicCart | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;

  const total = toAmount(record.total);
  const count = toAmount(record.itemCount);
  if (total === null || count === null) return null;

  const currency =
    typeof record.currency === 'string' && CURRENCY_CODE.test(record.currency.trim())
      ? record.currency.trim().toUpperCase()
      : null;

  return {
    known: true,
    total: Math.round(total * 100) / 100,
    // A count is whole: "2.5 items" is a host bug, and flooring keeps a
    // count-goal from claiming a step the shopper has not reached.
    itemCount: Math.floor(count),
    currency,
  };
}

/** The same lines, in any order: a basket re-read with its lines reordered has not changed. */
function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort();
  return [...a].sort().every((code, index) => code === sorted[index]);
}

function sameCart(a: DynamicCart, b: DynamicCart): boolean {
  return (
    a.known === b.known &&
    a.total === b.total &&
    a.itemCount === b.itemCount &&
    (a.currency ?? null) === (b.currency ?? null)
  );
}

export type CartListener = (cart: DynamicCart) => void;

export class CartStore {
  private cart: DynamicCart = UNKNOWN_CART;
  private codes: string[] = [];
  private readonly listeners = new Set<CartListener>();
  private readonly onError: ((error: unknown) => void) | undefined;

  constructor(onError?: (error: unknown) => void) {
    this.onError = onError;
  }

  /** A copy: a host mutating what it was handed must not change what the SDK says. */
  get(): DynamicCart {
    return { ...this.cart };
  }

  /**
   * Replace the cart. `null` means "no longer measured" (the store cleared its
   * basket, the shopper logged out). Returns whether the input was accepted;
   * an input that is not a basket ALSO makes the cart unknown, because the
   * previous amount is now stale and printing it would be a guess.
   */
  set(input: CartInput | null): boolean {
    const next = input === null ? UNKNOWN_CART : normalizeCartInput(input);
    const accepted = input === null || next !== null;
    // Replaced with every basket, and gone with an unknown one: codes from an
    // earlier basket could name a line that has since left it.
    const codes = next && next.known ? normalizeCartCodes(input?.codes) : [];
    // A line swapped for another at the same amount is a change too: a "complete
    // to free shipping" strip leaves the basket's own products out, and would
    // otherwise keep offering the one just added.
    const linesMoved = !sameCodes(this.codes, codes);
    this.codes = codes;
    this.replace(next ?? UNKNOWN_CART, linesMoved);
    return accepted;
  }

  /** The measured basket's line codes; empty for an unknown cart. */
  getCodes(): string[] {
    return this.cart.known ? [...this.codes] : [];
  }

  subscribe(listener: CartListener): () => void {
    if (typeof listener !== 'function') return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private replace(next: DynamicCart, linesMoved = false): void {
    if (!linesMoved && sameCart(this.cart, next)) return;
    this.cart = next;
    for (const listener of [...this.listeners]) {
      try {
        listener({ ...next });
      } catch (error) {
        // One host listener throwing must not starve the others (or the
        // basket subscription that called setCart).
        this.onError?.(error);
      }
    }
  }
}

/**
 * The behaviour snapshot targeting and content states evaluate, with the
 * cart's two signals filled in from a MEASURED cart.
 *
 * The host's own values win: a host that already reports `cartValue` knows its
 * basket better than a cart it may have set a moment ago. An unknown cart
 * adds nothing — a missing signal falls to the evaluator's default, which is
 * how the web treats a cart it has not seen either.
 */
export function withCartSignals(
  behavior: BehaviorSnapshot | undefined,
  cart: DynamicCart
): BehaviorSnapshot | undefined {
  if (!cart.known) return behavior;
  const merged: BehaviorSnapshot = { ...(behavior ?? {}) };
  if (merged.cartValue === undefined) merged.cartValue = cart.total;
  if (merged.cartItemCount === undefined) merged.cartItemCount = cart.itemCount;
  return merged;
}
