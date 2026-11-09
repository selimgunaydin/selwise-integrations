'use strict';

/**
 * The app's basket, as the cart the SDK's `setCart` takes.
 *
 * Pure: state in, `{ total, itemCount, currency? }` or `null` out, so it is
 * tested without React Native or a store.
 *
 * ## Which number is the total
 *
 * `basket.amounts.totalAmount`. App Maker's basket model fills it from the
 * Akinon basket's `total_amount` (the app project's
 * `src/integrationMaps/basket.json` maps `"TOTAL_AMOUNT": "total_amount"`, read
 * through `BasketMappers.amountMapper` in rn-framework-shop; checked in three
 * App Maker projects, October 2026) — the products after the basket's
 * discounts, before shipping: the number a free-shipping rule is written
 * against, and the field the browser widget reads from the same API
 * (`apps/client/src/core/cart-provider.ts`). An App Maker app's own
 * free-shipping view compares against exactly this value.
 * `totalProductAmount` is the pre-discount subtotal and would overstate
 * progress.
 *
 * ## When it is NOT a cart
 *
 * The basket reducer starts as `basket: {}` and goes back to `{}` on
 * `CLEAN_BASKET` (after an order). Neither has `amounts`, and neither is a
 * measurement: `null` tells the SDK the cart is unknown, and an unknown cart
 * is never printed. A fetched empty basket (`total_amount: "0.00"`,
 * `total_quantity: 0`) IS a measurement — an empty cart.
 *
 * ## The lines' codes
 *
 * `codes` lists each line's `pk` and `sku`, so a "complete to free shipping"
 * strip (`free_shipping_complement`) leaves the basket's own products out. A
 * line is rn-framework-shop's basket `Product` model: `BasketMappers.
 * productMapper` fills `pk` from `PRODUCT.PK` and `sku` from `PRODUCT.SKU`,
 * which every App Maker project checked maps to the Akinon basket item's
 * `product.pk` and `product.sku` (appmaker-project-a, appmaker-project-b,
 * under-armour-mobile, October 2026). `pk` is the code Akinon's basket accepts
 * (Selwise's `cart_code`), `sku` the merchant's item code — the same pair the
 * browser widget's Akinon reader sends; the server resolves either to the
 * catalogue row and excludes its whole group. Best effort: a line without
 * either is simply not excluded.
 */

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** `product.currency_type` on a line (`"try"`), when it is a three-letter code. */
function lineCurrency(products) {
  if (!Array.isArray(products)) return '';
  for (const product of products) {
    const code = product && typeof product.currency === 'string' ? product.currency.trim() : '';
    if (/^[A-Za-z]{3}$/.test(code)) return code.toUpperCase();
  }
  return '';
}

const MAX_CODES = 100;

/** Each line's `pk` and `sku`, as strings, de-duplicated and capped. */
function lineCodes(products) {
  if (!Array.isArray(products)) return [];
  const codes = new Set();
  for (const product of products) {
    if (!product || typeof product !== 'object') continue;
    for (const raw of [product.pk, product.sku]) {
      if (typeof raw !== 'string' && typeof raw !== 'number') continue;
      const code = String(raw).trim();
      if (code && code.length <= 128) codes.add(code);
    }
    if (codes.size >= MAX_CODES) break;
  }
  return Array.from(codes).slice(0, MAX_CODES);
}

function basketCart(state) {
  const basket = state && state.basket && state.basket.basket;
  if (!basket || typeof basket !== 'object') return null;

  const amounts = basket.amounts;
  if (!amounts || typeof amounts !== 'object') return null;

  const total = num(amounts.totalAmount);
  const itemCount = num(basket.totalQuantity);
  if (total === null || itemCount === null) return null;

  const currency = lineCurrency(basket.products);
  const codes = lineCodes(basket.products);
  const cart = currency ? { total, itemCount, currency } : { total, itemCount };
  return codes.length > 0 ? Object.assign(cart, { codes }) : cart;
}

/**
 * A cheap identity for "did the basket change", so `setCart` runs once per
 * change. The lines count: a line swapped for another at the same amount is a
 * different basket for a strip that leaves the basket's products out.
 */
function cartKey(cart) {
  if (!cart) return '';
  const codes = Array.isArray(cart.codes) ? cart.codes.slice().sort().join(',') : '';
  return cart.total + '|' + cart.itemCount + '|' + (cart.currency || '') + '|' + codes;
}

module.exports = { basketCart, cartKey, lineCodes };
