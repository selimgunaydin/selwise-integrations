// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/product-card-variant-logic.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * What a product's OPTIONS (sizes, shades) mean for a card — the decisions
 * without the chooser.
 *
 * `product-card-variants.ts` draws the storefront's chooser (markup, DOM
 * wiring). The app draws its own — a native bottom sheet — and must reach the
 * same answers: which options are real, whether there is anything to choose BY,
 * which one is preselected, and what "add to cart" adds on a card that offers
 * no chooser. A second copy of those rules is how an app card would add a
 * different size than the web card of the same product.
 *
 * PURE and import-free. The SDK vendors this file
 * (`scripts/sync-vendored-page-targeting.js`); `product-card-variants.ts`
 * re-exports it, so every storefront import keeps working.
 *
 * NOT re-exported from the barrel: import the subpath,
 *   import { usableVariants } from '@selwise/widget-contract/product-card-variant-logic'
 */

export interface CardVariant {
  variantCode: string;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  stock?: number | null;
  inStock?: boolean;
  imageUrl?: string | null;
}

const nonEmpty = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

/**
 * What a shopper reads on an option: its size, else its colour, else its sku,
 * else its code. (The code last: it is a machine's name, the chooser is for a
 * person — see `hasSelectableAxis`.)
 */
export function variantLabel(variant: CardVariant): string {
  return String(variant.size || variant.color || variant.sku || variant.variantCode);
}

/**
 * Is there anything for the shopper to choose BY?
 *
 * Size and colour are the only axes a shopper can read off a chip. A cosmetics
 * catalogue can have NEITHER: a shade is not a size and Google Merchant has no
 * field for it, so a feed of thousands of options may carry no size and no
 * colour on any of them. The label chain then fell through to `sku` and the
 * card rendered a grid of machine codes presented to a shopper as a choice,
 * dozens of them on the widest group.
 *
 * With no axis there is nothing to choose, so the card names the option it
 * WILL add (its own thumbnail, plus how many others exist), the way a store's
 * own listing card does, and adds it on click.
 */
export function hasSelectableAxis(variants: CardVariant[] | undefined): boolean {
  if (!Array.isArray(variants)) return false;
  return variants.some((variant) => nonEmpty(variant?.size) || nonEmpty(variant?.color));
}

/** Options worth rendering: one with no code cannot be added to a basket. */
export function usableVariants(variants: CardVariant[] | undefined): CardVariant[] {
  if (!Array.isArray(variants)) return [];
  return variants.filter(
    (variant) => typeof variant?.variantCode === 'string' && variant.variantCode.length > 0
  );
}

/**
 * The option to preselect, or null when the shopper must choose.
 *
 * Preselecting is only safe when there is genuinely no choice — exactly one
 * buyable option. Guessing one of several sizes would let a shopper add the
 * wrong size without noticing, which is worse than one extra click.
 */
export function resolveInitialVariant(variants: CardVariant[]): CardVariant | null {
  const buyable = variants.filter((variant) => variant.inStock !== false);
  if (buyable.length === 0) return null;
  if (buyable.length === 1) return buyable[0] as CardVariant;

  // No axis, so no wrong answer: the shopper was never shown a distinction to
  // get wrong. The cheapest buyable option is the one the parent price already
  // advertises (`rollUpVariants` prices the product from it), so preselecting
  // anything else would contradict the price on the card.
  if (!hasSelectableAxis(variants)) {
    return buyable.reduce((cheapest, variant) => {
      const a = typeof variant.price === 'number' ? variant.price : Number.POSITIVE_INFINITY;
      const b = typeof cheapest.price === 'number' ? cheapest.price : Number.POSITIVE_INFINITY;
      return a < b ? variant : cheapest;
    }, buyable[0] as CardVariant);
  }

  return null;
}

/**
 * What "add to cart" adds on a card that offers NO chooser: the product it
 * shows — its own cart code. A row-level feed (IdeaSoft, an `item_group_id`
 * Akinon feed) makes every size its own product, so that code IS one size,
 * the one the card names. `null` when the product has several options and no
 * code of its own (an Akinon group with nested sizes): the caller opens the
 * product page rather than guess a size.
 */
export function resolveCardAddCode(
  product: { cartCode?: string | null; variantId?: string | null; itemCode?: string | null; id?: string | null },
  variants: CardVariant[] | undefined,
): string | null {
  const own = product.cartCode || product.variantId || null;
  if (own) return own;
  const usable = usableVariants(variants);
  if (usable.length === 1) return (usable[0] as CardVariant).variantCode;
  // No cart code stored means the item code IS the basket's code (the mapper
  // keeps `cart_code` null when the two are equal — every IdeaSoft row). A row
  // that is itself one of its group's sizes ("TİŞÖRT S") is therefore addable
  // as itself; it opened its product page instead (Balkanlar Av, 2026-10-21).
  // Only a row that is NOT among the options — the group's parent — is a guess.
  const self = [product.itemCode, product.id].find(
    (code) => typeof code === 'string' && usable.some((variant) => variant.variantCode === code),
  );
  return self ?? null;
}

/**
 * Is there nothing here a shopper could buy? The ONE rule every add-to-cart
 * control reads before it invites a press.
 *
 * True when the product itself says `inStock === false` AND no usable option
 * is still buyable. A group whose own row says sold out but which carries an
 * in-stock size is NOT sold out: the chooser (or the product's own page) is
 * what decides which size, and refusing the whole card would hide a size the
 * shopper can have. Stock that is not known (`inStock` absent or null) is never
 * sold out: an unmeasured product is offered, never refused on a guess.
 *
 * Recorded 2026-11-18: an app search row drew "add to cart" on a hit the search
 * API had already returned with `inStock: false`; the platform's basket
 * refused it and nothing on screen said why. A button for a product the
 * catalogue calls sold out only promises a basket that will refuse it.
 */
export function isSoldOut(
  product: { inStock?: boolean | null },
  variants?: CardVariant[] | null,
): boolean {
  if (!product || product.inStock !== false) return false;
  return !usableVariants(variants ?? undefined).some((variant) => variant.inStock !== false);
}

/** What a window or sheet prints as a product's price. */
export interface VariantModalPrice {
  price?: number | null;
  originalPrice?: number | null;
  currency?: string | null;
}

/** The price a chosen option advertises: its own when the feed carries one, the product's otherwise. */
export function variantModalPriceFor(
  product: VariantModalPrice,
  variant: CardVariant | null | undefined,
): VariantModalPrice {
  if (variant && typeof variant.price === 'number' && Number.isFinite(variant.price)) {
    return { price: variant.price, originalPrice: variant.originalPrice ?? null, currency: product.currency };
  }
  return product;
}
