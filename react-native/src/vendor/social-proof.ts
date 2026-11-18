// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/social-proof.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * When a social-proof counter (`product_view_count`, `cart_count`) is drawn.
 *
 * "Son 7 günde 0 kişi bu ürüne baktı" argues AGAINST the product, so the count
 * decides whether the surface exists at all: it is placed only when it reaches
 * the threshold, and a count that could not be read is not a count. The widget
 * applies this rule on the storefront and the dashboard's counter probe applies
 * it to tell a merchant WHY a counter is not on the page — one function, so the
 * explanation can never disagree with what the page does.
 */

/** A counter below this is not drawn: never "0 kişi". */
export const DEFAULT_SOCIAL_PROOF_MIN_COUNT = 1;

/** `minCount` from a counter's content: a non-negative integer, 1 when absent or invalid. */
export function socialProofMinCount(content: { minCount?: unknown }): number {
  const raw = content.minCount;
  const value = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_SOCIAL_PROOF_MIN_COUNT;
}

/** Whether a counter is drawn for `count` (`null` = the count could not be read). */
export function socialProofShown(count: number | null, minCount: number): count is number {
  return count !== null && count >= minCount;
}
