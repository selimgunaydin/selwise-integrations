'use strict';

/**
 * Which cards of a strip's newly visible batch earn a widget impression.
 *
 * Plain Node, like `goal-bar.js` and `countdown.js`, so it is tested without
 * React Native; `RecommendationStrip` feeds it `onViewableItemsChanged`.
 *
 * A strip that does not follow the basket keeps the rule it always had: each
 * card is counted once per mount, as it actually comes on screen.
 *
 * A strip that follows the basket (`followsCart`, "complete to free shipping")
 * is counted once per APPEARANCE — `strip.appearance`, the SDK loader's count
 * of the times the strip went from no products to some. As the basket moves
 * its cards are swapped in place; that is the same display re-answered, and
 * counting the new cards would write a second impression for a strip that
 * never left the screen. A strip that emptied (the basket passed the
 * threshold) and was brought back by the basket is a new display and is
 * counted again — the web's rule too.
 */

function createImpressionLedger() {
  return { codes: new Set(), appearance: null, counted: false };
}

/** @returns the products to report now — empty when nothing new is earned. */
function impressionBatch(ledger, items, strip) {
  const visible = (items || []).filter(Boolean);

  if (strip && strip.followsCart === true) {
    if (ledger.appearance !== strip.appearance) {
      ledger.appearance = strip.appearance;
      ledger.counted = false;
    }
    if (ledger.counted || visible.length === 0) return [];
    ledger.counted = true;
    return visible;
  }

  const fresh = visible.filter((product) => !ledger.codes.has(product.itemCode));
  for (const product of fresh) ledger.codes.add(product.itemCode);
  return fresh;
}

module.exports = { createImpressionLedger, impressionBatch };
