'use strict';

/**
 * The product a ProductDetail screen is showing, as the product the SDK's
 * `getSurfaces(url, { product })` takes — so "Bu üründe
 * {product.discountAmount} tasarruf" and "Son {product.stock} ürün" in a
 * campaign read the product in front of the shopper.
 *
 * Pure: state in, `{ title, price, originalPrice, stock, currency }`,
 * `{ pending: true }` or `null` out, so it is tested without React Native or a
 * store. The same facts answer the product CONDITIONS of a content state or a
 * targeting rule (`productStock`, `productOnSale`, …) in the SDK.
 *
 * ## Which fields
 *
 * `state.productDetail.product` is rn-framework-shop's `ProductDetail` model,
 * filled through the app project's `integrationMaps/productDetail.json`
 * (checked in a live App Maker project, October 2026): `name`, `price` (what
 * the shopper pays), `retailPrice` (Akinon's `retail_price`, the price before
 * a discount), `stock` (`selected_variant.stock`), `currency`. The SDK decides
 * what can be said honestly — an original price that is not above the price
 * announces no discount, a zero stock says nothing.
 *
 * ## When it is NOT the product on screen
 *
 * The reducer keeps the last product after the screen is left, and starts a
 * new fetch by setting `pending` WITHOUT clearing it — so the previous product
 * is still there while the next one loads. A pending detail is
 * `{ pending: true }`, never the previous product's facts: the SDK then holds
 * back a surface whose words or state need the product (a state on
 * `productStock`, `{product.price}`) instead of returning its fallback and
 * replacing it a moment later — the web widget's rule. One never fetched and
 * not loading (`initialSuccessAt` 0 — a failed fetch) is `null`: an unknown
 * product says nothing and matches no product condition.
 */

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function productFacts(state) {
  const detail = state && state.productDetail;
  if (!detail || typeof detail !== 'object') return null;
  if (detail.pending === true) return { pending: true };
  if (detail.initialSuccessAt !== undefined && !detail.initialSuccessAt) return null;

  const product = detail.product;
  if (!product || typeof product !== 'object' || !str(product.sku)) return null;

  const facts = {};
  if (str(product.name)) facts.title = str(product.name);
  if (num(product.price) !== null) facts.price = num(product.price);
  if (num(product.retailPrice) !== null) facts.originalPrice = num(product.retailPrice);
  if (num(product.stock) !== null) facts.stock = num(product.stock);
  const currency = str(product.currency);
  if (/^[A-Za-z]{3}$/.test(currency)) facts.currency = currency.toUpperCase();
  return facts;
}

/**
 * A cheap identity for "did the product on screen change". The sku and the
 * fetch time are in it, so the same product fetched again — a shopper back on
 * a product they already saw — is still a change worth re-asking about.
 */
function productKey(state, facts) {
  if (!facts) return '';
  if (facts.pending === true) return 'pending';
  const detail = (state && state.productDetail) || {};
  const sku = str(detail.product && detail.product.sku);
  return [sku, detail.initialSuccessAt || '', facts.price, facts.originalPrice, facts.stock, facts.currency].join('|');
}

module.exports = { productFacts, productKey };
