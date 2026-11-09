import { normalizeDynamicProduct, type DynamicProduct } from '../vendor/dynamic-content.js';

/**
 * The product on screen, as the HOST knows it — for `{product.*}` in a
 * campaign's words ("Bu üründe {product.discountAmount} tasarruf", "Son
 * {product.stock} ürün").
 *
 * ## Why the host hands it over
 *
 * The browser widget reads the product page's code off the DOM and asks the
 * catalogue. An app screen has no DOM, but it has something better: the product
 * it is drawing, fetched from the store a moment ago. So `getSurfaces(url, {
 * product })` takes it on a product screen and fills the values from it; on any
 * other screen, or without one, a sentence that needs the product is not said.
 *
 * Every fact is optional on its own. `originalPrice` is the list price BEFORE a
 * discount (Akinon's `retail_price`): a product whose original price is not
 * above its price is not on sale, and no discount value is said for it.
 *
 * The same facts answer the product CONDITIONS (`productStock`,
 * `productOnSale`, `productDiscountRate`, `productPrice`) of a content state
 * or a targeting rule — from the host's product, which in an app is already
 * the live one (the web widget reads the catalogue, and the page's own price
 * over it).
 */
export interface ProductInput {
  title?: string | null;
  /** What the shopper pays now. */
  price?: number | string | null;
  /** The list price before a discount; omit it when the product is not on sale. */
  originalPrice?: number | string | null;
  /** Units in stock; omit it when the app does not know. Zero says nothing. */
  stock?: number | string | null;
  /** ISO 4217; the channel's currency stands in without one. */
  currency?: string | null;
  /**
   * The screen is still loading its product. A surface whose words or state
   * need the product WAITS (is not returned) rather than showing its fallback
   * and swapping it a moment later; every other surface is unaffected.
   */
  pending?: boolean;
}

/** A host's product, cleaned — or an unknown product when there is none. */
export function normalizeProductInput(input: ProductInput | null | undefined): DynamicProduct {
  return normalizeDynamicProduct(input ?? null);
}
