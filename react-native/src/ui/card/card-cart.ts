import {
  hasSelectableAxis,
  isSoldOut,
  resolveCardAddCode,
  resolveInitialVariant,
  usableVariants,
  type CardVariant,
} from '../../vendor/product-card-variant-logic.js';
import { resolveCardAction, CARD_ACTIONS } from '../../vendor/product-card-logic.js';
import type { SelwiseProduct } from '../../types.js';

/**
 * What a card's "add to cart" does — the decisions, without the views.
 *
 * ## The same questions the storefront asks
 *
 * A product with sizes cannot be added without one, and guessing a size is worse
 * than one more tap. The storefront answers per card (`resolveCardBasketCode`);
 * this answers the same questions for the app, where the basket is the HOST's
 * (`host.addToCart`) and the options arrive with the product (`variants`), so
 * there is no storefront page to ask for the sizes:
 *
 *  - the card offers no chooser (`variantSelection: 'none'`): "add" adds the
 *    product the card shows — its own basket code. A product with several
 *    options and no code of its own opens its product screen instead, so a size
 *    is never guessed;
 *  - the card offers one (`chips`, `dropdown`, `modal`): on a phone all three
 *    are the same native sheet, opened by the button when the shopper has to
 *    choose. One buyable option is added at once, and so is a product whose
 *    options carry no size and no colour to choose by (there is no wrong
 *    answer to get);
 *  - a sold-out option — or a product with nothing left to buy (`isSoldOut`) —
 *    is never sent to the basket: it would only be refused.
 *
 * Plain TypeScript with no `react-native` import.
 */

export type AddDecision =
  | { kind: 'code'; code: string }
  /** Several options and a shopper to ask: open the sheet with these. */
  | { kind: 'choose'; variants: CardVariant[] }
  /** Several options, no chooser and no code of its own: the product's own screen asks. */
  | { kind: 'page' }
  | { kind: 'stop'; reason: 'out_of_stock' };

export type VariantSelection = 'none' | 'chips' | 'dropdown' | 'modal';

/** The card's `variantSelection`, `none` when it never said (the storefront's default). */
export function selectionOf(card: Record<string, unknown> | null | undefined): VariantSelection {
  const value = card?.['variantSelection'];
  return value === 'chips' || value === 'dropdown' || value === 'modal' ? value : 'none';
}

/** The basket code of a product that has no option to choose: its cart code, else its item code. */
export function ownBasketCode(product: Pick<SelwiseProduct, 'cartCode' | 'itemCode' | 'id'>): string {
  return product.cartCode || product.itemCode || product.id;
}

function finish(variant: CardVariant): AddDecision {
  if (variant.inStock === false) return { kind: 'stop', reason: 'out_of_stock' };
  return { kind: 'code', code: variant.variantCode };
}

/**
 * Which code "add to cart" sends for a product, or why nothing is sent yet.
 * `chosen` is the option the shopper picked in the sheet.
 */
export function decideAdd(product: SelwiseProduct, selection: VariantSelection, chosen?: string | null): AddDecision {
  const variants = usableVariants(product.variants ?? undefined);
  const own = product.cartCode || null;

  // A product the catalogue already calls sold out is never sent to the basket
  // (`isSoldOut`: no buyable option either): the platform would only refuse it,
  // with nothing on screen to say why (2026-11-18). A group whose own row says
  // sold out but which still has an in-stock size is NOT stopped here — the
  // sheet below decides which size.
  if (isSoldOut(product, variants)) return { kind: 'stop', reason: 'out_of_stock' };

  if (selection === 'none') {
    const code = resolveCardAddCode({ ...product, cartCode: own }, variants);
    if (!code && variants.length > 1) return { kind: 'page' };
    return { kind: 'code', code: code ?? ownBasketCode(product) };
  }

  if (variants.length === 0) return { kind: 'code', code: ownBasketCode(product) };

  if (chosen) {
    const picked = variants.find((variant) => variant.variantCode === chosen);
    if (picked) return finish(picked);
  }
  if (variants.length === 1) return finish(variants[0] as CardVariant);
  if (!hasSelectableAxis(variants)) return finish(resolveInitialVariant(variants) ?? (variants[0] as CardVariant));
  return { kind: 'choose', variants };
}

/** What a strip's "go to product" or "add to cart" setting makes of a card's button. */
export interface ButtonSettings {
  ctaMode?: unknown;
  addToCartEnabled?: unknown;
  /** The host can add to its basket; without it the button opens the product. */
  canAdd: boolean;
}

/**
 * The action a card's button really has: the one the node designed, as the
 * strip's CTA mode and the host allow (`resolveCardAction` is the storefront's
 * own). `quick_view` and `wishlist` are the storefront's windows and lists: an
 * app has neither, so a quick view opens the product and a wishlist control is
 * not drawn.
 */
export function buttonAction(declared: string, product: { url?: string | null }, settings: ButtonSettings): string {
  if (declared === 'wishlist') return CARD_ACTIONS.WISHLIST;
  if (declared === 'quick_view') return product.url ? CARD_ACTIONS.REVIEW : CARD_ACTIONS.LINK;
  const templateAction = declared === 'link' ? CARD_ACTIONS.LINK : CARD_ACTIONS.ADD_TO_CART;
  return resolveCardAction(templateAction, product, {
    source: 'recommendation',
    ctaMode: settings.ctaMode === 'review' ? 'review' : 'add_to_cart',
    addToCartEnabled: settings.addToCartEnabled !== false && settings.canAdd,
  });
}

/** What "add all" makes of one product of a look, without a shopper to ask. */
export type AddAllLine = { kind: 'add'; code: string } | { kind: 'needs_size' } | { kind: 'failed' };

/**
 * The storefront's add-all rules: a line is added when its code is known with
 * no question to ask; a line that needs a size is reported, never guessed; a
 * sold-out or ambiguous one is a failure.
 */
export function decideAddAllLine(product: SelwiseProduct, selection: VariantSelection): AddAllLine {
  const decision = decideAdd(product, selection);
  if (decision.kind === 'code') return { kind: 'add', code: decision.code };
  if (decision.kind === 'choose') return { kind: 'needs_size' };
  return { kind: 'failed' };
}

export interface AddAllOutcome {
  requested: number;
  added: number;
  failed: number;
  needsSize: number;
}

/**
 * Adds a look's lines one after another — never in parallel: two concurrent
 * adds to one basket race on some platforms. An add that throws or answers
 * `{ success: false }` is a failure.
 */
export async function addAllSequentially<T>(
  items: readonly T[],
  lineOf: (item: T) => AddAllLine,
  add: (item: T, code: string) => Promise<boolean>
): Promise<AddAllOutcome> {
  const outcome: AddAllOutcome = { requested: items.length, added: 0, failed: 0, needsSize: 0 };
  for (const item of items) {
    const line = lineOf(item);
    if (line.kind === 'needs_size') {
      outcome.needsSize += 1;
      continue;
    }
    if (line.kind === 'failed') {
      outcome.failed += 1;
      continue;
    }
    let ok = false;
    try {
      ok = await add(item, line.code);
    } catch {
      ok = false;
    }
    if (ok) outcome.added += 1;
    else outcome.failed += 1;
  }
  return outcome;
}
