'use strict';

const { remainingParts, countdownTargetOf } = require('./countdown.js');
const { isModal } = require('./triggers.js');
const { resolveCustomCode } = require('./custom-widget-document.js');

/**
 * Whether a surface will actually draw something.
 *
 * ## Why this is not the renderer's business alone
 *
 * Four types can decide, at render time, that they have nothing to show: a
 * count badge below the merchant's `minCount`, a countdown whose deadline has
 * passed, and a custom widget with no markup to put in its WebView. The
 * renderer returning null is correct — but the overlay had already reported the
 * impression by then, so the merchant's report counted a `product_view_count`
 * badge that nobody could see. An impression has to mean "this was on screen".
 *
 * So the decision lives here, where both the impression and the render can ask
 * the same question, and where it can be tested without React Native.
 *
 * `options` carries what only the overlay knows: `goalBarView` (the SDK's
 * resolved view of a goal bar for the current cart), and `countdownTarget` /
 * `now` (the SDK's `countdownTarget`, so a daily-cutoff countdown is judged by
 * the same target it is drawn with).
 */
function shouldRender(surface, counts, options) {
  if (!surface) return false;
  const content = surface.content || {};
  const values = counts || {};
  const opts = options || {};

  if (surface.type === 'goal_bar') {
    // Armed is not shown: a bar for an unmeasured cart, an empty one the
    // merchant did not ask to show, or a sentence that cannot be said is on
    // the overlay's list and on nobody's screen — so no impression.
    return Boolean(opts.goalBarView && opts.goalBarView.visible);
  }

  if (surface.type === 'cart_count' || surface.type === 'product_view_count') {
    const value = Number(
      surface.type === 'cart_count' ? values.cart : values.productView
    );
    if (!Number.isFinite(value) || value <= 0) return false;

    const minCount = Number(content.minCount);
    if (Number.isFinite(minCount) && value < minCount) return false;
    return true;
  }

  if (surface.type === 'custom') {
    // The WebView needs markup. CSS and JS alone style and script nothing, so
    // the document builder returns null and the overlay must agree.
    return Boolean(resolveCustomCode(content, surface).html);
  }

  if (surface.type === 'countdown_timer') {
    // An expired countdown is not a surface; rendering a dash would tell the
    // visitor the offer is live when it is over.
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    return remainingParts(countdownTargetOf(content, now, opts.countdownTarget), now) !== null;
  }

  return true;
}

/**
 * The list after a reload caused by a CART change rather than a navigation.
 *
 * The SDK chooses a campaign's content state and fills `{cart.total}` at
 * `getSurfaces()` time, so the overlay asks again when the basket moves — that
 * is what lets "Sepetin {cart.total}" appear on the basket screen once the app
 * has fetched the basket. Two things must not follow from it:
 *
 * - A modal already in front of the shopper keeps the words it was shown with.
 *   A popup rewritten under the reader's eyes, or a half-typed newsletter form
 *   redrawn, is worse than a stale sentence — the browser widget draws the
 *   same line (only its live types re-choose on screen).
 * - A surface already shown does not vanish mid-screen. The reload runs the
 *   frequency cap again, and the allowance was spent when it appeared; a state
 *   that now hides it takes effect on the next screen, as a cap would.
 *
 * Everything else takes the new answer, and a surface the cart has just made
 * eligible appears.
 */
function keepShownSurfaces(previous, next, shownIds) {
  const shown = shownIds instanceof Set ? shownIds : new Set(shownIds || []);
  const before = Array.isArray(previous) ? previous : [];
  const after = Array.isArray(next) ? next : [];
  const afterIds = new Set(after.map((surface) => surface.id));

  const merged = after.map((surface) => {
    if (!isModal(surface.type) || !shown.has(surface.id)) return surface;
    return before.find((entry) => entry.id === surface.id) || surface;
  });
  for (const surface of before) {
    if (shown.has(surface.id) && !afterIds.has(surface.id)) merged.push(surface);
  }
  return merged;
}

module.exports = { shouldRender, keepShownSurfaces };
